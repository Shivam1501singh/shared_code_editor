import { Socket } from 'socket.io-client';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.services.mozilla.com' },
  ],
  iceCandidatePoolSize: 10,
};

export class WebRTCVoiceManager {
  private socket: Socket;
  private roomKey: string;
  private localStream: MediaStream | null = null;
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private audioElements: Map<string, HTMLAudioElement> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private iceCandidatesQueue: Map<string, RTCIceCandidateInit[]> = new Map();
  private keepAliveInterval: any = null;
  private reconnectTimers: Map<string, any> = new Map();

  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private animationFrameId: number | null = null;
  private onSpeakingChange?: (isSpeaking: boolean) => void;
  private onRemoteSpeakingChange?: (socketId: string, isSpeaking: boolean) => void;

  constructor(
    socket: Socket,
    roomKey: string,
    callbacks?: {
      onSpeakingChange?: (isSpeaking: boolean) => void;
      onRemoteSpeakingChange?: (socketId: string, isSpeaking: boolean) => void;
    }
  ) {
    this.socket = socket;
    this.roomKey = roomKey;
    this.onSpeakingChange = callbacks?.onSpeakingChange;
    this.onRemoteSpeakingChange = callbacks?.onRemoteSpeakingChange;

    this.setupSocketListeners();
    this.startKeepAlive();
  }

  private setupSocketListeners() {
    // Peer announced readiness for voice
    this.socket.on('voice:peer-joined', async ({ socketId }: { socketId: string }) => {
      console.log(`[WebRTC] Peer joined voice channel: ${socketId}`);
      if (this.localStream) {
        await this.createPeerConnection(socketId, true);
      }
    });

    // Received SDP Offer from peer
    this.socket.on('voice:offer', async ({ senderSocketId, sdp }: { senderSocketId: string; sdp: RTCSessionDescriptionInit }) => {
      console.log(`[WebRTC] Received offer from ${senderSocketId}`);
      let pc = this.peerConnections.get(senderSocketId);
      if (!pc || pc.signalingState === 'closed') {
        pc = await this.createPeerConnection(senderSocketId, false);
      }
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          await this.processQueuedCandidates(senderSocketId, pc);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          this.socket.emit('voice:answer', {
            roomKey: this.roomKey,
            targetSocketId: senderSocketId,
            sdp: answer,
          });
        } catch (err) {
          console.error('[WebRTC] Error handling SDP offer:', err);
        }
      }
    });

    // Received SDP Answer from peer
    this.socket.on('voice:answer', async ({ senderSocketId, sdp }: { senderSocketId: string; sdp: RTCSessionDescriptionInit }) => {
      console.log(`[WebRTC] Received answer from ${senderSocketId}`);
      const pc = this.peerConnections.get(senderSocketId);
      if (pc && pc.signalingState !== 'closed') {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          await this.processQueuedCandidates(senderSocketId, pc);
        } catch (err) {
          console.error('[WebRTC] Error handling SDP answer:', err);
        }
      }
    });

    // Received ICE Candidate from peer
    this.socket.on('voice:ice-candidate', async ({ senderSocketId, candidate }: { senderSocketId: string; candidate: RTCIceCandidateInit }) => {
      await this.addIceCandidate(senderSocketId, candidate);
    });

    // Peer disconnected
    this.socket.on('user:left', ({ socketId }: { socketId: string }) => {
      this.closePeerConnection(socketId);
    });
  }

  private async addIceCandidate(senderSocketId: string, candidate: RTCIceCandidateInit) {
    if (!candidate) return;
    const pc = this.peerConnections.get(senderSocketId);

    // If remote description is already set, add immediately
    if (pc && pc.remoteDescription && pc.remoteDescription.type) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('[WebRTC] Error adding ICE candidate:', err);
      }
    } else {
      // Queue candidate until remote description is ready (prevents dropped connections)
      const queue = this.iceCandidatesQueue.get(senderSocketId) || [];
      queue.push(candidate);
      this.iceCandidatesQueue.set(senderSocketId, queue);
    }
  }

  private async processQueuedCandidates(senderSocketId: string, pc: RTCPeerConnection) {
    const queue = this.iceCandidatesQueue.get(senderSocketId);
    if (queue && queue.length > 0) {
      for (const candidate of queue) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('[WebRTC] Error processing queued candidate:', err);
        }
      }
      this.iceCandidatesQueue.delete(senderSocketId);
    }
  }

  private setupDataChannel(peerSocketId: string, channel: RTCDataChannel) {
    this.dataChannels.set(peerSocketId, channel);

    channel.onopen = () => {
      console.log(`[WebRTC] NAT Keepalive channel opened with ${peerSocketId}`);
    };

    channel.onmessage = (event) => {
      // Periodic ping-pong packet to prevent router NAT timeout
      if (event.data === 'ping') {
        try {
          channel.send('pong');
        } catch (e) {}
      }
    };

    channel.onclose = () => {
      this.dataChannels.delete(peerSocketId);
    };
  }

  private startKeepAlive() {
    // Send a keepalive packet every 5 seconds over active data channels to prevent NAT UDP timeouts
    if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
    this.keepAliveInterval = setInterval(() => {
      this.dataChannels.forEach((dc) => {
        if (dc.readyState === 'open') {
          try {
            dc.send('ping');
          } catch (e) {}
        }
      });
    }, 5000);
  }

  private async createPeerConnection(peerSocketId: string, isInitiator: boolean): Promise<RTCPeerConnection> {
    // Clean up any existing connection for this peer
    if (this.peerConnections.has(peerSocketId)) {
      const oldPc = this.peerConnections.get(peerSocketId);
      oldPc?.close();
      this.peerConnections.delete(peerSocketId);
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    this.peerConnections.set(peerSocketId, pc);

    // Add local microphone audio tracks
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    // Set up bidirectional keepalive data channel (negotiated ID 0 prevents negotiation mismatch)
    const dc = pc.createDataChannel('keepalive', { negotiated: true, id: 0 });
    this.setupDataChannel(peerSocketId, dc);

    // Handle remote audio stream
    pc.ontrack = (event) => {
      console.log(`[WebRTC] Remote audio track received from ${peerSocketId}`);
      const [remoteStream] = event.streams;

      let audio = this.audioElements.get(peerSocketId);
      if (!audio) {
        audio = document.createElement('audio');
        audio.id = `webrtc-remote-audio-${peerSocketId}`;
        audio.autoplay = true;
        audio.style.display = 'none';
        document.body.appendChild(audio);
        this.audioElements.set(peerSocketId, audio);

        // Keep audio alive even during prolonged silence
        audio.onpause = () => {
          if (this.peerConnections.has(peerSocketId)) {
            audio?.play().catch(() => {});
          }
        };
      }

      audio.srcObject = remoteStream;

      // Handle unmuting of remote track
      remoteStream.getAudioTracks().forEach((track) => {
        track.onunmute = () => {
          console.log(`[WebRTC] Track unmuted from ${peerSocketId}, playing audio`);
          audio?.play().catch(() => {});
        };
        track.onmute = () => {
          console.log(`[WebRTC] Track muted from ${peerSocketId}`);
        };
      });

      // Explicit play trigger with user gesture unlock
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('[WebRTC] Autoplay deferred until user interaction', err);
          const unlock = () => {
            audio?.play().catch(() => {});
            window.removeEventListener('click', unlock);
            window.removeEventListener('keydown', unlock);
          };
          window.addEventListener('click', unlock, { once: true });
          window.addEventListener('keydown', unlock, { once: true });
        });
      }
    };

    // Send local ICE candidates to peer
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('voice:ice-candidate', {
          targetSocketId: peerSocketId,
          candidate: event.candidate,
        });
      }
    };

    // Self-healing automatic ICE reconnection
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      console.log(`[WebRTC] ICE state for ${peerSocketId}: ${state}`);

      if (state === 'disconnected' || state === 'failed') {
        console.warn(`[WebRTC] Connection degraded (${state}) with ${peerSocketId}. Initiating self-healing reconnection...`);
        if (!this.reconnectTimers.has(peerSocketId)) {
          const timer = setTimeout(async () => {
            this.reconnectTimers.delete(peerSocketId);
            if (this.localStream && (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed')) {
              try {
                const offer = await pc.createOffer({ iceRestart: true });
                await pc.setLocalDescription(offer);
                this.socket.emit('voice:offer', {
                  roomKey: this.roomKey,
                  targetSocketId: peerSocketId,
                  sdp: offer,
                });
              } catch (err) {
                console.error('[WebRTC] ICE restart offer failed:', err);
              }
            }
          }, 1500);
          this.reconnectTimers.set(peerSocketId, timer);
        }
      } else if (state === 'connected' || state === 'completed') {
        if (this.reconnectTimers.has(peerSocketId)) {
          clearTimeout(this.reconnectTimers.get(peerSocketId));
          this.reconnectTimers.delete(peerSocketId);
        }
      }
    };

    if (isInitiator) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this.socket.emit('voice:offer', {
          roomKey: this.roomKey,
          targetSocketId: peerSocketId,
          sdp: offer,
        });
      } catch (err) {
        console.error('[WebRTC] Error creating offer:', err);
      }
    }

    return pc;
  }

  public async startAudio(): Promise<boolean> {
    try {
      if (this.localStream) {
        // If stream already exists, make sure tracks are active
        this.localStream.getAudioTracks().forEach((t) => (t.enabled = true));
        return true;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      this.localStream = stream;
      this.setupVolumeMeter(stream);

      // Add tracks to any existing peer connections
      this.peerConnections.forEach((pc) => {
        stream.getAudioTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });
      });

      // Signal to room that local user joined voice channel
      this.socket.emit('voice:join', { roomKey: this.roomKey });
      return true;
    } catch (err) {
      console.error('[WebRTC] Microphone access denied or unavailable', err);
      return false;
    }
  }

  private setupVolumeMeter(stream: MediaStream) {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      this.audioContext = new AudioCtx();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;

      source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      let wasSpeaking = false;

      const checkVolume = () => {
        if (!this.analyser) return;

        // Skip meter calculation if tracks are muted
        const isTrackEnabled = this.localStream?.getAudioTracks()[0]?.enabled ?? false;
        if (!isTrackEnabled) {
          if (wasSpeaking) {
            wasSpeaking = false;
            this.onSpeakingChange?.(false);
            this.socket.emit('voice:speaking', { roomKey: this.roomKey, isSpeaking: false });
          }
          this.animationFrameId = requestAnimationFrame(checkVolume);
          return;
        }

        this.analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        const isSpeaking = average > 25; // Sensitivity threshold

        if (isSpeaking !== wasSpeaking) {
          wasSpeaking = isSpeaking;
          if (this.onSpeakingChange) {
            this.onSpeakingChange(isSpeaking);
          }
          this.socket.emit('voice:speaking', {
            roomKey: this.roomKey,
            isSpeaking,
          });
        }

        this.animationFrameId = requestAnimationFrame(checkVolume);
      };

      checkVolume();
    } catch (err) {
      console.error('[WebRTC] Error setting up audio volume meter', err);
    }
  }

  public toggleMute(): boolean {
    if (!this.localStream) return true;
    const tracks = this.localStream.getAudioTracks();
    if (!tracks || tracks.length === 0) return true;

    // Check if track ended
    if (tracks[0].readyState === 'ended') {
      console.warn('[WebRTC] Microphone track ended, re-acquiring stream');
      this.startAudio();
      return false;
    }

    const newEnabled = !tracks[0].enabled;
    tracks.forEach((track) => {
      track.enabled = newEnabled;
    });

    const isMuted = !newEnabled;

    // Resume AudioContext when unmuting
    if (!isMuted && this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }

    if (isMuted && this.onSpeakingChange) {
      this.onSpeakingChange(false);
    }

    this.socket.emit('voice:speaking', {
      roomKey: this.roomKey,
      isSpeaking: false,
    });

    this.socket.emit('voice:mute-status', {
      roomKey: this.roomKey,
      isMuted,
    });

    return isMuted;
  }

  private closePeerConnection(socketId: string) {
    if (this.reconnectTimers.has(socketId)) {
      clearTimeout(this.reconnectTimers.get(socketId));
      this.reconnectTimers.delete(socketId);
    }

    const dc = this.dataChannels.get(socketId);
    if (dc) {
      try {
        dc.close();
      } catch (e) {}
      this.dataChannels.delete(socketId);
    }

    const pc = this.peerConnections.get(socketId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(socketId);
    }

    const audio = this.audioElements.get(socketId);
    if (audio) {
      audio.srcObject = null;
      audio.remove();
      this.audioElements.delete(socketId);
    }

    this.iceCandidatesQueue.delete(socketId);
  }

  public destroy() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
    this.reconnectTimers.forEach((timer) => clearTimeout(timer));
    this.reconnectTimers.clear();

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
    this.dataChannels.forEach((dc) => {
      try {
        dc.close();
      } catch (e) {}
    });
    this.dataChannels.clear();
    this.peerConnections.forEach((pc) => pc.close());
    this.peerConnections.clear();
    this.audioElements.forEach((audio) => {
      audio.srcObject = null;
      audio.remove();
    });
    this.audioElements.clear();
    this.iceCandidatesQueue.clear();
  }
}

import { Socket } from 'socket.io-client';

// Public STUN and OpenRelay TURN servers for 100% NAT/firewall traversal across any network
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.services.mozilla.com' },
    // Free global TURN servers (UDP and TCP fallback)
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelay',
      credential: 'openrelay',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelay',
      credential: 'openrelay',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelay',
      credential: 'openrelay',
    },
  ],
  iceCandidatePoolSize: 10,
};

export class WebRTCVoiceManager {
  private socket: Socket;
  private roomKey: string;
  private localStream: MediaStream | null = null;
  private isMuted: boolean = false;

  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private audioElements: Map<string, HTMLAudioElement> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private iceCandidatesQueue: Map<string, RTCIceCandidateInit[]> = new Map();
  private makingOfferMap: Map<string, boolean> = new Map();
  private keepAliveInterval: any = null;

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
    // A peer joined or requested voice connection
    this.socket.on('voice:peer-joined', async ({ socketId }: { socketId: string }) => {
      console.log(`[WebRTC] Peer requested voice connection: ${socketId}`);
      if (this.localStream) {
        await this.getOrCreatePeerConnection(socketId, true);
      }
    });

    // Received SDP Offer from peer (Handles Perfect Negotiation)
    this.socket.on('voice:offer', async ({ senderSocketId, sdp }: { senderSocketId: string; sdp: RTCSessionDescriptionInit }) => {
      console.log(`[WebRTC] Received offer from ${senderSocketId}`);
      const pc = await this.getOrCreatePeerConnection(senderSocketId, false);
      if (!pc) return;

      try {
        const isPolite = (this.socket.id || '') < senderSocketId;
        const makingOffer = this.makingOfferMap.get(senderSocketId) || false;
        const offerCollision = makingOffer || pc.signalingState !== 'stable';

        if (offerCollision) {
          if (!isPolite) {
            console.log(`[WebRTC] Impolite peer ignoring offer collision from ${senderSocketId}`);
            return;
          }
          console.log(`[WebRTC] Polite peer rolling back for offer from ${senderSocketId}`);
          await Promise.all([
            pc.setLocalDescription({ type: 'rollback' }),
            pc.setRemoteDescription(new RTCSessionDescription(sdp)),
          ]);
        } else {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        }

        await this.processQueuedCandidates(senderSocketId, pc);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        this.socket.emit('voice:answer', {
          roomKey: this.roomKey,
          targetSocketId: senderSocketId,
          sdp: answer,
        });
      } catch (err) {
        console.error('[WebRTC] Error handling offer:', err);
      }
    });

    // Received SDP Answer from peer
    this.socket.on('voice:answer', async ({ senderSocketId, sdp }: { senderSocketId: string; sdp: RTCSessionDescriptionInit }) => {
      console.log(`[WebRTC] Received answer from ${senderSocketId}`);
      const pc = this.peerConnections.get(senderSocketId);
      if (!pc || pc.signalingState === 'closed') return;

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        await this.processQueuedCandidates(senderSocketId, pc);
      } catch (err) {
        console.error('[WebRTC] Error handling answer:', err);
      }
    });

    // Received ICE Candidate from peer
    this.socket.on('voice:ice-candidate', async ({ senderSocketId, candidate }: { senderSocketId: string; candidate: RTCIceCandidateInit }) => {
      await this.addIceCandidate(senderSocketId, candidate);
    });

    // Peer disconnected or left voice
    this.socket.on('voice:peer-left', ({ socketId }: { socketId: string }) => {
      this.closePeerConnection(socketId);
    });

    this.socket.on('user:left', ({ socketId }: { socketId: string }) => {
      this.closePeerConnection(socketId);
    });
  }

  private async addIceCandidate(senderSocketId: string, candidate: RTCIceCandidateInit) {
    if (!candidate) return;
    const pc = this.peerConnections.get(senderSocketId);

    if (pc && pc.remoteDescription && pc.remoteDescription.type) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('[WebRTC] Error adding ICE candidate:', err);
      }
    } else {
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

  private startKeepAlive() {
    if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
    // Ping every 4 seconds to guarantee zero UDP NAT timeouts during silence
    this.keepAliveInterval = setInterval(() => {
      this.dataChannels.forEach((dc) => {
        if (dc.readyState === 'open') {
          try {
            dc.send('ping');
          } catch (e) {}
        }
      });
    }, 4000);
  }

  private async getOrCreatePeerConnection(peerSocketId: string, shouldInitiate: boolean): Promise<RTCPeerConnection> {
    let pc = this.peerConnections.get(peerSocketId);

    if (pc && pc.signalingState !== 'closed') {
      if (shouldInitiate && pc.signalingState === 'stable') {
        this.negotiate(peerSocketId, pc);
      }
      return pc;
    }

    pc = new RTCPeerConnection(ICE_SERVERS);
    this.peerConnections.set(peerSocketId, pc);
    this.makingOfferMap.set(peerSocketId, false);

    // Add local microphone audio tracks
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        pc!.addTrack(track, this.localStream!);
      });
    }

    // Bidirectional NAT keepalive data channel (negotiated channel id 0 prevents renegotiation stalls)
    const dc = pc.createDataChannel('keepalive', { negotiated: true, id: 0 });
    this.dataChannels.set(peerSocketId, dc);

    dc.onmessage = (event) => {
      if (event.data === 'ping') {
        try {
          dc.send('pong');
        } catch (e) {}
      }
    };

    dc.onclose = () => {
      this.dataChannels.delete(peerSocketId);
    };

    // Attach remote audio track
    pc.ontrack = (event) => {
      console.log(`[WebRTC] Remote track received from ${peerSocketId}`);
      const [remoteStream] = event.streams;

      let audio = this.audioElements.get(peerSocketId);
      if (!audio) {
        audio = document.createElement('audio');
        audio.id = `webrtc-audio-${peerSocketId}`;
        audio.autoplay = true;
        // Plays inline on mobile/desktop without being paused by background tab heuristics
        (audio as any).playsInline = true;
        // Place in DOM offscreen (NEVER display: none, which causes Chrome to pause audio)
        audio.style.position = 'fixed';
        audio.style.bottom = '-9999px';
        audio.style.left = '-9999px';
        audio.style.width = '1px';
        audio.style.height = '1px';
        audio.style.opacity = '0.001';
        audio.style.pointerEvents = 'none';
        document.body.appendChild(audio);
        this.audioElements.set(peerSocketId, audio);
      }

      audio.srcObject = remoteStream;

      const playAudio = () => {
        if (audio && audio.paused) {
          audio.play().catch((err) => {
            console.warn('[WebRTC] Autoplay prevented, unlocking on interaction', err);
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

      // Ensure audio stays playing through silence and track unmutes
      audio.onpause = playAudio;
      audio.onstalled = playAudio;
      audio.onwaiting = playAudio;

      remoteStream.getAudioTracks().forEach((track) => {
        track.onunmute = playAudio;
      });

      playAudio();
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

    // Handle ICE connection state changes
    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE Connection State for ${peerSocketId}: ${pc!.iceConnectionState}`);
      if (pc!.iceConnectionState === 'failed') {
        pc!.restartIce();
      }
    };

    if (shouldInitiate) {
      await this.negotiate(peerSocketId, pc);
    }

    return pc;
  }

  private async negotiate(peerSocketId: string, pc: RTCPeerConnection) {
    try {
      this.makingOfferMap.set(peerSocketId, true);
      const offer = await pc.createOffer();
      if (pc.signalingState !== 'stable') return;
      await pc.setLocalDescription(offer);

      this.socket.emit('voice:offer', {
        roomKey: this.roomKey,
        targetSocketId: peerSocketId,
        sdp: offer,
      });
    } catch (err) {
      console.error('[WebRTC] Error during negotiation offer:', err);
    } finally {
      this.makingOfferMap.set(peerSocketId, false);
    }
  }

  public async startAudio(): Promise<boolean> {
    try {
      if (this.localStream) {
        this.localStream.getAudioTracks().forEach((t) => (t.enabled = true));
        this.isMuted = false;
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
      this.isMuted = false;
      this.setupVolumeMeter(stream);

      // Add audio tracks to all existing peer connections
      this.peerConnections.forEach((pc, peerId) => {
        stream.getAudioTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });
        this.negotiate(peerId, pc);
      });

      // Announce readiness to all peers in the room
      this.socket.emit('voice:join', { roomKey: this.roomKey });
      return true;
    } catch (err) {
      console.error('[WebRTC] Microphone access denied or unavailable', err);
      return false;
    }
  }

  public stopAudio() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    this.isMuted = false;

    // Notify peers that local user left voice channel
    this.socket.emit('voice:leave', { roomKey: this.roomKey });

    this.peerConnections.forEach((pc) => pc.close());
    this.peerConnections.clear();

    this.dataChannels.forEach((dc) => {
      try {
        dc.close();
      } catch (e) {}
    });
    this.dataChannels.clear();

    this.audioElements.forEach((audio) => {
      audio.srcObject = null;
      audio.remove();
    });
    this.audioElements.clear();
    this.iceCandidatesQueue.clear();
    this.makingOfferMap.clear();

    if (this.onSpeakingChange) {
      this.onSpeakingChange(false);
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
        if (!this.analyser || !this.localStream) return;

        // When muted, immediately broadcast false and skip audio processing
        if (this.isMuted) {
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
        const isSpeaking = average > 22; // Threshold for natural voice

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

    // Toggle mute flag
    this.isMuted = !this.isMuted;

    // Toggle track enablement
    tracks.forEach((track) => {
      track.enabled = !this.isMuted;
    });

    if (this.audioContext && this.audioContext.state === 'suspended' && !this.isMuted) {
      this.audioContext.resume().catch(() => {});
    }

    if (this.isMuted && this.onSpeakingChange) {
      this.onSpeakingChange(false);
    }

    // Broadcast mute state immediately to all room collaborators
    this.socket.emit('voice:speaking', {
      roomKey: this.roomKey,
      isSpeaking: false,
    });

    this.socket.emit('voice:mute-status', {
      roomKey: this.roomKey,
      isMuted: this.isMuted,
    });

    return this.isMuted;
  }

  private closePeerConnection(socketId: string) {
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
    this.makingOfferMap.delete(socketId);
  }

  public destroy() {
    this.stopAudio();
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }
}

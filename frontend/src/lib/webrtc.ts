import { Socket } from 'socket.io-client';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export class WebRTCVoiceManager {
  private socket: Socket;
  private roomKey: string;
  private localStream: MediaStream | null = null;
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private audioElements: Map<string, HTMLAudioElement> = new Map();
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
  }

  private setupSocketListeners() {
    // When a peer indicates they are ready for voice
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
      if (!pc) {
        pc = await this.createPeerConnection(senderSocketId, false);
      }
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        this.socket.emit('voice:answer', {
          roomKey: this.roomKey,
          targetSocketId: senderSocketId,
          sdp: answer,
        });
      }
    });

    // Received SDP Answer from peer
    this.socket.on('voice:answer', async ({ senderSocketId, sdp }: { senderSocketId: string; sdp: RTCSessionDescriptionInit }) => {
      console.log(`[WebRTC] Received answer from ${senderSocketId}`);
      const pc = this.peerConnections.get(senderSocketId);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      }
    });

    // Received ICE Candidate
    this.socket.on('voice:ice-candidate', async ({ senderSocketId, candidate }: { senderSocketId: string; candidate: RTCIceCandidateInit }) => {
      const pc = this.peerConnections.get(senderSocketId);
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('[WebRTC] Error adding ICE candidate', err);
        }
      }
    });

    // Peer disconnected from room
    this.socket.on('user:left', ({ socketId }: { socketId: string }) => {
      this.closePeerConnection(socketId);
    });
  }

  private async createPeerConnection(peerSocketId: string, isInitiator: boolean): Promise<RTCPeerConnection> {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    this.peerConnections.set(peerSocketId, pc);

    // Add local microphone audio tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    // Handle remote audio stream
    pc.ontrack = (event) => {
      console.log(`[WebRTC] Remote track received from ${peerSocketId}`);
      const [remoteStream] = event.streams;
      let audio = this.audioElements.get(peerSocketId);
      if (!audio) {
        audio = new Audio();
        audio.autoplay = true;
        this.audioElements.set(peerSocketId, audio);
      }
      audio.srcObject = remoteStream;
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

    if (isInitiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.socket.emit('voice:offer', {
        roomKey: this.roomKey,
        targetSocketId: peerSocketId,
        sdp: offer,
      });
    }

    return pc;
  }

  public async startAudio(): Promise<boolean> {
    try {
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

      // Signal to room that local user is ready for voice
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
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      const isMuted = !audioTrack.enabled;

      if (isMuted && this.onSpeakingChange) {
        this.onSpeakingChange(false);
        this.socket.emit('voice:speaking', {
          roomKey: this.roomKey,
          isSpeaking: false,
        });
      }
      return isMuted;
    }
    return true;
  }

  private closePeerConnection(socketId: string) {
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
  }

  public destroy() {
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
    this.peerConnections.forEach((pc) => pc.close());
    this.peerConnections.clear();
    this.audioElements.forEach((audio) => {
      audio.srcObject = null;
      audio.remove();
    });
    this.audioElements.clear();
  }
}

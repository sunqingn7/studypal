import { AudioData, TTSConfig, VoiceInfo } from '../../domain/models/plugin';
import { TTSBackendPlugin } from '../../domain/models/plugin';

export class AudioPlayer {
  private audio: HTMLAudioElement | null = null;
  private playbackRate = 1.0;
  private volume = 1.0;
  private isPlaying = false;
  private isPaused = false;
  private currentTime = 0;
  private duration = 0;

  play(audioData: AudioData): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (this.audio) {
          this.audio.pause();
          this.audio.remove();
          this.audio = null;
        }

        const audioBlob = this.base64ToBlob(audioData.data, `audio/${audioData.format}`);
        const audioUrl = URL.createObjectURL(audioBlob);

        this.audio = new Audio(audioUrl);
        this.audio.playbackRate = this.playbackRate;
        this.audio.volume = this.volume;

        this.audio.addEventListener('play', () => {
          this.isPlaying = true;
          this.isPaused = false;
        });

        this.audio.addEventListener('pause', () => {
          this.isPlaying = false;
          this.isPaused = true;
        });

        this.audio.addEventListener('ended', () => {
          this.isPlaying = false;
          this.isPaused = false;
          this.currentTime = 0;
          URL.revokeObjectURL(audioUrl);
          resolve();
        });

        this.audio.addEventListener('timeupdate', () => {
          this.currentTime = this.audio?.currentTime || 0;
        });

        this.audio.addEventListener('loadedmetadata', () => {
          this.duration = this.audio?.duration || 0;
        });

        this.audio.addEventListener('error', () => {
          this.isPlaying = false;
          reject(new Error('Audio playback error'));
        });

        this.audio.play().catch(reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  pause(): void {
    if (this.audio && this.isPlaying) {
      this.audio.pause();
    }
  }

  resume(): void {
    if (this.audio && this.isPaused) {
      this.audio.play();
    }
  }

  stop(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio.remove();
      this.audio = null;
      this.isPlaying = false;
      this.isPaused = false;
      this.currentTime = 0;
    }
  }

  seek(time: number): void {
    if (this.audio) {
      this.audio.currentTime = time;
    }
  }

  setPlaybackRate(rate: number): void {
    this.playbackRate = rate;
    if (this.audio) {
      this.audio.playbackRate = rate;
    }
  }

  setVolume(vol: number): void {
    this.volume = vol;
    if (this.audio) {
      this.audio.volume = vol;
    }
  }

  getCurrentTime(): number {
    return this.currentTime;
  }

  getDuration(): number {
    return this.duration;
  }

  isPlayingAudio(): boolean {
    return this.isPlaying;
  }

  private base64ToBlob(base64: string, mimeType: string): Blob {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }
}

export class TTSManager {
  private backends: Map<string, TTSBackendPlugin> = new Map();
  private defaultBackend: TTSBackendPlugin | null = null;
  private audioPlayer: AudioPlayer = new AudioPlayer();

  registerBackend(backend: TTSBackendPlugin): void {
    this.backends.set(backend.getBackendName(), backend);
    if (!this.defaultBackend) {
      this.defaultBackend = backend;
    }
  }

  unregisterBackend(backendName: string): void {
    const removed = this.backends.delete(backendName);
    if (removed && this.defaultBackend?.getBackendName() === backendName) {
      this.defaultBackend = this.backends.values().next().value || null;
    }
  }

  getAvailableBackends(): string[] {
    return Array.from(this.backends.keys());
  }

  getBackend(backendName: string): TTSBackendPlugin | null {
    return this.backends.get(backendName) || null;
  }

  getDefaultBackend(): TTSBackendPlugin | null {
    return this.defaultBackend;
  }

  setDefaultBackend(backendName: string): boolean {
    const backend = this.backends.get(backendName);
    if (backend) {
      this.defaultBackend = backend;
      return true;
    }
    return false;
  }

  async synthesize(text: string, config?: TTSConfig): Promise<AudioData> {
    const backendName = config?.backend || this.defaultBackend?.getBackendName();
    if (!backendName) {
      throw new Error('No TTS backend available');
    }

    const backend = this.backends.get(backendName);
    if (!backend) {
      throw new Error(`TTS backend not found: ${backendName}`);
    }

    return backend.synthesize(text, config);
  }

  async speak(text: string, config?: TTSConfig): Promise<void> {
    const audioData = await this.synthesize(text, config);
    return this.audioPlayer.play(audioData);
  }

  pausePlayback(): void {
    this.audioPlayer.pause();
  }

  resumePlayback(): void {
    this.audioPlayer.resume();
  }

  stopPlayback(): void {
    this.audioPlayer.stop();
  }

  seekPlayback(time: number): void {
    this.audioPlayer.seek(time);
  }

  setPlaybackRate(rate: number): void {
    this.audioPlayer.setPlaybackRate(rate);
  }

  setVolume(vol: number): void {
    this.audioPlayer.setVolume(vol);
  }

  getPlaybackState(): {
    isPlaying: boolean;
    currentTime: number;
    duration: number;
  } {
    return {
      isPlaying: this.audioPlayer.isPlayingAudio(),
      currentTime: this.audioPlayer.getCurrentTime(),
      duration: this.audioPlayer.getDuration(),
    };
  }

  async getAvailableVoices(backendName?: string): Promise<VoiceInfo[]> {
    const backend = backendName
      ? this.backends.get(backendName)
      : this.defaultBackend;

    if (!backend || !backend.getAvailableVoices) {
      return [];
    }

    return backend.getAvailableVoices();
  }

  async getSupportedLanguages(backendName?: string): Promise<string[]> {
    const backend = backendName
      ? this.backends.get(backendName)
      : this.defaultBackend;

    if (!backend || !backend.getSupportedLanguages) {
      return [];
    }

    return backend.getSupportedLanguages();
  }
}

export const ttsManager = new TTSManager();

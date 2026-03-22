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
    const backendName = config?.backend || this.defaultBackend?.getBackendName();
    
    // For Web Speech API (edge backend without API), speak directly
    if (backendName === 'edge' && window.speechSynthesis) {
      return this.speakWithWebSpeech(text, config);
    }
    
    const audioData = await this.synthesize(text, config);
    if (!audioData.data) {
      return;
    }
    return this.audioPlayer.play(audioData);
  }

  private speakWithWebSpeech(text: string, config?: TTSConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      
      const voices = window.speechSynthesis!.getVoices();
      console.log('[TTS] Available voices:', voices.map(v => ({ name: v.name, lang: v.lang })));
      
      // Get voice name from config, or auto-detect based on language
      let voiceName = config?.voice;
      
      if (!voiceName || voiceName === 'auto') {
        const detectedLang = this.detectLanguage(text);
        console.log('[TTS] Detected language:', detectedLang);
        voiceName = this.selectVoiceForLanguage(text, voices);
        console.log('[TTS] Selected voice:', voiceName);
      } else {
        // Try to find exact match first
        const exactMatch = voices.find(v => v.name === voiceName);
        if (!exactMatch) {
          console.log('[TTS] Voice not found:', voiceName, 'falling back to auto');
          voiceName = this.selectVoiceForLanguage(text, voices);
        }
      }
      
      const matchedVoice = voices.find(v => v.name === voiceName);
      if (matchedVoice) {
        utterance.voice = matchedVoice;
        utterance.lang = matchedVoice.lang;
        console.log('[TTS] Using voice:', matchedVoice.name, 'lang:', matchedVoice.lang);
      } else {
        console.log('[TTS] No matching voice found, using default');
      }
      
      utterance.rate = config?.speed || 1;
      
      utterance.onend = () => resolve();
      utterance.onerror = (event) => reject(new Error(`Speech synthesis error: ${event.error}`));

      window.speechSynthesis!.speak(utterance);
    });
  }

  private detectLanguage(text: string): string {
    // Simple language detection based on character patterns
    const chineseRegex = /[\u4e00-\u9fff]/g;
    const japaneseRegex = /[\u3040-\u309f\u30a0-\u30ff]/g;
    const koreanRegex = /[\uac00-\ud7af\u1100-\u11ff]/g;
    const arabicRegex = /[\u0600-\u06ff]/g;
    const russianRegex = /[\u0400-\u04ff]/g;
    const germanRegex = /[äöüß]/gi;
    const frenchRegex = /[àâçéèêëïîôùûüÿ]/gi;
    const spanishRegex = /[áéíóúüñ¿¡]/gi;

    const chineseCount = (text.match(chineseRegex) || []).length;
    const japaneseCount = (text.match(japaneseRegex) || []).length;
    const koreanCount = (text.match(koreanRegex) || []).length;
    const arabicCount = (text.match(arabicRegex) || []).length;
    const russianCount = (text.match(russianRegex) || []).length;
    const germanCount = (text.match(germanRegex) || []).length;
    const frenchCount = (text.match(frenchRegex) || []).length;
    const spanishCount = (text.match(spanishRegex) || []).length;

    const totalNonEnglish = chineseCount + japaneseCount + koreanCount + arabicCount + russianCount + germanCount + frenchCount + spanishCount;

    if (totalNonEnglish === 0) {
      return 'en';
    }

    const langCounts: Record<string, number> = {
      'zh': chineseCount,
      'ja': japaneseCount,
      'ko': koreanCount,
      'ar': arabicCount,
      'ru': russianCount,
      'de': germanCount,
      'fr': frenchCount,
      'es': spanishCount,
    };

    let maxLang = 'en';
    let maxCount = 0;
    for (const [lang, count] of Object.entries(langCounts)) {
      if (count > maxCount) {
        maxCount = count;
        maxLang = lang;
      }
    }

    return maxLang;
  }

  private selectVoiceForLanguage(text: string, voices: SpeechSynthesisVoice[]): string {
    const detectedLang = this.detectLanguage(text);
    
    // First, try to find a voice that matches the detected language
    // This is the most reliable method - match by voice's lang property
    const langVoiceMap: Record<string, string[]> = {
      'zh': ['zh', 'zh-CN', 'zh-TW', 'zh-HK'],
      'ja': ['ja', 'ja-JP'],
      'ko': ['ko', 'ko-KR'],
      'ar': ['ar', 'ar-SA'],
      'ru': ['ru', 'ru-RU'],
      'de': ['de', 'de-DE'],
      'fr': ['fr', 'fr-FR', 'fr-CA'],
      'es': ['es', 'es-ES', 'es-MX'],
    };

    const targetLangs = langVoiceMap[detectedLang] || [detectedLang];
    
    // Find voice by language code in the voice's lang property
    for (const lang of targetLangs) {
      const voice = voices.find(v => v.lang.startsWith(lang));
      if (voice) {
        return voice.name;
      }
    }

    // If no exact match, try partial matching for the language
    const partialVoice = voices.find(v => v.lang.toLowerCase().includes(detectedLang));
    if (partialVoice) {
      return partialVoice.name;
    }

    // Fallback to first English voice
    const englishVoice = voices.find(v => v.lang.startsWith('en'));
    return englishVoice?.name || voices[0]?.name || 'Samantha';
  }

  pausePlayback(): void {
    this.audioPlayer.pause();
  }

  resumePlayback(): void {
    this.audioPlayer.resume();
  }

  stopPlayback(): void {
    this.audioPlayer.stop();
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
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

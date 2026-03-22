import { TTSBackendPlugin, PluginMetadata, VoiceInfo, AudioData, TTSConfig } from '../../domain/models/plugin';

interface EdgeVoice {
  short_name: string;
  localized_name: string;
  gender: string;
  locale: string;
}

export class EdgeTTSBackendPlugin implements TTSBackendPlugin {
  readonly type = 'tts-backend';
  private _metadata: PluginMetadata;
  private voices: VoiceInfo[] = [];
  private initialized = false;
  private speechSynth: SpeechSynthesis | null = null;

  constructor() {
    this._metadata = {
      id: 'edge-tts-backend',
      name: 'Edge TTS',
      version: '1.0.0',
      description: 'Microsoft Edge TTS backend with neural voices',
      author: 'StudyPal',
      type: 'tts-backend',
    };
  }

  get metadata(): PluginMetadata {
    return this._metadata;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      this.speechSynth = window.speechSynthesis;
      
      if (this.speechSynth) {
        await this.loadVoicesFromWebSpeech();
      }
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize Edge TTS:', error);
      throw error;
    }
  }

  async destroy(): Promise<void> {
    this.initialized = false;
    this.voices = [];
    if (this.speechSynth) {
      this.speechSynth.cancel();
    }
  }

  getBackendName(): string {
    return 'edge';
  }

  async loadVoicesFromWebSpeech(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.speechSynth) {
        resolve();
        return;
      }

      const loadVoices = () => {
        const webVoices = this.speechSynth!.getVoices();
        if (webVoices.length > 0) {
          this.voices = webVoices.map((voice) => ({
            id: voice.voiceURI,
            name: voice.name,
            language: voice.lang,
            gender: voice.name.toLowerCase().includes('male') ? 'Male' : 'Female',
          }));
        } else {
          this.voices = [
            { id: 'Microsoft David - English (United States)', name: 'Microsoft David - English (United States)', language: 'en-US', gender: 'Male' },
            { id: 'Microsoft Zira - English (United States)', name: 'Microsoft Zira - English (United States)', language: 'en-US', gender: 'Female' },
          ];
        }
        resolve();
      };

      loadVoices();
      this.speechSynth!.onvoiceschanged = loadVoices;
      setTimeout(resolve, 1000);
    });
  }

  async loadVoices(): Promise<void> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const edgeVoices: EdgeVoice[] = await invoke('tts_edge_voices');
      
      this.voices = edgeVoices.map((voice) => ({
        id: voice.short_name,
        name: voice.localized_name,
        language: voice.locale,
        gender: voice.gender,
      }));
    } catch {
      await this.loadVoicesFromWebSpeech();
    }
  }

  getAvailableVoices(): VoiceInfo[] {
    return this.voices;
  }

  getSupportedLanguages(): string[] {
    return [...new Set(this.voices.map((v) => v.language))];
  }

  async synthesize(text: string, config?: TTSConfig): Promise<AudioData> {
    if (!this.initialized) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      if (!this.speechSynth) {
        reject(new Error('Speech synthesis not available'));
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      
      const voiceName = config?.voice || 'Microsoft Zira - English (United States)';
      const matchedVoice = this.speechSynth.getVoices().find(v => 
        v.name === voiceName || v.voiceURI === voiceName
      );
      if (matchedVoice) {
        utterance.voice = matchedVoice;
      }

      utterance.rate = config?.speed || 1;
      
      utterance.onend = () => {
        resolve({
          format: 'mp3',
          data: '',
          duration_ms: 0,
        });
      };

      utterance.onerror = (event) => {
        reject(new Error(`Speech synthesis error: ${event.error}`));
      };

      this.speechSynth.speak(utterance);
    });
  }

  canHandle(config?: TTSConfig): boolean {
    return !config?.backend || config.backend === 'edge';
  }
}

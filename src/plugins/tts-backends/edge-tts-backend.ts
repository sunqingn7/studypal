import { TTSBackendPlugin, PluginMetadata, VoiceInfo, AudioData, TTSConfig } from '../../domain/models/plugin';

interface EdgeVoice {
  short_name: string;
  localized_name: string;
  gender: string;
  locale: string;
}

interface TTSRequest {
  text: string;
  voice?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
}

interface TTSResponse {
  audio_data: number[];
  format: string;
}

export class EdgeTTSBackendPlugin implements TTSBackendPlugin {
  readonly type = 'tts-backend';
  private _metadata: PluginMetadata;
  private voices: VoiceInfo[] = [];
  private initialized = false;

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
      await this.loadVoices();
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize Edge TTS:', error);
      throw error;
    }
  }

  async destroy(): Promise<void> {
    this.initialized = false;
    this.voices = [];
  }

  getBackendName(): string {
    return 'edge';
  }

  async loadVoices(): Promise<void> {
    const { invoke } = await import('@tauri-apps/api/core');
    const edgeVoices: EdgeVoice[] = await invoke('tts_edge_voices');
    
    this.voices = edgeVoices.map((voice) => ({
      id: voice.short_name,
      name: voice.localized_name,
      language: voice.locale,
      gender: voice.gender,
    }));
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

    const { invoke } = await import('@tauri-apps/api/core');
    
    const request: TTSRequest = {
      text,
      voice: config?.voice,
      rate: config?.speed ? (config.speed - 1) * 100 : undefined,
      pitch: undefined,
      volume: undefined,
    };

    const response: TTSResponse = await invoke('tts_edge_synth', { request });

    const audioBlob = new Blob([new Uint8Array(response.audio_data)], {
      type: `audio/${response.format}`,
    });
    const audioUrl = URL.createObjectURL(audioBlob);

    const audio = new Audio(audioUrl);
    const durationMs = await new Promise<number>((resolve) => {
      const loadHandler = () => resolve(audio.duration * 1000);
      const errorHandler = () => resolve(0);
      audio.addEventListener('loadedmetadata', loadHandler, { once: true });
      audio.addEventListener('error', errorHandler, { once: true });
    });

    const reader = await audioBlob.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(reader)));

    return {
      format: response.format,
      data: base64,
      duration_ms: durationMs,
    };
  }

  canHandle(config?: TTSConfig): boolean {
    return !config?.backend || config.backend === 'edge';
  }
}

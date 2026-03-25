import { TTSBackendPlugin, PluginMetadata, VoiceInfo, AudioData, TTSConfig } from '../../domain/models/plugin';
import { SERVICE_ENDPOINTS } from '../../config/endpoints';

export class QwenTTSBackendPlugin implements TTSBackendPlugin {
  readonly type = 'tts-backend';
  private _metadata: PluginMetadata;
  private serverUrl: string;
  private initialized = false;
  private voices: VoiceInfo[] = [];

  constructor(serverUrl?: string) {
    this.serverUrl = serverUrl || SERVICE_ENDPOINTS.tts.qwen;
    this._metadata = {
      id: 'qwen-tts-backend',
      name: 'Qwen TTS',
      version: '1.0.0',
      description: 'Qwen TTS backend with custom voice generation',
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
      const healthy = await this.healthCheck();
      if (!healthy) {
        throw new Error('Qwen TTS server is not running or unreachable');
      }
      await this.loadVoices();
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize Qwen TTS:', error);
      throw error;
    }
  }

  async destroy(): Promise<void> {
    this.initialized = false;
    this.voices = [];
  }

  getBackendName(): string {
    return 'qwen';
  }

  async healthCheck(): Promise<boolean> {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke('tts_qwen_health', { serverUrl: this.serverUrl });
  }

  async loadVoices(): Promise<void> {
    const { invoke } = await import('@tauri-apps/api/core');
    const voiceList: string[] = await invoke('tts_qwen_voices', { serverUrl: this.serverUrl });

    this.voices = voiceList.map((voice) => ({
      id: voice,
      name: voice,
      language: 'zh-CN',
      gender: 'Unknown',
    }));
  }

  getAvailableVoices(): VoiceInfo[] {
    return this.voices;
  }

  getSupportedLanguages(): string[] {
    return ['zh-CN', 'en-US'];
  }

  async synthesize(text: string, config?: TTSConfig): Promise<AudioData> {
    if (!this.initialized) {
      await this.initialize();
    }

    const { invoke } = await import('@tauri-apps/api/core');

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

    const request: TTSRequest = {
      text,
      voice: config?.voice,
      rate: config?.speed ? config.speed - 1 : undefined,
      pitch: undefined,
      volume: undefined,
    };

    const response: TTSResponse = await invoke('tts_qwen_synth', { request, serverUrl: this.serverUrl });

    const audioBlob = new Blob([new Uint8Array(response.audio_data)], {
      type: `audio/${response.format}`,
    });

    const audio = new Audio(URL.createObjectURL(audioBlob));
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
    return !config?.backend || config.backend === 'qwen';
  }
}

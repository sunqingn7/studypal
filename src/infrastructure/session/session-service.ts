import { invoke } from '@tauri-apps/api/core';
import { AIConfig, ProviderConfigs, DEFAULT_AI_CONFIG, PROVIDER_DEFAULTS } from '../../domain/models/ai-context';

export interface FilePosition {
  path: string;
  page: number;
  scrollPosition?: number;
}

// Create default configs for all providers
const createDefaultProviderConfigs = (): ProviderConfigs => ({
  llamacpp: { ...DEFAULT_AI_CONFIG, provider: 'llamacpp', ...PROVIDER_DEFAULTS.llamacpp },
  ollama: { ...DEFAULT_AI_CONFIG, provider: 'ollama', ...PROVIDER_DEFAULTS.ollama },
  openai: { ...DEFAULT_AI_CONFIG, provider: 'openai', ...PROVIDER_DEFAULTS.openai },
  anthropic: { ...DEFAULT_AI_CONFIG, provider: 'anthropic', ...PROVIDER_DEFAULTS.anthropic },
  vllm: { ...DEFAULT_AI_CONFIG, provider: 'vllm', ...PROVIDER_DEFAULTS.vllm },
  custom: { ...DEFAULT_AI_CONFIG, provider: 'custom', ...PROVIDER_DEFAULTS.custom },
});

export interface SessionState {
  aiConfig: AIConfig;
  providerConfigs: ProviderConfigs;
  openFiles: FilePosition[];
  activeFile: string | null;
}

export const DEFAULT_SESSION: SessionState = {
  aiConfig: {
    provider: 'llamacpp',
    endpoint: 'http://192.168.1.67:8033',
    model: 'Qwen3.5-27B',
    apiKey: undefined,
    systemPrompt: undefined,
    temperature: 0.7,
    maxTokens: 4096,
    topP: undefined,
  },
  providerConfigs: createDefaultProviderConfigs(),
  openFiles: [],
  activeFile: null,
};

export async function loadSession(): Promise<SessionState> {
  try {
    const result = await invoke<SessionState>('load_session');
    // Validate the result has required properties
    if (!result || typeof result !== 'object') {
      console.warn('Invalid session result from backend, using defaults');
      return DEFAULT_SESSION;
    }
    // Ensure required fields exist
    if (!result.aiConfig || !result.openFiles) {
      console.warn('Session missing required fields, using defaults');
      return { ...DEFAULT_SESSION, ...result } as SessionState;
    }
    return result;
  } catch (error) {
    console.error('Failed to load session:', error);
    return DEFAULT_SESSION;
  }
}

export async function saveSession(session: SessionState): Promise<void> {
  try {
    await invoke('save_session', { session });
  } catch (error) {
    console.error('Failed to save session:', error);
  }
}

// Throttled save to avoid too many writes
let saveTimeout: number | null = null;
export function saveSessionThrottled(session: SessionState, delay: number = 1000): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = window.setTimeout(() => {
    saveSession(session);
    saveTimeout = null;
  }, delay);
}

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
  nvidia: { ...DEFAULT_AI_CONFIG, provider: 'nvidia', ...PROVIDER_DEFAULTS.nvidia },
  openrouter: { ...DEFAULT_AI_CONFIG, provider: 'openrouter', ...PROVIDER_DEFAULTS.openrouter },
  gemini: { ...DEFAULT_AI_CONFIG, provider: 'gemini', ...PROVIDER_DEFAULTS.gemini },
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

function toCamelCase(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(toCamelCase);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [
        key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()),
        toCamelCase(value)
      ])
    );
  }
  return obj;
}

export async function loadSession(): Promise<SessionState> {
  try {
    const result = await invoke<any>('load_session');
    const converted = toCamelCase(result);
    
    if (!converted || typeof converted !== 'object') {
      return DEFAULT_SESSION;
    }
    if (!converted.aiConfig || !converted.openFiles) {
      return { ...DEFAULT_SESSION, ...converted } as SessionState;
    }
    return { ...DEFAULT_SESSION, ...converted };
  } catch (error) {
    console.error('Failed to load session:', error);
    return DEFAULT_SESSION;
  }
}

function toSnakeCase(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(toSnakeCase);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [
        key.replace(/([A-Z])/g, '_$1').toLowerCase(),
        toSnakeCase(value)
      ])
    );
  }
  return obj;
}

export async function saveSession(session: SessionState): Promise<void> {
  const snakeSession = toSnakeCase(session);
  try {
    await invoke('save_session', { session: snakeSession });
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

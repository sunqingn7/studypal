import { loadSession, saveSession, SessionState, FilePosition } from '../../infrastructure/session/session-service';
import { useAIChatStore } from '../store/ai-chat-store';
import { useLLMPoolStore } from '../store/llm-pool-store';
import { AIConfig, ProviderConfigs } from '../../domain/models/ai-context';
import { AI_PROVIDER_ENDPOINTS } from '../../config/endpoints';

// Re-export FilePosition for use in components
export type { FilePosition };

let currentSession: SessionState | null = null;

// Store callbacks for file restoration
let fileRestorationCallback: ((files: FilePosition[], activeFile: string | null) => void) | null = null;

// Store timer for capability detection
let capabilityDetectionTimer: ReturnType<typeof setTimeout> | null = null;

export async function initializeSession(): Promise<void> {
  try {
    const session = await loadSession();

    if (!session || typeof session !== 'object') {
      currentSession = null;
      return;
    }

    currentSession = session;

  if (!currentSession.providerConfigs) {
    currentSession.providerConfigs = {
      llamacpp: { provider: 'llamacpp', endpoint: AI_PROVIDER_ENDPOINTS.llamacpp.defaultEndpoint, model: 'llama-3.2-1b-instruct' },
      ollama: { provider: 'ollama', endpoint: AI_PROVIDER_ENDPOINTS.ollama.defaultEndpoint, model: 'llama3.2' },
      openai: { provider: 'openai', endpoint: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
      anthropic: { provider: 'anthropic', endpoint: 'https://api.anthropic.com/v1', model: 'claude-3-5-sonnet-20241022' },
      vllm: { provider: 'vllm', endpoint: AI_PROVIDER_ENDPOINTS.vllm.defaultEndpoint, model: 'meta-llama/Llama-3.2-1B-Instruct' },
      custom: { provider: 'custom', endpoint: AI_PROVIDER_ENDPOINTS.custom.defaultEndpoint, model: 'default-model' },
    } as ProviderConfigs;
  }

    if (session.aiConfig) {
      useAIChatStore.getState().setConfig(session.aiConfig);
    }
    
    if (session.providerConfigs && Object.keys(session.providerConfigs).length > 0) {
      useAIChatStore.getState().initializeProviderConfigs(
        session.providerConfigs,
        session.aiConfig?.provider
      );
    } else {
      if (session.aiConfig?.provider) {
        useAIChatStore.getState().switchProvider(session.aiConfig.provider as any);
      }
    }

    if (fileRestorationCallback && session.openFiles && session.openFiles.length > 0) {
      fileRestorationCallback(session.openFiles, session.activeFile);
    }

    // Detect provider capabilities after loading session
    if (capabilityDetectionTimer) clearTimeout(capabilityDetectionTimer)
    capabilityDetectionTimer = setTimeout(() => {
      capabilityDetectionTimer = null
      const poolStore = useLLMPoolStore.getState()
      if (poolStore.providers.length > 0) {
        poolStore.detectAllCapabilities()
      }
    }, 2000) // Delay to let providers initialize first
  } catch (error) {
    console.error('[Session] Failed to initialize session:', error);
  }
}

export function registerFileRestorationCallback(
  callback: (files: FilePosition[], activeFile: string | null) => void
): void {
  fileRestorationCallback = callback;
}

export function updateAIConfig(config: Partial<AIConfig>): void {
  if (!currentSession) return;

  const store = useAIChatStore.getState();
  const currentProvider = store.config.provider;

  currentSession.aiConfig = {
    ...currentSession.aiConfig,
    ...config,
  };

  if (!currentSession.providerConfigs) {
    currentSession.providerConfigs = {} as ProviderConfigs;
  }
  
  currentSession.providerConfigs[currentProvider] = {
    ...currentSession.providerConfigs[currentProvider],
    ...currentSession.aiConfig,
  };

  saveSessionThrottled();
}

export function updateProviderConfigs(providerConfigs: ProviderConfigs): void {
  if (!currentSession) return;

  currentSession.providerConfigs = providerConfigs;
  
  // Auto-save session
  saveSessionThrottled();

  // Re-detect capabilities after model change
  setTimeout(async () => {
    const poolStore = useLLMPoolStore.getState()
    if (poolStore.providers.length > 0) {
      await poolStore.detectAllCapabilities(true) // Force re-detect
    }
  }, 1000)
}

export function updateFilePositions(openFiles: FilePosition[], activeFile: string | null): void {
  if (!currentSession) return;
  
  currentSession.openFiles = openFiles;
  currentSession.activeFile = activeFile;
  
  // Auto-save session
  saveSessionThrottled();
}

export function getSessionState(): SessionState | null {
  return currentSession;
}

// Throttled save
let saveTimeout: number | null = null;
function saveSessionThrottled(): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = window.setTimeout(async () => {
    if (currentSession) {
      await saveSession(currentSession);
    }
    saveTimeout = null;
  }, 1000);
}

// Cleanup function - call when app is unloading
export function cleanupSessionTimers(): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  if (capabilityDetectionTimer) {
    clearTimeout(capabilityDetectionTimer);
    capabilityDetectionTimer = null;
  }
}

export async function forceSaveSession(): Promise<void> {
  if (currentSession) {
    await saveSession(currentSession);
  }
}

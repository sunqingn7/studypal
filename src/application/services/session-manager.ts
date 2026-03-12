import { loadSession, saveSession, SessionState, FilePosition } from '../../infrastructure/session/session-service';
import { useAIChatStore } from '../store/ai-chat-store';
import { AIConfig, ProviderConfigs } from '../../domain/models/ai-context';

// Re-export FilePosition for use in components
export type { FilePosition };

let currentSession: SessionState | null = null;

// Store callbacks for file restoration
let fileRestorationCallback: ((files: FilePosition[], activeFile: string | null) => void) | null = null;

export async function initializeSession(): Promise<void> {
  try {
    const session = await loadSession();
    console.log('[Session] Loaded session:', session);

    // Validate session structure
    if (!session || typeof session !== 'object') {
      console.warn('[Session] Invalid session structure, using defaults');
      currentSession = null;
      return;
    }

    currentSession = session;

    // Restore AI config and provider configs
    if (session.aiConfig) {
      useAIChatStore.getState().setConfig(session.aiConfig);
    }
    
    // Restore provider-specific configs if they exist
    if (session.providerConfigs) {
      useAIChatStore.getState().initializeProviderConfigs(session.providerConfigs);
    }

    console.log('[Session] Loaded session from config:', {
      aiProvider: session.aiConfig?.provider,
      aiEndpoint: session.aiConfig?.endpoint,
      openFiles: session.openFiles?.length || 0,
      activeFile: session.activeFile,
    });

    // Restore files if callback is registered
    if (fileRestorationCallback && session.openFiles && session.openFiles.length > 0) {
      fileRestorationCallback(session.openFiles, session.activeFile);
    }
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

  // Update the current config
  currentSession.aiConfig = {
    ...currentSession.aiConfig,
    ...config,
  };

  // Update provider-specific configs
  if (!currentSession.providerConfigs) {
    currentSession.providerConfigs = {} as ProviderConfigs;
  }
  
  currentSession.providerConfigs[currentProvider] = {
    ...currentSession.providerConfigs[currentProvider],
    ...currentSession.aiConfig,
  };

  // Auto-save session
  saveSessionThrottled();
}

export function updateProviderConfigs(providerConfigs: ProviderConfigs): void {
  if (!currentSession) return;

  currentSession.providerConfigs = providerConfigs;
  
  // Auto-save session
  saveSessionThrottled();
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
      console.log('[Session] Saved session');
    }
    saveTimeout = null;
  }, 1000);
}

export async function forceSaveSession(): Promise<void> {
  if (currentSession) {
    await saveSession(currentSession);
    console.log('[Session] Force saved session');
  }
}

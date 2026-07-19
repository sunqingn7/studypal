import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore, TranslationConfig } from '../store/settings-store';
import { useLLMPoolStore } from '../store/llm-pool-store';
import { AIProviderType } from '../../domain/models/ai-context';

export interface TranslateResponse {
  success: boolean;
  output_paths: string[];
  error: string | null;
}

export interface TranslationProviderConfig {
  service_name: string;
  api_key?: string;
  base_url?: string;
  model?: string;
  custom_prompt?: string;
  venv_path?: string;
  threads: number;
}

export interface TranslateRequest {
  input_path: string;
  source_lang: string;
  target_lang: string;
  pages?: number[];
  use_llm: boolean;
  provider_config?: TranslationProviderConfig;
  force_retranslate: boolean;
}

// Provider mapping from StudyPal to pdf2zh
const PROVIDER_MAPPING: Record<AIProviderType, { service: string; usesOpenAIFormat: boolean }> = {
  openai: { service: 'openai', usesOpenAIFormat: true },
  gemini: { service: 'gemini', usesOpenAIFormat: false },
  anthropic: { service: 'openai', usesOpenAIFormat: true },
  ollama: { service: 'ollama', usesOpenAIFormat: false },
  llamacpp: { service: 'openailiked', usesOpenAIFormat: true },
  vllm: { service: 'openailiked', usesOpenAIFormat: true },
  openrouter: { service: 'openai', usesOpenAIFormat: true },
  nvidia: { service: 'openai', usesOpenAIFormat: true },
  custom: { service: 'openailiked', usesOpenAIFormat: true },
};

/**
 * Map StudyPal provider to pdf2zh service name and config
 */
function mapToPdf2zhService(
  provider: AIProviderType,
  config: { apiKey?: string; endpoint?: string; model?: string }
): TranslationProviderConfig {
  const mapping = PROVIDER_MAPPING[provider];
  
  return {
    service_name: mapping.service,
    api_key: config.apiKey,
    base_url: config.endpoint,
    model: config.model,
    threads: 4,
  };
}

/**
 * Auto-detect Python venv in common locations
 */
async function detectVenv(): Promise<string | null> {
  const commonPaths = [
    '.venv',
    'venv',
    '../.venv',
    '../venv',
  ];

  // Check common paths first (relative to current directory)
  for (const path of commonPaths) {
    const activatePath = `${path}/bin/activate`;
    try {
      const exists = await invoke<boolean>('check_path_exists', { path: activatePath });
      if (exists) {
        return path;
      }
    } catch {
      // Continue checking other paths
    }
  }

  // Check home directory paths using Rust backend
  const homePaths = [
    '~/.venv',
    '~/venv',
  ];

  for (const path of homePaths) {
    try {
      // Use Rust backend to expand the path
      const expanded = await invoke<string>('expand_path', { path });
      const activatePath = `${expanded}/bin/activate`;
      const exists = await invoke<boolean>('check_path_exists', { path: activatePath });
      if (exists) {
        return expanded;
      }
    } catch {
      // Continue checking other paths
    }
  }

  return null;
}

/**
 * Build provider configuration from settings and LLM pool
 */
async function buildProviderConfig(
  settings: TranslationConfig
): Promise<TranslationProviderConfig | null> {
  const llmPool = useLLMPoolStore.getState();
  
  // Get the provider to use
  let provider = settings.usePrimaryProvider
    ? llmPool.getPrimaryProvider()
    : llmPool.providers.find((p) => p.id === settings.manualProviderId && p.isEnabled);
  
  if (!provider) {
    // Fallback to primary if manual selection not found
    provider = llmPool.getPrimaryProvider();
  }
  
  if (!provider) {
    return null;
  }
  
  // Map to pdf2zh config
  const config = mapToPdf2zhService(
    provider.config.provider,
    {
      apiKey: provider.config.apiKey,
      endpoint: provider.config.endpoint,
      model: provider.config.model,
    }
  );
  
  // Add custom settings
  config.custom_prompt = settings.customPrompt || undefined;
  config.threads = settings.threads || 4;
  
  // Handle venv path
  if (settings.autoDetectVenv && !settings.venvPath) {
    config.venv_path = await detectVenv() || undefined;
  } else {
    config.venv_path = settings.venvPath || undefined;
  }
  
  return config;
}

/**
 * Main translation function
 */
export async function translateDocument(
  inputPath: string,
  sourceLang: string,
  targetLang: string,
  options?: {
    pages?: number[];
    forceRetranslate?: boolean;
    retryProviderId?: string;
    useLlm?: boolean;
  }
): Promise<TranslateResponse> {
  const settings = useSettingsStore.getState().global.translation;
  
  // Determine if we should use LLM (options override settings)
  let useLLM = options?.useLlm ?? settings.service !== 'google';
  let providerConfig: TranslationProviderConfig | undefined = undefined;
  
  if (useLLM) {
    // For retry, use specified provider
    if (options?.retryProviderId) {
      const llmPool = useLLMPoolStore.getState();
      const retryProvider = llmPool.providers.find(
        (p) => p.id === options.retryProviderId
      );
      if (retryProvider) {
        providerConfig = mapToPdf2zhService(retryProvider.config.provider, {
          apiKey: retryProvider.config.apiKey,
          endpoint: retryProvider.config.endpoint,
          model: retryProvider.config.model,
        });
        providerConfig.custom_prompt = settings.customPrompt || undefined;
        providerConfig.threads = settings.threads || 4;
        
        if (settings.autoDetectVenv && !settings.venvPath) {
          providerConfig.venv_path = (await detectVenv()) || undefined;
        } else {
          providerConfig.venv_path = settings.venvPath || undefined;
        }
      }
    } else {
      // Normal flow - use settings
      providerConfig = (await buildProviderConfig(settings)) || undefined;
    }
    
    // If no provider config available, fallback to Google
    if (!providerConfig) {
      useLLM = false;
    }
  }
  
  try {
    const result = await invoke<TranslateResponse>('translate_document', {
      request: {
        input_path: inputPath,
        source_lang: sourceLang,
        target_lang: targetLang,
        pages: options?.pages,
        use_llm: useLLM,
        provider_config: providerConfig,
        force_retranslate: options?.forceRetranslate || false,
      } as TranslateRequest,
    });
    
    return result;
  } catch (error) {
    console.error('[TranslationService] Translation error:', error);
    return {
      success: false,
      output_paths: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function stopTranslation(): Promise<boolean> {
  try {
    return await invoke<boolean>('stop_translation');
  } catch (error) {
    console.error('[TranslationService] Failed to stop translation:', error);
    return false;
  }
}

/**
 * Clear translation cache for a document
 */
export async function clearTranslationCache(
  docPath?: string,
  sourceLang?: string,
  targetLang?: string
): Promise<boolean> {
  try {
    return await invoke<boolean>('clear_translation_cache', {
      docPath,
      sourceLang,
      targetLang,
    });
  } catch (error) {
    console.error('[TranslationService] Failed to clear cache:', error);
    return false;
  }
}

/**
 * Force retranslate by clearing cache and retranslating
 */
export async function forceRetranslate(
  inputPath: string,
  sourceLang: string,
  targetLang: string,
  pages?: number[]
): Promise<TranslateResponse> {
  return translateDocument(inputPath, sourceLang, targetLang, {
    pages,
    forceRetranslate: true,
  });
}

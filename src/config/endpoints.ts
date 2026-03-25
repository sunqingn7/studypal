/**
 * Application endpoint configuration
 * All hardcoded endpoints should be defined here for easy management
 */

export interface EndpointConfig {
  name: string
  defaultEndpoint: string
  description: string
}

// Default endpoints for AI providers
export const AI_PROVIDER_ENDPOINTS: Record<string, EndpointConfig> = {
  llamacpp: {
    name: 'llama.cpp',
    defaultEndpoint: 'http://localhost:8080',
    description: 'Local llama.cpp server endpoint',
  },
  ollama: {
    name: 'Ollama',
    defaultEndpoint: 'http://localhost:11434',
    description: 'Ollama local API endpoint',
  },
  vllm: {
    name: 'vLLM',
    defaultEndpoint: 'http://localhost:8000/v1',
    description: 'vLLM OpenAI-compatible API endpoint',
  },
  custom: {
    name: 'Custom',
    defaultEndpoint: 'http://localhost:8080/v1',
    description: 'Custom OpenAI-compatible endpoint',
  },
}

// Default endpoints for services
export const SERVICE_ENDPOINTS = {
  tts: {
    qwen: 'http://localhost:8083',
    description: 'Qwen TTS service endpoint',
  },
}

// Get endpoint with fallback
export function getEndpoint(
  provider: string,
  customEndpoint?: string
): string {
  if (customEndpoint) return customEndpoint
  return AI_PROVIDER_ENDPOINTS[provider]?.defaultEndpoint || ''
}

// Validate endpoint URL
export function isValidEndpoint(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

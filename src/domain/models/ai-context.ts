export type AIProviderType = 'llamacpp' | 'ollama' | 'openai' | 'anthropic' | 'vllm' | 'nvidia' | 'custom'

export type ContextSource = 'file' | 'note' | 'ai-note' | 'global-note' | 'topic'

export interface ContextItem {
  source: ContextSource
  content: string
  metadata?: Record<string, unknown>
}

export interface AIContext {
  items: ContextItem[]
  isComplete: boolean
}

export interface AIConfig {
  provider: AIProviderType
  endpoint: string
  model: string
  apiKey?: string
  systemPrompt?: string
  // Provider-specific options
  temperature?: number
  maxTokens?: number
  topP?: number
  // For custom headers or additional config
  extraHeaders?: Record<string, string>
  extraBody?: Record<string, unknown>
}

// Store configs per provider for persistence
export type ProviderConfigs = Record<AIProviderType, AIConfig>

export const DEFAULT_AI_CONFIG: AIConfig = {
  provider: 'llamacpp',
  endpoint: 'http://192.168.1.67:8033',
  model: 'Qwen3.5-27B',
}

export const PROVIDER_DEFAULTS: Record<AIProviderType, Partial<AIConfig>> = {
  llamacpp: {
    endpoint: 'http://localhost:8080',
    model: 'llama-3.2-1b-instruct',
  },
  ollama: {
    endpoint: 'http://localhost:11434',
    model: 'llama3.2',
  },
  openai: {
    endpoint: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
  anthropic: {
    endpoint: 'https://api.anthropic.com/v1',
    model: 'claude-3-5-sonnet-20241022',
  },
  vllm: {
    endpoint: 'http://localhost:8000/v1',
    model: 'meta-llama/Llama-3.2-1B-Instruct',
  },
  nvidia: {
    endpoint: 'https://integrate.api.nvidia.com/v1',
    model: 'meta/llama-3.1-8b-instruct',
  },
  custom: {
    endpoint: 'http://localhost:8080/v1',
    model: 'default-model',
  },
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  thinking?: string
  timestamp: number
}

export interface AIState {
  config: AIConfig
  chatHistory: ChatMessage[]
  isStreaming: boolean
  currentContext: AIContext
}

export const CONTEXT_TRIGGERS = {
  SELECTED_TEXT: ['selected text', 'the selected', 'this selection'],
  WHOLE_FILE: ['whole book', 'entire file', 'the whole', 'entire document'],
  CHAPTER: ['this chapter', 'current chapter', 'this section'],
  TOPIC: ['this topic', 'topic notes', 'for this topic', 'in this topic'],
  GLOBAL: ['globally', 'all notes', 'globally', 'overall'],
} as const

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
  provider: 'llamacpp' | 'ollama' | 'openai' | 'anthropic'
  endpoint: string
  model: string
  systemPrompt?: string
}

export const DEFAULT_AI_CONFIG: AIConfig = {
  provider: 'llamacpp',
  endpoint: 'http://localhost:8080',
  model: 'llama2',
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
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

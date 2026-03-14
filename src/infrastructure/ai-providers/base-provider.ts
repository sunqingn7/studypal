import { AIConfig, ChatMessage } from '../../domain/models/ai-context'

export interface ChatResponse {
  content: string
  thinking?: string
}

export interface StreamChunk {
  content: string
  thinking?: string
  done: boolean
}

export interface AIProvider {
  name: string
  chat(messages: ChatMessage[], config: AIConfig): Promise<string>
  streamChat(messages: ChatMessage[], config: AIConfig, onChunk: (chunk: string) => void | Promise<void>): Promise<void>
  streamChatWithThinking?(messages: ChatMessage[], config: AIConfig, onChunk: (chunk: string) => void | Promise<void>, onThinking: (thinking: string) => void | Promise<void>): Promise<void>
  supportsTrueStreaming?(): boolean
}

export async function chatWithAI(
  provider: AIProvider,
  messages: ChatMessage[],
  config: AIConfig
): Promise<string> {
  return provider.chat(messages, config)
}

export async function streamChatWithAI(
  provider: AIProvider,
  messages: ChatMessage[],
  config: AIConfig,
  onChunk: (chunk: string) => void
): Promise<void> {
  return provider.streamChat(messages, config, onChunk)
}

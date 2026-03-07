import { AIConfig, ChatMessage } from '../../domain/models/ai-context'

export interface AIProvider {
  name: string
  chat(messages: ChatMessage[], config: AIConfig): Promise<string>
  streamChat(messages: ChatMessage[], config: AIConfig, onChunk: (chunk: string) => void): Promise<void>
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

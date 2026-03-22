import { AIConfig, ChatMessage } from '../../domain/models/ai-context'
import { MCPTool } from '../../domain/models/plugin'
import { ToolCall, ChatWithToolsResult } from './tool-calling'

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
  chat(messages: ChatMessage[], config: AIConfig, signal?: AbortSignal): Promise<string>
  streamChat(messages: ChatMessage[], config: AIConfig, onChunk: (chunk: string) => void | Promise<void>, signal?: AbortSignal): Promise<void>
  streamChatWithThinking?(messages: ChatMessage[], config: AIConfig, onChunk: (chunk: string) => void | Promise<void>, onThinking: (thinking: string) => void | Promise<void>, signal?: AbortSignal): Promise<void>
  supportsTrueStreaming?(): boolean
  
  // Tool calling support
  supportsNativeFunctionCalling?(): boolean
  chatWithTools?(messages: ChatMessage[], config: AIConfig, tools: MCPTool[]): Promise<ChatWithToolsResult>
  streamChatWithTools?(messages: ChatMessage[], config: AIConfig, tools: MCPTool[], onChunk: (chunk: string) => void, onToolCall?: (toolCall: ToolCall) => void): Promise<void>
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

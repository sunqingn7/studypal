import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { AIConfig, ChatMessage } from '../../domain/models/ai-context'
import type { AIProvider } from './base-provider'

interface LlamaCppMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface ChatRequestPayload {
  endpoint: string
  model: string
  messages: LlamaCppMessage[]
  apiKey?: string
  temperature?: number
  maxTokens?: number
  topP?: number
  extraHeaders?: Record<string, string>
  extraBody?: Record<string, unknown>
}

interface StreamChunkData {
  content: string
  thinking?: string
  done: boolean
}

export class LlamaCppProvider implements AIProvider {
  name = 'llama.cpp'

  supportsTrueStreaming(): boolean {
    return true
  }

  async chat(messages: ChatMessage[], config: AIConfig): Promise<string> {
    const payload: ChatRequestPayload = {
      endpoint: config.endpoint,
      model: config.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      apiKey: config.apiKey,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      topP: config.topP,
      extraHeaders: config.extraHeaders,
      extraBody: config.extraBody,
    }

    try {
      const result = await invoke<string>('chat_with_provider', { request: payload, provider: 'llamacpp' })
      return String(result)
    } catch (error: any) {
      console.error('[llamacpp-provider] Chat failed:', error?.message || error)
      throw error
    }
  }

  async streamChat(
    messages: ChatMessage[],
    config: AIConfig,
    onChunk: (chunk: string) => void | Promise<void>
  ): Promise<void> {
    const payload: ChatRequestPayload = {
      endpoint: config.endpoint,
      model: config.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      apiKey: config.apiKey,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      topP: config.topP,
      extraHeaders: config.extraHeaders,
      extraBody: config.extraBody,
    }

    // Set up event listener for streaming chunks
    let unlisten: UnlistenFn | null = null
    let fullContent = ''

    try {
      // Listen for stream chunks from the backend
      unlisten = await listen<StreamChunkData>('chat-stream-chunk', (event) => {
        if (event.payload.done) {
          return
        }

        if (event.payload.content) {
          fullContent += event.payload.content
          onChunk(event.payload.content)
        }
      })

      // Start the streaming request
      await invoke<void>('stream_chat_with_provider', { request: payload, provider: 'llamacpp' })
    } catch (error: any) {
      console.error('[llamacpp-provider] Stream error:', error?.message || error)
      throw error
    } finally {
      if (unlisten) {
        unlisten()
      }
    }
  }

  async streamChatWithThinking(
    messages: ChatMessage[],
    config: AIConfig,
    onChunk: (chunk: string) => void | Promise<void>,
    onThinking: (thinking: string) => void | Promise<void>
  ): Promise<void> {
    console.log('[llamacpp-provider] streamChatWithThinking() called - using true streaming')

    const payload: ChatRequestPayload = {
      endpoint: config.endpoint,
      model: config.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      apiKey: config.apiKey,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      topP: config.topP,
      extraHeaders: config.extraHeaders,
      extraBody: config.extraBody,
    }

    // Set up event listener for streaming chunks
    let unlisten: UnlistenFn | null = null
    let fullContent = ''
    let fullThinking = ''

    try {
      // Listen for stream chunks from the backend
      unlisten = await listen<StreamChunkData>('chat-stream-chunk', (event) => {
        if (event.payload.done) {
          console.log('[llamacpp-provider] Stream complete, content:', fullContent.length, 'chars, thinking:', fullThinking.length, 'chars')
          return
        }

        if (event.payload.thinking) {
          fullThinking += event.payload.thinking
          onThinking(fullThinking)
        }

        if (event.payload.content) {
          fullContent += event.payload.content
          onChunk(event.payload.content)
        }
      })

      // Start the streaming request
      await invoke<void>('stream_chat_with_provider', { request: payload, provider: 'llamacpp' })
    } catch (error: any) {
      console.error('[llamacpp-provider] streamChatWithThinking error:', error)
      throw error
    } finally {
      if (unlisten) {
        unlisten()
      }
    }
  }
}

export const llamaCppProvider = new LlamaCppProvider()

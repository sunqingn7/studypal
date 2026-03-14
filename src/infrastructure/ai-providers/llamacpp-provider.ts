import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { AIConfig, ChatMessage } from '../../domain/models/ai-context'
import type { AIProvider } from './base-provider'

// Log when module loads
console.log('[llamacpp-provider] Module loading, invoke function:', typeof invoke)

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
    console.log('[llamacpp-provider] chat() called with:', {
      endpoint: config.endpoint,
      model: config.model,
      messageCount: messages.length
    })

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

    console.log('[llamacpp-provider] Calling invoke with payload:', JSON.stringify(payload, null, 2))

    try {
      console.log('[llamacpp-provider] About to call invoke...')
      const result = await invoke<string>('chat_with_provider', { request: payload, provider: 'llamacpp' })
      console.log('[llamacpp-provider] invoke returned!')
      console.log('[llamacpp-provider] result type:', typeof result)
      console.log('[llamacpp-provider] result:', result)

      // Force convert to string if needed
      const resultStr = String(result)
      console.log('[llamacpp-provider] converted to string, length:', resultStr.length)
      return resultStr
    } catch (error: any) {
      console.error('[llamacpp-provider] invoke failed with error:', error)
      console.error('[llamacpp-provider] error name:', error?.name)
      console.error('[llamacpp-provider] error message:', error?.message)
      console.error('[llamacpp-provider] error stack:', error?.stack)
      throw error
    }
  }

  async streamChat(
    messages: ChatMessage[],
    config: AIConfig,
    onChunk: (chunk: string) => void | Promise<void>
  ): Promise<void> {
    console.log('[llamacpp-provider] streamChat() called - using true streaming')

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
          console.log('[llamacpp-provider] Stream complete, received', fullContent.length, 'chars')
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
      console.error('[llamacpp-provider] streamChat error:', error)
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

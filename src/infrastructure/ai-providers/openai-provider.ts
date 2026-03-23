import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { AIConfig, ChatMessage } from '../../domain/models/ai-context'
import type { AIProvider } from './base-provider'

interface OpenAIMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface ChatRequestPayload {
  endpoint: string
  model: string
  messages: OpenAIMessage[]
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

export class OpenAIProvider implements AIProvider {
  name = 'OpenAI'

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
      const result = await invoke<string>('chat_with_provider', { request: payload, provider: 'openai' })
      return String(result)
    } catch (error: any) {
      console.error('[openai-provider] invoke failed with error:', error)
      throw error
    }
  }

  async streamChat(
    messages: ChatMessage[],
    config: AIConfig,
    onChunk: (chunk: string) => void | Promise<void>,
    signal?: AbortSignal
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

    let unlisten: UnlistenFn | null = null

    try {
      const streamId = `openai-stream-${crypto.randomUUID()}`
      const payloadWithStream = { ...payload, streamEvent: streamId }

      unlisten = await listen<StreamChunkData>(streamId, (event) => {
        if (event.payload.done) {
          return
        }

        if (event.payload.content) {
          onChunk(event.payload.content)
        }
      })

      if (signal) {
        signal.addEventListener('abort', () => {
          if (unlisten) {
            unlisten()
            unlisten = null
          }
        })
      }

      await invoke<void>('stream_chat_with_provider', { request: payloadWithStream, provider: 'openai' })
    } catch (error: any) {
      console.error('[openai-provider] streamChat error:', error)
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

    let unlisten: UnlistenFn | null = null
    let fullThinking = ''

    try {
      const streamId = `openai-stream-${crypto.randomUUID()}`
      const payloadWithStream = { ...payload, streamEvent: streamId }

      unlisten = await listen<StreamChunkData>(streamId, (event) => {
        if (event.payload.done) {
          return
        }

        if (event.payload.thinking) {
          fullThinking += event.payload.thinking
          onThinking(fullThinking)
        }

        if (event.payload.content) {
          onChunk(event.payload.content)
        }
      })

      await invoke<void>('stream_chat_with_provider', { request: payloadWithStream, provider: 'openai' })
    } catch (error: any) {
      console.error('[openai-provider] streamChatWithThinking error:', error)
      throw error
    } finally {
      if (unlisten) {
        unlisten()
      }
    }
  }
}

export const openaiProvider = new OpenAIProvider()

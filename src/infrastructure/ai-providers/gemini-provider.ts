import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { AIConfig, ChatMessage } from '../../domain/models/ai-context'
import type { AIProvider } from './base-provider'

interface ChatRequestPayload {
  endpoint: string
  model: string
  messages: { role: string; content: string }[]
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

export class GeminiProvider implements AIProvider {
  name = 'Google Gemini'

  async chat(messages: ChatMessage[], config: AIConfig): Promise<string> {
    console.log('[gemini-provider] chat() called with:', {
      endpoint: config.endpoint,
      model: config.model,
      messageCount: messages.length,
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

    console.log('[gemini-provider] Calling invoke with payload:', JSON.stringify(payload, null, 2))

    try {
      console.log('[gemini-provider] About to call invoke...')
      const result = await invoke<string>('chat_with_provider', { request: payload, provider: 'gemini' })
      console.log('[gemini-provider] invoke returned!')
      console.log('[gemini-provider] result type:', typeof result)
      console.log('[gemini-provider] result:', result)

      const resultStr = String(result)
      console.log('[gemini-provider] converted to string, length:', resultStr.length)
      return resultStr
    } catch (error: any) {
      console.error('[gemini-provider] invoke failed with error:', error)
      throw error
    }
  }

  async streamChat(
    messages: ChatMessage[],
    config: AIConfig,
    onChunk: (chunk: string) => void | Promise<void>
  ): Promise<void> {
    console.log('[gemini-provider] streamChat() called - using true streaming')

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
    let fullContent = ''

    try {
      unlisten = await listen<StreamChunkData>('chat-stream-chunk', (event) => {
        if (event.payload.done) {
          console.log('[gemini-provider] Stream complete, received', fullContent.length, 'chars')
          return
        }

        if (event.payload.content) {
          fullContent += event.payload.content
          onChunk(event.payload.content)
        }
      })

      await invoke<void>('stream_chat_with_provider', { request: payload, provider: 'gemini' })
    } catch (error: any) {
      console.error('[gemini-provider] streamChat error:', error)
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
    console.log('[gemini-provider] streamChatWithThinking() called - using true streaming')

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
    let fullContent = ''
    let fullThinking = ''

    try {
      unlisten = await listen<StreamChunkData>('chat-stream-chunk', (event) => {
        if (event.payload.done) {
          console.log('[gemini-provider] Stream complete, content:', fullContent.length, 'chars, thinking:', fullThinking.length, 'chars')
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

      await invoke<void>('stream_chat_with_provider', { request: payload, provider: 'gemini' })
    } catch (error: any) {
      console.error('[gemini-provider] streamChatWithThinking error:', error)
      throw error
    } finally {
      if (unlisten) {
        unlisten()
      }
    }
  }
}

export const geminiProvider = new GeminiProvider()

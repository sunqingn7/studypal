import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { AIConfig, ChatMessage } from '../../domain/models/ai-context'
import type { AIProvider } from './base-provider'

// Log when module loads
console.log('[custom-provider] Module loading, invoke function:', typeof invoke)

interface CustomMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface ChatRequestPayload {
  endpoint: string
  model: string
  messages: CustomMessage[]
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

export class CustomProvider implements AIProvider {
  name = 'Custom'

  async chat(messages: ChatMessage[], config: AIConfig): Promise<string> {
    console.log('[custom-provider] chat() called with:', {
      endpoint: config.endpoint,
      model: config.model,
      messageCount: messages.length,
      hasApiKey: !!config.apiKey,
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
      extraHeaders: {
        ...(config.extraHeaders || {}),
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      extraBody: config.extraBody,
    }

    console.log('[custom-provider] Calling invoke with payload:', JSON.stringify(payload, null, 2))

    try {
      console.log('[custom-provider] About to call invoke...')
      // Use 'openai' provider type since custom endpoints are OpenAI-compatible
      const result = await invoke<string>('chat_with_provider', { request: payload, provider: 'openai' })
      console.log('[custom-provider] invoke returned!')
      console.log('[custom-provider] result type:', typeof result)
      console.log('[custom-provider] result:', result)

      // Force convert to string if needed
      const resultStr = String(result)
      console.log('[custom-provider] converted to string, length:', resultStr.length)
      return resultStr
    } catch (error: any) {
      console.error('[custom-provider] invoke failed with error:', error)
      console.error('[custom-provider] error name:', error?.name)
      console.error('[custom-provider] error message:', error?.message)
      console.error('[custom-provider] error stack:', error?.stack)
      throw error
    }
  }

  async streamChat(
    messages: ChatMessage[],
    config: AIConfig,
    onChunk: (chunk: string) => void | Promise<void>
  ): Promise<void> {
    console.log('[custom-provider] streamChat() called - using true streaming')

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
      extraHeaders: {
        ...(config.extraHeaders || {}),
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      extraBody: config.extraBody,
    }

    // Set up event listener for streaming chunks
    let unlisten: UnlistenFn | null = null
    let fullContent = ''

  try {
    // Generate unique stream ID for this streaming session
    const streamId = `custom-stream-${crypto.randomUUID()}`

    // Add streamEvent to payload
    const payloadWithStream = { ...payload, streamEvent: streamId }

    // Listen for stream chunks from the backend
    unlisten = await listen<StreamChunkData>(streamId, (event) => {
      if (event.payload.done) {
        console.log('[custom-provider] Stream complete, received', fullContent.length, 'chars')
        return
      }

      if (event.payload.content) {
        fullContent += event.payload.content
        onChunk(event.payload.content)
      }
    })

    // Start the streaming request - use 'openai' provider type
    await invoke<void>('stream_chat_with_provider', { request: payloadWithStream, provider: 'openai' })
    } catch (error: any) {
      console.error('[custom-provider] streamChat error:', error)
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
    console.log('[custom-provider] streamChatWithThinking() called - using true streaming')

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
      extraHeaders: {
        ...(config.extraHeaders || {}),
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      extraBody: config.extraBody,
    }

    // Set up event listener for streaming chunks
    let unlisten: UnlistenFn | null = null
    let fullContent = ''
    let fullThinking = ''

  try {
    // Generate unique stream ID for this streaming session
    const streamId = `custom-stream-${crypto.randomUUID()}`

    // Add streamEvent to payload
    const payloadWithStream = { ...payload, streamEvent: streamId }

    // Listen for stream chunks from the backend
    unlisten = await listen<StreamChunkData>(streamId, (event) => {
      if (event.payload.done) {
        console.log('[custom-provider] Stream complete, content:', fullContent.length, 'chars, thinking:', fullThinking.length, 'chars')
        return
      }

      if (event.payload.thinking) {
        fullThinking += event.payload.thinking
        onThinking(event.payload.thinking)
      }

      if (event.payload.content) {
        fullContent += event.payload.content
        onChunk(event.payload.content)
      }
    })

    // Start the streaming request - use 'openai' provider type
    await invoke<void>('stream_chat_with_provider', { request: payloadWithStream, provider: 'openai' })
    } catch (error: any) {
      console.error('[custom-provider] streamChatWithThinking error:', error)
      throw error
    } finally {
      if (unlisten) {
        unlisten()
      }
    }
  }
}

export const customProvider = new CustomProvider()

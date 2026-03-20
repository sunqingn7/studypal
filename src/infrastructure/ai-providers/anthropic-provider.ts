import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { AIConfig, ChatMessage } from '../../domain/models/ai-context'
import type { AIProvider } from './base-provider'

interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ChatRequestPayload {
  endpoint: string
  model: string
  messages: AnthropicMessage[]
  systemPrompt?: string
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

export class AnthropicProvider implements AIProvider {
  name = 'Anthropic'

  async chat(messages: ChatMessage[], config: AIConfig): Promise<string> {
    console.log('[anthropic-provider] chat() called with:', {
      endpoint: config.endpoint,
      model: config.model,
      messageCount: messages.length,
    })

    const payload: ChatRequestPayload = {
      endpoint: config.endpoint,
      model: config.model,
      messages: messages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
      systemPrompt: config.systemPrompt,
      apiKey: config.apiKey,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      topP: config.topP,
      extraHeaders: config.extraHeaders,
      extraBody: config.extraBody,
    }

    console.log('[anthropic-provider] Calling invoke with payload:', JSON.stringify(payload, null, 2))

    try {
      console.log('[anthropic-provider] About to call invoke...')
      const result = await invoke<string>('chat_with_provider', { request: payload, provider: 'anthropic' })
      console.log('[anthropic-provider] invoke returned!')
      console.log('[anthropic-provider] result type:', typeof result)
      console.log('[anthropic-provider] result:', result)

      // Force convert to string if needed
      const resultStr = String(result)
      console.log('[anthropic-provider] converted to string, length:', resultStr.length)
      return resultStr
    } catch (error: any) {
      console.error('[anthropic-provider] invoke failed with error:', error)
      console.error('[anthropic-provider] error name:', error?.name)
      console.error('[anthropic-provider] error message:', error?.message)
      console.error('[anthropic-provider] error stack:', error?.stack)
      throw error
    }
  }

  async streamChat(
    messages: ChatMessage[],
    config: AIConfig,
    onChunk: (chunk: string) => void | Promise<void>
  ): Promise<void> {
    console.log('[anthropic-provider] streamChat() called - using true streaming')

    const payload: ChatRequestPayload = {
      endpoint: config.endpoint,
      model: config.model,
      messages: messages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
      systemPrompt: config.systemPrompt,
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
    // Generate unique stream ID for this streaming session
    const streamId = `anthropic-stream-${crypto.randomUUID()}`

    // Add streamEvent to payload
    const payloadWithStream = { ...payload, streamEvent: streamId }

    // Listen for stream chunks from the backend
    unlisten = await listen<StreamChunkData>(streamId, (event) => {
      if (event.payload.done) {
        console.log('[anthropic-provider] Stream complete, received', fullContent.length, 'chars')
        return
      }

      if (event.payload.content) {
        fullContent += event.payload.content
        onChunk(event.payload.content)
      }
    })

    // Start the streaming request
    await invoke<void>('stream_chat_with_provider', { request: payloadWithStream, provider: 'anthropic' })
    } catch (error: any) {
      console.error('[anthropic-provider] streamChat error:', error)
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
    console.log('[anthropic-provider] streamChatWithThinking() called - using true streaming')

    const payload: ChatRequestPayload = {
      endpoint: config.endpoint,
      model: config.model,
      messages: messages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
      systemPrompt: config.systemPrompt,
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
    // Generate unique stream ID for this streaming session
    const streamId = `anthropic-stream-${crypto.randomUUID()}`

    // Add streamEvent to payload
    const payloadWithStream = { ...payload, streamEvent: streamId }

    // Listen for stream chunks from the backend
    unlisten = await listen<StreamChunkData>(streamId, (event) => {
      if (event.payload.done) {
        console.log('[anthropic-provider] Stream complete, content:', fullContent.length, 'chars, thinking:', fullThinking.length, 'chars')
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
    await invoke<void>('stream_chat_with_provider', { request: payloadWithStream, provider: 'anthropic' })
    } catch (error: any) {
      console.error('[anthropic-provider] streamChatWithThinking error:', error)
      throw error
    } finally {
      if (unlisten) {
        unlisten()
      }
    }
  }
}

export const anthropicProvider = new AnthropicProvider()

import { invoke } from '@tauri-apps/api/core'
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
    console.log('[custom-provider] streamChat() called')

    try {
      // Tauri WebView doesn't support streaming fetch, use non-streaming and simulate
      console.log('[custom-provider] Calling chat()...')
      const response = await this.chat(messages, config)
      console.log('[custom-provider] Got response from chat(), type:', typeof response)
      console.log('[custom-provider] Response string:', response)

      if (!response || typeof response !== 'string') {
        console.error('[custom-provider] Invalid response:', response)
        throw new Error('Invalid response from chat()')
      }

      console.log('[custom-provider] Starting to stream chunks...')

      // Simulate streaming by chunking the response
      const chunks = response.split(/(?=\s+)/)
      console.log('[custom-provider] Split into', chunks.length, 'chunks')

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]
        if (chunk.trim()) {
          console.log(`[custom-provider] Sending chunk ${i}: "${chunk.slice(0, 20)}..."`)
          await onChunk(chunk)
          await new Promise(r => setTimeout(r, 10))
        }
      }
      console.log('[custom-provider] Streaming complete')
    } catch (error: any) {
      console.error('[custom-provider] streamChat error:', error)
      console.error('[custom-provider] error name:', error?.name)
      console.error('[custom-provider] error message:', error?.message)
      throw error
    }
  }

  async streamChatWithThinking(
    messages: ChatMessage[],
    config: AIConfig,
    onChunk: (chunk: string) => void | Promise<void>,
    onThinking: (thinking: string) => void | Promise<void>
  ): Promise<void> {
    console.log('[custom-provider] streamChatWithThinking() called')

    try {
      console.log('[custom-provider] Calling chat()...')
      const response = await this.chat(messages, config)
      console.log('[custom-provider] Got response:', response?.slice(0, 100))

      if (!response || typeof response !== 'string') {
        console.error('[custom-provider] Invalid response:', response)
        throw new Error('Invalid response from chat()')
      }

      // Try to parse as JSON (when Rust returns content + thinking)
      try {
        const parsed = JSON.parse(response)
        if (parsed.thinking) {
          console.log('[custom-provider] Streaming thinking first:', parsed.thinking.slice(0, 50))
          // Stream thinking first
          const thinkingChunks = parsed.thinking.split(/(?=\s+)/)
          for (const chunk of thinkingChunks) {
            if (chunk.trim()) {
              await onThinking(chunk)
              await new Promise(r => setTimeout(r, 5))
            }
          }
          // Then stream content
          if (parsed.content) {
            const contentChunks = parsed.content.split(/(?=\s+)/)
            for (const chunk of contentChunks) {
              if (chunk.trim()) {
                await onChunk(chunk)
                await new Promise(r => setTimeout(r, 10))
              }
            }
          }
        } else if (parsed.content) {
          // No thinking, just stream content
          const chunks = parsed.content.split(/(?=\s+)/)
          for (const chunk of chunks) {
            if (chunk.trim()) {
              await onChunk(chunk)
              await new Promise(r => setTimeout(r, 10))
            }
          }
        }
      } catch {
        // Not JSON, treat as plain content
        const chunks = response.split(/(?=\s+)/)
        for (const chunk of chunks) {
          if (chunk.trim()) {
            await onChunk(chunk)
            await new Promise(r => setTimeout(r, 10))
          }
        }
      }
    } catch (error: any) {
      console.error('[custom-provider] streamChatWithThinking error:', error)
      throw error
    }
  }
}

export const customProvider = new CustomProvider()

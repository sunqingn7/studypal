import { invoke } from '@tauri-apps/api/core'
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

export class LlamaCppProvider implements AIProvider {
  name = 'llama.cpp'

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
    onChunk: (chunk: string) => void
  ): Promise<void> {
    console.log('[llamacpp-provider] streamChat() called')

    try {
      // Tauri WebView doesn't support streaming fetch, use non-streaming and simulate
      console.log('[llamacpp-provider] Calling chat()...')
      const response = await this.chat(messages, config)
      console.log('[llamacpp-provider] Got response from chat(), type:', typeof response)
      console.log('[llamacpp-provider] Response string:', response)

      if (!response || typeof response !== 'string') {
        console.error('[llamacpp-provider] Invalid response:', response)
        throw new Error('Invalid response from chat()')
      }

      console.log('[llamacpp-provider] Starting to stream chunks...')

      // Simulate streaming by chunking the response
      const chunks = response.split(/(?=\s+)/)
      console.log('[llamacpp-provider] Split into', chunks.length, 'chunks')

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]
        if (chunk.trim()) {
          console.log(`[llamacpp-provider] Sending chunk ${i}: "${chunk.slice(0, 20)}..."`)
          onChunk(chunk)
        }
      }
      console.log('[llamacpp-provider] Streaming complete')
    } catch (error: any) {
      console.error('[llamacpp-provider] streamChat error:', error)
      console.error('[llamacpp-provider] error name:', error?.name)
      console.error('[llamacpp-provider] error message:', error?.message)
      throw error
    }
  }

  async streamChatWithThinking(
    messages: ChatMessage[],
    config: AIConfig,
    onChunk: (chunk: string) => void,
    onThinking: (thinking: string) => void
  ): Promise<void> {
    try {
      const response = await this.chat(messages, config)

      if (!response || typeof response !== 'string') {
        throw new Error('Invalid response from chat()')
      }

      // Try to parse as JSON (when Rust returns content + thinking)
      try {
        const parsed = JSON.parse(response)
        if (parsed.thinking) {
          onThinking(parsed.thinking)
        }
        if (parsed.content) {
          const chunks = parsed.content.split(/(?=\s+)/)
          for (const chunk of chunks) {
            if (chunk.trim()) {
              onChunk(chunk)
            }
          }
        }
      } catch {
        // Not JSON, treat as plain content
        const chunks = response.split(/(?=\s+)/)
        for (const chunk of chunks) {
          if (chunk.trim()) {
            onChunk(chunk)
          }
        }
      }
    } catch (error: any) {
      console.error('[llamacpp-provider] streamChatWithThinking error:', error)
      throw error
    }
  }
}

export const llamaCppProvider = new LlamaCppProvider()

import { invoke } from '@tauri-apps/api/core'
import type { AIConfig, ChatMessage } from '../../domain/models/ai-context'
import type { AIProvider } from './base-provider'

interface OllamaMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface ChatRequestPayload {
  endpoint: string
  model: string
  messages: OllamaMessage[]
  temperature?: number
  maxTokens?: number
  topP?: number
  extraHeaders?: Record<string, string>
  extraBody?: Record<string, unknown>
}

export class OllamaProvider implements AIProvider {
  name = 'Ollama'

  async chat(messages: ChatMessage[], config: AIConfig): Promise<string> {
    console.log('[ollama-provider] chat() called with:', {
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
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      topP: config.topP,
      extraHeaders: config.extraHeaders,
      extraBody: config.extraBody,
    }

    console.log('[ollama-provider] Calling invoke with payload:', JSON.stringify(payload, null, 2))

    try {
      console.log('[ollama-provider] About to call invoke...')
      const result = await invoke<string>('chat_with_provider', { request: payload, provider: 'ollama' })
      console.log('[ollama-provider] invoke returned!')
      console.log('[ollama-provider] result type:', typeof result)
      console.log('[ollama-provider] result:', result)

      // Force convert to string if needed
      const resultStr = String(result)
      console.log('[ollama-provider] converted to string, length:', resultStr.length)
      return resultStr
    } catch (error: any) {
      console.error('[ollama-provider] invoke failed with error:', error)
      console.error('[ollama-provider] error name:', error?.name)
      console.error('[ollama-provider] error message:', error?.message)
      console.error('[ollama-provider] error stack:', error?.stack)
      throw error
    }
  }

  async streamChat(
    messages: ChatMessage[],
    config: AIConfig,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    console.log('[ollama-provider] streamChat() called')

    try {
      // Tauri WebView doesn't support streaming fetch, use non-streaming and simulate
      console.log('[ollama-provider] Calling chat()...')
      const response = await this.chat(messages, config)
      console.log('[ollama-provider] Got response from chat(), type:', typeof response)
      console.log('[ollama-provider] Response string:', response)

      if (!response || typeof response !== 'string') {
        console.error('[ollama-provider] Invalid response:', response)
        throw new Error('Invalid response from chat()')
      }

      console.log('[ollama-provider] Starting to stream chunks...')

      // Simulate streaming by chunking the response
      const chunks = response.split(/(?=\s+)/)
      console.log('[ollama-provider] Split into', chunks.length, 'chunks')

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]
        if (chunk.trim()) {
          console.log(`[ollama-provider] Sending chunk ${i}: "${chunk.slice(0, 20)}..."`)
          onChunk(chunk)
        }
      }
      console.log('[ollama-provider] Streaming complete')
    } catch (error: any) {
      console.error('[ollama-provider] streamChat error:', error)
      console.error('[ollama-provider] error name:', error?.name)
      console.error('[ollama-provider] error message:', error?.message)
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
      try {
        const parsed = JSON.parse(response)
        if (parsed.thinking) onThinking(parsed.thinking)
        if (parsed.content) {
          parsed.content.split(/(?=\s+)/).forEach((chunk: string) => {
            if (chunk.trim()) onChunk(chunk)
          })
        }
      } catch {
        response.split(/(?=\s+)/).forEach((chunk: string) => {
          if (chunk.trim()) onChunk(chunk)
        })
      }
    } catch (error: any) {
      console.error('[ollama-provider] streamChatWithThinking error:', error)
      throw error
    }
  }
}

export const ollamaProvider = new OllamaProvider()

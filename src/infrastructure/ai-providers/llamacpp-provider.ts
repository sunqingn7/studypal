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
    }

    console.log('[llamacpp-provider] Calling invoke with payload:', JSON.stringify(payload, null, 2))

    try {
      console.log('[llamacpp-provider] About to call invoke...')
      const result = await invoke<string>('chat_with_ai', { request: payload })
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
    onChunk: (chunk: string) => void,
    signal?: AbortSignal
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

      // Check if aborted before processing
      if (signal?.aborted) {
        console.log('[llamacpp-provider] Aborted before processing')
        throw new Error('Chat aborted')
      }

      console.log('[llamacpp-provider] Starting to stream chunks...')

      // Simulate streaming by chunking the response
      const chunks = response.split(/(?=\s+)/)
      console.log('[llamacpp-provider] Split into', chunks.length, 'chunks')

      for (let i = 0; i < chunks.length; i++) {
        // Check abort signal
        if (signal?.aborted) {
          console.log('[llamacpp-provider] Aborted during streaming')
          throw new Error('Chat aborted')
        }

        const chunk = chunks[i]
        if (chunk.trim()) {
          console.log(`[llamacpp-provider] Sending chunk ${i}: "${chunk.slice(0, 20)}..."`)
          onChunk(chunk)
        }
      }
      console.log('[llamacpp-provider] Streaming complete')
    } catch (error: any) {
      if (error.name === 'AbortError' || error.message === 'Chat aborted') {
        console.log('[llamacpp-provider] Chat was aborted')
        throw error
      }
      console.error('[llamacpp-provider] streamChat error:', error)
      console.error('[llamacpp-provider] error name:', error?.name)
      console.error('[llamacpp-provider] error message:', error?.message)
      throw error
    }
  }
}

export const llamaCppProvider = new LlamaCppProvider()

import { AIConfig, ChatMessage } from '../../domain/models/ai-context'
import { AIProvider } from './base-provider'

interface LlamaCppMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface LlamaCppRequest {
  model: string
  messages: LlamaCppMessage[]
  stream: boolean
}

interface LlamaCppResponse {
  choices: Array<{
    delta?: {
      content?: string
    }
    message?: {
      content: string
    }
  }>
}

export class LlamaCppProvider implements AIProvider {
  name = 'llama.cpp'

  async chat(messages: ChatMessage[], config: AIConfig): Promise<string> {
    const url = `${config.endpoint}/v1/chat/completions`
    
    const payload: LlamaCppRequest = {
      model: config.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      stream: false,
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error(`LLama.cpp API error: ${response.status} ${response.statusText}`)
    }

    const data: LlamaCppResponse = await response.json()
    
    if (data.choices && data.choices.length > 0) {
      return data.choices[0].message?.content || data.choices[0].delta?.content || ''
    }

    return ''
  }

  async streamChat(
    messages: ChatMessage[],
    config: AIConfig,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const url = `${config.endpoint}/v1/chat/completions`
    
    const payload: LlamaCppRequest = {
      model: config.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      stream: true,
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error(`LLama.cpp API error: ${response.status} ${response.statusText}`)
    }

    if (!response.body) {
      throw new Error('No response body')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6)
          if (data === '[DONE]') {
            return
          }
          try {
            const parsed: LlamaCppResponse = JSON.parse(data)
            const content = parsed.choices?.[0]?.delta?.content
            if (content) {
              onChunk(content)
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  }
}

export const llamaCppProvider = new LlamaCppProvider()

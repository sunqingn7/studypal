import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { AIConfig, ChatMessage } from '../../domain/models/ai-context'
import type { AIProvider } from './base-provider'
import { MCPTool } from '../../domain/models/plugin'
import { mcpToolToOpenAISchema } from './tool-calling'
import type { ChatWithToolsResult, ToolCall } from './tool-calling'

interface OpenRouterMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface ChatRequestPayload {
  endpoint: string
  model: string
  messages: OpenRouterMessage[]
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

export class OpenRouterProvider implements AIProvider {
  name = 'OpenRouter'

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
      extraHeaders: {
        'HTTP-Referer': window.location.origin,
        'X-Title': 'StudyPal',
        ...config.extraHeaders,
      },
      extraBody: config.extraBody,
    }

    try {
      const result = await invoke<string>('chat_with_provider', { request: payload, provider: 'openai' })
      return String(result)
    } catch (error) {
      console.error('[openrouter-provider] invoke failed with error:', error)
      
      const errorStr = String(error)
      if (errorStr.includes('404') && errorStr.includes('guardrail')) {
        throw new Error(
          'OpenRouter: No endpoints available for this model. This model may not be accessible with your current privacy settings. ' +
          'Please check: https://openrouter.ai/settings/privacy or try a different model.'
        )
      }
      if (errorStr.includes('404')) {
        throw new Error(
          `OpenRouter: Model "${config.model}" not found or not accessible. ` +
          'Please verify the model ID is correct and your API key has access to this model.'
        )
      }
      if (errorStr.includes('401') || errorStr.includes('Unauthorized')) {
        throw new Error(
          'OpenRouter: Authentication failed. Please check your API key.'
        )
      }
      
      throw error
    }
  }

  async streamChat(
    messages: ChatMessage[],
    config: AIConfig,
    onChunk: (chunk: string) => void | Promise<void>
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
      extraHeaders: {
        'HTTP-Referer': window.location.origin,
        'X-Title': 'StudyPal',
        ...config.extraHeaders,
      },
      extraBody: config.extraBody,
    }

    let unlisten: UnlistenFn | null = null
    let fullContent = ''

    try {
      const streamId = `openrouter-stream-${crypto.randomUUID()}`
      const payloadWithStream = { ...payload, streamEvent: streamId }

      unlisten = await listen<StreamChunkData>(streamId, (event) => {
        if (event.payload.done) {
          return
        }

        if (event.payload.content) {
          fullContent += event.payload.content
          onChunk(event.payload.content)
        }
      })

      await invoke<void>('stream_chat_with_provider', { request: payloadWithStream, provider: 'openai' })
    } catch (error) {
      console.error('[openrouter-provider] streamChat error:', error)
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
      extraHeaders: {
        'HTTP-Referer': window.location.origin,
        'X-Title': 'StudyPal',
        ...config.extraHeaders,
      },
      extraBody: config.extraBody,
    }

    let unlisten: UnlistenFn | null = null
    let fullContent = ''
    let fullThinking = ''

    try {
      const streamId = `openrouter-stream-${crypto.randomUUID()}`
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
          fullContent += event.payload.content
          onChunk(event.payload.content)
        }
      })

      await invoke<void>('stream_chat_with_provider', { request: payloadWithStream, provider: 'openai' })
    } catch (error) {
      console.error('[openrouter-provider] streamChatWithThinking error:', error)
      throw error
    } finally {
      if (unlisten) {
        unlisten()
      }
    }
  }

  supportsNativeFunctionCalling(): boolean {
    return true
  }

  async chatWithTools(
    messages: ChatMessage[],
    config: AIConfig,
    tools: MCPTool[]
  ): Promise<ChatWithToolsResult> {
    const openaiTools = tools.map(tool => mcpToolToOpenAISchema(tool))

    const payload = {
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
        'HTTP-Referer': window.location.origin,
        'X-Title': 'StudyPal',
        ...config.extraHeaders,
      },
      extraBody: config.extraBody,
      tools: openaiTools,
    }

    try {
      const result = await invoke<{
        content?: string
        tool_calls?: Array<{
          id: string
          type: string
          function: {
            name: string
            arguments: string
          }
        }>
      }>('chat_with_tools', { request: payload, provider: 'openai' })

      const toolCalls: ToolCall[] = (result.tool_calls || []).map((tc) => ({
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments || '{}'),
      }))

      return {
        content: result.content || '',
        toolCalls,
      }
    } catch (error) {
      console.error('[openrouter-provider] chatWithTools error:', error)
      throw error
    }
  }

  async streamChatWithTools(
    messages: ChatMessage[],
    config: AIConfig,
    tools: MCPTool[],
    onChunk: (chunk: string) => void,
    onToolCall?: (toolCall: ToolCall) => void
  ): Promise<void> {
    const openaiTools = tools.map(tool => mcpToolToOpenAISchema(tool))

    const payload = {
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
        'HTTP-Referer': window.location.origin,
        'X-Title': 'StudyPal',
        ...config.extraHeaders,
      },
      extraBody: config.extraBody,
      tools: openaiTools,
    }

    let unlisten: UnlistenFn | null = null

    try {
      const streamId = `openrouter-tools-stream-${crypto.randomUUID()}`
      const payloadWithStream = { ...payload, streamEvent: streamId }

      unlisten = await listen<StreamChunkData>(streamId, (event) => {
        if (event.payload.done) {
          return
        }

        if (event.payload.content) {
          onChunk(event.payload.content)
        }

        if (event.payload.thinking && onToolCall) {
          try {
            const parsed = JSON.parse(event.payload.thinking)
            if (parsed.type === 'tool_call' && parsed.data) {
              const tc = parsed.data
              onToolCall({
                name: tc.function?.name || '',
                arguments: JSON.parse(tc.function?.arguments || '{}'),
              })
            }
          } catch {
            // Not a tool call JSON
          }
        }
      })

      await invoke<void>('stream_chat_with_tools', { request: payloadWithStream, provider: 'openai' })
    } catch (error) {
      console.error('[openrouter-provider] streamChatWithTools error:', error)
      throw error
    } finally {
      if (unlisten) {
        unlisten()
      }
    }
  }
}

export const openrouterProvider = new OpenRouterProvider()

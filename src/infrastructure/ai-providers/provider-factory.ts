import { AIProviderType } from '../../domain/models/ai-context'
import { AIProvider } from './base-provider'
import { llamaCppProvider } from './llamacpp-provider'
import { openaiProvider } from './openai-provider'
import { anthropicProvider } from './anthropic-provider'
import { ollamaProvider } from './ollama-provider'
import { vllmProvider } from './vllm-provider'
import { nvidiaProvider } from './nvidia-provider'
import { customProvider } from './custom-provider'

const providers: Record<AIProviderType, AIProvider> = {
  llamacpp: llamaCppProvider,
  openai: openaiProvider,
  anthropic: anthropicProvider,
  ollama: ollamaProvider,
  vllm: vllmProvider,
  nvidia: nvidiaProvider,
  custom: customProvider,
}

export function getProvider(providerType: AIProviderType): AIProvider {
  const provider = providers[providerType]
  if (!provider) {
    throw new Error(`Unknown provider type: ${providerType}`)
  }
  return provider
}

export function getProviderName(providerType: AIProviderType): string {
  return providers[providerType]?.name || providerType
}

export const AVAILABLE_PROVIDERS: { type: AIProviderType; name: string; description: string; requiresApiKey: boolean }[] = [
  {
    type: 'llamacpp',
    name: 'llama.cpp',
    description: 'Local server running llama.cpp (OpenAI-compatible)',
    requiresApiKey: false,
  },
  {
    type: 'ollama',
    name: 'Ollama',
    description: 'Local Ollama instance (OpenAI-compatible)',
    requiresApiKey: false,
  },
  {
    type: 'vllm',
    name: 'vLLM',
    description: 'Local vLLM server (OpenAI-compatible)',
    requiresApiKey: false,
  },
  {
    type: 'openai',
    name: 'OpenAI',
    description: 'OpenAI API (GPT-4, GPT-3.5)',
    requiresApiKey: true,
  },
  {
    type: 'anthropic',
    name: 'Anthropic',
    description: 'Anthropic API (Claude models)',
    requiresApiKey: true,
  },
  {
    type: 'nvidia',
    name: 'NVIDIA NIM',
    description: 'NVIDIA NIM API (Llama, Mistral, and other models)',
    requiresApiKey: true,
  },
  {
    type: 'custom',
    name: 'Custom',
    description: 'Custom OpenAI-compatible endpoint',
    requiresApiKey: true,
  },
]

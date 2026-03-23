import { invoke } from '@tauri-apps/api/core'

export interface ModelInfo {
  id: string
  name?: string
  description?: string
  contextWindow?: number
  maxTokens?: number
}

export interface FetchModelsRequest {
  endpoint: string
  apiKey?: string
}

export async function fetchAvailableModels(
  endpoint: string,
  apiKey?: string
): Promise<ModelInfo[]> {
  try {
    const result = await invoke<ModelInfo[]>('fetch_models', {
      request: {
        endpoint,
        api_key: apiKey,
      },
    })

    return result
  } catch (error: any) {
    console.error('[model-detector] Failed to fetch models:', error)
    throw error
  }
}

// Auto-detect and select model based on available models
export function autoSelectModel(
  models: ModelInfo[],
  currentModel?: string
): { model: string; isAutoSelected: boolean; maxTokens?: number } {
  if (models.length === 0) {
    return { model: currentModel || '', isAutoSelected: false }
  }

  // If current model exists in the list, keep it
  if (currentModel && models.some((m) => m.id === currentModel)) {
    const existingModel = models.find((m) => m.id === currentModel)
    return { 
      model: currentModel, 
      isAutoSelected: false,
      maxTokens: existingModel?.maxTokens || existingModel?.contextWindow
    }
  }

  // Auto-select first model if only one available
  if (models.length === 1) {
    return { 
      model: models[0].id, 
      isAutoSelected: true,
      maxTokens: models[0].maxTokens || models[0].contextWindow
    }
  }

  // Multiple models - don't auto-select, let user choose
  return { model: currentModel || '', isAutoSelected: false }
}

// Get max tokens for a specific model
export function getModelMaxTokens(models: ModelInfo[], modelId: string): number | undefined {
  const model = models.find((m) => m.id === modelId)
  return model?.maxTokens || model?.contextWindow
}

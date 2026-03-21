import {
  LLMTask,
  TaskResult,
  PoolProvider,
} from '../../domain/models/llm-pool'
import { ChatMessage } from '../../domain/models/ai-context'
import { getProvider } from '../../infrastructure/ai-providers/provider-factory'
import { useLLMPoolStore } from '../store/llm-pool-store'

export class TaskDistributor {
  private activeTasks: Map<string, AbortController> = new Map()
  private isProcessing: boolean = false

  // Always get fresh state to avoid stale references after Zustand set()
  private getStore(): ReturnType<typeof useLLMPoolStore.getState> {
    return useLLMPoolStore.getState()
  }

  // Submit and execute a task
  async submitTask(
    taskType: LLMTask['type'],
    prompt: string,
    context?: string,
    options?: {
      maxTokens?: number
      temperature?: number
      priority?: number
      timeout?: number
    }
  ): Promise<TaskResult> {
    const store = this.getStore()
    const taskId = store.submitTask({
      type: taskType,
      prompt,
      context,
      maxTokens: options?.maxTokens,
      temperature: options?.temperature,
      priority: options?.priority ?? 50,
      timeout: options?.timeout,
    } as Omit<LLMTask, 'id' | 'retryCount' | 'createdAt' | 'maxRetries'>)

    return this.executeTask(taskId)
  }

  // Execute a specific task
  private async executeTask(taskId: string): Promise<TaskResult> {
    const store = this.getStore()
    const pendingTask = store.pendingTasks.find((t) => t.id === taskId)
    if (!pendingTask) {
      throw new Error(`Task ${taskId} not found`)
    }

    // Select provider
    const provider = store.selectProviderForTask(pendingTask)
    if (!provider) {
      const error = 'No available providers in pool'
      store.failTask(taskId, error)
      return {
        taskId,
        providerId: '',
        success: false,
        content: '',
        latency: 0,
        error,
        timestamp: Date.now(),
      }
    }

    // Assign task
    store.assignTask(taskId, provider.id)

    // Create abort controller for timeout
    const abortController = new AbortController()
    this.activeTasks.set(taskId, abortController)

    const timeout = pendingTask.timeout || store.config.taskTimeout
    const timeoutId = setTimeout(() => {
      abortController.abort()
    }, timeout)

    const startTime = Date.now()

    try {
      const result = await this.callProvider(provider, pendingTask, abortController.signal)

      clearTimeout(timeoutId)
      const latency = Date.now() - startTime

      const taskResult: TaskResult = {
        taskId,
        providerId: provider.id,
        success: true,
        content: result,
        latency,
        timestamp: Date.now(),
      }

      this.getStore().completeTask(taskId, taskResult)
      this.getStore().updateProviderStats(provider.id, latency, true)
      this.activeTasks.delete(taskId)

      return taskResult
    } catch (error) {
      clearTimeout(timeoutId)
      const latency = Date.now() - startTime

      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.getStore().failTask(taskId, errorMessage)
      this.getStore().updateProviderStats(provider.id, latency, false)
      this.activeTasks.delete(taskId)

      return {
        taskId,
        providerId: provider.id,
        success: false,
        content: '',
        latency,
        error: errorMessage,
        timestamp: Date.now(),
      }
    }
  }

  // Call the provider
  private async callProvider(
    provider: PoolProvider,
    task: LLMTask,
    signal: AbortSignal
  ): Promise<string> {
    const aiProvider = getProvider(provider.config.provider)
    if (!aiProvider) {
      throw new Error('Provider not available')
    }

    // Build messages
    const messages: ChatMessage[] = []

    // Add system prompt if configured
    if (provider.config.systemPrompt) {
      messages.push({
        id: crypto.randomUUID(),
        role: 'system',
        content: provider.config.systemPrompt,
        timestamp: Date.now(),
      })
    }

    // Add context if provided
    if (task.context) {
      messages.push({
        id: crypto.randomUUID(),
        role: 'user',
        content: `Context:\n${task.context}`,
        timestamp: Date.now(),
      })
    }

    // Add main prompt
    messages.push({
      id: crypto.randomUUID(),
      role: 'user',
      content: task.prompt,
      timestamp: Date.now(),
    })

    // Check for abort
    if (signal.aborted) {
      throw new Error('Task aborted')
    }

    // Call the provider
    const config = {
      ...provider.config,
      maxTokens: task.maxTokens || provider.config.maxTokens,
      temperature: task.temperature ?? provider.config.temperature ?? 0.7,
    }

    // For streaming support, we could use streamChat here
    // For now, use simple chat
    const response = await aiProvider.chat(messages, config)

    return response
  }

  // Cancel a task
  cancelTask(taskId: string): void {
    const controller = this.activeTasks.get(taskId)
    if (controller) {
      controller.abort()
      this.activeTasks.delete(taskId)
    }
  }

  // Process all pending tasks
  async processPendingTasks(): Promise<void> {
    if (this.isProcessing) return
    this.isProcessing = true

    try {
      while (this.getStore().pendingTasks.length > 0) {
        const task = this.getStore().pendingTasks[0]
        if (task && task.status === 'pending') {
          await this.executeTask(task.id)
        } else {
          break
        }
      }
    } finally {
      this.isProcessing = false
    }
  }

  // Start background processing
  startBackgroundProcessing(intervalMs: number = 1000): () => void {
    const intervalId = setInterval(() => {
      this.processPendingTasks()
    }, intervalMs)

    return () => clearInterval(intervalId)
  }

  // Get active task count
  getActiveTaskCount(): number {
    return this.activeTasks.size
  }

  // Cleanup
  destroy(): void {
    this.activeTasks.forEach((controller) => {
      controller.abort()
    })
    this.activeTasks.clear()
  }
}

// Factory function to create distributor
export function createTaskDistributor(): TaskDistributor {
  return new TaskDistributor()
}

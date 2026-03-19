import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  PoolProvider,
  LLMTask,
  TaskResult,
  TrackedTask,
  PoolStatistics,
  PoolConfig,
  DEFAULT_POOL_CONFIG,
} from '../../domain/models/llm-pool'
import { AIConfig } from '../../domain/models/ai-context'

export interface LLMPoolState {
  // Providers in the pool
  providers: PoolProvider[]

  // Tasks
  pendingTasks: TrackedTask[]
  runningTasks: TrackedTask[]
  completedTasks: TrackedTask[]

  // Configuration
  config: PoolConfig

  // Health check state
  isHealthChecking: boolean
  lastHealthCheck: number

  // Actions
  addProvider: (name: string, config: AIConfig, nickname?: string) => string
  removeProvider: (id: string) => void
  updateProvider: (id: string, updates: Partial<PoolProvider>) => void
  enableProvider: (id: string) => void
  disableProvider: (id: string) => void
  setProviderHealth: (id: string, isHealthy: boolean, latency?: number, error?: string) => void
  setPrimaryProvider: (id: string) => void
  getPrimaryProvider: () => PoolProvider | undefined

  // Task management
  submitTask: (task: Omit<LLMTask, 'id' | 'retryCount' | 'createdAt' | 'maxRetries'>) => string
  assignTask: (taskId: string, providerId: string) => void
  completeTask: (taskId: string, result: TaskResult) => void
  failTask: (taskId: string, error: string) => void
  retryTask: (taskId: string) => void

  // Health check
  startHealthCheck: () => void
  stopHealthCheck: () => void

  // Pool management
  getHealthyProviders: () => PoolProvider[]
  getAvailableProviders: () => PoolProvider[] // Healthy and not at capacity
  selectProviderForTask: (task: LLMTask) => PoolProvider | null
  updateProviderStats: (providerId: string, latency: number, success: boolean) => void

  // Statistics
  getStatistics: () => PoolStatistics

  // Configuration
  updateConfig: (config: Partial<PoolConfig>) => void

  // Clear history
  clearCompletedTasks: () => void
}

export const useLLMPoolStore = create<LLMPoolState>()(
  persist(
    (set, get) => ({
      providers: [],
      pendingTasks: [],
      runningTasks: [],
      completedTasks: [],
      config: DEFAULT_POOL_CONFIG,
      isHealthChecking: false,
      lastHealthCheck: 0,

    addProvider: (name: string, config: AIConfig, nickname?: string) => {
      const id = crypto.randomUUID()
      const state = get()
      // If this is the first provider, make it primary
      const isPrimary = state.providers.length === 0
      const provider: PoolProvider = {
        id,
        name,
        nickname,
        config,
        isHealthy: false, // Will be checked
        lastHealthCheck: 0,
        priority: 50,
        maxConcurrentTasks: 3,
        currentTasks: 0,
        totalTasksCompleted: 0,
        averageLatency: 0,
        failureCount: 0,
        isEnabled: true,
        isPrimary,
      }
      set((state) => ({
        providers: [...state.providers, provider],
      }))
      return id
    },

      removeProvider: (id: string) => {
        set((state) => ({
          providers: state.providers.filter((p) => p.id !== id),
        }))
      },

      updateProvider: (id: string, updates: Partial<PoolProvider>) => {
        set((state) => ({
          providers: state.providers.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        }))
      },

      enableProvider: (id: string) => {
        get().updateProvider(id, { isEnabled: true })
      },

      disableProvider: (id: string) => {
        get().updateProvider(id, { isEnabled: false })
      },

    setProviderHealth: (id: string, isHealthy: boolean, latency?: number, _error?: string) => {
      const provider = get().providers.find((p) => p.id === id)
      if (!provider) return

      const updates: Partial<PoolProvider> = {
        isHealthy,
        lastHealthCheck: Date.now(),
      }

      if (latency !== undefined) {
        updates.averageLatency = latency
      }

      if (!isHealthy) {
        updates.failureCount = provider.failureCount + 1
      } else {
        updates.failureCount = 0
      }

      get().updateProvider(id, updates)
    },

    setPrimaryProvider: (id: string) => {
      set((state) => ({
        providers: state.providers.map((p) => ({
          ...p,
          isPrimary: p.id === id,
        })),
      }))
    },

    getPrimaryProvider: () => {
      const state = get()
      // First try to find explicitly set primary provider
      const primary = state.providers.find((p) => p.isPrimary && p.isEnabled)
      if (primary) return primary
      // Otherwise return the first enabled provider (top of the list)
      return state.providers.find((p) => p.isEnabled)
    },

      submitTask: (task: Omit<LLMTask, 'id' | 'retryCount' | 'createdAt' | 'maxRetries'>) => {
        const id = crypto.randomUUID()
        const trackedTask: TrackedTask = {
          ...task,
          id,
          retryCount: 0,
          maxRetries: get().config.maxRetries,
          createdAt: Date.now(),
          status: 'pending',
        }
        set((state) => ({
          pendingTasks: [...state.pendingTasks, trackedTask],
        }))
        return id
      },

      assignTask: (taskId: string, providerId: string) => {
        set((state) => {
          const task = state.pendingTasks.find((t) => t.id === taskId)
          if (!task) return state

          const updatedTask: TrackedTask = {
            ...task,
            status: 'running',
            assignedProviderId: providerId,
            startedAt: Date.now(),
          }

          // Update provider current tasks
          const updatedProviders = state.providers.map((p) =>
            p.id === providerId ? { ...p, currentTasks: p.currentTasks + 1 } : p
          )

          return {
            pendingTasks: state.pendingTasks.filter((t) => t.id !== taskId),
            runningTasks: [...state.runningTasks, updatedTask],
            providers: updatedProviders,
          }
        })
      },

      completeTask: (taskId: string, result: TaskResult) => {
        set((state) => {
          const task = state.runningTasks.find((t) => t.id === taskId)
          if (!task) return state

          const completedTask: TrackedTask = {
            ...task,
            status: 'completed',
            completedAt: Date.now(),
            result,
          }

          // Update provider stats
          const updatedProviders = state.providers.map((p) => {
            if (p.id === task.assignedProviderId) {
              return {
                ...p,
                currentTasks: Math.max(0, p.currentTasks - 1),
                totalTasksCompleted: p.totalTasksCompleted + 1,
              }
            }
            return p
          })

          return {
            runningTasks: state.runningTasks.filter((t) => t.id !== taskId),
            completedTasks: [completedTask, ...state.completedTasks.slice(0, 99)], // Keep last 100
            providers: updatedProviders,
          }
        })
      },

      failTask: (taskId: string, error: string) => {
        set((state) => {
          const task = state.runningTasks.find((t) => t.id === taskId)
          if (!task) return state

          // Check if we should retry
          if (task.retryCount < task.maxRetries) {
            const retryTask: TrackedTask = {
              ...task,
              status: 'retrying',
              retryCount: task.retryCount + 1,
            }

            // Update provider current tasks
            const updatedProviders = state.providers.map((p) =>
              p.id === task.assignedProviderId
                ? { ...p, currentTasks: Math.max(0, p.currentTasks - 1) }
                : p
            )

            return {
              runningTasks: state.runningTasks.filter((t) => t.id !== taskId),
              pendingTasks: [retryTask, ...state.pendingTasks],
              providers: updatedProviders,
            }
          }

          // Max retries reached, mark as failed
          const failedTask: TrackedTask = {
            ...task,
            status: 'failed',
            completedAt: Date.now(),
            result: {
              taskId,
              providerId: task.assignedProviderId || '',
              success: false,
              content: '',
              latency: Date.now() - (task.startedAt || task.createdAt),
              error,
              timestamp: Date.now(),
            },
          }

          // Update provider current tasks
          const updatedProviders = state.providers.map((p) =>
            p.id === task.assignedProviderId
              ? { ...p, currentTasks: Math.max(0, p.currentTasks - 1) }
              : p
          )

          return {
            runningTasks: state.runningTasks.filter((t) => t.id !== taskId),
            completedTasks: [failedTask, ...state.completedTasks.slice(0, 99)],
            providers: updatedProviders,
          }
        })
      },

      retryTask: (taskId: string) => {
        set((state) => {
          const task = state.completedTasks.find((t) => t.id === taskId && t.status === 'failed')
          if (!task) return state

          const retryTask: TrackedTask = {
            ...task,
            status: 'pending',
            retryCount: task.retryCount + 1,
            assignedProviderId: undefined,
            startedAt: undefined,
            completedAt: undefined,
            result: undefined,
          }

          return {
            completedTasks: state.completedTasks.filter((t) => t.id !== taskId),
            pendingTasks: [retryTask, ...state.pendingTasks],
          }
        })
      },

      startHealthCheck: () => {
        set({ isHealthChecking: true })
      },

      stopHealthCheck: () => {
        set({ isHealthChecking: false })
      },

      getHealthyProviders: () => {
        return get().providers.filter((p) => p.isHealthy && p.isEnabled)
      },

      getAvailableProviders: () => {
        return get().providers.filter(
          (p) => p.isHealthy && p.isEnabled && p.currentTasks < p.maxConcurrentTasks
        )
      },

      selectProviderForTask: (_task: LLMTask) => {
        const available = get().getAvailableProviders()
        if (available.length === 0) return null

        const config = get().config

        if (config.randomSelection) {
          // Random selection
          return available[Math.floor(Math.random() * available.length)]
        }

        // Score-based selection
        let candidates = available

        // Sort by priority (descending)
        candidates.sort((a, b) => b.priority - a.priority)

        if (config.preferLowLatency) {
          // Among same priority, prefer lower latency
          const bestPriority = candidates[0].priority
          const samePriority = candidates.filter((p) => p.priority === bestPriority)
          samePriority.sort((a, b) => a.averageLatency - b.averageLatency)
          return samePriority[0]
        }

        return candidates[0]
      },

      updateProviderStats: (providerId: string, latency: number, success: boolean) => {
        const provider = get().providers.find((p) => p.id === providerId)
        if (!provider) return

        // Update average latency with exponential moving average
        const alpha = 0.3 // Weight for new measurement
        const newLatency = provider.averageLatency === 0
          ? latency
          : provider.averageLatency * (1 - alpha) + latency * alpha

        get().updateProvider(providerId, {
          averageLatency: Math.round(newLatency),
          ...(success ? {} : { failureCount: provider.failureCount + 1 }),
        })
      },

      getStatistics: () => {
        const state = get()
        const healthy = state.providers.filter((p) => p.isHealthy && p.isEnabled).length
        const busy = state.providers.filter((p) => p.currentTasks > 0).length
        const totalCompleted = state.completedTasks.length
        const avgLatency = totalCompleted > 0
          ? state.completedTasks.reduce((sum, t) => sum + (t.result?.latency || 0), 0) / totalCompleted
          : 0

        return {
          totalProviders: state.providers.length,
          healthyProviders: healthy,
          busyProviders: busy,
          totalTasks: state.pendingTasks.length + state.runningTasks.length + state.completedTasks.length,
          pendingTasks: state.pendingTasks.length,
          runningTasks: state.runningTasks.length,
          completedTasks: state.completedTasks.filter((t) => t.status === 'completed').length,
          failedTasks: state.completedTasks.filter((t) => t.status === 'failed').length,
          averageLatency: Math.round(avgLatency),
        }
      },

      updateConfig: (config: Partial<PoolConfig>) => {
        set((state) => ({
          config: { ...state.config, ...config },
        }))
      },

      clearCompletedTasks: () => {
        set({ completedTasks: [] })
      },
    }),
    {
      name: 'llm-pool-store',
      partialize: (state) => ({
        providers: state.providers,
        config: state.config,
      }),
    }
  )
)

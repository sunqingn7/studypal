import { create } from 'zustand'
import { Topic, TopicState } from '../../domain/models/topic'

interface TopicStore extends TopicState {
  addTopic: (name: string, description?: string) => void
  removeTopic: (id: string) => void
  updateTopic: (id: string, updates: Partial<Omit<Topic, 'id' | 'createdAt'>>) => void
  setActiveTopic: (id: string | null) => void
  addFileToTopic: (fileId: string, topicId: string) => void
  removeFileFromTopic: (fileId: string, topicId: string) => void
  getTopicsForFile: (fileId: string) => Topic[]
}

export const useTopicStore = create<TopicStore>((set, get) => ({
  topics: [],
  fileTopicMappings: [],
  activeTopicId: null,

  addTopic: (name, description) => {
    const newTopic: Topic = {
      id: crypto.randomUUID(),
      name,
      description,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    set((state) => ({ topics: [...state.topics, newTopic] }))
  },

  removeTopic: (id) => {
    set((state) => ({
      topics: state.topics.filter((t) => t.id !== id),
      fileTopicMappings: state.fileTopicMappings.filter((m) => m.topicId !== id),
      activeTopicId: state.activeTopicId === id ? null : state.activeTopicId,
    }))
  },

  updateTopic: (id, updates) => {
    set((state) => ({
      topics: state.topics.map((t) =>
        t.id === id ? { ...t, ...updates, updatedAt: Date.now() } : t
      ),
    }))
  },

  setActiveTopic: (id) => {
    set({ activeTopicId: id })
  },

  addFileToTopic: (fileId, topicId) => {
    const exists = get().fileTopicMappings.some(
      (m) => m.fileId === fileId && m.topicId === topicId
    )
    if (!exists) {
      set((state) => ({
        fileTopicMappings: [...state.fileTopicMappings, { fileId, topicId }],
      }))
    }
  },

  removeFileFromTopic: (fileId, topicId) => {
    set((state) => ({
      fileTopicMappings: state.fileTopicMappings.filter(
        (m) => !(m.fileId === fileId && m.topicId === topicId)
      ),
    }))
  },

  getTopicsForFile: (fileId) => {
    const { topics, fileTopicMappings } = get()
    const topicIds = fileTopicMappings
      .filter((m) => m.fileId === fileId)
      .map((m) => m.topicId)
    return topics.filter((t) => topicIds.includes(t.id))
  },
}))

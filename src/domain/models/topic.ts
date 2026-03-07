export interface Topic {
  id: string
  name: string
  description?: string
  createdAt: number
  updatedAt: number
}

export interface FileTopicMapping {
  fileId: string
  topicId: string
}

export interface TopicState {
  topics: Topic[]
  fileTopicMappings: FileTopicMapping[]
  activeTopicId: string | null
}

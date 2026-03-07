export interface Note {
  id: string
  title: string
  content: string
  type: 'note' | 'ai-note'
  topicId: string | null
  createdAt: number
  updatedAt: number
}

export interface TopicNote extends Note {
  type: 'note' | 'ai-note'
}

export interface GlobalNote extends Note {
  type: 'note' | 'ai-note'
  topicId: null
}

export interface NoteTab {
  id: string
  noteId: string
  title: string
  isActive: boolean
}

export interface NoteState {
  tabs: NoteTab[]
  activeTabId: string | null
  globalNotes: GlobalNote[]
  topicNotes: Map<string, TopicNote[]>
}

import { create } from 'zustand'
import { FileMetadata, FileState, getFileType } from '../../domain/models/file'

interface FileStore extends FileState {
  currentPage: number
  setCurrentFile: (file: FileMetadata | null) => void
  setCurrentPage: (page: number) => void
  addToHistory: (file: FileMetadata) => void
  removeFromHistory: (fileId: string) => void
  clearHistory: () => void
  updateFileMetadata: (fileId: string, updates: Partial<FileMetadata>) => void
  saveCurrentDocumentState: (noteStore: any, aiChatStore: any, sessionStore: any, fileToSave?: { path: string }) => void
  loadDocumentState: (documentId: string, noteStore: any, aiChatStore: any, sessionStore: any) => void
}

export const useFileStore = create<FileStore>((set, get) => ({
  currentFile: null,
  currentPage: 1,
  fileHistory: [],

   saveCurrentDocumentState: (noteStore, aiChatStore, sessionStore, fileToSave?: { path: string }) => {
     // If fileToSave is provided, use it; otherwise use current file
     const currentFile = fileToSave || get().currentFile
     if (!currentFile) return

     try {
       // Get current state
       const { tabs, globalNotes, topicNotes } = noteStore
       
       console.log('[FileStore] Saving notes for:', currentFile.path, 'globalNotes count:', globalNotes.length)
       if (globalNotes.length > 0) {
         console.log('[FileStore] First note content length:', globalNotes[0].content?.length)
         console.log('[FileStore] First note content:', globalNotes[0].content?.substring(0, 100))
       }
       
       // Create a clean state for this file - notes keep their original topicId
       // The file path is used as the key in sessionStore.documentNotes
       const fileNoteState = {
         tabs,
         globalNotes: globalNotes,
         topicNotes: Array.from(topicNotes.entries()),
       }
       
       const chatState = aiChatStore.serialize()
       
       // Use file path as the key for persistence
       sessionStore.setDocumentNotes(currentFile.path, fileNoteState)
       sessionStore.setDocumentChat(currentFile.path, chatState)
       console.log('[FileStore] Saved state for:', currentFile.path, 'globalNotes:', globalNotes.length, 'topicNotes entries:', Array.from(topicNotes.entries()).length)
     } catch (e) {
       console.error('[FileStore] Error saving document state:', e)
     }
   },

   loadDocumentState: (documentId, noteStore, aiChatStore, sessionStore) => {
     if (!documentId) return

     try {
       console.log('[FileStore] Loading state for:', documentId)
       const noteData = sessionStore.getDocumentNotes(documentId)
       const chatData = sessionStore.getDocumentChat(documentId)

       if (noteData) {
         // Process globalNotes
         const globalNotes = noteData.globalNotes?.map((note: any) => ({
           ...note,
           id: crypto.randomUUID(),
           topicId: null,
         })) || []
         
         // Process topicNotes (convert from [string, TopicNote[]][] back to Map<string, TopicNote[]>)
         const topicNotesMap = new Map<string, any>()
         const topicNotesArray = noteData.topicNotes || []
         topicNotesArray.forEach(([topicId, notes]: [string, any[]]) => {
           const processedNotes = notes.map((note: any) => ({
             ...note,
             id: crypto.randomUUID(),
           }))
           topicNotesMap.set(topicId, processedNotes)
         })
         
         // Map old tab noteIds to new noteIds (for both global and topic notes)
         const noteIdMap = new Map<string, string>()
         noteData.globalNotes?.forEach((note: any, idx: number) => {
           noteIdMap.set(note.id, globalNotes[idx]?.id || crypto.randomUUID())
         })
         topicNotesArray.forEach(([topicId, notes]: [string, any[]]) => {
           notes.forEach((note: any, idx: number) => {
             const processedNotes = topicNotesMap.get(topicId)
             if (processedNotes && processedNotes[idx]) {
               noteIdMap.set(note.id, processedNotes[idx].id)
             }
           })
         })
         
         // Update tabs to use new note IDs
         const newTabs = (noteData.tabs || []).map((tab: any) => ({
           ...tab,
           id: crypto.randomUUID(),
           noteId: noteIdMap.get(tab.noteId) || crypto.randomUUID(),
         }))
         
         // Convert topicNotesMap back to the format expected by note store ([string, TopicNote[]][])
         const topicNotesForStore: [string, any][] = Array.from(topicNotesMap.entries())
         
         noteStore.deserialize({
           tabs: newTabs,
           globalNotes: globalNotes,
           topicNotes: topicNotesForStore,
         })
         console.log('[FileStore] Loaded notes, count:', globalNotes.length + (topicNotesArray.reduce((sum: number, [, notes]: [string, any[]]) => sum + notes.length, 0)), 'new IDs created')
       } else {
         noteStore.clear()
         noteStore.addTab(null, 'Note-1')
         console.log('[FileStore] Created new note')
       }

       if (chatData && chatData.tabs && chatData.tabs.length > 0) {
         // Also create new chat tabs with new IDs
         const newChatTabs = chatData.tabs.map((tab: any) => ({
           ...tab,
           id: crypto.randomUUID(),
         }))
         
         aiChatStore.deserialize({
           tabs: newChatTabs,
         })
         console.log('[FileStore] Loaded chat, tabs:', newChatTabs.length)
       } else {
         aiChatStore.clear()
         aiChatStore.addTab('Chat 1')
         console.log('[FileStore] Created new chat')
       }
     } catch (e) {
       console.error('[FileStore] Error loading document state:', e)
       noteStore.clear()
       aiChatStore.clear()
     }
   },

  setCurrentFile: (file) => {
    if (file) {
      get().addToHistory(file)
    }
    set({ currentFile: file, currentPage: 1 })
  },

  setCurrentPage: (page) => {
    set({ currentPage: page })
  },

  addToHistory: (file) => {
    set((state) => {
      const exists = state.fileHistory.some((f) => f.id === file.id)
      if (exists) {
        return {
          fileHistory: state.fileHistory.map((f) =>
            f.id === file.id ? { ...f, lastOpened: Date.now() } : f
          ),
        }
      }
      return { fileHistory: [file, ...state.fileHistory].slice(0, 50) }
    })
  },

  removeFromHistory: (fileId) => {
    set((state) => ({
      fileHistory: state.fileHistory.filter((f) => f.id !== fileId),
    }))
  },

  clearHistory: () => {
    set({ fileHistory: [] })
  },

  updateFileMetadata: (fileId, updates) => {
    set((state) => ({
      currentFile: state.currentFile?.id === fileId
        ? { ...state.currentFile, ...updates }
        : state.currentFile,
      fileHistory: state.fileHistory.map((f) =>
        f.id === fileId ? { ...f, ...updates } : f
      ),
    }))
  },
}))

export function createFileMetadata(path: string, name: string, size: number): FileMetadata {
  return {
    id: crypto.randomUUID(),
    name,
    path,
    type: getFileType(name),
    size,
    lastOpened: Date.now(),
  }
}

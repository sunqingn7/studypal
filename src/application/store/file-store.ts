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

    saveCurrentDocumentState: async (noteStore, aiChatStore, sessionStore, fileToSave?: { path: string }) => {
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

        // Prepare data for storage
        const allNotes: any[] = [...globalNotes];
        topicNotes.forEach((notes: any[]) => {
          allNotes.push(...notes);
        });

        // Get chat data from aiChatStore
        const chatState = aiChatStore.serialize();
        const chatTabs: any[] = chatState.tabs.map((tab: any) => ({
          id: tab.id,
          title: tab.title,
          messages: tab.messages,
          isActive: tab.isActive
        }));

        // Import Tauri invoke
        const { invoke } = await import('@tauri-apps/api/core');

        // Save chats to database
        await invoke('save_chats', {
          documentPath: currentFile.path,
          tabs: chatTabs
        });

        // Save notes to database
        const notesForDb = allNotes.map(note => ({
          id: note.id,
          title: note.title,
          content: note.content,
          noteType: note.type,
          topicId: note.topicId || null,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt
        }));
        await invoke('save_notes', {
          documentPath: currentFile.path,
          notes: notesForDb
        });

        // Save note tabs to database
        const noteTabsForDb = tabs.map((tab: any) => ({
          id: tab.id,
          noteId: tab.noteId,
          title: tab.title,
          isActive: tab.isActive
        }));
        await invoke('save_note_tabs', {
          documentPath: currentFile.path,
          tabs: noteTabsForDb
        });

        // Save each note as markdown file in StudyNotes directory
        for (const note of allNotes) {
          await invoke('save_note_as_markdown', {
            documentPath: currentFile.path,
            noteId: note.id,
            title: note.title,
            content: note.content,
            noteType: note.type,
            topicId: note.topicId || null,
            createdAt: note.createdAt,
            updatedAt: note.updatedAt
          });
        }

        console.log('[FileStore] Saved to database:', currentFile.path, 'chats:', chatTabs.length, 'notes:', allNotes.length);

        // Keep session storage as backup during transition
        const fileNoteState = {
          tabs,
          globalNotes: globalNotes,
          topicNotes: Array.from(topicNotes.entries()),
        }

        sessionStore.setDocumentNotes(currentFile.path, fileNoteState)
        sessionStore.setDocumentChat(currentFile.path, chatState)
      } catch (e) {
        console.error('[FileStore] Error saving document state:', e)
      }
    },

  loadDocumentState: async (documentId, noteStore, aiChatStore, sessionStore) => {
    if (!documentId) return

    try {
      console.log('[FileStore] Loading state for:', documentId)

      // Import Tauri invoke
      const { invoke } = await import('@tauri-apps/api/core');

      // Try to load from database first
      let chatData: { tabs: any[] } | null = null;
      let notesFromDb: any[] = [];
      let noteTabsFromDb: any[] = [];

      try {
        chatData = await invoke('load_chats', { documentPath: documentId });
        console.log('[FileStore] Loaded chats from database:', documentId);
      } catch (e) {
        console.log('[FileStore] No chats found in database for:', documentId);
      }

      try {
        notesFromDb = await invoke('load_notes', { documentPath: documentId });
        console.log('[FileStore] Loaded notes from database:', documentId, 'count:', notesFromDb.length);
      } catch (e) {
        console.log('[FileStore] No notes found in database for:', documentId);
      }

      try {
        noteTabsFromDb = await invoke('load_note_tabs', { documentPath: documentId });
        console.log('[FileStore] Loaded note tabs from database:', documentId, 'count:', noteTabsFromDb.length);
      } catch (e) {
        console.log('[FileStore] No note tabs found in database for:', documentId);
      }

      // If we have data from database, use it; otherwise fall back to session storage
      if (notesFromDb.length > 0 || noteTabsFromDb.length > 0) {
        // Process notes from database
        const globalNotes: any[] = [];
        const topicNotesMap = new Map<string, any[]>();

        notesFromDb.forEach((note: any) => {
          const processedNote = {
            id: note.id,
            title: note.title,
            content: note.content,
            type: note.noteType,
            topicId: note.topicId,
            createdAt: note.createdAt,
            updatedAt: note.updatedAt,
          };

          if (note.topicId) {
            const existing = topicNotesMap.get(note.topicId) || [];
            existing.push(processedNote);
            topicNotesMap.set(note.topicId, existing);
          } else {
            globalNotes.push(processedNote);
          }
        });

        // Process tabs from database
        const tabs = noteTabsFromDb.map((tab: any) => ({
          id: tab.id,
          noteId: tab.noteId,
          title: tab.title,
          isActive: tab.isActive,
        }));

        // Convert topicNotesMap to entries array
        const topicNotesForStore: [string, any][] = Array.from(topicNotesMap.entries());

        noteStore.deserialize({
          tabs: tabs.length > 0 ? tabs : [],
          globalNotes: globalNotes,
          topicNotes: topicNotesForStore,
        });
        console.log('[FileStore] Loaded notes from database:', documentId, 'globalNotes:', globalNotes.length, 'topicNotes:', topicNotesForStore.length);
      } else {
        // Fall back to session storage
        const noteData = sessionStore.getDocumentNotes(documentId)

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
          console.log('[FileStore] Loaded notes from session storage:', documentId, 'count:', globalNotes.length + (topicNotesArray.reduce((sum: number, [, notes]: [string, any[]]) => sum + notes.length, 0)), 'new IDs created')
        } else {
          noteStore.clear()
          noteStore.addTab(null, 'Note-1')
          console.log('[FileStore] Created new note')
        }
      }

      // Load chats (from database or session storage)
      if (chatData && chatData.tabs && chatData.tabs.length > 0) {
        aiChatStore.deserialize({
          tabs: chatData.tabs,
        })
        console.log('[FileStore] Loaded chat from database:', documentId, 'tabs:', chatData.tabs.length)
      } else {
        // Fall back to session storage for chats
        const chatDataFromSession = sessionStore.getDocumentChat(documentId)
        if (chatDataFromSession && chatDataFromSession.tabs && chatDataFromSession.tabs.length > 0) {
          // Create new chat tabs with new IDs
          const newChatTabs = chatDataFromSession.tabs.map((tab: any) => ({
            ...tab,
            id: crypto.randomUUID(),
          }))

          aiChatStore.deserialize({
            tabs: newChatTabs,
          })
          console.log('[FileStore] Loaded chat from session storage:', documentId, 'tabs:', newChatTabs.length)
        } else {
          aiChatStore.clear()
          aiChatStore.addTab('Chat 1')
          console.log('[FileStore] Created new chat')
        }
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

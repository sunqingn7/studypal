import { create } from 'zustand'
import { FileMetadata, FileState, getFileType } from '../../domain/models/file'
import { useNoteStore } from './note-store'
import { useAIChatStore } from './ai-chat-store'
import { useDocumentMetadataStore } from './document-metadata-store'

/**
 * STORAGE STRATEGY:
 * 
 * AI CHATS → SQLite Database ONLY
 * - Location: ~/.config/studypal/studypal.db (or ~/Library/Application Support/studypal/ on macOS)
 * - Table: 'chats' - stores all chat tabs as JSON
 * - Migration: from sessionStorage to database if needed
 * 
 * NOTES → Markdown Files ONLY (human-readable, directly editable)
 * - Location: StudyNotes/ subfolder next to the document
 * - Format: Markdown with frontmatter (id, type, topic_id, timestamps)
 * - Migration: from sessionStorage to markdown files if needed
 * 
 * Backup: sessionStorage (temporary, for migration only)
 * - Not used for primary storage
 * - Only used during migration from old version
 * 
 * SYSTEM DOCUMENT: "__system__"
 * - Used when no file is open to persist system/default notes and chat
 */

// System document ID for default notes/chat when no file is open
const SYSTEM_DOCUMENT_ID = '__system__'

interface FileStore extends FileState {
  currentPage: number
  setCurrentFile: (file: FileMetadata | null, preservePage?: boolean) => void
  setCurrentPage: (page: number) => void
  addToHistory: (file: FileMetadata) => void
  removeFromHistory: (fileId: string) => void
  clearHistory: () => void
  updateFileMetadata: (fileId: string, updates: Partial<FileMetadata>) => void
  saveCurrentDocumentState: (noteStore: any, aiChatStore: any, sessionStore: any, fileToSave?: { path: string }) => void
  loadDocumentState: (documentId: string, noteStore: any, aiChatStore: any, sessionStore?: any) => void
  saveSystemState: (noteStore: any, aiChatStore: any) => Promise<void>
  loadSystemState: (noteStore: any, aiChatStore: any) => Promise<void>
  saveDocumentMetadata: (documentPath: string, metadata: Partial<import('./document-metadata-store').DocumentMetadata>) => Promise<void>
  loadDocumentMetadata: (documentPath: string) => Promise<import('./document-metadata-store').DocumentMetadata | null>
}

export const useFileStore = create<FileStore>((set, get) => ({
  currentFile: null,
  currentPage: 1,
  fileHistory: [],

  saveDocumentMetadata: async (documentPath: string, metadata: Partial<import('./document-metadata-store').DocumentMetadata>) => {
    const metadataStore = useDocumentMetadataStore.getState()
    await metadataStore.saveMetadata({ documentPath, ...metadata })
  },

  loadDocumentMetadata: async (documentPath: string) => {
    const metadataStore = useDocumentMetadataStore.getState()
    return await metadataStore.loadMetadata(documentPath)
  },

  saveCurrentDocumentState: async (noteStore, aiChatStore, _sessionStore, fileToSave?: { path: string }) => {
      // If fileToSave is provided, use it; otherwise use current file
      const currentFile = fileToSave || get().currentFile
      if (!currentFile) return

      try {
        // Get current state
        const { tabs, globalNotes, topicNotes } = noteStore

        // Build noteId -> tab title mapping
        const noteIdToTitleMap = new Map<string, string>();
        tabs.forEach((tab: any) => {
          noteIdToTitleMap.set(tab.noteId, tab.title);
        });

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

        // ===== SAVE CHATS TO DATABASE =====
        await invoke('save_chats', {
          documentPath: currentFile.path,
          tabs: chatTabs
        });

        // Debug: verify save by listing all chats in DB
        try {
          await invoke('debug_list_all_chats');
        } catch (e) {
          // Debug operation, ignore errors
        }

        // ===== SAVE NOTES TO MARKDOWN FILES ONLY =====
        // Notes are saved as markdown files in StudyNotes/ folder (NOT to database)
        
        for (const note of allNotes) {
          // Use tab title for filename (what user sees), fall back to note.title, then to note.id
          const tabTitle = noteIdToTitleMap.get(note.id);
          const displayTitle = tabTitle || note.title || note.id;
          
          await invoke('save_note_as_markdown', {
            documentPath: currentFile.path,
            noteId: note.id,
            title: displayTitle,  // Use display title for filename
            content: note.content,
            noteType: note.type,
            topicId: note.topicId || null,
            createdAt: note.createdAt,
            updatedAt: note.updatedAt
          });

        }
    // ===== SAVE DOCUMENT METADATA =====
    const metadataStore = useDocumentMetadataStore.getState()
    // When saving a specific file (fileToSave), get its page from the metadata cache
    // because get().currentPage may already be set to the new file's page
    let pageToSave = get().currentPage
    if (fileToSave) {
      const cachedMetadata = metadataStore.getMetadata(fileToSave.path)
      if (cachedMetadata) {
        pageToSave = cachedMetadata.currentPage
      }
    }
    await metadataStore.saveMetadata({
      documentPath: currentFile.path,
      currentPage: pageToSave,
    })
      
      // Debug: verify save by listing all metadata
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('debug_list_all_metadata');
      } catch (e) {
        // Debug operation, ignore errors
      }

      } catch (e) {
        console.error('[FileStore] Error saving document state:', e)
      }
    },

  loadDocumentState: async (documentId, noteStore, aiChatStore, sessionStore?: any) => {
    if (!documentId) return

    try {
      // Import Tauri invoke
      const { invoke } = await import('@tauri-apps/api/core');

    // ===== LOAD DOCUMENT METADATA =====
    try {
      const metadataStore = useDocumentMetadataStore.getState()
      const metadata = await metadataStore.loadMetadata(documentId)
      if (metadata) {
        // Note: We don't update currentPage here - it should already be set
        // by setCurrentFile() or setCurrentPage() before loadDocumentState is called.
        // Loading document state (notes/chat) should not override the page number.
      }
        
        // Debug: list all metadata in database
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          await invoke('debug_list_all_metadata');
        } catch (e) {
          // Debug operation, ignore errors
        }
      } catch (e) {
        // Metadata not found is acceptable
      }

      // ===== LOAD CHATS FROM DATABASE =====
        let chatData: any[] = [];
        try {
          chatData = await invoke('load_chats', { documentPath: documentId });
        } catch (e) {
          chatData = [];
        }

        // ===== LOAD NOTES FROM MARKDOWN FILES =====
        let notesFromFiles: any[] = [];
        try {
          notesFromFiles = await invoke('load_all_notes_from_markdown', { documentPath: documentId });
        } catch (e) {
          notesFromFiles = [];
        }

        // If no data or empty data in database, check sessionStorage and migrate if needed
        const session = sessionStore?.getSession();
        const hasSessionNotes = session?.documentNotes?.[documentId];
        const hasSessionChats = session?.documentChat?.[documentId];
        
        // ===== MIGRATION: Notes from sessionStorage to Markdown files =====
        if (hasSessionNotes) {
          const noteData = hasSessionNotes as any;
          const sessionNoteIds = new Set<string>();
          
          // Collect all note IDs from session
          (noteData.globalNotes || []).forEach((note: any) => sessionNoteIds.add(note.id));
          if (noteData.topicNotes) {
            for (const [, notes] of noteData.topicNotes) {
              if (Array.isArray(notes)) {
                notes.forEach((note: any) => sessionNoteIds.add(note.id));
              }
            }
          }
          
          // Check if all session notes exist in markdown files
          const loadedNoteIds = new Set(notesFromFiles.map((n: any) => n.id));
          const needsMigration = Array.from(sessionNoteIds).some(id => !loadedNoteIds.has(id));
          
          if (needsMigration) {
            try {
              const { invoke } = await import('@tauri-apps/api/core');
              const allNotes: any[] = [...(noteData.globalNotes || [])];
              
              if (noteData.topicNotes) {
                for (const [, notes] of noteData.topicNotes) {
                  if (Array.isArray(notes)) {
                    allNotes.push(...notes);
                  }
                }
              }
              
              // Build noteId -> tab title mapping (same as save function)
              const noteIdToTitleMap = new Map<string, string>();
              if (noteData.tabs) {
                noteData.tabs.forEach((tab: any) => {
                  noteIdToTitleMap.set(tab.noteId, tab.title);
                });
              }
              
              // Save each note as markdown file
              for (const note of allNotes) {
                if (note.content && note.content.trim()) {
                  // Use tab title for filename (what user sees), fall back to note.title, then to note.id
                  const tabTitle = noteIdToTitleMap.get(note.id);
                  const displayTitle = tabTitle || note.title || note.id;
                  
                  await invoke('save_note_as_markdown', {
                    documentPath: documentId,
                    noteId: note.id,
                    title: displayTitle,
                    content: note.content,
                    noteType: note.type || 'note',
                    topicId: note.topicId || null,
                    createdAt: note.createdAt || Date.now(),
                    updatedAt: note.updatedAt || Date.now()
                  });
                }
              }
              
              // Reload from markdown files
              notesFromFiles = await invoke('load_all_notes_from_markdown', { documentPath: documentId });
            } catch (e) {
              console.error('[FileStore] Error migrating notes:', e);
            }
          }
        }
        
        // ===== MIGRATION: Chats from sessionStorage to Database =====
        if ((chatData.length === 0 || (chatData.length > 0 && chatData.every(tab => !tab.messages || tab.messages.length === 0))) && hasSessionChats) {
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            const chatDataSession = hasSessionChats as any;
            
            if (chatDataSession.tabs && chatDataSession.tabs.length > 0) {
              const chatTabsToSave = chatDataSession.tabs.map((tab: any) => ({
                id: tab.id,
                title: tab.title,
                messages: tab.messages || [],
                isActive: tab.isActive
              }));
              
              await invoke('save_chats', {
                documentPath: documentId,
                tabs: chatTabsToSave
              });
              
              // Reload from database
              chatData = await invoke('load_chats', { documentPath: documentId });
            }
          } catch (e) {
            console.error('[FileStore] Error migrating chats:', e);
          }
        }

        // ===== LOAD NOTES INTO STORE =====
        if (notesFromFiles.length > 0) {
          const globalNotes: any[] = [];
          const topicNotesMap = new Map<string, any[]>();

          notesFromFiles.forEach((note: any) => {
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

          const topicNotesForStore: [string, any][] = Array.from(topicNotesMap.entries());
          
          // Note: noteStore is the STATE object, not the store hook
          // We need to use the actual store to call actions
          const noteStoreActions = useNoteStore.getState();
          
          noteStoreActions.deserialize({
            tabs: [],
            globalNotes: globalNotes,
            topicNotes: topicNotesForStore,
          });
          
          // Create tabs for each existing note (don't create new notes!)
          globalNotes.forEach((note: any) => {
            noteStoreActions.createTabForNote(note.id, note.title);
          });
          topicNotesForStore.forEach(([_topicId, notes]: [string, any[]]) => {
            notes.forEach((note: any) => {
              noteStoreActions.createTabForNote(note.id, note.title);
            });
          });
        } else {
          const noteStoreActions = useNoteStore.getState();
          noteStoreActions.clear();
          await new Promise(resolve => setTimeout(resolve, 10));
          noteStoreActions.addTab(null, 'Note-1');
        }

        // ===== LOAD CHATS INTO STORE =====
        
        const aiChatStoreActions = useAIChatStore.getState();
        
        if (chatData && Array.isArray(chatData) && chatData.length > 0) {
          aiChatStoreActions.deserialize({
            tabs: chatData,
          })
        } else {
          aiChatStoreActions.clear();
          aiChatStoreActions.addTab('Chat 1');
        }
      } catch (e) {
        console.error('[FileStore] Error loading document state:', e)
        noteStore.clear()
        aiChatStore.clear()
      }
    },

  saveSystemState: async (_noteStore, _aiChatStore) => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      
      // Get notes from store
      const noteStoreActions = useNoteStore.getState();
      const { globalNotes, topicNotes } = noteStoreActions;
      const allNotes: any[] = [...globalNotes];
      topicNotes.forEach((notes: any[]) => {
        allNotes.push(...notes);
      });

      // Get chat data from store
      const aiChatStoreActions = useAIChatStore.getState();
      const chatState = aiChatStoreActions.serialize();
      const chatTabs: any[] = chatState.tabs.map((tab: any) => ({
        id: tab.id,
        title: tab.title,
        messages: tab.messages,
        isActive: tab.isActive
      }));

      // Save chats to database with system ID
      await invoke('save_chats', {
        documentPath: SYSTEM_DOCUMENT_ID,
        tabs: chatTabs
      });

      // Save notes to markdown files in a system folder
      if (allNotes.length > 0) {
        const systemNotesPath = SYSTEM_DOCUMENT_ID;
        for (const note of allNotes) {
          try {
            await invoke('save_note_as_markdown', {
              documentPath: systemNotesPath,
              noteId: note.id,
              title: note.title,
              content: note.content,
              noteType: note.type || 'note',
              topicId: note.topicId || null
            });
          } catch (e) {
            console.error('[FileStore] Error saving system note:', note.id, e);
          }
        }
      }
    } catch (e) {
      console.error('[FileStore] Error saving system state:', e);
    }
  },

  loadSystemState: async (_noteStore, _aiChatStore) => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      
      // Load chats from database
      let chatData: any[] = [];
      try {
        chatData = await invoke('load_chats', { documentPath: SYSTEM_DOCUMENT_ID });
      } catch (e) {
        chatData = [];
      }

      // Load notes from markdown files
      let notesFromFiles: any[] = [];
      try {
        notesFromFiles = await invoke('load_all_notes_from_markdown', { documentPath: SYSTEM_DOCUMENT_ID });
      } catch (e) {
        notesFromFiles = [];
      }

      // Apply to stores
      if (chatData.length > 0) {
        const aiChatStoreActions = useAIChatStore.getState();
        aiChatStoreActions.deserialize({ tabs: chatData });
      } else {
        // Create default system chat if none exists
        const aiChatStoreActions = useAIChatStore.getState();
        if (aiChatStoreActions.tabs.length === 0) {
          aiChatStoreActions.addTab('System Chat');
        }
      }

      if (notesFromFiles.length > 0) {
        const noteStoreActions = useNoteStore.getState();
        const topicNotesMap = new Map<string, any[]>();
        
        noteStoreActions.deserialize({
          tabs: [],
          globalNotes: notesFromFiles,
          topicNotes: Array.from(topicNotesMap.entries()),
        });

        // Create tabs for each note
        notesFromFiles.forEach((note: any) => {
          noteStoreActions.createTabForNote(note.id, note.title);
        });
      } else {
        // Create default system note if none exists
        const noteStoreActions = useNoteStore.getState();
        if (noteStoreActions.globalNotes.length === 0) {
          noteStoreActions.createNote(null, 'System Note', 'note');
          noteStoreActions.addTab(null, 'System Note');
        }
      }
    } catch (e) {
      console.error('[FileStore] Error loading system state:', e);
    }
  },

  setCurrentFile: async (file) => {
    const prevFile = get().currentFile

    // Save metadata for previous file before switching
    if (prevFile) {
      const metadataStore = useDocumentMetadataStore.getState()
      // Get the current page from the file store (which tracks the page as user navigates)
      const currentPage = get().currentPage
      if (currentPage && currentPage > 0) {
        await metadataStore.saveMetadata({
          documentPath: prevFile.path,
          currentPage: currentPage,
        })
      }
    }

    if (file) {
      get().addToHistory(file)

      // Clear metadata store before loading new file's metadata
      const metadataStore = useDocumentMetadataStore.getState()
      metadataStore.clearCurrentMetadata()

      // Load metadata for new file
      const metadata = await metadataStore.loadMetadata(file.path)

      if (metadata) {
        // Always use the saved page from metadata database
        // (the page is already saved there when user navigates)
        const savedPage = metadata.currentPage || 1
        set({
          currentFile: file,
          currentPage: savedPage
        })
      } else {
        set({ currentFile: file, currentPage: 1 })
      }
    } else {
      set({ currentFile: null, currentPage: 1 })
    }
  },

  setCurrentPage: (page) => {
    set({ currentPage: page })
    
    // Auto-save metadata when page changes (if we have a current file)
    const currentFile = get().currentFile
    if (currentFile) {
      const metadataStore = useDocumentMetadataStore.getState()
      metadataStore.updateMetadata({ currentPage: page })
        .catch(e => console.error('[FileStore] Error auto-saving page metadata:', e))
    }
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

// Migration function: migrate sessionStorage data to database
export async function migrateSessionStorageToDatabase(sessionStore: any): Promise<{ migrated: number; errors: number }> {
  const session = sessionStore.getSession()
  const { invoke } = await import('@tauri-apps/api/core')
  
  let migratedCount = 0
  let errorCount = 0
  
  // Migrate document notes
  if (session.documentNotes) {
    for (const [documentPath, noteData] of Object.entries(session.documentNotes)) {
      try {
        if (!noteData || typeof noteData !== 'object') continue
        
        const data = noteData as any
        const allNotes: any[] = [...(data.globalNotes || [])]
        
        // Add topic notes
        if (data.topicNotes) {
          for (const [, notes] of data.topicNotes) {
            if (Array.isArray(notes)) {
              allNotes.push(...notes)
            }
          }
        }
        
        // Save notes to database
        if (allNotes.length > 0) {
          const notesForDb = allNotes.map((note: any) => ({
            id: note.id,
            title: note.title,
            content: note.content,
            noteType: note.type || 'note',
            topicId: note.topicId || null,
            createdAt: note.createdAt || Date.now(),
            updatedAt: note.updatedAt || Date.now()
          }))
          
          await invoke('save_notes', {
            documentPath,
            notes: notesForDb
          })
          
          // Save note tabs
          if (data.tabs && data.tabs.length > 0) {
            const noteTabsForDb = data.tabs.map((tab: any) => ({
              id: tab.id,
              noteId: tab.noteId,
              title: tab.title,
              isActive: tab.isActive
            }))
            
            await invoke('save_note_tabs', {
              documentPath,
              tabs: noteTabsForDb
            })
          }
          
          // Save markdown files
          for (const note of allNotes) {
            if (note.content && note.content.trim()) {
              await invoke('save_note_as_markdown', {
                documentPath,
                noteId: note.id,
                title: note.title,
                content: note.content,
                noteType: note.type || 'note',
                topicId: note.topicId || null,
                createdAt: note.createdAt || Date.now(),
                updatedAt: note.updatedAt || Date.now()
              })
            }
          }
          
          migratedCount++
        }
      } catch (e) {
        console.error('[Migration] Error migrating notes for:', documentPath, e)
        errorCount++
      }
    }
  }
  
  // Migrate document chats
  if (session.documentChat) {
    for (const [documentPath, chatData] of Object.entries(session.documentChat)) {
      try {
        if (!chatData || typeof chatData !== 'object') continue
        
        const data = chatData as any
        
        if (data.tabs && data.tabs.length > 0) {
          const chatTabs = data.tabs.map((tab: any) => ({
            id: tab.id,
            title: tab.title,
            messages: tab.messages || [],
            isActive: tab.isActive
          }))
          
          await invoke('save_chats', {
            documentPath,
            tabs: chatTabs
          })
          
          migratedCount++
        }
      } catch (e) {
        console.error('[Migration] Error migrating chat for:', documentPath, e)
        errorCount++
      }
    }
  }
  
  return { migrated: migratedCount, errors: errorCount }
}

// Clear sessionStorage data after successful migration
export function clearSessionStorageData(sessionStore: any): void {
  sessionStore.clearSessionData()
}

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

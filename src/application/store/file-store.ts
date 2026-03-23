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

        console.log('[FileStore] Saving notes for:', currentFile.path, 'globalNotes count:', globalNotes.length);
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
        console.log('[FileStore] Chat state to save:', chatState.tabs.length, 'tabs');
        chatState.tabs.forEach((tab: any, idx: number) => {
          console.log(`[FileStore] Tab ${idx}:`, tab.title, 'messages:', tab.messages?.length || 0);
        });
        
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
        console.log('[FileStore] ✅ Saved', chatTabs.length, 'chat tabs to database');

        // Debug: verify save by listing all chats in DB
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const allChats = await invoke('debug_list_all_chats');
          console.log('[FileStore] 📊 All chats in DB after save:', JSON.stringify(allChats, null, 2));
        } catch (e) {
          console.log('[FileStore] Debug list chats failed:', e);
        }

        // ===== SAVE NOTES TO MARKDOWN FILES ONLY =====
        // Notes are saved as markdown files in StudyNotes/ folder (NOT to database)
        const studyNotesDir = `${currentFile.path.substring(0, currentFile.path.lastIndexOf('/'))}/StudyNotes`;
        console.log('[FileStore] Saving notes to:', studyNotesDir);
        
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
          console.log(`[FileStore] ✅ Saved note "${displayTitle}" (noteId: ${note.id}) to markdown file`);
        }
        console.log('[FileStore] ✅ Saved', allNotes.length, 'notes as markdown files');

    // ===== SAVE DOCUMENT METADATA =====
    const metadataStore = useDocumentMetadataStore.getState()
    // When saving a specific file (fileToSave), get its page from the metadata cache
    // because get().currentPage may already be set to the new file's page
    let pageToSave = get().currentPage
    if (fileToSave) {
      const cachedMetadata = metadataStore.getMetadata(fileToSave.path)
      if (cachedMetadata) {
        pageToSave = cachedMetadata.currentPage
        console.log('[FileStore] Using cached page from metadata store:', pageToSave, 'for file:', fileToSave.path)
      } else {
        console.log('[FileStore] No cached metadata found, using current page:', pageToSave)
      }
    }
    await metadataStore.saveMetadata({
      documentPath: currentFile.path,
      currentPage: pageToSave,
    })
    console.log('[FileStore] ✅ Saved document metadata with page:', pageToSave);
      
      // Debug: verify save by listing all metadata
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const allMetadata = await invoke('debug_list_all_metadata');
        console.log('[FileStore] 📊 All metadata in DB after save:', JSON.stringify(allMetadata, null, 2));
      } catch (e) {
        console.log('[FileStore] Debug list failed:', e);
      }

      console.log('[FileStore] ========================================');
      console.log('[FileStore] SAVE COMPLETE for:', currentFile.path);
      console.log('[FileStore] - Chats:', chatTabs.length, 'tabs → Database');
      console.log('[FileStore] - Notes:', allNotes.length, 'notes → Markdown files');
      console.log('[FileStore] - Metadata: currentPage=' + get().currentPage);
      console.log('[FileStore] ========================================');
      } catch (e) {
        console.error('[FileStore] Error saving document state:', e)
      }
    },

  loadDocumentState: async (documentId, noteStore, aiChatStore, sessionStore?: any) => {
    if (!documentId) return

    try {
      console.log('[FileStore] Loading state for:', documentId)

      // Import Tauri invoke
      const { invoke } = await import('@tauri-apps/api/core');

    // ===== LOAD DOCUMENT METADATA =====
    try {
      const metadataStore = useDocumentMetadataStore.getState()
      const metadata = await metadataStore.loadMetadata(documentId)
      if (metadata) {
        console.log('[FileStore] Loaded metadata:', metadata)
        // Note: We don't update currentPage here - it should already be set
        // by setCurrentFile() or setCurrentPage() before loadDocumentState is called.
        // Loading document state (notes/chat) should not override the page number.
      } else {
        console.log('[FileStore] No metadata found for:', documentId)
      }
        
        // Debug: list all metadata in database
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const allMetadata = await invoke('debug_list_all_metadata');
          console.log('[FileStore] 📊 All metadata in DB:', JSON.stringify(allMetadata, null, 2));
        } catch (e) {
          console.log('[FileStore] Debug list failed:', e);
        }
      } catch (e) {
        console.log('[FileStore] No metadata in database for:', documentId)
      }

      // ===== LOAD CHATS FROM DATABASE =====
        let chatData: any[] = [];
        try {
          chatData = await invoke('load_chats', { documentPath: documentId });
          console.log('[FileStore] ✅ Loaded', chatData.length, 'chat tabs from database');
          // Debug: log what was loaded
          chatData.forEach((tab: any, idx: number) => {
            console.log(`[FileStore]   Loaded tab ${idx}:`, tab.title, '->', tab.messages?.length || 0, 'messages');
          });
        } catch (e) {
          console.log('[FileStore] No chats found in database for:', documentId);
          chatData = [];
        }

        // ===== LOAD NOTES FROM MARKDOWN FILES =====
        let notesFromFiles: any[] = [];
        try {
          notesFromFiles = await invoke('load_all_notes_from_markdown', { documentPath: documentId });
          console.log('[FileStore] ✅ Loaded', notesFromFiles.length, 'notes from markdown files');
        } catch (e) {
          console.log('[FileStore] No markdown notes found for:', documentId);
          notesFromFiles = [];
        }

        // If no data or empty data in database, check sessionStorage and migrate if needed
        const session = sessionStore?.getSession();
        const hasSessionNotes = session?.documentNotes?.[documentId];
        const hasSessionChats = session?.documentChat?.[documentId];
        
        console.log('===========================================');
        console.log('[FileStore] MIGRATION CHECK for:', documentId);
        console.log('[FileStore] - Notes in MD files:', notesFromFiles.length);
        console.log('[FileStore] - Chats in DB:', chatData.length, 'tabs');
        console.log('[FileStore] - Session exists:', !!session);
        console.log('[FileStore] - Session.documentNotes exists:', !!session?.documentNotes);
        console.log('[FileStore] - Session.documentChat exists:', !!session?.documentChat);
        console.log('[FileStore] - hasSessionNotes:', !!hasSessionNotes);
        console.log('[FileStore] - hasSessionChats:', !!hasSessionChats);
        
        // Debug: show all document paths in session
        if (session?.documentNotes) {
          const notePaths = Object.keys(session.documentNotes);
          console.log('[FileStore] All note document paths:', notePaths);
          console.log('[FileStore] Current doc in notes list:', notePaths.includes(documentId));
        }
        if (session?.documentChat) {
          const chatPaths = Object.keys(session.documentChat);
          console.log('[FileStore] All chat document paths:', chatPaths);
          console.log('[FileStore] Current doc in chats list:', chatPaths.includes(documentId));
        }
        
        if (hasSessionNotes) {
          console.log('[FileStore] Session notes structure:', JSON.stringify(hasSessionNotes, null, 2));
        }
        if (hasSessionChats) {
          console.log('[FileStore] Session chats structure:', JSON.stringify(hasSessionChats, null, 2));
        }
        console.log('===========================================');
        
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
            console.log('[FileStore] 🔄 Migrating notes from sessionStorage to markdown files for:', documentId);
            console.log('[FileStore]   Session has', sessionNoteIds.size, 'notes, loaded', notesFromFiles.length, 'from files');
            
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
                  console.log(`[FileStore]   ✅ Migrated note "${displayTitle}" (id: ${note.id}) to markdown`);
                }
              }
              
              // Reload from markdown files
              notesFromFiles = await invoke('load_all_notes_from_markdown', { documentPath: documentId });
              console.log('[FileStore] ✅ Migration complete. Loaded', notesFromFiles.length, 'notes from markdown');
            } catch (e) {
              console.error('[FileStore] Error migrating notes:', e);
            }
          } else {
            console.log('[FileStore] ✅ All notes already migrated to markdown files');
          }
        }
        
        // ===== MIGRATION: Chats from sessionStorage to Database =====
        if ((chatData.length === 0 || (chatData.length > 0 && chatData.every(tab => !tab.messages || tab.messages.length === 0))) && hasSessionChats) {
          console.log('[FileStore] 🔄 Migrating chats from sessionStorage to database for:', documentId);
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
              
              console.log('[FileStore] Saving', chatTabsToSave.length, 'chat tabs with messages:');
              chatTabsToSave.forEach((tab: any, idx: number) => {
                console.log(`[FileStore]   Tab ${idx}:`, tab.title, '->', tab.messages?.length || 0, 'messages');
              });
              
              await invoke('save_chats', {
                documentPath: documentId,
                tabs: chatTabsToSave
              });
              
              // Reload from database
              chatData = await invoke('load_chats', { documentPath: documentId });
              console.log('[FileStore] ✅ Migration complete. Loaded', chatData.length, 'chat tabs from database');
            }
          } catch (e) {
            console.error('[FileStore] Error migrating chats:', e);
          }
        }

        // ===== LOAD NOTES INTO STORE =====
        console.log('[FileStore] === LOADING NOTES ===');
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
          
          console.log('[FileStore] Loading', globalNotes.length, 'global notes,', topicNotesForStore.length, 'topic note groups from markdown files');
          
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
          
          console.log('[FileStore] ✅ Loaded', noteStoreActions.tabs.length, 'note tabs');
        } else {
          console.log('[FileStore] No notes found, creating default note');
          const noteStoreActions = useNoteStore.getState();
          noteStoreActions.clear();
          await new Promise(resolve => setTimeout(resolve, 10));
          noteStoreActions.addTab(null, 'Note-1');
          console.log('[FileStore] ✅ Created new note tab');
        }
        console.log('[FileStore] === END NOTES LOADING ===');

        // ===== LOAD CHATS INTO STORE =====
        console.log('[FileStore] === LOADING CHATS ===');
        
        const aiChatStoreActions = useAIChatStore.getState();
        
        if (chatData && Array.isArray(chatData) && chatData.length > 0) {
          const totalMessages = chatData.reduce((sum: number, tab: any) => sum + (tab.messages?.length || 0), 0);
          console.log('[FileStore] Loading', chatData.length, 'chat tabs with', totalMessages, 'total messages from database');
          
          aiChatStoreActions.deserialize({
            tabs: chatData,
          })
          
          console.log('[FileStore] ✅ Loaded', aiChatStoreActions.tabs.length, 'chat tabs');
        } else {
          console.log('[FileStore] No chat data found, creating default chat');
          aiChatStoreActions.clear();
          aiChatStoreActions.addTab('Chat 1');
          console.log('[FileStore] ✅ Created new chat tab');
        }
        console.log('[FileStore] === END CHAT LOADING ===');
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
      console.log('[FileStore] ✅ Saved', chatTabs.length, 'system chat tabs');

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
        console.log('[FileStore] ✅ Saved', allNotes.length, 'system notes');
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
        console.log('[FileStore] ✅ Loaded', chatData.length, 'system chat tabs from database');
      } catch (e) {
        console.log('[FileStore] No system chats found in database');
        chatData = [];
      }

      // Load notes from markdown files
      let notesFromFiles: any[] = [];
      try {
        notesFromFiles = await invoke('load_all_notes_from_markdown', { documentPath: SYSTEM_DOCUMENT_ID });
        console.log('[FileStore] ✅ Loaded', notesFromFiles.length, 'system notes from markdown files');
      } catch (e) {
        console.log('[FileStore] No system notes found');
        notesFromFiles = [];
      }

      // Apply to stores
      if (chatData.length > 0) {
        const aiChatStoreActions = useAIChatStore.getState();
        aiChatStoreActions.deserialize({ tabs: chatData });
        console.log('[FileStore] ✅ Loaded system chats into store');
      } else {
        // Create default system chat if none exists
        const aiChatStoreActions = useAIChatStore.getState();
        if (aiChatStoreActions.tabs.length === 0) {
          aiChatStoreActions.addTab('System Chat');
          console.log('[FileStore] ✅ Created default system chat');
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
        console.log('[FileStore] ✅ Loaded system notes into store');
      } else {
        // Create default system note if none exists
        const noteStoreActions = useNoteStore.getState();
        if (noteStoreActions.globalNotes.length === 0) {
          noteStoreActions.createNote(null, 'System Note', 'note');
          noteStoreActions.addTab(null, 'System Note');
          console.log('[FileStore] ✅ Created default system note');
        }
      }
    } catch (e) {
      console.error('[FileStore] Error loading system state:', e);
    }
  },

  setCurrentFile: async (file, preservePage = false) => {
    const prevFile = get().currentFile

    // Save metadata for previous file before switching
    if (prevFile) {
      const metadataStore = useDocumentMetadataStore.getState()
      // Get the current page from metadata store (which is synced from PDFViewer)
      const currentMetadata = metadataStore.currentMetadata
      // Only save metadata if we have it for this specific file path
      if (currentMetadata && currentMetadata.documentPath === prevFile.path) {
        const pageToSave = currentMetadata.currentPage
        console.log('[FileStore] Saving page:', pageToSave, 'from metadata store')
        await metadataStore.saveMetadata({
          documentPath: prevFile.path,
          currentPage: pageToSave,
        })
        console.log('[FileStore] Saved metadata for previous file:', prevFile.path, 'page:', pageToSave)
      } else {
        console.log('[FileStore] No metadata found for previous file:', prevFile.path, 'skipping save')
      }
    }

    if (file) {
      get().addToHistory(file)

      // Load metadata for new file
      const metadataStore = useDocumentMetadataStore.getState()
      const metadata = await metadataStore.loadMetadata(file.path)

      if (metadata) {
        console.log('[FileStore] Loaded metadata for new file:', file.path, metadata)
        // If preservePage is true, don't overwrite the current page (used when restoring from session)
        // Otherwise, use the page from metadata (used when opening a new file)
        const currentPage = preservePage ? get().currentPage : metadata.currentPage
        set({
          currentFile: file,
          currentPage: currentPage
        })
      } else {
        console.log('[FileStore] No metadata found for new file, using defaults:', file.path)
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
  console.log('[Migration] Starting migration from sessionStorage to database...')
  
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
          
          console.log('[Migration] Migrated notes for:', documentPath, 'count:', allNotes.length)
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
          
          console.log('[Migration] Migrated chat for:', documentPath, 'tabs:', chatTabs.length)
          migratedCount++
        }
      } catch (e) {
        console.error('[Migration] Error migrating chat for:', documentPath, e)
        errorCount++
      }
    }
  }
  
  console.log('[Migration] Complete:', migratedCount, 'documents migrated,', errorCount, 'errors')
  return { migrated: migratedCount, errors: errorCount }
}

// Clear sessionStorage data after successful migration
export function clearSessionStorageData(sessionStore: any): void {
  console.log('[Migration] Clearing sessionStorage data...')
  sessionStore.clearSessionData()
  console.log('[Migration] SessionStorage cleared')
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

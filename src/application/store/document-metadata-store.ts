import { create } from 'zustand'
import { persist } from 'zustand/middleware'

let saveMetadataTimeout: ReturnType<typeof setTimeout> | null = null

export interface DocumentMetadata {
  id: string
  documentPath: string
  chatId?: string
  viewMode: 'single' | 'double'
  scale: number
  currentPage: number
  scrollPosition: number
  settings: Record<string, unknown> // Flat JSON for extensibility
  createdAt: number
  updatedAt: number
}

// Rust database response type
interface RustDocumentMetadata {
  id: string
  document_path: string
  chat_id?: string
  view_mode: string
  scale: number
  current_page: number
  scroll_position: number
  settings_json?: string
  created_at: number
  updated_at: number
}

export const getDefaultMetadata = (): Omit<DocumentMetadata, 'id' | 'documentPath' | 'createdAt' | 'updatedAt'> => ({
  viewMode: 'single',
  scale: 1.0,
  currentPage: 1,
  scrollPosition: 0,
  settings: {},
})

interface DocumentMetadataStore {
  // Current document's metadata (transient, not persisted)
  currentMetadata: DocumentMetadata | null

  // Actions
  loadMetadata: (documentPath: string) => Promise<DocumentMetadata | null>
  saveMetadata: (metadata: Partial<DocumentMetadata> & { documentPath: string }) => Promise<void>
  updateMetadata: (updates: Partial<Omit<DocumentMetadata, 'id' | 'documentPath' | 'createdAt' | 'updatedAt'>>) => Promise<void>
  clearCurrentMetadata: () => void

  // Get metadata for a specific document (from cache or DB)
  getMetadata: (documentPath: string) => DocumentMetadata | null

  // Cache of loaded metadata by document path
  metadataCache: Map<string, DocumentMetadata>
}

export const useDocumentMetadataStore = create<DocumentMetadataStore>()(
  persist(
    (set, get) => ({
      currentMetadata: null,
      metadataCache: new Map(),

      loadMetadata: async (documentPath: string) => {
        console.log('[DocumentMetadata] loadMetadata called for:', documentPath)

        try {
          const { invoke } = await import('@tauri-apps/api/core')
          const result = await invoke<RustDocumentMetadata>('load_document_metadata', { documentPath })
          console.log('[DocumentMetadata] loadMetadata raw result, current_page:', result?.current_page)

          if (result) {
            // Convert from Rust format to TypeScript format
            const metadata: DocumentMetadata = {
              id: result.id,
              documentPath: result.document_path,
              chatId: result.chat_id,
              viewMode: result.view_mode === 'double' ? 'double' : 'single',
              scale: result.scale,
              currentPage: result.current_page,
              scrollPosition: result.scroll_position,
              settings: result.settings_json ? JSON.parse(result.settings_json) : {},
              createdAt: result.created_at,
              updatedAt: result.updated_at,
            }

            console.log('[DocumentMetadata] loadMetadata returning metadata with currentPage:', metadata.currentPage)
            
            set((state) => ({
              currentMetadata: metadata,
              metadataCache: new Map(state.metadataCache).set(documentPath, metadata),
            }))

            return metadata
          }

          // No saved metadata, create default
          const defaultMetadata: DocumentMetadata = {
            id: crypto.randomUUID(),
            documentPath,
            ...getDefaultMetadata(),
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }

          set((state) => ({
             currentMetadata: defaultMetadata,
             metadataCache: new Map(state.metadataCache).set(documentPath, defaultMetadata),
           }))

           // Save default metadata to database
           await invoke('save_document_metadata', { metadata: {
             id: defaultMetadata.id,
             document_path: defaultMetadata.documentPath,
             chat_id: defaultMetadata.chatId,
             view_mode: defaultMetadata.viewMode,
             scale: defaultMetadata.scale,
             current_page: defaultMetadata.currentPage,
             scroll_position: defaultMetadata.scrollPosition,
             settings_json: JSON.stringify(defaultMetadata.settings),
             created_at: defaultMetadata.createdAt,
             updated_at: defaultMetadata.updatedAt,
           }})

           return defaultMetadata
        } catch (e) {
          console.error('[DocumentMetadata] Error loading metadata:', e)
          return null
        }
      },

      saveMetadata: async (metadata: Partial<DocumentMetadata> & { documentPath: string }) => {
        try {
          const { invoke } = await import('@tauri-apps/api/core')

          const now = Date.now()
          const existing = get().metadataCache.get(metadata.documentPath) || get().currentMetadata
          
          // Skip if page is already the same (avoid unnecessary writes)
          if (existing && existing.currentPage === metadata.currentPage && metadata.currentPage !== undefined) {
            return
          }

          const fullMetadata: DocumentMetadata = {
            id: existing?.id || crypto.randomUUID(),
            documentPath: metadata.documentPath,
            chatId: metadata.chatId ?? existing?.chatId,
            viewMode: metadata.viewMode ?? existing?.viewMode ?? 'single',
            scale: metadata.scale ?? existing?.scale ?? 1.0,
            currentPage: metadata.currentPage ?? existing?.currentPage ?? 1,
            scrollPosition: metadata.scrollPosition ?? existing?.scrollPosition ?? 0,
            settings: metadata.settings ?? existing?.settings ?? {},
            createdAt: existing?.createdAt || now,
            updatedAt: now,
          }

          // Convert to Rust format
          const rustMetadata = {
            id: fullMetadata.id,
            document_path: fullMetadata.documentPath,
            chat_id: fullMetadata.chatId,
            view_mode: fullMetadata.viewMode,
            scale: fullMetadata.scale,
            current_page: fullMetadata.currentPage,
            scroll_position: fullMetadata.scrollPosition,
            settings_json: JSON.stringify(fullMetadata.settings),
            created_at: fullMetadata.createdAt,
            updated_at: fullMetadata.updatedAt,
          }

          await invoke('save_document_metadata', { metadata: rustMetadata })

          set((state) => ({
            currentMetadata: fullMetadata,
            metadataCache: new Map(state.metadataCache).set(metadata.documentPath, fullMetadata),
          }))
        } catch (e) {
          console.error('[DocumentMetadata] Error saving metadata:', e)
        }
      },

      updateMetadata: async (updates) => {
        const current = get().currentMetadata
        if (!current) {
          return
        }

        const updated = {
          ...current,
          ...updates,
          updatedAt: Date.now(),
        }

        // Update state immediately
        set((state) => ({
          currentMetadata: updated,
          metadataCache: new Map(state.metadataCache).set(current.documentPath, updated),
        }))

        // Debounce the save to backend
        if (saveMetadataTimeout) clearTimeout(saveMetadataTimeout)
        saveMetadataTimeout = setTimeout(() => {
          get().saveMetadata(updated)
        }, 500)
      },

      clearCurrentMetadata: () => {
        set({ currentMetadata: null })
      },

      getMetadata: (documentPath: string) => {
        return get().metadataCache.get(documentPath) || null
      },
    }),
    {
      name: 'document-metadata-store',
      // Don't persist the cache - always load fresh from database
      partialize: () => ({}),
      onRehydrateStorage: () => {
        return (state) => {
          if (state) {
            state.metadataCache = new Map()
          }
        }
      },
    }
  )
)

export default useDocumentMetadataStore

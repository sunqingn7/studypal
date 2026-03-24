import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface DocumentMetadata {
  id: string
  documentPath: string
  chatId?: string
  viewMode: 'single' | 'double'
  scale: number
  currentPage: number
  scrollPosition: number
  settings: Record<string, any> // Flat JSON for extensibility
  createdAt: number
  updatedAt: number
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
        try {
          const { invoke } = await import('@tauri-apps/api/core')
          const result = await invoke('load_document_metadata', { documentPath })

          if (result) {
            // Convert from Rust format to TypeScript format
            const metadata: DocumentMetadata = {
              id: (result as any).id,
              documentPath: (result as any).document_path,
              chatId: (result as any).chat_id,
              viewMode: (result as any).view_mode === 'double' ? 'double' : 'single',
              scale: (result as any).scale,
              currentPage: (result as any).current_page,
              scrollPosition: (result as any).scroll_position,
              settings: (result as any).settings_json ? JSON.parse((result as any).settings_json) : {},
              createdAt: (result as any).created_at,
              updatedAt: (result as any).updated_at,
            }

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
          const existing = get().metadataCache.get(metadata.documentPath)
          
          console.log('[DocumentMetadata] saveMetadata called for:', metadata.documentPath, 'page:', metadata.currentPage, 'existing page:', existing?.currentPage)

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
          console.warn('[DocumentMetadata] No current metadata to update')
          return
        }

        console.log('[DocumentMetadata] updateMetadata BEFORE:', { currentPage: current.currentPage, updates })
        const updated = {
          ...current,
          ...updates,
          updatedAt: Date.now(),
        }
        console.log('[DocumentMetadata] updateMetadata AFTER:', { currentPage: updated.currentPage })
        await get().saveMetadata(updated)
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
      // Only persist the cache, not the current metadata
      partialize: (state) => ({ metadataCache: Array.from(state.metadataCache.entries()) }),
      onRehydrateStorage: () => {
        return (state) => {
          if (state) {
            // Convert array back to Map
            const cacheArray = (state as any).metadataCache
            if (Array.isArray(cacheArray)) {
              state.metadataCache = new Map(cacheArray)
            }
          }
        }
      },
    }
  )
)

export default useDocumentMetadataStore

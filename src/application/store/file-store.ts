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
}

export const useFileStore = create<FileStore>((set, get) => ({
  currentFile: null,
  currentPage: 1,
  fileHistory: [],

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

import { useFileStore } from '../store/file-store'
import { useNoteStore } from '../store/note-store'
import { useAIChatStore } from '../store/ai-chat-store'
import { FileMetadata } from '../../domain/models/file'
import {
  saveNotesToFiles,
  loadNotesFromFiles,
  saveAIChatToFile,
  loadAIChatFromFile,
} from './file-persistence-service'

/**
 * Service to manage file session persistence
 * This coordinates between file, note, and AI chat stores
 */
class FileSessionManager {
  private previousFile: FileMetadata | null = null

  /**
   * Called when switching to a new file
   * Saves current session and loads new session
   */
  async switchToFile(newFile: FileMetadata | null): Promise<void> {
    console.log('[FileSessionManager] Switching file:', {
      from: this.previousFile?.path,
      to: newFile?.path,
    })

    // Save current session if there's a previous file
    if (this.previousFile) {
      await this.saveCurrentSession(this.previousFile)
    }

    // Load new session if there's a new file
    if (newFile) {
      await this.loadSessionForFile(newFile)
    } else {
      // Clear all stores if no file selected
      this.clearAllStores()
    }

    // Update previous file reference
    this.previousFile = newFile
  }

  /**
   * Save current session to disk
   */
  private async saveCurrentSession(file: FileMetadata): Promise<void> {
    try {
      console.log('[FileSessionManager] Saving session for:', file.path)

      // Get current state from stores
      const { globalNotes, tabs: noteTabs, activeTabId: noteActiveTabId } = useNoteStore.getState()
      const { tabs: chatTabs, activeTabId: chatActiveTabId } = useAIChatStore.getState()

      // Save notes
      // Convert globalNotes array to Map for the save function
      const notesMap = new Map<string, { id: string; title: string; content: string; type: 'note' | 'ai-note'; createdAt: number; updatedAt: number }>()
      globalNotes.forEach((note) => {
        notesMap.set(note.id, note)
      })

      await saveNotesToFiles(
        file.path,
        noteTabs,
        noteActiveTabId,
        notesMap
      )

      // Save AI chat
      await saveAIChatToFile(
        file.path,
        chatTabs,
        chatActiveTabId
      )

      console.log('[FileSessionManager] Session saved successfully')
    } catch (error) {
      console.error('[FileSessionManager] Error saving session:', error)
      throw error
    }
  }

  /**
   * Load session for a file
   */
  private async loadSessionForFile(file: FileMetadata): Promise<void> {
    try {
      console.log('[FileSessionManager] Loading session for:', file.path)

      // Load notes
      const notesData = await loadNotesFromFiles(file.path)
      
      if (notesData) {
        // Update note store with loaded data
        useNoteStore.setState({
          tabs: notesData.tabs,
          activeTabId: notesData.activeTabId,
          globalNotes: notesData.notes as any,
        })
        console.log('[FileSessionManager] Notes loaded:', notesData.notes.length, 'tabs:', notesData.tabs.length)
      } else {
        // No existing notes, start fresh
        useNoteStore.setState({
          tabs: [],
          activeTabId: null,
          globalNotes: [],
        })
        console.log('[FileSessionManager] No existing notes, starting fresh')
      }

      // Load AI chat
      const chatData = await loadAIChatFromFile(file.path)
      
      if (chatData) {
        useAIChatStore.setState({
          tabs: chatData.tabs,
          activeTabId: chatData.activeTabId,
        })
        console.log('[FileSessionManager] AI chat loaded:', chatData.tabs.length, 'tabs')
      } else {
        // No existing chat, start fresh
        useAIChatStore.setState({
          tabs: [],
          activeTabId: null,
        })
        console.log('[FileSessionManager] No existing AI chat, starting fresh')
      }

      console.log('[FileSessionManager] Session loaded successfully')
    } catch (error) {
      console.error('[FileSessionManager] Error loading session:', error)
      // Start fresh on error
      this.clearAllStores()
      throw error
    }
  }

  /**
   * Clear all stores (used when closing file)
   */
  private clearAllStores(): void {
    console.log('[FileSessionManager] Clearing all stores')
    
    useNoteStore.setState({
      tabs: [],
      activeTabId: null,
      globalNotes: [],
    })
    
    useAIChatStore.setState({
      tabs: [],
      activeTabId: null,
    })
  }

  /**
   * Save current session without switching (for manual save)
   */
  async saveCurrent(): Promise<void> {
    const fileStore = useFileStore.getState()
    if (fileStore.currentFile) {
      await this.saveCurrentSession(fileStore.currentFile)
    }
  }
}

// Export singleton instance
export const fileSessionManager = new FileSessionManager()

// Hook for React components
export function useFileSession() {
  return {
    switchToFile: fileSessionManager.switchToFile.bind(fileSessionManager),
    saveCurrent: fileSessionManager.saveCurrent.bind(fileSessionManager),
  }
}
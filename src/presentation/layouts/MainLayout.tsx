import { useState, useEffect, useRef } from 'react'
import { Group, Panel, Separator, useGroupRef } from 'react-resizable-panels'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useFileStore } from '../../application/store/file-store'
import { useNoteStore } from '../../application/store/note-store'
import { useAIChatStore } from '../../application/store/ai-chat-store'
import { useThemeStore } from '../../application/store/theme-store'
import { useSessionStore } from '../../application/store/session-store'
import { useSettingsStore } from '../../application/store/settings-store'
import { useAIStore } from '../../application/store/ai-store'
import { initializeSession, updateAIConfig } from '../../application/services/session-manager'
import { pluginRegistry } from '../../infrastructure/plugins/plugin-registry'
import { SidebarTabs } from '../../plugins/file-browser-view/SidebarTabs'
import FileView from '../components/views/file-view/FileView'
import NoteView from '../components/views/note-view/NoteView'
import AIView from '../components/views/ai-view/AIView'
import { ClassroomView } from '../components/views/classroom-view'
import { useClassroomStore } from '../../application/store/classroom-store'
import { useTranslationStore } from '../../application/store/translation-store'
import { FileMetadata } from '../../domain/models/file'
import { SettingsView } from '../components/views/settings-view/SettingsView'
import { TranslationView } from '../components/views/translation-view'

function MainLayout() {
  const { currentFile, setCurrentPage } = useFileStore()
  const { theme, toggleTheme } = useThemeStore()
  const { session, setPanelSize, setTheme: setSessionTheme, addToFileHistory, setTranslationState } = useSessionStore()
  const { updateGlobal } = useSettingsStore()
  const { isActive: isClassroomActive, previousState } = useClassroomStore()
  const { isActive: isTranslationActive, sourceLang: translationSourceLang, targetLang: translationTargetLang, setLanguages, setIsActive } = useTranslationStore()
  const [showFileBrowser, setShowFileBrowser] = useState(session.showFileBrowser)
  const [hasFileBrowser, setHasFileBrowser] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)
  const [panelSizesRestored, setPanelSizesRestored] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const prevTranslationActive = useRef(isTranslationActive)

  const mainGroupRef = useGroupRef()
  const rightGroupRef = useGroupRef()

  const pluginContext = {
    filePath: currentFile?.path
  }

  useEffect(() => {
    // Save session before window closes using Tauri API
    let unlistenFn: (() => void) | null = null;
    
    const setupCloseHandler = async () => {
      try {
        const appWindow = getCurrentWindow();
        
        // Use Tauri's onCloseRequested to properly handle async save
        const unlisten = await appWindow.onCloseRequested(async (_event) => {
          console.log('[MainLayout] Window close requested, saving state...');
          const { currentFile, saveCurrentDocumentState, saveSystemState } = useFileStore.getState();
          if (currentFile) {
            await saveCurrentDocumentState(useNoteStore.getState(), useAIChatStore.getState(), useSessionStore.getState());
          } else {
            // No file open - save system state (chat without document)
            await saveSystemState(useNoteStore.getState(), useAIChatStore.getState());
          }

          // Session is auto-saved by zustand persist, no manual save needed
          console.log('[MainLayout] State saved, closing window...');
        });
        
        unlistenFn = unlisten;
      } catch (e) {
        // Not in Tauri environment, use beforeunload as fallback
        console.log('[MainLayout] Not in Tauri, using beforeunload fallback');
      }
    };
    
    setupCloseHandler();
    
    // Also add beforeunload as fallback (won't wait for async but better than nothing)
    const handleBeforeUnload = () => {
      const { currentFile, saveCurrentDocumentState, saveSystemState } = useFileStore.getState();
      if (currentFile) {
        saveCurrentDocumentState(useNoteStore.getState(), useAIChatStore.getState(), useSessionStore.getState());
      } else {
        saveSystemState(useNoteStore.getState(), useAIChatStore.getState());
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [])

  useEffect(() => {
    // Check for file browser plugin
    const checkPlugins = () => {
      const viewPlugins = pluginRegistry.getViewPluginsForContext(pluginContext)
      setHasFileBrowser(viewPlugins.some(v => v.metadata.id === 'file-browser-view'))
    }
    
    checkPlugins()
    const timer = setTimeout(checkPlugins, 500)
    return () => clearTimeout(timer)
  }, [pluginContext])

  // Initialize session from Rust backend (AI config, provider configs)
  useEffect(() => {
    console.log('[MainLayout] Initializing session from backend')
    initializeSession()
  }, [])

  useEffect(() => {
    // Check if store already hydrated
    console.log('[MainLayout] Checking hydration, hasHydrated:', useSessionStore.persist.hasHydrated())
    const { setCurrentFile } = useFileStore.getState()
    const appWindow = getCurrentWindow()
    
    if (useSessionStore.persist.hasHydrated()) {
      const state = useSessionStore.getState()
      console.log('[MainLayout] Store already hydrated, session:', state.session)
      setIsHydrated(true)
      setShowFileBrowser(state.session.showFileBrowser)
      
      // Restore last opened file
      if (state.session.currentFile && state.session.currentFilePath) {
        const fileData: FileMetadata = {
          id: state.session.currentFile,
          path: state.session.currentFilePath,
          name: state.session.currentFilePath.split('/').pop() || 'Unknown',
          type: 'pdf',
          size: 0,
        }
        // setCurrentFile with preservePage=true will load the saved page from metadata
        setCurrentFile(fileData)
        
        // Load document-bound notes and chat
        const { loadDocumentState } = useFileStore.getState()
        loadDocumentState(fileData.path, useNoteStore.getState(), useAIChatStore.getState(), useSessionStore.getState())
      }
      
      // AI config is now loaded via initializeSession() from session-manager (Rust backend)
      // Chat history is document-bound now, so no need to restore from here

      // Restore window size
      const { width, height, x, y } = state.session.window
      console.log('[MainLayout] Attempting to restore window:', { width, height, x, y })
      if (width && height && width > 0 && height > 0) {
        import('@tauri-apps/api/dpi').then(({ PhysicalSize }) => {
          appWindow.setSize(new PhysicalSize(Math.round(width), Math.round(height)))
          console.log('[MainLayout] Window size restored to:', width, height)
        })
      }
      if (x && y && x > 0 && y > 0) {
        import('@tauri-apps/api/dpi').then(({ PhysicalPosition }) => {
          appWindow.setPosition(new PhysicalPosition(Math.round(x), Math.round(y)))
          console.log('[MainLayout] Window position restored to:', x, y)
        })
      }
    } else {
      console.log('[MainLayout] Store not yet hydrated, waiting...')
      // Wait for store to hydrate from localStorage
      const unsub = useSessionStore.persist.onFinishHydration(() => {
        const state = useSessionStore.getState()
        console.log('[MainLayout] Store hydrated, session:', state.session)
        setIsHydrated(true)
        setShowFileBrowser(state.session.showFileBrowser)
        
        // Restore last opened file
        if (state.session.currentFile && state.session.currentFilePath) {
          const fileData: FileMetadata = {
            id: state.session.currentFile,
            path: state.session.currentFilePath,
            name: state.session.currentFilePath.split('/').pop() || 'Unknown',
            type: 'pdf',
            size: 0,
          }
          // setCurrentFile with preservePage=true will load the saved page from metadata
          setCurrentFile(fileData)

          // Load document-bound notes and chat
          const { loadDocumentState, loadSystemState } = useFileStore.getState()
          try {
            loadDocumentState(fileData.path, useNoteStore.getState(), useAIChatStore.getState(), useSessionStore.getState())
          } catch (err) {
            console.log('[MainLayout] Failed to load document state, loading system state:', err)
            loadSystemState(useNoteStore.getState(), useAIChatStore.getState())
          }
        } else {
          // No previous file - load system state (chat without document)
          console.log('[MainLayout] No previous file, loading system state')
          const { loadSystemState } = useFileStore.getState()
          loadSystemState(useNoteStore.getState(), useAIChatStore.getState())
        }

    // AI config is now loaded via initializeSession() from session-manager (Rust backend)
    // Chat history is document-bound now, so no need to restore from here

    // Restore window size
    const { width, height, x, y } = state.session.window
    console.log('[MainLayout] Attempting to restore window:', { width, height, x, y })
    if (width && height && width > 0 && height > 0) {
      import('@tauri-apps/api/dpi').then(({ PhysicalSize }) => {
        appWindow.setSize(new PhysicalSize(Math.round(width), Math.round(height)))
        console.log('[MainLayout] Window size restored to:', width, height)
      })
    }
    if (x && y && x > 0 && y > 0) {
      import('@tauri-apps/api/dpi').then(({ PhysicalPosition }) => {
        appWindow.setPosition(new PhysicalPosition(Math.round(x), Math.round(y)))
        console.log('[MainLayout] Window position restored to:', x, y)
      })
    }
  })
  return unsub
}
  }, [])

  useEffect(() => {
    // Track window resize and save to session
    let resizeTimeout: number
    const handleResize = async () => {
      clearTimeout(resizeTimeout)
      resizeTimeout = window.setTimeout(async () => {
        try {
          const appWindow = getCurrentWindow()
          const size = await appWindow.innerSize()
          const position = await appWindow.innerPosition()
          useSessionStore.getState().setWindowState({
            width: size.width,
            height: size.height,
            x: position.x,
            y: position.y,
          })
        } catch (e) {
          // Not in Tauri environment
        }
      }, 500)
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      clearTimeout(resizeTimeout)
    }
  }, [])

  // Save file to session when it changes
  const currentPage = useFileStore((state) => state.currentPage)
  
  // Restore panel sizes after hydration using refs
  useEffect(() => {
    if (isHydrated && !panelSizesRestored) {
      const timer = setTimeout(() => {
        const state = useSessionStore.getState()
        console.log('[MainLayout] Restoring panel sizes from session:', state.session.panels)
        
        const sidebarSize = state.session.panels.sidebar
        const fileSize = state.session.panels.file
        const aiSize = state.session.panels.ai
        const noteSize = state.session.panels.note
        
        // When translation is active, we need to account for it
        // Otherwise just use original layout
        if (mainGroupRef.current) {
          const layout = isTranslationActive
            ? { sidebar: sidebarSize, file: fileSize * 0.5, translation: fileSize * 0.5, right: 100 - sidebarSize - fileSize }
            : { sidebar: sidebarSize, file: fileSize, right: 100 - sidebarSize - fileSize }
          
          console.log('[MainLayout] Setting main group layout:', layout)
          mainGroupRef.current.setLayout(layout as { [panelId: string]: number })
        }
        
        if (rightGroupRef.current) {
          rightGroupRef.current.setLayout({ ai: aiSize, note: noteSize })
        }
        
        setPanelSizesRestored(true)
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [isHydrated, panelSizesRestored, isTranslationActive])
  
  // Restore translation state from session after hydration
  // Only restore AFTER file is loaded to ensure currentFile exists
  useEffect(() => {
    if (isHydrated && session.translationActive && currentFile) {
      console.log('[MainLayout] Restoring translation state from session')
      // Restore translation languages
      setLanguages(session.translationSourceLang, session.translationTargetLang)
      // Set translation as active using setIsActive
      setIsActive(true)
    }
  }, [isHydrated, session.translationActive, currentFile])
  
  // Save translation state to session when it changes
  useEffect(() => {
    if (isHydrated) {
      console.log('[MainLayout] Saving translation state to session:', { isTranslationActive, translationSourceLang, translationTargetLang })
      setTranslationState(isTranslationActive, translationSourceLang, translationTargetLang)
    }
  }, [isTranslationActive, translationSourceLang, translationTargetLang, isHydrated])
  
  const previousFileRef = useRef<FileMetadata | null>(null)
  const previousClassroomStateRef = useRef<{ filePage: number; scrollPosition: number } | null>(null)

  // Restore file page when exiting classroom mode
  useEffect(() => {
    if (!isClassroomActive && previousClassroomStateRef.current) {
      // We just exited classroom mode - restore the previous page
      console.log('[MainLayout] Restoring file page from classroom state:', previousClassroomStateRef.current)
      setCurrentPage(previousClassroomStateRef.current.filePage)
      previousClassroomStateRef.current = null
    } else if (isClassroomActive && previousState) {
      // We just entered classroom mode - save the state for restoration later
      console.log('[MainLayout] Saving current state before entering classroom:', previousState)
      previousClassroomStateRef.current = previousState
    }
  }, [isClassroomActive, previousState, setCurrentPage])

  // Handle system state when no file is open
  useEffect(() => {
    if (!isHydrated) return;
    
    const fileStore = useFileStore.getState();
    
    if (!currentFile) {
      // No file open - load system state
      console.log('[MainLayout] No file open, loading system state');
      fileStore.loadSystemState(useNoteStore.getState(), useAIChatStore.getState());
    } else if (previousFileRef.current === null && currentFile) {
      // First file loaded - save system state first if it exists, then load file state
      console.log('[MainLayout] First file loaded, saving system state first');
      fileStore.saveSystemState(useNoteStore.getState(), useAIChatStore.getState());
      fileStore.loadDocumentState(currentFile.path, useNoteStore.getState(), useAIChatStore.getState(), useSessionStore.getState());
    }
  }, [currentFile, isHydrated]);

  useEffect(() => {
    if (currentFile && isHydrated) {
      console.log('[MainLayout] Saving file to session:', currentFile.path)
      useSessionStore.getState().setCurrentFile(currentFile.id, currentFile.path, currentPage, 0)
      addToFileHistory(currentFile.id, currentFile.path, currentFile.name)
      
      // Save previous file's notes/chat and load new file's notes/chat
      if (previousFileRef.current && previousFileRef.current.id !== currentFile.id) {
        console.log('[MainLayout] Switching from', previousFileRef.current.name, 'to', currentFile.name)
        const { saveCurrentDocumentState, loadDocumentState } = useFileStore.getState()
        // Save the PREVIOUS file's notes, not the new one
        saveCurrentDocumentState(useNoteStore.getState(), useAIChatStore.getState(), useSessionStore.getState(), previousFileRef.current)
        loadDocumentState(currentFile.path, useNoteStore.getState(), useAIChatStore.getState(), useSessionStore.getState())
      }
      previousFileRef.current = currentFile
    }
  }, [currentFile, currentPage, isHydrated, addToFileHistory])

  // Save AI config to Rust backend when it changes
  const aiConfig = useAIChatStore((state) => state.config)
  useEffect(() => {
    if (aiConfig) {
      console.log('[MainLayout] Saving AI config to backend:', aiConfig.provider)
      updateAIConfig(aiConfig)
    }
  }, [aiConfig])

  // Save AI chat history when it changes
  const chatHistory = useAIStore((state) => state.chatHistory)
  useEffect(() => {
    if (isHydrated && chatHistory.length > 0) {
      console.log('[MainLayout] Saving chat history to session, length:', chatHistory.length)
      useSessionStore.getState().setChatHistory(chatHistory)
    }
  }, [chatHistory, isHydrated])

  const handleThemeToggle = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    toggleTheme()
    setSessionTheme(newTheme)
    updateGlobal({ theme: newTheme })
  }

  // Handle layout changes from the Group - only fires after user releases drag
  const handleMainGroupLayoutChange = (layout: { [panelId: string]: number }) => {
    if (!panelSizesRestored || !layout) return
    
    console.log('[MainLayout] Main group layout changed:', layout)
    
    // Check if translation panel is being added or removed by comparing with previous state
    const hasTranslationPanel = layout.translation !== undefined
    const wasActive = prevTranslationActive.current
    
    // Skip if we're in a transition (translation panel appearing/disappearing)
    if (hasTranslationPanel !== wasActive) {
      console.log('[MainLayout] Skipping layout save - translation panel transition')
      // Update our ref to track current state
      prevTranslationActive.current = isTranslationActive
      return
    }
    
    // Only save layout for normal changes (not during transitions)
    if (layout.sidebar !== undefined) {
      setPanelSize('sidebar', layout.sidebar)
    }
    if (layout.file !== undefined) {
      setPanelSize('file', layout.file)
    }
    if (layout.translation !== undefined && isTranslationActive) {
      setPanelSize('translation', layout.translation)
    }
  }
  
  // Update ref when translation state changes
  useEffect(() => {
    prevTranslationActive.current = isTranslationActive
  }, [isTranslationActive])

  const handleRightGroupLayoutChange = (layout: { [panelId: string]: number }) => {
    if (panelSizesRestored && layout) {
      console.log('[MainLayout] Right group layout changed:', layout)
      if (layout.ai !== undefined) {
        setPanelSize('ai', layout.ai)
      }
      if (layout.note !== undefined) {
        setPanelSize('note', layout.note)
      }
    }
  }

  // Classroom mode overlay
  if (isClassroomActive) {
    return (
      <div className="app-container h-screen w-screen overflow-hidden">
        <ClassroomView />
      </div>
    )
  }

  return (
    <div className="app-container h-screen w-screen overflow-hidden">
      <Group orientation="horizontal" className="h-full" id="main-group" groupRef={mainGroupRef} onLayoutChanged={handleMainGroupLayoutChange}>
        {/* Left Sidebar: File Browser */}
        <Panel
          id="sidebar"
          defaultSize={session.panels.sidebar}
          minSize={5}
          className="sidebar-panel"
        >
          {showFileBrowser && hasFileBrowser && (
            <SidebarTabs 
              context={pluginContext}
              onToggleTheme={handleThemeToggle}
              onOpenSettings={() => setShowSettings(true)}
              theme={theme}
            />
          )}
          {showFileBrowser && !hasFileBrowser && (
            <div className="flex items-center justify-center h-full text-[var(--sidebar-fg)] opacity-50 p-4">
              <p>Loading file browser...</p>
            </div>
          )}
        </Panel>
        <Separator className="panel-resize-handle" />

        {/* Main Content Area: File View */}
        <Panel
          id="file"
          defaultSize={session.panels.file}
          minSize={20}
        >
          <FileView />
        </Panel>

        {/* Translation Panel - only render when active */}
        {isTranslationActive && (
          <>
            <Separator className="panel-resize-handle" />
            <Panel
              id="translation"
              defaultSize={session.panels.translation || session.panels.file}
              minSize={20}
              className="translation-panel"
            >
              <TranslationView />
            </Panel>
          </>
        )}

        {/* Right Panel: AI + Notes (vertical) */}
        <Panel
          id="right"
          defaultSize={isTranslationActive ? (session.panels.ai + session.panels.note) / 2 : session.panels.ai + session.panels.note}
          minSize={20}
        >
          <Group orientation="vertical" className="h-full" groupRef={rightGroupRef} onLayoutChanged={handleRightGroupLayoutChange}>
            <Panel id="ai" defaultSize={session.panels.ai} minSize={20}>
              <AIView />
            </Panel>
            <Separator className="panel-resize-handle-vertical" />
            <Panel id="note" defaultSize={session.panels.note} minSize={20}>
              <NoteView />
            </Panel>
          </Group>
        </Panel>
      </Group>

      {/* Settings Modal */}
      <SettingsView isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  )
}

export default MainLayout

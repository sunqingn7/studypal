import { useState, useEffect } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { useFileStore } from '../../application/store/file-store'
import { useThemeStore } from '../../application/store/theme-store'
import { pluginRegistry } from '../../infrastructure/plugins/plugin-registry'
import { FileBrowserView } from '../../plugins/file-browser-view/FileBrowserView'
import FileView from '../components/views/file-view/FileView'
import NoteView from '../components/views/note-view/NoteView'
import AIView from '../components/views/ai-view/AIView'
import { Sun, Moon } from 'lucide-react'

function MainLayout() {
  const { currentFile } = useFileStore()
  const { theme, toggleTheme } = useThemeStore()
  const [showFileBrowser, setShowFileBrowser] = useState(true)
  const [hasFileBrowser, setHasFileBrowser] = useState(false)

  const pluginContext = {
    filePath: currentFile?.path
  }

  useEffect(() => {
    const checkPlugins = () => {
      const viewPlugins = pluginRegistry.getViewPluginsForContext(pluginContext)
      setHasFileBrowser(viewPlugins.some(v => v.metadata.id === 'file-browser-view'))
    }
    
    checkPlugins()
    const timer = setTimeout(checkPlugins, 500)
    return () => clearTimeout(timer)
  }, [pluginContext])

 return (
    <div className="app-container h-screen w-screen overflow-hidden">
      <Group orientation="horizontal" className="h-full" id="main-group">
        {/* Left Sidebar: File Browser */}
        <Panel 
          id="sidebar" 
          defaultSize={25} 
          minSize={5}
          className="sidebar-panel"
        >
        {showFileBrowser && hasFileBrowser && <FileBrowserView context={pluginContext} />}
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
          defaultSize={35} 
          minSize={20}
        >
          <FileView />
        </Panel>
        
        <Separator className="panel-resize-handle" />
        
        {/* Right Panel: AI + Notes (vertical) */}
        <Panel 
          id="right" 
          defaultSize={40} 
          minSize={20}
        >
          <Group orientation="vertical" className="h-full">
            <Panel id="ai" defaultSize={50} minSize={20}>
              <AIView />
            </Panel>
            <Separator className="panel-resize-handle-vertical" />
            <Panel id="note" defaultSize={50} minSize={20}>
              <NoteView />
            </Panel>
          </Group>
        </Panel>
      </Group>
       
       {/* Toggle button for file browser */}
       <button
         onClick={() => setShowFileBrowser(!showFileBrowser)}
         className="fixed left-2 top-20 z-50 p-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded shadow-md hover:bg-[var(--bg-tertiary)] transition-colors"
         title={showFileBrowser ? 'Hide File Browser' : 'Show File Browser'}
       >
         {showFileBrowser ? '◀' : '▶'}
       </button>

       {/* Theme toggle button */}
       <button
         onClick={toggleTheme}
         className="fixed left-2 top-6 z-50 p-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded shadow-md hover:bg-[var(--bg-tertiary)] transition-colors"
         title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
       >
         {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
       </button>
     </div>
  )
}

export default MainLayout

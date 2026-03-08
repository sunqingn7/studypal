import { useEffect, useState, useCallback, useMemo } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { useFileStore, createFileMetadata } from '../../../../application/store/file-store'
import { useTopicStore } from '../../../../application/store/topic-store'
import { pluginRegistry } from '../../../../infrastructure/plugins/plugin-registry'
import { FileHandlerPlugin, PluginContext } from '../../../../domain/models/plugin'
import PDFViewer from './PDFViewer'
import TextViewer from './TextViewer'
import './FileView.css'
import type { FileType } from '../../../../domain/models/file'

function FileView() {
  const { currentFile, setCurrentFile } = useFileStore()
  const { activeTopicId, addFileToTopic } = useTopicStore()
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [fileData, setFileData] = useState<Uint8Array | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [PluginComponent, setPluginComponent] = useState<React.ComponentType<{ filePath: string }> | null>(null)

  // Get available file handlers from plugins
  const getPluginHandler = useCallback((filePath: string): FileHandlerPlugin | undefined => {
    const handlers = pluginRegistry.getFileHandlers()
    return handlers.find(h => h.canHandle(filePath))
  }, [])

  // Get available view plugins
  const getViewPlugins = useCallback((context: PluginContext) => {
    return pluginRegistry.getViewPluginsForContext(context)
  }, [])

  const loadTextFile = useCallback(async (path: string) => {
    setLoading(true)
    setError(null)
    setPluginComponent(null)
    try {
      const { readTextFile } = await import('@tauri-apps/plugin-fs')
      const content = await readTextFile(path)
      setFileContent(content)
    } catch (err) {
      console.error('Error reading file:', err)
      setError('Failed to load file')
      setFileContent(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadFileWithPlugin = useCallback(async (path: string) => {
    setLoading(true)
    setError(null)
    setFileContent(null)
    
    const handler = getPluginHandler(path)
    if (handler) {
      try {
        const Component = handler.renderFile(path)
        if (Component) {
          setPluginComponent(() => Component)
          setLoading(false)
          return
        }
        // Fallback to text extraction
        const content = await handler.getFileContent(path)
        setFileContent(content)
      } catch (err) {
        console.error('Error loading file with plugin:', err)
        setError('Failed to load file with plugin')
      }
    } else {
      setError('No plugin available to handle this file type')
    }
    setLoading(false)
  }, [getPluginHandler])

  useEffect(() => {
    if (currentFile) {
      if (currentFile.type === 'pdf') {
        setFileContent(null)
        setPluginComponent(null)
        setLoading(false)
      } else if (currentFile.type === 'epub') {
        loadFileWithPlugin(currentFile.path)
      } else {
        loadTextFile(currentFile.path)
      }
    } else {
      setFileContent(null)
      setPluginComponent(null)
    }
  }, [currentFile, loadTextFile, loadFileWithPlugin])

  // Listen for file-open events from plugins
  useEffect(() => {
    const handleOpenFile = async (e: Event) => {
      const customEvent = e as CustomEvent
      const fileInfo = customEvent.detail
      
      if (fileInfo && fileInfo.path) {
        try {
          // File info already contains everything from backend
          const metadata = createFileMetadata(fileInfo.path, fileInfo.name, fileInfo.size || 0)
          
          // Determine file type based on extension
          const ext = fileInfo.extension?.toLowerCase() || ''
          if (ext === 'pdf') {
            metadata.type = 'pdf'
          } else if (ext === 'epub') {
            metadata.type = 'epub'
          } else {
            metadata.type = 'txt'
          }
          
          // Store file data if available from backend
          if (fileInfo.content && Array.isArray(fileInfo.content)) {
            setFileData(new Uint8Array(fileInfo.content))
          } else {
            setFileData(null)
          }
          
          setCurrentFile(metadata)
          
          if (activeTopicId) {
            addFileToTopic(metadata.id, activeTopicId)
          }
        } catch (err) {
          console.error('Error opening file from plugin:', err)
          setError('Failed to open file')
        }
      }
    }

    window.addEventListener('open-file', handleOpenFile)
    return () => window.removeEventListener('open-file', handleOpenFile)
  }, [activeTopicId, setCurrentFile, addFileToTopic])

  const handleOpenFile = async () => {
    try {
      // Build file filters from registered plugins
      const fileHandlers = pluginRegistry.getFileHandlers()
      const pluginExtensions = fileHandlers.flatMap(h => h.supportedExtensions)
      
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: 'All Supported Files',
            extensions: ['pdf', 'txt', 'md', 'markdown', 'json', 'js', 'ts', 'html', 'css', 'epub', ...pluginExtensions.map(e => e.replace('.', ''))],
          },
          { name: 'PDF', extensions: ['pdf'] },
          { name: 'EPUB', extensions: ['epub'] },
          { name: 'Text', extensions: ['txt', 'md', 'markdown', 'json', 'js', 'ts', 'html', 'css'] },
          ...fileHandlers.map(h => ({
            name: `${h.metadata.name}`,
            extensions: h.supportedExtensions.map(e => e.replace('.', '')),
          })),
        ],
      })

      if (selected && typeof selected === 'string') {
        const path = selected
        const name = path.split(/[/\\]/).pop() || 'unknown'
      const ext = name.split('.').pop()?.toLowerCase() || ''

      let fileType: FileType
      if (ext === 'pdf') fileType = 'pdf'
      else if (ext === 'epub') fileType = 'epub'
      else fileType = 'txt'

        const metadata = createFileMetadata(path, name, 0)
        metadata.type = fileType
        
        setCurrentFile(metadata)

        if (activeTopicId) {
          addFileToTopic(metadata.id, activeTopicId)
        }
      }
    } catch (err) {
      console.error('Error opening file:', err)
      setError('Failed to open file')
    }
  }

  // Get view plugins for current context
  const viewPlugins = useMemo(() => {
    if (!currentFile) return []
    const context: PluginContext = { filePath: currentFile.path }
    return getViewPlugins(context)
  }, [currentFile, getViewPlugins])

  const renderContent = () => {
    if (!currentFile) {
      return (
        <div className="file-view-empty">
          <div className="empty-icon">📄</div>
          <h3>No file open</h3>
          <p>Open a PDF, EPUB, or text file to start studying</p>
          <button className="open-button" onClick={handleOpenFile}>
            Open File
          </button>
        </div>
      )
    }

    if (loading) {
      return (
        <div className="file-view-loading">
          <div className="spinner"></div>
          <p>Loading file...</p>
        </div>
      )
    }

    if (error) {
      return (
        <div className="file-view-error">
          <p>{error}</p>
          <button onClick={handleOpenFile}>Try another file</button>
        </div>
      )
    }

    // Render plugin component if available
    if (PluginComponent) {
      return <PluginComponent filePath={currentFile.path} />
    }

    // Default viewers
    if (currentFile.type === 'pdf') {
      return <PDFViewer path={currentFile.path} fileData={fileData} />
    }

    if (fileContent !== null) {
      return <TextViewer content={fileContent} />
    }

    return null
  }

  return (
    <div className="view-container file-view">
      <div className="view-header">
        <span className="file-title">
          {currentFile ? currentFile.name : 'File View'}
        </span>
        <div className="header-actions">
          {viewPlugins.length > 0 && (
            <select className="view-selector">
              <option value="default">Default View</option>
              {viewPlugins.map(plugin => (
                <option key={plugin.metadata.id} value={plugin.metadata.id}>
                  {plugin.getViewName()}
                </option>
              ))}
            </select>
          )}
          <button className="header-button" onClick={handleOpenFile} title="Open File">
            📂
          </button>
        </div>
      </div>
      <div className="view-content file-view-content">
        {renderContent()}
      </div>
    </div>
  )
}

export default FileView

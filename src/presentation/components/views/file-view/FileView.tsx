import { useEffect, useState, useCallback } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { readTextFile } from '@tauri-apps/plugin-fs'
import { useFileStore, createFileMetadata } from '../../../../application/store/file-store'
import { useTopicStore } from '../../../../application/store/topic-store'
import PDFViewer from './PDFViewer'
import TextViewer from './TextViewer'
import './FileView.css'

function FileView() {
  const { currentFile, setCurrentFile } = useFileStore()
  const { activeTopicId, addFileToTopic } = useTopicStore()
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadFile = useCallback(async (path: string) => {
    setLoading(true)
    setError(null)
    try {
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

  useEffect(() => {
    if (currentFile) {
      loadFile(currentFile.path)
    } else {
      setFileContent(null)
    }
  }, [currentFile, loadFile])

  const handleOpenFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: 'Supported Files',
            extensions: ['pdf', 'txt', 'md', 'markdown', 'json', 'js', 'ts', 'html', 'css'],
          },
          { name: 'PDF', extensions: ['pdf'] },
          { name: 'Text', extensions: ['txt', 'md', 'markdown', 'json', 'js', 'ts', 'html', 'css'] },
        ],
      })

      if (selected && typeof selected === 'string') {
        const path = selected
        const name = path.split(/[/\\]/).pop() || 'unknown'
        
        const metadata = createFileMetadata(path, name, 0)
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

  const renderContent = () => {
    if (!currentFile) {
      return (
        <div className="file-view-empty">
          <div className="empty-icon">📄</div>
          <h3>No file open</h3>
          <p>Open a PDF or text file to start studying</p>
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

    if (currentFile.type === 'pdf') {
      return <PDFViewer path={currentFile.path} />
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
        <button className="header-button" onClick={handleOpenFile} title="Open File">
          📂
        </button>
      </div>
      <div className="view-content file-view-content">
        {renderContent()}
      </div>
    </div>
  )
}

export default FileView

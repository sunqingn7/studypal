import { useClassroomStore } from '../../../../application/store/classroom-store'
import PDFViewer from '../file-view/PDFViewer'
import './DocumentPanel.css'

export function DocumentPanel() {
  const { documentPath, documentContent, currentPage, totalPages, nextPage, prevPage, isPaused, pauseClassroom, resumeClassroom } = useClassroomStore()

  const isPDF = documentPath?.toLowerCase().endsWith('.pdf')

  return (
    <div className="document-panel">
      <div className="document-header">
        <span className="document-title">Document</span>
        <div className="document-controls">
          <button className="doc-nav-btn" onClick={prevPage} disabled={currentPage <= 1}>
            ←
          </button>
          <span className="doc-page-indicator">{currentPage} / {totalPages}</span>
          <button className="doc-nav-btn" onClick={nextPage} disabled={currentPage >= totalPages}>
            →
          </button>
          <button
            className="doc-pause-btn"
            onClick={isPaused ? resumeClassroom : pauseClassroom}
          >
            {isPaused ? '▶' : '⏸'}
          </button>
        </div>
      </div>

      <div className="document-content">
        {documentPath ? (
          isPDF ? (
            <PDFViewer path={documentPath} initialPage={currentPage} />
          ) : (
            <div className="document-page">
              <pre className="document-text">{documentContent || 'Loading content...'}</pre>
            </div>
          )
        ) : (
          <div className="document-placeholder">
            <div className="placeholder-icon">📄</div>
            <p>No document loaded</p>
          </div>
        )}
      </div>
    </div>
  )
}

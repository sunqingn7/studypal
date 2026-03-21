import { useClassroomStore } from '../../../../application/store/classroom-store'
import { PPTPanel } from './PPTPanel'
import { DocumentPanel } from './DocumentPanel'
import { ChatPanel } from './ChatPanel'
import { NotePanel } from './NotePanel'
import './ClassroomView.css'

export function ClassroomView() {
  const { isActive, stopClassroom, currentPage, totalPages, completionPercentage } = useClassroomStore()

  if (!isActive) return null

  return (
    <div className="classroom-view">
      <div className="classroom-header">
        <div className="classroom-title">
          <span className="classroom-icon">🎓</span>
          <span>Classroom Mode</span>
        </div>
        <div className="classroom-controls">
          <div className="classroom-progress">
            <span>Page {currentPage} of {totalPages}</span>
            <span className="progress-bar">
              <span className="progress-fill" style={{ width: `${completionPercentage}%` }} />
            </span>
            <span>{completionPercentage}% complete</span>
          </div>
          <button 
            className="classroom-exit-btn" 
            onClick={stopClassroom}
          >
            Exit Classroom
          </button>
        </div>
      </div>
      
      <div className="classroom-main">
        <div className="classroom-top">
          <div className="ppt-panel-container">
            <PPTPanel />
          </div>
          <div className="document-panel-container">
            <DocumentPanel />
          </div>
        </div>
        
        <div className="classroom-bottom">
          <div className="chat-panel-container">
            <ChatPanel />
          </div>
          <div className="note-panel-container">
            <NotePanel />
          </div>
        </div>
      </div>
    </div>
  )
}

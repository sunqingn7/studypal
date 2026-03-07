import { useRef, useEffect } from 'react'
import './TextViewer.css'

interface TextViewerProps {
  content: string
}

function TextViewer({ content }: TextViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0
    }
  }, [content])

  return (
    <div className="text-viewer" ref={containerRef}>
      <pre className="text-content">{content}</pre>
    </div>
  )
}

export default TextViewer

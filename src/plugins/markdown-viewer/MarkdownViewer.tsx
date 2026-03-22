import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';
import './MarkdownViewer.css';
import { FileText, Copy, Maximize2, Minimize2, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { FileReadingService } from '../../infrastructure/file-handlers/file-reading-service';
import { PluginContext } from '../../domain/models/plugin';

interface MarkdownViewerProps {
  context: PluginContext;
}

export const MarkdownViewer: React.FC<MarkdownViewerProps> = ({ context }) => {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [fontSize, setFontSize] = useState(16);

  useEffect(() => {
    const loadMarkdown = async () => {
      if (!context.filePath || !context.filePath.endsWith('.md')) {
        setError('No markdown file opened');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        // Use FileReadingService to avoid permission issues
        const text = await FileReadingService.readTextFile(context.filePath);
        setContent(text);
        setError(null);
      } catch (err) {
        setError(`Failed to load markdown file: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setLoading(false);
      }
    };

    loadMarkdown();
  }, [context.filePath]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const customStyles: React.CSSProperties = {
    padding: '24px',
    maxWidth: '100%',
    lineHeight: '1.7',
    fontSize: `${fontSize}px`,
    color: 'var(--text-primary)',
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-[var(--bg-primary)]">
        <div className="text-[var(--text-secondary)]">Loading markdown file...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[var(--bg-primary)] p-8 text-center">
        <FileText className="w-12 h-12 text-red-500 mb-4" />
        <h3 className="text-lg font-semibold text-red-500 mb-2">Error</h3>
        <p className="text-[var(--text-secondary)]">{error}</p>
      </div>
    );
  }

  return (
    <div className={`h-full flex flex-col bg-[var(--bg-primary)] ${fullscreen ? 'fixed inset-0 z-50' : ''}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[var(--bg-secondary)] border-b border-[var(--border-color)]">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-[var(--text-secondary)]" />
          <span className="text-sm text-[var(--text-secondary)]">Markdown Preview</span>
        </div>
<div className="flex items-center gap-1">
              <button
                onClick={handleCopy}
                className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded transition-colors"
                title="Copy content"
              >
                <Copy className="w-4 h-4 text-[var(--text-secondary)]" />
              </button>
              <div className="w-px h-4 bg-[var(--border-color)] mx-1" />
              <button
                onClick={() => setFontSize(prev => Math.max(10, prev - 2))}
                className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded transition-colors"
                title="Decrease font size"
              >
                <ZoomOut className="w-4 h-4 text-[var(--text-secondary)]" />
              </button>
              <span className="text-xs text-[var(--text-secondary)] w-8 text-center">{fontSize}px</span>
              <button
                onClick={() => setFontSize(prev => Math.min(32, prev + 2))}
                className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded transition-colors"
                title="Increase font size"
              >
                <ZoomIn className="w-4 h-4 text-[var(--text-secondary)]" />
              </button>
              <button
                onClick={() => setFontSize(16)}
                className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded transition-colors"
                title="Reset font size"
              >
                <RotateCcw className="w-4 h-4 text-[var(--text-secondary)]" />
              </button>
              <div className="w-px h-4 bg-[var(--border-color)] mx-1" />
          <button
            onClick={() => setFullscreen(!fullscreen)}
            className="p-1.5 hover:bg-[var(--bg-tertiary)] rounded transition-colors"
            title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {fullscreen ? (
              <Minimize2 className="w-4 h-4 text-[var(--text-secondary)]" />
            ) : (
              <Maximize2 className="w-4 h-4 text-[var(--text-secondary)]" />
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div style={customStyles} className="markdown-content">
<ReactMarkdown
              remarkPlugins={[remarkMath, remarkGfm]}
              rehypePlugins={[rehypeRaw, rehypeKatex]}
            >
              {content}
            </ReactMarkdown>
        </div>
      </div>
      </div>
  );
};

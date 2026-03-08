import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { FileText, Copy, Maximize2, Minimize2 } from 'lucide-react';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { PluginContext } from '../../domain/models/plugin';

interface MarkdownViewerProps {
  context: PluginContext;
}

export const MarkdownViewer: React.FC<MarkdownViewerProps> = ({ context }) => {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const loadMarkdown = async () => {
      if (!context.filePath || !context.filePath.endsWith('.md')) {
        setError('No markdown file opened');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const text = await readTextFile(context.filePath);
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
    fontSize: '16px',
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
        <div style={customStyles}>
          <ReactMarkdown
            remarkPlugins={[remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={{
              h1: ({ children }) => (
                <h1 className="text-3xl font-bold mt-6 mb-4 pb-2 border-b border-[var(--border-color)]">
                  {children}
                </h1>
              ),
              h2: ({ children }) => (
                <h2 className="text-2xl font-bold mt-5 mb-3">{children}</h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-xl font-bold mt-4 mb-2">{children}</h3>
              ),
              h4: ({ children }) => (
                <h4 className="text-lg font-bold mt-3 mb-2">{children}</h4>
              ),
              p: ({ children }) => (
                <p className="mb-4">{children}</p>
              ),
              ul: ({ children }) => (
                <ul className="list-disc list-inside mb-4 ml-4">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="list-decimal mb-4 ml-4">{children}</ol>
              ),
              li: ({ children }) => (
                <li className="mb-1">{children}</li>
              ),
              blockquote: ({ children }) => (
                <blockquote className="border-l-4 border-[var(--accent-color)] pl-4 py-1 my-4 italic text-[var(--text-secondary)] bg-[var(--bg-secondary)] rounded-r">
                  {children}
                </blockquote>
              ),
              code: ({ children, node }) => {
                // Check if this is a code block by looking at the node type
                const isCodeBlock = node && (node as any).type === 'element' && (node as any).tagName === 'pre';
                if (isCodeBlock) {
                  return (
                    <pre className="bg-[var(--bg-secondary)] p-4 rounded-lg overflow-x-auto my-4 border border-[var(--border-color)]">
                      <code className="font-mono text-sm">{children}</code>
                    </pre>
                  );
                }
                return (
                  <code className="px-1.5 py-0.5 bg-[var(--bg-tertiary)] rounded text-sm font-mono">
                    {children}
                  </code>
                );
              },
              table: ({ children }) => (
                <div className="overflow-x-auto my-4">
                  <table className="min-w-full border-collapse border border-[var(--border-color)]">
                    {children}
                  </table>
                </div>
              ),
              th: ({ children }) => (
                <th className="border border-[var(--border-color)] px-3 py-2 bg-[var(--bg-secondary)] font-semibold text-left">
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td className="border border-[var(--border-color)] px-3 py-2">{children}</td>
              ),
              a: ({ href, children }) => (
                <a
                  href={href}
                  className="text-[var(--accent-color)] hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {children}
                </a>
              ),
              strong: ({ children }) => (
                <strong className="font-bold">{children}</strong>
              ),
              em: ({ children }) => (
                <em className="italic">{children}</em>
              ),
              hr: () => (
                <hr className="my-6 border-t border-[var(--border-color)]" />
              ),
              img: ({ src, alt }) => (
                <img
                  src={src || ''}
                  alt={alt || ''}
                  className="max-w-full h-auto my-4 rounded-lg"
                />
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      </div>

      {/* KaTeX styles */}
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css"
      />
    </div>
  );
};

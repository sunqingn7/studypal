import React, { useState, useEffect, useCallback } from 'react';
import { PluginContext, FileItem } from '../../domain/models/plugin';
import { invoke } from '@tauri-apps/api/core';
import { 
  ChevronRight, 
  ChevronDown, 
  Folder, 
  FolderOpen, 
  FileText,
  FileCode,
  FileImage,
  FileJson,
  FileType2,
  RefreshCw 
} from 'lucide-react';

interface FileBrowserViewProps {
  context: PluginContext;
}

interface TreeNode {
  item: FileItem;
  children: TreeNode[];
  isExpanded: boolean;
  isLoading: boolean;
}

// File icon based on extension
const getFileIcon = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  switch (ext) {
    case 'pdf':
      return <FileText className="w-4 h-4 text-red-500 dark:text-red-400" />;
    case 'epub':
      return <FileText className="w-4 h-4 text-blue-500 dark:text-blue-400" />;
    case 'txt':
      return <FileText className="w-4 h-4 text-gray-500 dark:text-gray-400" />;
    case 'md':
      return <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
    case 'js':
    case 'jsx':
      return <FileCode className="w-4 h-4 text-yellow-500 dark:text-yellow-400" />;
    case 'ts':
    case 'tsx':
      return <FileCode className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
    case 'json':
      return <FileJson className="w-4 h-4 text-yellow-500 dark:text-yellow-400" />;
    case 'html':
    case 'htm':
      return <FileCode className="w-4 h-4 text-orange-500 dark:text-orange-400" />;
    case 'tex':
    case 'latex':
      return <FileText className="w-4 h-4 text-teal-500 dark:text-teal-400" />;
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
      return <FileImage className="w-4 h-4 text-purple-500 dark:text-purple-400" />;
    default:
      return <FileType2 className="w-4 h-4 text-gray-500 dark:text-gray-400" />;
  }
};

export const FileBrowserView: React.FC<FileBrowserViewProps> = ({ context }) => {
  const [rootPath, setRootPath] = useState<string>('');
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const loadDirectory = useCallback(async (path: string): Promise<FileItem[]> => {
    try {
      const items: FileItem[] = await invoke('list_directory', { path });
      return items.sort((a, b) => {
        if (a.type === 'directory' && b.type === 'file') return -1;
        if (a.type === 'file' && b.type === 'directory') return 1;
        return a.name.localeCompare(b.name);
      });
    } catch (err) {
      console.error('Error loading directory:', err);
      throw err;
    }
  }, []);

  useEffect(() => {
    const initialize = async () => {
      if (!context.filePath) {
        setError('No file opened');
        return;
      }

      try {
        const parentDir = await invoke<string>('get_parent_directory', {
          filePath: context.filePath
        });

        setRootPath(parentDir);
        const items = await loadDirectory(parentDir);

        // Create root node for the current folder
        const rootItem: FileItem = {
          name: parentDir.split('/').pop() || 'Explorer',
          path: parentDir,
          type: 'directory',
          size: undefined,
          lastModified: new Date(0)
        };

        const tree: TreeNode[] = [{
          item: rootItem,
          children: items.map(item => ({
            item,
            children: [],
            isExpanded: false,
            isLoading: false
          })),
          isExpanded: true,
          isLoading: false
        }];

        setTreeData(tree);
        setError(null);
      } catch (err) {
        setError('Failed to load directory structure');
        console.error(err);
      }
    };

    initialize();
  }, [context.filePath, loadDirectory]);

  // Sync selected path with opened file
  useEffect(() => {
    if (context.filePath) {
      setSelectedPath(context.filePath);
    }
  }, [context.filePath]);

  const toggleNode = async (node: TreeNode, index: number, parentPath: number[] = []) => {
    if (node.item.type !== 'directory') return;

    const newTreeData = [...treeData];
    let current = newTreeData;

    for (const i of parentPath) {
      current = current[i].children;
    }

    if (node.children.length === 0 && !node.isExpanded) {
      current[index].isLoading = true;
      setTreeData(newTreeData);

      try {
        const items = await loadDirectory(node.item.path);
        current[index].children = items.map(item => ({
          item,
          children: [],
          isExpanded: false,
          isLoading: false
        }));
      } catch (err) {
        console.error('Error loading subdirectory:', err);
      } finally {
        current[index].isLoading = false;
      }
    }

    current[index].isExpanded = !current[index].isExpanded;
    setTreeData(newTreeData);
  };

// Track pending file opens to prevent duplicates
const pendingFileOpens = new Set<string>();

const handleFileClick = async (filePath: string) => {
  // Prevent duplicate clicks on the same file
  if (pendingFileOpens.has(filePath)) {
    return;
  }

  pendingFileOpens.add(filePath);

  try {
    const fileInfo = await invoke('open_file_from_browser', { filePath });

    if (fileInfo) {
      const event = new CustomEvent('open-file', {
        detail: fileInfo
      });
      window.dispatchEvent(event);
    }
  } catch (err) {
    console.error('Error opening file from browser:', err);
    setError(`Failed to open file: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    // Remove from pending after a delay to prevent rapid re-clicks
    setTimeout(() => {
      pendingFileOpens.delete(filePath);
    }, 500);
  }
};

  const refresh = async () => {
    if (!rootPath) return;

    try {
      const items = await loadDirectory(rootPath);
      setTreeData(items.map(item => ({
        item,
        children: [],
        isExpanded: false,
        isLoading: false
      })));
    } catch (err) {
      console.error('Error refreshing:', err);
    }
  };

const renderTreeNode = (node: TreeNode, index: number, depth: number = 0, parentPath: number[] = []) => {
    const isSelected = node.item.path === selectedPath;
    const isOpened = node.item.path === context.filePath;
    const isRoot = depth === 0;
    const indentWidth = depth * 16;

    return (
      <div key={node.item.path} className="mb-0.5">
        <div
          className={`
          group flex items-baseline px-2 cursor-pointer py-1
          hover:bg-[var(--sidebar-hover-bg)]
          ${isSelected ? 'bg-[var(--sidebar-active-bg)]' : ''}
          ${isOpened ? 'font-semibold text-[var(--accent-color)]' : ''}
          ${isRoot ? 'font-semibold' : ''}
        `}
          style={{
            paddingLeft: `${indentWidth + 4}px`,
            color: isSelected ? 'var(--sidebar-active-fg)' : (isOpened ? 'var(--accent-color)' : 'var(--sidebar-fg)')
          }}
          onClick={() => {
            setSelectedPath(node.item.path);
            if (node.item.type === 'directory') {
              toggleNode(node, index, parentPath);
            }
          }}
          onDoubleClick={() => {
            if (node.item.type === 'file') {
              handleFileClick(node.item.path);
            }
          }}
        >
        {/* Chevron for folders (except root) */}
        {!isRoot && node.item.type === 'directory' && (
          <span className="w-4 h-4 flex items-center justify-center flex-shrink-0 mr-0.5 opacity-60">
            {node.isLoading ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : node.isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </span>
        )}

        {/* Icon */}
        <span className="w-4 h-4 flex items-center justify-center flex-shrink-0 mr-1.5">
          {node.item.type === 'directory' ? (
            node.isExpanded ? (
              <FolderOpen className="w-4 h-4 text-[var(--folder-open-color)]" />
            ) : (
              <Folder className="w-4 h-4 text-[var(--folder-color)]" />
            )
          ) : (
            getFileIcon(node.item.name)
          )}
        </span>

        {/* Filename */}
        <span
          className="truncate flex-1 select-none"
          style={{ fontSize: '14px', lineHeight: '1' }}
        >
          {node.item.name}
        </span>
      </div>

        {/* Children */}
        {node.isExpanded && node.children.length > 0 && (
          <div>
            {node.children.map((child, childIndex) =>
              renderTreeNode(child, childIndex, depth + 1, [...parentPath, index])
            )}
          </div>
        )}
      </div>
    );
  };

  

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--sidebar-fg)] p-4 bg-[var(--sidebar-bg)]" style={{ fontSize: '14px' }}>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[var(--sidebar-bg)]">
      {/* Header */}
      <div className="flex items-center justify-between h-[28px] px-1 bg-[var(--sidebar-bg)] text-[var(--sidebar-fg)]">
        <span className="text-[11px] font-semibold px-2 select-none">
          EXPLORER
        </span>
        <button
          onClick={refresh}
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-[var(--sidebar-hover-bg)] text-[var(--sidebar-fg)]"
          title="Refresh"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      {/* File tree */}
      <div className="flex-1 overflow-auto">
        {treeData.map((node, index) => renderTreeNode(node, index))}
      </div>
    </div>
  );
};

export default FileBrowserView;

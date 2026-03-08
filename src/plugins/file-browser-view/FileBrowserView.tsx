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
      return <FileText className="w-4 h-4 text-red-400" />;
    case 'epub':
      return <FileText className="w-4 h-4 text-blue-400" />;
    case 'txt':
    case 'md':
      return <FileText className="w-4 h-4 text-gray-400" />;
    case 'js':
    case 'ts':
    case 'jsx':
    case 'tsx':
      return <FileCode className="w-4 h-4 text-yellow-400" />;
    case 'json':
      return <FileJson className="w-4 h-4 text-yellow-300" />;
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
      return <FileImage className="w-4 h-4 text-purple-400" />;
    default:
      return <FileType2 className="w-4 h-4 text-gray-400" />;
  }
};

export const FileBrowserView: React.FC<FileBrowserViewProps> = ({ context }) => {
  const [rootPath, setRootPath] = useState<string>('');
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [error, setError] = useState<string | null>(null);

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

        const tree = items.map(item => ({
          item,
          children: [],
          isExpanded: false,
          isLoading: false
        }));

        setTreeData(tree);
        setError(null);
      } catch (err) {
        setError('Failed to load directory structure');
        console.error(err);
      }
    };

    initialize();
  }, [context.filePath, loadDirectory]);

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

  const handleFileClick = async (filePath: string) => {
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
    const isSelected = node.item.path === context.filePath;
    const indentWidth = depth * 8;

    return (
      <div key={node.item.path}>
        <div
          className={`
            group flex items-center h-[22px] px-2 cursor-pointer
            hover:bg-gray-100 dark:hover:bg-gray-700
            ${isSelected ? 'bg-blue-50 dark:bg-blue-900/30' : ''}
          `}
          style={{ paddingLeft: `${indentWidth + 8}px` }}
          onClick={() => {
            if (node.item.type === 'directory') {
              toggleNode(node, index, parentPath);
            } else {
              handleFileClick(node.item.path);
            }
          }}
        >
          {/* Chevron or spacer */}
          <span className="w-4 h-4 flex items-center justify-center flex-shrink-0 opacity-70">
            {node.item.type === 'directory' && (
              node.isLoading ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : node.isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )
            )}
          </span>

          {/* Icon */}
          <span className="w-4 h-4 flex items-center justify-center flex-shrink-0 mx-1">
            {node.item.type === 'directory' ? (
              node.isExpanded ? (
                <FolderOpen className="w-4 h-4 text-yellow-600 dark:text-yellow-500" />
              ) : (
                <Folder className="w-4 h-4 text-yellow-600 dark:text-yellow-500" />
              )
            ) : (
              getFileIcon(node.item.name)
            )}
          </span>

          {/* Filename - 13px font */}
          <span 
            className={`
              text-[13px] truncate flex-1 select-none
              ${isSelected ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-700 dark:text-gray-300'}
            `}
          >
            {node.item.name}
          </span>

          {/* File size (only show on hover or for selected) */}
          {node.item.size !== undefined && node.item.type === 'file' && (
            <span className="text-[11px] text-gray-400 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
              {formatFileSize(node.item.size)}
            </span>
          )}
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

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + sizes[i];
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 p-4 text-[13px]">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-[#252526]">
      {/* Header */}
      <div className="flex items-center justify-between h-[35px] px-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 truncate flex-1">
          {rootPath ? rootPath.split('/').pop() || 'Explorer' : 'Explorer'}
        </h3>
        <button
          onClick={refresh}
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* File tree */}
      <div className="flex-1 overflow-auto py-1">
        {treeData.map((node, index) => renderTreeNode(node, index))}
      </div>

      {/* Footer */}
      <div className="h-[22px] px-3 border-t border-gray-200 dark:border-gray-700 flex items-center text-[11px] text-gray-400">
        {treeData.length} items
      </div>
    </div>
  );
};

export default FileBrowserView;

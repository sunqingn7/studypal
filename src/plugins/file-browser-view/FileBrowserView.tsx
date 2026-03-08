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
        return <FileText className="w-4 h-4 text-[#e74c3c]" />;
      case 'epub':
        return <FileText className="w-4 h-4 text-[#4a90d9]" />;
      case 'txt':
        return <FileText className="w-4 h-4 text-[#cccccc]" />;
      case 'md':
        return <FileText className="w-4 h-4 text-[#519aba]" />;
      case 'js':
      case 'jsx':
        return <FileCode className="w-4 h-4 text-[#f7df1e]" />;
      case 'ts':
      case 'tsx':
        return <FileCode className="w-4 h-4 text-[#3178c6]" />;
      case 'json':
        return <FileJson className="w-4 h-4 text-[#f7df1e]" />;
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
        return <FileImage className="w-4 h-4 text-[#a074c4]" />;
      default:
        return <FileType2 className="w-4 h-4 text-[#cccccc]" />;
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
    const isRoot = depth === 0;
    const indentWidth = depth * 16;

    return (
      <div key={node.item.path}>
        <div
         className={`
            group flex items-center px-2 cursor-pointer
            hover:bg-[#2a2d2e]
            ${isSelected ? 'bg-[#37373d]' : ''}
            ${isRoot ? 'font-semibold' : ''}
          `}
          style={{ 
            paddingLeft: `${indentWidth + 4}px`,
            height: '24px'
          }}
          onClick={() => {
            if (node.item.type === 'directory') {
              toggleNode(node, index, parentPath);
            } else {
              handleFileClick(node.item.path);
            }
          }}
        >
          {/* Chevron for folders (except root) */}
          {!isRoot && node.item.type === 'directory' && (
            <span className="w-4 h-4 flex items-center justify-center flex-shrink-0 mr-0.5 opacity-60">
              {node.isLoading ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
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
                <FolderOpen className="w-4 h-4 text-[#dcb67a]" />
              ) : (
                <Folder className="w-4 h-4 text-[#dcb67a]" />
              )
            ) : (
              getFileIcon(node.item.name)
            )}
          </span>

          {/* Filename */}
          <span 
            className={`
              truncate flex-1 select-none
              ${isSelected ? 'text-white font-medium' : 'text-[#cccccc]'}
            `}
            style={{ fontSize: '13px' }}
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
      <div className="flex items-center justify-center h-full text-[#cccccc] p-4 bg-[#252526]" style={{ fontSize: '13px' }}>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#252526]">
      {/* Header */}
      <div className="flex items-center justify-between h-[28px] px-1 bg-[#252526] text-[#cccccc]">
        <span className="text-[11px] font-semibold px-2 select-none">
          EXPLORER
        </span>
        <button
          onClick={refresh}
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-[#37373d] text-[#cccccc]"
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5" />
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

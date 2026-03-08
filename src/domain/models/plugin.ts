export type PluginType = 'view' | 'file-handler' | 'action' | 'ai-provider' | 'mcp-server';

export interface PluginMetadata {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  type: PluginType | PluginType[];
  dependencies?: string[];
  configSchema?: Record<string, unknown>;
}

export interface PluginContext {
  filePath?: string;
  topicId?: string;
  noteId?: string;
  currentFile?: FileItem;
  selectedText?: string;
  [key: string]: unknown;
}

export interface FileItem {
  path: string;
  name: string;
  type: 'file' | 'directory';
  extension?: string;
  size?: number;
  lastModified?: Date;
  parent?: string;
}

export interface ViewPlugin extends Plugin {
  type: 'view';
  getViewComponent(): React.ComponentType<{ context: PluginContext }>;
  canHandle(context: PluginContext): boolean;
  getViewName(): string;
  getViewIcon?(): string;
}

export interface FileHandlerPlugin extends Plugin {
  type: 'file-handler';
  supportedExtensions: string[];
  canHandle(filePath: string): boolean;
  getFileContent(filePath: string): Promise<string>;
  renderFile(filePath: string): React.ComponentType<{ filePath: string }> | null;
  extractText?(filePath: string): Promise<string>;
}

export interface ActionPlugin extends Plugin {
  type: 'action';
  getActions(): PluginAction[];
  executeAction(actionId: string, context: PluginContext): Promise<void>;
}

export interface AIProviderPlugin extends Plugin {
  type: 'ai-provider';
  getProviderName(): string;
  chat(messages: Message[], config?: Record<string, unknown>): Promise<StreamResponse>;
  streamChat(messages: Message[], config?: Record<string, unknown>): AsyncGenerator<string, void, unknown>;
}

export interface MCPServerPlugin extends Plugin {
  type: 'mcp-server';
  getServerName(): string;
  getTools(): MCPTool[];
  executeTool(toolName: string, params: Record<string, unknown>): Promise<MCPToolResult>;
}

export interface FileHandlerPlugin {
  type: 'file-handler';
  supportedExtensions: string[];
  canHandle(filePath: string): boolean;
  getFileContent(filePath: string): Promise<string>;
  renderFile(filePath: string): React.ComponentType<{ filePath: string }> | null;
  extractText?(filePath: string): Promise<string>;
}

export interface ActionPlugin {
  type: 'action';
  getActions(): PluginAction[];
  executeAction(actionId: string, context: PluginContext): Promise<void>;
}

export interface PluginAction {
  id: string;
  name: string;
  description: string;
  icon?: string;
  shortcut?: string;
  contextMenu?: boolean;
  toolbar?: boolean;
}

export interface AIProviderPlugin {
  type: 'ai-provider';
  getProviderName(): string;
  chat(messages: Message[], config?: Record<string, unknown>): Promise<StreamResponse>;
  streamChat(messages: Message[], config?: Record<string, unknown>): AsyncGenerator<string, void, unknown>;
}

export interface MCPServerPlugin {
  type: 'mcp-server';
  getServerName(): string;
  getTools(): MCPTool[];
  executeTool(toolName: string, params: Record<string, unknown>): Promise<MCPToolResult>;
}

export interface MCPTool {
  name: string;
  description: string;
  parameters: MCPToolParameter[];
}

export interface MCPToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required?: boolean;
  enum?: string[];
}

export interface MCPToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface StreamResponse {
  content: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export interface Plugin {
  metadata: PluginMetadata;
  initialize(config?: Record<string, unknown>): Promise<void>;
  destroy(): Promise<void>;
  getConfig?(): Record<string, unknown>;
  setConfig?(config: Record<string, unknown>): void;
}

export type TypedPlugin = Plugin & (ViewPlugin | FileHandlerPlugin | ActionPlugin | AIProviderPlugin | MCPServerPlugin);

export interface PluginConfig {
  enabled: boolean;
  config: Record<string, unknown>;
}

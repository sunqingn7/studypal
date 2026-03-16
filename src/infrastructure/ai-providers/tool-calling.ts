import { MCPTool, MCPToolResult } from '../../domain/models/plugin';

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatWithToolsResult {
  content: string;
  toolCalls?: ToolCall[];
}

export function buildToolPrompt(tools: MCPTool[]): string {
  const toolDefinitions = tools.map(tool => {
    const requiredParams = tool.parameters
      .filter(p => p.required)
      .map(p => `${p.name} (${p.type})`)
      .join(', ');
    
    return `${tool.name}(${requiredParams || 'no params'}): ${tool.description}`;
  }).join('\n');

  return `TOOL USAGE INSTRUCTIONS:

You have access to these tools:
${toolDefinitions}

HOW TO USE TOOLS:
- ONLY use tools when you NEED external information or actions
- For normal conversation, answer directly WITHOUT any JSON
- When you MUST use a tool, output ONLY this JSON format (nothing else):
{"tool_call": {"name": "tool_name", "parameters": {"param": "value"}}}

IMPORTANT RULES:
1. Simple greetings like "hi", "hello" - respond naturally, NO tools
2. General questions you can answer - respond naturally, NO tools
3. Only use tools for: searching web, accessing notes, playing TTS
4. After tool returns, continue conversation naturally`;
}

export function parseToolCalls(response: string): ToolCall[] {
  const toolCallRegex = /\{"tool_call":\s*\{[^}]+\}\}/g;
  const matches = response.match(toolCallRegex);
  
  if (!matches) return [];
  
  const toolCalls: ToolCall[] = [];
  
  for (const match of matches) {
    try {
      const parsed = JSON.parse(match);
      if (parsed.tool_call && parsed.tool_call.name) {
        toolCalls.push({
          name: parsed.tool_call.name,
          arguments: parsed.tool_call.parameters || {}
        });
      }
    } catch {
      // Skip invalid JSON
      continue;
    }
  }
  
  return toolCalls;
}

export interface ExtractResult {
  content: string;
  thinking?: string;
}

export function extractFinalResponse(response: string, _toolCalls: ToolCall[]): ExtractResult {
  let finalResponse = response.trim();
  
  // First, try to parse as JSON with content/thinking structure (model sometimes outputs this)
  try {
    const parsed = JSON.parse(finalResponse);
    if (parsed.content && typeof parsed.content === 'string') {
      finalResponse = parsed.content;
      if (parsed.thinking && typeof parsed.thinking === 'string') {
        console.log('[ToolCalling] Extracted thinking:', parsed.thinking.slice(0, 50));
        return { content: finalResponse, thinking: parsed.thinking };
      }
      return { content: finalResponse };
    }
  } catch {
    // Not JSON, continue with normal processing
  }
  
  // Remove tool call JSON from the response (handles multiline)
  const toolCallRegex = /\{[\s\S]*?"tool_call"[\s\S]*?\}\s*\}/g;
  finalResponse = finalResponse.replace(toolCallRegex, '').trim();
  
  // If response is empty after removing tool calls, provide a default
  if (!finalResponse) {
    finalResponse = 'I have processed your request using the necessary tools.';
  }
  
  return { content: finalResponse };
}

export interface ToolExecutor {
  executeTool(toolName: string, params: Record<string, unknown>): Promise<MCPToolResult>;
}

export async function executeToolCalls(
  toolCalls: ToolCall[],
  executor: ToolExecutor,
  messages: { role: string; content: string }[]
): Promise<{ results: MCPToolResult[]; updatedMessages: { role: string; content: string }[] }> {
  const results: MCPToolResult[] = [];
  
  for (const toolCall of toolCalls) {
    console.log(`[ToolCalling] Executing tool: ${toolCall.name}`, toolCall.arguments);
    
    try {
      const result = await executor.executeTool(toolCall.name, toolCall.arguments);
      results.push(result);
      
      // Add tool result to messages for context
      messages.push({
        role: 'system',
        content: `[Tool: ${toolCall.name}] Result: ${JSON.stringify(result)}`
      });
      
      console.log(`[ToolCalling] Tool ${toolCall.name} result:`, result.success ? 'success' : 'error');
    } catch (error) {
      const errorResult: MCPToolResult = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      results.push(errorResult);
      
      messages.push({
        role: 'system',
        content: `[Tool: ${toolCall.name}] Error: ${errorResult.error}`
      });
      
      console.error(`[ToolCalling] Tool ${toolCall.name} error:`, error);
    }
  }
  
  return { results, updatedMessages: messages };
}

export interface ToolCallingOptions {
  maxToolCalls?: number;
  includeToolResultsInContext?: boolean;
}

export const DEFAULT_TOOL_CALLING_OPTIONS: ToolCallingOptions = {
  maxToolCalls: 5,
  includeToolResultsInContext: true
};

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
    const params = tool.parameters.map(p => {
      let paramStr = `  - ${p.name} (${p.type})`;
      if (p.required) paramStr += ' [required]';
      if (p.enum) paramStr += ` [choices: ${p.enum.join(', ')}]`;
      paramStr += `: ${p.description}`;
      return paramStr;
    }).join('\n');
    
    return `${tool.name}: ${tool.description}\nParameters:\n${params}`;
  }).join('\n\n');

  const availableTools = tools.map(t => t.name).join(', ');

  return `You have access to the following tools:

${toolDefinitions}

When you need to use a tool, respond with JSON in this exact format:
{"tool_call": {"name": "tool_name", "parameters": {"param1": "value1"}}}

If no tool is needed, respond normally without JSON.

IMPORTANT: Only use tools when absolutely necessary. For simple questions or statements, respond directly without tool calls.

Available tools list: ${availableTools}

Remember:
- Only call a tool if you need information you don't have or need to perform an action
- Don't call tools for general knowledge you already have
- After getting tool results, incorporate them into your response naturally`;
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

export function extractFinalResponse(response: string, toolCalls: ToolCall[]): string {
  if (toolCalls.length === 0) {
    return response;
  }
  
  // Remove tool call JSON from the response
  let finalResponse = response;
  const toolCallRegex = /\{"tool_call":\s*\{[^}]+\}\}/g;
  finalResponse = finalResponse.replace(toolCallRegex, '').trim();
  
  // If response is empty after removing tool calls, provide a default
  if (!finalResponse) {
    finalResponse = 'I have processed your request using the necessary tools.';
  }
  
  return finalResponse;
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

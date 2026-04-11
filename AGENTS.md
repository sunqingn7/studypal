# Development Notes

## LLM Pool Provider Features

### 1. Provider Nicknames
- Each provider can have a nickname (e.g., "G", "小g", "g sen")
- Nickname is used for chat routing via @mentions

### 2. Chat Routing Modes
- **Auto Mode** (no @mention) → Uses primary provider or first available
- **Assigned Mode** (`@nickname`) → Routes to specific provider
- **Discuss Mode** (`@everyone`, `@all`) → Sends to ALL enabled providers

### 3. Provider Configuration
- Nickname field in Settings > LLM Pool
- "Primary" checkbox to mark the primary LLM
- Color-coded borders in chat for different providers

## Commands
- `npm run dev` - Start development server
- `npm run build` - Build for production (includes TypeScript check)

## Completed

### Plugin System Streamlining (Phase 5)
- Cleaned up `plugin.ts` - removed duplicate interface definitions
- Added React import for plugin interfaces
- Wired plugin enable/disable from settings store (now persists)
- Improved plugin settings UI with:
  - Grouped by plugin type (View, File Handler, MCP Server, TTS Backend)
  - Type icons for each category
  - Plugin name, ID, description, version, author display
  - Loaded/disabled status indicator
  - Visual grouping with count badges

### Chat Routing Integration
- Added `parseChatMessage()` to detect @mentions
- Supports `@nickname`, `@everyone`, `@all`
- Discuss mode sends message to all providers in parallel

### Discuss Mode
- Streaming support: each provider streams independently with 50ms debounced UI updates
- Visual grouping: CSS grid layout with auto-fit columns, per-provider color borders
- Tool calling: `chatWithTools()` called when provider supports native function calling

### Bug Fixes
- Fixed `providerConfig` usage (was using global `config` instead)
- Added better error handling for Gemini and OpenRouter
- Fixed @mention autocomplete to add ": " after selection

### Native Function Calling Implementation
- Added `mcpToolToOpenAISchema()` to convert MCPTool to OpenAI function schema in `tool-calling.ts`
- Added `mcpToolToAnthropicSchema()` to convert MCPTool to Anthropic tool schema
- Added `chat_with_tools` Rust command in `lib.rs` for non-streaming tool calls
- Added `stream_chat_with_tools` Rust command in `lib.rs` for streaming tool calls with tool call events
- Updated OpenAI provider: `supportsNativeFunctionCalling()`, `chatWithTools()`, `streamChatWithTools()`
- Updated Anthropic provider: `supportsNativeFunctionCalling()`, `chatWithTools()`, `streamChatWithTools()`
- Updated OpenRouter provider: `supportsNativeFunctionCalling()`, `chatWithTools()`, `streamChatWithTools()`
- Tool calls are emitted via the thinking field in StreamChunk events

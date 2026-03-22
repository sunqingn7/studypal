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

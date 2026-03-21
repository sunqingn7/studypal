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

## Recent Changes

### Chat Routing Integration
- Added `parseChatMessage()` to detect @mentions
- Supports `@nickname`, `@everyone`, `@all`
- Discuss mode sends message to all providers in parallel

### Bug Fixes
- Fixed `providerConfig` usage (was using global `config` instead)
- Added better error handling for Gemini and OpenRouter
- Fixed @mention autocomplete to add ": " after selection

## Commands
- `npm run dev` - Start development server
- `npm run build` - Build for production (includes TypeScript check)

## Next Steps
- Add streaming support for discuss mode
- Consider grouping responses visually
- Add tool calling support for discuss mode

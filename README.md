# StudyPal

A study pal program for all - cross-platform desktop app built with Tauri + React + TypeScript.

## Features

- **File View**: Open and read PDF and text files with built-in viewer
- **Note View**: Rich text note-taking with TipTap editor, tabbed interface
- **AI View**: Chat with local AI models (llama.cpp server)
- **Resizable Panels**: Flexible 3-pane layout
- **System Theme**: Automatically follows system dark/light mode

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Desktop**: Tauri 2.x (Rust backend)
- **State Management**: Zustand
- **Editor**: TipTap
- **PDF Rendering**: PDF.js

## Getting Started

### Prerequisites

- Node.js 18+
- Rust 1.77+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```

## Project Structure

```
src/
├── domain/           # Business logic & models
│   └── models/       # Note, Topic, File, AI-Context
├── application/      # Application layer
│   └── store/       # Zustand stores
├── infrastructure/  # External integrations
│   ├── ai-providers/
│   └── file-handlers/
└── presentation/    # UI layer
    ├── components/
    └── layouts/
```

## AI Configuration

By default, StudyPal connects to a local llama.cpp server. To configure:

1. Start your llama.cpp server (e.g., `llama-server`)
2. Default endpoint: `http://localhost:8080`
3. You can change the endpoint and model in the AI view settings

## Roadmap

- [ ] Persistence (save notes to markdown files)
- [ ] Topic management
- [ ] AI context triggers ("this topic", "global notes", etc.)
- [ ] Plugin system for additional file formats
- [ ] EPUB and web page support

## License

MIT

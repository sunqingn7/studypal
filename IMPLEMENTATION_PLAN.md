# StudyPal - Implementation Plan

## Key Decisions Summary

| Aspect | Decision |
|--------|----------|
| **Storage** | Markdown files (human-readable) |
| **Editor** | TipTap with markdown export |
| **Initial Formats** | PDF + TXT only (others via plugins) |
| **AI Default** | llama.cpp server (`http://localhost:8080`) |
| **Theme** | System theme (auto dark/light) |
| **Tabs** | Persist across sessions, renameable |
| **File-Topic** | Many-to-many relationships |
| **AI Chats** | Saved as `topic/AINote-1.md`, `topic/AINote-2.md` |

## Data Structure

```
~/StudyPal/
├── global-notes.md
├── topics/
│   ├── physics-general/
│   │   ├── Note-1.md
│   │   ├── Note-2.md
│   │   ├── AINote-1.md    # AI chat session 1
│   │   └── AINote-2.md    # AI chat session 2
│   └── quantum-mechanics/
│       └── ...
└── config/
    ├── workspaces.json    # File-topic mappings, tab states
    ├── layout.json        # Panel positions, sizes
    └── ai-config.json     # llama.cpp endpoint, model
```

## AI Context Resolution Rules

| User says | Context included |
|-----------|------------------|
| (default) | Visible file content + current topic notes |
| "selected text" | Only selected portion of file |
| "whole book" / "entire file" | Complete file content |
| "this chapter" | Current section (PDF chapter / TXT header-based) |
| "this topic" / "topic notes" | All notes in current topic |
| "globally" / "all notes" | Global notes + all topic notes |
| "reference [topic name]" | Specific topic's content |

## Project Structure

```
studypal/
├── src/
│   ├── domain/
│   │   ├── models/
│   │   │   ├── note.ts
│   │   │   ├── file.ts
│   │   │   ├── topic.ts
│   │   │   └── ai-context.ts
│   │   └── services/
│   │       ├── note-service.ts
│   │       ├── file-service.ts
│   │       └── topic-service.ts
│   ├── application/
│   │   ├── store/
│   │   │   ├── layout-store.ts
│   │   │   ├── note-store.ts
│   │   │   ├── topic-store.ts
│   │   │   └── ai-store.ts
│   │   ├── hooks/
│   │   │   ├── use-theme.ts
│   │   │   ├── use-tabs.ts
│   │   │   └── use-context.ts
│   │   └── utils/
│   │       └── markdown.ts
│   ├── infrastructure/
│   │   ├── ai-providers/
│   │   │   ├── base-provider.ts
│   │   │   └── llamacpp-provider.ts
│   │   ├── file-handlers/
│   │   │   ├── base-handler.ts
│   │   │   ├── pdf-handler.ts
│   │   │   ├── txt-handler.ts
│   │   │   └── plugin-handler.ts
│   │   └── plugins/
│   │       ├── plugin-manager.ts
│   │       └── plugin-loader.ts
│   └── presentation/
│       ├── components/
│       │   ├── layout/
│       │   │   ├── ResizablePanel.tsx
│       │   │   └── LayoutManager.tsx
│       │   ├── views/
│       │   │   ├── file-view/
│       │   │   ├── note-view/
│       │   │   └── ai-view/
│       │   └── shared/
│       │       ├── TabBar.tsx
│       │       └── TopicSelector.tsx
│       ├── layouts/
│       │   └── MainLayout.tsx
│       └── App.tsx
├── src-tauri/
├── notes/
└── package.json
```

## Implementation Phases

### Phase 1: Core Infrastructure
- Initialize Tauri + React + TypeScript
- Layer-based folder structure
- Layout system with resizable panels
- Default 3-pane layout
- System theme detection
- Zustand stores

### Phase 2: File View (PDF + TXT)
- PDF.js viewer
- Plain text viewer
- File picker
- File-topic mapping

### Phase 3: Note System
- TipTap editor with markdown
- Tabbed interface (persist, renameable)
- Global + topic notes
- Auto-save

### Phase 4: AI Integration
- llama.cpp provider
- Context builder
- Chat interface
- AI notes as files

### Phase 5: Plugin System
- JS plugin API
- Rust plugin architecture
- Plugin manager UI

### Phase 6: Polish
- Settings UI
- Workspace management
- Cross-platform builds

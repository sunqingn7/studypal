# Translation Plugin Implementation Report

## Overview

This document analyzes two approaches for implementing an AI-powered document translation feature in StudyPal.

### Key Requirements
- **Text-only translation**: Ignore pictures/charts, but translate text in tables
- **On-demand translation**: Only translate currently displayed page (plus prefetch next page)
- **Display after LLM**: Show original first, update when translation is ready

---

## Approach 1: Side-by-Side View

### Description
Display the translation in a new panel/view adjacent to the original document, creating a split-screen layout.

### Implementation Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                    MainLayout (Panels)                     │
├──────────────┬─────────────────────┬──────────────────────┤
│   Sidebar    │   Original Page    │   Translation Panel   │
│  (optional)  │   (Current page)   │   (Translated text)  │
│              │                     │                       │
└──────────────┴─────────────────────┴──────────────────────┘
```

#### Workflow
1. User opens document → shows original page
2. User clicks "Translate" → requests current page translation
3. LLM translates → translation appears in side panel
4. User scrolls to next page → automatically requests translation for next page (prefetch)

#### Key Components
1. **TranslationViewPlugin**: New view plugin returning `TranslationView` component
2. **TranslationView**: 
   - Gets current page number from PDF viewer
   - Extracts text via `pdf-utils.getCurrentPageText()`
   - Calls AI provider for translation
   - Renders translated text in side panel
3. **Panel Integration**: Modify right panel group to support translation toggle

### Pros
- **Clean separation**: Original and translated content don't interfere
- **Page-level granularity**: Only translates visible page, not entire document
- **Prefetch ready**: Can trigger next page translation on scroll
- **Works for all types**: PDF, EPUB, TXT, MD all work the same way
- **No content modification**: Original document remains untouched

### Cons
- **Requires panel change**: Need to modify `MainLayout.tsx` or use modal within file panel
- **More screen space**: Needs horizontal space for split view
- **Paragraph alignment**: Visually aligning paragraphs between panels requires care

---

## Approach 2: Paragraph-by-Paragraph Inline Translation

### Description
Display translation directly within the original document, showing translation after LLM completes.

### Implementation Strategy

```
┌─────────────────────────────────────────────────────────────┐
│  Document View                                             │
│                                                             │
│  [Page 1] ▼ Translation                                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Original Paragraph 1                                │   │
│  │ ─────────────────────────────────                   │   │
│  │ [Translating...] or [Translation of Para 1]        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Original Paragraph 2 (with table)                   │   │
│  │ | cell1 | cell2 |                                   │   │
│  │ | cell3 | cell4 |  → translated text in cells      │   │
│  │ ─────────────────────────────────                   │   │
│  │ [Translation of Para 2 with table content]          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Workflow
1. User opens document → shows original page
2. User clicks "Translate" on current page
3. Extract text from current page (paragraphs + table cells)
4. Send to LLM → stream translation
5. Replace/render translation below each paragraph
6. On scroll → translate new page (on-demand)

#### Key Components
1. **Text Extraction** (from `pdf-utils`):
   - Extract paragraphs with position info
   - Extract table cells with coordinates
   - Preserve structure for alignment

2. **Translation Service**:
   - `translatePage(pageNum, targetLang)`: Translate current page
   - Stream results paragraph by paragraph
   - Cache translations by page number

3. **Renderer Overlay**:
   - Render translation boxes below original paragraphs
   - For tables: translate cell content in-place
   - Loading state while translating

### Pros
- **Excellent paragraph alignment**: Translation appears right below each paragraph
- **Table support**: Can translate cell content in-place
- **Space efficient**: No need for extra panel
- **Page-level**: Only translates current page, not whole document

### Cons
- **More invasive**: Requires overlay/injection into document view
- **PDF complexity**: Text layer positioning requires coordinate mapping
- **State tracking**: Must track which pages are translated, show loading states

### Technical Challenges

1. **PDF Text Layer Positioning**
   - Get paragraph bounding boxes from PDF.js text layer
   - Render translation boxes at correct positions
   - Handle page reflow when translations are longer

2. **Table Translation**
   - Extract table structure (rows, columns)
   - Translate cell content
   - Render translated table below or replace in-place

3. **On-Demand & Prefetch**
   - Detect page changes (scroll or page turn)
   - Trigger translation only for visible page
   - Prefetch next page while viewing current

4. **Loading States**
   - Show "Translating..." for each paragraph
   - Update incrementally as LLM streams results

---

## Comparison Matrix (Updated)

| Aspect                    | Side-by-Side      | Inline (Paragraph)    |
|---------------------------|-------------------|----------------------|
| Implementation complexity| Medium            | Medium-High          |
| UI changes required      | Panel/toggle      | Document renderer    |
| Text extraction          | Page-level        | Paragraph-level      |
| Table translation        | Full support      | Full support         |
| On-demand page translate | Easy              | Easy                 |
| Prefetch next page       | Easy              | Easy                 |
| PDF text positioning     | Not needed        | Required             |
| Paragraph alignment      | Good              | Excellent            |
| Screen space needed       | More (split)      | Less (overlay)       |
| Comparison ease          | Good               | Excellent            |
| LLM streaming display    | Side panel        | Below each para      |

---

## Recommendation

### Both approaches now viable due to on-demand/page-level design

**Key insight**: Since we only translate the current page (not entire document), both approaches are now much more manageable.

### If Side-by-Side is selected:
- Simpler implementation - just extract page text and display in side panel
- Less invasive to document renderer
- Clean visual separation
- Minor panel layout change needed

### If Inline is selected:
- Better paragraph alignment - translations appear directly below each paragraph
- Table translation is natural (translate in-place)
- More visually integrated
- Requires modifying PDF text layer rendering

---

## Implementation Plan (Either Approach)

### Phase 1: Text Extraction (Shared)
1. Enhance `pdf-utils.ts`:
   - Extract paragraphs with positions
   - Extract table structures
   - Return clean text + metadata

### Phase 2: Translation Service
1. Create `translation-service.ts`:
   - `translateText(text, targetLang, sourceLang?)`: Call AI provider
   - `translatePage(pageNum, lang)`: Orchestrate page translation
   - Cache translations by page number

### Phase 3: UI Components
- **Side-by-side**: Add translation panel toggle in header
- **Inline**: Add translation overlay layer in PDF viewer

### Phase 4: On-Demand & Prefetch
- Detect page changes
- Trigger translation on demand
- Prefetch next page

---

## API Usage

```typescript
// 1. Get current page text (already exists in pdf-utils)
const pageText = await getCurrentPageText(filePath, pageNum)

// 2. Translate via AI
const provider = getProvider(config.providerType)
const messages = [
  { role: 'user', content: `Translate to ${targetLang}:\n\n${pageText}` }
]
const translation = await provider.chat(messages, config)

// 3. For tables - extract and translate separately
const tables = extractTables(pageText)  // new function
for (const table of tables) {
  const translated = await provider.chat([...])
}
```

---

## Notes

- Translation quality depends on LLM - may need prompt engineering
- Consider adding source language detection
- Cache translations to avoid re-translating on page revisit
- Show loading indicators during translation
- Handle translation failures gracefully (show error, allow retry)

# Paginated Translation Display - Feature Memo

**Status**: Deferred (not for now)  
**Date**: 2026-04-14  
**Requested By**: User

## Feature Request
Display translated pages progressively as they are translated, instead of waiting for the full document translation to complete.

## Current Architecture

### Translation Flow
1. Frontend calls `translateDocument()` → Rust backend (`translation.rs`)
2. Rust spawns `pdf2zh` subprocess with the entire document
3. `pdf2zh` translates the **full document** and outputs `-mono.pdf` or `-dual.pdf`
4. Rust waits for process completion (up to 1 hour timeout)
5. Only then does frontend display the translated PDF

### Key Code Locations
- **Frontend Service**: `src/application/services/translation-service.ts`
- **Backend**: `src-tauri/src/translation.rs`
- **Store**: `src/application/store/translation-store.ts`
- **View**: `src/presentation/components/views/translation-view/TranslationView.tsx`

## Technical Challenges

### 1. pdf2zh Limitation
- `pdf2zh` processes the entire document in one go
- No native support for streaming or intermediate output
- Output files only appear when translation completes

### 2. Potential Approaches

#### Option A: True Page-by-Page Translation
- Request translation of page batches (e.g., pages 1-5, then 6-10)
- **Pros**: True progressive display, can show as each batch completes
- **Cons**: Slower overall (multiple LLM calls with overhead), more complex state management
- **Implementation**: Modify Rust backend to handle partial translations and manage partial PDFs

#### Option B: Progressive Loading of Full Translation
- Show original PDF in translation view while translation is in progress
- Monitor output directory and switch to translated PDF when available
- **Pros**: Simple to implement, better UX than blank/loading screen
- **Cons**: Not true incremental translation display

#### Option C: Hybrid Batch Approach
- Translate in batches (e.g., 10 pages at a time)
- Each batch produces a partial PDF
- Concatenate partial PDFs for display
- **Pros**: Best UX, true incremental display
- **Cons**: Most complex, requires PDF manipulation, state management for partial results

## Recommendation

**Suggested approach for future implementation**: Option B (Progressive Loading)

1. Show original PDF in translation view while translating (with visual indicator)
2. Poll for translated PDF completion
3. Seamlessly switch to translated PDF when ready

This provides immediate value (users can still read while waiting) with minimal complexity.

If true page-by-page display is needed later, consider Option C with PDF manipulation libraries.

## Related Issues
- Translation view currently shows loading spinner until full translation complete
- Users cannot navigate document while waiting for translation
- Large documents can take significant time to translate

## Revisit When
- [ ] Users report translation wait times as pain point
- [ ] PDF manipulation libraries are already introduced for other features
- [ ] Need to differentiate from competitors with streaming translation

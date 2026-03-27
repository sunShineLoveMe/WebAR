# Task Plan: Single-Turn Voice Guide for Hu Xiaobao

## Goal
Add a stable single-turn voice-question flow for Hu Xiaobao, limited to Shanghai tourism, without introducing multi-turn chat state.

## Phases
- [x] Phase 1: Review current Kimi + TTS flow and decide the stable voice-input scope
- [x] Phase 2: Add voice-input UI and browser speech recognition flow
- [x] Phase 3: Connect recognized text into the existing Kimi + TTS guide pipeline
- [x] Phase 4: Update README and verify behavior

## Key Questions
1. How to add voice questioning without making the interaction unstable?
2. How should unsupported browsers fail gracefully?

## Decisions Made
- Keep the interaction single-turn only; no multi-turn memory.
- Keep the topic restricted to Shanghai tourism through the existing system prompt.
- Use browser speech recognition where available, with clear unsupported-state messaging.
- Reuse the existing Kimi and server-side TTS pipeline after transcription.

## Errors Encountered
- None

## Status
**Completed** - Stable single-turn voice questioning is connected to the existing Kimi + TTS guide flow.

# Task Plan: Cloud TTS Upgrade for Hu Xiaobao

## Goal
Replace browser-only speech with a cloud-generated TTS playback path for Hu Xiaobao's Shanghai guide answers, using a free provider suitable for testing and documenting the setup.

## Phases
- [x] Phase 1: Review current Kimi + browser speech flow and deployment constraints
- [x] Phase 2: Choose a free TTS provider and define integration approach
- [x] Phase 3: Implement server TTS proxy and front-end audio playback
- [x] Phase 4: Update README and verify behavior

## Key Questions
1. Which free TTS option can be integrated into the current Vercel-based architecture with the least friction?
2. How should the app behave when cloud TTS fails on a device or network?

## Decisions Made
- Use a server-side free TTS path instead of browser-only speech to improve voice quality.
- Keep browser `speechSynthesis` as a fallback so testing is resilient.
- Prefer MP3 output for mobile Safari compatibility.
- Use `node-edge-tts` for the current free implementation because it is MIT-licensed and works without an API key.

## Errors Encountered
- None

## Status
**Completed** - Free server-side TTS playback has replaced the browser-only speech path, with browser fallback retained.

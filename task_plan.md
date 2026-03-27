# Task Plan: Kimi Shanghai Voice Guide

## Goal
Add Shanghai-only Kimi voice Q&A to the Hu Xiaobao WebAR demo with preset questions and mobile speech output.

## Phases
- [x] Phase 1: Inspect current app structure and constraints
- [x] Phase 2: Define implementation approach and prompt strategy
- [x] Phase 3: Implement server proxy and front-end interaction UI
- [x] Phase 4: Update README and verify behavior

## Key Questions
1. How to avoid exposing the Kimi API key to the browser?
2. How should Hu Xiaobao trigger the guided Q&A flow?

## Decisions Made
- Use a Vercel serverless API route to proxy Kimi requests: keeps the API key server-side.
- Use a restrictive system prompt: Shanghai tourism only, concise mobile-friendly answers.
- Use three preset questions in the mobile UI: lower input friction and improve demo stability.
- Use browser `speechSynthesis` for spoken responses: avoids adding another TTS service dependency.

## Errors Encountered
- None yet

## Status
**Completed** - Kimi guide proxy, preset-question UI, speech output, and README documentation are in place.

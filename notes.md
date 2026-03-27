# Notes: Single-Turn Voice Guide

## Scope

- Add a microphone entry point to ask Hu Xiaobao a spoken question.
- Do not add multi-turn conversation memory.
- Keep the existing preset questions.
- Keep Shanghai-tourism-only behavior.

## UX Plan

- Add a prominent voice button in the guide panel.
- Button states:
  - idle: click to ask by voice
  - listening: prompt the user to speak
  - processing: transcribing / generating answer
- Show the recognized text in the answer panel before the Kimi answer if useful.
- If the browser does not support speech recognition, explain that clearly and keep preset questions available.

## Technical Plan

- Use `window.SpeechRecognition || window.webkitSpeechRecognition`.
- Configure it for `zh-CN`, single final result.
- Pipe the transcript into the same `askGuide()` flow already used by preset questions.
- Keep the existing service-side TTS playback path unchanged.

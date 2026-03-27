# Notes: Cloud TTS Upgrade

## Current State

- Kimi text generation works through `/api/kimi-guide`.
- Spoken output currently uses browser `speechSynthesis`, which sounds mechanical.
- The project is deployed on Vercel and already has serverless API routes.

## Provider Choice

- Chosen provider for this implementation: `node-edge-tts`
- Reason:
  - no API key required
  - can synthesize higher-quality neural voices than browser speech
  - can run inside Node-based server routes
  - MP3 output is available for Safari playback
- Tradeoff:
  - this is suitable for free testing and demos, but not the ideal long-term commercial-grade provider

## Front-end Plan

- Keep Kimi request flow unchanged.
- After receiving Kimi answer text, request `/api/tts`.
- Play returned MP3 with a dedicated `Audio` instance.
- If cloud TTS fails, fall back to browser `speechSynthesis`.

## Deployment Notes

- Add `package.json` dependency so Vercel can bundle the TTS package.
- Optionally allow environment overrides for voice/rate/pitch.

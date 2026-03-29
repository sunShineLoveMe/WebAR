# Stickman WebAR Demo

## Overview

This branch is rebuilt as a stickman-focused WebAR demo on the original stack:

- JavaScript
- Three.js
- MindAR image tracking
- GLTFLoader
- WebGL
- ES modules

Current demo flow:

1. Open the page on a mobile browser with camera permission.
2. Tap `启动 AR`.
3. Scan the configured image target.
4. The stickman appears above the target with a reveal effect.
5. The stickman auto-plays the greeting action once.
6. The user can then trigger either:
   - `打招呼`
   - `跳舞`
7. The user can also use voice input.
   - Browser speech recognition captures the sentence.
   - The transcript is sent to Kimi for intent classification.
   - Kimi maps the sentence to a fixed action ID.
   - If Kimi is unavailable, the frontend falls back to local keyword mapping.

This is deliberately a controlled action-demo architecture, not a free-form chat agent.

## Project Structure

```text
project/
├─ api/
│  └─ intent.js
├─ index.html
├─ app.js
├─ style.css
├─ vercel.json
├─ assets/
│  ├─ greeting_scale.glb
│  ├─ dancing_scale.glb
│  ├─ target-image.png
│  └─ targets.mind
└─ README.md
```

## How To Run

### Local static preview

```bash
cd "/Users/june/Documents/大模型/多模态模型/AR3D_Model"
python3 -m http.server 5173 --bind 0.0.0.0
```

This is enough to validate static loading and the AR page shell.

Important:
- local `python3 -m http.server` does **not** provide the Kimi API route.
- if you want to test the Kimi intent layer locally, use a Vercel-compatible local runtime such as `vercel dev`.

### Vercel deployment

Recommended for full mobile testing because it provides:
- HTTPS
- serverless API route support
- mobile-safe camera access

Required environment variables:
- `LLM_API_KEY`

Optional environment variables:
- `LLM_BASE_URL`
  - default: `https://api.moonshot.cn/v1`
- `LLM_MODEL_NAME`
  - default: `kimi-k2.5`

## Current Action System

### Available actions

- `greeting`
  - source: `assets/greeting_scale.glb`
- `dancing`
  - source: `assets/dancing_scale.glb`

### How the action system works

- The visible base model is loaded from `greeting_scale.glb`.
- Action clips are loaded from both GLB files.
- A single `AnimationMixer` is attached to the visible model.
- Buttons and voice input both resolve to fixed action IDs.
- Action playback is intentionally one-shot and controlled.

This is the correct architecture for the next phase, where more Mixamo clips can be added without changing the overall interaction model.

## Kimi Intent Layer

### What it does

The Kimi layer is used only for intent classification.

It does **not** directly control bones or generate arbitrary motion.
Instead, it maps natural-language voice input to one of these fixed IDs:

- `greeting`
- `dancing`
- `unknown`

### Why this design is used

This is materially more stable than letting an LLM freely decide animation behavior.
For a client demo, the priorities are:
- predictable actions
- low failure rate
- understandable behavior
- clean fallback when AI is unavailable

### Fallback behavior

If the Kimi API is unavailable, times out, or returns an invalid intent:
- the app falls back to local keyword matching
- `打招呼 / 挥手 / 招手` -> `greeting`
- `跳舞 / 跳一个 / 舞` -> `dancing`

That keeps the demo usable even when AI is temporarily unavailable.

## Known Risks And Practical Limits

This section is important for client expectation setting.

### 1. The models are heavy for mobile WebAR

Current asset sizes:
- `greeting_scale.glb`: about `13 MB`
- `dancing_scale.glb`: about `13 MB`

Geometry and texture profile:
- each model is about `219,558 triangles`
- each model uses `2048 x 2048` textures
- material includes:
  - `baseColorTexture`
  - `normalTexture`
  - `specularTexture`

### 2. What this affects in real usage

These asset sizes directly affect:
- first-load latency
- mobile GPU pressure
- heat and battery drain
- animation smoothness on mid/low-end devices
- risk of Safari tab reloads on memory-constrained iPhones

Expected user-visible symptoms on weaker phones:
- slower initial appearance after scan
- occasional dropped frames during animation
- more obvious lag when switching actions
- browser becoming warm after repeated testing

### 3. AR itself adds extra cost

This is not a normal 3D web page.
At runtime the device is doing all of the following together:
- camera capture
- image-target tracking
- 3D rendering
- skeletal animation
- lighting and material shading
- optional speech recognition
- optional API requests to Kimi

So even a model that feels acceptable on desktop can still be heavy in mobile WebAR.

### 4. Voice recognition is browser-dependent

Current voice input uses browser speech recognition.
That means:
- support differs by browser and OS version
- recognition quality depends on microphone quality and background noise
- Safari / Chrome behavior is not identical
- some browsers may not expose speech recognition at all

The app already handles this by:
- disabling the voice button when unsupported
- keeping manual action buttons available

### 5. Kimi intent adds network dependency

The Kimi layer improves flexibility, but it adds:
- request latency
- dependency on API availability
- dependency on Vercel serverless route health
- dependency on environment variables being configured correctly

The current mitigation is to keep local keyword fallback enabled.

## What Is Safe For Demo Right Now

This branch is safe for a client demo when the goal is:
- show AR image tracking
- show the stickman appearing in AR
- show two reliable actions
- show voice-triggered action switching
- show that an AI intent layer can sit on top of fixed actions

## What Is Not Yet Production-Ready

This branch is **not** yet production-ready for wide public rollout because:
- models are too heavy for many mobile devices
- action library is still small
- voice intent is still limited to a narrow action set
- there is no asset compression pipeline yet
- there is no device-adaptive quality strategy yet

## Recommended Next Optimization Steps

Before public rollout, the highest-value work is:

1. reduce polygon count
2. compress textures
3. keep one consistent skeleton for all actions
4. add more actions without changing the intent contract
5. introduce device-tier quality fallback
6. optionally precompress GLB assets with mesh and texture optimization

## Validation Checklist

Before showing a client, verify:

1. page opens over HTTPS
2. camera permission is granted
3. target image is recognized reliably
4. greeting action plays after reveal
5. button-triggered `打招呼` works
6. button-triggered `跳舞` works
7. voice trigger works when Kimi is available
8. local fallback still works when Kimi is unavailable

## Current Status

This branch now includes:
- clean stickman-only AR project structure
- improved lighting for better material presentation
- two-action animation system
- browser voice capture
- Kimi intent classification layer
- local keyword fallback for demo stability

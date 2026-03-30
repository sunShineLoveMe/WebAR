# Stickman Actions and Voice Trigger

## Goal

Upgrade the current stickman AR demo into a stable client-demo build with:
- two switchable actions
- browser voice input
- Kimi intent classification
- explicit documentation of current mobile performance risks

## Status

### Phase 1: Clean stickman-only branch
- [x] remove Hu Xiaobao-specific files and APIs
- [x] keep core WebAR architecture
- [x] retain target tracking assets

### Phase 2: Action system
- [x] wire `greeting_scale.glb`
- [x] wire `dancing_scale.glb`
- [x] enable button-triggered action switching

### Phase 3: Voice trigger structure
- [x] browser speech recognition
- [x] Kimi intent classification route
- [x] local keyword fallback when Kimi is unavailable

### Phase 4: Documentation and handoff
- [x] document deployment requirements
- [x] document asset weight and mobile risk
- [x] document current demo-safe limits

## Next recommended step

1. compress both GLB assets
2. add one idle clip
3. define a larger fixed action ID set
4. only then expand AI-controlled intents

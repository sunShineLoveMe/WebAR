# Task Plan: Minimal Voice Guide UI Cleanup

## Goal
Hide visible AI answer text, move the voice-question button to the bottom, and simplify the overlay so it obstructs the AR scene as little as possible.

## Phases
- [x] Phase 1: Review current guide UI structure and identify obstructive elements
- [x] Phase 2: Simplify markup and styles for a cleaner low-obstruction overlay
- [x] Phase 3: Adjust app logic so answers are spoken without being visibly rendered
- [x] Phase 4: Update README and verify the UI behavior

## Key Questions
1. Which UI elements are essential for the experience and which should be visually removed?
2. How can status feedback remain clear without covering the AR content?

## Decisions Made
- Keep preset question buttons visible because they are still a primary interaction path.
- Hide the long AI text block from the visible UI while preserving internal state.
- Place the voice button last in the panel so it sits at the bottom.
- Reduce card footprint and visual weight to avoid blocking the 3D scene.

## Errors Encountered
- None

## Status
**Completed** - The guide UI is now voice-first, less obstructive, and no longer shows long visible AI answer text.

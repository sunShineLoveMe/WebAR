# Notes

## Asset profile
- `greeting_scale.glb` and `dancing_scale.glb` are both about 13 MB.
- Both assets appear to share the same rig and material structure.
- Each file is about 219k triangles with 2048 textures.
- This is acceptable for a client demo, but heavy for general mobile WebAR rollout.

## Voice / intent design
- Browser speech recognition captures the raw transcript.
- The transcript is first sent to Kimi through `api/intent.js`.
- Kimi is constrained to output one fixed action ID.
- Frontend falls back to local keyword mapping if the API route fails.

## Important engineering stance
- The LLM does not directly control animation logic.
- The LLM only classifies intent into a fixed contract.
- This keeps the demo predictable and avoids unstable free-form motion behavior.

# Notes: Minimal Voice Guide UI Cleanup

## Requested UI Changes

- Do not show the full AI answer text on screen.
- Voice output should remain active.
- Move the voice-question button to the bottom of the interaction area.
- Make the whole overlay cleaner and less obstructive to the AR scene.

## UI Plan

- Keep a small floating card near the bottom.
- Keep title and status text compact.
- Keep preset question buttons as the main visible controls.
- Move the voice button below the preset buttons.
- Hide the answer area from view using CSS and keep it only as an internal state container.

## Logic Plan

- Continue storing `lastGuideAnswer` for replay and audio flow.
- Stop writing large visible answer text into the main card.
- Use short status / hint text instead of long answer paragraphs.

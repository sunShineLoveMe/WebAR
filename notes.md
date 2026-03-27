# Notes: Kimi Shanghai Guide Integration

## Implementation Outline

- Front end:
  - Show three preset question buttons in the overlay.
  - Gate buttons until the AR scene reaches the interactive phase.
  - Clicking Hu Xiaobao should prime the Q&A flow and speak a local guide prompt.
  - Clicking a preset question should call a local `/api/kimi-guide` endpoint.
  - Use `speechSynthesis` for mobile voice output of the returned answer.

- Back end:
  - Add `api/kimi-guide.js` for Vercel.
  - Read credentials from env vars:
    - `LLM_API_KEY`
    - `LLM_BASE_URL`
    - `LLM_MODEL_NAME`
  - Use an OpenAI-compatible `chat/completions` request to Moonshot/Kimi.

## Prompt Strategy

- System prompt:
  - Role: Shanghai tourism guide embodied as Hu Xiaobao.
  - Scope: Shanghai attractions, food, transport, routes, history, city experience.
  - Reject off-topic questions and redirect back to Shanghai travel.
  - Keep answers concise and spoken-language friendly.

## UX Notes

- The preset questions should remain visible on mobile once AR is interactive.
- Hu Xiaobao click should not alter the character material anymore.
- Answer text should also be visible on screen, not only spoken.

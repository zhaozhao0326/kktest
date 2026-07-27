# API Provider Formats Design

## Goal

Add native API format support for Anthropic Messages and Gemini GenerateContent while preserving the existing OpenAI-compatible behavior. Existing configurations must continue to work without migration steps from the user.

The first version focuses on chat generation. It should not redesign unrelated image, voice, memory, or access-control flows.

## Scope

Supported formats:

- OpenAI Compatible: existing `/chat/completions` behavior remains the default for old and new configurations.
- Anthropic Messages: native `/v1/messages` request and streaming response parsing.
- Gemini GenerateContent: native `generateContent` or `streamGenerateContent` request and streaming response parsing.

Configuration additions:

- `apiFormat`: `openai-compatible`, `anthropic-messages`, or `gemini-generate-content`.
- `customHeadersJson`: optional JSON object merged into request headers.
- `customBodyJson`: optional JSON object merged into the provider request body.
- `cacheConfig`: optional upstream cache settings, with first-class support for Anthropic prompt caching.

Out of scope for this version:

- Full request body templating.
- Local response caching or replaying previous assistant replies.
- Reworking non-chat feature-specific API clients unless they naturally use the shared text stream helper.
- Guaranteeing tool calling parity for non-OpenAI formats in the first pass.

## Architecture

Introduce a provider adapter layer under `src/composables/api/` that owns provider-specific request construction, fetch options, stream parsing, error extraction, and non-stream response text extraction.

The chat orchestrators should continue to prepare the existing normalized internal `messages` array. Before network I/O, they call the provider layer with the selected config. The provider layer converts the normalized messages into the selected provider format.

Proposed modules:

- `providerFormats.js`: constants, defaults, and format normalization.
- `requestCustomization.js`: safe JSON parsing and merge helpers for custom headers/body.
- `providerRequest.js`: common runtime entry points for chat streaming and model listing where supported.
- `anthropicMessages.js`: Anthropic body conversion, prompt cache annotations, SSE parser, and error reader.
- `geminiGenerateContent.js`: Gemini body conversion, stream parser, and error reader.

Existing OpenAI-compatible helpers stay in place and are wrapped by the provider layer instead of rewritten.

## Data Flow

1. Settings UI loads the active API config.
2. User selects an API format and optionally edits custom headers/body JSON.
3. Chat code resolves the config using the existing `configs` store.
4. The provider layer normalizes the format. Missing or invalid values fall back to OpenAI Compatible.
5. The selected adapter builds the request URL, headers, and body.
6. `customHeadersJson` and `customBodyJson` are applied after the adapter creates the base request.
7. Streaming parser emits plain text deltas to the existing chat batching pipeline.
8. Usage is recorded when the provider emits usage metadata; otherwise existing token estimation remains the fallback.

## Anthropic Cache Support

Caching is prioritized for Anthropic because it has a clear request-level prompt cache contract.

First-version behavior:

- `cacheConfig.enabled` controls whether cache annotations are applied.
- The main system prompt can be emitted as Anthropic content blocks and marked with `cache_control: { "type": "ephemeral" }` when it is long enough to be useful.
- A minimum character threshold prevents adding cache metadata to tiny prompts.
- The cache control is only generated for `anthropic-messages`; Gemini and OpenAI Compatible do not receive fake cache fields from this setting.
- Users can still pass provider-specific cache fields through `customBodyJson` when an upstream supports them.

The UI should describe this as upstream prompt caching, not local response caching.

## Provider Conversion Rules

OpenAI Compatible:

- Preserve the current payload shape: `model`, `messages`, `stream`, `stream_options`, optional temperature, max tokens, reasoning effort, tools.
- Keep existing proxy behavior and non-stream fallback.

Anthropic Messages:

- URL defaults to `/v1/messages` when the configured base URL does not already include a messages endpoint.
- Headers include `x-api-key`, `anthropic-version`, and `Content-Type`.
- Internal `system` messages become the Anthropic `system` field.
- Internal `user` and `assistant` messages become Anthropic `messages` entries.
- Unsupported roles such as `tool` are handled conservatively. First version may disable native tool-calling rounds for Anthropic unless a later adapter explicitly maps them.
- Streaming text is extracted from `content_block_delta` text deltas.

Gemini GenerateContent:

- URL is built from the configured base URL and model when the endpoint is not already complete.
- API key can be supplied as `x-goog-api-key` or query key depending on adapter implementation; custom headers remain available.
- Internal messages become Gemini `contents` with `role: user` or `role: model`.
- System prompt goes into `systemInstruction`.
- Temperature and max token settings map into `generationConfig`.
- Streaming text is extracted from candidate content parts.

## Error Handling

Provider adapters expose a common error reader that returns a concise user-facing message. Debug logs include provider format, target URL, model, and trace ID, but do not log API keys.

Invalid custom JSON should fail before sending the request and show a clear settings or request error. It should not silently send malformed values.

## Testing

Unit tests should cover:

- Format normalization and backward compatibility for old configs.
- Custom headers/body JSON parsing and merge behavior.
- Anthropic message conversion, including system prompt cache control.
- Anthropic SSE text extraction.
- Gemini message conversion and text extraction.
- OpenAI-compatible behavior remains unchanged for existing tests.

Manual verification should cover:

- Existing OpenAI-compatible config can still send a chat message.
- Anthropic config sends native `/v1/messages` payload and streams text.
- Anthropic cache annotations appear only when enabled.
- Gemini config sends native GenerateContent payload and streams text.
- Invalid custom JSON produces a friendly error.

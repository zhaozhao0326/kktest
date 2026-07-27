# API Provider Formats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add native Anthropic Messages and Gemini GenerateContent chat support while preserving existing OpenAI-compatible behavior.

**Architecture:** Keep internal chat message preparation unchanged, then route network requests through a provider adapter layer. The OpenAI adapter wraps existing helpers; Anthropic and Gemini adapters convert normalized messages into native request bodies and expose stream parsers that emit plain text deltas to the existing UI pipeline.

**Tech Stack:** Vue 3, Pinia, JavaScript ES modules, Vitest, fetch streaming/SSE parsing.

---

## File Responsibilities

- `src/composables/api/providerFormats.js`: format constants, default cache config, config normalization, and helper predicates.
- `src/composables/api/requestCustomization.js`: parse user JSON for custom headers/body and merge into adapter-built requests.
- `src/composables/api/anthropicMessages.js`: build Anthropic request URL, headers, body, prompt cache annotations, stream parser, non-stream text extraction, and error reader.
- `src/composables/api/geminiGenerateContent.js`: build Gemini request URL, headers/body, stream parser, non-stream text extraction, and error reader.
- `src/composables/api/providerRequest.js`: select adapter by config, execute streamed text requests, read errors, and expose model listing where applicable.
- `src/composables/api/streamingRequest.js`: replace direct OpenAI request calls with provider request calls for normal chat.
- `src/composables/api/toolAwareStreamingRequest.js`: route tool-aware requests through the provider layer so OpenAI, Anthropic, and Gemini can use native tool calling while sharing the existing executor.
- `src/composables/api/chat/sharedChatExecutor.js`: keep tool-aware execution enabled when tools are available; provider adapters handle native schema conversion.
- `src/composables/storage/appDataModules.js`: add default and normalized config fields.
- `src/views/settings/composables/useApiConfigForm.js`: load, validate, and save provider format, custom JSON, and Anthropic cache settings.
- `src/views/settings/SettingsApiConfig.vue`: add compact controls for format, custom headers/body JSON, and cache toggle/threshold.

## Tasks

### Task 1: Provider Format And Customization Helpers

**Files:**
- Create: `src/composables/api/providerFormats.js`
- Create: `src/composables/api/providerFormats.test.js`
- Create: `src/composables/api/requestCustomization.js`
- Create: `src/composables/api/requestCustomization.test.js`

- [ ] Write failing tests for defaulting old configs to OpenAI-compatible, normalizing cache config, parsing JSON objects, rejecting arrays/scalars, and merging custom body/headers.
- [ ] Run `npx vitest run src/composables/api/providerFormats.test.js src/composables/api/requestCustomization.test.js` and verify the tests fail because modules are missing.
- [ ] Implement constants and helper functions.
- [ ] Re-run the same command and verify it passes.

### Task 2: Anthropic Adapter

**Files:**
- Create: `src/composables/api/anthropicMessages.js`
- Create: `src/composables/api/anthropicMessages.test.js`

- [ ] Write failing tests for URL/header construction, system/user/assistant conversion, cache control on long system prompts, SSE text extraction, usage extraction, non-stream JSON extraction, and error reading.
- [ ] Run `npx vitest run src/composables/api/anthropicMessages.test.js` and verify failure.
- [ ] Implement the adapter and parser.
- [ ] Re-run the test and verify pass.

### Task 3: Gemini Adapter

**Files:**
- Create: `src/composables/api/geminiGenerateContent.js`
- Create: `src/composables/api/geminiGenerateContent.test.js`

- [ ] Write failing tests for URL/header construction, systemInstruction conversion, contents conversion, generationConfig mapping, SSE/JSON-line text extraction, usage extraction, non-stream JSON extraction, and error reading.
- [ ] Run `npx vitest run src/composables/api/geminiGenerateContent.test.js` and verify failure.
- [ ] Implement the adapter and parser.
- [ ] Re-run the test and verify pass.

### Task 4: Provider Request Integration

**Files:**
- Create: `src/composables/api/providerRequest.js`
- Create: `src/composables/api/providerRequest.test.js`
- Modify: `src/composables/api/streamingRequest.js`
- Modify: `src/composables/api/toolAwareStreamingRequest.js`
- Modify: `src/composables/api/chat/sharedChatExecutor.js`

- [ ] Write failing tests showing OpenAI-compatible still calls existing OpenAI helper, Anthropic/Gemini call `fetch` with native bodies, custom headers/body apply, and Anthropic/Gemini native tool calls are normalized back to the existing executor format.
- [ ] Run targeted tests and verify failure.
- [ ] Implement provider selection and update chat executors.
- [ ] Re-run targeted tests and verify pass.

### Task 5: Settings And Storage

**Files:**
- Modify: `src/composables/storage/appDataModules.js`
- Modify: `src/views/settings/composables/useApiConfigForm.js`
- Modify: `src/views/settings/SettingsApiConfig.vue`
- Modify or create tests near existing settings/storage tests.

- [ ] Write failing tests for config normalization preserving new fields and form save/load validating JSON.
- [ ] Run targeted tests and verify failure.
- [ ] Implement persistence normalization and settings UI form fields.
- [ ] Re-run targeted tests and verify pass.

### Task 6: Final Verification

**Files:**
- All changed files.

- [ ] Run `npx vitest run src/composables/api/providerFormats.test.js src/composables/api/requestCustomization.test.js src/composables/api/anthropicMessages.test.js src/composables/api/geminiGenerateContent.test.js src/composables/api/providerRequest.test.js src/composables/api/streamingRequest.test.js src/composables/api/toolAwareStreamingRequest.test.js`.
- [ ] Run `npm run build`.
- [ ] Run `npm run lint` if build and targeted tests pass.
- [ ] Review `git diff --stat` and key diffs for unrelated changes.

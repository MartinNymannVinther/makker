# ADR 0011: Streaming in the adapter — `stream()` beside `complete()`

Status: accepted · Date: 2026-09-19

## Context

The family's LLM adapter (`src/core/llm`) answers with one completion.
Every sibling asks it for one JSON object — a proposal, a title, a
plan — and shows the result when it has it. That shape has served four
products, and it is the wrong shape for the fifth: a conversation lives
on the tokens as they arrive. A person who has typed a question and
waits thirty seconds for a wall of text has been given a form, not a
chat; the POC streamed from its first day and it is the thing people
noticed.

Both providers stream. Mistral's chat endpoint answers as server-sent
events when asked with `stream: true`; Ollama's answers as one JSON
object per line. Both end with the same numbers the completion would
have carried — the model, the token counts, the reason it stopped.

## Decision

`LlmProvider` gains a second method beside `complete()`:

```ts
stream(messages, options?): AsyncGenerator<LlmStreamEvent>
```

It yields `{ type: "delta", text }` as text arrives and one closing
`{ type: "done", model, usage, finish }`. `finish` is new to both doors:
`stop`, `length` or `unknown`. A conversation shows `length` and offers
to continue from it, which the POC did with a hand-written sentence;
the adapter now says it, so the feature does not have to guess.

What is deliberately the same as `complete()`: the endpoint, the
headers, the retry on Mistral's 429, Ollama's retry without the
thinking flag, the typed `LlmError` before the first token, the key
never in a message. What is deliberately absent: JSON mode. A partial
JSON object is not a thing to show anyone, and a feature that wants
structure wants `complete()`.

The line splitting is one shared reader (`src/core/llm/lines.ts`),
because both formats are lines and a network hands them over cut
wherever it likes; the tests feed it pieces cut mid-token.

`src/modules/ai/service.ts` gets `streamAnswer()` beside
`askForJson()`: the same provider resolution, the same count against
the ceilings before the first token, a longer patience, and the
provider's own iterator handed back for the route to relay.

## Alternatives rejected

- **A callback.** `complete(messages, { onDelta })`. Fewer types, and a
  stream that cannot be abandoned: an async iterator is dropped by
  breaking out of the loop, and the reader's lock goes with it. A route
  that relays to a browser that closed the tab needs exactly that.
- **Streaming in the route, not the adapter.** Each route talking to
  each provider's wire format. That puts Mistral's SSE and Ollama's
  NDJSON in the product, which is the thing the adapter exists to keep
  out of it.
- **A separate streaming provider.** One class per provider per door.
  The endpoint, the headers and the retries would be written twice, and
  drift twice.

## Trade-offs accepted

- **Two doors to keep in step.** A fix to Mistral's error handling has
  to land in `post()`, where both doors share it; a fix that lands in
  one door's parser and not the other's is the drift this shape allows.
  The tests exercise both.
- **Token counts are the provider's word.** Mistral sends usage in the
  last event and Ollama in the last line; a stream that breaks off has
  none, and the message row records zero rather than an estimate.
- **The siblings gain a method they do not call.** Written so they can
  take it back unchanged; until one does, it is Makker's alone.

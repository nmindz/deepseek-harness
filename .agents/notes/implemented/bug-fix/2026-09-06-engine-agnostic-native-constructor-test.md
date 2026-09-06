# Agent Note: Engine-agnostic native constructor test

Status: implemented

English | [中文](2026-09-06-engine-agnostic-native-constructor-test.zh.md)

## Problem

`hasIntrinsicConstructor` decides whether a prototype is a realm's own `Object.prototype` or `Array.prototype`, and the lossless-JSON walkers in `dsh-util-values`, `dsh-tools`, `dsh-cordis-host-runner`, and the source-worker JSON closure each carry a copy. Every copy compared `Function.prototype.toString.call(constructor)` against the literal `function Object() { [native code] }`. That rendering is V8's. The ECMAScript NativeFunction grammar leaves the whitespace to the implementation: SpiderMonkey and JavaScriptCore print the body across indented lines.

On any non-V8 engine the comparison therefore failed for the engine's own intrinsics, so `snapshotJsonValue` rejected every plain object and array. In the browser client that rejection reached `expandAssistantStream`, which threw `Assistant stream raw chunk must be a lossless JSON object` while expanding the recorded Assistant `chunk` records. The throw killed the Session event-feed subscriber, so Firefox rendered the workspace tree, the header, and the Session stats while the transcript stayed empty and `Load earlier` could add nothing. Chromium passed every gate because V8 matches the literal.

## Decision

Each copy compares against this realm's own rendering, captured once as `NATIVE_CONSTRUCTOR_SOURCE` from `Array` and `Object`. Every realm reachable from a running process — an iframe, a `node:vm` context, a worker — runs that process's engine, so the local intrinsic is the only correct comparand, and no engine's whitespace is encoded anywhere. The source-worker copy captures its rendering through the intrinsics it already holds, before model code can reach `Function.prototype.toString`.

`apps/web/tests/cross-engine-transcript.e2e.ts` seeds the `bash-tool-turn` recording, opens it in Firefox, and requires the recorded user, Assistant, and Tool rows plus a silent console. CI installs Firefox beside Chromium for it.

## Alternatives considered

**Match the NativeFunction grammar with a whitespace-tolerant regular expression.** Rejected because it encodes a second guess about implementation-defined output; the local intrinsic is the exact answer already present in the realm.

**Normalize whitespace out of both strings before comparing.** Rejected for the same reason, and it weakens the check: a forged constructor whose source merely resembles a native one gains latitude.

**Drop the source comparison and keep the `constructor.name` and `constructor.prototype` identity checks.** Rejected because those two are trivially forgeable, which is what the source comparison exists to stop; `code-runtime` covers that forgery in its runtime suite.

**Parameterize the whole web e2e lane over browsers.** Rejected as disproportionate: over forty scenarios import `chromium` directly, and their goldens are engine-sensitive. One deliberately engine-crossing scenario carries the risk that matters.

## Consequences

Firefox and Safari render transcripts, and any realm-crossing JSON validation behaves the same on every engine. Chromium and Node behavior is unchanged, since V8's rendering is what the removed literal spelled.

The cross-engine scenario is the only browser lane outside Chromium; it asserts content and console silence rather than an aria golden, keeping it free of engine-specific layout. A fifth copy of the intrinsic test would not be caught by review alone — the scenario is the standing signal.

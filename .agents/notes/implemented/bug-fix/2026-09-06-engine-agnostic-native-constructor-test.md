# Agent Note: Engine-agnostic native constructor test

Status: implemented

English | [中文](2026-09-06-engine-agnostic-native-constructor-test.zh.md)

## Problem

`hasIntrinsicConstructor` decides whether a prototype is a realm's own `Object.prototype` or `Array.prototype`, and the lossless-JSON walkers in `dsh-util-values`, `dsh-tools`, `dsh-cordis-host-runner`, and `dsh-ptc-runtime-node` each carry a copy. A copy that compares `Function.prototype.toString.call(constructor)` against the literal `function Object() { [native code] }` encodes V8's rendering. The ECMAScript NativeFunction grammar leaves the whitespace to the implementation: SpiderMonkey and JavaScriptCore print the body across indented lines.

On any non-V8 engine such a comparison fails for the engine's own intrinsics, so the walker rejects every plain object and array. In the browser client that rejection reached `expandAssistantStream`, which threw `Assistant stream raw chunk must be a lossless JSON object` while expanding the recorded Assistant `chunk` records. The throw killed the Session event-feed subscriber, so Firefox rendered the workspace tree, the header, and the Session stats while the transcript stayed empty and `Load earlier` could add nothing. Chromium passed every gate because V8 matches the literal.

## Decision

Each copy compares against this realm's own rendering of `Array` and `Object`, so no engine's whitespace is encoded anywhere. Every realm reachable from a running process — an iframe, a `node:vm` context, a worker — runs that process's engine, so the local intrinsic is the only correct comparand.

The host copies in `dsh-util-values`, `dsh-tools`, and `dsh-cordis-host-runner` read the local rendering on each call. The `dsh-ptc-runtime-node` copy runs beside model code that can reassign the `Object` and `Array` globals, so it captures both renderings once as `NATIVE_CONSTRUCTOR_SOURCE`, through the intrinsics it already holds, before model code runs.

Each host copy has a unit test that replaces `Function.prototype.toString` with WebKit's rendering for the host and a `node:vm` realm and requires cross-realm containers to pass: `packages/core/session/tests/json.spec.ts`, `packages/core/tools/tests/json-schema.spec.ts`, and `packages/extensions/cordis-host-runner/tests/sandbox.spec.ts`. A V8 literal fails each of them.

`apps/web/tests/cross-engine-transcript.e2e.ts` seeds the `bash-tool-turn` recording, opens it in Firefox, and requires the recorded user, Assistant, and Tool rows plus a silent console. CI installs Firefox beside Chromium and WebKit for it.

## Alternatives considered

**Match the NativeFunction grammar with a whitespace-tolerant regular expression.** Rejected because it encodes a second guess about implementation-defined output; the local intrinsic is the exact answer already present in the realm.

**Normalize whitespace out of both strings before comparing.** Rejected for the same reason, and it weakens the check: a forged constructor whose source merely resembles a native one gains latitude.

**Drop the source comparison and keep the `constructor.name` and `constructor.prototype` identity checks.** Rejected because those two are trivially forgeable, which is what the source comparison exists to stop; the forged-prototype cases in `packages/core/session/tests/json.spec.ts` cover that forgery.

**Capture the rendering once in every copy.** Rejected for the host copies: a captured string is fixed at module load, so a test that substitutes another engine's rendering cannot reach it. Only the worker copy captures, because there reading the globals per call would let model code supply the comparand.

**Parameterize the whole web e2e lane over browsers.** Rejected as disproportionate: over forty scenarios import `chromium` directly, and their goldens are engine-sensitive.

## Consequences

Firefox and Safari render transcripts, and any realm-crossing JSON validation behaves the same on every engine. Chromium and Node behavior is unchanged, since V8's rendering is what the removed literal spelled.

The unit tests are the regression signal for the host copies. The cross-engine scenario is a render check only: reading a recorded Session goes through `validateRecord`, which does not reach `snapshotJsonValue`, so the scenario passes with a V8 literal in the client bundle. The worker copy has no engine-substitution test, because its capture runs when the worker starts, before a test can replace `Function.prototype.toString`.

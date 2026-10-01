# Agent Note: An explicit Session assignment overrides the directory match

Status: implemented

English | [中文](2026-09-30-assigned-session-membership-overrides-cwd.zh.md)

## Problem

A Session belonged to a Workspace only while its header `cwd` resolved to the Workspace's canonical path (`WorkspaceEntity.sessionIds` filtered the durable account on that fact, and `attachSession` refused any other header). The rule gives correct automatic grouping, but it was also a ceiling: a Session started in a subfolder, from the CLI in a directory never registered, or whose directory had moved landed in Ungrouped and stayed there. Deleting a Workspace scattered its Sessions into Ungrouped with no way back short of re-creating the registration at the same path — and even then only Sessions whose cwd matched returned. The user had no say in grouping.

## Decision

A workspace record carries `assignedSessionIds`, the accounted Sessions the user moved in explicitly; it is always a subset of `sessionIds`. The membership rule becomes "accounted, and either assigned or cwd-matched": `WorkspaceEntity.sessionIds` keeps an assigned id regardless of its header cwd, the durable prune in `mutate` keeps assigned ids and narrows the assigned set to the ids the pruned account still holds, `detachSession` removes the id from both arrays, and `validateStoredState` rejects an assigned id that is repeated or not in its own account. Automatic membership is unchanged: a Session still joins on its own only through the directory match, and `attachSession` without `assigned` still validates the cwd.

- **One operation moves.** `WorkspaceRegistry.moveSession(sessionId, workspaceId?)` runs on the registry's serialized chain: an unknown target, an archived target (`WorkspaceArchivedError`), and an unknown Session are refused before any write; the current holder is found through the record-level `accounts()` so a cwd-filtered candidate is also released; the detach is written first, then the target's `attachSession(sessionId, { assigned: true })`. An interrupted move can therefore only leave the Session Ungrouped, never double-owned, and the one-owner validation at startup stays as it was. A move to no target detaches only.
- **`assigned` reads the header but not its cwd.** The Session must still exist (`readSessionHeader` rejects an unknown id), so the rescue case — a header whose cwd is missing or no longer resolves — is exactly what assignment is for.
- **Forks follow.** The API Session Controller attaches a fork of an assigned member as assigned to the same Workspace; a fork of a cwd-matched member attaches as before.
- **The registry-global sets are untouched.** A moved Session keeps its pin and its archive flag; the browser-local manual order reconciles the newcomer at the head of the target account, as any new member.

The Session's `cwd` never changes: tools keep running where the Session ran, and a New Session started from the target group still starts in the Workspace's own path. The sidebar's Move to… dialog states this.

## Alternatives considered

**Rewrite the Session header cwd.** Would make the directory match hold again, but the header is immutable by design and the Session's tools would run in a directory the user never chose.

**Group Ungrouped Sessions under the nearest ancestor Workspace automatically.** Removes the user's choice and guesses wrong for monorepos with several registered subfolders; an explicit move is reversible and names its target.

**Derive membership from a per-Session `workspaceId` on the header.** Ownership is a Workspace-side fact that carries order ([domain KV storage and the workspace entity](../../proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.md)); a Session-side pointer would be a second source of truth for the same account.

## Consequences

The record gains one array that every write must keep as a subset of the account; the filter and the prune now consult two facts instead of one. "Workspace = directory" is no longer strictly true for the sidebar: an assigned Session shows under a Workspace whose path is not its cwd, which the dialog explains and the package README documents as the replacement of the former "cannot be moved in" limitation. What this buys is that no Session is stranded in Ungrouped, that a deleted Workspace's Sessions can be regrouped, and that a fork of a moved Session lands beside its parent.

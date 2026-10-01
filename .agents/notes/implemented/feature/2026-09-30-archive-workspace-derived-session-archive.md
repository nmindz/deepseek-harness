# Agent Note: Archiving a Workspace archives its Sessions by derivation

Status: implemented

English | [中文](2026-09-30-archive-workspace-derived-session-archive.zh.md)

## Problem

A Session could be archived; a Workspace could only be deleted. Deleting a registration drops its order slot and its Session account, so every Session falls into Ungrouped and the grouping is gone for good. A finished project therefore stayed in the sidebar, or the user archived its Sessions one by one and kept an empty group header. Archiving the Workspace had to be reversible with nothing lost: title, path, order slot, Session order, and each Session's own pin and archive flags.

## Decision

The workspace domain carries a second registry-global durable set, `archivedWorkspaceIds`, beside `archivedSessionIds`. `WorkspaceRegistry.archiveWorkspace` writes the Workspace id into that set and nothing else; `unarchiveWorkspace` removes it. The record, its `workspaceIds` slot, its `sessionIds` account, and the Sessions' own flags are never touched, so a restore is one set removal and the group returns exactly as it was.

- **A Session's archive through its Workspace is derived, never written.** `WorkspaceRegistry.isSessionEffectivelyArchived(sessionId)` is true when the id is in `archivedSessionIds` or its owning Workspace is in `archivedWorkspaceIds`. The API Session Controller's `agent/pre-step` gate reads it at every lineage hop, `pinSession` refuses through it, and `session.create` with the Workspace id or `session.fork` of one of its Sessions is refused as `workspace/archived`. The sidebar folds the two sets pushed by the follow stream into one effective set (`effectiveArchivedSessionIds` in `ui-workspace/src/client/tree.ts`) that every derivation and row action reads. Because nothing is written per Session, a Session archived on its own before the Workspace was archived stays archived after the Workspace is restored.
- **Running work is refused per Session.** `archiveWorkspace` asks the `workspace/session-activity` waterfall once for every accounted Session that is not already in `archivedSessionIds` and rejects any reported activity with `WorkspaceActiveError(workspaceId, sessions)`, each entry naming the Session and its activity; the controller maps it to `workspace/workspace-active` with the same details. `stopActivity: true` writes the set first and then dispatches `workspace/session-stop` for each Session that reported activity, under the [archive-stops-running-work](2026-09-21-archive-stops-running-session-work.md) rules.
- **One confirmation names every Session.** The sidebar sends the plain archive first; the Host's refusal opens a stop-and-archive dialog listing each active Session's display title with its work, taken from the Host's answer rather than a client-side mirror. Confirming resends with `stopActivity`; the notice offers undo.
- **Archived groups follow the archived filter as a whole.** The default filter hides the group and its Sessions; "show archived" renders it dimmed in its slot; "archived only" lists it with all its Sessions. A click on a Session archived through its Workspace explains that the Workspace, not the Session, is what to restore. The group offers no New session button, and the recent-Workspace fallback for an unscoped New Session skips archived Workspaces.

The error code `workspace/archived` is declared in the domain package `@deepseek-ai/dsh-workspace` next to `workspace/not-found`, because both controllers that throw workspace codes depend on the domain package and neither depends on the other.

## Alternatives considered

**Write every member Session into `archivedSessionIds`.** One archive concept, no derivation. Restoring the Workspace would then unarchive Sessions the user had archived individually before, or require remembering which ones were already archived — a third set that is the derivation in disguise.

**Hide the group in the client only.** Reaches one client and leaves the Host gate, pinning, create, and fork unaware; a hidden Session could still run a model step.

**Archive as a soft delete that detaches Sessions.** Loses the Session order and the one-owner account that make a restore exact.

## Consequences

Two sets to keep consistent instead of one: `validateStoredState` rejects an archived Workspace id absent from the order, and `deleteKnown` drops the id in the same state write as the order removal. Every consumer that asked "is this Session archived?" by reading `archivedSessionIds` alone had to move to the effective answer (the pre-step gate, the schedule task link, the sidebar). The activity check runs one waterfall per accounted Session inside the registry queue, which is sequential and small in practice. What this buys is a reversible archive whose restore is exact, and a Workspace archive the Host enforces for every caller, not only the sidebar.

/**
 * Public type vocabulary of the workspace entity: the `WorkspaceId` brand and
 * the `Workspace` consumer interface. Types only — the `WorkspaceId` factory
 * lives in `index.ts` (this file carries no runtime code).
 * @module @deepseek-ai/dsh-workspace/src/types
 */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-typert-protocol'
import type { WorkspaceAppearance } from './appearance.ts'

export type {
  WorkspaceAppearance, WorkspaceColor, WorkspaceEmojiRef, WorkspaceIconId, WorkspaceIconRef,
} from './appearance.ts'

/**
 * Identifies one workspace record. A generated uuid, never the path: path
 * normalization rewrites paths, and a reference anchor must stay stable.
 */
export type WorkspaceId = Branded<'WorkspaceId'>

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** No registration carries that Workspace identity. */
    'workspace/not-found': { readonly workspaceId: WorkspaceId }
    /** The Workspace is archived; the verb is refused until it is restored. */
    'workspace/archived': { readonly workspaceId: WorkspaceId }
  }
}

/**
 * Activity families a `workspace/session-activity` listener may report. This
 * package declares none: each provider merges its own key from a module both
 * its Host and Client faces import, so a consumer that renders the families
 * sees exactly the keys its program compiled and falls through to a generic
 * description for any other. The shipped providers merge `turn` (the Agent
 * registry), `job` (the job registry seam), `subagent` (the Subagent
 * runtime), and `schedule` (the Schedule plugin).
 */
export interface SessionActivityKindMap {}

/** One activity family key. */
export type SessionActivityKind = keyof SessionActivityKindMap

/** One active item of a family that has per-item identity. */
export interface SessionActivityItem {
  /** Family-specific identity: a session id, a job id, or a schedule id. */
  readonly id: string
  /** Display label when the family carries one (a job label, a subagent label). */
  readonly label?: string
}

/**
 * One reason a session counts as active for archive admission. Families with
 * per-item identity list their items so a caller can name what must stop.
 */
export interface SessionActivity {
  readonly kind: SessionActivityKind
  /** Active items of the family; absent for a family without per-item identity (`turn`). */
  readonly items?: readonly SessionActivityItem[]
}

/** Caller choices for {@link Workspace.attachSession}. */
export interface AttachSessionOptions {
  /**
   * Record the session as an explicit assignment: membership then rests on
   * the user's choice instead of the canonical-cwd match, so the header must
   * exist but its cwd is neither compared nor required to resolve. The id
   * stays a member until it is detached or moved again.
   */
  readonly assigned?: boolean
}

/**
 * One workspace: a stable id over an existing directory, a display title, and
 * an ordered candidate account of sessions. Membership requires an id in that
 * account plus either an explicit assignment or a session header whose
 * canonical cwd equals the workspace path. Consumers only see this
 * interface; the implementation stays private.
 */
export interface Workspace {
  /** Stable record id (generated uuid). */
  readonly id: WorkspaceId

  /**
   * Canonical directory path: the `fs.realpath` of the path given at create
   * time (trailing slashes, `..`, and symlinks all resolved). Never rewritten
   * afterwards, even when the directory disappears (see {@link status}).
   */
  readonly path: string

  /** Display title. Defaults to the final path segment, or a filesystem root's own spelling; duplicates are allowed. */
  readonly title: string

  /** ISO-8601 creation instant, stamped at create and never rewritten. */
  readonly createdAt: string

  /** ISO-8601 instant of the last durable mutation (create counts as one). */
  readonly updatedAt: string

  /**
   * Member sessions in manually owned order: a new session is prepended at
   * attach, explicit reordering goes through `insertSessionBefore`, and
   * activity never reorders. The durable candidate account is filtered
   * synchronously: an id in {@link assignedSessionIds} is always returned;
   * any other candidate needs a header whose canonical cwd equals
   * {@link path}, so missing headers, invalid cwd values, and canonical cwd
   * mismatches are never returned. A subsequent workspace mutation prunes
   * those filtered candidates durably.
   */
  readonly sessionIds: readonly SessionId[]

  /**
   * The accounted sessions a user moved in explicitly, in assignment order.
   * Always a subset of the durable account, and exempt from the cwd filter
   * that decides the other members of {@link sessionIds}.
   */
  readonly assignedSessionIds: readonly SessionId[]

  /** User-chosen accent color and icon; `undefined` when both are the default. */
  readonly appearance: WorkspaceAppearance | undefined

  /**
   * Replace the display title durably.
   * @param title - New title; any string, duplicates across workspaces allowed.
   * @returns resolution after durability.
   */
  setTitle(title: string): Promise<void>

  /**
   * Replace the accent color and icon durably. An empty object clears both;
   * a value equal to the current one resolves without writing, aside from the
   * durable filtered-candidate prune every accepted mutation performs. The
   * caller validates the fields; this method trusts them.
   * @param appearance - Color and icon to store; omitted fields are cleared.
   * @returns resolution after durability.
   */
  setAppearance(appearance: WorkspaceAppearance): Promise<void>

  /**
   * Prepend a session to this workspace's candidate account. Without
   * `assigned`, a new id's live or persisted header cwd must resolve to an
   * existing directory equal to {@link path}; unknown ids, missing or
   * invalid cwd values, and mismatches reject without writing, and an already
   * accounted id resolves without writing. With `assigned`, the header must
   * exist (an unknown id rejects without writing) but its cwd is not read:
   * the id is prepended and recorded in {@link assignedSessionIds}; an
   * accounted but unassigned id is marked assigned in one write, and an
   * accounted assigned id resolves without writing. Every accepted mutation
   * also performs the durable filtered-candidate prune. Membership is decided
   * on the domain write chain.
   * @param sessionId - The session to record.
   * @param options - Whether the session is an explicit assignment.
   * @returns resolution after durability.
   */
  attachSession(sessionId: SessionId, options?: AttachSessionOptions): Promise<void>

  /**
   * Move an accounted session within the manual order, DOM-insertBefore-like:
   * with an anchor the session lands before it, without one it appends to the
   * end. Only the moved id changes position. A session or anchor absent from
   * the account rejects without writing; a move to the current position
   * resolves without writing, aside from the durable filtered-candidate
   * prune every accepted mutation performs; decided on the domain write
   * chain.
   * @param sessionId - The accounted session to move.
   * @param beforeSessionId - Accounted anchor to insert before; omitted appends.
   * @returns resolution after durability.
   */
  insertSessionBefore(sessionId: SessionId, beforeSessionId?: SessionId): Promise<void>

  /**
   * Remove a session from this workspace's account and, when present, from
   * {@link assignedSessionIds}. Idempotent: an id not on the account resolves
   * without writing, aside from the durable filtered-candidate prune every
   * accepted mutation performs; decided on the domain write chain like
   * attach. Never touches the session's own stored log.
   * @param sessionId - The session to remove.
   * @returns resolution after durability.
   */
  detachSession(sessionId: SessionId): Promise<void>

  /**
   * Live directory check, uncached: whether {@link path} currently exists and
   * is a directory. A missing directory never mutates the record — the
   * directory may only be temporarily moved.
   * @returns `'ok'` when the directory exists, `'missing-dir'` otherwise.
   */
  status(): Promise<'ok' | 'missing-dir'>
}

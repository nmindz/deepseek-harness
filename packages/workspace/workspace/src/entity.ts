/**
 * Package-private workspace entity: the single {@link Workspace}
 * implementation. Holds a record snapshot that is swapped in place after each
 * durable mutation; every write funnels through the private `mutate` so
 * `updatedAt` stamping and invalid-account pruning happen exactly once.
 * Not re-exported from the package entrypoint — consumers see only the
 * `Workspace` interface.
 * @module @deepseek-ai/dsh-workspace/src/entity
 */

import { stat } from 'node:fs/promises'
import type { SessionHeader, SessionId } from '@deepseek-ai/dsh-session'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import type { WorkspaceRecord } from './spec.ts'
import type { AttachSessionOptions, Workspace, WorkspaceAppearance, WorkspaceId } from './types.ts'
import { realpathNormalize } from './paths.ts'

/** An insertSessionBefore request named a session or anchor not on the account (storage failures stay plain errors). */
export class WorkspaceMoveInvalidError extends Error {
  /**
   * @param message - Which id was unaccounted and where.
   */
  constructor(message: string) {
    super(message)
    this.name = 'WorkspaceMoveInvalidError'
  }
}

/**
 * The registry-owned machinery an entity mutates through. Entities never see
 * the registry itself — only the open table, the canonical session-path
 * index backing the `sessionIds` projection, and attach-time header reads.
 */
export interface WorkspaceEntityHost {
  /**
   * Resolve the open `workspaces` table.
   * @returns the table; throws while the registry has not started yet.
   */
  table(): KvTable<WorkspaceId, WorkspaceRecord>

  /**
   * Read a session's canonical directory from the registry's header index.
   * @param id - Session whose indexed path is requested.
   * @returns the canonical directory, or `undefined` when the header is
   * missing or its cwd cannot identify an existing directory.
   */
  sessionPath(id: SessionId): string | undefined

  /**
   * Read one stored session header for attach validation.
   * @param id - The session whose header to read.
   * @returns the header; rejects when session persistence is absent or holds
   * no session with this id.
   */
  readSessionHeader(id: SessionId): Promise<SessionHeader>

  /**
   * Publish a successfully validated canonical cwd to the projection index.
   * @param id - Validated session id.
   * @param path - Canonical existing directory from the immutable header cwd.
   */
  rememberSessionPath(id: SessionId, path: string): void
}

/** Chain-slot abort sentinel thrown by the update fn when the record needs no change; only `mutate` observes it. */
const unchangedSentinel = new Error('workspace record unchanged (internal sentinel)')

/** The single {@link Workspace} implementation; constructed only by the registry. */
export class WorkspaceEntity implements Workspace {
  private record: WorkspaceRecord

  /**
   * @param host - Registry-owned table, session-path index, and header reads.
   * @param id - The record's stable id.
   * @param record - The validated record snapshot loaded or just written.
   */
  constructor(
    private readonly host: WorkspaceEntityHost,
    readonly id: WorkspaceId,
    record: WorkspaceRecord,
  ) {
    this.record = record
  }

  get path(): string {
    return this.record.path
  }

  get title(): string {
    return this.record.title
  }

  get createdAt(): string {
    return this.record.createdAt
  }

  get updatedAt(): string {
    return this.record.updatedAt
  }

  get sessionIds(): readonly SessionId[] {
    return this.record.sessionIds.filter(id => memberOf(this.record, id, this.host))
  }

  get assignedSessionIds(): readonly SessionId[] {
    return this.record.assignedSessionIds
  }

  get appearance(): WorkspaceAppearance | undefined {
    return this.record.appearance
  }

  async setTitle(title: string): Promise<void> {
    await this.mutate(record => ({ ...record, title }))
  }

  async setAppearance(appearance: WorkspaceAppearance): Promise<void> {
    const next = normalizeAppearance(appearance)
    await this.mutate((record) => {
      if (sameAppearance(record.appearance, next)) return record
      // A reset deletes the field so the stored record carries no `appearance` key.
      const { appearance: _current, ...rest } = record
      return next === undefined ? rest : { ...rest, appearance: next }
    })
  }

  async attachSession(sessionId: SessionId, options: AttachSessionOptions = {}): Promise<void> {
    const assigned = options.assigned === true
    // Validation is skipped when the settled snapshot already accounts the
    // id: the cwd fact was checked when it first attached and both inputs
    // (stored header cwd, workspace path) are immutable. Membership itself is
    // decided on the write chain inside `mutate`, never on this snapshot.
    if (!this.record.sessionIds.includes(sessionId)) {
      const header = await this.host.readSessionHeader(sessionId)
      if (!assigned) await this.validateCwd(sessionId, header)
    }
    await this.mutate((record) => {
      const accounted = record.sessionIds.includes(sessionId)
      if (accounted && (!assigned || record.assignedSessionIds.includes(sessionId))) return record
      return {
        ...record,
        sessionIds: accounted ? record.sessionIds : [sessionId, ...record.sessionIds],
        assignedSessionIds: assigned
          ? [...record.assignedSessionIds, sessionId]
          : record.assignedSessionIds,
      }
    })
  }

  /**
   * Whether the durable account names a session, before the membership
   * filter; the registry's owner lookup for a move uses this so a
   * cwd-filtered candidate is still detached from its holder.
   * @param sessionId - The session to test.
   * @returns `true` when the record's `sessionIds` include the id.
   */
  accounts(sessionId: SessionId): boolean {
    return this.record.sessionIds.includes(sessionId)
  }

  async insertSessionBefore(sessionId: SessionId, beforeSessionId?: SessionId): Promise<void> {
    await this.mutate((record) => {
      if (!record.sessionIds.includes(sessionId)) {
        throw new WorkspaceMoveInvalidError(
          `cannot move session '${sessionId}' in workspace '${record.path}': the session is not accounted`,
        )
      }
      if (beforeSessionId !== undefined && !record.sessionIds.includes(beforeSessionId)) {
        throw new WorkspaceMoveInvalidError(
          `cannot move session '${sessionId}' before '${beforeSessionId}' in workspace '${record.path}': `
          + 'the anchor session is not accounted',
        )
      }
      if (beforeSessionId === sessionId) return record
      const without = record.sessionIds.filter(id => id !== sessionId)
      const at = beforeSessionId === undefined ? without.length : without.indexOf(beforeSessionId)
      const sessionIds = [...without.slice(0, at), sessionId, ...without.slice(at)]
      return sessionIds.every((id, index) => id === record.sessionIds[index])
        ? record
        : { ...record, sessionIds }
    })
  }

  async detachSession(sessionId: SessionId): Promise<void> {
    // `mutate` narrows the assigned set to the surviving account, so the id leaves both arrays.
    await this.mutate(record => record.sessionIds.includes(sessionId)
      ? { ...record, sessionIds: record.sessionIds.filter(id => id !== sessionId) }
      : record)
  }

  async status(): Promise<'ok' | 'missing-dir'> {
    try {
      return (await stat(this.record.path)).isDirectory() ? 'ok' : 'missing-dir'
    } catch {
      // Any stat failure (ENOENT, dangling parent, permission loss) means the
      // directory is not usable right now; the record itself never mutates.
      return 'missing-dir'
    }
  }

  /** Reject a first attach whose header cwd does not identify this workspace's directory; publish the validated path. */
  private async validateCwd(sessionId: SessionId, header: SessionHeader): Promise<void> {
    if (header.cwd === undefined) {
      throw new Error(
        `cannot attach session '${sessionId}' to workspace '${this.record.path}': `
        + 'its stored header carries no cwd to validate against',
      )
    }
    let cwd: string
    try {
      cwd = await realpathNormalize(header.cwd)
    } catch (error) {
      throw new Error(
        `cannot attach session '${sessionId}' to workspace '${this.record.path}': `
        + `its cwd '${header.cwd}' does not resolve, so it cannot be validated`,
        { cause: error },
      )
    }
    if (!(await stat(cwd)).isDirectory()) {
      throw new Error(
        `cannot attach session '${sessionId}' to workspace '${this.record.path}': `
        + `its cwd '${header.cwd}' is not a directory`,
      )
    }
    if (cwd !== this.record.path) {
      throw new Error(
        `cannot attach session '${sessionId}' to workspace '${this.record.path}': `
        + `its cwd resolves to '${cwd}'`,
      )
    }
    this.host.rememberSessionPath(sessionId, cwd)
  }

  /**
   * The single write path: run `fn` on the domain write chain via
   * `table.update`, stamping `updatedAt` and pruning unassigned candidates
   * that no longer pass the canonical-cwd membership check, then swap the
   * snapshot. Assigned ids survive the prune regardless of cwd, and the
   * assigned set is narrowed to the ids the pruned account still holds.
   *
   * `fn` sees the value current at its chain slot, so membership decisions
   * (attach/detach idempotence) are race-free against queued writes; a fn
   * signalling no change by returning `current` verbatim aborts the slot
   * through the sentinel when pruning also finds nothing, so a no-op neither
   * rewrites the medium nor emits a change event.
   */
  private async mutate(fn: (record: WorkspaceRecord) => WorkspaceRecord): Promise<void> {
    let next: WorkspaceRecord
    try {
      next = await this.host.table().update(this.id, (current) => {
        const changed = fn(current)
        const sessionIds = changed.sessionIds.filter(id => memberOf(changed, id, this.host))
        if (changed === current && sessionIds.length === current.sessionIds.length) {
          throw unchangedSentinel
        }
        const kept = new Set(sessionIds)
        return {
          ...changed,
          sessionIds,
          assignedSessionIds: changed.assignedSessionIds.filter(id => kept.has(id)),
          updatedAt: new Date().toISOString(),
        }
      })
    } catch (error) {
      if (error === unchangedSentinel) return
      throw error
    }
    this.record = next
  }
}

/** Drop absent fields; an appearance with neither field is the default and is stored as no field at all. */
function normalizeAppearance(appearance: WorkspaceAppearance): WorkspaceAppearance | undefined {
  const normalized: WorkspaceAppearance = {
    ...appearance.color === undefined ? {} : { color: appearance.color },
    ...appearance.icon === undefined ? {} : { icon: appearance.icon },
  }
  return normalized.color === undefined && normalized.icon === undefined ? undefined : normalized
}

/** Field-wise equality of two normalized appearances. */
function sameAppearance(left: WorkspaceAppearance | undefined, right: WorkspaceAppearance | undefined): boolean {
  return left?.color === right?.color && left?.icon === right?.icon
}

/** The membership rule over one record: an explicit assignment, or a header whose canonical cwd is the workspace path. */
function memberOf(
  record: WorkspaceRecord,
  sessionId: SessionId,
  host: Pick<WorkspaceEntityHost, 'sessionPath'>,
): boolean {
  return record.assignedSessionIds.includes(sessionId) || host.sessionPath(sessionId) === record.path
}

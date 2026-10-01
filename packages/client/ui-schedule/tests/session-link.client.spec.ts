import { describe, expect, it } from 'vitest'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceId, WorkspaceSnapshot, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { sessionLinkState } from '../src/client/session-link.ts'

const id = 'session-original' as SessionId

const ready: WorkspaceSnapshot = {
  items: [], archivedSessionIds: [], pinnedSessionIds: [], archivedWorkspaceIds: [], state: 'idle', phase: 'ready', error: null,
}

/** Session list whose Host-list projection is `ids` and whose rows are `byId`. */
function sessions(ids: SessionId[], rows: SessionId[]): SessionListState {
  return {
    ids,
    byId: Object.fromEntries(rows.map(row => [row, {
      id: row, displayTitle: row, running: false, blank: false, updatedAt: 0, retainedBy: {},
    }] as const)),
    phase: 'ready', projectionsBySession: {},
  }
}

describe('linked Session availability', () => {
  it('accepts a Session the Host list contains', () => {
    expect(sessionLinkState(id, sessions([id], [id]), ready)).toBe('available')
  })

  it('rejects a Session the Host list dropped even while a local fallback row survives', () => {
    // `byId` keeps local fallback rows for live Client generations, so only
    // `ids` expresses Host-list membership.
    const fallback = sessions([], [id])
    expect(fallback.byId[id]).toBeDefined()
    expect(sessionLinkState(id, fallback, ready)).toBe('unavailable')
  })

  it('reports archived and loading ahead of membership', () => {
    expect(sessionLinkState(id, sessions([], []), { ...ready, archivedSessionIds: [id] })).toBe('archived')
    expect(sessionLinkState(id, { ...sessions([], []), phase: 'pending' }, ready)).toBe('loading')
    expect(sessionLinkState(id, sessions([id], [id]), { ...ready, phase: 'pending' })).toBe('loading')
  })

  it('reports a Session archived through its Workspace as archived', () => {
    const view = (workspaceId: string, sessionIds: SessionId[]): WorkspaceView => ({
      workspaceId: workspaceId as WorkspaceId, path: `/w/${workspaceId}`, title: workspaceId, sessionIds, assignedSessionIds: [],
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    })
    const items = [view('live', []), view('shelved', [id])]
    expect(sessionLinkState(id, sessions([id], [id]), { ...ready, items, archivedWorkspaceIds: ['shelved' as WorkspaceId] }))
      .toBe('archived')
    // Another archived Workspace, or none, leaves the Session available.
    expect(sessionLinkState(id, sessions([id], [id]), { ...ready, items, archivedWorkspaceIds: ['live' as WorkspaceId] }))
      .toBe('available')
    expect(sessionLinkState(id, sessions([id], [id]), { ...ready, items })).toBe('available')
    // A Session no Workspace accounts is never archived through one.
    expect(sessionLinkState(id, sessions([id], [id]), { ...ready, items: [view('live', [])], archivedWorkspaceIds: ['live' as WorkspaceId] }))
      .toBe('available')
  })
})

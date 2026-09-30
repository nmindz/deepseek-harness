import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { unsupportedInbox } from '@deepseek-ai/dsh-agent-loop-testkit'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import type { Session } from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import WorkspaceRegistry from '@deepseek-ai/dsh-workspace'
import { afterEach, describe, expect, it } from 'vitest'
import { ArchivedSessionGate } from '../src/archived-session-gate.ts'
import { MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'

interface Harness {
  ctx: Context
  archived: SessionId[]
}

/** A registry double answering the one question the gate asks: the archived Session set alone decides. */
function archivedSetRegistry(archived: SessionId[]): { isSessionEffectivelyArchived(id: SessionId): boolean } {
  return { isSessionEffectivelyArchived: id => archived.includes(id) }
}

async function harness(): Promise<Harness> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  const archived: SessionId[] = []
  ctx.provide('workspaceRegistry', archivedSetRegistry(archived) as never)
  await ctx.plugin(ArchivedSessionGate)
  return { ctx, archived }
}

/** Workspace directories created per test, removed after the test settles. */
const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** The gate over the real Workspace registry on a memory backend, with one registered Workspace. */
async function registryHarness(): Promise<{ ctx: Context; workspacePath: string }> {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-archived-gate-')))
  tempDirs.push(root)
  const workspacePath = join(root, 'project')
  mkdirSync(workspacePath)
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend())
  const storageDomain = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', storageDomain)
  ctx.provide('storageDomain', storageDomain)
  ctx.provide('sessionPersistence', { list: () => Promise.resolve([]) } as never)
  await ctx.plugin(WorkspaceRegistry)
  await ctx.plugin(ArchivedSessionGate)
  return { ctx, workspacePath }
}

/** A registered idle Agent double: the gate reads only its Session header. */
async function liveAgent(ctx: Context, session: Session): Promise<Agent> {
  const agent: Agent = {
    id: session.id,
    options: {},
    session,
    inbox: unsupportedInbox(),
    status: 'idle',
    ctx,
    send: () => {},
    followup: () => {},
    steer: () => {},
    inject: () => {},
    cancel: () => {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
  await ctx.agents.register(agent)
  return agent
}

/** Propose one model step for the Agent; the innermost decision enters. */
const proposed = (ctx: Context, agent: Agent) => ctx.waterfall(
  'agent/pre-step',
  { agent, messages: [], turn: 1, step: 1, signal: new AbortController().signal },
  () => Promise.resolve({ kind: 'enter' as const, messages: [] }),
)

describe('Archived-session gate', () => {
  it('rejects a proposed step for an archived session and lets others through', async () => {
    const { ctx, archived } = await harness()
    const hidden = await liveAgent(ctx, ctx.sessions.create(SessionId('hidden')))
    const visible = await liveAgent(ctx, ctx.sessions.create(SessionId('visible')))
    archived.push(hidden.id)
    expect(await proposed(ctx, hidden)).toEqual({ kind: 'reject' })
    expect(await proposed(ctx, visible)).toEqual({ kind: 'enter', messages: [] })
    archived.length = 0
    expect(await proposed(ctx, hidden)).toEqual({ kind: 'enter', messages: [] })
  })

  it('rejects steps of subagent descendants of an archived session, at any depth, but not of its forks', async () => {
    const { ctx, archived } = await harness()
    const root = await liveAgent(ctx, ctx.sessions.create(SessionId('archived-root')))
    const child = await liveAgent(ctx, ctx.sessions.create(SessionId('woken-child'), {
      meta: { parentSession: root.id, origin: 'subagent' },
    }))
    // A settlement from its own child wakes this continuable child after the
    // root was archived; the gate must see the archived root above it.
    const grandchild = await liveAgent(ctx, ctx.sessions.create(SessionId('woken-grandchild'), {
      meta: { parentSession: child.id, origin: 'subagent' },
    }))
    const fork = await liveAgent(ctx, ctx.sessions.create(SessionId('fork-of-archived'), {
      meta: { parentSession: root.id },
    }))
    // A child whose parent Session is not resident is judged by the parent id alone.
    const orphan = await liveAgent(ctx, ctx.sessions.create(SessionId('orphan-child'), {
      meta: { parentSession: SessionId('gone-parent'), origin: 'subagent' },
    }))
    archived.push(root.id, SessionId('gone-parent'))

    expect(await proposed(ctx, child)).toEqual({ kind: 'reject' })
    expect(await proposed(ctx, grandchild)).toEqual({ kind: 'reject' })
    expect(await proposed(ctx, orphan)).toEqual({ kind: 'reject' })
    expect(await proposed(ctx, fork)).toEqual({ kind: 'enter', messages: [] })
    archived.length = 0
    expect(await proposed(ctx, grandchild)).toEqual({ kind: 'enter', messages: [] })
  })

  it('terminates on a damaged lineage that loops', async () => {
    const { ctx, archived } = await harness()
    const first = ctx.sessions.create(SessionId('gate-loop-a'), { meta: { parentSession: SessionId('gate-loop-b'), origin: 'subagent' } })
    const second = ctx.sessions.create(SessionId('gate-loop-b'), { meta: { parentSession: first.id, origin: 'subagent' } })
    const agent = await liveAgent(ctx, first)
    await liveAgent(ctx, second)
    expect(await proposed(ctx, agent)).toEqual({ kind: 'enter', messages: [] })
    archived.push(second.id)
    expect(await proposed(ctx, agent)).toEqual({ kind: 'reject' })
  })
})

describe('Archived-session gate: archived Workspaces', () => {
  it('rejects steps for Sessions of an archived Workspace and their subagents until the Workspace is unarchived', async () => {
    const { ctx, workspacePath } = await registryHarness()
    const workspace = await ctx.workspaceRegistry.create(workspacePath)
    const member = await liveAgent(ctx, ctx.sessions.create(SessionId('member'), { meta: { cwd: workspacePath } }))
    await workspace.attachSession(member.id)
    // A subagent under the member is accounted nowhere itself; only its lineage reaches the Workspace.
    const child = await liveAgent(ctx, ctx.sessions.create(SessionId('member-child'), {
      meta: { cwd: workspacePath, parentSession: member.id, origin: 'subagent' },
    }))
    const outsider = await liveAgent(ctx, ctx.sessions.create(SessionId('outsider'), { meta: { cwd: workspacePath } }))
    expect(await proposed(ctx, member)).toEqual({ kind: 'enter', messages: [] })

    await ctx.workspaceRegistry.archiveWorkspace(workspace.id)
    expect(await proposed(ctx, member)).toEqual({ kind: 'reject' })
    expect(await proposed(ctx, child)).toEqual({ kind: 'reject' })
    expect(await proposed(ctx, outsider)).toEqual({ kind: 'enter', messages: [] })
    // The Workspace archive is derived, never written into the Session archive set.
    expect([...ctx.workspaceRegistry.archivedSessionIds]).toEqual([])

    await ctx.workspaceRegistry.unarchiveWorkspace(workspace.id)
    expect(await proposed(ctx, member)).toEqual({ kind: 'enter', messages: [] })
    expect(await proposed(ctx, child)).toEqual({ kind: 'enter', messages: [] })
    await ctx.fiber.dispose()
  })
})

describe('Archived-session gate: lifetime', () => {
  it('stops rejecting once the plugin fiber is disposed', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(AgentRegistry)
    const archived: SessionId[] = []
    ctx.provide('workspaceRegistry', archivedSetRegistry(archived) as never)
    const agent = await liveAgent(ctx, ctx.sessions.create(SessionId('watched')))
    archived.push(agent.id)
    const fiber = await ctx.plugin(ArchivedSessionGate)
    expect(await proposed(ctx, agent)).toEqual({ kind: 'reject' })
    await fiber.dispose()
    expect(await proposed(ctx, agent)).toEqual({ kind: 'enter', messages: [] })
  })
})

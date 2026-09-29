// Web e2e scenario: the only lane on a non-V8 engine — every other browser
// scenario drives Chromium, so a V8-only client assumption passes them all.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { firefox } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  fixtureUserPrompts, launchWebScaffold, seedSession, selectedSessionFixture, watchConsole,
  webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { saveFailureShot } from './support.ts'

// A recorded turn whose Assistant stream carries compact chunk runs: reading it
// back runs the stream expansion that rejects a foreign-realm JSON value.
const FIXTURE = fileURLToPath(new URL('../../../snapshots/session/bash-tool-turn/session.v3.jsonl', import.meta.url))
const MODE = webSnapshotMode()
const SEED_ID = 'cross-engine-transcript-web-e2e'
const PROMPT = 'Use the bash tool to run exactly: echo TERMINAL_OK. Then reply with the single word DONE and stop.'

describe.skipIf(MODE === 'record')('web e2e: transcript renders on a non-V8 engine', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    const fixture = await readFile(await selectedSessionFixture(FIXTURE), 'utf8')
    expect(fixtureUserPrompts(fixture)).toEqual([PROMPT])
    scaffold = await launchWebScaffold({})
    await seedSession(scaffold, fixture, SEED_ID)
    browser = await firefox.launch()
    page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: 'en-US' })
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })

    const groupRow = page.locator('[role="treeitem"]').first()
    await groupRow.waitFor({ timeout: 15_000 })
    await groupRow.click()
    const sessionRow = page.locator('[role="treeitem"]').nth(1)
    await sessionRow.waitFor({ timeout: 10_000 })
    await sessionRow.click()
  }, 180_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('renders the recorded user, Assistant, and Tool rows', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-cross-engine-transcript'))
    await page.getByText(PROMPT, { exact: false }).waitFor({ timeout: 30_000 })
    // Compact Chat keeps the row inside its collapsed Turn process.
    await page.locator('[data-sample="bash"]').first().waitFor({ state: 'attached', timeout: 30_000 })
    await page.getByText('DONE', { exact: false }).first().waitFor({ timeout: 30_000 })
    // A rejected event feed leaves the flow holding its paging control alone.
    await expect.poll(() => page.locator('[data-chat-anchor-key]').count()).toBeGreaterThan(1)
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  }, 120_000)
})

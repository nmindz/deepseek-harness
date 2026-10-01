/**
 * The Client face restates the Workspace appearance vocabulary because a
 * browser bundle may not import a value from the domain package. This suite
 * holds the browser copy to the grammar the domain's own suite pins
 * (`packages/workspace/workspace/tests/appearance.spec.ts`): the same
 * palette and glyph ids, and the same answer on every fixture. The Host
 * face's re-export is asserted by the controller host suite.
 */

import { describe, expect, it } from 'vitest'
import { WORKSPACE_COLORS, WORKSPACE_ICON_IDS, isWorkspaceIconRef, workspaceIconRef } from '../src/appearance-vocabulary.ts'

/** Accepted spellings, mirrored from the domain suite. */
const ACCEPTED: readonly string[] = [
  ...WORKSPACE_ICON_IDS.map(id => `icon:${id}`),
  'emoji:🎯', 'emoji:👨‍👩‍👧‍👦', 'emoji:🇧🇷', 'emoji:👍🏽', 'emoji:❤️', 'emoji:A',
]

/** Refused spellings, mirrored from the domain suite. */
const REFUSED: readonly string[] = [
  'icon:nope', 'icon:', 'icon:Folder', 'glyph:folder', '', '🎯',
  'emoji:🎯🎯', 'emoji:ab', 'emoji:', 'emoji:\n', 'emoji:\u0007',
  `emoji:${Array.from({ length: 9 }, () => '👩').join('\u200D')}`,
]

describe('browser workspace appearance vocabulary', () => {
  it('carries the five palette colors and the nineteen curated glyph ids', () => {
    expect(WORKSPACE_COLORS).toEqual(['blue', 'green', 'amber', 'red', 'neutral'])
    expect(WORKSPACE_ICON_IDS).toEqual([
      'folder', 'code', 'globe', 'database', 'data', 'goal', 'sparkle', 'plan', 'skill', 'users',
      'shield', 'api', 'checklist', 'gauge', 'light', 'agent-preset', 'browse', 'link', 'alarm-clock',
    ])
  })

  it('answers the domain grammar on every fixture', () => {
    expect(ACCEPTED.filter(value => !isWorkspaceIconRef(value))).toEqual([])
    expect(REFUSED.filter(value => isWorkspaceIconRef(value))).toEqual([])
  })

  it('mints a reference from accepted text and refuses the rest', () => {
    expect(workspaceIconRef('emoji:🎯')).toBe('emoji:🎯')
    expect(workspaceIconRef('icon:code')).toBe('icon:code')
    expect(() => workspaceIconRef('emoji:🎯🎯')).toThrow(TypeError)
    expect(() => workspaceIconRef('icon:nope')).toThrow("not a workspace icon reference: 'icon:nope'")
  })
})

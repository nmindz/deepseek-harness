import { describe, expect, it } from 'vitest'
import { WORKSPACE_COLORS, WORKSPACE_ICON_IDS, isWorkspaceIconRef, workspaceAppearance, workspaceIconRef } from '../src/index.ts'

describe('isWorkspaceIconRef', () => {
  it('accepts every curated glyph id and rejects an unknown one', () => {
    for (const id of WORKSPACE_ICON_IDS) expect(isWorkspaceIconRef(`icon:${id}`)).toBe(true)
    expect(isWorkspaceIconRef('icon:nope')).toBe(false)
    expect(isWorkspaceIconRef('icon:')).toBe(false)
    expect(isWorkspaceIconRef('icon:Folder')).toBe(false)
  })

  it('accepts exactly one grapheme cluster after emoji:, including ZWJ sequences and flags', () => {
    expect(isWorkspaceIconRef('emoji:🎯')).toBe(true)
    // Family: four code points joined by ZWJ, one cluster.
    expect(isWorkspaceIconRef('emoji:👨‍👩‍👧‍👦')).toBe(true)
    // Regional indicator pair.
    expect(isWorkspaceIconRef('emoji:🇧🇷')).toBe(true)
    // Skin-tone modifier and variation selector.
    expect(isWorkspaceIconRef('emoji:👍🏽')).toBe(true)
    expect(isWorkspaceIconRef('emoji:❤️')).toBe(true)
    // A plain letter is one cluster too; the grammar bounds the length, not the script.
    expect(isWorkspaceIconRef('emoji:A')).toBe(true)
  })

  it('rejects two clusters, an empty payload, a control character, and an over-long payload', () => {
    expect(isWorkspaceIconRef('emoji:🎯🎯')).toBe(false)
    expect(isWorkspaceIconRef('emoji:ab')).toBe(false)
    expect(isWorkspaceIconRef('emoji:')).toBe(false)
    expect(isWorkspaceIconRef('emoji:\n')).toBe(false)
    expect(isWorkspaceIconRef('emoji:\u0007')).toBe(false)
    // Nine ZWJ-joined women is one cluster but 34 code units.
    expect(isWorkspaceIconRef(`emoji:${Array.from({ length: 9 }, () => '👩').join('\u200D')}`)).toBe(false)
    expect(isWorkspaceIconRef('')).toBe(false)
    expect(isWorkspaceIconRef('🎯')).toBe(false)
    expect(isWorkspaceIconRef('glyph:folder')).toBe(false)
  })
})

describe('workspaceIconRef', () => {
  it('mints a reference from accepted text and refuses the rest', () => {
    expect(workspaceIconRef('emoji:🎯')).toBe('emoji:🎯')
    expect(workspaceIconRef('icon:code')).toBe('icon:code')
    expect(() => workspaceIconRef('emoji:🎯🎯')).toThrow(TypeError)
    expect(() => workspaceIconRef('icon:nope')).toThrow("not a workspace icon reference: 'icon:nope'")
  })
})

describe('workspaceAppearance schema', () => {
  it('accepts every palette color, an empty object, and either field alone', () => {
    for (const color of WORKSPACE_COLORS) expect(workspaceAppearance.parse({ color })).toEqual({ color })
    expect(workspaceAppearance.parse({})).toEqual({})
    expect(workspaceAppearance.parse({ icon: 'icon:code' })).toEqual({ icon: 'icon:code' })
    expect(workspaceAppearance.parse({ color: 'red', icon: 'emoji:🚀' })).toEqual({ color: 'red', icon: 'emoji:🚀' })
  })

  it('rejects a color outside the palette, a malformed icon, an unknown key, and an explicit undefined', () => {
    expect(workspaceAppearance.safeParse({ color: 'pink' }).success).toBe(false)
    expect(workspaceAppearance.safeParse({ icon: 'icon:nope' }).success).toBe(false)
    expect(workspaceAppearance.safeParse({ icon: 'emoji:🎯🎯' }).success).toBe(false)
    expect(workspaceAppearance.safeParse({ color: 'blue', label: 'x' }).success).toBe(false)
    expect(workspaceAppearance.safeParse({ color: undefined }).success).toBe(false)
    expect(workspaceAppearance.safeParse('blue').success).toBe(false)
  })
})

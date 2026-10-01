/**
 * Browser copy of the Workspace appearance vocabulary. The Client bundle may
 * not import a value from the Workspace domain package, so the palette, the
 * curated glyph ids, and the icon grammar check are restated here against
 * the domain's types; `appearance.client.spec.ts` holds the copy to the domain grammar.
 */

import type { WorkspaceColor, WorkspaceIconId, WorkspaceIconRef } from '@deepseek-ai/dsh-workspace/types'

/** Accent colors a Workspace may carry; absent means the current ink. */
export const WORKSPACE_COLORS = ['blue', 'green', 'amber', 'red', 'neutral'] as const satisfies readonly WorkspaceColor[]

/** Curated glyph ids a Workspace may carry; `folder` is the rendering default. */
export const WORKSPACE_ICON_IDS = [
  'folder', 'code', 'globe', 'database', 'data', 'goal', 'sparkle', 'plan', 'skill', 'users',
  'shield', 'api', 'checklist', 'gauge', 'light', 'agent-preset', 'browse', 'link', 'alarm-clock',
] as const satisfies readonly WorkspaceIconId[]

const ICON_PREFIX = 'icon:'
const EMOJI_PREFIX = 'emoji:'

/** Longest emoji payload accepted, in UTF-16 code units; a flag or a ZWJ family fits. */
const EMOJI_MAX_UNITS = 16

/** Grapheme segmentation for the root locale; emoji cluster rules are locale-independent. */
const graphemes = new Intl.Segmenter('und', { granularity: 'grapheme' })

/**
 * Whether text is a well-formed icon reference: `icon:` followed by a curated
 * id, or `emoji:` followed by exactly one extended grapheme cluster of at most
 * {@link EMOJI_MAX_UNITS} code units with no control character. Same rule as
 * the Host; a picker uses it to refuse input before the round trip.
 * @param value - Text typed or pasted by the user.
 * @returns `true` when the text is a {@link WorkspaceIconRef}.
 */
export function isWorkspaceIconRef(value: string): value is WorkspaceIconRef {
  if (value.startsWith(ICON_PREFIX)) {
    return (WORKSPACE_ICON_IDS as readonly string[]).includes(value.slice(ICON_PREFIX.length))
  }
  if (!value.startsWith(EMOJI_PREFIX)) return false
  const emoji = value.slice(EMOJI_PREFIX.length)
  if (emoji.length === 0 || emoji.length > EMOJI_MAX_UNITS || /\p{Cc}/u.test(emoji)) return false
  return [...graphemes.segment(emoji)].length === 1
}

/**
 * Mint an icon reference from text, or refuse it; the browser twin of the
 * domain's mint, over the same grammar.
 * @param value - Text such as `icon:code` or `emoji:🎯`.
 * @returns the same text as a {@link WorkspaceIconRef}.
 * @throws {TypeError} when the text is not a well-formed icon reference.
 */
export function workspaceIconRef(value: string): WorkspaceIconRef {
  if (!isWorkspaceIconRef(value)) throw new TypeError(`not a workspace icon reference: '${value}'`)
  return value
}

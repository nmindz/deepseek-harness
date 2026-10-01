/**
 * Workspace appearance vocabulary: the accent palette, the curated glyph ids,
 * and the icon reference grammar. Browser-safe (no Node imports) so a Client
 * face can hold a byte-identical copy; this module is the source of truth the
 * durable schema validates against.
 * @module @deepseek-ai/dsh-workspace/src/appearance
 */

import type { Branded } from '@deepseek-ai/dsh-brand'

/** Accent colors a Workspace may carry; absent means the current ink. */
export const WORKSPACE_COLORS = ['blue', 'green', 'amber', 'red', 'neutral'] as const

/** One accent color. */
export type WorkspaceColor = (typeof WORKSPACE_COLORS)[number]

/** Curated glyph ids a Workspace may carry; `folder` is the rendering default. */
export const WORKSPACE_ICON_IDS = [
  'folder', 'code', 'globe', 'database', 'data', 'goal', 'sparkle', 'plan', 'skill', 'users',
  'shield', 'api', 'checklist', 'gauge', 'light', 'agent-preset', 'browse', 'link', 'alarm-clock',
] as const

/** One curated glyph id. */
export type WorkspaceIconId = (typeof WORKSPACE_ICON_IDS)[number]

/**
 * `emoji:` followed by exactly one grapheme cluster. Branded rather than
 * spelled as a template literal because the Remote codec projects brands
 * but not open template literals; the only mint is {@link isWorkspaceIconRef}.
 */
export type WorkspaceEmojiRef = Branded<'WorkspaceEmojiRef'>

/**
 * One icon reference: a curated glyph (`icon:<id>`) or a single emoji
 * (`emoji:<one grapheme cluster>`). Validate wire or durable text with
 * {@link isWorkspaceIconRef}.
 */
export type WorkspaceIconRef = `icon:${WorkspaceIconId}` | WorkspaceEmojiRef

/** User-chosen color and icon of one Workspace; an absent field means the default. */
export interface WorkspaceAppearance {
  readonly color?: WorkspaceColor
  readonly icon?: WorkspaceIconRef
}

const ICON_PREFIX = 'icon:'
const EMOJI_PREFIX = 'emoji:'

/** Longest emoji payload accepted, in UTF-16 code units; a flag or a ZWJ family fits. */
const EMOJI_MAX_UNITS = 16

/** Grapheme segmentation for the root locale; emoji cluster rules are locale-independent. */
const graphemes = new Intl.Segmenter('und', { granularity: 'grapheme' })

/**
 * Whether text is a well-formed icon reference: `icon:` followed by a curated
 * id, or `emoji:` followed by exactly one extended grapheme cluster of at most
 * {@link EMOJI_MAX_UNITS} code units with no control character.
 * @param value - Text read at a wire or durable boundary.
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
 * Mint an icon reference from text, or refuse it. The checked spelling is
 * the one {@link isWorkspaceIconRef} accepts; callers that already hold a
 * boolean answer use the guard directly.
 * @param value - Text such as `icon:code` or `emoji:🎯`.
 * @returns the same text as a {@link WorkspaceIconRef}.
 * @throws {TypeError} when the text is not a well-formed icon reference.
 */
export function workspaceIconRef(value: string): WorkspaceIconRef {
  if (!isWorkspaceIconRef(value)) throw new TypeError(`not a workspace icon reference: '${value}'`)
  return value
}

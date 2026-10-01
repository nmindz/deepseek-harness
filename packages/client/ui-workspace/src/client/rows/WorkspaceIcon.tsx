/**
 * The Workspace glyph every Workspace surface renders: the Workspace's chosen
 * icon in its chosen accent color, or the plugin default icon, or the folder.
 * Pure presentational — the resolved reference and the color ride props, and
 * the accent palette lives in Rows.module.css under `data-accent`.
 */
import type { ComponentType, ReactNode } from 'react'
import type {
  WorkspaceAppearance, WorkspaceIconId, WorkspaceIconRef,
} from '@deepseek-ai/dsh-api-workspace-controller/client'
import {
  IconAgentPresetOutlineRegular, IconAlarmClockOutlineRegular, IconApiOutlineRegular, IconBrowseOutlineRegular,
  IconChecklistOutlineRegular, IconCodeOutlineRegular, IconDataOutlineRegular, IconDatabaseOutlineRegular,
  IconFolderCloseRegular, IconFolderOpenRegular, IconGaugeOutlineRegular, IconGlobeOutlineRegular,
  IconGoalOutlineRegular, IconLightOutlineRegular, IconLinkOutlineRegular, IconPlanOutlineRegular,
  IconShieldOutlineRegular, IconSkillOutlineRegular, IconSparkleRegular, IconUsersOutlineRegular,
  type IconProps,
} from '@deepseek-ai/dsh-client-ui-primitives'
import css from './Rows.module.css'

/** The glyph each curated id renders; `folder` additionally swaps open/closed with the group. */
const GLYPHS: Readonly<Record<WorkspaceIconId, ComponentType<IconProps>>> = {
  'folder': IconFolderCloseRegular,
  'code': IconCodeOutlineRegular,
  'globe': IconGlobeOutlineRegular,
  'database': IconDatabaseOutlineRegular,
  'data': IconDataOutlineRegular,
  'goal': IconGoalOutlineRegular,
  'sparkle': IconSparkleRegular,
  'plan': IconPlanOutlineRegular,
  'skill': IconSkillOutlineRegular,
  'users': IconUsersOutlineRegular,
  'shield': IconShieldOutlineRegular,
  'api': IconApiOutlineRegular,
  'checklist': IconChecklistOutlineRegular,
  'gauge': IconGaugeOutlineRegular,
  'light': IconLightOutlineRegular,
  'agent-preset': IconAgentPresetOutlineRegular,
  'browse': IconBrowseOutlineRegular,
  'link': IconLinkOutlineRegular,
  'alarm-clock': IconAlarmClockOutlineRegular,
}

const ICON_PREFIX = 'icon:'
const EMOJI_PREFIX = 'emoji:'

/** The folder reference every Workspace falls back to without a chosen or configured icon. */
export const FOLDER_ICON: WorkspaceIconRef = 'icon:folder'

/**
 * Render one Workspace's icon.
 * @param props.appearance - the Workspace's stored appearance; its icon and color win when present.
 * @param props.defaultIcon - the plugin-configured icon used when the Workspace chose none.
 * @param props.expanded - whether the group is open; only the folder glyph reflects it.
 * @param props.archived - the group is archived; the icon takes the archived row's dimmed ink.
 * @param props.size - square edge in px; defaults to the glyph's own drawn size.
 * @param props.emojiLabel - localized accessible name of an emoji icon.
 * @returns the icon element.
 */
export function WorkspaceIcon({ appearance, defaultIcon, expanded, archived = false, size, emojiLabel }: {
  appearance?: WorkspaceAppearance | undefined
  defaultIcon?: WorkspaceIconRef | undefined
  expanded: boolean
  archived?: boolean
  size?: number | undefined
  emojiLabel: string
}) {
  const icon = appearance?.icon ?? defaultIcon ?? FOLDER_ICON
  let glyph: ReactNode
  if (icon.startsWith(EMOJI_PREFIX)) {
    glyph = (
      <span role="img" aria-label={emojiLabel} className={css.workspaceEmoji}>
        {icon.slice(EMOJI_PREFIX.length)}
      </span>
    )
  } else if (icon === FOLDER_ICON) {
    glyph = expanded ? <IconFolderOpenRegular size={size} /> : <IconFolderCloseRegular size={size} />
  } else {
    const Glyph = GLYPHS[icon.slice(ICON_PREFIX.length) as WorkspaceIconId]
    glyph = <Glyph size={size} />
  }
  return (
    <span
      className={css.workspaceIcon}
      data-accent={appearance?.color}
      data-archived={archived ? '' : undefined}
    >
      {glyph}
    </span>
  )
}

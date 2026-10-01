/**
 * The Change icon… dialog, browser-owned like Rename and Delete: a live
 * preview of the row glyph beside the Workspace title, the accent strip, the
 * curated glyph grid, and a one-emoji field. The draft is local to the
 * dialog; Save hands the complete appearance to the owner, Reset returns both
 * fields to the default look, and a Host refusal stays in place with the
 * draft kept.
 */
import { type CSSProperties, type KeyboardEvent, useEffect, useState } from 'react'
import clsx from 'clsx'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { isWorkspaceIconRef, WORKSPACE_COLORS, WORKSPACE_ICON_IDS } from '@deepseek-ai/dsh-api-workspace-controller/appearance'
import type {
  WorkspaceAppearance, WorkspaceColor, WorkspaceIconId, WorkspaceIconRef,
} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { WorkspaceBrowserProps } from '../contract/slots.ts'
import { WorkspaceIcon } from './WorkspaceIcon.tsx'
import css from './WorkspaceBrowser.module.css'
import rowsCss from './Rows.module.css'

const ICON_PREFIX = 'icon:'
const EMOJI_PREFIX = 'emoji:'
/** Glyph cells per grid row; ArrowUp/ArrowDown step by this many. */
const ICON_GRID_COLUMNS = 7

/** The dialog's two editable fields; undefined is the default look. */
interface Draft {
  color: WorkspaceColor | undefined
  icon: WorkspaceIconRef | undefined
}

function draftOf(appearance: WorkspaceAppearance | undefined): Draft {
  return { color: appearance?.color, icon: appearance?.icon }
}

/** The emoji grapheme an icon reference carries, or empty for a glyph or no icon. */
function emojiOf(icon: WorkspaceIconRef | undefined): string {
  return icon !== undefined && icon.startsWith(EMOJI_PREFIX) ? icon.slice(EMOJI_PREFIX.length) : ''
}

/** The curated id an icon reference names, or undefined for an emoji or no icon. */
function glyphOf(icon: WorkspaceIconRef | undefined): string | undefined {
  return icon !== undefined && icon.startsWith(ICON_PREFIX) ? icon.slice(ICON_PREFIX.length) : undefined
}

/** The appearance a draft stores: only the fields that are set, so a full reset is `{}`. */
function appearanceOf(draft: Draft): WorkspaceAppearance {
  return {
    ...(draft.color === undefined ? {} : { color: draft.color }),
    ...(draft.icon === undefined ? {} : { icon: draft.icon }),
  }
}

/**
 * Move a radiogroup's check with the arrow keys: left/right step by one and
 * wrap, up/down step by one grid row and stop at the edges. The next radio
 * takes focus and is activated, so the group's own click handler selects it.
 * @param event - the keydown on the radiogroup container.
 * @param columns - radios per row; undefined for a one-row strip (up/down ignored).
 */
function moveCheck(event: KeyboardEvent<HTMLDivElement>, columns: number | undefined): void {
  let step: number
  switch (event.key) {
    case 'ArrowRight': step = 1; break
    case 'ArrowLeft': step = -1; break
    case 'ArrowDown': if (columns === undefined) return; step = columns; break
    case 'ArrowUp': if (columns === undefined) return; step = -columns; break
    default: return
  }
  const radios = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')]
  const from = radios.findIndex(radio => radio === event.target)
  if (from === -1) return
  event.preventDefault()
  let next = from + step
  if (Math.abs(step) === 1) next = (next + radios.length) % radios.length
  else if (next < 0 || next >= radios.length) return
  const target = radios[next]
  target?.focus()
  target?.click()
}

/**
 * Render the Change icon… dialog.
 * @param props.open - whether the dialog is up; each opening starts from `appearance`.
 * @param props.title - the Workspace's display title, shown in the preview row.
 * @param props.appearance - the appearance the dialog opened on; Save stays disabled until the draft differs.
 * @param props.defaultIcon - the plugin-configured icon the preview shows when the draft has none.
 * @param props.onClose - dismiss the dialog (Cancel, Escape, the close button, a successful save).
 * @param props.onSave - store the complete appearance; a rejection is shown in place.
 * @param props.t - the browser root's locale seat.
 * @returns the dialog element.
 */
export function WorkspaceAppearancePicker({ open, title, appearance, defaultIcon, onClose, onSave, t }: {
  open: boolean
  title: string
  appearance: WorkspaceAppearance | undefined
  defaultIcon: WorkspaceIconRef | undefined
  onClose: () => void
  onSave: (appearance: WorkspaceAppearance) => Promise<void>
  t: WorkspaceBrowserProps['t']
}) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(appearance))
  const [emojiText, setEmojiText] = useState(() => emojiOf(appearance?.icon))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Each opening edits the appearance it opened on, not a previous draft.
  useEffect(() => {
    if (!open) return
    setDraft(draftOf(appearance))
    setEmojiText(emojiOf(appearance?.icon))
    setError(null)
  }, [open, appearance])

  const opened = draftOf(appearance)
  const changed = draft.color !== opened.color || draft.icon !== opened.icon
  const emojiInvalid = emojiText !== '' && !isWorkspaceIconRef(EMOJI_PREFIX + emojiText)
  const canSave = changed && !pending && !emojiInvalid
  const checkedGlyph = glyphOf(draft.icon)
  const emojiLabel = t('icon.emoji.aria')
  const colorOptions: readonly (WorkspaceColor | undefined)[] = [undefined, ...WORKSPACE_COLORS]

  const close = (): void => {
    if (pending) return
    onClose()
  }
  const pickColor = (color: WorkspaceColor | undefined): void => {
    setDraft(current => ({ ...current, color }))
    setError(null)
  }
  const pickGlyph = (id: WorkspaceIconId): void => {
    setDraft(current => ({ ...current, icon: `${ICON_PREFIX}${id}` }))
    setEmojiText('')
    setError(null)
  }
  // A valid grapheme selects itself and clears the glyph check; an empty field
  // withdraws an emoji selection; anything else leaves the draft as it was and
  // shows the field's own notice.
  const changeEmoji = (value: string): void => {
    setEmojiText(value)
    setError(null)
    if (value === '') {
      setDraft(current => (emojiOf(current.icon) === '' ? current : { ...current, icon: undefined }))
      return
    }
    const ref = EMOJI_PREFIX + value
    if (isWorkspaceIconRef(ref)) setDraft(current => ({ ...current, icon: ref }))
  }
  const reset = (): void => {
    setDraft({ color: undefined, icon: undefined })
    setEmojiText('')
    setError(null)
  }
  const save = (): void => {
    if (!canSave) return
    setPending(true)
    setError(null)
    onSave(appearanceOf(draft)).then(() => {
      setPending(false)
      onClose()
    }).catch((reason: unknown) => {
      setPending(false)
      setError(reason instanceof Error ? reason.message : String(reason))
    })
  }

  return (
    <Modal
      open={open}
      onClose={close}
      closeLabel={t('close')}
      title={t('icon.title')}
      footer={(
        <>
          <Button variant="outline" disabled={pending} onClick={reset}>{t('icon.reset')}</Button>
          <Button variant="outline" disabled={pending} onClick={close}>{t('cancel')}</Button>
          <Button variant="primary" disabled={!canSave} onClick={save}>{t('icon.save')}</Button>
        </>
      )}
    >
      {/* Enter anywhere in the body saves; preventing the default keeps a
          focused radio from also re-selecting itself on the same key. */}
      <div
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
          e.preventDefault()
          save()
        }}
      >
        <div className={css.appearancePreview}>
          <WorkspaceIcon appearance={appearanceOf(draft)} defaultIcon={defaultIcon} expanded={false} emojiLabel={emojiLabel} />
          <span className={css.appearancePreviewTitle}>{title}</span>
        </div>
        <div
          role="radiogroup"
          aria-label={t('icon.color.label')}
          className={css.appearanceStrip}
          onKeyDown={(e) => { moveCheck(e, undefined) }}
        >
          {colorOptions.map((color) => {
            const checked = draft.color === color
            return (
              <button
                key={color ?? 'default'}
                type="button"
                role="radio"
                aria-checked={checked}
                aria-label={color === undefined ? t('icon.color.default') : t(`icon.color.${color}`)}
                tabIndex={checked ? 0 : -1}
                disabled={pending}
                className={css.appearanceChip}
                onClick={() => { pickColor(color) }}
              >
                <span
                  aria-hidden="true"
                  className={clsx(rowsCss.workspaceIcon, css.appearanceSwatch, color === undefined && css.appearanceSwatchDefault)}
                  data-accent={color}
                />
              </button>
            )
          })}
        </div>
        <div
          role="radiogroup"
          aria-label={t('icon.glyph.label')}
          className={css.appearanceGrid}
          style={{ '--dsh-appearance-grid-columns': ICON_GRID_COLUMNS } as CSSProperties}
          onKeyDown={(e) => { moveCheck(e, ICON_GRID_COLUMNS) }}
        >
          {WORKSPACE_ICON_IDS.map((id, index) => {
            const checked = checkedGlyph === id
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={checked}
                aria-label={t(`icon.glyph.${id}`)}
                tabIndex={checked || (checkedGlyph === undefined && index === 0) ? 0 : -1}
                disabled={pending}
                className={css.appearanceCell}
                onClick={() => { pickGlyph(id) }}
              >
                <WorkspaceIcon
                  appearance={appearanceOf({ color: draft.color, icon: `${ICON_PREFIX}${id}` })}
                  expanded={false}
                  emojiLabel={emojiLabel}
                />
              </button>
            )
          })}
        </div>
        <input
          className={css.renameInput}
          type="text"
          inputMode="text"
          value={emojiText}
          aria-label={t('icon.emoji.label')}
          aria-invalid={emojiInvalid}
          placeholder={t('icon.emoji.placeholder')}
          disabled={pending}
          onChange={(e) => { changeEmoji(e.target.value) }}
        />
        {emojiInvalid && <div className={css.renameError} role="alert">{t('icon.emoji.invalid')}</div>}
        {pending && <div className={css.deleteStatus} role="status">{t('icon.pending')}</div>}
        {error !== null && <div className={css.renameError} role="alert">{error}</div>}
      </div>
    </Modal>
  )
}

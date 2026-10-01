/**
 * The archive action: a `sidebar.workspaces.session.menu.item` row and a
 * `sidebar.workspaces.session.row.action` button over one injected behavior,
 * plus the `shell.overlay` dialog that confirms stopping a Session's running
 * work before archiving it. The same entries restore an archived row; a row
 * archived through its Workspace gets neither, because only the Workspace
 * restores it. The notice a successful archive raises and the diagnostics for
 * Host rejections live in the injected callbacks, not here.
 */
import { useState } from 'react'
import {
  Button, IconArchiveOutlineRegular, IconUnarchiveOutlineRegular, MenuItemButton, Modal, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  ArchiveSessionInjected, SessionArchiveConfirmInjected, SessionArchiveConfirmProps, SessionArchiveConfirmRequest,
  SessionMenuItemProps, SessionRowActionProps,
} from '../contract/slots.ts'
import css from '../rows/Rows.module.css'
import browserCss from '../rows/WorkspaceBrowser.module.css'
import { activityLine } from './activity-line.ts'

/**
 * Menu row (order 400): archive, or restore an archived row; absent on a row archived through its Workspace.
 * @param props - owner share, the archive share, and the menu open state.
 * @returns the row, or null for a Session archived through its Workspace.
 */
export function ArchiveSessionMenuItem({
  sessionId, useArchived, useWorkspaceArchived, useMenuOpenState, useShortcuts, archiveSession, unarchiveSession, t,
}: SessionMenuItemProps<ArchiveSessionInjected>) {
  const [, setMenuOpen] = useMenuOpenState()
  const shortcut = useShortcuts(rows => rows.find(row => row.id === 'session.archive'))
  const archived = useArchived(set => set.has(sessionId))
  const workspaceArchived = useWorkspaceArchived(set => set.has(sessionId))
  if (workspaceArchived) return null
  return (
    <MenuItemButton
      shortcut={archived ? undefined : shortcut}
      icon={archived ? <IconUnarchiveOutlineRegular size={14} /> : <IconArchiveOutlineRegular size={14} />}
      onSelect={() => {
        setMenuOpen(false)
        ;(archived ? unarchiveSession : archiveSession)(sessionId)
      }}
    >
      {t(archived ? 'menu.unarchiveSession' : 'menu.archiveSession')}
    </MenuItemButton>
  )
}

/**
 * Hover button (order 100): archive, or restore an archived row; absent on a row archived through its Workspace.
 * @param props - owner share and the archive share.
 * @returns the button, or null for a Session archived through its Workspace.
 */
export function ArchiveSessionRowButton({
  sessionId, useArchived, useWorkspaceArchived, archiveSession, unarchiveSession, t,
}: SessionRowActionProps<ArchiveSessionInjected>) {
  const archived = useArchived(set => set.has(sessionId))
  const workspaceArchived = useWorkspaceArchived(set => set.has(sessionId))
  if (workspaceArchived) return null
  return (
    <Tooltip label={t(archived ? 'actions.unarchive' : 'actions.archive')} side="bottom" align="end" delayMs={500}>
      <button
        type="button"
        className={css.iconButton}
        aria-label={t(archived ? 'menu.unarchiveSession' : 'menu.archiveSession')}
        onClick={() => { (archived ? unarchiveSession : archiveSession)(sessionId) }}
      >
        {archived ? <IconUnarchiveOutlineRegular size={14} /> : <IconArchiveOutlineRegular size={14} />}
      </button>
    </Tooltip>
  )
}

/**
 * The `shell.overlay` entry: nothing while no confirmation is pending,
 * otherwise one dialog per request (keyed by the Session). Confirming asks
 * the Host to stop the listed work and archive; cancelling leaves the
 * Session running and visible.
 * @param props - the request hook, its settlement, the stop-and-archive hop, and the locale seat.
 * @returns the open dialog, or null.
 */
export function SessionArchiveConfirmDialog({
  useArchiveRequest, settleSessionArchive, stopAndArchiveSession, t,
}: SessionArchiveConfirmProps) {
  const request = useArchiveRequest(pending => pending)
  if (request === null) return null
  return (
    <ArchiveConfirmForm
      key={request.sessionId}
      request={request}
      stopAndArchiveSession={stopAndArchiveSession}
      onSettle={settleSessionArchive}
      t={t}
    />
  )
}

/** One request's dialog: in-flight and error state die with it. */
function ArchiveConfirmForm({ request, stopAndArchiveSession, onSettle, t }: {
  request: SessionArchiveConfirmRequest
  stopAndArchiveSession: SessionArchiveConfirmInjected['stopAndArchiveSession']
  onSettle: () => void
  t: SessionArchiveConfirmProps['t']
}) {
  const [archiving, setArchiving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const close = () => {
    if (archiving) return
    onSettle()
  }
  const confirm = () => {
    setArchiving(true)
    setError(null)
    stopAndArchiveSession(request.sessionId).then(() => {
      setArchiving(false)
      onSettle()
    }).catch((reason: unknown) => {
      setArchiving(false)
      setError(reason instanceof Error ? reason.message : String(reason))
    })
  }
  return (
    <Modal
      open
      onClose={close}
      closeLabel={t('close')}
      title={t('archive.confirm.title')}
      description={t('archive.confirm.desc', { title: request.displayTitle })}
      footer={(
        <>
          <Button variant="outline" disabled={archiving} onClick={close}>{t('cancel')}</Button>
          <Button
            variant="outline"
            className={browserCss.deleteAction}
            disabled={archiving}
            onClick={confirm}
          >
            {t('archive.confirm.action')}
          </Button>
        </>
      )}
    >
      <ul className={browserCss.archiveActivity} aria-label={t('archive.confirm.activity')}>
        {request.activity.map((entry, index) => (
          <li key={`${entry.kind}-${String(index)}`}>{activityLine(entry, t)}</li>
        ))}
      </ul>
      {archiving && <div className={browserCss.deleteStatus} role="status">{t('archive.confirm.pending')}</div>}
      {error !== null && <div className={browserCss.renameError} role="alert">{error}</div>}
    </Modal>
  )
}

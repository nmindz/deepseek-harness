/**
 * The move action: one `sidebar.workspaces.session.menu.item` row that asks
 * for the move dialog, and the `shell.overlay` dialog that picks the target
 * Workspace. A move changes only which group the row sits under; the
 * Session's working directory stays as it is.
 */
import { type KeyboardEvent, useMemo, useState } from 'react'
import { workspaceDisplayTitle } from '@deepseek-ai/dsh-api-workspace-controller/default-workspace'
import type { WorkspaceId, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import {
  Button, IconCheckOutlineRegular, IconFolderOpenOutlineRegular, IconQueueOutlineRegular, MenuItemButton, MenuSurface, Modal,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  MoveSessionInjected, SessionMenuItemProps, SessionMoveDialogInjected, SessionMoveDialogProps, SessionMoveRequest,
} from '../contract/slots.ts'
import browserCss from '../rows/WorkspaceBrowser.module.css'

/**
 * Menu row (order 350): ask for the move dialog. An archived Session —
 * itself or through its Workspace — gets none: it cannot be opened, so
 * regrouping it would only move a row the user cannot act on.
 * @param props - owner share, menu open state, and the move share.
 * @returns the row, or null for an archived Session.
 */
export function MoveSessionMenuItem({
  sessionId, useMenuOpenState, useArchived, requestSessionMove, t,
}: SessionMenuItemProps<MoveSessionInjected>) {
  const [, setMenuOpen] = useMenuOpenState()
  const archived = useArchived(set => set.has(sessionId))
  if (archived) return null
  return (
    <MenuItemButton
      icon={<IconFolderOpenOutlineRegular />}
      onSelect={() => {
        setMenuOpen(false)
        requestSessionMove(sessionId)
      }}
    >
      {t('menu.moveSession')}
    </MenuItemButton>
  )
}

/**
 * The `shell.overlay` entry: nothing while no move is requested, otherwise
 * one dialog per request (keyed by the Session). Confirming asks the Host to
 * move the Session; cancelling leaves it where it is.
 * @param props - the request hook, its settlement, the move hop, the Workspace seat, and the locale seat.
 * @returns the open dialog, or null.
 */
export function SessionMoveDialog({
  useMoveRequest, settleSessionMove, moveSession, useWorkspaces, t,
}: SessionMoveDialogProps) {
  const request = useMoveRequest(pending => pending)
  const items = useWorkspaces(snapshot => snapshot.items)
  const archivedWorkspaceIds = useWorkspaces(snapshot => snapshot.archivedWorkspaceIds)
  const options = useMemo(
    () => (request === null ? [] : moveOptions(items, archivedWorkspaceIds, request.currentWorkspaceId)),
    [items, archivedWorkspaceIds, request],
  )
  if (request === null) return null
  return (
    <MoveForm
      key={request.sessionId}
      request={request}
      options={options}
      moveSession={moveSession}
      onSettle={settleSessionMove}
      t={t}
    />
  )
}

/** One target row: a Workspace, or the ungrouped account. */
type MoveOption =
  | { kind: 'workspace'; workspaceId: WorkspaceId; title: string; path: string }
  | { kind: 'ungrouped' }

/** The key the selection is held by: the Workspace id, or the ungrouped marker (no Workspace id is empty). */
const UNGROUPED_OPTION = ''
const optionKey = (option: MoveOption): string => (option.kind === 'workspace' ? option.workspaceId : UNGROUPED_OPTION)

/**
 * The targets a Session can move to, in sidebar item order: every unarchived
 * Workspace other than its current owner, then Ungrouped when it has one.
 */
function moveOptions(
  items: readonly WorkspaceView[],
  archivedWorkspaceIds: readonly WorkspaceId[],
  currentWorkspaceId: WorkspaceId | undefined,
): readonly MoveOption[] {
  const archived = new Set<WorkspaceId>(archivedWorkspaceIds)
  const options: MoveOption[] = items
    .filter(item => !archived.has(item.workspaceId) && item.workspaceId !== currentWorkspaceId)
    .map(item => ({ kind: 'workspace', workspaceId: item.workspaceId, title: item.title, path: item.path }))
  if (currentWorkspaceId !== undefined) options.push({ kind: 'ungrouped' })
  return options
}

/** One request's dialog: selection, in-flight and error state die with it. */
function MoveForm({ request, options, moveSession, onSettle, t }: {
  request: SessionMoveRequest
  options: readonly MoveOption[]
  moveSession: SessionMoveDialogInjected['moveSession']
  onSettle: () => void
  t: SessionMoveDialogProps['t']
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [moving, setMoving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selectedIndex = options.findIndex(option => optionKey(option) === selected)
  const selection = selectedIndex === -1 ? undefined : options[selectedIndex]
  const close = () => {
    if (moving) return
    onSettle()
  }
  const confirm = () => {
    if (selection === undefined || moving) return
    setMoving(true)
    setError(null)
    moveSession(request.sessionId, selection.kind === 'workspace' ? selection.workspaceId : undefined).then(() => {
      setMoving(false)
      onSettle()
    }).catch((reason: unknown) => {
      setMoving(false)
      setError(reason instanceof Error ? reason.message : String(reason))
    })
  }
  const pick = (option: MoveOption) => {
    setSelected(optionKey(option))
    setError(null)
  }
  // Arrow keys walk the list (wrapping; from no pick, Down lands on the first
  // row and Up on the last); Enter confirms the pick. Escape is the Modal's
  // own close.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      const count = options.length
      const from = selectedIndex === -1 && step === -1 ? count : selectedIndex
      const nextIndex = (from + step + count) % count
      options.forEach((option, index) => { if (index === nextIndex) pick(option) })
      return
    }
    if (event.key === 'Enter' && selection !== undefined) {
      event.preventDefault()
      confirm()
    }
  }
  const defaultName = t('workspace.defaultName')
  return (
    <Modal
      open
      onClose={close}
      closeLabel={t('close')}
      title={t('move.title', { title: request.displayTitle })}
      footer={(
        <>
          <Button variant="outline" disabled={moving} onClick={close}>{t('cancel')}</Button>
          <Button variant="primary" disabled={selection === undefined || moving} onClick={confirm}>
            {t('move.action')}
          </Button>
        </>
      )}
    >
      {options.length === 0
        ? <div className={browserCss.deleteStatus}>{t('move.empty')}</div>
        : (
          <MenuSurface
            compact
            className={browserCss.moveOptions}
            role="listbox"
            aria-label={t('move.options.aria')}
            aria-activedescendant={selection === undefined ? undefined : `move-option-${optionKey(selection)}`}
            tabIndex={0}
            data-modal-autofocus
            onKeyDown={onKeyDown}
          >
            {options.map((option) => {
              const key = optionKey(option)
              const isSelected = key === selected
              return (
                <button
                  key={key}
                  id={`move-option-${key}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={browserCss.moveOption}
                  disabled={moving}
                  tabIndex={-1}
                  onClick={() => { pick(option) }}
                >
                  {option.kind === 'workspace'
                    ? (
                      <>
                        <IconFolderOpenOutlineRegular />
                        <span className={browserCss.moveOptionTitle}>{workspaceDisplayTitle(option.title, defaultName)}</span>
                        <span className={browserCss.moveOptionPath}>{option.path}</span>
                      </>
                    )
                    : (
                      <>
                        <IconQueueOutlineRegular size={16} />
                        <span className={browserCss.moveOptionTitle}>{t('move.ungrouped')}</span>
                      </>
                    )}
                  {isSelected && <IconCheckOutlineRegular className={browserCss.moveOptionCheck} />}
                </button>
              )
            })}
          </MenuSurface>
        )}
      {request.cwd !== undefined && <div className={browserCss.deleteStatus}>{t('move.cwdNote', { cwd: request.cwd })}</div>}
      {moving && <div className={browserCss.deleteStatus} role="status">{t('move.pending')}</div>}
      {error !== null && <div className={browserCss.renameError} role="alert">{error}</div>}
    </Modal>
  )
}

/**
 * The `shell.overlay` entry for Workspace and Session notices.
 * One notice is visible at a time; a parent rerender does not extend its hold.
 */
import { IconWarningOutlineRegular, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import { assertNever } from '@deepseek-ai/dsh-util-values'
import type { RowToastProps, RowToastState } from '../contract/slots.ts'

/**
 * Hold for the notices that take longer to read than a one-line warning: the
 * actionable archived notice (two buttons to react to) and a refused Session
 * creation, which quotes the Host's reason.
 */
const LONG_TOAST_HOLD_MS = 6000

/**
 * Render the current notice: the Session and Workspace archived and
 * stopped-and-archived notices with their undo action — plus the
 * show-archived action while archived rows are hidden — on a 6 s hold, a
 * refused Session creation with the Host's reason on the same hold, or a
 * plain warning for a failed pin, an archived row that was clicked, or
 * default Workspace creation.
 * @param props - the notice hook, the shared viewing store, the notice dismissal, the archived-notice actions, and the locale seat.
 * @returns the notice on display, or null.
 */
export function RowActionToast({
  useToast, useStore, dismissToast, undoArchive, undoWorkspaceArchive, showArchived, t,
}: RowToastProps) {
  const toast = useToast(current => current)
  const archivedRowsVisible = useStore(state => (state.archivedFilter ?? 'default') !== 'default')
  if (toast === null) return null
  if (isArchivedNotice(toast)) {
    // A Session notice undoes through the Session, a Workspace notice through the Workspace.
    const undo = 'sessionId' in toast
      ? () => { undoArchive(toast.sessionId) }
      : () => { undoWorkspaceArchive(toast.workspaceId) }
    return (
      <Toast
        key={`toast-${String(toast.seq)}`}
        text={t(`toast.${toast.kind}`)}
        tone="success"
        holdMs={LONG_TOAST_HOLD_MS}
        actions={[
          { label: t('toast.archivedUndo'), onClick: () => { dismissToast(); undo() } },
          ...archivedRowsVisible ? [] : [
            { prefix: t('toast.archivedOr'), label: t('toast.archivedFilter'), onClick: () => { dismissToast(); showArchived() } },
          ],
        ]}
        onDone={dismissToast}
      />
    )
  }
  if (toast.kind === 'createFailed') {
    return (
      <Toast
        key={`toast-${String(toast.seq)}`}
        text={t('toast.createFailed', { message: toast.message })}
        icon={<IconWarningOutlineRegular />}
        holdMs={LONG_TOAST_HOLD_MS}
        onDone={dismissToast}
      />
    )
  }
  return (
    <Toast
      key={`toast-${String(toast.seq)}`}
      text={plainNoticeText(toast, t)}
      icon={<IconWarningOutlineRegular />}
      onDone={dismissToast}
    />
  )
}

/** The notice kinds that succeed an archive and offer to undo it. */
type ArchivedNoticeKind = 'archived' | 'stoppedAndArchived' | 'workspaceArchived' | 'workspaceStoppedAndArchived'
type ArchivedNotice = Extract<RowToastState, { kind: ArchivedNoticeKind }>

const ARCHIVED_NOTICE_KINDS: ReadonlySet<RowToastState['kind']> = new Set<ArchivedNoticeKind>([
  'archived', 'stoppedAndArchived', 'workspaceArchived', 'workspaceStoppedAndArchived',
])

function isArchivedNotice(toast: RowToastState): toast is ArchivedNotice {
  return ARCHIVED_NOTICE_KINDS.has(toast.kind)
}

/** The copy of one plain warning, keyed by the notice kind the union closes over. */
function plainNoticeText(
  toast: Exclude<RowToastState, ArchivedNotice | { kind: 'createFailed' }>,
  t: RowToastProps['t'],
): string {
  switch (toast.kind) {
    case 'pinFailed': return t('toast.pinFailed')
    case 'unpinFailed': return t('toast.unpinFailed')
    case 'defaultWorkspaceFailed': return t('defaultWorkspace.failed')
    case 'archivedNotOpenable': return t('toast.archivedNotOpenable')
    case 'workspaceArchivedNotOpenable': return t('toast.workspaceArchivedNotOpenable')
    /* v8 ignore next 2 -- closed-union backstop; only reached if a notice kind is forged */
    default:
      return assertNever(toast)
  }
}

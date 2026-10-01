/**
 * The `shell.overlay` dialog that confirms stopping a Workspace's running
 * work before archiving it. The Workspace row's menu asks for the archive;
 * the Host's refusal for running work raises this request, and the injected
 * callbacks carry the archive hop and the notice it raises.
 */
import { useState } from 'react'
import { workspaceDisplayTitle } from '@deepseek-ai/dsh-api-workspace-controller/default-workspace'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  WorkspaceArchiveConfirmInjected, WorkspaceArchiveConfirmProps, WorkspaceArchiveConfirmRequest,
} from '../contract/slots.ts'
import browserCss from '../rows/WorkspaceBrowser.module.css'
import { activityLine } from './activity-line.ts'

/**
 * The `shell.overlay` entry: nothing while no confirmation is pending,
 * otherwise one dialog per request (keyed by the Workspace). Confirming asks
 * the Host to stop the listed work and archive; cancelling leaves the
 * Workspace and its Sessions running and visible.
 * @param props - the request hook, its settlement, the stop-and-archive hop, and the locale seat.
 * @returns the open dialog, or null.
 */
export function WorkspaceArchiveConfirmDialog({
  useWorkspaceArchiveRequest, settleWorkspaceArchive, stopAndArchiveWorkspace, t,
}: WorkspaceArchiveConfirmProps) {
  const request = useWorkspaceArchiveRequest(pending => pending)
  if (request === null) return null
  return (
    <ArchiveConfirmForm
      key={request.workspaceId}
      request={request}
      stopAndArchiveWorkspace={stopAndArchiveWorkspace}
      onSettle={settleWorkspaceArchive}
      t={t}
    />
  )
}

/** One request's dialog: in-flight and error state die with it. */
function ArchiveConfirmForm({ request, stopAndArchiveWorkspace, onSettle, t }: {
  request: WorkspaceArchiveConfirmRequest
  stopAndArchiveWorkspace: WorkspaceArchiveConfirmInjected['stopAndArchiveWorkspace']
  onSettle: () => void
  t: WorkspaceArchiveConfirmProps['t']
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
    stopAndArchiveWorkspace(request.workspaceId).then(() => {
      setArchiving(false)
      onSettle()
    }).catch((reason: unknown) => {
      setArchiving(false)
      setError(reason instanceof Error ? reason.message : String(reason))
    })
  }
  const title = workspaceDisplayTitle(request.title, t('workspace.defaultName'))
  return (
    <Modal
      open
      onClose={close}
      closeLabel={t('close')}
      title={t('archiveWorkspace.confirm.title')}
      description={t('archiveWorkspace.confirm.desc', { title, n: request.sessions.length })}
      footer={(
        <>
          <Button variant="outline" disabled={archiving} onClick={close}>{t('cancel')}</Button>
          <Button
            variant="outline"
            className={browserCss.deleteAction}
            disabled={archiving}
            onClick={confirm}
          >
            {t('archiveWorkspace.confirm.action')}
          </Button>
        </>
      )}
    >
      <ul className={browserCss.archiveActivity} aria-label={t('archive.confirm.activity')}>
        {request.sessions.map(session => (
          <li key={session.sessionId}>
            {session.displayTitle}
            <ul>
              {session.activity.map((entry, index) => (
                <li key={`${entry.kind}-${String(index)}`}>{activityLine(entry, t)}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {archiving && <div className={browserCss.deleteStatus} role="status">{t('archiveWorkspace.confirm.pending')}</div>}
      {error !== null && <div className={browserCss.renameError} role="alert">{error}</div>}
    </Modal>
  )
}

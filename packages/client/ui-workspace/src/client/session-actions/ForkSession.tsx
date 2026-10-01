/**
 * The fork action: one `sidebar.workspaces.session.menu.item` row. A Session
 * archived through its Workspace gets none: the Host refuses a fork into an
 * archived Workspace.
 */
import { IconBranchOutlineRegular, MenuItemButton } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ForkSessionInjected, SessionMenuItemProps } from '../contract/slots.ts'

/**
 * Menu row (order 300): fork at the Session's last completed turn; the child
 * arrives through the Host list beside its source.
 * @param props - owner share, menu open state, and the fork share.
 * @returns the row, or null for a Session archived through its Workspace.
 */
export function ForkSessionMenuItem({
  sessionId, useMenuOpenState, useShortcuts, useWorkspaceArchived, forkSession, t,
}: SessionMenuItemProps<ForkSessionInjected>) {
  const [, setMenuOpen] = useMenuOpenState()
  const shortcut = useShortcuts(rows => rows.find(row => row.id === 'session.fork'))
  const workspaceArchived = useWorkspaceArchived(set => set.has(sessionId))
  if (workspaceArchived) return null
  return (
    <MenuItemButton
      shortcut={shortcut}
      icon={<IconBranchOutlineRegular />}
      onSelect={() => {
        setMenuOpen(false)
        forkSession(sessionId)
      }}
    >
      {t('menu.fork')}
    </MenuItemButton>
  )
}

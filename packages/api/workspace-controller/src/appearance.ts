/**
 * Host-face appearance vocabulary: the palette, the curated glyph ids, and
 * the icon grammar check, served from the Workspace domain that owns them so
 * Host validation and the durable schema agree by construction. The Client
 * face carries a byte-identical copy in `client/appearance.ts`.
 */

export { WORKSPACE_COLORS, WORKSPACE_ICON_IDS, isWorkspaceIconRef, workspaceIconRef } from '@deepseek-ai/dsh-workspace'

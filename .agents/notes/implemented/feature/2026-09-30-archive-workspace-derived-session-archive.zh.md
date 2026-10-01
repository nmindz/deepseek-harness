# Agent Note：归档工作区时其会话按派生方式归档

状态：implemented

[English](2026-09-30-archive-workspace-derived-session-archive.md) | 中文

## 问题

会话可以归档，工作区却只能删除。删除注册会丢掉它的顺序槽位与会话账目，所有会话都落入“未分组”，分组再也回不来。于是一个已完成的项目要么一直留在侧栏，要么用户逐个归档其会话、留下一个空的分组标题。归档工作区必须可逆且不丢任何东西：标题、路径、顺序槽位、会话顺序，以及每个会话自己的置顶与归档标记。

## 决策

工作区域在 `archivedSessionIds` 之外再带一个注册表全局的持久集合 `archivedWorkspaceIds`。`WorkspaceRegistry.archiveWorkspace` 只把工作区 id 写入该集合，别的一概不动；`unarchiveWorkspace` 把它移除。记录、其 `workspaceIds` 槽位、其 `sessionIds` 账目以及各会话自己的标记从不被触碰，因此恢复只是一次集合移除，分组原样回来。

- **会话经由工作区的归档是派生出来的，从不写入。** `WorkspaceRegistry.isSessionEffectivelyArchived(sessionId)` 在 id 位于 `archivedSessionIds`、或其所属工作区位于 `archivedWorkspaceIds` 时为真。API 会话控制器的 `agent/pre-step` 门禁在血统的每一跳读取它，`pinSession` 据此拒绝，带该工作区 id 的 `session.create` 或对其会话的 `session.fork` 以 `workspace/archived` 拒绝。侧栏把 follow 流推送的两个集合折叠成一个有效集合（`ui-workspace/src/client/tree.ts` 中的 `effectiveArchivedSessionIds`），所有派生与行操作都读它。由于不按会话写入，先于工作区归档而单独归档的会话，在工作区恢复后仍保持归档。
- **运行中的工作按会话逐个拒绝。** `archiveWorkspace` 对每个尚未进入 `archivedSessionIds` 的已记账会话各询问一次 `workspace/session-activity` waterfall，对任何上报的活动以 `WorkspaceActiveError(workspaceId, sessions)` 拒绝，每一项点名会话及其活动；控制器把它映射为携带相同 details 的 `workspace/workspace-active`。`stopActivity: true` 先写入集合，再按 [archive-stops-running-work](2026-09-21-archive-stops-running-session-work.zh.md) 的规则为每个上报活动的会话派发 `workspace/session-stop`。
- **一次确认点名每个会话。** 侧栏先发送普通归档；Host 的拒绝打开“停止并归档”对话框，列出每个活动会话的展示标题及其工作，来源是 Host 的答复而非客户端镜像。确认后带 `stopActivity` 重发；通知提供撤销。
- **已归档分组整体遵循归档筛选。** 默认筛选隐藏分组及其会话；“显示已归档”在其槽位中灰显；“仅显示已归档”连同全部会话列出。点击经由工作区归档的会话会说明该恢复的是工作区而非会话。该分组不提供“新会话”按钮，未限定范围的新会话的最近工作区回退也跳过已归档工作区。

错误码 `workspace/archived` 声明在域包 `@deepseek-ai/dsh-workspace` 中、紧挨 `workspace/not-found`，因为抛出 workspace 错误码的两个控制器都依赖域包，且互不依赖。

## 考虑过的替代方案

**把每个成员会话写入 `archivedSessionIds`。** 只有一个归档概念，无需派生。但恢复工作区时会把用户此前单独归档的会话一并取消归档，或者需要记住哪些本就已归档——那就是换了件衣服的派生，第三个集合。

**只在客户端隐藏分组。** 只影响一个客户端，Host 门禁、置顶、创建与分叉一无所知；被隐藏的会话仍可能跑模型步。

**把归档做成分离会话的软删除。** 丢掉会话顺序与一主账目，恢复便不再精确。

## 后果

要保持一致的集合从一个变成两个：`validateStoredState` 拒绝不在顺序中的已归档工作区 id，`deleteKnown` 在与顺序移除同一次状态写入中丢弃该 id。所有曾只读 `archivedSessionIds` 来回答“这个会话归档了吗”的消费者都必须改读有效答案（pre-step 门禁、定时任务的会话链接、侧栏）。活动检查在注册表队列内对每个已记账会话各跑一次 waterfall，串行且实际规模很小。换来的是恢复精确的可逆归档，以及由 Host 对每个调用方统一执行、而非仅侧栏执行的工作区归档。

# Agent Note: Engine-agnostic native constructor test

Status: implemented

[English](2026-09-06-engine-agnostic-native-constructor-test.md) | 中文

## Problem

`hasIntrinsicConstructor` 判断一个原型是否为某个 realm 自己的 `Object.prototype` 或 `Array.prototype`，而 `dsh-util-values`、`dsh-tools`、`dsh-cordis-host-runner` 以及源码 worker 的 JSON 闭包各自持有一份副本。每份副本都把 `Function.prototype.toString.call(constructor)` 与字面量 `function Object() { [native code] }` 比较。该渲染形式属于 V8。ECMAScript 的 NativeFunction 文法把空白交由实现决定：SpiderMonkey 与 JavaScriptCore 会把函数体分行并缩进打印。

因此在任何非 V8 引擎上，该比较对引擎自身的 intrinsic 都会失败，`snapshotJsonValue` 于是拒绝每一个普通对象与数组。在浏览器客户端中，这一拒绝会传到 `expandAssistantStream`：它在展开已录制的 Assistant `chunk` 记录时抛出 `Assistant stream raw chunk must be a lossless JSON object`。该抛出杀死了 Session 事件流订阅者，于是 Firefox 渲染出工作区树、页头与 Session 统计，而转录始终为空，`Load earlier` 也无从补上。Chromium 通过了所有门禁，因为 V8 恰好与该字面量一致。

## Decision

每份副本改为与本 realm 自己的渲染比较，即一次性从 `Array` 与 `Object` 捕获的 `NATIVE_CONSTRUCTOR_SOURCE`。运行中的进程所能触及的每个 realm——iframe、`node:vm` 上下文、worker——都运行该进程的引擎，因此本地 intrinsic 是唯一正确的比较对象，任何引擎的空白形式都不再被写死。源码 worker 的副本通过其已持有的 intrinsic 捕获该渲染，时点早于模型代码能够触及 `Function.prototype.toString`。

`apps/web/tests/cross-engine-transcript.e2e.ts` 播种 `bash-tool-turn` 录制，在 Firefox 中打开它，并要求出现录制的 user、Assistant 与 Tool 行，且控制台保持静默。CI 为此在 Chromium 之外一并安装 Firefox。

## Alternatives considered

**用容忍空白的正则匹配 NativeFunction 文法。** 否决：这等于对实现自定义的输出再猜一次；本地 intrinsic 已经是 realm 中现成的确切答案。

**比较前先把两侧字符串的空白归一化。** 否决：理由相同，且会削弱该检查——源码只是形似原生函数的伪造构造函数将获得可乘之机。

**去掉源码比较，只保留 `constructor.name` 与 `constructor.prototype` 的身份检查。** 否决：这两者极易伪造，而阻止伪造正是源码比较存在的理由；`code-runtime` 在其 runtime 套件中覆盖了该伪造场景。

**把整条 web e2e 车道按浏览器参数化。** 否决：代价不成比例——四十多个场景直接导入 `chromium`，且其 golden 对引擎敏感。一个刻意跨引擎的场景已承载真正的风险。

## Consequences

Firefox 与 Safari 能够渲染转录，任何跨 realm 的 JSON 校验在各引擎上的行为也保持一致。Chromium 与 Node 的行为不变，因为被移除的字面量拼写的正是 V8 的渲染形式。

跨引擎场景是 Chromium 之外唯一的浏览器车道；它断言内容与控制台静默，而非 aria golden，从而不受引擎相关布局影响。仅靠评审无法拦住该 intrinsic 检查的第五份副本——这个场景就是常设信号。

# Agent Note: Engine-agnostic native constructor test

Status: implemented

[English](2026-09-06-engine-agnostic-native-constructor-test.md) | 中文

## Problem

`hasIntrinsicConstructor` 判断一个原型是否为某个 realm 自己的 `Object.prototype` 或 `Array.prototype`，而 `dsh-util-values`、`dsh-tools`、`dsh-cordis-host-runner` 与 `dsh-ptc-runtime-node` 中的无损 JSON 遍历器各自持有一份副本。把 `Function.prototype.toString.call(constructor)` 与字面量 `function Object() { [native code] }` 比较的副本写死了 V8 的渲染形式。ECMAScript 的 NativeFunction 文法把空白交由实现决定：SpiderMonkey 与 JavaScriptCore 会把函数体分行并缩进打印。

因此在任何非 V8 引擎上，这样的比较对引擎自身的 intrinsic 都会失败，遍历器于是拒绝每一个普通对象与数组。在浏览器客户端中，这一拒绝传到了 `expandAssistantStream`：它在展开已录制的 Assistant `chunk` 记录时抛出 `Assistant stream raw chunk must be a lossless JSON object`。该抛出杀死了 Session 事件流订阅者，于是 Firefox 渲染出工作区树、页头与 Session 统计，而转录始终为空，`Load earlier` 也无从补上。Chromium 通过了所有门禁，因为 V8 恰好与该字面量一致。

## Decision

每份副本都与本 realm 自己对 `Array` 与 `Object` 的渲染比较，因此任何引擎的空白形式都不被写死。运行中的进程所能触及的每个 realm——iframe、`node:vm` 上下文、worker——都运行该进程的引擎，因此本地 intrinsic 是唯一正确的比较对象。

`dsh-util-values`、`dsh-tools` 与 `dsh-cordis-host-runner` 中的宿主副本在每次调用时读取本地渲染。`dsh-ptc-runtime-node` 的副本与模型代码并存，而模型代码可以重新赋值全局 `Object` 与 `Array`，因此它在模型代码运行之前，通过其已持有的 intrinsic 一次性把两种渲染捕获为 `NATIVE_CONSTRUCTOR_SOURCE`。

每份宿主副本都有一个单元测试：它为宿主与一个 `node:vm` realm 把 `Function.prototype.toString` 替换为 WebKit 的渲染形式，并要求跨 realm 容器通过校验，分别是 `packages/core/session/tests/json.spec.ts`、`packages/core/tools/tests/json-schema.spec.ts` 与 `packages/extensions/cordis-host-runner/tests/sandbox.spec.ts`。V8 字面量会让其中每一个测试失败。

`apps/web/tests/cross-engine-transcript.e2e.ts` 播种 `bash-tool-turn` 录制，在 Firefox 中打开它，并要求出现录制的 user、Assistant 与 Tool 行，且控制台保持静默。CI 为此在 Chromium 与 WebKit 之外一并安装 Firefox。

## Alternatives considered

**用容忍空白的正则匹配 NativeFunction 文法。** 否决：这等于对实现自定义的输出再猜一次；本地 intrinsic 已经是 realm 中现成的确切答案。

**比较前先把两侧字符串的空白归一化。** 否决：理由相同，且会削弱该检查——源码只是形似原生函数的伪造构造函数将获得可乘之机。

**去掉源码比较，只保留 `constructor.name` 与 `constructor.prototype` 的身份检查。** 否决：这两者极易伪造，而阻止伪造正是源码比较存在的理由；`packages/core/session/tests/json.spec.ts` 中的伪造原型用例覆盖了该伪造场景。

**在每份副本中都一次性捕获渲染。** 对宿主副本否决：捕获的字符串在模块加载时即已固定，替换为其他引擎渲染的测试无法触及它。只有 worker 副本做捕获，因为在那里逐次读取全局变量会让模型代码提供比较对象。

**把整条 web e2e 车道按浏览器参数化。** 否决：代价不成比例——四十多个场景直接导入 `chromium`，且其 golden 对引擎敏感。

## Consequences

Firefox 与 Safari 能够渲染转录，任何跨 realm 的 JSON 校验在各引擎上的行为也保持一致。Chromium 与 Node 的行为不变，因为被移除的字面量拼写的正是 V8 的渲染形式。

单元测试是宿主副本的回归信号。跨引擎场景只检查渲染：读取已录制的 Session 走 `validateRecord`，不会触及 `snapshotJsonValue`，因此客户端 bundle 中即使带着 V8 字面量，该场景也会通过。worker 副本没有替换引擎渲染的测试，因为它的捕获在 worker 启动时执行，早于测试替换 `Function.prototype.toString` 的时点。

# CLAUDE.md

本文件为在此仓库工作的代码助手提供上下文。

## 项目概述

Pynseq for Weibo｜屏序·微博是一个运行在微博桌面端的 Tampermonkey 用户脚本。它提供本地屏蔽名单、时间线控制、广告与推荐内容过滤、导航与侧栏整理，以及新浪微博官方黑名单同步。

## 仓库结构

| 文件 | 说明 |
| --- | --- |
| `pynseq-for-weibo.user.js` | 用户脚本本体，单文件，包含全部运行时代码 |
| `regression.test.cjs` | 回归测试，纯 Node 内置模块实现，无第三方依赖 |
| `CHANGELOG.zh-CN.md` | 变更日志，按版本倒序 |
| `readme.md` | 中英双语说明文档 |
| `pynseq-for-weibo-icon.png` | 脚本图标，元数据中以固定 commit 的 raw 链接引用 |

## 运行测试

```bash
node regression.test.cjs
```

测试通过时输出 `regression tests: PASS`，失败时退出码为 1。

测试以字符串切片方式读取用户脚本源码，用 `node:vm` 在隔离上下文中执行片段，并对源码文本做正则断言。切片依赖源码中的标记行（如函数声明的完整首行），修改这些行时需同步更新 `sourceBetween` 的调用参数。

## 用户脚本约定

- **单文件**：全部代码位于 `pynseq-for-weibo.user.js`，不拆分模块，不引入构建步骤。
- **版本号**：元数据 `@version` 与运行时常量 `SCRIPT_VERSION` 必须一致，且 `CHANGELOG.zh-CN.md` 必须存在对应版本条目。三者由测试强制校验。
- **运行时机**：`@run-at document-start`，脚本在页面脚本之前执行。
- **配置键**：存储于 `GM_getValue`/`GM_setValue`，键名一经发布不再更改。修改设置项显示文案时保留原键名，避免用户既有设置失效。
- **注释语言**：中文注释描述行为与原因，英文注释保留在涉及微博前端组件行为的段落。
- **文案**：面向用户的文案客观描述功能行为与影响范围，不使用推测性或自我评价性表述。

## 网络层约束

**不变量：脚本可以读取网络响应，不得改变页面收到的内容与请求生命周期。**

允许只读观察：包装 `window.fetch` 与 `XMLHttpRequest.prototype.open/send`，通过 `clone()` 读取响应副本，包装体原样返回原生结果。

禁止以下行为，均由 `regression.test.cjs` 中的断言强制：

1. 将自行构造的 `Response` 交回页面
2. 改写 XHR 的 `responseText`、`responseXML`、`responseType`
3. 替换 `XMLHttpRequest.prototype.abort` 或 `window.WebSocket`
4. 包装 `fetch` 时消费原始响应体而不使用 `clone()`
5. 观察层修改请求参数

背景：脚本 2.1.0 之前曾在接口层删除 statuses 数组中的条目再交给页面，导致「全部关注」等主页时间线永久显示加载动画。分页器需要未经删减的 statuses 与游标，整页被过滤为空后原生组件会回退旧缓存并保持加载状态。所有隐藏动作因此一律在 DOM 侧完成。

源码正则断言只能拦截显式写出的形式，无法覆盖等价改写。涉及网络层的改动，发布前需在「全部关注」与「最新微博」各连续翻页十次，确认分页持续产出新内容且不出现加载停滞。

## 广告识别

微博接口对广告微博下发三种标记：`isAd`、`readtimetype: 'adMblog'`、`mark` 内含 `mark_ad` 段。页面上没有对应的可见文案——角标文案为「广告」时微博渲染为图片，DOM 内既无文字也无稳定类名。

识别分两步：

1. `observeContentResponse` 解析第一方微博域名下 `/ajax/feed/` 与 `/ajax/statuses/` 的响应副本，将带广告标记的微博 id 写入 `AD_POST_IDS`（上限 3000 条，按写入顺序淘汰）。
2. `hideRecognizedAds` 从卡片正文链接 `/{uid}/{mblogid}` 取出条目标识，命中登记表即隐藏。

回包可能晚于卡片渲染到达，登记表新增条目时会触发一次补扫。

## 虚拟列表

微博时间线使用 `vue-virtual-scroller`。隐藏条目时不改动外层 item-view 的 transform 与高度，只把内容壳压成 2px 的不可见测量壳——`DynamicScroller` 会忽略恰好为 0 的测量值并沿用旧行高。

隐藏与恢复后都必须调用 `requestNativeVirtualItemRemeasure`，向 `DynamicScrollerItem` 发送局部 `resize` 通知。壳被回收给另一条微博时，需重新核对隐藏条件是否仍然成立，否则复用后的正常微博会继续沿用上一条的隐藏状态。

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
- **版本号**：元数据 `@version` 与运行时常量 `SCRIPT_VERSION` 必须一致，且 `CHANGELOG.zh-CN.md` 必须存在对应版本条目。三者由测试强制校验。同一处功能的后续修正在末位追加数字（如 2.4.5 之后为 2.4.51），不为每次改动进位到下一个补丁号。
- **运行时机**：`@run-at document-start`，脚本在页面脚本之前执行。
- **配置键**：存储于 `GM_getValue`/`GM_setValue`，键名一经发布不再更改。修改设置项显示文案时保留原键名，避免用户既有设置失效。
- **注释语言**：中文注释描述行为与原因，英文注释保留在涉及微博前端组件行为的段落。
- **文案**：面向用户的文案陈述功能行为与影响范围，不含推测性或评价性表述。

## 网络层约束

**不变量：脚本可以读取网络响应，不得改变页面收到的内容与请求生命周期。**

允许只读观察：包装 `window.fetch` 与 `XMLHttpRequest.prototype.open/send`，通过 `clone()` 读取响应副本，包装体原样返回原生结果。

禁止以下行为，均由 `regression.test.cjs` 中的断言强制：

1. 将自行构造的 `Response` 交回页面
2. 改写 XHR 的 `responseText`、`responseXML`、`responseType`
3. 替换 `XMLHttpRequest.prototype.abort` 或 `window.WebSocket`
4. 包装 `fetch` 时消费原始响应体而不使用 `clone()`
5. 观察层修改请求参数

该约束的引入背景：脚本 2.1.0 之前在接口层删除 statuses 数组中的条目再交给页面，导致「全部关注」等主页时间线持续显示加载动画。分页器需要未经删减的 statuses 与游标，整页被过滤为空后原生组件回退旧缓存并保持加载状态。隐藏动作因此一律在 DOM 侧完成。

源码正则断言只匹配显式写出的形式，不覆盖等价改写。涉及网络层的改动，发布前需在「全部关注」与「最新微博」各连续翻页十次，确认分页持续产出新内容且不出现加载停滞。

## 广告识别

微博接口对广告微博下发三种标记：`isAd`、`readtimetype: 'adMblog'`、`mark` 内含 `mark_ad` 段。页面上没有对应的可见文案——角标文案为「广告」时微博渲染为图片，DOM 内既无文字也无稳定类名。

识别分两步：

1. `observeContentResponse` 解析第一方微博域名下 `/ajax/feed/` 与 `/ajax/statuses/` 的响应副本，将带广告标记的微博 id 与作者归类写入 `AD_POST_OWNERS`（上限 3000 条，按写入顺序淘汰）。
2. `hideRecognizedAds` 从卡片正文链接 `/{uid}/{mblogid}` 取出条目标识，命中登记表且对应分档开启时隐藏。

回包可能晚于卡片渲染到达，登记表新增条目时会触发一次补扫。

### 作者归类

`classifyAdPostOwner` 按作者与当前账号的关系把广告分为三档，分别对应 `hideAdsFromFollowing`、`hideAdsFromStrangers`、`hideAdsFromSelf` 三个设置项：

| 分档 | 判定依据 | 默认 |
| --- | --- | --- |
| `self` | 作者 uid 等于当前登录 uid | 保留 |
| `stranger` | `user.following === false` | 隐藏 |
| `following` | 其余情况，含 `user.following` 缺失 | 隐藏 |

分档在隐藏判定时计算，不在解析回包时定死。登记表 `AD_POST_OWNERS` 存的是作者身份（`authorID` 与 `following`），`resolveAdPostOwner` 在每次判定时把它解析成分档。自己发布的微博上 `user.following` 就是 `false`，本人判定一旦没有生效，条目只剩 `stranger` 一档可落，而该档默认开启——把分档在解析时定死，这种误判就会固化到下一次重新加载为止。

当前登录 uid 先取页面全局 `$CONFIG`（`user.idstr` 或 `uid`）；读不到时从导航栏中指向当前账号主页的链接读取，uid 形态经 `/^\d{4,}$/` 校验。两处都读不到时返回空串，此时不会产生 `self` 分档。`user.following` 缺失时归入 `following`，用户关闭该档时无法判定关系的条目保持显示。

转发按**原微博**的作者归档，取转发链上最内层带广告标记的那一条（`findAdOriginItem`）。转发者只是把同一条广告再发一次，用户关心的是广告作者与自己的关系：转发已关注博主的广告归入 `following`。按外层作者归档会同时错两次——既不受 `hideAdsFromFollowing` 管辖，又因为自己的微博上 `user.following` 为 `false` 而落进 `stranger`。自己出钱推广自己的转发时，广告标记只落在外层，归档因此回到外层作者，`self` 仍然管辖这种情形。

转发的外层与内层都写入登记表，用的是同一个原微博作者身份。卡片正文链接取到的是外层微博的标识，只登记内层时转发卡片在 DOM 侧命中不了登记表。

`hideAds` 是总开关，关闭时三档均不生效。三档的开关变更经 `applyRuntimeConfig` 走完整的恢复与重扫流程。

已隐藏条目的复核由 `restoreRecycledVirtualAdShells` 承担，每轮过滤在**整篇文档**上进行，不以是否位于虚拟行作为前置条件。按 DOM 变更子树复核时，设置变更之前就已经隐藏的条目不在范围内，隐藏标记会保留到下一次恰好把它包含进来的刷新为止；按虚拟行限定时，搜索页与微博正文页的卡片永远不会被复核。推荐内容的复核遵循同一规则。

黑名单侧的复核不能照搬这个范围。`restoreRecycledVirtualContentShells` 里广告与推荐内容传 `document`，黑名单分支用调用方传入的 `scope`。黑名单的判定要用 `contentRootOwnedByUID` 读节点上的 uid 标记，微博前端重新渲染期间节点会短暂处于标记缺失的状态；对整篇文档复核会把这一刻的条目判成「不再属于被屏蔽用户」并解除隐藏，页面上表现为站内跳转之后被屏蔽的内容重新出现。名单本身变更时走 `refreshBlockedDOMAfterBLChange`，那条路径另有完整刷新，不依赖这里的范围。

## 主页默认分栏

「全部关注」就是主页根路由 `/`，其余分栏是 `/mygroups?gid=...`。开启「主页默认显示「最新微博」」后，脚本需要点击分栏才能离开「全部关注」，接口层不做任何拦截。

### 官方拉黑中继保护

`s.weibo.com` 不能直接调用只允许主站同源执行的官方拉黑接口。组合屏蔽操作会打开 `https://weibo.com/?wb_retro_official_block=<任务标识>`，由主站标签页完成请求并把结果写回共享的用户脚本存储。

带 `wb_retro_official_block` 参数的页面是任务中继页，不是首页时间线访问。`forceLatestTab` 必须在任何根路由改写、分栏纠正会话或相关监听器初始化之前退出，保留查询参数供后部的 `processOfficialBlockRelay` 读取。中继参数常量与 `hasOfficialBlockRelayRequest` 因此定义在 `forceLatestTab` 之前。

回归测试必须同时覆盖带中继参数的主站 URL 与普通主站首页 URL：前者命中保护并跳过默认分栏初始化，后者保持原有首页分栏行为。

开启该设置后有两条路径。

**地址改写。** 脚本从「最新微博」分栏所在的链接上读取 gid，写入 `WB_latest_timeline_gid`，读取不发起请求。之后打开首页时，脚本在 document-start 阶段把根路由 `history.replaceState` 成 `/mygroups?gid=...`。此时页面脚本尚未执行，微博前端初始化路由时读到的就是「最新微博」，该次加载不会请求「全部关注」的内容。改写之后分栏条在 20 秒内仍未出现时，说明记录的 gid 已不可用，脚本清除它并回到根路由，下一次加载没有 gid 可用；页面不可见时只推迟判定。

改写不等于已经到位。微博前端有时仍按「全部关注」初始化：地址是分组路由，而分栏选中态、页面标题与时间线接口都停在「全部关注」。因此改写之后照样开一次纠正会话兜底。

**纠正会话。** 分栏由微博前端异步挂载，冷启动下节点出现在导航之后 1.0–2.1 秒，加载变慢时更晚。纠正因此按会话进行，不做一次性尝试：

- 停在根路由、或本次加载刚刚改写过地址时开启一次会话，时间预算 20 秒，其间持续等待分栏节点出现。「刚改写过地址」的标记 `rewriteArrivalPending` 由第一次会话消费；沿用到之后的站内跳转时，从个人主页返回用户自选的「特别关注」等分组也会被点回「最新微博」。
- 分栏节点出现即点击。未到位则重试，最多 12 次，两次点击间隔不短于 350ms。点击后微博先切换选中类名、数百毫秒后才更新路由，`RECONCILE_SWITCH_SETTLE_MS`（1.5 秒）内「最新微博」已处于选中态时不重复点击；重复点击落在已选中的分栏上不推进切换，页面繁忙时会在切换完成前耗尽次数。
- 页面重新可见时仍停在根路由，补开一次会话。开启该设置时「全部关注」分栏被样式隐藏，用户无法亲手选中，停在根路由只能是纠正没有生效。
- 地址改写的 20 秒校验到点时已不在首页时间线路由上，不做判定：用户在分栏条挂载之前离开首页时，当前页面没有分栏条可以核对。

**内容校验。** 地址与高亮都是「最新微博」时，微博前端仍可能沿用「全部关注」的分栏状态，请求 `/ajax/feed/unreadfriendstimeline`（「全部关注」的时间线接口）。实测在站内跳转中用路由守卫直接把 `/` 重定向到分组地址，四次里三次落入这种状态，点击「最新微博」可以纠正。因此不采用在路由层改写目标地址的方案，只改地址无法让微博切换分栏内容。`observeHomeFeedRequests` 用 `PerformanceObserver` 只读地观察资源计时：当前地址是「最新微博」的 gid、请求返回时刻晚于该地址生效时刻（发起更早、返回更晚的请求同样计入：分栏条已挂载时脚本约 50ms 内就点击切换，「全部关注」的请求返回后页面标题与内容会回到「全部关注」）、高亮在「最新微博」或「全部关注」上时，点击「最新微博」，每次到达最多两次。

**切换遮罩。** 站内回到首页时，微博先渲染「全部关注」，「最新微博」的内容在点击之后约一秒才到。纠正会话开始时在根元素上加 `data-__wb_latest_timeline_pending`，样式把 `#homeWrap .vue-recycle-scroller` 设为 `visibility: hidden`（保留布局，虚拟列表照常测量）。到位之后不立即撤除，等点击之后发起的分组时间线请求完成、再过 80ms 才撤除；遮罩最长 5 秒。会话因其他原因结束（用户亲手选择、离开首页、次数或预算用尽）时立即撤除。
- 已经到位、离开首页时间线路由、用户亲手点击其他分栏、设置关闭、预算或次数用尽，任一成立即结束会话。
- pathname 变化才算新的一次首页停留，同一次停留不重复开启会话。用户自己停在其他分组分栏时不开启。

到位判定是「路由已离开根路由」与「「最新微博」处于选中态」的合取，两个条件缺一不可。只看路由：改写地址之后前端仍按「全部关注」启动时，地址已是分组路由，会被误判为已经到位。只看选中态：微博只用带构建哈希的类名（如 `_cur_118ye_33`）表示选中态，类名与路由分别更新，存在类名已指向「最新微博」而内容仍是「全部关注」的中间态。

`MANUAL_TAB_CHOICE_TTL_MS` 记录用户最后一次亲手点击的分栏，4 秒内不纠正。该记录依赖 `isTrustedUserEvent`，脚本自身发出的点击不写入。

## 虚拟列表

微博时间线使用 `vue-virtual-scroller`。隐藏条目时不改动外层 item-view 的 transform 与高度，只把内容壳压成 2px 的不可见测量壳——`DynamicScroller` 会忽略恰好为 0 的测量值并沿用旧行高。

隐藏与恢复后都必须调用 `requestNativeVirtualItemRemeasure`。壳被回收给另一条微博时，需重新核对隐藏条件是否仍然成立，否则复用后的正常微博会继续沿用上一条的隐藏状态。

**尺寸上报的原生入口。** 微博当前使用的是 vue-virtual-scroller 2.x：`DynamicScrollerItem` 的根元素是 item-view 的直接子节点（如 `wbpro-scroller-item`，带 `data-index`），元素上挂着 `$_vs_onResize` 与 `$_vs_id`，共享的 ResizeObserver 回调直接调用 `$_vs_onResize(id, width, height)`。向 item-view 派发 `resize` CustomEvent 是 1.x 的监听方式，在 2.x 里没有监听者，实测派发后后续行坐标不变。2px 测量壳之所以有效，是原生 ResizeObserver 观察到了内容壳本身的尺寸变化，不是那个事件。`reportNativeVirtualItemSize` 经 `$_vs_onResize` 上报，`requestNativeVirtualItemRemeasure` 先走原生入口、再保留 1.x 的事件。

**外部样式整行隐藏。** uBlock Origin 的中文过滤规则会直接作用在 item-view 上（实测 `.vue-recycle-scroller__item-view:has(img[src="…icon_auth_white.png"]) { display: none !important }`）。行测得 0，ResizeObserver 上报的 0 被忽略，原高度留在原地成为空白——这正是 2px 测量壳要解决的问题，只是隐藏者不是脚本。该规则以用户级样式注入：页面里的样式表无论特异性多高、内联 `display: block !important` 都覆盖不了，不要再尝试用 CSS 把行恢复显示。`syncExternallyHiddenVirtualRows` 找出高度不足 1px、但含 `$_vs_onResize` 元素的行，经原生入口上报 2px（与测量壳一致），行保持外部规则的隐藏状态；按 `$_vs_id` 记录已上报的条目，Vue 把行复用给另一条内容时重新上报。绘制前隐藏、每批 DOM 变更与过滤主流程都调用它。在 `/` 实测的空白行经此上报后，下一行从间隔 300px 收回到 2px。

微博正文页的评论区使用同一套虚拟列表，但隐藏目标位于行内第三层：`item-view > wbpro-scroller-item > wbpro-list > 评论项`。`requestNativeVirtualItemRemeasure` 按 `closest` 定位所在的虚拟行，不能按父节点匹配，否则评论区取不到行，重测通知不会发出。

行内的内容全部隐藏时，行本身测得 0，滚动器沿用旧行高，原位置留下整段空白，并且不会因为出现空位而补足可视区内的条目——整屏评论都被屏蔽时，评论区会既是空白又不再加载后续评论。`syncVirtualRowMeasurementShell` 在这种情况下给行内的直接内容壳加上 `VIRTUAL_ROW_SHELL_ATTR`，由样式保留 2px 的不可见测量壳。该标记必须在每轮过滤时经 `syncVirtualRowMeasurementShells` 重新核对，因为 Vue 会把同一行复用给另一条内容。

## 绘制前隐藏

内容过滤订阅在 MutationObserver 回调里先同步执行 `hideBeforePaint`，再把变更交给 60ms 的批处理。回调在微任务检查点执行，早于样式计算与绘制；隐藏留到批处理时，条目会先绘制一帧再消失，表现为评论区等位置的闪动。DynamicScroller 的首次测量也因此直接拿到测量壳的高度。

`hideBeforePaint` 只做只增不减的隐藏：新增节点走广告、推荐内容与 `hideBlockedContentWithoutRestore`（黑名单的微博侧与评论侧，顺序同 `refreshBlockedContent`）。恢复、整篇文档复核、测量壳与布局补偿不放在这里——恢复判定依赖 uid 标记，Vue 重新渲染期间标记可能短暂缺失。

Vue 复用虚拟行时可能只改属性、不插入节点。`IDENTITY_ATTRIBUTE_NAMES` 中的属性变更同样进入前置隐藏；落在已隐藏壳内的变更把壳记入 `pendingRecycledShells`，由批处理以该壳为范围调用 `refreshBlockedContent` 复核。

隐藏标记靠运行时样式生效。启动流程在读取本地名单之后、启动同步的网络请求之前就调用 `updateRuntimeStyles`；样式晚于标记注入时，刷新页面会让已打标记的条目先显示一段网络往返的时间。`injectCSSWhenReady` 在 `head` 尚未生成时把样式挂在根元素上。

## 新浪微博官方黑名单同步

接口 `/ajax/setting/getFilteredUsers?page=N` 按最近拉黑在前排列，每页 20 个，返回 `total` 与 `next_cursor`（下一页首个 UID，末页为 0）。按页码可以读到最后一页，分页只用页码。

- **同步新增**（`syncNewOfficialUIDs`）：从第 1 页往后读，整页都已在本地名单里即停止。手动最多 50 页，并把官方名单里的 UID 重新加入本地（清除对应的本地删除记录）；启动时静默运行，最多 3 页，保留本地删除。「整页已知即停止」依赖最近拉黑在前的排列，并且不能单独使用：实测本地名单的缺口位于第 7–300 页，前 6 页全部已知。`WB_BL_official_synced_total` 记录上次同步覆盖到的官方总数，同步新增必须先读完 `ceil((当前总数 − 基准) / 每页数量) + 1` 页，再按整页判断；读到上限仍有新增时不更新基准。
- **完整同步**（`fullSync`）：每 10 页经 `commitSyncedLocalBL` 写入一次，并把断点（下一页、已读 UID、总数）写入 `WB_BL_full_sync_progress`；失败或取消时先写入已读部分再记录失败的页。下次调用从断点继续，断点超过 7 天作废。
- **补读**：接口偶尔返回与前后页不一致的结果（返回的 `total` 不同，或包含相邻页的 UID），分页边界随之错位，一处重复、另一处漏掉同样数量的 UID。实测 1002 页的扫描读到 19910 个、重复 129 个。完整同步把含已读 UID 或 `total` 变化的页记为异常页（随断点保存），读完后若数量少于 `total`，重读异常页及相邻页，最多 300 页。短时间内重复读同一页，结果完全一致，错位不来自排序不稳定。
- **重试**：`fetchFilteredUsersPage` 对 418、5xx、网络错误、响应体无法解析，以及 HTTP 200 但 `ok: 0` 的响应（实测在第 361 页返回「获取屏蔽设置失败！」，随后重读正常）按 5 秒起翻倍退避，六次后抛错。实测连续快速请求约 450 页后触发限流，限流持续约两分钟，重试总时长需要覆盖这段时间。
- **官方取消拉黑**：`WB_BL_official_seen` 记录出现在官方黑名单中的 UID，同步与「同时加入新浪微博官方黑名单」都会写入。完整同步读完且读到的数量不少于 `total` 时，删除「记录中有、本次未读到」的 UID，并用本次名单覆盖记录；数量不足时只合并记录、不删除，避免同步期间名单变化导致误删。删除不写入本地删除记录，之后在官方重新拉黑时，启动同步仍会加回。
- 后台标签页的计时器被浏览器限流，页面可能被冻结，完整同步会变慢或停住。断点续传是对此的兜底，设置页提示保持前台。

## 评论过滤

微博侧的 `hideBlockedDOMPosts` 与评论侧的 `hideBlockedCommentRoots` 使用各自的根定位逻辑，前者不覆盖后者。两者必须成对执行：定时刷新走 `refreshBlockedContent`，屏蔽动作在 `hideBlacklistComments` 开启时无条件执行一次评论侧隐藏。

子评论不匹配 `DOM_COMMENT_ROOT_SELECTOR`，`findContentRootForUID` 取到的节点也不会被 `isCommentContentRoot` 认出来。按该节点的形态在评论与微博两条路径之间二选一时，屏蔽子评论两条都不覆盖，要等评论区下一次重新渲染才生效。

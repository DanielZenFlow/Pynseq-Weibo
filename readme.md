# Pynseq for Weibo｜屏序·微博

> 屏其不欲见者，复其应有之序。

**Pynseq for Weibo 是由 Daniel Zenflow 开发的微博桌面端本地内容过滤与时间线控制工具。** 它允许你建立独立于微博账户的本地屏蔽名单，在微博、转发、评论、搜索结果、用户卡片和互动列表中持续隐藏名单用户的可识别内容；同时提供最新微博时间线切换、isAd 标记广告过滤、导航与侧栏整理，以及新浪微博官方黑名单同步工具。名单与设置保存在当前浏览器中，由用户自行管理。

[English](#english)

## 功能

- 可将微博首页默认切换到按时间顺序排列的「最新微博」，也可随时恢复原生「全部关注」时间线。
- 隐藏本地屏蔽名单用户发布的微博、转发、评论和回复。
- 在搜索结果、用户卡片、推荐项、转发用户列表和点赞用户列表中过滤名单用户。
- 在可识别的用户名上提供右键菜单，可只加入本地屏蔽名单，或同时加入新浪微博官方黑名单。
- 支持分别控制微博与转发、评论与回复、搜索结果、用户卡片与推荐项、互动列表五类屏蔽范围。
- 支持独立隐藏时间线中的“你可能感兴趣的内容”、带 isAd 标记的广告微博、搜索页相关用户、微博热搜及多个导航和侧栏模块。
- 带 isAd 标记的广告按作者与当前账号的关系分为三档，可分别开关：关注博主发布的广告（默认隐藏）、非关注博主发布的广告（默认隐藏）、本人发布的广告（默认保留）。关注博主发布的商业推广同样带有该标记。
- 转发的广告按原微博的作者归档。转发已关注博主的广告归入「关注博主发布的广告」，不因转发者是当前账号而落入「本人发布的广告」。使用粉丝头条推广自己的转发时，广告标记只落在转发本身，仍归入「本人发布的广告」。
- 提供五步首次设置向导、右下角快捷设置按钮，以及 Tampermonkey「设置」「关于」菜单。
- 支持搜索、分页、手动添加、移除、清空、导入和导出本地屏蔽名单。
- 支持「同步新增」与可续传的「完整同步」新浪微博官方黑名单；完整同步会删除官方已取消拉黑的 UID。
- 可选启用屏蔽前确认和 GitHub Star 提醒。

## 运行环境

- 微博桌面端网页：`https://weibo.com/`
- 微博搜索网页：`https://s.weibo.com/`
- 支持用户脚本的桌面浏览器
- 推荐使用 [Tampermonkey](https://www.tampermonkey.net/) 管理脚本

本项目不适用于微博移动端应用。

## 安装

1. 在浏览器中安装 Tampermonkey 或其他兼容的用户脚本管理器。
2. 打开 [Greasy Fork 安装页面](https://greasyfork.org/en/scripts/564839-pynseq-for-weibo-%E5%B1%8F%E5%BA%8F-%E5%BE%AE%E5%8D%9A-%E6%9C%AC%E5%9C%B0%E5%B1%8F%E8%94%BD%E5%90%8D%E5%8D%95%E4%B8%8E%E6%97%B6%E9%97%B4%E7%BA%BF%E6%8E%A7%E5%88%B6-%E5%B1%8F%E8%94%BD%E7%83%AD%E6%90%9C)，然后选择安装脚本。也可以直接打开 [GitHub 上的用户脚本原始文件](https://raw.githubusercontent.com/DanielZenFlow/Pynseq-Weibo/main/pynseq-for-weibo.user.js)。
3. 在用户脚本管理器中确认安装。
4. 打开或刷新微博桌面端网页，按照首次设置向导完成配置。

项目地址：[Greasy Fork 项目页](https://greasyfork.org/en/scripts/564839-pynseq-for-weibo-%E5%B1%8F%E5%BA%8F-%E5%BE%AE%E5%8D%9A-%E6%9C%AC%E5%9C%B0%E5%B1%8F%E8%94%BD%E5%90%8D%E5%8D%95%E4%B8%8E%E6%97%B6%E9%97%B4%E7%BA%BF%E6%8E%A7%E5%88%B6-%E5%B1%8F%E8%94%BD%E7%83%AD%E6%90%9C)

## 使用

### 添加用户

- 在可识别的用户名文字区域点击鼠标右键，然后选择本地屏蔽操作。
- 如需同步微博账户黑名单，可选择“同时加入新浪微博官方黑名单”的操作。
- 在 `s.weibo.com` 搜索页执行该组合操作时，脚本会临时打开带任务参数的 `weibo.com` 中继页，以同源方式写入新浪微博官方黑名单。中继页不会触发“主页默认显示「最新微博」”的路由切换。
- 在“设置 → 本地屏蔽名单”中输入 UID，或批量粘贴多个 UID。

### 管理屏蔽范围

打开“设置 → 屏蔽设置”，可分别控制：

- 微博和转发
- 评论和回复
- 搜索结果
- 用户卡片和推荐项
- 转发和点赞用户列表

关注和粉丝关系页面不会隐藏关系列表中的用户。

### 同步新浪微博官方黑名单

打开“设置 → 新浪微博黑名单管理”，可选择：

- 同步新增：官方黑名单按最近拉黑在前排列。从第 1 页往后读取，先读完覆盖「官方总数比上次同步时多出的部分」的页数，之后遇到整页都已在本地屏蔽名单中即停止，最多读取 50 页。打开微博页面时会自动执行一次，最多读取 3 页。
- 完整同步：读取全部分页，名单较大时需要数分钟，期间请保持该标签页在前台。每读取 10 页保存一次；中途取消、关闭页面或请求失败后，按钮显示为「继续完整同步」，再次点击从中断的页继续。微博限制请求频率时，脚本按递增的间隔重试，多次失败后暂停并保留已读取的部分。

微博接口偶尔会返回与前后页错位的分页结果。完整同步读完之后，若读到的数量少于官方总数，会重读出现异常的页及其相邻页以补上遗漏。完整同步读完全部分页、且读取数量与官方总数一致时，会从本地屏蔽名单删除在新浪微博官方取消拉黑的 UID。只在本地屏蔽、从未出现在官方黑名单中的 UID 不受影响；读取数量与官方总数不一致时（例如同步期间名单发生变化），本次不删除任何 UID。完成后会显示官方黑名单人数、本次新增与删除的数量，以及只在本地屏蔽的数量。

在本地屏蔽名单中删除的 UID，在打开页面时的自动同步中保持删除；手动执行同步新增或完整同步时，官方黑名单中的 UID 会重新加入本地屏蔽名单。同步功能不会修改新浪微博官方黑名单。

### 备份与恢复

在“设置 → 本地屏蔽名单”中导出名单文件。导出的 JSON 文件可用于备份，也可在另一浏览器中合并导入或替换导入。

## 本地数据与隐私

- 本地屏蔽名单、设置和提醒状态保存在当前浏览器的用户脚本存储空间中。
- 本地名单不会由本项目自动上传到外部服务器。
- 脚本启动时会读取新浪微博官方黑名单最近的至多 3 页并合并到本地名单；手动同步时按所选方式继续读取。只有明确选择“同时加入新浪微博官方黑名单”时，脚本才会写入微博账户的官方黑名单。
- 本地数据不会自动同步到其他浏览器、浏览器配置文件或设备。
- 清除浏览器数据、删除用户脚本或重置用户脚本存储前，建议先导出名单。

## 已知限制

- 过滤依赖微博网页当前提供的用户标识、接口数据和页面结构；微博更新页面后，部分功能可能需要适配。
- 页面尚未加载完成或没有提供可识别 UID 时，相关内容可能需要等待数据加载后才能被过滤。
- 「最新微博」不是微博首页的根路由。脚本记录该分栏的地址之后，打开首页直接进入该分栏；首次使用时仍需等分栏渲染完成后再切换。从其他页面回到首页时，微博会先加载「全部关注」，脚本在切换完成前隐藏时间线列表，这段时间列表区域为空白。
- 微博使用动态加载和虚拟列表，脚本只能处理当前浏览器已经接收并能够识别的内容。
- 本地屏蔽不等同于新浪微博官方拉黑；只有明确选择官方黑名单操作时，才会修改微博账户中的官方黑名单。
- 官方黑名单同步受微博接口状态、分页数据和访问频率限制。浏览器会限制后台标签页的计时器并可能冻结页面，完整同步在后台标签页中会明显变慢或暂停。
- 删除官方已取消拉黑的 UID 依赖脚本记录的「出现在官方黑名单中的 UID」。该记录从 3.0.0 开始建立，因此 3.0.0 之后的第一次完整同步只建立记录、不删除，此后的完整同步才会删除。

## 支持项目

- [在 Greasy Fork 安装或更新 Pynseq for Weibo](https://greasyfork.org/en/scripts/564839-pynseq-for-weibo-%E5%B1%8F%E5%BA%8F-%E5%BE%AE%E5%8D%9A-%E6%9C%AC%E5%9C%B0%E5%B1%8F%E8%94%BD%E5%90%8D%E5%8D%95%E4%B8%8E%E6%97%B6%E9%97%B4%E7%BA%BF%E6%8E%A7%E5%88%B6-%E5%B1%8F%E8%94%BD%E7%83%AD%E6%90%9C)
- [在 GitHub 为 Pynseq for Weibo 点亮 Star](https://github.com/DanielZenFlow/Pynseq-Weibo)
- [通过 Buy Me a Coffee 支持 DanielZenFlow](https://buymeacoffee.com/danielzenflow)
- [提交问题或功能建议](https://github.com/DanielZenFlow/Pynseq-Weibo/issues)

## 许可证

本项目采用 [MIT License](https://opensource.org/license/mit/)。

---

<a id="english"></a>

# Pynseq for Weibo｜屏序·微博

> Hide what you do not wish to see, and restore the order that should remain.

**Pynseq for Weibo is a local content-filtering and timeline-control tool for the desktop Weibo website, developed by Daniel Zenflow.** It lets you maintain a local blocklist independently of your Weibo account and continuously hide identifiable content associated with blocked users across posts, reposts, comments, search results, user cards, and interaction lists. It also provides chronological timeline switching, ad filtering, navigation and sidebar cleanup, and tools for synchronizing Weibo's official blocklist.

## Features

- Switches the Weibo home page to the chronological “Latest Weibo” feed by default and can restore the native “All Following” feed.
- Hides posts, reposts, comments, and replies from locally blocked users.
- Filters blocked users from search results, user cards, recommendations, repost lists, and like lists.
- Adds a context menu to identifiable usernames for local blocking or optional simultaneous addition to Weibo's official blocklist.
- Provides separate filtering controls for posts and reposts, comments and replies, search results, user cards and recommendations, and interaction lists.
- Independently hides “You may be interested” timeline recommendations, identifiable ads and promotions, related-user panels, trending topics, and selected navigation or sidebar modules.
- Groups isAd-marked posts into three tiers by the author's relationship to the current account, each with its own switch: ads from followed accounts (hidden by default), ads from accounts you do not follow (hidden by default), and ads you posted yourself (kept by default).
- Classifies a repost by the author of the original post. A repost of an ad from an account you follow belongs to the followed-account tier rather than the self tier. When you promote your own repost, the ad marker sits on the repost itself and it stays in the self tier.
- Includes a five-step onboarding flow, a quick-settings button, and “Settings” and “About” Tampermonkey menu entries.
- Supports searching, pagination, manual entry, removal, clearing, importing, and exporting of the local blocklist.
- Synchronizes Weibo's official blocklist with “Sync new” and a resumable “Full sync”; a full sync removes UIDs that were unblocked on Weibo.
- Optionally enables confirmation before blocking and GitHub Star reminders.

## Requirements

- Weibo desktop website: `https://weibo.com/`
- Weibo Search: `https://s.weibo.com/`
- A desktop browser with userscript support
- [Tampermonkey](https://www.tampermonkey.net/) is recommended for script management

The project does not support the Weibo mobile application.

## Installation

1. Install Tampermonkey or another compatible userscript manager.
2. Open the [Greasy Fork installation page](https://greasyfork.org/en/scripts/564839-pynseq-for-weibo-%E5%B1%8F%E5%BA%8F-%E5%BE%AE%E5%8D%9A-%E6%9C%AC%E5%9C%B0%E5%B1%8F%E8%94%BD%E5%90%8D%E5%8D%95%E4%B8%8E%E6%97%B6%E9%97%B4%E7%BA%BF%E6%8E%A7%E5%88%B6-%E5%B1%8F%E8%94%BD%E7%83%AD%E6%90%9C) and select the installation option. Alternatively, open the [raw userscript on GitHub](https://raw.githubusercontent.com/DanielZenFlow/Pynseq-Weibo/main/pynseq-for-weibo.user.js).
3. Confirm the installation in the userscript manager.
4. Open or refresh the desktop Weibo website and complete the onboarding flow.

Project page: [Pynseq for Weibo on Greasy Fork](https://greasyfork.org/en/scripts/564839-pynseq-for-weibo-%E5%B1%8F%E5%BA%8F-%E5%BE%AE%E5%8D%9A-%E6%9C%AC%E5%9C%B0%E5%B1%8F%E8%94%BD%E5%90%8D%E5%8D%95%E4%B8%8E%E6%97%B6%E9%97%B4%E7%BA%BF%E6%8E%A7%E5%88%B6-%E5%B1%8F%E8%94%BD%E7%83%AD%E6%90%9C)

## Usage

### Add a user

- Right-click an identifiable username and select a local blocking action.
- Select the action that also adds the user to Weibo's official blocklist when account-level blocking is required.
- On `s.weibo.com`, the combined action temporarily opens a task-bearing `weibo.com` relay page so the official blocklist request runs under the main-site origin. The relay page is exempt from the default “Latest Weibo” route switch.
- Enter one or more UIDs under “Settings → Local Blocklist”.

### Configure filtering

Open “Settings → Blocking” to control filtering for:

- Posts and reposts
- Comments and replies
- Search results
- User cards and recommendations
- Repost and like lists

Users remain visible on following and follower relationship pages.

### Synchronize Weibo's official blocklist

Open “Settings → Weibo Blocklist Management” and choose:

- Sync new: the official blocklist lists the most recently blocked users first. The script reads from page 1, first covering as many pages as the official total has grown since the last sync, then stops at the first page whose UIDs are all in the local blocklist, up to 50 pages. It also runs automatically, up to 3 pages, whenever a Weibo page opens.
- Full sync: reads every page. A large blocklist takes several minutes; keep the tab in the foreground. Progress is saved every 10 pages. After a cancellation, a closed page, or a failed request, the button reads “Continue full sync” and resumes from the interrupted page. When Weibo rate-limits requests, the script retries at increasing intervals and pauses after repeated failures, keeping the pages already read.

Weibo occasionally returns a page that is offset from its neighbors. When a full sync finishes with fewer UIDs than the official total, it re-reads the pages where anomalies appeared, plus their neighbors, to fill the gaps. When a full sync reads every page and the number of UIDs read matches the official total, UIDs that were unblocked on Weibo are removed from the local blocklist. UIDs blocked only locally and never seen in the official blocklist are kept. If the counts differ, for example because the blocklist changed during the sync, nothing is removed. The completion message lists the official total, the numbers added and removed, and the number blocked only locally.

UIDs removed from the local blocklist stay removed during the automatic sync on page load; a manual sync adds UIDs that are on the official blocklist back to the local blocklist. Synchronization never modifies Weibo's official blocklist.

### Back up and restore

Export the blocklist under “Settings → Local Blocklist”. The exported JSON file can be kept as a backup or imported into another browser using merge or replace mode.

## Local data and privacy

- The local blocklist, settings, and reminder state are stored in the userscript storage of the current browser.
- The project does not automatically upload the local blocklist to an external server.
- On startup, the script reads up to the 3 most recent pages of the official Weibo blocklist and merges them into the local list; manual synchronization reads according to the option you select. It writes to the official Weibo blocklist only when you explicitly choose the combined official-block action.
- Local data is not automatically synchronized across browsers, browser profiles, or devices.
- Export the blocklist before clearing browser data, removing the userscript, or resetting userscript storage.

## Known limitations

- Filtering depends on user identifiers, API data, and page structures exposed by the current Weibo website. Some features may require updates after Weibo changes its interface.
- Content may remain visible until identity data becomes available when a page has not finished loading or does not expose an identifiable UID.
- “Latest Weibo” is not the Weibo home root route. Once the script has recorded that tab’s address, the home page opens there directly; the first visit still switches after the feed tabs render. When you return to the home page from another page, Weibo loads “All Following” first; the script hides the timeline list until the switch completes, so the list area stays blank briefly.
- Weibo uses dynamic loading and virtualized lists. The script can only process content received and identified by the current browser.
- Local blocking is not the same as Weibo's official blocking feature. The official account blocklist changes only when the corresponding action is explicitly selected.
- Official blocklist synchronization depends on Weibo endpoint availability, pagination data, and rate limits. Browsers throttle timers in background tabs and may freeze them, so a full sync in a background tab slows down or pauses.
- Removing unblocked UIDs relies on the script's record of UIDs seen in the official blocklist. The record starts with 3.0.0, so the first full sync after upgrading only builds it; later full syncs remove unblocked UIDs.

## Support

- [Install or update Pynseq for Weibo on Greasy Fork](https://greasyfork.org/en/scripts/564839-pynseq-for-weibo-%E5%B1%8F%E5%BA%8F-%E5%BE%AE%E5%8D%9A-%E6%9C%AC%E5%9C%B0%E5%B1%8F%E8%94%BD%E5%90%8D%E5%8D%95%E4%B8%8E%E6%97%B6%E9%97%B4%E7%BA%BF%E6%8E%A7%E5%88%B6-%E5%B1%8F%E8%94%BD%E7%83%AD%E6%90%9C)
- [Star Pynseq for Weibo on GitHub](https://github.com/DanielZenFlow/Pynseq-Weibo)
- [Support DanielZenFlow on Buy Me a Coffee](https://buymeacoffee.com/danielzenflow)
- [Report a bug or request a feature](https://github.com/DanielZenFlow/Pynseq-Weibo/issues)

## License

This project is available under the [MIT License](https://opensource.org/license/mit/).

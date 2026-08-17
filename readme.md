# Pynseq for Weibo｜屏序·微博

> 屏其不欲见者，复其应有之序。

**Pynseq for Weibo 是由 Daniel Zenflow 开发的微博桌面端本地内容过滤与时间线控制工具。** 它允许你建立独立于微博账户的本地屏蔽名单，在微博、转发、评论、搜索结果、用户卡片和互动列表中持续隐藏名单用户的可识别内容；同时提供最新微博时间线切换、广告过滤、导航与侧栏整理，以及新浪微博官方黑名单同步工具。名单与设置保存在当前浏览器中，由用户自行管理。

[English](#english)

## 功能

- 可将微博首页默认切换到按时间顺序排列的「最新微博」，也可随时恢复原生「全部关注」时间线。
- 隐藏本地屏蔽名单用户发布的微博、转发、评论和回复。
- 在搜索结果、用户卡片、推荐项、转发用户列表和点赞用户列表中过滤名单用户。
- 在可识别的用户名上提供右键菜单，可只加入本地屏蔽名单，或同时加入新浪微博官方黑名单。
- 支持分别控制微博与转发、评论与回复、搜索结果、用户卡片与推荐项、互动列表五类屏蔽范围。
- 支持独立隐藏时间线中的“你可能感兴趣的内容”、广告与推广微博、搜索页相关用户、微博热搜及多个导航和侧栏模块。
- 提供五步首次设置向导、右下角快捷设置按钮，以及 Tampermonkey「设置」「关于」菜单。
- 支持搜索、分页、手动添加、移除、清空、导入和导出本地屏蔽名单。
- 支持增量同步、同步前五页和完整同步新浪微博官方黑名单。
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

- 增量同步：读取并合并官方黑名单第一页。
- 同步前五页：读取并合并前五页。
- 完整同步：遍历并合并全部可读取分页。

同步功能会把新浪微博官方黑名单中的 UID 合并到本地屏蔽名单，不会自动从官方黑名单移除用户。

### 备份与恢复

在“设置 → 本地屏蔽名单”中导出名单文件。导出的 JSON 文件可用于备份，也可在另一浏览器中合并导入或替换导入。

## 本地数据与隐私

- 本地屏蔽名单、设置和提醒状态保存在当前浏览器的用户脚本存储空间中。
- 本地名单不会由本项目自动上传到外部服务器。
- 脚本启动时会读取新浪微博官方黑名单第一页以增量合并本地名单；手动同步时会按所选范围继续读取。只有明确选择“同时加入新浪微博官方黑名单”时，脚本才会写入微博账户的官方黑名单。
- 本地数据不会自动同步到其他浏览器、浏览器配置文件或设备。
- 清除浏览器数据、删除用户脚本或重置用户脚本存储前，建议先导出名单。

## 已知限制

- 过滤依赖微博网页当前提供的用户标识、接口数据和页面结构；微博更新页面后，部分功能可能需要适配。
- 页面尚未加载完成或没有提供可识别 UID 时，相关内容可能需要等待数据加载后才能被过滤。
- 微博使用动态加载和虚拟列表，脚本只能处理当前浏览器已经接收并能够识别的内容。
- 本地屏蔽不等同于新浪微博官方拉黑；只有明确选择官方黑名单操作时，才会修改微博账户中的官方黑名单。
- 官方黑名单同步受微博接口状态、分页数据和访问频率限制。

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
- Includes a five-step onboarding flow, a quick-settings button, and “Settings” and “About” Tampermonkey menu entries.
- Supports searching, pagination, manual entry, removal, clearing, importing, and exporting of the local blocklist.
- Synchronizes the first page, first five pages, or all readable pages of Weibo's official blocklist.
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

Open “Settings → Weibo Blocklist Management” to synchronize the first page, the first five pages, or all readable pages. Synchronization merges official blocklist UIDs into the local blocklist and does not automatically remove users from Weibo's official blocklist.

### Back up and restore

Export the blocklist under “Settings → Local Blocklist”. The exported JSON file can be kept as a backup or imported into another browser using merge or replace mode.

## Local data and privacy

- The local blocklist, settings, and reminder state are stored in the userscript storage of the current browser.
- The project does not automatically upload the local blocklist to an external server.
- On startup, the script reads the first page of the official Weibo blocklist and merges it into the local list; manual synchronization reads the range you select. It writes to the official Weibo blocklist only when you explicitly choose the combined official-block action.
- Local data is not automatically synchronized across browsers, browser profiles, or devices.
- Export the blocklist before clearing browser data, removing the userscript, or resetting userscript storage.

## Known limitations

- Filtering depends on user identifiers, API data, and page structures exposed by the current Weibo website. Some features may require updates after Weibo changes its interface.
- Content may remain visible until identity data becomes available when a page has not finished loading or does not expose an identifiable UID.
- Weibo uses dynamic loading and virtualized lists. The script can only process content received and identified by the current browser.
- Local blocking is not the same as Weibo's official blocking feature. The official account blocklist changes only when the corresponding action is explicitly selected.
- Official blocklist synchronization depends on Weibo endpoint availability, pagination data, and rate limits.

## Support

- [Install or update Pynseq for Weibo on Greasy Fork](https://greasyfork.org/en/scripts/564839-pynseq-for-weibo-%E5%B1%8F%E5%BA%8F-%E5%BE%AE%E5%8D%9A-%E6%9C%AC%E5%9C%B0%E5%B1%8F%E8%94%BD%E5%90%8D%E5%8D%95%E4%B8%8E%E6%97%B6%E9%97%B4%E7%BA%BF%E6%8E%A7%E5%88%B6-%E5%B1%8F%E8%94%BD%E7%83%AD%E6%90%9C)
- [Star Pynseq for Weibo on GitHub](https://github.com/DanielZenFlow/Pynseq-Weibo)
- [Support DanielZenFlow on Buy Me a Coffee](https://buymeacoffee.com/danielzenflow)
- [Report a bug or request a feature](https://github.com/DanielZenFlow/Pynseq-Weibo/issues)

## License

This project is available under the [MIT License](https://opensource.org/license/mit/).

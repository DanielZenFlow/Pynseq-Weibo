// ==UserScript==
// @sandbox      raw
// @name         Pynseq for Weibo｜屏序·微博
// @name:zh-CN   Pynseq for Weibo｜屏序·微博
// @name:en      Pynseq for Weibo｜屏序·微博
// @namespace    https://github.com/DanielZenFlow/Pynseq-Weibo
// @version      2.4.51
// @description  模仿早期 Twitter 的时间线展示，支持默认进入最新微博、按本地屏蔽列表隐藏内容、过滤广告、精简导航和侧栏，并提供新浪微博官方黑名单同步及本地列表管理。
// @description:en Restore a chronological Weibo timeline, locally block unwanted users, filter ads, simplify navigation, and manage official Weibo blocklist synchronization.
// @author       DanielZenFlow
// @license      MIT
// @homepage     https://github.com/DanielZenFlow/Pynseq-Weibo
// @supportURL   https://github.com/DanielZenFlow/Pynseq-Weibo/issues
// @icon         https://raw.githubusercontent.com/DanielZenFlow/Pynseq-Weibo/c5e75843ef29f16fdbd1a1a22f11dc9206be184f/pynseq-for-weibo-icon.png
// @icon64       https://raw.githubusercontent.com/DanielZenFlow/Pynseq-Weibo/c5e75843ef29f16fdbd1a1a22f11dc9206be184f/pynseq-for-weibo-icon.png
// @match        https://weibo.com/*
// @match        https://www.weibo.com/*
// @match        https://weibo.com/set/*
// @match        https://s.weibo.com/*
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        GM_openInTab
// @run-at       document-start
// ==/UserScript==

/*
 * Pynseq for Weibo｜屏序·微博
 * Copyright (c) 2025 DanielZenFlow
 * Licensed under MIT License
 * GitHub: [DanielZenFlow/Pynseq-Weibo](https://github.com/DanielZenFlow/Pynseq-Weibo)
 */

(function () {
  'use strict';

  const WB_INTERNAL = Object.create(null);
  const THROTTLE_MS = 350; // 新浪微博官方黑名单分页请求间隔（毫秒）
  const SCRIPT_NAME = 'Pynseq for Weibo｜屏序·微博';
  const SCRIPT_VERSION = '2.4.51';
  const GITHUB_URL = 'https://github.com/DanielZenFlow/Pynseq-Weibo';
  const BUY_ME_A_COFFEE_URL = 'https://buymeacoffee.com/danielzenflow';
  const ONBOARDING_DONE_KEY = 'pynseq_for_weibo_onboarding_done_v1';
  const STAR_REMINDER_DISABLED_KEY = 'WB_FULL_STAR_REMINDER_DISABLED';
  const WB_CONFIG_KEY = 'cfg';
  const WB_CONFIG_BACKUP_KEY = 'cfg_recovery_backup';
  const WB_CONFIG_SCHEMA_VERSION = 1;
  const WB_CONFIG_DEFAULTS = Object.freeze({
    hideHotSearch: true,
    hideSuggestedPeople: true,
    hideFollowRecommendations: true,
    hideCommonFunctions: true,
    hideFanGroups: true,
    hideFrequentSuperTopics: true,
    hideNavVideo: false,
    hideNavRecommend: false,
    hideNavGame: true,
    defaultLatestTimeline: true,
    hideSearchRelatedUsers: true,
    hideBlacklistPosts: true,
    hideBlacklistComments: true,
    hideBlacklistSearchResults: true,
    hideBlacklistUserCards: true,
    hideBlacklistInteractions: true,
    confirmBeforeBlocking: true,
    hideAds: true,
    hideAdsFromFollowing: true,
    hideAdsFromStrangers: true,
    hideAdsFromSelf: false,
    hideTimelineRecommendations: true,
    showSettingsButton: true,
  });
  const WB_CONFIG_BOOLEAN_KEYS = Object.keys(WB_CONFIG_DEFAULTS);
  const WB_RUNTIME_METRICS = {
    config: {
      schemaVersion: WB_CONFIG_SCHEMA_VERSION,
      migrations: 0,
      recoveries: 0,
      futureSchema: null,
    },
    relay: {
      active: 0,
      requests: 0,
      successes: 0,
      failures: 0,
      timeouts: 0,
      transport: 'value-change-listener',
    },
  };
  let wbConfigCacheSignature = null;
  let wbConfigCacheValue = null;

  function isTrustedUserEvent(event) {
    return !!event && event.isTrusted === true;
  }

  WB_INTERNAL.isTrustedUserEvent = isTrustedUserEvent;

  function isUnsafeObjectKey(key) {
    return key === '__proto__' || key === 'prototype' || key === 'constructor';
  }

  function defineSafeEnumerableValue(target, key, value) {
    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    });
  }

  function copySafeEnumerableData(source) {
    const target = {};
    if (!source || typeof source !== 'object') return target;
    Object.keys(source).forEach((key) => {
      if (isUnsafeObjectKey(key)) return;
      const descriptor = Object.getOwnPropertyDescriptor(source, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        return;
      }
      defineSafeEnumerableValue(target, key, descriptor.value);
    });
    return target;
  }

  function normalizeStoredConfig(rawCfg) {
    const raw =
      rawCfg && typeof rawCfg === 'object' && !Array.isArray(rawCfg)
        ? rawCfg
        : {};
    const normalized = copySafeEnumerableData(raw);
    const storedSchema = Number(raw.schemaVersion);

    if (raw.hideNavVideoRecommend === true) {
      if (raw.hideNavVideo === undefined) normalized.hideNavVideo = true;
      if (raw.hideNavRecommend === undefined) normalized.hideNavRecommend = true;
    }
    delete normalized.hideNavVideoRecommend;

    WB_CONFIG_BOOLEAN_KEYS.forEach((key) => {
      normalized[key] =
        typeof normalized[key] === 'boolean'
          ? normalized[key]
          : WB_CONFIG_DEFAULTS[key];
    });
    normalized.schemaVersion =
      Number.isInteger(storedSchema) &&
      storedSchema > WB_CONFIG_SCHEMA_VERSION
        ? storedSchema
        : WB_CONFIG_SCHEMA_VERSION;
    return normalized;
  }

  function readStoredConfig() {
    const getValue =
      typeof GM_getValue === 'function' ? GM_getValue : () => '{}';
    const setValue =
      typeof GM_setValue === 'function' ? GM_setValue : () => {};
    const stored = getValue(WB_CONFIG_KEY, '{}');
    let storedSignature = '';
    try {
      storedSignature =
        typeof stored === 'string' ? stored : JSON.stringify(stored);
    } catch {
      storedSignature = String(stored);
    }
    if (
      wbConfigCacheValue &&
      storedSignature === wbConfigCacheSignature
    ) {
      return { ...wbConfigCacheValue };
    }
    let parsed = {};
    let recovered = false;

    try {
      parsed =
        typeof stored === 'string'
          ? JSON.parse(stored || '{}')
          : stored && typeof stored === 'object'
            ? stored
            : {};
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
        throw new TypeError('配置根节点必须是对象');
      }
    } catch {
      recovered = true;
      WB_RUNTIME_METRICS.config.recoveries++;
      setValue(WB_CONFIG_BACKUP_KEY, {
        value: stored,
        recoveredAt: Date.now(),
      });
      parsed = {};
    }

    const storedSchema = Number(parsed.schemaVersion) || 0;
    const normalized = normalizeStoredConfig(parsed);
    if (storedSchema > WB_CONFIG_SCHEMA_VERSION) {
      WB_RUNTIME_METRICS.config.futureSchema = storedSchema;
      wbConfigCacheSignature = storedSignature;
      wbConfigCacheValue = normalized;
      return { ...normalized };
    }

    const serialized = JSON.stringify(normalized);
    const needsMigration =
      recovered ||
      storedSchema !== WB_CONFIG_SCHEMA_VERSION ||
      serialized !== JSON.stringify(parsed);
    if (needsMigration) {
      setValue(WB_CONFIG_KEY, serialized);
      WB_RUNTIME_METRICS.config.migrations++;
    }
    wbConfigCacheSignature = needsMigration ? serialized : storedSignature;
    wbConfigCacheValue = normalized;
    return { ...normalized };
  }

  function writeStoredConfig(cfg) {
    const normalized = normalizeStoredConfig(cfg);
    const serialized = JSON.stringify(normalized);
    if (typeof GM_setValue === 'function') {
      GM_setValue(WB_CONFIG_KEY, serialized);
    }
    wbConfigCacheSignature = serialized;
    wbConfigCacheValue = normalized;
    return { ...normalized };
  }

  WB_INTERNAL.config = Object.freeze({
    key: WB_CONFIG_KEY,
    schemaVersion: WB_CONFIG_SCHEMA_VERSION,
    defaults: WB_CONFIG_DEFAULTS,
    normalize: normalizeStoredConfig,
    read: readStoredConfig,
    write: writeStoredConfig,
  });

  const WB_DOM_RUNTIME = (() => {
    const mutationSubscribers = new Map();
    const routeSubscribers = new Map();
    const scheduledTasks = new Map();
    const stats = {
      mutationBatches: 0,
      mutationRecords: 0,
      mutationCallbacks: 0,
      routeChanges: 0,
      scheduledTasks: 0,
      completedTasks: 0,
    };
    let observer = null;
    let attachTimer = 0;

    const reportSubscriberError = (channel, error) => {
      console.warn(`[WB-BL] DOM 调度器订阅回调失败：${channel}`, error);
    };

    function ensureObserver() {
      if (observer || typeof MutationObserver !== 'function') return;
      const root = document.documentElement;
      if (!root) {
        if (!attachTimer) {
          attachTimer = setTimeout(() => {
            attachTimer = 0;
            ensureObserver();
          }, 25);
        }
        return;
      }
      observer = new MutationObserver((records) => {
        stats.mutationBatches++;
        stats.mutationRecords += records.length;
        mutationSubscribers.forEach((callback, channel) => {
          try {
            callback(records);
            stats.mutationCallbacks++;
          } catch (error) {
            reportSubscriberError(channel, error);
          }
        });
      });
      observer.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: [
          'style',
          'class',
          'href',
          'data-user-id',
          'data-user-card',
          'data-usercard',
          'data-usercard-mid',
          'data-uid',
          'uid',
          'usercard',
          'nick-name',
          'title',
          'aria-label',
        ],
      });
    }

    function subscribeMutations(channel, callback) {
      mutationSubscribers.set(channel, callback);
      ensureObserver();
      return () => mutationSubscribers.delete(channel);
    }

    function collectAddedRoots(records) {
      const candidates = new Set();
      records.forEach((record) => {
        record.addedNodes?.forEach((node) => {
          if (node?.nodeType === 1) candidates.add(node);
        });
      });
      return Array.from(candidates).filter((node) => {
        let parent = node.parentElement;
        while (parent) {
          if (candidates.has(parent)) return false;
          parent = parent.parentElement;
        }
        return true;
      });
    }

    function emitRouteChange(reason) {
      stats.routeChanges++;
      routeSubscribers.forEach((callback, channel) => {
        try {
          callback(reason);
        } catch (error) {
          reportSubscriberError(channel, error);
        }
      });
    }

    function subscribeRoute(channel, callback) {
      routeSubscribers.set(channel, callback);
      return () => routeSubscribers.delete(channel);
    }

    function schedule(channel, callback, delay = 0) {
      const normalizedDelay = Math.max(0, Number(delay) || 0);
      const dueAt = Date.now() + normalizedDelay;
      const current = scheduledTasks.get(channel);
      if (current) {
        current.callback = callback;
        if (dueAt >= current.dueAt) return;
        clearTimeout(current.timer);
      }

      const task = {
        callback,
        dueAt,
        timer: 0,
      };
      task.timer = setTimeout(() => {
        scheduledTasks.delete(channel);
        stats.completedTasks++;
        try {
          task.callback();
        } catch (error) {
          reportSubscriberError(channel, error);
        }
      }, normalizedDelay);
      scheduledTasks.set(channel, task);
      stats.scheduledTasks++;
    }

    function cancel(channel) {
      const task = scheduledTasks.get(channel);
      if (!task) return false;
      clearTimeout(task.timer);
      scheduledTasks.delete(channel);
      return true;
    }

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    history.pushState = function (...args) {
      const result = Reflect.apply(originalPushState, this, args);
      emitRouteChange('pushState');
      return result;
    };
    history.replaceState = function (...args) {
      const result = Reflect.apply(originalReplaceState, this, args);
      emitRouteChange('replaceState');
      return result;
    };
    window.addEventListener('popstate', () => emitRouteChange('popstate'));
    window.addEventListener('hashchange', () => emitRouteChange('hashchange'));
    window.addEventListener(
      'beforeunload',
      () => {
        observer?.disconnect();
        scheduledTasks.forEach((task) => clearTimeout(task.timer));
        scheduledTasks.clear();
      },
      { once: true }
    );

    return Object.freeze({
      subscribeMutations,
      subscribeRoute,
      collectAddedRoots,
      schedule,
      cancel,
      getStats: () => ({
        ...stats,
        mutationSubscribers: mutationSubscribers.size,
        routeSubscribers: routeSubscribers.size,
        pendingTasks: scheduledTasks.size,
      }),
    });
  })();

  WB_INTERNAL.dom = WB_DOM_RUNTIME;

  (function () {
  'use strict';

  // === GM_* 接口封装 ===
  const _GM_getValue =
    typeof GM_getValue !== 'undefined' ? GM_getValue : () => {};
  const _GM_setValue =
    typeof GM_setValue !== 'undefined' ? GM_setValue : () => {};
  const _GM_deleteValue =
    typeof GM_deleteValue !== 'undefined' ? GM_deleteValue : null;
  const _GM_addValueChangeListener =
    typeof GM_addValueChangeListener !== 'undefined'
      ? GM_addValueChangeListener
      : null;
  const _GM_removeValueChangeListener =
    typeof GM_removeValueChangeListener !== 'undefined'
      ? GM_removeValueChangeListener
      : null;
  const _GM_openInTab =
    typeof GM_openInTab !== 'undefined' ? GM_openInTab : null;

  let centeredConfirmQueue = Promise.resolve();

  function ensureCenteredConfirmStyles() {
    if (document.getElementById('wb-retro-confirm-style')) return;
    const style = document.createElement('style');
    style.id = 'wb-retro-confirm-style';
    style.textContent = `
      .wb-retro-confirm-overlay {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        box-sizing: border-box;
        background: rgba(30, 25, 21, .46);
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .wb-retro-confirm-dialog {
        width: min(430px, calc(100vw - 32px));
        box-sizing: border-box;
        padding: 24px;
        color-scheme: light;
        color: #27231f;
        background: #f7f3ee;
        border: 1px solid #cfc5bb;
        border-radius: 0;
        box-shadow: 0 18px 60px rgba(45, 35, 28, .3);
      }
      .wb-retro-confirm-title {
        margin: 0 0 10px;
        color: #655d56;
        font-size: 19px;
        line-height: 1.4;
        font-weight: 700;
      }
      .wb-retro-confirm-message {
        margin: 0;
        color: #655d56;
        font-size: 13px;
        line-height: 1.6;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        max-height: min(58vh, 460px);
        padding-right: 4px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: #c8b9aa transparent;
      }
      .wb-retro-confirm-message::-webkit-scrollbar {
        width: 8px;
      }
      .wb-retro-confirm-message::-webkit-scrollbar-track {
        background: transparent;
      }
      .wb-retro-confirm-message::-webkit-scrollbar-thumb {
        background: #c8b9aa;
        border: 2px solid transparent;
        border-radius: 999px;
        background-clip: padding-box;
      }
      .wb-retro-confirm-link {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        margin-top: 14px;
        color: #a84e34;
        font-size: 13px;
        line-height: 1.4;
        text-decoration: none;
      }
      .wb-retro-confirm-link:hover {
        text-decoration: underline;
      }
      .wb-retro-confirm-actions {
        display: flex;
        justify-content: flex-end;
        gap: 9px;
        margin-top: 22px;
      }
      .wb-retro-confirm-button {
        padding: 8px 12px;
        border: 1px solid #cfc5bb;
        border-radius: 0;
        color: #2d2824;
        background: #eee7df;
        font: 500 13px/1.3 inherit;
        cursor: pointer;
      }
      .wb-retro-confirm-button:hover {
        background: #e4dad0;
      }
      .wb-retro-confirm-button.is-primary {
        border-color: #b85f43;
        color: #fff;
        background: #c96849;
      }
      .wb-retro-confirm-button.is-danger {
        border-color: #c89483;
        color: #a43f2e;
        background: #eee7df;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function createCenteredConfirm(options = {}) {
    ensureCenteredConfirmStyles();
    const title = String(options.title || '请确认');
    const message = String(options.message || '');
    const confirmText = String(options.confirmText || '确定');
    const cancelText = String(options.cancelText || '取消');

    return new Promise((resolve) => {
      const previousFocus =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      const overlay = document.createElement('div');
      overlay.className = 'wb-retro-confirm-overlay';

      const dialog = document.createElement('div');
      dialog.className = 'wb-retro-confirm-dialog';
      dialog.setAttribute('role', 'alertdialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.setAttribute('aria-labelledby', 'wb-retro-confirm-title');
      dialog.setAttribute('aria-describedby', 'wb-retro-confirm-message');

      const titleElement = document.createElement('h2');
      titleElement.id = 'wb-retro-confirm-title';
      titleElement.className = 'wb-retro-confirm-title';
      titleElement.textContent = title;

      const messageElement = document.createElement('p');
      messageElement.id = 'wb-retro-confirm-message';
      messageElement.className = 'wb-retro-confirm-message';
      messageElement.textContent = message;

      let linkElement = null;
      if (options.linkText && options.linkURL) {
        linkElement = document.createElement('a');
        linkElement.className = 'wb-retro-confirm-link';
        linkElement.href = String(options.linkURL);
        linkElement.target = '_blank';
        linkElement.rel = 'noopener noreferrer';
        linkElement.textContent = `${String(options.linkText)} ↗`;
      }

      const actions = document.createElement('div');
      actions.className = 'wb-retro-confirm-actions';
      const cancelButton = document.createElement('button');
      cancelButton.type = 'button';
      cancelButton.className = 'wb-retro-confirm-button';
      cancelButton.textContent = cancelText;
      const confirmButton = document.createElement('button');
      confirmButton.type = 'button';
      confirmButton.className = `wb-retro-confirm-button ${
        options.danger ? 'is-danger' : 'is-primary'
      }`;
      confirmButton.textContent = confirmText;
      if (!options.hideCancel) actions.appendChild(cancelButton);
      actions.appendChild(confirmButton);
      dialog.append(titleElement, messageElement);
      if (linkElement) dialog.appendChild(linkElement);
      dialog.appendChild(actions);
      overlay.appendChild(dialog);

      let settled = false;
      const finish = (confirmed) => {
        if (settled) return;
        settled = true;
        overlay.remove();
        if (previousFocus?.isConnected) previousFocus.focus();
        resolve(confirmed);
      };

      cancelButton.addEventListener('click', (event) => {
        if (!isTrustedUserEvent(event)) return;
        finish(false);
      });
      confirmButton.addEventListener('click', (event) => {
        if (!isTrustedUserEvent(event)) return;
        finish(true);
      });
      overlay.addEventListener('click', (event) => {
        if (!isTrustedUserEvent(event)) return;
        if (event.target === overlay) finish(false);
      });
      overlay.addEventListener('keydown', (event) => {
        if (!isTrustedUserEvent(event)) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          finish(false);
          return;
        }
        if (event.key !== 'Tab') return;
        const buttons = options.hideCancel
          ? [confirmButton]
          : [cancelButton, confirmButton];
        const currentIndex = buttons.indexOf(document.activeElement);
        const direction = event.shiftKey ? -1 : 1;
        const target =
          buttons[
            (Math.max(0, currentIndex) + direction + buttons.length) %
              buttons.length
          ];
        event.preventDefault();
        target.focus();
      });

      (document.body || document.documentElement).appendChild(overlay);
      (options.hideCancel ? confirmButton : cancelButton).focus();
    });
  }

  function showCenteredConfirm(options = {}) {
    const run = () => createCenteredConfirm(options);
    const result = centeredConfirmQueue.then(run, run);
    centeredConfirmQueue = result.catch(() => false);
    return result;
  }

  WB_INTERNAL.confirm = showCenteredConfirm;

  function ensureNotificationStyles() {
    if (document.getElementById('wb-retro-notice-style')) return;
    const style = document.createElement('style');
    style.id = 'wb-retro-notice-style';
    style.textContent = `
      #wb-retro-toast {
        position: fixed;
        left: 50%;
        top: 50%;
        bottom: auto;
        z-index: 2147483647;
        box-sizing: border-box;
        width: min(215px, calc(100vw - 32px));
        padding: 12px 14px;
        transform: translate(-50%, -50%);
        border: 1px solid #cfc5bb;
        border-radius: 0;
        background: #f7f3ee;
        box-shadow: 0 10px 34px rgba(45, 35, 28, .24);
        color: #27231f;
        font: 14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        text-align: center;
        white-space: pre-line;
        overflow-wrap: anywhere;
        pointer-events: none;
        opacity: 0;
        transition: opacity .16s ease;
      }
      #wb-retro-toast.is-visible { opacity: 1; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function showNotification(message, options = {}) {
    const mount = () => {
      ensureNotificationStyles();
      let toast = document.getElementById('wb-retro-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'wb-retro-toast';
        toast.setAttribute('role', options.type === 'error' ? 'alert' : 'status');
        toast.setAttribute('aria-live', 'polite');
        (document.body || document.documentElement).appendChild(toast);
      }
      toast.textContent = String(message || '');
      toast.setAttribute('role', options.type === 'error' ? 'alert' : 'status');
      toast.classList.add('is-visible');
      clearTimeout(showNotification.timer);
      const duration = Math.max(1500, Number(options.duration) || 2400);
      showNotification.timer = setTimeout(
        () => toast?.classList.remove('is-visible'),
        duration
      );
      return toast;
    };

    if (document.documentElement) return mount();
    setTimeout(mount, 0);
    return null;
  }

  WB_INTERNAL.notify = showNotification;

  // === Star提醒配置 ===
  const STAR_CONFIG = {
    STAR_REMINDER_DISABLED_KEY,
    LAST_STAR_REMINDER_TIME_KEY: 'WB_FULL_LAST_STAR_REMINDER_TIME',
    STAR_REMINDER_STAGE_KEY: 'WB_FULL_STAR_REMINDER_STAGE',
    // Star提醒间隔：首次安装 → 7天后 → 30天后 → 90天后 → 不再提醒
    STAR_REMINDER_INTERVALS: [0, 7, 30, 90], // 天数
  };

  // === 智能打开链接函数 ===
  function openGitHub() {
    const url = GITHUB_URL;

    // 优先使用油猴的专用API（不会被拦截）
    if (_GM_openInTab) {
      _GM_openInTab(url, { active: true });
      return;
    }

    // 降级到普通弹窗
    const newWindow = window.open(url, '_blank', 'noopener,noreferrer');
    try {
      if (newWindow) newWindow.opener = null;
    } catch {}

    // 检测是否被拦截
    if (
      !newWindow ||
      newWindow.closed ||
      typeof newWindow.closed === 'undefined'
    ) {
      // 延迟检测，有些浏览器需要时间
      setTimeout(() => {
        if (!newWindow || newWindow.closed) {
          showNotification(
            '🚫 弹窗被浏览器拦截了！\n\n' +
              '📋 GitHub链接：' +
              url +
              '\n\n' +
              '💡 解决方法：\n' +
              '1. 复制上面的链接到新标签页\n' +
              '2. 或者允许此网站的弹窗权限',
            { type: 'error', duration: 10000 }
          );
        }
      }, 100);
    }
  }

  // === Star提醒检查（时间间隔策略） ===
  function checkStarReminder() {
    if (!canUseSettingApi()) return;

    const isDisabled = _GM_getValue(
      STAR_CONFIG.STAR_REMINDER_DISABLED_KEY,
      false
    );
    if (isDisabled) return;

    const now = Date.now();
    const lastReminderTime = _GM_getValue(
      STAR_CONFIG.LAST_STAR_REMINDER_TIME_KEY,
      0
    );
    const storedStage = _GM_getValue(
      STAR_CONFIG.STAR_REMINDER_STAGE_KEY,
      null
    );
    const parsedStage = Number(storedStage);
    const currentStage =
      storedStage === null || storedStage === undefined
        ? lastReminderTime === 0
          ? 0
          : 1
        : Number.isInteger(parsedStage)
          ? Math.max(0, parsedStage)
          : 0;
    if (currentStage >= STAR_CONFIG.STAR_REMINDER_INTERVALS.length) {
      _GM_setValue(STAR_CONFIG.STAR_REMINDER_DISABLED_KEY, true);
      return;
    }
    const daysSinceLastReminder =
      (now - lastReminderTime) / (1000 * 60 * 60 * 24);
    const requiredDays = STAR_CONFIG.STAR_REMINDER_INTERVALS[currentStage];
    const shouldRemind =
      lastReminderTime === 0 || daysSinceLastReminder >= requiredDays;

    if (shouldRemind) {
      setTimeout(async () => {
        if (
          _GM_getValue(STAR_CONFIG.STAR_REMINDER_DISABLED_KEY, false)
        ) {
          return;
        }
        await showStarReminder(currentStage);
        _GM_setValue(STAR_CONFIG.LAST_STAR_REMINDER_TIME_KEY, now);
        const nextStage = currentStage + 1;
        _GM_setValue(STAR_CONFIG.STAR_REMINDER_STAGE_KEY, nextStage);
        if (nextStage >= STAR_CONFIG.STAR_REMINDER_INTERVALS.length) {
          _GM_setValue(STAR_CONFIG.STAR_REMINDER_DISABLED_KEY, true);
        }
      }, 3000); // 3秒后弹出
    }
  }

  // === 显示Star提醒 ===
  async function showStarReminder(intervalIndex) {
    const isFirstTime = intervalIndex === 0;
    const message = isFirstTime
      ? `🎉 感谢使用 ${SCRIPT_NAME}！\n\n如果这个工具对您有帮助，请考虑给项目点个 ⭐ Star！`
      : '⭐ 再次感谢使用我们的工具！\n\n如果觉得有用，请考虑给项目点个 Star 支持一下！';

    const result = await showCenteredConfirm({
      title: '支持项目',
      message:
        `${message}\n\n` +
        `点击“打开 GitHub”访问项目页面；点击“${
          isFirstTime ? '稍后提醒' : '不再提醒'
        }”关闭。`,
      confirmText: '打开 GitHub',
      cancelText: isFirstTime ? '稍后提醒' : '不再提醒',
    });

    if (result) {
      openGitHub();

      // 30秒后询问是否已给star
      setTimeout(async () => {
        const hasStarred = await showCenteredConfirm({
          title: '是否已经 Star？',
          message:
            '感谢访问 GitHub 项目页面。\n\n如果已经给了 ⭐ Star，可以关闭后续提醒。',
          confirmText: '已 Star，不再提醒',
          cancelText: '稍后提醒',
        });

        if (hasStarred) {
          _GM_setValue(STAR_CONFIG.STAR_REMINDER_DISABLED_KEY, true);
          showNotification('🎉 感谢您的 Star！我们将不再显示提醒。', {
            type: 'success',
          });
        }
      }, 30000);
    } else if (!isFirstTime) {
      // 非首次提醒，用户选择取消就不再提醒
      _GM_setValue(STAR_CONFIG.STAR_REMINDER_DISABLED_KEY, true);
    }
  }

  // 读取时间线默认设置（不再创建油猴菜单，统一在设置面板管理）
  function getTimelineDefault() {
    return WB_INTERNAL.config.read().defaultLatestTimeline !== false;
  }
  const timelineDefault = {
    get value() {
      return getTimelineDefault();
    },
  };

  // === 默认切换到"最新微博"分栏 ===
  // 只同步 Tab 与路由，不拦截"全部关注"接口。这样用户临时切回
  // "全部关注"时仍能使用微博原生分页，不会收到伪造的空响应。
  const TIMELINE_TAB_TITLES = Object.freeze([
    '全部关注',
    '最新微博',
    '特别关注',
    '好友圈',
    '悄悄关注',
  ]);

  function findTimelineTabElement(title) {
    const tab = document.querySelector(`[role="link"][title="${title}"]`);
    return tab instanceof HTMLElement ? tab : null;
  }

  // 微博不会在分栏节点上写 aria-selected / aria-current，选中态只体现为带构建
  // 哈希的类名（例如 _cur_118ye_33）。只读 aria 属性会把"已选中"永远判成
  // "未选中"，脚本于是每次都点一遍「最新微博」，用户再也停不到「全部关注」。
  function isTimelineTabActive(tab) {
    if (!tab) return false;
    if (
      tab.getAttribute('aria-selected') === 'true' ||
      tab.getAttribute('aria-current') === 'page'
    ) {
      return true;
    }
    return Array.from(tab.classList || []).some((className) =>
      /(?:^|_)cur(?:_|$)|active|selected/i.test(className)
    );
  }

  WB_INTERNAL.timelineTabs = Object.freeze({
    titles: TIMELINE_TAB_TITLES,
    find: findTimelineTabElement,
    isActive: isTimelineTabActive,
  });

  (function forceLatestTab() {
    const LATEST_TITLE = '最新微博';
    // 「全部关注」用的就是主页根路由 "/"，其余分栏是 /mygroups?gid=...。
    // 因此单看 pathname 无法区分"用户点了别的分栏"和"从站内其他页面回到
    // 主页"，必须记住用户最后一次亲手点击的分栏，否则点「全部关注」会被
    // 路由回调立刻弹回「最新微博」。
    const MANUAL_TAB_CHOICE_TTL_MS = 4000;
    let manualTabChoiceTitle = '';
    let manualTabChoiceAt = 0;

    // 一次纠正会话的边界。分栏由页面框架异步挂载，冷启动下分栏节点出现在导航
    // 之后约 3–4 秒，网络或缓存变慢时更晚，因此时间预算取 20 秒。点击之后若
    // 路由仍停在根路由则继续重试，重试次数与两次点击的最小间隔一并设限，避免
    // 分栏长期不可点时空转。
    const RECONCILE_BUDGET_MS = 20000;
    const RECONCILE_MAX_CLICKS = 12;
    const RECONCILE_MIN_CLICK_GAP_MS = 350;
    const RECONCILE_TICK_MS = 250;
    const RECONCILE_MIN_TICK_GAP_MS = 50;
    const RECONCILE_CHANNEL = 'timeline-tab-reconcile';

    // 「最新微博」不是主页根路由，它是 /mygroups?gid=...。记住这个 gid 之后，
    // 脚本在微博前端启动之前把地址改写过去，前端初始化路由时读到的就是
    // 「最新微博」，不再请求「全部关注」的内容，页面也就不存在先渲染一个分栏
    // 再切换到另一个分栏的过程。
    const LATEST_TIMELINE_GID_KEY = 'WB_latest_timeline_gid';
    const REWRITE_VERIFY_CHANNEL = 'timeline-tab-rewrite-verify';
    // 改写之后分栏条迟迟不出现，说明存下来的 gid 已经不可用。
    const REWRITE_VERIFY_MS = 20000;

    const isHomeRootRoute = () =>
      ['weibo.com', 'www.weibo.com'].includes(location.hostname) &&
      (location.pathname === '/' || location.pathname === '');

    const isHomeTimelineRoute = () =>
      ['weibo.com', 'www.weibo.com'].includes(location.hostname) &&
      (location.pathname === '/' ||
        location.pathname === '' ||
        location.pathname === '/mygroups' ||
        location.pathname.indexOf('/mygroups/') === 0);

    const readGidFromQuery = (search) => {
      const matched = String(search || '').match(/[?&]gid=([0-9]+)/);
      return matched ? matched[1] : '';
    };

    const readStoredLatestGid = () => {
      const stored = String(GM_getValue(LATEST_TIMELINE_GID_KEY, '') || '');
      return /^[0-9]{5,}$/.test(stored) ? stored : '';
    };

    // 分栏节点本身是 div，gid 写在包着它的链接上。读取不产生任何请求。
    const readLatestGidFromDom = () => {
      const tab = findTimelineTabElement(LATEST_TITLE);
      const link = tab && tab.closest('a[href*="gid="]');
      return link ? readGidFromQuery(link.getAttribute('href')) : '';
    };

    const userJustChoseAnotherTab = () =>
      !!manualTabChoiceTitle &&
      manualTabChoiceTitle !== LATEST_TITLE &&
      Date.now() - manualTabChoiceAt < MANUAL_TAB_CHOICE_TTL_MS;

    document.addEventListener(
      'click',
      (event) => {
        if (!isTrustedUserEvent(event)) return;
        const target = event.target;
        if (!(target instanceof Element)) return;
        const tab = target.closest('[role="link"][title]');
        const title = tab && tab.getAttribute('title');
        if (!title || !TIMELINE_TAB_TITLES.includes(title)) return;
        manualTabChoiceTitle = title;
        manualTabChoiceAt = Date.now();
      },
      true
    );

    // 纠正以"是否仍停在根路由"为准，不以分栏的选中类名为准。根路由就是
    // 「全部关注」，离开根路由即表示已经进入某个分组分栏——可能是「最新微博」，
    // 也可能是用户自己挑的分栏，两种情况都不再动它。选中类名与路由由页面框架
    // 分别更新，存在类名已指向「最新微博」而内容仍是「全部关注」的中间态，按
    // 类名判断会把这种状态读成"已经到位"并就此收手。
    let session = null;
    let rewroteRootRoute = false;
    // 一次"落在首页"只开一次会话；换到别的 pathname 之后再回来才会再开一次。
    let homeArrivalHandled = false;
    let lastHomePath = '';

    // 会话的目标是「最新微博」处于选中态，且路由已经离开根路由。两个条件缺一
    // 不可。只看路由：改写地址之后微博前端有时仍按「全部关注」启动，地址是分组
    // 路由，而选中态、标题与时间线接口都停在「全部关注」，按路由判断会误判为
    // 已经到位。只看选中态：选中类名与路由由前端分别更新，存在类名已指向
    // 「最新微博」而内容仍是「全部关注」的中间态。
    const reachedLatestTab = () =>
      !isHomeRootRoute() &&
      isTimelineTabActive(findTimelineTabElement(LATEST_TITLE));

    const endReconcile = () => {
      if (!session) return;
      session.observer.disconnect();
      session = null;
      WB_INTERNAL.dom.cancel(RECONCILE_CHANNEL);
    };

    const reconcileTick = () => {
      if (!session) return;
      session.tickedAt = Date.now();
      if (
        !timelineDefault.value ||
        !isHomeTimelineRoute() ||
        reachedLatestTab() ||
        userJustChoseAnotherTab() ||
        session.clicks >= RECONCILE_MAX_CLICKS ||
        Date.now() > session.deadline
      ) {
        endReconcile();
        return;
      }

      const btn = findTimelineTabElement(LATEST_TITLE);
      if (btn && Date.now() - session.clickedAt >= RECONCILE_MIN_CLICK_GAP_MS) {
        session.clicks += 1;
        session.clickedAt = Date.now();
        btn.click();
      }

      // 点击可能同步触发路由变化并结束会话，重新排期前需要再确认会话仍在。
      if (!session) return;
      WB_INTERNAL.dom.schedule(
        RECONCILE_CHANNEL,
        reconcileTick,
        RECONCILE_TICK_MS
      );
    };

    const startReconcile = () => {
      if (session) return;
      if (!timelineDefault.value) return;
      if (!isHomeTimelineRoute()) return;
      // 用户自己停在别的分组分栏时不介入：只有停在根路由（等同「全部关注」）
      // 或刚刚改写过地址，才说明当前应当落在「最新微博」。
      if (!isHomeRootRoute() && !rewroteRootRoute) return;
      if (userJustChoseAnotherTab()) return;
      if (homeArrivalHandled) return;
      homeArrivalHandled = true;

      const observer = new MutationObserver(() => {
        if (!session) return;
        if (Date.now() - session.tickedAt < RECONCILE_MIN_TICK_GAP_MS) return;
        reconcileTick();
      });
      session = {
        observer,
        deadline: Date.now() + RECONCILE_BUDGET_MS,
        clicks: 0,
        clickedAt: 0,
        tickedAt: 0,
      };

      // 分栏挂载会产生子树变更，据此在节点出现的同一刻发起点击；轮询覆盖
      // "节点早已存在、点击却没有生效"这类不再产生新变更的情况。
      const observe = () => {
        if (!session) return;
        observer.observe(document.documentElement, {
          childList: true,
          subtree: true,
        });
      };
      if (document.documentElement) observe();
      else {
        document.addEventListener('DOMContentLoaded', observe, { once: true });
      }

      reconcileTick();
    };

    // 脚本运行于 document-start，页面脚本尚未执行。此刻改写地址，效果等同于
    // 页面本来就打开在「最新微博」。
    const rewriteRootRouteToLatest = () => {
      if (!timelineDefault.value) return;
      if (!isHomeRootRoute()) return;
      const gid = readStoredLatestGid();
      if (!gid) return;
      history.replaceState(null, '', `/mygroups?gid=${gid}`);
      rewroteRootRoute = true;
      WB_INTERNAL.dom.schedule(
        REWRITE_VERIFY_CHANNEL,
        verifyRewrittenRoute,
        REWRITE_VERIFY_MS
      );
    };

    // 分栏条始终没有出现时，清掉 gid 并回到根路由。下一次加载没有 gid 可用，
    // 自动退回点击纠正。页面不可见时只是渲染被推迟，重新排期而不是判定失败。
    function verifyRewrittenRoute() {
      if (!rewroteRootRoute) return;
      if (readLatestGidFromDom()) return;
      if (document.visibilityState !== 'visible') {
        WB_INTERNAL.dom.schedule(
          REWRITE_VERIFY_CHANNEL,
          verifyRewrittenRoute,
          REWRITE_VERIFY_MS
        );
        return;
      }
      rewroteRootRoute = false;
      GM_deleteValue(LATEST_TIMELINE_GID_KEY);
      location.replace(`${location.origin}/`);
    }

    // 分栏条挂载后记录 gid，并核对改写用的 gid 是否仍指向「最新微博」。
    const reviewTimelineTabs = () => {
      const gid = readLatestGidFromDom();
      if (!gid) return false;
      if (gid !== readStoredLatestGid()) {
        GM_setValue(LATEST_TIMELINE_GID_KEY, gid);
      }
      if (!rewroteRootRoute) return true;
      WB_INTERNAL.dom.cancel(REWRITE_VERIFY_CHANNEL);
      return true;
    };

    let gidWatchStop = null;
    const watchTimelineTabs = () => {
      if (gidWatchStop) return;
      if (!isHomeTimelineRoute()) return;
      if (reviewTimelineTabs()) return;
      gidWatchStop = WB_INTERNAL.dom.subscribeMutations(
        'timeline-tab-gid',
        () => {
          if (!reviewTimelineTabs()) return;
          const stop = gidWatchStop;
          gidWatchStop = null;
          if (stop) stop();
        }
      );
    };

    const handleRouteChange = () => {
      syncRelationshipPageMode();
      watchTimelineTabs();
      if (!isHomeTimelineRoute()) {
        homeArrivalHandled = false;
        lastHomePath = '';
        endReconcile();
        return;
      }
      if (location.pathname !== lastHomePath) {
        lastHomePath = location.pathname;
        homeArrivalHandled = false;
      }
      startReconcile();
    };

    rewriteRootRouteToLatest();
    WB_INTERNAL.dom.subscribeRoute('timeline-default', handleRouteChange);
    watchTimelineTabs();
    startReconcile();
  })();

  // === 本地屏蔽列表与新浪微博官方黑名单同步 ===
  const UID_KEY = 'WB_BL_list'; // 本地存 UID
  const UID_EXCLUSION_KEY = 'WB_BL_local_exclusions';
  const UID_MUTATION_LOCK_KEY = 'WB_BL_mutation_lock_v1';
  const OFFICIAL_BLOCK_REQUEST_KEY = 'WB_BL_official_block_request';
  const OFFICIAL_BLOCK_RESPONSE_KEY = 'WB_BL_official_block_response';
  const OFFICIAL_BLOCK_RELAY_PARAM = 'wb_retro_official_block';
  const OFFICIAL_BLOCK_RELAY_TIMEOUT_MS = 15000;
  // 仅用于旧脚本管理器检查跨标签页写回结果，不会发起微博接口请求。
  const OFFICIAL_BLOCK_RELAY_COMPAT_POLL_MS = 250;
  const CONTENT_FILTER_DEFAULTS = {
    hideBlacklistPosts: true,
    hideBlacklistComments: true,
    hideBlacklistSearchResults: true,
    hideBlacklistUserCards: true,
    hideBlacklistInteractions: true,
    hideAds: true,
    hideAdsFromFollowing: true,
    hideAdsFromStrangers: true,
    hideAdsFromSelf: false,
    hideTimelineRecommendations: true,
  };
  const CONTENT_FILTER_CFG = (() => {
    const cfg = WB_INTERNAL.config.read();
    return Object.assign({}, CONTENT_FILTER_DEFAULTS, cfg);
  })();
  const BLOCKED_CONTENT_HIDE_ATTR = 'data-__wb_bl_hidden_by_userscript';
  const BLOCKED_CONTENT_UID_ATTR = 'data-__wb_bl_hidden_uid';
  const BLOCKED_CONTENT_ORIGINAL_ARIA_ATTR =
    'data-__wb_bl_original_aria_hidden';
  const BLOCKED_CONTENT_ARIA_ABSENT = '__wb_absent__';
  const BLOCKED_CONTENT_HIDE_SELECTOR = `[${BLOCKED_CONTENT_HIDE_ATTR}]`;
  const HIDDEN_AD_ATTR = 'data-__wb_ad_hidden_by_userscript';
  const HIDDEN_AD_SELECTOR = `[${HIDDEN_AD_ATTR}]`;
  const HIDDEN_TIMELINE_RECOMMENDATION_ATTR =
    'data-__wb_timeline_recommendation_hidden_by_userscript';
  const HIDDEN_TIMELINE_RECOMMENDATION_SELECTOR =
    `[${HIDDEN_TIMELINE_RECOMMENDATION_ATTR}]`;
  const TIMELINE_RECOMMENDATION_LABEL = '你可能感兴趣的内容';
  const HIDDEN_FEED_CONTENT_SELECTOR = [
    BLOCKED_CONTENT_HIDE_SELECTOR,
    HIDDEN_AD_SELECTOR,
    HIDDEN_TIMELINE_RECOMMENDATION_SELECTOR,
  ].join(',');
  const USER_SCRIPT_UI_SELECTOR = [
    '.wbset-panel',
    '.wbset-btn',
    '.wb-user-context-menu',
    '.wb-retro-confirm-overlay',
    '#wb-retro-toast',
  ].join(',');
  const RELATIONSHIP_PAGE_ATTR = 'data-__wb_relationship_list_page';
  const LAYOUT_REFRESH_EVENT = 'wb-retro-layout-refresh';
  const FLOATING_VIDEO_PLAYER_SELECTOR = [
    '.mini-player',
    '[class*="mini-player"]',
    '[class*="miniPlayer"]',
    '[class*="MiniPlayer"]',
    '[class*="_miniPlayer_"]',
  ].join(',');
  const FLOATING_VIDEO_SUPPRESS_ATTR =
    'data-__wb_floating_video_suppressed_by_userscript';
  const FLOATING_VIDEO_ORIGINAL_ARIA_ATTR =
    'data-__wb_floating_video_original_aria_hidden';
  const EXPLICIT_AD_SELECTOR = [
    '[data-ad-id]',
    '[data-adid]',
    '[ad-id]',
    '[adid]',
    '[data-ad="true"]',
    '[data-is-ad="true"]',
    '[is-ad="true"]',
    '[feedtype="ad"]',
    '[mblogtype="ad"]',
    '[action-type*="feed_ad"]',
    '[action-type*="advert"]',
    '[node-type*="feed_ad"]',
    '[node-type*="advert"]',
    '[class*="feed-ad"]',
    '[class*="feed_ad"]',
    '[class*="FeedAd"]',
    '[class*="advert"]',
    '[class*="Advert"]',
    '[class*="promoted"]',
    '[class*="Promoted"]',
  ].join(',');
  // 微博的"加载下一页"哨兵用 vue-observe-visibility 监听，rootMargin 为
  // 1500px，并且只在可见性发生翻转（不可见 -> 可见）时才回调一次。正常情况下
  // 新一页会把哨兵顶到 1500px 之外，于是下次滚动回来才能再次触发。脚本把被
  // 屏蔽的微博和广告折叠成极薄的正尺寸测量壳，新一页的实际高度可能不足
  // 1500px，哨兵
  // 便一直停在"已可见"状态，回调不再触发——表现为拉到底后再也加载不出内容。
  // 检测到这种停滞时，短暂隐藏哨兵再恢复，制造一次可见性翻转让微博自己续页。
  // 触发条件必须避开 document.scrollHeight：微博的图片、视频和侧栏会持续改变
  // 它，任何"高度还在变就算正常"的判断都会被这些噪声一直清零，永远等不到停滞。
  // 改用 DynamicScroller 自己维护的列表总高，并且只把大幅增长视为"新一页到了"。
  const TIMELINE_LOADER_NUDGE_ATTR = 'data-__wb_timeline_loader_nudge';
  // 与微博自身的 rootMargin 保持一致：微博在哨兵进入视口下方 1500px 时就开始
  // 预取，若只在哨兵快进视口时才补偿，用户会先看到空转的加载动画再等到内容。
  const TIMELINE_SENTINEL_MARGIN_PX = 1500;
  // 仅用于判断"是否需要重新等待页面稳定"，不用于判断续页是否成功。
  const TIMELINE_PAGE_GROWTH_PX = 400;
  // 静止判定不能短于内容请求的常见耗时（实测 TTFB 约 1 秒），否则会在原生
  // 请求仍在途时再触发一次续页。感知延迟由 1500px 提前量保证，不靠压缩这里。
  const TIMELINE_STALL_IDLE_MS = 1200;
  const TIMELINE_NUDGE_COOLDOWN_MS = 1200;
  const TIMELINE_NUDGE_MAX_STALE = 3;
  // 补偿触发后等待对应的内容请求出结果或超时，期间不再叠加触发。
  const TIMELINE_ACTION_PENDING_MS = 6000;
  const TIMELINE_REQUEST_SETTLE_MS = 400;
  const TIMELINE_REQUEST_URL_RE = /\/ajax\/[a-z]+\/[a-z_]*timeline/i;
  // 底部卡片的原生状态，文案取自微博自身的前端包：加载动画之外，请求失败是
  // 「内容加载失败，请点击重试」，需要用户确认续页是「点击加载更多」，时间线
  // 到头是「没有更多内容了」。前两种都自带可点击的原生控件，直接触发即可。
  const TIMELINE_ACTION_TEXT_RE = /加载失败|点击重试|点击加载更多|加载更多/;
  const TIMELINE_END_TEXT_RE = /没有更多|已显示全部|已加载全部|到底了|到底啦/;
  const TIMELINE_RETRY_BASE_MS = 400;
  const TIMELINE_RETRY_MAX_CLICKS = 4;
  const TIMELINE_NUDGE_RESTORE_MS = 300;
  const TIMELINE_STALL_POLL_MS = 250;
  const VIRTUAL_VIEW_SELECTOR = [
    '.vue-recycle-scroller__item-view',
    '[class*="vue-recycle-scroller__item-view"]',
  ].join(',');
  const VIRTUAL_WRAPPER_SELECTOR = [
    '.vue-recycle-scroller__item-wrapper',
    '[class*="vue-recycle-scroller__item-wrapper"]',
  ].join(',');
  // vue-virtual-scroller 1.x 用 `~~height` 把测量值截为整数，并忽略结果 0。
  // 在页面缩放 / DPR 像素对齐下，CSS 1px 实测可能略小于 1（现场为
  // 0.994px），仍会被截成 0 并沿用旧行高。2px 壳实测后至少保留为 1，
  // 同时在视觉上仍完全不可见。
  const VIRTUAL_MEASUREMENT_SHELL_PX = 2;
  // 虚拟行内的内容全部隐藏后，行本身测得 0。vue-virtual-scroller 忽略恰好为
  // 0 的测量值并沿用旧行高，该行原先占的高度留在原地成为空白，滚动器也不会
  // 因为出现空位而补足可视区内的条目。此标记加在行内的直接内容壳上，由样式
  // 保留 2px 的不可见测量壳，行随之测得正整数。行本身的 transform 与高度不受
  // 影响，仍由 Vue 掌握。
  const VIRTUAL_ROW_SHELL_ATTR = 'data-__wb_virtual_row_shell_by_userscript';
  const VIRTUAL_ROW_SHELL_SELECTOR = `[${VIRTUAL_ROW_SHELL_ATTR}]`;
  const VIRTUAL_ITEM_SELECTOR = [
    '.vue-recycle-scroller__item-view',
    '[class*="vue-recycle-scroller__item-view"]',
    '[class*="wbpro-scroller-item"]',
    '[style*="translateY("]',
    '[style*="translate3d("]',
    '[style*="translate("]',
    '[style*="matrix("]',
    '[style*="top:"]',
  ].join(',');
  const MAX_418 = 3; // 连续 418 次数上限
  const MAX_FULL_SYNC_PAGES = 5000;
  const MAIN_WEIBO_HOSTS = new Set(['weibo.com', 'www.weibo.com']);
  function createSyncAbortError() {
    try {
      return new DOMException('新浪微博官方黑名单同步已取消', 'AbortError');
    } catch {
      const error = new Error('新浪微博官方黑名单同步已取消');
      error.name = 'AbortError';
      return error;
    }
  }

  function throwIfSyncAborted(signal) {
    if (signal?.aborted) throw createSyncAbortError();
  }

  function sleep(ms, signal) {
    throwIfSyncAborted(signal);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(done, ms);
      function done() {
        signal?.removeEventListener('abort', abort);
        resolve();
      }
      function abort() {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        reject(createSyncAbortError());
      }
      signal?.addEventListener('abort', abort, { once: true });
    });
  }

  function parseStoredUIDSet(raw) {
    return new Set(
      String(raw || '')
        .split(',')
        .map((uid) => uid.trim())
        .filter((uid) => /^\d{5,}$/.test(uid))
    );
  }

  async function withLocalBLMutationLock(task) {
    const owner = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const acquireDeadline = Date.now() + 6000;
    const leaseDuration = 4000;

    while (Date.now() < acquireDeadline) {
      const now = Date.now();
      const current = _GM_getValue(UID_MUTATION_LOCK_KEY, null);
      const currentExpiresAt = Number(current?.expiresAt || 0);
      if (!current?.owner || currentExpiresAt <= now) {
        _GM_setValue(UID_MUTATION_LOCK_KEY, {
          owner,
          expiresAt: now + leaseDuration,
        });
        await sleep(18);
        const confirmed = _GM_getValue(UID_MUTATION_LOCK_KEY, null);
        if (confirmed?.owner === owner) {
          try {
            return task();
          } finally {
            const latest = _GM_getValue(UID_MUTATION_LOCK_KEY, null);
            if (latest?.owner === owner) {
              if (_GM_deleteValue) _GM_deleteValue(UID_MUTATION_LOCK_KEY);
              else _GM_setValue(UID_MUTATION_LOCK_KEY, null);
            }
          }
        }
      }
      await sleep(24 + Math.floor(Math.random() * 24));
    }
    throw new Error('本地屏蔽列表正被其他标签页修改，请稍后重试');
  }

  async function mutateLocalBLStorage(options = {}) {
    const add = new Set(
      Array.from(options.add || [])
        .map((uid) => String(uid || '').trim())
        .filter((uid) => /^\d{5,}$/.test(uid))
    );
    const remove = new Set(
      Array.from(options.remove || [])
        .map((uid) => String(uid || '').trim())
        .filter((uid) => /^\d{5,}$/.test(uid))
    );
    const replacement =
      options.replace === undefined
        ? null
        : new Set(
            Array.from(options.replace || [])
              .map((uid) => String(uid || '').trim())
              .filter((uid) => /^\d{5,}$/.test(uid))
          );

    return withLocalBLMutationLock(() => {
      const stored = parseStoredUIDSet(_GM_getValue(UID_KEY, ''));
      const exclusions = parseStoredUIDSet(
        _GM_getValue(UID_EXCLUSION_KEY, '')
      );
      const current = new Set(
        [...stored].filter((uid) => !exclusions.has(uid))
      );
      const beforeSize = current.size;

      if (replacement) {
        current.forEach((uid) => {
          if (!replacement.has(uid)) exclusions.add(uid);
        });
        replacement.forEach((uid) => exclusions.delete(uid));
        stored.clear();
        replacement.forEach((uid) => stored.add(uid));
      } else {
        remove.forEach((uid) => {
          stored.delete(uid);
          exclusions.add(uid);
        });
        add.forEach((uid) => {
          exclusions.delete(uid);
          stored.add(uid);
        });
      }

      exclusions.forEach((uid) => stored.delete(uid));
      _GM_setValue(UID_KEY, Array.from(stored).join(','));
      _GM_setValue(UID_EXCLUSION_KEY, Array.from(exclusions).join(','));
      const next = new Set(stored);
      replaceSetContents(BL, next);
      return {
        size: next.size,
        added: [...next].filter((uid) => !current.has(uid)).length,
        removed: [...current].filter((uid) => !next.has(uid)).length,
        beforeSize,
      };
    });
  }

  function rebaseLocalBLExclusions(base, working, latest) {
    const rebased = new Set(working);
    latest.forEach((uid) => {
      if (!base.has(uid)) rebased.add(uid);
    });
    base.forEach((uid) => {
      if (!latest.has(uid)) rebased.delete(uid);
    });
    return rebased;
  }

  async function commitSyncedLocalBL(
    workingSet,
    baseExclusions,
    workingExclusions
  ) {
    return withLocalBLMutationLock(() => {
      const latestExclusions = parseStoredUIDSet(
        _GM_getValue(UID_EXCLUSION_KEY, '')
      );
      const finalExclusions = rebaseLocalBLExclusions(
        baseExclusions,
        workingExclusions,
        latestExclusions
      );
      const merged = parseStoredUIDSet(_GM_getValue(UID_KEY, ''));
      workingSet.forEach((uid) => {
        if (!finalExclusions.has(uid)) merged.add(uid);
      });
      finalExclusions.forEach((uid) => merged.delete(uid));
      _GM_setValue(UID_KEY, Array.from(merged).join(','));
      _GM_setValue(
        UID_EXCLUSION_KEY,
        Array.from(finalExclusions).join(',')
      );
      replaceSetContents(BL, merged);
      return new Set(merged);
    });
  }

  WB_INTERNAL.blStore = Object.freeze({
    mutate: mutateLocalBLStorage,
  });

  const canUseSettingApi = () => MAIN_WEIBO_HOSTS.has(location.hostname);
  const SETTING_API_HOST_ERROR =
    '请在 weibo.com 主站页面同步新浪微博官方黑名单';

  // 保存原生接口。不要挂到 window，避免页面脚本绕过过滤器或读取内部状态。
  const WB_BL_NATIVE = {
    fetch: window.fetch.bind(window),
  };

  function extractUIDFromScheme(item) {
    const m = String(item?.scheme || '').match(/uid=(\d{5,})/);
    return m ? m[1] : '';
  }

  function hasNextFilteredUsersPage(value) {
    const flag = String(value ?? '').trim().toLowerCase();
    return !['', '0', 'false', 'null', 'undefined'].includes(flag);
  }

  function parseFilteredUsersResponse(data, operationLabel) {
    const label = String(operationLabel || '同步');
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error(`新浪微博官方黑名单${label}响应格式无效`);
    }
    if (data.ok !== 1 && data.ok !== true) {
      const message =
        typeof data.msg === 'string' && data.msg.trim()
          ? `：${data.msg.trim()}`
          : '';
      throw new Error(`新浪微博官方黑名单${label}失败${message}`);
    }
    if (!Array.isArray(data.card_group)) {
      throw new Error(`新浪微博官方黑名单${label}响应缺少名单数据`);
    }
    if (
      data.next_cursor !== undefined &&
      data.next_cursor !== null &&
      !['string', 'number', 'boolean'].includes(typeof data.next_cursor)
    ) {
      throw new Error(`新浪微博官方黑名单${label}响应游标无效`);
    }
    return {
      items: data.card_group,
      hasNextPage:
        hasNextFilteredUsersPage(data.next_cursor) && Number(data.total) !== 0,
    };
  }

  function buildFilteredUsersURL(page) {
    return `/ajax/setting/getFilteredUsers?page=${page}`;
  }

  /**
   * 全量同步：只在用户手动触发或无缓存时使用
   */
  async function fullSync(options = {}) {
    if (!canUseSettingApi()) {
      throw new Error(SETTING_API_HOST_ERROR);
    }
    const { signal, onProgress } = options;
    const list = [];
    const baseExclusions = readLocalBLExclusions();
    const exclusions = new Set(baseExclusions);
    let page = 1,
      strikes = 0;
    while (true) {
      throwIfSyncAborted(signal);
      if (page > MAX_FULL_SYNC_PAGES) {
        throw new Error('新浪微博官方黑名单页数异常，完整同步已停止');
      }
      onProgress?.({ currentPage: page, loaded: list.length });
      const url = buildFilteredUsersURL(page);
      const res = await WB_BL_NATIVE.fetch(url, {
        credentials: 'include',
        signal,
      });
      if (res.status === 418) {
        if (++strikes > MAX_418) {
          throw new Error('新浪微博请求过于频繁，完整同步未完成');
        }
        onProgress?.({
          currentPage: page,
          loaded: list.length,
          waiting: true,
        });
        await sleep(3000, signal);
        continue;
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      strikes = 0;
      const data = await res.json();
      throwIfSyncAborted(signal);
      const parsed = parseFilteredUsersResponse(data, '完整同步');
      parsed.items.forEach((item) => {
        const uid = extractUIDFromScheme(item);
        if (!uid) return;
        exclusions.delete(uid);
        list.push(uid);
      });
      onProgress?.({ currentPage: page, loaded: list.length });
      if (!parsed.hasNextPage || parsed.items.length === 0) break;
      page++;
      await sleep(THROTTLE_MS, signal);
    }
    throwIfSyncAborted(signal);
    const merged = await commitSyncedLocalBL(
      new Set(list),
      baseExclusions,
      exclusions
    );
    return merged;
  }

  /**
   * 增量同步：默认只跑第一页
   */
  async function deltaSync(set, options = {}) {
    if (!canUseSettingApi()) {
      if (options.silent) return set;
      throw new Error(SETTING_API_HOST_ERROR);
    }
    const { signal, onProgress } = options;
    throwIfSyncAborted(signal);
    onProgress?.({ currentPage: 1, targetPages: 1, loaded: 0 });
    const res = await WB_BL_NATIVE.fetch(
      '/ajax/setting/getFilteredUsers?page=1',
      { credentials: 'include', signal }
    );
    if (!res.ok) {
      if (options.silent) return set;
      throw new Error('HTTP ' + res.status);
    }
    const data = await res.json();
    throwIfSyncAborted(signal);
    const parsed = parseFilteredUsersResponse(data, '增量同步');
    const workingSet = new Set(set);
    const baseExclusions = readLocalBLExclusions();
    const exclusions = new Set(baseExclusions);
    const respectExclusions = options.silent === true;
    let added = 0;
    parsed.items.forEach((item) => {
      const uid = extractUIDFromScheme(item);
      if (!uid || (respectExclusions && exclusions.has(uid))) return;
      if (!respectExclusions) exclusions.delete(uid);
      if (!workingSet.has(uid)) {
        workingSet.add(uid);
        added++;
      }
    });
    onProgress?.({
      currentPage: 1,
      targetPages: 1,
      loaded: parsed.items.length,
    });
    throwIfSyncAborted(signal);
    const merged = await commitSyncedLocalBL(
      workingSet,
      baseExclusions,
      exclusions
    );
    replaceSetContents(set, merged);
    return set;
  }

  /**
   * 指定页数同步（默认 5 页）
   * @param {Set}   set    现有 BL 集合
   * @param {Number}pages  要同步的页数
   * @returns {Number} 新增 UID 数
   */
  async function syncPages(set, pages = 5, options = {}) {
    if (!canUseSettingApi()) {
      throw new Error(SETTING_API_HOST_ERROR);
    }
    const { signal, onProgress } = options;
    let page = 1,
      strikes = 0,
      added = 0;
    const workingSet = new Set(set);
    const baseExclusions = readLocalBLExclusions();
    const exclusions = new Set(baseExclusions);
    while (page <= pages) {
      throwIfSyncAborted(signal);
      onProgress?.({
        currentPage: page,
        targetPages: pages,
        loaded: workingSet.size - set.size,
      });
      const url = buildFilteredUsersURL(page);
      const res = await WB_BL_NATIVE.fetch(url, {
        credentials: 'include',
        signal,
      });
      if (res.status === 418) {
        if (++strikes > MAX_418) {
          throw new Error('新浪微博请求过于频繁，分页同步未完成');
        }
        onProgress?.({
          currentPage: page,
          targetPages: pages,
          loaded: workingSet.size - set.size,
          waiting: true,
        });
        await sleep(3000, signal);
        continue;
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      strikes = 0;
      const data = await res.json();
      throwIfSyncAborted(signal);
      const parsed = parseFilteredUsersResponse(data, '分页同步');
      parsed.items.forEach((item) => {
        const uid = extractUIDFromScheme(item);
        if (!uid) return;
        exclusions.delete(uid);
        if (!workingSet.has(uid)) {
          workingSet.add(uid);
          added++;
        }
      });
      onProgress?.({
        currentPage: page,
        targetPages: pages,
        loaded: added,
      });
      if (!parsed.hasNextPage || parsed.items.length === 0) break;
      page++;
      await sleep(THROTTLE_MS, signal);
    }
    throwIfSyncAborted(signal);
    const merged = await commitSyncedLocalBL(
      workingSet,
      baseExclusions,
      exclusions
    );
    replaceSetContents(set, merged);
    return added;
  }

  let BL = new Set();

  function readLocalBLCache() {
    const cache = _GM_getValue(UID_KEY, '');
    const exclusions = readLocalBLExclusions();
    return new Set(
      String(cache || '')
        .split(',')
        .map((uid) => uid.trim())
        .filter((uid) => /^\d{5,}$/.test(uid) && !exclusions.has(uid))
    );
  }

  function readLocalBLExclusions() {
    const cache = _GM_getValue(UID_EXCLUSION_KEY, '');
    return new Set(
      String(cache || '')
        .split(',')
        .map((uid) => uid.trim())
        .filter((uid) => /^\d{5,}$/.test(uid))
    );
  }

  function replaceSetContents(target, source) {
    target.clear();
    source.forEach((uid) => target.add(uid));
    return target;
  }

  function restoreBlockedContentHideState(root = document) {
    if (!root || !root.querySelectorAll) return;
    const nodes = [];
    if (root instanceof Element && root.matches(BLOCKED_CONTENT_HIDE_SELECTOR)) {
      nodes.push(root);
    }
    root
      .querySelectorAll(BLOCKED_CONTENT_HIDE_SELECTOR)
      .forEach((node) => nodes.push(node));
    Array.from(new Set(nodes)).forEach((node) =>
      clearBlockedContentHideState(node)
    );
  }

  function refreshBlockedDOMAfterBLChange(options = {}) {
    syncRelationshipPageMode();
    if (isRelationshipListPage()) {
      restoreHiddenRelationshipItems(document);
      return;
    }
    if (options.restoreHidden) {
      restoreBlockedContentHideState(document);
    }
    hideBlockedDOMPosts(document);
    compactVirtualScrollerGaps(document);
    if (options.nudgeLayout !== false) {
      scheduleBlockedDOMRefresh();
      nudgeTimelineLayout();
    }
  }

  function reloadLocalBLFromStorage(options = {}) {
    BL = readLocalBLCache();
    refreshBlockedDOMAfterBLChange({
      restoreHidden: options.restoreHidden !== false,
      nudgeLayout: options.nudgeLayout !== false,
    });
    return BL.size;
  }

  function handleRemoteBLStorageChange(_name, _oldValue, _newValue, remote) {
    if (!remote) return;
    WB_INTERNAL.dom.schedule(
      'blacklist-storage-refresh',
      () => reloadLocalBLFromStorage({ restoreHidden: true }),
      50
    );
  }

  if (_GM_addValueChangeListener) {
    [UID_KEY, UID_EXCLUSION_KEY].forEach((key) => {
      _GM_addValueChangeListener(key, handleRemoteBLStorageChange);
    });
    _GM_addValueChangeListener(
      WB_INTERNAL.config.key,
      (_name, _oldValue, _newValue, remote) => {
        if (!remote) return;
        applyRuntimeConfig(WB_INTERNAL.config.read());
      }
    );
  }

  const SYNC_LABELS = Object.freeze({
    startup: '新浪微博官方黑名单启动同步',
    delta: '新浪微博官方黑名单增量同步',
    pages: '新浪微博官方黑名单分页同步',
    full: '新浪微博官方黑名单完整同步',
  });
  const syncStateListeners = new Set();
  let activeSyncTask = null;

  function getPublicSyncState() {
    if (!activeSyncTask) return { active: false };
    const {
      kind,
      label,
      startedAt,
      currentPage,
      targetPages,
      loaded,
      waiting,
    } = activeSyncTask;
    return {
      active: true,
      kind,
      label,
      startedAt,
      currentPage,
      targetPages,
      loaded,
      waiting,
    };
  }

  function emitSyncState() {
    const state = getPublicSyncState();
    syncStateListeners.forEach((listener) => {
      try {
        listener(state);
      } catch (error) {
        console.warn('[WB-BL] 同步状态监听器执行失败', error);
      }
    });
  }

  function updateSyncProgress(progress = {}) {
    if (!activeSyncTask) return;
    Object.assign(activeSyncTask, progress, { waiting: progress.waiting === true });
    emitSyncState();
  }

  async function runControlledSync(kind, task) {
    if (activeSyncTask) {
      throw new Error(`已有${activeSyncTask.label}正在运行，请先等待或取消`);
    }
    const controller = new AbortController();
    activeSyncTask = {
      kind,
      label: SYNC_LABELS[kind] || '新浪微博官方黑名单同步',
      controller,
      startedAt: Date.now(),
      currentPage: 0,
      targetPages: null,
      loaded: 0,
      waiting: false,
    };
    emitSyncState();
    try {
      return await task({
        signal: controller.signal,
        onProgress: updateSyncProgress,
      });
    } finally {
      activeSyncTask = null;
      emitSyncState();
    }
  }

  function cancelActiveSync() {
    if (!activeSyncTask) return false;
    activeSyncTask.controller.abort();
    return true;
  }

  // 仅通过用户脚本闭包与设置面板共享同步能力，不向页面 window 暴露接口。
  const WB_BL_SYNC_BRIDGE = Object.freeze({
    getCount: () => BL.size,
    getState: getPublicSyncState,
    subscribe: (listener) => {
      if (typeof listener !== 'function') return () => {};
      syncStateListeners.add(listener);
      listener(getPublicSyncState());
      return () => syncStateListeners.delete(listener);
    },
    cancel: cancelActiveSync,
    reloadFromStorage: (options = {}) => reloadLocalBLFromStorage(options),
    fullSync: () =>
      runControlledSync('full', async (controls) => {
        BL = await fullSync(controls);
        refreshBlockedDOMAfterBLChange({ restoreHidden: true });
        return BL.size;
      }),
    deltaSync: () =>
      runControlledSync('delta', async (controls) => {
        const before = BL.size;
        BL = await deltaSync(BL, controls);
        refreshBlockedDOMAfterBLChange({ restoreHidden: false });
        return {
          added: BL.size - before,
          total: BL.size,
        };
      }),
    syncPages: (pages) => {
      const count = Math.max(1, Math.min(Number(pages) || 5, 20));
      return runControlledSync('pages', async (controls) => {
        const added = await syncPages(BL, count, controls);
        refreshBlockedDOMAfterBLChange({ restoreHidden: false });
        return {
          added,
          total: BL.size,
        };
      });
    },
  });
  WB_INTERNAL.blSync = WB_BL_SYNC_BRIDGE;

  (async () => {
    syncRelationshipPageMode();
    BL = readLocalBLCache();
    // 启动时静默合并新浪微博官方黑名单第一页。
    try {
      await runControlledSync('startup', async (controls) => {
        BL = await deltaSync(BL, { ...controls, silent: true });
      });
    } catch (e) {
      console.warn('[WB-BL] 新浪微博官方黑名单增量同步失败，继续使用本地屏蔽列表', e);
    }
    updateRuntimeStyles();
    refreshBlockedDOMAfterBLChange({
      restoreHidden: false,
      nudgeLayout: false,
    });
    scheduleBlockedDOMRefreshWhenPageReady();

    // 首次使用先完成设置向导，避免和 Star 提醒重叠。
    if (_GM_getValue(ONBOARDING_DONE_KEY, false)) checkStarReminder();
  })();

  function generateCSSRules() {
    // 从统一配置中读取页面样式开关。
    const cfg = WB_INTERNAL.config.read();

    const hideHotSearch = cfg.hideHotSearch !== false;
    const defaultLatestTimeline = cfg.defaultLatestTimeline !== false;
    const hideNavVideo = cfg.hideNavVideo === true;
    const hideNavRecommend = cfg.hideNavRecommend === true;
    const hideNavGame = cfg.hideNavGame !== false;
    const hideNavSelectors = [];

    if (hideNavVideo) {
      hideNavSelectors.push(
        'nav a[title="视频"]',
        'nav [title="视频"]',
        '[role="navigation"] a[title="视频"]',
        '[role="navigation"] [class*="_item_"][title="视频"]',
        '[role="navigation"] a[href*="/tv"]',
        'nav svg[title="视频"]',
        '[class*="Nav_"] [class*="_item_"][title="视频"]',
        '[class*="Nav_"] a[href*="/tv"]'
      );
    }

    if (hideNavRecommend) {
      hideNavSelectors.push(
        'nav a[title="推荐"]',
        'nav [title="推荐"]',
        '[role="navigation"] a[title="推荐"]',
        '[role="navigation"] [class*="_item_"][title="推荐"]',
        '[role="navigation"] a[href*="/hot"]',
        'nav svg[title="画板"]',
        '[class*="Nav_"] [class*="_item_"][title="推荐"]',
        '[class*="Nav_"] a[href*="/hot"]'
      );
    }

    if (hideNavGame) {
      hideNavSelectors.push(
        'nav a[title="游戏"]',
        'nav a[href*="game.weibo.com"]',
        '[role="navigation"] a[title="游戏"]',
        '[role="navigation"] a[href*="game.weibo.com"]',
        '[class*="Nav_"] a[title="游戏"]',
        '[class*="Nav_"] a[href*="game.weibo.com"]'
      );
    }

    const hideNavIconsCSS = hideNavSelectors.length
      ? `
          /* 隐藏导航栏入口 */
          ${hideNavSelectors.join(',\n          ')} {
            display: none !important;
          }
        `
      : '';
    const hideSearchHotBandCSS = hideHotSearch
      ? `
          /*
           * 隐藏微博搜索页热搜榜。这里只允许命中热搜榜自身及包裹它的卡片。
           * 搜索页右栏 #pl_right_side 正是热搜容器的直接父节点，因此任何按
           * 直接子节点向上匹配父级 div 的写法都会连带隐藏整条右栏，把创作者
           * 中心和帮助中心一起去掉；卡片级选择器必须保留 card 类名限定。
           */
          #hot-band-container,
          .hot-band-container,
          .hot-band-tabs,
          .card-wrap:has(.hot-band-tabs),
          .card-wrap:has(.hot-band-container),
          [class*="card"]:has(> .hot-band-tabs),
          [class*="card"]:has(> .hot-band-container),
          [class*="Card"]:has(> .hot-band-tabs) {
            display: none !important;
          }
        `
      : '';
    const hideAllFollowingCSS = defaultLatestTimeline
      ? `
          div[role="link"][title="全部关注"] {
            display: none !important;
          }
        `
      : '';

    return `
      ${BLOCKED_CONTENT_HIDE_SELECTOR} {
        display: none !important;
        height: 0 !important;
        min-height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        overflow: hidden !important;
      }
      ${HIDDEN_AD_SELECTOR} {
        display: none !important;
        height: 0 !important;
        min-height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        overflow: hidden !important;
      }
      ${HIDDEN_TIMELINE_RECOMMENDATION_SELECTOR} {
        display: none !important;
        height: 0 !important;
        min-height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        overflow: hidden !important;
      }
      .vue-recycle-scroller__item-view > ${BLOCKED_CONTENT_HIDE_SELECTOR},
      [class*="vue-recycle-scroller__item-view"] > ${BLOCKED_CONTENT_HIDE_SELECTOR},
      .vue-recycle-scroller__item-view > ${HIDDEN_AD_SELECTOR},
      [class*="vue-recycle-scroller__item-view"] > ${HIDDEN_AD_SELECTOR},
      .vue-recycle-scroller__item-view > ${HIDDEN_TIMELINE_RECOMMENDATION_SELECTOR},
      [class*="vue-recycle-scroller__item-view"] > ${HIDDEN_TIMELINE_RECOMMENDATION_SELECTOR} {
        /*
         * DynamicScroller ignores a measured size of exactly 0 and keeps the
         * previous cached row height, which leaves a large blank slot. Keep a
         * thin, fully invisible measurement shell so Vue records a positive
         * integer size and moves the following row itself. A CSS 1px shell is
         * unsafe because vue-virtual-scroller 1.x floors the measured height
         * and page scaling can make the rect slightly smaller than 1px. We
         * intentionally
         * do not touch the outer item view, its transform, or wrapper height.
         */
        display: block !important;
        height: ${VIRTUAL_MEASUREMENT_SHELL_PX}px !important;
        min-height: ${VIRTUAL_MEASUREMENT_SHELL_PX}px !important;
        max-height: ${VIRTUAL_MEASUREMENT_SHELL_PX}px !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        overflow: hidden !important;
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
      ${VIRTUAL_ROW_SHELL_SELECTOR} {
        /*
         * Collapse a fully hidden virtual row to the same 2px measurement
         * shell used for direct item-view children. The comment list nests
         * the hidden node deeper (item-view > scroller-item > list > item),
         * so the direct-child rule above never matches there and the row
         * would keep its pre-hide height as blank space.
         */
        display: block !important;
        height: ${VIRTUAL_MEASUREMENT_SHELL_PX}px !important;
        min-height: ${VIRTUAL_MEASUREMENT_SHELL_PX}px !important;
        max-height: ${VIRTUAL_MEASUREMENT_SHELL_PX}px !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        overflow: hidden !important;
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
      [${TIMELINE_LOADER_NUDGE_ATTR}="1"] {
        /*
         * Weibo's next-page sentinel is watched by vue-observe-visibility,
         * which only re-invokes its callback when the intersecting state
         * flips. Hiding the sentinel for a frame makes IntersectionObserver
         * report it as not intersecting, so restoring it produces the
         * false -> true transition Weibo needs to request the next page.
         * The attribute is removed again within a few frames.
         */
        display: none !important;
      }
      html[${RELATIONSHIP_PAGE_ATTR}="1"] ${BLOCKED_CONTENT_HIDE_SELECTOR} {
        display: revert !important;
        height: auto !important;
        min-height: 0 !important;
        margin: revert !important;
        padding: revert !important;
        border: revert !important;
        overflow: visible !important;
      }
      html[${RELATIONSHIP_PAGE_ATTR}="1"] ${BLOCKED_CONTENT_HIDE_SELECTOR}.woo-box-flex,
      html[${RELATIONSHIP_PAGE_ATTR}="1"] ${BLOCKED_CONTENT_HIDE_SELECTOR}[class*="woo-box-flex"],
      html[${RELATIONSHIP_PAGE_ATTR}="1"] ${BLOCKED_CONTENT_HIDE_SELECTOR}.wbpro-scroller-item,
      html[${RELATIONSHIP_PAGE_ATTR}="1"] ${BLOCKED_CONTENT_HIDE_SELECTOR}[class*="wbpro-scroller-item"],
      html[${RELATIONSHIP_PAGE_ATTR}="1"] .vue-recycle-scroller__item-view ${BLOCKED_CONTENT_HIDE_SELECTOR}.woo-box-flex,
      html[${RELATIONSHIP_PAGE_ATTR}="1"] .vue-recycle-scroller__item-view ${BLOCKED_CONTENT_HIDE_SELECTOR}[class*="woo-box-flex"],
      html[${RELATIONSHIP_PAGE_ATTR}="1"] .vue-recycle-scroller__item-view ${BLOCKED_CONTENT_HIDE_SELECTOR}.wbpro-scroller-item,
      html[${RELATIONSHIP_PAGE_ATTR}="1"] .vue-recycle-scroller__item-view ${BLOCKED_CONTENT_HIDE_SELECTOR}[class*="wbpro-scroller-item"] {
        display: flex !important;
      }
      html[${RELATIONSHIP_PAGE_ATTR}="1"] a${BLOCKED_CONTENT_HIDE_SELECTOR},
      html[${RELATIONSHIP_PAGE_ATTR}="1"] div${BLOCKED_CONTENT_HIDE_SELECTOR}:not(.woo-box-flex):not([class*="woo-box-flex"]) {
        display: block !important;
      }
      [${FLOATING_VIDEO_SUPPRESS_ATTR}="1"] {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
      /* 首页有新微博时，将主站和搜索站的红色 NEW 胶囊替换为圆点 */
      [role="navigation"] a[title="首页"][href="/"] .woo-badge-main:has(.woo-badge-new),
      a[href="/"]:has(.woo-tab-item-main[aria-label="首页"]) .woo-badge-main:has(.woo-badge-new) {
        min-width: var(--w-badge-dot, .625rem) !important;
        width: var(--w-badge-dot, .625rem) !important;
        height: var(--w-badge-dot, .625rem) !important;
        padding: 0 !important;
        border-radius: 50% !important;
        line-height: 0 !important;
      }
      [role="navigation"] a[title="首页"][href="/"] .woo-badge-main:has(.woo-badge-new) {
        top: 0 !important;
        right: 0 !important;
        transform: translate(50%, -50%) !important;
      }
      [role="navigation"] a[title="首页"][href="/"] .woo-badge-main:has(.woo-badge-new) .woo-badge-new,
      a[href="/"]:has(.woo-tab-item-main[aria-label="首页"]) .woo-badge-main:has(.woo-badge-new) .woo-badge-new {
        display: none !important;
      }
      ${hideAllFollowingCSS}
      ${hideSearchHotBandCSS}
      ${hideNavIconsCSS}
    `;
  }

  function injectCSSWhenReady(cssText, styleId = '') {
    const tryInject = () => {
      const head = document.head || document.getElementsByTagName('head')[0];
      if (head) {
        const style = styleId
          ? document.getElementById(styleId) || document.createElement('style')
          : document.createElement('style');
        if (styleId) style.id = styleId;
        style.textContent = cssText;
        if (!style.isConnected) head.appendChild(style);
      } else {
        setTimeout(tryInject, 50);
      }
    };
    tryInject();
  }

  function updateRuntimeStyles() {
    injectCSSWhenReady(generateCSSRules(), 'wb-retro-runtime-style');
  }

  function applyRuntimeConfig(nextCfg = {}) {
    Object.assign(
      CONTENT_FILTER_CFG,
      CONTENT_FILTER_DEFAULTS,
      nextCfg && typeof nextCfg === 'object' ? nextCfg : {}
    );
    updateRuntimeStyles();
    restoreBlockedContentHideState(document);
    restoreRecognizedAds(document);
    restoreTimelineRecommendations(document);
    hideBlockedDOMPosts(document);
    compactVirtualScrollerGaps(document);
    scheduleBlockedDOMRefresh();
    nudgeTimelineLayout();
  }

  WB_INTERNAL.applyConfig = applyRuntimeConfig;

  function hasExplicitAdMarker(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    const truthyAdFlag = ['is_ad', 'isAd', 'is_ads', 'is_advert'].some(
      (key) =>
        obj[key] === true ||
        obj[key] === 1 ||
        String(obj[key] || '').toLowerCase() === 'true'
    );
    if (truthyAdFlag) return true;

    const adState = Number(obj.ad_state ?? obj.adState);
    if (Number.isFinite(adState) && adState > 0) return true;

    const hasAdID = ['ad_id', 'adid', 'adId'].some((key) => {
      const value = obj[key];
      return value !== undefined && value !== null && String(value).trim() !== '';
    });
    if (hasAdID) return true;

    // 时间线回包对广告微博还会附带两个标记：阅读类型为 adMblog，埋点串 mark 内
    // 含 mark_ad 段。两者与 isAd 同时出现，单独出现时同样表示广告投放。
    if (String(obj.readtimetype || '') === 'adMblog') return true;
    if (/(?:^|[^a-z0-9])mark_ad(?![a-z0-9])/i.test(String(obj.mark || ''))) {
      return true;
    }

    if (
      obj.ad_info ||
      obj.adInfo ||
      obj.ad_data ||
      obj.adData ||
      obj.promote_info ||
      obj.promoteInfo ||
      obj.advertise_info ||
      obj.advertiseInfo
    ) {
      return true;
    }

    return ['mblog', 'status'].some((key) => {
      const nested = obj[key];
      return (
        nested &&
        typeof nested === 'object' &&
        !Array.isArray(nested) &&
        hasExplicitAdMarker(nested)
      );
    });
  }

  const FILTERABLE_WEIBO_HOSTS = new Set([
    'weibo.com',
    'www.weibo.com',
    's.weibo.com',
  ]);

  function parseFirstPartyWeiboURL(url) {
    if (typeof url !== 'string' || !url) return null;
    try {
      const parsed = new URL(url, location.origin);
      return FILTERABLE_WEIBO_HOSTS.has(parsed.hostname.toLowerCase())
        ? parsed
        : null;
    } catch {
      return null;
    }
  }

  // 微博接口对广告微博下发 isAd / readtimetype / mark 三种标记，页面上没有对应的
  // 可见文案：角标文案为「广告」时微博渲染为图片，DOM 内既无文字也无稳定类名。
  // 广告识别因此分成两步：回包侧只读地登记广告微博 id，DOM 侧按 id 隐藏对应卡片。
  //
  // 观察层只读取响应副本，不改写返回内容、状态码和响应头。首页时间线的分页器依赖
  // 未经删减的 statuses 与游标，任何对回包内容的改写都会让原生组件回退旧缓存并
  // 永久保持加载状态，所以隐藏动作一律放在 DOM 侧完成。
  const AD_POST_ID_LIMIT = 3000;
  const AD_POST_OWNERS = new Map();
  const AD_OWNER_SELF = 'self';
  const AD_OWNER_FOLLOWING = 'following';
  const AD_OWNER_STRANGER = 'stranger';
  const OBSERVED_RESPONSE_PATH_RE = /^\/ajax\/(?:feed|statuses)\//i;
  const AD_PAYLOAD_MAX_DEPTH = 12;
  const POST_PERMALINK_RE = /^\/(\d{4,})\/([A-Za-z0-9]{6,})(?:[/?#]|$)/;

  // 当前登录用户 uid 用于区分「自己发布的广告」。微博把它写在页面全局 $CONFIG 上，
  // 脚本只读取该值；读不到时按未知处理，条目落入关注或非关注两类。
  let currentUserIDCache = '';
  function getCurrentUserID() {
    if (currentUserIDCache) return currentUserIDCache;
    try {
      const pageConfig = window.$CONFIG;
      if (!pageConfig || typeof pageConfig !== 'object') return '';
      const raw = pageConfig.user?.idstr ?? pageConfig.uid;
      const id = String(raw ?? '').trim();
      if (/^\d{4,}$/.test(id)) currentUserIDCache = id;
    } catch {
      /* 页面全局不可读时保持未知 */
    }
    return currentUserIDCache;
  }

  // 广告微博按作者与当前用户的关系分成三类，分别对应三个设置项。转发按外层微博的
  // 作者归类。user.following 缺失时归入「关注博主」：用户关闭该档时，无法判定关系
  // 的条目保持显示。
  function classifyAdPostOwner(item) {
    const user = item && typeof item === 'object' ? item.user : null;
    const authorID = String(user?.idstr ?? user?.id ?? '').trim();
    const selfID = getCurrentUserID();
    if (selfID && authorID && authorID === selfID) return AD_OWNER_SELF;
    if (user && user.following === false) return AD_OWNER_STRANGER;
    return AD_OWNER_FOLLOWING;
  }

  function isHiddenAdOwner(owner) {
    if (owner === AD_OWNER_SELF) {
      return CONTENT_FILTER_CFG.hideAdsFromSelf === true;
    }
    if (owner === AD_OWNER_STRANGER) {
      return CONTENT_FILTER_CFG.hideAdsFromStrangers !== false;
    }
    if (owner === AD_OWNER_FOLLOWING) {
      return CONTENT_FILTER_CFG.hideAdsFromFollowing !== false;
    }
    return false;
  }

  function rememberAdPost(id, owner) {
    const key = String(id || '').trim();
    if (!key) return;
    // 时间线可以无限翻页，登记表必须自行淘汰最早的条目，避免长时间浏览后无界增长。
    if (!AD_POST_OWNERS.has(key) && AD_POST_OWNERS.size >= AD_POST_ID_LIMIT) {
      const oldest = AD_POST_OWNERS.keys().next().value;
      if (oldest !== undefined) AD_POST_OWNERS.delete(oldest);
    }
    AD_POST_OWNERS.set(key, owner);
  }

  function getAdPostOwner(id) {
    const key = String(id || '').trim();
    return key ? AD_POST_OWNERS.get(key) || '' : '';
  }

  function collectAdPosts(payload, depth = 0) {
    if (!payload || typeof payload !== 'object' || depth > AD_PAYLOAD_MAX_DEPTH) {
      return;
    }
    if (Array.isArray(payload)) {
      payload.forEach((item) => collectAdPosts(item, depth + 1));
      return;
    }
    const postID = payload.mblogid;
    if (postID && hasExplicitAdMarker(payload)) {
      rememberAdPost(postID, classifyAdPostOwner(payload));
    }
    Object.keys(payload).forEach((key) => {
      if (isUnsafeObjectKey(key)) return;
      collectAdPosts(payload[key], depth + 1);
    });
  }

  function observeContentResponse(url, text) {
    if (typeof text !== 'string' || text.length < 2) return;
    if (CONTENT_FILTER_CFG.hideAds !== true) return;
    const parsed = parseFirstPartyWeiboURL(url);
    if (!parsed || !OBSERVED_RESPONSE_PATH_RE.test(parsed.pathname)) return;
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      return;
    }
    const knownBefore = AD_POST_OWNERS.size;
    try {
      collectAdPosts(payload);
    } catch {
      /* 观察层出错不得影响页面 */
    }
    // 回包可能晚于卡片渲染到达。登记表新增条目时补一次扫描，否则这批广告要等到
    // 下一次 DOM 变动才会被隐藏。
    if (AD_POST_OWNERS.size !== knownBefore) {
      queueBlockedDOMRefresh(document, 60);
    }
  }

  // 安装观察层。包装体把原生返回值原样交还调用方，读取一律走响应副本，避免消耗
  // 页面自身要读取的响应体。
  (function installContentResponseObserver() {
    const nativeFetch = window.fetch;
    if (typeof nativeFetch === 'function') {
      window.fetch = function wbObservedFetch(...args) {
        const result = Reflect.apply(nativeFetch, this, args);
        try {
          const input = args[0];
          const requestURL =
            typeof input === 'string'
              ? input
              : input && typeof input.url === 'string'
                ? input.url
                : String(input || '');
          Promise.resolve(result)
            .then((response) => {
              if (!response || typeof response.clone !== 'function') return;
              response
                .clone()
                .text()
                .then((text) => observeContentResponse(requestURL, text))
                .catch(() => {});
            })
            .catch(() => {});
        } catch {
          /* 观察层出错不得影响页面 */
        }
        return result;
      };
    }

    const nativeOpen = XMLHttpRequest.prototype.open;
    const nativeSend = XMLHttpRequest.prototype.send;
    if (typeof nativeOpen === 'function' && typeof nativeSend === 'function') {
      XMLHttpRequest.prototype.open = function wbObservedOpen(method, url) {
        try {
          this.__wbObservedURL = String(url || '');
        } catch {
          /* 观察层出错不得影响页面 */
        }
        return Reflect.apply(nativeOpen, this, arguments);
      };
      XMLHttpRequest.prototype.send = function wbObservedSend() {
        try {
          this.addEventListener('load', () => {
            try {
              // responseType 非空时 responseText 会抛错，读取前先确认是文本响应。
              const type = String(this.responseType || '');
              if (type !== '' && type !== 'text') return;
              observeContentResponse(this.__wbObservedURL, this.responseText);
            } catch {
              /* 观察层出错不得影响页面 */
            }
          });
        } catch {
          /* 观察层出错不得影响页面 */
        }
        return Reflect.apply(nativeSend, this, arguments);
      };
    }
  })();

  const DOM_UID_SELECTOR = [
    '[data-user-id]',
    '[data-user-card]',
    '[data-usercard-mid]',
    '[data-uid]',
    '[uid]',
    '[usercard]',
    '[data-usercard]',
    '[tbinfo*="ouid="]',
    '[action-type="reply"][action-data*="ouid="]',
    '[data-card*="uid"]',
    'a[href*="/u/"]',
    'a[href*="/p/100505"]',
    'a[href*="/n/"]',
    'a[nick-name]',
    '[nick-name]',
    'a[href*="weibo.com/"]',
  ].join(',');
  const DOM_POST_ROOT_SELECTOR = [
    'article',
    '.Feed_body_3R0rO',
    '[class*="Feed_body_"]',
    '[class*="Feed_wrap_"]',
    '[class*="Feed_card_"]',
    '.card-wrap',
    '[action-type="feed_list_item"]',
    '[node-type="feed_list_item"]',
  ].join(',');
  const COMMENT_CONTENT_ROOT_ATTR = 'data-__wb_comment_root_by_userscript';
  const DOM_COMMENT_ITEM_ROOT_SELECTOR = [
    '.card-review[comment_id]',
    '[comment_id]',
    '[comment-id]',
    '[data-comment-id]',
    '.wbpro-list > .item1',
    '.wbpro-list [class~="item1"]',
    '.wbpro-list .list2 > .item2',
    '.wbpro-list [class~="item2"]',
  ].join(',');
  const DOM_COMMENT_ROOT_SELECTOR = [
    `[${COMMENT_CONTENT_ROOT_ATTR}]`,
    DOM_COMMENT_ITEM_ROOT_SELECTOR,
    '[class*="Comment_wrap_"]',
    '[class*="Comment_item_"]',
    '[class*="CommentItem"]',
    '[class*="comment_wrap"]',
    '[class*="comment-item"]',
    '[class*="commentItem"]',
    '[class*="comment_item"]',
    '[action-type*="comment"]',
    '[node-type*="comment"]',
  ].join(',');
  const DOM_COMMENT_COLLECTION_SELECTOR = [
    '.wbpro-list',
    '[node-type="feed_list_commentList"]',
    '[node-type$="commentList"]',
    '[action-type$="commentList"]',
    '[class~="comment-list"]',
    '[class~="comment_list"]',
    '[class*="CommentList_"]',
    '[class*="commentList_"]',
    '[role="list"][aria-label*="评论"]',
  ].join(',');
  const DOM_USER_CARD_ITEM_ROOT_SELECTOR = [
    '.card-user-b',
    '.card-user-c',
    '[class*="UserCard_item_"]',
    '[class*="UserCardItem"]',
    '[class*="user-card-item"]',
    '[class*="user_card_item"]',
    '[class*="User_item_"]',
    '[class*="userItem_"]',
    '[data-user-id][role="listitem"]',
    '[data-uid][role="listitem"]',
  ].join(',');
  const DOM_INTERACTION_SURFACE_SELECTOR = [
    '[class*="RepostList"]',
    '[class*="repost-list"]',
    '[class*="repost_list"]',
    '[class*="LikeList"]',
    '[class*="like-list"]',
    '[class*="like_list"]',
    '[class*="AttitudeList"]',
    '[class*="attitude-list"]',
    '[class*="attitude_list"]',
    '[node-type*="repost_list"]',
    '[node-type*="like_list"]',
    '[action-type*="repost_list"]',
    '[action-type*="like_list"]',
    '[aria-label*="转发列表"]',
    '[aria-label*="点赞列表"]',
  ].join(',');
  const DOM_INTERACTION_ITEM_ROOT_SELECTOR = [
    DOM_USER_CARD_ITEM_ROOT_SELECTOR,
    '[role="listitem"]',
    'li',
  ].join(',');
  const USER_CARD_CONTENT_ROOT_ATTR =
    'data-__wb_user_card_root_by_userscript';
  const INTERACTION_CONTENT_ROOT_ATTR =
    'data-__wb_interaction_root_by_userscript';
  const SEARCH_RESULT_AUTHOR_SELECTOR = [
    '.card-feed .content > .info a.name[href]',
    '.card-feed .content > .info [nick-name]',
    '.card-feed .avator a[href]',
    '.card-feed .avatar a[href]',
    '.content > .info a.name[href]',
  ].join(',');
  const DOM_POST_AUTHOR_CARRIER_SELECTOR = [
    SEARCH_RESULT_AUTHOR_SELECTOR,
    '[class*="Feed_head_"] [class*="_name_"]',
    '[class*="Feed_header_"] [class*="_name_"]',
    '[class*="_author_"] [class*="_name_"]',
    '[class*="_userInfo_"] [class*="_name_"]',
    '[class*="_userinfo_"] [class*="_name_"]',
    'header [class*="_name_"]',
    'header a[nick-name][href]',
    'header a[href*="/u/"]',
    'header [usercard]',
    'header [data-user-card]',
    'header [data-usercard]',
  ].join(',');
  const DOM_COMMENT_AUTHOR_CARRIER_SELECTOR = [
    ':scope > .item1in > div:first-child a[href*="/u/"]',
    ':scope > .item1in > .con1 > .text > a:first-child[href]',
    ':scope > .item2in > div:first-child a[href*="/u/"]',
    ':scope > .item2in > .con2 > .text > a:first-child[href]',
    ':scope > .content > .txt a.name[href]',
    ':scope > .content > .txt a[nick-name][href]',
    ':scope > .con1 > .info a.name[href]',
    ':scope > .con1 > .info a[nick-name][href]',
    ':scope > .avator a[href]',
    ':scope > .avatar a[href]',
    '[class*="_author_"] [class*="_name_"]',
    '[class*="_header_"] [class*="_name_"]',
    'a.name[nick-name][href]',
    'a.name[usercard][href]',
    'a.name[data-user-card][href]',
    'a.name[data-usercard][href]',
  ].join(',');
  const DOM_CONTENT_ROOT_SELECTOR = [
    DOM_POST_ROOT_SELECTOR,
    DOM_COMMENT_ROOT_SELECTOR,
    DOM_USER_CARD_ITEM_ROOT_SELECTOR,
  ].join(',');
  const PRIMARY_CONTENT_ROOT_SELECTOR = [
    'article',
    '.card-wrap',
    '[action-type="feed_list_item"]',
    '[node-type="feed_list_item"]',
  ].join(',');

  async function addUIDToLocalBL(uid) {
    const id = String(uid || '').trim();
    if (!/^\d{5,}$/.test(id)) return false;
    const result = await mutateLocalBLStorage({ add: [id] });
    return result.added > 0;
  }

  function parseUIDFromRequestBody(body) {
    if (!body) return '';

    if (body instanceof URLSearchParams) {
      return body.get('uid') || '';
    }
    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      return body.get('uid') || '';
    }
    if (typeof body === 'string') {
      const text = body.trim();
      if (!text) return '';
      try {
        const json = JSON.parse(text);
        if (json?.uid) return String(json.uid);
      } catch {}
      try {
        return new URLSearchParams(text).get('uid') || '';
      } catch {}
      const m = text.match(/(?:^|[?&])uid=(\d{5,})/);
      return m ? m[1] : '';
    }
    if (typeof body === 'object' && body.uid) {
      return String(body.uid);
    }
    return '';
  }

  function parseUIDFromRequestURL(url) {
    try {
      return new URL(url, location.href).searchParams.get('uid') || '';
    } catch {
      const m = String(url || '').match(/(?:^|[?&])uid=(\d{5,})/);
      return m ? m[1] : '';
    }
  }

  function parseUIDFromRequest(url, body) {
    return parseUIDFromRequestBody(body) || parseUIDFromRequestURL(url);
  }

  async function didFilterRequestSucceed(res) {
    if (!res?.ok) return false;
    try {
      const data = await res.clone().json();
      return data?.ok !== 0;
    } catch {
      return true;
    }
  }
  const USER_CONTEXT_TARGET_SELECTOR = [
    '[data-user-id]',
    '[data-user-card]',
    '[data-usercard-mid]',
    '[data-uid]',
    '[uid]',
    '[usercard]',
    '[data-usercard]',
    '[nick-name]',
    'a[href*="/u/"]',
    'a[href*="/p/100505"]',
    'a[href*="/n/"]',
    'a[href*="//weibo.com/u/"]',
    'a[href*="//weibo.com/p/100505"]',
    'a[href*="//weibo.com/n/"]',
    '.woo-avatar-main',
    '.woo-avatar-img',
  ].join(',');
  const USER_CONTEXT_NAME_TARGET_SELECTOR = [
    '.card-feed .content > .info a.name[href]',
    '.content > .info a.name[nick-name][href]',
    '.card-user-c a.name[href]',
    '.card-user-b a.name[href]',
    'a.name[nick-name][href]',
    'a[nick-name][href]',
    'a[href][class*="_name_"]',
    '[class*="_name_"][data-user-id]',
    '[class*="_name_"][data-uid]',
    '[class*="_name_"][usercard]',
    '[class*="_name_"][data-user-card]',
    '[class*="_name_"][data-usercard]',
    'main [class*="_name_"]',
    '[usercard^="name=@"]',
    '[data-usercard^="name=@"]',
    '[data-user-card^="name=@"]',
    'header a[href=""]',
    'header a:not([href])',
  ].join(',');
  const USER_CONTEXT_AUTHOR_SCOPE_SELECTOR = [
    'header',
    '.card-feed .content > .info',
    '.content > .info',
    '.card-user-c',
    '.card-user-b',
    '[class*="_author_"]',
    '[class*="_userInfo_"]',
    '[class*="_userinfo_"]',
    '[class*="_user-info_"]',
  ].join(',');

  function getUserNameLabel(el) {
    if (!(el instanceof Element)) return '';
    const directLabel = cleanUserDisplayName(
      getNameFromElementAttributes(el) || getOwnDOMText(el)
    );
    if (directLabel) return directLabel;

    // 新版首页/分组时间线会把用户名放在
    // <a class="..._name_..."><span title="用户名">用户名</span></a> 中。
    const labelledChild = el.querySelector(
      ':scope > [title], :scope > [aria-label]'
    );
    if (!(labelledChild instanceof Element)) {
      return cleanUserDisplayName(el.textContent);
    }
    return cleanUserDisplayName(
      getNameFromElementAttributes(labelledChild) ||
        getOwnDOMText(labelledChild) ||
        labelledChild.textContent ||
        el.textContent
    );
  }

  function getUserNameContextTarget(target) {
    const el =
      target instanceof Element ? target : target?.parentElement || null;
    if (!el) return null;
    const candidate = el.closest(USER_CONTEXT_NAME_TARGET_SELECTOR);
    if (!(candidate instanceof Element)) return null;

    const label = getUserNameLabel(candidate);
    if (!label) return null;
    return candidate;
  }

  function extractDOMUIDs(el) {
    const uids = new Set();
    const addDirectUID = (value) => {
      const uid = String(value || '').trim();
      if (/^\d{5,}$/.test(uid)) uids.add(uid);
    };
    const addMatches = (value, re) => {
      const text = String(value || '');
      for (const m of text.matchAll(re)) {
        if (m[1]) uids.add(m[1]);
      }
    };

    addDirectUID(el.getAttribute('data-user-id'));
    addDirectUID(el.getAttribute('data-user-card'));
    addDirectUID(el.getAttribute('data-usercard-mid'));
    addDirectUID(el.getAttribute('data-uid'));
    addDirectUID(el.getAttribute('uid'));
    addDirectUID(el.getAttribute('usercard'));
    addDirectUID(el.getAttribute('data-usercard'));

    ['usercard', 'data-user-card', 'data-usercard'].forEach((attr) => {
      const value = el.getAttribute(attr);
      addMatches(value, /(?:^|[?&#;\s])id=(\d{5,})/g);
      addMatches(
        value,
        /(?:^|[?&#;\s])(?:uid|ouid|user_id|userId|profile_uid)=(\d{5,})/g
      );
    });

    [
      'usercard',
      'data-usercard',
      'data-user-card',
      'tbinfo',
      'suda-data',
      'diss-data',
      'data-card',
      'data-params',
    ].forEach((attr) => {
      const value = el.getAttribute(attr);
      addMatches(
        value,
        /(?:^|[?&#;\s])(?:uid|ouid|user_id|userId|profile_uid)=(\d{5,})/g
      );
    });

    // action-data is an event payload, not a general content-owner signal.
    // Only reply controls use it here as a scoped comment-author carrier.
    if (el.getAttribute('action-type') === 'reply') {
      addMatches(
        el.getAttribute('action-data'),
        /(?:^|[?&#;\s])ouid=(\d{5,})/g
      );
    }

    const href = el.getAttribute('href');
    addMatches(href, /\/u\/(\d{5,})/g);
    addMatches(href, /\/p\/100505(\d{5,})/g);
    addMatches(href, /^\/(\d{5,})(?:[/?#]|$)/g);
    addMatches(href, /weibo\.com\/(\d{5,})(?:[/?#]|$)/g);

    return uids;
  }

  function collectScopedUserContextUIDs(scope) {
    const candidates = [];
    const seenElements = new Set();
    const addCandidate = (candidate) => {
      if (!(candidate instanceof Element) || seenElements.has(candidate)) {
        return;
      }
      seenElements.add(candidate);
      candidates.push(candidate);
    };

    addCandidate(scope);
    scope
      ?.querySelectorAll?.(`${DOM_UID_SELECTOR}, a[href]`)
      .forEach(addCandidate);

    const records = [];
    candidates.forEach((candidate) => {
      const labels = [
        getNameFromElementAttributes(candidate),
        getOwnDOMText(candidate),
        candidate.getAttribute?.('alt'),
      ];
      const link = candidate.closest?.('a');
      if (link && link !== candidate) {
        labels.push(
          getNameFromElementAttributes(link),
          getOwnDOMText(link)
        );
      }
      const labelledChild = candidate.querySelector?.(
        ':scope > [title], :scope > [aria-label]'
      );
      if (labelledChild) {
        labels.push(
          getNameFromElementAttributes(labelledChild),
          getOwnDOMText(labelledChild)
        );
      }
      extractDOMUIDs(candidate).forEach((uid) => {
        records.push({ uid, labels });
      });
    });
    return records;
  }

  function chooseScopedUserContextUID(
    records,
    expectedName = '',
    allowUniqueFallback = false
  ) {
    const normalizedExpectedName = cleanUserDisplayName(expectedName);
    if (normalizedExpectedName) {
      const matchingUIDs = new Set();
      records.forEach(({ uid, labels = [] }) => {
        if (
          labels.some(
            (label) =>
              cleanUserDisplayName(label) === normalizedExpectedName
          )
        ) {
          matchingUIDs.add(uid);
        }
      });
      if (matchingUIDs.size === 1) return [...matchingUIDs][0];
    }

    const scopedUIDs = new Set(records.map(({ uid }) => uid));
    if (allowUniqueFallback && scopedUIDs.size === 1) {
      return [...scopedUIDs][0];
    }
    return '';
  }

  function getScopedUserContextUID(target, expectedName = '') {
    if (!(target instanceof Element)) return '';
    const scopes = [];
    const addScope = (scope, allowUniqueFallback) => {
      if (!(scope instanceof Element)) return;
      const existing = scopes.find((item) => item.scope === scope);
      if (existing) {
        existing.allowUniqueFallback ||= allowUniqueFallback;
      } else {
        scopes.push({ scope, allowUniqueFallback });
      }
    };

    addScope(target.closest(USER_CONTEXT_AUTHOR_SCOPE_SELECTOR), true);
    addScope(target.closest(DOM_COMMENT_ROOT_SELECTOR), false);
    addScope(target.closest('[role="listitem"], li'), false);

    for (const { scope, allowUniqueFallback } of scopes) {
      const records = collectScopedUserContextUIDs(scope);
      if (!records.length) continue;

      const resolvedUID = chooseScopedUserContextUID(
        records,
        expectedName,
        allowUniqueFallback
      );
      if (resolvedUID) return resolvedUID;
    }
    return '';
  }

  function normDOMText(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }

  function isRelationshipListPage() {
    return /^\/u\/page\/follow\/\d+/.test(location.pathname);
  }

  function syncRelationshipPageMode() {
    const root = document.documentElement;
    if (!root) return;
    if (isRelationshipListPage()) {
      root.setAttribute(RELATIONSHIP_PAGE_ATTR, '1');
    } else {
      root.removeAttribute(RELATIONSHIP_PAGE_ATTR);
    }
  }

  function restoreHiddenRelationshipItems(root = document, options = {}) {
    syncRelationshipPageMode();
    restoreTimelineRecommendations(document);
    if (!isRelationshipListPage() || !document.querySelectorAll) return;
    document
      .querySelectorAll(`[${TIMELINE_LOADER_NUDGE_ATTR}]`)
      .forEach((card) => card.removeAttribute(TIMELINE_LOADER_NUDGE_ATTR));
    const nodes = new Set();
    const collect = (scope) => {
      if (!scope || !scope.querySelectorAll) return;
      if (
        scope instanceof Element &&
        scope.matches(BLOCKED_CONTENT_HIDE_SELECTOR)
      ) {
        nodes.add(scope);
      }
      scope
        .querySelectorAll(BLOCKED_CONTENT_HIDE_SELECTOR)
        .forEach((el) => nodes.add(el));
    };
    collect(root);
    if (root !== document) collect(document);
    nodes.forEach((el) => {
      clearOwnBlockedContentHideState(el);
    });
    if (options.reschedule === false) return;
    const rerun = () =>
      restoreHiddenRelationshipItems(document, { reschedule: false });
    WB_INTERNAL.dom.schedule('relationship-restore-primary', rerun, 16);
    WB_INTERNAL.dom.schedule('relationship-restore-followup', rerun, 240);
  }

  function clearOwnBlockedContentHideState(el) {
    if (!(el instanceof Element)) return;
    el.removeAttribute(BLOCKED_CONTENT_HIDE_ATTR);
    el.removeAttribute(BLOCKED_CONTENT_UID_ATTR);
    el.removeAttribute(COMMENT_CONTENT_ROOT_ATTR);
    el.removeAttribute(USER_CARD_CONTENT_ROOT_ATTR);
    el.removeAttribute(INTERACTION_CONTENT_ROOT_ATTR);
    const originalAria = el.getAttribute(BLOCKED_CONTENT_ORIGINAL_ARIA_ATTR);
    if (originalAria === BLOCKED_CONTENT_ARIA_ABSENT) {
      el.removeAttribute('aria-hidden');
    } else if (originalAria !== null) {
      el.setAttribute('aria-hidden', originalAria);
    } else if (el.getAttribute('aria-hidden') === 'true') {
      // Compatibility with cards marked by builds that predate exact ARIA
      // restoration. Never remove a non-plugin value.
      el.removeAttribute('aria-hidden');
    }
    el.removeAttribute(BLOCKED_CONTENT_ORIGINAL_ARIA_ATTR);
    requestNativeVirtualItemRemeasure(el);
  }

  function clearBlockedContentHideState(root) {
    if (!(root instanceof Element)) return;
    const nodes = [root];
    root
      .querySelectorAll?.(BLOCKED_CONTENT_HIDE_SELECTOR)
      .forEach((el) => nodes.push(el));
    nodes.forEach((el) => clearOwnBlockedContentHideState(el));
  }

  function getOwnDOMText(el) {
    if (!(el instanceof Element)) return '';
    let text = '';
    el.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) text += node.textContent || '';
    });
    return normDOMText(text);
  }

  const BAD_USER_NAME_TEXT = new Set([
    '关注',
    '已关注',
    '互相关注',
    '特别关注',
    '取消关注',
    '粉丝',
    '微博',
    '转发',
    '评论',
    '赞',
    '收藏',
    '分享',
    '举报',
  ]);

  function cleanUserDisplayName(text) {
    const name = normDOMText(text).replace(/^@+/, '');
    if (!name || BAD_USER_NAME_TEXT.has(name)) return '';
    if (name.length > 32) return '';
    return name;
  }

  function pushNameCandidate(candidates, text, score) {
    const name = cleanUserDisplayName(text);
    if (name) candidates.push({ name, score });
  }

  function getElementsForUID(root, uid) {
    if (!(root instanceof Element) || !uid) return [];
    const elements = [];
    const collect = (item) => {
      if (
        item instanceof Element &&
        extractDOMUIDs(item).has(String(uid))
      ) {
        elements.push(item);
      }
    };
    collect(root);
    root.querySelectorAll(DOM_UID_SELECTOR).forEach(collect);
    return elements;
  }

  function getNameFromElementAttributes(el) {
    return (
      el.getAttribute?.('nick-name') ||
      el.getAttribute?.('title') ||
      el.getAttribute?.('aria-label') ||
      ''
    );
  }

  function normalizeProfileURL(href, uid) {
    const raw = String(href || '').trim();
    if (!raw || /^(?:javascript:|#)/i.test(raw)) {
      return uid ? `https://weibo.com/u/${uid}` : '';
    }
    const isProfilePath = (pathname) =>
      /^\/u\/\d{5,}(?:\/|$)/.test(pathname) ||
      /^\/p\/100505\d{5,}(?:\/|$)/.test(pathname) ||
      /^\/n\/[^/?#]+/.test(pathname) ||
      /^\/\d{5,}(?:\/|$)/.test(pathname);
    try {
      if (/^\/(?:u|p|n)\//.test(raw)) {
        const relative = new URL(raw, 'https://weibo.com');
        return isProfilePath(relative.pathname)
          ? relative.href
          : uid
            ? `https://weibo.com/u/${uid}`
            : '';
      }
      if (/^\/\/(?:www\.)?weibo\.com\//.test(raw)) {
        const protocolRelative = new URL(`https:${raw}`);
        return isProfilePath(protocolRelative.pathname)
          ? protocolRelative.href
          : uid
            ? `https://weibo.com/u/${uid}`
            : '';
      }
      const url = new URL(raw, location.href);
      if (
        url.hostname === 's.weibo.com' &&
        /^\/(?:u|p|n)\//.test(url.pathname)
      ) {
        url.hostname = 'weibo.com';
      }
      const hostname = url.hostname.replace(/^www\./, '');
      if (hostname !== 'weibo.com') {
        return uid ? `https://weibo.com/u/${uid}` : '';
      }
      return isProfilePath(url.pathname)
        ? url.href
        : uid
          ? `https://weibo.com/u/${uid}`
          : '';
    } catch {
      return uid ? `https://weibo.com/u/${uid}` : '';
    }
  }

  const PROFILE_LINK_SELECTOR = [
    'a[href*="/u/"]',
    'a[href*="/p/100505"]',
    'a[href*="/n/"]',
    'a[href*="//weibo.com/u/"]',
    'a[href*="//weibo.com/p/100505"]',
    'a[href*="//weibo.com/n/"]',
    'a[href*="weibo.com/"]',
  ].join(',');

  function getProfileURL(el, uid, root = null) {
    const link =
      el.closest('a[href]') ||
      root?.querySelector?.(PROFILE_LINK_SELECTOR) ||
      null;
    const href = link?.getAttribute('href') || '';
    return normalizeProfileURL(href, uid);
  }

  function isUserIdentityCarrierForUID(el, uid) {
    return (
      el instanceof Element &&
      el.matches(
        `${USER_CONTEXT_TARGET_SELECTOR},${USER_CONTEXT_NAME_TARGET_SELECTOR}`
      ) &&
      extractDOMUIDs(el).has(String(uid || '').trim())
    );
  }

  function getUserDisplayName(el, uid, root = null) {
    const candidates = [];
    const userRoots = [el, root, el.closest('a[href]')].filter(Boolean);
    let parent = el.parentElement;
    let depth = 0;
    while (
      parent &&
      parent !== document.body &&
      parent !== document.documentElement &&
      depth < 5
    ) {
      userRoots.push(parent);
      parent = parent.parentElement;
      depth++;
    }

    userRoots.forEach((item) => {
      getElementsForUID(item, uid)
        .filter((candidateEl) =>
          isUserIdentityCarrierForUID(candidateEl, uid)
        )
        .forEach((candidateEl) => {
          // A post permalink also contains the author's UID, but its visible
          // text is a timestamp such as “10小时前”. Only explicit identity
          // carriers may provide a display name, and their complete label is
          // preferred so avatar aria-labels and nested name spans both work.
          pushNameCandidate(candidates, getUserNameLabel(candidateEl), 100);
          pushNameCandidate(
            candidates,
            getNameFromElementAttributes(candidateEl),
            80
          );
        });
    });

    const directNameSource =
      el.closest('[nick-name]') ||
      el.closest('[title]') ||
      el.closest('[aria-label]');
    if (directNameSource) {
      pushNameCandidate(
        candidates,
        getNameFromElementAttributes(directNameSource),
        70
      );
    }

    pushNameCandidate(candidates, getOwnDOMText(el), 60);
    pushNameCandidate(candidates, getNameFromElementAttributes(el), 50);

    candidates.sort(
      (a, b) => b.score - a.score || a.name.length - b.name.length
    );
    return candidates[0]?.name || uid;
  }

  function firstDOMUID(...elements) {
    for (const el of elements) {
      if (!(el instanceof Element)) continue;
      const uid = [...extractDOMUIDs(el)][0];
      if (uid) return uid;
    }
    return '';
  }

  function firstUIDWithinCarrier(carrier) {
    if (!(carrier instanceof Element)) return '';
    const directUID = firstDOMUID(carrier);
    if (directUID) return directUID;
    for (const candidate of carrier.querySelectorAll(DOM_UID_SELECTOR)) {
      const uid = firstDOMUID(candidate);
      if (uid) return uid;
    }
    return '';
  }

  function getPostOwnerUID(root) {
    if (!isPostContentRoot(root)) return '';
    if (isPersonCollectionRoot(root)) return '';
    const directUID = firstDOMUID(root);
    if (directUID) return directUID;

    for (const carrier of root.querySelectorAll(
      DOM_POST_AUTHOR_CARRIER_SELECTOR
    )) {
      const nestedComment = carrier.closest(DOM_COMMENT_ROOT_SELECTOR);
      if (nestedComment && nestedComment !== root) continue;
      const nestedUserCard = carrier.closest(
        DOM_USER_CARD_ITEM_ROOT_SELECTOR
      );
      if (nestedUserCard && nestedUserCard !== root) continue;
      const nestedPost = carrier.closest(DOM_POST_ROOT_SELECTOR);
      if (nestedPost && nestedPost !== root) continue;
      const uid = firstUIDWithinCarrier(carrier);
      if (uid) return uid;
    }
    return '';
  }

  function getCommentOwnerUID(root) {
    if (
      !(root instanceof Element) ||
      (!root.matches(DOM_COMMENT_ITEM_ROOT_SELECTOR) &&
        !root.matches(DOM_COMMENT_ROOT_SELECTOR))
    ) {
      return '';
    }
    const directUID = firstDOMUID(root);
    if (directUID) return directUID;

    for (const carrier of root.querySelectorAll(
      DOM_COMMENT_AUTHOR_CARRIER_SELECTOR
    )) {
      const nestedComment = carrier.closest(DOM_COMMENT_ROOT_SELECTOR);
      if (nestedComment && nestedComment !== root) continue;
      const uid = firstUIDWithinCarrier(carrier);
      if (uid) return uid;
    }
    return '';
  }

  function getUniqueUnnestedUID(root) {
    if (!(root instanceof Element)) return '';
    const directUID = firstDOMUID(root);
    if (directUID) return directUID;
    const uids = new Set();
    for (const candidate of root.querySelectorAll(DOM_UID_SELECTOR)) {
      const nestedComment = candidate.closest(DOM_COMMENT_ROOT_SELECTOR);
      if (nestedComment && nestedComment !== root) continue;
      const nestedPost = candidate.closest(DOM_POST_ROOT_SELECTOR);
      if (nestedPost && nestedPost !== root) continue;
      const nestedUserCard = candidate.closest(
        DOM_USER_CARD_ITEM_ROOT_SELECTOR
      );
      if (nestedUserCard && nestedUserCard !== root) continue;
      extractDOMUIDs(candidate).forEach((uid) => uids.add(uid));
      if (uids.size > 1) return '';
    }
    return uids.size === 1 ? [...uids][0] : '';
  }

  function getUserCardOwnerUID(root) {
    if (!(root instanceof Element)) return '';
    const directUID = firstDOMUID(root);
    if (directUID) return directUID;
    const mainCarrier = root.querySelector(
      [
        ':scope > a.name[href]',
        ':scope > .content a.name[href]',
        ':scope > .info a.name[href]',
        'a.name[nick-name][href]',
        'a.name[usercard][href]',
        'a.name[data-user-card][href]',
        'a.name[data-usercard][href]',
        '[class*="_name_"][data-user-id]',
        '[class*="_name_"][data-uid]',
        '[class*="_name_"] a[href*="/u/"]',
      ].join(',')
    );
    return firstUIDWithinCarrier(mainCarrier) || getUniqueUnnestedUID(root);
  }

  function isInteractionContentRoot(root) {
    return (
      root instanceof Element &&
      (root.hasAttribute(INTERACTION_CONTENT_ROOT_ATTR) ||
        !!root.closest(DOM_INTERACTION_SURFACE_SELECTOR))
    );
  }

  function isUserCardContentRoot(root) {
    return (
      root instanceof Element &&
      (root.hasAttribute(USER_CARD_CONTENT_ROOT_ATTR) ||
        root.matches(DOM_USER_CARD_ITEM_ROOT_SELECTOR))
    );
  }

  function isPersonCollectionRoot(root) {
    if (!(root instanceof Element)) return false;
    const items = Array.from(
      root.querySelectorAll(DOM_USER_CARD_ITEM_ROOT_SELECTOR)
    ).filter(
      (candidate, _index, candidates) =>
        !candidates.some(
          (other) => other !== candidate && other.contains(candidate)
        )
    );
    return items.length > 1;
  }

  function markPersonItemRoot(root, interaction = false) {
    if (!(root instanceof Element)) return root;
    root.setAttribute(
      interaction
        ? INTERACTION_CONTENT_ROOT_ATTR
        : USER_CARD_CONTENT_ROOT_ATTR,
      '1'
    );
    return root;
  }

  function findPersonItemRootForUID(el, uid) {
    if (!(el instanceof Element) || !uid) return null;

    const explicitUserCard = el.closest(DOM_USER_CARD_ITEM_ROOT_SELECTOR);
    if (
      explicitUserCard &&
      !isPostContentRoot(explicitUserCard) &&
      getUserCardOwnerUID(explicitUserCard) === uid &&
      !isOverBroadHideRoot(explicitUserCard, el)
    ) {
      return markPersonItemRoot(
        explicitUserCard,
        !!explicitUserCard.closest(DOM_INTERACTION_SURFACE_SELECTOR)
      );
    }

    const interactionSurface = el.closest(
      DOM_INTERACTION_SURFACE_SELECTOR
    );
    if (!interactionSurface) return null;
    const interactionItem = el.closest(
      DOM_INTERACTION_ITEM_ROOT_SELECTOR
    );
    if (
      interactionItem &&
      interactionItem !== interactionSurface &&
      interactionSurface.contains(interactionItem) &&
      !isPostContentRoot(interactionItem) &&
      getUserCardOwnerUID(interactionItem) === uid &&
      !isOverBroadHideRoot(interactionItem, el)
    ) {
      return markPersonItemRoot(interactionItem, true);
    }
    return null;
  }

  function getTopLevelSemanticRoots(root) {
    if (!(root instanceof Element)) return [];
    const selector = [
      DOM_POST_ROOT_SELECTOR,
      DOM_COMMENT_ITEM_ROOT_SELECTOR,
      DOM_USER_CARD_ITEM_ROOT_SELECTOR,
      `[${USER_CARD_CONTENT_ROOT_ATTR}]`,
      `[${INTERACTION_CONTENT_ROOT_ATTR}]`,
    ].join(',');
    return Array.from(root.querySelectorAll(selector)).filter(
      (candidate, _index, candidates) =>
        !candidates.some(
          (other) => other !== candidate && other.contains(candidate)
        )
    );
  }

  function getContentRootOwnerUID(root) {
    if (!(root instanceof Element)) return '';
    if (
      root.matches(DOM_COMMENT_ITEM_ROOT_SELECTOR) ||
      isCommentContentRoot(root)
    ) {
      return getCommentOwnerUID(root);
    }
    if (
      isInteractionContentRoot(root) ||
      isUserCardContentRoot(root)
    ) {
      return getUserCardOwnerUID(root);
    }
    if (isPostContentRoot(root)) return getPostOwnerUID(root);
    const directUID = firstDOMUID(root);
    if (directUID) return directUID;

    const semanticRoots = getTopLevelSemanticRoots(root);
    if (semanticRoots.length !== 1) return '';
    return getContentRootOwnerUID(semanticRoots[0]);
  }

  function contentRootOwnedByUID(root, uid) {
    const id = String(uid || '').trim();
    return /^\d{5,}$/.test(id) && getContentRootOwnerUID(root) === id;
  }

  function getPrimaryContentRoots(el) {
    if (!(el instanceof Element)) return [];
    const nodes = [];
    if (el.matches(PRIMARY_CONTENT_ROOT_SELECTOR)) nodes.push(el);
    el.querySelectorAll(PRIMARY_CONTENT_ROOT_SELECTOR).forEach((node) => {
      nodes.push(node);
    });
    return nodes.filter(
      (node, index) =>
        nodes.indexOf(node) === index &&
        !nodes.some(
          (other) => other !== node && other.contains(node)
        )
    );
  }

  function containsOnlyThisContentRoot(parent, child) {
    if (!(parent instanceof Element) || !(child instanceof Element)) {
      return false;
    }
    const roots = getPrimaryContentRoots(parent);
    if (roots.length !== 1) return false;
    const root = roots[0];
    return root === child || root.contains(child) || child.contains(root);
  }

  function isHardHideBoundary(el) {
    return (
      !(el instanceof Element) ||
      el === document.body ||
      el === document.documentElement ||
      el.matches(
        `main, aside, nav, [role="main"], #app, ${VIRTUAL_WRAPPER_SELECTOR}`
      )
    );
  }

  function isOverBroadHideRoot(el, child = null) {
    if (!(el instanceof Element)) return true;
    if (isHardHideBoundary(el)) return true;
    if (
      el.matches(
        'article, .card-wrap, [action-type="feed_list_item"], [node-type="feed_list_item"]'
      )
    ) {
      return false;
    }
    if (child && containsOnlyThisContentRoot(el, child)) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    if (!rect.width && !rect.height) return false;
    if (rect.width > window.innerWidth * 0.92) return true;
    if (rect.height > Math.max(window.innerHeight * 0.75, 720)) return true;
    return false;
  }

  function looksLikeContentRoot(el) {
    if (!(el instanceof Element)) return false;
    if (el.matches('a, button, svg, path, img')) return false;
    const cls = String(el.className || '');
    const attrText = [
      el.getAttribute('action-type'),
      el.getAttribute('node-type'),
      el.getAttribute('data-testid'),
      el.getAttribute('role'),
    ]
      .filter(Boolean)
      .join(' ');
    if (
      /Feed|feed|Comment|comment|card|Card|item|Item|wbpro-scroller/i.test(
        `${cls} ${attrText}`
      )
    ) {
      return true;
    }
    const children = Array.from(el.children);
    if (
      children.some((child) => child.matches?.('.woo-divider-main')) ||
      el.nextElementSibling?.matches?.('.woo-divider-main') ||
      el.previousElementSibling?.matches?.('.woo-divider-main')
    ) {
      return true;
    }
    const text = normDOMText(el.textContent);
    return text.length > 30 && el.children.length >= 2;
  }

  function isPostContentRoot(el) {
    return (
      el instanceof Element &&
      el.matches(DOM_POST_ROOT_SELECTOR) &&
      !el.matches(DOM_COMMENT_ROOT_SELECTOR)
    );
  }

  function isUnsafePostRootForUID(root, uid) {
    if (!isPostContentRoot(root) || !uid) return false;
    return getPostOwnerUID(root) !== String(uid);
  }

  function looksLikeCommentRoot(el, source = null) {
    if (!(el instanceof Element)) return false;
    if (isHardHideBoundary(el) || isPostContentRoot(el)) return false;
    const marker = [
      el.className,
      el.getAttribute('action-type'),
      el.getAttribute('node-type'),
      el.getAttribute('data-testid'),
      el.getAttribute('role'),
    ]
      .filter(Boolean)
      .join(' ');
    if (/comment|reply|Comment|Reply|评论|回复/.test(marker)) return true;

    const rect = el.getBoundingClientRect();
    if (
      rect.height <= 0 ||
      rect.height > Math.min(window.innerHeight * 0.65, 560)
    ) {
      return false;
    }
    if (source && !el.contains(source)) return false;
    const text = normDOMText(el.textContent);
    if (!text || text.length > 1200) return false;
    const hasCommentAction = /回复|赞|删除|举报|展开|查看/.test(text);
    const hasSiblingDivider =
      el.nextElementSibling?.matches?.('.woo-divider-main') ||
      el.previousElementSibling?.matches?.('.woo-divider-main');
    return hasCommentAction || hasSiblingDivider;
  }

  function markCommentRoot(root) {
    if (root instanceof Element) {
      root.setAttribute(COMMENT_CONTENT_ROOT_ATTR, '1');
    }
    return root;
  }

  function isCommentCollectionRoot(el) {
    if (!(el instanceof Element)) return false;
    if (el.matches(DOM_COMMENT_COLLECTION_SELECTOR)) return true;
    const directCommentItems = Array.from(el.children || []).filter((child) =>
      child.matches?.(DOM_COMMENT_ITEM_ROOT_SELECTOR)
    );
    return directCommentItems.length > 1;
  }

  function isCommentContentRoot(el) {
    return (
      el instanceof Element &&
      el.matches(DOM_COMMENT_ROOT_SELECTOR) &&
      !isCommentCollectionRoot(el)
    );
  }

  function isInsideCommentContentRoot(el) {
    return el instanceof Element && !!el.closest(DOM_COMMENT_ROOT_SELECTOR);
  }

  function hasHiddenNonCommentContent(root = document) {
    if (isRelationshipListPage()) return false;
    if (!root || !root.querySelectorAll) return false;
    const nodes = [];
    if (root instanceof Element && root.matches(HIDDEN_FEED_CONTENT_SELECTOR)) {
      nodes.push(root);
    }
    root
      .querySelectorAll(HIDDEN_FEED_CONTENT_SELECTOR)
      .forEach((node) => nodes.push(node));
    return nodes.some((node) => !isInsideCommentContentRoot(node));
  }

  const COMMENT_SURFACE_SELECTOR = [
    '.wbpro-list',
    '[class*="Comment_"]',
    '[class*="comment_"]',
    '[class*="comment-"]',
    '[data-testid*="comment"]',
    '[aria-label*="评论"]',
    '[action-type*="comment"]',
    '[node-type*="comment"]',
  ].join(',');

  function isInsideCommentSurface(el) {
    return el instanceof Element && !!el.closest(COMMENT_SURFACE_SELECTOR);
  }

  function findCommentRootForUID(el, uid) {
    if (!(el instanceof Element) || !uid || isRelationshipListPage()) {
      return null;
    }
    if (
      el.closest(
        '.card-user-b, .card-user-c, [class*="UserCard"], [class*="user-card"], [class*="user_card"]'
      )
    ) {
      return null;
    }
    const explicitItem = el.closest(DOM_COMMENT_ITEM_ROOT_SELECTOR);
    if (
      explicitItem &&
      getCommentOwnerUID(explicitItem) === uid &&
      !isOverBroadHideRoot(explicitItem, el)
    ) {
      return markCommentRoot(explicitItem);
    }
    const explicit = el.closest(DOM_COMMENT_ROOT_SELECTOR);
    if (
      explicit &&
      !isCommentCollectionRoot(explicit) &&
      getCommentOwnerUID(explicit) === uid &&
      !isOverBroadHideRoot(explicit, el)
    ) {
      return markCommentRoot(explicit);
    }
    // 首页微博作者栏与评论项使用相似的 flex 结构。没有明确评论区域
    // 上下文时，禁止把昵称栏逐层提升成“评论容器”。
    if (!isInsideCommentSurface(el)) return null;

    let fallback = null;
    let cur = el.parentElement;
    let depth = 0;
    while (
      cur &&
      cur !== document.body &&
      cur !== document.documentElement &&
      depth < 10
    ) {
      if (isPostContentRoot(cur) || cur.matches(VIRTUAL_VIEW_SELECTOR)) break;
      if (
        !isCommentCollectionRoot(cur) &&
        getCommentOwnerUID(cur) === uid &&
        !isOverBroadHideRoot(cur, el) &&
        looksLikeCommentRoot(cur, el)
      ) {
        return markCommentRoot(cur);
      }
      if (
        !fallback &&
        !isCommentCollectionRoot(cur) &&
        getCommentOwnerUID(cur) === uid &&
        !isOverBroadHideRoot(cur, el) &&
        cur.children.length >= 2
      ) {
        fallback = cur;
      }
      cur = cur.parentElement;
      depth++;
    }
    return fallback ? markCommentRoot(fallback) : null;
  }

  function findContentRootForUID(el, uid) {
    if (!(el instanceof Element) || !uid || isRelationshipListPage()) {
      return null;
    }

    const commentRoot = findCommentRootForUID(el, uid);
    if (commentRoot) return commentRoot;
    const personItemRoot = findPersonItemRootForUID(el, uid);
    if (personItemRoot) return personItemRoot;
    // A user identity found inside a comment surface must never fall back to
    // the enclosing post. If an individual comment boundary is unknown, fail
    // closed and leave the DOM visible rather than hiding the blogger's post.
    if (isInsideCommentSurface(el)) return null;

    const explicit = el.closest(DOM_CONTENT_ROOT_SELECTOR);
    if (
      explicit &&
      !isCommentCollectionRoot(explicit) &&
      contentRootOwnedByUID(explicit, uid) &&
      !isOverBroadHideRoot(explicit, el)
    ) {
      return explicit;
    }

    let cur = el.parentElement;
    let depth = 0;
    while (
      cur &&
      cur !== document.body &&
      cur !== document.documentElement &&
      depth < 10
    ) {
      if (
        !isCommentCollectionRoot(cur) &&
        contentRootOwnedByUID(cur, uid) &&
        !isOverBroadHideRoot(cur, el) &&
        looksLikeContentRoot(cur)
      ) {
        return cur;
      }
      cur = cur.parentElement;
      depth++;
    }

    return null;
  }

  function shouldPromoteFeedShell(parent, child) {
    if (!(parent instanceof Element) || !(child instanceof Element)) return false;
    if (parent === document.body || parent === document.documentElement) {
      return false;
    }
    if (
      parent.matches(
        `main, aside, nav, [role="main"], ${VIRTUAL_WRAPPER_SELECTOR}`
      )
    ) {
      return false;
    }
    if (isOverBroadHideRoot(parent, child)) return false;

    const cls = String(parent.className || '');
    const directElementChildren = Array.from(parent.children).filter(
      (item) => item instanceof Element
    );
    const meaningfulChildren = directElementChildren.filter((item) => {
      if (item === child) return true;
      if (item.matches?.('style, script, .woo-divider-main')) return false;
      const text = normDOMText(item.textContent);
      if (!text && item.getBoundingClientRect().height <= 4) return false;
      return true;
    });
    const hasFeedShellClass =
      /vue-recycle-scroller__item-view|wbpro-scroller-item|feed_list_item|Feed_item|FeedItem|card-wrap|(?:^|\s)_[\w-]*(?:feed|item|card)[\w-]*_/i.test(
        cls
      );
    const isSingleChildShell =
      meaningfulChildren.length === 1 && meaningfulChildren[0] === child;
    const hasInlineLayoutReservation =
      parent.hasAttribute('style') &&
      /(?:height|min-height|transform)\s*:/i.test(parent.getAttribute('style'));

    return hasFeedShellClass || isSingleChildShell || hasInlineLayoutReservation;
  }

  function isEligibleVirtualScrollerItem(item) {
    if (!(item instanceof Element)) return false;
    if (
      item.matches(FLOATING_VIDEO_PLAYER_SELECTOR) ||
      item.closest(FLOATING_VIDEO_PLAYER_SELECTOR)
    ) {
      return false;
    }
    const position = getComputedStyle(item).position;
    return position !== 'fixed' && position !== 'sticky';
  }

  function findHideShell(root) {
    if (!(root instanceof Element)) return null;
    if (isCommentCollectionRoot(root)) return null;
    const commentRoot = root.closest(DOM_COMMENT_ROOT_SELECTOR);
    if (
      commentRoot &&
      !isCommentCollectionRoot(commentRoot) &&
      isEligibleVirtualScrollerItem(commentRoot) &&
      !isOverBroadHideRoot(commentRoot, root)
    ) {
      return commentRoot;
    }

    const virtualView = root.closest(VIRTUAL_VIEW_SELECTOR);
    if (
      (isUserCardContentRoot(root) ||
        isInteractionContentRoot(root)) &&
      !virtualView
    ) {
      return isEligibleVirtualScrollerItem(root) &&
        !isOverBroadHideRoot(root)
        ? root
        : null;
    }
    if (
      virtualView &&
      isEligibleVirtualScrollerItem(virtualView) &&
      !isOverBroadHideRoot(virtualView, root)
    ) {
      // Vue RecycleScroller owns the outer item view's transform and height.
      // Hiding or repositioning that node makes the userscript race Vue while
      // scrolling. Hide its direct content shell instead so DynamicScroller's
      // native size observer can collapse the row and recycle it safely.
      let target =
        root === virtualView ? virtualView.firstElementChild : root;
      if (!(target instanceof Element)) return null;
      while (
        target.parentElement &&
        target.parentElement !== virtualView
      ) {
        target = target.parentElement;
      }
      return target === virtualView ? null : target;
    }

    const explicitShell = root.closest(VIRTUAL_ITEM_SELECTOR);
    if (
      explicitShell &&
      isEligibleVirtualScrollerItem(explicitShell) &&
      !isOverBroadHideRoot(explicitShell, root)
    ) {
      return explicitShell;
    }

    let target = root;
    let cur = root.parentElement;
    let depth = 0;
    while (
      cur &&
      cur !== document.body &&
      cur !== document.documentElement &&
      depth < 8
    ) {
      if (!shouldPromoteFeedShell(cur, target)) break;
      target = cur;
      cur = cur.parentElement;
      depth++;
    }
    return target;
  }

  // DynamicScrollerItem 1.x observes its outer item-view and handles a local
  // `resize` CustomEvent carrying contentRect. Usually its ResizeObserver sends
  // this event for us, but attribute-driven userscript styles can be coalesced
  // with Vue's own recycling update. Send the same scoped notification after a
  // hide/restore transition so the current item id is remeasured immediately.
  // This never changes Vue's transform, item array or wrapper height.
  // 核对一行是否还有可见内容：先摘掉测量壳再测量，行高不足一个测量壳时说明
  // 内容已经全部隐藏，重新挂上测量壳。返回标记是否发生了变化。
  function syncVirtualRowMeasurementShell(view) {
    if (!(view instanceof Element)) return false;
    const content = view.firstElementChild;
    if (!(content instanceof Element)) return false;
    const hadShell = content.hasAttribute(VIRTUAL_ROW_SHELL_ATTR);
    if (hadShell) content.removeAttribute(VIRTUAL_ROW_SHELL_ATTR);
    const collapsed =
      view.getBoundingClientRect().height < VIRTUAL_MEASUREMENT_SHELL_PX;
    if (collapsed) content.setAttribute(VIRTUAL_ROW_SHELL_ATTR, '1');
    return collapsed !== hadShell;
  }

  // Vue 会把整行复用给另一条内容。测量壳因此必须在每轮过滤时重新核对，否则
  // 复用后的可见内容会继续沿用 2px 的壳高。只遍历已带标记的行，数量等于当前
  // 完全隐藏的行数。
  function syncVirtualRowMeasurementShells(root = document) {
    const scope = root && root.querySelectorAll ? root : document;
    const marked = [];
    if (
      scope instanceof Element &&
      scope.matches(VIRTUAL_ROW_SHELL_SELECTOR)
    ) {
      marked.push(scope);
    }
    scope
      .querySelectorAll(VIRTUAL_ROW_SHELL_SELECTOR)
      .forEach((node) => marked.push(node));
    Array.from(new Set(marked)).forEach((content) => {
      const view = content.parentElement;
      if (!(view instanceof Element) || !view.matches(VIRTUAL_VIEW_SELECTOR)) {
        content.removeAttribute(VIRTUAL_ROW_SHELL_ATTR);
        return;
      }
      if (syncVirtualRowMeasurementShell(view)) {
        requestNativeVirtualItemRemeasure(content);
      }
    });
  }

  function requestNativeVirtualItemRemeasure(shell) {
    if (!(shell instanceof Element)) return;
    // 隐藏目标不一定是虚拟行的直接子节点。评论区的层级是 item-view >
    // wbpro-scroller-item > wbpro-list > 评论项，按父节点匹配取不到行，重测
    // 通知不会发出，行高一直停留在隐藏之前的数值。
    const view = shell.closest(VIRTUAL_VIEW_SELECTOR);
    if (!view) return;

    let sent = false;
    const send = () => {
      if (sent) return;
      if (!view.isConnected || !shell.isConnected || !view.contains(shell)) {
        sent = true;
        return;
      }
      syncVirtualRowMeasurementShell(view);
      const rect = view.getBoundingClientRect();
      if (
        !Number.isFinite(rect.width) ||
        !Number.isFinite(rect.height) ||
        rect.height < 1
      ) {
        return;
      }
      sent = true;
      view.dispatchEvent(
        new CustomEvent('resize', {
          detail: {
            contentRect: {
              width: rect.width,
              height: rect.height,
            },
          },
        })
      );
    };

    requestAnimationFrame(() => requestAnimationFrame(send));
    // Background tabs can suspend rAF. The timer is only a fallback and is
    // coalesced by `sent`, so the native size handler receives at most one event.
    setTimeout(send, 160);
  }

  function hideContentRoot(root, uid = '') {
    if (isRelationshipListPage()) {
      restoreHiddenRelationshipItems(document);
      return false;
    }
    if (
      root instanceof Element &&
      (root.matches(USER_SCRIPT_UI_SELECTOR) ||
        root.closest(USER_SCRIPT_UI_SELECTOR))
    ) {
      return false;
    }
    if (isCommentCollectionRoot(root)) return false;
    const id = String(uid || '').trim();
    if (/^\d{5,}$/.test(id) && !contentRootOwnedByUID(root, id)) {
      return false;
    }
    const target = findHideShell(root);
    if (
      !(target instanceof Element) ||
      isCommentCollectionRoot(target) ||
      isPersonCollectionRoot(target) ||
      (/^\d{5,}$/.test(id) && isUnsafePostRootForUID(target, id)) ||
      target.matches(USER_SCRIPT_UI_SELECTOR) ||
      target.closest(USER_SCRIPT_UI_SELECTOR) ||
      target.hasAttribute(BLOCKED_CONTENT_HIDE_ATTR)
    ) {
      return false;
    }
    rememberBlockedContentVideos(target);
    pauseVideosIn(target);
    target.setAttribute(
      BLOCKED_CONTENT_ORIGINAL_ARIA_ATTR,
      target.hasAttribute('aria-hidden')
        ? target.getAttribute('aria-hidden') || ''
        : BLOCKED_CONTENT_ARIA_ABSENT
    );
    target.setAttribute(BLOCKED_CONTENT_HIDE_ATTR, '1');
    if (/^\d{5,}$/.test(id)) {
      target.setAttribute(BLOCKED_CONTENT_UID_ATTR, id);
    }
    target.setAttribute('aria-hidden', 'true');
    requestNativeVirtualItemRemeasure(target);
    suppressFloatingVideoPlayers(document);
    return true;
  }

  let floatingVideoSuppressUntil = 0;
  let blockedVideoFingerprints = new Set();
  let floatingVideoSuppressFallback = false;
  let ignoredFloatingVideoPlayers = new WeakSet();
  let floatingVideoRestoreTimer = 0;

  function isFloatingVideoSuppressActive() {
    if (Date.now() <= floatingVideoSuppressUntil) return true;
    restoreSuppressedFloatingVideoPlayers(document);
    blockedVideoFingerprints = new Set();
    floatingVideoSuppressFallback = false;
    ignoredFloatingVideoPlayers = new WeakSet();
    return false;
  }

  function getVideoFingerprint(video) {
    if (!(video instanceof HTMLVideoElement)) return '';
    return [
      video.currentSrc,
      video.src,
      video.getAttribute('src'),
      video.poster,
      video.getAttribute('poster'),
    ]
      .map((item) => String(item || '').trim())
      .find(Boolean) || '';
  }

  function collectVideoElements(root) {
    if (!root || !root.querySelectorAll) return [];
    const videos = [];
    if (root instanceof HTMLVideoElement) {
      videos.push(root);
    }
    root.querySelectorAll('video').forEach((video) => videos.push(video));
    return Array.from(new Set(videos));
  }

  function collectFloatingVideoPlayers(root = document) {
    if (!root || !root.querySelectorAll) return [];
    const nodes = [];
    if (
      root instanceof Element &&
      looksLikeFloatingVideoPlayer(root)
    ) {
      nodes.push(root);
    }
    root
      .querySelectorAll(FLOATING_VIDEO_PLAYER_SELECTOR)
      .forEach((el) => {
        if (looksLikeFloatingVideoPlayer(el)) nodes.push(el);
      });
    root.querySelectorAll('video').forEach((video) => {
      const floating = video.closest(FLOATING_VIDEO_PLAYER_SELECTOR);
      if (floating && looksLikeFloatingVideoPlayer(floating)) {
        nodes.push(floating);
      }
      let cur = video.parentElement;
      let depth = 0;
      while (cur && cur !== document.body && depth < 6) {
        if (looksLikeFloatingVideoPlayer(cur)) {
          nodes.push(cur);
          break;
        }
        cur = cur.parentElement;
        depth++;
      }
    });
    return Array.from(new Set(nodes));
  }

  function rememberExistingFloatingVideoPlayers() {
    ignoredFloatingVideoPlayers = new WeakSet();
    collectFloatingVideoPlayers(document).forEach((player) => {
      ignoredFloatingVideoPlayers.add(player);
    });
  }

  function looksLikeVideoBearingContent(root) {
    if (!(root instanceof Element)) return false;
    if (root instanceof HTMLVideoElement) return true;
    if (
      root.querySelector(
        [
          'video',
          '[class*="video"]',
          '[class*="Video"]',
          '[action-type*="video"]',
          '[node-type*="video"]',
          'a[href*="/tv/show"]',
          'a[href*="video.weibo.com"]',
        ].join(',')
      )
    ) {
      return true;
    }
    return /微博视频|视频|播放|观看/.test(normDOMText(root.textContent));
  }

  function rememberBlockedContentVideos(root) {
    if (!root || !root.querySelectorAll || !looksLikeVideoBearingContent(root)) {
      return;
    }
    rememberExistingFloatingVideoPlayers();
    const fingerprints = collectVideoElements(root)
      .map((video) => getVideoFingerprint(video))
      .filter(Boolean);
    blockedVideoFingerprints = new Set(fingerprints);
    floatingVideoSuppressFallback = true;
    floatingVideoSuppressUntil = Date.now() + 5000;
    clearTimeout(floatingVideoRestoreTimer);
    floatingVideoRestoreTimer = setTimeout(() => {
      floatingVideoRestoreTimer = 0;
      floatingVideoSuppressUntil = 0;
      restoreSuppressedFloatingVideoPlayers(document);
      blockedVideoFingerprints = new Set();
      floatingVideoSuppressFallback = false;
      ignoredFloatingVideoPlayers = new WeakSet();
    }, 5050);
  }

  function pauseVideosIn(root) {
    if (!root || !root.querySelectorAll) return;
    collectVideoElements(root).forEach((video) => {
      try {
        video.pause();
      } catch {}
      try {
        if (document.pictureInPictureElement === video) {
          document.exitPictureInPicture?.();
        }
      } catch {}
    });
  }

  function looksLikeFloatingVideoPlayer(el) {
    if (!(el instanceof Element)) return false;
    const hasMiniPlayerMarker = el.matches(FLOATING_VIDEO_PLAYER_SELECTOR);
    const hasVideo = el instanceof HTMLVideoElement || !!el.querySelector('video');
    if (!hasMiniPlayerMarker && !hasVideo) return false;
    const style = getComputedStyle(el);
    if (style.position !== 'fixed') return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 120 || rect.height < 80) return false;
    const rightSide = rect.left > window.innerWidth * 0.45;
    const lowerHalf = rect.top > window.innerHeight * 0.35;
    if (!rightSide || !lowerHalf) return false;
    const marker = `${el.className || ''} ${el.id || ''} ${el.textContent || ''}`;
    return hasMiniPlayerMarker || /mini|player|video|pip|picture|play/i.test(marker);
  }

  function shouldSuppressFloatingVideoPlayer(player) {
    if (!isFloatingVideoSuppressActive()) return false;
    if (ignoredFloatingVideoPlayers.has(player)) return false;
    const hasFingerprintMatch = collectVideoElements(player).some((video) => {
      const fp = getVideoFingerprint(video);
      return fp && blockedVideoFingerprints.has(fp);
    });
    return hasFingerprintMatch || floatingVideoSuppressFallback;
  }

  function suppressFloatingVideoPlayers(root = document) {
    if (!isFloatingVideoSuppressActive()) return;
    collectFloatingVideoPlayers(root).forEach((player) => {
      if (!shouldSuppressFloatingVideoPlayer(player)) return;
      if (!player.hasAttribute(FLOATING_VIDEO_ORIGINAL_ARIA_ATTR)) {
        player.setAttribute(
          FLOATING_VIDEO_ORIGINAL_ARIA_ATTR,
          player.hasAttribute('aria-hidden')
            ? player.getAttribute('aria-hidden') || ''
            : BLOCKED_CONTENT_ARIA_ABSENT
        );
      }
      pauseVideosIn(player);
      player.setAttribute(FLOATING_VIDEO_SUPPRESS_ATTR, '1');
      player.setAttribute('aria-hidden', 'true');
    });
  }

  function restoreSuppressedFloatingVideoPlayers(root = document) {
    if (!root || !root.querySelectorAll) return;
    const players = [];
    if (
      root instanceof Element &&
      root.hasAttribute(FLOATING_VIDEO_SUPPRESS_ATTR)
    ) {
      players.push(root);
    }
    root
      .querySelectorAll(`[${FLOATING_VIDEO_SUPPRESS_ATTR}]`)
      .forEach((player) => players.push(player));
    players.forEach((player) => {
      const originalAria = player.getAttribute(
        FLOATING_VIDEO_ORIGINAL_ARIA_ATTR
      );
      if (originalAria === BLOCKED_CONTENT_ARIA_ABSENT) {
        player.removeAttribute('aria-hidden');
      } else if (originalAria !== null) {
        player.setAttribute('aria-hidden', originalAria);
      }
      player.removeAttribute(FLOATING_VIDEO_SUPPRESS_ATTR);
      player.removeAttribute(FLOATING_VIDEO_ORIGINAL_ARIA_ATTR);
    });
  }

  // vue-virtual-scroller 会渲染两个 .vue-recycle-scroller__slot（前置和后置），
  // 微博的加载哨兵在后置那个里。按 querySelector 只取第一个永远拿不到哨兵。
  function findNativeTimelineLoaderCard(scroller) {
    if (!(scroller instanceof Element)) return null;
    const slots = scroller.querySelectorAll(
      ':scope > .vue-recycle-scroller__slot'
    );
    for (const slot of slots) {
      const spinner = slot.querySelector('.woo-spinner-main');
      if (!spinner) continue;
      let card = spinner;
      while (card.parentElement && card.parentElement !== slot) {
        card = card.parentElement;
      }
      return card;
    }
    return null;
  }

  // 识别后置槽卡片的原生状态：加载动画走可见性翻转补偿；失败重试和「点击加载
  // 更多」都带可点击的原生控件，直接触发；「没有更多」占位不做任何处理。文本
  // 不匹配任何一类时整拍跳过，绝不猜测。
  function classifyNativeTimelineSlotCard(scroller) {
    const loader = findNativeTimelineLoaderCard(scroller);
    if (loader) return { card: loader, kind: 'loading' };
    if (!(scroller instanceof Element)) return null;
    const slots = scroller.querySelectorAll(
      ':scope > .vue-recycle-scroller__slot'
    );
    for (const slot of slots) {
      const card = slot.firstElementChild;
      if (!card) continue;
      const text = String(card.textContent || '').trim();
      if (!text) continue;
      // 「没有更多」优先判定：终止文案里也可能带"更多"二字，先排除掉。
      if (TIMELINE_END_TEXT_RE.test(text)) return { card, kind: 'end' };
      if (TIMELINE_ACTION_TEXT_RE.test(text)) return { card, kind: 'action' };
    }
    return null;
  }

  // 只读的资源计时观察器，用来得知"最近一次时间线内容请求何时出的结果"。
  // 不改写 fetch / XMLHttpRequest，也不读取响应内容。
  let timelineRequestObserver = null;
  let timelineRequestLastDoneAt = 0;
  function ensureTimelineRequestObserver() {
    if (
      timelineRequestObserver ||
      typeof PerformanceObserver !== 'function'
    ) {
      return;
    }
    try {
      timelineRequestObserver = new PerformanceObserver((entries) => {
        entries.getEntries().forEach((entry) => {
          if (TIMELINE_REQUEST_URL_RE.test(String(entry.name || ''))) {
            timelineRequestLastDoneAt = Date.now();
          }
        });
      });
      timelineRequestObserver.observe({ entryTypes: ['resource'] });
    } catch (error) {
      timelineRequestObserver = null;
    }
  }

  // DynamicScroller 把列表总高写在 item-wrapper 的 min-height 上，这个数字只随
  // 条目增删和重新测量变化，不受列表之外的图片、侧栏、页脚影响。
  function readTimelineContentHeight(scroller) {
    if (!(scroller instanceof Element)) return 0;
    const wrapper = scroller.querySelector(
      ':scope > .vue-recycle-scroller__item-wrapper'
    );
    if (!wrapper) return 0;
    const declared = parseFloat(wrapper.style.minHeight || '');
    if (Number.isFinite(declared)) return Math.round(declared);
    return Math.round(wrapper.getBoundingClientRect().height);
  }

  const timelineStall = {
    scroller: null,
    inViewSince: 0,
    lastNudgeAt: 0,
    staleNudges: 0,
    lastContentHeight: 0,
    nudging: false,
    pendingSince: 0,
    pendingStartHeight: 0,
    retryClicks: 0,
    lastRetryAt: 0,
  };

  function resetTimelineStallState(scroller) {
    timelineStall.scroller = scroller;
    timelineStall.inViewSince = 0;
    timelineStall.lastNudgeAt = 0;
    timelineStall.staleNudges = 0;
    timelineStall.pendingSince = 0;
    timelineStall.pendingStartHeight = 0;
    timelineStall.retryClicks = 0;
    timelineStall.lastRetryAt = 0;
    timelineStall.lastContentHeight = scroller
      ? readTimelineContentHeight(scroller)
      : 0;
  }

  function resolveTimelineScroller(root) {
    if (root instanceof Element) {
      const own = root.matches('.vue-recycle-scroller')
        ? root
        : root.closest('.vue-recycle-scroller');
      if (own) return own;
    }
    return document.querySelector('.vue-recycle-scroller');
  }

  function nudgeNativeTimelineLoader(card) {
    if (timelineStall.nudging) return;
    timelineStall.nudging = true;
    card.setAttribute(TIMELINE_LOADER_NUDGE_ATTR, '1');
    const restore = () => {
      if (!timelineStall.nudging) return;
      timelineStall.nudging = false;
      card.removeAttribute(TIMELINE_LOADER_NUDGE_ATTR);
    };
    // 两帧足够让 IntersectionObserver 观察到"不可见"，再恢复即产生翻转。
    requestAnimationFrame(() => requestAnimationFrame(restore));
    // 标签页切到后台时 rAF 会停摆，必须留一条定时兜底，避免哨兵被永久隐藏。
    setTimeout(restore, TIMELINE_NUDGE_RESTORE_MS);
  }

  function recoverStalledTimelinePagination(root = document) {
    if (isRelationshipListPage()) return;
    if (typeof document === 'undefined') return;
    // 后台标签页里渲染和 IntersectionObserver 都是冻结的，翻转不会被投递。
    if (document.visibilityState && document.visibilityState !== 'visible') {
      return;
    }

    const scroller = resolveTimelineScroller(root);
    if (!scroller) {
      resetTimelineStallState(null);
      return;
    }
    if (timelineStall.scroller !== scroller) {
      resetTimelineStallState(scroller);
      return;
    }

    // 不再要求"脚本折叠过内容"才补偿。实测表明：即使整屏没有任何被屏蔽的
    // 微博，微博自身的加载哨兵也会因为可见性一直为真而锁死（rootMargin
    // 1500px，仅在翻转时回调），停在底部逾一分钟不再发出续页请求。脚本的
    // 折叠只是让这种情况更容易发生，并非必要条件；按"只修自己造成的问题"
    // 设闸反而会在最常见的卡死场景下把补偿完全挡掉。
    // Vue 在续页前后会重建后置槽，底部卡片会短暂查不到。这一拍直接跳过即可：
    // 既不清静止计时，也不换容器——任何"查不到就重置"的写法都是拿噪声信号
    // 复位计时器，心跳叠加滚动回调会让计时永远走不满、补偿再也不执行。
    const slotState = classifyNativeTimelineSlotCard(scroller);
    if (!slotState) return;
    const { card, kind } = slotState;
    if (kind === 'end') {
      // 「没有更多」是原生的终止状态，不补偿也不重试。
      timelineStall.inViewSince = 0;
      timelineStall.pendingSince = 0;
      timelineStall.pendingStartHeight = 0;
      return;
    }

    const now = Date.now();
    const rect = card.getBoundingClientRect();
    const viewport = Math.max(window.innerHeight || 0, 1);
    const inView =
      rect.top <= viewport + TIMELINE_SENTINEL_MARGIN_PX &&
      rect.bottom >= -TIMELINE_SENTINEL_MARGIN_PX;
    if (!inView) {
      // 哨兵被顶出视口，说明分页恢复正常，重新计时并清空所有失败计数。
      timelineStall.inViewSince = 0;
      timelineStall.staleNudges = 0;
      timelineStall.retryClicks = 0;
      timelineStall.lastRetryAt = 0;
      timelineStall.pendingSince = 0;
      timelineStall.pendingStartHeight = 0;
      timelineStall.lastContentHeight = readTimelineContentHeight(scroller);
      return;
    }

    const contentHeight = readTimelineContentHeight(scroller);
    const heightChange = contentHeight - timelineStall.lastContentHeight;
    if (heightChange !== 0) {
      timelineStall.lastContentHeight = contentHeight;
      if (!timelineStall.pendingSince && heightChange > 0) {
        // 没有补偿动作在途时，任何增长都说明原生续页或条目重测取得了进展。
        // 大部分条目被折叠时，一页可能只增长数十像素，不能要求必须涨满一页。
        timelineStall.staleNudges = 0;
        timelineStall.retryClicks = 0;
        timelineStall.lastRetryAt = 0;
      }
      if (!timelineStall.pendingSince && heightChange < 0) {
        // 折叠成功会让 DynamicScroller 总高下降。必须把下降后的值接纳为新基线；
        // 否则后续一页即使成功增加了几十像素，也可能仍低于旧基线并被记为失败。
        timelineStall.inViewSince = now;
        return;
      }
      if (
        !timelineStall.pendingSince &&
        heightChange > TIMELINE_PAGE_GROWTH_PX
      ) {
        // 只有确实涨出一页的高度才重新等待页面稳定；图片撑开造成的小幅重测不
        // 应推迟下一次补偿，否则被折叠得只剩几十像素的页面会迟迟补不上。
        timelineStall.inViewSince = now;
        return;
      }
    }

    if (!timelineStall.inViewSince) {
      timelineStall.inViewSince = now;
      return;
    }

    // 补偿已触发但对应的内容请求还没出结果时不再叠加触发，避免在原生请求
    // 在途时重复续页。成功判定始终比较"动作前基线"与请求稳定后的最终高度，
    // 不会被同一页先按估算高度撑开、再折叠为测量壳的中间态误导。
    if (timelineStall.pendingSince) {
      const requestCompleted =
        timelineRequestLastDoneAt > timelineStall.pendingSince;
      if (
        !requestCompleted &&
        now - timelineStall.pendingSince < TIMELINE_ACTION_PENDING_MS
      ) {
        return;
      }
      if (
        requestCompleted &&
        now - timelineRequestLastDoneAt < TIMELINE_REQUEST_SETTLE_MS
      ) {
        return;
      }
      const actionGrowth =
        contentHeight - timelineStall.pendingStartHeight;
      timelineStall.pendingSince = 0;
      timelineStall.pendingStartHeight = 0;
      if (actionGrowth > 0) {
        // 最终净增长为正才表示这一动作确实换来了内容；即使整页都被折叠，
        // 每个正尺寸测量壳仍会让总高增长。成功后恢复无限续页额度。
        timelineStall.staleNudges = 0;
        timelineStall.retryClicks = 0;
        timelineStall.lastRetryAt = 0;
        if (actionGrowth > TIMELINE_PAGE_GROWTH_PX) {
          timelineStall.inViewSince = now;
        }
        return;
      }
    }

    if (kind === 'action') {
      // 「内容加载失败，请点击重试」和「点击加载更多」都是微博自带的原生控件，
      // 按退避节奏代替用户点击。pending 状态在本分支之前处理，确保前一次请求
      // 未完成时绝不会再次点击。
      if (timelineStall.retryClicks >= TIMELINE_RETRY_MAX_CLICKS) return;
      const retryDelay = TIMELINE_RETRY_BASE_MS << timelineStall.retryClicks;
      const retryAnchor = Math.max(
        timelineStall.lastRetryAt,
        timelineStall.inViewSince
      );
      if (now - retryAnchor < retryDelay) return;
      timelineStall.retryClicks += 1;
      timelineStall.lastRetryAt = now;
      timelineStall.pendingSince = now;
      timelineStall.pendingStartHeight = contentHeight;
      const clickable =
        card.querySelector(
          '[class*="nextPage"], a, button, [role="button"]'
        ) || card;
      clickable.click();
      return;
    }

    if (now - timelineStall.inViewSince < TIMELINE_STALL_IDLE_MS) return;
    if (now - timelineStall.lastNudgeAt < TIMELINE_NUDGE_COOLDOWN_MS) return;
    // 时间线真的到头时不再无限重试；用户滚离底部后自动恢复额度。
    if (timelineStall.staleNudges >= TIMELINE_NUDGE_MAX_STALE) return;

    timelineStall.staleNudges += 1;
    timelineStall.lastNudgeAt = now;
    timelineStall.pendingSince = now;
    timelineStall.pendingStartHeight = contentHeight;
    nudgeNativeTimelineLoader(card);
  }

  function compactVirtualScrollerGaps(root = document) {
    if (isRelationshipListPage()) {
      restoreHiddenRelationshipItems(document);
      return;
    }
    if (!root || !root.querySelectorAll) return;
    // DynamicScroller owns row coordinates and wrapper height. The plugin only
    // watches for a stalled next-page sentinel while Vue remeasures marked
    // content shells; it never rewrites row offsets or the wrapper height.
    // 所有入口都不传 root，统一解析到同一个滚动容器；按调用方传入的节点解析
    // 会让不同入口命中不同容器，把停滞计时反复重置。
    recoverStalledTimelinePagination();
  }

  function isWeiboSearchResultPage() {
    return (
      location.hostname === 's.weibo.com' &&
      /^\/weibo(?:\/|$)/.test(location.pathname)
    );
  }

  const SEARCH_RESULT_CARD_SELECTOR = [
    '.card-wrap[action-type="feed_list_item"]',
    '.card-wrap[mid]',
  ].join(',');

  function getBlacklistDOMCategory(root) {
    if (!(root instanceof Element)) return 'posts';
    if (isInteractionContentRoot(root)) return 'interactions';
    if (isUserCardContentRoot(root)) return 'userCards';
    if (
      isWeiboSearchResultPage() &&
      root.closest('.card-wrap') &&
      !root.closest(SEARCH_RESULT_CARD_SELECTOR)
    ) {
      return 'userCards';
    }
    if (isCommentContentRoot(root) || isInsideCommentContentRoot(root)) {
      return 'comments';
    }
    if (
      isWeiboSearchResultPage() &&
      root.closest(SEARCH_RESULT_CARD_SELECTOR)
    ) {
      return 'searchResults';
    }
    if (isPostContentRoot(root) || root.closest(DOM_POST_ROOT_SELECTOR)) {
      return 'posts';
    }
    return 'userCards';
  }

  function shouldHideBlacklistDOMRoot(root) {
    const category = getBlacklistDOMCategory(root);
    if (category === 'comments') {
      return CONTENT_FILTER_CFG.hideBlacklistComments;
    }
    if (category === 'searchResults') {
      return CONTENT_FILTER_CFG.hideBlacklistSearchResults;
    }
    if (category === 'userCards') {
      return CONTENT_FILTER_CFG.hideBlacklistUserCards;
    }
    if (category === 'interactions') {
      return CONTENT_FILTER_CFG.hideBlacklistInteractions;
    }
    return CONTENT_FILTER_CFG.hideBlacklistPosts;
  }

  function findExplicitAdRoot(marker) {
    if (!(marker instanceof Element)) return null;
    return (
      marker.closest(
        [
          'article',
          '.card-wrap[action-type="feed_list_item"]',
          '.card-wrap[mid]',
          '[action-type="feed_list_item"]',
          '[node-type="feed_list_item"]',
          '[class*="Feed_wrap_"]',
          '[class*="Feed_card_"]',
        ].join(',')
      ) || marker
    );
  }

  function hasExplicitAdLabel(root) {
    if (!(root instanceof Element)) return false;
    const labels = root.querySelectorAll(
      [
        '[class*="ad-label"]',
        '[class*="ad_label"]',
        '[class*="AdLabel"]',
        '[class*="advert"]',
        '[class*="Advert"]',
        '[class*="promoted"]',
        '[class*="Promoted"]',
        'span',
        'a',
      ].join(',')
    );
    return Array.from(labels).some((label) =>
      /^(?:广告|推广|赞助)$/.test(normDOMText(label.textContent))
    );
  }

  // 微博卡片内的正文链接形如 /{uid}/{mblogid}，是页面上唯一稳定的条目标识。
  // 取到的 id 用于和回包侧登记的广告 id 比对。
  function extractPostIDFromRoot(root) {
    if (!(root instanceof Element)) return '';
    const anchors = root.querySelectorAll('a[href]');
    for (const anchor of anchors) {
      const href = String(anchor.getAttribute('href') || '');
      if (!href) continue;
      const path = href.replace(/^(?:https?:)?\/\/[^/]+/i, '');
      const matched = POST_PERMALINK_RE.exec(path);
      if (matched) return matched[2];
    }
    return '';
  }

  function isRegisteredAdPostRoot(root) {
    if (!(root instanceof Element) || !AD_POST_OWNERS.size) return false;
    const owner = getAdPostOwner(extractPostIDFromRoot(root));
    return !!owner && isHiddenAdOwner(owner);
  }

  function hideRecognizedAds(root = document) {
    if (
      !CONTENT_FILTER_CFG.hideAds ||
      !root ||
      !root.querySelectorAll
    ) {
      return false;
    }

    const markers = new Set();
    if (root instanceof Element) {
      if (root.matches(EXPLICIT_AD_SELECTOR)) markers.add(root);
      const containing = root.closest(EXPLICIT_AD_SELECTOR);
      if (containing) markers.add(containing);
    }
    root
      .querySelectorAll(EXPLICIT_AD_SELECTOR)
      .forEach((marker) => markers.add(marker));

    const contentRoots = new Set();
    const addContentRoot = (item) => {
      const adRoot = findExplicitAdRoot(item);
      if (adRoot) contentRoots.add(adRoot);
    };
    markers.forEach(addContentRoot);

    const candidates = [];
    if (
      root instanceof Element &&
      root.matches(DOM_POST_ROOT_SELECTOR)
    ) {
      candidates.push(root);
    }
    root
      .querySelectorAll(DOM_POST_ROOT_SELECTOR)
      .forEach((item) => candidates.push(item));
    if (root instanceof Element) {
      // MutationObserver 交来的常常是卡片内部的子树，条目标识挂在外层卡片上。
      const containingPost = root.closest(DOM_POST_ROOT_SELECTOR);
      if (containingPost) candidates.push(containingPost);
    }
    candidates.forEach((item) => {
      if (hasExplicitAdLabel(item) || isRegisteredAdPostRoot(item)) {
        contentRoots.add(item);
      }
    });

    let hiddenAny = false;
    contentRoots.forEach((adRoot) => {
      const target = findHideShell(adRoot);
      if (
        !(target instanceof Element) ||
        target.hasAttribute(HIDDEN_AD_ATTR)
      ) {
        return;
      }
      pauseVideosIn(target);
      target.setAttribute(HIDDEN_AD_ATTR, '1');
      requestNativeVirtualItemRemeasure(target);
      hiddenAny = true;
    });
    return hiddenAny;
  }

  function restoreRecognizedAds(root = document) {
    if (!root || !root.querySelectorAll) return;
    const nodes = [];
    if (root instanceof Element && root.matches(HIDDEN_AD_SELECTOR)) {
      nodes.push(root);
    }
    root
      .querySelectorAll(HIDDEN_AD_SELECTOR)
      .forEach((node) => nodes.push(node));
    Array.from(new Set(nodes)).forEach((node) => {
      node.removeAttribute(HIDDEN_AD_ATTR);
      requestNativeVirtualItemRemeasure(node);
    });
  }

  function hasTimelineRecommendationLabel(article) {
    if (!(article instanceof Element) || !article.matches('article')) {
      return false;
    }
    const lead = article.firstElementChild;
    if (!(lead instanceof Element)) return false;
    const body = Array.from(article.children)
      .slice(1)
      .find(
        (child) => child.matches('header') || child.querySelector('header')
      );
    if (
      !(body instanceof Element) ||
      lead.matches('header') ||
      lead.querySelector('header')
    ) {
      return false;
    }
    const labels = [lead, ...lead.querySelectorAll('span, div')];
    return labels.some(
      (label) =>
        label.closest('article') === article &&
        getOwnDOMText(label) === TIMELINE_RECOMMENDATION_LABEL
    );
  }

  function findTimelineRecommendationArticles(root = document) {
    if (!root || !root.querySelectorAll) return [];
    const articles = new Set();
    if (root instanceof Element) {
      const containing = root.closest('article');
      if (containing) articles.add(containing);
      if (root.matches('article')) articles.add(root);
    }
    root.querySelectorAll('article').forEach((article) => articles.add(article));
    return Array.from(articles).filter(hasTimelineRecommendationLabel);
  }

  function hideTimelineRecommendations(root = document) {
    if (isRelationshipListPage()) {
      restoreTimelineRecommendations(document);
      return false;
    }
    if (
      !CONTENT_FILTER_CFG.hideTimelineRecommendations ||
      !root ||
      !root.querySelectorAll
    ) {
      return false;
    }
    let hiddenAny = false;
    findTimelineRecommendationArticles(root).forEach((article) => {
      const target = findHideShell(article);
      if (
        !(target instanceof Element) ||
        target.hasAttribute(HIDDEN_TIMELINE_RECOMMENDATION_ATTR)
      ) {
        return;
      }
      pauseVideosIn(target);
      target.setAttribute(HIDDEN_TIMELINE_RECOMMENDATION_ATTR, '1');
      requestNativeVirtualItemRemeasure(target);
      hiddenAny = true;
    });
    return hiddenAny;
  }

  function restoreTimelineRecommendations(root = document) {
    if (!root || !root.querySelectorAll) return;
    const nodes = [];
    if (
      root instanceof Element &&
      root.matches(HIDDEN_TIMELINE_RECOMMENDATION_SELECTOR)
    ) {
      nodes.push(root);
    }
    root
      .querySelectorAll(HIDDEN_TIMELINE_RECOMMENDATION_SELECTOR)
      .forEach((node) => nodes.push(node));
    Array.from(new Set(nodes)).forEach((node) => {
      node.removeAttribute(HIDDEN_TIMELINE_RECOMMENDATION_ATTR);
      requestNativeVirtualItemRemeasure(node);
    });
  }

  function hideBlockedSearchResultCards(root = document) {
    if (
      !isWeiboSearchResultPage() ||
      !CONTENT_FILTER_CFG.hideBlacklistSearchResults ||
      !BL.size ||
      !root ||
      !root.querySelectorAll
    ) {
      return false;
    }

    const cards = new Set();
    if (root instanceof Element) {
      if (root.matches(SEARCH_RESULT_CARD_SELECTOR)) cards.add(root);
      const containingCard = root.closest(SEARCH_RESULT_CARD_SELECTOR);
      if (containingCard) cards.add(containingCard);
    }
    root
      .querySelectorAll(SEARCH_RESULT_CARD_SELECTOR)
      .forEach((card) => cards.add(card));

    let hiddenAny = false;
    cards.forEach((card) => {
      if (card.hasAttribute(BLOCKED_CONTENT_HIDE_ATTR)) return;
      const author = card.querySelector(SEARCH_RESULT_AUTHOR_SELECTOR);
      const uid = firstDOMUID(author);
      if (!uid || !BL.has(uid)) return;
      if (hideContentRoot(card, uid)) hiddenAny = true;
    });
    return hiddenAny;
  }

  function initSearchResultBlacklistFilter() {
    if (!isWeiboSearchResultPage()) return;

    const run = () => {
      hideBlockedSearchResultCards(document);
    };
    const schedule = () => {
      WB_INTERNAL.dom.schedule('search-blacklist-filter', run, 40);
    };
    WB_INTERNAL.dom.subscribeMutations(
      'search-blacklist-filter',
      (records) => {
        if (records.some((record) => record.addedNodes?.length)) schedule();
      }
    );
    WB_INTERNAL.dom.subscribeRoute('search-blacklist-filter', schedule);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', schedule, { once: true });
    } else {
      schedule();
    }
    window.addEventListener('load', schedule, { once: true });
  }

  function getSearchResultUserContext(el) {
    if (!(el instanceof Element) || !isWeiboSearchResultPage()) return null;

    const card = el.closest(
      '.card-wrap[action-type="feed_list_item"], .card-wrap[mid], .card-wrap'
    );
    if (!card) return null;

    const buildContext = (source, nameSource = source) => {
      if (!(source instanceof Element)) return null;
      const uid = firstDOMUID(source);
      if (!uid) return null;

      const explicitName = cleanUserDisplayName(
        getNameFromElementAttributes(nameSource) || getOwnDOMText(nameSource)
      );
      const name =
        explicitName || getUserDisplayName(nameSource || source, uid, card);
      const url = getProfileURL(nameSource || source, uid, card);
      if (!url) return null;
      const resolvedRoot = findContentRootForUID(source, uid);
      const cardAuthorUID = firstDOMUID(
        card.querySelector(SEARCH_RESULT_AUTHOR_SELECTOR)
      );
      const safeCardRoot = cardAuthorUID === uid ? card : null;

      return {
        uid,
        url,
        name,
        source,
        // A comment author belongs to one comment row, not to the surrounding
        // search-result card. Only the card's primary author may own the card.
        root: resolvedRoot || safeCardRoot,
      };
    };

    // 点击的元素本身明确属于某个用户时优先使用它，但绝不从转发/评论操作区取 UID。
    let unresolvedDirectTarget = null;
    const directNameSource = getUserNameContextTarget(el);
    if (directNameSource && card.contains(directNameSource)) {
      const directNameContext = buildContext(
        directNameSource,
        directNameSource
      );
      if (directNameContext) return directNameContext;
      unresolvedDirectTarget = directNameSource;
    }

    const directSource = el.closest(
      [
        '[data-user-id]',
        '[data-user-card]',
        '[data-usercard-mid]',
        '[data-uid]',
        '[uid]',
        '[usercard]',
        '[data-usercard]',
        '[nick-name]',
        'a[href*="/u/"]',
        'a[href*="/p/100505"]',
        'a[href*="/n/"]',
      ].join(',')
    );
    if (directSource && card.contains(directSource)) {
      const directContext = buildContext(directSource, directSource);
      if (directContext) return directContext;
      unresolvedDirectTarget ||= directSource;
    }

    // 搜索卡片头像常常不带 UID；此时从卡片头部主作者区域解析，避开底部“转发”按钮。
    const feed =
      Array.from(card.children).find((child) =>
        child.matches?.('.card-feed')
      ) ||
      card.querySelector('.card-feed') ||
      card;
    const nameSource = feed.querySelector(
      [
        '.content > .info a.name',
        '.content > .info [nick-name]',
        'a.name[nick-name]',
        '[nick-name][usercard]',
        '[nick-name][data-user-card]',
        '[nick-name][data-usercard]',
      ].join(',')
    );
    const avatarSource = feed.querySelector(
      [
        '.avator [usercard]',
        '.avator [data-user-card]',
        '.avator [data-usercard]',
        '.avator [data-user-id]',
        '.avator [data-uid]',
        '.avatar [usercard]',
        '.avatar [data-user-card]',
        '.avatar [data-usercard]',
        '.avatar [data-user-id]',
        '.avatar [data-uid]',
      ].join(',')
    );
    const fallbackUIDSource = feed.querySelector(
      [
        '.content > .info [usercard]',
        '.content > .info [data-user-card]',
        '.content > .info [data-usercard]',
        '.content > .info [data-user-id]',
        '.content > .info [data-uid]',
      ].join(',')
    );
    const uidSource = [
      nameSource,
      nameSource?.closest('.info'),
      avatarSource,
      fallbackUIDSource,
    ]
      .filter((item) => item instanceof Element)
      .find((item) => !!firstDOMUID(item));

    const fallbackContext = buildContext(uidSource, nameSource || uidSource);
    if (!fallbackContext) return null;
    if (unresolvedDirectTarget) {
      const expectedName = cleanUserDisplayName(
        getNameFromElementAttributes(unresolvedDirectTarget) ||
          getOwnDOMText(unresolvedDirectTarget)
      );
      const fallbackName = cleanUserDisplayName(
        (nameSource
          ? getNameFromElementAttributes(nameSource) ||
            getOwnDOMText(nameSource)
          : '')
      );
      if (!expectedName || !fallbackName || expectedName !== fallbackName) {
        return null;
      }
    }
    return fallbackContext;
  }

  function getCurrentProfilePageUID() {
    if (!['weibo.com', 'www.weibo.com'].includes(location.hostname)) return '';
    const match =
      location.pathname.match(/^\/(?:u\/)?(\d{5,})(?:\/|$)/) ||
      location.pathname.match(/^\/p\/100505(\d{5,})(?:\/|$)/);
    return match ? match[1] : '';
  }

  function getUserContextFromTarget(target) {
    const el =
      target instanceof Element ? target : target?.parentElement || null;
    if (!el) return null;
    const searchContext = getSearchResultUserContext(el);
    if (searchContext) return searchContext;

    const source = el.closest(USER_CONTEXT_TARGET_SELECTOR) || el;
    const post = source.closest(DOM_CONTENT_ROOT_SELECTOR);
    const nameTarget = getUserNameContextTarget(el) || el;
    const explicitName = getUserNameLabel(nameTarget);
    let uid =
      firstDOMUID(source) ||
      getScopedUserContextUID(nameTarget, explicitName);
    if (!uid && !post) {
      const profileHeader = source.closest(
        'main header, [class*="ProfileHeader"], [class*="profileHeader"]'
      );
      if (profileHeader) uid = getCurrentProfilePageUID();
    }
    if (!uid) return null;

    const url =
      getProfileURL(source, uid, nameTarget.closest('header') || post) ||
      (uid === getCurrentProfilePageUID() ? location.href : '');
    if (!url) return null;
    const root = findContentRootForUID(source, uid);
    const fallbackRoot =
      post &&
      isPostContentRoot(post) &&
      !isUnsafePostRootForUID(post, uid)
        ? post
        : null;

    return {
      uid,
      url,
      name:
        explicitName || getUserDisplayName(el, uid, post),
      source,
      root: root || fallbackRoot,
    };
  }

  function shouldConfirmBeforeBlocking() {
    return WB_INTERNAL.config.read().confirmBeforeBlocking !== false;
  }

  function confirmContextUserBlocking(ctx, includeOfficialBlacklist) {
    if (!shouldConfirmBeforeBlocking()) return Promise.resolve(true);
    const userLabel = ctx?.name ? `@${ctx.name}` : `UID ${ctx?.uid || ''}`;
    return showCenteredConfirm({
      title: includeOfficialBlacklist
        ? '确认屏蔽并加入新浪微博官方黑名单'
        : '确认屏蔽用户',
      message: includeOfficialBlacklist
        ? `确定屏蔽 ${userLabel} 吗？\n\n该用户会加入本地屏蔽列表和新浪微博官方黑名单。`
        : `确定在本地屏蔽 ${userLabel} 吗？`,
      confirmText: '确认屏蔽',
      cancelText: '取消',
      danger: true,
    });
  }

  async function addContextUserToBL(ctx, options = {}) {
    if (!ctx?.uid) return;
    const added = await addUIDToLocalBL(ctx.uid);
    const existed = !added;

    try {
      if (isRelationshipListPage()) {
        restoreHiddenRelationshipItems(document);
      } else {
        const post = ctx.root || findContentRootForUID(ctx.source, ctx.uid);
        let hiddenImmediately = false;
        if (shouldHideBlacklistDOMRoot(post)) {
          hiddenImmediately = hideContentRoot(post, ctx.uid);
        }
        if (hiddenImmediately) {
          compactVirtualScrollerGaps(document);
          nudgeTimelineLayout();
        }
        // 子评论不匹配评论根选择器，findContentRootForUID 取到的 post 也不会
        // 被 isCommentContentRoot 认出来。原先按 post 的形态在评论与微博两条
        // 路径之间二选一，屏蔽子评论时两条都不覆盖，要等评论区下一次重新渲染
        // 才生效。评论侧因此无条件执行一次。
        if (CONTENT_FILTER_CFG.hideBlacklistComments) {
          hideBlockedCommentRoots(document);
        }
        if (CONTENT_FILTER_CFG.hideBlacklistPosts) {
          hideBlockedDOMPosts(document);
          scheduleBlockedDOMRefresh();
        }
      }
    } catch (err) {
      // DOM filtering is best-effort. The UID has already been persisted, and
      // a rendering failure must never prevent an official blacklist request.
      console.warn('[WB-BL] 本地屏蔽已保存，但当前页面刷新失败', err);
    }

    if (options.showToast !== false) {
      showUserContextToast(
        existed ? `@${ctx.name} 已在本地屏蔽列表中` : `已屏蔽 @${ctx.name}`
      );
    }
    return { existed };
  }

  function getCookieValue(name) {
    const item = document.cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name}=`));
    return item ? decodeURIComponent(item.slice(name.length + 1)) : '';
  }

  function isValidOfficialBlockRequestId(requestId) {
    return /^\d{10,}-[a-z0-9]+$/i.test(String(requestId || ''));
  }

  function getOfficialBlockRequestStorageKey(requestId) {
    return `${OFFICIAL_BLOCK_REQUEST_KEY}:${requestId}`;
  }

  function getOfficialBlockResponseStorageKey(requestId) {
    return `${OFFICIAL_BLOCK_RESPONSE_KEY}:${requestId}`;
  }

  function deleteStoredValue(key) {
    if (_GM_deleteValue) {
      _GM_deleteValue(key);
      return;
    }
    _GM_setValue(key, null);
  }

  function clearOfficialBlockRelayState(requestId) {
    deleteStoredValue(getOfficialBlockRequestStorageKey(requestId));
    deleteStoredValue(getOfficialBlockResponseStorageKey(requestId));
  }

  function scheduleOfficialBlockRelayClose(requestId = '') {
    setTimeout(() => {
      try {
        window.close();
      } catch {}
    }, 250);
    if (isValidOfficialBlockRequestId(requestId)) {
      setTimeout(
        () => clearOfficialBlockRelayState(requestId),
        OFFICIAL_BLOCK_RELAY_TIMEOUT_MS + 2000
      );
    }
  }

  function requestOfficialBlockViaMainHost(uid) {
    if (!_GM_openInTab) {
      return Promise.reject(new Error('当前脚本管理器不支持主站中继请求'));
    }

    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const requestKey = getOfficialBlockRequestStorageKey(requestId);
    const responseKey = getOfficialBlockResponseStorageKey(requestId);
    deleteStoredValue(responseKey);
    _GM_setValue(requestKey, {
      id: requestId,
      uid: String(uid),
      createdAt: Date.now(),
      schemaVersion: 1,
    });

    const relayURL = new URL('https://weibo.com/');
    relayURL.searchParams.set(OFFICIAL_BLOCK_RELAY_PARAM, requestId);
    return new Promise((resolve, reject) => {
      let settled = false;
      let relayTab = null;
      let listenerId = null;
      let fallbackTimer = 0;
      WB_RUNTIME_METRICS.relay.requests++;
      WB_RUNTIME_METRICS.relay.active++;

      const cleanup = () => {
        clearTimeout(timeoutTimer);
        if (fallbackTimer) clearInterval(fallbackTimer);
        if (_GM_removeValueChangeListener && listenerId !== null) {
          try {
            _GM_removeValueChangeListener(listenerId);
          } catch {}
        }
        try {
          relayTab?.close?.();
        } catch {}
        clearOfficialBlockRelayState(requestId);
        WB_RUNTIME_METRICS.relay.active = Math.max(
          0,
          WB_RUNTIME_METRICS.relay.active - 1
        );
      };

      const finish = (response) => {
        if (settled || response?.id !== requestId) return false;
        settled = true;
        cleanup();
        if (response.ok) {
          WB_RUNTIME_METRICS.relay.successes++;
          resolve(response.data || { ok: 1 });
        } else {
          WB_RUNTIME_METRICS.relay.failures++;
          reject(new Error(response.error || '新浪微博官方黑名单请求失败'));
        }
        return true;
      };

      const timeoutTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        WB_RUNTIME_METRICS.relay.timeouts++;
        WB_RUNTIME_METRICS.relay.failures++;
        cleanup();
        reject(new Error('新浪微博主站中继请求超时'));
      }, OFFICIAL_BLOCK_RELAY_TIMEOUT_MS);

      const startCompatibilityPolling = () => {
        WB_RUNTIME_METRICS.relay.transport = 'compatibility-polling';
        fallbackTimer = setInterval(() => {
          finish(_GM_getValue(responseKey, null));
        }, OFFICIAL_BLOCK_RELAY_COMPAT_POLL_MS);
      };
      if (_GM_addValueChangeListener && _GM_removeValueChangeListener) {
        try {
          listenerId = _GM_addValueChangeListener(
            responseKey,
            (_key, _oldValue, newValue) => {
              finish(newValue);
            }
          );
        } catch {
          startCompatibilityPolling();
        }
      } else {
        startCompatibilityPolling();
      }

      try {
        relayTab = _GM_openInTab(relayURL.href, {
          active: false,
          insert: true,
          setParent: true,
        });
      } catch (error) {
        finish({
          id: requestId,
          ok: false,
          error: error?.message || '无法打开新浪微博主站中继页',
        });
        return;
      }

      finish(_GM_getValue(responseKey, null));
    });
  }

  async function processOfficialBlockRelay() {
    if (!canUseSettingApi()) return;

    let requestId = '';
    try {
      requestId = new URL(location.href).searchParams.get(
        OFFICIAL_BLOCK_RELAY_PARAM
      );
    } catch {}
    if (!requestId) return;
    if (!isValidOfficialBlockRequestId(requestId)) {
      scheduleOfficialBlockRelayClose();
      return;
    }

    const requestKey = getOfficialBlockRequestStorageKey(requestId);
    const responseKey = getOfficialBlockResponseStorageKey(requestId);
    const request = _GM_getValue(requestKey, null);
    if (
      request?.id !== requestId ||
      !/^\d{5,}$/.test(String(request?.uid || '')) ||
      Date.now() - Number(request?.createdAt || 0) >
        OFFICIAL_BLOCK_RELAY_TIMEOUT_MS
    ) {
      _GM_setValue(responseKey, {
        id: requestId,
        ok: false,
        error: '新浪微博主站中继请求无效或已过期',
        completedAt: Date.now(),
        schemaVersion: 1,
      });
      scheduleOfficialBlockRelayClose(requestId);
      return;
    }

    try {
      const data = await addUserToWeiboBlacklist(request.uid, {
        allowRelay: false,
      });
      _GM_setValue(responseKey, {
        id: requestId,
        ok: true,
        data,
        completedAt: Date.now(),
        schemaVersion: 1,
      });
    } catch (err) {
      _GM_setValue(responseKey, {
        id: requestId,
        ok: false,
        error: err?.message || String(err),
        completedAt: Date.now(),
        schemaVersion: 1,
      });
    }

    scheduleOfficialBlockRelayClose(requestId);
  }

  async function addUserToWeiboBlacklist(uid, options = {}) {
    const headers = {
      'content-type': 'application/json; charset=UTF-8',
      'x-requested-with': 'XMLHttpRequest',
      'client-version': '3.0.0',
    };
    const xsrf = getCookieValue('XSRF-TOKEN');
    if (xsrf) headers['x-xsrf-token'] = xsrf;

    const payload = {
      uid: Number(uid),
      status: 1,
      interact: 1,
      follow: 1,
    };
    const body = JSON.stringify(payload);

    // 微博 WAF 会拒绝搜索子域发起的跨域拉黑请求；交给后台主站页同源执行。
    if (location.hostname === 's.weibo.com') {
      if (options.allowRelay === false) {
        throw new Error('新浪微博官方黑名单请求必须在主站同源执行');
      }
      return requestOfficialBlockViaMainHost(uid);
    }

    const apiHost =
      location.hostname === 'www.weibo.com'
        ? 'https://www.weibo.com'
        : 'https://weibo.com';
    const res = await WB_BL_NATIVE.fetch(`${apiHost}/ajax/statuses/filterUser`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body,
    });

    let data = null;
    try {
      data = await res.clone().json();
    } catch {}
    if (!res.ok || data?.ok !== 1) {
      throw new Error(
        data?.msg || data?.message || `新浪微博返回异常（HTTP ${res.status}）`
      );
    }
    return data;
  }

  processOfficialBlockRelay();

  async function addContextUserToBLAndWeibo(ctx) {
    if (!ctx?.uid) return;
    await addContextUserToBL(ctx, { showToast: false });
    showUserContextToast(`已本地屏蔽 @${ctx.name}，正在加入新浪微博官方黑名单...`);

    try {
      await addUserToWeiboBlacklist(ctx.uid);
      showUserContextToast(`已屏蔽 @${ctx.name}，并加入新浪微博官方黑名单`);
    } catch (err) {
      console.warn('[WB-BL] 新浪微博官方黑名单加入失败', err);
      showUserContextToast(`本地已屏蔽 @${ctx.name}，新浪微博官方黑名单加入失败`);
    }
  }

  function openContextUserProfile(ctx) {
    if (!ctx?.url) return;
    if (_GM_openInTab) {
      _GM_openInTab(ctx.url, { active: true });
      return;
    }
    window.open(ctx.url, '_blank', 'noopener');
  }

  function injectUserContextMenuCSS() {
    injectCSSWhenReady(`
      .wb-user-context-menu {
        position: fixed;
        z-index: 1000000;
        min-width: 248px;
        padding: 6px;
        display: none;
        background: #fff;
        color: #111;
        border: 1px solid rgba(0,0,0,.08);
        border-radius: 10px;
        box-shadow: 0 12px 32px rgba(0,0,0,.18);
        font-size: 14px;
        line-height: 1.4;
        pointer-events: auto;
        user-select: none;
      }
      .wb-user-context-menu[data-wb-open="1"] {
        display: block !important;
      }
      .wb-user-context-menu button {
        width: 100%;
        display: block;
        border: 0;
        border-radius: 8px;
        padding: 9px 10px;
        background: transparent;
        color: inherit;
        text-align: left;
        cursor: pointer;
        font: inherit;
      }
      .wb-user-context-menu button:hover {
        background: #f5f5f5;
      }
      .wb-user-context-menu-separator {
        height: 1px;
        margin: 5px 6px;
        background: rgba(0,0,0,.1);
      }
    `);
  }

  let showUserContextToastImpl = null;

  function initUserContextMenu() {
    injectUserContextMenuCSS();
    let activeCtx = null;
    let menuOpenedAt = 0;
    let lastViewportWidth = window.innerWidth;
    let lastViewportHeight = window.innerHeight;

    const ensureMenu = () => {
      let menu = document.querySelector('.wb-user-context-menu');
      if (menu?.getAttribute('data-__wb_context_menu_ready') === '1') {
        return menu;
      }
      if (menu) menu.remove();

      menu = document.createElement('div');
      menu.className = 'wb-user-context-menu';
      menu.setAttribute('data-__wb_context_menu_ready', '1');
      menu.innerHTML = `
        <button type="button" data-action="open">在新选项卡中打开链接</button>
        <div class="wb-user-context-menu-separator" role="separator"></div>
        <button type="button" data-action="block"></button>
        <button type="button" data-action="block-official"></button>
      `;
      menu.addEventListener('pointerdown', (e) => e.stopPropagation());
      menu.addEventListener('mousedown', (e) => e.stopPropagation());
      menu.addEventListener('mouseup', (e) => e.stopPropagation());
      menu.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      menu.addEventListener('click', async (e) => {
        if (!isTrustedUserEvent(e)) return;
        e.stopPropagation();
        const btn = e.target.closest('button[data-action]');
        if (!btn || !activeCtx) return;
        const action = btn.getAttribute('data-action');
        const ctx = activeCtx;
        hideMenu({ force: true });
        try {
          if (
            action === 'block' &&
            (await confirmContextUserBlocking(ctx, false))
          ) {
            await addContextUserToBL(ctx);
          }
          if (
            action === 'block-official' &&
            (await confirmContextUserBlocking(ctx, true))
          ) {
            await addContextUserToBLAndWeibo(ctx);
          }
        } catch (error) {
          console.warn('[WB-BL] 屏蔽操作失败', error);
          showUserContextToast(error?.message || '屏蔽操作失败，请稍后重试');
        }
        if (action === 'open') openContextUserProfile(ctx);
      });
      (document.body || document.documentElement).appendChild(menu);
      return menu;
    };

    const positionMenu = (menu, x, y) => {
      menu.style.removeProperty('display');
      menu.setAttribute('data-wb-open', '1');
      menu.style.setProperty('pointer-events', 'auto', 'important');
      menu.style.left = `${x}px`;
      menu.style.top = `${y}px`;

      const rect = menu.getBoundingClientRect();
      const left = Math.min(x, window.innerWidth - rect.width - 8);
      const top = Math.min(y, window.innerHeight - rect.height - 8);
      menu.style.left = `${Math.max(8, left)}px`;
      menu.style.top = `${Math.max(8, top)}px`;
      menuOpenedAt = Date.now();
    };

    const isEventInsideMenu = (event) => {
      const menu = document.querySelector('.wb-user-context-menu');
      if (!menu || getComputedStyle(menu).display === 'none') return false;
      return !!(
        event?.target instanceof Node &&
        menu.contains(event.target)
      );
    };

    const hideMenu = (options = {}) => {
      const force = !!options.force;
      const event = options.event || null;
      if (!force && isEventInsideMenu(event)) return;
      const menu = document.querySelector('.wb-user-context-menu');
      if (menu) {
        menu.removeAttribute('data-wb-open');
        menu.style.removeProperty('display');
      }
      activeCtx = null;
    };

    showUserContextToastImpl = (message) =>
      showNotification(message, { type: 'success' });

    const handleContextMenu = (e) => {
      if (!isTrustedUserEvent(e)) return;
      const eventTarget =
        e.target instanceof Element ? e.target : e.target?.parentElement;
      const nameTarget = getUserNameContextTarget(eventTarget);
      const directTarget = eventTarget?.closest?.(
        USER_CONTEXT_TARGET_SELECTOR
      );
      const contextTarget = nameTarget || directTarget;
      const ctx = contextTarget
        ? getUserContextFromTarget(contextTarget)
        : null;
      if (!ctx) {
        hideMenu({ force: true });
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      activeCtx = ctx;

      const menu = ensureMenu();
      const blockBtn = menu.querySelector('[data-action="block"]');
      const officialBlockBtn = menu.querySelector(
        '[data-action="block-official"]'
      );
      blockBtn.textContent = BL.has(ctx.uid)
        ? `已屏蔽 @${ctx.name}`
        : `屏蔽 @${ctx.name}`;
      officialBlockBtn.textContent = `屏蔽 @${ctx.name}（同时加入新浪微博官方黑名单）`;
      positionMenu(menu, e.clientX, e.clientY);
    };

    document.addEventListener('contextmenu', handleContextMenu, true);

    document.addEventListener(
      'pointerdown',
      (e) => {
        if (e.button !== 0) return;
        if (Date.now() - menuOpenedAt < 80) return;
        hideMenu({ event: e });
      },
      true
    );
    window.addEventListener(
      'scroll',
      () => {
        const menu = document.querySelector('.wb-user-context-menu');
        if (!menu || getComputedStyle(menu).display === 'none') return;
        hideMenu({ force: true });
      },
      true
    );
    window.addEventListener('resize', (e) => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const changed =
        width !== lastViewportWidth || height !== lastViewportHeight;
      lastViewportWidth = width;
      lastViewportHeight = height;
      if (!changed) return;
      hideMenu({ event: e });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideMenu({ force: true });
    });
  }

  function showUserContextToast(message) {
    if (typeof showUserContextToastImpl === 'function') {
      showUserContextToastImpl(message);
    }
  }

  function hideBlockedCommentRoots(root = document) {
    if (isRelationshipListPage()) {
      restoreHiddenRelationshipItems(document);
      return false;
    }
    if (!CONTENT_FILTER_CFG.hideBlacklistComments) return false;
    if (!BL.size || !root || !root.querySelectorAll) return false;
    const nodes = [];
    if (root instanceof Element && root.matches(DOM_UID_SELECTOR)) {
      nodes.push(root);
    }
    root.querySelectorAll(DOM_UID_SELECTOR).forEach((el) => nodes.push(el));

    let hiddenAny = false;
    nodes.forEach((el) => {
      const blockedUID = [...extractDOMUIDs(el)].find((uid) => BL.has(uid));
      if (!blockedUID) return;
      const commentRoot = findCommentRootForUID(el, blockedUID);
      if (commentRoot && hideContentRoot(commentRoot, blockedUID)) {
        hiddenAny = true;
      }
    });
    return hiddenAny;
  }

  function stillLooksLikeRecognizedAd(node) {
    if (!(node instanceof Element)) return false;
    return (
      node.matches(EXPLICIT_AD_SELECTOR) ||
      !!node.querySelector(EXPLICIT_AD_SELECTOR) ||
      hasExplicitAdLabel(node) ||
      // 虚拟列表会把同一个壳复用给另一条微博，按登记表重新核对当前条目标识。
      isRegisteredAdPostRoot(node)
    );
  }

  function stillLooksLikeTimelineRecommendation(node) {
    return findTimelineRecommendationArticles(node).length > 0;
  }

  function restoreRecycledVirtualAdShells(scope) {
    const nodes = [];
    if (scope instanceof Element && scope.matches(HIDDEN_AD_SELECTOR)) {
      nodes.push(scope);
    }
    scope
      .querySelectorAll(HIDDEN_AD_SELECTOR)
      .forEach((node) => nodes.push(node));

    Array.from(new Set(nodes)).forEach((node) => {
      if (!(node instanceof Element) || !node.closest(VIRTUAL_VIEW_SELECTOR)) {
        return;
      }
      // Vue 会把同一个壳复用给另一条微博。广告标记必须重新验证，否则回收后
      // 的正常微博会继续沿用上一条广告的隐藏状态。
      if (!stillLooksLikeRecognizedAd(node)) {
        node.removeAttribute(HIDDEN_AD_ATTR);
        // 移除标记只恢复壳的原始高度，DynamicScroller 仍缓存隐藏期间的 2px 测量
        // 值。不补发重测时，复用后的正常微博会被压缩显示，后续行坐标随之错位。
        // 黑名单与推荐内容两条恢复路径同样在此处补发重测。
        requestNativeVirtualItemRemeasure(node);
      }
    });
  }

  function restoreRecycledVirtualTimelineRecommendationShells(scope) {
    const nodes = [];
    if (
      scope instanceof Element &&
      scope.matches(HIDDEN_TIMELINE_RECOMMENDATION_SELECTOR)
    ) {
      nodes.push(scope);
    }
    scope
      .querySelectorAll(HIDDEN_TIMELINE_RECOMMENDATION_SELECTOR)
      .forEach((node) => nodes.push(node));

    Array.from(new Set(nodes)).forEach((node) => {
      if (!(node instanceof Element) || !node.closest(VIRTUAL_VIEW_SELECTOR)) {
        return;
      }
      if (!stillLooksLikeTimelineRecommendation(node)) {
        node.removeAttribute(HIDDEN_TIMELINE_RECOMMENDATION_ATTR);
        requestNativeVirtualItemRemeasure(node);
      }
    });
  }

  function restoreRecycledVirtualContentShells(root = document) {
    if (!root || !root.querySelectorAll) return;
    const scope =
      root instanceof Element
        ? root.closest(VIRTUAL_VIEW_SELECTOR) || root
        : root;
    restoreRecycledVirtualAdShells(scope);
    restoreRecycledVirtualTimelineRecommendationShells(scope);
    const nodes = [];
    if (
      scope instanceof Element &&
      scope.matches(BLOCKED_CONTENT_HIDE_SELECTOR)
    ) {
      nodes.push(scope);
    }
    scope
      .querySelectorAll(BLOCKED_CONTENT_HIDE_SELECTOR)
      .forEach((node) => nodes.push(node));

    Array.from(new Set(nodes)).forEach((node) => {
      if (!(node instanceof Element)) return;
      // Migrate legacy outer-view markers immediately. New builds only hide
      // the direct content shell, which lets Vue keep ownership of recycling.
      if (node.matches(VIRTUAL_VIEW_SELECTOR)) {
        clearOwnBlockedContentHideState(node);
        return;
      }
      const uid = String(
        node.getAttribute(BLOCKED_CONTENT_UID_ATTR) || ''
      ).trim();
      const stillRepresentsBlockedUser =
        /^\d{5,}$/.test(uid) &&
        BL.has(uid) &&
        contentRootOwnedByUID(node, uid);
      if (!stillRepresentsBlockedUser) {
        // Vue and the search/comment views can patch an existing DOM shell for
        // another owner. Revalidate every hidden content type, including
        // comments and non-virtual cards, before allowing the marker to persist.
        clearOwnBlockedContentHideState(node);
      }
    });
  }

  function hideBlockedDOMPosts(root = document) {
    syncRelationshipPageMode();
    const hiddenAd = hideRecognizedAds(root || document);
    const hiddenTimelineRecommendation = hideTimelineRecommendations(
      root || document
    );
    suppressFloatingVideoPlayers(root || document);
    if (!root || !root.querySelectorAll) return;
    if (isRelationshipListPage()) {
      restoreHiddenRelationshipItems(document);
      return;
    }
    restoreRecycledVirtualContentShells(root);
    syncVirtualRowMeasurementShells(document);
    if (!BL.size) {
      compactVirtualScrollerGaps(root);
      return;
    }
    const nodes = [];
    if (root instanceof Element && root.matches(DOM_UID_SELECTOR)) {
      nodes.push(root);
    }
    root.querySelectorAll(DOM_UID_SELECTOR).forEach((el) => nodes.push(el));

    let hiddenAny =
      hiddenAd ||
      hiddenTimelineRecommendation ||
      hideBlockedSearchResultCards(root);
    nodes.forEach((el) => {
      const blockedUID = [...extractDOMUIDs(el)].find((uid) => BL.has(uid));
      if (!blockedUID) return;

      const post = findContentRootForUID(el, blockedUID);
      if (!shouldHideBlacklistDOMRoot(post)) return;
      if (hideContentRoot(post, blockedUID)) hiddenAny = true;
    });
    compactVirtualScrollerGaps(hiddenAny ? document : root);
    if (hiddenAny) {
      suppressFloatingVideoPlayers(document);
      nudgeTimelineLayout();
    }
  }

  function queueBlockedDOMRefresh(root = document, delay = 60) {
    WB_INTERNAL.dom.schedule(
      'blocked-content-filter',
      () => refreshBlockedContent(root || document),
      delay
    );
  }

  // 评论侧按 findCommentRootForUID 单独定位隐藏目标，微博侧的过滤不覆盖它。
  // 两者必须成对执行，否则只有重新渲染过的评论才会被隐藏。
  function refreshBlockedContent(root = document) {
    const scope = root || document;
    hideBlockedDOMPosts(scope);
    hideBlockedCommentRoots(scope);
  }

  function nudgeTimelineLayout() {
    WB_INTERNAL.dom.schedule(
      'blocked-layout-primary',
      () => {
        document.dispatchEvent(
          new CustomEvent(LAYOUT_REFRESH_EVENT, {
            detail: { reason: 'blocked-content' },
          })
        );
        WB_INTERNAL.dom.schedule(
          'blocked-layout-followup',
          () => {
            document.dispatchEvent(
              new CustomEvent(LAYOUT_REFRESH_EVENT, {
                detail: { reason: 'blocked-content' },
              })
            );
          },
          240
        );
      },
      30
    );
  }

  function scheduleBlockedDOMRefresh() {
    if (isRelationshipListPage()) {
      restoreHiddenRelationshipItems(document);
      return;
    }
    queueBlockedDOMRefresh(document, 16);
    WB_INTERNAL.dom.schedule(
      'blocked-content-followup',
      () => refreshBlockedContent(document),
      320
    );
  }

  function scheduleBlockedDOMRefreshWhenPageReady() {
    const run = () => {
      hideBlockedDOMPosts(document);
      hideBlockedCommentRoots(document);
      scheduleBlockedDOMRefresh();
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
      run();
    }
    window.addEventListener('load', run, { once: true });
    WB_INTERNAL.dom.schedule('blocked-page-ready-followup', run, 1200);
  }

  let timelineStallCheckFrame = 0;
  function checkTimelinePaginationOnScroll() {
    if (timelineStallCheckFrame) return;
    timelineStallCheckFrame = requestAnimationFrame(() => {
      timelineStallCheckFrame = 0;
      if (isRelationshipListPage()) return;
      recoverStalledTimelinePagination();
    });
  }

  function isRelevantBlockedLayoutMutationTarget(
    target,
    hasHiddenLayoutState = null
  ) {
    if (!(target instanceof Element)) return false;
    const hasHiddenState =
      typeof hasHiddenLayoutState === 'boolean'
        ? hasHiddenLayoutState
        : hasHiddenNonCommentContent(document);
    if (!hasHiddenState) return false;
    if (isInsideCommentContentRoot(target)) return false;
    if (
      target.matches(FLOATING_VIDEO_PLAYER_SELECTOR) ||
      target.closest(FLOATING_VIDEO_PLAYER_SELECTOR)
    ) {
      return false;
    }
    return (
      target.matches(VIRTUAL_WRAPPER_SELECTOR) ||
      !!target.closest(VIRTUAL_WRAPPER_SELECTOR) ||
      (target.matches(VIRTUAL_ITEM_SELECTOR) &&
        isEligibleVirtualScrollerItem(target)) ||
      (isEligibleVirtualScrollerItem(target) &&
        !!target.closest(VIRTUAL_ITEM_SELECTOR)) ||
      !!target.querySelector?.(HIDDEN_FEED_CONTENT_SELECTOR)
    );
  }

  // === MutationObserver 过滤 ===
  (function () {
    let pendingMutations = [];
    const processMutations = () => {
      const ms = pendingMutations;
      pendingMutations = [];
      if (isRelationshipListPage()) {
        restoreHiddenRelationshipItems(document);
        return;
      }
      const attributeMutations = ms.filter(
        (mutation) => mutation.type === 'attributes'
      );
      const hasHiddenLayoutState =
        attributeMutations.length > 0 &&
        hasHiddenNonCommentContent(document);
      const needsFullRefresh = attributeMutations.some((mutation) =>
        isRelevantBlockedLayoutMutationTarget(
          mutation.target,
          hasHiddenLayoutState
        )
      );
      const addedRoots = WB_INTERNAL.dom.collectAddedRoots(ms);
      const hasHiddenFeedContent =
        addedRoots.length > 0 && hasHiddenNonCommentContent(document);
      addedRoots.forEach((addedElement) => {
        hideRecognizedAds(addedElement);
        hideTimelineRecommendations(addedElement);
        suppressFloatingVideoPlayers(addedElement);
        if (
          hasHiddenFeedContent ||
          addedElement.matches(DOM_UID_SELECTOR) ||
          addedElement.querySelector(DOM_UID_SELECTOR)
        ) {
          hideBlockedDOMPosts(addedElement);
        }
        hideBlockedCommentRoots(addedElement);
      });
      if (needsFullRefresh) queueBlockedDOMRefresh(document, 30);
    };
    WB_INTERNAL.dom.subscribeMutations('content-filter', (mutations) => {
      pendingMutations.push(...mutations);
      WB_INTERNAL.dom.schedule('content-mutation-batch', processMutations, 60);
    });
    const refreshForRoute = () => {
      syncRelationshipPageMode();
      const root = document.body || document.documentElement;
      if (root) {
        hideBlockedDOMPosts(root);
      }
    };
    WB_INTERNAL.dom.subscribeRoute('content-filter', () => {
      WB_INTERNAL.dom.schedule('content-route-refresh', refreshForRoute, 30);
    });
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', refreshForRoute, {
        once: true,
      });
    } else {
      refreshForRoute();
    }
  })();

  window.addEventListener('scroll', checkTimelinePaginationOnScroll, {
    passive: true,
  });
  document.addEventListener('scroll', checkTimelinePaginationOnScroll, {
    passive: true,
    capture: true,
  });
  // 只读地观察时间线内容请求的完成时刻，用于避免在原生请求仍在途时叠加续页。
  ensureTimelineRequestObserver();
  // 滚到底后页面不再产生 scroll 事件，停滞检测必须有一个独立心跳来兜底。
  setInterval(() => {
    if (isRelationshipListPage()) return;
    recoverStalledTimelinePagination();
  }, TIMELINE_STALL_POLL_MS);

  initUserContextMenu();
  initSearchResultBlacklistFilter();

  console.log(
    `[WB-BL] ${SCRIPT_NAME} v${SCRIPT_VERSION} @ ${location.hostname}，已缓存 ${BL.size} UIDs`
  );
  console.log(
    `[WB-BL] Author: DanielZenFlow | GitHub: ${GITHUB_URL}`
  );
})();

/* === Settings v5: standard navigation + UID management === */
(function () {
  'use strict';
  const UID_KEY = 'WB_BL_list';
  const UID_EXCLUSION_KEY = 'WB_BL_local_exclusions';
  const UID_MANAGER_PAGE_SIZE = 50;
  const MAX_IMPORT_FILE_SIZE = 2 * 1024 * 1024;
  const MAX_IMPORT_UIDS = 100000;

  function isTrustedSettingsEvent(event) {
    return WB_INTERNAL.isTrustedUserEvent(event);
  }

  function requestCenteredConfirm(options) {
    if (typeof WB_INTERNAL.confirm !== 'function') {
      return Promise.resolve(false);
    }
    return WB_INTERNAL.confirm(options);
  }

  function notify(message, options = {}) {
    if (typeof WB_INTERNAL.notify === 'function') {
      return WB_INTERNAL.notify(message, options);
    }
    console.info(message);
    return null;
  }

  const DEFAULTS = WB_INTERNAL.config.defaults;

  function normalizeCfg(rawCfg) {
    return WB_INTERNAL.config.normalize(rawCfg);
  }

  function loadCfg() {
    return WB_INTERNAL.config.read();
  }
  function saveCfg(cfg) {
    return WB_INTERNAL.config.write(cfg);
  }
  let CFG = loadCfg();
  const LAYOUT_REFRESH_EVENT = 'wb-retro-layout-refresh';
  const SETTINGS_CONFIG_SYNC_EVENT = 'wbset:config-sync';

  // The onboarding dialog and the settings panel share the same persisted cfg,
  // but the panel is created once and then only hidden. Keep its existing form
  // controls synchronized immediately after another UI writes cfg instead of
  // waiting for a later panel-open cycle to repair stale checkbox state.
  function syncCreatedSettingsPanelConfigUI() {
    const panel = document.querySelector('.wbset-panel');
    if (!panel?.dispatchEvent) return false;
    panel.dispatchEvent(new CustomEvent(SETTINGS_CONFIG_SYNC_EVENT));
    return true;
  }

  // ---- BL Store helpers (operate on GM cache only) ----
  function readBLExclusionSet() {
    const raw = GM_getValue(UID_EXCLUSION_KEY, '');
    return new Set(
      String(raw || '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => /^\d{5,}$/.test(s))
    );
  }
  function readBLSet() {
    const raw = GM_getValue(UID_KEY, '');
    if (!raw) return new Set();
    const exclusions = readBLExclusionSet();
    return new Set(
      String(raw)
        .split(',')
        .map((s) => String(s).trim())
        .filter((s) => /^\d{5,}$/.test(s) && !exclusions.has(s))
    );
  }
  function syncRuntimeBL(options = {}) {
    return WB_INTERNAL.blSync?.reloadFromStorage?.(options);
  }
  async function addToBL(uids) {
    return WB_INTERNAL.blStore.mutate({ add: uids });
  }
  async function removeFromBL(uids) {
    const result = await WB_INTERNAL.blStore.mutate({ remove: uids });
    return result.size;
  }
  function parseUIDInput(text) {
    return (text || '')
      .split(/[^0-9]+/g) // allow comma/space/newline
      .map((s) => s.trim())
      .filter((s) => /^\d{5,}$/.test(s));
  }

  function exportFilename(date = new Date()) {
    const pad = (value) => String(value).padStart(2, '0');
    const timestamp =
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
      `T${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
    return `pynseq-for-weibo-blocklist-${timestamp}.json`;
  }

  // 导出本地屏蔽列表备份为 JSON 文件
  function exportBlacklist() {
    const blSet = readBLSet();
    const uids = Array.from(blSet);
    const exportData = {
      exportTime: new Date().toISOString(),
      version: SCRIPT_VERSION,
      scriptName: SCRIPT_NAME,
      count: uids.length,
      uids: uids,
    };
    const jsonStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFilename();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return uids.length;
  }

  // 导入本地屏蔽列表备份，支持 JSON 或纯文本 UID 列表。
  function importBlacklist(file, mode = 'merge') {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error('未选择文件'));
        return;
      }
      if (file.size > MAX_IMPORT_FILE_SIZE) {
        reject(new Error('文件过大，请导入 2MB 以内的本地屏蔽列表文件'));
        return;
      }

      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const content = e.target.result;
          let importData = null;

          try {
            importData = JSON.parse(content);
          } catch (parseErr) {
            importData = null;
          }

          // 验证数据格式
          let uidsToImport = [];

          if (importData?.uids && Array.isArray(importData.uids)) {
            // 标准格式：{ uids: [...] }
            uidsToImport = importData.uids
              .map((u) => String(u).trim())
              .filter((u) => /^\d{5,}$/.test(u));
          } else if (Array.isArray(importData)) {
            // 简单数组格式：[...]
            uidsToImport = importData
              .map((u) => String(u).trim())
              .filter((u) => /^\d{5,}$/.test(u));
          } else if (typeof content === 'string') {
            // 纯文本格式：逗号/换行分隔
            uidsToImport = content
              .split(/[,\s\n]+/)
              .map((u) => u.trim())
              .filter((u) => /^\d{5,}$/.test(u));
          }

          if (uidsToImport.length === 0) {
            reject(new Error('未在文件中找到有效的 UID'));
            return;
          }
          uidsToImport = Array.from(new Set(uidsToImport));
          if (uidsToImport.length > MAX_IMPORT_UIDS) {
            reject(new Error(`单次最多导入 ${MAX_IMPORT_UIDS} 个 UID`));
            return;
          }

          const mutation =
            mode === 'replace'
              ? await WB_INTERNAL.blStore.mutate({ replace: uidsToImport })
              : await WB_INTERNAL.blStore.mutate({ add: uidsToImport });
          resolve({
            success: true,
            importedCount: uidsToImport.length,
            addedCount: mutation.added,
            removedCount: mutation.removed,
            totalCount: mutation.size,
            mode,
            exportTime: importData?.exportTime || '未知',
            exportVersion: importData?.version || '未知',
          });
        } catch (err) {
          reject(new Error('导入失败：' + err.message));
        }
      };

      reader.onerror = () => {
        reject(new Error('文件读取失败'));
      };

      reader.readAsText(file);
    });
  }

  // 创建隐藏的文件输入元素
  function createFileInput(onFileSelected) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.txt';
    input.style.display = 'none';
    input.addEventListener('change', (e) => {
      if (!isTrustedSettingsEvent(e)) return;
      const file = e.target.files[0];
      if (file) {
        onFileSelected(file);
      }
      // 清空以便重复选择同一文件
      input.value = '';
    });
    document.body.appendChild(input);
    return input;
  }

  // ---- DOM hider based on titles ----
  function normText(s) {
    return (s || '').replace(/\s+/g, '').trim();
  }
  function buildBlockTitles() {
    const t = [];
    if (CFG.hideHotSearch) t.push('微博热搜');
    if (CFG.hideSuggestedPeople) t.push('你可能感兴趣的人');
    if (CFG.hideFollowRecommendations) t.push('关注推荐');
    if (CFG.hideCommonFunctions) t.push('常用功能');
    if (CFG.hideFanGroups) t.push('粉丝群');
    if (CFG.hideFrequentSuperTopics) {
      t.push('经常访问的超话', '经常访问超话');
    }
    return new Set(t);
  }
  const SEARCH_RELATED_USERS_HIDDEN_ATTR =
    'data-__wb_search_related_users_hidden';
  const PANEL_HIDDEN_ATTR = 'data-__wb_hidden_by_userscript';
  const SIDEBAR_LEAD_GAP_ATTR = 'data-__wb_sidebar_lead_gap';
  let sidebarVisibilityDirty = false;

  function markPanelHidden(panel) {
    if (!(panel instanceof Element) || panel.hasAttribute(PANEL_HIDDEN_ATTR)) {
      return false;
    }
    panel.setAttribute(PANEL_HIDDEN_ATTR, '1');
    sidebarVisibilityDirty = true;
    return true;
  }

  function unmarkPanelHidden(panel) {
    if (!(panel instanceof Element) || !panel.hasAttribute(PANEL_HIDDEN_ATTR)) {
      return false;
    }
    panel.removeAttribute(PANEL_HIDDEN_ATTR);
    sidebarVisibilityDirty = true;
    return true;
  }

  // 微博把侧栏首个模块渲染成没有上外边距的卡片，后续模块才带 8px 卡片间距。
  // 脚本隐藏靠前的模块后，后一个模块的上外边距会沿首子链向上塌陷成整条轨道的
  // 前导空白，首个可见模块因此比左侧主列低几个像素。这里只把这段确实塌陷出来
  // 的外边距标记出来交给样式表清零，不写入内联样式，也不改动模块之间的原生
  // 间距；首个模块本来就可见时保持微博原生结果。
  function markSidebarLeadGap() {
    let changed = false;
    const previous = new Set(
      document.querySelectorAll(`[${SIDEBAR_LEAD_GAP_ATTR}]`)
    );
    const next = new Set();

    document.querySelectorAll('.wbpro-side-main').forEach((container) => {
      const modules = Array.from(container.children);
      const firstVisibleIndex = modules.findIndex(
        (module) => module.getBoundingClientRect().height > 0
      );
      if (firstVisibleIndex <= 0) return;
      const hiddenByUserscript = modules
        .slice(0, firstVisibleIndex)
        .some(
          (module) =>
            module.matches(`[${PANEL_HIDDEN_ATTR}]`) ||
            !!module.querySelector(`[${PANEL_HIDDEN_ATTR}]`)
        );
      // 前面的模块不是脚本隐藏的，交给微博自己决定间距。
      if (!hiddenByUserscript) return;

      let cur = modules[firstVisibleIndex];
      let depth = 0;
      while (cur instanceof Element && depth < 6) {
        const style = getComputedStyle(cur);
        // 已标记的那一层此时算出来的上外边距就是被本脚本清零的结果，必须按
        // 命中处理，否则每次扫描都会先撤销标记、下次再重新加上，来回抖动。
        if (
          cur.hasAttribute(SIDEBAR_LEAD_GAP_ATTR) ||
          (Number.parseFloat(style.marginTop) || 0) > 0
        ) {
          next.add(cur);
          return;
        }
        // 外边距无法再向上塌陷，更深处的间距属于模块内部，保持原生。
        if (
          (Number.parseFloat(style.borderTopWidth) || 0) > 0 ||
          (Number.parseFloat(style.paddingTop) || 0) > 0
        ) {
          return;
        }
        cur = cur.firstElementChild;
        depth++;
      }
    });

    previous.forEach((el) => {
      if (next.has(el)) return;
      el.removeAttribute(SIDEBAR_LEAD_GAP_ATTR);
      changed = true;
    });
    next.forEach((el) => {
      if (el.hasAttribute(SIDEBAR_LEAD_GAP_ATTR)) return;
      el.setAttribute(SIDEBAR_LEAD_GAP_ATTR, '1');
      changed = true;
    });
    if (changed) sidebarVisibilityDirty = true;
  }

  // 微博右侧轨道的高度由微博自身的 MutationObserver 负责：该回调按
  // `.hotBand` 的实际高度重新计算轨道容器高度和 `#__sidebar` 的 min-height，
  // 而它只监听 childList / characterData，不监听属性变化。脚本用标记属性配合
  // 样式表隐藏卡片不会产生 childList 变化，微博因此一直沿用隐藏时算出的旧
  // 高度，恢复热搜后轨道被按旧高度吸附住。这里插入并立即移除一个不参与布局
  // 的注释节点，制造一次真实的 childList 变化，把重排交回微博原生逻辑，脚本
  // 自身不写入任何轨道定位或占位高度。
  function nudgeNativeSidebarObserver() {
    const roots = new Set();
    document
      .querySelectorAll(
        '#__sidebar, .rightSide, [class*="_sideBox_"], .wbpro-side-main'
      )
      .forEach((root) => roots.add(root));
    roots.forEach((root) => {
      if (!root.isConnected) return;
      const marker = document.createComment('wb-pynseq-relayout');
      root.appendChild(marker);
      marker.remove();
    });
  }

  function requestNativeSidebarRelayout() {
    WB_INTERNAL.dom.schedule(
      'sidebar-native-relayout',
      nudgeNativeSidebarObserver,
      0
    );
    WB_INTERNAL.dom.schedule(
      'sidebar-native-relayout-followup',
      nudgeNativeSidebarObserver,
      260
    );
  }

  function flushSidebarVisibilityChanges() {
    if (!sidebarVisibilityDirty) return;
    sidebarVisibilityDirty = false;
    requestNativeSidebarRelayout();
  }

  function hideSearchRelatedUsersPanel(root = document) {
    if (
      location.hostname !== 's.weibo.com' ||
      !/^\/weibo(?:\/|$)/.test(location.pathname) ||
      !root ||
      !root.querySelectorAll
    ) {
      return;
    }

    if (!CFG.hideSearchRelatedUsers) {
      document
        .querySelectorAll(`[${SEARCH_RELATED_USERS_HIDDEN_ATTR}]`)
        .forEach((panel) => {
          panel.removeAttribute(SEARCH_RELATED_USERS_HIDDEN_ATTR);
          unmarkPanelHidden(panel);
        });
      return;
    }

    const headings = [];
    if (
      root instanceof Element &&
      root.matches('.card-head .title') &&
      normText(root.textContent) === '相关用户'
    ) {
      headings.push(root);
    }
    root.querySelectorAll('.card-head .title').forEach((heading) => {
      if (normText(heading.textContent) === '相关用户') headings.push(heading);
    });

    headings.forEach((heading) => {
      const panel = heading.closest('.card-wrap');
      if (
        !panel ||
        panel === document.body ||
        panel === document.documentElement
      ) {
        return;
      }
      panel.setAttribute(SEARCH_RELATED_USERS_HIDDEN_ATTR, '1');
      markPanelHidden(panel);
    });
  }

  function findSectionRootFromHeading(h) {
    const side = h.closest('.wbpro-side');
    if (side && side !== document.body && side !== document.documentElement) {
      return side;
    }

    let cur = h;
    while (cur && cur !== document.documentElement) {
      const hasHotSearchParts = cur.querySelector(
        '.wbpro-side-bottom, .wbpro-side-card7, [class*="cardHotSearch_tab_"]'
      );
      const isSidePanel = cur.matches(
        '.wbpro-side, .wbpro-side-panel, [class*="Card_wrap_"]'
      );
      if (hasHotSearchParts || isSidePanel) return cur;
      cur = cur.parentElement;
    }
    return (
      h.closest('.wbpro-side, .wbpro-side-panel, [class*="Card_wrap_"]') || h
    );
  }

  function promoteHiddenSidebarShells(root = document) {
    if (!root || !root.querySelectorAll) return;
    const hidden = [];
    const selector = `[${PANEL_HIDDEN_ATTR}]`;
    if (root instanceof Element && root.matches(selector)) hidden.push(root);
    root.querySelectorAll(selector).forEach((panel) => hidden.push(panel));

    hidden.forEach((panel) => {
      const side = panel.closest('.wbpro-side');
      if (
        !side ||
        side === panel ||
        side === document.body ||
        side === document.documentElement
      ) {
        return;
      }
      panel.removeAttribute(PANEL_HIDDEN_ATTR);
      markPanelHidden(side);
    });
  }
  function hidePanels(root = document) {
    promoteHiddenSidebarShells(root);
    hideFollowRecommendationPanel(root);
    hideSearchRelatedUsersPanel(root);

    const BLOCK_TITLES = buildBlockTitles();
    const headings = root.querySelectorAll(
      '.wbpro-side-tit .cla, [class*="cardHotSearch_tit_"] .cla, .wbpro-side .f16.fm.cla, .wbpro-side-tit .woo-box-item-flex, .wbpro-side [class*="_topicTitleText_"], .wbpro-side [class*="topicTitleText"]'
    );
    headings.forEach((h) => {
      const text = normText(h.textContent);
      if (!text) return;
      for (const t of BLOCK_TITLES) {
        if (text.includes(normText(t))) {
          markPanelHidden(findSectionRootFromHeading(h));
          break;
        }
      }
    });
    hideSearchHotBand(root);
    markSidebarLeadGap();
    flushSidebarVisibilityChanges();
  }

  function restoreManagedPanels() {
    document.querySelectorAll(`[${PANEL_HIDDEN_ATTR}]`).forEach((panel) => {
      unmarkPanelHidden(panel);
      panel.removeAttribute(SEARCH_RELATED_USERS_HIDDEN_ATTR);
    });
  }

  function applyPanelSettingsNow() {
    restoreManagedPanels();
    hidePanels(document);
    queuePanelRefresh(document, 80);
  }

  function queuePanelRefresh(root = document, delay = 80) {
    WB_INTERNAL.dom.schedule(
      'sidebar-panel-refresh',
      () => hidePanels(root || document),
      delay
    );
  }

  function scheduleInitialPanelAlignment() {
    const run = () => hidePanels(document);
    WB_INTERNAL.dom.schedule('sidebar-initial-primary', run, 16);
    WB_INTERNAL.dom.schedule('sidebar-initial-secondary', run, 180);
    WB_INTERNAL.dom.schedule('sidebar-initial-followup', run, 900);
  }

  function hideFollowRecommendationPanel(root = document) {
    if (!CFG.hideFollowRecommendations || !root || !root.querySelectorAll)
      return;
    const selector = '[page="profileRecom"]';
    const panels = [];
    if (root instanceof Element && root.matches(selector)) panels.push(root);
    root.querySelectorAll(selector).forEach((panel) => panels.push(panel));
    panels.forEach((panel) => markPanelHidden(panel));
  }
  function hideSearchHotBand(root = document) {
    if (!CFG.hideHotSearch || !root || !root.querySelectorAll) return;
    const HOT_BAND_SELECTOR =
      '#hot-band-container, .hot-band-container, .hot-band-tabs';
    const panels = new Set();
    if (root instanceof Element && root.matches(HOT_BAND_SELECTOR)) {
      panels.add(root);
    }
    root.querySelectorAll(HOT_BAND_SELECTOR).forEach((panel) => {
      panels.add(panel);
    });
    panels.forEach((panel) => {
      const side = panel.closest('.wbpro-side');
      if (
        side &&
        side !== document.body &&
        side !== document.documentElement &&
        normText(side.textContent).includes('微博热搜')
      ) {
        markPanelHidden(side);
        return;
      }

      const target = findSearchHotBandContainer(panel);
      if (target && target.isConnected) {
        markPanelHidden(target);
      }
    });
  }
  function findSearchHotBandContainer(panel) {
    if (
      panel.id === 'hot-band-container' ||
      panel.classList.contains('hot-band-container')
    ) {
      return panel;
    }

    const card = panel.closest(
      '.card-wrap, .card, [class*="card"], [class*="Card"]'
    );
    if (
      card &&
      card !== document.body &&
      card !== document.documentElement
    ) {
      return card;
    }

    const parent = panel.parentElement;
    if (
      parent &&
      parent !== document.body &&
      parent !== document.documentElement &&
      parent.children.length <= 2
    ) {
      return parent;
    }
    return panel;
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', () => {
      hidePanels();
      scheduleInitialPanelAlignment();
    });
  else {
    hidePanels();
    scheduleInitialPanelAlignment();
  }
  document.addEventListener(LAYOUT_REFRESH_EVENT, (event) => {
    const isBlockedRefresh = event?.detail?.reason === 'blocked-content';
    if (isBlockedRefresh) {
      hidePanels(document);
    }
    queuePanelRefresh(document, isBlockedRefresh ? 180 : 90);
  });
  WB_INTERNAL.dom.subscribeMutations('sidebar-panels', (mutations) => {
    WB_INTERNAL.dom
      .collectAddedRoots(mutations)
      .forEach((root) => hidePanels(root));
  });
  window.addEventListener('resize', () => {
    queuePanelRefresh(document, 80);
  });
  WB_INTERNAL.dom.subscribeRoute('sidebar-panels', () => {
    queuePanelRefresh(document, 80);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      queuePanelRefresh(document, 80);
    }
  });

  // ---- Settings UI ----
  function ensureStyles() {
    if (document.getElementById('wbset-style')) return;
    const css = `
    [${PANEL_HIDDEN_ATTR}="1"]{display:none!important}
    [${SIDEBAR_LEAD_GAP_ATTR}="1"]{margin-top:0!important}
    .wbset-btn{position:fixed;right:24px;bottom:24px;z-index:999999;width:46px;height:46px;display:grid;place-items:center;padding:0;border:1px solid rgba(0,0,0,.1);border-radius:50%;background:rgba(255,255,255,.94);color:#252525;cursor:pointer;box-shadow:0 8px 26px rgba(0,0,0,.18);backdrop-filter:blur(10px);transition:transform .18s ease,box-shadow .18s ease,background .18s ease;}
    .wbset-btn svg{width:21px;height:21px;display:block;transition:transform .22s ease}
    .wbset-btn:hover{background:#fff;transform:translateY(-2px);box-shadow:0 12px 32px rgba(0,0,0,.22)}
    .wbset-btn:hover svg{transform:rotate(24deg)}.wbset-btn:active{transform:translateY(0) scale(.96)}
    .wbset-panel{--wbset-bg:#fff;--wbset-sidebar:#f7f7f8;--wbset-text:#171717;--wbset-muted:#6f6f78;--wbset-border:#e8e8eb;--wbset-hover:#eeeeF1;--wbset-accent:#111;--wbset-radius-lg:10px;--wbset-radius-md:8px;--wbset-radius-sm:6px;position:fixed;inset:0;z-index:999998;display:none;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,.42);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;color:var(--wbset-text);}
    .wbset-card{width:min(940px,94vw);height:min(720px,90vh);display:grid;grid-template-rows:auto minmax(0,1fr) auto;overflow:hidden;background:var(--wbset-bg);color:var(--wbset-text);border:1px solid rgba(0,0,0,.08);border-radius:var(--wbset-radius-lg);box-shadow:0 24px 70px rgba(0,0,0,.28);}
    .wbset-hdr{min-height:64px;padding:0 20px;border-bottom:1px solid var(--wbset-border);display:flex;align-items:center;justify-content:space-between;}
    .wbset-title{display:flex;align-items:baseline;gap:10px}.wbset-title strong{font-size:16px}.wbset-version{font-size:12px;color:var(--wbset-muted)}
    .wbset-shell{display:grid;grid-template-columns:196px minmax(0,1fr);min-height:0}
    .wbset-nav{padding:14px 10px;background:var(--wbset-sidebar);border-right:1px solid var(--wbset-border);overflow:auto}
    .wbset-nav button{width:100%;padding:9px 11px;margin:2px 0;border:0;border-radius:var(--wbset-radius-sm);background:transparent;color:var(--wbset-muted);font:500 13px/1.3 inherit;text-align:left;cursor:pointer}
    .wbset-nav button:hover{background:var(--wbset-hover);color:var(--wbset-text)}
    .wbset-nav button.is-active{background:var(--wbset-bg);color:var(--wbset-text);box-shadow:0 0 0 1px var(--wbset-border)}
    .wbset-content{min-width:0;overflow:auto;padding:26px 30px 34px}
    .wbset-page{display:none}.wbset-page.is-active{display:block}
    .wbset-page-head{margin-bottom:22px}.wbset-page-head h3{margin:0 0 5px;font-size:20px;line-height:1.3}.wbset-page-head p{margin:0;color:var(--wbset-muted);font-size:13px}
    .wbset-sec{padding:0;border:1px solid var(--wbset-border);border-radius:var(--wbset-radius-md);overflow:hidden;margin-bottom:16px;background:var(--wbset-bg)}
    .wbset-sec-title{padding:13px 15px 10px;font-size:13px;font-weight:650;border-bottom:1px solid var(--wbset-border)}
    .wbset-setting{position:relative;display:flex;align-items:center;justify-content:space-between;gap:20px;padding:13px 15px;border-bottom:1px solid var(--wbset-border);cursor:pointer}
    .wbset-setting:last-child{border-bottom:0}.wbset-setting:hover{background:color-mix(in srgb,var(--wbset-sidebar) 58%,transparent)}
    .wbset-setting.is-sub{padding-left:38px}
    .wbset-setting.is-sub[data-disabled="1"]{opacity:.45;cursor:default}
    .wbset-setting-copy{min-width:0;display:grid;gap:3px}.wbset-setting-copy strong{font-size:13px;font-weight:560}.wbset-setting-copy span{font-size:12px;line-height:1.45;color:var(--wbset-muted)}
    .wbset-setting input[type="checkbox"]{position:absolute;opacity:0;pointer-events:none}
    .wbset-row{display:flex;align-items:center;flex-wrap:wrap;gap:9px;padding:12px 15px}.wbset-row + .wbset-row{padding-top:0}
    .wbset-row textarea{width:100%;min-height:68px;box-sizing:border-box;resize:vertical;padding:9px 10px;border:1px solid var(--wbset-border);border-radius:var(--wbset-radius-sm);background:var(--wbset-bg);color:var(--wbset-text);font:12px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace}
    .wbset-input{box-sizing:border-box;padding:9px 10px;border:1px solid var(--wbset-border);border-radius:var(--wbset-radius-sm);background:var(--wbset-bg);color:var(--wbset-text);font:13px/1.3 inherit;outline:none}.wbset-input:focus,.wbset-row textarea:focus{border-color:#8b8b94;box-shadow:0 0 0 3px rgba(127,127,138,.12)}
    .wbset-note{font-size:12px;line-height:1.5;color:var(--wbset-muted)}
    .wbset-sync-status{min-height:18px}.wbset-sync-status.is-active{color:var(--wbset-text);font-weight:550}
    .wbset-ftr{min-height:64px;padding:0 20px;border-top:1px solid var(--wbset-border);display:flex;gap:9px;align-items:center;justify-content:flex-end}
    .wbset-btn2{border:1px solid transparent;border-radius:var(--wbset-radius-sm);padding:8px 12px;background:var(--wbset-hover);color:var(--wbset-text);font:500 13px/1.2 inherit;cursor:pointer}
    .wbset-btn2:hover{filter:brightness(.97)}.wbset-btn2.primary{background:var(--wbset-accent);color:#fff}.wbset-btn2.ghost{border-color:var(--wbset-border);background:transparent}.wbset-btn2.danger{background:#c9362b;color:#fff}.wbset-icon-btn{width:34px;height:34px;padding:0;font-size:18px}
    .wbset-stats{display:flex;gap:10px;padding:0 0 16px}.wbset-stat{flex:1;padding:13px 15px;border:1px solid var(--wbset-border);border-radius:var(--wbset-radius-md)}.wbset-stat span{display:block;font-size:12px;color:var(--wbset-muted)}.wbset-stat strong{display:block;margin-top:4px;font-size:20px}
    .wbset-manager-tools{display:grid;grid-template-columns:minmax(160px,1fr) auto;gap:10px;margin-bottom:12px}.wbset-manager-tools .wbset-input{width:100%}
    .wbset-uid-list{border:1px solid var(--wbset-border);border-radius:var(--wbset-radius-md);overflow:hidden}.wbset-uid-item{display:grid;grid-template-columns:minmax(140px,1fr) auto auto;gap:10px;align-items:center;min-height:43px;padding:0 10px 0 13px;border-bottom:1px solid var(--wbset-border);font-size:12px}.wbset-uid-item:last-child{border-bottom:0}.wbset-uid-item code{font-size:12px;color:var(--wbset-text)}.wbset-uid-link{color:var(--wbset-muted);text-decoration:none}.wbset-uid-link:hover{color:var(--wbset-text);text-decoration:underline}.wbset-uid-remove{padding:6px 9px;color:#b12e25}
    .wbset-pagination{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:10px;padding-top:13px}.wbset-pagination > span{min-width:110px;text-align:center;font-size:12px;color:var(--wbset-muted)}.wbset-page-jump{display:flex}.wbset-page-jump .wbset-input{width:74px;border-radius:var(--wbset-radius-sm) 0 0 var(--wbset-radius-sm)}.wbset-page-jump .wbset-btn2{border-radius:0 var(--wbset-radius-sm) var(--wbset-radius-sm) 0;white-space:nowrap}.wbset-btn2:disabled{opacity:.42;cursor:not-allowed;filter:none}
    .wbset-empty{padding:34px 18px;text-align:center;color:var(--wbset-muted);font-size:13px}
    .danger-zone{border-color:rgba(201,54,43,.45);background:rgba(201,54,43,.035)}
    @media (max-width:720px){.wbset-panel{padding:10px}.wbset-card{width:100%;height:94vh}.wbset-shell{grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr)}.wbset-nav{display:flex;gap:4px;padding:8px;overflow:auto;border-right:0;border-bottom:1px solid var(--wbset-border)}.wbset-nav button{width:auto;white-space:nowrap}.wbset-content{padding:20px 16px 28px}.wbset-manager-tools{grid-template-columns:1fr}.wbset-uid-item{grid-template-columns:1fr auto}.wbset-uid-link{display:none}.wbset-stats{flex-direction:column}}

    html:has(.wbset-panel[style*="display: flex"]) .wbset-btn,
    html:has(#wbset-onboarding-overlay) .wbset-btn{display:none!important}
    .wbset-panel{
      z-index:2147483646!important;padding:24px!important;
      background:rgba(27,23,20,.52)!important;backdrop-filter:blur(4px)!important;
      font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;color:#27231f!important
    }
    .wbset-card{
      width:min(940px,95vw)!important;height:min(690px,88vh)!important;
      grid-template-rows:56px minmax(0,1fr) 56px!important;
      border:1px solid #c9beb2!important;border-radius:0!important;
      outline:1px solid rgba(255,255,255,.32)!important;outline-offset:-2px!important;
      background:#f6f1eb!important;box-shadow:0 30px 90px rgba(35,28,23,.38)!important;color:#27231f!important
    }
    .wbset-card *{box-sizing:border-box!important}
    .wbset-hdr{min-height:56px!important;padding:0 24px!important;border-bottom:1px solid #d5cbc1!important;background:#faf6f1!important}
    .wbset-title{display:grid!important;gap:1px!important}
    .wbset-title strong{font-size:15px!important;font-weight:720!important;letter-spacing:-.01em!important}
    .wbset-version{color:#8b8178!important;font-size:9px!important;line-height:1.15!important;letter-spacing:.04em!important}
    .wbset-shell{grid-template-columns:178px minmax(0,1fr)!important}
    .wbset-nav{
      padding:18px 10px!important;overflow:auto!important;border-right:1px solid #d5cbc1!important;
      background:#ebe4dc!important;display:flex!important;flex-direction:column!important
    }
    .wbset-nav-pages{flex:0 0 auto!important}
    .wbset-nav button{
      width:100%!important;min-height:34px!important;margin:1px 0!important;padding:8px 11px!important;
      border:1px solid transparent!important;border-radius:0!important;background:transparent!important;
      color:#6d655e!important;font-family:inherit!important;font-size:11.5px!important;
      font-weight:800!important;line-height:1.3!important;text-align:left!important
    }
    .wbset-nav button:hover{background:rgba(217,119,87,.075)!important;color:#27231f!important}
    .wbset-nav button.is-active{
      border-color:#d7cabd!important;background:#fbf8f4!important;
      box-shadow:inset 3px 0 #c96849!important;color:#27231f!important
    }
    .wbset-content{
      min-width:0!important;overflow:auto!important;padding:24px 28px 30px!important;
      background:#f6f1eb!important;scrollbar-color:#c8b9aa transparent!important
    }
    .wbset-page-head{margin-bottom:18px!important}
    .wbset-page-head h3,.wbset-about-hero h3{
      font:600 22px/1.22 Georgia,"Songti SC","STSong",serif!important;letter-spacing:-.015em!important
    }
    .wbset-page-head h3{margin:0 0 5px!important}
    .wbset-page-head p{margin:0!important;color:#7c7269!important;font-size:12px!important}
    .wbset-sec{
      margin-bottom:14px!important;overflow:hidden!important;border:1px solid #ddd3c9!important;
      border-radius:0!important;background:#fffaf5!important;box-shadow:0 1px 0 rgba(64,49,38,.025)!important
    }
    .wbset-sec-title{
      padding:10px 14px 9px!important;border-bottom:1px solid #e2d9d0!important;background:#f8f2eb!important;
      color:#4a423b!important;font-size:12px!important;font-weight:700!important;letter-spacing:.01em!important
    }
    .wbset-setting{
      position:relative!important;display:flex!important;align-items:center!important;justify-content:space-between!important;
      gap:20px!important;padding:12px 14px!important;border-bottom:1px solid #e8dfd6!important
    }
    .wbset-setting:hover{background:rgba(217,119,87,.055)!important}
    .wbset-setting-copy{min-width:0!important;display:grid!important;gap:3px!important}
    .wbset-setting-copy strong{font-size:12.5px!important;font-weight:660!important}
    .wbset-setting-copy span{color:#7c7269!important;font-size:11.5px!important;line-height:1.45!important}
    .wbset-setting input[type="checkbox"],.wbset-onboard-option input[type="checkbox"]{
      position:static!important;flex:0 0 auto!important;width:17px!important;height:17px!important;margin:0!important;
      opacity:1!important;pointer-events:auto!important;border-radius:0!important;accent-color:#c96849!important;cursor:pointer!important
    }
    .wbset-action-row{
      min-height:56px!important;display:flex!important;align-items:center!important;justify-content:space-between!important;
      gap:20px!important;padding:10px 14px!important
    }
    .wbset-action-row>span{color:#7c7269!important;font-size:11.5px!important;line-height:1.5!important}
    .wbset-btn2{
      min-height:30px!important;padding:6px 10px!important;border:1px solid #cfc5bb!important;border-radius:0!important;
      background:#eee7df!important;color:#2d2824!important;font:500 12px/1.25 inherit!important
    }
    .wbset-btn2:hover{background:#e4dad0!important;filter:none!important}
    .wbset-btn2.primary{border-color:#b85f43!important;background:#c96849!important;color:#fff!important}
    .wbset-btn2.ghost{border-color:#cfc5bb!important;background:#eee7df!important}
    .wbset-btn2.danger{border-color:#c89483!important;background:#eee7df!important;color:#a43f2e!important}
    .wbset-btn2:disabled{opacity:.5!important;cursor:default!important}
    .wbset-card button:focus-visible,.wbset-card input:focus-visible,.wbset-card textarea:focus-visible,.wbset-card a:focus-visible{
      outline:2px solid rgba(184,95,67,.72)!important;outline-offset:2px!important
    }
    .wbset-row{gap:9px!important;padding:14px 15px!important}
    .wbset-row+.wbset-row{padding-top:0!important}
    .wbset-row textarea,.wbset-input{
      border:1px solid #cfc5bb!important;border-radius:0!important;background:#fffdf9!important;color:#27231f!important;
      padding:7px 9px!important;font-size:12px!important
    }
    .wbset-row textarea:focus,.wbset-input:focus{border-color:#9b6c4a!important;box-shadow:0 0 0 2px rgba(155,108,74,.12)!important}
    .wbset-note{color:#786f67!important;font-size:12px!important;line-height:1.55!important}
    .wbset-sync-status.is-active{color:#8f442f!important}
    .wbset-stats{display:grid!important;grid-template-columns:repeat(2,1fr)!important;gap:10px!important;margin-bottom:16px!important;padding:0!important}
    .wbset-stat{padding:11px 14px!important;border:1px solid #ddd3c9!important;border-radius:0!important;background:#fffaf5!important}
    .wbset-stat span{color:#7c7269!important;font-size:11px!important}.wbset-stat strong{margin-top:3px!important;font-size:20px!important}
    .wbset-manager-tools{grid-template-columns:minmax(160px,1fr) auto!important;gap:8px!important;margin-bottom:10px!important}
    .wbset-uid-list{max-height:330px!important;overflow:auto!important;border:1px solid #ddd3c9!important;border-radius:0!important;background:#fffaf5!important}
    .wbset-uid-item{
      grid-template-columns:minmax(140px,1fr) auto auto!important;gap:14px!important;min-height:44px!important;
      padding:0 12px!important;border-bottom:1px solid #e3dcd4!important
    }
    .wbset-uid-link{color:#8f442f!important}.wbset-uid-remove{color:#a43f2e!important}
    .wbset-pagination{
      min-height:48px!important;justify-content:flex-end!important;gap:8px!important;padding:10px 0 5px!important;
      color:#6c6259!important;font-size:12px!important
    }
    .wbset-page-jump .wbset-input,.wbset-page-jump .wbset-btn2{border-radius:0!important}
    .danger-zone{border-color:#d4a493!important;background:#fff7f1!important}
    .wbset-ftr{
      min-height:56px!important;padding:0 24px!important;border-top:1px solid #d5cbc1!important;
      background:#faf6f1!important;justify-content:space-between!important
    }
    .wbset-footer-actions{display:flex!important;align-items:center!important;gap:9px!important}
    .wbset-author{min-height:36px!important;display:flex!important;align-items:center!important;gap:8px!important;color:#655d56!important;font-size:12px!important;font-weight:650!important;text-decoration:none!important}
    .wbset-author:hover{color:#a84e34!important}.wbset-author svg{width:17px!important;height:17px!important;fill:currentColor!important}
    .wbset-about-hero{margin-bottom:16px!important;padding:22px 24px!important;border:1px solid #d8d0c7!important;background:#fbf8f4!important}
    .wbset-about-eyebrow{color:#b75f43!important;font-size:10px!important;font-weight:750!important;letter-spacing:.12em!important}
    .wbset-about-hero h3{margin:7px 0 8px!important}
    .wbset-about-title-link{color:inherit!important;font-family:"Songti SC","STSong","SimSun",serif!important;text-decoration:none!important}
    .wbset-about-title-link:hover{color:#a84e34!important}
    .wbset-about-hero p{max-width:620px!important;margin:0!important;color:#786f67!important;font-size:13px!important;line-height:1.65!important}
    .wbset-about-version{
      display:inline-block!important;margin-top:14px!important;padding:3px 7px!important;border:1px solid #d8d0c7!important;
      color:#655d56!important;font:10px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace!important
    }
    .wbset-about-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:12px!important}
    .wbset-about-card{min-width:0!important;min-height:190px!important;display:flex!important;flex-direction:column!important;padding:18px!important;border:1px solid #d8d0c7!important;background:#fbf8f4!important}
    .wbset-about-card h3{margin:0 0 7px!important;font-size:14px!important}.wbset-about-card p{margin:0!important;color:#786f67!important;font-size:12px!important;line-height:1.6!important}
    .wbset-about-card-actions{min-height:36px!important;display:flex!important;flex-wrap:wrap!important;align-items:flex-end!important;gap:8px!important;margin-top:auto!important;padding-top:18px!important}
    .wbset-support-actions{display:grid!important;grid-template-columns:minmax(0,1fr)!important;align-items:stretch!important}
    .wbset-support-link{
      width:100%!important;display:grid!important;grid-template-columns:28px minmax(0,1fr) auto!important;align-items:center!important;
      gap:11px!important;padding:10px 11px!important;border:1px solid #d8d0c7!important;background:#fffaf5!important;color:#443d37!important;text-decoration:none!important
    }
    .wbset-support-link:hover{border-color:#bd8b75!important;background:#fffdf8!important}
    .wbset-support-icon{width:24px!important;height:24px!important;display:grid!important;place-items:center!important;overflow:hidden!important}
    .wbset-support-icon svg,.wbset-support-icon img{width:100%!important;height:100%!important;display:block!important}
    .wbset-support-link-copy{display:grid!important;gap:2px!important;min-width:0!important}.wbset-support-link-copy strong{font-size:12.5px!important}
    .wbset-support-link-copy span{color:#786f67!important;font-size:10.5px!important}.wbset-support-link-action{color:#9e4d36!important;font-size:10.5px!important;font-weight:700!important;white-space:nowrap!important}
    .wbset-star-status{margin-top:12px!important;color:#8f442f!important;font-size:12px!important;font-weight:650!important}
    #wbset-onboarding-overlay{
      position:fixed!important;z-index:2147483647!important;inset:0!important;display:flex!important;align-items:center!important;
      justify-content:center!important;padding:24px!important;background:rgba(31,25,21,.46)!important;
      font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important
    }
    .wbset-onboard-card{
      width:min(700px,94vw)!important;height:min(520px,86vh)!important;display:grid!important;
      grid-template-rows:auto minmax(0,1fr) auto!important;overflow:hidden!important;border:1px solid #d8cfc2!important;
      border-radius:0!important;background:#f5efe5!important;box-shadow:0 20px 64px rgba(45,35,28,.24)!important;color:#2d2926!important
    }
    .wbset-onboard-card *{box-sizing:border-box!important}
    .wbset-onboard-top{display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:18px!important;padding:16px 18px 0!important}
    .wbset-onboard-progress{width:156px!important;display:grid!important;grid-template-columns:repeat(5,1fr)!important;gap:6px!important;padding-top:7px!important}
    .wbset-onboard-progress span{height:3px!important;background:#d9cec1!important}.wbset-onboard-progress span.is-active{background:#d97757!important}
    .wbset-onboard-skip{border:1px solid #d8cfc2!important;border-radius:0!important;background:#fbf8f2!important;color:#514942!important;cursor:pointer!important;padding:4px 7px!important;font:600 10px/1.2 inherit!important}
    .wbset-onboard-body{min-height:0!important;display:flex!important;align-items:center!important;padding:24px 40px 20px!important;overflow:auto!important}
    .wbset-onboard-step{width:min(570px,100%)!important}.wbset-onboard-kicker{margin-bottom:8px!important;color:#b75f43!important;font-size:10px!important;font-weight:750!important;letter-spacing:.12em!important}
    .wbset-onboard-step h1{margin:0 0 12px!important;font-family:Georgia,"Songti SC","STSong",serif!important;font-size:clamp(22px,2.8vw,27px)!important;font-weight:600!important;line-height:1.3!important}
    .wbset-onboard-step>p{max-width:540px!important;margin:0!important;color:#665d55!important;font-size:13.5px!important;line-height:1.68!important}
    .wbset-onboard-options{display:grid!important;gap:8px!important;margin-top:18px!important}.wbset-onboard-options.is-grid{grid-template-columns:repeat(2,1fr)!important}
    .wbset-onboard-option{display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:18px!important;padding:11px 13px!important;border:1px solid #ddd4c8!important;border-radius:0!important;background:#fbf8f2!important;cursor:pointer!important}
    .wbset-onboard-option:hover{background:#fffdf8!important}.wbset-onboard-option-copy{display:grid!important;gap:3px!important}
    .wbset-onboard-option-copy strong{font-size:12.5px!important}.wbset-onboard-option-copy span{color:#756b62!important;font-size:11px!important;line-height:1.45!important}
    .wbset-onboard-summary{display:grid!important;grid-template-columns:repeat(2,1fr)!important;gap:9px!important;margin-top:18px!important}
    .wbset-onboard-summary div{padding:10px 0!important;border-top:1px solid #d9cec1!important}.wbset-onboard-summary span{display:block!important;color:#75685e!important;font-size:11px!important}
    .wbset-onboard-summary strong{display:block!important;margin-top:5px!important;font-size:14px!important}
    .wbset-onboard-supports{display:grid!important;gap:9px!important;margin-top:18px!important}
    .wbset-onboard-link{width:100%!important;display:grid!important;grid-template-columns:auto minmax(0,1fr) auto!important;align-items:center!important;gap:13px!important;padding:15px 16px!important;border:1px solid #d3c8bc!important;border-radius:0!important;background:#fbf8f2!important;color:#443a32!important;cursor:pointer!important;text-align:left!important}
    .wbset-onboard-link:hover{background:#fffdf8!important;border-color:#bd8b75!important}.wbset-onboard-link>svg{width:24px!important;height:24px!important;fill:currentColor!important}
    .wbset-onboard-link-copy{min-width:0!important;display:grid!important;gap:3px!important}.wbset-onboard-link-copy strong{font-size:14px!important}.wbset-onboard-link-copy span{color:#756b62!important;font-size:11px!important;line-height:1.45!important}
    .wbset-onboard-link-action{color:#9e4d36!important;font-size:12px!important;font-weight:700!important;white-space:nowrap!important}
    .wbset-onboard-footer{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;padding:0 18px 22px 40px!important}
    .wbset-onboard-step-label{color:#756b62!important;font-size:11px!important}.wbset-onboard-actions{display:flex!important;gap:9px!important;margin-left:auto!important}
    .wbset-onboard-button{border:1px solid rgba(75,58,47,.3)!important;border-radius:0!important;background:rgba(255,252,246,.62)!important;color:#443a32!important;cursor:pointer!important;padding:8px 15px!important;font:650 12px/1.2 inherit!important}
    .wbset-onboard-button.primary{border-color:#bf6448!important;background:#d97757!important;color:#fffaf4!important}
    @media(max-width:720px){
      .wbset-panel,#wbset-onboarding-overlay{padding:10px!important}.wbset-card{width:100%!important;height:94vh!important}
      .wbset-shell{grid-template-columns:1fr!important;grid-template-rows:auto minmax(0,1fr)!important}
      .wbset-nav{display:block!important;padding:8px!important;overflow-x:auto!important;border-right:0!important;border-bottom:1px solid #d8d0c7!important}
      .wbset-nav-pages{width:max-content!important;display:flex!important;gap:4px!important}.wbset-nav button{width:auto!important;white-space:nowrap!important}
      .wbset-nav button.is-active{box-shadow:inset 0 -2px #c96849!important}.wbset-content{padding:22px 16px 28px!important}
      .wbset-onboard-card{width:100%!important;height:min(560px,92vh)!important}.wbset-onboard-body{align-items:flex-start!important;padding:28px 20px 20px!important}
      .wbset-onboard-card[data-step="0"] .wbset-onboard-body{align-items:center!important}.wbset-onboard-footer{padding:0 18px 18px 20px!important}
      .wbset-onboard-options.is-grid,.wbset-onboard-summary,.wbset-about-grid{grid-template-columns:1fr!important}
      .wbset-manager-tools{grid-template-columns:1fr!important}.wbset-uid-item{grid-template-columns:1fr auto!important}.wbset-uid-link{display:none!important}
    }
    `;
    const s = document.createElement('style');
    s.id = 'wbset-style';
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }

  function githubIconMarkup() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.11.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.52-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.72 1.27 3.38.97.1-.75.41-1.27.74-1.56-2.57-.29-5.27-1.29-5.27-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.47.11-3.05 0 0 .97-.31 3.16 1.18a10.9 10.9 0 0 1 5.76 0c2.2-1.49 3.16-1.18 3.16-1.18.63 1.58.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.4-2.71 5.38-5.29 5.67.42.36.79 1.06.79 2.14v3.17c0 .31.21.68.8.56A11.5 11.5 0 0 0 12 .7Z"/></svg>`;
  }

  function buyMeACoffeeIconMarkup() {
    return `<span class="wbset-support-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M5 3h12a1 1 0 0 1 1 1v2h1a4 4 0 0 1 0 8h-1.35A7 7 0 0 1 11 19H9a7 7 0 0 1-7-7V6h14V5H5V3Zm13 5v4h1a2 2 0 0 0 0-4h-1ZM4 8v4a5 5 0 0 0 5 5h2a5 5 0 0 0 5-5V8H4Zm2.8 2.1c.7-.65 1.75-.5 2.2.2.45-.7 1.5-.85 2.2-.2.8.75.55 2-.2 2.7L9 14.5l-2-1.7c-.75-.7-1-1.95-.2-2.7ZM3 21h16v2H3v-2Z"/></svg></span>`;
  }

  function openExternalTab(url) {
    if (typeof GM_openInTab === 'function') {
      try {
        GM_openInTab(url, { active: true, insert: true, setParent: true });
        return;
      } catch (error) {
        console.warn('[WB-SETTINGS] GM_openInTab failed', error);
      }
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function openProjectGitHub() {
    openExternalTab(GITHUB_URL);
  }

  function openBuyMeACoffee() {
    openExternalTab(BUY_ME_A_COFFEE_URL);
  }

  function renderStarReminderStatus(panel) {
    const disabled = !!GM_getValue(STAR_REMINDER_DISABLED_KEY, false);
    const status = panel?.querySelector('#wbset-star-status');
    const toggle = panel?.querySelector('#wbset-star-toggle');
    if (status) status.textContent = disabled ? 'Star 提醒已关闭' : 'Star 提醒已开启';
    if (toggle) toggle.textContent = disabled ? '重新开启提醒' : '关闭提醒';
  }

  function toggleStarReminder(panel) {
    const nextDisabled = !GM_getValue(STAR_REMINDER_DISABLED_KEY, false);
    GM_setValue(STAR_REMINDER_DISABLED_KEY, nextDisabled);
    renderStarReminderStatus(panel);
  }

  function isWeiboHomeTimelineRoute() {
    return (
      ['weibo.com', 'www.weibo.com'].includes(location.hostname) &&
      (location.pathname === '' ||
        location.pathname === '/' ||
        /^\/mygroups(?:\/|$)/.test(location.pathname))
    );
  }

  // 分栏查找与选中判定统一走 WB_INTERNAL.timelineTabs，避免这里和默认分栏
  // 逻辑各留一份实现后再次分叉（微博只用哈希类名表示选中态，没有 aria）。
  function findTimelineTab(title) {
    return WB_INTERNAL.timelineTabs.find(title);
  }

  function isTimelineTabSelected(tab) {
    return WB_INTERNAL.timelineTabs.isActive(tab);
  }

  function openNativeHomeTimeline() {
    const allFollowingTab = findTimelineTab('全部关注');
    if (allFollowingTab) {
      allFollowingTab.click();
      WB_INTERNAL.dom.schedule(
        'settings-native-home-fallback',
        () => {
          if (/^\/mygroups(?:\/|$)/.test(location.pathname)) {
            location.assign(`${location.origin}/`);
          }
        },
        800
      );
      return;
    }
    location.assign(`${location.origin}/`);
  }

  function openLatestHomeTimeline() {
    const latestTab = findTimelineTab('最新微博');
    if (latestTab) {
      latestTab.click();
      WB_INTERNAL.dom.schedule(
        'settings-latest-home-fallback',
        () => {
          if (/^\/mygroups(?:\/|$)/.test(location.pathname)) return;
          if (isTimelineTabSelected(findTimelineTab('最新微博'))) return;
          location.assign(`${location.origin}/`);
        },
        800
      );
      return;
    }
    location.assign(`${location.origin}/`);
  }

  function reconcileHomeTimelineSetting(previousValue, nextValue) {
    const previousLatestTimeline = previousValue !== false;
    const nextLatestTimeline = nextValue !== false;
    if (
      previousLatestTimeline === nextLatestTimeline ||
      !isWeiboHomeTimelineRoute()
    ) {
      return false;
    }

    const desiredTitle = nextLatestTimeline ? '最新微博' : '全部关注';
    if (isTimelineTabSelected(findTimelineTab(desiredTitle))) return false;

    if (nextLatestTimeline) openLatestHomeTimeline();
    else openNativeHomeTimeline();
    return true;
  }

  function openOnboarding({ force = false } = {}) {
    ensureStyles();
    if (!document.body) {
      document.addEventListener(
        'DOMContentLoaded',
        () => openOnboarding({ force }),
        { once: true }
      );
      return;
    }
    if (!force && GM_getValue(ONBOARDING_DONE_KEY, false)) return;
    if (document.querySelector('#wbset-onboarding-overlay')) return;

    let stepIndex = 0;
    const draft = normalizeCfg(loadCfg());
    const overlay = document.createElement('div');
    overlay.id = 'wbset-onboarding-overlay';
    overlay.innerHTML = `
      <section class="wbset-onboard-card" role="dialog" aria-modal="true" aria-labelledby="wbset-onboard-title">
        <header class="wbset-onboard-top">
          <div class="wbset-onboard-progress" aria-label="向导进度">
            <span></span><span></span><span></span><span></span><span></span>
          </div>
          <button class="wbset-onboard-skip" type="button">使用默认设置</button>
        </header>
        <div class="wbset-onboard-body"></div>
        <footer class="wbset-onboard-footer">
          <span class="wbset-onboard-step-label"></span>
          <div class="wbset-onboard-actions">
            <button class="wbset-onboard-button wbset-onboard-back" type="button">上一步</button>
            <button class="wbset-onboard-button primary wbset-onboard-next" type="button">继续</button>
          </div>
        </footer>
      </section>
    `;

    const body = overlay.querySelector('.wbset-onboard-body');
    const backButton = overlay.querySelector('.wbset-onboard-back');
    const nextButton = overlay.querySelector('.wbset-onboard-next');
    const stepLabel = overlay.querySelector('.wbset-onboard-step-label');

    const finish = (nextSettings) => {
      const previousCfg = loadCfg();
      const previousLatestTimeline =
        previousCfg.defaultLatestTimeline !== false;
      CFG = saveCfg(normalizeCfg(nextSettings));
      GM_setValue(ONBOARDING_DONE_KEY, true);
      overlay.remove();
      syncCreatedSettingsPanelConfigUI();
      let runtimeApplyError = null;
      try {
        WB_INTERNAL.applyConfig?.(CFG);
        applyPanelSettingsNow();
        syncLauncherButton();
      } catch (error) {
        runtimeApplyError = error;
        console.warn('[WB-SETTINGS] 向导设置已保存，但即时应用失败', error);
      }

      if (runtimeApplyError) {
        notify('向导设置已保存；部分设置将在刷新页面后生效', {
          type: 'error',
        });
      } else {
        notify('设置已保存并即时应用', { type: 'success' });
      }
      reconcileHomeTimelineSetting(
        previousLatestTimeline,
        CFG.defaultLatestTimeline
      );
    };

    const bindDraftInputs = () => {
      body.querySelectorAll('[data-wbset-setting]').forEach((input) => {
        const key = input.getAttribute('data-wbset-setting');
        input.checked = !!draft[key];
        input.addEventListener('change', (event) => {
          if (!isTrustedSettingsEvent(event)) return;
          draft[key] = input.checked;
        });
      });
    };

    const render = () => {
      overlay
        .querySelector('.wbset-onboard-card')
        .setAttribute('data-step', String(stepIndex));
      overlay
        .querySelectorAll('.wbset-onboard-progress span')
        .forEach((item, index) => {
          item.classList.toggle('is-active', index <= stepIndex);
        });
      stepLabel.textContent = `${stepIndex + 1} / 5`;
      backButton.hidden = stepIndex === 0;
      nextButton.textContent = stepIndex === 4 ? '开始使用' : '继续';

      if (stepIndex === 0) {
        body.innerHTML = `
          <div class="wbset-onboard-step">
            <div class="wbset-onboard-kicker">设置向导</div>
            <h1 id="wbset-onboard-title">屏其不欲见者，复其应有之序。</h1>
            <p>在时间线、评论、搜索、推荐卡片与互动列表中隐藏本地名单用户，同时整理导航、侧栏与 isAd 标记的广告内容。</p>
          </div>`;
      } else if (stepIndex === 1) {
        body.innerHTML = `
          <div class="wbset-onboard-step">
            <div class="wbset-onboard-kicker">浏览与操作</div>
            <h1 id="wbset-onboard-title">选择默认时间线和快捷入口</h1>
            <p>右键屏蔽始终可用；时间线、isAd 广告过滤、设置按钮与操作确认可以分别启用。</p>
            <div class="wbset-onboard-options">
              <label class="wbset-onboard-option"><span class="wbset-onboard-option-copy"><strong>主页默认显示「最新微博」</strong><span>打开首页时优先进入按时间排序的全部关注时间线。</span></span><input type="checkbox" data-wbset-setting="defaultLatestTimeline"></label>
              <label class="wbset-onboard-option"><span class="wbset-onboard-option-copy"><strong>屏蔽 isAd 相关标签广告</strong><span>依据微博接口下发的 isAd 广告标记隐藏微博。默认隐藏关注博主与非关注博主发布的广告，本人发布的广告默认保留，可在设置中分别调整。</span></span><input type="checkbox" data-wbset-setting="hideAds"></label>
              <label class="wbset-onboard-option"><span class="wbset-onboard-option-copy"><strong>隐藏时间线推荐内容</strong><span>移除插入关注时间线的“你可能感兴趣的内容”。</span></span><input type="checkbox" data-wbset-setting="hideTimelineRecommendations"></label>
              <label class="wbset-onboard-option"><span class="wbset-onboard-option-copy"><strong>显示右下角设置按钮</strong><span>关闭后仍可从 Tampermonkey 菜单中的「设置」进入。</span></span><input type="checkbox" data-wbset-setting="showSettingsButton"></label>
              <label class="wbset-onboard-option"><span class="wbset-onboard-option-copy"><strong>屏蔽用户前确认</strong><span>通过右键菜单屏蔽时先显示确认对话框。</span></span><input type="checkbox" data-wbset-setting="confirmBeforeBlocking"></label>
            </div>
          </div>`;
        bindDraftInputs();
      } else if (stepIndex === 2) {
        body.innerHTML = `
          <div class="wbset-onboard-step">
            <div class="wbset-onboard-kicker">屏蔽范围</div>
            <h1 id="wbset-onboard-title">选择本地名单的生效范围</h1>
            <p>每种内容都可独立开启或关闭；取消勾选后，当前页面中由该范围隐藏的内容会立即恢复。</p>
            <div class="wbset-onboard-options is-grid">
              <label class="wbset-onboard-option"><span class="wbset-onboard-option-copy"><strong>微博和转发</strong><span>时间线中的微博与转发。</span></span><input type="checkbox" data-wbset-setting="hideBlacklistPosts"></label>
              <label class="wbset-onboard-option"><span class="wbset-onboard-option-copy"><strong>评论和回复</strong><span>评论区与楼中楼回复。</span></span><input type="checkbox" data-wbset-setting="hideBlacklistComments"></label>
              <label class="wbset-onboard-option"><span class="wbset-onboard-option-copy"><strong>搜索结果</strong><span>屏蔽用户作为主作者的搜索结果。</span></span><input type="checkbox" data-wbset-setting="hideBlacklistSearchResults"></label>
              <label class="wbset-onboard-option"><span class="wbset-onboard-option-copy"><strong>用户卡片和推荐项</strong><span>相关用户与推荐用户卡片。</span></span><input type="checkbox" data-wbset-setting="hideBlacklistUserCards"></label>
              <label class="wbset-onboard-option"><span class="wbset-onboard-option-copy"><strong>转发和点赞用户列表</strong><span>互动列表中的本地屏蔽用户。</span></span><input type="checkbox" data-wbset-setting="hideBlacklistInteractions"></label>
            </div>
          </div>`;
        bindDraftInputs();
      } else if (stepIndex === 3) {
        const enabledScopes = [
          draft.hideBlacklistPosts,
          draft.hideBlacklistComments,
          draft.hideBlacklistSearchResults,
          draft.hideBlacklistUserCards,
          draft.hideBlacklistInteractions,
        ].filter(Boolean).length;
        body.innerHTML = `
          <div class="wbset-onboard-step">
            <div class="wbset-onboard-kicker">确认设置</div>
            <h1 id="wbset-onboard-title">检查当前选项</h1>
            <p>完成后立即应用；所有选项之后仍可在脚本设置中修改。</p>
            <div class="wbset-onboard-summary">
              <div><span>最新微博时间线</span><strong>${draft.defaultLatestTimeline ? '开启' : '关闭'}</strong></div>
              <div><span>isAd 广告过滤</span><strong>${draft.hideAds ? '开启' : '关闭'}</strong></div>
              <div><span>时间线推荐过滤</span><strong>${draft.hideTimelineRecommendations ? '开启' : '关闭'}</strong></div>
              <div><span>快捷设置按钮</span><strong>${draft.showSettingsButton ? '显示' : '隐藏'}</strong></div>
              <div><span>屏蔽前确认</span><strong>${draft.confirmBeforeBlocking ? '开启' : '关闭'}</strong></div>
              <div><span>屏蔽范围</span><strong>${enabledScopes} / 5 开启</strong></div>
            </div>
          </div>`;
      } else {
        body.innerHTML = `
          <div class="wbset-onboard-step">
            <div class="wbset-onboard-kicker">支持项目</div>
            <h1 id="wbset-onboard-title">让屏序继续生长</h1>
            <p>欢迎为项目点亮一颗 Star，或通过 Buy Me a Coffee 支持后续维护。</p>
            <div class="wbset-onboard-supports">
              <button class="wbset-onboard-link wbset-onboard-github" type="button">
                ${githubIconMarkup()}
                <span class="wbset-onboard-link-copy"><strong>DanielZenFlow</strong><span>打开 Pynseq for Weibo 的 GitHub 项目页</span></span>
                <span class="wbset-onboard-link-action">打开 GitHub</span>
              </button>
              <button class="wbset-onboard-link wbset-onboard-bmc" type="button">
                ${buyMeACoffeeIconMarkup()}
                <span class="wbset-onboard-link-copy"><strong>Buy me a coffee</strong><span>打开 DanielZenFlow 的 Buy Me a Coffee 页面</span></span>
                <span class="wbset-onboard-link-action">打开链接</span>
              </button>
            </div>
          </div>`;
        body
          .querySelector('.wbset-onboard-github')
          ?.addEventListener('click', (event) => {
            if (!isTrustedSettingsEvent(event)) return;
            openProjectGitHub();
          });
        body
          .querySelector('.wbset-onboard-bmc')
          ?.addEventListener('click', (event) => {
            if (!isTrustedSettingsEvent(event)) return;
            openBuyMeACoffee();
          });
      }
    };

    overlay
      .querySelector('.wbset-onboard-skip')
      .addEventListener('click', (event) => {
        if (!isTrustedSettingsEvent(event)) return;
        finish(DEFAULTS);
      });
    backButton.addEventListener('click', (event) => {
      if (!isTrustedSettingsEvent(event)) return;
      if (stepIndex > 0) stepIndex -= 1;
      render();
    });
    nextButton.addEventListener('click', (event) => {
      if (!isTrustedSettingsEvent(event)) return;
      if (stepIndex < 4) {
        stepIndex += 1;
        render();
      } else {
        finish(draft);
      }
    });
    document.body.appendChild(overlay);
    render();
  }

  function openPanel(initialPage = 'general') {
    ensureStyles();
    let panel = document.querySelector('.wbset-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'wbset-panel';
      panel.innerHTML = `
        <div class="wbset-card" role="dialog" aria-modal="true" aria-labelledby="wbset-dialog-title">
          <div class="wbset-hdr">
            <div class="wbset-title">
              <strong id="wbset-dialog-title">${SCRIPT_NAME}</strong>
              <span class="wbset-version">v${SCRIPT_VERSION}</span>
            </div>
          </div>
          <div class="wbset-shell">
            <nav class="wbset-nav" role="tablist" aria-label="设置分类">
              <div class="wbset-nav-pages">
                <button type="button" role="tab" aria-selected="true" class="is-active" data-wbset-page="general">常规</button>
                <button type="button" role="tab" aria-selected="false" data-wbset-page="blacklist">屏蔽设置</button>
                <button type="button" role="tab" aria-selected="false" data-wbset-page="uids">本地屏蔽名单</button>
                <button type="button" role="tab" aria-selected="false" data-wbset-page="data">新浪微博黑名单管理</button>
                <button type="button" role="tab" aria-selected="false" data-wbset-page="about">关于</button>
              </div>
            </nav>
            <div class="wbset-content">
              <section class="wbset-page is-active" role="tabpanel" data-wbset-section="general">
                <div class="wbset-page-head">
                  <h3>常规</h3>
                  <p>控制时间线、搜索结果和 isAd 广告过滤的默认行为。</p>
                </div>
                <div class="wbset-sec">
                  <div class="wbset-sec-title">设置向导</div>
                  <div class="wbset-action-row">
                    <span>逐项配置浏览体验、快捷入口、操作确认和屏蔽范围。</span>
                    <button class="wbset-btn2" id="wbset-open-onboarding" type="button">打开</button>
                  </div>
                </div>
                <div class="wbset-sec">
                  <div class="wbset-sec-title">浏览体验</div>
                  <label class="wbset-setting">
                    <span class="wbset-setting-copy"><strong>主页默认显示「最新微博」</strong><span>打开首页时自动切换到按时间顺序排列的时间线。</span></span>
                    <input type="checkbox" id="wbset-latest">
                  </label>
                  <label class="wbset-setting">
                    <span class="wbset-setting-copy"><strong>隐藏搜索页「相关用户」</strong><span>隐藏综合搜索页右侧的整个相关用户卡片。</span></span>
                    <input type="checkbox" id="wbset-search-related-users">
                  </label>
                  <label class="wbset-setting">
                    <span class="wbset-setting-copy"><strong>屏蔽 isAd 相关标签广告</strong><span>依据微博接口下发的 isAd 广告标记隐藏对应微博。总开关关闭时，下方三项均不生效。</span></span>
                    <input type="checkbox" id="wbset-hide-ads">
                  </label>
                  <label class="wbset-setting is-sub" id="wbset-hide-ads-following-row">
                    <span class="wbset-setting-copy"><strong>关注博主发布的广告</strong><span>已关注博主发布的商业推广，例如节目宣传、品牌活动、转发抽奖。</span></span>
                    <input type="checkbox" id="wbset-hide-ads-following">
                  </label>
                  <label class="wbset-setting is-sub" id="wbset-hide-ads-strangers-row">
                    <span class="wbset-setting-copy"><strong>非关注博主发布的广告</strong><span>微博插入时间线的推广内容，作者不在关注列表内。</span></span>
                    <input type="checkbox" id="wbset-hide-ads-strangers">
                  </label>
                  <label class="wbset-setting is-sub" id="wbset-hide-ads-self-row">
                    <span class="wbset-setting-copy"><strong>本人发布的广告</strong><span>当前账号自己发布并带有 isAd 标记的微博，例如使用粉丝头条推广的内容。默认不隐藏。</span></span>
                    <input type="checkbox" id="wbset-hide-ads-self">
                  </label>
                  <label class="wbset-setting">
                    <span class="wbset-setting-copy"><strong>隐藏时间线推荐内容</strong><span>移除插入关注时间线的“你可能感兴趣的内容”。</span></span>
                    <input type="checkbox" id="wbset-hide-timeline-recommendations">
                  </label>
                </div>
                <div class="wbset-sec">
                  <div class="wbset-sec-title">快捷入口</div>
                  <label class="wbset-setting">
                    <span class="wbset-setting-copy"><strong>显示右下角设置按钮</strong><span>关闭后仍可从 Tampermonkey 菜单中的「设置」进入。</span></span>
                    <input type="checkbox" id="wbset-show-settings-button">
                  </label>
                </div>
                <div class="wbset-sec">
                  <div class="wbset-sec-title">顶部导航</div>
                  <label class="wbset-setting">
                    <span class="wbset-setting-copy"><strong>隐藏「视频」图标</strong><span>控制顶部导航栏的视频入口。</span></span>
                    <input type="checkbox" id="wbset-nav-video">
                  </label>
                  <label class="wbset-setting">
                    <span class="wbset-setting-copy"><strong>隐藏「推荐」图标</strong><span>控制顶部导航栏的推荐入口。</span></span>
                    <input type="checkbox" id="wbset-nav-recommend">
                  </label>
                  <label class="wbset-setting">
                    <span class="wbset-setting-copy"><strong>隐藏「游戏」图标</strong><span>控制顶部导航栏的游戏入口。</span></span>
                    <input type="checkbox" id="wbset-nav-game">
                  </label>
                </div>
                <div class="wbset-sec">
                  <div class="wbset-sec-title">侧栏版块</div>
                  <label class="wbset-setting"><span class="wbset-setting-copy"><strong>隐藏微博热搜</strong><span>移除侧栏热搜榜。</span></span><input type="checkbox" id="wbset-hot"></label>
                  <label class="wbset-setting"><span class="wbset-setting-copy"><strong>隐藏你可能感兴趣的人</strong><span>移除侧栏用户推荐。</span></span><input type="checkbox" id="wbset-sug"></label>
                  <label class="wbset-setting"><span class="wbset-setting-copy"><strong>隐藏关注推荐</strong><span>移除关注推荐版块。</span></span><input type="checkbox" id="wbset-follow-rec"></label>
                  <label class="wbset-setting"><span class="wbset-setting-copy"><strong>隐藏常用功能</strong><span>移除常用功能版块。</span></span><input type="checkbox" id="wbset-common-functions"></label>
                  <label class="wbset-setting"><span class="wbset-setting-copy"><strong>隐藏粉丝群</strong><span>移除粉丝群版块。</span></span><input type="checkbox" id="wbset-fan-groups"></label>
                  <label class="wbset-setting"><span class="wbset-setting-copy"><strong>隐藏经常访问的超话</strong><span>移除经常访问的超话版块。</span></span><input type="checkbox" id="wbset-frequent-supertopics"></label>
                </div>
              </section>

              <section class="wbset-page" role="tabpanel" data-wbset-section="blacklist">
                <div class="wbset-page-head">
                  <h3>屏蔽设置</h3>
                  <p>选择本地屏蔽列表中的用户需要在哪些页面和内容类型中隐藏。</p>
                </div>
                <div class="wbset-sec">
                  <div class="wbset-sec-title">操作确认</div>
                  <label class="wbset-setting"><span class="wbset-setting-copy"><strong>屏蔽用户前确认</strong><span>通过右键菜单加入本地屏蔽名单或同时加入新浪微博官方黑名单前，在屏幕中央显示确认对话框。</span></span><input type="checkbox" id="wbset-confirm-before-blocking"></label>
                </div>
                <div class="wbset-sec">
                  <div class="wbset-sec-title">屏蔽范围</div>
                  <label class="wbset-setting"><span class="wbset-setting-copy"><strong>微博和转发</strong><span>隐藏本地屏蔽用户发布或转发的微博。</span></span><input type="checkbox" id="wbset-bl-posts"></label>
                  <label class="wbset-setting"><span class="wbset-setting-copy"><strong>评论和回复</strong><span>隐藏本地屏蔽用户的评论和楼中楼回复。</span></span><input type="checkbox" id="wbset-bl-comments"></label>
                  <label class="wbset-setting"><span class="wbset-setting-copy"><strong>搜索结果</strong><span>隐藏本地屏蔽用户作为主作者的搜索结果。</span></span><input type="checkbox" id="wbset-bl-search"></label>
                  <label class="wbset-setting"><span class="wbset-setting-copy"><strong>用户卡片和推荐项</strong><span>隐藏相关用户和推荐用户卡片。</span></span><input type="checkbox" id="wbset-bl-user-cards"></label>
                  <label class="wbset-setting"><span class="wbset-setting-copy"><strong>转发和点赞用户列表</strong><span>隐藏互动列表里的本地屏蔽用户；关注和粉丝页始终保留。</span></span><input type="checkbox" id="wbset-bl-interactions"></label>
                </div>
              </section>

              <section class="wbset-page" role="tabpanel" data-wbset-section="uids">
                <div class="wbset-page-head">
                  <h3>本地屏蔽列表</h3>
                  <p>浏览和搜索所有已保存 UID，并直接添加或删除本地屏蔽条目。</p>
                </div>
                <div class="wbset-stats">
                  <div class="wbset-stat"><span>已保存 UID</span><strong id="wbset-count">0</strong></div>
                  <div class="wbset-stat"><span>当前匹配</span><strong id="wbset-uid-match-count">0</strong></div>
                </div>
                <div class="wbset-sec">
                  <div class="wbset-sec-title">新增 UID</div>
                  <div class="wbset-row"><textarea id="wbset-uids" rows="3" placeholder="输入一个或多个 UID，支持逗号、空格或换行分隔"></textarea></div>
                  <div class="wbset-row">
                    <button class="wbset-btn2" id="wbset-bl-add">加入本地屏蔽列表</button>
                    <button class="wbset-btn2 ghost" id="wbset-reload">重载页面</button>
                  </div>
                </div>
                <div class="wbset-manager-tools">
                  <input class="wbset-input" type="search" id="wbset-uid-search" inputmode="numeric" placeholder="搜索 UID">
                  <button class="wbset-btn2 ghost" id="wbset-refresh">刷新列表</button>
                </div>
                <div class="wbset-uid-list" id="wbset-uid-list" aria-live="polite"></div>
                <div class="wbset-pagination">
                  <button class="wbset-btn2 ghost" id="wbset-uid-prev">上一页</button>
                  <span id="wbset-uid-page">第 1 / 1 页</span>
                  <div class="wbset-page-jump">
                    <input class="wbset-input" type="number" id="wbset-page-jump-input" min="1" step="1" inputmode="numeric" aria-label="输入页数" placeholder="页数">
                    <button class="wbset-btn2" id="wbset-page-jump">跳转</button>
                  </div>
                  <button class="wbset-btn2 ghost" id="wbset-uid-next">下一页</button>
                </div>
                <p class="wbset-note">每页显示 ${UID_MANAGER_PAGE_SIZE} 条，按最近写入顺序排列。可输入页数快速跳转；删除后会立即更新本地屏蔽列表和当前页面过滤结果。</p>
              </section>

              <section class="wbset-page" role="tabpanel" data-wbset-section="data">
                <div class="wbset-page-head">
                  <h3>新浪微博黑名单管理</h3>
                  <p>同步新浪微博官方黑名单，并管理本地屏蔽列表的备份与恢复。</p>
                </div>
                <div class="wbset-sec">
                  <div class="wbset-sec-title">新浪微博官方黑名单同步</div>
                  <div class="wbset-row">
                    <button class="wbset-btn2" id="wbset-sync-delta">增量同步</button>
                    <button class="wbset-btn2 ghost" id="wbset-sync-five">同步前 5 页</button>
                    <button class="wbset-btn2 ghost" id="wbset-sync-full">完整同步</button>
                    <button class="wbset-btn2 ghost" id="wbset-sync-cancel" hidden>取消同步</button>
                  </div>
                  <div class="wbset-row wbset-note wbset-sync-status" id="wbset-sync-status" role="status" aria-live="polite">当前没有正在运行的同步任务。</div>
                  <div class="wbset-row wbset-note">分页请求之间固定等待 ${THROTTLE_MS}ms。增量同步只读取第 1 页；完整同步会遍历全部分页。本地删除会在启动时的自动同步中保留，手动同步会把新浪微博官方黑名单中的 UID 重新加入本地屏蔽列表。</div>
                </div>
                <div class="wbset-sec">
                  <div class="wbset-sec-title">本地屏蔽列表备份</div>
                  <div class="wbset-row">
                    <button class="wbset-btn2" id="wbset-export">导出本地列表</button>
                    <button class="wbset-btn2" id="wbset-import-merge">导入并合并</button>
                    <button class="wbset-btn2 ghost" id="wbset-import-replace">导入并替换</button>
                  </div>
                  <div class="wbset-row wbset-note">导出格式为 JSON；替换操作会删除文件中不存在的现有 UID。</div>
                </div>
                <div class="wbset-sec danger-zone">
                  <div class="wbset-sec-title">危险操作</div>
                  <div class="wbset-row">
                    <button class="wbset-btn2 danger" id="wbset-clear-all">清空本地屏蔽列表</button>
                    <span class="wbset-note">此操作不可恢复，请先导出备份。</span>
                  </div>
                </div>
              </section>

              <section class="wbset-page" role="tabpanel" data-wbset-section="about">
                <section class="wbset-about-hero">
                  <div class="wbset-about-eyebrow">PYNSEQ FOR WEIBO</div>
                  <h3><a class="wbset-about-title-link" href="${GITHUB_URL}" target="_blank" rel="noopener">${SCRIPT_NAME}</a></h3>
                  <p>让微博回到更清爽、更可控的时间线：隐藏本地名单用户的内容，整理导航与侧栏，并管理新浪微博官方黑名单。</p>
                  <span class="wbset-about-version">v${SCRIPT_VERSION}</span>
                  <span class="wbset-about-version">MIT License</span>
                </section>
                <div class="wbset-about-grid">
                  <section class="wbset-about-card">
                    <h3>Star 提醒</h3>
                    <p>按使用阶段递进提醒；你可以随时在这里关闭或重新开启。</p>
                    <div class="wbset-star-status" id="wbset-star-status"></div>
                    <div class="wbset-about-card-actions">
                      <button class="wbset-btn2" id="wbset-star-toggle" type="button"></button>
                    </div>
                  </section>
                  <section class="wbset-about-card">
                    <h3>支持项目</h3>
                    <p>在 GitHub 为项目点亮 Star，或通过 Buy Me a Coffee 支持后续维护。</p>
                    <div class="wbset-about-card-actions wbset-support-actions">
                      <a class="wbset-support-link wbset-support-github" href="${GITHUB_URL}" target="_blank" rel="noopener">
                        <span class="wbset-support-icon" aria-hidden="true">${githubIconMarkup()}</span>
                        <span class="wbset-support-link-copy"><strong>DanielZenFlow</strong><span>为 Pynseq for Weibo 点亮一颗 Star</span></span>
                        <span class="wbset-support-link-action">打开 GitHub</span>
                      </a>
                      <a class="wbset-support-link wbset-support-bmc" href="${BUY_ME_A_COFFEE_URL}" target="_blank" rel="noopener">
                        ${buyMeACoffeeIconMarkup()}
                        <span class="wbset-support-link-copy"><strong>Buy me a coffee</strong><span>DanielZenFlow</span></span>
                        <span class="wbset-support-link-action">打开链接</span>
                      </a>
                    </div>
                  </section>
                </div>
              </section>
            </div>
          </div>
          <div class="wbset-ftr">
            <a class="wbset-author" href="${GITHUB_URL}" target="_blank" rel="noopener" aria-label="DanielZenFlow 的 GitHub 项目">
              ${githubIconMarkup()}<span>DanielZenFlow</span>
            </a>
            <div class="wbset-footer-actions">
              <button class="wbset-btn2 ghost" id="wbset-cancel">取消</button>
              <button class="wbset-btn2 primary" id="wbset-save">保存设置</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(panel);

      const $hot = panel.querySelector('#wbset-hot');
      const $sug = panel.querySelector('#wbset-sug');
      const $followRec = panel.querySelector('#wbset-follow-rec');
      const $commonFunctions = panel.querySelector('#wbset-common-functions');
      const $fanGroups = panel.querySelector('#wbset-fan-groups');
      const $frequentSuperTopics = panel.querySelector(
        '#wbset-frequent-supertopics'
      );
      const $latest = panel.querySelector('#wbset-latest');
      const $navVideo = panel.querySelector('#wbset-nav-video');
      const $navRecommend = panel.querySelector('#wbset-nav-recommend');
      const $navGame = panel.querySelector('#wbset-nav-game');
      const $searchRelatedUsers = panel.querySelector(
        '#wbset-search-related-users'
      );
      const $blacklistPosts = panel.querySelector('#wbset-bl-posts');
      const $blacklistComments = panel.querySelector('#wbset-bl-comments');
      const $blacklistSearch = panel.querySelector('#wbset-bl-search');
      const $blacklistUserCards = panel.querySelector(
        '#wbset-bl-user-cards'
      );
      const $blacklistInteractions = panel.querySelector(
        '#wbset-bl-interactions'
      );
      const $confirmBeforeBlocking = panel.querySelector(
        '#wbset-confirm-before-blocking'
      );
      const $hideAds = panel.querySelector('#wbset-hide-ads');
      const $hideAdsFromFollowing = panel.querySelector(
        '#wbset-hide-ads-following'
      );
      const $hideAdsFromStrangers = panel.querySelector(
        '#wbset-hide-ads-strangers'
      );
      const $hideAdsFromSelf = panel.querySelector('#wbset-hide-ads-self');
      const adScopeRows = [
        '#wbset-hide-ads-following-row',
        '#wbset-hide-ads-strangers-row',
        '#wbset-hide-ads-self-row',
      ].map((selector) => panel.querySelector(selector));
      // 三个分档只在总开关打开时可用，关闭时置灰并停止响应点击。
      const syncAdScopeAvailability = () => {
        const enabled = !!$hideAds && $hideAds.checked;
        [$hideAdsFromFollowing, $hideAdsFromStrangers, $hideAdsFromSelf].forEach(
          (input) => {
            if (input) input.disabled = !enabled;
          }
        );
        adScopeRows.forEach((row) => {
          if (row) row.setAttribute('data-disabled', enabled ? '0' : '1');
        });
      };
      const $hideTimelineRecommendations = panel.querySelector(
        '#wbset-hide-timeline-recommendations'
      );
      const $showSettingsButton = panel.querySelector(
        '#wbset-show-settings-button'
      );
      const $uids = panel.querySelector('#wbset-uids');
      const $count = panel.querySelector('#wbset-count');
      const $uidMatchCount = panel.querySelector('#wbset-uid-match-count');
      const $uidSearch = panel.querySelector('#wbset-uid-search');
      const $uidList = panel.querySelector('#wbset-uid-list');
      const $uidPage = panel.querySelector('#wbset-uid-page');
      const $pageJumpInput = panel.querySelector(
        '#wbset-page-jump-input'
      );
      const $pageJump = panel.querySelector('#wbset-page-jump');
      const $uidPrev = panel.querySelector('#wbset-uid-prev');
      const $uidNext = panel.querySelector('#wbset-uid-next');
      let uidManagerPage = 1;
      let uidManagerTotalPages = 1;

      function refreshCfgUI() {
        $hot.checked = !!CFG.hideHotSearch;
        $sug.checked = !!CFG.hideSuggestedPeople;
        $followRec.checked = CFG.hideFollowRecommendations !== false;
        $commonFunctions.checked = CFG.hideCommonFunctions !== false;
        $fanGroups.checked = CFG.hideFanGroups !== false;
        $frequentSuperTopics.checked =
          CFG.hideFrequentSuperTopics !== false;
        $latest.checked = CFG.defaultLatestTimeline !== false; // 默认true
        $navVideo.checked = !!CFG.hideNavVideo;
        $navRecommend.checked = !!CFG.hideNavRecommend;
        $navGame.checked = CFG.hideNavGame !== false;
        $searchRelatedUsers.checked = CFG.hideSearchRelatedUsers !== false;
        $blacklistPosts.checked = CFG.hideBlacklistPosts !== false;
        $blacklistComments.checked = CFG.hideBlacklistComments !== false;
        $blacklistSearch.checked =
          CFG.hideBlacklistSearchResults !== false;
        $blacklistUserCards.checked =
          CFG.hideBlacklistUserCards !== false;
        $blacklistInteractions.checked =
          CFG.hideBlacklistInteractions !== false;
        $confirmBeforeBlocking.checked =
          CFG.confirmBeforeBlocking !== false;
        $hideAds.checked = CFG.hideAds !== false;
        if ($hideAdsFromFollowing) {
          $hideAdsFromFollowing.checked = CFG.hideAdsFromFollowing !== false;
        }
        if ($hideAdsFromStrangers) {
          $hideAdsFromStrangers.checked = CFG.hideAdsFromStrangers !== false;
        }
        if ($hideAdsFromSelf) {
          $hideAdsFromSelf.checked = CFG.hideAdsFromSelf === true;
        }
        syncAdScopeAvailability();
        $hideTimelineRecommendations.checked =
          CFG.hideTimelineRecommendations !== false;
        $showSettingsButton.checked = CFG.showSettingsButton !== false;
      }
      function refreshUIDManager(options = {}) {
        if (options.resetPage) uidManagerPage = 1;
        const allUIDs = Array.from(readBLSet()).reverse();
        const query = String($uidSearch.value || '').trim();
        const matchingUIDs = query
          ? allUIDs.filter((uid) => uid.includes(query))
          : allUIDs;
        const totalPages = Math.max(
          1,
          Math.ceil(matchingUIDs.length / UID_MANAGER_PAGE_SIZE)
        );
        uidManagerTotalPages = totalPages;
        uidManagerPage = Math.min(Math.max(1, uidManagerPage), totalPages);

        const pageStart = (uidManagerPage - 1) * UID_MANAGER_PAGE_SIZE;
        const pageUIDs = matchingUIDs.slice(
          pageStart,
          pageStart + UID_MANAGER_PAGE_SIZE
        );

        $count.textContent = String(allUIDs.length);
        $uidMatchCount.textContent = String(matchingUIDs.length);
        $uidPage.textContent = `第 ${uidManagerPage} / ${totalPages} 页`;
        $pageJumpInput.max = String(totalPages);
        $uidPrev.disabled = uidManagerPage <= 1;
        $uidNext.disabled = uidManagerPage >= totalPages;
        $uidList.replaceChildren();

        if (!pageUIDs.length) {
          const empty = document.createElement('div');
          empty.className = 'wbset-empty';
          empty.textContent = query
            ? `没有找到包含“${query}”的 UID`
            : '本地屏蔽列表中暂无 UID';
          $uidList.appendChild(empty);
          return;
        }

        const fragment = document.createDocumentFragment();
        pageUIDs.forEach((uid) => {
          const item = document.createElement('div');
          item.className = 'wbset-uid-item';

          const code = document.createElement('code');
          code.textContent = uid;
          const profile = document.createElement('a');
          profile.className = 'wbset-uid-link';
          profile.href = `https://weibo.com/u/${uid}`;
          profile.target = '_blank';
          profile.rel = 'noopener';
          profile.textContent = '查看主页';
          const remove = document.createElement('button');
          remove.type = 'button';
          remove.className = 'wbset-btn2 ghost wbset-uid-remove';
          remove.setAttribute('data-wbset-remove-uid', uid);
          remove.textContent = '删除';

          item.append(code, profile, remove);
          fragment.appendChild(item);
        });
        $uidList.appendChild(fragment);
      }
      function jumpToPage() {
        const page = Number($pageJumpInput.value);
        if (
          !Number.isInteger(page) ||
          page < 1 ||
          page > uidManagerTotalPages
        ) {
          notify(`请输入 1 到 ${uidManagerTotalPages} 之间的页数`, {
            type: 'error',
          });
          return;
        }
        uidManagerPage = page;
        refreshUIDManager();
      }
      function closePanel({ reset = true } = {}) {
        if (reset) CFG = loadCfg();
        panel.style.display = 'none';
      }
      function setActivePage(pageName) {
        panel.querySelectorAll('[data-wbset-page]').forEach((button) => {
          const active = button.getAttribute('data-wbset-page') === pageName;
          button.classList.toggle('is-active', active);
          button.setAttribute('aria-selected', String(active));
        });
        panel.querySelectorAll('[data-wbset-section]').forEach((section) => {
          section.classList.toggle(
            'is-active',
            section.getAttribute('data-wbset-section') === pageName
          );
        });
        if (pageName === 'uids') refreshUIDManager();
        if (pageName === 'about') renderStarReminderStatus(panel);
      }

      refreshCfgUI();
      refreshUIDManager();

      const nav = panel.querySelector('.wbset-nav');
      nav.addEventListener('click', (e) => {
        const button = e.target.closest('[data-wbset-page]');
        if (!button) return;
        setActivePage(button.getAttribute('data-wbset-page'));
      });
      nav.addEventListener('keydown', (e) => {
        if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(e.key)) {
          return;
        }
        const buttons = Array.from(nav.querySelectorAll('[data-wbset-page]'));
        const currentIndex = buttons.indexOf(document.activeElement);
        if (currentIndex < 0) return;
        e.preventDefault();
        const direction =
          e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
        const next =
          buttons[(currentIndex + direction + buttons.length) % buttons.length];
        next.focus();
        next.click();
      });
      panel
        .querySelector('#wbset-open-onboarding')
        .addEventListener('click', (event) => {
          if (!isTrustedSettingsEvent(event)) return;
          closePanel();
          openOnboarding({ force: true });
        });
      panel
        .querySelector('#wbset-star-toggle')
        .addEventListener('click', (event) => {
          if (!isTrustedSettingsEvent(event)) return;
          toggleStarReminder(panel);
        });
      [
        ['.wbset-author', openProjectGitHub],
        ['.wbset-about-title-link', openProjectGitHub],
        ['.wbset-support-github', openProjectGitHub],
        ['.wbset-support-bmc', openBuyMeACoffee],
      ].forEach(([selector, handler]) => {
        panel.querySelector(selector)?.addEventListener('click', (event) => {
          if (!isTrustedSettingsEvent(event)) return;
          event.preventDefault();
          handler();
        });
      });

      panel
        .querySelector('#wbset-refresh')
        .addEventListener('click', () => refreshUIDManager());
      panel
        .querySelector('#wbset-reload')
        .addEventListener('click', (event) => {
          if (!isTrustedSettingsEvent(event)) return;
          location.reload();
        });
      $uidSearch.addEventListener('input', () => {
        refreshUIDManager({ resetPage: true });
      });
      $pageJump.addEventListener('click', jumpToPage);
      $pageJumpInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        jumpToPage();
      });
      $uidPrev.addEventListener('click', () => {
        if (uidManagerPage <= 1) return;
        uidManagerPage--;
        refreshUIDManager();
      });
      $uidNext.addEventListener('click', () => {
        uidManagerPage++;
        refreshUIDManager();
      });
      $uidList.addEventListener('click', async (e) => {
        if (!isTrustedSettingsEvent(e)) return;
        const button = e.target.closest('[data-wbset-remove-uid]');
        if (!button) return;
        const uid = button.getAttribute('data-wbset-remove-uid');
        if (!/^\d{5,}$/.test(uid || '')) return;
        const confirmed = await requestCenteredConfirm({
          title: '确认删除 UID',
          message: `确定从本地屏蔽列表删除 UID ${uid} 吗？`,
          confirmText: '确认删除',
          cancelText: '取消',
          danger: true,
        });
        if (!confirmed) return;
        try {
          await removeFromBL([uid]);
          syncRuntimeBL({ restoreHidden: true });
          refreshUIDManager();
        } catch (error) {
          notify(`❌ ${error?.message || '删除失败'}`, { type: 'error' });
        }
      });
      panel.querySelector('#wbset-export').addEventListener('click', (event) => {
        if (!isTrustedSettingsEvent(event)) return;
        const count = exportBlacklist();
        notify(`✅ 已导出 ${count} 个 UID 到 JSON 文件`, {
          type: 'success',
        });
      });
      // 导入（合并）按钮事件
      const fileInputMerge = createFileInput(async (file) => {
        try {
          const result = await importBlacklist(file, 'merge');
          syncRuntimeBL({ restoreHidden: false });
          refreshUIDManager();
          notify(
            `✅ 导入成功！\n` +
              `📂 文件导出时间：${result.exportTime}\n` +
              `📊 文件中 UID 数：${result.importedCount}\n` +
              `➕ 新增 UID 数：${result.addedCount}\n` +
              `📋 当前总数：${result.totalCount}`,
            { type: 'success', duration: 6000 }
          );
        } catch (err) {
          notify(`❌ ${err.message}`, { type: 'error' });
        }
      });
      panel
        .querySelector('#wbset-import-merge')
        .addEventListener('click', (event) => {
          if (!isTrustedSettingsEvent(event)) return;
          fileInputMerge.click();
        });

      // 导入（替换）按钮事件
      const fileInputReplace = createFileInput(async (file) => {
        const confirmReplace = await requestCenteredConfirm({
          title: '确认替换本地屏蔽列表',
          message:
            '替换模式会删除备份文件中不存在的现有 UID。\n\n建议先导出当前本地屏蔽列表备份。',
          confirmText: '确认替换',
          cancelText: '取消',
          danger: true,
        });
        if (!confirmReplace) return;

        try {
          const result = await importBlacklist(file, 'replace');
          syncRuntimeBL({ restoreHidden: true });
          refreshUIDManager({ resetPage: true });
          notify(
              `✅ 替换成功！\n` +
              `📂 文件导出时间：${result.exportTime}\n` +
              `📊 导入 UID 数：${result.importedCount}\n` +
              `📋 当前总数：${result.totalCount}`,
            { type: 'success', duration: 6000 }
          );
        } catch (err) {
          notify(`❌ ${err.message}`, { type: 'error' });
        }
      });
      panel
        .querySelector('#wbset-import-replace')
        .addEventListener('click', (event) => {
          if (!isTrustedSettingsEvent(event)) return;
          fileInputReplace.click();
        });

      // 同步按钮事件：所有入口共享同一个互斥任务，并支持进度与取消。
      const syncAPI = WB_INTERNAL.blSync;
      const syncStartButtons = [
        panel.querySelector('#wbset-sync-delta'),
        panel.querySelector('#wbset-sync-five'),
        panel.querySelector('#wbset-sync-full'),
      ];
      const syncCancelButton = panel.querySelector('#wbset-sync-cancel');
      const syncStatus = panel.querySelector('#wbset-sync-status');

      const renderSyncState = (state) => {
        const active = state?.active === true;
        syncStartButtons.forEach((button) => {
          button.disabled = active;
        });
        syncCancelButton.hidden = !active;
        syncCancelButton.disabled = !active;
        syncStatus.classList.toggle('is-active', active);
        if (!active) {
          syncStatus.textContent = '当前没有正在运行的同步任务。';
          return;
        }
        const pageText = state.currentPage
          ? `第 ${state.currentPage}${
              state.targetPages ? ` / ${state.targetPages}` : ''
            } 页`
          : '正在准备';
        const loadedText = Number.isFinite(state.loaded)
          ? `，已处理 ${state.loaded} 个 UID`
          : '';
        const waitingText = state.waiting ? '，请求过于频繁，正在等待重试' : '';
        syncStatus.textContent = `${state.label}：${pageText}${loadedText}${waitingText}`;
      };

      const reportSyncError = (err) => {
        if (err?.name === 'AbortError') {
          notify('新浪微博官方黑名单同步已取消');
          return;
        }
        notify(`❌ 新浪微博官方黑名单同步失败：${err?.message || '未知错误'}`, {
          type: 'error',
        });
      };

      syncAPI.subscribe(renderSyncState);
      syncCancelButton.addEventListener('click', (event) => {
        if (!isTrustedSettingsEvent(event)) return;
        syncAPI.cancel();
      });

      syncStartButtons[0].addEventListener('click', async (event) => {
        if (!isTrustedSettingsEvent(event)) return;
        try {
          const result = await syncAPI.deltaSync();
          notify(`✅ 官方黑名单增量同步完成！本地屏蔽列表新增 ${result.added} 个 UID`, {
            type: 'success',
          });
          refreshUIDManager();
        } catch (err) {
          reportSyncError(err);
        }
      });

      syncStartButtons[1].addEventListener('click', async (event) => {
        if (!isTrustedSettingsEvent(event)) return;
        try {
          const result = await syncAPI.syncPages(5);
          notify(`✅ 官方黑名单前 5 页同步完成！本地屏蔽列表新增 ${result.added} 个 UID`, {
            type: 'success',
          });
          refreshUIDManager();
        } catch (err) {
          reportSyncError(err);
        }
      });

      syncStartButtons[2].addEventListener('click', async (event) => {
        if (!isTrustedSettingsEvent(event)) return;
        try {
          const oldSize = syncAPI.getCount();
          const newSize = await syncAPI.fullSync();
          notify(
            `✅ 官方黑名单完整同步完成！本地屏蔽列表新增 ${newSize - oldSize} 个 UID（共 ${newSize}）`,
            { type: 'success' }
          );
          refreshUIDManager();
        } catch (err) {
          reportSyncError(err);
        }
      });

      panel
        .querySelector('#wbset-clear-all')
        .addEventListener('click', async (event) => {
          if (!isTrustedSettingsEvent(event)) return;
          const currentCount = readBLSet().size;
          if (currentCount === 0) {
            notify('本地屏蔽列表已经是空的');
            return;
          }
          const confirmClear = await requestCenteredConfirm({
            title: '确认清空本地屏蔽列表',
            message:
              `即将删除本地屏蔽列表中的 ${currentCount} 个 UID。\n\n` +
              '此操作不可恢复，建议先导出备份。',
            confirmText: '继续',
            cancelText: '取消',
            danger: true,
          });
          if (!confirmClear) return;

          const doubleConfirm = await requestCenteredConfirm({
            title: '最后确认',
            message: `确定删除全部 ${currentCount} 个 UID 吗？删除后无法恢复。`,
            confirmText: '全部删除',
            cancelText: '取消',
            danger: true,
          });
          if (!doubleConfirm) return;

          try {
            await removeFromBL(Array.from(readBLSet()));
            syncRuntimeBL({ restoreHidden: true });
            refreshUIDManager({ resetPage: true });
            notify('✅ 已清空本地屏蔽列表', { type: 'success' });
          } catch (error) {
            notify(`❌ ${error?.message || '清空失败'}`, { type: 'error' });
          }
        });

      panel.querySelector('#wbset-bl-add').addEventListener('click', async (event) => {
        if (!isTrustedSettingsEvent(event)) return;
        const ids = parseUIDInput($uids.value);
        if (!ids.length) {
          notify('请输入有效的 UID', { type: 'error' });
          return;
        }
        try {
          const result = await addToBL(ids);
          syncRuntimeBL({ restoreHidden: false });
          $uids.value = '';
          refreshUIDManager({ resetPage: true });
          notify(
            `已处理 ${ids.length} 个 UID，新增 ${result.added} 个，当前缓存总数：${result.size}`,
            { type: 'success' }
          );
        } catch (error) {
          notify(`❌ ${error?.message || '添加失败'}`, { type: 'error' });
        }
      });

      panel.querySelector('#wbset-save').addEventListener('click', (event) => {
        if (!isTrustedSettingsEvent(event)) return;
        const previousLatestTimeline = CFG.defaultLatestTimeline !== false;
        const nextLatestTimeline = $latest.checked;
        CFG.hideHotSearch = $hot.checked;
        CFG.hideSuggestedPeople = $sug.checked;
        CFG.hideFollowRecommendations = $followRec.checked;
        CFG.hideCommonFunctions = $commonFunctions.checked;
        CFG.hideFanGroups = $fanGroups.checked;
        CFG.hideFrequentSuperTopics = $frequentSuperTopics.checked;
        CFG.defaultLatestTimeline = nextLatestTimeline;
        CFG.hideNavVideo = $navVideo.checked;
        CFG.hideNavRecommend = $navRecommend.checked;
        CFG.hideNavGame = $navGame.checked;
        CFG.hideSearchRelatedUsers = $searchRelatedUsers.checked;
        CFG.hideBlacklistPosts = $blacklistPosts.checked;
        CFG.hideBlacklistComments = $blacklistComments.checked;
        CFG.hideBlacklistSearchResults = $blacklistSearch.checked;
        CFG.hideBlacklistUserCards = $blacklistUserCards.checked;
        CFG.hideBlacklistInteractions = $blacklistInteractions.checked;
        CFG.confirmBeforeBlocking = $confirmBeforeBlocking.checked;
        CFG.hideAds = $hideAds.checked;
        if ($hideAdsFromFollowing) {
          CFG.hideAdsFromFollowing = $hideAdsFromFollowing.checked;
        }
        if ($hideAdsFromStrangers) {
          CFG.hideAdsFromStrangers = $hideAdsFromStrangers.checked;
        }
        if ($hideAdsFromSelf) {
          CFG.hideAdsFromSelf = $hideAdsFromSelf.checked;
        }
        CFG.hideTimelineRecommendations = $hideTimelineRecommendations.checked;
        CFG.showSettingsButton = $showSettingsButton.checked;
        CFG = saveCfg(CFG);
        closePanel({ reset: false });
        let runtimeApplyError = null;
        try {
          WB_INTERNAL.applyConfig?.(CFG);
          applyPanelSettingsNow();
          syncLauncherButton();
        } catch (error) {
          runtimeApplyError = error;
          console.warn('[WB-SETTINGS] 设置已保存，但即时应用失败', error);
        }
        if (
          reconcileHomeTimelineSetting(
            previousLatestTimeline,
            nextLatestTimeline
          )
        ) {
          return;
        }
        if (runtimeApplyError) {
          notify('设置已保存；部分设置将在刷新页面后生效', {
            type: 'error',
          });
        } else {
          notify('设置已保存并即时生效', { type: 'success' });
        }
      });
      panel.querySelector('#wbset-cancel').addEventListener('click', () => {
        closePanel();
      });
      panel.addEventListener('click', (e) => {
        if (e.target === panel) {
          closePanel();
        }
      });
      if ($hideAds) {
        $hideAds.addEventListener('change', syncAdScopeAvailability);
      }
      panel.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closePanel();
      });
      panel.addEventListener(SETTINGS_CONFIG_SYNC_EVENT, () => {
        CFG = loadCfg();
        refreshCfgUI();
      });
      panel.addEventListener('wbset:open', () => {
        CFG = loadCfg();
        refreshCfgUI();
        refreshUIDManager();
        setActivePage(panel.getAttribute('data-wbset-initial-page') || 'general');
      });
    }
    const validPage = ['general', 'blacklist', 'uids', 'data', 'about'].includes(
      initialPage
    )
      ? initialPage
      : 'general';
    panel.setAttribute('data-wbset-initial-page', validPage);
    panel.style.display = 'flex';
    panel.dispatchEvent(new CustomEvent('wbset:open'));
  }

  function syncLauncherButton() {
    const existingButton = document.querySelector('.wbset-btn');
    if (CFG.showSettingsButton === false) {
      existingButton?.remove();
    } else if (!existingButton && document.documentElement) {
      const btn = document.createElement('button');
      btn.className = 'wbset-btn';
      btn.type = 'button';
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.09a2 2 0 0 1 1 1.74v.5a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      `;
      btn.title = `${SCRIPT_NAME} 设置`;
      btn.setAttribute('aria-label', `打开 ${SCRIPT_NAME} 设置`);
      btn.addEventListener('click', (event) => {
        if (!isTrustedSettingsEvent(event)) return;
        openPanel('general');
      });
      document.documentElement.appendChild(btn);
    }
  }

  function initLauncher() {
    ensureStyles();
    syncLauncherButton();
    if (typeof GM_registerMenuCommand === 'function') {
      GM_registerMenuCommand('设置', () => openPanel('general'));
      GM_registerMenuCommand('关于', () => openPanel('about'));
    }
    openOnboarding();
  }

  if (typeof GM_addValueChangeListener === 'function') {
    GM_addValueChangeListener(
      WB_INTERNAL.config.key,
      (_name, _oldValue, _newValue, remote) => {
        if (!remote) return;
        const previousLatestTimeline = CFG.defaultLatestTimeline !== false;
        CFG = loadCfg();
        WB_INTERNAL.applyConfig?.(CFG);
        applyPanelSettingsNow();
        syncLauncherButton();
        reconcileHomeTimelineSetting(
          previousLatestTimeline,
          CFG.defaultLatestTimeline
        );
        syncCreatedSettingsPanelConfigUI();
      }
    );
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', initLauncher);
  else initLauncher();
})();
/* === /Settings v5 === */
})();

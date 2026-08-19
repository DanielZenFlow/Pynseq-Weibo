const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

(async () => {

const scriptPath = path.join(
  __dirname,
  'pynseq-for-weibo.user.js'
);
const source = fs.readFileSync(scriptPath, 'utf8');
const readmeSource = fs.readFileSync(path.join(__dirname, 'readme.md'), 'utf8');
const changelog = fs.readFileSync(
  path.join(__dirname, 'CHANGELOG.zh-CN.md'),
  'utf8'
);
const iconPath = path.join(__dirname, 'pynseq-for-weibo-icon.png');
const iconSource = fs.readFileSync(iconPath);
const immutableIconURL =
  'https://raw.githubusercontent.com/DanielZenFlow/Pynseq-Weibo/c5e75843ef29f16fdbd1a1a22f11dc9206be184f/pynseq-for-weibo-icon.png';
const greasyForkURL =
  'https://greasyfork.org/en/scripts/564839-pynseq-for-weibo-%E5%B1%8F%E5%BA%8F-%E5%BE%AE%E5%8D%9A-%E6%9C%AC%E5%9C%B0%E5%B1%8F%E8%94%BD%E5%90%8D%E5%8D%95%E4%B8%8E%E6%97%B6%E9%97%B4%E7%BA%BF%E6%8E%A7%E5%88%B6-%E5%B1%8F%E8%94%BD%E7%83%AD%E6%90%9C';

function sourceBetween(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `Missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

assert.doesNotMatch(source, /window\.(?:WB_RETRO_CONFIRM|WB_BL_SYNC)/);
assert.doesNotMatch(source, /function\s+(?:filterData|filterAdsFromData)\s*\(/);
assert.match(source, /^\/\/ @description:en\s+\S.+$/m);
assert.doesNotMatch(source, /^\/\/ @match\s+http:\/\//m);
assert.match(source, /function isTrustedUserEvent\(event\)/);
assert.match(
  sourceBetween('  function createCenteredConfirm(', '  function showCenteredConfirm('),
  /if \(!isTrustedUserEvent\(event\)\) return;/
);
assert.match(
  sourceBetween('    const handleContextMenu = (e) => {', "    document.addEventListener('contextmenu'"),
  /if \(!isTrustedUserEvent\(e\)\) return;/
);
assert.match(source, /function\s+collectAdPostIDs\s*\(/);
assert.match(source, /function\s+runControlledSync\s*\(/);
assert.match(source, /controller\.abort\(\)/);
assert.match(source, /USER_SCRIPT_UI_SELECTOR/);
assert.doesNotMatch(source, /\balert\s*\(/);
assert.match(source, /function\s+showNotification\s*\(/);
assert.match(source, /WB_INTERNAL\.notify\s*=\s*showNotification/);
assert.match(source, /const GITHUB_URL = 'https:\/\/github\.com\/DanielZenFlow\/Pynseq-Weibo'/);
const filteredUsersParserSource = sourceBetween(
  '  function hasNextFilteredUsersPage(value) {',
  '  function buildFilteredUsersURL(page) {'
);
const filteredUsersParserContext = {};
vm.runInNewContext(
  `${filteredUsersParserSource}
globalThis.parseFilteredUsers = parseFilteredUsersResponse;`,
  filteredUsersParserContext
);
assert.throws(
  () => filteredUsersParserContext.parseFilteredUsers({ ok: 0 }, '测试'),
  /失败/
);
assert.throws(
  () =>
    filteredUsersParserContext.parseFilteredUsers(
      { ok: 1, card_group: {} },
      '测试'
    ),
  /缺少名单数据/
);
assert.equal(
  filteredUsersParserContext.parseFilteredUsers(
    { ok: 1, card_group: [], next_cursor: 0 },
    '测试'
  ).hasNextPage,
  false
);
assert.equal(
  filteredUsersParserContext.parseFilteredUsers(
    { ok: 1, card_group: [{}], next_cursor: 1 },
    '测试'
  ).hasNextPage,
  true
);
assert.equal(
  filteredUsersParserContext.parseFilteredUsers(
    { ok: 1, card_group: [{}], next_cursor: 1, total: 0 },
    '测试'
  ).hasNextPage,
  false
);
assert.equal(
  (source.match(/const parsed = parseFilteredUsersResponse\(data,/g) || []).length,
  3
);
const filteredUsersPaginationSource = sourceBetween(
  '  function extractUIDFromScheme(item) {',
  '  let BL = new Set();'
);
const paginationRequests = [];
let paginationResponses = [];
const filteredUsersPaginationContext = vm.createContext({
  MAX_418: 3,
  MAX_FULL_SYNC_PAGES: 20,
  SETTING_API_HOST_ERROR: 'host error',
  THROTTLE_MS: 350,
  WB_BL_NATIVE: {
    fetch: async (url) => {
      paginationRequests.push(url);
      const data = paginationResponses.shift();
      if (!data) throw new Error(`unexpected request: ${url}`);
      return {
        ok: true,
        status: 200,
        json: async () => data,
      };
    },
  },
  canUseSettingApi: () => true,
  commitSyncedLocalBL: async (workingSet) => new Set(workingSet),
  readLocalBLExclusions: () => new Set(),
  replaceSetContents: (target, values) => {
    target.clear();
    values.forEach((value) => target.add(value));
    return target;
  },
  sleep: async () => {},
  throwIfSyncAborted: () => {},
});
vm.runInContext(
  `${filteredUsersPaginationSource}
  globalThis.testFilteredUsersPagination = { fullSync, deltaSync, syncPages };`,
  filteredUsersPaginationContext
);
const paginationAPI =
  filteredUsersPaginationContext.testFilteredUsersPagination;
const pagedResponses = () => [
  {
    ok: 1,
    card_group: [{ scheme: 'sinaweibo://userinfo?uid=10001' }],
    next_cursor: 1,
    total: 3,
  },
  {
    ok: 1,
    card_group: [{ scheme: 'sinaweibo://userinfo?uid=10002' }],
    next_cursor: 1,
    total: 3,
  },
  {
    ok: 1,
    card_group: [{ scheme: 'sinaweibo://userinfo?uid=10003' }],
    next_cursor: 0,
    total: 3,
  },
];

paginationResponses = pagedResponses();
paginationRequests.length = 0;
const fullSyncResult = await paginationAPI.fullSync();
assert.deepEqual(Array.from(fullSyncResult), ['10001', '10002', '10003']);
assert.deepEqual(paginationRequests, [
  '/ajax/setting/getFilteredUsers?page=1',
  '/ajax/setting/getFilteredUsers?page=2',
  '/ajax/setting/getFilteredUsers?page=3',
]);
assert.equal(
  paginationRequests.some((url) => url.includes('cursor=')),
  false,
  'official blacklist pagination must use page numbers only'
);

paginationResponses = pagedResponses();
paginationRequests.length = 0;
const pagedSyncSet = new Set();
assert.equal(await paginationAPI.syncPages(pagedSyncSet, 5), 3);
assert.deepEqual(Array.from(pagedSyncSet), ['10001', '10002', '10003']);
assert.deepEqual(paginationRequests, [
  '/ajax/setting/getFilteredUsers?page=1',
  '/ajax/setting/getFilteredUsers?page=2',
  '/ajax/setting/getFilteredUsers?page=3',
]);

paginationResponses = [
  {
    ok: 1,
    card_group: [{ scheme: 'sinaweibo://userinfo?uid=10004' }],
    next_cursor: 1,
  },
];
paginationRequests.length = 0;
const deltaSet = await paginationAPI.deltaSync(new Set());
assert.deepEqual(Array.from(deltaSet), ['10004']);
assert.deepEqual(paginationRequests, [
  '/ajax/setting/getFilteredUsers?page=1',
]);

paginationResponses = [
  {
    ok: 1,
    card_group: [],
    next_cursor: 1,
  },
];
paginationRequests.length = 0;
assert.equal(await paginationAPI.syncPages(new Set(), 5), 0);
assert.equal(
  paginationRequests.length,
  1,
  'an empty page must terminate pagination even when next_cursor stays truthy'
);
const observerSource = sourceBetween(
  '      observer.observe(root, {',
  '    function subscribeMutations('
);
[
  'href',
  'data-user-id',
  'data-user-card',
  'data-usercard',
  'data-usercard-mid',
  'data-uid',
  'uid',
  'usercard',
  'nick-name',
].forEach((attribute) => {
  assert.match(observerSource, new RegExp(`'${attribute}'`));
});
const userContextSelectorSource = sourceBetween(
  '  const USER_CONTEXT_TARGET_SELECTOR = [',
  '  function getUserNameLabel('
);
const domUIDSelectorSource = sourceBetween(
  '  const DOM_UID_SELECTOR = [',
  '  const DOM_POST_ROOT_SELECTOR = ['
);
assert.match(userContextSelectorSource, /'\.woo-avatar-main'/);
assert.match(userContextSelectorSource, /'\.woo-avatar-img'/);
assert.match(userContextSelectorSource, /'\[usercard\^="name=@"\]'/);
assert.match(userContextSelectorSource, /'header a\[href=""\]'/);
assert.doesNotMatch(userContextSelectorSource, /\[action-data\*=/);
assert.doesNotMatch(domUIDSelectorSource, /'\[action-data\*=/);
assert.match(
  domUIDSelectorSource,
  /'\[action-type="reply"\]\[action-data\*="ouid="\]'/
);
const extractDOMUIDsSource = sourceBetween(
  '  function extractDOMUIDs(el) {',
  '  function collectScopedUserContextUIDs('
);
assert.match(
  extractDOMUIDsSource,
  /addDirectUID\(el\.getAttribute\('data-user-card'\)\)/
);
assert.match(
  extractDOMUIDsSource,
  /addMatches\(href, \/\^\\\/\(\\d\{5,\}\)/
);
const uidParserSandbox = {};
vm.runInNewContext(
  `${extractDOMUIDsSource}
globalThis.extractDOMUIDsForTest = extractDOMUIDs;`,
  uidParserSandbox
);
const fakeUIDElement = (attributes) => ({
  getAttribute(name) {
    return Object.hasOwn(attributes, name) ? attributes[name] : null;
  },
});
assert.deepEqual(
  Array.from(
    uidParserSandbox.extractDOMUIDsForTest(
      fakeUIDElement({ 'data-user-card': '3210890705' })
    )
  ),
  ['3210890705']
);
assert.deepEqual(
  Array.from(
    uidParserSandbox.extractDOMUIDsForTest(
      fakeUIDElement({ href: '/3210890705/Rad3Fk9LU' })
    )
  ),
  ['3210890705']
);
assert.deepEqual(
  Array.from(
    uidParserSandbox.extractDOMUIDsForTest(
      fakeUIDElement({
        href: 'https://m.s.weibo.com/claim/apply?object_id=1022:100808&uid=1635218563',
      })
    )
  ),
  []
);
assert.deepEqual(
  Array.from(
    uidParserSandbox.extractDOMUIDsForTest(
      fakeUIDElement({
        'action-type': 'topicShare',
        'action-data': 'uid=1618051664&title=share',
      })
    )
  ),
  []
);
assert.deepEqual(
  Array.from(
    uidParserSandbox.extractDOMUIDsForTest(
      fakeUIDElement({
        'action-type': 'reply',
        'action-data': 'ouid=7580422220&cid=5325737454211807',
      })
    )
  ),
  ['7580422220']
);
const identityCarrierSource = sourceBetween(
  '  function isUserIdentityCarrierForUID(',
  '  function getUserDisplayName('
);
class FakeIdentityCarrier {
  constructor({ identity = false, uids = [] } = {}) {
    this.identity = identity;
    this.uids = uids;
  }
  matches() {
    return this.identity;
  }
}
const identityCarrierSandbox = {
  Element: FakeIdentityCarrier,
  USER_CONTEXT_TARGET_SELECTOR: '.identity-target',
  USER_CONTEXT_NAME_TARGET_SELECTOR: '.identity-name',
  extractDOMUIDs: (el) => new Set(el.uids),
};
vm.runInNewContext(
  `${identityCarrierSource}
globalThis.isUserIdentityCarrierForUIDForTest = isUserIdentityCarrierForUID;`,
  identityCarrierSandbox
);
assert.equal(
  identityCarrierSandbox.isUserIdentityCarrierForUIDForTest(
    new FakeIdentityCarrier({ identity: true, uids: ['7492781550'] }),
    '7492781550'
  ),
  true
);
assert.equal(
  identityCarrierSandbox.isUserIdentityCarrierForUIDForTest(
    new FakeIdentityCarrier({ identity: false, uids: ['7492781550'] }),
    '7492781550'
  ),
  false,
  'a post permalink timestamp must not be accepted as a user-name carrier'
);
const userDisplayNameSource = sourceBetween(
  '  function getUserDisplayName(',
  '  function firstDOMUID('
);
assert.match(
  userDisplayNameSource,
  /\.filter\(\(candidateEl\) =>[\s\S]*?isUserIdentityCarrierForUID\(candidateEl, uid\)/
);
assert.match(
  userDisplayNameSource,
  /pushNameCandidate\(candidates, getUserNameLabel\(candidateEl\), 100\)/
);
assert.deepEqual(
  Array.from(
    uidParserSandbox.extractDOMUIDsForTest(
      fakeUIDElement({ usercard: 'name=@_苏世独立_横而不流' })
    )
  ),
  []
);
const userContextResolverSource = sourceBetween(
  '  function getUserContextFromTarget(target) {',
  '  function shouldConfirmBeforeBlocking('
);
const searchContextResolverSource = sourceBetween(
  '  function getSearchResultUserContext(el) {',
  '  function getCurrentProfilePageUID() {'
);
assert.match(
  searchContextResolverSource,
  /unresolvedDirectTarget[\s\S]*?expectedName[\s\S]*?fallbackName[\s\S]*?expectedName !== fallbackName[\s\S]*?return null/
);
assert.match(
  userContextResolverSource,
  /firstDOMUID\(source\)\s*\|\|\s*getScopedUserContextUID\(nameTarget, explicitName\)/
);
assert.doesNotMatch(
  userContextResolverSource,
  /firstDOMUID\(source,\s*post\)/
);
assert.match(
  userContextResolverSource,
  /post &&[\s\S]*?isPostContentRoot\(post\)[\s\S]*?!isUnsafePostRootForUID\(post, uid\)/
);
assert.match(
  sourceBetween(
    '  function getCurrentProfilePageUID() {',
    '  function getUserContextFromTarget('
  ),
  /\/p\\\/100505\(\\d\{5,\}\)/
);
const scopedUserResolverSource = sourceBetween(
  '  function getScopedUserContextUID(',
  '  function normDOMText('
);
assert.match(
  scopedUserResolverSource,
  /addScope\(target\.closest\(DOM_COMMENT_ROOT_SELECTOR\), false\)/
);
assert.match(
  scopedUserResolverSource,
  /chooseScopedUserContextUID\(\s*records,\s*expectedName,\s*allowUniqueFallback\s*\)/
);
const chooseScopedUserContextUIDSource = sourceBetween(
  '  function chooseScopedUserContextUID(',
  '  function getScopedUserContextUID('
);
const scopedUIDSandbox = {
  cleanUserDisplayName(text) {
    const value = String(text || '').replace(/\s+/g, ' ').trim();
    return value.replace(/^@+/, '');
  },
};
vm.runInNewContext(
  `${chooseScopedUserContextUIDSource}
globalThis.chooseScopedUserContextUIDForTest = chooseScopedUserContextUID;`,
  scopedUIDSandbox
);
const scopedUIDRecords = [
  {
    uid: '3210890705',
    labels: ['_苏世独立_横而不流', ''],
  },
  {
    uid: '7299117014',
    labels: ['科技主理人'],
  },
];
assert.equal(
  scopedUIDSandbox.chooseScopedUserContextUIDForTest(
    scopedUIDRecords,
    '_苏世独立_横而不流',
    false
  ),
  '3210890705'
);
assert.equal(
  scopedUIDSandbox.chooseScopedUserContextUIDForTest(
    scopedUIDRecords,
    '没有数字 UID 的提及用户',
    false
  ),
  '',
  'an unresolved mention must never fall back to the post author'
);
assert.equal(
  scopedUIDSandbox.chooseScopedUserContextUIDForTest(
    [{ uid: '3210890705', labels: [] }],
    '',
    true
  ),
  '3210890705'
);
assert.equal(
  scopedUIDSandbox.chooseScopedUserContextUIDForTest(
    [{ uid: '3210890705', labels: [] }],
    '',
    false
  ),
  ''
);
const contextMenuHandlerSource = sourceBetween(
  '    const handleContextMenu = (e) => {',
  "    document.addEventListener('contextmenu', handleContextMenu, true);"
);
assert.match(
  contextMenuHandlerSource,
  /const contextTarget = nameTarget \|\| directTarget/
);
assert.match(
  contextMenuHandlerSource,
  /USER_CONTEXT_TARGET_SELECTOR/
);
assert.equal(source.includes(`// @icon         ${immutableIconURL}`), true);
assert.equal(source.includes(`// @icon64       ${immutableIconURL}`), true);
assert.equal(
  fs.existsSync(path.join(__dirname, 'weibo-retro-twitter-style-clone.user.js')),
  false
);
assert.deepEqual(
  Array.from(iconSource.subarray(0, 8)),
  [137, 80, 78, 71, 13, 10, 26, 10]
);
assert.equal(iconSource.readUInt32BE(16), iconSource.readUInt32BE(20));
assert.equal(iconSource[25], 2, 'userscript icon must be opaque truecolor PNG');
assert.match(readmeSource, /https:\/\/github\.com\/DanielZenFlow\/Pynseq-Weibo/);
assert.match(readmeSource, /^# Pynseq for Weibo｜屏序·微博$/m);
assert.match(readmeSource, /^> 屏其不欲见者，复其应有之序。$/m);
assert.equal(readmeSource.includes(greasyForkURL), true);
assert.match(readmeSource, /https:\/\/buymeacoffee\.com\/danielzenflow/);
assert.equal(
  (
    readmeSource.match(
      /https:\/\/buymeacoffee\.com\/danielzenflow/g
    ) || []
  ).length,
  2
);
assert.equal(
  readmeSource.includes(
    `项目地址：[Greasy Fork 项目页](${greasyForkURL})`
  ),
  true
);
assert.equal(
  readmeSource.includes(
    `Project page: [Pynseq for Weibo on Greasy Fork](${greasyForkURL})`
  ),
  true
);
assert.doesNotMatch(readmeSource, /(?:项目地址|Project page):\s*<https:/);
assert.match(source, /#wb-retro-toast\s*\{[\s\S]*?z-index:\s*2147483647/);
assert.match(source, /width:\s*min\(215px,\s*calc\(100vw - 32px\)\)/);
assert.match(source, /#wb-retro-toast\.is-visible\s*\{\s*opacity:\s*1/);
assert.match(source, /USER_SCRIPT_UI_SELECTOR[\s\S]*?'#wb-retro-toast'/);
assert.doesNotMatch(source, /wb-retro-notice-stack|wb-retro-notice-close/);
assert.match(
  source,
  /showUserContextToastImpl = \(message\) =>\s*showNotification\(message, \{ type: 'success' \}\)/
);
const confirmStyleSource = sourceBetween(
  '  function ensureCenteredConfirmStyles() {',
  '  function createCenteredConfirm('
);
assert.match(confirmStyleSource, /width:\s*min\(430px,\s*calc\(100vw - 32px\)\)/);
assert.match(confirmStyleSource, /padding:\s*24px/);
assert.match(confirmStyleSource, /border:\s*1px solid #cfc5bb/);
assert.match(confirmStyleSource, /border-radius:\s*0/);
assert.match(confirmStyleSource, /background:\s*#f7f3ee/);
assert.match(confirmStyleSource, /z-index:\s*2147483647/);
assert.match(source, /WB_INTERNAL\.applyConfig\s*=\s*applyRuntimeConfig/);
assert.match(source, /wb-retro-runtime-style/);
assert.match(source, /const WB_CONFIG_SCHEMA_VERSION = 1/);
assert.match(source, /@grant\s+GM_removeValueChangeListener/);
assert.doesNotMatch(source, /WB_INTERNAL\.getDiagnostics\s*=/);
assert.doesNotMatch(source, /diagnostic|高级诊断|运行诊断/i);
assert.match(source, /const THROTTLE_MS = 350/);
assert.ok(
  source.indexOf('const THROTTLE_MS = 350') <
    source.indexOf("const WB_CONFIG_KEY = 'cfg'"),
  'official blacklist request pacing must remain visible to the settings scope'
);
assert.equal((source.match(/await sleep\(THROTTLE_MS, signal\)/g) || []).length, 2);
assert.match(
  source,
  /data-wbset-page="blacklist">屏蔽设置<\/button>/
);
assert.match(
  source,
  /data-wbset-page="uids">本地屏蔽名单<\/button>/
);
assert.match(
  source,
  /data-wbset-page="data">新浪微博黑名单管理<\/button>/
);
assert.match(
  source,
  /data-wbset-page="about">关于<\/button>/
);
const settingsSource = sourceBetween(
  '/* === Settings v5:',
  '/* === /Settings v5 === */'
);
assert.match(source, /const UID_MUTATION_LOCK_KEY = 'WB_BL_mutation_lock_v1'/);
assert.match(source, /async function withLocalBLMutationLock\(task\)/);
assert.match(source, /confirmed\?\.owner === owner/);
assert.match(source, /async function mutateLocalBLStorage\(options = \{\}\)/);
assert.match(source, /async function commitSyncedLocalBL\(/);
assert.equal(
  (source.match(/await commitSyncedLocalBL\(/g) || []).length,
  3
);
assert.match(settingsSource, /function isTrustedSettingsEvent\(event\)/);
assert.match(
  settingsSource,
  /#wbset-save'\)\.addEventListener\('click', \(event\) => \{[\s\S]*?if \(!isTrustedSettingsEvent\(event\)\) return;/
);
assert.doesNotMatch(source, /cdn\.buymeacoffee\.com/);
assert.match(source, /function buyMeACoffeeIconMarkup\(\)[\s\S]*?<svg viewBox="0 0 24 24"/);
const panelMarkupSource = sourceBetween(
  '      panel.innerHTML = `',
  '      document.body.appendChild(panel);'
);
const settingsHTMLIds = new Set(
  [
    ...Array.from(
      settingsSource.matchAll(/\bid="([^"]+)"/g),
      (match) => match[1]
    ),
    ...Array.from(
      settingsSource.matchAll(/\.id\s*=\s*['"]([^'"]+)['"]/g),
      (match) => match[1]
    ),
  ]
);
assert.equal(
  new Set(
    Array.from(panelMarkupSource.matchAll(/\bid="([^"]+)"/g), (match) => match[1])
  ).size,
  Array.from(panelMarkupSource.matchAll(/\bid="([^"]+)"/g)).length,
  'settings panel markup must not contain duplicate IDs'
);
const settingsNavPages = Array.from(
  settingsSource.matchAll(/data-wbset-page="([^"]+)"/g),
  (match) => match[1]
).sort();
const settingsSections = Array.from(
  settingsSource.matchAll(/data-wbset-section="([^"]+)"/g),
  (match) => match[1]
).sort();
assert.deepEqual(
  settingsNavPages,
  settingsSections,
  'every settings navigation page must have exactly one matching section'
);
const settingsQueriedIds = Array.from(
  settingsSource.matchAll(/querySelector\(\s*['"]#([^'"]+)['"]\s*\)/g),
  (match) => match[1]
);
assert.deepEqual(
  Array.from(
    new Set(settingsQueriedIds.filter((id) => !settingsHTMLIds.has(id)))
  ),
  [],
  'every settings querySelector ID must exist in the settings markup'
);
const dataSettingsSection = sourceBetween(
  'data-wbset-section="data"',
  'data-wbset-section="about"'
);
assert.doesNotMatch(dataSettingsSection, /diagnostic|诊断/i);
const generalSettingsSection = sourceBetween(
  'data-wbset-section="general"',
  'data-wbset-section="blacklist"'
);
assert.equal(
  generalSettingsSection.match(/class="wbset-sec-title">([^<]+)</)?.[1],
  '设置向导',
  'the onboarding launcher must be the first section on the General tab'
);
assert.match(
  generalSettingsSection,
  /id="wbset-hide-timeline-recommendations"/
);
assert.match(
  source,
  /hideTimelineRecommendations:\s*true/
);
assert.match(source, /@version\s+2\.4\.0/);
assert.match(source, /const SCRIPT_VERSION = '2\.4\.0'/);
// 元数据版本号与运行时常量必须始终一致，否则设置面板会显示错误版本。
assert.equal(
  source.match(/@version\s+(\S+)/)?.[1],
  source.match(/const SCRIPT_VERSION = '([^']+)'/)?.[1],
  'the userscript metadata version and SCRIPT_VERSION must stay in sync'
);
// 更新日志必须为当前版本留有条目。
assert.ok(
  changelog.includes(
    `## v${source.match(/const SCRIPT_VERSION = '([^']+)'/)?.[1]} `
  ),
  'CHANGELOG must document the current version'
);
assert.match(source, /const SCRIPT_NAME = 'Pynseq for Weibo｜屏序·微博'/);
assert.match(settingsSource, /<span class="wbset-version">v\$\{SCRIPT_VERSION\}<\/span>/);
assert.doesNotMatch(source, /本地黑名单/);
assert.match(source, /pynseq-for-weibo-blocklist-\$\{timestamp\}\.json/);
assert.doesNotMatch(source, /weibo-blacklist-backup-/);
assert.equal(
  (source.match(/GM_registerMenuCommand\(['"]设置['"]/g) || []).length,
  1
);
assert.equal(
  (source.match(/GM_registerMenuCommand\(['"]关于['"]/g) || []).length,
  1
);
assert.match(source, /function\s+openOnboarding\s*\(/);
assert.match(source, /\$\{stepIndex \+ 1\} \/ 5/);
assert.match(source, /class="wbset-onboard-skip" type="button">使用默认设置<\/button>/);
assert.doesNotMatch(source, /跳过并使用默认设置/);
assert.match(
  source,
  /font-size:11\.5px!important;\s*font-weight:800!important;line-height:1\.3!important/
);
assert.match(source, /Buy me a coffee/);
const onboardingSource = sourceBetween(
  '  function openOnboarding(',
  '  function openPanel('
);
assert.match(
  onboardingSource,
  /data-wbset-setting="hideTimelineRecommendations"/
);
const onboardingSettingKeys = Array.from(
  new Set(
    Array.from(
      onboardingSource.matchAll(/data-wbset-setting="([^"]+)"/g),
      (match) => match[1]
    )
  )
).sort();
assert.deepEqual(onboardingSettingKeys, [
  'confirmBeforeBlocking',
  'defaultLatestTimeline',
  'hideAds',
  'hideBlacklistComments',
  'hideBlacklistInteractions',
  'hideBlacklistPosts',
  'hideBlacklistSearchResults',
  'hideBlacklistUserCards',
  'hideTimelineRecommendations',
  'showSettingsButton',
]);
const onboardingFinishSource = sourceBetween(
  '    const finish = (nextSettings) => {',
  '    const bindDraftInputs = () => {'
);
assert.match(onboardingFinishSource, /const previousCfg = loadCfg\(\)/);
assert.match(
  onboardingFinishSource,
  /previousCfg\.defaultLatestTimeline !== false/
);
assert.match(onboardingFinishSource, /CFG = saveCfg\(normalizeCfg\(nextSettings\)\)/);
assert.match(onboardingFinishSource, /WB_INTERNAL\.applyConfig\?\.\(CFG\)/);
assert.match(onboardingFinishSource, /applyPanelSettingsNow\(\)/);
assert.match(onboardingFinishSource, /syncLauncherButton\(\)/);
assert.match(onboardingFinishSource, /syncCreatedSettingsPanelConfigUI\(\)/);
assert.match(onboardingFinishSource, /reconcileHomeTimelineSetting\(/);
const settingsPanelConfigSyncSource = sourceBetween(
  '  function syncCreatedSettingsPanelConfigUI() {',
  '  // ---- BL Store helpers'
);
assert.match(
  settingsPanelConfigSyncSource,
  /document\.querySelector\('\.wbset-panel'\)/
);
assert.match(
  settingsPanelConfigSyncSource,
  /new CustomEvent\(SETTINGS_CONFIG_SYNC_EVENT\)/
);
assert.match(
  settingsSource,
  /panel\.addEventListener\(SETTINGS_CONFIG_SYNC_EVENT,[\s\S]*?CFG = loadCfg\(\);[\s\S]*?refreshCfgUI\(\);/
);
class FakeSettingsConfigSyncEvent {
  constructor(type) {
    this.type = type;
  }
}
const settingsConfigSyncEvents = [];
const settingsConfigSyncPanel = {
  dispatchEvent(event) {
    settingsConfigSyncEvents.push(event);
  },
};
const settingsConfigSyncContext = vm.createContext({
  SETTINGS_CONFIG_SYNC_EVENT: 'wbset:config-sync',
  CustomEvent: FakeSettingsConfigSyncEvent,
  document: {
    querySelector(selector) {
      return selector === '.wbset-panel' ? settingsConfigSyncPanel : null;
    },
  },
});
vm.runInContext(
  `${settingsPanelConfigSyncSource}
   this.syncCreatedSettingsPanelConfigUI = syncCreatedSettingsPanelConfigUI;`,
  settingsConfigSyncContext
);
assert.equal(
  settingsConfigSyncContext.syncCreatedSettingsPanelConfigUI(),
  true
);
assert.equal(settingsConfigSyncEvents.length, 1);
assert.equal(settingsConfigSyncEvents[0].type, 'wbset:config-sync');
assert.match(source, /if \(!isInsideCommentSurface\(el\)\) return null/);
assert.match(
  source,
  /const DOM_COMMENT_ITEM_ROOT_SELECTOR = \[[\s\S]*?\.card-review\[comment_id\]/
);
assert.match(
  source,
  /const DOM_COMMENT_COLLECTION_SELECTOR = \[[\s\S]*?feed_list_commentList/
);
assert.match(
  source,
  /DOM_COMMENT_AUTHOR_CARRIER_SELECTOR[\s\S]*?item1in[\s\S]*?a:first-child/
);
assert.match(
  source,
  /const DOM_USER_CARD_ITEM_ROOT_SELECTOR = \[[\s\S]*?\.card-user-b/
);
const commentRootSource = sourceBetween(
  '  function findCommentRootForUID(',
  '  function findContentRootForUID('
);
assert.match(
  commentRootSource,
  /const explicitItem = el\.closest\(DOM_COMMENT_ITEM_ROOT_SELECTOR\)/
);
assert.match(
  commentRootSource,
  /explicit &&[\s\S]*?!isCommentCollectionRoot\(explicit\)/
);
assert.match(
  commentRootSource,
  /getCommentOwnerUID\(explicitItem\) === uid/
);
assert.doesNotMatch(commentRootSource, /elementHasUID\(/);
assert.ok(
  commentRootSource.indexOf('if (!isInsideCommentSurface(el)) return null;') <
    commentRootSource.indexOf('let fallback = null;'),
  'non-comment author links must be rejected before generic comment fallback'
);
const personItemRootSource = sourceBetween(
  '  function findPersonItemRootForUID(',
  '  function getTopLevelSemanticRoots('
);
assert.match(
  personItemRootSource,
  /const explicitUserCard = el\.closest\(DOM_USER_CARD_ITEM_ROOT_SELECTOR\)/
);
assert.match(
  personItemRootSource,
  /getUserCardOwnerUID\(explicitUserCard\) === uid/
);
assert.match(
  personItemRootSource,
  /markPersonItemRoot\(\s*explicitUserCard/
);
assert.match(
  source,
  /function isPersonCollectionRoot\(root\)[\s\S]*?return items\.length > 1/
);
const contentRootSource = sourceBetween(
  '  function findContentRootForUID(',
  '  function shouldPromoteFeedShell('
);
assert.match(
  contentRootSource,
  /if \(isInsideCommentSurface\(el\)\) return null;/
);
assert.match(
  contentRootSource,
  /!isCommentCollectionRoot\(explicit\)/
);
assert.match(
  contentRootSource,
  /const personItemRoot = findPersonItemRootForUID\(el, uid\)/
);
assert.match(
  contentRootSource,
  /contentRootOwnedByUID\(explicit, uid\)/
);
assert.doesNotMatch(contentRootSource, /elementHasUID\(/);
const rootOwnershipGuardSource = sourceBetween(
  '  function contentRootOwnedByUID(',
  '  function getPrimaryContentRoots('
);
const rootOwnershipGuardSandbox = {
  getContentRootOwnerUID(root) {
    return root.ownerUID || '';
  },
};
vm.runInNewContext(
  `${rootOwnershipGuardSource}
globalThis.contentRootOwnedByUIDForTest = contentRootOwnedByUID;`,
  rootOwnershipGuardSandbox
);
const normalPostMentioningBlockedUser = {
  ownerUID: '5999521555',
  descendantUIDs: ['5999521555', '7580422220'],
};
assert.equal(
  rootOwnershipGuardSandbox.contentRootOwnedByUIDForTest(
    normalPostMentioningBlockedUser,
    '7580422220'
  ),
  false,
  'a blocked UID mentioned inside a normal post must not own the post'
);
assert.equal(
  rootOwnershipGuardSandbox.contentRootOwnedByUIDForTest(
    normalPostMentioningBlockedUser,
    '5999521555'
  ),
  true,
  'only the primary author may own a post root'
);
assert.match(
  searchContextResolverSource,
  /const resolvedRoot = findContentRootForUID\(source, uid\)/
);
assert.match(
  searchContextResolverSource,
  /const safeCardRoot = cardAuthorUID === uid \? card : null/
);
assert.match(
  searchContextResolverSource,
  /root: resolvedRoot \|\| safeCardRoot/
);
class FakeSearchContextElement {
  constructor({ uid = '', name = '', card = null, resolvedRoot = null } = {}) {
    this.uid = uid;
    this.name = name;
    this.card = card;
    this.resolvedRoot = resolvedRoot;
    this.children = [];
  }
  closest() {
    return this.card;
  }
}
const fakeSearchCard = new FakeSearchContextElement();
fakeSearchCard.contains = () => true;
fakeSearchCard.querySelector = (selector) =>
  selector === '.search-author' ? fakeSearchCard.author : null;
const fakeSearchPostAuthor = new FakeSearchContextElement({
  uid: '5999521555',
  name: '清纯痣',
  card: fakeSearchCard,
  resolvedRoot: fakeSearchCard,
});
const fakeSearchCommentRow = new FakeSearchContextElement();
const fakeSearchCommentAuthor = new FakeSearchContextElement({
  uid: '7580422220',
  name: '抠脚煤女',
  card: fakeSearchCard,
  resolvedRoot: fakeSearchCommentRow,
});
fakeSearchCard.author = fakeSearchPostAuthor;
const searchContextSandbox = {
  Element: FakeSearchContextElement,
  SEARCH_RESULT_AUTHOR_SELECTOR: '.search-author',
  isWeiboSearchResultPage: () => true,
  getUserNameContextTarget: (el) => el,
  firstDOMUID: (el) => el?.uid || '',
  cleanUserDisplayName: (value) => String(value || ''),
  getNameFromElementAttributes: (el) => el?.name || '',
  getOwnDOMText: (el) => el?.name || '',
  getUserDisplayName: (el) => el?.name || '',
  getProfileURL: (_el, uid) => `https://weibo.com/u/${uid}`,
  findContentRootForUID: (source) => source?.resolvedRoot || null,
};
vm.runInNewContext(
  `${searchContextResolverSource}
globalThis.getSearchResultUserContextForTest = getSearchResultUserContext;`,
  searchContextSandbox
);
assert.equal(
  searchContextSandbox.getSearchResultUserContextForTest(
    fakeSearchCommentAuthor
  ).root,
  fakeSearchCommentRow,
  'a search-page comment author must own only the individual comment row'
);
fakeSearchCommentAuthor.resolvedRoot = null;
assert.equal(
  searchContextSandbox.getSearchResultUserContextForTest(
    fakeSearchCommentAuthor
  ).root,
  null,
  'an unresolved comment boundary must never fall back to the blogger card'
);
assert.equal(
  searchContextSandbox.getSearchResultUserContextForTest(
    fakeSearchPostAuthor
  ).root,
  fakeSearchCard,
  'the search-result card may still be owned by its primary post author'
);
const blacklistDOMCategorySource = sourceBetween(
  '  function getBlacklistDOMCategory(',
  '  function findExplicitAdRoot('
);
assert.match(
  blacklistDOMCategorySource,
  /isInteractionContentRoot\(root\)[\s\S]*?return 'interactions'/
);
assert.match(
  blacklistDOMCategorySource,
  /category === 'interactions'[\s\S]*?hideBlacklistInteractions/
);
const immediateBlockSource = sourceBetween(
  '  async function addContextUserToBL(',
  '  function getCookieValue('
);
assert.match(immediateBlockSource, /hideContentRoot\(post, ctx\.uid\)/);
assert.match(immediateBlockSource, /compactVirtualScrollerGaps\(document\)/);
assert.match(immediateBlockSource, /nudgeTimelineLayout\(\)/);
assert.match(
  immediateBlockSource,
  /const added = await addUIDToLocalBL\(ctx\.uid\);[\s\S]*try \{/
);
assert.match(
  immediateBlockSource,
  /catch \(err\) \{[\s\S]*当前页面刷新失败/
);
const hideShellSource = sourceBetween(
  '  function findHideShell(',
  '  function hideContentRoot('
);
assert.match(hideShellSource, /virtualView\.firstElementChild/);
assert.match(
  hideShellSource,
  /target\.parentElement !== virtualView/
);
assert.doesNotMatch(hideShellSource, /return virtualView;/);
assert.match(
  hideShellSource,
  /isUserCardContentRoot\(root\)[\s\S]*?!virtualView/
);
const virtualGapSource = sourceBetween(
  '  function compactVirtualScrollerGaps(',
  '  function isWeiboSearchResultPage('
);
assert.match(
  virtualGapSource,
  /recoverStalledTimelinePagination\(\)/
);
assert.doesNotMatch(
  virtualGapSource,
  /(?:transform|top|min-height|height|scrollTo|scrollBy)\s*[=:]/
);
assert.equal(
  source.includes('      [${COMPACTED_VIRTUAL_ITEM_ATTR}] {'),
  false,
  'runtime CSS must not override Vue recycler transforms'
);
assert.equal(
  source.includes('      [${COMPACTED_VIRTUAL_WRAPPER_ATTR}] {'),
  false,
  'runtime CSS must not override Vue recycler height'
);
const virtualShellSizeMatch = source.match(
  /const VIRTUAL_MEASUREMENT_SHELL_PX = (\d+);/
);
assert.ok(virtualShellSizeMatch, 'virtual measurement shell size must be explicit');
const virtualShellSize = Number(virtualShellSizeMatch[1]);
assert.ok(
  ~~(virtualShellSize * 0.994) > 0,
  'scaled shell height must survive vue-virtual-scroller 1.x integer flooring'
);
assert.equal(
  ~~(1 * 0.994),
  0,
  'the former 1px shell reproduces the live zero-size cache failure'
);
assert.match(
  source,
  /\.vue-recycle-scroller__item-view > \$\{BLOCKED_CONTENT_HIDE_SELECTOR\}[\s\S]*?height:\s*\$\{VIRTUAL_MEASUREMENT_SHELL_PX\}px !important;[\s\S]*?visibility:\s*hidden !important;/
);
// 旧的 192px「分页保护间距」对微博的哨兵毫无作用：哨兵用 rootMargin 1500px
// 的 IntersectionObserver 监听，推开 192px 根本不会改变可见性判定；而且它取的
// 是第一个 __slot（前置槽，永远是空的），实际从未生效过。
assert.doesNotMatch(source, /NATIVE_PAGINATION_GUARD/);
assert.match(
  source,
  /\[\$\{TIMELINE_LOADER_NUDGE_ATTR\}="1"\]\s*\{[\s\S]*?display:\s*none !important;/
);
assert.doesNotMatch(
  source,
  /\[class\*="vue-recycle-scroller__item-view"\]\s*\{[\s\S]*?(?:transform|min-height):/
);
const nativeVirtualRemeasureSource = sourceBetween(
  '  function requestNativeVirtualItemRemeasure(',
  '  function hideContentRoot('
);
assert.match(
  nativeVirtualRemeasureSource,
  /shell\.parentElement\?\.matches\(VIRTUAL_VIEW_SELECTOR\)/
);
assert.match(
  nativeVirtualRemeasureSource,
  /new CustomEvent\('resize',[\s\S]*?contentRect:[\s\S]*?width: rect\.width,[\s\S]*?height: rect\.height/
);
assert.doesNotMatch(
  nativeVirtualRemeasureSource,
  /\.style\.|transform|minHeight|scrollTo|scrollBy/
);
class FakeVirtualElement {
  constructor({ isView = false, rect = null } = {}) {
    this.isView = isView;
    this.rect = rect;
    this.parentElement = null;
    this.isConnected = true;
    this.events = [];
  }
  matches(selector) {
    return this.isView && selector === '.virtual-view';
  }
  getBoundingClientRect() {
    return this.rect;
  }
  dispatchEvent(event) {
    this.events.push(event);
  }
}
class FakeCustomEvent {
  constructor(type, options) {
    this.type = type;
    this.detail = options.detail;
  }
}
const virtualFrames = [];
const virtualTimers = [];
const nativeVirtualRemeasureContext = vm.createContext({
  Element: FakeVirtualElement,
  CustomEvent: FakeCustomEvent,
  VIRTUAL_VIEW_SELECTOR: '.virtual-view',
  requestAnimationFrame(callback) {
    virtualFrames.push(callback);
  },
  setTimeout(callback) {
    virtualTimers.push(callback);
  },
});
vm.runInContext(
  `${nativeVirtualRemeasureSource}
   this.requestNativeVirtualItemRemeasure = requestNativeVirtualItemRemeasure;`,
  nativeVirtualRemeasureContext
);
const virtualView = new FakeVirtualElement({
  isView: true,
  rect: { width: 640, height: 1.988 },
});
const virtualShell = new FakeVirtualElement();
virtualShell.parentElement = virtualView;
nativeVirtualRemeasureContext.requestNativeVirtualItemRemeasure(virtualShell);
while (virtualFrames.length) virtualFrames.shift()();
virtualTimers.forEach((callback) => callback());
assert.equal(
  virtualView.events.length,
  1,
  'the native virtual-item resize event must be coalesced to one dispatch'
);
assert.equal(virtualView.events[0].type, 'resize');
assert.deepEqual(
  {
    width: virtualView.events[0].detail.contentRect.width,
    height: virtualView.events[0].detail.contentRect.height,
  },
  { width: 640, height: 1.988 }
);
const hideContentRootSource = sourceBetween(
  '  function hideContentRoot(',
  '  let floatingVideoSuppressUntil ='
);
assert.match(
  hideContentRootSource,
  /BLOCKED_CONTENT_ORIGINAL_ARIA_ATTR[\s\S]*?target\.setAttribute\(BLOCKED_CONTENT_HIDE_ATTR[\s\S]*?requestNativeVirtualItemRemeasure\(target\)/
);
assert.match(
  hideContentRootSource,
  /if \(isCommentCollectionRoot\(root\)\) return false;/
);
assert.match(
  hideContentRootSource,
  /isUnsafePostRootForUID\(target, id\)/
);
assert.match(
  hideContentRootSource,
  /!contentRootOwnedByUID\(root, id\)/
);
assert.match(
  hideContentRootSource,
  /isPersonCollectionRoot\(target\)/
);
const floatingVideoSuppressionSource = sourceBetween(
  '  function suppressFloatingVideoPlayers(',
  '  // vue-virtual-scroller 会渲染两个'
);
assert.match(
  source,
  /\[\$\{FLOATING_VIDEO_SUPPRESS_ATTR\}="1"\][\s\S]*?display:\s*none !important/
);
assert.match(
  floatingVideoSuppressionSource,
  /player\.setAttribute\(FLOATING_VIDEO_SUPPRESS_ATTR, '1'\)/
);
assert.match(
  floatingVideoSuppressionSource,
  /restoreSuppressedFloatingVideoPlayers/
);
assert.doesNotMatch(
  floatingVideoSuppressionSource,
  /player\.remove\(\)|style\.(?:setProperty|removeProperty)/
);
assert.doesNotMatch(
  source,
  /removeWeiboFloatingVideoPlayers|removeFloatingVideoPlayer/
);
const clearBlockedStateSource = sourceBetween(
  '  function clearOwnBlockedContentHideState(el) {',
  '  function clearBlockedContentHideState(root) {'
);
assert.match(
  clearBlockedStateSource,
  /originalAria === BLOCKED_CONTENT_ARIA_ABSENT[\s\S]*?removeAttribute\('aria-hidden'\)/
);
assert.match(
  clearBlockedStateSource,
  /originalAria !== null[\s\S]*?setAttribute\('aria-hidden', originalAria\)/
);
assert.match(
  clearBlockedStateSource,
  /requestNativeVirtualItemRemeasure\(el\)/
);
assert.doesNotMatch(
  clearBlockedStateSource,
  /style\.(?:removeProperty|setProperty)|style\.[A-Za-z]+\s*=/
);
class FakeRestorableElement {
  constructor(attributes = {}) {
    this.attributes = new Map(Object.entries(attributes));
    this.style = {
      cssText:
        'display:flex;height:72px;margin:8px;padding:4px;overflow:visible',
    };
  }
  hasAttribute(name) {
    return this.attributes.has(name);
  }
  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
  removeAttribute(name) {
    this.attributes.delete(name);
  }
}
const remeasureProbe = { calls: 0 };
const blockedRestoreContext = vm.createContext({
  Element: FakeRestorableElement,
  BLOCKED_CONTENT_HIDE_ATTR: 'data-hidden',
  BLOCKED_CONTENT_UID_ATTR: 'data-hidden-uid',
  BLOCKED_CONTENT_ORIGINAL_ARIA_ATTR: 'data-original-aria',
  BLOCKED_CONTENT_ARIA_ABSENT: '__absent__',
  COMMENT_CONTENT_ROOT_ATTR: 'data-comment-root',
  USER_CARD_CONTENT_ROOT_ATTR: 'data-user-card-root',
  INTERACTION_CONTENT_ROOT_ATTR: 'data-interaction-root',
  requestNativeVirtualItemRemeasure() {
    remeasureProbe.calls += 1;
  },
});
vm.runInContext(
  `${clearBlockedStateSource}
   this.clearOwnBlockedContentHideState = clearOwnBlockedContentHideState;`,
  blockedRestoreContext
);
const nativeStyledCard = new FakeRestorableElement({
  'data-hidden': '1',
  'data-hidden-uid': '123456',
  'data-comment-root': '1',
  'data-user-card-root': '1',
  'data-interaction-root': '1',
  'data-original-aria': 'false',
  'aria-hidden': 'true',
});
const nativeStyleBeforeRestore = nativeStyledCard.style.cssText;
blockedRestoreContext.clearOwnBlockedContentHideState(nativeStyledCard);
assert.equal(nativeStyledCard.getAttribute('aria-hidden'), 'false');
assert.equal(nativeStyledCard.style.cssText, nativeStyleBeforeRestore);
assert.equal(nativeStyledCard.hasAttribute('data-hidden'), false);
assert.equal(nativeStyledCard.hasAttribute('data-hidden-uid'), false);
assert.equal(nativeStyledCard.hasAttribute('data-comment-root'), false);
assert.equal(nativeStyledCard.hasAttribute('data-user-card-root'), false);
assert.equal(nativeStyledCard.hasAttribute('data-interaction-root'), false);
assert.equal(nativeStyledCard.hasAttribute('data-original-aria'), false);
const nativeCardWithoutAria = new FakeRestorableElement({
  'data-hidden': '1',
  'data-original-aria': '__absent__',
  'aria-hidden': 'true',
});
blockedRestoreContext.clearOwnBlockedContentHideState(nativeCardWithoutAria);
assert.equal(nativeCardWithoutAria.hasAttribute('aria-hidden'), false);
assert.equal(nativeCardWithoutAria.style.cssText, nativeStyleBeforeRestore);
assert.equal(
  remeasureProbe.calls,
  2,
  'restoring either aria state must request a native virtual-item remeasure'
);
const timelineStallSource = sourceBetween(
  '  function findNativeTimelineLoaderCard(scroller) {',
  '  function compactVirtualScrollerGaps('
);
// 停滞恢复只允许隐藏/恢复哨兵，绝不能改行坐标、外层高度或替微博滚动。
assert.doesNotMatch(
  timelineStallSource,
  /(?:transform|min-height|scrollTo|scrollBy)\s*[=:]/
);
// 后置槽才有哨兵，必须遍历全部 __slot，不能只 querySelector 第一个。
assert.match(
  timelineStallSource,
  /querySelectorAll\(\s*'?\s*:scope > \.vue-recycle-scroller__slot/
);
assert.doesNotMatch(
  timelineStallSource,
  /querySelector\(\s*\n?\s*'?:scope > \.vue-recycle-scroller__slot/
);
// 后台标签页里 rAF 会停摆，必须有定时兜底，否则哨兵会被永久隐藏。
assert.match(
  timelineStallSource,
  /setTimeout\(restore, TIMELINE_NUDGE_RESTORE_MS\)/
);
assert.match(
  timelineStallSource,
  /document\.visibilityState !== 'visible'/
);
// 补偿不得以"脚本折叠过内容"为前提。实测中整屏没有任何被屏蔽微博时，微博
// 自身的哨兵同样会锁死、停在底部逾一分钟不再续页；以此设闸会在最常见的卡死
// 场景下把补偿完全挡掉。
assert.doesNotMatch(timelineStallSource, /TIMELINE_COLLAPSED_ANY_ATTR/);
assert.doesNotMatch(source, /markTimelineScrollerCollapsed/);
assert.match(
  timelineStallSource,
  /timelineStall\.staleNudges >= TIMELINE_NUDGE_MAX_STALE/
);
// 停滞判定不得读取 document.scrollHeight：微博的图片、视频和侧栏会持续改变它，
// 以它为信号会把静止计时不断清零，补偿将无法触发。
assert.doesNotMatch(timelineStallSource, /documentElement[^\n]*scrollHeight/);
assert.match(
  timelineStallSource,
  /readTimelineContentHeight\(scroller\)/
);
assert.match(
  sourceBetween(
    '  function readTimelineContentHeight(scroller) {',
    '  const timelineStall = {'
  ),
  /vue-recycle-scroller__item-wrapper[\s\S]*?wrapper\.style\.minHeight/
);
// 大幅增长才重新等待页面稳定；动作成功本身必须比较动作前后的最终净增长。
assert.match(
  timelineStallSource,
  /heightChange > TIMELINE_PAGE_GROWTH_PX/
);
assert.match(
  timelineStallSource,
  /const actionGrowth =[\s\S]*?contentHeight - timelineStall\.pendingStartHeight/
);
assert.match(
  timelineStallSource,
  /heightChange < 0[\s\S]*?timelineStall\.inViewSince = now;[\s\S]*?return;/
);
// 所有入口都不传 root，统一解析到同一个滚动容器，避免不同入口命中不同容器
// 而把停滞计时反复重置。
assert.match(
  virtualGapSource,
  /recoverStalledTimelinePagination\(\)/
);
// 底部卡片查不到时必须整拍跳过：既不清静止计时，也不换容器。任何"查不到就
// 重置"的写法都是拿噪声信号复位计时器，心跳叠加滚动回调会让计时永远走不满。
assert.match(
  timelineStallSource,
  /const slotState = classifyNativeTimelineSlotCard\(scroller\);\s*if \(!slotState\) return;/
);
// 失败卡片没有加载动画节点，只按动画节点检测会完全失明，必须单独识别。
assert.match(timelineStallSource, /TIMELINE_ACTION_TEXT_RE\.test\(text\)/);
assert.match(timelineStallSource, /TIMELINE_END_TEXT_RE\.test\(text\)/);
// 补偿不得改写 fetch / XMLHttpRequest，只允许只读地观察资源计时。
assert.doesNotMatch(timelineStallSource, /window\.fetch\s*=/);
assert.doesNotMatch(
  timelineStallSource,
  /XMLHttpRequest\.prototype\.(?:open|send)\s*=/
);
assert.match(timelineStallSource, /new PerformanceObserver\(/);
assert.doesNotMatch(timelineStallSource, /findPaginatingTimeline/);

// 行为验证：哨兵在后置槽里，findNativeTimelineLoaderCard 必须找得到，
// 并且返回的是槽的直接子节点（微博用来包裹 spinner 的那张卡片）。
// 最小 DOM 替身，只实现该函数用到的能力：:scope 直接子节点查询、
// 后代类名查询和 parentElement 链。
class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = String(tagName).toUpperCase();
    this.className = '';
    this.children = [];
    this.parentElement = null;
  }
  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
  hasClass(cls) {
    return String(this.className || '')
      .split(/\s+/)
      .filter(Boolean)
      .includes(cls);
  }
  querySelectorAll(selector) {
    const scoped = selector.startsWith(':scope >');
    const cls = selector.replace(/^:scope >\s*/, '').replace(/^\./, '').trim();
    if (scoped) return this.children.filter((child) => child.hasClass(cls));
    const found = [];
    const walk = (node) => {
      node.children.forEach((child) => {
        if (child.hasClass(cls)) found.push(child);
        walk(child);
      });
    };
    walk(this);
    return found;
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}
const loaderLookupContext = vm.createContext({ Element: FakeElement });
vm.runInContext(
  `${sourceBetween(
    '  function findNativeTimelineLoaderCard(scroller) {',
    '  function classifyNativeTimelineSlotCard('
  )}
  globalThis.findLoaderCard = findNativeTimelineLoaderCard;`,
  loaderLookupContext
);
const makeSlot = () => {
  const slot = new FakeElement('div');
  slot.className = 'vue-recycle-scroller__slot';
  return slot;
};
const fakeScroller = new FakeElement('div');
fakeScroller.className = 'vue-recycle-scroller';
const beforeSlot = makeSlot();
const afterSlot = makeSlot();
const loaderCard = new FakeElement('div');
loaderCard.className = 'woo-panel-main';
const spinner = new FakeElement('i');
spinner.className = 'woo-spinner-main';
loaderCard.appendChild(spinner);
afterSlot.appendChild(loaderCard);
fakeScroller.appendChild(beforeSlot);
fakeScroller.appendChild(afterSlot);
assert.equal(
  loaderLookupContext.findLoaderCard(fakeScroller),
  loaderCard,
  'loader lookup must skip the empty before-slot and return the after-slot card'
);
assert.equal(loaderLookupContext.findLoaderCard(makeSlot()), null);
assert.equal(loaderLookupContext.findLoaderCard(null), null);

// 行为验证：仅检查源码文本的断言无法确认补偿是否真的会执行。这里直接跑一遍
// 状态机，模拟"哨兵停在视口里、列表总高不再增长"的卡死现场，确认补偿会触发，
// 并且在健康、后台标签页、未折叠内容等情况下保持沉默。
function runTimelineStallScenario({
  sentinelTop = 670,
  visibilityState = 'visible',

  pageGrowthPx = 0,
  ticks = 60,
  // Vue 在续页前后会重建后置槽，哨兵会间歇性查不到。设为 N 表示每 N 拍
  // 有一拍找不到哨兵。
  sentinelMissingEvery = 0,
  // 后置槽卡片的原生状态：加载动画 / 失败重试 / 没有更多。
  slotKind = 'loading',
  // 第几次点击重试后恢复为加载状态。
  retryRecoversAfter = Infinity,
  // 模拟请求保持在途的拍数，用来确认期间不会重复触发。
  requestCompletionDelayTicks = 0,
  // 模拟屏蔽项完成原生重测后，列表总高先下降再继续续页。
  collapseAtTick = -1,
  collapsePx = 0,
} = {}) {
  let tick = 0;
  const sentinelPresent = () =>
    !sentinelMissingEvery || tick % sentinelMissingEvery !== 0;
  const stallSource =
    sourceBetween(
      '  const TIMELINE_LOADER_NUDGE_ATTR =',
      '  const VIRTUAL_VIEW_SELECTOR ='
    ) +
    sourceBetween(
      '  function findNativeTimelineLoaderCard(scroller) {',
      '  function compactVirtualScrollerGaps('
    );

  let contentHeight = 7502;
  let kind = slotKind;
  let clock = 1_000_000;
  const nudges = [];
  const retryClicks = [];
  const pendingCompletions = [];
  class StallElement {}
  const spinner = new StallElement();
  spinner.className = 'woo-spinner-main';
  const card = new StallElement();
  card.className = 'woo-panel-main';
  card.getBoundingClientRect = () => ({
    top: sentinelTop,
    bottom: sentinelTop + 40,
  });
  card.setAttribute = () => {};
  card.removeAttribute = () => {};
  // 微博的失败卡片文案为「内容加载失败，请点击重试」，到头为「没有更多」。
  Object.defineProperty(card, 'textContent', {
    get() {
      if (kind === 'action') return '内容加载失败，请点击重试';
      if (kind === 'end') return '没有更多内容了';
      return '';
    },
  });
  const retryTarget = new StallElement();
  retryTarget.className = '_nextPage_13iyx_16';
  retryTarget.click = () => {
    retryClicks.push(clock - 1_000_000);
    contentHeight += pageGrowthPx;
    if (retryClicks.length >= retryRecoversAfter) kind = 'loading';
  };
  card.click = retryTarget.click;
  card.querySelector = () => retryTarget;
  spinner.parentElement = card;
  const makeStallSlot = (hasCard) => {
    const slot = new StallElement();
    slot.className = 'vue-recycle-scroller__slot';
    slot.querySelector = (sel) =>
      sel === '.woo-spinner-main' &&
      hasCard &&
      kind === 'loading' &&
      sentinelPresent()
        ? spinner
        : null;
    Object.defineProperty(slot, 'firstElementChild', {
      get() {
        return hasCard ? card : null;
      },
    });
    if (hasCard) card.parentElement = slot;
    return slot;
  };
  const slots = [makeStallSlot(false), makeStallSlot(true)];
  const wrapper = {
    style: {
      get minHeight() {
        return `${contentHeight}px`;
      },
    },
    getBoundingClientRect: () => ({ height: contentHeight }),
  };
  const scroller = new StallElement();
  scroller.className = 'vue-recycle-scroller';
  scroller.matches = (sel) => sel === '.vue-recycle-scroller';
  scroller.closest = () => scroller;
  scroller.hasAttribute = () => false;
  scroller.querySelectorAll = (sel) => (sel.includes('__slot') ? slots : []);
  scroller.querySelector = (sel) =>
    sel.includes('item-wrapper') ? wrapper : null;

  const fakeDocument = { visibilityState, querySelector: () => scroller };
  const factory = new Function(
    'Element',
    'document',
    'window',
    'isRelationshipListPage',
    'requestAnimationFrame',
    'setTimeout',
    'PerformanceObserver',
    'onNudge',
    `${stallSource}
     nudgeNativeTimelineLoader = onNudge;
     return {
       recover: recoverStalledTimelinePagination,
       markRequestDone(at) {
         timelineRequestLastDoneAt = at;
       },
     };`
  );
  const instance = factory(
    StallElement,
    fakeDocument,
    { innerHeight: 711 },
    () => false,
    (fn) => fn,
    (fn) => fn,
    undefined,
    () => {
      nudges.push(contentHeight);
      contentHeight += pageGrowthPx;
    }
  );

  const realNow = Date.now;
  Date.now = () => clock;
  try {
    for (let i = 0; i < ticks; i += 1) {
      tick = i;
      if (i === collapseAtTick) contentHeight -= collapsePx;
      pendingCompletions
        .filter((completion) => completion.tick === i)
        .forEach((completion) => instance.markRequestDone(completion.at));
      const actionCountBefore = nudges.length + retryClicks.length;
      instance.recover();
      const actionCountAfter = nudges.length + retryClicks.length;
      if (actionCountAfter > actionCountBefore) {
        if (requestCompletionDelayTicks > 0) {
          pendingCompletions.push({
            tick: i + requestCompletionDelayTicks,
            at: clock + 1,
          });
        } else {
          instance.markRequestDone(clock + 1);
        }
      }
      // 与脚本里的停滞检测心跳保持一致。
      clock += 250;
    }
  } finally {
    Date.now = realNow;
  }
  return { nudges: nudges.length, retryClicks: retryClicks.length };
}

// 卡死现场：补偿必须触发，且在时间线真的到头时收敛到上限。
assert.equal(
  runTimelineStallScenario({ pageGrowthPx: 0 }).nudges,
  3,
  'a stalled timeline must be nudged, then give up after the retry cap'
);
// 每次补偿都换来新的一页时，必须能一直翻下去，而不是三次之后就永久停摆。
assert.ok(
  runTimelineStallScenario({ pageGrowthPx: 900 }).nudges > 3,
  'pagination must keep going while each nudge actually loads a page'
);
// 整页大部分被屏蔽时，列表总高可能只涨几十像素。这仍是一次成功的续页，
// 必须能继续往下翻；若按"必须大幅增长才算成功"判定，失败计数会迅速触顶，
// 表现为拉到底后时不时彻底不再加载。
assert.ok(
  runTimelineStallScenario({ pageGrowthPx: 60, ticks: 96 }).nudges > 3,
  'pages that are mostly collapsed still count as successful loads'
);
assert.ok(
  runTimelineStallScenario({
    pageGrowthPx: 60,
    ticks: 120,
    collapseAtTick: 2,
    collapsePx: 660,
  }).nudges > 3,
  'a native height collapse must become the new baseline before small pages arrive'
);
// 哨兵被顶出视口 = 原生分页正常，不能插手。
assert.equal(runTimelineStallScenario({ sentinelTop: 4000 }).nudges, 0);
// 后台标签页不渲染，翻转不会被投递，必须完全不动。
assert.equal(runTimelineStallScenario({ visibilityState: 'hidden' }).nudges, 0);
// 哨兵间歇性查不到（Vue 重建后置槽）时补偿仍须触发：若在这一拍复位计时或
// 更换跟踪容器，静止判定将无法走满，补偿不再执行。
assert.ok(
  runTimelineStallScenario({ sentinelMissingEvery: 3, pageGrowthPx: 900 })
    .nudges > 3,
  'a sentinel that briefly disappears must not reset the stall timer'
);
assert.ok(
  runTimelineStallScenario({ sentinelMissingEvery: 2 }).nudges > 0,
  'pagination recovery must survive an intermittently missing sentinel'
);

// 底部卡片是「内容加载失败，请点击重试」时不存在加载动画节点，只按动画节点
// 检测会完全失明。必须识别失败卡片并触发其原生重试入口，恢复后继续续页。
const retryRecovered = runTimelineStallScenario({
  slotKind: 'action',
  pageGrowthPx: 900,
  retryRecoversAfter: 1,
});
assert.ok(
  retryRecovered.retryClicks >= 1,
  'a failed bottom card must be retried through its own native control'
);
assert.ok(
  retryRecovered.nudges > 0,
  'pagination must resume after the failed card recovers'
);
// 持续失败时重试次数必须有上限，不能无限点击。
const retryHopeless = runTimelineStallScenario({
  slotKind: 'action',
  pageGrowthPx: 0,
  ticks: 160,
});
assert.ok(
  retryHopeless.retryClicks > 0 && retryHopeless.retryClicks <= 4,
  'retrying a permanently failing card must be bounded'
);
assert.equal(
  runTimelineStallScenario({
    slotKind: 'action',
    pageGrowthPx: 0,
    ticks: 10,
    requestCompletionDelayTicks: 8,
  }).retryClicks,
  1,
  'an in-flight native retry must never be clicked a second time'
);
// 「没有更多」是原生的终止状态，既不补偿也不点击。
const endOfFeed = runTimelineStallScenario({ slotKind: 'end', ticks: 160 });
assert.equal(endOfFeed.nudges, 0);
assert.equal(endOfFeed.retryClicks, 0);

// 底部卡片文案的判定必须覆盖微博前端包中实际存在的原生文案。这些字符串取自
// 微博自身的构建产物，任一漏判都会让检测在对应状态下完全失明。
const slotTextClassifier = vm.createContext({});
vm.runInContext(
  `${sourceBetween(
    '  const TIMELINE_ACTION_TEXT_RE =',
    '  const TIMELINE_RETRY_BASE_MS ='
  )}
   globalThis.classifySlotText = (text) => {
     if (TIMELINE_END_TEXT_RE.test(text)) return 'end';
     if (TIMELINE_ACTION_TEXT_RE.test(text)) return 'action';
     return null;
   };`,
  slotTextClassifier
);
[
  ['内容加载失败，请点击重试', 'action'],
  ['点击重试', 'action'],
  ['点击加载更多', 'action'],
  ['没有更多内容了', 'end'],
].forEach(([text, expected]) => {
  assert.equal(
    slotTextClassifier.classifySlotText(text),
    expected,
    `native bottom-card text must be classified: ${text}`
  );
});
// 不属于任何一类的文案必须整拍跳过，绝不猜测。
['', '正在加载', '推荐阅读', '展开'].forEach((text) => {
  assert.equal(slotTextClassifier.classifySlotText(text), null);
});
// 关系列表页要还原成原生形态，遗留的哨兵隐藏标记必须一并清掉，
// 否则哨兵会被永久隐藏。
assert.match(
  sourceBetween(
    '  function restoreHiddenRelationshipItems(',
    '  function clearOwnBlockedContentHideState('
  ),
  /removeAttribute\(TIMELINE_LOADER_NUDGE_ATTR\)/
);
class FakeHideElement {
  constructor(kind, parentElement = null) {
    this.kind = kind;
    this.parentElement = parentElement;
    this.children = [];
    if (parentElement) parentElement.children.push(this);
  }

  get firstElementChild() {
    return this.children[0] || null;
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (
        (selector === 'comment-root' && current.kind === 'comment') ||
        (selector === 'virtual-view' && current.kind === 'view') ||
        (selector === 'virtual-item' &&
          (current.kind === 'shell' || current.kind === 'view'))
      ) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }
}
const hideShellContext = vm.createContext({
  DOM_COMMENT_ROOT_SELECTOR: 'comment-root',
  Element: FakeHideElement,
  VIRTUAL_ITEM_SELECTOR: 'virtual-item',
  VIRTUAL_VIEW_SELECTOR: 'virtual-view',
  document: { body: null, documentElement: null },
  isEligibleVirtualScrollerItem: () => true,
  isOverBroadHideRoot: () => false,
  isCommentCollectionRoot: () => false,
  isUserCardContentRoot: () => false,
  isInteractionContentRoot: () => false,
  shouldPromoteFeedShell: () => false,
});
vm.runInContext(
  `${hideShellSource}
  globalThis.testFindHideShell = findHideShell;`,
  hideShellContext
);
const fakeView = new FakeHideElement('view');
const fakeContentShell = new FakeHideElement('shell', fakeView);
const fakeArticle = new FakeHideElement('article', fakeContentShell);
assert.equal(
  hideShellContext.testFindHideShell(fakeArticle),
  fakeContentShell,
  'a blocked virtual-list post must hide the inner content shell'
);
assert.equal(
  hideShellContext.testFindHideShell(fakeView),
  fakeContentShell,
  'even a virtual-view root must resolve to its inner content shell'
);
const recycledShellSource = sourceBetween(
  '  function restoreRecycledVirtualContentShells(',
  '  function hideBlockedDOMPosts('
);
assert.match(recycledShellSource, /node\.matches\(VIRTUAL_VIEW_SELECTOR\)/);
assert.match(recycledShellSource, /contentRootOwnedByUID\(node, uid\)/);
assert.doesNotMatch(
  recycledShellSource,
  /isInsideCommentContentRoot\(node\)/
);
assert.match(
  recycledShellSource,
  /clearOwnBlockedContentHideState\(node\)/
);
const hideBlockedPostsSource = sourceBetween(
  '  function hideBlockedDOMPosts(',
  '  function queueBlockedDOMRefresh('
);
assert.ok(
  hideBlockedPostsSource.indexOf(
    'restoreRecycledVirtualContentShells(root)'
  ) <
    hideBlockedPostsSource.indexOf(
      'root.querySelectorAll(DOM_UID_SELECTOR)'
    ),
  'recycled virtual rows must be restored before scanning their current UID'
);
const runtimeApplySource = sourceBetween(
  '  function applyRuntimeConfig(',
  '  WB_INTERNAL.applyConfig ='
);
assert.ok(
  runtimeApplySource.indexOf('restoreBlockedContentHideState(document)') <
    runtimeApplySource.indexOf('hideBlockedDOMPosts(document)'),
  'scope changes must restore previously hidden roots before reapplying enabled filters'
);
assert.ok(
  runtimeApplySource.indexOf('restoreTimelineRecommendations(document)') <
    runtimeApplySource.indexOf('hideBlockedDOMPosts(document)'),
  'disabling timeline recommendations must restore hidden rows before filters are reapplied'
);
assert.doesNotMatch(
  source,
  /VIRTUAL_COMPACTION|COMPACTED_VIRTUAL|applyVirtual(?:Item|Wrapper)Compaction|clearVirtualCompactionState/
);
assert.equal((source.match(/new MutationObserver/g) || []).length, 2);
assert.equal((source.match(/history\.pushState\s*=/g) || []).length, 1);
assert.equal((source.match(/history\.replaceState\s*=/g) || []).length, 1);
assert.doesNotMatch(source, /queuedBlockedDOMRefreshTimer/);
assert.doesNotMatch(source, /queuedPanelRefreshTimer/);
assert.match(
  source,
  /const syncTabUI = \(\) => \{\s*if \(!timelineDefault\.value\) return;/
);

const forceLatestTabSource = sourceBetween(
  '  (function forceLatestTab() {',
  '  // === 本地屏蔽列表与新浪微博官方黑名单同步 ==='
);
// 微博不写 aria-selected，按它判断选中态等于"永远未选中"，脚本会每次都
// 点回「最新微博」，用户再也停不到「全部关注」。选中判定必须走共享实现。
assert.doesNotMatch(
  forceLatestTabSource,
  /getAttribute\('aria-selected'\)\s*!==\s*'true'/
);
assert.match(forceLatestTabSource, /!isTimelineTabActive\(btn\)/);
// 「全部关注」就是主页根路由，所以必须记住用户亲手点过的分栏，
// 否则路由回调会把人从「全部关注」立刻弹回「最新微博」。
assert.match(forceLatestTabSource, /userJustChoseAnotherTab\(\)/);
assert.match(forceLatestTabSource, /isTrustedUserEvent\(event\)/);
assert.match(
  forceLatestTabSource,
  /manualTabChoiceTitle !== LATEST_TITLE/
);
// 设置面板侧的分栏判定必须复用同一实现，不能再各留一份。
assert.match(
  sourceBetween(
    '  function findTimelineTab(title) {',
    '  function openNativeHomeTimeline('
  ),
  /WB_INTERNAL\.timelineTabs\.find\(title\)[\s\S]*?WB_INTERNAL\.timelineTabs\.isActive\(tab\)/
);

let mutationObserverInstances = 0;
const domContext = vm.createContext({
  WB_INTERNAL: Object.create(null),
  MutationObserver: class {
    constructor(callback) {
      this.callback = callback;
      mutationObserverInstances++;
    }
    observe() {}
    disconnect() {}
  },
  document: { documentElement: {} },
  history: {
    pushState() {
      return 'push-result';
    },
    replaceState() {
      return 'replace-result';
    },
  },
  window: { addEventListener() {} },
  console,
  setTimeout,
  clearTimeout,
});
vm.runInContext(
  `${sourceBetween(
    '  const WB_DOM_RUNTIME = (() => {',
    '  WB_INTERNAL.dom = WB_DOM_RUNTIME;'
  )}
  globalThis.testDOMRuntime = WB_DOM_RUNTIME;`,
  domContext
);
domContext.testDOMRuntime.subscribeMutations('first', () => {});
domContext.testDOMRuntime.subscribeMutations('second', () => {});
assert.equal(mutationObserverInstances, 1);
let routeNotifications = 0;
domContext.testDOMRuntime.subscribeRoute('test', () => {
  routeNotifications++;
});
assert.equal(domContext.history.pushState(), 'push-result');
assert.equal(domContext.history.replaceState(), 'replace-result');
assert.equal(routeNotifications, 2);
const addedParent = { nodeType: 1, parentElement: null };
const addedChild = { nodeType: 1, parentElement: addedParent };
const minimalRoots = domContext.testDOMRuntime.collectAddedRoots([
  { addedNodes: [addedParent, addedChild] },
]);
assert.equal(minimalRoots.length, 1);
assert.equal(minimalRoots[0], addedParent);

const configWrites = [];
const configStorage = new Map([
  [
    'cfg',
    JSON.stringify({
      hideAds: 'invalid',
      hideNavVideoRecommend: true,
    }),
  ],
]);
const configContext = vm.createContext({
  WB_CONFIG_KEY: 'cfg',
  WB_CONFIG_BACKUP_KEY: 'cfg_recovery_backup',
  WB_CONFIG_SCHEMA_VERSION: 1,
  WB_CONFIG_DEFAULTS: {
    hideAds: true,
    hideTimelineRecommendations: true,
    hideNavVideo: false,
    hideNavRecommend: false,
  },
  WB_CONFIG_BOOLEAN_KEYS: [
    'hideAds',
    'hideTimelineRecommendations',
    'hideNavVideo',
    'hideNavRecommend',
  ],
  WB_RUNTIME_METRICS: {
    config: {
      schemaVersion: 1,
      migrations: 0,
      recoveries: 0,
      futureSchema: null,
    },
  },
  wbConfigCacheSignature: null,
  wbConfigCacheValue: null,
  GM_getValue: (key, fallback) =>
    configStorage.has(key) ? configStorage.get(key) : fallback,
  GM_setValue: (key, value) => {
    configStorage.set(key, value);
    configWrites.push([key, value]);
  },
});
vm.runInContext(
  sourceBetween(
    '  function isUnsafeObjectKey(key) {',
    '  WB_INTERNAL.config ='
  ),
  configContext
);
vm.runInContext(
  'globalThis.migratedConfig = readStoredConfig();',
  configContext
);
const migratedConfig = JSON.parse(
  JSON.stringify(configContext.migratedConfig)
);
assert.equal(migratedConfig.schemaVersion, 1);
assert.equal(migratedConfig.hideAds, true);
assert.equal(migratedConfig.hideTimelineRecommendations, true);
assert.equal(migratedConfig.hideNavVideo, true);
assert.equal(migratedConfig.hideNavRecommend, true);
assert.equal('hideNavVideoRecommend' in migratedConfig, false);
assert.equal(configWrites.some(([key]) => key === 'cfg'), true);
const writesAfterMigration = configWrites.length;
vm.runInContext('readStoredConfig();', configContext);
assert.equal(configWrites.length, writesAfterMigration);

configStorage.set('cfg', '{broken-json');
vm.runInContext(
  'globalThis.recoveredConfig = readStoredConfig();',
  configContext
);
assert.equal(configContext.recoveredConfig.schemaVersion, 1);
assert.equal(configStorage.has('cfg_recovery_backup'), true);
assert.equal(configContext.WB_RUNTIME_METRICS.config.recoveries, 1);

configStorage.set(
  'cfg',
  JSON.stringify({ schemaVersion: 99, hideAds: false, futureOption: 'kept' })
);
const writesBeforeFutureRead = configWrites.length;
vm.runInContext(
  'globalThis.futureConfig = readStoredConfig();',
  configContext
);
assert.equal(configContext.futureConfig.schemaVersion, 99);
assert.equal(configContext.futureConfig.futureOption, 'kept');
assert.equal(configWrites.length, writesBeforeFutureRead);

configStorage.set(
  'cfg',
  '{"schemaVersion":1,"hideAds":false,"__proto__":{"polluted":true},"constructor":{"polluted":true}}'
);
vm.runInContext(
  'globalThis.safeConfig = readStoredConfig();',
  configContext
);
assert.equal(configContext.safeConfig.hideAds, false);
assert.equal(Object.getPrototypeOf(configContext.safeConfig).polluted, undefined);
assert.equal(
  Object.prototype.hasOwnProperty.call(configContext.safeConfig, '__proto__'),
  false
);
assert.equal(
  Object.prototype.hasOwnProperty.call(configContext.safeConfig, 'constructor'),
  false
);

const relaySource = sourceBetween(
  '  function requestOfficialBlockViaMainHost(uid) {',
  '  async function processOfficialBlockRelay() {'
);
const relayCloseSource = sourceBetween(
  '  function scheduleOfficialBlockRelayClose(',
  '  function requestOfficialBlockViaMainHost('
);
assert.match(
  relayCloseSource,
  /clearOfficialBlockRelayState\(requestId\)/
);
assert.match(relaySource, /_GM_addValueChangeListener/);
assert.match(relaySource, /_GM_removeValueChangeListener/);
assert.match(relaySource, /setTimeout\(\(\) => \{/);
assert.doesNotMatch(relaySource, /\}, 200\)/);

const saveHandlerSource = sourceBetween(
  "      panel.querySelector('#wbset-save').addEventListener",
  "      panel.querySelector('#wbset-cancel').addEventListener"
);
assert.doesNotMatch(saveHandlerSource, /location\.reload\s*\(/);
assert.match(saveHandlerSource, /WB_INTERNAL\.applyConfig\?\.\(CFG\)/);
assert.match(saveHandlerSource, /applyPanelSettingsNow\(\)/);
assert.match(saveHandlerSource, /syncLauncherButton\(\)/);
assert.match(saveHandlerSource, /closePanel\(\{ reset: false \}\)/);
assert.match(saveHandlerSource, /reconcileHomeTimelineSetting\(/);
assert.equal((source.match(/location\.reload\s*\(/g) || []).length, 1);
// 侧栏恢复必须完全交回微博原生布局：脚本不得再保留任何自有的轨道占位、
// sticky top 覆盖或热搜专用的恢复状态开关。
assert.doesNotMatch(
  source,
  /HOT_SEARCH_SIDEBAR_RESTORE_SPACING_ATTR|HOT_SEARCH_SIDEBAR_AUTO_HEIGHT_ATTR|data-__wb_hot_search_sidebar_(?:restore_spacing|native_bottom_gap|auto_height)/
);
assert.doesNotMatch(
  source,
  /--wb-pynseq-sidebar-restore-space|--wb-pynseq-sidebar-sticky-top|hotSearchSidebarRestoreSpacingActive|restoredHotSearch/
);
assert.doesNotMatch(
  source,
  /normalizeFirstVisibleSidebarGaps|alignFirstVisibleSidebarToComposer|data-__wb_sidebar_anchor_aligned|data-__wb_original_margin_top/
);
assert.doesNotMatch(
  sourceBetween(
    '  function hideSearchRelatedUsersPanel(',
    '  // ---- Settings UI ----'
  ),
  /(?:panel|side|target)\.style\.(?:setProperty|removeProperty)|\.style\.(?:marginTop|marginBottom|transform)\s*=/
);
const settingsModuleSource = sourceBetween(
  '/* === Settings v5: standard navigation + UID management === */',
  '/* === /Settings v5 === */'
);
assert.doesNotMatch(
  settingsModuleSource,
  /\binjectCSSWhenReady\s*\(/,
  'Settings must not call helpers outside its IIFE before launcher initialization'
);
assert.doesNotMatch(
  sourceBetween('  function ensureStyles() {', '  function githubIconMarkup() {'),
  /height:\s*auto\s*!important/
);
// 侧栏隐藏/恢复只保留标记属性配合样式表，样式里不得再出现脚本自造的占位。
assert.doesNotMatch(
  sourceBetween('  function ensureStyles() {', '  function githubIconMarkup() {'),
  /\.wbpro-side-copy::before|--wb-pynseq-sidebar/
);

// 微博右侧轨道由微博自身的 MutationObserver（childList/characterData/subtree）
// 重新计算高度，属性变化不会触发它。脚本改变卡片可见性后必须制造一次真实的
// childList 变化，把重排交回原生逻辑，而不是自行改写 top / 占位高度。
const sidebarVisibilitySource = sourceBetween(
  '  function markPanelHidden(panel) {',
  '  function hideSearchRelatedUsersPanel('
);
assert.match(sidebarVisibilitySource, /sidebarVisibilityDirty = true/);
assert.match(
  sidebarVisibilitySource,
  /function nudgeNativeSidebarObserver\(\)[\s\S]*?document\.createComment\('wb-pynseq-relayout'\)/
);
assert.match(
  sidebarVisibilitySource,
  /#__sidebar,[\s\S]*?\.rightSide,[\s\S]*?\.wbpro-side-main/
);
assert.match(
  sidebarVisibilitySource,
  /root\.appendChild\(marker\);\s*\n\s*marker\.remove\(\);/
);
assert.match(
  sidebarVisibilitySource,
  /function flushSidebarVisibilityChanges\(\)[\s\S]*?if \(!sidebarVisibilityDirty\) return;[\s\S]*?requestNativeSidebarRelayout\(\)/
);
assert.doesNotMatch(
  sidebarVisibilitySource,
  /dispatchEvent|\.style\.(?:setProperty|removeProperty|top|height)/
);
assert.match(
  sourceBetween('  function hidePanels(', '  function restoreManagedPanels()'),
  /hideSearchHotBand\(root\);\s*\n\s*markSidebarLeadGap\(\);\s*\n\s*flushSidebarVisibilityChanges\(\);/
);

// 微博把侧栏首个模块渲染成没有上外边距的卡片。脚本隐藏靠前的模块后，后一个
// 模块的上外边距会向上塌陷成整条轨道的前导空白，首个可见模块比左侧主列低
// 几个像素。只在确实由脚本隐藏时清零那一段塌陷出来的外边距。
const leadGapSource = sourceBetween(
  '  function markSidebarLeadGap() {',
  '  // 微博右侧轨道的高度由微博自身的 MutationObserver 负责'
);
assert.match(leadGapSource, /querySelectorAll\('\.wbpro-side-main'\)/);
assert.match(leadGapSource, /if \(firstVisibleIndex <= 0\) return;/);
assert.match(leadGapSource, /if \(!hiddenByUserscript\) return;/);
assert.match(
  leadGapSource,
  /borderTopWidth[\s\S]*?paddingTop[\s\S]*?\)\s*\{\s*\n\s*return;/,
  'must stop walking once the margin can no longer collapse upward'
);
assert.match(leadGapSource, /cur = cur\.firstElementChild;/);
assert.match(leadGapSource, /setAttribute\(SIDEBAR_LEAD_GAP_ATTR, '1'\)/);
assert.match(leadGapSource, /removeAttribute\(SIDEBAR_LEAD_GAP_ATTR\)/);
assert.doesNotMatch(leadGapSource, /\.style\./);
assert.match(
  sourceBetween('  function ensureStyles() {', '  function githubIconMarkup() {'),
  /\[\$\{SIDEBAR_LEAD_GAP_ATTR\}="1"\]\{margin-top:0!important\}/
);

// 搜索页右栏 #pl_right_side 是 #hot-band-container 的直接父节点，父级选择器
// 会连带隐藏创作者中心和帮助中心整条右栏。
const runtimeCSSRules = sourceBetween(
  '  function generateCSSRules() {',
  '  function injectCSSWhenReady('
);
assert.doesNotMatch(runtimeCSSRules, /div:has\(>\s*[.#]hot-band/);
// 微博构建产物里的哈希类名会随版本变化，不得写死。
assert.doesNotMatch(runtimeCSSRules, /Links_box_[A-Za-z0-9]+/);
assert.match(runtimeCSSRules, /div\[role="link"\]\[title="全部关注"\]/);
const applyPanelSettingsSource = sourceBetween(
  '  function applyPanelSettingsNow() {',
  '  function queuePanelRefresh('
);
assert.match(
  applyPanelSettingsSource,
  /restoreManagedPanels\(\);[\s\S]*?hidePanels\(document\);/
);
// 恢复与隐藏都必须经过带脏标记的统一入口，避免漏掉原生重排通知。
assert.match(
  sourceBetween('  function restoreManagedPanels()', '  function applyPanelSettingsNow'),
  /unmarkPanelHidden\(panel\)/
);

// 虚拟列表里的广告必须与被屏蔽微博使用同一套正整数测量壳，否则
// DynamicScroller 会忽略 0 高度并沿用旧行高，留下大片空白。
const runtimeCSSSource = sourceBetween(
  '  function generateCSSRules() {',
  '  function injectCSSWhenReady('
);
assert.match(
  runtimeCSSSource,
  /vue-recycle-scroller__item-view"\] > \$\{HIDDEN_AD_SELECTOR\}/
);
assert.match(
  runtimeCSSSource,
  /vue-recycle-scroller__item-view"\] > \$\{HIDDEN_TIMELINE_RECOMMENDATION_SELECTOR\}/
);
const timelineRecommendationSource = sourceBetween(
  '  function hasTimelineRecommendationLabel(',
  '  function hideBlockedSearchResultCards('
);
assert.match(timelineRecommendationSource, /article\.firstElementChild/);
assert.match(timelineRecommendationSource, /child\.querySelector\('header'\)/);
assert.match(
  timelineRecommendationSource,
  /getOwnDOMText\(label\) === TIMELINE_RECOMMENDATION_LABEL/
);
assert.doesNotMatch(timelineRecommendationSource, /_title_[A-Za-z0-9]+/);
assert.match(
  timelineRecommendationSource,
  /target\.setAttribute\(HIDDEN_TIMELINE_RECOMMENDATION_ATTR, '1'\)[\s\S]*?requestNativeVirtualItemRemeasure\(target\)/
);
assert.match(
  timelineRecommendationSource,
  /node\.removeAttribute\(HIDDEN_TIMELINE_RECOMMENDATION_ATTR\)[\s\S]*?requestNativeVirtualItemRemeasure\(node\)/
);
// 回收壳上的广告标记必须重新验证，否则复用后的正常微博会继续被隐藏。
const recycledAdSource = sourceBetween(
  '  function restoreRecycledVirtualAdShells(scope) {',
  '  function restoreRecycledVirtualContentShells('
);
assert.match(recycledAdSource, /node\.closest\(VIRTUAL_VIEW_SELECTOR\)/);
assert.match(
  recycledAdSource,
  /if \(!stillLooksLikeRecognizedAd\(node\)\)[\s\S]*?node\.removeAttribute\(HIDDEN_AD_ATTR\)/
);
// 摘掉广告标记后必须补一次重测，否则 DynamicScroller 会继续沿用隐藏期间的
// 2px 行高，复用回来的正常微博被压成一条缝。
assert.match(
  recycledAdSource,
  /node\.removeAttribute\(HIDDEN_AD_ATTR\)[\s\S]*?requestNativeVirtualItemRemeasure\(node\)/
);
assert.match(
  sourceBetween(
    '  function restoreRecycledVirtualContentShells(',
    '  function hideBlockedDOMPosts('
  ),
  /restoreRecycledVirtualAdShells\(scope\);/
);
const recycledTimelineRecommendationSource = sourceBetween(
  '  function restoreRecycledVirtualTimelineRecommendationShells(scope) {',
  '  function restoreRecycledVirtualContentShells('
);
assert.match(
  recycledTimelineRecommendationSource,
  /!stillLooksLikeTimelineRecommendation\(node\)[\s\S]*?node\.removeAttribute\(HIDDEN_TIMELINE_RECOMMENDATION_ATTR\)[\s\S]*?requestNativeVirtualItemRemeasure\(node\)/
);
assert.match(
  sourceBetween(
    '  function restoreRecycledVirtualContentShells(',
    '  function hideBlockedDOMPosts('
  ),
  /restoreRecycledVirtualTimelineRecommendationShells\(scope\);/
);

class FakeTimelineRecommendationElement {
  constructor(tagName, text = '', parentElement = null) {
    this.tagName = String(tagName || '').toUpperCase();
    this.parentElement = parentElement;
    this.children = [];
    this.childNodes = text
      ? [{ nodeType: 3, textContent: text }]
      : [];
    this.attributes = new Map();
    if (parentElement) parentElement.children.push(this);
  }

  get firstElementChild() {
    return this.children[0] || null;
  }

  matches(selector) {
    return String(selector)
      .split(',')
      .map((part) => part.trim())
      .some((part) => {
        if (part === 'article') return this.tagName === 'ARTICLE';
        if (part === 'header') return this.tagName === 'HEADER';
        if (part === 'span') return this.tagName === 'SPAN';
        if (part === 'div') return this.tagName === 'DIV';
        if (part === 'virtual-view') return this.tagName === 'VIRTUAL-VIEW';
        if (part === '[data-rec]') return this.attributes.has('data-rec');
        return false;
      });
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (current.matches(selector)) return current;
      current = current.parentElement;
    }
    return null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      node.children.forEach((child) => {
        if (child.matches(selector)) matches.push(child);
        visit(child);
      });
    };
    visit(this);
    return matches;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }
}

class FakeTimelineRecommendationDocument {
  constructor(children) {
    this.children = children;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      if (node.matches(selector)) matches.push(node);
      node.children.forEach(visit);
    };
    this.children.forEach(visit);
    return matches;
  }
}

const recommendationView = new FakeTimelineRecommendationElement('virtual-view');
const recommendationShell = new FakeTimelineRecommendationElement(
  'div',
  '',
  recommendationView
);
const recommendationArticle = new FakeTimelineRecommendationElement(
  'article',
  '',
  recommendationShell
);
const recommendationLead = new FakeTimelineRecommendationElement(
  'div',
  '',
  recommendationArticle
);
const recommendationLabel = new FakeTimelineRecommendationElement(
  'span',
  '你可能感兴趣的内容',
  recommendationLead
);
const recommendationBody = new FakeTimelineRecommendationElement(
  'div',
  '',
  recommendationArticle
);
new FakeTimelineRecommendationElement('header', '', recommendationBody);

const normalView = new FakeTimelineRecommendationElement('virtual-view');
const normalShell = new FakeTimelineRecommendationElement('div', '', normalView);
const normalArticle = new FakeTimelineRecommendationElement(
  'article',
  '',
  normalShell
);
const normalBody = new FakeTimelineRecommendationElement('div', '', normalArticle);
new FakeTimelineRecommendationElement('header', '', normalBody);
new FakeTimelineRecommendationElement(
  'span',
  '你可能感兴趣的内容',
  normalBody
);
new FakeTimelineRecommendationElement('div', '', normalArticle);

const recommendationDocument = new FakeTimelineRecommendationDocument([
  recommendationView,
  normalView,
]);
const recommendationRemeasures = [];
const recommendationContext = vm.createContext({
  CONTENT_FILTER_CFG: { hideTimelineRecommendations: true },
  Element: FakeTimelineRecommendationElement,
  HIDDEN_TIMELINE_RECOMMENDATION_ATTR: 'data-rec',
  HIDDEN_TIMELINE_RECOMMENDATION_SELECTOR: '[data-rec]',
  Node: { TEXT_NODE: 3 },
  TIMELINE_RECOMMENDATION_LABEL: '你可能感兴趣的内容',
  VIRTUAL_VIEW_SELECTOR: 'virtual-view',
  document: recommendationDocument,
  findHideShell: (article) => article.parentElement,
  isRelationshipListPage: () => false,
  pauseVideosIn: () => {},
  requestNativeVirtualItemRemeasure: (node) =>
    recommendationRemeasures.push(node),
});
vm.runInContext(
  `${sourceBetween(
    '  function normDOMText(s) {',
    '  function isRelationshipListPage() {'
  )}
  ${sourceBetween(
    '  function getOwnDOMText(el) {',
    '  const BAD_USER_NAME_TEXT ='
  )}
  ${timelineRecommendationSource}
  ${sourceBetween(
    '  function stillLooksLikeTimelineRecommendation(node) {',
    '  function restoreRecycledVirtualAdShells(scope) {'
  )}
  ${recycledTimelineRecommendationSource}
  globalThis.testRecommendationAPI = {
    findTimelineRecommendationArticles,
    hideTimelineRecommendations,
    restoreTimelineRecommendations,
    restoreRecycledVirtualTimelineRecommendationShells,
  };`,
  recommendationContext
);
const recommendationAPI = recommendationContext.testRecommendationAPI;
assert.equal(
  recommendationAPI.findTimelineRecommendationArticles(recommendationDocument)
    .length,
  1,
  'only a native leading recommendation title may classify a timeline article'
);
assert.equal(recommendationAPI.hideTimelineRecommendations(recommendationDocument), true);
assert.equal(recommendationShell.hasAttribute('data-rec'), true);
assert.equal(normalShell.hasAttribute('data-rec'), false);
assert.equal(recommendationRemeasures.at(-1), recommendationShell);
recommendationContext.CONTENT_FILTER_CFG.hideTimelineRecommendations = false;
recommendationAPI.restoreTimelineRecommendations(recommendationDocument);
assert.equal(recommendationShell.hasAttribute('data-rec'), false);
assert.equal(recommendationRemeasures.at(-1), recommendationShell);
recommendationContext.CONTENT_FILTER_CFG.hideTimelineRecommendations = true;
recommendationAPI.hideTimelineRecommendations(recommendationDocument);
recommendationLabel.childNodes[0].textContent = '普通微博';
recommendationAPI.restoreRecycledVirtualTimelineRecommendationShells(
  recommendationShell
);
assert.equal(
  recommendationShell.hasAttribute('data-rec'),
  false,
  'a recycled virtual shell must recover when it no longer contains the native recommendation title'
);
const nativeHomeSource = sourceBetween(
  '  function openNativeHomeTimeline() {',
  '  function openLatestHomeTimeline() {'
);
assert.match(nativeHomeSource, /const allFollowingTab = findTimelineTab\(/);
assert.match(nativeHomeSource, /allFollowingTab\.click\(\)/);
assert.match(nativeHomeSource, /settings-native-home-fallback/);
const latestHomeSource = sourceBetween(
  '  function openLatestHomeTimeline() {',
  '  function reconcileHomeTimelineSetting('
);
assert.match(latestHomeSource, /latestTab\.click\(\)/);
assert.match(latestHomeSource, /settings-latest-home-fallback/);
const reconcileTimelineSource = sourceBetween(
  '  function reconcileHomeTimelineSetting(',
  '  function openOnboarding('
);
assert.match(reconcileTimelineSource, /openLatestHomeTimeline\(\)/);
assert.match(reconcileTimelineSource, /openNativeHomeTimeline\(\)/);
// 微博的分栏节点上没有 aria-selected / aria-current，选中态只体现为带构建
// 哈希的类名（例如 _cur_118ye_33）。替身必须还原这一点，否则"永远判成未
// 选中、于是反复点回最新微博"的回归会再次溜过去。
const SELECTED_TAB_CLASS = '_cur_118ye_33';
class FakeTimelineTab {
  constructor(title) {
    this.title = title;
    this.clicks = 0;
    this.classList = ['woo-box-flex', 'woo-box-alignCenter', '_main_118ye_2'];
  }
  get selected() {
    return this.classList.includes(SELECTED_TAB_CLASS);
  }
  set selected(value) {
    const index = this.classList.indexOf(SELECTED_TAB_CLASS);
    if (value && index === -1) this.classList.push(SELECTED_TAB_CLASS);
    if (!value && index !== -1) this.classList.splice(index, 1);
  }
  click() {
    this.clicks++;
    this.selected = true;
  }
  getAttribute(name) {
    if (name === 'title') return this.title;
    return null;
  }
}
const allFollowingTimelineTab = new FakeTimelineTab('全部关注');
const latestTimelineTab = new FakeTimelineTab('最新微博');
const fakeTimelineDocument = {
  querySelector(selector) {
    if (selector.includes('全部关注')) return allFollowingTimelineTab;
    if (selector.includes('最新微博')) return latestTimelineTab;
    return null;
  },
};
// 用脚本里真正的实现构造 WB_INTERNAL.timelineTabs，保证设置面板与默认分栏
// 逻辑共用同一套判定。
const timelineTabHelperContext = vm.createContext({
  HTMLElement: FakeTimelineTab,
  document: fakeTimelineDocument,
});
vm.runInContext(
  `${sourceBetween(
    '  function findTimelineTabElement(title) {',
    '  WB_INTERNAL.timelineTabs = Object.freeze({'
  )}
  globalThis.tabsAPI = { find: findTimelineTabElement, isActive: isTimelineTabActive };`,
  timelineTabHelperContext
);
const timelineTabsAPI = timelineTabHelperContext.tabsAPI;
assert.equal(timelineTabsAPI.isActive(latestTimelineTab), false);
latestTimelineTab.selected = true;
assert.equal(
  timelineTabsAPI.isActive(latestTimelineTab),
  true,
  'selection must be detected from the hashed _cur_ class, not aria-selected'
);
latestTimelineTab.selected = false;
assert.equal(timelineTabsAPI.isActive(null), false);
assert.equal(timelineTabsAPI.find('最新微博'), latestTimelineTab);
const timelineAssignments = [];
const timelineContext = vm.createContext({
  WB_INTERNAL: { dom: { schedule() {} }, timelineTabs: timelineTabsAPI },
  HTMLElement: FakeTimelineTab,
  document: fakeTimelineDocument,
  location: {
    hostname: 'weibo.com',
    pathname: '/',
    origin: 'https://weibo.com',
    assign(url) {
      timelineAssignments.push(url);
    },
  },
});
vm.runInContext(
  `${sourceBetween(
    '  function isWeiboHomeTimelineRoute() {',
    '  function openOnboarding('
  )}
  globalThis.reconcileTimeline = reconcileHomeTimelineSetting;`,
  timelineContext
);
assert.equal(timelineContext.reconcileTimeline(false, true), true);
assert.equal(latestTimelineTab.clicks, 1);
assert.equal(allFollowingTimelineTab.clicks, 0);
allFollowingTimelineTab.selected = false;
assert.equal(timelineContext.reconcileTimeline(true, false), true);
assert.equal(allFollowingTimelineTab.clicks, 1);
assert.equal(timelineAssignments.length, 0);
const remoteConfigSource = sourceBetween(
  "  if (typeof GM_addValueChangeListener === 'function') {",
  "  if (document.readyState === 'loading')"
);
assert.match(remoteConfigSource, /WB_INTERNAL\.applyConfig\?\.\(CFG\)/);
assert.match(remoteConfigSource, /reconcileHomeTimelineSetting\(/);
assert.match(remoteConfigSource, /syncCreatedSettingsPanelConfigUI\(\)/);

const hotBandSource = sourceBetween(
  '  function hideSearchHotBand(root = document) {',
  '  if (document.readyState ==='
);
assert.doesNotMatch(hotBandSource, /target\.remove\s*\(/);
assert.match(hotBandSource, /markPanelHidden\((?:side|target)\)/);
assert.match(source, /const PANEL_HIDDEN_ATTR = 'data-__wb_hidden_by_userscript'/);

// ═══ 网络层规矩 v1 —— 已作废，保留作为记录，后续代码不要参考 ═══════════════
//
// 原文四条断言：
//     assert.doesNotMatch(source, /ENABLE_PAGE_NETWORK_INTERCEPTION/);
//     assert.doesNotMatch(source, /window\.fetch\s*=/);
//     assert.doesNotMatch(source, /XMLHttpRequest\.prototype\.(?:open|send|abort)\s*=/);
//     assert.doesNotMatch(source, /window\.WebSocket\s*=/);
//
// 引入背景：脚本曾在接口层把广告和黑名单条目从 statuses 数组中删除后再交给
// 页面，导致「全部关注」等主页时间线持续显示加载动画。当时的处理是删除整个
// 网络拦截层，并以上述四条断言禁止其恢复。
//
// 替换原因：
//
// 1. 约束范围与故障成因不一致。该故障由改写回包内容引起：分页器需要未经删减的
//    statuses 与游标，整页被过滤为空后原生组件回退旧缓存并保持加载状态。上述
//    断言约束的是安装钩子这一机制。
//
// 2. 「破坏微博新版 Axios 对原生对象身份与生命周期的依赖」这一成因缺少对应的
//    观测记录。只克隆响应、不改写返回内容的 fetch/XHR 观察层在「全部关注」与
//    「最新微博」上接收 10 次时间线回包、覆盖 62 条微博、四轮连续滚动期间，
//    分页持续产出新内容。
//
// 3. 断言可被等价写法绕过：`window["fetch"] = ...`、`Object.defineProperty(
//    window, 'fetch', ...)`、`const w = window; w.fetch = ...` 均不匹配。其约束
//    的是一种书写形式。
//
// 4. 被禁用能力的调用点移除后，filterContentTree、transformContentResponseData、
//    isFilterableContentURL 等函数连同单元测试保留在仓库中，运行时无调用点。
//    该状态下首页时间线中约 14% 的微博带有接口下发的 isAd 标记，均未被隐藏。
//    这部分代码已在 2.4.0 删除。
//
// ═══ 网络层规矩 v2 —— 现行 ═══════════════════════════════════════════════
//
// 不变量：脚本可以读取网络响应，不得改变页面收到的内容与请求生命周期。
//
// 允许只读观察，即克隆响应副本自行解析，用于识别广告与推荐内容。以下每条断言
// 对应一种已知的故障形式。
//
// 覆盖范围：源码正则只匹配显式写出的形式，不覆盖等价改写。涉及网络层的改动，
// 发布前需在「全部关注」与「最新微博」各连续翻页十次，确认分页持续产出新内容
// 且不出现加载停滞。

// 故障形式一：将自行构造的响应交回页面。
assert.doesNotMatch(
  source,
  /new\s+Response\s*\(/,
  '不得把自行构造的 Response 交给页面，分页器需要原样的响应'
);
assert.doesNotMatch(source, /EMPTY_UNREAD_TIMELINE_RESPONSE/);
assert.doesNotMatch(
  source,
  /timelineDefault\.value\s*&&\s*request\.unreadTimeline/
);

// 故障形式二：改写 XHR 的响应读取属性，等价于改写内容。
assert.doesNotMatch(
  source,
  /defineProperty\s*\([^;]*?\b(?:responseText|responseXML|responseType)\b/,
  '不得改写 XHR 的响应读取属性'
);

// 故障形式三：接管请求生命周期。abort 决定请求何时终止，WebSocket 决定长连接
// 是否存在，替换后页面的重试与续页逻辑不再由微博自身控制。
assert.doesNotMatch(source, /XMLHttpRequest\.prototype\.abort\s*=/);
assert.doesNotMatch(source, /window\.WebSocket\s*=/);

// 故障形式四：包装 fetch 时消费原始响应体。响应体只能读取一次，观察层必须
// 通过 clone() 读取副本。
assert.match(
  source,
  /window\.fetch\s*=\s*function\s+wbObservedFetch/,
  '观察层必须使用具名包装体，便于在调用栈中识别'
);
assert.match(
  source,
  /\.clone\(\)\s*\n?\s*\.text\(\)/,
  '观察层必须通过 clone().text() 读取响应副本'
);

// 故障形式五：观察层改写请求或响应。包装体必须原样返回原生结果。
const contentObserverSource = sourceBetween(
  '  (function installContentResponseObserver() {',
  '  const DOM_UID_SELECTOR = ['
);
assert.match(contentObserverSource, /const result = Reflect\.apply\(nativeFetch, this, args\)/);
assert.match(contentObserverSource, /return result;/);
assert.match(contentObserverSource, /return Reflect\.apply\(nativeOpen, this, arguments\)/);
assert.match(contentObserverSource, /return Reflect\.apply\(nativeSend, this, arguments\)/);
assert.doesNotMatch(contentObserverSource, /args\[\d\]\s*=/);

// ═══ 广告识别：接口回包登记 + DOM 侧按微博 id 隐藏 ════════════════════════

const adRuntime = {
  refreshCalls: 0,
};
const adContext = vm.createContext({
  CONTENT_FILTER_CFG: { hideAds: true },
  URL,
  console,
  document: {},
  location: { origin: 'https://weibo.com' },
  queueBlockedDOMRefresh: () => {
    adRuntime.refreshCalls += 1;
  },
});
vm.runInContext(
  `${sourceBetween(
    '  function isUnsafeObjectKey(key) {',
    '  function copySafeEnumerableData(source) {'
  )}
  ${sourceBetween(
    '  function hasExplicitAdMarker(obj) {',
    '  (function installContentResponseObserver() {'
  )}
  globalThis.adAPI = {
    hasExplicitAdMarker,
    rememberAdPostID,
    isKnownAdPostID,
    collectAdPostIDs,
    observeContentResponse,
    AD_POST_IDS,
    AD_POST_ID_LIMIT,
  };`,
  adContext
);
const { adAPI } = adContext;

// 接口对广告微博下发三种标记，任意一种成立即判定为广告。
assert.equal(adAPI.hasExplicitAdMarker({ isAd: true }), true);
assert.equal(adAPI.hasExplicitAdMarker({ readtimetype: 'adMblog' }), true);
assert.equal(
  adAPI.hasExplicitAdMarker({ mark: '999_reallog_mark_ad:999|WeiboADNatural' }),
  true
);
// 普通微博的阅读类型与埋点串不得被误判。
assert.equal(adAPI.hasExplicitAdMarker({ readtimetype: 'mblog' }), false);
assert.equal(adAPI.hasExplicitAdMarker({ mark: 'benchmark_adjacent' }), false);
assert.equal(adAPI.hasExplicitAdMarker({}), false);

// 回包解析只登记带广告标记的条目，转发内层与外层分别判定。
adAPI.AD_POST_IDS.clear();
adAPI.collectAdPostIDs({
  statuses: [
    { mblogid: 'AdOne11', isAd: true },
    { mblogid: 'Normal11' },
    { mblogid: 'AdTwo22', readtimetype: 'adMblog' },
    {
      mblogid: 'Outer33',
      retweeted_status: { mblogid: 'InnerAd4', isAd: true },
    },
  ],
});
assert.equal(adAPI.isKnownAdPostID('AdOne11'), true);
assert.equal(adAPI.isKnownAdPostID('AdTwo22'), true);
assert.equal(adAPI.isKnownAdPostID('InnerAd4'), true);
assert.equal(adAPI.isKnownAdPostID('Normal11'), false);
assert.equal(adAPI.isKnownAdPostID('Outer33'), false);
assert.equal(adAPI.isKnownAdPostID(''), false);

// 时间线可无限翻页，登记表必须有界并淘汰最早写入的条目。
adAPI.AD_POST_IDS.clear();
for (let i = 0; i < adAPI.AD_POST_ID_LIMIT + 5; i += 1) {
  adAPI.rememberAdPostID(`id${i}`);
}
assert.equal(adAPI.AD_POST_IDS.size, adAPI.AD_POST_ID_LIMIT);
assert.equal(adAPI.isKnownAdPostID('id0'), false);
assert.equal(adAPI.isKnownAdPostID('id4'), false);
assert.equal(
  adAPI.isKnownAdPostID(`id${adAPI.AD_POST_ID_LIMIT + 4}`),
  true
);

// 观察层只解析第一方微博域名下的 feed 与 statuses 接口。
const adPayload = JSON.stringify({
  statuses: [{ mblogid: 'ScopeAd1', isAd: true }],
});
[
  ['https://weibo.com/ajax/feed/friendstimeline?count=25', true],
  ['https://weibo.com/ajax/statuses/mymblog?uid=1', true],
  ['https://s.weibo.com/ajax/statuses/search', true],
  ['https://weibo.com/ajax/log/action', false],
  ['https://weibo.com/ajax/profile/sidedetail', false],
  ['https://weibo.com/ajax/side/cards', false],
  ['https://example.com/ajax/feed/friendstimeline', false],
  ['https://weibo.com/anything?next=/ajax/feed/friendstimeline', false],
].forEach(([url, shouldRegister]) => {
  adAPI.AD_POST_IDS.clear();
  adAPI.observeContentResponse(url, adPayload);
  assert.equal(
    adAPI.isKnownAdPostID('ScopeAd1'),
    shouldRegister,
    `${url} 的观察范围判定不符合预期`
  );
});

// 回包可能晚于卡片渲染到达，登记表新增条目时必须补一次 DOM 扫描。
adAPI.AD_POST_IDS.clear();
adRuntime.refreshCalls = 0;
adAPI.observeContentResponse(
  'https://weibo.com/ajax/feed/friendstimeline',
  adPayload
);
assert.equal(adRuntime.refreshCalls, 1);
// 同一批回包重复到达时不再重复触发扫描。
adAPI.observeContentResponse(
  'https://weibo.com/ajax/feed/friendstimeline',
  adPayload
);
assert.equal(adRuntime.refreshCalls, 1);

// 非 JSON 响应与关闭开关时不做任何处理。
adAPI.AD_POST_IDS.clear();
adRuntime.refreshCalls = 0;
adAPI.observeContentResponse(
  'https://weibo.com/ajax/feed/friendstimeline',
  '<html>not json</html>'
);
assert.equal(adRuntime.refreshCalls, 0);
adContext.CONTENT_FILTER_CFG.hideAds = false;
adAPI.observeContentResponse(
  'https://weibo.com/ajax/feed/friendstimeline',
  adPayload
);
assert.equal(adAPI.isKnownAdPostID('ScopeAd1'), false);
adContext.CONTENT_FILTER_CFG.hideAds = true;

// 卡片上的条目标识取自正文链接 /{uid}/{mblogid}，头像等用户链接不得命中。
class FakeAdPostElement {
  constructor(hrefs) {
    this.hrefs = hrefs;
  }

  querySelectorAll() {
    return this.hrefs.map((href) => ({ getAttribute: () => href }));
  }
}
const permalinkContext = vm.createContext({
  Element: FakeAdPostElement,
});
vm.runInContext(
  `${sourceBetween(
    '  const AD_POST_ID_LIMIT = 3000;',
    '  function collectAdPostIDs('
  )}
  ${sourceBetween(
    '  // 微博卡片内的正文链接形如 /{uid}/{mblogid}',
    '  function hideRecognizedAds(root = document) {'
  )}
  rememberAdPostID('Perma123');
  globalThis.permalinkAPI = { extractPostIDFromRoot, isRegisteredAdPostRoot };`,
  permalinkContext
);
const { permalinkAPI } = permalinkContext;
assert.equal(
  permalinkAPI.extractPostIDFromRoot(
    new FakeAdPostElement(['/u/1234567890', '/1234567890/Perma123'])
  ),
  'Perma123'
);
assert.equal(
  permalinkAPI.extractPostIDFromRoot(
    new FakeAdPostElement(['//weibo.com/1234567890/Perma123?pagetype=profilefeed'])
  ),
  'Perma123'
);
assert.equal(
  permalinkAPI.extractPostIDFromRoot(
    new FakeAdPostElement(['https://weibo.com/1234567890/Perma123'])
  ),
  'Perma123'
);
assert.equal(
  permalinkAPI.extractPostIDFromRoot(
    new FakeAdPostElement(['/u/1234567890', '/n/nickname', '/hot/weibo'])
  ),
  ''
);
assert.equal(permalinkAPI.extractPostIDFromRoot(null), '');
assert.equal(
  permalinkAPI.isRegisteredAdPostRoot(
    new FakeAdPostElement(['/1234567890/Perma123'])
  ),
  true
);
assert.equal(
  permalinkAPI.isRegisteredAdPostRoot(
    new FakeAdPostElement(['/1234567890/Other999'])
  ),
  false
);

// 虚拟列表回收壳时按登记表重新核对当前条目，避免复用后的正常微博继续被隐藏。
assert.match(
  sourceBetween(
    '  function stillLooksLikeRecognizedAd(node) {',
    '  function stillLooksLikeTimelineRecommendation(node) {'
  ),
  /isRegisteredAdPostRoot\(node\)/
);
// DOM 侧命中登记表的卡片与带可见广告文案的卡片走同一条隐藏路径。
assert.match(
  sourceBetween(
    '  function hideRecognizedAds(root = document) {',
    '  function restoreRecognizedAds(root = document) {'
  ),
  /hasExplicitAdLabel\(item\) \|\| isRegisteredAdPostRoot\(item\)/
);

console.log('regression tests: PASS');

})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

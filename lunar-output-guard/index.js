import { DEFAULT_CORE_WORDS, SUPPORTED_MVU_PATCH_OPS, formatValidationError, validateCandidate } from './validator.mjs';

export default 'LunarOutputGuard';

const context = new Proxy({}, {
  get(_target, property) { return SillyTavern.getContext()?.[property]; },
});

const SETTINGS_KEY = 'lunarOutputGuard';
const ADAPTER_PROMPT_KEY = 'lunar_output_guard_adapter';
const RETRY_PROMPT_KEY = 'lunar_output_guard_retry';
const PRESET_MARKER = 'LUNAR_OUTPUT_GUARD_V2_5';
const MVU_STATUS_SUPPRESS_SENTINEL = '<!--<StatusPlaceHolderImpl/>-->';
const ADAPTER_VERSION = 4;
const DEFAULTS = {
  enabled: true,
  requireLunarPreset: true,
  autoRetry: true,
  maxRetries: 2,
  minChars: 3200,
  maxChars: 3600,
  coreWords: [...DEFAULT_CORE_WORDS],
  adapters: {},
};

const settings = context.extensionSettings[SETTINGS_KEY] ??= structuredClone(DEFAULTS);
for (const [key, value] of Object.entries(DEFAULTS)) {
  if (settings[key] === undefined) settings[key] = structuredClone(value);
}

let generationActive = false;
let messageHookReady = false;
let mvuEventsBound = false;
let mvuBindingStarted = false;
const retryState = new Map();
const pendingRetries = new Map();
const pendingDisplays = new Map();
const handledSignatures = new WeakMap();
let lastStatefulMessage = null;

function saveSettings() { context.saveSettingsDebounced?.(); }

function currentPresetIsLunar() {
  if (!settings.requireLunarPreset) return true;
  const prompts = context.chatCompletionSettings?.prompts;
  if (!Array.isArray(prompts)) return false;
  const marker = prompts.find(prompt => String(prompt?.content ?? '').includes(PRESET_MARKER));
  if (!marker) return false;
  const orders = context.chatCompletionSettings?.prompt_order;
  if (!Array.isArray(orders)) return marker.enabled !== false;
  const entry = orders.flatMap(group => Array.isArray(group?.order) ? group.order : [])
    .find(item => item?.identifier === marker.identifier);
  return entry ? entry.enabled === true : marker.enabled !== false;
}

function isApplicable() { return Boolean(settings.enabled && currentPresetIsLunar()); }

function currentCharacter() {
  const id = context.characterId ?? context.this_chid;
  return context.characters?.[id];
}

function stableCardSource() {
  const character = currentCharacter() ?? {};
  const data = character.data ?? {};
  const payload = {
    avatar: character.avatar ?? data.avatar ?? '',
    name: character.name ?? data.name ?? '',
    description: data.description ?? character.description ?? '',
    personality: data.personality ?? character.personality ?? '',
    scenario: data.scenario ?? character.scenario ?? '',
    system_prompt: data.system_prompt ?? character.system_prompt ?? '',
    post_history_instructions: data.post_history_instructions ?? character.post_history_instructions ?? '',
    character_book: data.character_book ?? character.character_book ?? null,
  };
  const strings = [];
  const collect = value => {
    if (typeof value === 'string') { strings.push(value); return; }
    if (Array.isArray(value)) { for (const item of value) collect(item); return; }
    if (value && typeof value === 'object') for (const item of Object.values(value)) collect(item);
  };
  collect(payload);
  return strings.join('\n');
}

function fingerprint(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function cardAdapterKey(character = {}, fallbackId = 'unknown') {
  const data = character?.data ?? {};
  const rawAvatar = String(character?.avatar ?? data.avatar ?? '').trim();
  const avatar = /^(?:|none|null|undefined|default)$/iu.test(rawAvatar) ? '' : rawAvatar;
  const name = String(character?.name ?? data.name ?? '').trim();
  const identity = {
    avatar,
    name,
    creator: String(data.creator ?? character?.creator ?? '').trim(),
    version: String(data.character_version ?? character?.character_version ?? '').trim(),
    world: String(data.extensions?.world ?? '').trim(),
    created: String(character?.create_date ?? data.create_date ?? '').trim(),
    fallback: avatar || name ? '' : String(fallbackId),
  };
  return `${name || 'character'}:${fingerprint(JSON.stringify(identity))}`;
}

function adapterKey() {
  return cardAdapterKey(currentCharacter(), context.characterId ?? context.this_chid ?? 'unknown');
}

function pointerSegment(value) { return String(value).replaceAll('~', '~0').replaceAll('/', '~1'); }

function valueType(value) {
  if (value === null) return 'any';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string' || typeof value === 'boolean') return typeof value;
  return 'object';
}

function flattenStatData(value, prefix = '', output = { paths: [], types: {} }) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    if (prefix) { output.paths.push(prefix); output.types[prefix] = valueType(value); }
    return output;
  }
  const entries = Object.entries(value).filter(([key]) => !key.startsWith('$'));
  if (!entries.length && prefix) {
    output.paths.push(prefix);
    output.types[prefix] = 'object';
    return output;
  }
  for (const [key, child] of entries) {
    const path = `${prefix}/${pointerSegment(key)}`;
    if (child && typeof child === 'object' && !Array.isArray(child)) flattenStatData(child, path, output);
    else { output.paths.push(path); output.types[path] = valueType(child); }
  }
  return output;
}

function flattenMvuSchema(node, prefix = '', output = { paths: [], types: {} }) {
  if (!node || typeof node !== 'object') return output;
  if (node.type === 'object' && node.properties && typeof node.properties === 'object') {
    for (const [key, child] of Object.entries(node.properties)) {
      if (key.startsWith('$')) continue;
      flattenMvuSchema(child, `${prefix}/${pointerSegment(key)}`, output);
    }
    return output;
  }
  if (prefix) {
    const type = ['string', 'number', 'integer', 'boolean', 'array', 'object', 'null'].includes(node.type) ? node.type : 'any';
    output.paths.push(prefix);
    output.types[prefix] = type;
  }
  return output;
}

function liveMvuSchema() {
  try {
    const data = globalThis.Mvu?.getMvuData?.({ type: 'message', message_id: 'latest' });
    if (!data?.stat_data) return { paths: [], types: {} };
    const output = data.schema?.properties
      ? flattenMvuSchema(data.schema)
      : flattenStatData(data.stat_data);
    output.paths = [...new Set(output.paths)].sort();
    output.types = Object.fromEntries(output.paths.map(path => [path, output.types[path] ?? 'any']));
    return output;
  } catch {
    return { paths: [], types: {} };
  }
}

function detectAllowedOps(source) {
  const supported = [...SUPPORTED_MVU_PATCH_OPS];
  const decisiveLines = String(source).split(/\r?\n/gu)
    .filter(line => /(?:只允许|只能使用|ONLY\s+these\s+ops|ONLY\s+allows?)/iu.test(line));
  const detected = supported.filter(op => decisiveLines.some(line => new RegExp(`\\b${op}\\b`, 'iu').test(line)));
  return detected.length ? detected : supported;
}

function regexEscape(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'); }

export function declaresStrictWrapper(source, outerTags, analysisTag, patchTags) {
  if (!analysisTag) return false;
  for (const outer of outerTags) {
    for (const patch of patchTags) {
      if (outer.toLowerCase() === patch.toLowerCase()) continue;
      const outerPattern = new RegExp(`<${regexEscape(outer)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${regexEscape(outer)}>`, 'gu');
      for (const match of String(source).matchAll(outerPattern)) {
        const ordered = new RegExp(`<${regexEscape(analysisTag)}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${regexEscape(analysisTag)}>\\s*<${regexEscape(patch)}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${regexEscape(patch)}>`, 'u');
        if (ordered.test(match[1])) return true;
      }
    }
  }
  return false;
}

export function requiresPerReplyVariableBlock(source) {
  return /(?:每次|每轮)回复[^。\n]{0,24}(?:输出|提交)[^。\n]{0,24}(?:变量分析|变量更新|更新指令|<UpdateVariable)/u.test(String(source));
}

export function scanAdapter() {
  const source = stableCardSource();
  const tagNames = [...new Set([...source.matchAll(/<([A-Za-z][\w:-]*)\b/gu)].map(match => match[1]))];
  let variableTags = tagNames.filter(tag => /^(?:UpdateVariable|VariableUpdate|Update|StateUpdate)$/iu.test(tag));
  let patchTags = tagNames.filter(tag => /^(?:JSONPatch|PatchJSON)$/iu.test(tag));
  const analysisTags = tagNames.filter(tag => /^Analysis$/u.test(tag));
  const schema = liveMvuSchema();
  const stateSystem = schema.paths.length > 0
    || /stat_data|StatusPlaceHolderImpl|MVU|JSON\s*Patch|变量(?:表|更新|状态)|<UpdateVariable\b|<JSONPatch\b/iu.test(source);
  if (!variableTags.length && patchTags.length) variableTags = [patchTags[0]];
  if (stateSystem && !variableTags.length) variableTags = ['UpdateVariable'];
  if (stateSystem && !patchTags.length && variableTags[0]?.toLowerCase() !== 'jsonpatch') patchTags = ['JSONPatch'];
  const requiredAnalysisTag = analysisTags[0] ?? '';
  const strictWrapper = Boolean(stateSystem && declaresStrictWrapper(source, variableTags, requiredAnalysisTag, patchTags));
  const analysisRule = strictWrapper
    ? source.match(/<Analysis>[\s\S]{0,160}?IN\s+ENGLISH[\s\S]{0,80}?no\s+more\s+than\s+(\d+)\s+words/iu)
    : null;
  const analysisLanguage = analysisRule ? 'en' : '';
  const analysisMaxWords = analysisRule ? Number(analysisRule[1]) : 0;
  const requireVariableBlock = Boolean(stateSystem && requiresPerReplyVariableBlock(source));
  const allowedOps = detectAllowedOps(source);
  const statusPlaceholder = source.includes('<StatusPlaceHolderImpl/>');
  const cardFingerprint = fingerprint(JSON.stringify({
    key: adapterKey(), stateSystem,
    statusPlaceholder,
    variableTags, patchTags, requiredAnalysisTag, strictWrapper, analysisLanguage, analysisMaxWords, requireVariableBlock, allowedOps,
    paths: schema.paths, types: schema.types,
  }));
  return {
    key: adapterKey(), cardFingerprint, adapterVersion: ADAPTER_VERSION, stateSystem,
    statusPlaceholder,
    variableTags, patchTags, requiredAnalysisTag, strictWrapper, analysisLanguage, analysisMaxWords, requireVariableBlock, allowedOps,
    allowedPaths: schema.paths, allowedTypes: schema.types,
    statusBarTemplate: stateSystem ? '<StatusPlaceHolderImpl/>' : '',
    confirmed: false, scannedAt: new Date().toISOString(),
  };
}

function currentAdapter() {
  const saved = settings.adapters?.[adapterKey()];
  if (!saved) return null;
  const candidate = scanAdapter();
  const valid = saved.adapterVersion === ADAPTER_VERSION && saved.cardFingerprint === candidate.cardFingerprint;
  return valid ? saved : { ...saved, confirmed: false, stale: true };
}

function adapterForPrompt() {
  const candidate = scanAdapter();
  if (!candidate.stateSystem) return null;
  return currentAdapter() ?? { ...candidate, confirmed: false, stale: true };
}

function adapterPrompt(adapter) {
  const outer = (adapter?.variableTags ?? []).join(', ');
  const inner = (adapter?.patchTags ?? []).join(', ') || '外层标签内直接放 JSON 数组';
  const operations = (adapter?.allowedOps ?? []).join(', ');
  const schema = (adapter?.allowedPaths ?? []).map(path => `${path}:${adapter?.allowedTypes?.[path] ?? 'any'}`).join(', ');
  const wrapper = adapter?.strictWrapper
    ? `外层内必须仅依次包含 <${adapter.requiredAnalysisTag}>...</${adapter.requiredAnalysisTag}> 与 <${adapter.patchTags[0]}>...</${adapter.patchTags[0]}>${adapter.analysisLanguage === 'en' ? `；${adapter.requiredAnalysisTag} 必须使用英文且不超过 ${adapter.analysisMaxWords} 词` : ''}`
    : '外层内按角色卡原协议放置补丁载荷';
  const frequency = adapter?.requireVariableBlock
    ? '该角色卡规定每次回复必须提交一个变量更新块'
    : '正文导致任一受管字段发生变化时，必须同步输出变量更新块；没有变化时不得照抄';
  return `<lunar-variable-guard>\n${frequency}。变量外层标签：${outer}。JSON 补丁载荷：${inner}。${wrapper}。允许操作：${operations}。允许路径与类型：${schema}。不得翻译路径、猜测数值、新增未登记字段，或输出状态栏、思考、计划、解释。只提交一份 <content> 正文及角色卡规定的唯一变量更新块。\n</lunar-variable-guard>`;
}

function setAdapterPrompt(adapter = null) {
  context.setExtensionPrompt?.(ADAPTER_PROMPT_KEY, adapter?.confirmed ? adapterPrompt(adapter) : '', 0, 0, false);
}

function clearRetryPrompt() { context.setExtensionPrompt?.(RETRY_PROMPT_KEY, '', 0, 0, false); }

function abortGeneration(abort, message) {
  setAdapterPrompt();
  abort?.(true);
  window.toastr?.error?.(message);
}

globalThis.lunarOutputGuard_interceptGeneration = function (_chat, _contextSize, abort, type) {
  if (!isApplicable()) { setAdapterPrompt(); return; }
  const generationType = String(type ?? 'normal').toLowerCase();
  if (['quiet', 'impersonate'].includes(generationType)) { setAdapterPrompt(); return; }
  if (/continue|append/iu.test(generationType)) {
    abortGeneration(abort, '梁元·月食监管禁止 Continue；请发送新消息或重新生成');
    return;
  }
  if (!messageHookReady) {
    abortGeneration(abort, '当前 SillyTavern 缺少前置消息钩子，监管已停止放行');
    return;
  }
  if (context.chatCompletionSettings?.stream_openai === true) {
    abortGeneration(abort, '梁元·月食监管要求关闭流式输出');
    return;
  }
  if (context.chatCompletionSettings?.show_thoughts !== false) {
    abortGeneration(abort, '梁元·月食监管要求关闭“显示思考”；当前已停止生成');
    return;
  }
  const adapter = adapterForPrompt();
  if (adapter?.stateSystem && !ensureMvuEventsBound()) {
    abortGeneration(abort, 'MVU 尚未初始化；有状态角色卡已停止放行');
    return;
  }
  if (adapter?.stateSystem && !adapter.confirmed) {
    abortGeneration(abort, '请先扫描并确认当前角色卡适配器');
    return;
  }
  setAdapterPrompt(adapter);
};

function messageElement(messageId) {
  const value = String(messageId);
  const escapedId = globalThis.CSS?.escape ? CSS.escape(value) : value.replace(/["\\]/gu, '\\$&');
  return document.querySelector(`.mes[mesid="${escapedId}"]`);
}

function makeRetryPrompt(errors) {
  return `<lunar-validation-failure>\n上一份输出未通过机械校验：\n${formatValidationError(errors)}\n请重新独立生成一份完整终稿。只修复机械问题，不新增剧情、人物、地点、往事、伏笔或变量。只输出唯一 <content> 正文及角色卡要求的变量更新块。\n</lunar-validation-failure>`;
}

function turnKey(messageId, type = 'normal') {
  const lastUser = [...(context.chat ?? [])].map((message, index) => ({ message, index }))
    .reverse().find(item => item.message?.is_user);
  const message = context.chat?.[Number(messageId)];
  return `${context.chatId ?? 'chat'}:${lastUser?.index ?? messageId}:${type}:${message?.swipe_id ?? ''}`;
}

function safeFailureText(errors) { return `输出未放行\n${formatValidationError(errors)}`; }
function storedFailureText(errors, stateful = false) {
  return `${safeFailureText(errors)}${stateful ? `\n${MVU_STATUS_SUPPRESS_SENTINEL}` : ''}`;
}

function syncSwipe(message) {
  const swipeId = Number(message?.swipe_id);
  if (!message || !Array.isArray(message.swipes) || !Number.isInteger(swipeId) || swipeId < 0) return;
  message.swipes[swipeId] = message.mes;
  message.swipe_info ??= [];
  message.swipe_info[swipeId] ??= {};
  message.swipe_info[swipeId].extra = structuredClone(message.extra ?? {});
}

function showFailure(messageId, errors, canRetry, type = 'normal') {
  const element = messageElement(messageId);
  element?.classList.remove('lunar-guard-pending');
  element?.classList.add('lunar-guard-rejected');
  const panel = document.createElement('div');
  panel.className = 'lunar-guard-error';
  panel.textContent = safeFailureText(errors);
  if (canRetry) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '一键重新生成';
    button.addEventListener('click', () => queueRetry(messageId, turnKey(messageId, type), errors, type));
    panel.appendChild(button);
  }
  element?.querySelector('.mes_text')?.replaceChildren(panel);
}

function finishDisplay(record) {
  if (!record || record.finalized || context.chat?.[record.id] !== record.message) return;
  record.finalized = true;
  if (record.timeout) clearTimeout(record.timeout);
  context.updateMessageBlock?.(record.id, record.message);
  const element = messageElement(record.id);
  element?.classList.remove('lunar-guard-pending');
  element?.classList.add('lunar-guard-approved');
  simulateReveal(record);
}

function simulateReveal(record) {
  const characters = Array.from(record.body ?? '');
  if (!characters.length || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
    context.updateMessageBlock?.(record.id, record.message);
    pendingDisplays.delete(record.id);
    return;
  }
  let attempts = 0;
  const run = () => {
    if (context.chat?.[record.id] !== record.message) { pendingDisplays.delete(record.id); return; }
    const textElement = messageElement(record.id)?.querySelector('.mes_text');
    if (!textElement) {
      if (attempts++ < 20) setTimeout(run, 25);
      else pendingDisplays.delete(record.id);
      return;
    }
    let offset = 0;
    textElement.textContent = '';
    const timer = setInterval(() => {
      if (context.chat?.[record.id] !== record.message) {
        clearInterval(timer);
        pendingDisplays.delete(record.id);
        return;
      }
      offset = Math.min(characters.length, offset + 80);
      textElement.textContent = characters.slice(0, offset).join('');
      if (offset >= characters.length) {
        clearInterval(timer);
        context.updateMessageBlock?.(record.id, record.message);
        pendingDisplays.delete(record.id);
      }
    }, 20);
  };
  setTimeout(run, 25);
}

function runtimeStateFailure(record, message, liveVariables = null, variablesBeforeUpdate = null) {
  if (!record || record.finalized || context.chat?.[record.id] !== record.message) return;
  if (record.timeout) clearTimeout(record.timeout);
  if (variablesBeforeUpdate) record.rollbackVariables = cloneMvuData(variablesBeforeUpdate);
  if (liveVariables && record.rollbackVariables) restoreMvuVariables(liveVariables, record.rollbackVariables);
  if (record.rollbackVariables && !record.rollbackRequested) {
    record.rollbackRequested = true;
    const rollback = globalThis.Mvu?.replaceMvuData;
    if (typeof rollback === 'function') {
      Promise.resolve(rollback(cloneMvuData(record.rollbackVariables), { type: 'message', message_id: record.id }))
        .catch(() => window.toastr?.error?.('MVU 回滚失败；请手动恢复上一楼状态'));
    }
  }
  record.finalized = true;
  const errors = [{ code: 'mvu_runtime', message }];
  record.message.mes = storedFailureText(errors, true);
  delete record.message.extra.lunarGuardApproved;
  delete record.message.extra.lunarGuardApprovedSnapshot;
  record.message.extra.lunarGuardRejected = true;
  syncSwipe(record.message);
  pendingDisplays.delete(record.id);
  context.updateMessageBlock?.(record.id, record.message);
  setTimeout(() => showFailure(record.id, errors, false, record.type), 0);
}

function jsonEqual(left, right) {
  try {
    if (typeof globalThis._?.isEqual === 'function') return globalThis._.isEqual(left, right);
    return JSON.stringify(left) === JSON.stringify(right);
  } catch { return false; }
}

function cloneMvuData(value) {
  try { return structuredClone(value); }
  catch {
    try { return JSON.parse(JSON.stringify(value)); }
    catch { return null; }
  }
}

export function restoreMvuVariables(target, snapshot) {
  if (!target || typeof target !== 'object' || !snapshot || typeof snapshot !== 'object') return false;
  const restored = cloneMvuData(snapshot);
  if (!restored) return false;
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, restored);
  return true;
}

function snapshotStatData(variables) {
  const source = variables?.stat_data;
  if (!source || typeof source !== 'object') return null;
  const clone = value => {
    if (Array.isArray(value)) return value.map(clone);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !key.startsWith('$'))
      .map(([key, child]) => [key, clone(child)]));
  };
  return clone(source);
}

function readMvuSnapshot(messageId = 'latest') {
  try {
    return snapshotStatData(globalThis.Mvu?.getMvuData?.({ type: 'message', message_id: messageId }));
  } catch {
    return null;
  }
}

function pointerLookup(root, pointer) {
  if (!root || typeof root !== 'object' || typeof pointer !== 'string' || !pointer.startsWith('/')) return { found: false, value: undefined };
  const segments = pointer.slice(1).split('/').map(segment => segment.replaceAll('~1', '/').replaceAll('~0', '~'));
  let current = root;
  for (const segment of segments) {
    if (!current || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, segment)) return { found: false, value: undefined };
    current = current[segment];
  }
  return { found: true, value: current };
}

export function mvuOperationApplied(operation, before, after) {
  const oldTarget = pointerLookup(before, operation.path);
  const newTarget = pointerLookup(after, operation.path);
  if (operation.op === 'replace') {
    return oldTarget.found && newTarget.found
      && !jsonEqual(oldTarget.value, operation.value)
      && jsonEqual(newTarget.value, operation.value);
  }
  if (operation.op === 'add') {
    return newTarget.found && jsonEqual(newTarget.value, operation.value)
      && (!oldTarget.found || !jsonEqual(oldTarget.value, operation.value));
  }
  if (operation.op === 'remove') return oldTarget.found && !newTarget.found;
  if (operation.op === 'move') {
    const oldSource = pointerLookup(before, operation.from);
    const newSource = pointerLookup(after, operation.from);
    return oldSource.found && newTarget.found && !newSource.found && jsonEqual(newTarget.value, oldSource.value);
  }
  if (operation.op === 'delta' || operation.op === 'insert') {
    return oldTarget.found && newTarget.found && !jsonEqual(oldTarget.value, newTarget.value);
  }
  return false;
}

function mvuDataCommitted(record) {
  if (!record.expectedStatData) return false;
  return jsonEqual(readMvuSnapshot(record.id), record.expectedStatData);
}

function waitForMvuCommit(record, attempt = 0) {
  if (!record || record.finalized || context.chat?.[record.id] !== record.message) return;
  if (mvuDataCommitted(record)) {
    record.mvuCommitted = true;
    if (record.renderedSeen) finishDisplay(record);
    return;
  }
  if (attempt >= 100) {
    runtimeStateFailure(record, 'MVU 已收到更新块，但状态写入或状态栏刷新未在 5 秒内完成');
    return;
  }
  setTimeout(() => waitForMvuCommit(record, attempt + 1), 50);
}

function latestWaitingStateRecord() {
  return [...pendingDisplays.values()].reverse().find(record => record.needsMvu && !record.finalized);
}

function onMvuUpdateEnded(variables, variablesBeforeUpdate) {
  const record = latestWaitingStateRecord();
  if (!record) {
    const current = lastStatefulMessage;
    if (current && context.chat?.[current.id] === current.message) {
      setTimeout(() => context.updateMessageBlock?.(current.id, current.message), 100);
    }
    return;
  }
  const expected = snapshotStatData(variables);
  const previous = snapshotStatData(variablesBeforeUpdate);
  if (record.baselineStatData && previous && !jsonEqual(record.baselineStatData, previous)) return;
  if (variablesBeforeUpdate) record.rollbackVariables = cloneMvuData(variablesBeforeUpdate);
  record.mvuEventSeen = true;
  if (!expected) {
    runtimeStateFailure(record, 'MVU 返回的新状态不完整，本楼层未放行', variables, variablesBeforeUpdate);
    return;
  }
  if (previous && jsonEqual(expected, previous)) {
    runtimeStateFailure(record, '变量更新块未造成实际状态变化，为避免旧状态栏冒充新状态，本楼层未放行', variables, variablesBeforeUpdate);
    return;
  }
  const failedOperation = (record.operations ?? []).find(operation => !mvuOperationApplied(operation, previous, expected));
  if (failedOperation) {
    runtimeStateFailure(record, `变量操作未按声明生效或照抄了旧值：${failedOperation.op} ${failedOperation.path}`, variables, variablesBeforeUpdate);
    return;
  }
  record.expectedStatData = expected;
  setTimeout(() => waitForMvuCommit(record), 0);
}

function onMvuBeforeMessageUpdate(updateContext) {
  const record = latestWaitingStateRecord();
  if (!record || !record.mvuEventSeen) return;
  const expected = snapshotStatData(updateContext?.variables);
  if (expected) record.expectedStatData = expected;
  setTimeout(() => waitForMvuCommit(record), 0);
}

function ensureMvuEventsBound() {
  if (mvuEventsBound) return true;
  const mvu = globalThis.Mvu;
  const eventOn = globalThis.eventOn;
  if (!mvu?.events?.VARIABLE_UPDATE_ENDED || typeof mvu.replaceMvuData !== 'function' || typeof eventOn !== 'function') return false;
  eventOn(mvu.events.VARIABLE_UPDATE_ENDED, onMvuUpdateEnded);
  if (mvu.events.BEFORE_MESSAGE_UPDATE) eventOn(mvu.events.BEFORE_MESSAGE_UPDATE, onMvuBeforeMessageUpdate);
  mvuEventsBound = true;
  return true;
}

function startMvuBinding() {
  if (mvuBindingStarted) return;
  mvuBindingStarted = true;
  if (ensureMvuEventsBound()) return;
  const waiter = globalThis.waitGlobalInitialized;
  if (typeof waiter === 'function') {
    Promise.resolve(waiter('Mvu')).then(ensureMvuEventsBound).catch(() => {});
  }
  let attempts = 0;
  const retry = () => {
    if (ensureMvuEventsBound() || attempts++ >= 120) return;
    setTimeout(retry, 250);
  };
  setTimeout(retry, 0);
}

function queueRetry(messageId, key, errors, type = 'normal') {
  if (type !== 'normal') { clearRetryPrompt(); showFailure(messageId, errors, false, type); return; }
  const state = retryState.get(key) ?? { attempts: 0 };
  if (state.attempts >= Number(settings.maxRetries)) {
    clearRetryPrompt();
    showFailure(messageId, errors, false, type);
    return;
  }
  retryState.set(key, state);
  context.setExtensionPrompt?.(RETRY_PROMPT_KEY, makeRetryPrompt(errors), 0, 0, false);
  pendingRetries.set(key, { messageId, errors, type, messageRef: context.chat?.[Number(messageId)] });
  if (!generationActive) setTimeout(() => void flushRetries(), 0);
}

async function flushRetries() {
  if (generationActive) return;
  for (const [key, pending] of pendingRetries) {
    pendingRetries.delete(key);
    const id = Number(pending.messageId);
    const message = context.chat?.[id];
    const isSafeLastCandidate = pending.type === 'normal'
      && message === pending.messageRef
      && message && !message.is_user && !message.is_system
      && id === (context.chat ?? []).length - 1
      && message.extra?.lunarGuardRejected;
    if (!isSafeLastCandidate || !context.deleteLastMessage || !context.generate) {
      clearRetryPrompt();
      showFailure(id, pending.errors, false, pending.type);
      continue;
    }
    if (!messageElement(id)) {
      pendingRetries.set(key, pending);
      setTimeout(() => void flushRetries(), 50);
      return;
    }
    const state = retryState.get(key) ?? { attempts: 0 };
    state.attempts += 1;
    retryState.set(key, state);
    await context.deleteLastMessage();
    await context.generate('normal');
    break;
  }
}

function handleAppendAttempt(id, message) {
  const snapshot = message.extra?.lunarGuardApprovedSnapshot;
  if (snapshot) {
    message.mes = snapshot;
    syncSwipe(message);
    context.updateMessageBlock?.(id, message);
  }
  clearRetryPrompt();
  window.toastr?.error?.('Continue 已被梁元·月食监管禁止；原楼层保持不变');
}

function scrubNativeReasoning(message) {
  if (!message || typeof message !== 'object') return;
  delete message.reasoning;
  if (!message.extra || typeof message.extra !== 'object') return;
  delete message.extra.reasoning;
  delete message.extra.reasoning_details;
  delete message.extra.reasoning_duration;
}

function handleMessage(messageId, type = 'normal') {
  if (!isApplicable()) return;
  const id = Number(messageId);
  const message = context.chat?.[id];
  if (!message || message.is_user || message.is_system) return;
  message.extra ??= {};
  scrubNativeReasoning(message);
  const normalizedType = typeof type === 'string' ? type : 'normal';
  const isInitialGreeting = normalizedType.toLowerCase() === 'first_message'
    || !(context.chat ?? []).slice(0, id).some(item => item?.is_user);
  if (isInitialGreeting) {
    clearRetryPrompt();
    setAdapterPrompt();
    return;
  }
  if (/append|continue/iu.test(normalizedType)) { handleAppendAttempt(id, message); return; }
  const raw = String(message.mes ?? '');
  if (generationActive && raw.trim().length < 5) return;
  if (message.extra.lunarGuardApproved && raw === message.extra.lunarGuardApprovedSnapshot) return;
  const signature = `${normalizedType}:${message.swipe_id ?? ''}:${raw}`;
  if (handledSignatures.get(message) === signature) return;
  handledSignatures.set(message, signature);
  delete message.extra.lunarGuardApproved;
  delete message.extra.lunarGuardRejected;
  delete message.extra.lunarGuardApprovedSnapshot;

  const adapter = adapterForPrompt();
  const result = validateCandidate(raw, adapter, {
    minChars: settings.minChars,
    maxChars: settings.maxChars,
    coreWords: settings.coreWords,
  });
  const key = turnKey(id, normalizedType);
  if (result.ok) {
    message.mes = result.rendered;
    message.extra.lunarGuardApproved = true;
    message.extra.lunarGuardApprovedSnapshot = result.rendered;
    syncSwipe(message);
    const needsMvu = Boolean(adapter?.stateSystem && result.variables);
    const record = {
      id, message, type: normalizedType, body: result.body,
      operations: result.operations ?? [],
      needsMvu, renderedSeen: false, mvuEventSeen: false,
      baselineStatData: needsMvu ? readMvuSnapshot('latest') : null,
      mvuCommitted: !needsMvu, finalized: false,
    };
    pendingDisplays.set(id, record);
    if (adapter?.stateSystem) lastStatefulMessage = { id, message };
    context.updateMessageBlock?.(id, message);
    clearRetryPrompt();
    retryState.delete(key);
    if (needsMvu) {
      record.timeout = setTimeout(() => {
        if (!record.mvuEventSeen) runtimeStateFailure(record, '变量更新块未被 MVU 接收；为避免状态栏显示旧值，本楼层未放行');
      }, 5000);
    }
    return;
  }

  message.mes = storedFailureText(result.errors, Boolean(adapter?.stateSystem));
  message.extra.lunarGuardRejected = true;
  syncSwipe(message);
  pendingDisplays.delete(id);
  context.updateMessageBlock?.(id, message);
  const state = retryState.get(key) ?? { attempts: 0 };
  const canRetry = normalizedType === 'normal'
    && state.attempts < Number(settings.maxRetries)
    && Boolean(context.generate);
  setTimeout(() => showFailure(id, result.errors, canRetry, normalizedType), 0);
  if (normalizedType !== 'normal') { clearRetryPrompt(); return; }
  if (settings.autoRetry && state.attempts < Number(settings.maxRetries) && context.deleteLastMessage && context.generate) {
    queueRetry(id, key, result.errors, normalizedType);
  } else {
    clearRetryPrompt();
  }
}

function parseLines(value) { return [...new Set(String(value ?? '').split(/\r?\n|,/gu).map(item => item.trim()).filter(Boolean))]; }
function isTagName(value) { return /^[A-Za-z][\w:-]*$/u.test(value); }
function isJsonPointer(value) { return /^\/(?:[^~]|~[01])*$/u.test(value); }

function addSettingsPanel() {
  const host = document.getElementById('extensions_settings');
  if (!host || document.getElementById('lunar_guard_settings')) return;
  const wrapper = document.createElement('div');
  wrapper.id = 'lunar_guard_settings';
  wrapper.className = 'inline-drawer';
  wrapper.innerHTML = '<div class="inline-drawer-toggle inline-drawer-header"><b>梁元·月食输出监管</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div><div class="inline-drawer-content"></div>';
  const content = wrapper.querySelector('.inline-drawer-content');
  const enabled = document.createElement('label');
  enabled.className = 'checkbox_label marginBot5';
  enabled.innerHTML = '<input type="checkbox" id="lunar_guard_enabled"><span>启用监管（只在 2.5 预设生效）</span>';
  content.appendChild(enabled);
  const auto = document.createElement('label');
  auto.className = 'checkbox_label marginBot5';
  auto.innerHTML = '<input type="checkbox" id="lunar_guard_retry"><span>校验失败自动独立重试，最多两次</span>';
  content.appendChild(auto);
  const status = document.createElement('div');
  status.id = 'lunar_guard_adapter_status';
  content.appendChild(status);
  const scan = document.createElement('button');
  scan.type = 'button';
  scan.textContent = '扫描当前角色卡与实时 MVU Schema';
  scan.addEventListener('click', () => renderAdapterCandidate(true));
  content.appendChild(scan);
  const template = document.createElement('textarea');
  template.id = 'lunar_guard_status_template';
  template.className = 'text_pole';
  template.placeholder = '必填：状态栏占位符或模板，例如 <StatusPlaceHolderImpl/>';
  content.appendChild(template);
  const variableTags = document.createElement('textarea');
  variableTags.id = 'lunar_guard_variable_tags';
  variableTags.className = 'text_pole';
  variableTags.placeholder = '必填：变量外层标签，每行一个，例如 UpdateVariable';
  content.appendChild(variableTags);
  const patchTags = document.createElement('textarea');
  patchTags.id = 'lunar_guard_patch_tags';
  patchTags.className = 'text_pole';
  patchTags.placeholder = '可选：JSON Patch 内层标签，每行一个，例如 JSONPatch';
  content.appendChild(patchTags);
  const operations = document.createElement('textarea');
  operations.id = 'lunar_guard_allowed_ops';
  operations.className = 'text_pole';
  operations.placeholder = '必填：允许操作，以逗号分隔，例如 replace, add, remove';
  content.appendChild(operations);
  const paths = document.createElement('textarea');
  paths.id = 'lunar_guard_allowed_paths';
  paths.className = 'text_pole';
  paths.placeholder = '必填：允许写入的 JSON Pointer，每行一条';
  content.appendChild(paths);
  const types = document.createElement('textarea');
  types.id = 'lunar_guard_allowed_types';
  types.className = 'text_pole';
  types.placeholder = '必填：每行“路径|类型”；支持 string/number/integer/boolean/object/array/null/any';
  content.appendChild(types);
  const confirm = document.createElement('button');
  confirm.type = 'button';
  confirm.textContent = '确认并锁定适配器';
  confirm.addEventListener('click', () => {
    const candidate = scanAdapter();
    const outer = parseLines(variableTags.value);
    const inner = parseLines(patchTags.value);
    const allowedOps = parseLines(operations.value).map(item => item.toLowerCase());
    const allowedPaths = parseLines(paths.value);
    const allowedTypes = Object.fromEntries(types.value.split(/\r?\n/gu).map(item => item.trim()).filter(Boolean).map(line => {
      const separator = line.indexOf('|');
      return separator > 0 ? [line.slice(0, separator).trim(), line.slice(separator + 1).trim().toLowerCase()] : [line, ''];
    }));
    const supportedTypes = new Set(['string', 'number', 'integer', 'boolean', 'object', 'array', 'null', 'any']);
    const supportedOps = new Set(SUPPORTED_MVU_PATCH_OPS);
    const invalid = !template.value.trim()
      || !outer.length || outer.some(tag => !isTagName(tag))
      || inner.some(tag => !isTagName(tag))
      || (candidate.strictWrapper && inner.length !== 1)
      || !allowedOps.length || allowedOps.some(op => !supportedOps.has(op))
      || !allowedPaths.length || allowedPaths.some(path => !isJsonPointer(path))
      || allowedPaths.some(path => !allowedTypes[path] || !supportedTypes.has(allowedTypes[path]));
    if (candidate.stateSystem && invalid) {
      window.toastr?.error?.('有状态卡必须填写有效状态栏、协议标签、操作、路径和字段类型');
      return;
    }
    settings.adapters[adapterKey()] = {
      ...candidate,
      statusBarTemplate: template.value.trim(),
      variableTags: outer,
      patchTags: inner,
      allowedOps,
      allowedPaths,
      allowedTypes,
      adapterVersion: ADAPTER_VERSION,
      confirmed: true,
      stale: false,
    };
    saveSettings();
    renderAdapterCandidate();
  });
  content.appendChild(confirm);
  enabled.querySelector('input').checked = settings.enabled;
  auto.querySelector('input').checked = settings.autoRetry;
  enabled.querySelector('input').addEventListener('change', event => {
    settings.enabled = event.target.checked;
    if (!settings.enabled) setAdapterPrompt();
    saveSettings();
  });
  auto.querySelector('input').addEventListener('change', event => {
    settings.autoRetry = event.target.checked;
    saveSettings();
  });
  host.appendChild(wrapper);
  renderAdapterCandidate();
}

function renderAdapterCandidate(preferCandidate = false) {
  const status = document.getElementById('lunar_guard_adapter_status');
  if (!status) return;
  const candidate = scanAdapter();
  const savedRaw = settings.adapters?.[adapterKey()];
  const saved = currentAdapter();
  const display = preferCandidate ? candidate : (savedRaw ?? candidate);
  status.textContent = candidate.stateSystem
    ? `当前卡：${candidate.key}；状态系统：是；MVU：${mvuEventsBound ? '已连接' : '未就绪'}；Schema 路径：${candidate.allowedPaths.length}；协议：${candidate.strictWrapper ? `严格 ${candidate.requiredAnalysisTag}→${candidate.patchTags[0]}${candidate.analysisLanguage === 'en' ? `（英文≤${candidate.analysisMaxWords}词）` : ''}` : '通用'}${candidate.requireVariableBlock ? '，每轮必交' : '，按变化提交'}；适配器：${saved?.confirmed ? '已锁定' : '待确认'}${saved?.stale ? '（协议或 Schema 已变化）' : ''}`
    : `当前卡：${candidate.key}；未检测到状态系统，按无变量卡处理。`;
  const values = {
    lunar_guard_status_template: display.statusBarTemplate ?? candidate.statusBarTemplate ?? '',
    lunar_guard_variable_tags: (display.variableTags ?? candidate.variableTags ?? []).join('\n'),
    lunar_guard_patch_tags: (display.patchTags ?? candidate.patchTags ?? []).join('\n'),
    lunar_guard_allowed_ops: (display.allowedOps ?? candidate.allowedOps ?? []).join(', '),
    lunar_guard_allowed_paths: (display.allowedPaths?.length ? display.allowedPaths : candidate.allowedPaths ?? []).join('\n'),
    lunar_guard_allowed_types: Object.entries(display.allowedTypes && Object.keys(display.allowedTypes).length ? display.allowedTypes : candidate.allowedTypes ?? {})
      .map(([path, type]) => `${path}|${type}`).join('\n'),
  };
  for (const [id, value] of Object.entries(values)) {
    const element = document.getElementById(id);
    if (element) element.value = value;
  }
}

function onCharacterMessageRendered(messageId) {
  const id = Number(messageId);
  const record = pendingDisplays.get(id);
  if (!record || context.chat?.[id] !== record.message) return;
  record.renderedSeen = true;
  if (record.needsMvu && !record.mvuCommitted) {
    messageElement(id)?.classList.add('lunar-guard-pending');
    if (record.mvuEventSeen) waitForMvuCommit(record);
    return;
  }
  finishDisplay(record);
}

function onMessageSwiped(messageId) {
  const id = Number.isFinite(Number(messageId)) ? Number(messageId) : (context.chat ?? []).length - 1;
  const message = context.chat?.[id];
  if (!message || message.is_user || message.is_system || !isApplicable()) return;
  if (message.extra?.lunarGuardApproved && message.mes === message.extra.lunarGuardApprovedSnapshot) {
    lastStatefulMessage = { id, message };
    context.updateMessageBlock?.(id, message);
    return;
  }
  handleMessage(id, 'swipe');
}

function bindCoreEvents() {
  const source = context.eventSource;
  const types = context.eventTypes;
  if (!source || !types) return;
  if (types.APP_READY) source.on(types.APP_READY, () => { addSettingsPanel(); startMvuBinding(); });
  if (types.GENERATION_STARTED) source.on(types.GENERATION_STARTED, () => { generationActive = true; });
  if (types.GENERATION_ENDED) source.on(types.GENERATION_ENDED, () => {
    generationActive = false;
    setTimeout(() => void flushRetries(), 0);
  });
  const messageReceivedHandler = (messageId, type) => { handleMessage(messageId, type ?? 'normal'); };
  if (types.MESSAGE_RECEIVED && typeof source.makeFirst === 'function') {
    source.makeFirst(types.MESSAGE_RECEIVED, messageReceivedHandler);
    messageHookReady = true;
  }
  if (types.CHARACTER_MESSAGE_RENDERED) source.on(types.CHARACTER_MESSAGE_RENDERED, onCharacterMessageRendered);
  if (types.MESSAGE_SWIPED) source.on(types.MESSAGE_SWIPED, onMessageSwiped);
  if (types.CHAT_CHANGED) source.on(types.CHAT_CHANGED, () => {
    retryState.clear();
    pendingRetries.clear();
    pendingDisplays.clear();
    lastStatefulMessage = null;
    clearRetryPrompt();
    setAdapterPrompt();
    setTimeout(renderAdapterCandidate, 0);
  });
}

bindCoreEvents();
startMvuBinding();
addSettingsPanel();

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8');

test('runtime source keeps hard-gate invariants', () => {
  assert.match(source, /LUNAR_OUTPUT_GUARD_V2_5/u);
  assert.match(source, /source\.makeFirst\(types\.MESSAGE_RECEIVED/u);
  assert.match(source, /mvu\.events\.VARIABLE_UPDATE_ENDED/u);
  assert.match(source, /Mvu\?\.getMvuData/u);
  assert.match(source, /\/continue\|append\/iu/u);
  assert.match(source, /show_thoughts\s*!==\s*false/u);
  assert.match(source, /scrubNativeReasoning/u);
  assert.match(source, /onMvuUpdateEnded\(variables, variablesBeforeUpdate\)/u);
  assert.match(source, /snapshotStatData/u);
  assert.match(source, /replaceMvuData/u);
  assert.match(source, /restoreMvuVariables/u);
  assert.match(source, /baselineStatData/u);
  assert.match(source, /if \(!record \|\| !record\.mvuEventSeen\) return;/u);
  assert.doesNotMatch(source, /context\.eventTypes\?\.VARIABLE_UPDATE_ENDED/u);
  assert.doesNotMatch(source, /chat\.push\(/u);
  assert.doesNotMatch(source, /context\.saveChat/u);
  assert.doesNotMatch(source, /expectedVariables/u);
});

test('interceptor blocks Continue and append handler restores approved text', async () => {
  const listeners = new Map();
  const firstListeners = new Map();
  const extensionPrompts = new Map();
  const toasts = [];
  const user = { is_user: true, mes: '继续。' };
  const approved = '<CONTENT_BOUNDARY/>\n\n<content>原正文</content>';
  const assistant = {
    is_user: false,
    is_system: false,
    mes: `${approved}续写污染`,
    swipe_id: 0,
    swipes: [`${approved}续写污染`],
    swipe_info: [{ extra: {} }],
    extra: { lunarGuardApproved: true, lunarGuardApprovedSnapshot: approved },
  };
  const context = {
    extensionSettings: {},
    chatCompletionSettings: {
      stream_openai: false,
      prompts: [{ identifier: 'marker', content: 'LUNAR_OUTPUT_GUARD_V2_5' }],
      prompt_order: [{ order: [{ identifier: 'marker', enabled: true }] }],
    },
    eventTypes: {
      APP_READY: 'app_ready',
      GENERATION_STARTED: 'generation_started',
      GENERATION_ENDED: 'generation_ended',
      MESSAGE_RECEIVED: 'message_received',
      CHARACTER_MESSAGE_RENDERED: 'character_message_rendered',
      MESSAGE_SWIPED: 'message_swiped',
      CHAT_CHANGED: 'chat_changed',
    },
    eventSource: {
      on(name, handler) {
        if (!name) return;
        const values = listeners.get(name) ?? [];
        values.push(handler);
        listeners.set(name, values);
      },
      makeFirst(name, handler) { firstListeners.set(name, handler); },
    },
    characters: [{ name: '无状态测试卡', avatar: 'test.png', data: {} }],
    characterId: 0,
    chatId: 'test-chat',
    chat: [user, assistant],
    setExtensionPrompt(key, value) { extensionPrompts.set(key, value); },
    updateMessageBlock() {},
    saveSettingsDebounced() {},
  };

  globalThis.SillyTavern = { getContext: () => context };
  globalThis.window = { toastr: { error: message => toasts.push(message) } };
  globalThis.document = {
    getElementById: () => null,
    querySelector: () => null,
    createElement: () => ({ classList: { add() {}, remove() {} } }),
  };
  globalThis.CSS = { escape: value => String(value) };
  globalThis.matchMedia = () => ({ matches: true });
  const mvuListeners = new Map();
  globalThis.Mvu = {
    events: {
      VARIABLE_UPDATE_ENDED: 'mag_variable_update_ended',
      BEFORE_MESSAGE_UPDATE: 'mag_before_message_update',
    },
    getMvuData: () => ({ stat_data: {} }),
    replaceMvuData: async () => {},
  };
  globalThis.eventOn = (name, handler) => mvuListeners.set(name, handler);

  const runtime = await import(`./index.js?runtime-test=${Date.now()}`);
  assert.notEqual(
    runtime.cardAdapterKey({ avatar: 'none', name: '卡甲', data: { name: '卡甲' } }, 0),
    runtime.cardAdapterKey({ avatar: 'none', name: '卡乙', data: { name: '卡乙' } }, 1),
  );
  const strictProtocol = '<UpdateVariable>\n<Analysis>English only.</Analysis>\n<JSONPatch>[]</JSONPatch>\n</UpdateVariable>';
  assert.equal(runtime.declaresStrictWrapper(strictProtocol, ['UpdateVariable'], 'Analysis', ['JSONPatch']), true);
  assert.equal(runtime.declaresStrictWrapper('<Analysis>x</Analysis><JSONPatch>[]</JSONPatch>', ['UpdateVariable'], 'Analysis', ['JSONPatch']), false);
  assert.equal(runtime.declaresStrictWrapper('<JSONPatch>[]</JSONPatch>', ['JSONPatch'], 'Analysis', ['JSONPatch']), false);
  assert.equal(runtime.requiresPerReplyVariableBlock('每次回复末尾同时输出变量分析与实际更新指令。'), true);
  assert.equal(runtime.requiresPerReplyVariableBlock('只有变化时才输出变量更新。'), false);
  const before = { 世界: { 时刻: '20:20', 地点: '书房' } };
  const after = { 世界: { 时刻: '20:20', 地点: '主卧' } };
  assert.equal(runtime.mvuOperationApplied({ op: 'replace', path: '/世界/时刻', value: '20:20' }, before, after), false);
  assert.equal(runtime.mvuOperationApplied({ op: 'replace', path: '/世界/地点', value: '主卧' }, before, after), true);
  assert.equal(runtime.mvuOperationApplied({ op: 'remove', path: '/世界/时刻' }, before, { 世界: { 地点: '书房' } }), true);
  assert.equal(runtime.mvuOperationApplied({ op: 'add', path: '/世界/日期', value: '1013-03-03' }, before, { 世界: { ...before.世界, 日期: '1013-03-03' } }), true);
  assert.equal(runtime.mvuOperationApplied({ op: 'add', path: '/世界/地点', value: '主卧' }, before, after), true);
  assert.equal(runtime.mvuOperationApplied({ op: 'add', path: '/世界/时刻', value: '20:20' }, before, after), false);
  const mutable = { stat_data: structuredClone(after), display_data: { stale: true } };
  assert.equal(runtime.restoreMvuVariables(mutable, { stat_data: structuredClone(before) }), true);
  assert.deepEqual(mutable, { stat_data: before });
  const receiveFirst = firstListeners.get('message_received');
  assert.equal(typeof receiveFirst, 'function');
  assert.equal(mvuListeners.has('mag_variable_update_ended'), true);

  assistant.mes = '短欢迎语';
  assistant.extra = { reasoning: '不应显示' };
  receiveFirst(1, 'first_message');
  assert.equal(assistant.mes, '短欢迎语');
  assert.equal('reasoning' in assistant.extra, false);

  const alternateGreeting = { is_user: false, is_system: false, mes: '备选欢迎语', extra: {} };
  context.chat = [alternateGreeting];
  receiveFirst(0, 'swipe');
  assert.equal(alternateGreeting.mes, '备选欢迎语');
  context.chat = [user, assistant];

  assistant.mes = `${approved}续写污染`;
  assistant.swipes = [`${approved}续写污染`];
  assistant.swipe_info = [{ extra: {} }];
  assistant.extra = { lunarGuardApproved: true, lunarGuardApprovedSnapshot: approved };

  const prompt = [{ role: 'user', content: 'hello' }];
  let aborted = false;
  globalThis.lunarOutputGuard_interceptGeneration(prompt, 4096, value => { aborted = value; }, 'continue');
  assert.equal(aborted, true);
  assert.equal(prompt.length, 1);
  assert.match(toasts.at(-1), /禁止 Continue/u);

  context.chatCompletionSettings.show_thoughts = true;
  aborted = false;
  globalThis.lunarOutputGuard_interceptGeneration(prompt, 4096, value => { aborted = value; }, 'normal');
  assert.equal(aborted, true);
  assert.match(toasts.at(-1), /关闭“显示思考”/u);
  context.chatCompletionSettings.show_thoughts = false;

  receiveFirst(1, 'appendFinal');
  assert.equal(assistant.mes, approved);
  assert.equal(assistant.swipes[0], approved);
  assert.equal(extensionPrompts.get('lunar_output_guard_retry'), '');
});

test('MVU event rejection rolls a mixed valid plus no-op patch back transactionally', async () => {
  const listeners = new Map();
  const firstListeners = new Map();
  const mvuListeners = new Map();
  const beforeVariables = {
    stat_data: { 世界: { 时刻: '20:20', 地点: '书房' } },
    schema: {
      type: 'object',
      properties: {
        世界: {
          type: 'object',
          properties: { 时刻: { type: 'string' }, 地点: { type: 'string' } },
        },
      },
    },
  };
  let currentVariables = structuredClone(beforeVariables);
  let persistedRollback = null;
  const protocol = `每次回复末尾同时输出变量分析与实际更新指令。
更新指令只允许 replace、add、remove。
<UpdateVariable>
<Analysis>$(IN ENGLISH, no more than 80 words)
- analyze variables only
</Analysis>
<JSONPatch>[]</JSONPatch>
</UpdateVariable>
<StatusPlaceHolderImpl/>`;
  const longBody = Array.from({ length: 3200 }, (_, index) => String.fromCodePoint(0x4e00 + index)).join('');
  const assistant = {
    is_user: false,
    is_system: false,
    mes: `<content>${longBody}</content>
<UpdateVariable>
<Analysis>One location changed; time did not change.</Analysis>
<JSONPatch>
[{"op":"replace","path":"/世界/时刻","value":"20:20"},{"op":"replace","path":"/世界/地点","value":"主卧"}]
</JSONPatch>
</UpdateVariable>`,
    extra: {},
    swipe_id: 0,
    swipes: [],
    swipe_info: [],
  };
  const context = {
    extensionSettings: {},
    chatCompletionSettings: {
      stream_openai: false,
      show_thoughts: false,
      prompts: [{ identifier: 'marker', content: 'LUNAR_OUTPUT_GUARD_V2_5' }],
      prompt_order: [{ order: [{ identifier: 'marker', enabled: true }] }],
    },
    eventTypes: { MESSAGE_RECEIVED: 'message_received' },
    eventSource: {
      on(name, handler) {
        const values = listeners.get(name) ?? [];
        values.push(handler);
        listeners.set(name, values);
      },
      makeFirst(name, handler) { firstListeners.set(name, handler); },
    },
    characters: [{ avatar: 'none', name: '状态测试卡', data: { name: '状态测试卡', character_book: { entries: [{ content: protocol }] } } }],
    characterId: 0,
    chatId: 'state-test-chat',
    chat: [{ is_user: true, mes: '继续。' }, assistant],
    setExtensionPrompt() {},
    updateMessageBlock() {},
    saveSettingsDebounced() {},
  };
  globalThis.SillyTavern = { getContext: () => context };
  globalThis.window = { toastr: { error() {} } };
  globalThis.document = { getElementById: () => null, querySelector: () => null, createElement: () => ({}) };
  globalThis.CSS = { escape: value => String(value) };
  globalThis.matchMedia = () => ({ matches: true });
  globalThis.Mvu = {
    events: {
      VARIABLE_UPDATE_ENDED: 'mag_variable_update_ended',
      BEFORE_MESSAGE_UPDATE: 'mag_before_message_update',
    },
    getMvuData: () => currentVariables,
    async replaceMvuData(snapshot) {
      persistedRollback = structuredClone(snapshot);
      currentVariables = structuredClone(snapshot);
    },
  };
  globalThis.eventOn = (name, handler) => mvuListeners.set(name, handler);

  const runtime = await import(`./index.js?state-runtime-test=${Date.now()}`);
  const candidate = runtime.scanAdapter();
  assert.equal(candidate.strictWrapper, true);
  assert.equal(candidate.requireVariableBlock, true);
  assert.equal(candidate.analysisLanguage, 'en');
  context.extensionSettings.lunarOutputGuard.adapters[candidate.key] = { ...candidate, confirmed: true, stale: false };

  firstListeners.get('message_received')(1, 'normal');
  assert.match(assistant.mes, /^<CONTENT_BOUNDARY\/>/u);
  const liveVariables = structuredClone(beforeVariables);
  liveVariables.stat_data.世界.地点 = '主卧';
  await mvuListeners.get('mag_variable_update_ended')(liveVariables, structuredClone(beforeVariables));
  await Promise.resolve();

  assert.match(assistant.mes, /^输出未放行/u);
  assert.match(assistant.mes, /<!--<StatusPlaceHolderImpl\/>-->$/u);
  assert.equal(assistant.extra.lunarGuardRejected, true);
  assert.deepEqual(liveVariables, beforeVariables);
  assert.deepEqual(persistedRollback, beforeVariables);
  assert.deepEqual(currentVariables, beforeVariables);
});

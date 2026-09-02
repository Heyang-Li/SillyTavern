import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCandidate } from './validator.mjs';

const body = count => Array.from({ length: count }, (_, index) => String.fromCodePoint(0x4e00 + index)).join('');
const make = count => `<content>${body(count)}</content>`;
const adapter = {
  adapterVersion: 4,
  confirmed: true,
  stateSystem: true,
  variableTags: ['UpdateVariable'],
  patchTags: ['JSONPatch'],
  requiredAnalysisTag: 'Analysis',
  strictWrapper: true,
  analysisLanguage: 'en',
  analysisMaxWords: 80,
  requireVariableBlock: false,
  allowedOps: ['replace', 'add', 'remove'],
  allowedPaths: ['/世界/时刻', '/世界/地点'],
  allowedTypes: { '/世界/时刻': 'string', '/世界/地点': 'string' },
  statusBarTemplate: '<StatusPlaceHolderImpl/>',
};
const patch = (path = '/世界/时刻', value = '20:45') =>
  `[{"op":"replace","path":"${path}","value":"${value}"}]`;
const wrapped = payload => `<UpdateVariable>\n<Analysis>\n- Time passed: five minutes.\n</Analysis>\n<JSONPatch>\n${payload}\n</JSONPatch>\n</UpdateVariable>`;

test('enforces visible length boundaries', () => {
  assert.equal(validateCandidate(make(3199)).ok, false);
  assert.equal(validateCandidate(make(3200)).ok, true);
  assert.equal(validateCandidate(make(3600)).ok, true);
  assert.equal(validateCandidate(make(3601)).ok, false);
});

test('rejects forbidden words and visible reasoning leakage', () => {
  assert.equal(validateCandidate(`<content>${body(3199)}心湖</content>`).ok, false);
  assert.equal(validateCandidate(`<thinking>plan</thinking>${make(3200)}`).ok, false);
  assert.equal(validateCandidate(`<content>${body(3200)}先把现状和要求过一遍，再决定段落怎么排。</content>`).ok, false);
});

test('requires one content block and no text before it', () => {
  assert.equal(validateCandidate(`${make(3200)}${make(1)}`).ok, false);
  assert.equal(validateCandidate(`说明\n${make(3200)}`).ok, false);
});

test('accepts real MVU outer Analysis and nested JSONPatch protocol', () => {
  const raw = `${make(3200)}
<UpdateVariable>
<Analysis>
- Time passed: five minutes.
- I will analyze variables only inside this registered MVU component.
- Only the current turn is considered.
</Analysis>
<JSONPatch>
${patch()}
</JSONPatch>
</UpdateVariable>`;
  const result = validateCandidate(raw, adapter);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.match(result.rendered, /^<CONTENT_BOUNDARY\/>/u);
  assert.match(result.rendered, /<UpdateVariable>[\s\S]*<JSONPatch>/u);
  assert.match(result.rendered, /<StatusPlaceHolderImpl\/>$/u);
});

test('accepts an adapter-declared outer block with summary plus bare JSON array', () => {
  const bareAdapter = { ...adapter, patchTags: [], requiredAnalysisTag: '', strictWrapper: false };
  const raw = `${make(3200)}
<UpdateVariable>
- Time passed: five minutes.
${patch()}
</UpdateVariable>`;
  assert.equal(validateCandidate(raw, bareAdapter).ok, true);
});

test('fails closed when state adapter contract is incomplete', () => {
  assert.equal(validateCandidate(make(3200), { ...adapter, statusBarTemplate: '' }).ok, false);
  assert.equal(validateCandidate(make(3200), { ...adapter, confirmed: false }).ok, false);
  assert.equal(validateCandidate(make(3200), { ...adapter, variableTags: [] }).ok, false);
  assert.equal(validateCandidate(make(3200), { ...adapter, allowedPaths: [] }).ok, false);
  assert.equal(validateCandidate(make(3200), { ...adapter, allowedTypes: {} }).ok, false);
});

test('validates JSON, paths, pointer escapes, value types, and allowed operations', () => {
  assert.equal(validateCandidate(`${make(3200)}\n<UpdateVariable><JSONPatch>NOT JSON</JSONPatch></UpdateVariable>`, adapter).ok, false);
  assert.equal(validateCandidate(`${make(3200)}\n<UpdateVariable><JSONPatch>${patch('/forbidden')}</JSONPatch></UpdateVariable>`, adapter).ok, false);
  assert.equal(validateCandidate(`${make(3200)}\n<UpdateVariable><JSONPatch>${patch('/世界/~2坏键')}</JSONPatch></UpdateVariable>`, adapter).ok, false);
  assert.equal(validateCandidate(`${make(3200)}\n<UpdateVariable><JSONPatch>[{"op":"replace","path":"/世界/时刻","value":123}]</JSONPatch></UpdateVariable>`, adapter).ok, false);
  assert.equal(validateCandidate(`${make(3200)}\n<UpdateVariable><JSONPatch>[{"op":"copy","from":"/世界/地点","path":"/世界/时刻"}]</JSONPatch></UpdateVariable>`, adapter).ok, false);
  assert.equal(validateCandidate(`${make(3200)}\n${wrapped('[{"op":"Replace","path":"/世界/时刻"}]')}`, adapter).ok, false);
  assert.equal(validateCandidate(`${make(3200)}\n${wrapped('[{"op":"replace","path":"/世界/时刻","value":"20:45"},{"op":"replace","path":"/世界/时刻","value":"20:50"}]')}`, adapter).ok, false);
});

test('strict MVU wrapper requires exactly Analysis then JSONPatch with no loose text', () => {
  assert.equal(validateCandidate(`${make(3200)}\n<UpdateVariable><JSONPatch>${patch()}</JSONPatch></UpdateVariable>`, adapter).ok, false);
  assert.equal(validateCandidate(`${make(3200)}\n<UpdateVariable><Analysis>one</Analysis><Analysis>two</Analysis><JSONPatch>${patch()}</JSONPatch></UpdateVariable>`, adapter).ok, false);
  assert.equal(validateCandidate(`${make(3200)}\n<UpdateVariable><Analysis>one</Analysis>loose<JSONPatch>${patch()}</JSONPatch></UpdateVariable>`, adapter).ok, false);
  assert.equal(validateCandidate(`${make(3200)}\n<UpdateVariable><analysis>one</analysis><JSONPatch>${patch()}</JSONPatch></UpdateVariable>`, adapter).ok, false);
  assert.equal(validateCandidate(`${make(3200)}\n<updatevariable><Analysis>one</Analysis><JSONPatch>${patch()}</JSONPatch></updatevariable>`, adapter).ok, false);
  assert.equal(validateCandidate(`${make(3200)}\n<UpdateVariable foo="bar"><Analysis>one</Analysis><JSONPatch>${patch()}</JSONPatch></UpdateVariable>`, adapter).ok, false);
  assert.equal(validateCandidate(`${make(3200)}\n<UpdateVariable><Analysis>只检查变量。</Analysis><JSONPatch>${patch()}</JSONPatch></UpdateVariable>`, adapter).ok, false);
  assert.equal(validateCandidate(`${make(3200)}\n<UpdateVariable><Analysis>${'слово '.repeat(20)}</Analysis><JSONPatch>${patch()}</JSONPatch></UpdateVariable>`, adapter).ok, false);
  assert.equal(validateCandidate(`${make(3200)}\n<UpdateVariable><Analysis>${'ことば '.repeat(20)}</Analysis><JSONPatch>${patch()}</JSONPatch></UpdateVariable>`, adapter).ok, false);
  assert.equal(validateCandidate(`${make(3200)}\n<UpdateVariable><Analysis>${'word '.repeat(81)}</Analysis><JSONPatch>${patch()}</JSONPatch></UpdateVariable>`, adapter).ok, false);
  assert.equal(validateCandidate(`${make(3200)}\n<UpdateVariable><Analysis>One variable changed.</Analysis><JSONPatch>Here is patch: ${patch()}</JSONPatch></UpdateVariable>`, adapter).ok, false);
});

test('requires a variable block when the confirmed card protocol says every reply', () => {
  assert.equal(validateCandidate(make(3200), { ...adapter, requireVariableBlock: true }).ok, false);
  assert.equal(validateCandidate(`${make(3200)}\n${wrapped(patch())}`, { ...adapter, requireVariableBlock: true }).ok, true);
});

test('allows at most one top-level variable component across all registered tags', () => {
  const twoTags = { ...adapter, variableTags: ['UpdateVariable', 'StateUpdate'] };
  const raw = `${make(3200)}
<UpdateVariable><JSONPatch>${patch()}</JSONPatch></UpdateVariable>
<StateUpdate><JSONPatch>${patch('/世界/地点', '书房')}</JSONPatch></StateUpdate>`;
  assert.equal(validateCandidate(raw, twoTags).ok, false);
});

test('rejects duplicate nested patch payloads', () => {
  const raw = `${make(3200)}
<UpdateVariable>
<JSONPatch>${patch()}</JSONPatch>
<JSONPatch>${patch('/世界/地点', '书房')}</JSONPatch>
</UpdateVariable>`;
  assert.equal(validateCandidate(raw, adapter).ok, false);
});

test('rejects variable blocks and case-mutated status templates inside content', () => {
  const hiddenVariable = `<content>${body(3200)}<UpdateVariable><JSONPatch>${patch()}</JSONPatch></UpdateVariable></content>`;
  assert.equal(validateCandidate(hiddenVariable, adapter).ok, false);
  const statusAdapter = { ...adapter, statusBarTemplate: '<STATUS>ok</STATUS>' };
  assert.equal(validateCandidate(`<content>${body(3200)}<status>ok</status></content>`, statusAdapter).ok, false);
  const unclosedOuter = `<content>${body(3200)}<UpdateVariable><JSONPatch>${patch()}</JSONPatch></content>`;
  const barePatch = `<content>${body(3200)}<JSONPatch>${patch()}</JSONPatch></content>`;
  assert.equal(validateCandidate(unclosedOuter, adapter).ok, false);
  assert.equal(validateCandidate(barePatch, adapter).ok, false);
});

test('rejects additional meta-drafting phrasings inside content', () => {
  assert.equal(validateCandidate(`<content>${body(3200)}思路如下：先列出场景，再依据节拍展开。下面进入故事。</content>`).ok, false);
  assert.equal(validateCandidate(`<content>${body(3200)}我准备把这一段拆成四幕。第一幕交代书房。</content>`).ok, false);
  assert.equal(validateCandidate(`<content>${body(3200)}内部核验结果：时间与地点一致。</content>`).ok, false);
  assert.equal(validateCandidate(`<content>${body(3200)}我会先从人物的动机谈起，再让冲突逐渐升级。</content>`).ok, false);
  assert.equal(validateCandidate(`<content>${body(3200)}先确定人物的欲望，再安排一个阻力，最后落到行动。</content>`).ok, false);
  assert.equal(validateCandidate(`<content>${body(3200)}这一段应当以书房开场，用对话制造矛盾。</content>`).ok, false);
  assert.equal(validateCandidate(`<content>${body(3200)}我需要先确认事实，然后写出最终内容。</content>`).ok, false);
  assert.equal(validateCandidate(`<content>${body(3200)}为了保持连贯，我会从上一幕的结果切入。</content>`).ok, false);
});

test('does not count Unicode formatting or variation-selector padding', () => {
  const padded = `<content>${body(3199)}${'\u2062'.repeat(200)}${'\ufe0f'.repeat(200)}</content>`;
  const result = validateCandidate(padded);
  assert.equal(result.ok, false);
  assert.equal(result.count, 3199);
});

test('detects full-offset and low-diversity repeated spans', () => {
  const chunk = body(180);
  const shifted = `<content>${body(1700)}甲乙丙丁戊己庚${chunk}${body(1300)}${chunk}</content>`;
  assert.equal(validateCandidate(shifted).ok, false);
  const lowDiversity = `<content>${body(1500)}${'甲'.repeat(320)}${body(1500)}</content>`;
  assert.equal(validateCandidate(lowDiversity).ok, false);
});

test('rejects model-emitted platform assembly components', () => {
  assert.equal(validateCandidate(`<content>${body(3200)}<CONTENT_BOUNDARY/></content>`).ok, false);
  assert.equal(validateCandidate(`<content>${body(3200)}<audit>x</audit></content>`).ok, false);
  assert.equal(validateCandidate(`${make(3200)}\n<StatusPlaceHolderImpl/>`, adapter).ok, false);
});

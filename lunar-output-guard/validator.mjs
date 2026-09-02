const CORE_WORDS = [
  '心湖', '深潭', '涟漪', '小兽', '幼兽', '四肢百骸', '细若蚊呐',
  '难以言喻', '几不可察', '几不可闻', '几不可见', '不易察觉', '难以察觉',
];

const CORE_PATTERNS = [
  ['一抹情绪套话', /一抹[^。！？\n]{0,12}(?:情绪|笑意|神色)/u],
  ['石子投入水面套话', /(?:石子|石头)[^。！？\n]{0,10}(?:投入|落入|掷入|丢入)[^。！？\n]{0,8}(?:湖面|心湖|水面)/u],
  ['声音哭腔套话', /(?:声音|语气)[^。！？\n]{0,18}(?:带着)?[^。！？\n]{0,4}哭腔/u],
  ['声音不容拒绝套话', /(?:声音|语气)[^。！？\n]{0,18}不容拒绝/u],
  ['指节发白套话', /(?:指节|指关节|手关节)[^。！？\n]{0,12}(?:发白|泛白)/u],
  ['眼神闪过情绪套话', /(?:眼神|目光)[^。！？\n]{0,12}闪过[^。！？\n]{0,12}(?:情绪|笑意|冷意|怒意|异色)/u],
  ['小兽比喻套话', /(?:像|仿佛|如同)[^。！？\n]{0,8}(?:小兽|幼兽)/u],
  ['不容置疑套话', /不容(?:置疑|拒绝|错辨)/u],
  ['嘴角弧度套话', /嘴角[^。！？\n]{0,12}(?:勾起|扬起)[^。！？\n]{0,12}(?:弧度|笑意)?/u],
];

const LEAK_PATTERNS = [
  /<\/?thinking\b/iu,
  /<\/?reasoning-guide\b/iu,
  /<\/?review-process\b/iu,
  /(?:第零步|第一步|第二步|第三步|第四步|第五步|第六步)\s*[｜|:：]/u,
  /(?:正文草稿|试写正文|起草正文|完整正文计划|修订正文|补写正文|二次成稿|静默修正|候选稿)/u,
  /(?:让我仔细分析|分析当前情况并规划|规划下一轮回复|开始规划正文|估算字数|先梳理当前|先分析当前|安排这一轮的写法|让我想想|接下来我会写|我来组织结构|现在写正文)/u,
  /(?:我|让我|现在|接下来|随后|先|再|然后)[^。！？\n]{0,20}(?:规划|构思|组织|安排|梳理|检查|分析|决定)[^。！？\n]{0,24}(?:正文|回复|段落|结构|写法|字数|剧情节拍|怎么写|如何写|怎么排)/u,
  /(?:正文|回复|段落|结构|写法|字数|剧情节拍)[^。！？\n]{0,24}(?:规划|构思|组织|安排|梳理|检查|分析|决定|怎么写|如何写|怎么排)/u,
  /(?:写作)?思路\s*(?:如下|[:：])|(?:内部)?核验(?:结果)?\s*(?:如下|[:：])|(?:下面|现在)(?:正式)?进入(?:正文|故事)/u,
  /(?:我准备|我打算|我将|接下来我?(?:会|要)?)[^。！？\n]{0,28}(?:正文|故事|场景|段落|这一段)[^。！？\n]{0,20}(?:拆成|分成|展开|组织|写成|安排)/u,
  /(?:第一幕|第二幕|第三幕|第四幕)[^。！？\n]{0,30}(?:交代|展开|安排|写|转入)/u,
  /(?:我会先|我需要先|先确定|这一段应当|为了保持连贯)[^。！？\n]{0,50}(?:人物的动机|安排一个阻力|冲突逐渐升级|以[^\n]{0,12}开场|最终内容|上一幕|切入)/u,
  /\b(?:let me|i(?:'ll| will)|first|next)\s+(?:analy[sz]e|plan|outline|draft|write|organize)\b/iu,
];

const FORBIDDEN_COMPONENTS = [
  /<\/?CONTENT_BOUNDARY\b[^>]*>/iu,
  /<\/?StatusPlaceHolderImpl\b[^>]*>/iu,
  /<\/?audit\b[^>]*>/iu,
  /<\/?thinking\b[^>]*>/iu,
  /<\/?reasoning-guide\b[^>]*>/iu,
  /<\/?review-process\b[^>]*>/iu,
];

const MVU_PATCH_OPERATIONS = ['replace', 'add', 'remove', 'move', 'delta', 'insert'];

function visibleCharCount(value) {
  return Array.from(String(value ?? '')
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/<[^>]*>/gu, '')
    .replace(/\p{Cf}|\p{Variation_Selector}/gu, '')
    .replace(/\s+/gu, '')).length;
}

function escaped(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tagMatches(text, tag) {
  return [...String(text).matchAll(new RegExp(`<${escaped(tag)}(?:\\s[^>]*)?>`, 'giu'))];
}

function findSingleBlock(text, tag) {
  const re = new RegExp(`<${escaped(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped(tag)}>`, 'giu');
  const matches = [...String(text).matchAll(re)];
  return matches.length === 1 ? matches[0] : null;
}

function extractBlocks(text, tags) {
  const blocks = [];
  for (const tag of tags) {
    const re = new RegExp(`<${escaped(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped(tag)}>`, 'giu');
    for (const match of String(text).matchAll(re)) {
      const index = match.index ?? 0;
      blocks.push({ tag, full: match[0], body: match[1], index, end: index + match[0].length });
    }
  }
  return blocks.sort((a, b) => a.index - b.index);
}

function extractTopLevelBlocks(text, tags) {
  const blocks = extractBlocks(text, tags);
  return blocks.filter((block, index) => !blocks.some((outer, outerIndex) => (
    outerIndex !== index
    && outer.index < block.index
    && outer.end >= block.end
  )));
}

function removeBlocks(text, blocks) {
  let result = String(text);
  for (const block of [...blocks].sort((a, b) => b.index - a.index)) result = result.slice(0, block.index) + result.slice(block.index + block.full.length);
  return result;
}

function checkLargeDuplicate(body) {
  const paragraphs = body.split(/\n\s*\n/gu).map(x => x.trim()).filter(x => x.length >= 120);
  const seenParagraphs = new Set();
  for (const paragraph of paragraphs) {
    if (seenParagraphs.has(paragraph)) return paragraph.slice(0, 40);
    seenParagraphs.add(paragraph);
  }
  const normalized = body.replace(/\s+/gu, '');
  const size = 160;
  const seen = new Map();
  for (let i = 0; i + size <= normalized.length; i += 1) {
    const chunk = normalized.slice(i, i + size);
    const previous = seen.get(chunk);
    if (previous !== undefined && i - previous >= size) return chunk.slice(0, 40);
    if (previous === undefined) seen.set(chunk, i);
  }
  return null;
}

function issue(code, message, extra = {}) {
  return { code, message, ...extra };
}

function isJsonPointer(path) {
  if (typeof path !== 'string' || !path.startsWith('/')) return false;
  return !/~(?![01])/u.test(path);
}

function matchesType(value, expected) {
  const types = String(expected ?? '').split('|').map(x => x.trim().toLowerCase()).filter(Boolean);
  if (!types.length) return false;
  return types.some(type => {
    if (type === 'any') return true;
    if (type === 'null') return value === null;
    if (type === 'string') return typeof value === 'string';
    if (type === 'boolean') return typeof value === 'boolean';
    if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
    if (type === 'integer') return Number.isInteger(value);
    if (type === 'array') return Array.isArray(value);
    if (type === 'object') return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    return false;
  });
}

function parseJsonValue(raw) {
  const text = String(raw ?? '').trim();
  try {
    return { found: true, value: JSON.parse(text) };
  } catch { /* 支持“摘要 + JSON 数组”的真实输出 */ }
  for (let index = text.indexOf('['); index >= 0; index = text.indexOf('[', index + 1)) {
    try {
      const value = JSON.parse(text.slice(index).trim());
      if (Array.isArray(value)) return { found: true, value };
    } catch { /* 继续尝试下一个数组起点 */ }
  }
  return { found: false, value: null };
}

function patchPayload(raw, adapter, errors) {
  const patchTags = Array.isArray(adapter?.patchTags) && adapter.patchTags.length
    ? [...new Set(adapter.patchTags.map(String))]
    : ['JSONPatch'];
  const patchBlocks = extractTopLevelBlocks(raw, patchTags);
  if (patchBlocks.length > 1) {
    errors.push(issue('variable_patch_duplicate', '变量更新外层只能包含一个补丁载荷'));
    return null;
  }
  if (patchBlocks.length === 1) {
    if (adapter?.strictWrapper) {
      const analysisTag = String(adapter.requiredAnalysisTag ?? 'Analysis');
      const patchTag = String(patchBlocks[0].tag);
      const analysisOpenCount = tagMatches(raw, analysisTag).length;
      const analysisCloseCount = [...String(raw).matchAll(new RegExp(`</${escaped(analysisTag)}>`, 'giu'))].length;
      const patchOpenCount = tagMatches(raw, patchTag).length;
      const patchCloseCount = [...String(raw).matchAll(new RegExp(`</${escaped(patchTag)}>`, 'giu'))].length;
      if (analysisOpenCount !== 1 || analysisCloseCount !== 1 || patchOpenCount !== 1 || patchCloseCount !== 1) {
        errors.push(issue('variable_wrapper', `变量更新必须且只能包含一对 <${analysisTag}> 和一对 <${patchTag}>`));
        return null;
      }
      const strictPattern = new RegExp(
        `^\\s*<${escaped(analysisTag)}>([\\s\\S]*?)<\\/${escaped(analysisTag)}>\\s*<${escaped(patchTag)}>([\\s\\S]*?)<\\/${escaped(patchTag)}>\\s*$`,
        'u',
      );
      const strictMatch = String(raw).match(strictPattern);
      if (!strictMatch || !strictMatch[1].trim()) {
        errors.push(issue('variable_wrapper', `变量更新必须严格且仅按 <${analysisTag}>...</${analysisTag}> 后接 <${patchTag}>...</${patchTag}> 包装`));
        return null;
      }
      const analysisText = strictMatch[1].trim();
      if (/<\/?[A-Za-z][^>]*>/u.test(analysisText)) {
        errors.push(issue('variable_wrapper', `${analysisTag} 内不得嵌套其他标签`));
        return null;
      }
      const maxWords = Number(adapter.analysisMaxWords);
      const wordCount = analysisText.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/gu)?.length ?? 0;
      if (adapter.analysisLanguage === 'en' && (/[^\x00-\x7F]/u.test(analysisText) || wordCount === 0)) {
        errors.push(issue('variable_analysis_language', `${analysisTag} 必须使用可校验的 ASCII 英文`));
      }
      if (Number.isFinite(maxWords) && maxWords > 0 && wordCount > maxWords) {
        errors.push(issue('variable_analysis_length', `${analysisTag} 共 ${wordCount} 词，角色卡上限为 ${maxWords} 词`));
      }
      return strictMatch[2].trim();
    }
    const remainder = removeBlocks(raw, patchBlocks).trim();
    const analysisBlocks = extractTopLevelBlocks(remainder, ['Analysis']);
    const summary = removeBlocks(remainder, analysisBlocks).trim();
    if (/<\/?[A-Za-z][^>]*>/u.test(summary)) errors.push(issue('variable_wrapper', '变量更新外层包含未登记的嵌套标签'));
    if (parseJsonValue(summary).found) errors.push(issue('variable_patch_duplicate', '变量更新外层包含第二份补丁载荷'));
    return patchBlocks[0].body.trim();
  }
  return raw;
}

function compatibleTypes(source, destination) {
  const left = String(source ?? '').split('|').map(x => x.trim().toLowerCase()).filter(Boolean);
  const right = String(destination ?? '').split('|').map(x => x.trim().toLowerCase()).filter(Boolean);
  return left.includes('any') || right.includes('any') || left.some(type => right.includes(type));
}

function validatePatchJson(raw, adapter, errors) {
  const payload = patchPayload(raw, adapter, errors);
  if (payload === null) return [];
  let parsed;
  if (adapter?.strictWrapper) {
    try {
      parsed = { found: true, value: JSON.parse(String(payload).trim()) };
    } catch {
      parsed = { found: false, value: null };
    }
  } else {
    parsed = parseJsonValue(payload);
  }
  if (!parsed.found) {
    errors.push(issue('variable_json', '变量更新块不是合法 JSON'));
    return [];
  }
  const value = parsed.value;
  if (!Array.isArray(value) || !value.length || value.some(operation => !operation || typeof operation !== 'object' || Array.isArray(operation))) {
    errors.push(issue('variable_shape', '变量更新必须是非空 JSON Patch 对象数组'));
    return [];
  }
  const allowedPaths = new Set((adapter?.allowedPaths ?? []).map(String));
  const allowedTypes = adapter?.allowedTypes ?? {};
  const allowedOps = new Set(
    Array.isArray(adapter?.allowedOps) && adapter.allowedOps.length
      ? adapter.allowedOps.map(operation => String(operation).toLowerCase()).filter(operation => MVU_PATCH_OPERATIONS.includes(operation))
      : MVU_PATCH_OPERATIONS,
  );
  const seenPaths = new Set();
  for (const operation of value) {
    const op = typeof operation.op === 'string' ? operation.op : '';
    if (!MVU_PATCH_OPERATIONS.includes(op) || !allowedOps.has(op)) {
      errors.push(issue('variable_op', `变量操作未在适配器中确认：${String(operation.op)}`));
    }
    if (!isJsonPointer(operation.path)) errors.push(issue('variable_path', '变量 path 必须是合法 JSON Pointer'));
    else if (!allowedPaths.has(operation.path)) errors.push(issue('variable_path', `变量路径未在适配器中确认：${operation.path}`));
    else if (seenPaths.has(operation.path)) errors.push(issue('variable_path_duplicate', `同一变量路径每轮只能更新一次：${operation.path}`));
    else seenPaths.add(operation.path);
    if (['add', 'replace', 'delta', 'insert'].includes(op)) {
      if (!Object.prototype.hasOwnProperty.call(operation, 'value')) errors.push(issue('variable_value', `操作 ${op} 缺少 value`));
      else if (allowedTypes[operation.path] && !matchesType(operation.value, allowedTypes[operation.path])) errors.push(issue('variable_type', `变量 ${operation.path} 的值类型不符合适配器：${allowedTypes[operation.path]}`));
    }
    if (op === 'move') {
      if (!isJsonPointer(operation.from) || !allowedPaths.has(operation.from)) errors.push(issue('variable_from', `操作 ${op} 的 from 未在适配器中确认`));
      else if (!compatibleTypes(allowedTypes[operation.from], allowedTypes[operation.path])) errors.push(issue('variable_type', `操作 ${op} 的来源与目标类型不兼容`));
    }
  }
  return value;
}

export const DEFAULT_CORE_WORDS = Object.freeze([...CORE_WORDS]);
export const SUPPORTED_MVU_PATCH_OPS = Object.freeze([...MVU_PATCH_OPERATIONS]);

export function validateCandidate(raw, adapter = null, options = {}) {
  const minChars = Number(options.minChars ?? 3200);
  const maxChars = Number(options.maxChars ?? 3600);
  const coreWords = Array.isArray(options.coreWords) ? options.coreWords : CORE_WORDS;
  const text = String(raw ?? '').replace(/\r\n?/gu, '\n').trim();
  const errors = [];
  const allowedTags = Array.isArray(adapter?.variableTags) ? [...new Set(adapter.variableTags.map(String))] : [];
  const leakScope = removeBlocks(text, extractTopLevelBlocks(text, allowedTags));

  for (const pattern of LEAK_PATTERNS) if (pattern.test(leakScope)) errors.push(issue('thinking_leak', `检测到过程性输出：${leakScope.match(pattern)?.[0] ?? ''}`));
  for (const pattern of FORBIDDEN_COMPONENTS) {
    if (pattern.test(text)) errors.push(issue('forbidden_component', '最终回复不得自行输出平台装配组件或审计块'));
    pattern.lastIndex = 0;
  }

  const content = findSingleBlock(text, 'content');
  const openCount = tagMatches(text, 'content').length;
  const closeCount = [...text.matchAll(/<\/content>/giu)].length;
  if (!content || openCount !== 1 || closeCount !== 1) {
    errors.push(issue('content_contract', '必须存在且只能存在一对 <content> 标签'));
    return { ok: false, errors, rendered: null };
  }

  const body = content[1].trim();
  const count = visibleCharCount(body);
  if (count < minChars || count > maxChars) errors.push(issue('length', `正文去空白可见字符数为 ${count}，要求 ${minChars}–${maxChars}`, { count, minChars, maxChars }));
  for (const word of coreWords) if (body.includes(word)) errors.push(issue('core_word', `命中核心禁词：${word}`, { hit: word }));
  for (const [name, pattern] of CORE_PATTERNS) if (pattern.test(body)) errors.push(issue('core_phrase', `命中核心套话：${name}`, { hit: body.match(pattern)?.[0] ?? '' }));
  if (body.includes('——')) errors.push(issue('em_dash', '正文包含连续破折号“——”'));
  const duplicate = checkLargeDuplicate(body);
  if (duplicate) errors.push(issue('duplicate_body', `检测到重复内容：${duplicate}`));

  const before = text.slice(0, content.index).trim();
  const after = text.slice(content.index + content[0].length).trim();
  if (before) errors.push(issue('boundary_contract', '正文前不得输出隔断或其他组件'));
  const protocolTags = [...new Set([
    ...allowedTags,
    ...(Array.isArray(adapter?.patchTags) ? adapter.patchTags.map(String) : []),
    ...(adapter?.requiredAnalysisTag ? [String(adapter.requiredAnalysisTag)] : []),
  ])];
  const bodyProtocolTag = protocolTags.find(tag => new RegExp(`<\\/?${escaped(tag)}(?:\\s[^>]*)?>`, 'iu').test(body));
  if (bodyProtocolTag) errors.push(issue('variable_position', `变量协议标签 <${bodyProtocolTag}> 必须位于正文之后，不得藏在 <content> 内`));
  const variableBlocks = extractTopLevelBlocks(after, allowedTags);
  if (variableBlocks.length > 1) errors.push(issue('variable_duplicate', '每轮最多允许一个顶层变量更新块'));
  const remainder = removeBlocks(after, variableBlocks).trim();
  if (remainder) errors.push(issue('unexpected_extra', '正文后存在未登记的组件或解释文字', { extra: remainder.slice(0, 120) }));

  if (adapter?.stateSystem) {
    if (!adapter.confirmed) errors.push(issue('adapter_unconfirmed', '角色卡状态适配器尚未确认'));
    if (!String(adapter.statusBarTemplate ?? '').trim()) errors.push(issue('status_required', '有状态角色卡必须配置非空状态栏模板'));
    if (!Array.isArray(adapter.variableTags) || !adapter.variableTags.length) errors.push(issue('protocol_required', '有状态角色卡必须确认变量更新外层标签'));
    if (!Array.isArray(adapter.allowedPaths) || !adapter.allowedPaths.length) errors.push(issue('schema_required', '有状态角色卡必须确认可写入的 JSON Pointer 路径'));
    if (!adapter.allowedTypes || typeof adapter.allowedTypes !== 'object' || adapter.allowedPaths.some(path => !adapter.allowedTypes[path])) errors.push(issue('schema_types_required', '有状态角色卡必须为每个允许路径确认字段类型'));
    if (adapter.strictWrapper && !String(adapter.requiredAnalysisTag ?? '').trim()) errors.push(issue('protocol_required', '严格变量包装必须确认 Analysis 标签'));
    if (adapter.requireVariableBlock && variableBlocks.length !== 1) errors.push(issue('variable_required', '当前角色卡规定每次回复必须提交且只能提交一个变量更新块'));
    const normalizeMarkup = value => String(value ?? '').toLocaleLowerCase().replace(/\s+/gu, '');
    const statusTemplate = normalizeMarkup(adapter.statusBarTemplate);
    if (statusTemplate && normalizeMarkup(body).includes(statusTemplate)) errors.push(issue('status_position', '状态栏模板不得藏在正文内'));
  }
  const operations = [];
  for (const block of variableBlocks) {
    if (adapter?.strictWrapper) {
      const exactOuter = new RegExp(`^<${escaped(block.tag)}>[\\s\\S]*<\\/${escaped(block.tag)}>$`, 'u');
      if (!exactOuter.test(block.full)) {
        errors.push(issue('variable_wrapper', `变量外层标签必须逐字为 <${block.tag}>...</${block.tag}>，不得改大小写或添加属性`));
        continue;
      }
    }
    operations.push(...validatePatchJson(block.body.trim(), adapter, errors));
  }

  if (errors.length) return { ok: false, errors, rendered: null, body, count };
  const variableBlock = variableBlocks.map(block => block.full).join('\n\n');
  const status = String(adapter?.statusBarTemplate ?? '').trim();
  const parts = ['<CONTENT_BOUNDARY/>', `<content>\n${body}\n</content>`];
  if (variableBlock) parts.push(variableBlock);
  if (status) parts.push(status);
  return { ok: true, errors: [], rendered: parts.join('\n\n'), body, count, variables: variableBlock, operations };
}

export function formatValidationError(errors) {
  return errors.map(error => `- ${error.message}`).join('\n');
}

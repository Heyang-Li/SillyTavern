#!/usr/bin/env python3
"""Fix 林清弦 character card."""
import json, copy, uuid, re

CARD = '/sessions/compassionate-nice-heisenberg/mnt/uploads/5931f7f5-5a47-4c72-9050-909934631de2-1785409967487_林清弦.json'
REF = '/sessions/compassionate-nice-heisenberg/mnt/uploads/5dde1327-e776-4f7c-87e2-f95efd2e6dfd-1785409493868_card.json'
OUT = '/sessions/compassionate-nice-heisenberg/mnt/酒馆写卡/林清弦_fixed.json'

with open(CARD, 'r', encoding='utf-8') as f:
    card = json.load(f)
with open(REF, 'r', encoding='utf-8') as f:
    ref = json.load(f)

ext = card['data']['extensions']
ref_th = ref['data']['extensions']['tavern_helper']
ref_re = ref['data']['extensions']['regex_scripts']

# STEP 1: Fix tavern_helper
print('1. Fix tavern_helper...')
scripts = copy.deepcopy(ref_th['scripts'])

# Simple Zod schema matching 林清弦's variable tree
zod_js = """import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';

export const Schema = z.object({
  系统: z.object({
    时间: z.string(),
    地点: z.string(),
    在场人物: z.array(z.string())
  }),
  林清弦: z.object({
    当前想法: z.string(),
    短期目标: z.string(),
    长期目标: z.string(),
    好感度: z.coerce.number().transform(v => _.clamp(v, 0, 100)),
    堕落值: z.coerce.number().transform(v => _.clamp(v, 0, 100)),
    与user做爱次数: z.coerce.number().transform(v => Math.max(0, v)),
    秘密暴露风险值: z.coerce.number().transform(v => _.clamp(v, 0, 100)),
    身体性器状态: z.object({
      整体淫乱度: z.coerce.number().transform(v => _.clamp(v, 0, 100)),
      当前性欲: z.coerce.number().transform(v => _.clamp(v, 0, 100)),
      胸部: z.object({ 开发度: z.coerce.number().transform(v => _.clamp(v, 0, 200)), 状态与标记: z.string() }),
      阴部: z.object({ 开发度: z.coerce.number().transform(v => _.clamp(v, 0, 200)), 状态与标记: z.string() }),
      阴蒂: z.object({ 开发度: z.coerce.number().transform(v => _.clamp(v, 0, 200)), 状态与标记: z.string() }),
      子宫: z.object({ 开发度: z.coerce.number().transform(v => _.clamp(v, 0, 200)), 状态与标记: z.string() }),
      后庭: z.object({ 开发度: z.coerce.number().transform(v => _.clamp(v, 0, 200)), 状态与标记: z.string() }),
      口腔: z.object({ 开发度: z.coerce.number().transform(v => _.clamp(v, 0, 200)), 状态与标记: z.string() })
    })
  }),
  沈景明: z.object({
    怀疑度: z.coerce.number().transform(v => _.clamp(v, 0, 100)),
    当前状态: z.string()
  })
});

$(() => {
  registerMvuSchema(Schema);
})
"""

clamp_js = """$(async () => {
  await waitGlobalInitialized('Mvu');
  const parts = ['胸部', '阴部', '阴蒂', '子宫', '后庭', '口腔'];
  const rules = [
    { path: '林清弦.好感度', down: -5, up: 10 },
    { path: '林清弦.堕落值', down: -3, up: 8 },
    { path: '林清弦.秘密暴露风险值', down: -5, up: 15 },
    { path: '林清弦.与user做爱次数', down: 0, up: 1 },
    { path: '沈景明.怀疑度', down: -3, up: 8 },
    { path: '林清弦.身体性器状态.整体淫乱度', down: -3, up: 8 },
    { path: '林清弦.身体性器状态.当前性欲', down: -10, up: 10 }
  ];
  for (const part of parts) {
    rules.push({ path: '林清弦.身体性器状态.' + part + '.开发度', down: -5, up: 10 });
  }
  let enabled = false;
  eventOn(tavern_events.GENERATION_ENDED, () => { enabled = true; });
  eventOn(Mvu.events.VARIABLE_INITIALIZED, () => { enabled = false; });
  eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, (variables, variables_before_update) => {
    if (!enabled) return;
    for (const { path, down, up } of rules) {
      const fullPath = 'stat_data.' + path;
      const oldVal = _.get(variables_before_update, fullPath);
      const newVal = _.get(variables, fullPath);
      if (typeof oldVal !== 'number' || typeof newVal !== 'number' || oldVal === newVal) continue;
      const delta = _.clamp(newVal - oldVal, down, up);
      const finalVal = Math.round(oldVal + delta);
      if (finalVal !== newVal) {
        _.set(variables, fullPath, finalVal);
        const dir = newVal > oldVal ? 'uarr' : 'darr';
        toastr.warning(path + ': ' + oldVal + ' ' + dir + ' ' + newVal + ' -> ' + finalVal, 'clamp');
      }
    }
  });
});
"""

for s in scripts:
    s['id'] = str(uuid.uuid4())
    if s['name'] == '变量结构设计':
        s['content'] = zod_js
    elif s['name'] == '数值钳制':
        s['content'] = clamp_js

ext['tavern_helper'] = {'scripts': scripts, 'variables': {}}
print(f'   scripts: {len(scripts)}')

# STEP 2: Fix regex_scripts
print('2. Fix regex_scripts...')
regex_scripts = copy.deepcopy(ref_re)
for rs in regex_scripts:
    rs['id'] = str(uuid.uuid4())
    if rs['scriptName'] == '3.状态栏':
        rs['replaceString'] = '```html\n<body>\n  <script>\n    $(\'body\').load(\'https://testingcf.jsdelivr.net/gh/MagicalAstrogy/SillyTavern@refs/heads/main/LinQingXian/状态栏.html\')\n  </script>\n</body>\n```'
    elif rs['scriptName'] == '开场页':
        rs['disabled'] = True
        rs['findRegex'] = '开场页_暂未启用'
    elif rs['scriptName'] == '[选项]母上主题':
        rs['scriptName'] = '[选项]林清弦主题'
        rs['replaceString'] = '```html\n<body>\n  <script>\n    $(\'body\').load(\'https://testingcf.jsdelivr.net/gh/MagicalAstrogy/SillyTavern@refs/heads/main/LinQingXian/选项.html\')\n  </script>\n</body>\n```'

ext['regex_scripts'] = regex_scripts
print(f'   regex_scripts: {len(regex_scripts)}')

# STEP 3: Disable InitVar + clean null bytes
print('3. Disable InitVar...')
for e in card['data']['character_book']['entries']:
    if e['comment'] == '[InitVar]请勿打开':
        e['enabled'] = False
        e['content'] = e['content'].replace('\x00', '')
        print('   Done')

# STEP 4: variable_list -> status_current_variables
print('4. Fix variable_list...')
for e in card['data']['character_book']['entries']:
    if e['comment'] == '变量列表':
        e['content'] = '---\n<status_current_variables>\n{{format_message_variable::stat_data}}\n</status_current_variables>'
        print('   Done')

# STEP 5: Add missing entries
print('5. Add missing entries...')
entries = card['data']['character_book']['entries']
max_id = max(e['id'] for e in entries)

def mk_ext(pos, idx, depth=0):
    return {
        'position': pos, 'exclude_recursion': True, 'display_index': idx,
        'probability': 100, 'useProbability': True, 'depth': depth,
        'selectiveLogic': 0, 'outlet_name': '', 'group': '',
        'group_override': False, 'group_weight': 100, 'prevent_recursion': True,
        'delay_until_recursion': False, 'scan_depth': None,
        'match_whole_words': None, 'use_group_scoring': False,
        'case_sensitive': None, 'automation_id': '', 'role': 0,
        'vectorized': False, 'sticky': 0, 'cooldown': 0, 'delay': 0,
        'match_persona_description': False, 'match_character_description': False,
        'match_character_personality': False, 'match_character_depth_prompt': False,
        'match_scenario': False, 'match_creator_notes': False,
        'triggers': [], 'ignore_budget': False
    }

# 5a: mvu_update output format
max_id += 1
entries.append({
    'id': max_id, 'keys': [], 'secondary_keys': [],
    'comment': '[mvu_update]变量输出格式',
    'content': '---\nrule:\n  - You should output the update analysis and the actual update commands in the end of the next reply\n  - All variable contents can only be calculated and updated according to <update_rules>\n\n  # Patch format (custom ops; JSON array required)\n  - The update commands must be a valid JSON array, ONLY these ops:\n    - replace: replace the value of an existing path\n    - delta: update an existing NUMBER path by a delta value\n    - insert: create a new property OR append/insert into array/object\n    - remove: remove an existing path\n    - move: move a value from one path to another\n\n  # Readonly fields\n  - Do NOT update any field whose name starts with _\n\n  # Operation distinction\n  - delta: MUST be used when adjusting numeric variable by increment/decrement\n  - replace: MUST be used when setting variable to specific new value\n  - insert: ONLY for creating new property or adding element to array/object\n  - NEVER use insert on existing numeric/string variable to simulate update\n\n  # History context deduplication\n  - Before updating, scan chat history for prior events already reflecting the change\n  - Only update based on NEW events in the CURRENT reply\n\nformat: |-\n  <UpdateVariable>\n  <Analysis>$(IN ENGLISH, no more than 80 words)\n  - ${calculate time passed}\n  - ${history check: scan for events already reflecting variable changes}\n  - ${analyze every variable per its check, current reply only}\n  - ${skip variables already processed in history}\n  - ${verify delta for numeric, replace for absolute, insert only for new}\n  </Analysis>\n  <JSONPatch>\n  [\n    { "op": "replace", "path": "${/path/to/existing/variable}", "value": "${new_value}" },\n    { "op": "delta", "path": "${/path/to/number/variable}", "value": "${delta}" },\n    { "op": "insert", "path": "${/path/to/object/new_key}", "value": "${new_value}" },\n    { "op": "insert", "path": "${/path/to/array/-}", "value": "${new_value}" },\n    { "op": "remove", "path": "${/path/to/object/key}" },\n    { "op": "remove", "path": "${/path/to/array/0}" },\n    { "op": "move", "from": "${/path/to/variable}", "to": "${/path/to/another/path}" }\n  ]\n  </JSONPatch>\n  </UpdateVariable>',
    'constant': True, 'selective': False, 'insertion_order': 9998,
    'enabled': True, 'position': 'after_char', 'use_regex': True,
    'extensions': mk_ext(4, 30)
})
print(f'   Added mvu_update (id={max_id})')

# 5b: Options generation
max_id += 1
entries.append({
    'id': max_id, 'keys': [], 'secondary_keys': [],
    'comment': '选项',
    'content': '---\n在正文结尾生成8个选项，用<options>包裹，选项间用|分隔，禁止换行。\n\n格式要求:\n  - 所有选项均**从<user>的视角出发**\n  - 时间定位: 紧接正文结尾的剧情推动选项\n  - 语言形式: 祈使句，省略主语\n  - 直接写行动内容，不要加任何前缀标签\n  - 用<options>包裹八个选项，禁止换行\n\n内容要求:\n  选项应涵盖以下类型（不标注类型）：\n  必选类型:\n    - 对话/提问\n    - 物理动作\n    - 观察环境\n    - 极快速地大幅度推进剧情\n  适应类型，根据当前剧情状态选择4个最合适的:\n    - 性行为\n    - 亲密接触\n    - 场景转换\n    - 时间跳跃\n    - 物品互动\n    - 情绪表达\n    - 战术动作\n    - 信息获取\n\n输出格式:\n\n<options>选项1|选项2|选项3|选项4|选项5|选项6|选项7|选项8</options>',
    'constant': True, 'selective': False, 'insertion_order': 210,
    'enabled': True, 'position': 'after_char', 'use_regex': True,
    'extensions': mk_ext(4, 31, 2)
})
print(f'   Added 选项 (id={max_id})')

# 5c: Narrative rules
max_id += 1
entries.append({
    'id': max_id, 'keys': [], 'secondary_keys': [],
    'comment': '叙事规则',
    'content': '---\n<叙事规则>\n叙事规则:\n  角色一致性:\n    - 确保{{user}}符合角色卡设定\n    - 林清弦角色核心 - 清冷是生存策略，完美是盔甲，本质是性压抑的欲望女性\n    - 禁止代替{{user}}做出轻视、贬低、掌控、物化林清弦的行为（性爱情趣除外）\n    - 禁止恶意揣测或丑化{{user}}\n\n  语言输出:\n    叙事语言: 中文\n    禁止事项:\n      - 禁止在叙事中插入整句英语或其他外语对话\n      - 禁止使用括号翻译格式\n</叙事规则>\n\n<emotion_design_principles>\n情感设计核心原则:\n  禁止出现的状态:\n    - 麻木、空洞、机械化\n    - 绝望、自我毁灭倾向\n    - 完全的情感切割或死亡\n    - 自我物化或降格\n    - 功利化利用他人\n\n  应该呈现的状态:\n    - 矛盾中的挣扎与成长\n    - 多重情感的共存而非替代\n    - 保持情感活力和人性尊严\n\n  关系动态要求:\n    - 亲密关系是双向的情感流动\n    - 所有角色都应保持基本的人性尊严和情感复杂性\n</emotion_design_principles>',
    'constant': True, 'selective': False, 'insertion_order': 666,
    'enabled': True, 'position': 'after_char', 'use_regex': True,
    'extensions': mk_ext(4, 32)
})
print(f'   Added 叙事规则 (id={max_id})')

# STEP 6: Fix EJS getvar calls - remove {defaults:X}
print('6. Fix EJS getvar calls...')
count = 0
for e in entries:
    old = e['content']
    new = re.sub(r"getvar\('([^']+)',\s*\{defaults:\s*[^}]+\}\)", r"getvar('\1')", old)
    if old != new:
        count += 1
        e['content'] = new
print(f'   Fixed {count} entries')

# STEP 7: Remove null bytes from ALL entries
print('7. Clean null bytes...')
null_count = 0
for e in entries:
    if '\x00' in e['content']:
        e['content'] = e['content'].replace('\x00', '')
        null_count += 1
print(f'   Cleaned {null_count} entries')

# STEP 8: Write output
print('8. Writing output...')
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(card, f, ensure_ascii=False, indent=2)

# STEP 9: Validate
print()
print('=== VALIDATION ===')
th = ext['tavern_helper']
print(f"tavern_helper: {'OK' if isinstance(th, dict) else 'BROKEN'}")
print(f"scripts: {len(th['scripts'])}")
for s in th['scripts']:
    print(f"  [{s['name'][:40]}] enabled={s['enabled']}")
print(f"regex_scripts: {len(ext['regex_scripts'])}")
for rs in ext['regex_scripts']:
    print(f"  [{rs['scriptName'][:30]}] disabled={rs['disabled']}")
print(f"Entries: {len(entries)}")
for e in entries:
    flag = ' DISABLED' if not e['enabled'] else ''
    print(f"  id={e['id']} [{e['comment'][:55]}]{flag}")

print(f"\nDone! -> {OUT}")
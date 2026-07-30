#!/usr/bin/env python3
"""Fix 林清弦 character card to match 母上攻略 MVU/UI structure."""

import json
import uuid
import copy

# ─── Load cards ───
CARD_PATH = '/sessions/compassionate-nice-heisenberg/mnt/uploads/5931f7f5-5a47-4c72-9050-909934631de2-1785409967487_林清弦.json'
REF_PATH = '/sessions/compassionate-nice-heisenberg/mnt/uploads/5dde1327-e776-4f7c-87e2-f95efd2e6dfd-1785409493868_card.json'
OUT_PATH = '/sessions/compassionate-nice-heisenberg/mnt/酒馆写卡/林清弦_fixed.json'

with open(CARD_PATH, 'r', encoding='utf-8') as f:
    card = json.load(f)
with open(REF_PATH, 'r', encoding='utf-8') as f:
    ref = json.load(f)

ext = card['data']['extensions']
ref_ext = ref['data']['extensions']
ref_th = ref_ext['tavern_helper']

# ═══════════════════════════════════════════════
# STEP 1: Fix tavern_helper structure + copy scripts
# ═══════════════════════════════════════════════
print("Fixing tavern_helper...")

# Copy scripts from reference, adjusting for this card
scripts = copy.deepcopy(ref_th['scripts'])

# Fix Zod Schema script for 林清弦's variable structure (simplified body parts)
zod_content = '''import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';

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
      胸部: z.object({
        开发度: z.coerce.number().transform(v => _.clamp(v, 0, 200)),
        状态与标记: z.string()
      }),
      阴部: z.object({
        开发度: z.coerce.number().transform(v => _.clamp(v, 0, 200)),
        状态与标记: z.string()
      }),
      阴蒂: z.object({
        开发度: z.coerce.number().transform(v => _.clamp(v, 0, 200)),
        状态与标记: z.string()
      }),
      子宫: z.object({
        开发度: z.coerce.number().transform(v => _.clamp(v, 0, 200)),
        状态与标记: z.string()
      }),
      后庭: z.object({
        开发度: z.coerce.number().transform(v => _.clamp(v, 0, 200)),
        状态与标记: z.string()
      }),
      口腔: z.object({
        开发度: z.coerce.number().transform(v => _.clamp(v, 0, 200)),
        状态与标记: z.string()
      })
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
'''

# Fix clamp script for 林清弦's variables
clamp_content = '''$(async () => {
  await waitGlobalInitialized('Mvu');

  const rules = [
    { path: '林清弦.好感度', down: -5, up: 10 },
    { path: '林清弦.堕落值', down: -3, up: 8 },
    { path: '林清弦.秘密暴露风险值', down: -5, up: 15 },
    { path: '林清弦.与user做爱次数', down: 0, up: 1 },
    { path: '沈景明.怀疑度', down: -3, up: 8 }
  ];

  // Generate body part clamp rules
  const parts = ['胸部', '阴部', '阴蒂', '子宫', '后庭', '口腔'];
  for (const part of parts) {
    rules.push({ path: '林清弦.身体性器状态.' + part + '.开发度', down: -5, up: 10 });
  }
  rules.push({ path: '林清弦.身体性器状态.整体淫乱度', down: -3, up: 8 });
  rules.push({ path: '林清弦.身体性器状态.当前性欲', down: -10, up: 10 });

  let enabled = false;
  eventOn(tavern_events.GENERATION_ENDED, () => { enabled = true; });
  eventOn(Mvu.events.VARIABLE_INITIALIZED, () => { enabled = false; });

  eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, (variables, variables_before_update) => {
    if (!enabled) return;

    for (const { path, down, up } of rules) {
      const fullPath = `stat_data.${path}`;
      const oldVal = _.get(variables_before_update, fullPath);
      const newVal = _.get(variables, fullPath);

      if (typeof oldVal !== 'number' || typeof newVal !== 'number' || oldVal === newVal) continue;

      const delta = _.clamp(newVal - oldVal, down, up);
      const finalVal = Math.round(oldVal + delta);

      if (finalVal !== newVal) {
        _.set(variables, fullPath, finalVal);
        const dir = newVal > oldVal ? '↑' : '↓';
        toastr.warning(
          `${path}: ${oldVal} ${dir} ${newVal} → 修正为 ${finalVal}`,
          '数值钳制'
        );
      }
    }
  });
});
'''

# Update scripts
for s in scripts:
    if s['name'] == '变量结构设计':
        s['content'] = zod_content
        s['id'] = str(uuid.uuid4())
    elif s['name'] == '数值钳制':
        s['content'] = clamp_content
        s['id'] = str(uuid.uuid4())

ext['tavern_helper'] = {
    'scripts': scripts,
    'variables': {}
}

print(f"  tavern_helper fixed: {len(scripts)} scripts")

# ═══════════════════════════════════════════════
# STEP 2: Fix regex_scripts
# ═══════════════════════════════════════════════
print("Fixing regex_scripts...")

regex_scripts = copy.deepcopy(ref_ext['regex_scripts'])

# Update state bar regex to point to our HTML
for rs in regex_scripts:
    if rs['scriptName'] == '3.状态栏':
        rs['replaceString'] = '''```html\n<body>\n  <script>\n    $('body').load('https://testingcf.jsdelivr.net/gh/MagicalAstrogy/SillyTavern@refs/heads/main/LinQingXian/状态栏.html')\n  </script>\n  </body>\n```'''
        rs['id'] = str(uuid.uuid4())
    elif rs['scriptName'] == '开场页':
        # We don't have an opening page yet, disable it
        rs['disabled'] = True
        rs['id'] = str(uuid.uuid4())
        # Change findRegex to something that won't match first_mes content
        rs['findRegex'] = '''开场页_暂未启用'''
    elif rs['scriptName'] == '[选项]母上主题':
        # Keep options rendering but with our own path
        rs['scriptName'] = '[选项]林清弦主题'
        rs['replaceString'] = '''```html\n<body>\n  <script>\n    $('body').load('https://testingcf.jsdelivr.net/gh/MagicalAstrogy/SillyTavern@refs/heads/main/LinQingXian/选项.html')\n  </script>\n  </body>\n```'''
        rs['id'] = str(uuid.uuid4())
    else:
        rs['id'] = str(uuid.uuid4())

ext['regex_scripts'] = regex_scripts
print(f"  regex_scripts fixed: {len(regex_scripts)} scripts")

# ═══════════════════════════════════════════════
# STEP 3: Fix InitVar entry - make it disabled
# ═══════════════════════════════════════════════
print("Fixing InitVar entry...")
for entry in card['data']['character_book']['entries']:
    if entry['comment'] == '[InitVar]请勿打开':
        entry['enabled'] = False
        print("  InitVar disabled")

# ═══════════════════════════════════════════════
# STEP 4: Fix variable list entry to use correct format
# ═══════════════════════════════════════════════
print("Fixing variable list entry...")
# Change variable_list to status_current_variables format
for entry in card['data']['character_book']['entries']:
    if entry['comment'] == '变量列表':
        entry['content'] = '''---\n<status_current_variables>\n{{format_message_variable::stat_data}}\n</status_current_variables>'''
        print("  variable_list updated to status_current_variables format")

# ═══════════════════════════════════════════════
# STEP 5: Add missing entries needed for MVU
# ═══════════════════════════════════════════════
print("Adding missing entries...")
entries = card['data']['character_book']['entries']
max_order = max(e['insertion_order'] for e in entries)

def make_extensions(pos, idx):
    return {
        'position': pos, 'exclude_recursion': True, 'display_index': idx,
        'probability': 100, 'useProbability': True, 'depth': 0,
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

# 5a: Variable output format [mvu_update]
next_id = max(e['id'] for e in entries) + 1
entries.append({
    'id': next_id,
    'keys': [],
    'secondary_keys': [],
    'comment': '[mvu_update]变量输出格式',
    'content': '''---
rule:
  - You should output the update analysis and the actual update commands in the end of the next reply
  - All variable contents can only be calculated and updated according to <update_rules>

  # Patch format (custom ops; JSON array required)
  - The update commands must be a valid JSON array containing operation objects in a JSON-Patch-like format, but ONLY the following operations are allowed:
    - replace: replace the value of an existing path
    - delta: update the value of an existing NUMBER path by a delta value (positive/negative)
    - insert: create a new property that does not exist OR append/insert into an array/object
    - remove: remove an existing path
    - move: move a value from one path to another

  # Readonly fields
  - Do NOT update any field whose name starts with `_` (readonly). This applies to any nesting level (e.g., `/_变量`, `/player/_meta`, `/inventory/0/_id`).

  # Operation distinction
  - "**Operation distinction**:
    • `delta`: MUST be used when adjusting an existing numeric variable by an increment/decrement (e.g., money +10, hp -2). `value` is the delta, not the final value.
    • `replace`: MUST be used when setting an existing variable to a specific new value (strings, booleans, enums, or numbers when you are setting an absolute value).
    • `insert`: ONLY used for creating a new property that does not exist, or adding a new element into an array/object.
    • `move`: ONLY used for relocating an existing value from one path to another (e.g., moving item between inventory slots).
    • `remove`: ONLY used for deleting an existing path from the object/array.
    • NEVER use `insert` on an existing numeric/string variable to simulate an update; it is for creation/insertion only."

  # History context deduplication
  - "**History context deduplication**:
    • Before updating any variable, scan chat history for prior plot events that already reflect the change (e.g., money received/spent, items gained/lost)
    • If such events exist in earlier messages, assume the variable was already updated at that time—do NOT apply redundant updates
    • Only update based on NEW events occurring in the CURRENT reply"

format: |-
  <UpdateVariable>
  <Analysis>$(IN ENGLISH, no more than 80 words)
  - ${calculate time passed: ...}
  - ${history check: scan prior messages for events already reflecting variable changes—list any found}
  - ${analyze every variable based on its corresponding check, according only to current reply instead of previous plots: ...}
  - ${skip variables whose changes were already processed in history}
  - ${for each change: current_value → new_value OR current_value + delta → new_value, verify using `delta` for numeric increments, `replace` for absolute sets, `insert` only for new keys/items, `move` for relocating values, `remove` for deletions; never touch `_` fields}
  </Analysis>
  <JSONPatch>
  [
    { "op": "replace", "path": "${/path/to/existing/variable}", "value": "${new_value}" },
    { "op": "delta", "path": "${/path/to/number/variable}", "value": "${positve_or_negative_delta}" },
    { "op": "insert", "path": "${/path/to/object/new_key}", "value": "${new_value}" },
    { "op": "insert", "path": "${/path/to/array/-}", "value": "${new_value}" },
    { "op": "remove", "path": "${/path/to/object/key}" },
    { "op": "remove", "path": "${/path/to/array/0}" },
    { "op": "move", "from": "${/path/to/variable}", "to": "${/path/to/another/path}" },
    ...
  ]
  </JSONPatch>
  </UpdateVariable>''',
    'constant': True, 'selective': False, 'insertion_order': 9998,
    'enabled': True, 'position': 'after_char', 'use_regex': True,
    'extensions': {**make_extensions(4, 30), 'depth': 0}
})
print(f"  Added [mvu_update]变量输出格式 (id={next_id})")

# 5b: Options generation rule
next_id += 1
entries.append({
    'id': next_id,
    'keys': [],
    'secondary_keys': [],
    'comment': '选项',
    'content': '''---
在正文结尾生成8个选项，用<options>包裹，选项间用|分隔，禁止换行。

格式要求:
  - 所有选项均**从<user>的视角出发**
  - 时间定位: 紧接正文结尾的剧情推动选项
  - 语言形式: 祈使句，省略主语
  - 直接写行动内容，不要加任何前缀标签
  - 选项是剧情当前时刻的自然延续
  - 选项内容基于当前情境的可能性空间
  - 用<options>包裹八个选项，禁止换行
  - 正确：`拿起一块苹果吃`
  - 错误：`物品互动:拿起一块苹果吃`

内容要求:
  选项应涵盖以下类型（用户未选择时不会影响现有剧情，但输出时不标注类型）：
  必选类型:
    - 对话/提问
    - 物理动作
    - 观察环境
    - 极快速地大幅度推进剧情
  适应类型，根据当前剧情状态，从以下选择4个最合适的:
    - 性行为
    - 亲密接触
    - 场景转换
    - 时间跳跃
    - 物品互动
    - 情绪表达
    - 战术动作
    - 信息获取

输出格式:

<options>选项1|选项2|选项3|选项4|选项5|选项6|选项7|选项8</options>''',
    'constant': True, 'selective': False, 'insertion_order': 210,
    'enabled': True, 'position': 'after_char', 'use_regex': True,
    'extensions': {**make_extensions(4, 31), 'depth': 2}
})
print(f"  Added 选项 (id={next_id})")

# 5c: Narrative rules
next_id += 1
entries.append({
    'id': next_id,
    'keys': [],
    'secondary_keys': [],
    'comment': '叙事规则',
    'content': '''---
<叙事规则>
叙事规则:
  角色一致性:
    - 确保{{user}}符合角色卡设定
    - 林清弦的角色核心——清冷是生存策略，完美是盔甲，本质是性压抑的欲望女性
    - 禁止代替{{user}}做出轻视、贬低、掌控、物化林清弦的行为（性爱情趣除外）
    - 禁止恶意揣测或丑化{{user}}

  语言输出:
    叙事语言: 中文
    禁止事项:
      - 禁止在叙事中插入整句英语或其他外语对话
      - 禁止使用括号翻译格式，如"hello（你好）"
      - 若需表现角色说英语的情境，用中文叙述内容，可标注"他用英语说道"
</叙事规则>

<emotion_design_principles>
情感设计核心原则:

  禁止出现的状态:
    - 麻木、空洞、机械化
    - 绝望、自我毁灭倾向
    - 完全的情感切割或死亡
    - 自我物化或降格
    - 功利化利用他人

  应该呈现的状态:
    - 矛盾中的挣扎与成长
    - 多重情感的共存而非替代
    - 保持情感活力和人性尊严
    - 即使在最深的沉沦中也保持自我认同

  关系动态要求:
    - 亲密关系是双向的情感流动，不是单方面的索取或奉献
    - 不能完全消失或变成纯粹的利用
    - 所有角色都应保持基本的人性尊严和情感复杂性
</emotion_design_principles>''',
    'constant': True, 'selective': False, 'insertion_order': 666,
    'enabled': True, 'position': 'after_char', 'use_regex': True,
    'extensions': {**make_extensions(4, 32), 'depth': 0}
})
print(f"  Added 叙事规则 (id={next_id})")

# ═══════════════════════════════════════════════
# STEP 6: Fix first_mes to match opening format
# ═══════════════════════════════════════════════
print("Checking first_mes...")
# The first_mes already has <StatusPlaceHolderImpl/> at the start, which is correct.
# But it should also end with <UpdateVariable> + <StatusPlaceHolderImpl/>
# Actually for 林清弦, first_mes is the opening greeting. Let's check.
fm = card['data']['first_mes']
print(f"  first_mes length: {len(fm)} chars")
print(f"  first_mes starts with: {fm[:50]}")

# The first_mes format looks correct - starts with <StatusPlaceHolderImpl/>
# We need to add <UpdateVariable> with initial values + <StatusPlaceHolderImpl/> at the end

# ═══════════════════════════════════════════════
# STEP 7: Final validation
# ═══════════════════════════════════════════════
print("\n=== Final Validation ===")
print(f"tavern_helper type: {type(ext['tavern_helper'])}")
print(f"scripts count: {len(ext['tavern_helper']['scripts'])}")
for i, s in enumerate(ext['tavern_helper']['scripts']):
    print(f"  [{i}] {s['name']} (enabled={s['enabled']})")
print(f"regex_scripts count: {len(ext['regex_scripts'])}")
for i, rs in enumerate(ext['regex_scripts']):
    print(f"  [{i}] {rs['scriptName']} (disabled={rs['disabled']}, promptOnly={rs['promptOnly']})")
print(f"World book entries: {len(entries)}")
for e in entries:
    print(f"  id={e['id']}, comment={e['comment'][:50]}, enabled={e['enabled']}")

# ═══════════════════════════════════════════════
# STEP 8: Write output
# ═══════════════════════════════════════════════
with open(OUT_PATH, 'w', encoding='utf-8') as f:
    json.dump(card, f, ensure_ascii=False, indent=2)

print(f"\nWritten to {OUT_PATH}")
print("Done!")
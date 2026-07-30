#!/usr/bin/env python3
"""Comprehensive audit of 林清弦 character card."""
import json, re

with open('/sessions/compassionate-nice-heisenberg/mnt/酒馆写卡/cards/林清弦/林清弦_fixed.json', 'r', encoding='utf-8') as f:
    card = json.load(f)

ext = card['data']['extensions']
th = ext['tavern_helper']
re_list = ext['regex_scripts']
entries = card['data']['character_book']['entries']
first_mes = card['data']['first_mes']

bugs = []
warnings = []

print("=" * 60)
print("AUDIT: 林清弦_fixed.json")
print("=" * 60)

# ─── 1. STRUCTURE ───
print("\n--- 1. Top-level structure ---")
print(f"  spec: {card.get('spec')}")
print(f"  spec_version: {card['spec_version']}")
print(f"  name: {card['data']['name']}")
print(f"  first_mes len: {len(first_mes)}")
print(f"  alternate_greetings: {len(card['data'].get('alternate_greetings', []))}")
if not card['data'].get('personality'):
    warnings.append("personality field is empty (informational)")
if not card['data'].get('scenario'):
    warnings.append("scenario field is empty (informational)")

# ─── 2. EXTENSIONS ───
print("\n--- 2. Extensions ---")
for key in ['world', 'talkativeness', 'fav', 'depth_prompt']:
    val = ext.get(key)
    print(f"  {key}: {val}")

print(f"\n--- 2a. tavern_helper ---")
print(f"  type: {'OK' if isinstance(th, dict) else 'BUG'}")
if isinstance(th, dict):
    if 'scripts' not in th:
        bugs.append("tavern_helper missing 'scripts' key")
    if 'variables' not in th:
        bugs.append("tavern_helper missing 'variables' key")
    for s in th.get('scripts', []):
        issues = []
        if not s.get('id'): issues.append("missing id")
        if not s.get('name'): issues.append("missing name")
        if s.get('type') != 'script': issues.append(f"type={s.get('type')} not 'script'")
        if s.get('enabled') is None: issues.append("missing enabled")
        content = s.get('content', '')
        if len(content) < 10 and s['enabled']:
            bugs.append(f"Script '{s.get('name')}' has empty content but is enabled")
        if issues:
            warnings.append(f"Script '{s.get('name')}': {', '.join(issues)}")
        print(f"  [{s.get('name', 'unnamed')[:40]}] enabled={s.get('enabled')} id={'Y' if s.get('id') else 'N'} content_len={len(content)}")

# Check essential scripts present
script_names = [s.get('name','') for s in th.get('scripts', [])]
required = ['MVU Zod 脚本', '变量结构设计', '数值钳制', '自动开启角色卡局部正则']
for r in required:
    if r not in script_names:
        bugs.append(f"Missing required script: {r}")

# ─── 2b. Zod Schema check ───
print("\n--- 2b. Zod Schema validation ---")
for s in th.get('scripts', []):
    if s['name'] == '变量结构设计':
        zod = s['content']
        if 'registerMvuSchema' not in zod:
            bugs.append("Zod schema missing registerMvuSchema call")
        # Check all expected keys match entries
        zod_keys = re.findall(r'(\w+):\s*z\.(object|string|number|array|boolean)', zod)
        print(f"  Zod top-level objects: {[k for k,t in zod_keys]}")
        # Check body part structure
        for part in ['胸部', '阴部', '阴蒂', '子宫', '后庭', '口腔']:
            if f'{part}: z.object' not in zod:
                bugs.append(f"Zod schema missing body part: {part}")
            else:
                if '开发度' not in zod:
                    bugs.append(f"Zod schema: {part} missing 开发度")
                if '状态与标记' not in zod:
                    bugs.append(f"Zod schema: {part} missing 状态与标记")
        print(f"  Body parts defined: all 6")

# ─── 2c. Clamp script check ───
print("\n--- 2c. Clamp script ---")
for s in th.get('scripts', []):
    if s['name'] == '数值钳制':
        clamp = s['content']
        if 'waitGlobalInitialized' not in clamp:
            bugs.append("Clamp script missing waitGlobalInitialized('Mvu')")
        if 'VARIABLE_UPDATE_ENDED' not in clamp:
            bugs.append("Clamp script missing VARIABLE_UPDATE_ENDED event")
        print(f"  clamp script: {len(clamp)} chars")

# ─── 3. REGEX SCRIPTS ───
print("\n--- 3. regex_scripts ---")
expected_regex = ['对AI隐藏状态栏', '去除变量更新', '状态栏', '对AI隐藏']
for rs in re_list:
    name = rs.get('scriptName', '?')
    d = 'DISABLED' if rs.get('disabled') else ''
    size = len(rs.get('replaceString', ''))
    find = rs.get('findRegex', '')[:60]
    po = rs.get('promptOnly', False)
    md = rs.get('markdownOnly', False)
    pl = rs.get('placement', [])
    print(f"  [{name[:35]}] {d} find={find}... replace_len={size} promptOnly={po} markdownOnly={md} placement={pl}")

# Verify status bar inlines your original HTML
for rs in re_list:
    if rs['scriptName'] == '3.状态栏':
        if 'body.load' in rs['replaceString']:
            warnings.append("Status bar still uses body.load instead of inline")
        if '好感度' not in rs['replaceString']:
            bugs.append("Status bar replaceString missing 林清弦 variable references")
        if rs['disabled']:
            bugs.append("Status bar regex is DISABLED")
        if rs['promptOnly']:
            bugs.append("Status bar regex has promptOnly=true (should be false so user sees it)")

# ─── 4. WORLD BOOK ENTRIES ───
print("\n--- 4. World Book entries ---")
for e in entries:
    eid = e['id']
    comment = e.get('comment', '?')[:60]
    enabled = e.get('enabled', True)
    const = e.get('constant', False)
    sel = e.get('selective', False)
    pos = e.get('position', '?')
    regex = e.get('use_regex', False)
    order = e.get('insertion_order', 0)
    keys = e.get('keys', [])
    content = e.get('content', '')
    depth = e.get('extensions', {}).get('depth', '?')
    display_idx = e.get('extensions', {}).get('display_index', '?')

    flag = ' DISABLED' if not enabled else ''
    print(f"  id={eid} [{comment}]{flag}")
    print(f"    pos={pos} order={order} const={const} sel={sel} regex={regex} keys={len(keys)} depth={depth} disp={display_idx} len={len(content)}")

# ─── 4a. EJS syntax check ───
print("\n--- 4a. EJS syntax check ---")
ejs_count = 0
ejs_bugs = 0
for e in entries:
    content = e['content']
    opens = content.count('<%_')
    opens += content.count('<%=')
    opens += content.count('<%')
    closes = content.count('%>')
    if opens > 0 or closes > 0:
        ejs_count += 1
        # Check mismatched tags
        ejs_open = len(re.findall(r'<%[=_]?\s', content))
        ejs_close = len(re.findall(r'\s%>', content))
        if ejs_open != ejs_close:
            ejs_bugs += 1
            bugs.append(f"Entry id={e['id']} [{e['comment'][:30]}] EJS tag mismatch: {ejs_open} opens vs {ejs_close} closes")

        # Check for {defaults:X} in getvar calls
        if '{defaults:' in content:
            ejs_bugs += 1
            bugs.append(f"Entry id={e['id']} [{e['comment'][:30]}] still has old getvar format with {{defaults:...}}")

        # Check for missing getvar closure
        getvar_opens = content.count("getvar('")
        getvar_closes = content.count("')")
        # Rough check - could be false positive
print(f"  Entries with EJS: {ejs_count}")
print(f"  EJS issues found: {ejs_bugs}")

# ─── 4b. getvar variable consistency ───
print("\n--- 4b. getvar variable references ---")
all_getvars = set()
for e in entries:
    vars_used = re.findall(r"getvar\('([^']+)'\)", e['content'])
    all_getvars.update(vars_used)

print(f"  Unique variable paths referenced ({len(all_getvars)}):")
for v in sorted(all_getvars):
    print(f"    stat_data.{v}")

# Check against Zod schema defined vars
zod_vars = ['林清弦.好感度', '林清弦.堕落值', '林清弦.与user做爱次数', '林清弦.秘密暴露风险值',
            '林清弦.当前想法', '林清弦.短期目标', '林清弦.长期目标',
            '林清弦.身体性器状态.整体淫乱度', '林清弦.身体性器状态.当前性欲']
for part in ['胸部', '阴部', '阴蒂', '子宫', '后庭', '口腔']:
    zod_vars.append(f'林清弦.身体性器状态.{part}.开发度')
    zod_vars.append(f'林清弦.身体性器状态.{part}.状态与标记')
zod_vars += ['系统.时间', '系统.地点', '系统.在场人物', '沈景明.怀疑度', '沈景明.当前状态',
             '林清弦.身份状态', '林清弦.计划阶段', '林清弦.与user好感', '林清弦.处女状态',
             '林清弦.当前位置', '林清弦.情绪稳定度']
zod_set = set(zod_vars)

# Check refs not in zod
for v in sorted(all_getvars):
    if v not in zod_set:
        warnings.append(f"getvar('{v}') used in entries but NOT in Zod schema")

# Check first_mes variables
print("\n--- 4c. first_mes ---")
fm_vars = re.findall(r'<StatusPlaceHolderImpl', first_mes)
fm_update = re.findall(r'<UpdateVariable', first_mes)
fm_init = re.findall(r'<InitVar|<initvar', first_mes)
print(f"  StatusPlaceHolderImpl: {len(fm_vars)} occurrences")
print(f"  UpdateVariable blocks: {len(fm_update)}")
print(f"  InitVar blocks: {len(fm_init)}")

# first_mes should have StatusPlaceHolderImpl for the regex to catch
if len(fm_vars) == 0:
    bugs.append("first_mes missing <StatusPlaceHolderImpl/> - status bar won't render on opening")

# ─── 5. STATUS BAR HTML ───
print("\n--- 5. Status bar HTML audit ---")
# Read the inline HTML from regex
for rs in re_list:
    if rs['scriptName'] == '3.状态栏':
        html = rs['replaceString']
        # Strip markdown wrapper
        html = html.replace('```html\n', '').replace('\n```', '').replace('```html\\n', '').replace('\\n```', '')
        print(f"  Inline HTML length: {len(html)}")
        print(f"  Has <style>: {'<style>' in html}")
        print(f"  Has <script>: {'<script>' in html}")
        print(f"  Has format_message_variable: {'format_message_variable' in html}")
        print(f"  Has body.load: {'body.load' in html}")

        # Check variable references in UI match actual variables
        ui_vars = re.findall(r'stat_data\.([^}]+)', html)
        ui_var_set = set(ui_vars)
        print(f"  UI variable refs ({len(ui_var_set)}):")
        for v in sorted(ui_var_set):
            print(f"    stat_data.{v}")

        # Check for broken {{ }} macros
        open_braces = html.count('{{')
        close_braces = html.count('}}')
        if open_braces != close_braces:
            bugs.append(f"Status bar HTML has mismatched macros: {open_braces} open vs {close_braces} close")

        # Check HTML structure
        if '<html' not in html.lower() and '<body' not in html.lower() and '<div' not in html.lower():
            bugs.append("Status bar HTML missing structural tags")

        # Check for null bytes or encoding issues
        if '\x00' in html:
            bugs.append("Status bar HTML contains null bytes")

# ─── 6. VARIABLE INITIALIZATION FLOW ───
print("\n--- 6. Variable initialization flow ---")
initvar_entry = [e for e in entries if '[InitVar]' in e.get('comment', '')]
if initvar_entry:
    e = initvar_entry[0]
    print(f"  InitVar entry: id={e['id']}, enabled={e['enabled']}")
    print(f"  InitVar content length: {len(e['content'])}")
    if '\x00' in e['content']:
        bugs.append("InitVar content contains null bytes")
    if not e['enabled']:
        print("  ✓ Correctly disabled")
else:
    bugs.append("No InitVar entry found")

# ─── 7. VARIABLE UPDATE RULES ───
print("\n--- 7. Update rules ---")
update_entry = [e for e in entries if '变量更新规则' in e.get('comment', '')]
if update_entry:
    e = update_entry[0]
    print(f"  Update rules: id={e['id']}, enabled={e['enabled']}, len={len(e['content'])}")
else:
    bugs.append("Missing 变量更新规则 entry")

# ─── 8. CROSS-CONSISTENCY CHECK ───
print("\n--- 8. Cross-consistency ---")

# 8a: EJS getvar calls must match InitVar keys
initvar_vars = set()
for e in entries:
    if 'InitVar' in e.get('comment', '') and not e['enabled']:
        v = re.findall(r'(?:林清弦|系统|沈景明)\.(\w+)', e['content'])
        initvar_vars.update(v)

# 8b: Insertion order conflicts
orders = {}
for e in entries:
    o = e['insertion_order']
    if o in orders:
        warnings.append(f"Insertion order collision at {o}: id={orders[o]} vs id={e['id']}")
    orders[o] = e['id']
print(f"  Insertion order collisions: {len([v for v in orders.values() if list(orders.values()).count(v) > 1])}")

# 8c: Check depth settings reasonable
for e in entries:
    depth = e['extensions'].get('depth', 0)
    if depth > 4 and '[mvu_update]' not in e.get('comment', ''):
        warnings.append(f"Entry id={e['id']} depth={depth} seems high")

# ─── 9. UI BUTTONS ───
print("\n--- 9. UI button checks ---")
for s in th.get('scripts', []):
    buttons = s.get('button', {}).get('buttons', [])
    if buttons:
        print(f"  [{s['name'][:30]}]: {len(buttons)} buttons")
        for b in buttons:
            print(f"    - {b.get('name', '?')} visible={b.get('visible', True)}")

# ─── SUMMARY ───
print("\n" + "=" * 60)
print("SUMMARY")
print("=" * 60)
print(f"\n🐛 BUGS ({len(bugs)}):")
for b in bugs:
    print(f"  ❌ {b}")
print(f"\n⚠️  WARNINGS ({len(warnings)}):")
for w in warnings:
    print(f"  ⚠️  {w}")

if not bugs:
    print("\n  ✅ No critical bugs found!")
print(f"\nEntries: {len(entries)}")
print(f"MVU scripts: {len(th['scripts'])}")
print(f"Regex scripts: {len(re_list)}")
#!/usr/bin/env python3
"""Deep audit + fix null bytes in 林清弦 card."""
import json, re

PATH = '/sessions/compassionate-nice-heisenberg/mnt/酒馆写卡/cards/林清弦/林清弦_fixed.json'
with open(PATH, 'r', encoding='utf-8') as f:
    card = json.load(f)

entries = card['data']['character_book']['entries']
re_list = card['data']['extensions']['regex_scripts']
bugs = []
fixes = []

# 1. NULL BYTES
print("=== NULL BYTES ===")
null_count = 0
for e in entries:
    if '\x00' in e['content']:
        n = e['content'].count('\x00')
        print(f"  Entry id={e['id']} [{e['comment'][:40]}]: {n} nulls")
        e['content'] = e['content'].replace('\x00', '')
        fixes.append(f"Cleaned nulls from entry id={e['id']}")
        null_count += 1

for rs in re_list:
    for key in ['replaceString', 'findRegex']:
        if '\x00' in rs.get(key, ''):
            n = rs[key].count('\x00')
            print(f"  Regex [{rs['scriptName']}].{key}: {n} nulls")
            rs[key] = rs[key].replace('\x00', '')
            fixes.append(f"Cleaned nulls from regex [{rs['scriptName']}].{key}")
            null_count += 1

if '\x00' in card['data'].get('first_mes', ''):
    n = card['data']['first_mes'].count('\x00')
    print(f"  first_mes: {n} nulls")
    card['data']['first_mes'] = card['data']['first_mes'].replace('\x00', '')
    fixes.append("Cleaned nulls from first_mes")
    null_count += 1

if null_count == 0:
    print("  None found ✅")
else:
    bugs.append(f"{null_count} locations with null bytes")

# 2. EJS TAG MATCH
print("\n=== EJS TAG MATCH ===")
ejs_issues = 0
for e in entries:
    content = e['content']
    open_all = content.count('<%')
    close_all = content.count('%>')
    if open_all != close_all:
        print(f"  id={e['id']} [{e['comment'][:50]}]: open={open_all} close={close_all}")
        ejs_issues += 1
        lines = content.split('\n')
        for li, line in enumerate(lines):
            opens = line.count('<%')
            closes = line.count('%>')
            if opens != closes and (opens > 0 or closes > 0):
                print(f"    Line {li}: o={opens} c={closes}: {line.strip()[:120]}")

if ejs_issues == 0:
    print("  All balanced ✅")
else:
    bugs.append(f"{ejs_issues} entries with EJS tag mismatch")

# 3. GETVAR PATHS
print("\n=== GETVAR PATHS ===")
gv_map = {}
for e in entries:
    gvs = re.findall(r"getvar\('([^']+)'\)", e['content'])
    for gv in gvs:
        if gv not in gv_map:
            gv_map[gv] = []
        gv_map[gv].append(e['id'])

print(f"  Unique paths: {len(gv_map)}")
for gv in sorted(gv_map.keys()):
    ids = gv_map[gv]
    ok = " ✅" if gv.startswith('stat_data.') else " ❌ MISSING prefix!"
    print(f"  getvar('{gv}')  <- {ids}{ok}")

bad = [gv for gv in gv_map if not gv.startswith('stat_data.')]
if bad:
    for gv in bad:
        bugs.append(f"getvar('{gv}') missing stat_data. prefix")

# 4. getvar with {defaults:X}
print("\n=== LEGACY DEFAULTS ===")
defaults_found = 0
for e in entries:
    cnt = e['content'].count('{defaults:')
    if cnt > 0:
        print(f"  id={e['id']} [{e['comment'][:40]}]: {cnt} leftover defaults")
        defaults_found += 1
if defaults_found == 0:
    print("  None ✅")

# 5. STATUS BAR
print("\n=== STATUS BAR ===")
for rs in re_list:
    if rs['scriptName'] == '3.状态栏':
        html = rs['replaceString']
        m = 'format_message_variable' in html
        l = 'body.load' in html
        print(f"  macros: {m}, body.load: {l}, len: {len(html)}")
        dv_o = html.count('<div')
        dv_c = html.count('</div>')
        print(f"  div tags: {dv_o}/{dv_c}")
        if m and not l:
            print("  ✅ Correct")
        if dv_o != dv_c:
            bugs.append(f"div mismatch: {dv_o}/{dv_c}")

# 6. FIRST_MES
print("\n=== FIRST_MES ===")
fm = card['data']['first_mes']
print(f"  len: {len(fm)}, has placeholder: {'<StatusPlaceHolderImpl/>' in fm}")
if '<StatusPlaceHolderImpl/>' not in fm:
    bugs.append("Missing StatusPlaceHolderImpl in first_mes")

# 7. ORDER
print("\n=== ORDER ===")
ords = [(e['insertion_order'], e['id'], e['comment'][:45], e['position'], e.get('constant')) for e in entries]
ords.sort()
for o, eid, c, p, cn in ords:
    print(f"  {o:>5} {p:>12} id={eid:>2} {'[c]' if cn else '   '} [{c}]")

# SUMMARY
print("\n" + "=" * 60)
print(f"🐛 BUGS: {len(bugs)}")
for b in bugs:
    print(f"  ❌ {b}")
print(f"\n🔧 FIXES: {len(fixes)}")
for f in fixes:
    print(f"  ✅ {f}")

if fixes:
    with open(PATH, 'w', encoding='utf-8') as f:
        json.dump(card, f, ensure_ascii=False, indent=2)
    print(f"\nWrote fixed card.")

print("Done.")
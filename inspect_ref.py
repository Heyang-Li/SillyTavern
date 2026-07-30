import json

# Read reference card (母上攻略)
ref_path = '/sessions/compassionate-nice-heisenberg/mnt/uploads/5dde1327-e776-4f7c-87e2-f95efd2e6dfd-1785409493868_card.json'
with open(ref_path, 'r', encoding='utf-8') as f:
    ref = json.load(f)

th = ref['data']['extensions']['tavern_helper']
print('ref tavern_helper type:', type(th))
if isinstance(th, dict):
    scripts = th.get('scripts', [])
    print('scripts count:', len(scripts))
    for i, s in enumerate(scripts):
        print(f'  [{i}] name={s.get("name","")}, type={s.get("type","")}, enabled={s.get("enabled")}')
        print(f'      content first 80 chars: {s.get("content","")[:80]}')
        btns = s.get('button', {}).get('buttons', [])
        if btns:
            for b in btns:
                print(f'      button: {b.get("name","")}')

# Also extract regex_scripts
regex_scripts = ref['data']['extensions']['regex_scripts']
print('\nref regex_scripts count:', len(regex_scripts))
for i, rs in enumerate(regex_scripts):
    print(f'  [{i}] scriptName={rs.get("scriptName","")}, disabled={rs.get("disabled")}, promptOnly={rs.get("promptOnly")}, markdownOnly={rs.get("markdownOnly")}')
    print(f'      findRegex (first 100): {rs.get("findRegex","")[:100]}')
    print(f'      replaceString (first 100): {rs.get("replaceString","")[:100]}')
    print(f'      placement: {rs.get("placement")}')
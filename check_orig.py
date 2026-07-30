import json
path = '/sessions/compassionate-nice-heisenberg/mnt/uploads/5931f7f5-5a47-4c72-9050-909934631de2-1785409967487_林清弦.json'
with open(path, 'r', encoding='utf-8') as f:
    c = json.load(f)

# All top-level keys
print("Top keys:", list(c.keys()))

# data keys
print("data keys:", list(c['data'].keys()))

# extensions
ext = c['data']['extensions']
print("extensions keys:", list(ext.keys()))
print("extensions type:", type(ext))

# Check ALL keys inside extensions for any script/regex content
for key in ext:
    val = ext[key]
    if isinstance(val, str):
        print(f"  extensions.{key} (str, len={len(val)}): {val[:200]}...")
    elif isinstance(val, (list, dict)):
        if isinstance(val, list):
            print(f"  extensions.{key} (list, len={len(val)})")
        else:
            print(f"  extensions.{key} (dict, keys={list(val.keys())})")
            if 'regex' in str(key).lower() or 'script' in str(key).lower():
                print(f"    content: {json.dumps(val, ensure_ascii=False)[:500]}")

# Check world book for regex entries
for e in c['data']['character_book']['entries']:
    content = e.get('content', '')
    if 'load(' in content or '状态栏' in content or 'StatusPlaceHolder' in content:
        print(f"\nWorld book entry id={e['id']} comment={e['comment']}:")
        print(f"  content snippet: {content[:500]}")
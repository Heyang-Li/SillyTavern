import json
with open('/sessions/cool-stoic-gates/mnt/林清弦/林清弦_fixed.json','r') as f:
    data = json.load(f)

ext = data['data']['extensions']
print(json.dumps(ext, indent=2, ensure_ascii=False)[:4000])
import json
with open('/sessions/cool-stoic-gates/mnt/林清弦/林清弦_fixed.json','r') as f:
    data = json.load(f)

th = data['data']['extensions']['tavern_helper']
vs = th.get('variables', {})
print('variables keys:', list(vs.keys()))
for k,v in vs.items():
    if isinstance(v, dict):
        print(f'  {k}:', json.dumps(v, ensure_ascii=False)[:400])
    elif isinstance(v, str):
        print(f'  {k}:', v[:300])

scripts = th.get('scripts', {})
print('\nscripts keys:', list(scripts.keys()))
for k,v in scripts.items():
    print(f'  {k}:')
    if isinstance(v, dict):
        for k2, v2 in v.items():
            print(f'    {k2}: {str(v2)[:200]}')

dp = data['data']['extensions'].get('depth_prompt', {})
print(f'\ndepth_prompt:', json.dumps(dp, ensure_ascii=False)[:400])
import json
with open('/sessions/cool-stoic-gates/mnt/林清弦/林清弦_fixed.json','r') as f:
    data = json.load(f)

th = data['data']['extensions']['tavern_helper']
print("tavern_helper:")
print(json.dumps(th, indent=2, ensure_ascii=False)[:2000])

print("\n=== depth_prompt ===")
dp = data['data']['extensions'].get('depth_prompt', {})
print(json.dumps(dp, indent=2, ensure_ascii=False)[:500])

print("\n=== talkativeness ===")
print(data['data']['extensions'].get('talkativeness', 'N/A'))

print("\n=== post_history_instructions ===")
phi = data['data'].get('post_history_instructions', '')
print(f"'{phi}'")
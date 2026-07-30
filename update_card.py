#!/usr/bin/env python3
"""Replace state bar with user's original UI and copy card to cards/林清弦"""
import json, shutil, os

# Read user's original UI
UI_PATH = '/sessions/compassionate-nice-heisenberg/mnt/uploads/bf321ab0-1afc-46b8-b729-4b5828329ad1-1785418912365_状态栏界面.html'
with open(UI_PATH, 'r', encoding='utf-8') as f:
    ui_html = f.read()
print(f'UI HTML: {len(ui_html)} chars')

# Read fixed card
CARD_PATH = '/sessions/compassionate-nice-heisenberg/mnt/酒馆写卡/林清弦_fixed.json'
with open(CARD_PATH, 'r', encoding='utf-8') as f:
    card = json.load(f)

# Update status bar regex
for rs in card['data']['extensions']['regex_scripts']:
    if rs['scriptName'] == '3.状态栏':
        # Replace with inline HTML format
        escaped = ui_html.replace('\\', '\\\\').replace('`', '\\`')
        rs['replaceString'] = '```html\\n' + ui_html + '\\n```'
        print(f'Updated status bar to inline HTML')
        break

# Write updated card
with open(CARD_PATH, 'w', encoding='utf-8') as f:
    json.dump(card, f, ensure_ascii=False, indent=2)
print('Card updated')

# Copy to cards/林清弦 directory
DEST_DIR = '/sessions/compassionate-nice-heisenberg/mnt/酒馆写卡/cards/林清弦'
os.makedirs(DEST_DIR, exist_ok=True)
DEST_PATH = os.path.join(DEST_DIR, '林清弦.json')
shutil.copy2(CARD_PATH, DEST_PATH)
print(f'Copied to {DEST_PATH}')

# Also copy the UI HTML there
UI_DEST = os.path.join(DEST_DIR, '状态栏界面.html')
shutil.copy2(UI_PATH, UI_DEST)
print(f'Copied UI to {UI_DEST}')

print('Done!')
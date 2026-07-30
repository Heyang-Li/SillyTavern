#!/usr/bin/env python3
import shutil

# Copy card
shutil.copy2(
    '/sessions/compassionate-nice-heisenberg/mnt/酒馆写卡/林清弦_fixed.json',
    '/sessions/compassionate-nice-heisenberg/mnt/酒馆写卡/cards/林清弦/林清弦.json'
)
print('Card copied')

# Copy UI
shutil.copy2(
    '/sessions/compassionate-nice-heisenberg/mnt/uploads/bf321ab0-1afc-46b8-b729-4b5828329ad1-1785418912365_状态栏界面.html',
    '/sessions/compassionate-nice-heisenberg/mnt/酒馆写卡/cards/林清弦/状态栏界面.html'
)
print('UI copied')

print('Done')
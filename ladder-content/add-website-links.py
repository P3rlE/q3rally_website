"""Reapply the website-backlink changes to an existing Ladder checkout.

Run as the owner of the Ladder files. Existing website links are left alone.
"""
import argparse
from datetime import datetime
from pathlib import Path
import os
import shutil
import subprocess
import tempfile

parser = argparse.ArgumentParser()
parser.add_argument('--ladder-root', type=Path, default=Path('/var/www/ladder'))
parser.add_argument('--backup-root', type=Path, default=Path.home())
arguments = parser.parse_args()
url = 'https://www.q3rally.com/'
link = '\n<div style="padding:12px 20px"><a href="' + url + '" style="color:#ff5500">← Q3Rally Website</a></div>'
updates = []
for name in ['index.php', 'admin.php']:
    file = arguments.ladder_root / name
    text = file.read_text()
    if url in text:
        print(name + ': existing website link retained')
        continue
    if text.count('<body>') != 1:
        raise SystemExit(name + ': body element differs; no changes made')
    updates.append((file, text.replace('<body>', '<body>' + link, 1)))
if not updates:
    raise SystemExit(0)
backup = arguments.backup_root / ('ladder-link-backup-' + datetime.now().strftime('%Y%m%d-%H%M%S-%f'))
backup.mkdir(mode=0o700)
staged = []
try:
    for file, text in updates:
        shutil.copy2(file, backup / file.name)
        fd, name = tempfile.mkstemp(prefix='.' + file.name + '-', dir=file.parent)
        temporary = Path(name)
        staged.append((temporary, file))
        with os.fdopen(fd, 'w') as output:
            output.write(text)
        shutil.copymode(file, temporary)
        subprocess.run(['php', '-l', str(temporary)], check=True)
    for temporary, file in staged:
        os.replace(temporary, file)
finally:
    for temporary, _ in staged:
        temporary.unlink(missing_ok=True)
print('Website links installed. Backup:', backup)

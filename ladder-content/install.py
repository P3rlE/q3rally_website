"""Run as root on the server: python3 install.py (backs up admin and validates PHP first)."""
from pathlib import Path
from datetime import datetime
import os
import pwd
import shutil
import subprocess
import tempfile

root = Path('/var/www/ladder')
content = Path('/var/www/content.q3rally.com')
source = Path(__file__).resolve().parent
if os.geteuid() != 0:
    raise SystemExit('Run this installer with sudo.')
admin = root / 'admin.php'
text = admin.read_text()
marker = '<nav class="tabs">'
link = '\n    <a href="content-upload.php" class="tab-btn">Content Uploader</a>'
if 'content-upload.php' not in text:
    if text.count(marker) != 1:
        raise SystemExit('Admin navigation differs from expected layout; no changes made.')
    updated = text.replace(marker, marker + link, 1)
else:
    updated = text
for name in ['content-upload.php', 'content-library.php']:
    subprocess.run(['php', '-l', str(source / name)], check=True)
subprocess.run(['php', '-r', 'exit(class_exists("ZipArchive") ? 0 : 1);'], check=True)
# Verify the existing index before creating directories or modifying permissions.
import json
index = json.loads((content / 'index.json').read_text())
if index.get('version') != 1 or not isinstance(index.get('content'), list):
    raise SystemExit('Unexpected index format; no changes made.')
backup = Path('/var/backups') / ('q3rally-content-' + datetime.now().strftime('%Y%m%d-%H%M%S-%f'))
backup.mkdir(mode=0o700)
shutil.copy2(admin, backup / 'admin.php')
shutil.copy2(content / 'index.json', backup / 'index.json')
for name in ['content-upload.php', 'content-library.php']:
    if (root / name).exists():
        shutil.copy2(root / name, backup / name)
staged = []
try:
    for name, data in [(name, (source / name).read_text()) for name in ['content-library.php', 'content-upload.php']] + [('admin.php', updated)]:
        fd, temp_name = tempfile.mkstemp(prefix='.' + name + '-', dir=root)
        path = Path(temp_name)
        with os.fdopen(fd, 'w') as output:
            output.write(data)
        staged.append((path, root / name))
        subprocess.run(['php', '-l', str(path)], check=True)
        os.chmod(path, 0o644)
        stat = admin.stat()
        os.chown(path, stat.st_uid, stat.st_gid)
    account = pwd.getpwnam('www-data')
    private = Path('/var/lib/q3rally-content-upload')
    if private.is_symlink():
        raise SystemExit('Private staging path must not be a symlink.')
    private.mkdir(mode=0o700, exist_ok=True)
    os.chown(private, account.pw_uid, account.pw_gid)
    os.chmod(private, 0o700)
    # Only the content root (atomic index rename) and the six destination dirs.
    # Do not recursively change existing content-file ownership or permissions.
    directories = [content] + [content / group / category for group in ['files','previews'] for category in ['tracks','vehicles','skins']]
    for directory in directories:
        if directory.is_symlink() or not directory.is_dir():
            raise SystemExit(f'Unexpected/missing content directory: {directory}')
    (backup / 'directory-permissions.json').write_text(json.dumps([{
        'path': str(directory), 'uid': directory.stat().st_uid, 'gid': directory.stat().st_gid,
        'mode': directory.stat().st_mode & 0o7777,
    } for directory in directories], indent=2))
    for directory in directories:
        stat = directory.stat()
        os.chown(directory, stat.st_uid, account.pw_gid)
        os.chmod(directory, (stat.st_mode & 0o7777) | 0o070)
    for temporary, destination in staged:
        os.replace(temporary, destination)
finally:
    for temporary, _ in staged:
        temporary.unlink(missing_ok=True)
print('Installed. Backup:', backup)
print('Open https://ladder.q3rally.com/admin.php and select Content Uploader.')
print('Existing PK3 files and index entries were not modified.')

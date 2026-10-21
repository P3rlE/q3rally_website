#!/usr/bin/env python3
"""Patch the installed Ladder's rank handling without replacing its API/UI."""
from pathlib import Path
import argparse
import datetime
import os
import re
import shutil
import subprocess
import tempfile


def patch(source):
    if 'website_profile_with_score_rank' in source:
        return source
    if 'return is_array($data) ? profile_with_score_rank($data) : null;' in source:
        return source  # Earlier rank fix is already installed.
    start = source.index('function profile_load(')
    end = source.index('function profile_save(', start)
    old = 'return is_array($data) ? $data : null;'
    if source[start:end].count(old) != 1:
        raise ValueError('Unknown profile_load implementation; nothing changed.')
    source = source[:start] + source[start:end].replace(old, 'return is_array($data) ? website_profile_with_score_rank($data) : null;') + source[end:]
    source, n = re.subn(r'(function profile_save\(string \$playerId, array \$data\): void\s*\{)', r'\1\n    $data = website_profile_with_score_rank($data);', source, count=1)
    if n != 1 or source.count('declare(strict_types=1);') != 1:
        raise ValueError('Unknown PHP structure; nothing changed.')
    return source.replace('declare(strict_types=1);', "declare(strict_types=1);\nrequire_once __DIR__ . '/website-profile-ranks.php';", 1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ladder', type=Path, default=Path('/var/www/ladder'))
    args = parser.parse_args()
    path = args.ladder / 'index.php'
    source = path.read_text()
    updated = patch(source)
    if updated == source:
        print('Rank correction already installed; no changes.')
        return
    base = Path(__file__).resolve().parents[1]
    helper = (base / 'ladder/profile-ranks.php').read_text().replace('LADDER_RANK_', 'WEBSITE_LADDER_RANK_').replace('profile_rank_from_score', 'website_profile_rank_from_score').replace('profile_with_score_rank', 'website_profile_with_score_rank')
    helper_path = args.ladder / 'website-profile-ranks.php'
    backup = Path('/var/backups') / ('q3rally-ranks-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f'))
    # Validate both files before changing the installed files.
    with tempfile.TemporaryDirectory() as tmp:
        for name, text in [('index.php', updated), ('website-profile-ranks.php', helper)]:
            candidate = Path(tmp) / name
            candidate.write_text(text)
            subprocess.run(['php', '-l', str(candidate)], check=True)
    backup.mkdir(mode=0o700)
    shutil.copy2(path, backup / path.name)
    if helper_path.exists():
        shutil.copy2(helper_path, backup / helper_path.name)
    stat = path.stat()
    # Install helper first; index replacement is atomic and preserves permissions.
    for dest, text in [(helper_path, helper), (path, updated)]:
        fd, temp = tempfile.mkstemp(prefix='.rank-update-', dir=args.ladder)
        try:
            with os.fdopen(fd, 'w') as f:
                f.write(text)
            os.chmod(temp, stat.st_mode & 0o777)
            os.chown(temp, stat.st_uid, stat.st_gid)
            os.replace(temp, dest)
        finally:
            if os.path.exists(temp):
                os.unlink(temp)
    print(f'Rank correction installed. Backup: {backup}')


if __name__ == '__main__':
    main()

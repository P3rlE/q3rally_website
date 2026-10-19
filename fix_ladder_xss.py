#!/usr/bin/env python3
"""XSS fix for the ladder page of www.q3rally.com.

esc() did not escape quotes, but its result is used inside HTML attributes
(data-player="${esc(name)}"), so a player name with a quote could add its own
attributes (onmouseover=...). This script
  - makes esc() escape " and ' as well,
  - escapes the two profile values that were inserted without esc().
It keeps a backup next to each file (*.bak-xss) and changes nothing when the
file is already fixed.

Usage on the server:
  cd /var/www/q3rally-site
  python3 fix_ladder_xss.py src/pages/ladder.astro dist/ladder/index.html
"""
import shutil
import sys

OLD_ESC = "replace(/>/g,'&gt;'); }"
NEW_ESC = "replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;'); }"
WRAPS = [
    ('<div class="pc-stat-val">${sv(val)}</div>', '<div class="pc-stat-val">${esc(sv(val))}</div>'),
    ('<div class="pc-mode-name">${modeLabel(key)}</div>', '<div class="pc-mode-name">${esc(modeLabel(key))}</div>'),
]


def fix(path: str) -> None:
    text = open(path, encoding="utf-8").read()
    original = text
    if NEW_ESC in text:
        print(f"{path}: esc() already escapes quotes")
    elif text.count(OLD_ESC) == 1:
        text = text.replace(OLD_ESC, NEW_ESC)
        print(f"{path}: esc() fixed")
    else:
        sys.exit(f"{path}: esc() not found as expected ({text.count(OLD_ESC)} matches) - nothing changed")
    for old, new in WRAPS:
        if old in text:
            text = text.replace(old, new)
            print(f"{path}: escaped {old[old.index('${'):old.index('}') + 1]}")
    if text != original:
        shutil.copy2(path, path + ".bak-xss")
        open(path, "w", encoding="utf-8").write(text)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    for name in sys.argv[1:]:
        fix(name)

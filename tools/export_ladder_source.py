#!/usr/bin/env python3
"""Export a source-only Ladder snapshot; never modify the running installation."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import tempfile

LITERAL = r"(?:'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\")"
SENSITIVE = re.compile(r'password|passwd|secret|token|api_?key|private_?key', re.I)
PLACEHOLDER = re.compile(r'^(?:|YOUR_[A-Z_]+|CHANGE_ME|REPLACE_ME|EXAMPLE_[A-Z_]+)$')


def unquote(value):
    return value[1:-1]


def sanitize(text):
    changes = []
    def constant(match):
        name = match['name']
        if SENSITIVE.search(name):
            changes.append(name)
            return match['prefix'] + "''"
        if name == 'KEYS_NOTIFY_EMAIL':
            changes.append(name)
            return match['prefix'] + "'admin@example.com'"
        return match[0]
    text = re.sub(r'(?P<prefix>\bconst\s+(?P<name>[A-Za-z_][A-Za-z_0-9]*)\s*=\s*)(?P<value>'+LITERAL+r')(?=\s*;)', constant, text)
    def define(match):
        if SENSITIVE.search(unquote(match['name'])):
            changes.append(unquote(match['name']))
            return match['prefix'] + "''"
        return match[0]
    text = re.sub(r'(?P<prefix>\bdefine\(\s*(?P<name>'+LITERAL+r')\s*,\s*)(?P<value>'+LITERAL+r')(?=\s*\))', define, text)
    def assignment(match):
        if SENSITIVE.search(match['name']):
            changes.append('$'+match['name'])
            return match['prefix'] + "''"
        return match[0]
    text = re.sub(r'(?P<prefix>\$(?P<name>[A-Za-z_][A-Za-z_0-9]*)\s*=\s*)(?P<value>'+LITERAL+r')(?=\s*;)', assignment, text)
    return text, changes


def sanitize_htaccess(text):
    """Omit server-only credential directives, retaining unrelated Apache rules."""
    output = []
    changes = []
    continuation = False
    directive = re.compile(r"^\s*(?:#\s*)?(SetEnv|php_value|php_admin_value)\s+([A-Za-z_][A-Za-z_0-9.-]*)\s+", re.I)
    for line in text.splitlines(keepends=True):
        if continuation:
            continuation = line.rstrip().endswith('\\')
            continue
        match = directive.match(line)
        if match and match[2] == 'LADDER_NOTIFY_EMAIL':
            changes.append(match[2])
            output.append('SetEnv LADDER_NOTIFY_EMAIL "admin@example.com"\n')
            continuation = line.rstrip().endswith('\\')
        elif match and SENSITIVE.search(match[2]):
            changes.append(match[2])
            output.append('# Server-only setting omitted: ' + match[2] + ' (' + match[1] + '). Configure outside Git.\n')
            continuation = line.rstrip().endswith('\\')
        else:
            output.append(line)
    return ''.join(output), changes


def findings(text):
    found = []
    signatures = [r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
                  r'gh[pousr]_[A-Za-z0-9]{30,}', r'github_pat_[A-Za-z0-9_]{30,}',
                  r'AKIA[0-9A-Z]{16}', r'\bsk[A-Za-z0-9_-]{60,}',
                  r'https?://[^\s/:]+:[^\s/@]+@']
    for number, line in enumerate(text.splitlines(), 1):
        if any(re.search(pattern, line) for pattern in signatures):
            found.append((number, 'credential-like signature'))
        # Stop on nonempty literal array settings or quoted server environment values.
        for match in re.finditer(r'(?P<name>'+LITERAL+r')\s*=>\s*(?P<value>'+LITERAL+r')', line):
            if SENSITIVE.search(unquote(match['name'])) and not PLACEHOLDER.fullmatch(unquote(match['value'])):
                found.append((number, 'sensitive literal array setting'))
        if re.search(r'\b(?:SetEnv|php_value)\s+\S*(?:PASSWORD|SECRET|TOKEN|API_KEY)\S*\s+\S+', line, re.I):
            found.append((number, 'server credential setting'))
    return found


def export(source, output):
    source = source.resolve(strict=True)
    if output.exists():
        raise RuntimeError('Output file already exists; choose a new name to preserve it.')
    with tempfile.TemporaryDirectory(prefix='q3-ladder-export-') as temporary:
        root = Path(temporary)/'ladder'
        root.mkdir()
        files = []
        for file in sorted(source.iterdir()):
            if file.is_symlink():
                raise RuntimeError('Unexpected symlink at '+file.name+'; inspect locally before exporting.')
            if file.is_file() and (file.suffix.lower() in ['.php','.md','.txt'] or file.name in ['.htaccess','logo.png','de.png','en.png']):
                files.append(file)
        for name in ['arena','avatars','background','images']:
            directory = source/name
            if not directory.is_dir():
                raise RuntimeError('Missing expected asset directory: '+name)
            for file in sorted(directory.rglob('*')):
                if file.is_symlink():
                    raise RuntimeError('Asset symlink requires local inspection: '+str(file.relative_to(source)))
                if file.is_file():
                    if file.suffix.lower() not in ['.arena','.png','.jpg','.jpeg','.webp']:
                        raise RuntimeError('Unexpected asset file: '+str(file.relative_to(source)))
                    files.append(file)
        sanitized = []
        blocked = []
        for file in files:
            relative = file.relative_to(source)
            destination = root/relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            if file.suffix.lower() in ['.php','.md','.txt','.arena'] or file.name == '.htaccess':
                text = file.read_text(encoding='utf-8')
                if file.suffix.lower() == '.php':
                    text, changes = sanitize(text)
                    sanitized.extend({'file':str(relative),'setting':setting} for setting in changes)
                if file.name == '.htaccess':
                    text, changes = sanitize_htaccess(text)
                    sanitized.extend({'file':str(relative),'setting':setting} for setting in changes)
                blocked.extend((str(relative),number,reason) for number,reason in findings(text))
                destination.write_text(text, encoding='utf-8')
            else:
                shutil.copyfile(file,destination)
            destination.chmod(0o644)
        if blocked:
            for file, line, reason in blocked:
                print(f'REVIEW REQUIRED: {file}:{line}: {reason} (value omitted)')
            raise RuntimeError('No archive created. Resolve flagged settings in a separate export copy first; do not upload originals.')
        for file in root.rglob('*.php'):
            checked = subprocess.run(['php','-l',str(file)],capture_output=True,text=True)
            if checked.returncode:
                raise RuntimeError('Exported PHP syntax check failed: '+str(file.relative_to(root)))
        manifest = {'created':datetime.now(timezone.utc).isoformat(),
                    'excluded':['data/','*.bak','local env/config files not on the allowlist'],
                    'sanitized':sanitized,
                    'files':{str(file.relative_to(root)):hashlib.sha256(file.read_bytes()).hexdigest() for file in sorted(root.rglob('*')) if file.is_file()}}
        (root/'SOURCE-EXPORT.json').write_text(json.dumps(manifest,indent=2)+'\n')
        (root/'SERVER-CONFIG.md').write_text('''# Server-only settings\n\nThis snapshot excludes runtime data, backups and local environment files.\nLiteral password/token defaults have been cleared in the exported PHP only.\nSensitive SetEnv/php_value directives are omitted from the exported .htaccess.\nConfigure these settings privately on the destination server before deployment.\nKEYS_NOTIFY_EMAIL, if present, uses admin@example.com as an example.\nThe live installation was not changed. Before using this source on a new server,\nconfigure authentication through the environment variable already used by\nkeys_require_admin(); never commit the administrator password. Review keys.php\nfor the exact variable name. Existing server data and secrets need separate backups.\n''')
        with tarfile.open(output, 'w:gz') as archive:
            archive.add(root,arcname='ladder')
        output.chmod(0o600)
        print('Export ready:',output)
        print('Files:',len(files),'Cleared/example settings:',len(sanitized))
        print('Excluded runtime data and old backups. Live installation unchanged.')
        print('SHA256:',hashlib.sha256(output.read_bytes()).hexdigest())


if __name__=='__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,default=Path('/var/www/ladder'))
    parser.add_argument('--output',type=Path,default=Path.home()/('q3rally-ladder-source-'+datetime.now().strftime('%Y%m%d-%H%M%S')+'.tar.gz'))
    args=parser.parse_args()
    try: export(args.source,args.output)
    except (OSError,RuntimeError,UnicodeError) as error:
        parser.exit(1,'Export stopped: '+str(error)+'\n')

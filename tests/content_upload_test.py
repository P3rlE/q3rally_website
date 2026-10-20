"""Real HTTP upload tests with temporary content tree and a test-only auth adapter."""
import base64
from concurrent.futures import ThreadPoolExecutor
import hashlib
from http.cookiejar import CookieJar
from io import BytesIO
import json
import os
from pathlib import Path
import shutil
import re
import signal
import socket
import subprocess
import tempfile
import time
import unittest
import urllib.error
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
CHUNK = 4194304


def pk3(path='maps/test.bsp', data=b'test level', compression=zipfile.ZIP_DEFLATED):
    output = BytesIO()
    with zipfile.ZipFile(output, 'w', compression) as archive:
        archive.writestr(path, data)
    return output.getvalue()


def multipart(fields, files):
    boundary = 'q3rally-upload-test-boundary'
    chunks = []
    for key, value in fields.items():
        chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode())
    for key, (filename, content) in files.items():
        chunks += [f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"; filename="{filename}"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode(), content, b'\r\n']
    chunks.append(f'--{boundary}--\r\n'.encode())
    return b''.join(chunks), 'multipart/form-data; boundary=' + boundary


class UploadTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.base = Path(cls.temp.name)
        cls.web = cls.base / 'ladder'
        cls.web.mkdir()
        cls.content = cls.base / 'content'
        cls.stage = cls.base / 'private'
        cls.stage.mkdir()
        for group in ['files', 'previews']:
            for category in ['tracks', 'vehicles', 'skins']:
                (cls.content / group / category).mkdir(parents=True)
        for file in ['content-library.php', 'content-upload.php']:
            shutil.copy2(ROOT / 'ladder-content' / file, cls.web / file)
        # This adapter models only the documented keys.php contract, not production authentication.
        (cls.web / 'keys.php').write_text('''<?php
function keys_require_admin() {
    session_start();
    if (($_SERVER['HTTP_X_TEST_ADMIN'] ?? '') !== 'yes') { http_response_code(401); exit; }
}
function keys_admin_csrf_ok() { return ($_POST['csrf'] ?? '') === 'test-csrf'; }
function keys_admin_csrf_token() { return 'test-csrf'; }
''')
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        cls.url = f'http://127.0.0.1:{port}/content-upload.php'
        command = [os.environ.get('PHP', 'php'), '-n']
        if os.environ.get('PHP_ZIP'):
            command += ['-d', 'extension=' + os.environ['PHP_ZIP']]
        command += ['-d', 'upload_max_filesize=8M', '-d', 'post_max_size=10M', '-d', f'session.save_path={cls.stage}', '-S', f'127.0.0.1:{port}', '-t', str(cls.web)]
        cls.server = subprocess.Popen(command, env={**os.environ, 'Q3RALLY_CONTENT_ROOT': str(cls.content), 'Q3RALLY_CONTENT_STAGING': str(cls.stage), 'PHP_CLI_SERVER_WORKERS': '4'}, start_new_session=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(100):
            try:
                urllib.request.urlopen(cls.url)
            except urllib.error.HTTPError:
                break
            except OSError:
                time.sleep(.05)
        else:
            raise RuntimeError('Server did not start')

    @classmethod
    def tearDownClass(cls):
        os.killpg(cls.server.pid, signal.SIGTERM)
        cls.server.wait(timeout=5)
        cls.temp.cleanup()

    def setUp(self):
        self.initial = {'version': 1, 'updated': '2026-03-20', 'extra': 'preserved', 'content': [{'id': 'Existing', 'type': 'track', 'file': 'existing.pk3', 'custom': 'keep me'}]}
        (self.content / 'index.json').write_text(json.dumps(self.initial))
        for group in ['files', 'previews']:
            for file in (self.content / group).glob('*/*'):
                file.unlink()
        self.client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))
        # Establish a tab/login session for ownership binding.
        self.call()

    def call(self, action=None, fields=None, files=None, csrf='test-csrf', auth=True, client=None):
        headers = {'X-Test-Admin': 'yes'} if auth else {}
        body = None
        if action:
            body, content_type = multipart({'action': action, 'csrf': csrf, **(fields or {})}, files or {})
            headers['Content-Type'] = content_type
        request = urllib.request.Request(self.url, data=body, headers=headers)
        try:
            response = (client or self.client).open(request, timeout=20)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            text = response.read().decode()
            return response.status, json.loads(text) if action and text else text

    def start(self, data, **overrides):
        meta = dict(id='Test', name='Test Map', author='Test Author', version='v1', type='track', filename='test.pk3', size=len(data), dependencies=['Existing'])
        meta.update(overrides)
        return self.call('start', {'metadata': json.dumps(meta)})

    def transfer(self, upload, data):
        for number, offset in enumerate(range(0, len(data), CHUNK)):
            status, result = self.call('chunk', {'upload': upload, 'number': str(number)}, {'file': ('blob', data[offset:offset+CHUNK])})
            self.assertEqual(status, 200, result)

    def publish(self, data, **meta):
        status, result = self.start(data, **meta)
        self.assertEqual(status, 200, result)
        self.transfer(result['upload'], data)
        return self.call('finish', {'upload': result['upload']})

    def test_publish_categories_preserves_index_and_integrity(self):
        for kind, folder in [('track', 'tracks'), ('vehicle', 'vehicles'), ('skin', 'skins')]:
            data = pk3()
            status, result = self.publish(data, id=kind, type=kind, filename=kind+'.pk3')
            self.assertEqual(status, 200, result)
            entry = result['entry']
            self.assertEqual(entry['checksum_md5'], hashlib.md5(data).hexdigest())
            self.assertEqual(entry['size'], len(data))
            self.assertEqual(entry['url'], f'https://content.q3rally.com/files/{folder}/{kind}.pk3')
            self.assertEqual((self.content / 'files' / folder / (kind+'.pk3')).read_bytes(), data)
        index = json.loads((self.content / 'index.json').read_text())
        self.assertEqual(index['extra'], 'preserved')
        self.assertEqual(index['content'][0], self.initial['content'][0])
        self.assertEqual(len(index['content']), 4)
        self.assertEqual(len(list(self.stage.glob('index-*.json'))) >= 3, True)

    def test_authentication_csrf_and_upload_ownership(self):
        self.assertEqual(self.call(auth=False)[0], 401)
        self.assertEqual(self.call('start', csrf='bad')[0], 403)
        status, start = self.start(pk3())
        self.assertEqual(status, 200)
        other = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))
        self.call(client=other)
        self.assertEqual(self.call('finish', {'upload': start['upload']}, client=other)[0], 400)
        self.assertEqual(json.loads((self.content/'index.json').read_text()), self.initial)

    def test_invalid_names_ids_dependencies(self):
        for override in [dict(filename='../evil.pk3'), dict(filename='shell.php'), dict(id='../evil'), dict(type='other'), dict(dependencies=['Unknown']), dict(size=536870913), dict(id='existing')]:
            self.assertEqual(self.start(pk3(), **override)[0], 400, override)

    def test_archive_validation_and_no_partial_publication(self):
        damaged = pk3(compression=zipfile.ZIP_STORED).replace(b'test level', b'bad! level')
        for data in [b'not a zip', damaged, pk3('../escape.cfg'), pk3('/absolute.cfg'), pk3('maps\\evil.bsp'), pk3(compression=zipfile.ZIP_BZIP2)]:
            status, result = self.publish(data)
            self.assertEqual(status, 400, result)
            self.assertEqual(list((self.content/'files/tracks').iterdir()), [])
            self.assertEqual(json.loads((self.content/'index.json').read_text()), self.initial)

    def test_chunk_retries_and_idempotent_finish(self):
        data = pk3(data=os.urandom(CHUNK+1000), compression=zipfile.ZIP_STORED)
        status, start = self.start(data)
        self.assertEqual(status, 200)
        upload = start['upload']
        self.transfer(upload, data)
        self.transfer(upload, data)
        self.assertEqual(self.call('chunk', {'upload': upload,'number':'0'}, {'file':('blob', b'x'*CHUNK)})[0], 400)
        first = self.call('finish', {'upload':upload})
        second = self.call('finish', {'upload':upload})
        self.assertEqual(first[0], 200, first)
        self.assertEqual(first, second)
        self.assertEqual(len(json.loads((self.content/'index.json').read_text())['content']), 2)

    def test_preview_validation_and_duplicate_protection(self):
        data = pk3()
        status, start = self.start(data)
        self.transfer(start['upload'], data)
        self.assertEqual(self.call('finish', {'upload':start['upload']}, {'preview':('evil.jpg', b'<?php echo 1;')})[0], 400)
        png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1sAAAAASUVORK5CYII=')
        status, result = self.call('finish', {'upload':start['upload']}, {'preview':('preview.png', png)})
        self.assertEqual(status, 200, result)
        self.assertEqual(result['entry']['preview'], 'https://content.q3rally.com/previews/tracks/Test.png')
        self.assertEqual(self.start(data)[0], 400)
        self.assertEqual((self.content/'previews/tracks/Test.png').read_bytes(), png)

    def test_concurrent_publish_merges_entries(self):
        clients = []
        uploads = []
        for number in range(4):
            client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))
            previous = self.client; self.client = client
            try:
                self.call()
                status, start = self.start(pk3(), id=f'Parallel{number}', filename=f'parallel{number}.pk3')
                self.assertEqual(status, 200)
                self.transfer(start['upload'], pk3())
                clients.append(client); uploads.append(start['upload'])
            finally:
                self.client = previous
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda args: self.call('finish', {'upload':args[0]}, client=args[1]), zip(uploads,clients)))
        self.assertTrue(all(status==200 for status,_ in results), results)
        index = json.loads((self.content/'index.json').read_text())
        self.assertEqual(len(index['content']), 5)

    def test_invalid_index_and_incomplete_upload(self):
        status, start = self.start(pk3())
        self.assertEqual(self.call('finish', {'upload':start['upload']})[0], 400)
        (self.content/'index.json').write_text('broken')
        self.assertEqual(self.start(pk3())[0], 400)
        self.assertEqual((self.content/'index.json').read_text(), 'broken')

    def delete(self, entry, **changes):
        # Use PHP's exact entry serialization via the revision embedded in the real UI.
        status, html = self.call()
        revision = re.search(r'data-id="' + re.escape(entry['id']) + r'" data-revision="([a-f0-9]+)"', html).group(1)
        fields = dict(id=entry['id'], confirmation=entry['id'], revision=revision)
        fields.update(changes)
        return self.call('delete', fields)

    def test_delete_removes_package_preview_and_retains_private_backup(self):
        data = pk3()
        status, start = self.start(data)
        self.transfer(start['upload'], data)
        png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1sAAAAASUVORK5CYII=')
        status, published = self.call('finish', {'upload':start['upload']}, {'preview':('preview.png', png)})
        self.assertEqual(status, 200, published)
        status, result = self.delete(published['entry'])
        self.assertEqual(status, 200, result)
        self.assertFalse((self.content/'files/tracks/test.pk3').exists())
        self.assertFalse((self.content/'previews/tracks/Test.png').exists())
        backup = self.stage / result['backup']
        self.assertEqual((backup/'0-test.pk3').read_bytes(), data)
        self.assertEqual((backup/'1-Test.png').read_bytes(), png)
        self.assertEqual(len(json.loads((backup/'index.json').read_text())['content']), 2)
        self.assertEqual(json.loads((self.content/'index.json').read_text())['content'], self.initial['content'])

    def test_delete_rolls_back_when_index_cannot_be_replaced(self):
        data = pk3()
        status, result = self.publish(data)
        before = (self.content/'index.json').read_bytes()
        self.content.chmod(0o555)
        try:
            status, error = self.delete(result['entry'])
            self.assertEqual(status, 400, error)
            self.assertEqual((self.content/'index.json').read_bytes(), before)
            self.assertEqual((self.content/'files/tracks/test.pk3').read_bytes(), data)
        finally:
            self.content.chmod(0o755)

    def test_delete_requires_confirmation_csrf_and_current_revision(self):
        status, result = self.publish(pk3())
        entry = result['entry']
        self.assertEqual(self.delete(entry, confirmation='wrong')[0], 400)
        self.assertEqual(self.delete(entry, revision='0'*64)[0], 400)
        self.assertEqual(self.call('delete', {'id':'Test'}, csrf='wrong')[0], 403)
        self.assertTrue((self.content/'files/tracks/test.pk3').exists())

    def test_delete_blocks_dependencies(self):
        status, result = self.publish(pk3())
        self.assertEqual(status, 200)
        entry = result['entry']
        status, dependent = self.publish(pk3(), id='Dependent', filename='dependent.pk3', dependencies=['Test'])
        self.assertEqual(status, 200, dependent)
        status, error = self.delete(entry)
        self.assertEqual(status, 400)
        self.assertIn('Dependent', error['error'])
        self.assertTrue((self.content/'files/tracks/test.pk3').exists())

    def test_delete_preserves_shared_preview(self):
        status, result = self.publish(pk3())
        path = self.content/'index.json'
        index = json.loads(path.read_text())
        url = 'https://content.q3rally.com/previews/tracks/shared.png'
        for entry in index['content']: entry['preview'] = url
        path.write_text(json.dumps(index))
        preview = self.content/'previews/tracks/shared.png'; preview.write_bytes(b'original')
        status, result = self.delete(index['content'][-1])
        self.assertEqual(status, 200, result)
        self.assertTrue(result['sharedPreviewKept'])
        self.assertEqual(preview.read_bytes(), b'original')

    def test_delete_rejects_path_escape_and_handles_missing_files(self):
        status, result = self.publish(pk3())
        path = self.content/'index.json'
        index = json.loads(path.read_text())
        index['content'][-1]['url'] = 'https://content.q3rally.com/files/tracks/../secret.pk3'
        path.write_text(json.dumps(index))
        self.assertEqual(self.delete(index['content'][-1])[0], 400)
        index['content'][-1] = result['entry']; path.write_text(json.dumps(index))
        (self.content/'files/tracks/test.pk3').unlink()
        status, deleted = self.delete(result['entry'])
        self.assertEqual(status, 200, deleted)
        self.assertEqual(deleted['missing'], ['test.pk3'])

    def test_client_script_syntax(self):
        status, html = self.call()
        self.assertEqual(status, 200)
        script = re.search(r'<script>(.*?)</script>', html, re.S).group(1)
        subprocess.run(['node', '--check'], input=script, text=True, check=True, capture_output=True)

    def test_publication_failure_rolls_back_files_and_preserves_index(self):
        data = pk3()
        status, start = self.start(data)
        self.transfer(start['upload'], data)
        # The preview directory cannot accept a staged file; package publication is rolled back.
        directory = self.content / 'previews/tracks'
        directory.chmod(0o555)
        png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1sAAAAASUVORK5CYII=')
        try:
            status, result = self.call('finish', {'upload':start['upload']}, {'preview':('preview.png', png)})
            self.assertEqual(status, 400, result)
            self.assertEqual(list((self.content/'files/tracks').iterdir()), [])
            self.assertEqual(json.loads((self.content/'index.json').read_text()), self.initial)
        finally:
            directory.chmod(0o755)

    def test_html_escapes_existing_metadata(self):
        index = self.initial.copy()
        index['content'] = [{'id':'<script>alert(1)</script>', 'name':'<img onerror=alert(1)>'}]
        (self.content/'index.json').write_text(json.dumps(index))
        status, html = self.call()
        self.assertEqual(status, 200)
        self.assertIn('&lt;script&gt;', html)
        self.assertNotIn('<img onerror=', html)


if __name__ == '__main__':
    unittest.main(verbosity=2)

"""Run with PHP=/path/to/php python3 tests/counter_test.py; no production data used."""
import concurrent.futures
import json
import os
from pathlib import Path
import socket
import signal
import subprocess
import tempfile
import time
import unittest
import urllib.error
import urllib.request


class CounterTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.directory = Path(cls.temp.name)
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        cls.base = f'http://127.0.0.1:{port}'
        cls.server = subprocess.Popen(
            [os.environ.get('PHP', 'php'), '-n', '-S', f'127.0.0.1:{port}', '-t', 'api'],
            env={**os.environ, 'Q3RALLY_COUNTER_DIR': cls.temp.name, 'PHP_CLI_SERVER_WORKERS': '4'},
            start_new_session=True,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        for _ in range(50):
            try:
                cls.request()
                break
            except OSError:
                time.sleep(.1)
        else:
            raise RuntimeError('PHP server did not start')

    @classmethod
    def tearDownClass(cls):
        os.killpg(cls.server.pid, signal.SIGTERM)
        cls.server.wait(timeout=5)
        cls.temp.cleanup()

    def setUp(self):
        (self.directory / 'counter.json').unlink(missing_ok=True)

    @classmethod
    def request(cls, event=None, session='a' * 32, origin=None, raw=None):
        body = raw if raw is not None else (json.dumps({'event': event, 'session': session}).encode() if event else None)
        headers = {'Origin': origin or cls.base, 'Content-Type': 'application/json'}
        req = urllib.request.Request(cls.base + '/stats.php', data=body, headers=headers)
        try:
            response = urllib.request.urlopen(req, timeout=10)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.status, json.load(response), response.headers

    def test_zero_read_does_not_count(self):
        status, data, headers = self.request()
        self.assertEqual(status, 200)
        self.assertEqual(data, dict(online=0, visitors=0, pageviews=0, downloads=0, today=0))
        self.assertEqual(headers['Cache-Control'], 'no-store')
        self.assertNotIn('Access-Control-Allow-Origin', headers)
        self.assertEqual(self.request()[1], data)

    def test_visits_heartbeats_and_download_deduplication(self):
        self.assertEqual(self.request('view')[1]['pageviews'], 1)
        self.request('view')
        self.request('heartbeat')
        self.request('download')
        data = self.request('download')[1]
        self.assertEqual((data['visitors'], data['pageviews'], data['downloads'], data['online']), (1, 1, 1, 1))
        self.request('view', 'b' * 32)
        self.assertEqual(self.request()[1]['today'], 2)
        stored = (self.directory / 'counter.json').read_text()
        self.assertNotIn('a' * 32, stored)
        self.assertNotIn('127.0.0.1', stored)

    def test_concurrent_visitors(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
            results = list(executor.map(lambda n: self.request('view', f'{n:032x}'), range(24)))
        self.assertTrue(all(result[0] == 200 for result in results))
        data = self.request()[1]
        self.assertEqual((data['visitors'], data['pageviews'], data['today']), (24, 24, 24))

    def test_expiry_and_day_rollover_preserve_totals(self):
        self.request('view')
        file = self.directory / 'counter.json'
        state = json.loads(file.read_text())
        for session in state['sessions'].values():
            session['seen'] = int(time.time()) - 301
        file.write_text(json.dumps(state))
        self.assertEqual(self.request()[1]['online'], 0)
        state['day'] = '2000-01-01'
        file.write_text(json.dumps(state))
        data = self.request()[1]
        self.assertEqual((data['today'], data['visitors'], data['pageviews']), (0, 1, 1))
        self.assertEqual(self.request('view')[1]['visitors'], 2)

    def test_reject_invalid_and_cross_origin_events(self):
        self.assertEqual(self.request('view', origin='https://example.org')[0], 403)
        self.assertEqual(self.request('view', session='invalid')[0], 400)
        self.assertEqual(self.request('invented')[0], 400)
        self.assertEqual(self.request(raw=b'{')[0], 400)
        self.assertEqual(self.request(raw=b' ' * 2049)[0], 413)
        self.assertEqual(self.request()[1]['visitors'], 0)

    def test_corrupt_storage_is_not_overwritten(self):
        file = self.directory / 'counter.json'
        file.write_text('broken')
        self.assertEqual(self.request('view')[0], 503)
        self.assertEqual(file.read_text(), 'broken')


if __name__ == '__main__':
    unittest.main(verbosity=2)

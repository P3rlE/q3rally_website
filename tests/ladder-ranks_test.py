"""Rank regression checks: pure thresholds plus the real profile API with isolated data."""
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import unittest
import urllib.request
import time

ROOT = Path(__file__).resolve().parents[1]
PHP = os.environ.get('PHP', 'php')


class RankTest(unittest.TestCase):
    def php(self, source):
        output = subprocess.check_output([PHP, '-n', '-r', source], cwd=ROOT, text=True)
        return json.loads(output)

    def test_every_rank_threshold_and_boundary(self):
        thresholds = [0,50,150,350,700,1200,2000,3200,5000,7500,11000,16000,22000,30000,40000]
        scores = [-50, 0, 49, 400000] + [score for threshold in thresholds[1:] for score in [threshold-1, threshold, threshold+1]]
        actual = self.php("require 'ladder/profile-ranks.php'; $scores=json_decode('"+json.dumps(scores)+"',true); echo json_encode(array_map('profile_rank_from_score',$scores));")
        expected = [max([i for i, threshold in enumerate(thresholds) if score >= threshold], default=0) for score in scores]
        self.assertEqual(actual, expected)

    def test_stale_rank_does_not_override_score_and_highest_rank_is_retained(self):
        result = self.php("require 'ladder/profile-ranks.php'; echo json_encode(profile_with_score_rank(['playerScore'=>1200,'currentRank'=>0,'highestRank'=>8,'gamesPlayed'=>23,'wins'=>10]));")
        self.assertEqual(result['currentRank'],5)
        self.assertEqual(result['rankName'],'Street Racer')
        self.assertEqual(result['highestRank'],8)
        self.assertEqual((result['playerScore'],result['gamesPlayed'],result['wins']),(1200,23,10))
        result = self.php("require 'ladder/profile-ranks.php'; echo json_encode(profile_with_score_rank(['playerScore'=>5000,'currentRank'=>0,'highestRank'=>0,'rankName'=>'Rookie Driver']));")
        self.assertEqual((result['currentRank'],result['highestRank'],result['rankName']),(8,8,'Elite Driver'))

    def test_profile_save_persists_score_based_rank(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = json.dumps(temporary)
            # OPTIONS exits before API bootstrap. The shutdown callback invokes the
            # actual compiled persistence functions with a temporary profiles dir.
            result = self.php("define('PROFILES_DIR', " + directory + "); $_SERVER['REQUEST_METHOD']='OPTIONS'; register_shutdown_function(function(){ profile_save('rank-regression', ['playerScore'=>700,'currentRank'=>0,'highestRank'=>0,'wins'=>3]); echo file_get_contents(PROFILES_DIR . '/rank-regression.json'); }); require 'ladder/index.php';")
            self.assertEqual(result['currentRank'], 4)
            self.assertEqual(result['highestRank'], 4)
            self.assertEqual(result['rankName'], 'Amateur Racer')
            self.assertEqual((result['playerScore'], result['wins']), (700, 3))

    def test_api_corrects_existing_profile_without_rewriting_storage(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory=Path(temporary)
            for name in ['index.php','keys.php','profile-ranks.php','ghosts.php']:
                shutil.copy2(ROOT/'ladder'/name,directory/name)
            profiles=directory/'data/profiles';profiles.mkdir(parents=True)
            player='12345678-1234-4234-8234-123456789abc'
            profile=dict(playerId=player,cleanName='Regression Driver',playerScore=3200,currentRank=0,highestRank=0,gamesPlayed=17,wins=4)
            file=profiles/(player+'.json');file.write_text(json.dumps(profile));before=file.read_bytes()
            with socket.socket() as sock:
                sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
            server=subprocess.Popen([PHP,'-n','-S',f'127.0.0.1:{port}','-t',str(directory)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            try:
                for _ in range(60):
                    try:
                        with urllib.request.urlopen(f'http://127.0.0.1:{port}/index.php/players/{player}',timeout=5) as response:
                            result=json.load(response)
                        break
                    except OSError:
                        time.sleep(.05)
                else:
                    raise RuntimeError('Profile API did not become ready')
                self.assertEqual(result['currentRank'],7)
                self.assertEqual(result['highestRank'],7)
                self.assertEqual(result['rankName'],'Pro Racer')
                self.assertEqual(result['playerScore'],3200)
                self.assertEqual(result['gamesPlayed'],17)
                self.assertEqual(file.read_bytes(),before)
            finally:
                server.terminate();server.wait(timeout=5)


if __name__=='__main__':unittest.main(verbosity=2)

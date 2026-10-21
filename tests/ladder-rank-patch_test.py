import pathlib
import runpy
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
patch = runpy.run_path(str(ROOT / 'tools/patch-ladder-profile-ranks.py'))['patch']

class RankPatchTest(unittest.TestCase):
    def test_preserves_current_features_and_is_idempotent(self):
        source = '''<?php
declare(strict_types=1);
function profile_load(string $id): ?array {
    return is_array($data) ? $data : null;
}
function profile_save(string $playerId, array $data): void {
    save($data);
}
function index_extract_weather() { return 'snow'; }
'''
        changed = patch(source)
        self.assertIn("function index_extract_weather() { return 'snow'; }", changed)
        self.assertIn('website_profile_with_score_rank($data)', changed)
        self.assertEqual(patch(changed), changed)

    def test_unknown_version_fails_closed(self):
        with self.assertRaises(ValueError):
            patch('<?php function profile_load() {} function profile_save() {}')

if __name__ == '__main__':
    unittest.main()

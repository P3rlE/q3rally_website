# Score-based Ladder profile ranks

The previous ingest merged playerScore but copied currentRank from a snapshot,
rankTier or the old profile. Missing/stale rank data could remain 0 even with a
high score. Both profile UIs preferred that stored rank over score-based fallback.

profile-ranks.php mirrors the game's authoritative PROFILE_RANK_TABLE:
https://github.com/Q3Rally-Team/q3rally/blob/master/engine/code/game/profile_shared.h

Thresholds: 0, 50, 150, 350, 700, 1200, 2000, 3200, 5000, 7500, 11000, 16000,
22000, 30000, 40000. Below 50 points Rookie Driver is expected. At 3200 the rank
is Pro Racer, at 5000 Elite Driver. Negative scores map to rank 0.

The backend now derives currentRank and rankName from playerScore when loading,
serving and saving a profile. highestRank retains a valid prior peak and increases
when the score reaches a higher rank. Match scoring and career counters are not
changed. Existing profile JSON files are not rewritten by GET: old records display
correctly immediately and are persisted with derived rank on a later normal save.
The name-based profile lookup also normalizes ranks before responding.

Deploy only ladder/profile-ranks.php and ladder/index.php. Install the helper
before replacing index.php. Do not replace live keys.php, .htaccess or data/.
Back up the existing index.php first. To roll back restore that file; the unused
helper is harmless. No Apache restart or historical-data rebuild is needed.

After deployment open a player's profile on both /ladder/ and the original ladder
site. Check the profile API's playerScore, currentRank and rankName match. The
existing endpoint/browser cache may retain an old response for up to 60 seconds.
Use a hard refresh or wait for expiry. A player below the first promotion threshold
should still display Rookie Driver.

Tests (temporary profiles and real local PHP HTTP endpoint):

```bash
PHP=/path/to/php python3 tests/ladder-ranks_test.py
```

They cover every threshold and its adjacent scores, stale ranks, highest-rank
retention, actual profile_save persistence, and the existing-profile API response
without changes to the source JSON or career counters. PHP CLI with core modules
is sufficient. No production requests or writes are performed by these tests.

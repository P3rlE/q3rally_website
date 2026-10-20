<?php
declare(strict_types=1);

// Mirrors engine/code/game/profile_shared.h PROFILE_RANK_TABLE.
const LADDER_RANK_NAMES = [
    'Rookie Driver', 'Street Newbie', 'Weekend Racer', 'Track Learner',
    'Amateur Racer', 'Street Racer', 'Semi-Pro Driver', 'Pro Racer',
    'Elite Driver', 'Track Dominator', 'Master of Speed', 'Racing Legend',
    'Asphalt King', 'Grand Champion', 'Q3Rally Icon',
];
const LADDER_RANK_SCORE_THRESHOLDS = [0, 50, 150, 350, 700, 1200, 2000, 3200, 5000, 7500, 11000, 16000, 22000, 30000, 40000];

function profile_rank_from_score(int $score): int
{
    $rank = 0;
    foreach (LADDER_RANK_SCORE_THRESHOLDS as $index => $threshold) {
        if ($score < $threshold) break;
        $rank = $index;
    }
    return $rank;
}

function profile_with_score_rank(array $profile): array
{
    if (!isset($profile['playerScore']) || !is_numeric($profile['playerScore'])) {
        return $profile;
    }
    $rank = profile_rank_from_score((int)$profile['playerScore']);
    $highest = max($rank, (int)($profile['highestRank'] ?? 0), (int)($profile['currentRank'] ?? 0));
    $profile['currentRank'] = $rank;
    $profile['highestRank'] = min(count(LADDER_RANK_NAMES) - 1, $highest);
    $profile['rankName'] = LADDER_RANK_NAMES[$rank];
    return $profile;
}

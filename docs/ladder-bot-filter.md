# Website Ladder bot filter

The unchecked **Hide bots** checkbox above the Ladder tabs controls leaderboard
rows, player rankings, the header counts and recent activity. Bot-only matches
are omitted while it is checked. The leaderboard combines this setting with
its existing source and weather filters. Ghost records retain their existing
eligibility rules.

Players are filtered before best-record selection and the top-ten limit, so a
bot cannot hide a slower human attempt with the same name. Player-ranking winner
calculation still uses the original roster. Complete match details and map
history remain available; no stored match, profile or career score is modified.
The existing Drag validation and human-only eligibility rules are retained.

## Checks

```sh
node --test tests/ladder-bot-filter.test.mjs tests/ladder-drag.test.mjs tests/ladder-weather-ranks.test.mjs
npm run build
```

## Server installation

Deploy `src/pages/ladder.astro` from this change to the existing website checkout
at `/var/www/q3rally-site`, preserving a copy of the previous source. Build into
a temporary directory before touching the live HTML. After a successful build,
back up `dist/ladder/index.html`, copy the generated `_astro/` assets into
`dist/_astro/`, then install the generated `ladder/index.html`. Keep the changed
source in the server checkout so later Sanity-triggered builds retain it.

The standalone PHP Ladder is already updated separately. This website change
does not replace its PHP backend, runtime data or server configuration.

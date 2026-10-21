# Website Ladder: weather and consistent profile ranks

The Website Ladder supports weather as an index string and as weather.condition
in match payloads: dry, wet, snow and mixed. Missing/unknown values count as dry,
matching the standalone Ladder. Weather appears in activity and match details.
The leaderboard combines source and weather filters; mixed can be selected.

Profile ranks use the displayed career score and the unchanged game thresholds.
Stale rankName/currentRank cannot override the score. Rankings use the newest
available scored match snapshot, including score decreases, grouped by UUID.
The standalone Ladder version inspected in q3rally_tryout still reads stored
currentRank unchanged. The patch tool corrects load/save handling in place,
preserving its current weather implementation and all other features.

## Installation on the Linux server

Extract the package into a fresh directory (it is not a replacement Ladder).
With Q3Rally website at /var/www/q3rally-site and Ladder at /var/www/ladder:

```bash
UPDATE_DIR=$(mktemp -d "$HOME/q3rally-weather.XXXXXX")
tar -xzf ~/q3rally-ladder-weather-ranks.tar.gz -C "$UPDATE_DIR"
sudo python3 "$UPDATE_DIR/tools/patch-ladder-profile-ranks.py"
sudo cp -a /var/www/q3rally-site/src/pages/ladder.astro "/var/backups/q3rally-ladder-page-$(date +%Y%m%d-%H%M%S).astro"
sudo install -o www-data -g www-data -m 0644 "$UPDATE_DIR/src/pages/ladder.astro" /var/www/q3rally-site/src/pages/ladder.astro
cd /var/www/q3rally-site
CHECK_DIR=$(sudo -u www-data mktemp -d /tmp/q3rally-weather.XXXXXX)
sudo -u www-data npm run build -- --outDir "$CHECK_DIR"
```

Proceed only if Astro reports Build Complete and exits successfully. Preserve a
copy of the live page, publish the generated assets first and then the page:

```bash
sudo cp -a dist/ladder/index.html "/var/backups/q3rally-ladder-html-$(date +%Y%m%d-%H%M%S).html"
sudo cp -a "$CHECK_DIR/_astro/." dist/_astro/
sudo install -o www-data -g www-data -m 0644 "$CHECK_DIR/ladder/index.html" dist/ladder/index.html
```

Reload www.q3rally.com/ladder/ (Ctrl+F5). Inspect a wet/snow match, switch source
and weather filters independently, and compare the player rank with the score.
No profile points or match data are changed; existing stored ranks are corrected
on reading and on subsequent profile saves. The PHP tool validates syntax and
backs up changed installed files under /var/backups before applying its patch.

## Validation

- node --test tests/ladder-weather-ranks.test.mjs
- Full Astro production build using the configured public Sanity dataset.
- Rank patch applied to current Tryout PHP source: syntax checked, idempotent,
  weather preserved, diff restricted to require plus load/save normalization.

## Toolbar layout and unknown modes

Source and weather controls now share a taller right-hand column; on mobile the
controls sit below the horizontally scrolling mode list. `GT_UNKNOWN` and legacy
`__unknown__` sentinels do not create leaderboard tabs or increase the mode count.
Their matches remain visible as Unclassified in activity. No payload is changed.
The inspected Tryout game code omits GT_GHOST from G_LadderModeForGametype, which
can emit GT_UNKNOWN for Ghost Race. The actual origin of existing unknown matches
must be confirmed from their original payloads before any historical reassignment.

# First-party website counter

`api/stats.php` replaces the Umami API proxy. The shared layout loads
`src/scripts/counter.ts` on all Astro pages. No Umami key or PHP extension is
required; PHP 7.4+ with JSON support and a writable local filesystem suffice.

## What the figures mean

- **Total Visits:** sum of distinct tab sessions per calendar day. A random ID in
  sessionStorage survives navigation/reload in the same tab. A new tab normally
  starts a new visit (some browsers copy sessionStorage from the opening tab).
  This is not a count of distinct people or authenticated users.
- **Online Now:** sessions heard from in the last five minutes. Visible pages
  send a heartbeat every minute; heartbeats do not add pageviews.
- **Total Views:** recorded page loads, with a two-second duplicate guard per tab.
- **Download Clicks:** clicks on marked release/add-on download links, not completed
  transfers. Download requests use fetch keepalive so navigation is not delayed.
- **Visits Today:** distinct tab sessions since midnight Europe/Berlin.

No cookies, IP addresses, user agents, page paths, or download filenames are
stored. The tab ID is sent only to this site's API and is hashed with the date
before storage. Daily session hashes are cleared at the next request after
midnight. Cumulative totals remain. Browsers blocking sessionStorage can read
figures without contributing events. Hidden tabs do not send periodic heartbeats.
Data starts at zero on installation; historical Umami figures are not imported.
Like other public browser counters, this does not guarantee bot/fraud resistance.
There is a limit of 100,000 daily tab sessions; larger traffic needs another store.

## Server installation

The existing Apache `/api/` alias can remain. PHP must execute there (never serve
PHP source). The state directory must be **outside every DocumentRoot and Alias**.
On the current server the default `/var/lib/q3rally-counter` meets this requirement.

```bash
sudo install -d -o www-data -g www-data -m 0700 /var/lib/q3rally-counter
```

Deploy `api/stats.php` alongside the website's rebuilt Astro output. The old
`api/config.php` is not loaded by this counter; do not copy its key into new files.
Do not overwrite any existing counter.json on subsequent deployments. For another
state path set Q3RALLY_COUNTER_DIR in the PHP runtime environment, not a public
file or client variable. Ensure the PHP process owns the directory.

The endpoint uses an exclusive flock on a separate lock file and atomic rename
of a completed JSON file. Corrupt data or unwritable storage returns HTTP 503
rather than silently resetting totals. Reads never increment totals. Events
require same-origin application/json POST requests and validate their shape.
Both methods send Cache-Control: no-store; no wildcard CORS access is granted.
Do not add CDN caching rules for /api/stats.php.

Before deployment, back up the old API file and full dist directory outside the
public tree. Build to a separate directory as www-data (the project's owner),
check index.html is the homepage and ladder/index.html is the Ladder, then copy
all generated output, including _astro assets. Replacing only index.html will
leave other pages with the old tracker. Existing files/upload/webhook aliases
must remain unchanged. No Apache reload is needed with the default state path.

After deployment open the homepage, navigate to another page and return. Verify
/api/stats.php returns numeric values (including zero), the tab creates one visit,
pageviews grow on navigation, and no requests go to cloud.umami.is. Click one real
download link to check the click count. Test /ladder/ as well. Back up the private
counter directory independently of website builds. To roll back restore both the
old API file and old dist; keep counter state for a future redeployment.

## Development and validation

Astro dev does not execute PHP. For a combined local preview, build Astro first,
serve dist via PHP and map /api/stats.php to the source endpoint with a local
router outside the public tree. Use a temporary Q3RALLY_COUNTER_DIR. Never point
local tests at production storage or invoke deployment webhooks.

```bash
node --test tests/counter-client.test.mjs  # Node 24
python3 tests/counter_test.py            # PHP CLI in PATH; override with PHP=...
```

The backend tests run a real multi-worker PHP HTTP server with temporary state:
zero counts, visitors, views, duplicate clicks, concurrency, expiry, midnight,
malformed/cross-origin input and corrupt-state preservation. Client tests exercise
zero rendering, visible-page heartbeats, download keepalive, unavailable storage
and failed requests. Also run the normal npm run build against the public Sanity
dataset with SANITY_PROJECT_ID and SANITY_DATASET set as described in SETUP.md.

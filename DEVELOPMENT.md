# Q3Rally website development and deployment

This repository contains the Astro website, Sanity Studio schemas, first-party
counter and reusable server-side Ladder content-uploader extension. It does not
contain the complete independent Ladder backend running at ladder.q3rally.com.

## Local setup

The cloud workflow has been validated with Node.js 24. The existing app can also
be built with the server's Node.js 20. Use the committed lockfiles:

```bash
npm ci
(cd sanity && npm ci)
```

Set SANITY_PROJECT_ID=zvnub2e0 and SANITY_DATASET=production in a local .env or
process environment. Public content reads need no Sanity API key. Never commit
.env files, credentials, server upload tokens, or the retired api/config.php.

```bash
npm run dev
npm run build
(cd sanity && npm run build)
```

On restricted cloud filesystems set XDG_CONFIG_HOME=/workspace/.config and
ASTRO_TELEMETRY_DISABLED=1 for the CLI. Astro does not run PHP endpoints itself.
See docs/counter.md for a combined local preview and PHP storage requirements.

## Checks

Node.js 24 is required by the client test's TypeScript stripping API. PHP CLI
with ZipArchive is required for the uploader tests. All tests use temporary data
and test authentication adapters; they never modify the production dataset.

```bash
node --test tests/*.test.cjs tests/*.test.mjs
python3 tests/counter_test.py
python3 tests/content_upload_test.py
bash -n webhook/build-queue.sh
```

For isolated PHP runtimes use PHP=/path/to/php and, when needed,
PHP_ZIP=/path/to/zip.so for the uploader test.

## Production architecture

Apache serves /var/www/q3rally-site/dist. The PHP api/, upload/, webhook/ and
persistent files/ are configured separately with server aliases. Rebuilding the
website must preserve those directories and private server configuration.

Sanity Publish triggers webhook/deploy.php and the serialized build-queue.sh.
The queue builds directly into dist; it no longer copies to the obsolete
/var/www/html/q3rally-new path. A successful Git push does not itself deploy the
website: no GitHub deployment workflow is included.

Studio code and website code deploy separately. After changing Studio schemas,
run npx sanity deploy from sanity/ as the authenticated normal user, choosing the
existing q3rally host. Studio is hosted at https://q3rally.sanity.studio/.

## Game Modes

Published Sanity documents control the page, names, descriptions and count.
Deleting a document removes it after a rebuild. The initial import and public-ID
migration have already run on production; do not rerun the initial importer to
recreate intentionally deleted modes. See docs/game-modes.md and
docs/game-mode-cms-fix.md for details and backup locations.

## Ladder integration

The public website links to the existing ladder admin.php. The ladder-content/
extension adds PK3 upload/delete management using that backend's existing keys.php
login/CSRF functions. Its installer preserves the existing admin file with a backup
and adds only a navigation link. The full server's admin.php, index.php, keys.php,
match data and other server-only modifications must be backed up separately.
The reproducible add-website-links.py helper records the manual website-backlink
changes to the existing ladder index/admin pages. It is idempotent and does not
contain the backend source or credentials. See ladder-content/README.md for
installation, state paths and recovery.

Generated dist/, node_modules/, uploaded packages, live counter state, content
indexes and data directories are not source code and are not tracked here. Sanity
content and uploaded files also need their own backups.

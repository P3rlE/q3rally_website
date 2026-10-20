# Public Sanity mode IDs and CMS-only rendering

The original import used q3rally.gameMode.NUMBER IDs. Sanity treats dotted document
IDs as non-public; an unauthenticated website cannot read them even in a public
dataset. The Studio/CLI can read them when authenticated. The corrected initial
seed uses q3rally-game-mode-NUMBER instead.

For this existing dataset, DO NOT run the initial importer again: it would restore
intentionally deleted modes. Run only:

```bash
cd /var/www/q3rally-site/sanity
npx sanity exec scripts/migrate-game-mode-ids.cjs --with-user-token
```

This reads the CURRENT raw dataset, copies only documents still present to public
IDs, and removes the obsolete IDs in one atomic transaction. It preserves text,
images, categories, sort order and draft/published state. The current CTF4 rename
is preserved; a deleted Single Player document is never recreated. Revision guards
abort if a document was edited meanwhile. Existing target IDs or referencing
documents abort before any write. Do not edit modes during this short migration.
A private full snapshot is stored at ~/q3rally-sanity-backups before mutations.
The script then verifies that the published documents are readable without an
API token. No credential is stored in the snapshot or package.

The website now displays/counts only published Sanity gameMode documents. No
editorial fallback recreates removed modes. The old summaries remain available
only as initial seed material. Optional text/image fields can be cleared in Studio.
No schema change or Studio redeployment is required; reload Studio after migration.

The queue worker is updated to build directly into the existing Apache DocumentRoot
/var/www/q3rally-site/dist, without the obsolete /var/www/html/q3rally-new copy.
Its flock file persists across workers, and waiting workers ensure no pending flag
is stranded during a previous worker's exit. It logs build failure accurately.
The webhook receiver itself and its authentication configuration are unchanged.

No prebuilt HTML is shipped here because the corrected data must be migrated
first. The migration triggers the existing Sanity webhook; inspect the build log.
If an explicit refresh is needed, queue a build through the same lock:

```bash
sudo -u www-data touch /tmp/q3rally-build.pending
sudo -u www-data bash /var/www/q3rally-site/webhook/build-queue.sh
sudo tail -n 50 /var/log/q3rally-deploy.log
```

Do not run a separate simultaneous npm build. After a successful build refresh
/game-modes/ and the homepage with Ctrl+F5: removed modes are absent and the current
published names are shown. Draft-only changes require Publish.

Tests: node --test tests/game-mode-ids.test.cjs tests/game-modes-import.test.cjs
The migration is tested with a fake client; it has not been run against production
from the cloud. Run the authenticated command above on the server.

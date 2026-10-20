# Ladder admin: ingame-content uploader

This is a server-side extension for the existing PHP ladder, separate from Astro
and Sanity. It uses `keys_require_admin()`, `keys_admin_csrf_ok()` and
`keys_admin_csrf_token()` from the server's existing keys.php. No credentials or
replacement authentication code are shipped. The caller must be an authenticated
ladder administrator. The existing admin.php is patched only to add a navigation
link; login, logout and key administration remain in place.

## Install

Requirements: PHP 8.3+, JSON/session/hash support, ZipArchive, Python 3, and the
existing content index version 1. These match the information supplied for the
current server. Check that the Apache PHP runtime also loads the ZIP extension;
CLI and Apache can load different php.ini files.

Extract the release archive in the user's home directory and run:

```bash
sudo python3 ladder-content/install.py
```

The installer validates PHP syntax and the index, backs up the admin page and
index to /var/backups/q3rally-content-TIMESTAMP, installs two PHP files in
/var/www/ladder, and adds a Content Uploader link in the existing tabs navigation.
It creates private staging at /var/lib/q3rally-content-upload (www-data, mode 0700).
Only the content root and six category directories receive www-data group write
access. No recursive ownership changes occur; existing packages are untouched.
Original directory ownership/modes are recorded in the backup. Backups of a
previously installed uploader are included on upgrades. No Apache reload or
Astro/Sanity rebuild is needed. The installer never uploads a package, creates a
new content entry, or replaces the existing index.

Open https://ladder.q3rally.com/admin.php, authenticate normally and select
Content Uploader. The page also links back to the ladder admin and main website.

## Upload workflow

1. Select Map/Track, Vehicle or Skin. These map to tracks, vehicles and skins.
2. Set unique ID, display name, author and version. Filename comes from the PK3.
3. Select a PK3 and optionally a JPG, PNG or WebP preview (5 MiB, 8192×8192 max).
4. Optionally enter existing content IDs as dependencies (commas/newlines).
5. Upload & publish content immediately publishes files and updates index.json.

The original filename/case are preserved. New files use URLs at
https://content.q3rally.com/files/CATEGORY/FILENAME; previews use
https://content.q3rally.com/previews/CATEGORY/ID.EXTENSION. No image gives an empty
preview string. Verify the game's fallback for content without a preview; include
an image if the client requires it. Each new entry matches the supplied index
schema: id, type, name, author, version, file, url, size, checksum_md5, preview,
dependencies. Existing entries and extra index fields are retained. Index version
stays 1, and updated uses the current UTC date, matching the supplied date format.

## Limits and integrity

PK3: 512 MiB max, 4-MiB upload blocks, three attempts per block. PHP/post limits
must allow at least one block plus multipart overhead (8 MiB is sufficient; the
reported 300M limits exceed this). A reverse proxy must also allow these requests.
A final request can carry a preview up to 5 MiB, so its limit must exceed that.
Final assembly/CRC checks need enough PHP execution time for the package size;
very large packages may require a PHP timeout adjustment after measurement.
Disk needs space for block files, assembly and published file (about three times
the PK3 size at peak) plus existing content. Chunk data does not go through Sanity.

ZIP validation checks the central directory, supported compression (stored or
deflate), no encryption, safe/unique internal paths, at most 20,000 entries and
1 GiB total uncompressed size. File data is streamed to verify entry CRCs. Archives
are never extracted on the server. MD5 is calculated from the completed package
for compatibility with the game's existing checksum field, not authentication.

CSRF validation runs on every request, including each chunk. Upload IDs are
server-generated and bound to the existing PHP login session. Abandoned uploads
expire after 24 hours; each new upload removes up to 50 expired private upload
directories. Index backups are kept separately as private index-*.json files;
include them in server backup/retention management. New packages are publicly
downloadable immediately once published.

All content publication uses a shared exclusive flock. Files use exclusive hard
links after copying to a temporary file on the destination filesystem, preventing
overwrite. An atomic index rename publishes the new entry after files are ready.
Failures before index publication remove newly created public files. Duplicate
IDs/filenames (case-insensitive) are rejected; no package-replacement UI is included. Deletion is described below.
Always use a new ID and filename for an updated package. Only this uploader
coordinates via the lock; do not manually modify the index during publication.
If the HTTP response is lost, reload the content list before retrying. Finalization
receipts make successful repeat finish requests idempotent.

## Verify on the actual server

Tests use a test-only adapter implementing the documented keys.php interface.
Production session/login behavior must still be checked on the actual server.

- Open content-upload.php signed out; it must require the existing admin login.
- Sign in as admin, open uploader and check existing content is listed.
- Upload a small real PK3 with a new ID/filename and preview if required by the game.
- Confirm its public URL downloads, size/MD5 match the local file, and index.json
  has exactly one additional entry with the right type/paths.
- Confirm the game lists and downloads it. The game client is not in this checkout,
  so compatibility with live discovery/cache behavior must be tested there.
- Retry the same ID/filename: it must be rejected without changing existing files.
- Check old packages, ladder admin and main website still work.

The index and files may be cached by browsers/Cloudflare or the game. If a new
entry is missing, first request index.json and inspect the response/cache age;
only purge that URL if a stale cache is confirmed.

## Local tests

```bash
python3 tests/content_upload_test.py
```

Requires PHP CLI with ZipArchive and Node.js for the embedded script syntax check.
Use PHP=/path/to/php and PHP_ZIP=/path/to/zip.so for a local isolated runtime.
Tests run a multi-worker PHP server with temporary content/staging and fake login
helpers. They cover auth/CSRF, upload ownership, chunks/retries, preview validation,
PK3 paths/CRC/compression, concurrent index changes, duplicate protection, rollback,
HTML escaping, damaged index and embedded browser-script syntax.

## Rollback

Restore admin.php and any previous uploader files from the printed backup.
If no uploader existed before, remove only content-upload.php/content-library.php.
The original directory permissions are in directory-permissions.json. Preserve the
live index and any newly uploaded content; blindly restoring the install-time index
would remove subsequent published entries. Index backups in private staging are
for deliberate data recovery, not automatic code rollback.

## Delete published content

Each existing entry has a Delete button. The administrator must type its exact
ID; each delete request uses the existing login and CSRF validation. A revision
hash also prevents deleting an entry that changed after the list was loaded.
Deletion is blocked if another entry depends on this ID or shares the PK3 URL.
Shared preview images are retained. Already missing files are reported while the
stale index entry can still be removed. Paths are restricted to the indexed local
category and allowed extensions; arbitrary URLs, traversal and symlinks are rejected.

Before removing anything a private `deleted-TIMESTAMP-RANDOM` directory is created
under /var/lib/q3rally-content-upload. It contains the original index.json,
entry.json and numbered copies of the package and unshared preview. These deletion
backups are NOT removed by expired-upload cleanup. Include them in your backup
retention policy. There is no automatic restore button. For recovery, restore the
files from the private backup and merge only that saved entry into the current
index; do not replace a newer index with the old full snapshot.

Deletion shares the upload publication lock. Public files are renamed to hidden
same-filesystem paths, then the updated index is saved atomically. Failure before
index commit restores the original public paths. After commit hidden files are
removed; a cleanup failure is logged rather than undoing the committed index.
The game no longer discovers deleted entries after refreshing its content list.
Previously installed files on players' computers remain installed. CDN/browser
caches may temporarily retain old files or the index; confirm a stale cache before
purging those URLs. Installing/upgrading the uploader itself never deletes content.

## Website backlinks

The existing server's index.php and admin.php also have a backlink to
https://www.q3rally.com/. The exported backend files are now versioned under ladder/.
To reproduce this change on a fresh copy of that backend, run
`python3 add-website-links.py` as the owner of the Ladder files. It backs up the
files privately, validates PHP syntax and skips pages already containing the link.
Do not copy server authentication/configuration files into the website repository.

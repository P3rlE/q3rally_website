# Server-only settings

This snapshot excludes runtime data, backups and local environment files.
Literal password/token defaults have been cleared in the exported PHP only.
Sensitive SetEnv/php_value directives are omitted from the exported .htaccess.
Configure these settings privately on the destination server before deployment.
KEYS_NOTIFY_EMAIL, if present, uses admin@example.com as an example.
The live installation was not changed. Before using this source on a new server,
configure authentication through the environment variable already used by
keys_require_admin(); never commit the administrator password. Review keys.php
for the exact variable name. Existing server data and secrets need separate backups.

## Runtime configuration

The live `.htaccess` is deliberately ignored. `.htaccess.example` contains only
non-secret configuration plus a notification-email placeholder. Keep an existing
server's private `.htaccess` in place when deploying source updates. On a new
server configure `LADDER_ADMIN_PASSWORD` privately (preferably in the Apache
VirtualHost environment) and optionally `LADDER_NOTIFY_EMAIL`. Never commit
the administrator password. The exported keys.php retains the existing
`getenv()` lookup and refuses admin access when no password is configured.

`data/` is runtime state, including authentication keys and player/match data;
it is excluded from this repository and needs a separate server backup.

SOURCE-EXPORT.json records checksums of the initial sanitized import. Subsequent
source changes are recorded in Git; these baseline hashes are not a live deployment
manifest. Profile rank calculation is documented in ../docs/ladder-ranks.md.

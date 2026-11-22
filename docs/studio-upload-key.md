# Studio upload key

Both upload inputs previously read `SANITY_STUDIO_UPLOAD_TOKEN` at build time,
embedding the configured upload credential in the downloadable Studio code.
They now use a password field. The entered key is shared between uploader inputs
in the current Studio tab using module memory. It is never saved in a Sanity
document, localStorage or sessionStorage. Reloading the tab or clicking
**Vergessen** clears it. Empty keys cannot start an upload.

The existing upload endpoint and `X-Upload-Token` authentication are unchanged.
Chunked uploads capture the key for the complete attempt, including retries.
Ordinary editing of download URLs and sizes still works without entering a key.

Deploy all three files under `sanity/plugins/server-upload/`, then rebuild and
deploy the Studio. Use a fresh user-writable output directory to avoid the
server checkout's parent-directory permissions. Set
`SANITY_STUDIO_UPLOAD_TOKEN=''` for the build/deploy command so an old `.env`
entry is not loaded into the build environment. Keep actual credentials out of
chat and deployment archives.

If a credential was previously deployed in the public Studio bundle, replace it
in the server uploader's private configuration and use the replacement in the
password field. Old downloadable bundles may retain the previous credential.
No server key is changed by this source patch.

Validation: the Studio production build completed with a synthetic canary value
set in the old environment variable, and no generated JavaScript contained it.
An isolated React/browser harness verified two chunk requests and one ordinary
upload using only the entered synthetic key. Empty keys were blocked, both input
instances shared the in-memory value, browser storage remained empty, and
forgetting or reloading cleared the value. Test requests were intercepted; no
test uploads were sent to the production endpoint.

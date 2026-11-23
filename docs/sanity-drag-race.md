# Drag Race in Sanity

`sanity/schemas/gameMode.js` adds `9 — Drag Race` to the existing mode selector.
Deploy the existing hosted Studio to make it available there. This can be done
together with the build-preview change that removes the automatic `v` prefix.

The targeted `sanity/scripts/add-drag-mode.cjs` creates one published document:
`q3rally-game-mode-9`. It describes the Tryout development mode with manual
shifting, valid launches and best-of heats, based on `docs/drag-race.md` in the
Tryout repository. Existing Drag documents, including drafts with custom IDs,
are preserved. No other missing or previously deleted mode is recreated.

Run from the installed Studio directory as the normal authenticated user:

```bash
npx sanity exec scripts/add-drag-mode.cjs --with-user-token -- --dry-run
npx sanity exec scripts/add-drag-mode.cjs --with-user-token
```

The script checks the project/dataset, rejects conflicting IDs and uses
`createIfNotExists`. It never patches, replaces or deletes an existing record.
A draft-only record must be published manually in Studio. Do not run the old
full mode importer to add Drag Race.

Publishing the document triggers the normal website webhook. Verify the latest
successful build, then check `/game-modes/#mode-9` and the homepage mode count.

Validation: targeted import tests and the Sanity Studio production build.

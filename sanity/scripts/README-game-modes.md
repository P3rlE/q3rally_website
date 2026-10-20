# One-time import of website Game Modes into Sanity

**Already completed on the production server. Do not rerun to restore missing
modes: they may have been deliberately deleted.** See docs/game-mode-cms-fix.md
for the subsequent public-ID migration, which has also been completed.

From /var/www/q3rally-site/sanity, run as your normal user with the existing CLI
login (not sudo):

```bash
npx sanity exec scripts/import-game-modes.cjs --with-user-token -- --dry-run
npx sanity exec scripts/import-game-modes.cjs --with-user-token
```

The first command is optional/read-only. The second is the real import, using
Sanity CLI's existing authenticated user. No token needs to be copied or pasted.
If the CLI login expired, use the normal Sanity CLI login flow. Do not enter token
values in chat or save them in these scripts.

The target is fixed and checked: zvnub2e0/production. The 17 seed documents contain
exactly the website's current wiki summaries, objectives, categories, notes, sort
order and development flags. They are created as published documents so Studio
lists the current public text immediately. Screenshots can be added later.

Before writes, all matching existing mode documents (including drafts) are read
with perspective raw. Existing gametype IDs are skipped regardless of document
ID. Existing documents are never patched, replaced or published, including a mode
that currently exists only as a draft. A private JSON record of existing documents
and planned creations is written to ~/q3rally-sanity-backups (file mode 0600).
All missing documents are created in one transaction with createIfNotExists and
deterministic IDs. Rerunning preserves later edits; there is no reset or deletion.
Unexpected ID collisions or a wrong project/dataset abort the operation. Do not
simultaneously create gameMode records while this one-time import is running.

After success reload Studio: Game Modes now contains all 17 modes (existing ones
plus imported ones). Edit the document, then Publish. Website content changes
still require the normal Astro rebuild/webhook. This import may itself trigger
the existing webhook. No Studio schema or Studio deployment is needed for the
import: the gameMode schema has already been deployed.

The included source update also permits clearing optional goals/notes/screenshots
in Studio without the default wiki text reappearing. The current website displays only published Sanity documents; deleted records
are no longer recreated from built-in defaults. Install the included src files
before import so subsequent builds use this behavior. Optional goals no longer
render an empty THE GOAL box when removed.

Test: node --test tests/game-modes-import.test.cjs (local fake Sanity client).
Production mutations have not been executed in the cloud environment; run the
command above on the server with your authenticated CLI and check its report.

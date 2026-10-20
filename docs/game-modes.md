# Game Modes

Public page: /game-modes/. All 17 modes are summarized from
https://github.com/Q3Rally-Team/q3rally/wiki/Game-Modes, grouped as Race (6), Combat
(3) and Team (8). The wiki is linked on the page as the source and full reference. These are the
original seed counts; the live list changes when documents are published or deleted.
Ghost Race (8) and Autoball (23) are marked Development Build. The development-only
Derby rules are a separate note; Derby itself is not marked development-only.

Published Sanity gameMode documents are the source of truth. Only published modes
are displayed and counted; removing a document removes it from the website after
a rebuild. The original wiki summaries remain in src/data/gameModes.js only as
seed material for the one-time import. Runtime rendering does not recreate missing
records. Public document IDs use hyphens (q3rally-game-mode-NUMBER), because dotted
Sanity IDs are not anonymously readable. See game-mode-cms-fix.md for the migration.

In Sanity Studio open Game Modes, create an entry and select its g_gametype. Add
name, description and optional category, goal, note, screenshot and sort order.
Publish normally. The existing website webhook/rebuild workflow applies. The new
schema/config must be loaded in the Studio you actually use: restart local Studio,
or redeploy your hosted Studio through its normal deployment process. This update
does not itself redeploy a hosted Studio or mutate the production dataset.

Navigation is shared by every page, so deploy all rebuilt dist files. Desktop and
mobile navigation include Game Modes; the menu collapses at 1600px to keep the
expanded link list from clipping. The homepage footer also links to the page.

Deploy src/data/gameModes.js, src/lib/sanity.js, src/pages/game-modes.astro,
src/pages/index.astro, src/components/Nav.astro and the included Sanity schema/config
alongside dist, so future server builds retain the change. No dependencies or
lockfiles changed, and no credentials are included in the update archive.

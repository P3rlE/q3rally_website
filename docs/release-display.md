# Release display

The Latest Build card separates the numeric version from its suffix. For
`0.4.1 Q3Rally Launcher`, the entire `0.4.1` is white; `Q3Rally Launcher`
appears as a smaller white label on its own line. Two-component and nonnumeric
release names remain supported. The selected build and stored content are unchanged.

Download headings, changelog headings, homepage download highlights, the main
download link and the navigation badge no longer prepend `v`/`V`. A prefix typed
into the Sanity version field remains part of the displayed text. Sanity's build
list preview also uses the entered text directly.

## Deployment

Website source files:

- `src/pages/index.astro`
- `src/pages/downloads.astro`
- `src/components/Nav.astro`

Studio source file:

- `sanity/schemas/build.js`

Back up the installed files first, compare their current contents with the
expected source, and preserve any server-specific changes. Use the existing
`/tmp/q3rally-build.lock` when installing website source, building or publishing.
Build the complete server checkout to preserve the deployed Garage and Ladder
features; a build from this repository's main branch alone may omit those
server-installed changes. Publish generated assets before HTML.

The website build and the hosted Studio deployment are separate. Rebuild and
deploy the existing `q3rally` Studio after updating its schema so the preview
change also appears at `https://q3rally.sanity.studio/`.

## Verification performed

The Astro production build and Sanity Studio build completed. A headless browser
check verified the real Latest Build on desktop and mobile: numeric version
`0.4.1` entirely white, white product label, and no product-label overflow.
All three rendered download titles matched the published Sanity version values
exactly. Studio preview checks preserved both unprefixed and explicitly prefixed
input.

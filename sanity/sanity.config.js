import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { visionTool } from '@sanity/vision';
import { schemaTypes } from './schemas/index';

export default defineConfig({
  name: 'q3rally',
  title: 'Q3Rally CMS',
  projectId: 'zvnub2e0',
  dataset: 'production',
  plugins: [
    structureTool({
      structure: (S) =>
        S.list()
          .title('Q3Rally')
          .items([
            S.listItem().title('Builds & Releases').child(
              S.documentTypeList('build').title('Builds')
            ),
            S.listItem().title('News').child(
              S.documentTypeList('newsPost').title('News Posts')
            ),
            S.divider(),
            S.listItem().title('Cars').child(
              S.documentTypeList('car').title('Cars')
            ),
            S.listItem().title('Maps').child(
              S.documentTypeList('map').title('Maps')
            ),
            S.listItem().title('Powerups / Holdables').child(
              S.documentTypeList('powerup').title('Powerups')
            ),
            S.listItem().title('Rearfire Weapons').child(
              S.documentTypeList('weapon').title('Weapons')
            ),
            S.listItem().title('Roadside Objects').child(
              S.documentTypeList('roadsideObject').title('Roadside Objects')
            ),
            S.divider(),
            S.listItem().title('Media — Videos').child(
              S.documentTypeList('video').title('Videos')
            ),
            S.listItem().title('Media — Screenshots').child(
              S.documentTypeList('screenshot').title('Screenshots')
            ),
          ]),
    }),
    visionTool(),
  ],
  schema: { types: schemaTypes },
});

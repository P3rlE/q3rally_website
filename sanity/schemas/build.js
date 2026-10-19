import { PlatformInput } from '../plugins/server-upload/PlatformInput.jsx';

export default {
  name: 'build',
  title: 'Build / Release',
  type: 'document',
  fields: [
    { name: 'version', title: 'Version', type: 'string', description: 'z.B. 0.8.2' },
    { name: 'isCurrent', title: 'Current Version', type: 'boolean', description: 'Als Download-Highlight auf der Startseite anzeigen (04/04)' },
    {
      name: 'category',
      title: 'Category',
      type: 'string',
      options: { list: ['Stable', 'Outdated', 'Addon Cars', 'Addon Maps', 'Skins', 'Misc'] },
    },
    { name: 'publishedAt', title: 'Release Date', type: 'datetime' },
    { name: 'fileHash', title: 'File Hash (SIG)', type: 'string', description: 'z.B. A3F9C1' },
    { name: 'changelog', title: 'Changelog', type: 'text', rows: 5 },
    {
      name: 'screenshots',
      title: 'Screenshots',
      type: 'array',
      of: [{ type: 'image', options: { hotspot: true } }],
      description: 'Optionale Screenshots für diesen Release (z.B. für Addon Cars, Maps, Skins)',
    },
    {
      name: 'platforms',
      title: 'Platforms',
      type: 'array',
      of: [
        {
          type: 'object',
          components: { input: PlatformInput },
          fields: [
            {
              name: 'name',
              title: 'Platform Name',
              type: 'string',
              options: { list: ['Windows', 'Linux', 'macOS'] },
            },
            { name: 'subtitle', title: 'Subtitle', type: 'string', description: 'z.B. x64 · Win 10/11' },
            { name: 'size', title: 'File Size', type: 'string', description: 'z.B. 412 MB' },
            { name: 'url', title: 'Download URL', type: 'url' },
            { name: 'recommended', title: 'Recommended', type: 'boolean' },
          ],
          preview: { select: { title: 'name', subtitle: 'size' } },
        },
      ],
    },
  ],
  preview: {
    select: { title: 'version', subtitle: 'publishedAt' },
    prepare({ title, subtitle }) {
      return {
        title: `v${title}`,
        subtitle: subtitle ? new Date(subtitle).toLocaleDateString('de-DE') : '',
      };
    },
  },
};

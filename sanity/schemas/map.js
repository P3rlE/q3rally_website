export default {
  name: 'map',
  title: 'Map',
  type: 'document',
  fields: [
    {
      name: 'name',
      title: 'Name',
      type: 'string',
      validation: Rule => Rule.required(),
    },
    {
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 3,
    },
    {
      name: 'mainImage',
      title: 'Main Screenshot',
      type: 'image',
      options: { hotspot: true },
      description: 'Wird als Vorschaubild in der Übersicht angezeigt',
    },
    {
      name: 'screenshots',
      title: 'Additional Screenshots',
      type: 'array',
      of: [{ type: 'image', options: { hotspot: true } }],
      description: 'Weitere Screenshots — erscheinen in der Thumbnail-Leiste',
    },
    {
      name: 'orderRank',
      title: 'Sort Order',
      type: 'number',
      description: 'Lower number = appears first',
    },
  ],
  preview: {
    select: { title: 'name', media: 'mainImage' },
  },
};

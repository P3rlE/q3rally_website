export default {
  name: 'car',
  title: 'Car',
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
      name: 'image',
      title: 'Image',
      type: 'image',
      options: { hotspot: true },
    },
    {
      name: 'orderRank',
      title: 'Sort Order',
      type: 'number',
      description: 'Lower number = appears first',
    },
  ],
  preview: {
    select: { title: 'name', media: 'image' },
  },
};

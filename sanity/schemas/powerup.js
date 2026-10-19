export default {
  name: 'powerup',
  title: 'Powerup / Holdable',
  type: 'document',
  fields: [
    { name: 'name', title: 'Name', type: 'string', validation: Rule => Rule.required() },
    { name: 'description', title: 'Description', type: 'text', rows: 3 },
    { name: 'image', title: 'Image', type: 'image', options: { hotspot: true } },
    { name: 'orderRank', title: 'Sort Order', type: 'number' },
  ],
  preview: { select: { title: 'name', media: 'image' } },
};

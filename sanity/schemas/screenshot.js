export default {
  name: 'screenshot',
  title: 'Screenshot',
  type: 'document',
  fields: [
    {
      name: 'caption',
      title: 'Caption',
      type: 'string',
      description: 'Kurze Beschreibung, z.B. "Canyon Run — Nacht"',
    },
    {
      name: 'image',
      title: 'Image',
      type: 'image',
      options: { hotspot: true },
      validation: Rule => Rule.required(),
    },
    {
      name: 'orderRank',
      title: 'Sort Order',
      type: 'number',
    },
  ],
  preview: {
    select: { title: 'caption', media: 'image' },
    prepare({ title, media }) {
      return { title: title ?? '(kein Caption)', media };
    },
  },
};

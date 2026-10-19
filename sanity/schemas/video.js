export default {
  name: 'video',
  title: 'Video',
  type: 'document',
  fields: [
    {
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: Rule => Rule.required(),
    },
    {
      name: 'youtubeId',
      title: 'YouTube Video ID',
      type: 'string',
      description: 'Die ID aus der YouTube-URL, z.B. "dQw4w9WgXcQ" aus https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      validation: Rule => Rule.required(),
    },
    {
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 2,
    },
    {
      name: 'orderRank',
      title: 'Sort Order',
      type: 'number',
    },
  ],
  preview: {
    select: { title: 'title', subtitle: 'youtubeId' },
    prepare({ title, subtitle }) {
      return { title, subtitle: `youtube.com/watch?v=${subtitle}` };
    },
  },
};

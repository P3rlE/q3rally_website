export default {
  name: 'gameMode', title: 'Game Mode', type: 'document',
  fields: [
    {name: 'gametype', title: 'Game Mode / g_gametype', type: 'number', options: {list: [
      {title:'0 — Racing',value:0},{title:'1 — Racing DM',value:1},{title:'2 — Single Player',value:2},
      {title:'3 — Demolition Derby',value:3},{title:'4 — Last Car Standing',value:4},{title:'5 — Elimination',value:5},
      {title:'6 — Deathmatch',value:6},{title:'7 — Sprint',value:7},{title:'8 — Ghost Race',value:8},
      {title:'16 — Team Deathmatch',value:16},{title:'17 — Team Racing',value:17},{title:'18 — Team Racing DM',value:18},
      {title:'19 — Capture the Flag',value:19},{title:'20 — CTF4',value:20},{title:'21 — Domination',value:21},
      {title:'22 — King of the Hill',value:22},{title:'23 — Autoball',value:23},
    ]}, validation: Rule => Rule.required().custom(async (value, context) => {
      if (value === undefined) return true;
      const id = context.document?._id?.replace(/^drafts\./, '');
      const duplicate = await context.getClient({apiVersion:'2024-01-01'}).fetch('count(*[_type == "gameMode" && gametype == $value && !(_id in [$id, $draft])])', {value, id: id ?? '', draft: `drafts.${id ?? ''}`});
      return duplicate ? 'This game mode already has an entry. Edit the existing document.' : true;
    })},
    {name:'name',title:'Name',type:'string',validation:Rule=>Rule.required()},
    {name:'category',title:'Category',type:'string',options:{list:[{title:'Race',value:'race'},{title:'Combat',value:'combat'},{title:'Team',value:'team'}]}},
    {name:'description',title:'Description',type:'text',rows:4,validation:Rule=>Rule.required()},
    {name:'objective',title:'Goal / win condition',type:'string'},
    {name:'note',title:'Additional note',type:'text',rows:3},
    {name:'development',title:'Development build only',type:'boolean',description:'Leave unset to keep the wiki default.'},
    {name:'image',title:'Screenshot',type:'image',options:{hotspot:true}},
    {name:'orderRank',title:'Sort order within category',type:'number'},
  ],
  preview:{select:{title:'name',subtitle:'category',media:'image'}},
};

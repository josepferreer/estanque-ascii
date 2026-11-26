/* Datos del juego: rarezas, especies de carpa y zonas del mapa */
const DATA = (() => {
  // peso = probabilidad relativa al sacar un huevo · mult = perlas que da cada carpa
  const RARITY = [
    { n: 'común',      c: '#b8c0c8', w: 60, mult: 1 },
    { n: 'rara',       c: '#4cc9f0', w: 25, mult: 3 },
    { n: 'épica',      c: '#c77dff', w: 10, mult: 8 },
    { n: 'legendaria', c: '#ffb703', w: 4,  mult: 20 },
    { n: 'mítica',     c: '#ff4d8d', w: 1,  mult: 60 },
  ];

  // pat = colores que se repiten a lo largo del cuerpo (de cola a cabeza)
  // head = color del ojo/cabeza · rainbow = cambia de tono con el tiempo
  const SPECIES = {
    // Estanque
    gris:       { name: 'Carpa gris',        r: 0, pat: ['#8e99a4', '#a9b3bc'] },
    naranja:    { name: 'Carpa naranja',     r: 0, pat: ['#e07a2f', '#f0a04b'] },
    kohaku:     { name: 'Kohaku',            r: 1, pat: ['#f5f5f5', '#f5f5f5', '#e63946', '#e63946', '#f5f5f5', '#e63946'] },
    shiro:      { name: 'Shiro Muji',        r: 1, pat: ['#ffffff', '#e8f1f5'] },
    ogon:       { name: 'Ogon dorada',       r: 2, pat: ['#ffd23f', '#ffb703'] },
    // Nenúfares
    musgo:      { name: 'Carpa de musgo',    r: 0, pat: ['#5b8c3a', '#7aa653'] },
    asagi:      { name: 'Asagi',             r: 1, pat: ['#4f86c6', '#9ec5ee', '#d9e8f5'] },
    sanke:      { name: 'Sanke',             r: 1, pat: ['#f5f5f5', '#e63946', '#f5f5f5', '#4a4e69', '#e63946'] },
    shusui:     { name: 'Shusui',            r: 2, pat: ['#3a6ea5', '#e07a2f', '#3a6ea5', '#e07a2f'] },
    kujaku:     { name: 'Kujaku',            r: 3, pat: ['#ffd23f', '#d9d9d9', '#6c757d', '#ff7b00'] },
    // Cascada
    plateada:   { name: 'Carpa plateada',    r: 0, pat: ['#c9d6df', '#aebdc9'] },
    benigoi:    { name: 'Benigoi',           r: 1, pat: ['#e63946', '#ff5a5f'] },
    showa:      { name: 'Showa',             r: 1, pat: ['#4a4e69', '#e63946', '#f5f5f5', '#4a4e69', '#e63946'] },
    platinum:   { name: 'Platinum',          r: 2, pat: ['#f2f6fa', '#ffffff', '#dfe9f2'] },
    tancho:     { name: 'Tancho',            r: 3, pat: ['#ffffff'], head: '#e63946' },
    // Cueva
    ciega:      { name: 'Carpa ciega',       r: 0, pat: ['#cdbfae', '#e6dccd'] },
    cristal:    { name: 'Carpa de cristal',  r: 1, pat: ['#9fe8ff', '#dff8ff'] },
    brasa:      { name: 'Carpa brasa',       r: 2, pat: ['#ff5a1f', '#ffb03b', '#ff5a1f'] },
    fantasma:   { name: 'Fantasma',          r: 3, pat: ['#e9e4ff', '#bdb2ff'] },
    abisal:     { name: 'Abisal',            r: 4, pat: ['#00f5d4', '#9b5de5', '#00bbf9'] },
    // Lago de la Luna
    rocio:      { name: 'Carpa de rocío',    r: 0, pat: ['#9db4d6', '#c3d3ea'] },
    lunar:      { name: 'Lunar',             r: 1, pat: ['#dfe7fd', '#b8c0ff'] },
    kumonryu:   { name: 'Kumonryu',          r: 2, pat: ['#5c6784', '#f5f5f5', '#5c6784', '#8892b0'] },
    medianoche: { name: 'Medianoche',        r: 3, pat: ['#4361ee', '#7209b7', '#4cc9f0'] },
    lunallena:  { name: 'Luna llena',        r: 4, pat: ['#ffffff', '#fff3b0'] },
    // Templo sumergido
    piedra:     { name: 'Carpa de piedra',   r: 0, pat: ['#8d99ae', '#6c757d'] },
    jade:       { name: 'Jade',              r: 1, pat: ['#2ec4b6', '#7bdcb5'] },
    ambar:      { name: 'Ámbar',             r: 2, pat: ['#ff9f1c', '#ffbf69'] },
    dragon:     { name: 'Carpa dragón',      r: 3, pat: ['#e63946', '#ffd23f', '#e63946', '#2ec4b6'], deco: 'dragon' },
    celestial:  { name: 'Celestial',         r: 4, pat: ['#ffffff'], rainbow: true },
    // Secretos: solo se consiguen al encontrar su rincón (no salen de huevos)
    eco:        { name: 'Carpa eco',         r: 3, pat: ['#7b6cff', '#b8b0ff', '#3a2f8f'], secret: true },
    rubi:       { name: 'Koi rubí',          r: 3, pat: ['#ff2e63', '#ffd6e0', '#b5103c'], secret: true },
    // Portal: carpas de otros mundos (fx = efecto especial al dibujarlas)
    ceniza:     { name: 'Carpa ceniza',      r: 2, pat: ['#5a5350', '#8a7f78', '#ff7a2f'] },
    magma:      { name: 'Carpa de magma',    r: 4, pat: ['#ff4500', '#ffb000', '#7a1a05', '#ff6a00'], fx: 'magma' },
    escarcha:   { name: 'Carpa escarcha',    r: 2, pat: ['#cfe9f5', '#9cc9e0', '#ffffff'] },
    hielo:      { name: 'Carpa de hielo',    r: 4, pat: ['#e6f9ff', '#a8e4ff', '#ffffff'], fx: 'ice' },
    nebulosa:   { name: 'Carpa nebulosa',    r: 2, pat: ['#7b5cd6', '#e07ad8', '#4a3a9a'] },
    estelar:    { name: 'Carpa estelar',     r: 4, pat: ['#101c4f', '#1c2c72', '#0b1438'], fx: 'stars' },
    estatica:   { name: 'Carpa estática',    r: 2, pat: ['#9a9a9a', '#d8d8d8', '#5a5a5a', '#ffffff'] },
    glitch:     { name: 'Carpa glitch',      r: 4, pat: ['#00ff9c', '#ff00e6', '#00e5ff', '#111111'], fx: 'glitch' },
    // Carpas del laboratorio: solo salen de una fórmula (deco = rasgos que se pintan sobre el cuerpo de carpa)
    komodo:     { name: 'Carpa komodo',      r: 4, pat: ['#6b7550', '#857f58', '#5b6446', '#9a9068'], head: '#4f5739', deco: 'escamas', lab: true },
  };

  // Laboratorio: se construye una vez; mezcla dos carpas adultas. Ciertas parejas dan una criatura.
  const LAB = { cost: 2000 };
  const RECIPES = [
    { sp: 'komodo', a: 'piedra', b: 'musgo', hint: 'algo duro como la roca y algo verde' },
  ];

  // Rincones secretos del mapa (en map.js, después de las seis zonas). Se encuentran, no se compran.
  const SECRETS = [
    { id: 'gruta', name: 'Gruta escondida', water: '#46407a', shore: '#4a4058', grass: '#3b3358', species: 'eco', reward: 600 },
    { id: 'poza', name: 'Poza secreta', water: '#784a6e', shore: '#6b5b45', grass: '#4a6b3a', species: 'rubi', reward: 300 },
  ];

  // Mejoras que se compran con perlas: tres niveles cada una
  const UPGRADES = [
    { id: 'feeder', name: 'Comedero automático', cost: [150, 900, 4000], desc: ['echa una bolita cada 25 s', 'cada 16 s', 'cada 10 s'] },
    { id: 'net', name: 'Red de perlas', cost: [200, 1200, 5000], desc: ['recoge las perlas cada 30 s', 'cada 18 s', 'cada 10 s'] },
    { id: 'incub', name: 'Incubadora', cost: [120, 700, 3500], desc: ['huevos un 30 % más rápidos', 'un 50 %', 'un 70 %'] },
    { id: 'cap', name: 'Estanque más hondo', cost: [300, 1500, 6000], desc: ['+3 carpas de cupo', '+6', '+9'] },
    { id: 'bag', name: 'Saco de comida', cost: [100, 600, 3000], desc: ['16 bolitas y salen antes', '20', '24'] },
  ];

  // Encargos del día: cada día salen tres de esta lista
  const QUESTS = [
    { id: 'feed', text: 'Alimenta a tus carpas', n: 15 },
    { id: 'pearls', text: 'Recoge perlas', n: 60 },
    { id: 'hatch', text: 'Abre huevos', n: 2 },
    { id: 'grow', text: 'Haz crecer una carpa', n: 1 },
    { id: 'fortune', text: 'Atrapa la carpa de la fortuna', n: 1 },
    { id: 'heron', text: 'Espanta a la garza', n: 1 },
    { id: 'lure', text: 'Guía a tus carpas con el dedo', n: 1 },
    { id: 'breed', text: 'Mezcla dos carpas en el laboratorio', n: 1 },
  ];

  // cost = perlas para desbloquear · egg = precio del huevo · pool = especies que pueden salir
  const ZONES = [
    { id: 'estanque',  name: 'Estanque',          cost: 0,     egg: 30,   bg: '#07131c', water: '#2f7fa8', shore: '#6b5b45', grass: '#3d6b3a',
      pool: ['gris', 'naranja', 'kohaku', 'shiro', 'ogon'] },
    { id: 'nenufares', name: 'Nenúfares',         cost: 120,   egg: 120,  bg: '#07170f', water: '#2f9a78', shore: '#5d6b3a', grass: '#3f8a3a',
      pool: ['musgo', 'asagi', 'sanke', 'shusui', 'kujaku'] },
    { id: 'cascada',   name: 'Cascada',           cost: 500,   egg: 300,  bg: '#08141f', water: '#4aa3d6', shore: '#56606b', grass: '#3d6b5a',
      pool: ['plateada', 'benigoi', 'showa', 'platinum', 'tancho'] },
    { id: 'cueva',     name: 'Cueva',             cost: 1500,  egg: 800,  bg: '#0c0912', water: '#2b6a7a', shore: '#4a4058', grass: '#3b3448',
      pool: ['ciega', 'cristal', 'brasa', 'fantasma', 'abisal'] },
    { id: 'luna',      name: 'Lago de la Luna',   cost: 4000,  egg: 2000, bg: '#05071a', water: '#3b4fa8', shore: '#3d4366', grass: '#4a5a9a',
      pool: ['rocio', 'lunar', 'kumonryu', 'medianoche', 'lunallena'] },
    { id: 'templo',    name: 'Templo sumergido',  cost: 10000, egg: 5000, bg: '#06151a', water: '#1f8a8a', shore: '#7a6a45', grass: '#2e8a6a',
      pool: ['piedra', 'jade', 'ambar', 'dragon', 'celestial'] },
    { id: 'portal',    name: 'Portal',            cost: 25000, egg: 8000, bg: '#0b0614', water: '#5a3fa0', shore: '#4a3f66', grass: '#3a2f5a', portal: true,
      pool: ['ceniza', 'magma', 'escarcha', 'hielo', 'nebulosa', 'estelar', 'estatica', 'glitch'] },
  ];

  // El portal conecta cada día con un mundo distinto, y solo trae las carpas de ese mundo.
  // Se abre la primera media hora de cada hora par (las 0:00, las 2:00, las 4:00...).
  const WORLDS = [
    { id: 'lava', name: 'Mundo de lava', color: '#ff6a2b', pool: ['ceniza', 'magma'] },
    { id: 'hielo', name: 'Mundo helado', color: '#9fe8ff', pool: ['escarcha', 'hielo'] },
    { id: 'estrellas', name: 'Mundo de las estrellas', color: '#b8a4ff', pool: ['nebulosa', 'estelar'] },
    { id: 'roto', name: 'Mundo roto', color: '#00ff9c', pool: ['estatica', 'glitch'] },
  ];

  return { RARITY, SPECIES, ZONES, SECRETS, UPGRADES, QUESTS, LAB, RECIPES, WORLDS };
})();

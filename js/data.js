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
    dragon:     { name: 'Carpa dragón',      r: 3, pat: ['#e63946', '#ffd23f', '#e63946', '#2ec4b6'] },
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
    // Criaturas del laboratorio: solo salen de una fórmula (shape = cómo se dibujan, long = largo, spd = velocidad)
    ryu:        { name: 'Dragón',            r: 4, pat: ['#d62839', '#ffd23f', '#d62839', '#ff7b00'], shape: 'dragon', long: 2.1, spd: 1.1, lab: true },
    komodo:     { name: 'Komodo',            r: 4, pat: ['#6b7550', '#857f58', '#5b6446', '#9a9068'], shape: 'komodo', long: 1.25, spd: 0.7, lab: true },
  };

  // Laboratorio: se construye una vez; mezcla dos carpas adultas. Ciertas parejas dan una criatura.
  const LAB = { cost: 20000 };
  const RECIPES = [
    { sp: 'ryu', a: 'dragon', b: 'brasa', hint: 'una carpa de leyenda y otra que arde' },
    { sp: 'komodo', a: 'piedra', b: 'musgo', hint: 'algo duro como la roca y algo verde' },
  ];

  // Rincones secretos del mapa (en map.js, después de las seis zonas). Se encuentran, no se compran.
  const SECRETS = [
    { id: 'gruta', name: 'Gruta escondida', water: '#46407a', shore: '#4a4058', grass: '#3b3358', species: 'eco', reward: 4800 },
    { id: 'poza', name: 'Poza secreta', water: '#784a6e', shore: '#6b5b45', grass: '#4a6b3a', species: 'rubi', reward: 2400 },
  ];

  // Mejoras que se compran con perlas: tres niveles cada una
  const UPGRADES = [
    { id: 'feeder', name: 'Comedero automático', cost: [1500, 9000, 40000], desc: ['echa una bolita cada 25 s', 'cada 16 s', 'cada 10 s'] },
    { id: 'net', name: 'Red de perlas', cost: [2000, 12000, 50000], desc: ['recoge las perlas cada 30 s', 'cada 18 s', 'cada 10 s'] },
    { id: 'fichas', name: 'Máquina de fichas', cost: [1200, 7000, 35000], desc: ['una ficha cada 15 min y caben 6', 'cada 10 min y caben 8', 'cada 6 min y caben 10'] },
    { id: 'cap', name: 'Estanque más hondo', cost: [3000, 15000, 60000], desc: ['+3 carpas de cupo', '+6', '+9'] },
    { id: 'bag', name: 'Saco de comida', cost: [1000, 6000, 30000], desc: ['16 bolitas y salen antes', '20', '24'] },
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

  // cost = perlas para desbloquear · spin = precio de un giro de la ruleta de la zona ·
  // pool = especies que pueden salir de sus huevos
  // Los huevos ya no se compran: solo salen de la ruleta (ver WHEEL más abajo). Los precios están
  // pensados para un giro cada ~4 min de ingreso; se ajustan jugando.
  const ZONES = [
    { id: 'estanque',  name: 'Estanque',          cost: 0,      spin: 200,   bg: '#07131c', water: '#2f7fa8', shore: '#6b5b45', grass: '#3d6b3a',
      pool: ['gris', 'naranja', 'kohaku', 'shiro', 'ogon'] },
    { id: 'nenufares', name: 'Nenúfares',         cost: 1500,   spin: 600,  bg: '#07170f', water: '#2f9a78', shore: '#5d6b3a', grass: '#3f8a3a',
      pool: ['musgo', 'asagi', 'sanke', 'shusui', 'kujaku'] },
    { id: 'cascada',   name: 'Cascada',           cost: 12000,  spin: 1500,  bg: '#08141f', water: '#4aa3d6', shore: '#56606b', grass: '#3d6b5a',
      pool: ['plateada', 'benigoi', 'showa', 'platinum', 'tancho'] },
    { id: 'cueva',     name: 'Cueva',             cost: 40000,  spin: 3000,  bg: '#0c0912', water: '#2b6a7a', shore: '#4a4058', grass: '#3b3448',
      pool: ['ciega', 'cristal', 'brasa', 'fantasma', 'abisal'] },
    { id: 'luna',      name: 'Lago de la Luna',   cost: 100000, spin: 5500,  bg: '#05071a', water: '#3b4fa8', shore: '#3d4366', grass: '#4a5a9a',
      pool: ['rocio', 'lunar', 'kumonryu', 'medianoche', 'lunallena'] },
    { id: 'templo',    name: 'Templo sumergido',  cost: 250000, spin: 9000,  bg: '#06151a', water: '#1f8a8a', shore: '#7a6a45', grass: '#2e8a6a',
      pool: ['piedra', 'jade', 'ambar', 'dragon', 'celestial'] },
    { id: 'portal',    name: 'Portal',            cost: 600000, spin: 15000, bg: '#0b0614', water: '#5a3fa0', shore: '#4a3f66', grass: '#3a2f5a', portal: true,
      pool: ['ceniza', 'magma', 'escarcha', 'hielo', 'nebulosa', 'estelar', 'estatica', 'glitch'] },
  ];

  // ── Ruleta ──
  // Tipos de huevo: min = rareza mínima de la carpa que sale · mult = lo que vale, en veces el precio del giro
  const TIERS = {
    barro:   { name: 'huevo de barro',   min: 0, mult: 1,   color: '#b39671' },
    plata:   { name: 'huevo de plata',   min: 1, mult: 1.8, color: '#cdd8e0' },
    oro:     { name: 'huevo de oro',     min: 2, mult: 3.5, color: '#ffd23f' },
    cristal: { name: 'huevo de cristal', min: 3, mult: 9,   color: '#7fe8ff' },
    mitico:  { name: 'huevo mítico',     min: 4, mult: 30,  color: '#ff4d8d' },
  };
  // Probabilidades por giro (suman 1). Calibradas con la garantía incluida: de cada 100 perlas gastadas
  // vuelven ~85 en valor (consuelo 0,15×, perlas ×½/×2/×10, y cada huevo vale `mult` × el precio del giro).
  // Un huevo de una zona cuya reserva no llega a esa rareza se cambia por un bote de perlas del mismo valor.
  const WHEEL = {
    pity: { oro: 40, mitico: 300 },            // garantía: huevo de oro o mejor cada 40 giros, mítico cada 300
    consuelo: 0.15,
    maxFichas: 5, fichaEvery: 20 * 60,         // las fichas: una cada 20 min, caben 5 (la máquina de fichas mejora ambas)
    daily: 2,                                  // fichas de regalo al entrar cada día
    outcomes: [
      { id: 'migajas',  label: 'migajas',     p: 0.55156, color: '#3a4350' },
      { id: 'perlas05', label: 'perlas ×½',   p: 0.1096,  color: '#2f6f9a', mult: 0.5 },
      { id: 'perlas2',  label: 'perlas ×2',   p: 0.03224, color: '#3f9a52', mult: 2 },
      { id: 'perlas10', label: 'perlas ×10',  p: 0.00387, color: '#7bdc6a', mult: 10 },
      { id: 'barro',    label: 'barro',       p: 0.14184, color: '#8a6d4a', egg: 'barro' },
      { id: 'plata',    label: 'plata',       p: 0.07737, color: '#aab6c0', egg: 'plata' },
      { id: 'oro',      label: 'oro',         p: 0.02708, color: '#e0b020', egg: 'oro' },
      { id: 'cristal',  label: 'cristal',     p: 0.0058,  color: '#4cc9f0', egg: 'cristal' },
      { id: 'mitico',   label: 'mítico',      p: 0.00064, color: '#ff4d8d', egg: 'mitico' },
      { id: 'libre',    label: 'giro gratis', p: 0.05,    color: '#f2f2f2' },
    ],
  };

  // El portal conecta cada día con un mundo distinto, y solo trae las carpas de ese mundo.
  // Se abre la primera media hora de cada hora par (las 0:00, las 2:00, las 4:00...).
  const WORLDS = [
    { id: 'lava', name: 'Mundo de lava', color: '#ff6a2b', pool: ['ceniza', 'magma'] },
    { id: 'hielo', name: 'Mundo helado', color: '#9fe8ff', pool: ['escarcha', 'hielo'] },
    { id: 'estrellas', name: 'Mundo de las estrellas', color: '#b8a4ff', pool: ['nebulosa', 'estelar'] },
    { id: 'roto', name: 'Mundo roto', color: '#00ff9c', pool: ['estatica', 'glitch'] },
  ];

  return { RARITY, SPECIES, ZONES, SECRETS, UPGRADES, QUESTS, LAB, RECIPES, WORLDS, TIERS, WHEEL };
})();

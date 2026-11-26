/* Estanque ASCII — motor del juego. Sin dependencias, sin build.
 *
 * El mundo es UN lago (map.js) que empieza en el centro y se va abriendo por zonas; dos rincones
 * secretos se alcanzan por pasadizos y se descubren, no se compran. Las carpas nadan libres por todo
 * lo abierto. Una cámara (arrastrar, rueda / pellizco / botones) muestra la parte que cabe en pantalla.
 *
 * La escena se pinta de verdad (agua, carpas con cuerpo y aletas, decorado) en un lienzo con un
 * píxel por celda; después cada píxel se convierte en UNA letra (ascii-gl.js, en la tarjeta gráfica).
 *
 * Además de alimentar, criar y abrir zonas, el estanque está vivo: hay día y noche (la hora real),
 * lluvia, una carpa de la fortuna que viene de visita, una garza a la que hay que espantar, tesoros
 * escondidos, mejoras que se compran con perlas y tres encargos cada día.
 *
 * Parámetros de la dirección (para probar): ?demo, ?demo=inicio, ?hora=22 (fija la hora),
 * ?rapido (los visitantes, la garza y la lluvia llegan enseguida).
 */
(() => {
  const { RARITY, SPECIES, ZONES, SECRETS, UPGRADES, QUESTS, LAB, RECIPES, WORLDS, GACHA } = DATA;
  const NZ = MAP.N, MAIN = MAP.MAIN;                 // 9 zonas en el mapa: las 7 que se compran y 2 secretas
  const ZINFO = [...ZONES, ...SECRETS];             // colores y nombre de cada zona del mapa, en el mismo orden

  // ───────────────────────── constantes ─────────────────────────
  const PARAMS = new URLSearchParams(location.search);
  const DEMO = PARAMS.get('demo');                   // null = partida normal
  const HOUR = PARAMS.has('hora') ? +PARAMS.get('hora') : null;
  const FAST = PARAMS.has('rapido');
  const MAX_CELLS = 26000;               // tope de celdas (limita el coste por fotograma)
  const MIN_CELL = 5;                    // tamaño mínimo de celda en píxeles CSS
  const CAP = 6;                         // carpas que caben por cada zona abierta (el cupo es global)
  const HUNGER_RATE = 100 / 360;         // de 100 a 0 en 6 min
  const FEED = 30;                       // hambre que quita una bolita
  const DETECT = 50;                     // a qué distancia huele la comida una carpa
  const STAGE_XP = [0, 3, 8, 16, 30];    // bolitas comidas para cada tamaño
  const SAVE_KEY = 'estanque-ascii-v3';
  const PERLA_EVERY = 14;                // segundos de media entre perla y perla de cada carpa
  const AWAY_RATE = 0.25;                // ritmo de perlas fuera del juego cuando ya tienen hambre
  const STAGE_NAMES = ['alevín', 'joven', 'adulta', 'grande', 'enorme'];
  const LEN = [7, 9, 11, 14, 17];        // largo de la carpa en unidades de mundo
  const M = 8;                           // puntos de la columna de cada carpa
  const MARGIN = 30;                     // lo que se ve de niebla más allá del lago descubierto
  const ZOOM_MAX = 26;                   // píxeles CSS por unidad de mundo
  const BREED_REST = 10 * 60 * 1000;     // descanso de una carpa después de criar
  const FORTUNE = { name: 'Carpa de la fortuna', r: 3, pat: ['#ffd23f', '#fff6c2', '#ffb703', '#fff6c2'] };

  // sprite de texto: solo para los paneles
  const SPRITE = '><(((º>';

  // ───────────────────────── utilidades ─────────────────────────
  const $ = (s) => document.querySelector(s);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  const stageOf = (xp) => { let s = 0; STAGE_XP.forEach((t, i) => { if (xp >= t) s = i; }); return s; };
  const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(Math.floor(n)));
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const smooth = (v) => { v = clamp(v, 0, 1); return v * v * (3 - 2 * v); };
  const lenOf = (stage) => LEN[stage];
  const zoneCenter = (zi) => [MAP.Z[zi].x, MAP.Z[zi].y];
  const zoneName = (zi) => ZINFO[zi].name;

  // ───────────────────────── estado y guardado ─────────────────────────
  // Carpas, perlas y bolitas viven en coordenadas de MUNDO.
  const freshUp = () => Object.fromEntries(UPGRADES.map((u) => [u.id, 0]));
  function fresh() {
    return {
      perlas: 40, food: 12, foodT: 0,
      unlocked: ZONES.map((_, i) => i === 0),
      // dos carpas de salida: con una sola el principio se hace muy lento
      carps: [{ sp: 'gris', hunger: 80, xp: 0, x: 0, y: 0, pt: 4 }, { sp: 'naranja', hunger: 80, xp: 0, x: 8, y: -6, pt: 9 }],
      floating: [], album: { gris: 1, naranja: 1 }, eggs: [], seen: Date.now(), cam: null,
      secrets: {}, found: {}, up: freshUp(), quests: null, hybrids: {}, sound: true, lab: { built: false },
    };
  }
  function demo() {
    const all = DEMO !== 'inicio', ids = Object.keys(SPECIES);
    const zoneOfId = (id) => { const z = ZONES.findIndex((zz) => zz.pool.includes(id)); if (z >= 0) return z; const k = SECRETS.findIndex((s) => s.species === id); return k >= 0 ? MAIN + k : 0; };
    const carps = ids.map((id, i) => ({ id, i, zi: zoneOfId(id) }))
      .filter((o) => all || (o.zi === 0 && !SPECIES[o.id].lab))
      .map(({ id, i, zi }) => {
        const [x, y] = MAP.randomPoint(zi, 0.7);
        // las raras, más grandes; las comunes, de todos los tamaños
        return { sp: id, hunger: 85, xp: STAGE_XP[Math.min(4, SPECIES[id].r + (i % 3))], x, y, pt: rnd(2, 10) };
      });
    return {
      perlas: 1000000, food: 12, foodT: 0,
      unlocked: ZONES.map((_, i) => all || i === 0),
      carps, floating: [], album: Object.fromEntries(ids.filter((id) => all || (zoneOfId(id) === 0 && !SPECIES[id].lab)).map((id) => [id, 1])), eggs: [], seen: Date.now(), cam: null,
      secrets: all ? Object.fromEntries(SECRETS.map((s) => [s.id, true])) : {}, found: {}, up: freshUp(), quests: null, hybrids: {}, sound: true, lab: { built: all },
    };
  }
  function load() {
    if (DEMO !== null) return demo();
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (s && Array.isArray(s.unlocked)) while (s.unlocked.length < ZONES.length) s.unlocked.push(false);   // zonas nuevas (el Portal)
      if (!s || !Array.isArray(s.carps) || !Array.isArray(s.unlocked) || s.unlocked.length !== ZONES.length) return null;
      return s;
    } catch { return null; }
  }
  function save() {
    if (DEMO !== null) return;                      // la partida de muestra no se guarda
    S.seen = Date.now(); S.cam = { x: +cam.x.toFixed(1), y: +cam.y.toFixed(1), z: +cam.z.toFixed(2) };
    try {
      const out = { ...S,
        carps: S.carps.map((c) => ({ sp: c.sp, hy: c.hy, hunger: c.hunger, xp: c.xp, x: c.x, y: c.y, pt: c.pt, bt: c.bt })),
        floating: S.floating.map((p) => ({ x: p.x, y: p.y, v: p.v })) };
      localStorage.setItem(SAVE_KEY, JSON.stringify(out));
    } catch { /* sin almacenamiento: se juega igual */ }
  }

  let S = load() || fresh();
  // partidas guardadas antes de estas novedades: se completan sin perder nada
  if (!Array.isArray(S.floating)) S.floating = [];
  S.secrets = S.secrets || {}; S.found = S.found || {}; S.hybrids = S.hybrids || {};
  S.up = { ...freshUp(), ...(S.up || {}) };
  if (S.sound === undefined) S.sound = true;
  // el dragón del laboratorio (26/11) ya no existe: las partidas que lo tenían se quedan con una carpa dragón
  S.carps.forEach((c) => { if (c.sp === 'ryu') c.sp = 'dragon'; });
  (S.eggs || []).forEach((e) => { if (e.sp === 'ryu') e.sp = 'dragon'; });
  if (S.album && S.album.ryu) { S.album.dragon = (S.album.dragon || 0) + S.album.ryu; delete S.album.ryu; }
  S.lab = S.lab || { built: false };
  // gachapon (27/11): ya no hay huevos. Los huevos sueltos que quedaban pasan a ser cápsulas guardadas, que se abren gratis en su nenúfar;
  // los del laboratorio siguen en S.eggs (la mezcla de dentro). La incubadora pasa a ser el amuleto de la suerte.
  S.gacha = S.gacha || {};
  S.gacha.free = S.gacha.free || []; S.gacha.out = S.gacha.out || []; S.gacha.hist = S.gacha.hist || []; S.gacha.pity = S.gacha.pity || {};
  if (S.gacha.fichas == null) { S.gacha.fichas = DEMO !== null ? GACHA.fichas.max : 3; S.gacha.fichaT = 0; S.gacha.day = ''; }      // fichas de bienvenida
  S.eggs = (S.eggs || []).filter((e) => { if (e.lab) return true; S.gacha.free.push(Math.min(e.zone || 0, ZONES.length - 1)); return false; });
  if (S.up.incub) { S.up.amuleto = Math.max(S.up.amuleto || 0, S.up.incub); }
  delete S.up.incub;
  SOUND.set(S.sound);

  // ───────────────────────── zonas, agua y rutas ─────────────────────────
  const isOpen = (zi) => (zi < MAIN ? !!S.unlocked[zi] : !!S.secrets[MAP.Z[zi].id]);
  const openMain = () => S.unlocked.filter(Boolean).length;
  // 2 abierta · 1 se intuye en la oscuridad (la siguiente que se puede abrir) · 0 niebla
  function status(zi) {
    if (isOpen(zi)) return 2;
    return zi < MAIN && zi > 0 && S.unlocked[zi - 1] ? 1 : 0;
  }
  function waterAt(x, y, lim) { const q = MAP.sample(x, y); return q.r < lim && isOpen(q.z); }
  const randomWaterPoint = (zi) => MAP.randomPoint(zi, 0.75);
  const zoneOf = (x, y) => { const z = MAP.zoneAt(x, y); return isOpen(z) ? z : 0; };

  // camino más corto entre zonas abiertas (búsqueda en anchura sobre las fronteras del mapa)
  function pathTo(fromZ, toZ) {
    const prev = new Array(NZ).fill(-1), q = [fromZ];
    prev[fromZ] = fromZ;
    while (q.length) {
      const u = q.shift();
      if (u === toZ) break;
      for (const v of MAP.adj[u]) if (prev[v] < 0 && isOpen(v)) { prev[v] = u; q.push(v); }
    }
    if (prev[toZ] < 0) return null;
    const path = [toZ];
    while (path[0] !== fromZ) path.unshift(prev[path[0]]);
    return path;
  }
  // puntos de paso: el punto más hondo de cada frontera; para un secreto, su pasadizo entero
  function routeTo(fromZ, toZ) {
    const pts = [];
    if (fromZ === toZ) return pts;
    const path = pathTo(fromZ, toZ);
    if (!path) return pts;
    for (let i = 0; i < path.length - 1; i++) {
      const u = path[i], v = path[i + 1];
      if (v >= MAIN) pts.push(...MAP.secretPath(v));
      else if (u >= MAIN) pts.push(...MAP.secretPath(u).reverse().slice(1));
      else { const w = MAP.waypoint(u, v); if (w) pts.push({ x: w.x, y: w.y }); }
    }
    return pts;
  }

  // ───────────────────────── mejoras ─────────────────────────
  const lvl = (id) => S.up[id] || 0;
  const capacity = () => CAP * openMain() + 3 * lvl('cap');
  const foodMax = () => 12 + 4 * lvl('bag');
  let raining = false;
  const foodEvery = () => [5, 4.2, 3.5, 2.8][lvl('bag')] * (raining ? 0.5 : 1);
  const LAB_TIME = (z) => (DEMO !== null ? 3 : 20 * (Math.min(z, ZONES.length - 1) + 1)) * 1.5;      // segundos que tarda una mezcla

  // ───────────────────────── portal ─────────────────────────
  // Abierto la primera media hora de cada hora par; cada día da a un mundo distinto.
  const PORTAL = ZONES.findIndex((z) => z.portal);
  const worldToday = () => { const d = new Date(); return WORLDS[Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000) % WORLDS.length]; };
  function portalOpen() {
    if (FAST || DEMO !== null) return true;
    const d = new Date(); return d.getHours() % 2 === 0 && d.getMinutes() < 30;
  }
  function portalNext() {                            // hora a la que vuelve a abrir, como texto
    const h = new Date().getHours();
    return `${(h % 2 === 0 ? h + 2 : h + 1) % 24}:00`;
  }

  // ───────────────────────── carpas ─────────────────────────
  // especie de una carpa: la de los datos, la de una cría (mezcla de sus padres) o la de la fortuna
  const spOf = (c) => (c.fortune ? FORTUNE : c.hy ? c.hy : SPECIES[c.sp] || SPECIES.gris);
  // largo de una carpa: el de su tamaño, por lo largo que sea su especie (el dragón es mucho más largo)
  const lenC = (c) => lenOf(stageOf(c.xp));
  function resetSpine(c) {
    const sl = lenC(c) / (M - 1);
    c.spine = [];
    for (let i = 0; i < M; i++) c.spine.push({ x: c.x - Math.cos(c.ang) * sl * i, y: c.y - Math.sin(c.ang) * sl * i });
  }
  function initCarp(c) {
    // fuera del agua (partida vieja, o el mapa ha cambiado): a su zona, o al estanque del centro
    if (c.x == null || !waterAt(c.x, c.y, 0.85)) [c.x, c.y] = randomWaterPoint(c.x == null ? 0 : zoneOf(c.x, c.y));
    c.ang = Math.random() * Math.PI * 2;
    c.tx = c.x; c.ty = c.y; c.retarget = 0; c.speed = 0; c.route = []; c.chaseP = null;
    c.phase = Math.random() * 6;
    if (c.pt == null) c.pt = rnd(6, 14);
    resetSpine(c);
    return c;
  }
  S.carps.forEach(initCarp);
  S.floating.forEach((p) => { if (!waterAt(p.x, p.y, 0.85)) [p.x, p.y] = randomWaterPoint(zoneOf(p.x, p.y)); });

  const perlaValue = (c) => Math.max(1, RARITY[spOf(c).r].mult * (stageOf(c.xp) + 1));

  // el tiempo que no estuviste (hasta 4 h): el hambre baja a medio ritmo y nunca por debajo de 15.
  // Las carpas siguen soltando perlas: a ritmo normal mientras están comidas y a un cuarto después.
  const AWAY = clamp((Date.now() - (S.seen || Date.now())) / 1000, 0, 4 * 3600);
  let offline = 0;
  S.carps.forEach((c) => {
    const rate = HUNGER_RATE * 0.5, fed = c.hunger > 30 ? Math.min(AWAY, (c.hunger - 30) / rate) : 0;
    offline += Math.floor((fed + (AWAY - fed) * AWAY_RATE) / PERLA_EVERY) * perlaValue(c);
    c.hunger = Math.max(Math.min(c.hunger, 15), c.hunger - AWAY * rate);
  });
  S.perlas += offline;
  S.food = Math.min(foodMax(), S.food + Math.floor(AWAY / foodEvery()));

  // soltar una carpa al río: devuelve parte de lo que costó su huevo, más cuanto más grande y rara
  const zoneOfSpecies = (c) => (c.hy ? c.hy.z : SPECIES[c.sp] && SPECIES[c.sp].lab ? 5 : Math.max(0, ZONES.findIndex((z) => z.pool.includes(c.sp))));
  const releaseValue = (c) => Math.max(1, Math.round(ZONES[Math.min(ZONES.length - 1, zoneOfSpecies(c))].pull * (0.2 + 0.1 * stageOf(c.xp)) * Math.sqrt(RARITY[spOf(c).r].mult)));

  // ───────────────────────── mundo ─────────────────────────
  let t = 0;                 // segundos de juego
  let pellets = [];          // comida flotando
  let ripples = [];          // ondas
  let selected = null;       // carpa elegida
  let fortune = null;        // carpa de la fortuna de visita
  let heron = null;          // garza
  let lure = null;           // dedo que guía a las carpas
  const ev = {               // cuándo llega la próxima visita, garza o lluvia (en segundos de juego)
    fortune: FAST ? 8 : rnd(120, 260), heron: FAST ? 20 : rnd(240, 420), rain: FAST ? 14 : rnd(300, 700), rainEnd: 0,
    feeder: 0, net: 0,
  };
  function ripple(x, y, small) { ripples.push({ x, y, born: t, max: small ? 1 : 2, speed: small ? 6 : 10 }); }

  // ───────────────────────── cámara ─────────────────────────
  const cam = { x: 0, y: 0, z: 8 };            // z = píxeles CSS por unidad de mundo
  let fly = null, camDirty = true, pendingFly = null;
  let W = 1, H = 1, cellCss = 8, GW = 1, GH = 1;
  const U = () => cam.z / cellCss;             // celdas por unidad

  function bounds() {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let zi = 0; zi < NZ; zi++) {
      if (!isOpen(zi)) continue;
      const b = MAP.bbox(zi);
      x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]);
    }
    return { x0, y0, x1, y1 };
  }
  // lo más lejos que se puede alejar: hasta ver todo el lago descubierto
  function zoomMin() {
    const b = bounds();
    return Math.max(1.5, Math.min(W / (b.x1 - b.x0 + 2 * MARGIN), H / (b.y1 - b.y0 + 2 * MARGIN)));
  }
  const defaultZoom = () => clamp(W / 150, 4, 8);
  function clampCam() {
    cam.z = clamp(cam.z, zoomMin(), ZOOM_MAX);
    const b = bounds(), vw = W / cam.z, vh = H / cam.z;
    const x0 = b.x0 - MARGIN, x1 = b.x1 + MARGIN, y0 = b.y0 - MARGIN, y1 = b.y1 + MARGIN;
    cam.x = x1 - x0 <= vw ? (x0 + x1) / 2 : clamp(cam.x, x0 + vw / 2, x1 - vw / 2);
    cam.y = y1 - y0 <= vh ? (y0 + y1) / 2 : clamp(cam.y, y0 + vh / 2, y1 - vh / 2);
    camDirty = true;
  }
  function screenToWorld(px, py) { const u = U(); return [cam.x + (px / cellCss - GW / 2) / u, cam.y + (py / cellCss - GH / 2) / u]; }
  function zoomAt(px, py, factor) {
    const [bx, by] = screenToWorld(px, py);
    cam.z = clamp(cam.z * factor, zoomMin(), ZOOM_MAX);
    const [ax, ay] = screenToWorld(px, py);
    cam.x += bx - ax; cam.y += by - ay; fly = null; clampCam();
  }
  // zoom suave (rueda, botones y teclado): se fija un objetivo y la cámara llega a él en unas décimas,
  // sin mover el punto que hay bajo el ratón. El pellizco en el móvil sigue yendo directo al dedo.
  let zoomTo = null;
  function zoomSmooth(px, py, factor) {
    zoomTo = { z: clamp((zoomTo ? zoomTo.z : cam.z) * factor, zoomMin(), ZOOM_MAX), px, py };
    fly = null;
  }
  function stepZoom(dt) {
    if (!zoomTo) return;
    const before = cam.z, k = 1 - Math.exp(-dt * 18);
    zoomAt(zoomTo.px, zoomTo.py, (cam.z + (zoomTo.z - cam.z) * k) / cam.z);
    if (Math.abs(zoomTo.z - cam.z) < 0.004 * cam.z || cam.z === before) zoomTo = null;
  }
  function flyTo(x, y, z) { fly = { x, y, z: z || cam.z }; zoomTo = null; }
  function flyToZone(zi) { const [x, y] = zoneCenter(zi); flyTo(x, y, zi >= MAIN ? Math.max(defaultZoom(), 6) : defaultZoom()); }

  // ───────────────────────── lienzo de origen (1 píxel = 1 celda) ─────────────────────────
  const src = document.createElement('canvas');
  let g = src.getContext('2d', { willReadFrequently: true });
  // Las carpas se pintan en su propia capa y se recortan con la máscara del agua: lo que sale del
  // agua (una cola al girar junto a la orilla) queda escondido bajo la orilla, como en un estanque de verdad.
  const fishCv = document.createElement('canvas'), fishCtx = fishCv.getContext('2d', { willReadFrequently: true });
  const maskCv = document.createElement('canvas'), maskCtx = maskCv.getContext('2d', { willReadFrequently: true });
  let maskImg = null, img = null, sinX = null, sinY = null;
  // datos por celda: dependen solo de la cámara (y de qué está abierto), así que se recalculan cuando cambian
  let zIdx, z2Arr, wArr, rArr, hArr, h2Arr, dnArr;
  let cFx, cFx2, cSA, cS19, cC19, rFy, rFy2, rSB, rS19, rC19;

  const ZC = ZINFO.map((z) => {
    const w = hex(z.water), dark = ['cueva', 'gruta'].includes(z.id) ? 0.7 : ['luna', 'portal'].includes(z.id) ? 0.8 : 1;
    return { deep: w.map((v) => v * 0.38 * dark), light: w.map((v) => v * 0.95 * dark), shore: hex(z.shore), grass: hex(z.grass) };
  });
  const COSZ = ZINFO.map((_, z) => Math.cos(z)), SINZ = ZINFO.map((_, z) => Math.sin(z));
  // ruido por celda (hash de coordenadas enteras del mundo): se guarda en una tabla para no repetir senos
  const HX0 = -512, HY0 = -512, HTW = 1280, HTH = 1152;
  let HT = null;
  function hashI(ix, iy) {
    const a = ix - HX0, b = iy - HY0;
    if (a < 0 || b < 0 || a >= HTW || b >= HTH) return hash(ix, iy);
    if (!HT) HT = new Float32Array(HTW * HTH).fill(NaN);
    const k = b * HTW + a; let v = HT[k];
    if (v !== v) v = HT[k] = hash(ix, iy);
    return v;
  }
  function allocCells() {
    const N = GW * GH;
    zIdx = new Int8Array(N); z2Arr = new Int8Array(N); wArr = new Float32Array(N);
    rArr = new Float32Array(N); hArr = new Float32Array(N); h2Arr = new Float32Array(N); dnArr = new Float32Array(N);
    cFx = new Int32Array(GW); cFx2 = new Int32Array(GW); cSA = new Float64Array(NZ * GW); cS19 = new Float64Array(GW); cC19 = new Float64Array(GW);
    rFy = new Int32Array(GH); rFy2 = new Int32Array(GH); rSB = new Float64Array(NZ * GH); rS19 = new Float64Array(GH); rC19 = new Float64Array(GH);
  }

  // Se rehace cada vez que la cámara se mueve. Lo que depende solo de la columna o de la fila se
  // calcula una vez por columna / fila (las manchas de profundidad son productos de senos de x y de y).
  function buildCells() {
    const u = U(), gw = GW, gh = GH, camX = cam.x, camY = cam.y;
    const zI = zIdx, z2A = z2Arr, wA = wArr, rA = rArr, hA = hArr, h2A = h2Arr, dnA = dnArr;
    for (let x = 0; x < gw; x++) {
      const wx = camX + (x + 0.5 - gw / 2) / u;
      cFx[x] = Math.floor(wx); cFx2[x] = Math.floor(wx * 0.5);
      for (let z = 0; z < NZ; z++) cSA[z * gw + x] = Math.sin(wx * 0.083 + z);
      cS19[x] = Math.sin(wx * 0.19); cC19[x] = Math.cos(wx * 0.19);
    }
    for (let y = 0; y < gh; y++) {
      const wy = camY + (y + 0.5 - gh / 2) / u;
      rFy[y] = Math.floor(wy); rFy2[y] = Math.floor(wy * 0.5);
      for (let z = 0; z < NZ; z++) rSB[z * gh + y] = Math.sin(wy * 0.071 - z * 1.3);
      rS19[y] = Math.sin(wy * 0.19); rC19[y] = Math.cos(wy * 0.19);
    }
    for (let y = 0; y < gh; y++) {
      const wy = camY + (y + 0.5 - gh / 2) / u, fy = rFy[y], fy2 = rFy2[y], s19y = rS19[y], c19y = rC19[y];
      for (let x = 0, n = y * gw; x < gw; x++, n++) {
        const wx = camX + (x + 0.5 - gw / 2) / u, q = MAP.sample(wx, wy), zi = q.z;
        zI[n] = zi; z2A[n] = q.z2; wA[n] = q.w; rA[n] = q.r;
        hA[n] = hashI(cFx[x], fy); h2A[n] = hashI(cFx2[x], fy2);
        const sx = cS19[x], cx = cC19[x], sXY = sx * c19y + cx * s19y, cXY = cx * c19y - sx * s19y;
        dnA[n] = 0.8 + 0.4 * (0.5 + 0.5 * cSA[zi * gw + x] * rSB[zi * gh + y] + 0.25 * (sXY * COSZ[zi] + cXY * SINZ[zi]));
      }
    }
    camDirty = false;
    if (glr) glr.hashDirty = true;
  }

  // agua con cáusticas, orilla y terreno; lo que no está abierto queda en niebla, que se funde en las fronteras
  const FOGK = [0.06, 0.2, 1];
  const tmpDeep = [0, 0, 0], tmpLight = [0, 0, 0];
  function paintGround() {
    if (camDirty) buildCells();
    const d = img.data, md = maskImg.data, u = U(), st = ZINFO.map((_, i) => status(i));
    for (let x = 0; x < GW; x++) sinX[x] = Math.sin((cam.x + (x + 0.5 - GW / 2) / u) * 0.23 - t * 0.28);
    for (let y = 0; y < GH; y++) sinY[y] = Math.sin((cam.y + (y + 0.5 - GH / 2) / u) * 0.27 + t * 0.35);
    for (let y = 0; y < GH; y++) {
      const yv = cam.y + (y + 0.5 - GH / 2) / u, ay = sinY[y] * 2.1;
      for (let x = 0; x < GW; x++) {
        const n = y * GW + x, i = n * 4, h = hArr[n], zi = zIdx[n], z2 = z2Arr[n], w = wArr[n], r = rArr[n];
        const k = FOGK[st[zi]] * w + FOGK[st[z2]] * (1 - w);
        let R, G, B;
        if (k < 0.07) {                                     // niebla
          const v = 5 + 5 * h; R = v; G = v + 3; B = v + 7;
        } else {
          const z = ZC[zi], xv = cam.x + (x + 0.5 - GW / 2) / u;
          if (r < 0.93) {
            let deep = z.deep, light = z.light;
            if (w < 0.999) {                                 // cerca de la frontera, el agua mezcla los colores de las dos zonas
              const zb = ZC[z2];
              for (let c = 0; c < 3; c++) { tmpDeep[c] = zb.deep[c] + (z.deep[c] - zb.deep[c]) * w; tmpLight[c] = zb.light[c] + (z.light[c] - zb.light[c]) * w; }
              deep = tmpDeep; light = tmpLight;
            }
            // la profundidad se reparte en más distancia que en un estanque pequeño: si no, casi todo el lago sería negro
            const s = smooth((1 - (1 - r) * 0.4 - 0.3) / 0.62 * dnArr[n]);
            R = deep[0] + (light[0] - deep[0]) * s; G = deep[1] + (light[1] - deep[1]) * s; B = deep[2] + (light[2] - deep[2]) * s;
            if (k > 0.9) {
              const c1 = Math.sin(xv * 0.42 + t * 0.8 + ay) * Math.sin(yv * 0.38 - t * 0.65 + sinX[x] * 2.1);
              const kk = c1 > 0 ? c1 * c1 * 0.7 : 0;
              R = R * (1 + kk) + kk * 28; G = G * (1 + kk) + kk * 34; B = B * (1 + kk) + kk * 40;
            }
          } else if (r < 1.0) {
            const foam = 0.25 + 0.2 * Math.sin(t * 1.6 + xv * 0.7 + yv * 0.5), m = 0.75 + 0.5 * h, f = 255 * foam * 0.3;
            R = z.shore[0] * m + f; G = z.shore[1] * m + f; B = z.shore[2] * m + f;
          } else {
            const rock = h2Arr[n] > 0.82, m = (rock ? 0.55 : 0.28) + 0.35 * h, base = rock ? z.shore : z.grass;
            R = base[0] * m; G = base[1] * m; B = base[2] * m;
          }
          R = R * k + 6 * (1 - k); G = G * k + 9 * (1 - k); B = B * k + 13 * (1 - k);
        }
        d[i] = R; d[i + 1] = G; d[i + 2] = B; d[i + 3] = 255;
        // máscara del agua para las carpas: entera en el agua, se desvanece en la orilla, nada en tierra ni en lo cerrado
        md[i + 3] = st[zi] !== 2 ? 0 : r < 0.93 ? 255 : r < 1.0 ? 255 * (1 - (r - 0.93) / 0.07) : 0;
      }
    }
    g.putImageData(img, 0, 0);
    maskCtx.putImageData(maskImg, 0, 0);
  }

  // ───────────────────────── decorado (coordenadas de mundo) ─────────────────────────
  // azar fijo por zona: el decorado sale siempre igual
  const seeded = (seed) => { let k = 0; return () => hash(seed * 13.7 + k++ * 0.731, seed * 3.1 + k * 1.37); };

  function glow(x, y, r, color, a) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, color.replace('A', a)); gr.addColorStop(1, color.replace('A', 0));
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  // Las luciérnagas vuelan a una altura h sobre el punto (x, y): se ven en y - h y su reflejo en y + h.
  // Aquí solo se apuntan; se pintan al final (dan luz) y su reflejo va con los demás reflejos.
  const airLights = [];
  function fireflies(cx, cy, rx, ry, n, rgb, seed = 0) {
    for (let i = 0; i < n; i++) {
      const x = cx + Math.sin(t * 0.3 + i * 2.1 + seed) * rx * Math.cos(i + seed), y = cy + Math.cos(t * 0.25 + i * 1.3 + seed) * ry * Math.sin(i + 1 + seed);
      airLights.push({ x, y, h: 2.5 + 1.5 * Math.sin(t * 0.9 + i + seed), r: 4, rgb, a: 0.25 + 0.5 * Math.abs(Math.sin(t * 1.5 + i)) });
    }
  }
  function drawAirLights() {
    airLights.forEach((L) => { if (!L.only) glow(L.x, L.y - L.h, L.r, `rgba(${L.rgb},A)`, L.a); });
  }

  // ── reflejos ──
  // Van en su propia capa, recortada al agua, y se suman a la escena en modo «pantalla» por encima de
  // todo lo que hay en el agua: una carpa que pasa por debajo de la luna se ilumina con su reflejo.
  // El reflejo no está quieto: tiembla solo, y lo rompen las carpas que pasan y las ondas.
  function wob(x, y, nc) {
    let off = Math.sin(t * 2 + y * 0.8) * 0.7;
    for (const c of nc) {
      const L = lenC(c), d = Math.hypot(c.x - x, c.y - y);
      if (d < L * 1.3) off += Math.sin(t * 9 + d * 0.9) * 2.2 * (1 - d / (L * 1.3)) * clamp(c.speed / 6, 0.3, 1);
    }
    for (const r of ripples) {
      const age = t - r.born, d = Math.abs(Math.hypot(r.x - x, r.y - y) - age * r.speed);
      if (d < 2.5) off += Math.sin(d * 2.5 + age * 12) * 1.4 * (1 - age / r.max) * (1 - d / 2.5);
    }
    return off;
  }
  const nearC = (x, y, rad, list) => list.filter((c) => Math.abs(c.x - x) < rad && Math.abs(c.y - y) < rad);
  // reflejo de un disco (la luna) o de un anillo (si hay `inner`), fila a fila
  function reflectDisc(x, y, R, rgb, a, carps, inner = 0, innerRgb = '', innerA = 0) {
    const nc = nearC(x, y, R + 20, carps);
    for (let k = -R; k <= R; k++) {
      const wo = Math.sqrt(Math.max(0, R * R - k * k)); if (!wo) continue;
      const off = wob(x, y + k, nc), f = 1 - Math.abs(k) / R * 0.35;
      if (inner) {
        const wi = Math.sqrt(Math.max(0, inner * inner - k * k));
        g.fillStyle = `rgba(${rgb},${a * f})`; g.fillRect(x - wo + off, y + k, wo - wi, 1); g.fillRect(x + wi + off, y + k, wo - wi, 1);
        if (innerA && wi > 0) { g.fillStyle = `rgba(${innerRgb},${innerA * f})`; g.fillRect(x - wi + off, y + k, wi * 2, 1); }
      } else { g.fillStyle = `rgba(${rgb},${a * f})`; g.fillRect(x - wo + off, y + k, wo * 2, 1); }
    }
  }
  const reflCv = document.createElement('canvas'), reflCtx = reflCv.getContext('2d', { willReadFrequently: true });
  function surface(shown, carps, u) {
    reflCtx.setTransform(1, 0, 0, 1, 0, 0); reflCtx.clearRect(0, 0, GW, GH);
    reflCtx.setTransform(u, 0, 0, u, GW / 2 - cam.x * u, GH / 2 - cam.y * u);
    const scene = g; g = reflCtx;
    shown.forEach((zi) => {
      const id = ZINFO[zi].id;
      if (id === 'luna') {
        const M = moonPos(zi), ry = M.y0 + M.h;
        glow(M.x, ry, MOON_R * 2, 'rgba(255,243,176,A)', 0.12);
        reflectDisc(M.x, ry, MOON_R, '255,243,176', 0.42, carps);
        const nc = nearC(M.x, M.y0, 120, carps);                   // las estrellas, reflejadas en el agua
        SPOT.stars.forEach(([x, y], i) => { g.fillStyle = `rgba(255,255,255,${0.15 + 0.6 * Math.abs(Math.sin(t * 1.2 + i * 2.3))})`; g.fillRect(x + wob(x, y, nc) * 0.5, y, 1, 1); });
      } else if (id === 'portal') {
        const P = portalPos(zi), ry = P.y0 + P.h, open = portalOpen(), col = hex(worldToday().color).join(',');
        glow(P.x, ry, RING_R * 2, `rgba(${col},A)`, open ? 0.14 : 0.04);
        reflectDisc(P.x, ry, RING_R + 1.7, '190,180,225', 0.3, carps, RING_R - 1.7, col, open ? 0.3 + 0.08 * Math.sin(t * 3) : 0);
      }
    });
    airLights.forEach((L) => glow(L.x + wob(L.x, L.y + L.h, []) * 0.5, L.y + L.h, L.r * 0.8, `rgba(${L.rgb},A)`, L.a * 0.45));
    g = scene;
    reflCtx.setTransform(1, 0, 0, 1, 0, 0);
    reflCtx.globalCompositeOperation = 'destination-in'; reflCtx.drawImage(maskCv, 0, 0);
    reflCtx.globalCompositeOperation = 'source-over';
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'screen'; g.drawImage(reflCv, 0, 0); g.restore();
  }
  function vignette(cx, cy, r, strength) {
    const gr = g.createRadialGradient(cx, cy, r * 0.35, cx, cy, r);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${strength})`);
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
  }

  // nenúfares
  const PAD_ZONES = { estanque: 14, nenufares: 46, poza: 8 };
  const padCache = {};
  function padsOf(zi) {
    if (padCache[zi]) return padCache[zi];
    const rand = seeded(zi * 7 + 1), out = [], want = PAD_ZONES[ZINFO[zi].id] || 0;
    for (let k = 0; k < 900 && out.length < want; k++) {
      const [x, y] = MAP.randomPoint(zi, 0.72, rand);
      if (out.some((p) => Math.hypot(p.x - x, p.y - y) < 5)) continue;
      out.push({ x, y, r: 2.4 + rand() * 1.6, f: rand() > 0.6, p: rand() * 6 });
    }
    return (padCache[zi] = out);
  }
  function drawPads(list) {
    list.forEach((p) => {
      const x = p.x + Math.sin(t * 0.4 + p.p) * 0.7, y = p.y + Math.cos(t * 0.33 + p.p) * 0.4, a = p.p;
      g.fillStyle = '#2f7a35'; g.beginPath(); g.moveTo(x, y); g.arc(x, y, p.r, 0.4 + a, Math.PI * 2 - 0.15 + a); g.closePath(); g.fill();
      g.fillStyle = '#4fa24b'; g.beginPath(); g.moveTo(x, y); g.arc(x, y, p.r * 0.7, 0.4 + a, Math.PI * 2 - 0.15 + a); g.closePath(); g.fill();
      if (p.f) {
        g.fillStyle = '#ff8fb1'; g.beginPath(); g.arc(x, y, 1.25, 0, 7); g.fill();
        g.fillStyle = '#ffe66d'; g.beginPath(); g.arc(x, y, 0.5, 0, 7); g.fill();
      }
    });
  }

  // paisaje de tierra de cada zona: árboles, arbustos, rocas, flores y rocas en la orilla
  const landCache = {};
  function landOf(zi) {
    if (landCache[zi]) return landCache[zi];
    const z = MAP.Z[zi], rand = seeded(zi * 31 + 5), L = { trees: [], bushes: [], rocks: [], flowers: [], shore: [] }, placed = [];
    const area = (z.rx * z.ry) / (100 * 76), box = [z.x - z.rx * 1.5, z.y - z.ry * 1.5, z.rx * 3, z.ry * 3];
    const fits = (x, y, r) => {
      const q = MAP.sample(x, y);
      if (q.z !== zi || q.r < 1.2 + r / 22) return false;
      if (MAP.ISLANDS[zi].some((is) => (is.lab || is.temple) && Math.hypot(x - is.x, y - is.y) < is.r + r)) return false;
      if (zi === 2 && SPOT.fall && Math.abs(x - SPOT.fall[0]) < 14 + r && y < SPOT.fall[1] + 4) return false;   // el río de la cascada, despejado   // islotes con edificio: sin árboles sueltos
      return placed.every((p) => Math.hypot(p.x - x, p.y - y) > p.r + r - 1.2);
    };
    const fill = (list, want, rmin, rmax, spaced) => {
      for (let k = 0; k < 2500 && list.length < want; k++) {
        const r = rmin + rand() * (rmax - rmin), x = box[0] + rand() * box[2], y = box[1] + rand() * box[3];
        if (!fits(x, y, spaced ? r : 0.2)) continue;
        const o = { x, y, r, p: rand() * 6, tone: rand() };
        list.push(o); if (spaced) placed.push(o);
      }
    };
    if (zi < MAIN) {
      fill(L.trees, Math.round(34 * area), 3.6, 6, true);
      fill(L.bushes, Math.round(36 * area), 1.5, 2.5, true);
      fill(L.rocks, Math.round(16 * area), 1.1, 2.3, true);
      fill(L.flowers, Math.round(110 * area), 0.5, 0.5, false);
    } else {
      fill(L.trees, 6, 2.6, 4.2, true);
      fill(L.rocks, 8, 1.1, 2.2, true);
      fill(L.flowers, 30, 0.5, 0.5, false);
    }
    for (let i = 0; i < Math.round(16 * Math.sqrt(area)); i++) {          // rocas en las aguas someras de la orilla
      const p = MAP.shorePoint(zi, rand() * Math.PI * 2, 0.9);
      if (p) L.shore.push({ x: p[0], y: p[1], r: 0.9 + rand() * 1.1, tone: rand() });
    }
    return (landCache[zi] = L);
  }
  const treeColors = ZINFO.map((z) => { const [r, gr, b] = hex(z.grass); const c = (m, a, d) => `rgb(${Math.min(255, r * m) | 0},${Math.min(255, gr * a) | 0},${Math.min(255, b * d) | 0})`; return [c(0.45, 0.75, 0.45), c(0.65, 1.1, 0.6), c(0.95, 1.5, 0.85)]; });

  function tree(x, y, r, cols, sway) {
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x + r * 0.28, y + r * 0.34, r, r * 0.92, 0, 0, 7); g.fill();
    g.fillStyle = cols[0]; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    g.fillStyle = cols[1]; g.beginPath(); g.arc(x - r * 0.12 + sway, y - r * 0.14, r * 0.78, 0, 7); g.fill();
    g.fillStyle = cols[2]; g.beginPath(); g.arc(x - r * 0.28 + sway, y - r * 0.3, r * 0.4, 0, 7); g.fill();
  }
  function rock(x, y, r, tone, rgb) {
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x + 0.7, y + 0.9, r, r * 0.85, 0, 0, 7); g.fill();
    g.fillStyle = tone > 0.5 ? rgb[0] : rgb[1]; g.beginPath(); g.ellipse(x, y, r, r * 0.85, 0, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.ellipse(x - r * 0.25, y - r * 0.3, r * 0.5, r * 0.35, 0, 0, 7); g.fill();
    if (tone > 0.72) { g.fillStyle = '#4f8f46'; g.beginPath(); g.ellipse(x + r * 0.2, y + r * 0.4, r * 0.5, r * 0.25, 0, 0, 7); g.fill(); }
  }

  // El paisaje va en dos capas. El suelo (rocas de tierra adentro y flores) se pinta antes que las
  // carpas; lo que sobresale del agua o cuelga sobre ella (rocas de la orilla, arbustos, árboles,
  // islotes, juncos) se pinta después, para que una aleta o una cola no asome por encima de una copa.
  const stoneOf = (id) => (['cueva', 'gruta'].includes(id) ? ['#6a5f80', '#544a68'] : id === 'templo' ? ['#8d8466', '#736b51'] : ['#7a828c', '#626a74']);
  function landscape(zi) {
    const id = ZINFO[zi].id, L = landOf(zi), stone = stoneOf(id);
    L.rocks.forEach((o) => rock(o.x, o.y, o.r, o.tone, stone));
    if (!['cueva', 'gruta'].includes(id)) {
      const fl = id === 'poza' ? ['#ff8fb1', '#ffc2d6', '#ffffff', '#ff5c8a'] : ['#ffffff', '#ff8fb1', '#ffe66d', '#c9a0ff'];
      L.flowers.forEach((o, i) => { g.fillStyle = fl[i % 4]; g.globalAlpha = 0.85; g.fillRect(o.x, o.y, 0.9, 0.9); g.globalAlpha = 1; });
    }
  }
  function landscapeTop(zi) {
    const id = ZINFO[zi].id, L = landOf(zi), cols = treeColors[zi], stone = stoneOf(id), cave = ['cueva', 'gruta'].includes(id);
    L.shore.forEach((s) => rock(s.x, s.y, s.r, s.tone, stone));
    if (!cave) L.bushes.forEach((o) => { const s = Math.sin(t * 1.1 + o.p) * 0.12; tree(o.x, o.y, o.r, cols, s); });
    if (id === 'estanque') reeds(zi);
    L.trees.forEach((o) => {
      if (cave) rock(o.x, o.y, o.r * 0.8, o.tone, stone);
      else if (id === 'templo') {                                   // bloques de ruinas
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(o.x - o.r * 0.7 + 0.9, o.y - o.r * 0.7 + 1.1, o.r * 1.4, o.r * 1.4);
        g.fillStyle = o.tone > 0.5 ? '#8d8466' : '#736b51'; g.fillRect(o.x - o.r * 0.7, o.y - o.r * 0.7, o.r * 1.4, o.r * 1.4);
        g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(o.x - o.r * 0.7, o.y - o.r * 0.7, o.r * 1.4, o.r * 0.3);
      } else tree(o.x, o.y, o.r, cols, Math.sin(t * 0.8 + o.p) * 0.3);
    });
    MAP.ISLANDS[zi].forEach((is, i) => {
      if (id === 'estanque' && i === 0) { drawLab(is, cols); return; }
      if (is.temple) { drawTemple(is); return; }
      if (is.col) { drawColumn(is, i); return; }
      if (is.boulder) { drawBoulder(is, i); return; }
      if (is.stal) { drawStalagmite(is, i); return; }
      if (is.turtle) { tree(is.x - is.r * 0.45, is.y - is.r * 0.4, is.r * 0.45, cols, Math.sin(t * 0.8 + i) * 0.3); return; }
      if (cave || id === 'templo') { rock(is.x - 1, is.y, is.r * 0.55, 0.9, stone); rock(is.x + 1.6, is.y + 1, is.r * 0.4, 0.2, stone); }
      else tree(is.x, is.y, is.r * 0.92, cols, Math.sin(t * 0.8 + i) * 0.3);
    });
  }

  // El laboratorio vive en el islote del Estanque. Sin construir: el árbol y un cartel.
  // Construido: una cabaña con el tejado rojo, una ventana encendida y humo verde que sale de la chimenea.
  // Se dibuja en su propia escala (LAB_K) alrededor del centro del islote: la casa sale el doble de
  // larga que la carpa más grande.
  const LAB_K = 1.75;
  function drawLab(is, cols) {
    g.save(); g.translate(is.x, is.y); g.scale(LAB_K, LAB_K);
    labDrawing(cols);
    g.restore();
  }
  function labDrawing(cols) {
    const x = 0, y = 0, sw = (k) => Math.sin(t * 0.8 + k) * 0.3;
    if (!S.lab.built) {
      // sin construir: arboleda, un montón de tablones y un cartel que llama la atención
      tree(x - 6, y - 4, 6.5, cols, sw(0)); tree(x + 6, y - 6, 5.5, cols, sw(1)); tree(x + 6, y + 5, 4.5, cols, sw(2));
      ['#8a6a44', '#7a5a38', '#9a7a52'].forEach((c, k) => { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x - 3 + 0.6, y + 4 + k * 1.3 + 0.8, 7, 1.1); g.fillStyle = c; g.fillRect(x - 3 + k * 0.4, y + 4 + k * 1.3, 7, 1.1); });
      g.fillStyle = '#4a3420'; g.fillRect(x - 8.4, y + 7, 0.9, 4.5);
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x - 11 + 0.7, y + 5.4 + 0.9, 6, 3);
      g.fillStyle = '#b08a5a'; g.fillRect(x - 11, y + 5.4, 6, 3);
      g.fillStyle = `rgba(123,255,207,${0.55 + 0.4 * Math.sin(t * 3)})`; g.fillRect(x - 8.5, y + 6, 1, 1.8);
      return;
    }
    const busy = labBusy();
    // arbustos detrás de la casa
    tree(x - 13, y - 9, 3.6, cols, sw(0)); tree(x + 11, y - 9, 4, cols, sw(1)); tree(x - 13, y + 6, 3, cols, sw(2));
    // muelle de tablas que entra en el agua, con un farol en la punta
    const dx0 = x - 6.5, dy0 = y + 9, dl = 11;
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(dx0 + 0.8, dy0 + 1, 4.5, dl);
    for (let k = 0; k < dl; k += 1.3) { g.fillStyle = (k / 1.3) % 2 < 1 ? '#8a6a44' : '#7d5f3c'; g.fillRect(dx0, dy0 + k, 4.5, 1.1); }
    g.fillStyle = '#3e2c1a'; [[0, 3], [4.5, 3], [0, dl - 0.5], [4.5, dl - 0.5]].forEach(([ox, oy]) => { g.beginPath(); g.arc(dx0 + ox, dy0 + oy, 0.7, 0, 7); g.fill(); });
    g.fillStyle = '#3e2c1a'; g.fillRect(dx0 + 4, dy0 + dl - 2.6, 0.6, 2.4);
    g.fillStyle = '#ffd98a'; g.beginPath(); g.arc(dx0 + 4.3, dy0 + dl - 2.8, 0.8, 0, 7); g.fill();
    // caminito de piedras de la puerta al muelle
    g.fillStyle = '#8d8f86'; [[0, 3.6], [1, 5.6], [0.2, 7.6]].forEach(([ox, oy]) => { g.beginPath(); g.ellipse(x - 4.3 + ox, y + oy, 1, 0.7, 0, 0, 7); g.fill(); });
    // sombra de la casa y del invernadero
    g.fillStyle = 'rgba(0,0,0,0.32)'; g.fillRect(x - 13 + 1.3, y - 10.5 + 1.7, 17, 13.5);
    g.beginPath(); g.ellipse(x + 7.5 + 1.2, y + 2.5 + 1.5, 6.2, 5.8, 0, 0, 7); g.fill();
    // pared de delante (se ve un poco por debajo del tejado): tablones, puerta y ventana encendida
    g.fillStyle = '#9a7a52'; g.fillRect(x - 12, y, 15, 3);
    g.fillStyle = 'rgba(0,0,0,0.18)'; for (let k = -12; k < 3; k += 2) g.fillRect(x + k, y, 0.25, 3);
    g.fillStyle = '#3a2a1a'; g.fillRect(x - 5.2, y + 0.4, 2, 2.6);
    const win = busy ? 0.75 + 0.25 * Math.sin(t * 6) : 0.6;
    g.fillStyle = `rgba(123,255,207,${win})`; g.fillRect(x - 10, y + 0.7, 2.4, 1.5); g.fillRect(x - 0.6, y + 0.7, 2.4, 1.5);
    // tejado a dos aguas, visto desde arriba: la mitad de atrás recibe más luz; tejas en hileras
    g.fillStyle = '#a0553f'; g.fillRect(x - 13, y - 10.5, 17, 5.5);
    g.fillStyle = '#84432f'; g.fillRect(x - 13, y - 5, 17, 5.3);
    g.fillStyle = 'rgba(0,0,0,0.2)';
    for (let k = 1.3; k < 5.4; k += 1.3) { g.fillRect(x - 13, y - 10.5 + k, 17, 0.3); g.fillRect(x - 13, y - 5 + k, 17, 0.3); }
    g.fillStyle = '#c47a5e'; g.fillRect(x - 13, y - 5.4, 17, 0.8);                  // cumbrera
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x - 13, y - 10.5, 17, 0.6);
    // chimenea con humo verde (más humo mientras mezcla)
    g.fillStyle = '#6b6358'; g.fillRect(x - 1, y - 9.5, 2.4, 2.6);
    g.fillStyle = '#2a2622'; g.fillRect(x - 0.6, y - 9.1, 1.6, 1.6);
    const n = busy ? 7 : 4;
    for (let k = 0; k < n; k++) {
      const age = (t * (busy ? 0.55 : 0.3) + k / n) % 1, px = x + 0.2 + Math.sin(age * 5 + k) * 1.6 * age, py = y - 9 - age * 12;
      glow(px, py, 1.5 + age * 3, 'rgba(150,255,200,A)', (1 - age) * (busy ? 0.55 : 0.3));
    }
    // invernadero: cúpula de cristal con tres tanques de líquido verde que burbujea
    const gx = x + 7.5, gy = y + 2.5, gr = 5.8;
    g.fillStyle = '#24403a'; g.beginPath(); g.arc(gx, gy, gr, 0, 7); g.fill();
    [[-2.2, -1.4], [2, -1.6], [0, 2]].forEach(([ox, oy], k) => {
      g.fillStyle = '#7d8a86'; g.beginPath(); g.arc(gx + ox, gy + oy, 1.75, 0, 7); g.fill();
      g.fillStyle = `rgba(91,227,168,${busy ? 0.95 : 0.8})`; g.beginPath(); g.arc(gx + ox, gy + oy, 1.25, 0, 7); g.fill();
      if (Math.sin(t * (busy ? 7 : 3) + k * 2.1) > 0.3) { g.fillStyle = '#e6fff4'; g.fillRect(gx + ox - 0.3 + Math.sin(t * 2 + k) * 0.5, gy + oy - 0.4, 0.6, 0.6); }
    });
    g.fillStyle = 'rgba(190,255,235,0.22)'; g.beginPath(); g.arc(gx, gy, gr, 0, 7); g.fill();
    g.strokeStyle = 'rgba(225,255,245,0.4)'; g.lineWidth = 0.3;
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; g.beginPath(); g.moveTo(gx, gy); g.lineTo(gx + Math.cos(a) * gr, gy + Math.sin(a) * gr); g.stroke(); }
    g.strokeStyle = '#c9d6cf'; g.lineWidth = 0.6; g.beginPath(); g.arc(gx, gy, gr, 0, 7); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 0.7; g.beginPath(); g.arc(gx, gy, gr - 1.2, Math.PI * 1.1, Math.PI * 1.45); g.stroke();
    glow(gx, gy, 9, 'rgba(123,255,207,A)', busy ? 0.3 : 0.14);
    // dos barriles junto a la puerta
    [[-1.5, 4.6], [0.6, 5.4]].forEach(([ox, oy]) => {
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.arc(x + ox + 0.5, y + oy + 0.6, 1.2, 0, 7); g.fill();
      g.fillStyle = '#7a5a38'; g.beginPath(); g.arc(x + ox, y + oy, 1.2, 0, 7); g.fill();
      g.strokeStyle = '#4a3420'; g.lineWidth = 0.3; g.beginPath(); g.arc(x + ox, y + oy, 0.8, 0, 7); g.stroke();
    });
  }
  // luces del laboratorio de noche (después de la luz: la ventana, el invernadero y el farol alumbran)
  function labLights(is) {
    if (!S.lab.built || light.night < 0.3) return;
    const a = light.night, K = LAB_K, x = is.x, y = is.y;
    glow(x + 7.5 * K, y + 2.5 * K, 10 * K, 'rgba(123,255,207,A)', 0.3 * a);
    glow(x - 8.8 * K, y + 1.4 * K, 5 * K, 'rgba(123,255,207,A)', 0.35 * a);
    glow(x - 2.2 * K, y + 17.2 * K, 6 * K, 'rgba(255,217,138,A)', 0.5 * a);
  }
  const LAB_AT = () => MAP.ISLANDS[0][0];

  // juncos en grupos, con espadañas, en la orilla del estanque del centro (capa de arriba)
  let reedCache = null;
  function reeds(zi) {
    if (!reedCache) {
      reedCache = [];
      for (let cl = 0; cl < 22; cl++) { const p = MAP.shorePoint(zi, hash(cl, 11) * Math.PI * 2, 0.97); if (p && !MAP.ISLANDS[zi].some((is) => is.lab && Math.hypot(p[0] - is.x, p[1] - is.y) < is.r + 6)) reedCache.push({ cl, x: p[0], y: p[1] }); }
    }
    reedCache.forEach(({ cl, x: cx, y: cy }) => {
      for (let i = 0; i < 6; i++) {
        const x = cx + (hash(cl, i) - 0.5) * 5, y = cy + (hash(i, cl + 4) - 0.5) * 3, ht = 5 + hash(cl + i, 2) * 4, sw = Math.sin(t * 1.5 + cl + i) * 1.1;
        g.strokeStyle = '#7ab955'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x, y - ht * 0.5, x + sw, y - ht); g.stroke();
        if (i % 2 === 0) { g.fillStyle = '#6b4a2b'; g.fillRect(x + sw - 0.5, y - ht - 1.5, 1, 2.2); }       // espadaña
      }
    });
  }

  // sitios fijos del decorado de cada zona (se calculan una vez)
  const SPOT = {};
  (() => {
    const z2 = MAP.Z[2], z3 = MAP.Z[3];
    SPOT.fall = MAP.shorePoint(2, -Math.PI / 2, 0.97) || [z2.x, z2.y - z2.ry];       // la cascada cae por la orilla norte
    SPOT.cave = MAP.shorePoint(3, 0.15, 0.97) || [z3.x + z3.rx, z3.y];               // boca de la cueva, al este
    // cascada: el borde del acantilado, de punta a punta por la orilla norte
    SPOT.cliff = [];
    for (let a = -Math.PI / 2 - 0.8; a <= -Math.PI / 2 + 0.8; a += 0.045) { const p = MAP.shorePoint(2, a, 0.99); if (p) SPOT.cliff.push(p); }
    // cueva: la pared de roca todo alrededor (solo donde la orilla da a tierra, no a otra zona)
    SPOT.rim = [];
    for (let a = 0; a < Math.PI * 2; a += 0.06) { const p = MAP.shorePoint(3, a, 0.99); if (p) SPOT.rim.push({ x: p[0], y: p[1], a }); }
    const rand = seeded(77), rimAt = (k) => SPOT.rim[Math.floor(k) % SPOT.rim.length];
    const outward = (p, d) => [p.x + Math.cos(p.a) * d, p.y + Math.sin(p.a) * d];
    // estalactitas colgando del techo, hacia dentro
    SPOT.stal = SPOT.rim.filter((_, i) => i % 2 === 0).map((p, i) => {
      const len = 4 + hash(i, 7) * 7;
      return { x: p.x, y: p.y, a: p.a, len, tx: p.x - Math.cos(p.a) * len, ty: p.y - Math.sin(p.a) * len };
    });
    SPOT.mush = []; SPOT.crystals = [];
    if (SPOT.rim.length) {
      for (let i = 0; i < 9; i++) SPOT.mush.push(outward(rimAt(rand() * SPOT.rim.length), 1 + rand() * 2));
      for (let i = 0; i < 5; i++) {
        const p = rimAt((i + rand() * 0.6) * SPOT.rim.length / 5), [x, y] = outward(p, 1);
        SPOT.crystals.push({ x, y, a: p.a, s: 4 + rand() * 2.5, col: i % 2 ? '190,150,255' : '120,240,255' });
      }
    }
    SPOT.shaft = [MAP.Z[3].x - 20, MAP.Z[3].y];                 // un agujero en el techo: entra un rayo de luz (va con la zona)
    // templo: baldosas de la plaza hundida (las que quedan bajo el agua; faltan algunas)
    SPOT.tiles = [];
    const T = MAP.ISLANDS[5].find((is) => is.temple);
    if (T) for (let gy = -7; gy <= 7; gy++) for (let gx = -9; gx <= 9; gx++) {
      const x = T.x + gx * 6, y = T.y + gy * 6, q = MAP.sample(x, y);
      if (q.z === 5 && q.r < 0.88 && Math.hypot(x - T.x, y - T.y) > T.r && hash(gx, gy + 40) > 0.16) SPOT.tiles.push({ x, y, tone: hash(gx + 9, gy), rune: hash(gx - 3, gy + 7) > 0.92 });
    }
    SPOT.stars = []; for (let i = 0; i < 26; i++) SPOT.stars.push(MAP.randomPoint(4, 0.8, rand));
    SPOT.gruta = []; for (let i = 0; i < 9; i++) SPOT.gruta.push(MAP.randomPoint(MAP.Z.findIndex((z) => z.id === 'gruta'), 0.8, rand));
  })();

  // ── templo sumergido: pirámide escalonada con un santuario arriba y columnas en el agua ──
  // La luz viene de arriba a la izquierda: cantos claros arriba/izquierda, oscuros abajo/derecha.
  function bevel(x, y, w, h, col) {
    g.fillStyle = col; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255,255,255,0.16)'; g.fillRect(x, y, w, 0.7); g.fillRect(x, y, 0.7, h);
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x, y + h - 0.8, w, 0.8); g.fillRect(x + w - 0.8, y, 0.8, h);
  }
  const TEMPLE_K = 1.35;                                       // el templo, más grande que el resto: es el centro de la zona
  function drawTemple(is) {
    g.save(); g.translate(is.x, is.y); g.scale(TEMPLE_K, TEMPLE_K); templeDrawing(); g.restore();
  }
  function templeDrawing() {
    const x = 0, y = 0;
    g.fillStyle = 'rgba(0,0,0,0.38)'; g.fillRect(x - 13 + 2.4, y - 13 + 3, 26, 26);
    [[13, '#77704f'], [10, '#968b66'], [7, '#b4a982']].forEach(([s, col], k) => {
      g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x - s - 0.5, y - s - 0.5, s * 2 + 1, s * 2 + 1);   // escalón: canto oscuro
      bevel(x - s, y - s, s * 2, s * 2, col);
      g.fillStyle = 'rgba(0,0,0,0.13)';                       // hileras de sillares
      for (let yy = -s + 2; yy < s - 1; yy += 2) if (Math.abs(yy) > s - 3 || k === 2) g.fillRect(x - s + 0.8, y + yy, s * 2 - 1.6, 0.25);
    });
    for (let k = 0; k < 9; k++) {                             // escalera al sur, del agua al santuario
      g.fillStyle = k % 2 ? '#d6cca4' : '#8f866a'; g.fillRect(x - 2.6, y + 5 + k * 0.92, 5.2, 0.92);
    }
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + 2.6, y + 5, 0.6, 8.3);
    // santuario: tejado de cobre verde (verdín) a cuatro aguas, con un remate dorado
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x - 4.6 + 0.8, y - 4.6 + 1, 9.2, 9.2);
    g.fillStyle = '#3f8a7a'; g.fillRect(x - 4.6, y - 4.6, 9.2, 9.2);
    g.fillStyle = '#4f9f8c'; g.beginPath(); g.moveTo(x - 4.6, y - 4.6); g.lineTo(x + 4.6, y - 4.6); g.lineTo(x, y); g.closePath(); g.fill();
    g.fillStyle = '#336f62'; g.beginPath(); g.moveTo(x + 4.6, y + 4.6); g.lineTo(x - 4.6, y + 4.6); g.lineTo(x, y); g.closePath(); g.fill();
    g.strokeStyle = '#7fd0bb'; g.lineWidth = 0.45;
    g.beginPath(); g.moveTo(x - 4.6, y - 4.6); g.lineTo(x + 4.6, y + 4.6); g.moveTo(x + 4.6, y - 4.6); g.lineTo(x - 4.6, y + 4.6); g.stroke();
    g.fillStyle = '#9fe0cf'; [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => { g.beginPath(); g.arc(x + sx * 4.9, y + sy * 4.9, 0.7, 0, 7); g.fill(); });
    g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(x, y, 0.9, 0, 7); g.fill();
    // linternas de piedra en las esquinas de la base
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => {
      const lx = x + sx * 10.3, ly = y + sy * 10.3;
      bevel(lx - 1.1, ly - 1.1, 2.2, 2.2, '#b9af8a');
      g.fillStyle = `rgba(255,200,120,${0.35 + 0.5 * light.night})`; g.fillRect(lx - 0.45, ly - 0.45, 0.9, 0.9);
    });
    // musgo y hiedra
    for (let k = 0; k < 14; k++) {
      const a = hash(k, 3) * 7, d = 5 + hash(k, 4) * 6.5;
      g.fillStyle = `rgba(${70 + 30 * hash(k, 5) | 0},${130 + 30 * hash(k, 6) | 0},70,0.6)`;
      g.beginPath(); g.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d, 0.9 + hash(k, 7), 0.6 + hash(k, 8) * 0.6, a, 0, 7); g.fill();
    }
  }
  function drawColumn(is, i) {
    const x = is.x, y = is.y, r = is.r * 1.25, h = is.broken ? 2.5 : 7;    // más alta = sombra más larga
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x + h * 0.35, y + h * 0.45, r * 1.15, r, 0.6, 0, 7); g.fill();
    bevel(x - r * 1.3, y - r * 1.3, r * 2.6, r * 2.6, '#7a7158');                  // basa
    if (is.broken) {
      g.fillStyle = '#a89e7b'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      g.fillStyle = '#c9bf98'; g.beginPath();                                     // corte roto e irregular
      for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2, rr = r * (0.45 + 0.35 * hash(i, k)); g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      g.closePath(); g.fill();
      g.fillStyle = '#9a9070'; [[2.8, 1.6], [-2.4, 2.6]].forEach(([ox, oy]) => { g.beginPath(); g.arc(x + ox, y + oy, 0.7, 0, 7); g.fill(); });
    } else {
      bevel(x - r * 1.05, y - r * 1.05, r * 2.1, r * 2.1, '#c4b98f');            // capitel, visto desde arriba
      g.strokeStyle = 'rgba(90,80,55,0.45)'; g.lineWidth = 0.25; g.beginPath(); g.arc(x, y, r * 0.6, 0, 7); g.stroke();
    }
    if (hash(i, 11) > 0.4) { g.fillStyle = 'rgba(80,140,70,0.65)'; g.beginPath(); g.ellipse(x - r * 0.4, y + r * 0.5, 0.9, 0.6, 0, 0, 7); g.fill(); }
  }
  // peñasco de la cascada: el agua choca por el lado de la caída (norte) y hace espuma
  function drawBoulder(is, i) {
    rock(is.x, is.y, is.r, 0.8, ['#7a8591', '#626a74']);
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k - 2) * 0.45, w = 0.5 + 0.4 * Math.sin(t * 6 + k + i);
      g.fillStyle = `rgba(255,255,255,${0.45 + 0.35 * w})`; g.beginPath(); g.arc(is.x + Math.cos(a) * (is.r + 0.6), is.y + Math.sin(a) * (is.r + 0.6), 0.6 + w * 0.5, 0, 7); g.fill();
    }
  }
  // estalagmita: un cono de roca visto desde arriba, con la punta brillante y mojada
  function drawStalagmite(is, i) {
    const x = is.x, y = is.y, r = is.r;
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(x + r * 0.5, y + r * 0.6, r, r * 0.85, 0, 0, 7); g.fill();
    ['#3d3550', '#51476a', '#675b86', '#8577a8'].forEach((col, k) => {
      const rr = r * (1 - k * 0.24), off = k * r * 0.1;
      g.fillStyle = col; g.beginPath(); g.arc(x - off, y - off, rr, 0, 7); g.fill();
    });
    g.fillStyle = '#d6ccf2'; g.beginPath(); g.arc(x - r * 0.32, y - r * 0.32, Math.max(0.5, r * 0.14), 0, 7); g.fill();
    if (r > 3) [[r * 0.9, -r * 0.6, 1.3], [-r * 0.8, r * 0.7, 1.1]].forEach(([ox, oy, rr]) => {   // las pequeñas de alrededor
      g.fillStyle = '#51476a'; g.beginPath(); g.arc(x + ox, y + oy, rr, 0, 7); g.fill();
      g.fillStyle = '#8577a8'; g.beginPath(); g.arc(x + ox - 0.3, y + oy - 0.3, rr * 0.45, 0, 7); g.fill();
    });
  }

  // La luna flota  // La luna flota a una altura h sobre el agua (y0 = la línea del agua bajo ella): en una vista desde
  // arriba eso se ve como la luna por encima y su reflejo a la misma distancia por debajo.
  const MOON_R = 13;
  const MOON_CRATERS = [[0.32, -0.18, 0.2], [-0.25, 0.3, 0.16], [0.12, 0.45, 0.1], [-0.42, -0.2, 0.09]];
  const moonPos = (zi) => { const z = MAP.Z[zi]; return { x: z.x, y0: z.y - z.ry * 0.1, h: 21 + Math.sin(t * 0.7) * 1.6 }; };

  // El portal flota igual que la luna: el anillo arriba y su reflejo en el agua, a la misma distancia.
  const RING_R = 15;
  const portalPos = (zi) => { const z = MAP.Z[zi]; return { x: z.x, y0: z.y + 10, h: 20 + Math.sin(t * 0.9) * 1.2 }; };

  // decorado del suelo (antes que las carpas)
  const DECOR = {
    estanque() {},
    nenufares(zi) { const z = MAP.Z[zi]; if (light.night > 0.3) fireflies(z.x, z.y, z.rx * 0.5, z.ry * 0.5, 4, '255,230,109'); },   // luciérnagas: solo de noche
    cascada() {
      // el río que baja hasta la cascada, por tierra: orillas, agua, el centro más claro y corriente
      const [fx, fy] = SPOT.fall, pts = [];
      for (let k = 0; k <= 9; k++) pts.push([fx + Math.sin(k * 0.8) * 5 * Math.min(1, k / 2), fy - 7 - k * 9]);
      const path = () => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); pts.forEach(([x, y]) => g.lineTo(x, y)); };
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = '#4f5a4a'; g.lineWidth = 17; path(); g.stroke();
      g.strokeStyle = '#2f6f9a'; g.lineWidth = 12; path(); g.stroke();
      g.strokeStyle = '#4d97c6'; g.lineWidth = 6; path(); g.stroke();
      g.setLineDash([2.5, 4]);
      [[-3, 9, 0.35], [0, 13, 0.55], [3, 10, 0.35]].forEach(([dx, sp, a]) => {
        g.strokeStyle = `rgba(220,245,255,${a})`; g.lineWidth = 0.7; g.lineDashOffset = t * sp;
        g.beginPath(); g.moveTo(pts[0][0] + dx, pts[0][1]); pts.forEach(([x, y]) => g.lineTo(x + dx, y)); g.stroke();
      });
      g.setLineDash([]);
      [[3, 0.3], [6, -0.4]].forEach(([k, side]) => {                // piedras en el río, con espuma
        const [x, y] = pts[k], rx = x + side * 8;
        rock(rx, y, 1.6, 0.7, ['#7a8591', '#626a74']);
        g.fillStyle = `rgba(255,255,255,${0.5 + 0.3 * Math.sin(t * 5 + k)})`; g.fillRect(rx - 1.2, y - 2.1, 2.4, 0.6);
      });
    },
    cueva(zi) {
      { const z = MAP.Z[zi]; fireflies(z.x, z.y, z.rx * 0.45, z.ry * 0.45, 4, '123,255,207', 11); }       // esporas de las setas
    },
    luna(zi) { const z = MAP.Z[zi]; if (light.night > 0.3) fireflies(z.x, z.y, z.rx * 0.5, z.ry * 0.5, 3, '184,192,255', 3); },
    templo(zi) {
      // la plaza hundida: baldosas bajo el agua, algunas con runas que brillan, y columnas caídas
      SPOT.tiles.forEach((T, i) => {
        g.fillStyle = `rgba(205,195,150,${0.2 + T.tone * 0.12})`; g.fillRect(T.x - 2.6, T.y - 2.6, 5.2, 5.2);
        if (T.rune) {
          const a = 0.35 + 0.35 * Math.sin(t * 1.3 + i);
          glow(T.x, T.y, 6, 'rgba(46,220,190,A)', a * 0.6);
          g.strokeStyle = `rgba(150,255,230,${a + 0.2})`; g.lineWidth = 0.35;
          g.beginPath(); g.arc(T.x, T.y, 1.6, 0, 7); g.moveTo(T.x, T.y - 2.2); g.lineTo(T.x, T.y + 2.2); g.moveTo(T.x - 1.2, T.y - 0.8); g.lineTo(T.x + 1.2, T.y - 0.8); g.stroke();
        }
      });
      const Tm = MAP.ISLANDS[zi].find((is) => is.temple);
      if (Tm) {
        [[-30, 22, 0.4, 13], [30, -20, -1.1, 10], [-34, -20, 1.3, 8]].forEach(([ox, oy, a, len]) => {
          g.save(); g.translate(Tm.x + ox, Tm.y + oy); g.rotate(a);
          g.fillStyle = 'rgba(190,180,140,0.5)'; g.fillRect(-len / 2, -1.9, len, 3.8);
          g.fillStyle = 'rgba(120,112,85,0.3)'; for (let k = -len / 2 + 3; k < len / 2; k += 3.5) g.fillRect(k, -1.9, 0.4, 3.8);
          g.restore();
        });
        if (light.night > 0.3) [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => airLights.push({ x: Tm.x + sx * 10.3 * TEMPLE_K, y: Tm.y + sy * 10.3 * TEMPLE_K + 1, h: 1, r: 3.5, rgb: '255,200,120', a: 0.5 * light.night }));
        fireflies(Tm.x, Tm.y - 4, 22, 16, 5, '255,214,120', 7);   // motas doradas sobre el templo
      }
    },
    portal(zi) {                                                   // motas del color del mundo alrededor del anillo
      if (!portalOpen()) return;
      const P = portalPos(zi); fireflies(P.x, P.y0, 26, 16, 7, hex(worldToday().color).join(','), 13);
    },
    gruta(zi) {
      SPOT.gruta.forEach(([x, y], i) => glow(x, y, 7, 'rgba(168,150,255,A)', 0.25 + 0.25 * Math.sin(t * 1.1 + i)));
      const z = MAP.Z[zi]; vignette(z.x, z.y, 40, 0.5);
    },
    poza(zi) { const z = MAP.Z[zi]; fireflies(z.x, z.y, 14, 10, 3, '255,170,210', 5); },
  };
  // decorado de arriba (después de las carpas): cascada, estalactitas, boca de la cueva
  const DECOR_TOP = {
    cascada() {
      const [fx, fy] = SPOT.fall, top = fy - 9, end = fy + 12, W2 = 8;
      // el acantilado: una pared de roca y dos hileras de peñas por toda la orilla norte
      SPOT.cliff.forEach(([x, y], i) => {
        g.fillStyle = i % 2 ? '#454d57' : '#4d5661'; g.fillRect(x - 2.2, y - 8, 4.6, 7.5);
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - 2.2, y - 1.5, 4.6, 1.2);
      });
      SPOT.cliff.forEach(([x, y], i) => {
        if (Math.abs(x - fx) < W2 + 1) return;
        rock(x + (hash(i, 1) - 0.5) * 2, y - 6 - hash(i, 2) * 2, 3.6 + hash(i, 3) * 1.6, 0.2, ['#56606b', '#4a535d']);
      });
      SPOT.cliff.forEach(([x, y], i) => {
        if (Math.abs(x - fx) < W2 - 1) return;
        rock(x + (hash(i, 4) - 0.5) * 2, y - 2 - hash(i, 5) * 1.5, 2.6 + hash(i, 6) * 1.4, 0.8, ['#7a8591', '#66707b']);
      });
      // la cortina de agua: fondo azul claro y chorros que bajan a distinta velocidad
      g.fillStyle = 'rgba(140,200,235,0.85)'; g.fillRect(fx - W2, top, W2 * 2, end - top);
      g.fillStyle = 'rgba(60,110,150,0.35)'; g.fillRect(fx - W2, top, 1.2, end - top); g.fillRect(fx + W2 - 1.2, top, 1.2, end - top);
      g.lineWidth = 1.1; g.setLineDash([3.4, 2.2]);
      for (let x = -W2 + 1; x <= W2 - 1; x += 1.1) {
        g.lineDashOffset = -t * (18 + hash(x, 5) * 8);
        g.strokeStyle = `rgba(225,246,255,${0.5 + 0.4 * hash(x, 9)})`;
        g.beginPath(); g.moveTo(fx + x, top); g.lineTo(fx + x + Math.sin(t + x) * 0.3, end); g.stroke();
      }
      g.setLineDash([]);
      g.fillStyle = 'rgba(255,255,255,0.85)';                       // el labio de arriba, donde el agua se asoma
      for (let x = -W2; x <= W2; x += 1.2) { g.beginPath(); g.arc(fx + x, top + 0.3 + Math.sin(t * 4 + x) * 0.3, 0.8, 0, 7); g.fill(); }
      // espuma que hierve abajo, con gotas que saltan
      for (let k = 0; k < 16; k++) {
        const w = 0.6 + 0.4 * Math.sin(t * 4 + k * 1.3);
        g.fillStyle = `rgba(255,255,255,${0.45 + 0.35 * w})`;
        g.beginPath(); g.arc(fx + (hash(k, 1) - 0.5) * W2 * 2.6, end + (hash(k, 2) - 0.3) * 5, (1 + hash(k, 3) * 1.4) * w, 0, 7); g.fill();
      }
      for (let k = 0; k < 12; k++) {
        const age = (t * 0.9 + k / 12) % 1, sx = (hash(k, 7) - 0.5) * 2;
        g.fillStyle = `rgba(235,250,255,${0.8 * (1 - age)})`; g.fillRect(fx + sx * W2 * (0.6 + age), end - Math.sin(age * Math.PI) * 6 + age * 3, 0.7, 0.7);
      }
      // bruma: nubes blancas que suben y se abren
      for (let k = 0; k < 6; k++) {
        const age = (t * 0.12 + k / 6) % 1;
        glow(fx + (k - 2.5) * 5 + Math.sin(t * 0.5 + k) * 2, end + 3 - age * 9, 6 + age * 10, 'rgba(235,248,255,A)', 0.22 * (1 - age));
      }
      // arcoíris en la bruma, de día
      const day = 1 - light.night;
      if (day > 0.2 && !raining) {
        ['255,80,80', '255,170,60', '255,240,90', '110,230,120', '90,170,255', '170,110,255'].forEach((c, k) => {
          g.strokeStyle = `rgba(${c},${0.22 * day})`; g.lineWidth = 1.3;
          g.beginPath(); g.arc(fx, end + 26, 36 - k * 1.2, Math.PI * 1.2, Math.PI * 1.8); g.stroke();
        });
      }
      // espuma que se aleja por la poza
      for (let k = 0; k < 9; k++) {
        const age = (t * 0.1 + k / 9) % 1, a = Math.PI / 2 + (hash(k, 3) - 0.5) * 1.6, d = 8 + age * 48;
        const x = fx + Math.cos(a) * d, y = end + Math.sin(a) * d * 0.8;
        if (!waterAt(x, y, 0.9)) continue;
        g.strokeStyle = `rgba(240,250,255,${0.35 * (1 - age)})`; g.lineWidth = 0.6;
        g.beginPath(); g.moveTo(x - 1.5, y); g.quadraticCurveTo(x, y - 0.8, x + 1.5, y); g.stroke();
      }
      if (t >= DECOR_TOP.foam) { ripple(fx + rnd(-W2, W2), end + 2, false); DECOR_TOP.foam = t + 0.6; }
    },
    foam: 0,
    ring(zi) {             // el anillo del portal, flotando: también da luz, así que va después de la luz
      const P = portalPos(zi), y = P.y0 - P.h, open = portalOpen(), col = hex(worldToday().color).join(','), R = RING_R;
      glow(P.x, y, R * (open ? 3 : 1.8), `rgba(${col},A)`, open ? 0.3 + 0.08 * Math.sin(t * 2) : 0.08);
      if (open) {                                                  // remolino: cuatro brazos en espiral que giran
        g.fillStyle = 'rgba(20,10,40,0.9)'; g.beginPath(); g.arc(P.x, y, R - 1.5, 0, 7); g.fill();
        for (let arm = 0; arm < 4; arm++) {
          for (let r = 1; r < R - 1.5; r += 0.7) {
            const a = arm * Math.PI / 2 + r * 0.42 - t * 1.6;
            g.fillStyle = `rgba(${col},${0.35 + 0.6 * (1 - r / R)})`;
            g.fillRect(P.x + Math.cos(a) * r - 0.5, y + Math.sin(a) * r - 0.5, 1.1, 1.1);
          }
        }
        glow(P.x, y, 5, 'rgba(255,255,255,A)', 0.7 + 0.2 * Math.sin(t * 5));
      } else {
        g.fillStyle = 'rgba(14,10,24,0.85)'; g.beginPath(); g.arc(P.x, y, R - 1.5, 0, 7); g.fill();
      }
      g.lineWidth = 3.4; g.strokeStyle = '#6e6688'; g.beginPath(); g.arc(P.x, y, R, 0, 7); g.stroke();       // anillo de piedra
      g.lineWidth = 1; g.strokeStyle = 'rgba(255,255,255,0.22)'; g.beginPath(); g.arc(P.x, y, R + 0.8, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
      for (let k = 0; k < 8; k++) {                                // runas que se encienden
        const a = k * Math.PI / 4 + 0.2, on = open ? 0.6 + 0.4 * Math.sin(t * 3 + k) : 0.15;
        g.fillStyle = `rgba(${col},${on})`; g.fillRect(P.x + Math.cos(a) * R - 0.6, y + Math.sin(a) * R - 0.6, 1.2, 1.2);
      }
      if (open) {                                                  // chispas que caen del anillo hasta el agua
        for (let k = 0; k < 8; k++) {
          const age = (t * 0.5 + k / 8) % 1, a = hash(k, Math.floor(t * 0.5 + k / 8)) * 7;
          g.fillStyle = `rgba(${col},${(1 - age) * 0.8})`; g.fillRect(P.x + Math.cos(a) * (R + age * 6), y + Math.sin(a) * R * 0.5 + age * P.h, 0.9, 0.9);
        }
      }
    },
    moon(zi) {             // no va por el bucle de las zonas: se pinta después de la luz, porque la luna da luz
      // la luna de verdad: flota sobre el lago, nítida, por encima de las carpas, y sube y baja despacio
      const M = moonPos(zi), R = MOON_R, my = M.y0 - M.h;
      glow(M.x, my, R * 2.8, 'rgba(255,243,176,A)', 0.28);
      g.fillStyle = '#e9dca0'; g.beginPath(); g.arc(M.x, my, R + 0.6, 0, 7); g.fill();          // borde
      g.fillStyle = '#fff6c8'; g.beginPath(); g.arc(M.x, my, R, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.arc(M.x - R * 0.3, my - R * 0.3, R * 0.45, 0, 7); g.fill();
      MOON_CRATERS.forEach(([cx, cy, cr]) => {
        g.fillStyle = '#cbbd84'; g.beginPath(); g.ellipse(M.x + cx * R, my + cy * R, cr * R, cr * R * 0.8, 0, 0, 7); g.fill();
      });
    },
    cueva() {
      // la pared y el techo de roca, todo alrededor: tres capas, más oscuras cuanto más lejos del agua
      SPOT.rim.forEach((p, i) => {
        const ox = Math.cos(p.a), oy = Math.sin(p.a);
        rock(p.x + ox * 10, p.y + oy * 10, 6 + hash(i, 3) * 2.5, 0.2, ['#2a2433', '#221d2a']);
      });
      SPOT.rim.forEach((p, i) => {
        const ox = Math.cos(p.a), oy = Math.sin(p.a);
        rock(p.x + ox * 5, p.y + oy * 5, 4.4 + hash(i, 1) * 2.2, 0.2, ['#3a3346', '#2f293a']);
      });
      SPOT.rim.forEach((p, i) => {
        const ox = Math.cos(p.a), oy = Math.sin(p.a);
        rock(p.x + ox * 1.4, p.y + oy * 1.4, 2 + hash(i, 2) * 1.6, hash(i, 4), ['#5a4f70', '#4a4058']);
      });
      // setas que brillan en los salientes de la roca
      SPOT.mush.forEach(([x, y], i) => {
        const a = 0.55 + 0.45 * Math.sin(t * 1.4 + i * 1.7);
        glow(x, y, 8, 'rgba(123,255,207,A)', 0.45 * a);
        g.fillStyle = '#3d8f78'; g.fillRect(x - 0.4, y, 0.8, 2.4);
        g.fillStyle = `rgba(160,255,225,${0.75 + 0.25 * a})`; g.beginPath(); g.ellipse(x, y, 2, 1.2, 0, Math.PI, 0); g.fill();
        g.fillStyle = `rgba(160,255,225,${0.55 + 0.3 * a})`; g.beginPath(); g.ellipse(x + 2.3, y + 1.3, 1.3, 0.8, 0, Math.PI, 0); g.fill();
      });
      // estalactitas: cuelgan del borde hacia dentro, con la punta mojada
      SPOT.stal.forEach((s, i) => {
        const px = -Math.sin(s.a) * 2, py = Math.cos(s.a) * 2;
        g.fillStyle = '#7a6e98'; g.beginPath(); g.moveTo(s.x + px, s.y + py); g.lineTo(s.x - px, s.y - py); g.lineTo(s.tx, s.ty); g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.15)'; g.beginPath(); g.moveTo(s.x + px, s.y + py); g.lineTo(s.x + px * 0.2, s.y + py * 0.2); g.lineTo(s.tx, s.ty); g.closePath(); g.fill();
        g.fillStyle = 'rgba(200,230,255,0.7)'; g.fillRect(s.tx - 0.3, s.ty - 0.3, 0.6, 0.6);
      });
      // gotas: de vez en cuando cae una desde la punta de una estalactita
      if (t >= DECOR_TOP.drip && SPOT.stal.length) {
        const s = SPOT.stal[Math.floor(Math.random() * SPOT.stal.length)], x = s.tx - Math.cos(s.a) * 2, y = s.ty - Math.sin(s.a) * 2;
        if (waterAt(x, y, 0.92)) ripple(x, y, true);
        DECOR_TOP.drip = t + rnd(0.4, 1.4);
      }
      // cristales que crecen en la pared y brillan
      SPOT.crystals.forEach((c, i) => {
        const a = 0.6 + 0.4 * Math.sin(t * 1.1 + i * 2);
        glow(c.x, c.y, 14, `rgba(${c.col},A)`, 0.5 * a);
        [-0.5, 0, 0.45].forEach((da, k) => {
          const ang = c.a + Math.PI + da, L = c.s * (k === 1 ? 1.5 : 1), w = 1.3;
          const ex = c.x + Math.cos(ang) * L, ey = c.y + Math.sin(ang) * L, nx = -Math.sin(ang) * w, ny = Math.cos(ang) * w;
          g.fillStyle = `rgba(${c.col},${0.75 + 0.2 * a})`;
          g.beginPath(); g.moveTo(c.x + nx, c.y + ny); g.lineTo(ex + nx * 0.6, ey + ny * 0.6); g.lineTo(ex + Math.cos(ang) * 1.2, ey + Math.sin(ang) * 1.2); g.lineTo(ex - nx * 0.6, ey - ny * 0.6); g.lineTo(c.x - nx, c.y - ny); g.closePath(); g.fill();
          g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.moveTo(c.x + nx * 0.3, c.y + ny * 0.3); g.lineTo(ex, ey); g.lineTo(c.x, c.y); g.closePath(); g.fill();
        });
      });
      // el rayo de luz que entra por el agujero del techo y cae sobre el agua (con polvo flotando)
      const [sx, sy] = SPOT.shaft, H = 34;
      const gr = g.createLinearGradient(sx, sy - H, sx, sy);
      gr.addColorStop(0, 'rgba(255,250,225,0)'); gr.addColorStop(1, 'rgba(255,250,225,0.22)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(sx - 4, sy - H); g.lineTo(sx + 4, sy - H); g.lineTo(sx + 9, sy); g.lineTo(sx - 9, sy); g.closePath(); g.fill();
      glow(sx, sy, 13, 'rgba(255,250,225,A)', 0.3 + 0.05 * Math.sin(t * 0.7));
      for (let k = 0; k < 10; k++) {
        const age = (t * 0.05 + k / 10) % 1, x = sx + (hash(k, 1) - 0.5) * 12 + Math.sin(t * 0.6 + k) * 1.5, y = sy - age * H;
        g.fillStyle = `rgba(255,250,220,${0.6 * Math.sin(age * Math.PI)})`; g.fillRect(x, y, 0.6, 0.6);
      }
      const [cx, cy] = SPOT.cave;                                // la boca de la cueva: un arco oscuro en la roca
      g.fillStyle = '#4a4058'; g.beginPath(); g.ellipse(cx + 9, cy, 12, 15, 0, 0, 7); g.fill();
      g.fillStyle = '#07060a'; g.beginPath(); g.ellipse(cx + 9, cy + 2, 7, 10, 0, 0, 7); g.fill();
    },
    drip: 0,
  };

  // ───────────────────────── barreras entre zonas ─────────────────────────
  // Una frontera ancha no se cierra con unos troncos en un paso: se cierra con una barrera de troncos
  // flotantes atados a lo largo de toda la frontera. Al abrir la zona salta por los aires.
  const BREAK_TIME = 1.8;
  const breakT = new Map();                 // clave de frontera → instante en que empezó a romperse
  const barCache = new Map();
  function barPieces(key) {
    if (barCache.has(key)) return barCache.get(key);
    const a = Math.floor(key / NZ), b = key % NZ, A = MAP.Z[a], B = MAP.Z[b];
    const ang = Math.atan2(B.y - A.y, B.x - A.x) + Math.PI / 2;
    const pts = MAP.borders.get(key).filter((p) => p.r < 0.95), out = [];
    pts.forEach((p) => { if (out.every((o) => Math.hypot(o.x - p.x, o.y - p.y) > 3.4)) out.push({ x: p.x, y: p.y }); });
    out.forEach((o, i) => {
      o.ang = ang + (hash(i, key) - 0.5) * 0.5; o.len = 4 + hash(key, i) * 1.6; o.th = 1.7 + hash(i + 3, key) * 0.6;
      o.tone = hash(i, key + 7); o.stake = i % 4 === 0; o.rv = hash(i, key + 5) - 0.5; o.push = 6 + 14 * hash(i, key + 9);
    });
    barCache.set(key, out);
    return out;
  }
  function drawBorderBarrier(key, prog) {
    const pieces = barPieces(key), fade = 1 - prog;
    pieces.forEach((p) => {
      const push = prog * p.push, x = p.x + Math.cos(p.ang + 1.3) * push * p.rv * 2, y = p.y + Math.sin(p.ang + 1.3) * push * p.rv * 2 - push * 0.3;
      g.save(); g.translate(x, y); g.globalAlpha = fade; g.rotate(p.ang + prog * p.rv * 7);
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-p.len / 2 + 0.7, -p.th / 2 + 1, p.len, p.th);
      g.fillStyle = p.tone > 0.5 ? '#7a5a38' : '#664a2e'; g.fillRect(-p.len / 2, -p.th / 2, p.len, p.th);
      g.fillStyle = 'rgba(255,225,170,0.22)'; g.fillRect(-p.len / 2, -p.th / 2, p.len, p.th * 0.3);
      g.fillStyle = '#b08a5a'; g.beginPath(); g.ellipse(p.len / 2, 0, 0.6, p.th / 2, 0, 0, 7); g.fill();
      if (p.stake) { g.fillStyle = '#3e2c1a'; g.beginPath(); g.arc(0, 0, 1.2, 0, 7); g.fill(); }        // estaca que la sujeta
      g.restore();
    });
    if (prog === 0) {                                            // el agua golpea la barrera
      pieces.forEach((p, i) => {
        if (i % 3) return;
        g.fillStyle = `rgba(235,248,255,${0.25 + 0.25 * Math.sin(t * 3 + i)})`; g.fillRect(p.x - 0.5, p.y - 0.5, 1, 1);
      });
    }
  }
  function drawBarriers() {
    MAP.borders.forEach((pts, key) => {
      const a = Math.floor(key / NZ), b = key % NZ;
      if (a >= MAIN || b >= MAIN) return;                       // los secretos no tienen barrera: se encuentran
      const oa = isOpen(a), ob = isOpen(b);
      if (oa !== ob) { if (status(oa ? b : a) === 1) drawBorderBarrier(key, 0); return; }
      if (!breakT.has(key)) return;
      const prog = (t - breakT.get(key)) / BREAK_TIME;
      if (prog >= 1) breakT.delete(key); else drawBorderBarrier(key, prog);
    });
  }

  // ───────────────────────── tesoros y secretos ─────────────────────────
  const TREASURE_REWARD = [80, 160, 260, 420, 700, 1100];
  const TREASURE_TEXT = {
    cofre: 'un cofre lleno de perlas',
    tortuga: 'la tortuga mira hacia el sur, hacia unas cañas',
    botella: 'mensaje: «al fondo de la cueva, el agua sigue»',
    cristal: 'un cristal que brilla solo',
    barca: 'la barca hundida guardaba un saco de perlas',
    idolo: 'los ojos del ídolo se apagan',
  };
  function drawTreasure(T, top) {
    const got = !!S.found[T.id], x = T.x, y = T.y;
    if (!top) {
      if (T.id === 'barca') {                       // la barca, bajo el agua
        g.save(); g.translate(x, y); g.rotate(0.5);
        g.fillStyle = 'rgba(40,30,20,0.55)'; g.beginPath(); g.ellipse(0, 0, 9, 3.4, 0, 0, 7); g.fill();
        g.strokeStyle = 'rgba(120,90,55,0.6)'; g.lineWidth = 0.6; for (let k = -6; k <= 6; k += 3) { g.beginPath(); g.moveTo(k, -3); g.lineTo(k, 3); g.stroke(); }
        g.restore();
      } else if (T.id === 'cofre') {
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x - 2.6, y - 1.2, 5.6, 3.6);
        g.fillStyle = '#7a5a38'; g.fillRect(x - 3, y - 1.6, 6, 3.4);
        g.fillStyle = got ? '#3e2c1a' : '#d9a441'; g.fillRect(x - 3, y - 2.4, 6, got ? 0.9 : 1.2);
        if (!got) { g.fillStyle = '#ffd23f'; g.fillRect(x - 0.4, y - 1.4, 0.8, 1); }
      }
      return;
    }
    if (T.id === 'tortuga') {
      const bob = Math.sin(t * 0.8) * 0.3;
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x + 0.8, y + 1, 3.2, 2.6, 0, 0, 7); g.fill();
      g.fillStyle = '#6b8f3a'; g.beginPath(); g.arc(x + 3 + bob, y, 1.1, 0, 7); g.fill();
      g.fillStyle = '#3e5a26'; g.beginPath(); g.ellipse(x, y, 3.2, 2.6, 0, 0, 7); g.fill();
      g.fillStyle = '#8fae4e'; [[-1, -0.8], [1, -0.8], [0, 0.6], [-1.6, 0.6], [1.6, 0.6]].forEach(([a, b]) => { g.beginPath(); g.arc(x + a, y + b, 0.7, 0, 7); g.fill(); });
    } else if (T.id === 'botella' && !got) {
      const bx = x + Math.sin(t * 0.7) * 1.2, by = y + Math.cos(t * 0.9) * 0.6;
      g.save(); g.translate(bx, by); g.rotate(0.6 + Math.sin(t) * 0.2);
      g.fillStyle = 'rgba(160,220,200,0.8)'; g.fillRect(-2, -0.8, 3.4, 1.6); g.fillRect(1.4, -0.4, 1.2, 0.8);
      g.fillStyle = '#f4e3b5'; g.fillRect(-1.4, -0.4, 2, 0.8);
      g.restore();
    } else if (T.id === 'cristal') {
      const a = got ? 0.25 : 0.55 + 0.35 * Math.sin(t * 2);
      glow(x, y, 7, 'rgba(160,240,255,A)', a);
      g.fillStyle = got ? '#7fa5b5' : '#c9f6ff';
      [[0, -3.2, 1.1], [-1.6, -1.6, 0.8], [1.5, -2, 0.9]].forEach(([a2, b2, w]) => { g.beginPath(); g.moveTo(x + a2 - w, y + 0.5); g.lineTo(x + a2, y + b2); g.lineTo(x + a2 + w, y + 0.5); g.closePath(); g.fill(); });
    } else if (T.id === 'idolo') {
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x - 2.2, y - 2.6, 5.2, 6);
      g.fillStyle = '#9a8f6e'; g.fillRect(x - 2.6, y - 3.2, 5.2, 6);
      g.fillStyle = '#6f664c'; g.fillRect(x - 2.6, y + 0.6, 5.2, 0.8);
      const eye = got ? '#3d382a' : `rgba(120,255,220,${0.6 + 0.4 * Math.sin(t * 3)})`;
      g.fillStyle = eye; g.fillRect(x - 1.6, y - 1.8, 1, 1); g.fillRect(x + 0.6, y - 1.8, 1, 1);
    }
    // un brillo de vez en cuando avisa de que ahí hay algo
    if (!got && Math.sin(t * 1.7 + x) > 0.97) { g.fillStyle = '#fff'; g.fillRect(x + rnd(-2, 2), y + rnd(-2, 2), 1, 1); }
  }
  function findTreasure(T) {
    S.found[T.id] = true;
    const v = Math.round(TREASURE_REWARD[T.z] * (1 + 0.15 * openMain()));
    S.perlas += v;
    for (let k = 0; k < 4; k++) ripple(T.x + rnd(-3, 3), T.y + rnd(-3, 3), true);
    toast(`${MAP.TREASURES.find((o) => o.id === T.id).name}: ${TREASURE_TEXT[T.id]} · +${fmt(v)} perlas`, '#ffd23f', 4200);
    SOUND.coins(5); refreshHud(); save();
  }
  // los secretos: un destello en la entrada del pasadizo da la pista; tocarlo lo descubre
  function secretHint(i) {
    const z = MAP.Z[i], [ex, ey] = z.path[0], k = Math.sin(t * 2.2 + i);
    if (k > 0.6) { g.fillStyle = `rgba(255,255,255,${(k - 0.6) * 2})`; g.fillRect(ex + Math.sin(t * 5) * 2, ey + Math.cos(t * 4) * 2, 1, 1); }
  }
  function discover(i) {
    const z = MAP.Z[i], info = ZINFO[i];
    S.secrets[z.id] = true; camDirty = true;
    const [x, y] = MAP.randomPoint(i, 0.7);
    S.carps.push(initCarp({ sp: info.species, hunger: 90, xp: STAGE_XP[2], x, y }));
    S.album[info.species] = (S.album[info.species] || 0) + 1;
    S.perlas += info.reward;
    toast(`has encontrado ${info.name} · ${SPECIES[info.species].name} y +${info.reward} perlas`, '#c9a0ff', 4500);
    SOUND.secret(); refreshHud(); save();
    flyToZone(i);
  }

  // ───────────────────────── visitas: carpa de la fortuna y garza ─────────────────────────
  function spawnFortune() {
    const open = []; for (let i = 0; i < NZ; i++) if (isOpen(i)) open.push(i);
    const zi = open[Math.floor(Math.random() * open.length)], [x, y] = randomWaterPoint(zi);
    fortune = initCarp({ sp: 'fortuna', fortune: true, hunger: 100, xp: STAGE_XP[3], x, y, born: t, life: 35 });
    toast('una carpa de la fortuna ronda el lago: tócala antes de que se vaya', '#ffd23f', 3500);
  }
  function catchFortune() {
    const v = Math.max(60, Math.round(S.carps.reduce((a, c) => a + perlaValue(c), 0) * 12));
    S.perlas += v;
    for (let k = 0; k < 6; k++) ripple(fortune.x + rnd(-4, 4), fortune.y + rnd(-4, 4), k % 2 === 0);
    toast(`¡carpa de la fortuna! +${fmt(v)} perlas`, '#ffd23f', 2600);
    SOUND.fortune(); quest('fortune'); fortune = null; refreshHud(); save();
  }
  function spawnHeron() {
    const c = S.carps[Math.floor(Math.random() * S.carps.length)], zi = zoneOf(c.x, c.y), z = MAP.Z[zi];
    const p = MAP.shorePoint(zi, Math.atan2(c.y - z.y, c.x - z.x), 0.95) || MAP.shorePoint(zi, Math.random() * 7, 0.95);
    if (!p) return;
    const a = Math.random() * Math.PI * 2;
    heron = { x: p[0], y: p[1], fx: p[0] + Math.cos(a) * 140, fy: p[1] + Math.sin(a) * 140, state: 'in', t0: t, face: a + Math.PI };
    SOUND.heron();
    toast('¡una garza! tócala para espantarla', '#e8e8e8', 2600);
  }
  function heronPos() {
    const h = heron;
    if (h.state === 'in') { const k = smooth((t - h.t0) / 2.4); return [h.fx + (h.x - h.fx) * k, h.fy + (h.y - h.fy) * k, 1 - k]; }
    if (h.state === 'out') { const k = smooth((t - h.t0) / 2); return [h.x + (h.fx - h.x) * k, h.y + (h.fy - h.y) * k, k]; }
    return [h.x, h.y, 0];
  }
  function shooHeron() {
    if (!heron || heron.state === 'out') return;
    heron.state = 'out'; heron.t0 = t; heron.fx = heron.x * 2 - heron.fx; heron.fy = heron.y * 2 - heron.fy;
    const v = 15 * openMain();
    S.perlas += v; toast(`garza espantada · +${v} perlas`, '#e8e8e8', 1600);
    SOUND.shoo(); quest('heron'); refreshHud();
  }
  function heronStrikes() {
    // si nadie la espanta, se lleva algo: unas perlas que floten cerca, o asusta a una carpa
    const h = heron, near = S.floating.map((p, i) => ({ i, d: Math.hypot(p.x - h.x, p.y - h.y) })).sort((a, b) => a.d - b.d).slice(0, 3);
    if (near.length) {
      const idx = new Set(near.map((n) => n.i)); let v = 0;
      S.floating = S.floating.filter((p, i) => { if (idx.has(i)) { v += p.v; return false; } return true; });
      toast(`la garza se ha llevado ${near.length} perlas (${v})`, '#ff9e7a', 2600);
    } else {
      const c = S.carps.slice().sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0];
      if (c) { c.hunger = Math.max(0, c.hunger - 35); toast(`${spOf(c).name} se ha llevado un buen susto`, '#ff9e7a', 2600); }
    }
    h.state = 'out'; h.t0 = t;
  }
  function drawHeron() {
    if (!heron) return;
    const [x, y, air] = heronPos(), a = heron.state === 'stand' ? heron.face : Math.atan2(heron.y - heron.fy, heron.x - heron.fx) * (heron.state === 'out' ? -1 : 1);
    const flap = air > 0.05 ? Math.sin(t * 12) : 0, sh = 2 + air * 14;
    g.save();
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(x + sh, y + sh * 1.2, 5, 2.4, a, 0, 7); g.fill();
    g.translate(x, y); g.rotate(a);
    if (air > 0.05) {                                              // alas abiertas al volar
      g.fillStyle = '#b9c2c8'; g.beginPath(); g.ellipse(-0.5, 0, 3, 9 * (0.55 + 0.45 * Math.abs(flap)), 0, 0, 7); g.fill();
    }
    g.fillStyle = '#d7dde0'; g.beginPath(); g.ellipse(0, 0, 4.2, 2.2, 0, 0, 7); g.fill();
    g.fillStyle = '#8f9aa2'; g.beginPath(); g.ellipse(-1.5, 0, 2.6, 1.6, 0, 0, 7); g.fill();
    g.strokeStyle = '#eef2f4'; g.lineWidth = 1; g.beginPath(); g.moveTo(3.4, 0); g.quadraticCurveTo(5.5, 1.6, 6.4, 0); g.stroke();
    g.fillStyle = '#eef2f4'; g.beginPath(); g.arc(6.6, 0, 1, 0, 7); g.fill();
    g.fillStyle = '#e0b030'; g.beginPath(); g.moveTo(7.4, -0.4); g.lineTo(10, 0); g.lineTo(7.4, 0.4); g.closePath(); g.fill();
    g.fillStyle = '#222'; g.fillRect(6.6, -0.6, 0.5, 0.5);
    g.restore();
  }

  // ───────────────────────── día, noche y lluvia ─────────────────────────
  // la luz sale de la hora real: noche de 21:30 a 6, amanecer y atardecer anaranjados
  function daylight() {
    const d = new Date(), h = HOUR != null ? HOUR : d.getHours() + d.getMinutes() / 60;
    let night = 0, warm = 0, name = 'día';
    if (h < 5.5 || h >= 21.5) { night = 1; name = 'noche'; }
    else if (h < 7.5) { const k = (h - 5.5) / 2; night = 1 - smooth(k); warm = Math.sin(k * Math.PI); name = 'amanecer'; }
    else if (h >= 18.5) { const k = (h - 18.5) / 3; night = smooth(k); warm = Math.sin(Math.min(1, k * 1.3) * Math.PI); name = night > 0.6 ? 'noche' : 'atardecer'; }
    return { night, warm, name };
  }
  let light = daylight(), rainAmt = 0;
  function applyLight(vw, vh) {
    const L = light, rr = rainAmt;
    // multiplicar por un color: el azul de la noche, el naranja del atardecer y el gris de la lluvia
    const mix = (a, b, k) => a + (b - a) * k;
    let r = 255, gg = 255, b = 255;
    r = mix(r, 70, L.night * 0.78); gg = mix(gg, 92, L.night * 0.78); b = mix(b, 160, L.night * 0.7);
    r = mix(r, 255, L.warm * 0.5); gg = mix(gg, 178, L.warm * 0.5); b = mix(b, 140, L.warm * 0.5);
    r *= 1 - rr * 0.25; gg *= 1 - rr * 0.22; b *= 1 - rr * 0.15;
    if (r > 252 && gg > 252 && b > 252) return;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'multiply';
    g.fillStyle = `rgb(${r | 0},${gg | 0},${b | 0})`; g.fillRect(0, 0, GW, GH);
    g.restore();
  }
  function nightLights(seen) {
    if (light.night < 0.3) return;
    const a = light.night;
    // de noche las perlas brillan más
    S.floating.forEach((p) => { if (seen(p.x, p.y, 8)) glow(p.x, p.y, 5, 'rgba(255,241,168,A)', 0.5 * a); });
  }
  function drawRain(vw, vh) {
    if (rainAmt < 0.02) return;
    g.strokeStyle = `rgba(200,225,255,${0.35 * rainAmt})`; g.lineWidth = Math.max(0.4, 0.8 / U());
    g.beginPath();
    const n = Math.round(90 * rainAmt);
    for (let i = 0; i < n; i++) {
      const k = (t * 1.7 + i * 0.137) % 1, x = cam.x - vw / 2 + hash(i, Math.floor(t * 1.7 + i * 0.137)) * vw, y = cam.y - vh / 2 + k * vh;
      g.moveTo(x, y); g.lineTo(x - 1.4, y + 4.5);
    }
    g.stroke();
  }

  // ───────────────────────── dibujo de carpas ─────────────────────────
  function bodyColors(sp) {
    return sp.rainbow ? [0, 1, 2, 3, 4, 5].map((k) => `hsl(${(t * 70 + k * 55) % 360},90%,62%)`) : sp.pat;
  }
  function smoothClosed(poly) {
    const n = poly.length, mid = (a, b) => [(a.x + b.x) / 2, (a.y + b.y) / 2];
    g.beginPath();
    g.moveTo(...mid(poly[n - 1], poly[0]));
    for (let i = 0; i < n; i++) g.quadraticCurveTo(poly[i].x, poly[i].y, ...mid(poly[i], poly[(i + 1) % n]));
    g.closePath();
  }
  // efectos de las carpas de otros mundos, por encima del cuerpo
  function otherWorldFx(c, fx, P, L) {
    if (!fx) return;
    if (fx === 'magma') {                                          // ascuas que se quedan atrás
      const E = P[M - 1];
      for (let k = 0; k < 7; k++) {
        const ph = t * 1.3 + k / 7, age = ph % 1, h = hash(k, Math.floor(ph));
        g.fillStyle = `rgba(255,${120 + 100 * h | 0},40,${(1 - age) * 0.9})`;
        g.fillRect(E.x - E.tx * age * L * 0.5 + (h - 0.5) * 3, E.y - E.ty * age * L * 0.5 + (hash(Math.floor(ph), k) - 0.5) * 3, 0.9, 0.9);
      }
    } else if (fx === 'ice') {                                     // escarcha que brilla alrededor
      for (let k = 0; k < 6; k++) {
        const p = P[k + 1], a = Math.abs(Math.sin(t * 2 + k * 1.7));
        g.fillStyle = `rgba(235,250,255,${a * 0.8})`; g.fillRect(p.x + p.nx * (p.w + 1) * (k % 2 ? 1 : -1), p.y + p.ny * (p.w + 1) * (k % 2 ? 1 : -1), 0.8, 0.8);
      }
    } else if (fx === 'glitch' && Math.random() < 0.35) {          // franjas de color que se descolocan
      const cs = ['rgba(255,0,230,0.7)', 'rgba(0,229,255,0.7)', 'rgba(0,255,156,0.7)'];
      for (let k = 0; k < 3; k++) { g.fillStyle = cs[k]; g.fillRect(c.x + rnd(-L / 2, L / 3), c.y + rnd(-L / 4, L / 4), rnd(2, 6), 0.8); }
    }
  }

  function drawCarp(c) {
    const sp = spOf(c), rar = sp.r, st = stageOf(c.xp), L = lenC(c), Wm = L * 0.2;
    const cols = bodyColors(sp), fx = sp.fx;
    const sp_ = c.spine, spd = clamp(c.speed / 8, 0, 1), amp = L * 0.1 * (0.45 + spd);
    const P = sp_.map((p, i) => {
      const a = sp_[Math.max(i - 1, 0)], b = sp_[Math.min(i + 1, M - 1)];
      let tx = a.x - b.x, ty = a.y - b.y; const d = Math.hypot(tx, ty) || 1; tx /= d; ty /= d;
      const s = i / (M - 1), nx = -ty, ny = tx;
      const off = Math.sin(c.phase - i * 0.75) * amp * s ** 1.3;
      let w;
      if (s < 0.3) w = Wm * (0.38 + 0.62 * Math.sqrt(Math.max(0, 1 - ((0.3 - s) / 0.3) ** 2)));
      else w = Wm * (0.07 + 0.93 * (1 - (s - 0.3) / 0.7) ** 0.85);
      return { x: p.x + nx * off, y: p.y + ny * off, tx, ty, nx, ny, w };
    });
    // la carpa de la fortuna aparece y se va desvaneciéndose
    const fade = c.fortune ? clamp(Math.min((t - c.born) / 1.2, (c.born + c.life - t) / 2), 0, 1) : 1;
    const alpha = (c.hunger < 25 ? 0.6 : 1) * (rar >= 4 ? 0.88 + 0.12 * Math.sin(t * 3) : 1) * fade * (fx === 'ice' ? 0.6 : 1);   // la de hielo se transparenta
    if (rar >= 2) glow(P[2].x, P[2].y, L * (0.7 + rar * 0.12) * (c.fortune ? 1.6 : 1), `rgba(${hex(RARITY[rar].c).join(',')},A)`, (0.12 + rar * 0.05) * (0.8 + 0.2 * Math.sin(t * 2 + c.x)) * fade * (c.fortune ? 2 : 1));
    const outline = (ox, oy) => {
      const left = P.map((p) => ({ x: p.x + p.nx * p.w + ox, y: p.y + p.ny * p.w + oy }));
      const right = P.map((p) => ({ x: p.x - p.nx * p.w + ox, y: p.y - p.ny * p.w + oy })).reverse();
      const head = { x: P[0].x + P[0].tx * P[0].w * 0.9 + ox, y: P[0].y + P[0].ty * P[0].w * 0.9 + oy };
      smoothClosed([head, ...left, ...right]);
    };
    g.save();
    if (fx === 'glitch' && Math.random() < 0.18) g.translate(rnd(-1.6, 1.6), rnd(-0.5, 0.5));       // la glitch salta de sitio
    g.globalAlpha = fade;
    g.fillStyle = 'rgba(0,0,0,0.28)'; outline(1.2, 1.6); g.fill();
    g.globalAlpha = alpha;
    const E = P[M - 1], D = { x: -E.tx, y: -E.ty }, Lt = L * 0.4, sw = Math.sin(c.phase - M * 0.75 - 0.4) * Lt * 0.45;
    const fin = cols[cols.length - 1];
    g.fillStyle = fin; g.globalAlpha = alpha * 0.72;
    g.beginPath(); g.moveTo(E.x, E.y);
    g.quadraticCurveTo(E.x + D.x * Lt * 0.6 + E.nx * Lt * 0.75, E.y + D.y * Lt * 0.6 + E.ny * Lt * 0.75,
      E.x + D.x * Lt + E.nx * (Lt * 0.55 + sw), E.y + D.y * Lt + E.ny * (Lt * 0.55 + sw));
    g.quadraticCurveTo(E.x + D.x * Lt * 0.62 + E.nx * sw, E.y + D.y * Lt * 0.62 + E.ny * sw,
      E.x + D.x * Lt - E.nx * (Lt * 0.55 - sw), E.y + D.y * Lt - E.ny * (Lt * 0.55 - sw));
    g.quadraticCurveTo(E.x + D.x * Lt * 0.6 - E.nx * Lt * 0.75, E.y + D.y * Lt * 0.6 - E.ny * Lt * 0.75, E.x, E.y);
    g.closePath(); g.fill();
    const pf = P[2], fsw = Math.sin(c.phase + 1) * 0.5;
    [1, -1].forEach((side) => {
      g.beginPath();
      g.moveTo(pf.x + pf.nx * pf.w * side * 0.7, pf.y + pf.ny * pf.w * side * 0.7);
      g.quadraticCurveTo(pf.x + pf.nx * side * (pf.w + L * 0.2), pf.y + pf.ny * side * (pf.w + L * 0.2),
        pf.x + pf.nx * side * (pf.w + L * (0.22 + fsw * 0.1)) - pf.tx * L * 0.25, pf.y + pf.ny * side * (pf.w + L * (0.22 + fsw * 0.1)) - pf.ty * L * 0.25);
      g.lineTo(pf.x - pf.tx * L * 0.06, pf.y - pf.ty * L * 0.06);
      g.closePath(); g.fill();
    });
    g.globalAlpha = alpha;
    g.fillStyle = cols[0]; outline(0, 0); g.fill();
    g.save(); outline(0, 0); g.clip();
    for (let j = 0; j < M * 2 - 1; j++) {
      const i = j / 2, a = P[Math.floor(i)], b = P[Math.min(Math.ceil(i), M - 1)];
      g.fillStyle = cols[(j + 1) % cols.length];
      g.beginPath(); g.arc((a.x + b.x) / 2 + (hash(j, 3) - 0.5) * Wm * 0.5, (a.y + b.y) / 2 + (hash(j, 4) - 0.5) * Wm * 0.5, Wm * (0.8 + hash(j, 5) * 0.5), 0, 7); g.fill();
    }
    if (sp.head) { g.fillStyle = sp.head; g.beginPath(); g.arc(P[1].x, P[1].y, Wm * 0.75, 0, 7); g.fill(); }
    if (sp.deco === 'escamas') {                                   // komodo: piel de escamas, con motas claras y oscuras
      for (let j = 0; j < 30; j++) {
        const u = 1 + hash(j, 11) * (M - 3), a = P[Math.floor(u)], b = P[Math.ceil(u)], f = u % 1, side = (hash(j, 12) - 0.5) * 1.7;
        const x = a.x + (b.x - a.x) * f + a.nx * a.w * side, y = a.y + (b.y - a.y) * f + a.ny * a.w * side;
        g.fillStyle = j % 3 ? 'rgba(30,34,20,0.45)' : 'rgba(214,204,150,0.5)'; g.beginPath(); g.arc(x, y, Wm * (0.12 + hash(j, 13) * 0.12), 0, 7); g.fill();
      }
    }
    g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = Wm * 0.7; g.lineCap = 'round';
    g.beginPath(); g.moveTo(P[1].x, P[1].y); for (let i = 2; i < M - 1; i++) g.lineTo(P[i].x, P[i].y); g.stroke();
    if (fx === 'stars') {                                          // la estelar lleva un cielo dentro que se mueve
      for (let j = 0; j < 16; j++) {
        const u = (hash(j, 7) * (M - 1) + t * 0.5) % (M - 1), a = P[Math.floor(u)], side = (hash(j, 8) - 0.5) * 1.5;
        g.fillStyle = `rgba(255,255,255,${0.5 + 0.5 * Math.abs(Math.sin(t * 2.5 + j))})`;
        g.fillRect(a.x + a.nx * a.w * side - 0.35, a.y + a.ny * a.w * side - 0.35, 0.7, 0.7);
      }
    }
    g.restore();
    if (sp.deco === 'dragon') {                                    // carpa dragón: cresta dorada, bigotes largos y cola que arde
      g.fillStyle = '#ffd23f';
      for (let i = 1; i < M - 2; i++) {
        const q = P[i], h = Wm * (0.55 - i * 0.05);
        g.beginPath(); g.moveTo(q.x - q.tx * Wm * 0.35, q.y - q.ty * Wm * 0.35); g.lineTo(q.x + q.tx * h, q.y + q.ty * h);
        g.lineTo(q.x + q.nx * Wm * 0.18, q.y + q.ny * Wm * 0.18); g.closePath(); g.fill();
      }
      const H = P[0];
      g.strokeStyle = '#ffe9a8'; g.lineWidth = Math.max(0.25, Wm * 0.14); g.lineCap = 'round';
      [1, -1].forEach((side) => {
        const bx = H.x + H.tx * H.w * 0.6 + H.nx * H.w * 0.5 * side, by = H.y + H.ty * H.w * 0.6 + H.ny * H.w * 0.5 * side;
        const sw = Math.sin(t * 2.6 + c.phase + side) * L * 0.08, lw = L * 0.42;
        g.beginPath(); g.moveTo(bx, by);
        g.quadraticCurveTo(bx + H.nx * side * lw * 0.45 + H.tx * lw * 0.1, by + H.ny * side * lw * 0.45 + H.ty * lw * 0.1,
          bx + H.nx * side * (lw * 0.5 + sw) - H.tx * lw * 0.55, by + H.ny * side * (lw * 0.5 + sw) - H.ty * lw * 0.55);
        g.stroke();
      });
      const T = P[M - 1];
      for (let k = 0; k < 5; k++) {
        const ph = t * 1.6 + k / 5, age = ph % 1, h = hash(k, Math.floor(ph));
        g.fillStyle = `rgba(255,${110 + 110 * h | 0},40,${(1 - age) * 0.85})`;
        g.fillRect(T.x - T.tx * (L * 0.35 + age * L * 0.3) + (h - 0.5) * 2.5, T.y - T.ty * (L * 0.35 + age * L * 0.3) + (hash(Math.floor(ph), k) - 0.5) * 2.5, 0.8, 0.8);
      }
    }
    g.fillStyle = 'rgba(0,0,0,0.85)';
    [1, -1].forEach((side) => { g.beginPath(); g.arc(P[0].x + P[0].nx * P[0].w * 0.75 * side - P[0].tx * 0.2, P[0].y + P[0].ny * P[0].w * 0.75 * side - P[0].ty * 0.2, 0.55, 0, 7); g.fill(); });
    g.restore();
    otherWorldFx(c, fx, P, L);
    // destellos de las raras: unos 5 por segundo, vaya a los fps que vaya
    if (rar >= 3 && Math.random() < (c.fortune ? 15 : 2) * FRAME) { g.fillStyle = '#fff'; g.fillRect(c.x + rnd(-L / 2, L / 2), c.y + rnd(-L / 2, L / 2), 1, 1); }
  }
  // aviso de hambre y anillo de selección: se pintan encima de todo
  function drawMarks(c) {
    const L = lenC(c), p = c.spine[2];
    if (c.hunger < 15 && Math.floor(t * 1.5) % 2 === 0) { g.fillStyle = '#ffb703'; g.fillRect(c.x - 0.5, c.y - L * 0.45, 1, 2); g.fillRect(c.x - 0.5, c.y - L * 0.45 + 2.8, 1, 1); }
    if (c === selected) { g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 0.7; g.setLineDash([1.5, 1.5]); g.lineDashOffset = -t * 4; g.beginPath(); g.arc(p.x, p.y, L * 0.75, 0, 7); g.stroke(); g.setLineDash([]); }
  }

  // ───────────────────────── lógica ─────────────────────────
  // destino al azar: casi siempre en la misma zona; a veces se va a otra
  function pickWander(c) {
    const zc = zoneOf(c.x, c.y), open = [];
    for (let i = 0; i < NZ; i++) if (isOpen(i) && i !== zc) open.push(i);
    const zt = open.length && Math.random() < 0.22 ? open[Math.floor(Math.random() * open.length)] : zc;
    [c.tx, c.ty] = randomWaterPoint(zt);
    c.route = routeTo(zc, zt);
    c.retarget = zt === zc ? rnd(3, 7) : rnd(16, 30);
  }

  function updateMovement(c, dt) {
    const stage = stageOf(c.xp);
    // la garza asusta: las carpas cercanas huyen
    let flee = null;
    if (heron && heron.state === 'stand' && !c.fortune) {
      const d = Math.hypot(c.x - heron.x, c.y - heron.y);
      if (d < 26) flee = Math.atan2(c.y - heron.y, c.x - heron.x);
    }
    // olfatea comida cercana
    let target = null, best = DETECT;
    if (c.hunger < 90 && !c.fortune) pellets.forEach((p) => { const d = Math.hypot(p.x - c.x, p.y - c.y); if (d < best) { best = d; target = p; } });
    // si no hay comida, sigue al dedo
    let luring = false;
    if (!target && lure && !c.fortune && Math.hypot(lure.x - c.x, lure.y - c.y) < 48) { target = lure; luring = true; c.lured = true; } else c.lured = false;
    if (target) {
      if (c.chaseP !== target) { c.chaseP = target; c.route = routeTo(zoneOf(c.x, c.y), zoneOf(target.x, target.y)); }
    } else if (c.chaseP) { c.chaseP = null; c.route = []; c.retarget = 0; }
    c.chasing = !!target;
    if (!target) {
      c.retarget -= dt;
      if (c.retarget <= 0 || (!c.route.length && Math.hypot(c.tx - c.x, c.ty - c.y) < 3)) pickWander(c);
    }
    let tx, ty;
    if (c.route.length) {
      const w = c.route[0]; tx = w.x; ty = w.y;
      if (Math.hypot(tx - c.x, ty - c.y) < 4) c.route.shift();
    } else if (target) { tx = target.x; ty = target.y; } else { tx = c.tx; ty = c.ty; }

    let want = Math.atan2(ty - c.y, tx - c.x);
    if (flee !== null) want = flee;
    let diff = want - c.ang; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
    const turn = (2.6 - stage * 0.25) * dt * (flee !== null ? 1.6 : 1);
    c.ang += clamp(diff, -turn, turn);
    // esquiva orillas e islotes con antelación en vez de chocar
    const ahead = 5 + stage * 1.2;
    if (!waterAt(c.x + Math.cos(c.ang) * ahead, c.y + Math.sin(c.ang) * ahead, 0.86)) {
      const l = waterAt(c.x + Math.cos(c.ang - 0.8) * ahead, c.y + Math.sin(c.ang - 0.8) * ahead, 0.86);
      const r = waterAt(c.x + Math.cos(c.ang + 0.8) * ahead, c.y + Math.sin(c.ang + 0.8) * ahead, 0.86);
      c.ang += (l && !r ? -1 : r && !l ? 1 : c.avoid || (c.avoid = Math.random() < 0.5 ? -1 : 1)) * 3.4 * dt;
    } else c.avoid = 0;
    const near = luring ? clamp(Math.hypot(tx - c.x, ty - c.y) / 8, 0.25, 1) : 1;      // junto al dedo, se calma
    c.speed = (4.2 + stage * 0.5) * (c.hunger < 20 ? 0.5 : 1) * (c.chasing ? 1.9 : 1) * near * (flee !== null ? 1.8 : 1) * (c.fortune ? 1.2 : 1);
    const nx = c.x + Math.cos(c.ang) * c.speed * dt, ny = c.y + Math.sin(c.ang) * c.speed * dt;
    if (waterAt(nx, ny, 0.82)) { c.x = nx; c.y = ny; }
    else { c.ang += Math.PI * 0.6; c.route = []; c.chaseP = null; c.retarget = 0; }      // choca con la orilla: replanifica
    c.phase += dt * (3.5 + c.speed * 0.7);
    const sl = lenC(c) / (M - 1);
    c.spine[0].x = c.x; c.spine[0].y = c.y;
    for (let i = 1; i < M; i++) {
      const a = c.spine[i - 1], b = c.spine[i];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      b.x = a.x + dx / d * sl; b.y = a.y + dy / d * sl;
    }
    if (c.fortune) return;
    // comer
    for (let i = pellets.length - 1; i >= 0; i--) {
      const p = pellets[i];
      if (c.hunger < 90 && Math.hypot(p.x - c.x, p.y - c.y) < 2.6) {
        pellets.splice(i, 1);
        const before = stageOf(c.xp);
        c.hunger = Math.min(100, c.hunger + FEED); c.xp += 1;
        ripple(p.x, p.y, true);
        if (stageOf(c.xp) > before) { toast(`${spOf(c).name} ha crecido`, RARITY[spOf(c).r].c); quest('grow'); }
        break;
      }
    }
  }

  function spawnPerla(c) {
    const lim = 8 + 4 * openMain();
    if (S.floating.length >= lim) S.perlas += S.floating.shift().v;
    S.floating.push({ x: c.x, y: c.y, v: perlaValue(c) });
    ripple(c.x, c.y, true);
  }

  // la mezcla del laboratorio, lista
  function hatch(e) {
    let c, isNew, sp;
    if (e.sp) {                                       // criatura del laboratorio
      const [x, y] = randomWaterPoint(0);
      c = initCarp({ sp: e.sp, hunger: 60, xp: 0, x, y });
      isNew = !S.album[e.sp];
      S.album[e.sp] = (S.album[e.sp] || 0) + 1;
      sp = SPECIES[e.sp];
      if (isNew) { SOUND.secret(); flyTo(x, y, Math.max(cam.z, defaultZoom())); }
    } else if (e.hy) {                                // cría de dos carpas
      const [x, y] = randomWaterPoint(zoneOf(e.x || 0, e.y || 0));
      c = initCarp({ sp: 'hibrida', hy: e.hy, hunger: 60, xp: 0, x, y });
      const rec = S.hybrids[e.hy.name];
      isNew = !rec;
      S.hybrids[e.hy.name] = { n: (rec ? rec.n : 0) + 1, pat: e.hy.pat, r: e.hy.r, rainbow: e.hy.rainbow, head: e.hy.head };
      sp = e.hy;
    }
    S.carps.push(c);
    toast(`${isNew ? 'nueva · ' : ''}${sp.name} (${RARITY[sp.r].n})`, RARITY[sp.r].c, 3200);
    ripple(c.x, c.y, false); SOUND.hatch(); quest('hatch');
    refreshHud();
  }

  // ───────────────────────── gachapon ─────────────────────────
  // Cada zona abierta tiene su nenúfar (se dibuja en pads.js). Se toca, se tira, la flor se cierra, tiembla, se abre
  // y suelta una cápsula con la carpa dentro. El color de la cápsula avisa de la rareza antes de abrirse.
  const PAD_K = 0.3;                     // escala del dibujo del nenúfar (unidades de boceto → mundo)
  const PAD_R = 12;                      // radio que ocupa en el agua (también la zona de toque)
  const PHASES = ['coin', 'shake', 'burst', 'rise', 'open'];
  const SHAKE = [0.7, 0.95, 1.5, 2.2, 3.0];               // lo que tiembla antes de abrirse, según la rareza
  const roomLeft = () => Math.max(0, capacity() - S.carps.length - S.gacha.out.length);      // huecos libres: sin sitio no se tira
  const poolOf = (zi) => (zi === PORTAL ? worldToday().pool : ZONES[zi].pool);
  const pullPrice = (zi) => Math.max(1, Math.round(ZONES[zi].pull * (1 - GACHA.discount[lvl('amuleto')])));
  const rgbOf = (h) => hex(h);
  const mixRgb = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * clamp(k, 0, 1))).join(',');
  let gx = null;                         // la tirada que se está viendo: { zi, list, i, ph, t0, fast, results }
  let lastBatch = null;                  // resultado de la última tanda ×10, para enseñarlo en el panel
  let gachaZone = 0;
  let fx = [];                           // chispas

  // sitio de cada nenúfar: agua despejada junto a la orilla de su zona (el del Estanque, junto al islote del laboratorio)
  const PAD_PREF = [null, Math.PI, 0, -Math.PI / 2, Math.PI / 2, -2.1, Math.PI / 2];
  const padSpots = [];
  function padOk(zi, x, y) {
    const q0 = MAP.sample(x, y);
    if (q0.z !== zi || q0.r > 0.82) return false;
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, q = MAP.sample(x + Math.cos(a) * 10.5, y + Math.sin(a) * 10.5);
      if (q.z !== zi || q.r > 0.92) return false;
    }
    for (const is of MAP.ISLANDS[zi]) if (Math.hypot(is.x - x, is.y - y) < (is.temple ? 20 : is.r) + 14) return false;
    for (const T of MAP.TREASURES) if (Math.hypot(T.x - x, T.y - y) < 12) return false;
    if (zi === 2 && SPOT.fall && Math.abs(x - SPOT.fall[0]) < 24 && y < SPOT.fall[1] + 34) return false;      // el río de la cascada, despejado
    if (zi === 3 && SPOT.cave && Math.hypot(x - SPOT.cave[0], y - SPOT.cave[1]) < 26) return false;
    if (zi === 3 && SPOT.shaft && Math.hypot(x - SPOT.shaft[0], y - SPOT.shaft[1]) < 16) return false;
    return true;
  }
  function padSpot(zi) {
    if (padSpots[zi]) return padSpots[zi];
    let found = null;
    if (zi === 0 && padOk(0, -24, -10)) found = { x: -24, y: -10 };
    for (let k = 0; k < 60 && !found; k++) {
      const a = (PAD_PREF[zi] == null ? 0 : PAD_PREF[zi]) + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.12;
      for (const lim of [0.8, 0.84, 0.76, 0.88]) {
        const p = MAP.shorePoint(zi, a, lim);
        if (p && padOk(zi, p[0], p[1])) { found = { x: p[0], y: p[1] }; break; }
      }
    }
    if (!found) { const [x, y] = MAP.randomPoint(zi, 0.5, seeded(900 + zi)); found = { x, y }; }
    return (padSpots[zi] = found);
  }

  // una tirada: la rareza sale de las probabilidades, con garantía por nenúfar (st = tiradas desde la última de cada rareza)
  function rollOne(zi, st, minR) {
    const pool = poolOf(zi), have = new Set(pool.map((id) => SPECIES[id].r));
    const top = Math.max(...have), act = GACHA.pity.map((p) => top >= p.min);          // solo cuenta la garantía de rarezas que este nenúfar tiene
    let min = minR || 0;
    GACHA.pity.forEach((p, i) => { if (act[i] && (st[i] || 0) + 1 >= p.every) min = Math.max(min, p.min); });
    const w = GACHA.rates.map((p, r) => (have.has(r) && r >= Math.min(min, top) ? p : 0));
    let roll = Math.random() * w.reduce((a, b) => a + b, 0), r = top;
    for (let i = 0; i < w.length; i++) { if (w[i] <= 0) continue; roll -= w[i]; if (roll <= 0) { r = i; break; } }
    GACHA.pity.forEach((p, i) => { if (act[i]) st[i] = r >= p.min ? 0 : (st[i] || 0) + 1; });
    const ids = pool.filter((id) => SPECIES[id].r === r);
    return { id: ids[Math.floor(Math.random() * ids.length)], r };
  }
  // porcentajes reales de este nenúfar (las rarezas que no tiene se reparten entre las que sí)
  function oddsOf(zi) {
    const have = new Set(poolOf(zi).map((id) => SPECIES[id].r)), w = GACHA.rates.map((p, r) => (have.has(r) ? p : 0)), tot = w.reduce((a, b) => a + b, 0);
    return w.map((p) => p / tot * 100);
  }

  // mode: 'ficha' (una tirada gratis), 'free' (una cápsula guardada) o nada (con perlas)
  function startPull(zi, n, mode) {
    const free = mode === 'free', fic = mode === 'ficha';
    if (gx || !isOpen(zi) || zi >= MAIN) return;
    if (zi === PORTAL && !portalOpen()) { toast(`el portal está cerrado · abre a las ${portalNext()}`, '#b8a4ff', 2400); return; }
    if (roomLeft() < n) { toast(n > 1 ? `necesitas ${n} huecos libres` : 'estanque lleno · suelta una carpa o amplía el cupo', '#ffb703', 2200); return; }
    const price = free || fic ? 0 : pullPrice(zi) * n;
    if (fic && (n !== 1 || zi > GACHA.fichas.maxZone || S.gacha.fichas < 1)) return;
    if (!free && !fic && S.perlas < price) { toast('te faltan perlas', '#ffb703', 1400); return; }
    if (free) { const k = S.gacha.free.indexOf(zi); if (k < 0) return; S.gacha.free.splice(k, 1); }
    if (fic) S.gacha.fichas--;
    S.perlas -= price;
    const st = S.gacha.pity[zi] = S.gacha.pity[zi] || [0, 0, 0], list = [];
    for (let i = 0; i < n; i++) list.push(rollOne(zi, st, n >= 10 && i === n - 1 && !list.some((o) => o.r >= 1) ? 1 : 0));
    S.gacha.out.push(...list.map((o) => ({ id: o.id, zi })));       // si se cierra la página a medias, se abren al volver
    gx = { zi, list, i: 0, ph: 'coin', t0: t, fast: n > 1, results: [] };
    lastBatch = null; hide(); selected = null; refreshInfo();
    const sp = padSpot(zi); flyTo(sp.x, sp.y, Math.max(cam.z, 13));
    SOUND.plop(); ripple(sp.x, sp.y, true);
    refreshHud(); save();
  }
  function sparks(x, y, n, hexCol, up) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 7, v = rnd(4, 14) * (up ? 1 : 0.7);
      fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7 - (up ? 10 : 3), t0: t, life: rnd(0.6, 1.3), col: hexCol });
    }
  }
  // la carpa sale de la cápsula: se une al estanque, o, si está lleno, vuelve al río y deja perlas
  function applyResult(zi, id) {
    const sp = SPECIES[id], pad = padSpot(zi), isNew = !S.album[id];
    S.album[id] = (S.album[id] || 0) + 1;
    let full = false, v = 0;
    if (S.carps.length >= capacity()) { full = true; v = releaseValue({ sp: id, xp: 0 }); S.perlas += v; }
    else {
      let x = pad.x, y = pad.y + 13; if (!waterAt(x, y, 0.88)) { x = pad.x; y = pad.y; }
      const c = initCarp({ sp: id, hunger: 60, xp: 0, x, y }); c.ang = Math.PI / 2; resetSpine(c); S.carps.push(c);
    }
    const k = S.gacha.out.findIndex((o) => o.id === id && o.zi === zi); if (k >= 0) S.gacha.out.splice(k, 1);
    S.gacha.hist.unshift({ id, zi, new: isNew, full, at: Date.now() }); S.gacha.hist.length = Math.min(S.gacha.hist.length, GACHA.history);
    if (gx) gx.results.push({ id, new: isNew, full });
    toast(`${isNew ? 'nueva · ' : ''}${sp.name} (${RARITY[sp.r].n})${full ? ` · estanque lleno, vuelve al río +${fmt(v)}` : ''}`, RARITY[sp.r].c, 3200);
    quest('hatch'); refreshHud(); save();
  }
  function enterPhase(ph) {
    const cur = gx.list[gx.i], R = cur.r, sp = padSpot(gx.zi), col = RARITY[R].c;
    gx.ph = ph; gx.t0 = t;
    if (ph === 'burst') {
      sparks(sp.x, sp.y - 1, [8, 14, 26, 50, 90][R], col, true); ripple(sp.x, sp.y, false);
      if (R >= 2) ripple(sp.x, sp.y, true);
      if (R >= 3) { SOUND.secret(); ripple(sp.x, sp.y, false); }
      if (R >= 4) SOUND.fortune();
    } else if (ph === 'open') {
      applyResult(gx.zi, cur.id);
      sparks(sp.x, sp.y - 1, [6, 10, 18, 30, 50][R], col, false); SOUND.hatch(); ripple(sp.x, sp.y + 6, false);
    }
  }
  const phaseLen = (R, fast) => { const f = fast ? 0.45 : 1; return { coin: 0.45 * f, shake: Math.max(0.35, SHAKE[R] * f), burst: 0.3 * f, rise: 0.9 * f, open: 0.7 * f }; };
  // fichas: una cada 20 minutos hasta cinco, y dos de regalo cada día
  function gainFichas(sec) {
    const F = GACHA.fichas, G = S.gacha;
    if (G.fichas >= F.max) { G.fichaT = 0; return; }
    G.fichaT = (G.fichaT || 0) + sec;
    if (G.fichaT >= F.every) { const n = Math.min(F.max - G.fichas, Math.floor(G.fichaT / F.every)); G.fichas += n; G.fichaT = G.fichas >= F.max ? 0 : G.fichaT % F.every; refreshNav(); }
  }
  function dailyFichas() {
    const day = todayKey(), G = S.gacha;
    if (G.day === day) return;
    const first = G.day === '';
    G.day = day;
    if (!first) { G.fichas = Math.min(GACHA.fichas.max + GACHA.fichas.daily, G.fichas + GACHA.fichas.daily); toast(`regalo del día · +${GACHA.fichas.daily} fichas`, '#9be7a0', 3200); }
    refreshNav(); save();
  }
  function updateGacha(dt) {
    gainFichas(dt);
    fx = fx.filter((f) => t - f.t0 < f.life); fx.forEach((f) => { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 16 * dt; });
    if (!gx) return;
    const D = phaseLen(gx.list[gx.i].r, gx.fast);
    if (t - gx.t0 < D[gx.ph]) return;
    const k = PHASES.indexOf(gx.ph);
    if (k < PHASES.length - 1) { enterPhase(PHASES[k + 1]); return; }
    gx.i++;
    if (gx.i < gx.list.length) { gx.ph = 'coin'; gx.t0 = t; SOUND.plop(); return; }
    const done = gx; gx = null;
    if (done.list.length > 1) { lastBatch = done.results; gachaZone = done.zi; show('gacha'); }
  }
  // lo que se ve del nenúfar en cada momento de la tirada
  function padState(zi) {
    const st = { t, open: 0.72 + 0.08 * Math.sin(t * 1.4 + zi), capShow: true };
    if (!gx || gx.zi !== zi) return st;
    const cur = gx.list[gx.i], el = t - gx.t0, col = RARITY[cur.r].c, V = PADS.VARIANTS[ZINFO[zi].id], rc = rgbOf(col);
    const p = clamp(el / phaseLen(cur.r, gx.fast)[gx.ph], 0, 1);
    if (gx.ph === 'coin') { st.open = 0.75 - 0.6 * p; st.capY = 27 + 26 * p; }              // la cápsula se hunde en la flor, que se cierra
    else if (gx.ph === 'shake') {
      st.open = 0.15; st.capShow = false; st.dx = Math.sin(el * 46) * (0.5 + 1.8 * p);
      st.glowRgb = mixRgb(V.glow.split(',').map(Number), rc, p * 1.2); st.glowA = 0.5 + 0.3 * p + 0.12 * Math.sin(el * 18);
    } else if (gx.ph === 'burst') { st.open = 0.15 + 0.85 * p; st.capShow = false; st.glowRgb = rc.join(","); st.glowA = 0.95; }
    else if (gx.ph === 'rise') { st.open = 1; st.capCol = col; st.capY = 50 - 56 * (1 - (1 - p) * (1 - p)); st.glowRgb = rc.join(','); st.glowA = 1.0; }
    else { st.open = 1; st.capCol = col; st.capY = -6; st.capSplit = p; st.glowRgb = rc.join(','); st.glowA = 1.0 - 0.4 * p; st.capShow = p < 0.9; }
    return st;
  }
  function drawGachaPad(zi) {
    if (zi >= MAIN || !isOpen(zi)) return;
    const sp = padSpot(zi), id = ZINFO[zi].id, st = padState(zi), mine = gx && gx.zi === zi;
    PADS.draw(g, id, sp.x, sp.y, PAD_K, st);
    airLights.push({ x: sp.x, y: sp.y - 1, h: 0, r: mine ? 11 : 9, rgb: st.glowRgb || PADS.VARIANTS[id].glow, a: 0.1 + 0.22 * light.night + (mine ? 0.12 : 0) });
    if (id === 'nenufares') fireflies(sp.x, sp.y, 12, 6, 4, '255,235,110', 3);
  }
  function drawFx() {
    fx.forEach((f) => { g.globalAlpha = Math.max(0, 1 - (t - f.t0) / f.life); g.fillStyle = f.col; g.fillRect(f.x - 0.35, f.y - 0.35, 0.7, 0.7); });
    g.globalAlpha = 1;
  }
  // cápsulas a medias (se cerró la página en plena tirada): se abren sin animación
  function flushOut() {
    S.gacha.out.slice().forEach((o) => applyResult(o.zi, o.id));
    S.gacha.out = [];
  }
  function openGacha(zi) { gachaZone = zi; lastBatch = null; show('gacha'); }

  // color de cada zona para el panel del nenúfar
  const GACCENT = { estanque: '#6ab85e', nenufares: '#f49ac0', cascada: '#8fd4f4', cueva: '#78f0ff', luna: '#fff3b0', templo: '#e0b040', portal: '#c77dff' };
  const gbar = (n, tot, w) => { const k = Math.max(0, Math.min(w, Math.round(n / tot * w))); return '█'.repeat(k) + '░'.repeat(w - k); };
  let gachaDet = false;                  // el apartado «detalles» del panel, desplegado o no
  function gachaHtml() {
    const zi = gachaZone, z = ZONES[zi], st = S.gacha.pity[zi] || [0, 0, 0], price = pullPrice(zi), odds = oddsOf(zi), pool = poolOf(zi);
    const free = S.gacha.free.filter((f) => f === zi).length, closed = zi === PORTAL && !portalOpen(), full = S.carps.length >= capacity();
    const room = roomLeft();
    const can = (n) => (closed || !!gx || room < n || S.perlas < price * n ? 'disabled' : '');
    const nameOf = (x) => (S.album[x] ? SPECIES[x].name : '???');
    const rc = (x) => RARITY[SPECIES[x].r].c;
    const present = RARITY.map((r, i) => i).filter((i) => odds[i] > 0);
    let out = `<div class="ghd"><div class="gnm">${z.name}</div><div class="sub">${S.carps.length}/${capacity()} carpas</div></div>`;
    if (closed) out += `<div class="note">cerrado · abre a las ${portalNext()}</div>`;
    else if (zi === PORTAL) out += `<div class="note">hoy: ${worldToday().name}</div>`;
    out += `<div class="pulls"><button class="main" data-pull="1" ${can(1)}>tirar · ${fmt(price)}</button><button data-pull="10" ${can(10)}>×10 · ${fmt(price * 10)}</button></div>`;
    const F = GACHA.fichas, nf = S.gacha.fichas, left = Math.max(0, F.every - (S.gacha.fichaT || 0));
    if (zi <= F.maxZone) out += `<button class="gb" data-ficha ${nf < 1 || gx || room < 1 ? 'disabled' : ''}>${nf > 0 ? `ficha gratis <span class="chip">${nf}</span>` : `próxima ficha · ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`}</button>`;
    if (free) out += `<button class="gb" data-free ${closed || gx || room < 1 ? 'disabled' : ''}>cápsula guardada <span class="chip">${free}</span></button>`;
    if (room < 1) out += '<div class="note">estanque lleno · suelta una carpa o amplía el cupo</div>';
    else if (room < 10) out += `<div class="note">×10 necesita 10 huecos · hay ${room}</div>`;
    if (lastBatch) {
      const cnt = RARITY.map((r, i) => ({ r, n: lastBatch.filter((b) => SPECIES[b.id].r === i).length })).filter((o) => o.n);
      const nuevas = lastBatch.filter((b) => b.new).map((b) => SPECIES[b.id].name);
      out += `<div class="lbl">resultado ×${lastBatch.length}</div><div class="leg">${cnt.map((o) => `<span style="--c:${o.r.c}">${o.n} ${o.r.n}</span>`).join('')}</div>${nuevas.length ? `<div class="note">nuevas: ${nuevas.join(', ')}</div>` : ''}`;
    }
    out += '<div class="lbl">qué puede salir</div><div class="stack">' + present.map((i) => `<i style="width:${odds[i]}%;background:${RARITY[i].c}"></i>`).join('') + '</div>';
    out += '<div class="leg">' + present.map((i) => `<span style="--c:${RARITY[i].c}">${RARITY[i].n}</span>`).join('') + '</div>';
    const topR = Math.max(...pool.map((x) => SPECIES[x].r)), gar = GACHA.pity.map((p, i) => ({ p, i, rem: Math.max(1, p.every - (st[i] || 0)) })).filter((o) => topR >= o.p.min);
    const near = gar.slice().sort((a, b) => a.rem - b.rem)[0];
    if (near) out += `<div class="note">${RARITY[near.p.min].n}${near.i === 0 ? ' o mejor' : ''} segura en ${near.rem} ${near.rem === 1 ? 'tirada' : 'tiradas'}</div>`;
    out += `<button class="lnk" data-det>${gachaDet ? '▾' : '▸'} detalles</button>`;
    if (gachaDet) {
      RARITY.forEach((r, i) => {
        if (!odds[i]) return;
        const names = pool.filter((x) => SPECIES[x].r === i).map(nameOf).join(', ');
        out += `<div class="orow"><span style="color:${r.c}">${r.n}</span><span class="gbar" style="color:${r.c}">${gbar(odds[i], 100, 18)}</span><span>${odds[i].toFixed(odds[i] < 10 ? 1 : 0)} %</span></div><div class="sub gsp">${names}</div>`;
      });
      out += '<div class="lbl">garantías</div>' + gar.map(({ p, i }) => `<div class="orow"><span style="color:${RARITY[p.min].c}">${RARITY[p.min].n}${i === 0 ? '+' : ''}</span><span class="gbar" style="color:${RARITY[p.min].c}">[${gbar(st[i] || 0, p.every, 14)}]</span><span>${Math.min(st[i] || 0, p.every)}/${p.every}</span></div>`).join('');
      const hist = S.gacha.hist.filter((h) => h.zi === zi).slice(0, 24);
      if (hist.length) out += '<div class="lbl">últimas</div><div class="hist">' + hist.map((h) => `<span class="sq" style="background:${rc(h.id)}" title="${SPECIES[h.id].name}"></span>`).join('') + '</div>';
      out += `<div class="note">${F.max} fichas como mucho · una cada 20 min y ${F.daily} de regalo al día (del ${ZONES[0].name} a ${ZONES[F.maxZone].name})</div>`;
    }
    return out;
  }

  // ── cría: dos carpas adultas mezclan sus colores en el laboratorio ──
  const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  function hueShift(hx, deg) {
    const [r, gg, b] = hex(hx).map((v) => v / 255), mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), l = (mx + mn) / 2;
    let h = 0, s = 0;
    if (mx !== mn) {
      const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (gg - b) / d + (gg < b ? 6 : 0) : mx === gg ? (b - r) / d + 2 : (r - gg) / d + 4; h *= 60;
    }
    return `hsl(${Math.round((h + deg) % 360)},${Math.round(s * 100)}%,${Math.round(l * 100)}%)`;
  }
  function makeHybrid(a, b) {
    const A = spOf(a), B = spOf(b), pat = [];
    for (let i = 0; i < 6; i++) { const c = (i % 2 ? B.pat : A.pat)[Math.floor(i / 2) % (i % 2 ? B.pat : A.pat).length]; pat.push(c); }
    const short = (n) => cap1(n.replace(/^(Carpa|Koi) (de la |del |de )?/i, '').split(' ')[0].toLowerCase());
    let name = A.name === B.name ? `${A.name} pura` : `${short(A.name)}-${short(B.name)}`;
    let r = Math.max(A.r, B.r), rainbow = !!(A.rainbow && B.rainbow);
    const head = A.head || B.head;
    const z = Math.max(zoneOfSpecies(a), zoneOfSpecies(b));
    let finalPat = pat;
    if (Math.random() < 0.12) {                         // a veces sale una variante que no existe en el álbum
      r = Math.min(4, r + 1); const deg = 60 + Math.floor(Math.random() * 240);
      finalPat = pat.map((c) => (c.startsWith('#') ? hueShift(c, deg) : c));
      name += ' variante';
      if (A.r >= 3 && B.r >= 3 && Math.random() < 0.4) rainbow = true;
    }
    return { name, r, pat: finalPat, head, rainbow, z };
  }
  // ── laboratorio: mezcla dos carpas adultas; ciertas parejas dan una criatura en vez de una cría ──
  const recipeOf = (a, b) => (a.hy || b.hy ? null : RECIPES.find((r) => (r.a === a.sp && r.b === b.sp) || (r.a === b.sp && r.b === a.sp)) || null);
  const labZone = (a, b) => (recipeOf(a, b) ? 5 : Math.min(5, Math.max(zoneOfSpecies(a), zoneOfSpecies(b))));
  const labCost = (a, b) => ZONES[labZone(a, b)].pull;
  const labBusy = () => S.eggs.some((e) => e.lab);
  const canMix = (c) => S.carps.includes(c) && stageOf(c.xp) >= 2 && !(c.bt > Date.now());
  function labMix(a, b) {
    const cost = labCost(a, b), rec = recipeOf(a, b), z = labZone(a, b);
    if (S.perlas < cost || labBusy() || !canMix(a) || !canMix(b) || a === b) return;
    S.perlas -= cost;
    const now = Date.now();
    a.bt = now + BREED_REST; b.bt = now + BREED_REST;
    const L0 = MAP.ISLANDS[0][0], [x, y] = L0 ? [L0.x + L0.r + 8, L0.y] : [0, 0];
    S.eggs.push({ lab: true, zone: z, ready: now + LAB_TIME(z) * 1000, sp: rec ? rec.sp : undefined, hy: rec ? undefined : makeHybrid(a, b), x, y });
    labA = labB = null;
    toast(rec ? 'la mezcla burbujea de una forma muy rara...' : `mezclando ${spOf(a).name} y ${spOf(b).name}`, rec ? '#7bffcf' : '#ffb3d1', 3000);
    SOUND.hatch(); quest('breed'); refreshHud(); save();
  }

  // ── encargos del día ──
  const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  const questReward = () => Math.round(40 * Math.pow(openMain(), 1.6) + 20);
  function ensureQuests() {
    const day = todayKey();
    if (S.quests && S.quests.day === day) return;
    const seed = day.split('-').reduce((a, v) => a * 31 + +v, 7), pool = QUESTS.filter((q) => q.id !== 'breed' || S.lab.built);
    const list = [];
    for (let i = 0; i < 3; i++) {
      const k = Math.floor(hash(seed, i) * pool.length), q = pool.splice(k, 1)[0];
      list.push({ id: q.id, n: q.id === 'pearls' ? q.n * openMain() : q.n, p: 0, done: false, got: false });
    }
    S.quests = { day, list, reward: questReward() };
  }
  function quest(id, amt = 1) {
    ensureQuests();
    S.quests.list.forEach((q) => {
      if (q.id !== id || q.done) return;
      q.p = Math.min(q.n, q.p + amt);
      if (q.p >= q.n) { q.done = true; toast(`encargo cumplido: ${QUESTS.find((x) => x.id === id).text.toLowerCase()} · cóbralo en «encargos»`, '#9be7a0', 3200); }
    });
    refreshNav();
  }

  let hudAcc = 0, lureRip = 0, rainDrop = 0, portalWas = null;
  function update(dt) {
    t += dt;
    updateGacha(dt);
    const fm = foodMax();
    if (S.food < fm) { S.foodT += dt; const fe = foodEvery(); while (S.foodT >= fe && S.food < fm) { S.food++; S.foodT -= fe; } } else S.foodT = 0;

    const now = Date.now();
    for (let i = S.eggs.length - 1; i >= 0; i--) {
      const e = S.eggs[i];
      if (now >= e.ready && S.carps.length < capacity()) { S.eggs.splice(i, 1); hatch(e); }
    }
    S.carps.forEach((c) => {
      c.hunger = Math.max(0, c.hunger - HUNGER_RATE * dt);
      if (c.hunger > 30) c.pt -= dt;
      if (c.pt <= 0) { c.pt = rnd(PERLA_EVERY - 4, PERLA_EVERY + 4); spawnPerla(c); }
      updateMovement(c, dt);
    });
    pellets = pellets.filter((p) => t - p.born < 30);
    ripples = ripples.filter((r) => t - r.born < r.max);

    // mejoras: el comedero echa bolitas a quien tenga hambre y la red recoge las perlas sola
    if (lvl('feeder')) {
      ev.feeder -= dt;
      if (ev.feeder <= 0) {
        ev.feeder = [25, 16, 10][lvl('feeder') - 1];
        const c = S.carps.filter((k) => k.hunger < 70).sort((a, b) => a.hunger - b.hunger)[0];
        if (c) { const x = c.x + Math.cos(c.ang) * 6, y = c.y + Math.sin(c.ang) * 6; if (waterAt(x, y, 0.9)) { pellets.push({ x, y, born: t }); ripple(x, y, true); } }
      }
    }
    if (lvl('net')) {
      ev.net -= dt;
      if (ev.net <= 0) {
        ev.net = [30, 18, 10][lvl('net') - 1];
        if (S.floating.length) { const v = S.floating.reduce((a, p) => a + p.v, 0); S.floating.forEach((p, i) => { if (i < 8) ripple(p.x, p.y, true); }); S.floating = []; S.perlas += v; quest('pearls', v); refreshHud(); }
      }
    }

    // visitas
    if (!fortune && t >= ev.fortune) { spawnFortune(); ev.fortune = t + (FAST ? 40 : rnd(150, 300)); }
    if (fortune) { updateMovement(fortune, dt); if (t > fortune.born + fortune.life) fortune = null; }
    if (!heron && t >= ev.heron && S.carps.length >= 3) { spawnHeron(); ev.heron = t + (FAST ? 50 : rnd(240, 420)); }
    if (heron) {
      if (heron.state === 'in' && t - heron.t0 > 2.4) { heron.state = 'stand'; heron.t0 = t; }
      else if (heron.state === 'stand' && t - heron.t0 > 14) heronStrikes();
      else if (heron.state === 'out' && t - heron.t0 > 2) heron = null;
    }
    // lluvia
    if (!raining && t >= ev.rain) { raining = true; ev.rainEnd = t + (FAST ? 40 : rnd(90, 180)); toast('empieza a llover: la comida sale el doble de rápido', '#a9c8ff', 3000); }
    if (raining && t >= ev.rainEnd) { raining = false; ev.rain = t + (FAST ? 60 : rnd(420, 900)); }
    rainAmt += ((raining ? 1 : 0) - rainAmt) * Math.min(1, dt * 0.6);
    SOUND.rain(rainAmt);
    if (rainAmt > 0.1) {
      rainDrop += dt * 26 * rainAmt;
      const vw = W / cam.z, vh = H / cam.z;
      while (rainDrop > 1 && ripples.length < 160) {
        rainDrop--;
        const x = cam.x + rnd(-vw / 2, vw / 2), y = cam.y + rnd(-vh / 2, vh / 2);
        if (waterAt(x, y, 0.93)) ripples.push({ x, y, born: t, max: 0.6, speed: 4 });
      }
    }
    // el dedo que guía: ondas suaves donde está
    if (lure) {
      lureRip -= dt;
      if (lureRip <= 0) { lureRip = 0.3; ripple(lure.x, lure.y, true); }
      if (!lure.done && t - lure.t0 > 2 && S.carps.some((c) => c.lured)) { lure.done = true; quest('lure'); }
    }

    if (pendingFly && t >= pendingFly.at) { flyToZone(pendingFly.zi); pendingFly = null; }
    stepZoom(dt);
    if (fly) {
      const k = 1 - Math.exp(-dt * 5);
      cam.x += (fly.x - cam.x) * k; cam.y += (fly.y - cam.y) * k; cam.z += (fly.z - cam.z) * k;
      if (Math.abs(fly.x - cam.x) < 0.2 && Math.abs(fly.y - cam.y) < 0.2 && Math.abs(fly.z - cam.z) < 0.05) fly = null;
      clampCam();
    }
    hudAcc += dt;
    if (hudAcc > 0.5) {
      hudAcc = 0; light = daylight(); refreshHud(); refreshInfo();
      const po = portalOpen();
      if (isOpen(PORTAL) && po !== portalWas && portalWas !== null) {
        if (po) { toast(`el portal se ha abierto · hoy da al ${worldToday().name}`, worldToday().color, 4000); SOUND.secret(); }
        else toast(`el portal se ha cerrado · vuelve a las ${portalNext()}`, '#b8a4ff', 3000);
      }
      portalWas = po;
    }
  }

  // ───────────────────────── tamaño y rejilla ─────────────────────────
  const FONT = 'ui-monospace, "Cascadia Mono", Consolas, "Courier New", monospace';
  let canvas = $('#pond');
  // Las letras y el resplandor se hacen en la tarjeta gráfica (ascii-gl.js). Si el dispositivo no
  // tiene WebGL2, se usa el camino antiguo con el lienzo 2D (toAscii y bloom, más abajo).
  let glr = null;
  try { glr = ASCII_GL.create(canvas); } catch (err) {
    console.warn('WebGL2 no disponible, se pinta con el lienzo 2D', err);
    glr = null;
    const fresh2 = canvas.cloneNode(); canvas.replaceWith(fresh2); canvas = fresh2;   // un lienzo con contexto WebGL ya no admite 2D
  }
  const ctx = glr ? null : canvas.getContext('2d');
  const blooms = [2, 4, 8].map(() => document.createElement('canvas'));
  const glyphs = new Map();
  let cellDev = 8, dpr = 1, quality = 1, started = false;

  const CH_HI = ['8', 'S', '9', 'X', '@', '5', '7', '1', 'd', '3'];
  const CH_MID = ['x', '+', '=', '*', 'X', 'z'];
  const CH_LO = [':', ';', '-', '~'];
  const CH_VLO = ['.', ',', "'", '`'];
  const CHARSET = [...CH_HI, ...CH_MID, ...CH_LO, ...CH_VLO];
  const IDX = new Map(CHARSET.map((c, i) => [c, i]));

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    const cell = Math.max(MIN_CELL, Math.sqrt(W * H / MAX_CELLS)) * quality;
    cellDev = Math.max(3, Math.round(cell * dpr));
    cellCss = cellDev / dpr;
    GW = Math.ceil(W / cellCss); GH = Math.ceil(H / cellCss);
    canvas.width = GW * cellDev; canvas.height = GH * cellDev;
    canvas.style.width = canvas.width / dpr + 'px'; canvas.style.height = canvas.height / dpr + 'px';
    src.width = GW; src.height = GH;
    img = g.createImageData(GW, GH);
    fishCv.width = maskCv.width = reflCv.width = GW; fishCv.height = maskCv.height = reflCv.height = GH;
    maskImg = maskCtx.createImageData(GW, GH);
    for (let i = 0; i < maskImg.data.length; i += 4) maskImg.data[i] = maskImg.data[i + 1] = maskImg.data[i + 2] = 255;
    sinX = new Float32Array(GW); sinY = new Float32Array(GH);
    allocCells();
    camDirty = true;
    if (glr) glr.resize({ cellDev, charset: CHARSET, font: FONT });
    else {
      blooms.forEach((b, i) => { const d = [2, 4, 8][i]; b.width = Math.ceil(canvas.width / d); b.height = Math.ceil(canvas.height / d); });
      glyphs.clear();
    }
    if (!started) {          // primera vez: la partida guardada o el estanque del centro
      started = true;
      if (S.cam && MAP.sample(S.cam.x, S.cam.y).r < 3) { cam.x = S.cam.x; cam.y = S.cam.y; cam.z = S.cam.z; } else { cam.x = 0; cam.y = 0; cam.z = defaultZoom(); }
    }
    clampCam();
  }

  // ───────────────────────── brillo → letra (camino 2D) ─────────────────────────
  function pickIdx(lum, h) {
    const v = lum / 255;
    const set = v > 0.6 ? CH_HI : v > 0.4 ? CH_MID : v > 0.24 ? CH_LO : v > 0.12 ? CH_VLO : null;
    return set ? IDX.get(set[Math.floor(h * set.length) % set.length]) : -1;
  }
  function glyph(ci, qr, qg, qb) {
    const key = (ci << 12) | (qr << 8) | (qg << 4) | qb;
    let c = glyphs.get(key);
    if (!c) {
      if (glyphs.size > 40000) glyphs.clear();
      c = document.createElement('canvas'); c.width = c.height = cellDev;
      const x = c.getContext('2d');
      x.font = `${cellDev * 1.02}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      const k = (q) => Math.min(255, (q * 16 + 8) * 1.4 + 30) | 0;
      x.fillStyle = `rgb(${k(qr)},${k(qg)},${k(qb)})`;
      x.fillText(CHARSET[ci], cellDev / 2, cellDev / 2 + cellDev * 0.06);
      glyphs.set(key, c);
    }
    return c;
  }

  // La cueva está a oscuras se mire a la hora que se mire: solo se ve donde hay luz (setas, cristales,
  // el rayo del techo). La oscuridad se desvanece hacia la boca, donde la cueva toca las otras zonas.
  const darkCv = document.createElement('canvas'), darkCtx = darkCv.getContext('2d');
  function caveDark(zi, u) {
    const z = MAP.Z[zi], c = darkCtx;
    if (darkCv.width !== GW || darkCv.height !== GH) { darkCv.width = GW; darkCv.height = GH; }
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, GW, GH);
    c.setTransform(u, 0, 0, u, GW / 2 - cam.x * u, GH / 2 - cam.y * u);
    const R = Math.max(z.rx, z.ry) * 1.2, gr = c.createRadialGradient(z.x, z.y, R * 0.62, z.x, z.y, R);
    gr.addColorStop(0, 'rgba(3,2,8,0.6)'); gr.addColorStop(1, 'rgba(3,2,8,0)');
    c.fillStyle = gr; c.beginPath(); c.arc(z.x, z.y, R, 0, 7); c.fill();
    c.globalCompositeOperation = 'destination-out';
    const hole = (x, y, r, a) => { const h = c.createRadialGradient(x, y, 0, x, y, r); h.addColorStop(0, `rgba(0,0,0,${a})`); h.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = h; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); };
    SPOT.mush.forEach(([x, y]) => hole(x, y, 11, 0.75));
    SPOT.crystals.forEach((k) => hole(k.x, k.y, 15, 0.85));
    hole(SPOT.shaft[0], SPOT.shaft[1], 24, 1);
    S.floating.forEach((p) => hole(p.x, p.y, 5, 0.6));          // las perlas también alumbran un poco
    { const ps = padSpot(zi); hole(ps.x, ps.y, PAD_R * 1.7, 0.95); }          // y el nenúfar de la máquina
    c.globalCompositeOperation = 'source-over';
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(darkCv, 0, 0); g.restore();
  }

  // ───────────────────────── pintado ─────────────────────────
  function renderScene() {
    g.setTransform(1, 0, 0, 1, 0, 0);
    paintGround();
    const u = U();
    g.setTransform(u, 0, 0, u, GW / 2 - cam.x * u, GH / 2 - cam.y * u);
    airLights.length = 0;
    const vw = W / cam.z, vh = H / cam.z, ripW = Math.max(0.8, 1.3 / u);
    const seen = (x, y, m) => Math.abs(x - cam.x) < vw / 2 + m && Math.abs(y - cam.y) < vh / 2 + m;
    const zoneSeen = (zi) => { const b = MAP.bbox(zi); return b[2] > cam.x - vw / 2 - 10 && b[0] < cam.x + vw / 2 + 10 && b[3] > cam.y - vh / 2 - 10 && b[1] < cam.y + vh / 2 + 10; };
    const shown = []; for (let zi = 0; zi < NZ; zi++) if (isOpen(zi) && zoneSeen(zi)) shown.push(zi);

    // 1) suelo: paisaje, decorado y lo que hay bajo el agua
    shown.forEach((zi) => { landscape(zi); DECOR[ZINFO[zi].id](zi); });
    MAP.TREASURES.forEach((T) => { if (isOpen(T.z) && seen(T.x, T.y, 12)) drawTreasure(T, false); });

    // 2) carpas, en su capa, recortadas con la máscara del agua
    const visible = S.carps.filter((c) => seen(c.x, c.y, 30)).sort((a, b) => a.y - b.y);
    if (fortune && seen(fortune.x, fortune.y, 30)) visible.push(fortune);
    const scene = g;
    fishCtx.setTransform(1, 0, 0, 1, 0, 0); fishCtx.clearRect(0, 0, GW, GH);
    fishCtx.setTransform(u, 0, 0, u, GW / 2 - cam.x * u, GH / 2 - cam.y * u);
    g = fishCtx; visible.forEach(drawCarp); g = scene;              // drawCarp pinta en `g`
    fishCtx.setTransform(1, 0, 0, 1, 0, 0);
    fishCtx.globalCompositeOperation = 'destination-in'; fishCtx.drawImage(maskCv, 0, 0);
    fishCtx.globalCompositeOperation = 'source-over';
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(fishCv, 0, 0); g.restore();

    // 3) lo que flota o sobresale: nenúfares, copas, rocas, cascada, tesoros, barreras
    shown.forEach((zi) => { if (PAD_ZONES[ZINFO[zi].id]) drawPads(padsOf(zi)); landscapeTop(zi); const top = DECOR_TOP[ZINFO[zi].id]; if (top) top(zi); drawGachaPad(zi); });
    MAP.TREASURES.forEach((T) => { if (isOpen(T.z) && seen(T.x, T.y, 12)) drawTreasure(T, true); });
    drawBarriers();

    if (shown.some((zi) => ZINFO[zi].id === 'cueva')) caveDark(MAP.Z.findIndex((z) => z.id === 'cueva'), u);

    // 4) superficie: ondas, comida, perlas, el dedo
    g.lineWidth = ripW;
    ripples.forEach((r) => {
      const age = t - r.born, fade = 1 - age / r.max;
      g.strokeStyle = `rgba(225,243,255,${0.8 * fade})`;
      g.beginPath(); g.arc(r.x, r.y, age * r.speed, 0, 7); g.stroke();
    });
    pellets.forEach((p) => { g.fillStyle = '#f0c96b'; g.beginPath(); g.arc(p.x, p.y + Math.sin(t * 3 + p.x) * 0.25, 0.85, 0, 7); g.fill(); });
    S.floating.forEach((p, i) => {
      if (!seen(p.x, p.y, 8)) return;
      const k = 0.5 + 0.5 * Math.sin(t * 3 + i);
      glow(p.x, p.y, 4.5, 'rgba(255,241,168,A)', 0.55);
      g.fillStyle = '#fffbe0'; g.beginPath(); g.arc(p.x, p.y, 1.2 + k * 0.4, 0, 7); g.fill();
    });
    if (lure) { g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = Math.max(0.6, 1 / u); g.beginPath(); g.arc(lure.x, lure.y, 2.4 + Math.sin(t * 6) * 0.4, 0, 7); g.stroke(); }
    drawHeron();

    // 5) luz del día y lluvia, luces de la noche, y los avisos encima de todo
    applyLight(vw, vh);
    nightLights(seen);
    if (shown.includes(0) && LAB_AT() && S.lab.built) {           // el farol del muelle también se refleja
      const L0 = LAB_AT(); airLights.push({ x: L0.x - 2.2 * LAB_K, y: L0.y + 17.2 * LAB_K + 2, h: 2, r: 5, rgb: '255,217,138', a: 0.15 + 0.6 * light.night, only: true });
    }
    surface(shown, visible, u);                                     // reflejos: encima de las carpas
    shown.forEach((zi) => { const id = ZINFO[zi].id; if (id === 'luna') DECOR_TOP.moon(zi); else if (id === 'portal') DECOR_TOP.ring(zi); });
    drawAirLights();
    drawFx();
    if (shown.includes(0) && LAB_AT()) labLights(LAB_AT());
    drawRain(vw, vh);
    for (let i = MAIN; i < NZ; i++) if (!isOpen(i) && isOpen(MAP.Z[i].parent)) secretHint(i);
    visible.forEach((c) => { if (!c.fortune) drawMarks(c); });
  }

  function toAscii() {
    const d = g.getImageData(0, 0, GW, GH).data;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, GW, GH, 0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(0,0,0,0.58)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0, n = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++, n++) {
        const i = n * 4, r = d[i], gg = d[i + 1], b = d[i + 2];
        const ci = pickIdx(0.299 * r + 0.587 * gg + 0.114 * b, hArr[n]);
        if (ci >= 0) ctx.drawImage(glyph(ci, r >> 4, gg >> 4, b >> 4), x * cellDev, y * cellDev);
      }
    }
  }
  function bloom() {
    let from = canvas;
    blooms.forEach((b) => { const bc = b.getContext('2d'); bc.clearRect(0, 0, b.width, b.height); bc.drawImage(from, 0, 0, b.width, b.height); from = b; });
    ctx.globalCompositeOperation = 'lighter'; ctx.imageSmoothingEnabled = true;
    [[blooms[2], 0.45], [blooms[1], 0.3]].forEach(([b, a]) => { ctx.globalAlpha = a; ctx.drawImage(b, 0, 0, canvas.width, canvas.height); });
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  function render() {
    renderScene();
    if (glr) glr.draw({ src, hash: hArr, GW, GH, cellDev }); else { toAscii(); bloom(); }
  }

  // ───────────────────────── interacción ─────────────────────────
  const HINT = 'toca: dar comida · mantén: guiar';
  function toast(msg, color, ms = 2200) {
    const el = $('#toast');
    el.textContent = msg; el.style.color = color || ''; el.classList.add('on');
    clearTimeout(toast.k); toast.k = setTimeout(() => el.classList.remove('on'), ms);
  }

  // toque (sin arrastrar) sobre el mundo
  function tap(px, py) {
    const [x, y] = screenToWorld(px, py), reach = (r) => Math.max(r, 18 / cam.z);   // zona de toque mínima en píxeles
    // la garza y la carpa de la fortuna, primero
    if (heron && heron.state !== 'out') { const [hx, hy] = heronPos(); if (Math.hypot(hx - x, hy - y) < reach(9)) { shooHeron(); return; } }
    if (fortune && Math.hypot(fortune.x - x, fortune.y - y) < reach(9)) { catchFortune(); return; }
    // tesoros
    for (const T of MAP.TREASURES) {
      if (!S.found[T.id] && isOpen(T.z) && Math.hypot(T.x - x, T.y - y) < reach(6)) { findTreasure(T); return; }
    }
    // los nenúfares de las máquinas
    for (let zi = 0; zi < MAIN; zi++) {
      if (!isOpen(zi)) continue;
      const sp = padSpot(zi);
      if (Math.hypot(sp.x - x, sp.y - y) < reach(PAD_R)) { if (!gx) openGacha(zi); return; }
    }
    // el laboratorio, en el islote del Estanque
    { const L = LAB_AT(); if (L && Math.hypot(L.x - x, L.y - y) < reach(L.r + 1)) { show('lab'); return; } }
    // secretos: tocar el pasadizo o el rincón
    for (let i = MAIN; i < NZ; i++) {
      const z = MAP.Z[i];
      if (isOpen(i) || !isOpen(z.parent)) continue;
      if (z.path.some(([px2, py2]) => Math.hypot(px2 - x, py2 - y) < 14) || Math.hypot(z.x - x, z.y - y) < z.rx) { discover(i); return; }
    }
    const q = MAP.sample(x, y), zi = q.z;
    if (!isOpen(zi)) { if (status(zi) === 1) show('map'); return; }
    for (let i = 0; i < S.floating.length; i++) {
      const p = S.floating[i];
      if (Math.hypot(p.x - x, p.y - y) < reach(4.2)) {
        S.floating.splice(i, 1); S.perlas += p.v; ripple(p.x, p.y, true);
        toast(`+${p.v} perlas`, '#fff1a8', 900); SOUND.pearl(); quest('pearls', p.v); refreshHud(); save(); return;
      }
    }
    let hit = null, best = 1e9;
    S.carps.forEach((c) => {
      const L = lenC(c);
      c.spine.forEach((p) => { const d = Math.hypot(p.x - x, p.y - y); if (d < reach(L * 0.45 + 2) && d < best) { best = d; hit = c; } });
    });
    if (hit) {
      if (selected === hit) { sheetCarp = hit; releaseArm = null; show('carp'); }   // segundo toque: su ficha
      selected = hit; refreshInfo(); return;
    }
    selected = null;
    if (S.food <= 0) { toast('sin comida, espera un poco', '#ffb703', 1200); refreshInfo(); return; }
    if (waterAt(x, y, 0.92)) { S.food--; pellets.push({ x, y, born: t }); ripple(x, y, true); SOUND.plop(); quest('feed'); S.hintN = (S.hintN || 0) + 1; refreshHud(); }
    refreshInfo();
  }

  // arrastrar = mover la cámara · mantener pulsado en el agua = guiar a las carpas · dos dedos = zoom · rueda = zoom
  const ptrs = new Map();
  let moved = 0, pinchD = 0, downT = 0, downPt = null;
  canvas.addEventListener('pointerdown', (e) => {
    SOUND.start();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* puntero sintético */ }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    fly = null;
    if (ptrs.size === 1) { moved = 0; downT = t; downPt = { x: e.clientX, y: e.clientY }; }
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinchD = Math.hypot(a.x - b.x, a.y - b.y); moved = 99; zoomTo = null; lure = null; }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (ptrs.size === 1) {
      if (lure) { [lure.x, lure.y] = screenToWorld(e.clientX, e.clientY); p.x = e.clientX; p.y = e.clientY; return; }
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 8) { cam.x -= dx / cam.z; cam.y -= dy / cam.z; clampCam(); }
    } else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], before = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      p.x = e.clientX; p.y = e.clientY;
      const d = Math.hypot(a.x - b.x, a.y - b.y), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (pinchD > 0 && d > 0) zoomAt(mid.x, mid.y, d / pinchD);
      cam.x -= (mid.x - before.x) / cam.z; cam.y -= (mid.y - before.y) / cam.z; clampCam();
      pinchD = d; return;
    }
    p.x = e.clientX; p.y = e.clientY;
  });
  const endPtr = (e) => {
    if (!ptrs.has(e.pointerId)) return;
    const was = ptrs.size;
    ptrs.delete(e.pointerId);
    if (lure) { lure = null; return; }
    if (was === 1 && moved <= 8 && e.type === 'pointerup') tap(e.clientX, e.clientY);
    pinchD = 0;
  };
  canvas.addEventListener('pointerup', endPtr);
  canvas.addEventListener('pointercancel', endPtr);
  // mantener pulsado sin moverse sobre agua abierta: empieza a guiar
  setInterval(() => {
    if (lure || ptrs.size !== 1 || moved > 8 || !downPt || t - downT < 0.35) return;
    const [x, y] = screenToWorld(downPt.x, downPt.y);
    if (waterAt(x, y, 0.92)) { lure = { x, y, t0: t, done: false }; lureRip = 0; }
    downPt = null;
  }, 50);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;          // algunos ratones cuentan en líneas
    zoomSmooth(e.clientX, e.clientY, Math.exp(-clamp(dy, -240, 240) * 0.0015));
  }, { passive: false });

  document.querySelectorAll('#zoom button[data-z]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.z === 'snd') { SOUND.start(); S.sound = !S.sound; SOUND.set(S.sound); b.classList.toggle('off', !S.sound); b.setAttribute('aria-label', S.sound ? 'Silenciar' : 'Activar sonido'); save(); return; }
    zoomSmooth(W / 2, H / 2, b.dataset.z === 'in' ? 1.35 : 1 / 1.35);
  }));
  const sndBtn = $('#zoom button[data-z="snd"]');
  if (sndBtn) sndBtn.classList.toggle('off', !S.sound);
  window.addEventListener('keydown', (e) => {
    SOUND.start();
    if (!panel.hidden) return;
    const k = e.key, step = 14 / cam.z * 8;
    if (k === '+' || k === '=') zoomSmooth(W / 2, H / 2, 1.2);
    else if (k === '-' || k === '_') zoomSmooth(W / 2, H / 2, 1 / 1.2);
    else if (k === 'ArrowLeft' || k === 'a') { cam.x -= step; fly = null; clampCam(); }
    else if (k === 'ArrowRight' || k === 'd') { cam.x += step; fly = null; clampCam(); }
    else if (k === 'ArrowUp' || k === 'w') { cam.y -= step; fly = null; clampCam(); }
    else if (k === 'ArrowDown' || k === 's') { cam.y += step; fly = null; clampCam(); }
  });

  // ───────────────────────── HUD ─────────────────────────
  function refreshHud() {
    const zi = MAP.zoneAt(cam.x, cam.y);
    const parts = [isOpen(zi) ? zoneName(zi) : ''];
    if (raining) parts.push('lluvia');
    $('#zoneName').textContent = parts.filter(Boolean).join(' · ');
    if (isOpen(zi)) document.documentElement.style.setProperty('--accent', ZINFO[zi].water);
    $('#perlas').innerHTML = `perlas <b>${fmt(S.perlas)}</b>`;
    $('#food').innerHTML = `comida <b>${S.food}/${foodMax()}</b>`;
    // con dos o más perlas flotando aparece el botón para recogerlas todas
    const n = S.floating.length, btn = $('#collect');
    btn.hidden = n < 2;
    if (n >= 2) btn.textContent = `recoger +${fmt(S.floating.reduce((a, p) => a + p.v, 0))}`;
    refreshNav();
  }
  function refreshNav() {
    ensureQuests();
    const b = $('#nav [data-p="quests"]');
    if (b) b.classList.toggle('dot', S.quests.list.some((q) => q.done && !q.got));
    const cb = $('#nav [data-p="gacha"]');
    if (cb) cb.classList.toggle('dot', S.gacha.fichas > 0);                  // hay fichas por gastar
  }
  const bar = (v) => { const full = Math.round(clamp(v, 0, 100) / 10); return `[${'█'.repeat(full)}${'░'.repeat(10 - full)}]`; };
  function refreshInfo() {
    const c = selected, el = $('#info');
    el.hidden = false;
    el.classList.toggle('sel', !!c);
    if (!c) { const tip = (S.hintN || 0) < 8; el.textContent = tip ? HINT : ''; el.hidden = !tip; el.style.color = ''; return; }          // la ayuda se va cuando ya sabes jugar
    const sp = spOf(c);
    el.innerHTML = `${sp.name} · ${RARITY[sp.r].n} · ${bar(c.hunger)} · <span class="more">ver ficha</span>`;
    el.style.color = RARITY[sp.r].c;
  }
  function collectAll() {
    if (!S.floating.length) return;
    const total = S.floating.reduce((a, p) => a + p.v, 0);
    S.floating.forEach((p, i) => { if (i < 12) ripple(p.x, p.y, true); });
    S.floating = []; S.perlas += total;
    toast(`+${fmt(total)} perlas`, '#fff1a8', 1200); SOUND.coins(4); quest('pearls', total); refreshHud(); save();
  }
  $('#collect').addEventListener('click', collectAll);

  // ───────────────────────── paneles ─────────────────────────
  const panel = $('#panel'), body = $('#body');
  let openPanel = null, tickTimer = null;
  const ZONE_ART = [
    ' ~~~~ \n(~~~~)\n ~~~~ ', ' @@ ~~ \n~~ @@ ~\n @ ~~~ ', '  |:|  \n  |:|  \n ~~o~~ ',
    ' v v v \n( * * )\n ~~~~~ ', '  ,-.  \n (O O) \n  `-´  ', ' =|=|= \n | + | \n =|=|= ',
    ' .-~-. \n( (@) )\n `-~-\' ', ' /\\_/\\ \n( *** )\n \\___/ ', '  ()   \n ~()~  \n  ~~   ',
  ];
  function spriteHtml(sp) {
    return [...SPRITE].map((ch, u) => {
      let col = sp.pat[u % sp.pat.length];
      if (sp.head && ch === 'º') col = sp.head;
      if (sp.rainbow) col = `hsl(${u * 50},90%,68%)`;
      return `<span style="color:${col}">${ch}</span>`;
    }).join('');
  }
  const card = (sp, nm, extra) => `<div class="card"><div class="spr">${spriteHtml(sp)}</div><div class="nm">${nm}</div><div class="nm" style="color:${RARITY[sp.r].c}">${RARITY[sp.r].n}${extra || ''}</div></div>`;
  const cardOff = (r) => `<div class="card off"><div class="spr">??????</div><div class="nm">???</div><div class="nm">${RARITY[r].n}</div></div>`;
  const dots = (n, max) => '●'.repeat(n) + '○'.repeat(max - n);

  const LAB_ART = '   _/\\_   \n  |[]  |~ \n  |__[]|  ';
  const TUBE_ART = '  |  |  \n  |~~|  \n  `--`  ';
  function probeta(slot, c) {
    const sp = c && spOf(c);
    return `<button class="probeta" data-slot="${slot}">${c ? `<pre>${spriteHtml(sp)}</pre><span class="nm">${sp.name}</span><span class="sub">cambiar</span>` : `<pre>${TUBE_ART}</pre><span class="sub">elegir carpa</span>`}</button>`;
  }
  function labHtml() {
    if (!S.lab.built) {
      return `<div class="zone-title">laboratorio</div><div class="row"><pre>${LAB_ART}</pre>
        <div><div class="nm">Construir el laboratorio</div><div class="sub">mezcla dos carpas adultas</div></div>
        <button data-build ${S.perlas < LAB.cost ? 'disabled' : ''}>${fmt(LAB.cost)} perlas</button></div>`;
    }
    if (labA && !canMix(labA)) labA = null;
    if (labB && !canMix(labB)) labB = null;
    const mix = S.eggs.find((e) => e.lab);
    let out = '<div class="zone-title">laboratorio</div>';
    if (mix) {
      const left = Math.max(0, Math.ceil((mix.ready - Date.now()) / 1000)), name = mix.sp ? '???' : mix.hy.name;
      const total = LAB_TIME(mix.zone), pct = 100 - left / total * 100;
      out += `<div class="row"><pre>${LAB_ART}</pre><div><div class="nm">mezclando · ${name}</div><div class="sub">${bar(pct)} ${left}s</div></div></div>`;
    }
    out += `<div class="lab">${probeta('a', labA)}<div class="plus">+</div>${probeta('b', labB)}</div>`;
    if (labA && labB) {
      const rec = recipeOf(labA, labB), cost = labCost(labA, labB);
      const what = rec ? (S.album[rec.sp] ? `saldrá: ${SPECIES[rec.sp].name}` : 'la mezcla burbujea de una forma rara...') : 'saldrá una cría con algo de cada una';
      const full = S.carps.length >= capacity();
      out += `<div class="note">${what}</div><button class="mix" data-mix ${mix || full || S.perlas < cost ? 'disabled' : ''}>${mix ? 'ya hay una mezcla en marcha' : full ? 'el estanque está lleno' : `mezclar · ${fmt(cost)} perlas`}</button>`;
    } else out += '<div class="note">elige dos carpas adultas</div>';
    out += `<div class="zone-title">fórmulas <span>${RECIPES.filter((r) => S.album[r.sp]).length}/${RECIPES.length}</span></div><div class="grid">` +
      RECIPES.map((r) => (S.album[r.sp]
        ? `<div class="card"><div class="spr">${spriteHtml(SPECIES[r.sp])}</div><div class="nm">${SPECIES[r.sp].name}</div><div class="nm sub">${SPECIES[r.a].name} + ${SPECIES[r.b].name}</div></div>`
        : `<div class="card off"><div class="spr">??????</div><div class="nm">${r.hint}</div></div>`)).join('') + '</div>';
    return out;
  }

  function renderPanel(kind) {
    openPanel = kind;
    let html = '';
    if (kind === 'map') {
      html = ZONES.map((z, i) => {
        const open = S.unlocked[i], visible = open || S.unlocked[i - 1];
        if (!visible) return '';
        const art = visible ? ZONE_ART[i] : '???????\n???????\n???????';
        let action = '';
        if (open) action = `<button data-go="${i}">ir</button>`;
        else if (visible) action = `<button data-buy="${i}" ${S.perlas < z.cost ? 'disabled' : ''}>${fmt(z.cost)} perlas</button>`;
        const n = S.carps.filter((c) => MAP.zoneAt(c.x, c.y) === i).length;
        return `<div class="row ${visible ? '' : 'locked'}"><pre>${art}</pre>
          <div><div class="nm">${visible ? z.name : '???'}</div><div class="sub">${open ? n + ' carpas' : ''}</div></div>${action}</div>`;
      }).join('') + (() => { const n = ZONES.filter((z, i) => !(S.unlocked[i] || S.unlocked[i - 1])).length; return n ? `<div class="note">${n} zonas más por descubrir</div>` : ''; })() + SECRETS.map((s, k) => {
        const i = MAIN + k, found = isOpen(i), near = isOpen(MAP.Z[i].parent);
        if (!found && !near) return '';
        return `<div class="row ${found ? '' : 'locked'}"><pre>${found ? ZONE_ART[i] : '  ???  \n  ???  \n  ???  '}</pre>
          <div><div class="nm">${found ? s.name : 'secreto'}</div><div class="sub">${found ? 'encontrado' : `algo se esconde cerca de ${ZONES[MAP.Z[i].parent].name}`}</div></div>${found ? `<button data-go="${i}">ir</button>` : ''}</div>`;
      }).join('');
    } else if (kind === 'album') {
      const total = Object.keys(SPECIES).length, got = Object.keys(S.album).filter((id) => SPECIES[id]).length;
      html = `<div class="zone-title">álbum <span>${got}/${total}</span></div>` + ZONES.map((z, i) => {
        if (!S.unlocked[i] && !S.unlocked[i - 1]) return '';
        const gt = z.pool.filter((id) => S.album[id]).length;
        return `<div class="zone-title">${z.name} <span>${gt}/${z.pool.length}</span></div><div class="grid">` +
          z.pool.map((id) => (S.album[id] ? card(SPECIES[id], SPECIES[id].name, S.album[id] > 1 ? ' ×' + S.album[id] : '') : cardOff(SPECIES[id].r))).join('') + '</div>';
      }).join('');
      if (SECRETS.some((s, k) => isOpen(MAP.Z[MAIN + k].parent))) {
        html += `<div class="zone-title">secretos <span>${SECRETS.filter((s) => S.album[s.species]).length}/${SECRETS.length}</span></div><div class="grid">` +
          SECRETS.map((s) => (S.album[s.species] ? card(SPECIES[s.species], SPECIES[s.species].name) : cardOff(SPECIES[s.species].r))).join('') + '</div>';
      }
      if (S.lab.built) html += `<div class="zone-title">laboratorio <span>${RECIPES.filter((r) => S.album[r.sp]).length}/${RECIPES.length}</span></div><div class="grid">` +
        RECIPES.map((r) => (S.album[r.sp] ? card(SPECIES[r.sp], SPECIES[r.sp].name, S.album[r.sp] > 1 ? ' ×' + S.album[r.sp] : '') : cardOff(SPECIES[r.sp].r))).join('') + '</div>';
      const hy = Object.entries(S.hybrids);
      if (hy.length) html += `<div class="zone-title">crías <span>${hy.length}</span></div><div class="grid">` + hy.map(([n, h]) => card(h, n, h.n > 1 ? ' ×' + h.n : '')).join('') + '</div>';
    } else if (kind === 'gacha') {
      html = gachaHtml();
    } else if (kind === 'upgrades') {
      html = `<div class="zone-title">mejoras</div><div class="row"><pre class="lv">${S.lab.built ? ' ok ' : '    '}</pre>
          <div><div class="nm">Laboratorio</div><div class="sub">${S.lab.built ? '' : 'mezcla carpas'}</div></div>
          <button data-openlab ${!S.lab.built && S.perlas < LAB.cost ? 'disabled' : ''}>${S.lab.built ? 'abrir' : fmt(LAB.cost) + ' perlas'}</button></div>` + UPGRADES.map((u) => {
        const n = lvl(u.id), max = u.cost.length, next = n < max ? u.cost[n] : null;
        return `<div class="row"><pre class="lv">${dots(n, max)}</pre>
          <div><div class="nm">${u.name}</div><div class="sub">${next != null ? u.desc[n] : 'al máximo'}</div></div>
          ${next != null ? `<button data-up="${u.id}" ${S.perlas < next ? 'disabled' : ''}>${fmt(next)} perlas</button>` : ''}</div>`;
      }).join('');
    } else if (kind === 'quests') {
      ensureQuests();
      html = `<div class="zone-title">encargos de hoy <span>+${fmt(S.quests.reward)} perlas cada uno</span></div>` + S.quests.list.map((q, i) => {
        const def = QUESTS.find((x) => x.id === q.id), pct = q.p / q.n * 100;
        const btn = q.got ? '<span class="sub">cobrado</span>' : q.done ? `<button data-claim="${i}">cobrar</button>` : '';
        return `<div class="row"><pre class="lv">${q.done ? '  ok  ' : `${q.p}/${q.n}`}</pre>
          <div><div class="nm">${def.text}</div><div class="sub">${bar(pct)}</div></div>${btn}</div>`;
      }).join('');
    } else if (kind === 'lab') {
      html = labHtml();
    } else if (kind === 'labpick') {
      const other = labSlot === 'a' ? labB : labA;
      const list = S.carps.filter((o) => o !== other && canMix(o));
      html = `<div class="zone-title">probeta ${labSlot === 'a' ? 'A' : 'B'} <span>carpas adultas y descansadas</span></div>` + (list.length ? list.map((o) => {
        const s2 = spOf(o), k = S.carps.indexOf(o);
        return `<div class="row"><pre>${spriteHtml(s2)}</pre><div><div class="nm">${s2.name}</div><div class="sub" style="color:${RARITY[s2.r].c}">${RARITY[s2.r].n} · ${STAGE_NAMES[stageOf(o.xp)]}</div></div>
          <button data-pick="${k}">elegir</button></div>`;
      }).join('') : '<div class="note">no hay ninguna: tienen que crecer hasta adultas, y después de mezclar descansan 10 minutos</div>') + '<button class="back" data-labback>volver</button>';
    } else if (kind === 'carp') {
      const c = sheetCarp;
      if (!c || !S.carps.includes(c)) { hide(); return; }
      const sp = spOf(c), rar = RARITY[sp.r], st = stageOf(c.xp), zi = MAP.zoneAt(c.x, c.y);
      {
        const grow = st < STAGE_XP.length - 1
          ? `<span class="sub">· ${STAGE_XP[st + 1] - c.xp} bolitas para crecer</span>` : '<span class="sub">· tamaño máximo</span>';
        const last = S.carps.length <= 1, armed = releaseArm === c, v = releaseValue(c);
        const label = last ? 'es tu única carpa' : armed ? `seguro? soltar · +${fmt(v)} perlas` : `soltar al río · +${fmt(v)} perlas`;
        const rest = c.bt && c.bt > Date.now() ? Math.ceil((c.bt - Date.now()) / 60000) : 0;
        const breedBtn = st < 2 ? '<span class="sub">cuando sea adulta</span>' : rest ? `<span class="sub">descansando · ${rest} min</span>` : '<button data-tolab>llevar al laboratorio</button>';
        html = `<div class="carp">
          <div class="carp-head"><div class="spr">${spriteHtml(sp)}</div>
            <div><div class="nm">${sp.name}</div><div style="color:${rar.c}">${rar.n}${c.hy ? ' · cría' : ''}</div></div></div>
          <dl class="facts">
            <dt>tamaño</dt><dd>${STAGE_NAMES[st]} ${grow}</dd>
            <dt>barriga</dt><dd>${bar(c.hunger)}${c.hunger < 30 ? ' <span class="sub">· con hambre no da perlas</span>' : ''}</dd>
            <dt>perlas</dt><dd>${fmt(perlaValue(c))} cada ~${PERLA_EVERY} s</dd>
            ${S.lab.built ? `<dt>mezcla</dt><dd>${breedBtn}</dd>` : ''}
          </dl>
          <button class="release ${armed ? 'armed' : ''}" data-release ${last ? 'disabled' : ''}>${label}</button>
        </div>`;
      }
    }
    // el panel se refresca cada segundo: solo se repinta si cambia, para no perder un toque a medias
    if (openPanel && html !== lastHtml) body.innerHTML = lastHtml = html;
  }

  let sheetCarp = null, releaseArm = null, lastHtml = '', labA = null, labB = null, labSlot = 'a';
  // el panel del nenúfar toma el color de su zona (botones y títulos); los demás paneles, el de siempre
  const sheetEl = $('#sheet');
  function applyFrame() {
    if (openPanel === 'gacha') { sheetEl.classList.add('gacha'); sheetEl.style.setProperty('--a', GACCENT[ZINFO[gachaZone].id]); }
    else sheetEl.classList.remove('gacha');
  }
  function show(kind) {
    if (kind !== 'carp') releaseArm = null;
    lastHtml = '';
    renderPanel(kind); panel.hidden = false;
    applyFrame();
    clearInterval(tickTimer); tickTimer = setInterval(() => { if (['gacha', 'carp', 'quests', 'upgrades', 'lab'].includes(openPanel)) renderPanel(openPanel); }, 1000);
  }
  function hide() { panel.hidden = true; openPanel = null; releaseArm = null; lastHtml = ''; clearInterval(tickTimer); }

  $('#info').addEventListener('click', () => { if (selected) { sheetCarp = selected; releaseArm = null; show('carp'); } });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) hide(); });
  document.querySelectorAll('#nav button').forEach((b) => b.addEventListener('click', () => {
    SOUND.start();
    if (b.dataset.p === 'gacha') { const zc = MAP.zoneAt(cam.x, cam.y); openGacha(zc < MAIN && S.unlocked[zc] ? zc : 0); return; }     // el nenúfar de la zona que estás mirando
    show(b.dataset.p);
  }));
  $('#close').addEventListener('click', hide);
  panel.addEventListener('pointerdown', (e) => { if (e.target === panel) hide(); });

  function unlockZone(i) {
    const z = ZONES[i];
    if (S.perlas < z.cost || S.unlocked[i]) return;
    S.perlas -= z.cost; S.unlocked[i] = true;
    const sp = z.pool.find((id) => SPECIES[id].r === 0) || z.pool[0], [x, y] = randomWaterPoint(i);
    S.carps.push(initCarp({ sp, hunger: 70, xp: 0, x, y })); S.album[sp] = (S.album[sp] || 0) + 1;
    toast(`${z.name} desbloqueado`, z.water, 2800); refreshHud(); save();
    // saltan por los aires las barreras de todas las fronteras con zonas abiertas; la cámara va a verlo
    let main = null, best = 0;
    MAP.borders.forEach((pts, key) => {
      const a = Math.floor(key / NZ), b = key % NZ;
      if ((a !== i && b !== i) || a >= MAIN || b >= MAIN || !isOpen(a) || !isOpen(b)) return;
      breakT.set(key, t);
      barPieces(key).forEach((p, k) => { if (k % 4 === 0) ripple(p.x, p.y, k % 8 === 0); });
      if (pts.length > best) { best = pts.length; main = MAP.waypoint(a, b); }
    });
    SOUND.crack();
    camDirty = true; hide(); pendingFly = { at: t + 2.2, zi: i };
    if (main) flyTo(main.x, main.y, defaultZoom()); else { pendingFly = null; flyToZone(i); }
  }

  body.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.go != null) {
      flyToZone(+b.dataset.go); selected = null; refreshInfo(); hide();
    } else if (b.dataset.buy != null) {
      unlockZone(+b.dataset.buy);
    } else if (b.dataset.release != null) {
      const c = sheetCarp;
      if (!c || S.carps.length <= 1 || !S.carps.includes(c)) return;
      if (releaseArm !== c) { releaseArm = c; renderPanel('carp'); return; }      // primer toque: pide confirmación
      const v = releaseValue(c);
      S.carps.splice(S.carps.indexOf(c), 1); S.perlas += v;
      ripple(c.x, c.y, false); ripple(c.x, c.y, true);
      if (selected === c) selected = null;
      sheetCarp = null; hide();
      toast(`${spOf(c).name} vuelve al río · +${fmt(v)} perlas`, RARITY[spOf(c).r].c, 2600);
      refreshHud(); refreshInfo(); save();
    } else if (b.dataset.det != null) {
      gachaDet = !gachaDet; renderPanel('gacha');
    } else if (b.dataset.pull != null) {
      startPull(gachaZone, +b.dataset.pull, null);
    } else if (b.dataset.free != null) {
      startPull(gachaZone, 1, 'free');
    } else if (b.dataset.ficha != null) {
      startPull(gachaZone, 1, 'ficha');
    } else if (b.dataset.up != null) {
      const u = UPGRADES.find((x) => x.id === b.dataset.up), n = lvl(u.id);
      if (n < u.cost.length && S.perlas >= u.cost[n]) {
        S.perlas -= u.cost[n]; S.up[u.id] = n + 1;
        toast(`${u.name} · nivel ${n + 1}`, '#9be7a0', 2000); SOUND.coins(3);
        refreshHud(); save(); renderPanel('upgrades');
      }
    } else if (b.dataset.claim != null) {
      const q = S.quests.list[+b.dataset.claim];
      if (q && q.done && !q.got) { q.got = true; S.perlas += S.quests.reward; toast(`+${fmt(S.quests.reward)} perlas`, '#9be7a0', 1500); SOUND.coins(5); refreshHud(); save(); renderPanel('quests'); }
    } else if (b.dataset.tolab != null) {
      if (sheetCarp && labB !== sheetCarp) labA = sheetCarp;
      show('lab');
    } else if (b.dataset.openlab != null) {
      show('lab');
    } else if (b.dataset.build != null) {
      if (S.lab.built || S.perlas < LAB.cost) return;
      S.perlas -= LAB.cost; S.lab.built = true;
      const L = LAB_AT(); for (let k = 0; k < 4; k++) ripple(L.x + rnd(-8, 8), L.y + rnd(-8, 8), k % 2 === 0);
      toast('laboratorio construido', '#7bffcf', 2600); SOUND.crack(); refreshHud(); save(); show('lab');
    } else if (b.dataset.slot != null) {
      labSlot = b.dataset.slot; show('labpick');
    } else if (b.dataset.pick != null) {
      const o = S.carps[+b.dataset.pick];
      if (o) { if (labSlot === 'a') labA = o; else labB = o; }
      show('lab');
    } else if (b.dataset.labback != null) {
      show('lab');
    } else if (b.dataset.mix != null) {
      if (labA && labB) { labMix(labA, labB); show('lab'); }
    }
  });

  // ───────────────────────── arranque ─────────────────────────
  window.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  window.addEventListener('pagehide', save);
  setInterval(save, 10000);

  ensureQuests();
  resize(); refreshHud(); refreshInfo();
  if (S.gacha.out.length) flushOut();
  if (AWAY > 0) gainFichas(AWAY);
  dailyFichas();
  if (DEMO !== null) { document.title = 'Estanque · muestra'; toast('partida de muestra · no se guarda', '#ffb703', 4000); }
  if (offline > 0 && AWAY > 60) { toast(`mientras no estabas · +${fmt(offline)} perlas`, '#fff1a8', 4000); save(); }

  // Fotogramas por segundo de la escena. El tamaño de la ventana se comprueba en cada fotograma y,
  // si ha cambiado, se rehace la rejilla y se pinta en ese mismo fotograma: así no parpadea.
  // Si el dispositivo va justo, la rejilla se hace un poco más gruesa sola.
  const FRAME = 1 / (glr ? 60 : 20);
  let last = performance.now(), acc = 0, ema = 10, slow = 0, needResize = false;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt;
    if (needResize || window.innerWidth !== W || window.innerHeight !== H || Math.min(window.devicePixelRatio || 1, 2) !== dpr) {
      needResize = false; resize(); acc = FRAME;
    }
    update(dt);
    if (acc >= FRAME * 0.9) {
      acc = 0;
      const t0 = performance.now();
      render();
      ema = ema * 0.9 + (performance.now() - t0) * 0.1;
      if (ema > (glr ? 24 : 38)) { if (++slow > 40 && quality < 1.8) { quality *= 1.15; slow = 0; ema = 10; needResize = true; } } else slow = 0;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

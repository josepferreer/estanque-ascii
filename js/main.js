/* Estanque ASCII — motor del juego. Sin dependencias, sin build.
 *
 * El mundo es un único cuerpo de agua: cada zona es un estanque en su casilla del mapa y
 * los estanques vecinos se comunican por canales. Las carpas nadan libres de uno a otro.
 * Una cámara (arrastrar, rueda / pellizco / botones para el zoom) muestra la parte que cabe
 * en pantalla: en ordenador se ve más mapa que en móvil. Al empezar solo existe el estanque
 * básico; cada zona desbloqueada (y su canal) amplía el mapa.
 *
 * La escena se pinta de verdad (agua, carpas con cuerpo y aletas, decorado) en un lienzo
 * con un píxel por celda. Después cada píxel se convierte en UNA celda de texto: el brillo
 * elige la letra, el color del píxel colorea letra y fondo, y se añade resplandor.
 */
(() => {
  const { RARITY, SPECIES, ZONES } = DATA;

  // ───────────────────────── constantes ─────────────────────────
  const MAX_CELLS = 26000;               // tope de celdas (limita el coste por fotograma)
  const MIN_CELL = 5;                    // tamaño mínimo de celda en píxeles CSS
  const CAP = 6;                         // carpas que caben por cada zona abierta (el cupo es global)
  const FOOD_MAX = 12, FOOD_EVERY = 5;   // comida: máximo y segundos por unidad
  const HUNGER_RATE = 100 / 360;         // de 100 a 0 en 6 min
  const FEED = 30;                       // hambre que quita una bolita
  const DETECT = 50;                     // a qué distancia huele la comida una carpa
  const STAGE_XP = [0, 3, 8, 16, 30];    // bolitas comidas para cada tamaño
  const EGG_TIME = (z) => 20 * (z + 1);  // segundos de incubación
  const SAVE_KEY = 'estanque-ascii-v3';
  const LEN = [7, 9, 11, 14, 17];        // largo de la carpa en unidades de mundo
  const M = 8;                           // puntos de la columna de cada carpa

  // mapa: cada zona ocupa una casilla de TW×TH unidades; GRID[fila][columna] = índice de zona.
  // Las zonas forman una cadena 0→1→2→3→4→5 y cada par consecutivo lo une un canal.
  const TW = 92, TH = 100;
  const GRID = [[0, 1, 2], [5, 4, 3]];
  const RX = 29.5, RY = 31.5;            // radios del estanque dentro de su casilla
  const VW = 64, VH = 68;                // tamaño de referencia del estanque (para el decorado)
  const CH_HW = 6, CH_AMP = 1.4;         // medio ancho y vaivén de los canales
  const MARGIN = 26;                     // lo que se ve de niebla más allá del mapa descubierto
  const ZOOM_MAX = 26;                   // píxeles CSS por unidad de mundo

  const ZPOS = [];
  GRID.forEach((row, r) => row.forEach((zi, c) => { ZPOS[zi] = [c, r]; }));
  const zoneCenter = (zi) => [ZPOS[zi][0] * TW, ZPOS[zi][1] * TH];
  const zoneAtTile = (c, r) => (GRID[r] && GRID[r][c] !== undefined ? GRID[r][c] : -1);
  const zoneAt = (wx, wy) => zoneAtTile(Math.round(wx / TW), Math.round(wy / TH));

  const CHANNELS = [];
  for (let k = 0; k < ZONES.length - 1; k++) {
    const A = zoneCenter(k), B = zoneCenter(k + 1), horiz = A[1] === B[1];
    const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
    // tb = hasta dónde llega el agua del canal mientras la zona siguiente está bloqueada
    // (donde se levanta la barricada); dir = sentido del canal
    CHANNELS.push({ k, A, B, horiz, tb: ((horiz ? RX : RY) + 9) / len, dir: [Math.sign(B[0] - A[0]), Math.sign(B[1] - A[1])] });
  }
  // distancia de un punto al eje del canal (99 si queda fuera de su tramo) y posición 0..1 a lo largo
  function chanD(ch, wx, wy) {
    const { A, B } = ch;
    if (ch.horiz) {
      const t = (wx - A[0]) / (B[0] - A[0]); if (t < 0 || t > 1) return 99;
      return Math.abs(wy - (A[1] + Math.sin((wx - A[0]) * 0.11 + ch.k) * CH_AMP));
    }
    const t = (wy - A[1]) / (B[1] - A[1]); if (t < 0 || t > 1) return 99;
    return Math.abs(wx - (A[0] + Math.sin((wy - A[1]) * 0.11 + ch.k) * CH_AMP));
  }
  const chanT = (ch, wx, wy) => (ch.horiz ? (wx - ch.A[0]) / (ch.B[0] - ch.A[0]) : (wy - ch.A[1]) / (ch.B[1] - ch.A[1]));

  // sprite de texto: solo para el álbum
  const TAILS = [['~', '-'], ['><', '<>'], ['><', '<>'], ['><', '<>'], ['><', '<>']];
  const REST = ['º>', 'º>', '(º>', '((º>', '(((º>'];
  const baseSprite = (stage, frame) => TAILS[stage][frame % 2] + REST[stage];

  // ───────────────────────── utilidades ─────────────────────────
  const $ = (s) => document.querySelector(s);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  const stageOf = (xp) => { let s = 0; STAGE_XP.forEach((t, i) => { if (xp >= t) s = i; }); return s; };
  const fmt = (n) => (n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(Math.floor(n)));
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const smooth = (v) => { v = clamp(v, 0, 1); return v * v * (3 - 2 * v); };
  const lenOf = (stage) => LEN[stage];

  // distancia normalizada al centro del estanque (1 = orilla), con la orilla irregular
  // y distinta en cada zona. Coordenadas locales: (0,0) es el centro del estanque.
  function pondR(x, y, zi) {
    const nx = x / RX, ny = y / RY;
    const th = Math.atan2(ny, nx);
    return Math.hypot(nx, ny) / (1 + 0.05 * Math.sin(3 * th + 1 + zi * 1.7) + 0.035 * Math.sin(5 * th + 2 + zi * 0.9));
  }
  const inWater = (x, y, lim, zi) => pondR(x, y, zi) < lim;       // local a una zona
  function edgePoint(a, lim, zi) {
    const dx = Math.cos(a), dy = Math.sin(a);
    for (let d = 0; d < 60; d += 0.5) if (pondR(dx * d, dy * d, zi) >= lim) return [dx * d, dy * d];
    return [0, 0];
  }

  // ───────────────────────── estado y guardado ─────────────────────────
  // Carpas, perlas y bolitas viven en coordenadas de MUNDO.
  const zoneUnlockedCount = (s) => s.unlocked.filter(Boolean).length;
  const capacity = () => CAP * zoneUnlockedCount(S);

  function fresh() {
    const [cx, cy] = zoneCenter(0);
    return {
      perlas: 40, food: FOOD_MAX, foodT: 0,
      unlocked: ZONES.map((_, i) => i === 0),
      carps: [{ sp: 'gris', hunger: 80, xp: 0, x: cx, y: cy }],
      floating: [],                                  // perlas flotando por recoger
      album: { gris: 1 }, eggs: [], seen: Date.now(), cam: null,
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !Array.isArray(s.carps) || !Array.isArray(s.unlocked) || s.unlocked.length !== ZONES.length) return null;
      return s;
    } catch { return null; }
  }

  function save() {
    S.seen = Date.now(); S.cam = { x: +cam.x.toFixed(1), y: +cam.y.toFixed(1), z: +cam.z.toFixed(2) };
    try {
      const out = { ...S,
        carps: S.carps.map((c) => ({ sp: c.sp, hunger: c.hunger, xp: c.xp, x: c.x, y: c.y, pt: c.pt })),
        floating: S.floating.map((p) => ({ x: p.x, y: p.y, v: p.v })) };
      localStorage.setItem(SAVE_KEY, JSON.stringify(out));
    } catch { /* sin almacenamiento: se juega igual */ }
  }

  let S = load() || fresh();
  if (!Array.isArray(S.floating)) S.floating = [];

  // el tiempo que no estuviste: el hambre baja a medio ritmo y nunca por debajo de 15
  (() => {
    const away = clamp((Date.now() - (S.seen || Date.now())) / 1000, 0, 4 * 3600);
    S.carps.forEach((c) => { c.hunger = Math.max(Math.min(c.hunger, 15), c.hunger - away * HUNGER_RATE * 0.5); });
    S.food = Math.min(FOOD_MAX, S.food + Math.floor(away / FOOD_EVERY));
  })();

  // ───────────────────────── agua del mundo ─────────────────────────
  // ¿hay agua navegable en este punto del mundo? (solo cuentan zonas y canales abiertos)
  function waterAt(wx, wy, lim) {
    const tc = Math.round(wx / TW), tr = Math.round(wy / TH), zi = zoneAtTile(tc, tr);
    if (zi >= 0 && S.unlocked[zi] && pondR(wx - tc * TW, wy - tr * TH, zi) < lim) return true;
    for (const ch of CHANNELS) {
      if (!S.unlocked[ch.k] || chanD(ch, wx, wy) >= CH_HW * lim) continue;
      // con la zona siguiente bloqueada solo se nada hasta justo antes de la barricada
      if (S.unlocked[ch.k + 1] || chanT(ch, wx, wy) <= ch.tb - 0.08) return true;
    }
    return false;
  }
  // punto de agua al azar dentro del estanque de una zona (coordenadas de mundo)
  function randomWaterPoint(zi) {
    const [ox, oy] = zoneCenter(zi);
    for (let i = 0; i < 80; i++) {
      const x = rnd(-VW / 2 + 6, VW / 2 - 6), y = rnd(-VH / 2 + 6, VH / 2 - 6);
      if (inWater(x, y, 0.78, zi)) return [ox + x, oy + y];
    }
    return [ox, oy];
  }
  const zoneOf = (x, y) => { const z = zoneAt(x, y); return z >= 0 && S.unlocked[z] ? z : 0; };

  // ruta entre estanques: la cadena de zonas pasando por el canal que une cada par
  function routeTo(fromZ, toZ) {
    const pts = [];
    if (fromZ === toZ) return pts;
    const dir = toZ > fromZ ? 1 : -1;
    for (let u = fromZ; u !== toZ; u += dir) {
      const v = u + dir, [ux, uy] = zoneCenter(u), [vx, vy] = zoneCenter(v);
      const dx = Math.sign(vx - ux), dy = Math.sign(vy - uy), e = (dx ? RX : RY) * 0.88;
      pts.push({ x: ux + dx * e, y: uy + dy * e }, { x: vx - dx * e, y: vy - dy * e });
    }
    return pts;
  }

  // ───────────────────────── carpas ─────────────────────────
  function resetSpine(c) {
    const sl = lenOf(stageOf(c.xp)) / (M - 1);
    c.spine = [];
    for (let i = 0; i < M; i++) c.spine.push({ x: c.x - Math.cos(c.ang) * sl * i, y: c.y - Math.sin(c.ang) * sl * i });
  }

  function initCarp(c) {
    if (c.x == null || !waterAt(c.x, c.y, 0.85)) [c.x, c.y] = randomWaterPoint(0);
    c.ang = Math.random() * Math.PI * 2;
    c.tx = c.x; c.ty = c.y; c.retarget = 0; c.speed = 0; c.route = []; c.chaseP = null;
    c.phase = Math.random() * 6;
    if (c.pt == null) c.pt = rnd(6, 14);
    resetSpine(c);
    return c;
  }
  S.carps.forEach(initCarp);
  S.floating.forEach((p) => { if (!waterAt(p.x, p.y, 0.85)) [p.x, p.y] = randomWaterPoint(0); });

  const perlaValue = (c) => Math.max(1, RARITY[SPECIES[c.sp].r].mult * (stageOf(c.xp) + 1));

  // ───────────────────────── mundo ─────────────────────────
  let t = 0;                 // segundos de juego
  let pellets = [];          // comida flotando
  let ripples = [];          // ondas
  let selected = null;       // carpa elegida
  let foamTimer = 0;

  function ripple(x, y, small) { ripples.push({ x, y, born: t, max: small ? 1 : 2, speed: small ? 6 : 10 }); }
  const status = (zi) => (S.unlocked[zi] ? 2 : zi > 0 && S.unlocked[zi - 1] ? 1 : 0);   // 2 abierta · 1 siguiente · 0 niebla

  // ───────────────────────── cámara ─────────────────────────
  const cam = { x: 0, y: 0, z: 8 };            // z = píxeles CSS por unidad de mundo
  let fly = null, camDirty = true, pendingFly = null;
  let W = 1, H = 1, cellCss = 8, GW = 1, GH = 1;
  const U = () => cam.z / cellCss;             // celdas por unidad

  function bounds() {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    S.unlocked.forEach((on, zi) => {
      if (!on) return;
      const [cx, cy] = zoneCenter(zi);
      x0 = Math.min(x0, cx - TW / 2); x1 = Math.max(x1, cx + TW / 2); y0 = Math.min(y0, cy - TH / 2); y1 = Math.max(y1, cy + TH / 2);
    });
    return { x0, y0, x1, y1 };
  }
  // lo más lejos que se puede alejar: hasta ver todo el mapa descubierto
  function zoomMin() {
    const b = bounds();
    return Math.max(1.8, Math.min(W / (b.x1 - b.x0 + 2 * MARGIN), H / (b.y1 - b.y0 + 2 * MARGIN)));
  }
  const defaultZoom = () => clamp(W / 70, 4.5, 8);

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
  function flyTo(x, y, z) { fly = { x, y, z: z || cam.z }; }
  function flyToZone(zi) { const [x, y] = zoneCenter(zi); flyTo(x, y, defaultZoom()); }

  // ───────────────────────── lienzo de origen (1 píxel = 1 celda) ─────────────────────────
  const src = document.createElement('canvas');
  const g = src.getContext('2d', { willReadFrequently: true });
  let img = null, sinX = null, sinY = null;
  // datos por celda: dependen solo de la cámara, así que se recalculan cuando se mueve
  let zIdx, rArr, hArr, h2Arr, exArr, eyArr, nzx, nzy, chK, chRArr, chTArr;

  const ZC = ZONES.map((z) => {
    const w = hex(z.water), dark = z.id === 'cueva' ? 0.7 : z.id === 'luna' ? 0.8 : 1;
    return { deep: w.map((v) => v * 0.38 * dark), light: w.map((v) => v * 0.95 * dark), shore: hex(z.shore), grass: hex(z.grass) };
  });
  const tmpDeep = [0, 0, 0], tmpLight = [0, 0, 0];

  function buildCells() {
    const u = U();
    for (let y = 0; y < GH; y++) {
      const wy = cam.y + (y + 0.5 - GH / 2) / u, tr = Math.round(wy / TH);
      for (let x = 0; x < GW; x++) {
        const n = y * GW + x, wx = cam.x + (x + 0.5 - GW / 2) / u, tc = Math.round(wx / TW), zi = zoneAtTile(tc, tr);
        zIdx[n] = zi; chK[n] = -1;
        hArr[n] = hash(Math.floor(wx), Math.floor(wy)); h2Arr[n] = hash(Math.floor(wx * 0.5), Math.floor(wy * 0.5));
        if (zi < 0) { rArr[n] = 9; continue; }
        const lx = wx - tc * TW, ly = wy - tr * TH;
        exArr[n] = TW / 2 - Math.abs(lx); eyArr[n] = TH / 2 - Math.abs(ly);
        nzx[n] = zoneAtTile(tc + (lx >= 0 ? 1 : -1), tr); nzy[n] = zoneAtTile(tc, tr + (ly >= 0 ? 1 : -1));
        rArr[n] = Math.abs(lx) > RX * 1.3 || Math.abs(ly) > RY * 1.3 ? 2 : pondR(lx, ly, zi);
        // canales: se guarda en la misma escala que el estanque (<0.93 agua, hasta 1.0 orilla)
        let best = 99, bk = -1;
        for (const ch of CHANNELS) { const d = chanD(ch, wx, wy); if (d < best) { best = d; bk = ch.k; } }
        if (bk >= 0 && best < CH_HW + 1.9) {
          chK[n] = bk;
          chRArr[n] = best < CH_HW ? 0.93 * best / CH_HW : 0.93 + (best - CH_HW) * 0.07 / 1.8;
          chTArr[n] = clamp(chanT(CHANNELS[bk], wx, wy), 0, 1);
        }
      }
    }
    camDirty = false;
  }

  // agua con cáusticas, orilla y terreno; lo que no está abierto queda en niebla
  function paintGround() {
    if (camDirty) buildCells();
    const d = img.data, u = U(), st = ZONES.map((_, i) => status(i));
    // canal: 2 abierto del todo · 3 solo el tramo hasta la barricada (zona siguiente bloqueada) · 0 no existe
    const chSt = CHANNELS.map((ch) => (st[ch.k] !== 2 ? 0 : S.unlocked[ch.k + 1] ? 2 : 3));
    for (let x = 0; x < GW; x++) sinX[x] = Math.sin((cam.x + (x + 0.5 - GW / 2) / u) * 0.23 - t * 0.28);
    for (let y = 0; y < GH; y++) sinY[y] = Math.sin((cam.y + (y + 0.5 - GH / 2) / u) * 0.27 + t * 0.35);
    for (let y = 0; y < GH; y++) {
      const yv = cam.y + (y + 0.5 - GH / 2) / u, ay = sinY[y] * 2.1;
      for (let x = 0; x < GW; x++) {
        const n = y * GW + x, i = n * 4, h = hArr[n], zi = zIdx[n];
        let R, G, B, s2 = 0, r = 9, inCh = false;
        if (zi >= 0) {
          const k = chK[n], rp = rArr[n];
          let cs = k >= 0 ? chSt[k] : 0;
          if (cs === 3) cs = chTArr[n] <= CHANNELS[k].tb ? 2 : 0;
          const rc = cs > 0 ? chRArr[n] : 9;
          inCh = rc < rp; r = inCh ? rc : rp; s2 = inCh ? cs : st[zi];
        }
        if (s2 === 0) {                                      // niebla
          const v = 5 + 5 * h; R = v; G = v + 3; B = v + 7;
        } else {
          const z = ZC[zi], xv = cam.x + (x + 0.5 - GW / 2) / u;
          if (r < 0.93) {
            let deep = z.deep, light = z.light;
            if (inCh) {                                      // el agua del canal mezcla los colores de sus dos estanques
              const za = ZC[chK[n]], zb = ZC[chK[n] + 1], tt = chTArr[n];
              for (let c = 0; c < 3; c++) { tmpDeep[c] = za.deep[c] + (zb.deep[c] - za.deep[c]) * tt; tmpLight[c] = za.light[c] + (zb.light[c] - za.light[c]) * tt; }
              deep = tmpDeep; light = tmpLight;
            }
            const s = smooth((r - 0.3) / 0.62);
            R = deep[0] + (light[0] - deep[0]) * s; G = deep[1] + (light[1] - deep[1]) * s; B = deep[2] + (light[2] - deep[2]) * s;
            if (s2 === 2) {
              const c1 = Math.sin(xv * 0.42 + t * 0.8 + ay) * Math.sin(yv * 0.38 - t * 0.65 + sinX[x] * 2.1);
              const k = c1 > 0 ? c1 * c1 * 0.7 : 0;
              R = R * (1 + k) + k * 28; G = G * (1 + k) + k * 34; B = B * (1 + k) + k * 40;
            }
          } else if (r < 1.0) {
            const foam = 0.25 + 0.2 * Math.sin(t * 1.6 + xv * 0.7 + yv * 0.5), m = 0.75 + 0.5 * h, f = 255 * foam * 0.3;
            R = z.shore[0] * m + f; G = z.shore[1] * m + f; B = z.shore[2] * m + f;
          } else {
            const rock = h2Arr[n] > 0.82, m = (rock ? 0.55 : 0.28) + 0.35 * h, base = rock ? z.shore : z.grass;
            R = base[0] * m; G = base[1] * m; B = base[2] * m;
          }
          if (s2 === 1) { R *= 0.2; G *= 0.2; B *= 0.2; }   // la siguiente zona se intuye en la oscuridad
          // el borde del mapa descubierto se funde con la niebla
          const ox = nzx[n], oy = nzy[n];
          const fx = ox >= 0 && S.unlocked[ox] ? 1 : smooth(exArr[n] / 12), fy = oy >= 0 && S.unlocked[oy] ? 1 : smooth(eyArr[n] / 12);
          const k = 0.08 + 0.92 * Math.min(fx, fy);
          R = R * k + 6 * (1 - k); G = G * k + 9 * (1 - k); B = B * k + 13 * (1 - k);
        }
        d[i] = R; d[i + 1] = G; d[i + 2] = B; d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }

  // ───────────────────────── decorado (coordenadas locales de la zona) ─────────────────────────
  function makePads(n, seed, zi) {
    const out = []; let k = 0;
    while (out.length < n && k < 900) {
      const x = (hash(k, seed) - 0.5) * (VW - 12), y = (hash(seed, k + 5) - 0.5) * (VH - 12);
      if (inWater(x, y, 0.72, zi)) out.push({ x, y, r: 2.4 + hash(k, 3) * 1.6, f: hash(k, k) > 0.6, p: hash(k, 1) * 6 });
      k++;
    }
    return out;
  }
  const padCache = {};
  const padsOf = (zi) => padCache[zi] || (padCache[zi] = makePads(ZONES[zi].id === 'nenufares' ? 18 : 7, zi * 3 + 1, zi));

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

  function glow(x, y, r, color, a) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, color.replace('A', a)); gr.addColorStop(1, color.replace('A', 0));
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }

  function fireflies(n, rgb) {
    for (let i = 0; i < n; i++) {
      const x = Math.sin(t * 0.3 + i * 2.1) * (RX - 8) * Math.cos(i), y = Math.cos(t * 0.25 + i * 1.3) * (RY - 8) * Math.sin(i + 1);
      glow(x, y, 4, `rgba(${rgb},A)`, 0.25 + 0.5 * Math.abs(Math.sin(t * 1.5 + i)));
    }
  }

  function vignette(strength) {
    const gr = g.createRadialGradient(0, 0, Math.min(VW, VH) * 0.22, 0, 0, Math.max(VW, VH) * 0.66);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${strength})`);
    g.fillStyle = gr; g.fillRect(-TW / 2, -TH / 2, TW, TH);
  }

  const DECOR = {
    estanque(zi) {
      const n = Math.round((VW + VH) / 8);
      for (let i = 0; i < n; i++) {
        const [x, y] = edgePoint(i * 2.399, 0.97, zi), sw = Math.sin(t * 1.5 + i) * 1.1;
        g.strokeStyle = '#7ab955'; g.lineWidth = 0.9;
        for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(x + k, y); g.quadraticCurveTo(x + k, y - 3, x + k + sw, y - 6 - Math.abs(k)); g.stroke(); }
      }
      drawPads(padsOf(zi));
    },
    nenufares(zi) { drawPads(padsOf(zi)); fireflies(7, '255,230,109'); },
    cascada(zi) {
      const top = -RY * 0.93, end = top + 17;
      g.fillStyle = '#5d6772';
      for (let x = -13; x <= 13; x += 2.2) { g.beginPath(); g.arc(x, top + hash(x, 1) * 3, 3.4, 0, 7); g.fill(); }
      g.fillStyle = '#7a8591';
      for (let x = -11; x <= 11; x += 3.1) { g.beginPath(); g.arc(x, top - 1 + hash(x, 2) * 2, 2.2, 0, 7); g.fill(); }
      g.lineWidth = 1.15; g.setLineDash([3.2, 2]);
      for (let x = -5; x <= 5; x += 1.1) {
        g.lineDashOffset = -t * (16 + hash(x, 5) * 6);
        g.strokeStyle = `rgba(215,242,255,${0.55 + 0.35 * hash(x, 9)})`;
        g.beginPath(); g.moveTo(x, top + 1); g.lineTo(x + Math.sin(t + x) * 0.3, end); g.stroke();
      }
      g.setLineDash([]);
      for (let x = -6; x <= 6; x += 1.3) { g.fillStyle = `rgba(255,255,255,${0.5 + 0.4 * Math.sin(t * 6 + x)})`; g.beginPath(); g.arc(x, end + 0.5, 0.9 + 0.5 * Math.abs(Math.sin(t * 5 + x)), 0, 7); g.fill(); }
      foamTimer -= 1 / 30;
      if (foamTimer <= 0) { const [ox, oy] = zoneCenter(zi); ripple(ox, oy + end + 1, false); foamTimer = 0.9; }
    },
    cueva(zi) {
      const n = Math.max(5, Math.round(VW / 9));
      for (let i = 0; i < n; i++) {
        const x = (i + 0.5) * VW / n - VW / 2;
        let y0 = -VH / 2; while (y0 < VH / 2 && pondR(x, y0, zi) > 0.9) y0++;
        const len = 3 + hash(i, 7) * 5;
        g.fillStyle = '#6b5f86';
        g.beginPath(); g.moveTo(x - 1.6, y0 - 2); g.lineTo(x + 1.6, y0 - 2); g.lineTo(x, y0 + len); g.closePath(); g.fill();
      }
      [[0.15, 0.6], [0.86, 0.5], [0.25, 0.2], [0.76, 0.82], [0.38, 0.9], [0.72, 0.16], [0.5, 0.5], [0.1, 0.85]].forEach(([fx, fy], i) => {
        const x = (fx - 0.5) * VW, y = (fy - 0.5) * VH, a = 0.55 + 0.45 * Math.sin(t * 1.4 + i * 1.7);
        glow(x, y, 9, 'rgba(123,255,207,A)', 0.4 * a);
        g.fillStyle = '#3d8f78'; g.fillRect(x - 0.4, y, 0.8, 2.6);
        g.fillStyle = `rgba(160,255,225,${0.7 + 0.3 * a})`; g.beginPath(); g.ellipse(x, y, 2, 1.2, 0, Math.PI, 0); g.fill();
      });
      vignette(0.6);
    },
    luna() {
      const R = 10, my = -RY * 0.3;
      glow(0, my, R * 2.6, 'rgba(255,243,176,A)', 0.2);
      for (let k = -R; k <= R; k++) {
        const w = Math.sqrt(R * R - k * k), off = Math.sin(t * 2 + k * 0.8) * 0.9;
        g.fillStyle = `rgba(255,243,176,${0.9 - Math.abs(k) / R * 0.25})`;
        g.fillRect(-w + off, my + k, w * 2, 1);
      }
      for (let k = 0; k < R + 1; k++) {
        const w = R + 1 - k;
        for (let dx = -w; dx <= w; dx += 2) if (hash(dx, k + Math.floor(t * 2)) > 0.5) { g.fillStyle = 'rgba(255,243,176,0.45)'; g.fillRect(dx, my + R + 2 + k * 1.2, 1.6, 0.8); }
      }
      for (let i = 0; i < 16; i++) { g.fillStyle = `rgba(255,255,255,${0.15 + 0.6 * Math.abs(Math.sin(t * 1.2 + i * 2.3))})`; g.fillRect((hash(i, 2) - 0.5) * VW, (hash(i, 8) - 0.5) * VH, 1, 1); }
      fireflies(5, '184,192,255');
      vignette(0.5);
    },
    templo() {
      const dx = 17, dy = 14, Rr = 14;
      glow(0, 0, Rr * 1.6, 'rgba(46,196,182,A)', 0.14 + 0.08 * Math.sin(t * 1.6));
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => {
        const x = sx * dx, y = sy * dy - 6;
        g.fillStyle = 'rgba(205,187,132,0.55)';
        g.fillRect(x - 2.2, y - 1, 4.4, 1.4); g.fillRect(x - 1.5, y, 3, 12); g.fillRect(x - 2.2, y + 12, 4.4, 1.4);
        g.fillStyle = 'rgba(255,240,180,0.25)'; g.fillRect(x - 0.6, y, 0.8, 12);
      });
      for (let i = 0; i < 8; i++) {
        const a = t * 0.5 + i * Math.PI / 4;
        glow(Math.cos(a) * Rr, Math.sin(a) * Rr, 4, 'rgba(46,196,182,A)', 0.4 + 0.5 * Math.abs(Math.sin(t * 1.3 + i)));
      }
      g.strokeStyle = `rgba(123,220,181,${0.3 + 0.3 * Math.sin(t * 2)})`; g.lineWidth = 0.8;
      g.beginPath(); g.arc(0, 0, Rr, 0, 7); g.stroke();
      vignette(0.4);
    },
  };

  // corriente de los canales (rayitas que avanzan) y puentes (se pintan encima de las carpas)
  function chanPoint(ch, tt, off) {
    const [ax, ay] = ch.A, [bx, by] = ch.B;
    if (ch.horiz) { const x = ax + (bx - ax) * tt; return [x, ay + Math.sin((x - ax) * 0.11 + ch.k) * CH_AMP + off]; }
    const y = ay + (by - ay) * tt; return [ax + Math.sin((y - ay) * 0.11 + ch.k) * CH_AMP + off, y];
  }
  const chanOpen = (ch) => S.unlocked[ch.k] && S.unlocked[ch.k + 1];

  function drawChannels() {
    CHANNELS.forEach((ch) => {
      if (!chanOpen(ch)) return;
      const n = Math.round(Math.hypot(ch.B[0] - ch.A[0], ch.B[1] - ch.A[1]) / 3);
      g.lineWidth = 0.55; g.setLineDash([2.2, 4.5]);
      [-2.8, 0, 2.8].forEach((off, j) => {
        g.lineDashOffset = -t * (5 + j); g.strokeStyle = `rgba(225,243,255,${0.3 - j * 0.04})`;
        g.beginPath();
        for (let i = 0; i <= n; i++) { const [x, y] = chanPoint(ch, i / n, off); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
        g.stroke();
      });
      g.setLineDash([]);
    });
  }

  function drawBridges() {
    CHANNELS.forEach((ch) => {
      if (!chanOpen(ch)) return;
      const [mx, my] = chanPoint(ch, 0.5, 0), L = CH_HW * 2 + 6, w = 7;
      const [bw, bh] = ch.horiz ? [w, L] : [L, w], x0 = mx - bw / 2, y0 = my - bh / 2;
      g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x0 + 1.2, y0 + 1.6, bw, bh);
      g.fillStyle = '#8a6a43'; g.fillRect(x0, y0, bw, bh);
      g.fillStyle = '#5b4429';
      if (ch.horiz) {
        for (let y = y0 + 1.4; y < y0 + bh; y += 1.5) g.fillRect(x0, y, bw, 0.35);
        g.fillRect(x0, y0, 0.9, bh); g.fillRect(x0 + bw - 0.9, y0, 0.9, bh);
      } else {
        for (let x = x0 + 1.4; x < x0 + bw; x += 1.5) g.fillRect(x, y0, 0.35, bh);
        g.fillRect(x0, y0, bw, 0.9); g.fillRect(x0, y0 + bh - 0.9, bw, 0.9);
      }
    });
  }

  // barricada de troncos y rocas que cierra el canal mientras la zona siguiente está bloqueada.
  // Cada pieza se coloca en ejes del canal: a = a lo largo de la corriente, b = a lo ancho.
  const BREAK_TIME = 1.7;
  const breakT = {};                 // canal → instante en que empezó a romperse
  const pieceCache = {};
  function barrierPieces(k) {
    if (pieceCache[k]) return pieceCache[k];
    const out = [], h = (i, j) => hash(k * 7.3 + i, j + 2.1);
    for (let row = 0; row < 3; row++) for (let j = 0; j < 2; j++) {          // troncos cruzados al canal
      const i = row * 2 + j;
      out.push({ kind: 'log', a: (row - 1) * 2.3 + (h(i, 1) - 0.5) * 0.6, b: (j ? 1 : -1) * (CH_HW * 0.52) + (h(i, 2) - 0.5) * 1.2,
        w: CH_HW * 1.15 + h(i, 3) * 1.4, th: 2 + h(i, 4) * 0.6, jit: (h(i, 5) - 0.5) * 0.28, tone: h(i, 6) });
    }
    for (let i = 0; i < 9; i++) {                                              // rocas, más hacia las orillas
      const side = i % 2 ? 1 : -1, edge = i < 6;
      out.push({ kind: 'rock', a: (h(i + 20, 1) - 0.5) * 6, b: side * (edge ? CH_HW + 0.4 + h(i, 8) * 2 : h(i, 9) * CH_HW * 0.7),
        r: 1.5 + h(i + 20, 2) * 1.4, tone: h(i + 20, 3) });
    }
    for (let i = 0; i < 3; i++) out.push({ kind: 'stake', a: 3.4, b: (i - 1) * CH_HW * 0.75, w: 0.9, th: 3.6, jit: 0, tone: h(i + 40, 1) });
    return (pieceCache[k] = out);
  }

  function drawBarrier(ch, prog) {
    const [px, py] = chanPoint(ch, ch.tb, 0), dx = ch.dir[0], dy = ch.dir[1], nx = -dy, ny = dx, nAng = Math.atan2(ny, nx);
    const fade = 1 - prog;
    barrierPieces(ch.k).forEach((p, i) => {
      // al romperse las piezas salen disparadas, giran y se desvanecen
      const rv = hash(i, ch.k + 5) - 0.5, push = prog * (6 + 14 * (hash(i, ch.k + 9)));
      const a = p.a + (hash(i, 3) - 0.35) * push * 1.4, b = p.b + (p.b >= 0 ? 1 : -1) * push * 0.8;
      const wx = px + dx * a + nx * b, wy = py + dy * a + ny * b, rot = prog * rv * 7;
      g.save(); g.translate(wx, wy); g.globalAlpha = fade;
      if (p.kind === 'rock') {
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(0.7, 1, p.r, p.r * 0.85, 0, 0, 7); g.fill();
        g.fillStyle = p.tone > 0.5 ? '#6d7580' : '#585f69'; g.beginPath(); g.ellipse(0, 0, p.r, p.r * 0.85, rot, 0, 7); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.ellipse(-p.r * 0.25, -p.r * 0.3, p.r * 0.5, p.r * 0.35, rot, 0, 7); g.fill();
        if (p.tone > 0.7) { g.fillStyle = '#4f8f46'; g.beginPath(); g.ellipse(p.r * 0.2, p.r * 0.4, p.r * 0.5, p.r * 0.25, 0, 0, 7); g.fill(); }   // musgo
      } else {
        g.rotate(nAng + p.jit + (p.kind === 'stake' ? Math.PI / 2 : 0) + rot);
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-p.w / 2 + 0.7, -p.th / 2 + 1, p.w, p.th);
        g.fillStyle = p.tone > 0.5 ? '#7a5a38' : '#664a2e'; g.fillRect(-p.w / 2, -p.th / 2, p.w, p.th);
        g.fillStyle = 'rgba(255,225,170,0.22)'; g.fillRect(-p.w / 2, -p.th / 2, p.w, p.th * 0.28);       // luz en el lomo
        if (p.kind === 'log') { g.fillStyle = '#b08a5a'; g.beginPath(); g.ellipse(p.w / 2, 0, 0.7, p.th / 2, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(-p.w / 2, 0, 0.7, p.th / 2, 0, 0, 7); g.fill(); }
      }
      g.restore();
    });
    // el agua se acumula contra la barricada
    if (prog === 0) {
      for (let b = -CH_HW; b <= CH_HW; b += 1.7) {
        const wob = Math.sin(t * 3 + b), fx = px - dx * 4.4 + nx * b, fy = py - dy * 4.4 + ny * b;
        g.fillStyle = `rgba(235,248,255,${0.3 + 0.25 * wob})`; g.fillRect(fx - 0.5, fy - 0.5, 1, 1);
      }
    }
  }

  function drawBarriers() {
    CHANNELS.forEach((ch) => {
      if (!S.unlocked[ch.k]) return;
      if (!S.unlocked[ch.k + 1]) { drawBarrier(ch, 0); return; }
      if (breakT[ch.k] === undefined) return;
      const prog = (t - breakT[ch.k]) / BREAK_TIME;
      if (prog >= 1) delete breakT[ch.k]; else drawBarrier(ch, prog);
    });
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

  function drawCarp(c) {
    const sp = SPECIES[c.sp], rar = sp.r, st = stageOf(c.xp), L = lenOf(st), Wm = L * 0.2;
    const cols = bodyColors(sp);
    const sp_ = c.spine, spd = clamp(c.speed / 8, 0, 1), amp = L * 0.1 * (0.45 + spd);

    // puntos de la columna con la ondulación aplicada
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

    const alpha = (c.hunger < 25 ? 0.6 : 1) * (rar >= 4 ? 0.88 + 0.12 * Math.sin(t * 3) : 1);

    // aura de rareza
    if (rar >= 2) glow(P[2].x, P[2].y, L * (0.7 + rar * 0.12), `rgba(${hex(RARITY[rar].c).join(',')},A)`, (0.12 + rar * 0.05) * (0.8 + 0.2 * Math.sin(t * 2 + c.x)));

    const outline = (ox, oy) => {
      const left = P.map((p) => ({ x: p.x + p.nx * p.w + ox, y: p.y + p.ny * p.w + oy }));
      const right = P.map((p) => ({ x: p.x - p.nx * p.w + ox, y: p.y - p.ny * p.w + oy })).reverse();
      const head = { x: P[0].x + P[0].tx * P[0].w * 0.9 + ox, y: P[0].y + P[0].ty * P[0].w * 0.9 + oy };
      smoothClosed([head, ...left, ...right]);
    };

    g.save();
    // sombra sobre el fondo
    g.fillStyle = 'rgba(0,0,0,0.28)'; outline(1.2, 1.6); g.fill();

    g.globalAlpha = alpha;
    const E = P[M - 1], D = { x: -E.tx, y: -E.ty }, Lt = L * 0.4, sw = Math.sin(c.phase - M * 0.75 - 0.4) * Lt * 0.45;
    const fin = cols[cols.length - 1];

    // cola
    g.fillStyle = fin; g.globalAlpha = alpha * 0.72;
    g.beginPath(); g.moveTo(E.x, E.y);
    g.quadraticCurveTo(E.x + D.x * Lt * 0.6 + E.nx * Lt * 0.75, E.y + D.y * Lt * 0.6 + E.ny * Lt * 0.75,
      E.x + D.x * Lt + E.nx * (Lt * 0.55 + sw), E.y + D.y * Lt + E.ny * (Lt * 0.55 + sw));
    g.quadraticCurveTo(E.x + D.x * Lt * 0.62 + E.nx * sw, E.y + D.y * Lt * 0.62 + E.ny * sw,
      E.x + D.x * Lt - E.nx * (Lt * 0.55 - sw), E.y + D.y * Lt - E.ny * (Lt * 0.55 - sw));
    g.quadraticCurveTo(E.x + D.x * Lt * 0.6 - E.nx * Lt * 0.75, E.y + D.y * Lt * 0.6 - E.ny * Lt * 0.75, E.x, E.y);
    g.closePath(); g.fill();

    // aletas pectorales
    const pf = P[2], fsw = Math.sin(c.phase + 1) * 0.5;
    [1, -1].forEach((side) => {
      g.beginPath();
      g.moveTo(pf.x + pf.nx * pf.w * side * 0.7, pf.y + pf.ny * pf.w * side * 0.7);
      g.quadraticCurveTo(pf.x + pf.nx * side * (pf.w + L * 0.2), pf.y + pf.ny * side * (pf.w + L * 0.2),
        pf.x + pf.nx * side * (pf.w + L * (0.22 + fsw * 0.1)) - pf.tx * L * 0.25, pf.y + pf.ny * side * (pf.w + L * (0.22 + fsw * 0.1)) - pf.ty * L * 0.25);
      g.lineTo(pf.x - pf.tx * L * 0.06, pf.y - pf.ty * L * 0.06);
      g.closePath(); g.fill();
    });

    // cuerpo + manchas
    g.globalAlpha = alpha;
    g.fillStyle = cols[0]; outline(0, 0); g.fill();
    g.save(); outline(0, 0); g.clip();
    for (let j = 0; j < M * 2 - 1; j++) {
      const i = j / 2, a = P[Math.floor(i)], b = P[Math.min(Math.ceil(i), M - 1)];
      g.fillStyle = cols[(j + 1) % cols.length];
      g.beginPath(); g.arc((a.x + b.x) / 2 + (hash(j, 3) - 0.5) * Wm * 0.5, (a.y + b.y) / 2 + (hash(j, 4) - 0.5) * Wm * 0.5, Wm * (0.8 + hash(j, 5) * 0.5), 0, 7); g.fill();
    }
    if (sp.head) { g.fillStyle = sp.head; g.beginPath(); g.arc(P[1].x, P[1].y, Wm * 0.75, 0, 7); g.fill(); }
    // lomo con brillo
    g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = Wm * 0.7; g.lineCap = 'round';
    g.beginPath(); g.moveTo(P[1].x, P[1].y); for (let i = 2; i < M - 1; i++) g.lineTo(P[i].x, P[i].y); g.stroke();
    g.restore();

    // ojos
    g.fillStyle = 'rgba(0,0,0,0.85)';
    [1, -1].forEach((side) => { g.beginPath(); g.arc(P[0].x + P[0].nx * P[0].w * 0.75 * side - P[0].tx * 0.2, P[0].y + P[0].ny * P[0].w * 0.75 * side - P[0].ty * 0.2, 0.55, 0, 7); g.fill(); });
    g.restore();

    if (rar >= 3 && Math.random() < 0.25) { g.fillStyle = '#fff'; g.fillRect(c.x + rnd(-L / 2, L / 2), c.y + rnd(-L / 2, L / 2), 1, 1); }
    if (c.hunger < 15 && Math.floor(t * 1.5) % 2 === 0) { g.fillStyle = '#ffb703'; g.fillRect(c.x - 0.5, c.y - L * 0.45, 1, 2); g.fillRect(c.x - 0.5, c.y - L * 0.45 + 2.8, 1, 1); }
    if (c === selected) { g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 0.7; g.setLineDash([1.5, 1.5]); g.lineDashOffset = -t * 4; g.beginPath(); g.arc(P[2].x, P[2].y, L * 0.75, 0, 7); g.stroke(); g.setLineDash([]); }
  }

  // ───────────────────────── lógica ─────────────────────────
  // destino al azar: casi siempre en el mismo estanque; a veces se va a otro por el canal
  function pickWander(c) {
    const zc = zoneOf(c.x, c.y), open = [];
    S.unlocked.forEach((on, i) => { if (on && i !== zc) open.push(i); });
    const zt = open.length && Math.random() < 0.22 ? open[Math.floor(Math.random() * open.length)] : zc;
    [c.tx, c.ty] = randomWaterPoint(zt);
    c.route = routeTo(zc, zt);
    c.retarget = zt === zc ? rnd(3, 7) : rnd(14, 24);
  }

  function updateMovement(c, dt) {
    const stage = stageOf(c.xp);

    // olfatea comida cercana
    let target = null, best = DETECT;
    if (c.hunger < 90) pellets.forEach((p) => { const d = Math.hypot(p.x - c.x, p.y - c.y); if (d < best) { best = d; target = p; } });
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
      if (Math.hypot(tx - c.x, ty - c.y) < 3.4) c.route.shift();
    } else if (target) { tx = target.x; ty = target.y; } else { tx = c.tx; ty = c.ty; }

    const want = Math.atan2(ty - c.y, tx - c.x);
    let diff = want - c.ang; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
    const turn = (2.6 - stage * 0.25) * dt;
    c.ang += clamp(diff, -turn, turn);
    c.speed = (4.2 + stage * 0.5) * (c.hunger < 20 ? 0.5 : 1) * (c.chasing ? 1.9 : 1);
    const nx = c.x + Math.cos(c.ang) * c.speed * dt, ny = c.y + Math.sin(c.ang) * c.speed * dt;
    if (waterAt(nx, ny, 0.82)) { c.x = nx; c.y = ny; }
    else { c.ang += Math.PI * 0.6; c.route = []; c.chaseP = null; c.retarget = 0; }      // choca con la orilla: replanifica
    c.phase += dt * (3.5 + c.speed * 0.7);

    // la columna sigue a la cabeza
    const sl = lenOf(stage) / (M - 1);
    c.spine[0].x = c.x; c.spine[0].y = c.y;
    for (let i = 1; i < M; i++) {
      const a = c.spine[i - 1], b = c.spine[i];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      b.x = a.x + dx / d * sl; b.y = a.y + dy / d * sl;
    }

    // comer
    for (let i = pellets.length - 1; i >= 0; i--) {
      const p = pellets[i];
      if (c.hunger < 90 && Math.hypot(p.x - c.x, p.y - c.y) < 2.6) {
        pellets.splice(i, 1);
        const before = stageOf(c.xp);
        c.hunger = Math.min(100, c.hunger + FEED); c.xp += 1;
        ripple(p.x, p.y, true);
        if (stageOf(c.xp) > before) toast(`${SPECIES[c.sp].name} ha crecido`, RARITY[SPECIES[c.sp].r].c);
        break;
      }
    }
  }

  function spawnPerla(c) {
    const lim = 8 + 4 * zoneUnlockedCount(S);
    if (S.floating.length >= lim) S.perlas += S.floating.shift().v;
    S.floating.push({ x: c.x, y: c.y, v: perlaValue(c) });
    ripple(c.x, c.y, true);
  }

  function hatch(e) {
    const zone = ZONES[e.zone];
    const total = zone.pool.reduce((a, id) => a + RARITY[SPECIES[id].r].w, 0);
    let roll = Math.random() * total, id = zone.pool[0];
    for (const k of zone.pool) { roll -= RARITY[SPECIES[k].r].w; if (roll <= 0) { id = k; break; } }
    const [x, y] = randomWaterPoint(e.zone);
    const c = initCarp({ sp: id, hunger: 60, xp: 0, x, y });
    S.carps.push(c);
    const isNew = !S.album[id];
    S.album[id] = (S.album[id] || 0) + 1;
    const sp = SPECIES[id];
    toast(`${isNew ? 'nueva · ' : ''}${sp.name} (${RARITY[sp.r].n})`, RARITY[sp.r].c, 3200);
    ripple(c.x, c.y, false);
    refreshHud();
  }

  let hudAcc = 0;
  function update(dt) {
    t += dt;
    if (S.food < FOOD_MAX) { S.foodT += dt; while (S.foodT >= FOOD_EVERY && S.food < FOOD_MAX) { S.food++; S.foodT -= FOOD_EVERY; } } else S.foodT = 0;

    const now = Date.now();
    for (let i = S.eggs.length - 1; i >= 0; i--) {
      const e = S.eggs[i];
      if (now >= e.ready && S.carps.length < capacity()) { S.eggs.splice(i, 1); hatch(e); }
    }

    S.carps.forEach((c) => {
      c.hunger = Math.max(0, c.hunger - HUNGER_RATE * dt);
      if (c.hunger > 30) c.pt -= dt;
      if (c.pt <= 0) { c.pt = rnd(12, 22); spawnPerla(c); }
      updateMovement(c, dt);
    });
    pellets = pellets.filter((p) => t - p.born < 30);
    ripples = ripples.filter((r) => t - r.born < r.max);

    // tras ver romperse la barricada, la cámara sigue hasta la zona nueva
    if (pendingFly && t >= pendingFly.at) { flyToZone(pendingFly.zi); pendingFly = null; }

    if (fly) {
      const k = 1 - Math.exp(-dt * 5);
      cam.x += (fly.x - cam.x) * k; cam.y += (fly.y - cam.y) * k; cam.z += (fly.z - cam.z) * k;
      if (Math.abs(fly.x - cam.x) < 0.2 && Math.abs(fly.y - cam.y) < 0.2 && Math.abs(fly.z - cam.z) < 0.05) fly = null;
      clampCam();
    }

    hudAcc += dt;
    if (hudAcc > 0.5) { hudAcc = 0; refreshHud(); refreshInfo(); }
  }

  // ───────────────────────── tamaño y rejilla ─────────────────────────
  const canvas = $('#pond'), ctx = canvas.getContext('2d');
  const FONT = 'ui-monospace, "Cascadia Mono", Consolas, "Courier New", monospace';
  const blooms = [2, 4, 8].map(() => document.createElement('canvas'));
  const glyphs = new Map();
  let cellDev = 8, dpr = 1, quality = 1, started = false;

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
    sinX = new Float32Array(GW); sinY = new Float32Array(GH);
    const N = GW * GH;
    zIdx = new Int8Array(N); nzx = new Int8Array(N); nzy = new Int8Array(N); chK = new Int8Array(N);
    rArr = new Float32Array(N); hArr = new Float32Array(N); h2Arr = new Float32Array(N); exArr = new Float32Array(N); eyArr = new Float32Array(N);
    chRArr = new Float32Array(N); chTArr = new Float32Array(N);
    blooms.forEach((b, i) => { const d = [2, 4, 8][i]; b.width = Math.ceil(canvas.width / d); b.height = Math.ceil(canvas.height / d); });
    glyphs.clear();

    if (!started) {          // primera vez: la partida guardada o el estanque inicial
      started = true;
      if (S.cam) { cam.x = S.cam.x; cam.y = S.cam.y; cam.z = S.cam.z; } else { cam.x = 0; cam.y = 0; cam.z = defaultZoom(); }
    }
    clampCam();
  }

  // ───────────────────────── brillo → letra ─────────────────────────
  const CH_HI = ['8', 'S', '9', 'X', '@', '5', '7', '1', 'd', '3'];
  const CH_MID = ['x', '+', '=', '*', 'X', 'z'];
  const CH_LO = [':', ';', '-', '~'];
  const CH_VLO = ['.', ',', "'", '`'];
  const CHARSET = [...CH_HI, ...CH_MID, ...CH_LO, ...CH_VLO];
  const IDX = new Map(CHARSET.map((c, i) => [c, i]));
  function pickIdx(lum, h) {
    const v = lum / 255;
    const set = v > 0.6 ? CH_HI : v > 0.4 ? CH_MID : v > 0.24 ? CH_LO : v > 0.12 ? CH_VLO : null;
    return set ? IDX.get(set[Math.floor(h * set.length) % set.length]) : -1;
  }

  // cada combinación (letra, color aproximado) se dibuja una vez y se reutiliza
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

  // ───────────────────────── pintado ─────────────────────────
  function renderScene() {
    g.setTransform(1, 0, 0, 1, 0, 0);
    paintGround();
    const u = U();
    g.setTransform(u, 0, 0, u, GW / 2 - cam.x * u, GH / 2 - cam.y * u);
    const vw = W / cam.z, vh = H / cam.z, ripW = Math.max(0.8, 1.3 / u);
    const seen = (x, y, m) => Math.abs(x - cam.x) < vw / 2 + m && Math.abs(y - cam.y) < vh / 2 + m;

    // decorado de cada zona abierta
    ZONES.forEach((zone, zi) => {
      if (!S.unlocked[zi]) return;
      const [ox, oy] = zoneCenter(zi);
      if (!seen(ox, oy, TW / 2 + 4)) return;
      g.save(); g.translate(ox, oy); DECOR[zone.id](zi); g.restore();
    });
    drawChannels();

    // ondas, comida, perlas y carpas: todo en coordenadas de mundo
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
    S.carps.filter((c) => seen(c.x, c.y, 30)).sort((a, b) => a.y - b.y).forEach(drawCarp);
    drawBridges();
    drawBarriers();
  }

  function toAscii() {
    const d = g.getImageData(0, 0, GW, GH).data;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    // fondo de cada celda: la propia imagen, ampliada sin suavizar y oscurecida
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

  // resplandor: la imagen se reduce varias veces y se suma de nuevo agrandada
  function bloom() {
    let from = canvas;
    blooms.forEach((b) => { const bc = b.getContext('2d'); bc.clearRect(0, 0, b.width, b.height); bc.drawImage(from, 0, 0, b.width, b.height); from = b; });
    ctx.globalCompositeOperation = 'lighter'; ctx.imageSmoothingEnabled = true;
    [[blooms[2], 0.45], [blooms[1], 0.3]].forEach(([b, a]) => { ctx.globalAlpha = a; ctx.drawImage(b, 0, 0, canvas.width, canvas.height); });
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  function render() { renderScene(); toAscii(); bloom(); }

  // ───────────────────────── interacción ─────────────────────────
  const HINT = 'toca el agua para alimentar';
  function toast(msg, color, ms = 2200) {
    const el = $('#toast');
    el.textContent = msg; el.style.color = color || ''; el.classList.add('on');
    clearTimeout(toast.k); toast.k = setTimeout(() => el.classList.remove('on'), ms);
  }

  // toque (sin arrastrar) sobre el mundo
  function tap(px, py) {
    const [x, y] = screenToWorld(px, py), zi = zoneAt(x, y);
    if (zi < 0) return;
    // tocar una barricada: ver cuánto cuesta abrir el paso
    for (const ch of CHANNELS) {
      if (!S.unlocked[ch.k] || S.unlocked[ch.k + 1]) continue;
      const [bx, by] = chanPoint(ch, ch.tb, 0);
      if (Math.hypot(bx - x, by - y) < Math.max(CH_HW + 3, 22 / cam.z)) { show('map'); return; }
    }
    if (!S.unlocked[zi]) { if (status(zi) === 1) show('map'); return; }
    const reach = (r) => Math.max(r, 18 / cam.z);          // zona de toque mínima en píxeles

    for (let i = 0; i < S.floating.length; i++) {
      const p = S.floating[i];
      if (Math.hypot(p.x - x, p.y - y) < reach(4.2)) {
        S.floating.splice(i, 1); S.perlas += p.v; ripple(p.x, p.y, true);
        toast(`+${p.v} perlas`, '#fff1a8', 900); refreshHud(); save(); return;
      }
    }
    let hit = null, best = 1e9;
    S.carps.forEach((c) => {
      const L = lenOf(stageOf(c.xp));
      c.spine.forEach((p) => { const d = Math.hypot(p.x - x, p.y - y); if (d < reach(L * 0.45 + 2) && d < best) { best = d; hit = c; } });
    });
    if (hit) { selected = hit; refreshInfo(); return; }
    selected = null;
    if (S.food <= 0) { toast('sin comida, espera un poco', '#ffb703', 1200); refreshInfo(); return; }
    if (waterAt(x, y, 0.92)) { S.food--; pellets.push({ x, y, born: t }); ripple(x, y, true); refreshHud(); }
    refreshInfo();
  }

  // arrastrar = mover la cámara · dos dedos = zoom · rueda = zoom
  const ptrs = new Map();
  let moved = 0, pinchD = 0;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    fly = null;
    if (ptrs.size === 1) moved = 0;
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinchD = Math.hypot(a.x - b.x, a.y - b.y); moved = 99; }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (ptrs.size === 1) {
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
    if (was === 1 && moved <= 8 && e.type === 'pointerup') tap(e.clientX, e.clientY);
    pinchD = 0;
  };
  canvas.addEventListener('pointerup', endPtr);
  canvas.addEventListener('pointercancel', endPtr);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });

  document.querySelectorAll('#zoom button').forEach((b) => b.addEventListener('click', () => zoomAt(W / 2, H / 2, b.dataset.z === 'in' ? 1.35 : 1 / 1.35)));
  window.addEventListener('keydown', (e) => {
    if (!panel.hidden) return;
    const k = e.key, step = 14 / cam.z * 8;
    if (k === '+' || k === '=') zoomAt(W / 2, H / 2, 1.2);
    else if (k === '-' || k === '_') zoomAt(W / 2, H / 2, 1 / 1.2);
    else if (k === 'ArrowLeft' || k === 'a') { cam.x -= step; fly = null; clampCam(); }
    else if (k === 'ArrowRight' || k === 'd') { cam.x += step; fly = null; clampCam(); }
    else if (k === 'ArrowUp' || k === 'w') { cam.y -= step; fly = null; clampCam(); }
    else if (k === 'ArrowDown' || k === 's') { cam.y += step; fly = null; clampCam(); }
  });

  // ───────────────────────── HUD ─────────────────────────
  function refreshHud() {
    const zi = zoneAt(cam.x, cam.y);
    $('#zoneName').textContent = zi >= 0 && S.unlocked[zi] ? ZONES[zi].name : '';
    if (zi >= 0 && S.unlocked[zi]) document.documentElement.style.setProperty('--accent', ZONES[zi].water);
    $('#perlas').innerHTML = `perlas <b>${fmt(S.perlas)}</b>`;
    $('#food').innerHTML = `comida <b>${S.food}/${FOOD_MAX}</b>`;
  }
  function refreshInfo() {
    const c = selected, el = $('#info');
    if (!c) { el.textContent = HINT; el.style.color = ''; return; }
    const sp = SPECIES[c.sp], full = Math.round(c.hunger / 10);
    el.textContent = `${sp.name} · ${RARITY[sp.r].n} · [${'█'.repeat(full)}${'░'.repeat(10 - full)}]`;
    el.style.color = RARITY[sp.r].c;
  }

  // ───────────────────────── paneles ─────────────────────────
  const panel = $('#panel'), body = $('#body');
  let openPanel = null, tickTimer = null;

  const ZONE_ART = [
    ' ~~~~ \n(~~~~)\n ~~~~ ', ' @@ ~~ \n~~ @@ ~\n @ ~~~ ', '  |:|  \n  |:|  \n ~~o~~ ',
    ' v v v \n( * * )\n ~~~~~ ', '  ,-.  \n (O O) \n  `-´  ', ' =|=|= \n | + | \n =|=|= ',
  ];

  function spriteHtml(id) {
    const sp = SPECIES[id], base = baseSprite(4, 0);
    return [...base].map((ch, u) => {
      let col = sp.pat[u % sp.pat.length];
      if (sp.head && ch === 'º') col = sp.head;
      if (sp.rainbow) col = `hsl(${u * 50},90%,68%)`;
      return `<span style="color:${col}">${ch}</span>`;
    }).join('');
  }

  function renderPanel(kind) {
    openPanel = kind;
    if (kind === 'map') {
      body.innerHTML = ZONES.map((z, i) => {
        const open = S.unlocked[i], visible = open || S.unlocked[i - 1];
        const art = visible ? ZONE_ART[i] : '???????\n???????\n???????';
        let action = '';
        if (open) action = `<button data-go="${i}">ir</button>`;
        else if (visible) action = `<button data-buy="${i}" ${S.perlas < z.cost ? 'disabled' : ''}>${fmt(z.cost)} perlas</button>`;
        const n = S.carps.filter((c) => zoneAt(c.x, c.y) === i).length;
        return `<div class="row ${visible ? '' : 'locked'}"><pre>${art}</pre>
          <div><div class="nm">${visible ? z.name : '???'}</div><div class="sub">${open ? `${n} carpas ahora` : ''}</div></div>${action}</div>`;
      }).join('');
    } else if (kind === 'album') {
      const total = Object.keys(SPECIES).length, got = Object.keys(S.album).length;
      body.innerHTML = `<div class="zone-title">álbum <span>${got}/${total}</span></div>` + ZONES.map((z, i) => {
        if (!S.unlocked[i] && !S.unlocked[i - 1]) return '';
        const gt = z.pool.filter((id) => S.album[id]).length;
        return `<div class="zone-title">${z.name} <span>${gt}/${z.pool.length}</span></div><div class="grid">` +
          z.pool.map((id) => {
            const sp = SPECIES[id], has = S.album[id];
            return has
              ? `<div class="card"><div class="spr">${spriteHtml(id)}</div><div class="nm">${sp.name}</div><div class="nm" style="color:${RARITY[sp.r].c}">${RARITY[sp.r].n}${S.album[id] > 1 ? ' ×' + S.album[id] : ''}</div></div>`
              : `<div class="card off"><div class="spr">??????</div><div class="nm">???</div><div class="nm">${RARITY[sp.r].n}</div></div>`;
          }).join('') + '</div>';
      }).join('');
    } else if (kind === 'egg') {
      const full = S.carps.length >= capacity();
      const pend = S.eggs.map((e) => `<div>${ZONES[e.zone].name} · ${Math.max(0, Math.ceil((e.ready - Date.now()) / 1000))}s</div>`).join('');
      body.innerHTML = `<div class="zone-title">huevos <span>${S.carps.length}/${capacity()} carpas</span></div>` + ZONES.map((z, i) => {
        if (!S.unlocked[i]) return '';
        return `<div class="row"><pre>  .--.  \n (    ) \n  '--'  </pre>
          <div><div class="nm">${z.name}</div><div class="sub">${EGG_TIME(i)}s</div></div>
          <button data-egg="${i}" ${S.perlas < z.egg || full ? 'disabled' : ''}>${full ? 'llenos' : fmt(z.egg) + ' perlas'}</button></div>`;
      }).join('') + `<div class="egg-list">${pend}</div>`;
    }
  }

  function show(kind) {
    renderPanel(kind); panel.hidden = false;
    clearInterval(tickTimer); tickTimer = setInterval(() => { if (openPanel === 'egg') renderPanel('egg'); }, 1000);
  }
  function hide() { panel.hidden = true; openPanel = null; clearInterval(tickTimer); }

  document.querySelectorAll('#nav button').forEach((b) => b.addEventListener('click', () => show(b.dataset.p)));
  $('#close').addEventListener('click', hide);
  panel.addEventListener('pointerdown', (e) => { if (e.target === panel) hide(); });

  body.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.go != null) {
      flyToZone(+b.dataset.go); selected = null; refreshInfo(); hide();
    } else if (b.dataset.buy != null) {
      const i = +b.dataset.buy, z = ZONES[i];
      if (S.perlas >= z.cost && !S.unlocked[i]) {
        S.perlas -= z.cost; S.unlocked[i] = true;
        const sp = z.pool.find((id) => SPECIES[id].r === 0) || z.pool[0], [x, y] = randomWaterPoint(i);
        S.carps.push(initCarp({ sp, hunger: 70, xp: 0, x, y })); S.album[sp] = (S.album[sp] || 0) + 1;
        toast(`${z.name} desbloqueado`, z.water, 2800); refreshHud(); save();
        // la barricada salta por los aires: la cámara viaja a verla y luego sigue a la zona nueva
        const ch = CHANNELS[i - 1], [bx, by] = chanPoint(ch, ch.tb, 0);
        breakT[i - 1] = t;
        for (let k = 0; k < 5; k++) ripple(bx + rnd(-6, 6), by + rnd(-6, 6), k % 2 === 0);
        camDirty = true; hide(); flyTo(bx, by, defaultZoom()); pendingFly = { at: t + 2.2, zi: i };
      }
    } else if (b.dataset.egg != null) {
      const i = +b.dataset.egg, z = ZONES[i];
      if (S.perlas >= z.egg && S.carps.length < capacity()) {
        S.perlas -= z.egg; S.eggs.push({ zone: i, ready: Date.now() + EGG_TIME(i) * 1000 });
        refreshHud(); save(); renderPanel('egg');
      }
    }
  });

  // ───────────────────────── arranque ─────────────────────────
  let rzTimer = 0;
  window.addEventListener('resize', () => { clearTimeout(rzTimer); rzTimer = setTimeout(resize, 120); });
  window.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  window.addEventListener('pagehide', save);
  setInterval(save, 10000);

  resize(); refreshHud(); refreshInfo();

  // si el dispositivo va justo, la rejilla se hace un poco más gruesa sola
  let last = performance.now(), acc = 0, ema = 15, slow = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt;
    update(dt);
    if (acc >= 1 / 20) {
      acc = 0;
      const t0 = performance.now();
      render();
      ema = ema * 0.9 + (performance.now() - t0) * 0.1;
      if (ema > 38) { if (++slow > 40 && quality < 1.8) { quality *= 1.15; slow = 0; ema = 20; resize(); } } else slow = 0;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

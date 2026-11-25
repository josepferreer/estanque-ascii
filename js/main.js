/* Estanque ASCII — motor del juego. Sin dependencias, sin build. */
(() => {
  const { RARITY, SPECIES, ZONES } = DATA;

  // ───────────────────────── constantes ─────────────────────────
  const COLS = 56, ROWS = 30;
  const CAP = 6;                         // carpas máximas por zona
  const FOOD_MAX = 12, FOOD_EVERY = 5;   // comida: máximo y segundos por unidad
  const HUNGER_RATE = 100 / 360;         // de 100 a 0 en 6 min
  const FEED = 30;                       // hambre que quita un pellet
  const STAGE_XP = [0, 3, 8, 16, 30];    // pellets comidos para cada tamaño
  const EGG_TIME = (z) => 20 * (z + 1);  // segundos de incubación
  const SAVE_KEY = 'estanque-ascii-v1';

  const TAILS = [['~', '-'], ['><', '<>'], ['><', '<>'], ['><', '<>'], ['><', '<>']];
  const REST  = ['º>', 'º>', '(º>', '((º>', '(((º>'];
  const MIRROR = { '(': ')', ')': '(', '<': '>', '>': '<' };

  // ───────────────────────── utilidades ─────────────────────────
  const $ = (s) => document.querySelector(s);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  const stageOf = (xp) => { let s = 0; STAGE_XP.forEach((t, i) => { if (xp >= t) s = i; }); return s; };
  const fmt = (n) => (n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(Math.floor(n)));
  const CX = (COLS - 1) / 2, CY = (ROWS - 1) / 2;
  const pondR = (x, y) => Math.hypot((x - CX) / (CX - 0.5), (y - CY) / (CY - 0.5));
  const inWater = (x, y, lim = 0.78) => pondR(x, y) < lim;
  const randomWaterPoint = () => {
    for (let i = 0; i < 60; i++) { const x = rnd(3, COLS - 3), y = rnd(3, ROWS - 3); if (inWater(x, y)) return [x, y]; }
    return [CX, CY];
  };

  // ───────────────────────── estado y guardado ─────────────────────────
  function fresh() {
    const s = {
      perlas: 40, food: FOOD_MAX, foodT: 0, zone: 0,
      unlocked: ZONES.map((_, i) => i === 0),
      zones: ZONES.map(() => ({ carps: [], perlas: [] })),
      album: {}, eggs: [], seen: Date.now(),
    };
    const [x, y] = [CX, CY];
    s.zones[0].carps.push({ sp: 'gris', hunger: 80, xp: 0, x, y });
    s.album.gris = 1;
    return s;
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !Array.isArray(s.zones) || s.zones.length !== ZONES.length) return null;
      return s;
    } catch { return null; }
  }

  function save() {
    S.seen = Date.now();
    try {
      const out = { ...S, zones: S.zones.map((z) => ({
        carps: z.carps.map((c) => ({ sp: c.sp, hunger: c.hunger, xp: c.xp, x: c.x, y: c.y, pt: c.pt })),
        perlas: z.perlas.map((p) => ({ x: p.x, y: p.y, v: p.v })),
      })) };
      localStorage.setItem(SAVE_KEY, JSON.stringify(out));
    } catch { /* sin almacenamiento: se juega igual */ }
  }

  let S = load() || fresh();

  // el tiempo que no estuviste: el hambre baja a medio ritmo y nunca por debajo de 15
  (() => {
    const away = clamp((Date.now() - (S.seen || Date.now())) / 1000, 0, 4 * 3600);
    S.zones.forEach((z) => z.carps.forEach((c) => { c.hunger = Math.max(Math.min(c.hunger, 15), c.hunger - away * HUNGER_RATE * 0.5); }));
    S.food = Math.min(FOOD_MAX, S.food + Math.floor(away / FOOD_EVERY));
  })();

  // ───────────────────────── carpas ─────────────────────────
  function initCarp(c, active) {
    if (c.x == null || !inWater(c.x, c.y, 0.85)) { [c.x, c.y] = randomWaterPoint(); }
    c.ang = Math.random() * Math.PI * 2;
    c.face = Math.cos(c.ang) >= 0 ? 1 : -1;
    c.tx = c.x; c.ty = c.y; c.retarget = 0;
    c.trail = []; c.trailT = 0;
    if (c.pt == null) c.pt = rnd(6, 14);
    return c;
  }
  S.zones.forEach((z) => z.carps.forEach((c) => initCarp(c)));

  const perlaValue = (c) => Math.max(1, RARITY[SPECIES[c.sp].r].mult * (stageOf(c.xp) + 1));

  function baseSprite(stage, frame) {
    return TAILS[stage][frame % 2] + REST[stage];
  }

  // ───────────────────────── ámbito del mundo ─────────────────────────
  let t = 0;                 // segundos de juego
  let pellets = [];          // comida flotando (solo zona activa)
  let ripples = [];          // ondas
  let selected = null;       // carpa elegida
  let foamTimer = 0;

  const zoneNow = () => S.zones[S.zone];
  const ZN = () => ZONES[S.zone];

  function ripple(x, y, small) { ripples.push({ x, y, born: t, max: small ? 0.9 : 1.7, speed: small ? 4 : 6 }); }

  // ───────────────────────── buffer de caracteres ─────────────────────────
  const bufCh = new Array(COLS * ROWS).fill(' ');
  const bufCo = new Array(COLS * ROWS).fill('#fff');
  const bufAl = new Array(COLS * ROWS).fill(1);
  function clearBuf() { bufCh.fill(' '); }
  function put(x, y, ch, color, alpha = 1) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS || ch === ' ') return;
    const i = y * COLS + x;
    bufCh[i] = ch; bufCo[i] = color; bufAl[i] = alpha;
  }
  function text(x, y, s, color, alpha = 1) { for (let i = 0; i < s.length; i++) put(x + i, y, s[i], color, alpha); }

  // ───────────────────────── escena: agua y orilla ─────────────────────────
  const SHORE_CH = ['#', '%', '&', '@'];
  const GRASS_CH = [',', '"', "'", ';'];
  function drawBase(zone) {
    const dark = zone.id === 'cueva' ? 0.7 : 1;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const h = hash(x, y);
        const r = pondR(x, y);
        const edge = 0.9 + 0.05 * h;
        if (r < edge) {
          const v = Math.sin(x * 0.35 + t * 1.2 + Math.sin(y * 0.4 + t * 0.5) * 2) + Math.sin(y * 0.5 - t * 0.8 + x * 0.1);
          const a = (0.12 + 0.3 * ((v + 2) / 4)) * dark * (1 - 0.35 * clamp((r - 0.6) / 0.3, 0, 1));
          const ch = v > 1.2 ? '~' : v > 0.5 ? '-' : v > -0.2 ? '.' : v > -1 ? ',' : ' ';
          put(x, y, ch, zone.water, a);
        } else if (r < 1.02 + 0.04 * h) {
          put(x, y, SHORE_CH[Math.floor(h * 4) % 4], zone.shore, 0.55 + 0.4 * h);
        } else {
          put(x, y, GRASS_CH[Math.floor(h * 4) % 4], zone.grass, 0.18 + 0.3 * h);
        }
      }
    }
  }

  // posiciones fijas (generadas una vez) de nenúfares
  function makePads(n, seed) {
    const out = []; let k = 0;
    while (out.length < n && k < 400) {
      const x = 4 + hash(k, seed) * (COLS - 9), y = 4 + hash(seed, k + 5) * (ROWS - 9);
      if (inWater(x, y, 0.72)) out.push({ x, y, f: hash(k, k) > 0.6, p: hash(k, 1) * 6 });
      k++;
    }
    return out;
  }
  const PADS = { estanque: makePads(6, 3), nenufares: makePads(16, 9) };

  function drawPads(list) {
    list.forEach((p) => {
      const dx = Math.sin(t * 0.4 + p.p) * 0.6;
      put(p.x + dx, p.y, '@', '#4f9d4a', 0.9);
      put(p.x + dx + 1, p.y, '@', '#3f8a3a', 0.9);
      if (p.f) put(p.x + dx + 0.5, p.y - 0.4, '*', '#ff8fb1', 1);
    });
  }

  function drawFireflies(n, color) {
    for (let i = 0; i < n; i++) {
      const x = CX + Math.sin(t * 0.3 + i * 2.1) * (CX - 6) * Math.cos(i), y = CY + Math.cos(t * 0.25 + i * 1.3) * (CY - 5) * Math.sin(i + 1);
      put(x, y, '.', color, 0.35 + 0.65 * Math.abs(Math.sin(t * 1.5 + i)));
    }
  }

  const DECOR = {
    estanque() {
      drawPads(PADS.estanque);
      for (let i = 0; i < 7; i++) {
        const x = 6 + i * 7 + hash(i, 4) * 3, y = 3.5 + Math.abs(i - 3) * 0.2;
        if (pondR(x, y) < 1.1) { const s = Math.sin(t * 1.6 + i); put(x, y, s > 0.4 ? '/' : s < -0.4 ? '\\' : '|', '#6aa84f', 0.8); put(x, y + 1, '|', '#6aa84f', 0.8); }
      }
    },
    nenufares() { drawPads(PADS.nenufares); drawFireflies(7, '#ffe66d'); },
    cascada() {
      const x0 = 25, x1 = 31;
      for (let x = x0 - 2; x <= x1 + 2; x++) for (let y = 0; y < 3; y++) put(x, y, '#', '#6b7580', 0.9);
      for (let x = x0; x <= x1; x++) {
        for (let y = 2; y < 9; y++) {
          const k = (y * 1.7 + t * 9 + x * 3.1) % 3;
          put(x, y, k < 1 ? '|' : k < 2 ? ':' : '!', '#bfe6ff', 0.55 + 0.4 * hash(x, y + Math.floor(t * 8)));
        }
        const f = Math.floor(t * 6 + x) % 3;
        put(x, 9, f === 0 ? '*' : f === 1 ? 'o' : '.', '#ffffff', 0.9);
      }
      for (let x = x0 - 1; x <= x1 + 1; x++) put(x, 10, hash(x, Math.floor(t * 4)) > 0.5 ? '~' : '-', '#e9f6ff', 0.6);
      foamTimer -= 1 / 30;
      if (foamTimer <= 0) { ripple(28, 10, false); foamTimer = 0.9; }
    },
    cueva() {
      const tops = [8, 12, 17, 22, 28, 33, 38, 44, 48];
      tops.forEach((x, i) => {
        let y0 = 0; while (y0 < ROWS && pondR(x, y0) > 0.92) y0++;
        const len = 1 + Math.floor(hash(i, 7) * 3);
        for (let k = 0; k < len; k++) put(x, y0 + k - 1, k === len - 1 ? 'v' : '|', '#8a7aa8', 0.9);
      });
      [[9, 17], [47, 12], [15, 6], [41, 25], [22, 26], [38, 5]].forEach(([x, y], i) => {
        const a = 0.5 + 0.5 * Math.sin(t * 1.4 + i * 1.7);
        put(x - 1, y, '(', '#7bffcf', 0.4 + 0.4 * a); put(x, y, '*', '#7bffcf', 0.6 + 0.4 * a); put(x + 1, y, ')', '#7bffcf', 0.4 + 0.4 * a);
        put(x, y + 1, '|', '#4aa88a', 0.7);
        put(x - 2, y - 1, '.', '#7bffcf', 0.3 * a); put(x + 2, y - 1, '.', '#7bffcf', 0.3 * a);
      });
    },
    luna() {
      for (let dy = -3; dy <= 3; dy++) {
        const w = Math.round(Math.sin(t * 2 + dy) * 0.6);
        for (let dx = -8; dx <= 8; dx++) {
          if ((dx / 2.2) ** 2 + dy * dy <= 9) {
            const edge = (dx / 2.2) ** 2 + dy * dy > 6;
            put(CX + dx + w, 11 + dy, edge ? 'o' : 'O', '#fff3b0', edge ? 0.55 : 0.9);
          }
        }
      }
      for (let k = 0; k < 7; k++) {
        const wid = 7 - k;
        for (let dx = -wid; dx <= wid; dx++) if (hash(dx, k + Math.floor(t * 2)) > 0.55) put(CX + dx, 16 + k, '-', '#fff3b0', 0.45);
      }
      for (let i = 0; i < 14; i++) put(hash(i, 2) * COLS, hash(i, 8) * ROWS, '*', '#ffffff', 0.15 + 0.6 * Math.abs(Math.sin(t * 1.2 + i * 2.3)));
      drawFireflies(5, '#b8c0ff');
    },
    templo() {
      [[14, 8], [42, 8], [14, 19], [42, 19]].forEach(([x, y]) => {
        put(x - 1, y, '=', '#cdbb84', 0.65); put(x, y, '=', '#cdbb84', 0.65); put(x + 1, y, '=', '#cdbb84', 0.65);
        for (let k = 1; k < 6; k++) { put(x - 1, y + k, '|', '#a89860', 0.55); put(x + 1, y + k, '|', '#a89860', 0.55); }
        put(x - 1, y + 6, '=', '#cdbb84', 0.65); put(x, y + 6, '=', '#cdbb84', 0.65); put(x + 1, y + 6, '=', '#cdbb84', 0.65);
      });
      for (let i = 0; i < 8; i++) {
        const a = t * 0.5 + i * Math.PI / 4;
        put(CX + Math.cos(a) * 8, CY + Math.sin(a) * 4, '+', '#2ec4b6', 0.4 + 0.6 * Math.abs(Math.sin(t * 1.3 + i)));
      }
      put(CX, CY, '+', '#7bdcb5', 0.5 + 0.5 * Math.sin(t * 2));
    },
  };

  // ───────────────────────── dibujo de carpas ─────────────────────────
  function drawCarp(c) {
    const sp = SPECIES[c.sp], rar = sp.r, stage = stageOf(c.xp);
    const frame = Math.floor(t * (c.speed > 4 ? 9 : 4));
    const base = baseSprite(stage, frame), L = base.length;
    let alpha = c.hunger < 25 ? 0.5 : 1;
    if (rar >= 2) alpha *= 0.85 + 0.15 * Math.sin(t * 3 + c.x);

    // estela
    c.trail.forEach((p, i) => put(p.x, p.y, '.', ZN().water, 0.5 * (1 - i / c.trail.length)));

    const left = Math.round(c.x - L / 2);
    for (let i = 0; i < L; i++) {
      const u = c.face === 1 ? i : L - 1 - i;
      const raw = base[u];
      const ch = c.face === 1 ? raw : (MIRROR[raw] || raw);
      let col = sp.pat[u % sp.pat.length];
      if (sp.head && raw === 'º') col = sp.head;
      if (sp.rainbow) col = `hsl(${(t * 70 + u * 28) % 360},90%,68%)`;
      put(left + i, c.y, ch, col, alpha);
    }
    if (rar >= 3 && Math.random() < 0.08) put(c.x + rnd(-L, L), c.y + rnd(-1.3, 1.3), '*', RARITY[rar].c, 0.9);
    if (c === selected) put(c.x, c.y - 1.2, 'v', '#ffffff', 0.9);
    if (c.hunger < 15 && Math.floor(t * 1.5) % 2 === 0) put(c.x + c.face * (L / 2 + 1), c.y - 1, '?', '#ffb703', 0.9);
  }

  // ───────────────────────── lógica ─────────────────────────
  function updateMovement(c, dt) {
    const stage = stageOf(c.xp);
    // objetivo: la comida más cercana si tiene hambre; si no, vagar
    let target = null;
    if (c.hunger < 90 && pellets.length) {
      let best = 1e9;
      pellets.forEach((p) => { const d = Math.hypot(p.x - c.x, (p.y - c.y) * 2); if (d < best) { best = d; target = p; } });
    }
    c.chasing = !!target;
    if (target) { c.tx = target.x; c.ty = target.y; }
    else {
      c.retarget -= dt;
      if (c.retarget <= 0 || Math.hypot(c.tx - c.x, (c.ty - c.y) * 2) < 2) { [c.tx, c.ty] = randomWaterPoint(); c.retarget = rnd(3, 7); }
    }
    const want = Math.atan2((c.ty - c.y) * 2, c.tx - c.x);
    let diff = want - c.ang; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
    c.ang += clamp(diff, -2.2 * dt, 2.2 * dt);
    c.speed = (2.2 + stage * 0.35) * (c.hunger < 20 ? 0.5 : 1) * (c.chasing ? 2 : 1);
    const nx = c.x + Math.cos(c.ang) * c.speed * dt, ny = c.y + Math.sin(c.ang) * c.speed * dt * 0.5;
    if (inWater(nx, ny, 0.84)) { c.x = nx; c.y = ny; } else { c.ang += Math.PI * 0.6; [c.tx, c.ty] = randomWaterPoint(); }
    const cs = Math.cos(c.ang);
    if (Math.abs(cs) > 0.25) c.face = cs >= 0 ? 1 : -1;

    c.trailT += dt;
    if (c.trailT > 0.12) { c.trailT = 0; c.trail.unshift({ x: c.x - c.face * 3, y: c.y }); if (c.trail.length > 4) c.trail.pop(); }

    // comer
    for (let i = pellets.length - 1; i >= 0; i--) {
      const p = pellets[i];
      if (c.hunger < 90 && Math.hypot(p.x - c.x, (p.y - c.y) * 2) < 1.8) {
        pellets.splice(i, 1);
        const before = stageOf(c.xp);
        c.hunger = Math.min(100, c.hunger + FEED); c.xp += 1;
        ripple(p.x, p.y, true);
        if (stageOf(c.xp) > before) toast(`${SPECIES[c.sp].name} ha crecido`, RARITY[SPECIES[c.sp].r].c);
        break;
      }
    }
  }

  function spawnPerla(zi, c, active) {
    const z = S.zones[zi];
    const v = perlaValue(c);
    if (z.perlas.length >= 10) { S.perlas += z.perlas.shift().v; }
    const x = active ? c.x : randomWaterPoint()[0], y = active ? c.y : randomWaterPoint()[1];
    z.perlas.push({ x, y, v });
    if (active) ripple(x, y, true);
  }

  function hatch(e) {
    const zone = ZONES[e.zone];
    const total = zone.pool.reduce((a, id) => a + RARITY[SPECIES[id].r].w, 0);
    let roll = Math.random() * total, id = zone.pool[0];
    for (const k of zone.pool) { roll -= RARITY[SPECIES[k].r].w; if (roll <= 0) { id = k; break; } }
    const [x, y] = randomWaterPoint();
    const c = initCarp({ sp: id, hunger: 60, xp: 0, x, y });
    S.zones[e.zone].carps.push(c);
    const isNew = !S.album[id];
    S.album[id] = (S.album[id] || 0) + 1;
    const sp = SPECIES[id];
    toast(`${isNew ? 'nueva · ' : ''}${sp.name} (${RARITY[sp.r].n})`, RARITY[sp.r].c, 3200);
    if (e.zone === S.zone) ripple(x, y, false);
    refreshHud();
  }

  let foodAcc = 0;
  function update(dt) {
    t += dt;
    // comida
    if (S.food < FOOD_MAX) { S.foodT += dt; while (S.foodT >= FOOD_EVERY && S.food < FOOD_MAX) { S.food++; S.foodT -= FOOD_EVERY; } } else S.foodT = 0;

    // huevos
    const now = Date.now();
    for (let i = S.eggs.length - 1; i >= 0; i--) {
      const e = S.eggs[i];
      if (now >= e.ready && S.zones[e.zone].carps.length < CAP) { S.eggs.splice(i, 1); hatch(e); }
    }

    S.zones.forEach((z, zi) => {
      const active = zi === S.zone;
      z.carps.forEach((c) => {
        c.hunger = Math.max(0, c.hunger - HUNGER_RATE * dt);
        if (c.hunger > 30) c.pt -= dt;
        if (c.pt <= 0) { c.pt = rnd(12, 22); if (S.unlocked[zi]) spawnPerla(zi, c, active); }
        if (active) updateMovement(c, dt);
      });
    });

    pellets = pellets.filter((p) => t - p.born < 30);
    ripples = ripples.filter((r) => t - r.born < r.max);
    foodAcc += dt;
    if (foodAcc > 0.5) { foodAcc = 0; refreshHud(); refreshInfo(); }
  }

  // ───────────────────────── pintado ─────────────────────────
  const canvas = $('#pond'), ctx = canvas.getContext('2d');
  let cw = 10, chh = 19, fs = 16;
  const FONT = 'ui-monospace, "Cascadia Mono", Consolas, "Courier New", monospace';

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const availW = Math.min(760, window.innerWidth - 24);
    const availH = window.innerHeight - 190;
    ctx.font = `100px ${FONT}`;
    const ratio = ctx.measureText('M').width / 100 || 0.6;
    cw = Math.max(5, Math.min(availW / COLS, availH / (ROWS * ratio * 2 * 1.0)));
    fs = cw / ratio; chh = fs * 1.15;
    canvas.width = Math.round(COLS * cw * dpr); canvas.height = Math.round(ROWS * chh * dpr);
    canvas.style.width = COLS * cw + 'px'; canvas.style.height = ROWS * chh + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function render() {
    const zone = ZN();
    clearBuf();
    drawBase(zone);
    DECOR[zone.id]();

    // ondas
    ripples.forEach((r) => {
      const age = t - r.born, rad = age * r.speed, fade = 1 - age / r.max;
      for (let y = Math.floor(r.y - rad / 2 - 2); y <= r.y + rad / 2 + 2; y++) {
        for (let x = Math.floor(r.x - rad - 2); x <= r.x + rad + 2; x++) {
          if (Math.abs(Math.hypot(x - r.x, (y - r.y) * 2) - rad) < 0.8) put(x, y, rad < 2.5 ? '.' : 'o', '#d8f1ff', 0.7 * fade);
        }
      }
    });

    // comida, perlas, carpas
    pellets.forEach((p) => put(p.x, p.y + Math.sin(t * 3 + p.x) * 0.2, Math.floor(t * 2 + p.x) % 2 ? ':' : '.', '#e8c46a', 1));
    zoneNow().perlas.forEach((p, i) => put(p.x, p.y, Math.floor(t * 2.5 + i) % 2 ? 'O' : 'o', '#fff1a8', 1));
    [...zoneNow().carps].sort((a, b) => a.y - b.y).forEach(drawCarp);

    // volcado al canvas
    ctx.fillStyle = zone.bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = `${fs}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const i = y * COLS + x, ch = bufCh[i];
        if (ch === ' ') continue;
        ctx.globalAlpha = clamp(bufAl[i], 0, 1); ctx.fillStyle = bufCo[i];
        ctx.fillText(ch, x * cw + cw / 2, y * chh + chh / 2);
      }
    }
    ctx.globalAlpha = 1;
  }

  // ───────────────────────── interacción ─────────────────────────
  const HINT = 'toca el agua para alimentar';
  function toast(msg, color, ms = 2200) {
    const el = $('#toast');
    el.textContent = msg; el.style.color = color || ''; el.classList.add('on');
    clearTimeout(toast.k); toast.k = setTimeout(() => el.classList.remove('on'), ms);
  }

  canvas.addEventListener('pointerdown', (ev) => {
    const rect = canvas.getBoundingClientRect();
    const x = (ev.clientX - rect.left) / rect.width * COLS, y = (ev.clientY - rect.top) / rect.height * ROWS;
    const z = zoneNow();

    // 1) perla
    for (let i = 0; i < z.perlas.length; i++) {
      const p = z.perlas[i];
      if (Math.abs(p.x - x) < 2.2 && Math.abs(p.y - y) < 1.8) {
        z.perlas.splice(i, 1); S.perlas += p.v; ripple(p.x, p.y, true);
        toast(`+${p.v} perlas`, '#fff1a8', 900); refreshHud(); save(); return;
      }
    }
    // 2) carpa
    let hit = null, best = 1e9;
    z.carps.forEach((c) => {
      const L = baseSprite(stageOf(c.xp), 0).length;
      if (Math.abs(c.x - x) <= L / 2 + 1 && Math.abs(c.y - y) <= 1.6) { const d = Math.abs(c.x - x) + Math.abs(c.y - y); if (d < best) { best = d; hit = c; } }
    });
    if (hit) { selected = hit; refreshInfo(); return; }
    // 3) alimentar
    selected = null;
    if (S.food <= 0) { toast('sin comida, espera un poco', '#ffb703', 1200); return; }
    if (inWater(x, y, 0.92)) { S.food--; pellets.push({ x, y, born: t }); ripple(x, y, true); refreshHud(); refreshInfo(); }
  });

  // ───────────────────────── HUD ─────────────────────────
  function refreshHud() {
    $('#zoneName').textContent = ZN().name;
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

  function applyTheme() {
    const z = ZN();
    document.body.style.background = z.bg;
    document.documentElement.style.setProperty('--bg', z.bg);
    document.documentElement.style.setProperty('--accent', z.water);
    const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = z.bg;
    refreshHud();
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
        if (open) action = `<button data-go="${i}" ${i === S.zone ? 'disabled' : ''}>${i === S.zone ? 'aquí' : 'ir'}</button>`;
        else if (visible) action = `<button data-buy="${i}" ${S.perlas < z.cost ? 'disabled' : ''}>${fmt(z.cost)} perlas</button>`;
        const n = S.zones[i].carps.length;
        return `<div class="row ${visible ? '' : 'locked'}"><pre>${art}</pre>
          <div><div class="nm">${visible ? z.name : '???'}</div><div class="sub">${open ? `${n}/${CAP} carpas` : ''}</div></div>${action}</div>`;
      }).join('');
    } else if (kind === 'album') {
      const total = Object.keys(SPECIES).length, got = Object.keys(S.album).length;
      body.innerHTML = `<div class="zone-title">álbum <span>${got}/${total}</span></div>` + ZONES.map((z, i) => {
        if (!S.unlocked[i] && !S.unlocked[i - 1]) return '';
        const g = z.pool.filter((id) => S.album[id]).length;
        return `<div class="zone-title">${z.name} <span>${g}/${z.pool.length}</span></div><div class="grid">` +
          z.pool.map((id) => {
            const sp = SPECIES[id], has = S.album[id];
            return has
              ? `<div class="card"><div class="spr">${spriteHtml(id)}</div><div class="nm">${sp.name}</div><div class="nm" style="color:${RARITY[sp.r].c}">${RARITY[sp.r].n}${S.album[id] > 1 ? ' ×' + S.album[id] : ''}</div></div>`
              : `<div class="card off"><div class="spr">??????</div><div class="nm">???</div><div class="nm">${RARITY[sp.r].n}</div></div>`;
          }).join('') + '</div>';
      }).join('');
    } else if (kind === 'egg') {
      const z = ZN(), full = zoneNow().carps.length >= CAP;
      const pend = S.eggs.map((e) => `<div>${ZONES[e.zone].name} · ${Math.max(0, Math.ceil((e.ready - Date.now()) / 1000))}s</div>`).join('');
      body.innerHTML = `<div class="egg-info">
        <div class="big">  .--.  \n (    ) \n  '--'  </div>
        <div class="sub">${z.name} · ${zoneNow().carps.length}/${CAP} carpas · incubación ${EGG_TIME(S.zone)}s</div>
        <button data-egg ${S.perlas < z.egg || full ? 'disabled' : ''}>${full ? 'zona llena' : `comprar huevo · ${fmt(z.egg)} perlas`}</button>
        <div class="egg-list">${pend}</div></div>`;
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
      S.zone = +b.dataset.go; pellets = []; ripples = []; selected = null; applyTheme(); refreshInfo(); save(); hide();
    } else if (b.dataset.buy != null) {
      const i = +b.dataset.buy, z = ZONES[i];
      if (S.perlas >= z.cost && !S.unlocked[i]) {
        S.perlas -= z.cost; S.unlocked[i] = true;
        // cada zona nueva empieza con su carpa más común
        const sp = z.pool.find((id) => SPECIES[id].r === 0) || z.pool[0];
        S.zones[i].carps.push(initCarp({ sp, hunger: 70, xp: 0 })); S.album[sp] = (S.album[sp] || 0) + 1;
        toast(`${z.name} desbloqueado`, ZONES[i].water, 2800); refreshHud(); save(); renderPanel('map');
      }
    } else if (b.hasAttribute('data-egg')) {
      const z = ZN();
      if (S.perlas >= z.egg && zoneNow().carps.length < CAP) {
        S.perlas -= z.egg; S.eggs.push({ zone: S.zone, ready: Date.now() + EGG_TIME(S.zone) * 1000 });
        refreshHud(); save(); renderPanel('egg');
      }
    }
  });

  // ───────────────────────── arranque ─────────────────────────
  window.addEventListener('resize', resize);
  window.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  window.addEventListener('pagehide', save);
  setInterval(save, 10000);

  resize(); applyTheme(); refreshInfo();

  let last = performance.now(), acc = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt;
    update(dt);
    if (acc >= 1 / 20) { acc = 0; render(); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

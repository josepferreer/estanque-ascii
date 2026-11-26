/* Mapa del lago — geometría pura, sin estado de partida.
 *
 * Un único lago que empieza en el centro (Estanque) y se abre hacia fuera: cada zona es una parte
 * más del mismo agua, con fronteras anchas e irregulares. Solo los dos rincones secretos se alcanzan
 * por un pasadizo estrecho y serpenteante.
 *
 * Cada zona es una mancha (elipse con la orilla ondulada). En un punto del mundo:
 *  · la zona es la mancha que más "manda" ahí (la de mayor campo f);
 *  · hay agua si alguna mancha llega (f > 0) o si cae dentro de un pasadizo;
 *  · r es como en el estanque de antes: < 0,93 agua, hasta 1 orilla, > 1 tierra. Se mide en unidades
 *    de distancia a la orilla, así que la orilla tiene el mismo ancho que siempre aunque el lago sea enorme.
 *
 * Las coordenadas salen del dibujo que aprobó Josep (680×460 px), escaladas a unidades de mundo.
 */
const MAP = (() => {
  const K = 0.8, OX = 340, OY = 240;                // píxel del dibujo → unidad de mundo; el centro del Estanque es (0,0)
  const toW = (x, y) => [(x - OX) * K, (y - OY) * K];
  const RS = 46;                                     // ancho de referencia de la orilla (el radio del estanque antiguo)
  const PW = 11;                                     // medio ancho de los pasadizos secretos

  const DEF = [
    // el lago de partida, ×1,4 respecto al dibujo original (125×95): con el islote del laboratorio y la Plaza le quedaba
    // un tercio menos de agua libre y era la zona más pequeña de todas. Sigue tocando a las mismas vecinas.
    { id: 'estanque', p: [340, 240], rx: 175, ry: 133, s: 1 },
    { id: 'nenufares', p: [150, 295], rx: 125, ry: 95, s: 2 },
    { id: 'cascada', p: [330, 90], rx: 125, ry: 72, s: 3 },
    { id: 'cueva', p: [540, 185], rx: 112, ry: 92, s: 4 },
    { id: 'luna', p: [478, 340], rx: 135, ry: 84, s: 5 },
    { id: 'templo', p: [130, 105], rx: 108, ry: 80, s: 6 },
    { id: 'portal', p: [292, 380], rx: 124, ry: 80, s: 9 },          // la última: un portal a otros mundos
    // secretos: cuelgan de una zona (parent) y se llega por un pasadizo
    { id: 'gruta', name: 'Gruta escondida', p: [632, 52], rx: 34, ry: 26, s: 7, parent: 3, path: [[585, 150], [612, 118], [598, 92], [624, 70]] },
    { id: 'poza', name: 'Poza secreta', p: [58, 420], rx: 32, ry: 24, s: 8, parent: 1, path: [[95, 360], [72, 380], [86, 398], [64, 412]] },
  ];
  const MAIN = 7;

  const Z = DEF.map((d) => {
    const [x, y] = toW(d.p[0], d.p[1]), rx = d.rx * K, ry = d.ry * K;
    // orilla ondulada = 1 + Σ a·sin(k·θ + fase), guardada como (k, a·cos fase, a·sin fase)
    const wob = [[0.14, 3, d.s], [0.09, 5, d.s * 2.3], [0.05, 8, d.s]].map(([a, k, ph]) => [k, a * Math.cos(ph), a * Math.sin(ph)]);
    const z = { id: d.id, name: d.name || null, x, y, rx, ry, R: Math.sqrt(rx * ry) * 0.9, secret: d.parent != null, parent: d.parent != null ? d.parent : -1, wob, path: null };
    if (d.path) z.path = d.path.map(([px, py]) => toW(px, py));
    return z;
  });
  const N = Z.length;

  // islotes (coordenadas de mundo): tierra dentro, orilla estrecha y un anillo de aguas someras
  const ISLANDS = [
    [{ x: -38, y: 18, r: 26, lab: true },          // el islote del laboratorio: grande, para que la casa quepa a escala de las carpas
      // la Plaza: un muelle de tablas sobre pilotes (rectángulo w×h) pegado al laboratorio. Las carpas no pasan por debajo
      { x: 34, y: 16, w: 72, h: 48, r: 44, pier: true }],
    [{ x: -182, y: 66, r: 8, turtle: true }, { x: -118, y: 18, r: 5 }],
    // cascada: dos peñascos en la poza donde cae el agua
    [{ x: -20, y: -155, r: 2.6, boulder: true }, { x: 6, y: -153, r: 2.2, boulder: true }],
    // cueva: estalagmitas que salen del agua
    [{ x: 168, y: -28, r: 5, stal: true }, { x: 150, y: -64, r: 2.6, stal: true }, { x: 196, y: -24, r: 2.2, stal: true }, { x: 128, y: -28, r: 2, stal: true }],
    [{ x: 160, y: 122, r: 6 }],
    // templo: la pirámide escalonada en el centro y un anillo de columnas en el agua (algunas rotas)
    [{ x: -168, y: -104, r: 17, temple: true },
      { x: -134, y: -104, r: 2.2, col: true },
      { x: -144, y: -86, r: 2.2, col: true, broken: true },
      { x: -168, y: -78, r: 2.2, col: true },
      { x: -192, y: -86, r: 2.2, col: true },
      { x: -202, y: -104, r: 2.2, col: true, broken: true },
      { x: -192, y: -122, r: 2.2, col: true },
      { x: -168, y: -130, r: 2.2, col: true, broken: true },
      { x: -144, y: -122, r: 2.2, col: true }],
    [],
    [], [],
  ];

  // campo de una zona en un punto: 1 en el centro, 0 en la orilla, negativo fuera
  function field(z, x, y) {
    const dx = (x - z.x) / z.rx, dy = (y - z.y) / z.ry, d = Math.sqrt(dx * dx + dy * dy);
    if (d > 2.4) return 1 - d;                       // lejos: sin ondulación (solo decide de qué zona es la tierra)
    const c = d > 0 ? dx / d : 1, s = d > 0 ? dy / d : 0;
    const c2 = c * c - s * s, s2 = 2 * c * s, c3 = c2 * c - s2 * s, s3 = s2 * c + c2 * s;
    const c4 = c2 * c2 - s2 * s2, s4 = 2 * c2 * s2, c5 = c4 * c - s4 * s, s5 = s4 * c + c4 * s;
    const c8 = c4 * c4 - s4 * s4, s8 = 2 * c4 * s4;
    const w = z.wob;
    const k = 1 + s3 * w[0][1] + c3 * w[0][2] + s5 * w[1][1] + c5 * w[1][2] + s8 * w[2][1] + c8 * w[2][2];
    const f = 1 - d / k;
    return z.secret ? f * 0.9 : f;
  }
  function segD(px, py, ax, ay, bx, by) {
    const vx = bx - ax, vy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
    const ex = px - ax - vx * t, ey = py - ay - vy * t;
    return Math.sqrt(ex * ex + ey * ey);
  }
  // caja de cada pasadizo, para no medir distancias en todo el mapa
  Z.forEach((z) => {
    if (!z.path) return;
    const xs = z.path.map((p) => p[0]), ys = z.path.map((p) => p[1]);
    z.pbox = [Math.min(...xs) - PW, Math.min(...ys) - PW, Math.max(...xs) + PW, Math.max(...ys) + PW];
  });

  // muestra del mapa en (x, y). Se reutiliza el mismo objeto para no crear basura (se llama muchísimo).
  const q = { z: 0, z2: 0, w: 1, r: 9, e: -99 };
  function sample(x, y) {
    let b1 = -1e9, z1 = 0, b2 = -1e9, z2 = 0;
    for (let i = 0; i < N; i++) {
      const f = field(Z[i], x, y);
      if (f > b1) { b2 = b1; z2 = z1; b1 = f; z1 = i; } else if (f > b2) { b2 = f; z2 = i; }
    }
    // cerca de la frontera se mezclan las dos zonas (w = cuánto pesa la primera)
    const t = Math.max(0, Math.min(1, (b1 - b2) / 0.12)), w = 0.5 + 0.5 * t * t * (3 - 2 * t);
    const R = Z[z1].R * w + Z[z2].R * (1 - w);
    let e = b1 * R, wz = w;
    // pasadizos: agua estrecha que lleva al secreto
    for (let i = MAIN; i < N; i++) {
      const z = Z[i], bx = z.pbox;
      if (x < bx[0] || x > bx[2] || y < bx[1] || y > bx[3]) continue;
      const p = z.path;
      let d = 1e9;
      for (let k = 0; k < p.length - 1; k++) d = Math.min(d, segD(x, y, p[k][0], p[k][1], p[k + 1][0], p[k + 1][1]));
      const ep = PW - d;
      if (ep > e) { if (z1 !== i) { z2 = z1; } z1 = i; e = ep; wz = 1; }
    }
    let r = 1 - e / RS;
    for (const is of ISLANDS[z1]) {
      const dx = x - is.x, dy = y - is.y;
      // un muelle bloquea el paso (r 0,95: ni se nada ni se echa comida) pero el agua de debajo no se convierte en playa
      if (is.pier) { if (Math.abs(dx) <= is.w / 2 && Math.abs(dy) <= is.h / 2 && r < 0.95) r = 0.95; continue; }
      // columnas y templo salen del agua a pico: sin playa alrededor, solo bloquean el paso (r 0,9)
      if (is.col || is.temple) {
        const h = is.temple ? 17.5 : is.r * 1.6;
        if (Math.abs(dx) <= h && Math.abs(dy) <= h && r < 0.9) r = 0.9;
        continue;
      }
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > is.r + 7) continue;
      const ri = d <= is.r ? 1 + (is.r - d) * 0.2 : d <= is.r + 1.6 ? 1 - (d - is.r) * 0.07 / 1.6 : Math.max(0, 0.93 - (d - is.r - 1.6) * 0.6 / 4.4);
      if (ri > r) r = ri;
    }
    q.z = z1; q.z2 = z2; q.w = wz; q.r = r; q.e = e;
    return q;
  }
  const rAt = (x, y) => sample(x, y).r;
  const zoneAt = (x, y) => sample(x, y).z;

  // ── fronteras entre zonas (dentro del agua): sirven para las barreras de troncos y para las rutas ──
  const borders = new Map();                         // clave a*N+b (a<b) → [{x, y, r}]
  const X0 = -300, X1 = 300, Y0 = -220, Y1 = 250, ST = 2;
  for (let y = Y0; y < Y1; y += ST) {
    for (let x = X0; x < X1; x += ST) {
      const a = sample(x, y), za = a.z, ra = a.r;
      if (ra > 0.9) continue;
      for (const [nx, ny] of [[x + ST, y], [x, y + ST]]) {
        const b = sample(nx, ny);
        if (b.r > 0.9 || b.z === za) continue;
        const lo = Math.min(za, b.z), hi = Math.max(za, b.z), key = lo * N + hi;
        if (!borders.has(key)) borders.set(key, []);
        borders.get(key).push({ x: (x + nx) / 2, y: (y + ny) / 2, r: Math.max(ra, b.r) });
      }
    }
  }
  const adj = Z.map(() => []);
  borders.forEach((pts, key) => {
    if (pts.length < 3) return;
    const a = Math.floor(key / N), b = key % N;
    adj[a].push(b); adj[b].push(a);
  });
  // punto de paso entre dos zonas: el más hondo de la frontera, sin irse a un extremo
  const wpCache = new Map();
  function waypoint(a, b) {
    const key = Math.min(a, b) * N + Math.max(a, b);
    if (wpCache.has(key)) return wpCache.get(key);
    const pts = borders.get(key);
    if (!pts) return null;
    const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length, my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    let best = null, bs = 1e9;
    pts.forEach((p) => { const s = p.r + Math.hypot(p.x - mx, p.y - my) / 120; if (s < bs) { bs = s; best = p; } });
    const out = { x: best.x, y: best.y };
    wpCache.set(key, out);
    return out;
  }
  // puntos de paso de un pasadizo, desde la zona de la que cuelga hasta el secreto
  const secretPath = (i) => Z[i].path.map(([x, y]) => ({ x, y })).concat([{ x: Z[i].x, y: Z[i].y }]);

  // punto de la orilla de una zona en una dirección (desde el centro hacia fuera). null si antes de
  // llegar a la orilla el agua pasa a ser de otra zona (esa dirección da a un vecino, no a tierra).
  function shorePoint(zi, ang, lim = 0.97) {
    const z = Z[zi], dx = Math.cos(ang), dy = Math.sin(ang), max = Math.max(z.rx, z.ry) * 1.6;
    let last = null;
    for (let d = 0; d < max; d += 1) {
      const x = z.x + dx * d, y = z.y + dy * d, s = sample(x, y);
      if (s.r >= lim) {
        if (s.z !== zi && last === null) return null;
        // islote en el camino: seguir hasta la orilla de verdad
        if (s.r < 1.25 && ISLANDS[zi].some((is) => Math.hypot(x - is.x, y - is.y) < is.r + 3)) continue;
        return last ? [last[0], last[1]] : null;
      }
      if (s.z !== zi) return null;
      last = [x, y];
    }
    return null;
  }
  // punto de agua al azar de una zona; rand() da [0,1)
  function randomPoint(zi, lim = 0.75, rand = Math.random) {
    const z = Z[zi];
    for (let i = 0; i < 300; i++) {
      const x = z.x + (rand() - 0.5) * 2.2 * z.rx, y = z.y + (rand() - 0.5) * 2.2 * z.ry, s = sample(x, y);
      if (s.z === zi && s.r < lim) return [x, y];
    }
    return [z.x, z.y];
  }
  function bbox(zi) {
    const z = Z[zi];
    const b = [z.x - z.rx * 1.3, z.y - z.ry * 1.3, z.x + z.rx * 1.3, z.y + z.ry * 1.3];
    if (z.pbox) { b[0] = Math.min(b[0], z.pbox[0]); b[1] = Math.min(b[1], z.pbox[1]); b[2] = Math.max(b[2], z.pbox[2]); b[3] = Math.max(b[3], z.pbox[3]); }
    return b;
  }

  // ── tesoros: rincones con sorpresa dentro de cada zona (se encuentran tocándolos, una sola vez) ──
  const hr = (k) => { const s = Math.sin(k * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  let seedK = 1;
  const seeded = () => hr(seedK++);
  const shoreIn = (zi, ang, back) => {
    const p = shorePoint(zi, ang, 0.9) || randomPoint(zi, 0.8, seeded);
    const z = Z[zi], dx = z.x - p[0], dy = z.y - p[1], l = Math.hypot(dx, dy) || 1;
    return [p[0] + dx / l * back, p[1] + dy / l * back];
  };
  const TREASURES = [
    { id: 'cofre', z: 0, name: 'Cofre', pos: shoreIn(0, 1.0, 4) },
    { id: 'tortuga', z: 1, name: 'Isla de la tortuga', pos: [ISLANDS[1][0].x, ISLANDS[1][0].y] },
    { id: 'botella', z: 2, name: 'Botella con mensaje', pos: randomPoint(2, 0.6, seeded) },
    { id: 'cristal', z: 3, name: 'Cristal de la cueva', pos: shoreIn(3, -0.25, 3) },
    { id: 'barca', z: 4, name: 'Barca hundida', pos: randomPoint(4, 0.35, seeded) },
    { id: 'idolo', z: 5, name: 'Ídolo del templo', pos: [ISLANDS[5][0].x, ISLANDS[5][0].y] },
  ].map((o) => ({ ...o, x: o.pos[0], y: o.pos[1] }));

  return { Z, N, MAIN, RS, ISLANDS, TREASURES, sample, rAt, zoneAt, borders, adj, waypoint, secretPath, shorePoint, randomPoint, bbox };
})();

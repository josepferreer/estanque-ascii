/* Los nenúfares de las máquinas gachapon: un mismo nenúfar con una flor que se abre, y en cada zona cambian
 * los colores y un detalle propio. Aquí solo se dibuja; la lógica de la tirada vive en main.js.
 *
 * Se dibuja en las "unidades de boceto" (88 de ancho, el centro del nenúfar en (44, 60)) y se escala con K.
 *   draw(g, id, x, y, K, st)   st = { t, open (0 cerrada · 1 abierta), dx (temblor), capShow, capCol, capY, capSplit,
 *                                     glowRgb, glowA }
 */
const PADS = (() => {
  const E = (g, x, y, rx, ry, c) => { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill(); };
  const ES = (g, x, y, rx, ry, c, w) => { g.strokeStyle = c; g.lineWidth = w || 1; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.stroke(); };
  const P = (g, pts, c) => { g.fillStyle = c; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.fill(); };
  const L = (g, a, b, c, w) => { g.strokeStyle = c; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); };
  const GL = (g, x, y, r, rgb, a) => {
    const k = g.createRadialGradient(x, y, 0, x, y, r);
    k.addColorStop(0, `rgba(${rgb},${a})`); k.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = k; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  };
  // nenúfar con su muesca (el corte que tienen todos los nenúfares)
  const padPath = (g, cx, cy, rx, ry) => { g.beginPath(); g.moveTo(cx, cy); g.ellipse(cx, cy, rx, ry, 0, 0.3, Math.PI * 2 - 0.3); g.closePath(); };
  // media luna: círculo grande menos otro desplazado (se recorta al círculo grande)
  function crescent(g, x, y, r, col) {
    g.save(); g.beginPath(); g.arc(x, y, r, 0, 7); g.clip();
    g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, 7); g.moveTo(x + r * 0.55 + r * 0.9, y - r * 0.2); g.arc(x + r * 0.55, y - r * 0.2, r * 0.9, 0, 7); g.fill('evenodd');
    g.restore();
  }
  const twinkle = (t, i) => 0.35 + 0.65 * Math.abs(Math.sin(t * 1.7 + i * 2.3));

  const V = {
    estanque: {
      pad: '#4f9a4a', padHi: '#6ab85e', vein: 'rgba(30,70,30,.6)', petalDark: '#e8a0b8', petal: '#f4bcd0', petalHi: '#ffe3ec', cap: '#ffb703', glow: '255,200,80',
      front(g, t) {                                                // una boya roja que cabecea y un farolillo flotando
        const b = Math.sin(t * 1.8) * 1.2;
        E(g, 76, 70 + b, 3.6, 3.6, '#f5f5f5'); E(g, 76, 68 + b, 3.6, 2.4, '#e63946'); L(g, [76, 66 + b], [76, 58 + b], '#ddd', 0.8);
        E(g, 12, 64 + b * 0.5, 5, 2.2, '#6b4a2b'); E(g, 12, 60 + b * 0.5, 2.6, 3, '#ffd23f'); GL(g, 12, 60 + b * 0.5, 9, '255,210,90', 0.5);
      },
    },
    nenufares: {
      pad: '#3f9a4a', padHi: '#63c070', vein: 'rgba(20,70,30,.6)', petalDark: '#e87aa8', petal: '#f49ac0', petalHi: '#ffd0e4', cap: '#ffb703', glow: '255,200,80',
      back(g) { E(g, 12, 70, 9, 3.4, '#4fb06a'); E(g, 78, 72, 8, 3, '#4fb06a'); E(g, 8, 54, 6, 2.4, '#4fb06a'); E(g, 80, 48, 5, 2, '#5cc07a'); E(g, 12, 69, 2, 1.4, '#f4a6c8'); },
      front(g, t) {                                                // una rana en el borde, que parpadea
        E(g, 66, 56, 5.4, 4, '#5a8a4e'); E(g, 62, 52, 2, 2, '#5a8a4e'); E(g, 70, 52, 2, 2, '#5a8a4e');
        if ((t * 0.5) % 3 > 0.12) { E(g, 62, 52, 0.9, 0.9, '#ffd23f'); E(g, 70, 52, 0.9, 0.9, '#ffd23f'); }
      },
    },
    cascada: {
      pad: '#3f9a8a', padHi: '#6cc7b4', vein: 'rgba(20,80,90,.55)', petalDark: '#9cc6e8', petal: '#c4e0f4', petalHi: '#f4fbff', cap: '#4cc9f0', glow: '120,220,255',
      back(g, t) {
        const k = 0.45 + 0.25 * Math.sin(t * 2.2);
        ES(g, 44, 62, 38, 15, `rgba(255,255,255,${k})`, 2); ES(g, 44, 62, 31, 12, `rgba(255,255,255,${k * 0.7})`, 1.5);
        [[10, 60], [78, 64], [20, 72], [68, 74]].forEach((a, i) => E(g, a[0], a[1], 4, 1.6, `rgba(255,255,255,${0.35 + 0.35 * Math.sin(t * 3 + i)})`));
      },
      front(g, t) {                                                // gotas que caen sobre la flor
        [18, 30, 58, 70].forEach((x, i) => { const y = ((t * 26 + i * 11) % 30); L(g, [x, y], [x, y + 7], 'rgba(190,230,255,.75)', 1.3); });
      },
    },
    cueva: {
      pad: '#1d5a66', padHi: '#2c8a98', vein: (t) => `rgba(120,240,255,${0.65 + 0.3 * Math.sin(t * 2)})`, petalDark: '#6a7fe0', petal: '#8fb4ff', petalHi: '#bff8ff', cap: '#be96ff', glow: '190,150,255',
      back(g, t) { GL(g, 44, 60, 38, '120,240,255', 0.22 + 0.06 * Math.sin(t * 1.4)); },
      front(g, t) {                                                // cristales en el borde y chispas
        P(g, [[68, 60], [72, 44], [76, 60]], '#78f0ff'); P(g, [[74, 62], [78, 52], [82, 62]], '#be96ff');
        P(g, [[12, 64], [16, 50], [20, 64]], '#be96ff'); P(g, [[18, 66], [21, 58], [24, 66]], '#78f0ff');
        [[30, 22], [60, 18], [50, 10], [26, 40]].forEach((a, i) => { g.globalAlpha = twinkle(t, i); E(g, a[0], a[1], 1, 1, '#bff8ff'); g.globalAlpha = 1; });
      },
    },
    luna: {
      pad: '#6a7fb8', padHi: '#98abdc', vein: 'rgba(60,70,130,.6)', petalDark: '#c8d2f4', petal: '#e2e8fb', petalHi: '#ffffff', cap: '#fff3b0', glow: '255,243,176',
      moon(t) { const a = t * 0.7; return { x: 44 + Math.cos(a) * 41, y: 50 + Math.sin(a) * 14, front: Math.sin(a) > 0, a }; },
      back(g, t) {
        [[10, 52], [78, 48], [16, 74], [72, 76], [60, 40], [26, 44]].forEach((a, i) => { g.globalAlpha = twinkle(t, i); L(g, [a[0] - 2, a[1]], [a[0] + 2, a[1]], '#fff', 0.8); L(g, [a[0], a[1] - 2], [a[0], a[1] + 2], '#fff', 0.8); g.globalAlpha = 1; });
        const m = V.luna.moon(t); if (!m.front) V.luna.drawMoon(g, m);
      },
      front(g, t) { const m = V.luna.moon(t); if (m.front) V.luna.drawMoon(g, m); },
      drawMoon(g, m) {                                             // la minilluna: da vueltas alrededor del nenúfar
        GL(g, m.x, m.y, 15, '255,243,176', 0.5);
        g.save(); g.translate(m.x, m.y); g.rotate(m.a * 0.5 + 0.6); crescent(g, 0, 0, 8.5, '#fff6c0'); g.restore();
      },
    },
    templo: {
      pad: '#2e8a6a', padHi: '#56b894', vein: 'rgba(230,190,80,.85)', rim: '#e0b040', petalDark: '#d9a441', petal: '#f0c15c', petalHi: '#fff0b0', cap: '#ff4d8d', glow: '255,77,141',
      back(g) { [[14, 58], [74, 58], [28, 72], [60, 72]].forEach((a) => { g.fillStyle = '#8f8a70'; g.fillRect(a[0] - 2.5, a[1] - 9, 5, 10); g.fillStyle = '#b0aa8c'; g.fillRect(a[0] - 3.2, a[1] - 10, 6.4, 2.2); }); },
      front(g, t) { [[30, 60], [58, 60], [44, 66]].forEach((a, i) => { g.globalAlpha = 0.6 + 0.4 * twinkle(t, i); g.fillStyle = '#e0b040'; g.fillRect(a[0] - 1.4, a[1] - 1.4, 2.8, 2.8); g.globalAlpha = 1; }); },
    },
    portal: {
      pad: '#4a2f80', padHi: '#7a50c8', vein: (t) => `rgba(255,120,230,${0.7 + 0.25 * Math.sin(t * 2.4)})`, petalDark: '#9a4fd0', petal: '#c77dff', petalHi: '#f0c8ff', cap: '#4cc9f0', glow: '200,130,255',
      back(g, t) {                                                 // un remolino en el agua
        g.strokeStyle = 'rgba(200,130,255,.5)'; g.lineWidth = 1.2; g.beginPath();
        for (let a = 0; a < 12; a += 0.15) { const r = 3 + a * 3.4, b = a + t * 0.6; g.lineTo(44 + Math.cos(b) * r * 1.15, 62 + Math.sin(b) * r * 0.45); }
        g.stroke();
      },
      front(g, t) {                                                // aro de runas y rombos que orbitan
        g.save(); g.translate(44, 36); g.rotate(-0.35 + Math.sin(t * 0.8) * 0.12); ES(g, 0, 0, 26, 8, 'rgba(255,120,230,.85)', 1.3); g.restore();
        for (let i = 0; i < 3; i++) {
          const a = t * 0.9 + i * 2.1, x = 44 + Math.cos(a) * 30, y = 30 + Math.sin(a) * 9;
          P(g, [[x, y - 3], [x + 2, y], [x, y + 3], [x - 2, y]], '#f0c8ff');
        }
      },
    },
  };

  function draw(g, id, x, y, K, st) {
    const v = V[id]; if (!v) return;
    const t = st.t, open = st.open == null ? 0.75 : st.open;
    g.save(); g.translate(x - 44 * K, y - 60 * K); g.scale(K, K);
    // ondas alrededor, para que se vea que flota
    const rp = 0.5 + 0.5 * Math.sin(t * 1.2);
    ES(g, 44, 60, 40 + rp * 2, 16 + rp * 0.8, 'rgba(255,255,255,.16)', 1); ES(g, 44, 60, 35, 13, 'rgba(255,255,255,.1)', 1);
    if (v.back) v.back(g, t, st);
    // el nenúfar
    padPath(g, 44, 61, 32, 12.5); g.fillStyle = 'rgba(0,0,0,.28)'; g.fill();
    padPath(g, 44, 58, 32, 12); g.fillStyle = v.pad; g.fill();
    E(g, 44, 56.5, 26, 9, v.padHi);
    const vein = typeof v.vein === 'function' ? v.vein(t) : v.vein;
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + 0.7; L(g, [44, 57], [44 + Math.cos(a) * 30, 57 + Math.sin(a) * 11], vein, 0.9); }
    if (v.rim) { g.strokeStyle = v.rim; g.lineWidth = 1.4; g.beginPath(); g.ellipse(44, 58, 32, 12, 0, 0.3, Math.PI * 2 - 0.3); g.stroke(); }
    // la flor (puede temblar)
    g.save(); g.translate(st.dx || 0, 0);
    const spread = 0.4 + 0.6 * open, len = 0.72 + 0.28 * open;
    [-52, -30, -11, 11, 30, 52].forEach((a) => {
      const r = a * spread * Math.PI / 180, tx = 44 + Math.sin(r) * 24 * (0.5 + 0.5 * open), ty = 53 - Math.cos(r) * (26 - Math.abs(a) * 0.16) * len;
      P(g, [[44 - 6, 56], [tx, ty], [44 + 6, 56]], Math.abs(a) > 40 ? v.petalDark : Math.abs(a) > 20 ? v.petal : v.petalHi);
    });
    E(g, 44, 55, 6, 3, v.petalHi);
    g.restore();
    const gl = st.glowRgb || v.glow;
    GL(g, 44, 30, 18, gl, st.glowA == null ? 0.65 : st.glowA);
    // la cápsula: flota sobre la flor; al salir se parte en dos mitades
    if (st.capShow !== false) {
      const col = st.capCol || v.cap, cy = st.capY == null ? 27 + Math.sin(t * 2) * 1.2 : st.capY, sp = st.capSplit || 0;
      if (sp > 0) {
        g.fillStyle = col; g.beginPath(); g.arc(44 - sp * 7, cy - sp * 3, 4.6, Math.PI, 0); g.closePath(); g.fill();
        g.fillStyle = '#f2f2f2'; g.beginPath(); g.arc(44 + sp * 7, cy + sp * 3, 4.6, 0, Math.PI); g.closePath(); g.fill();
      } else {
        E(g, 44, cy, 4.6, 4.6, col); g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(44, cy, 4.6, 0, Math.PI); g.fill();
        g.fillStyle = col; g.beginPath(); g.arc(44, cy, 4.6, Math.PI, 0); g.fill();
        E(g, 42.6, cy - 1.6, 1.3, 1.3, 'rgba(255,255,255,.8)');
      }
    }
    if (v.front) v.front(g, t, st);
    g.restore();
  }
  return { draw, VARIANTS: V };
})();

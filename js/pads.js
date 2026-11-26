/* Los nenúfares de las máquinas gachapon: un mismo nenúfar visto desde arriba (como el resto del juego) con una flor que se abre,
 * y en cada zona cambian los colores y un detalle propio. Aquí solo se dibuja; la lógica de la tirada vive en main.js.
 *
 * Se dibuja en "unidades de boceto" (el centro del nenúfar en (44, 40), radio 30) y se escala con K.
 *   draw(g, id, x, y, K, st)   st = { t, open (0 cerrada · 1 abierta), dx (temblor), capShow, capCol, capY, capSplit, glowRgb, glowA }
 *   capY viene de main.js en unidades antiguas (27 = flotando sobre la flor, 53 = hundida, -6 = arriba del todo).
 */
const PADS = (() => {
  const CX = 44, CY = 40, R = 30;
  const E = (g, x, y, rx, ry, c) => { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill(); };
  const ES = (g, x, y, rx, ry, c, w) => { g.strokeStyle = c; g.lineWidth = w || 1; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.stroke(); };
  const P = (g, pts, c) => { g.fillStyle = c; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.fill(); };
  const L = (g, a, b, c, w) => { g.strokeStyle = c; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); };
  const GL = (g, x, y, r, rgb, a) => {
    const k = g.createRadialGradient(x, y, 0, x, y, r);
    k.addColorStop(0, `rgba(${rgb},${a})`); k.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = k; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  };
  const twinkle = (t, i) => 0.35 + 0.65 * Math.abs(Math.sin(t * 1.7 + i * 2.3));
  // media luna: círculo grande menos otro desplazado (se recorta al círculo grande)
  function crescent(g, x, y, r, col, ang) {
    g.save(); g.translate(x, y); g.rotate(ang);
    g.beginPath(); g.arc(0, 0, r, 0, 7); g.clip();
    g.fillStyle = col; g.beginPath(); g.arc(0, 0, r, 0, 7); g.moveTo(r * 0.55 + r * 0.9, -r * 0.2); g.arc(r * 0.55, -r * 0.2, r * 0.9, 0, 7); g.fill('evenodd');
    g.restore();
  }
  function petals(g, n, len, wid, rot, col, off) {
    for (let i = 0; i < n; i++) { g.save(); g.translate(CX, CY); g.rotate(rot + i * Math.PI * 2 / n); E(g, (off || 0) + len / 2, 0, len / 2, wid, col); g.restore(); }
  }

  const V = {
    estanque: {
      pad: '#4f9a4a', padHi: '#6ab85e', vein: 'rgba(30,70,30,.55)', petalDark: '#e8a0b8', petal: '#f4bcd0', petalHi: '#ffe3ec', cap: '#ffb703', glow: '255,200,80',
      front(g, t) {                                                // una boya roja que cabecea y un farolillo flotando
        const b = Math.sin(t * 1.8) * 0.6;
        E(g, CX + 40, CY + 22, 3.4 + b * 0.3, 3.4 + b * 0.3, '#f5f5f5'); E(g, CX + 40, CY + 22, 2.2, 2.2, '#e63946');
        E(g, CX - 38, CY + 14, 3, 3, '#6b4a2b'); E(g, CX - 38, CY + 14, 2, 2, '#ffd23f'); GL(g, CX - 38, CY + 14, 9, '255,210,90', 0.45 + 0.15 * Math.sin(t * 3));
      },
    },
    nenufares: {
      pad: '#3f9a4a', padHi: '#63c070', vein: 'rgba(20,70,30,.55)', petalDark: '#e87aa8', petal: '#f49ac0', petalHi: '#ffd0e4', cap: '#ffb703', glow: '255,200,80',
      back(g) { E(g, 10, 62, 9, 9, '#4fb06a'); E(g, 78, 66, 8, 8, '#4fb06a'); E(g, 10, 16, 6, 6, '#5cc07a'); E(g, 12, 62, 2, 2, '#f4a6c8'); },
      front(g, t) {                                                // una rana en el borde, que parpadea
        E(g, CX + 22, CY - 20, 5, 6.2, '#5a8a4e'); E(g, CX + 22, CY - 14, 1.5, 1.5, '#4e7a3e');
        if ((t * 0.5) % 3 > 0.12) { E(g, CX + 20, CY - 25, 1.6, 1.6, '#ffd23f'); E(g, CX + 25, CY - 24, 1.6, 1.6, '#ffd23f'); }
      },
    },
    cascada: {
      pad: '#3f9a8a', padHi: '#6cc7b4', vein: 'rgba(20,80,90,.5)', petalDark: '#9cc6e8', petal: '#c4e0f4', petalHi: '#f4fbff', cap: '#4cc9f0', glow: '120,220,255',
      back(g, t) {
        const k = 0.45 + 0.25 * Math.sin(t * 2.2);
        ES(g, CX, CY, 35, 35, `rgba(255,255,255,${k})`, 2); ES(g, CX, CY, 41, 41, `rgba(255,255,255,${k * 0.6})`, 1.5);
      },
      front(g, t) {                                                // gotas que caen alrededor: cada una abre un anillo
        [[10, 12], [74, 16], [70, 66], [14, 64], [44, 4]].forEach((a, i) => {
          const p = ((t * 0.9 + i * 0.37) % 1);
          ES(g, a[0], a[1], 1 + p * 5, 1 + p * 5, `rgba(255,255,255,${0.8 * (1 - p)})`, 1); E(g, a[0], a[1], 1, 1, '#fff');
        });
      },
    },
    cueva: {
      pad: '#1d5a66', padHi: '#2c8a98', vein: (t) => `rgba(120,240,255,${0.65 + 0.3 * Math.sin(t * 2)})`, petalDark: '#6a7fe0', petal: '#8fb4ff', petalHi: '#bff8ff', cap: '#be96ff', glow: '190,150,255',
      back(g, t) { GL(g, CX, CY, 40, '120,240,255', 0.22 + 0.06 * Math.sin(t * 1.4)); },
      front(g, t) {                                                // cristales en el borde
        [[CX + 30, CY - 16, '#78f0ff', '120,240,255'], [CX + 34, CY - 6, '#be96ff', '190,150,255'], [CX - 32, CY + 12, '#be96ff', '190,150,255'], [CX - 28, CY + 20, '#78f0ff', '120,240,255'], [CX + 4, CY + 34, '#78f0ff', '120,240,255']].forEach((a, i) => {
          P(g, [[a[0] - 3, a[1] + 4], [a[0], a[1] - 5], [a[0] + 3, a[1] + 4]], a[2]); GL(g, a[0], a[1], 7, a[3], 0.25 + 0.2 * twinkle(t, i));
        });
      },
    },
    luna: {
      pad: '#4d629c', padHi: '#6f84c0', vein: 'rgba(60,70,130,.55)', petalDark: '#a3b0e6', petal: '#c6d0f6', petalHi: '#f4f7ff', cap: '#fff3b0', glow: '255,243,176',
      back(g, t) {
        [[8, 10], [78, 12], [10, 70], [76, 72], [44, 2], [84, 40]].forEach((a, i) => { g.globalAlpha = twinkle(t, i); L(g, [a[0] - 2, a[1]], [a[0] + 2, a[1]], '#fff', 0.8); L(g, [a[0], a[1] - 2], [a[0], a[1] + 2], '#fff', 0.8); g.globalAlpha = 1; });
        ES(g, CX, CY, 38, 38, 'rgba(255,243,176,.2)', 0.8);
      },
      front(g, t) {                                                // la minilluna: da vueltas alrededor del nenúfar
        const a = t * 0.7 - 0.7, mx = CX + Math.cos(a) * 38, my = CY + Math.sin(a) * 38;
        GL(g, mx, my, 15, '255,243,176', 0.5); crescent(g, mx, my, 7.5, '#fff6c0', a + Math.PI * 0.5);
      },
    },
    templo: {
      pad: '#2e8a6a', padHi: '#56b894', vein: 'rgba(230,190,80,.8)', rim: '#e0b040', petalDark: '#d9a441', petal: '#f0c15c', petalHi: '#fff0b0', cap: '#c8ffe8', glow: '160,255,210',
      front(g, t) {                                                // cuatro pilares vistos desde arriba y runas doradas
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach((a) => { const x = CX + a[0] * 36, y = CY + a[1] * 36; g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(x - 3.5, y - 2.5, 7, 7); g.fillStyle = '#8f8a70'; g.fillRect(x - 4, y - 4, 7, 7); g.fillStyle = '#b0aa8c'; g.fillRect(x - 3, y - 3, 5, 5); });
        [[CX - 18, CY + 18], [CX + 18, CY + 18], [CX, CY + 26]].forEach((a, i) => { g.globalAlpha = 0.6 + 0.4 * twinkle(t, i); g.fillStyle = '#e0b040'; g.fillRect(a[0] - 1.4, a[1] - 1.4, 2.8, 2.8); g.globalAlpha = 1; });
      },
    },
    portal: {
      pad: '#4a2f80', padHi: '#7a50c8', vein: (t) => `rgba(255,120,230,${0.7 + 0.25 * Math.sin(t * 2.4)})`, petalDark: '#9a4fd0', petal: '#c77dff', petalHi: '#f0c8ff', cap: '#4cc9f0', glow: '200,130,255',
      back(g, t) {                                                 // un remolino en el agua
        g.strokeStyle = 'rgba(200,130,255,.5)'; g.lineWidth = 1.2; g.beginPath();
        for (let a = 0; a < 14; a += 0.15) { const r = 3 + a * 2.9, b = a + t * 0.6; g.lineTo(CX + Math.cos(b) * r, CY + Math.sin(b) * r); }
        g.stroke();
      },
      front(g, t) {                                                // aro de runas y rombos que orbitan
        g.strokeStyle = 'rgba(255,120,230,.8)'; g.lineWidth = 1.3; g.setLineDash([5, 3]); g.lineDashOffset = -t * 6; g.beginPath(); g.arc(CX, CY, 34, 0, 7); g.stroke(); g.setLineDash([]);
        for (let i = 0; i < 3; i++) { const a = t * 0.9 + i * 2.1, x = CX + Math.cos(a) * 34, y = CY + Math.sin(a) * 34; P(g, [[x, y - 3.5], [x + 2.4, y], [x, y + 3.5], [x - 2.4, y]], '#f0c8ff'); }
      },
    },
  };

  function draw(g, id, x, y, K, st) {
    const v = V[id]; if (!v) return;
    const t = st.t, open = st.open == null ? 0.75 : st.open;
    g.save(); g.translate(x - CX * K, y - CY * K); g.scale(K, K);
    // ondas alrededor, para que se vea que flota
    const rp = 0.5 + 0.5 * Math.sin(t * 1.2);
    ES(g, CX, CY, 37 + rp * 2, 37 + rp * 2, 'rgba(255,255,255,.14)', 1);
    if (v.back) v.back(g, t, st);
    // el nenúfar, con su sombra, su muesca y sus venas
    E(g, CX + 1.5, CY + 2.5, R, R, 'rgba(0,0,0,.3)');
    g.fillStyle = v.pad; g.beginPath(); g.moveTo(CX, CY); g.arc(CX, CY, R, 0.45, Math.PI * 2 - 0.05); g.closePath(); g.fill();
    E(g, CX - 2, CY - 2, 24, 24, v.padHi);
    const vein = typeof v.vein === 'function' ? v.vein(t) : v.vein;
    for (let i = 0; i < 9; i++) { const a = 0.9 + i * Math.PI * 2 / 9; L(g, [CX, CY], [CX + Math.cos(a) * 29, CY + Math.sin(a) * 29], vein, 0.9); }
    if (v.rim) { g.strokeStyle = v.rim; g.lineWidth = 1.5; g.beginPath(); g.arc(CX, CY, R, 0.45, Math.PI * 2 - 0.05); g.stroke(); }
    // la flor: roseta de tres anillos de pétalos (puede temblar)
    g.save(); g.translate(st.dx || 0, 0);
    GL(g, CX, CY, 22, st.glowRgb || v.glow, st.glowA == null ? 0.6 : st.glowA);
    petals(g, 8, 6 + 16 * open, 5.5 - 1.5 * (1 - open), 0.2, v.petalDark, 2);
    petals(g, 8, 5 + 11 * open, 4.6 - 1.2 * (1 - open), 0.6, v.petal, 1);
    petals(g, 6, 4 + 6 * open, 3.6, 0.1, v.petalHi, 0);
    g.restore();
    // la cápsula: sobre la flor; al subir crece y su sombra se queda en la flor; al abrirse se parte en dos mitades
    if (st.capShow !== false) {
      const col = st.capCol || v.cap, capY = st.capY == null ? 27 + Math.sin(t * 2) * 1.2 : st.capY, lift = Math.max(0, (53 - capY) * 0.22), r = 5 + lift * 0.15, sp = st.capSplit || 0;
      if (lift > 0.5) E(g, CX + lift * 0.7, CY + lift * 1.1, r, r * 0.8, 'rgba(0,0,0,.28)');
      if (sp > 0) {
        g.fillStyle = col; g.beginPath(); g.arc(CX - sp * 8, CY - lift - sp * 3, r, Math.PI * 0.5, Math.PI * 1.5); g.closePath(); g.fill();
        g.fillStyle = '#f2f2f2'; g.beginPath(); g.arc(CX + sp * 8, CY - lift + sp * 3, r, -Math.PI * 0.5, Math.PI * 0.5); g.closePath(); g.fill();
      } else {
        if (st.capCol) {                                           // cápsula (ya sale con el color de su rareza): arriba el color, abajo el mismo color más claro, y su junta
          E(g, CX, CY - lift, r, r, col); g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.arc(CX, CY - lift, r, 0, Math.PI); g.closePath(); g.fill();
          L(g, [CX - r, CY - lift], [CX + r, CY - lift], 'rgba(0,0,0,.35)', 0.7);
        } else {                                                   // en reposo es una perla: no se confunde con una boya
          E(g, CX, CY - lift, r, r, col); E(g, CX, CY - lift, r * 0.62, r * 0.62, 'rgba(255,255,255,.35)');
        }
        E(g, CX - r * 0.35, CY - lift - r * 0.4, r * 0.25, r * 0.25, 'rgba(255,255,255,.9)');
      }
    }
    if (v.front) v.front(g, t, st);
    g.restore();
  }
  return { draw, VARIANTS: V };
})();

/* Marcos del panel de los nenúfares: uno por zona, pintados (rocas y cristales en la Cueva, ladrillo y oro en el Templo...)
 * y convertidos a letras, igual que la escena. Solo se pinta el borde: el interior queda transparente.
 *
 *   FRAMES.draw(canvas, id, cssW, cssH, border)   id = id de la zona · border = grosor del marco en píxeles CSS
 */
const FRAMES = (() => {
  const RAMP = ' .:-=+*%#@', CW = 4, CH = 6, B = 26;            // B: grosor del marco en las unidades de dibujo
  const rr = (s) => { let k = s; return () => (k = (k * 16807) % 2147483647) / 2147483647; };
  const E = (g, x, y, rx, ry, c) => { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill(); };
  const P = (g, p, c) => { g.fillStyle = c; g.beginPath(); p.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.closePath(); g.fill(); };
  const L = (g, a, b, c, w) => { g.strokeStyle = c; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); };
  const GL = (g, x, y, r, rgb, a) => { const k = g.createRadialGradient(x, y, 0, x, y, r); k.addColorStop(0, `rgba(${rgb},${a})`); k.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = k; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
  const band = (g, W, H, fn) => { g.save(); g.beginPath(); g.rect(0, 0, W, H); g.rect(B, B, W - 2 * B, H - 2 * B); g.clip('evenodd'); fn(); g.restore(); };
  const corners = (W, H) => [[B * 0.8, B * 0.8], [W - B * 0.8, B * 0.8], [B * 0.8, H - B * 0.8], [W - B * 0.8, H - B * 0.8]];
  function crystal(g, x, y, h, ang, c1, c2) {
    const w = h * 0.26, tx = x + Math.sin(ang) * h, ty = y - Math.cos(ang) * h, nx = Math.cos(ang) * w, ny = Math.sin(ang) * w;
    P(g, [[x - nx, y - ny], [tx, ty], [x + nx, y + ny]], c1); P(g, [[x, y], [tx, ty], [x + nx, y + ny]], c2);
  }
  const area = (W, H) => Math.max(1, (W * H) / (336 * 200));        // cuántos elementos caben: más grande, más decorado

  const Z = {
    estanque(g, W, H) {                                              // tablones, cuerda, juncos, boya y farolillo
      const r = rr(7), k = area(W, H);
      band(g, W, H, () => {
        g.fillStyle = '#6b4a2b'; g.fillRect(0, 0, W, H);
        for (let y = 0; y < H; y += 13) { g.fillStyle = ['#8a6a42', '#7a5a36', '#946f45'][(y / 13 | 0) % 3]; g.fillRect(0, y, W, 11); L(g, [0, y + 12], [W, y + 12], '#3a2814', 1.5); }
        for (let i = 0; i < 90 * k; i++) { const x = r() * W, y = r() * H; L(g, [x, y], [x + 6 + r() * 10, y], 'rgba(60,38,18,.5)', 0.8); }
        corners(W, H).forEach((a) => E(g, a[0] - (a[0] < W / 2 ? 6 : -6) * 0.2, a[1], 2, 2, '#2a2a2a'));
      });
      g.strokeStyle = '#d9c08a'; g.lineWidth = 4; g.setLineDash([5, 3]); g.strokeRect(B - 3, B - 3, W - 2 * B + 6, H - 2 * B + 6); g.setLineDash([]);
      for (let x = 34; x < 92; x += 6) L(g, [x, H - 4], [x + ((x % 12) ? 2 : -2), H - B - 6 - r() * 14], '#4f9a4a', 2);
      for (let x = 34; x < 92; x += 18) E(g, x, H - B - 10 - r() * 8, 2, 4, '#6b4a2b');
      E(g, W - 18, 16, 7, 7, '#f5f5f5'); E(g, W - 18, 15, 7, 5, '#e63946'); L(g, [W - 18, 9], [W - 18, 2], '#ddd', 1);
      E(g, 18, H - 18, 5, 5, '#ffd23f'); GL(g, 18, H - 18, 18, '255,210,90', 0.7);
    },
    nenufares(g, W, H) {                                             // hojas, lotos y juncos
      const r = rr(11), k = area(W, H);
      band(g, W, H, () => {
        g.fillStyle = '#1d5a3c'; g.fillRect(0, 0, W, H);
        for (let i = 0; i < 80 * k; i++) { const x = r() * W, y = r() * H; L(g, [x, y], [x + 10, y + 2], 'rgba(120,230,190,.25)', 1); }
        for (let i = 0; i < 34 * k; i++) {
          const x = r() * W, y = r() * H, rad = 7 + r() * 8;
          g.fillStyle = ['#3f9a4a', '#4fb06a', '#2e8a4a'][i % 3]; g.beginPath(); g.moveTo(x, y); g.arc(x, y, rad, 0.4, 6.0); g.closePath(); g.fill();
          if (i % 4 === 0) { E(g, x + 2, y - 2, 3, 3, '#f49ac0'); E(g, x + 2, y - 2, 1.2, 1.2, '#ffe66d'); }
        }
      });
      corners(W, H).forEach((c) => { for (let j = 0; j < 8; j++) { const a = j * Math.PI / 4; E(g, c[0] + Math.cos(a) * 7, c[1] + Math.sin(a) * 7, 6, 3, '#f49ac0'); } E(g, c[0], c[1], 5, 5, '#ffd0e4'); E(g, c[0], c[1], 2.5, 2.5, '#ffe66d'); });
      for (let x = 60; x < W - 60; x += 46) { L(g, [x, B], [x + 4, B + 12 + r() * 8], '#3f9a4a', 2); E(g, x + 4, B + 14, 2, 3, '#8a6a42'); }
    },
    cascada(g, W, H) {                                               // cascadas en los laterales, rocas con musgo y espuma
      const r = rr(5), k = area(W, H);
      band(g, W, H, () => {
        g.fillStyle = '#56606b'; g.fillRect(0, 0, W, H);
        for (let i = 0; i < 70 * k; i++) E(g, r() * W, r() * H, 5 + r() * 7, 4 + r() * 5, ['#6a737e', '#4a5460', '#7a828c'][i % 3]);
        for (let i = 0; i < 24 * k; i++) E(g, r() * W, r() * H, 3, 2, '#4f8a4a');
        [0, W - B].forEach((x0) => {
          const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#bfe8ff'); gr.addColorStop(1, '#4aa3d6'); g.fillStyle = gr; g.fillRect(x0 + 3, 0, B - 6, H);
          for (let i = 0; i < 14 * k; i++) { const x = x0 + 5 + r() * (B - 10), y = r() * H; L(g, [x, y], [x, y + 40], 'rgba(255,255,255,.7)', 1.4); }
        });
      });
      [[B / 2, H - B / 2], [W - B / 2, H - B / 2]].forEach((a) => { for (let i = 0; i < 7; i++) E(g, a[0] + (r() - 0.5) * 22, a[1] + (r() - 0.5) * 10, 6 + r() * 6, 4 + r() * 3, 'rgba(255,255,255,.75)'); GL(g, a[0], a[1] - 6, 26, '220,240,255', 0.45); });
      for (let i = 0; i < 14 * k; i++) { const x = B + 10 + r() * (W - 2 * B - 20); E(g, x, B + 3 + r() * 4, 1.5, 2.4, '#bfe8ff'); }
    },
    cueva(g, W, H) {                                                 // rocas, estalactitas, cristales y setas
      const r = rr(3), k = area(W, H);
      band(g, W, H, () => {
        g.fillStyle = '#4a4666'; g.fillRect(0, 0, W, H);
        for (let i = 0; i < 150 * k; i++) { const x = r() * W, y = r() * H, rad = 5 + r() * 8; E(g, x, y, rad, rad * 0.8, ['#6a6488', '#7d7799', '#55506f', '#9690b4'][i % 4]); E(g, x - rad * 0.25, y - rad * 0.3, rad * 0.45, rad * 0.3, 'rgba(255,255,255,.12)'); }
      });
      g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 3; g.strokeRect(B, B, W - 2 * B, H - 2 * B);
      for (let x = B + 8; x < W - B - 8; x += 20) { const h = 8 + r() * 13; P(g, [[x - 5, B], [x + 5, B], [x + r() * 3 - 1.5, B + h]], '#5d5878'); P(g, [[x, B], [x + 5, B], [x + 1, B + h]], '#4a4560'); }
      corners(W, H).forEach((c, kk) => {
        GL(g, c[0], c[1], 34, kk % 2 ? '190,150,255' : '120,240,255', 0.5);
        [[-0.5, '#78f0ff', '#bff8ff', 20], [0.1, '#bff8ff', '#78f0ff', 26], [0.6, '#be96ff', '#e0cdff', 18], [-1.0, '#be96ff', '#78f0ff', 14]].forEach((q, j) => {
          const sx = kk % 2 ? -1 : 1, sy = kk < 2 ? 1 : -1;
          crystal(g, c[0] + sx * (j - 1.5) * 3.5, c[1] + sy * 7, q[3] * 1.05, (kk < 2 ? Math.PI : 0) + q[0] * sx, q[1], q[2]);
        });
      });
      const mid = [[W / 2 - 50, H - 6, '#78f0ff'], [W / 2 + 40, H - 5, '#be96ff'], [10, H / 2, '#78f0ff'], [W - 10, H / 2 + 20, '#be96ff']];
      for (let x = 90; x < W - 90; x += 120) mid.push([x, B * 0.4, x % 2 ? '#78f0ff' : '#be96ff']);
      mid.forEach((q) => { GL(g, q[0], q[1] - 6, 14, q[2] === '#78f0ff' ? '120,240,255' : '190,150,255', 0.4); crystal(g, q[0], q[1], 13, q[0] < 20 ? 1.2 : q[0] > W - 20 ? -1.2 : 0, q[2], '#e8fbff'); });
      [[W / 2 - 10, H - 9], [W / 2 + 22, H - 8]].forEach((q) => { E(g, q[0], q[1], 4, 2.5, '#ff9ec4'); L(g, [q[0], q[1]], [q[0], q[1] + 4], '#e8d8c8', 1.4); });
    },
    luna(g, W, H) {                                                  // cielo, estrellas y lunas
      const r = rr(9), k = area(W, H);
      band(g, W, H, () => {
        const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#1e2c86'); gr.addColorStop(1, '#3d52b8'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
        for (let i = 0; i < 9 * k; i++) E(g, r() * W, r() * H, 16 + r() * 14, 4 + r() * 3, 'rgba(120,140,220,.35)');
        for (let i = 0; i < 150 * k; i++) { g.fillStyle = '#fff'; g.globalAlpha = 0.5 + r() * 0.6; g.fillRect(r() * W, r() * H, 1.6, 1.6); } g.globalAlpha = 1;
        for (let i = 0; i < 14 * k; i++) { const x = r() * W, y = r() * H; L(g, [x - 3, y], [x + 3, y], '#fff', 0.9); L(g, [x, y - 3], [x, y + 3], '#fff', 0.9); }
      });
      g.strokeStyle = '#b8c0ff'; g.lineWidth = 2; g.strokeRect(B - 1, B - 1, W - 2 * B + 2, H - 2 * B + 2);
      GL(g, W / 2, B / 2, 34, '255,243,176', 0.5);
      g.save(); g.beginPath(); g.arc(W / 2, B / 2, 13, 0, 7); g.clip(); g.fillStyle = '#fff3b0'; g.fillRect(W / 2 - 14, B / 2 - 14, 28, 28); g.fillStyle = '#1e2c86'; g.beginPath(); g.arc(W / 2 + 7, B / 2 - 3, 12, 0, 7); g.fill(); g.restore();
      corners(W, H).forEach((c) => { g.save(); g.beginPath(); g.arc(c[0], c[1], 7, 0, 7); g.clip(); g.fillStyle = '#e6ecff'; g.fillRect(c[0] - 8, c[1] - 8, 16, 16); g.fillStyle = '#26358a'; g.beginPath(); g.arc(c[0] + 3.5, c[1] - 1.5, 6, 0, 7); g.fill(); g.restore(); });
    },
    templo(g, W, H) {                                                // ladrillo, greca de oro, capiteles con gemas
      const r = rr(4), k = area(W, H);
      band(g, W, H, () => {
        g.fillStyle = '#5a5038'; g.fillRect(0, 0, W, H);
        for (let y = 0, row = 0; y < H; y += 11, row++) for (let x = -(row % 2) * 12; x < W; x += 24) {
          g.fillStyle = ['#8d8466', '#736b51', '#9a9070', '#80775a'][((x / 24 + row) | 0) & 3]; g.fillRect(x + 1, y + 1, 22, 9); g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x + 1, y + 1, 22, 2);
        }
        for (let i = 0; i < 20 * k; i++) E(g, r() * W, r() * H, 3, 2, '#4a7a52');
      });
      g.strokeStyle = '#e0b040'; g.lineWidth = 2; g.strokeRect(B - 5, B - 5, W - 2 * B + 10, H - 2 * B + 10);
      for (let x = B + 4; x < W - B - 8; x += 10) { g.fillStyle = '#e0b040'; g.fillRect(x, B - 4, 6, 3); g.fillRect(x + 6, B - 8, 3, 6); g.fillRect(x, H - B + 1, 6, 3); g.fillRect(x + 6, H - B + 3, 3, 6); }
      corners(W, H).forEach((c) => {
        g.fillStyle = '#3a3424'; g.fillRect(c[0] - 13, c[1] - 13, 26, 26); g.fillStyle = '#b0aa8c'; g.fillRect(c[0] - 12, c[1] - 12, 24, 24);
        g.fillStyle = '#e0b040'; g.fillRect(c[0] - 12, c[1] - 12, 24, 3); g.fillRect(c[0] - 12, c[1] + 9, 24, 3); g.fillStyle = '#8f8a70'; g.fillRect(c[0] - 9, c[1] - 9, 18, 18);
        E(g, c[0], c[1], 5, 5, '#2e8a6a'); E(g, c[0] - 1.5, c[1] - 1.5, 1.8, 1.8, '#bff8e0');
      });
      [[W / 2, B / 2], [W / 2, H - B / 2], [B / 2, H / 2], [W - B / 2, H / 2]].forEach((c) => { P(g, [[c[0], c[1] - 6], [c[0] + 5, c[1]], [c[0], c[1] + 6], [c[0] - 5, c[1]]], '#e0b040'); E(g, c[0], c[1], 2, 2, '#ff4d8d'); });
    },
    portal(g, W, H) {                                                // runas, espirales y rombos
      const r = rr(13), k = area(W, H);
      band(g, W, H, () => {
        g.fillStyle = '#2c1e50'; g.fillRect(0, 0, W, H);
        for (let i = 0; i < 10 * k; i++) GL(g, r() * W, r() * H, 30, '150,80,230', 0.4);
        for (let i = 0; i < 46 * k; i++) {
          const x = r() * W, y = r() * H, kk = (r() * 3 | 0), c = i % 2 ? '255,120,230' : '200,130,255';
          g.strokeStyle = `rgba(${c},.9)`; g.lineWidth = 1.3; g.lineCap = 'round'; g.beginPath();
          if (kk === 0) { g.moveTo(x, y - 5); g.lineTo(x, y + 5); g.moveTo(x - 3, y - 1); g.lineTo(x + 3, y - 1); }
          else if (kk === 1) { g.moveTo(x - 4, y + 4); g.lineTo(x, y - 4); g.lineTo(x + 4, y + 4); }
          else { g.arc(x, y, 3.5, 0, 5); g.moveTo(x - 5, y); g.lineTo(x + 5, y); }
          g.stroke();
        }
      });
      g.strokeStyle = 'rgba(255,120,230,.9)'; g.lineWidth = 1.6; g.setLineDash([6, 3]); g.strokeRect(B - 3, B - 3, W - 2 * B + 6, H - 2 * B + 6); g.setLineDash([]);
      corners(W, H).forEach((c, kk) => {
        GL(g, c[0], c[1], 26, '200,130,255', 0.5); g.strokeStyle = '#ff78e6'; g.lineWidth = 1.6; g.beginPath();
        for (let a = 0; a < 12; a += 0.2) { const q = 1 + a * 1.2; g.lineTo(c[0] + Math.cos(a + kk) * q, c[1] + Math.sin(a + kk) * q); }
        g.stroke(); P(g, [[c[0], c[1] - 4], [c[0] + 3, c[1]], [c[0], c[1] + 4], [c[0] - 3, c[1]]], '#f0c8ff');
      });
      [[W / 2 - 40, H - 13], [W / 2 + 30, 13], [13, H / 2], [W - 13, H / 2]].forEach((q) => { P(g, [[q[0], q[1] - 6], [q[0] + 4, q[1]], [q[0], q[1] + 6], [q[0] - 4, q[1]]], '#f0c8ff'); GL(g, q[0], q[1], 12, '240,200,255', 0.5); });
    },
  };

  function draw(cv, id, cssW, cssH, border) {
    const fn = Z[id]; if (!fn || cssW < 80 || cssH < 80) return;
    const S = border / B, W = cssW / S, H = cssH / S, dpr = Math.min(window.devicePixelRatio || 1, 2);
    const oc = document.createElement('canvas'); oc.width = Math.ceil(W); oc.height = Math.ceil(H);
    fn(oc.getContext('2d'), W, H);
    const COLS = Math.floor(cssW / CW), ROWS = Math.floor(cssH / CH), sm = document.createElement('canvas'); sm.width = COLS; sm.height = ROWS;
    const s = sm.getContext('2d'); s.imageSmoothingEnabled = true; s.imageSmoothingQuality = 'high'; s.drawImage(oc, 0, 0, W, H, 0, 0, COLS, ROWS);
    const d = s.getImageData(0, 0, COLS, ROWS).data;
    cv.width = Math.round(COLS * CW * dpr); cv.height = Math.round(ROWS * CH * dpr);
    cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px';
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
    c.font = 'bold 6.6px monospace'; c.textBaseline = 'top';
    for (let r = 0; r < ROWS; r++) for (let q = 0; q < COLS; q++) {
      const i = (r * COLS + q) * 4, a = d[i + 3] / 255; if (a < 0.28) continue;
      const R_ = d[i] / a, G = d[i + 1] / a, B_ = d[i + 2] / a, lum = (0.3 * R_ + 0.59 * G + 0.11 * B_) / 255;
      const ch = RAMP[Math.min(RAMP.length - 1, Math.floor(Math.pow(lum, 0.55) * RAMP.length))]; if (ch === ' ') continue;
      c.fillStyle = `rgb(${Math.min(255, R_ * 1.5 | 0)},${Math.min(255, G * 1.5 | 0)},${Math.min(255, B_ * 1.5 | 0)})`; c.fillText(ch, q * CW, r * CH);
    }
  }
  return { draw, has: (id) => !!Z[id] };
})();

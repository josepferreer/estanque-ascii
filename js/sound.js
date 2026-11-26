/* Sonido, generado al vuelo con Web Audio (sin ficheros de audio).
 *  · fondo: agua tranquila (ruido grave filtrado que respira despacio);
 *  · lluvia: ruido agudo que entra y sale con el tiempo;
 *  · efectos cortos: comida al agua, perla, carpa de la fortuna, barrera que salta, garza, secreto.
 * El navegador no deja sonar nada hasta que la persona toca la página: start() se llama en el primer toque.
 */
const SOUND = (() => {
  let ac = null, master = null, rainGain = null, on = true;

  function noise(seconds, brown) {
    const n = Math.floor(ac.sampleRate * seconds), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return b;
  }
  function loop(buffer, type, freq, gain) {
    const s = ac.createBufferSource(); s.buffer = buffer; s.loop = true;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ac.createGain(); g.gain.value = gain;
    s.connect(f); f.connect(g); g.connect(master); s.start();
    return g;
  }

  function start() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain(); master.gain.value = on ? 0.8 : 0; master.connect(ac.destination);
    // agua de fondo, con una respiración lenta
    const water = loop(noise(4, true), 'lowpass', 520, 0.05);
    const lfo = ac.createOscillator(), lg = ac.createGain();
    lfo.frequency.value = 0.08; lg.gain.value = 0.02; lfo.connect(lg); lg.connect(water.gain); lfo.start();
    rainGain = loop(noise(3, false), 'bandpass', 2600, 0);
  }

  // nota corta con caída de tono (f0 → f1) y volumen que se apaga
  function blip(f0, f1, dur, vol, type = 'sine', delay = 0) {
    if (!ac || !on) return;
    const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function burst(dur, freq, vol) {
    if (!ac || !on) return;
    const t = ac.currentTime, s = ac.createBufferSource(); s.buffer = noise(dur, false);
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
    const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t);
  }

  return {
    start,
    get on() { return on; },
    set(v) {
      on = !!v;
      if (master) master.gain.setTargetAtTime(on ? 0.8 : 0, ac.currentTime, 0.1);
    },
    rain(level) { if (rainGain) rainGain.gain.setTargetAtTime(level * 0.06, ac.currentTime, 1.2); },
    plop() { blip(520, 160, 0.14, 0.18); },
    pearl() { blip(1320, 1250, 0.18, 0.08, 'triangle'); blip(1980, 1900, 0.22, 0.05, 'triangle', 0.06); },
    coins(n) { for (let i = 0; i < Math.min(5, n); i++) blip(1500 + i * 120, 1400, 0.12, 0.05, 'triangle', i * 0.05); },
    fortune() { [880, 1108, 1318, 1760].forEach((f, i) => blip(f, f, 0.3, 0.07, 'triangle', i * 0.09)); },
    crack() { burst(0.6, 320, 0.35); blip(140, 50, 0.4, 0.2, 'square'); },
    heron() { blip(700, 380, 0.25, 0.06, 'sawtooth'); blip(640, 360, 0.25, 0.05, 'sawtooth', 0.28); },
    shoo() { burst(0.3, 1600, 0.15); },
    secret() { [523, 659, 784, 1046, 1318].forEach((f, i) => blip(f, f, 0.5, 0.06, 'sine', i * 0.12)); },
    hatch() { blip(300, 900, 0.25, 0.08, 'triangle'); },
    // ruleta: un clic por sector que pasa por la flecha y una fanfarria según lo grande que sea el premio (0..5)
    tick() { blip(1900, 1500, 0.035, 0.045, 'square'); },
    win(level) {
      if (level <= 0) { blip(330, 260, 0.25, 0.05, 'sine'); return; }
      const notes = [[523, 659], [523, 659, 784], [523, 659, 784, 1046], [523, 659, 784, 1046, 1318], [523, 659, 784, 1046, 1318, 1568, 2093]][Math.min(level, 5) - 1];
      notes.forEach((f, i) => blip(f, f, 0.35 + level * 0.05, 0.06 + level * 0.006, level >= 4 ? 'triangle' : 'sine', i * 0.09));
      if (level >= 4) { burst(0.5, 3200, 0.12); }
    },
  };
})();

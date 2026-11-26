/* Letras y resplandor en la tarjeta gráfica (WebGL2).
 *
 * Mismo resultado que pintar celda a celda con el lienzo 2D, pero de una vez para toda la pantalla:
 *  1) cada píxel mira el color de su celda, elige la letra por el brillo (mismo reparto y mismo azar
 *     por celda) y la toma de un atlas con todas las letras en blanco;
 *  2) el resplandor sale de las versiones reducidas (mipmaps) de esa imagen, sumadas encima.
 * Si no hay WebGL2, create() lanza un error y el juego usa el camino 2D de main.js.
 */
const ASCII_GL = {
  create(cv) {
    const gl = cv.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('sin WebGL2');
    const VS = `#version 300 es
      void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
    const FS_ASCII = `#version 300 es
      precision highp float;
      uniform sampler2D uSrc, uHash, uAtlas;
      uniform float uCell, uH, uN;
      out vec4 o;
      void main() {
        vec2 p = vec2(gl_FragCoord.x, uH - gl_FragCoord.y);        // origen arriba a la izquierda, como el lienzo
        ivec2 cell = ivec2(floor(p / uCell));
        vec2 f = p / uCell - vec2(cell);                           // posición dentro de la celda (0..1)
        vec3 c = floor(texelFetch(uSrc, cell, 0).rgb * 255.0 + 0.5);
        vec3 col = c * 0.42 / 255.0;                               // fondo: la escena oscurecida
        float lum = dot(c, vec3(0.299, 0.587, 0.114)) / 255.0;
        float off = -1.0, len = 1.0;                               // grupos de letras: 10 altas, 6 medias, 4 bajas, 4 muy bajas
        if (lum > 0.6) { off = 0.0; len = 10.0; } else if (lum > 0.4) { off = 10.0; len = 6.0; }
        else if (lum > 0.24) { off = 16.0; len = 4.0; } else if (lum > 0.12) { off = 20.0; len = 4.0; }
        if (off >= 0.0) {
          float h = texelFetch(uHash, cell, 0).r;
          float idx = off + mod(floor(h * len), len);
          // el navegador pinta el texto blanco algo más grueso que el de color: se afina el borde para igualarlo
          float a = pow(texture(uAtlas, vec2((idx + f.x) / uN, f.y)).a, 1.4);
          vec3 g = min(vec3(255.0), floor((floor(c / 16.0) * 16.0 + 8.0) * 1.4 + 30.0)) / 255.0;
          col = mix(col, g, a);
        }
        o = vec4(col, 1.0);
      }`;
    const FS_BLOOM = `#version 300 es
      precision highp float;
      uniform sampler2D uImg;
      uniform vec2 uSize;
      out vec4 o;
      void main() {
        vec2 uv = gl_FragCoord.xy / uSize;
        vec3 c = texelFetch(uImg, ivec2(gl_FragCoord.xy), 0).rgb
               + 0.45 * textureLod(uImg, uv, 3.0).rgb                // imagen a 1/8
               + 0.30 * textureLod(uImg, uv, 2.0).rgb;               // imagen a 1/4
        o = vec4(min(c, vec3(1.0)), 1.0);
      }`;
    // capa de texto: una rejilla propia de caracteres (cada uno de tw×th píxeles), encima de todo y sin resplandor.
    // Por celda: qué letra (0 = ninguna), color de la letra y color de fondo (con transparencia).
    const FS_TEXT = `#version 300 es
      precision highp float;
      uniform sampler2D uCh, uFg, uBg, uGl;
      uniform vec2 uCell;
      uniform float uH, uN;
      out vec4 o;
      void main() {
        vec2 p = vec2(gl_FragCoord.x, uH - gl_FragCoord.y);
        ivec2 cell = ivec2(floor(p / uCell));
        vec2 f = p / uCell - vec2(cell);
        vec4 bg = texelFetch(uBg, cell, 0), fg = texelFetch(uFg, cell, 0);
        float ci = floor(texelFetch(uCh, cell, 0).r * 255.0 + 0.5);
        float a = ci > 0.5 ? texture(uGl, vec2((ci + f.x) / uN, f.y)).a * fg.a : 0.0;
        float al = max(bg.a, a);
        if (al <= 0.0) discard;
        o = vec4(bg.a > 0.0 ? mix(bg.rgb, fg.rgb, a) : fg.rgb, al);
      }`;
    const shader = (type, code) => {
      const s = gl.createShader(type); gl.shaderSource(s, code); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const program = (fs, samplers) => {
      const p = gl.createProgram();
      gl.attachShader(p, shader(gl.VERTEX_SHADER, VS)); gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      gl.useProgram(p); samplers.forEach((n, i) => gl.uniform1i(gl.getUniformLocation(p, n), i));
      const u = {}; ['uCell', 'uH', 'uN', 'uSize'].forEach((n) => { u[n] = gl.getUniformLocation(p, n); });
      return { p, u };
    };
    const pA = program(FS_ASCII, ['uSrc', 'uHash', 'uAtlas']), pB = program(FS_BLOOM, ['uImg']), pT = program(FS_TEXT, ['uCh', 'uFg', 'uBg', 'uGl']);
    const texture = (min, mag) => {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, min); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, mag);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    const tSrc = texture(gl.NEAREST, gl.NEAREST), tHash = texture(gl.NEAREST, gl.NEAREST), tAtlas = texture(gl.NEAREST, gl.NEAREST);
    const tImg = texture(gl.LINEAR_MIPMAP_LINEAR, gl.LINEAR), fbo = gl.createFramebuffer();
    const tTch = texture(gl.NEAREST, gl.NEAREST), tTfg = texture(gl.NEAREST, gl.NEAREST), tTbg = texture(gl.NEAREST, gl.NEAREST), tTgl = texture(gl.NEAREST, gl.NEAREST);
    let atlasCell = 0, nChars = 1;
    let tCols = 1, tRows = 1, tW = 1, tH = 1, tN = 1;
    cv.addEventListener('webglcontextlost', (e) => e.preventDefault());
    cv.addEventListener('webglcontextrestored', () => location.reload());

    return {
      hashDirty: true,
      // o = { cellDev, charset, font } — se llama al cambiar el tamaño de la ventana o de la rejilla
      resize(o) {
        if (atlasCell !== o.cellDev) {            // atlas: todas las letras en blanco, una tras otra
          const cd = o.cellDev, a = document.createElement('canvas'); a.width = o.charset.length * cd; a.height = cd;
          const x = a.getContext('2d');
          x.font = `${cd * 1.02}px ${o.font}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff';
          o.charset.forEach((chr, i) => {
            x.save(); x.beginPath(); x.rect(i * cd, 0, cd, cd); x.clip();
            x.fillText(chr, i * cd + cd / 2, cd / 2 + cd * 0.06); x.restore();
          });
          gl.bindTexture(gl.TEXTURE_2D, tAtlas); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, a);
          atlasCell = cd;
        }
        nChars = o.charset.length;
        gl.bindTexture(gl.TEXTURE_2D, tImg);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, cv.width, cv.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tImg, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        this.hashDirty = true;
      },
      // o = { cols, rows, tw, th, charset, font } — la rejilla de texto y su atlas de letras (la posición 0 del juego de caracteres es «nada»)
      textResize(o) {
        tCols = o.cols; tRows = o.rows; tW = o.tw; tH = o.th; tN = o.charset.length;
        const a = document.createElement('canvas'); a.width = tN * tW; a.height = tH;
        const x = a.getContext('2d');
        x.font = `bold ${Math.round(tH * 0.8)}px ${o.font}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff';
        o.charset.forEach((chr, i) => {
          if (!i) return;
          x.save(); x.beginPath(); x.rect(i * tW, 0, tW, tH); x.clip();
          x.fillText(chr, i * tW + tW / 2, tH / 2 + tH * 0.04); x.restore();
        });
        gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, tTgl);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, a);
      },
      // o = { ch: Uint8Array (cols×rows), fg: Uint8Array (RGBA), bg: Uint8Array (RGBA) } — sube la rejilla y la pinta encima
      text(o) {
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tTch);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, tCols, tRows, 0, gl.RED, gl.UNSIGNED_BYTE, o.ch);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tTfg);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, tCols, tRows, 0, gl.RGBA, gl.UNSIGNED_BYTE, o.fg);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tTbg);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, tCols, tRows, 0, gl.RGBA, gl.UNSIGNED_BYTE, o.bg);
        gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, tTgl);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, cv.width, cv.height);
        gl.useProgram(pT.p); gl.uniform2f(pT.u.uCell, tW, tH); gl.uniform1f(pT.u.uH, cv.height); gl.uniform1f(pT.u.uN, tN);
        gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.disable(gl.BLEND);
      },
      // o = { src (lienzo de una celda por píxel), hash (Float32Array por celda), GW, GH, cellDev }
      draw(o) {
        const w = cv.width, h = cv.height;
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tSrc);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, o.src);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tHash);
        if (this.hashDirty) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, o.GW, o.GH, 0, gl.RED, gl.FLOAT, o.hash); this.hashDirty = false; }
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tAtlas);
        // 1) letras, a una textura
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, w, h);
        gl.useProgram(pA.p); gl.uniform1f(pA.u.uCell, o.cellDev); gl.uniform1f(pA.u.uH, h); gl.uniform1f(pA.u.uN, nChars);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        // 2) resplandor, a la pantalla
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tImg); gl.generateMipmap(gl.TEXTURE_2D);
        gl.useProgram(pB.p); gl.uniform2f(pB.u.uSize, w, h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
    };
  },
};

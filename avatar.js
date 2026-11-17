/* =========================================================
   Virtual Human — avatar.js
   Prosedural (offline) virtual insan + Copilot ilə sinxron.
   Provider interfeysi: window.CopilotAvatar.registerProvider()
   ========================================================= */
(() => {
  'use strict';

  const VW = 1280;               // virtual səhnə ölçüsü
  const VH = 720;
  const STORE_KEY = 'interview-copilot.avatar.v1';
  const API = '/api/avatar';

  const params = new URLSearchParams(location.search);
  const IS_OBS = params.get('obs') === '1';

  /* ------------------------- personajlar ------------------------- */
  const PRESETS = {
    aysel: {
      label: 'Aysel',
      skin: '#f0c8a4', skinDeep: '#d6a179', skinLight: '#ffdcbb',
      hair: '#241a16', hairLight: '#3d2b24', hairStyle: 'long',
      eye: '#4a3226', lips: '#c4707a', lipsDeep: '#a2545f',
      jacket: '#2a3550', jacketDeep: '#1b2338', shirt: '#eef3fb',
      accent: '#7c5cff', glasses: false,
    },
    murad: {
      label: 'Murad',
      skin: '#dfae86', skinDeep: '#bd8860', skinLight: '#f0c7a2',
      hair: '#1d1512', hairLight: '#35251f', hairStyle: 'short',
      eye: '#3a2a20', lips: '#b9716f', lipsDeep: '#984f4e',
      jacket: '#232b34', jacketDeep: '#161c23', shirt: '#dfe7f2',
      accent: '#22d3ee', glasses: false,
    },
    leyla: {
      label: 'Leyla',
      skin: '#e8b48c', skinDeep: '#c98d66', skinLight: '#f8cda6',
      hair: '#42271b', hairLight: '#6a3d27', hairStyle: 'bun',
      eye: '#4b3320', lips: '#c96b6f', lipsDeep: '#a64d52',
      jacket: '#3a2b46', jacketDeep: '#281d33', shirt: '#f3edf8',
      accent: '#f472b6', glasses: false,
    },
    kamran: {
      label: 'Kamran',
      skin: '#c98d63', skinDeep: '#a56d47', skinLight: '#e0a97c',
      hair: '#15100e', hairLight: '#2c211d', hairStyle: 'curly',
      eye: '#2f2119', lips: '#a85f5c', lipsDeep: '#8a4644',
      jacket: '#1d3a34', jacketDeep: '#122620', shirt: '#e9f4f1',
      accent: '#34d399', glasses: true,
    },
  };

  const DEFAULTS = {
    preset: 'aysel',
    name: '',
    bg: 'studio',
    captions: false,
    micLips: true,
    hud: true,
    volume: 1,
    panelOpen: !IS_OBS,
  };

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return { ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}) };
    } catch {
      return { ...DEFAULTS };
    }
  }

  const settings = loadSettings();
  if (params.get('bg')) settings.bg = params.get('bg');
  if (params.get('hud') === '0') settings.hud = false;
  if (params.get('captions') === '1') settings.captions = true;

  function saveSettings() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  }

  /* ------------------------- köməkçilər ------------------------- */
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ease = (cur, target, dt, speed) => cur + (target - cur) * (1 - Math.exp(-dt * speed));

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function wrapText(ctx, text, maxWidth) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  /* ------------------------- nitq simulyasiyası ------------------------- */
  // Səs (mp3) olmadıqda dodaqları mətn ritminə görə hərəkət etdirir.
  function buildVisemes(text) {
    const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    const marks = [];
    let t = 0;
    for (const word of words) {
      const letters = (word.match(/[\p{L}\p{N}]/gu) || []).length;
      const syllables = Math.max(1, Math.round(letters / 3));
      for (let i = 0; i < syllables; i++) {
        const dur = 0.12 + Math.random() * 0.08;
        marks.push({ from: t, to: t + dur, open: 0.34 + Math.random() * 0.6 });
        t += dur + 0.025 + Math.random() * 0.05;
      }
      t += 0.1;
    }
    return { marks, total: Math.max(0.6, t) };
  }

  /* ------------------------- provider reyestri ------------------------- */
  const providers = new Map();

  function registerProvider(name, factory) {
    if (!name || typeof factory !== 'function') return false;
    providers.set(String(name).toLowerCase(), factory);
    return true;
  }

  function createProvider(name, canvas) {
    const factory = providers.get(String(name || '').toLowerCase()) || providers.get('procedural');
    if (!factory) return null;
    return factory(canvas);
  }

  window.CopilotAvatar = {
    version: 1,
    presets: PRESETS,
    registerProvider,
    getProvider: (n) => providers.get(String(n || '').toLowerCase()) || null,
    // Provider kontraktı:
    //   setMode('idle'|'listening'|'thinking'|'speaking')
    //   setLevel(0..1)  setCaption(text)  setConnected(bool)
    //   setSettings(settings)  draw(dt)  destroy()
  };

  /* =========================================================
     Prosedural avatar
     ========================================================= */
  class ProceduralAvatar {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.w = 0;
      this.h = 0;
      this.dpr = 1;

      this.t = 0;
      this.mode = 'idle';
      this.level = 0;
      this.mouth = 0;
      this.caption = '';
      this.connected = false;
      this.presetKey = PRESETS[settings.preset] ? settings.preset : 'aysel';
      this.preset = PRESETS[this.presetKey];
      this.settings = settings;
      this.name = (settings.name || '').trim() || this.preset.label;

      this.gaze = { x: 0, y: 0 };
      this.blinkT = 0;
      this.blinkActive = false;
      this.blinkClock = 2 + Math.random() * 3;

      this.speak = null;        // { startedAt, sim, mi }
      this.speakAudio = null;   // { el, an, gain, data }

      this.bokeh = Array.from({ length: 16 }, () => ({
        x: Math.random(),
        y: Math.random() * 0.9,
        r: 0.04 + Math.random() * 0.16,
        a: 0.02 + Math.random() * 0.05,
        c: ['124,92,255', '34,211,238', '255,255,255', '244,114,182'][Math.floor(Math.random() * 4)],
      }));

      this.resize();
      window.addEventListener('resize', () => this.resize());
    }

    resize() {
      const dpr = Math.min(2.5, window.devicePixelRatio || 1);
      const w = this.canvas.clientWidth || window.innerWidth;
      const h = this.canvas.clientHeight || window.innerHeight;
      this.dpr = dpr;
      this.w = w;
      this.h = h;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }

    setMode(mode) { this.mode = mode || 'idle'; }
    setLevel(v) { this.level = clamp(Number(v) || 0); }
    setCaption(text) { this.caption = String(text || ''); }
    setConnected(v) { this.connected = !!v; }

    setSettings(next) {
      this.settings = next;
      this.name = (next.name || '').trim() || this.preset.label;
    }

    setPreset(key) {
      if (!PRESETS[key]) return;
      this.presetKey = key;
      this.preset = PRESETS[key];
      if (!settings.name.trim()) this.name = this.preset.label;
    }

    /* ---------- səs / hərəkət mənbələri ---------- */
    rmsLevel() {
      const a = this.speakAudio;
      if (!a) return 0;
      a.an.getByteTimeDomainData(a.data);
      let sum = 0;
      for (let i = 0; i < a.data.length; i++) {
        const v = (a.data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / a.data.length);
      return clamp(rms * 4.2);
    }

    simLevel(elapsed) {
      const sp = this.speak;
      if (!sp) return 0;
      const marks = sp.sim.marks;
      while (sp.mi < marks.length && marks[sp.mi].to < elapsed) sp.mi++;
      const m = marks[sp.mi];
      if (!m || elapsed < m.from) return 0;
      return clamp(m.open * (0.85 + 0.15 * Math.sin(elapsed * 42)));
    }

    blinkOpen() {
      if (!this.blinkActive) return 1;
      const p = clamp(this.blinkT / 0.16);
      return 1 - Math.sin(p * Math.PI);
    }

    /* ---------- kadr yeniləmə ---------- */
    update(dt) {
      this.t += dt;

      // qırpma
      this.blinkClock -= dt;
      if (!this.blinkActive && this.blinkClock <= 0) {
        this.blinkActive = true;
        this.blinkT = 0;
        this.blinkClock = 2.1 + Math.random() * 3.6;
      }
      if (this.blinkActive) {
        this.blinkT += dt;
        if (this.blinkT >= 0.16) {
          this.blinkActive = false;
          this.blinkT = 0;
        }
      }

      // danışığın bitməsi (səs yoxdursa)
      if (this.speak && !this.speakAudio) {
        const elapsed = performance.now() / 1000 - this.speak.startedAt;
        if (elapsed > this.speak.sim.total + 1.1) {
          this.speak = null;
          if (this.mode === 'speaking') this.mode = 'idle';
        }
      }

      // dodaq hədəfi
      let target = 0;
      if (this.mode === 'speaking') {
        target = this.speakAudio ? this.rmsLevel()
          : (this.speak ? this.simLevel(performance.now() / 1000 - this.speak.startedAt) : 0);
      } else if (this.mode === 'listening' && this.settings.micLips) {
        target = this.level * 1.15;
      }
      this.mouth = ease(this.mouth, clamp(target), dt, target > this.mouth ? 26 : 13);

      // baxış
      const speaking = this.mode === 'speaking';
      const thinking = this.mode === 'thinking';
      const gx = Math.sin(this.t * 0.37) * 0.5 + (speaking ? Math.sin(this.t * 1.9) * 0.18 : 0);
      const gy = thinking ? -0.75 : -0.1 + Math.sin(this.t * 0.29) * 0.18;
      this.gaze = { x: ease(this.gaze.x, gx, dt, 6), y: ease(this.gaze.y, gy, dt, 6) };
    }

    /* ---------- rəsm ---------- */
    draw() {
      const ctx = this.ctx;
      const { w, h, dpr } = this;
      if (!w || !h) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      this.drawBackground(ctx, w, h);

      const scale = Math.max(w / VW, h / VH);
      const ox = (w - VW * scale) / 2;
      const oy = (h - VH * scale) / 2;

      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale(scale, scale);
      this.drawScene(ctx);
      ctx.restore();

      this.drawHud(ctx, w, h);
    }

    drawBackground(ctx, w, h) {
      const bg = this.settings.bg;

      if (bg === 'transparent') return;
      if (bg === 'green') {
        ctx.fillStyle = '#00b140';
        ctx.fillRect(0, 0, w, h);
        return;
      }

      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#151d31');
      g.addColorStop(0.55, '#0d1424');
      g.addColorStop(1, '#070b14');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      for (const b of this.bokeh) {
        const x = b.x * w;
        const y = b.y * h;
        const r = Math.max(24, b.r * h * 1.5);
        const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, `rgba(${b.c},${b.a})`);
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      const vg = ctx.createRadialGradient(
        w * 0.5, h * 0.42, Math.min(w, h) * 0.18,
        w * 0.5, h * 0.55, Math.max(w, h) * 0.8
      );
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.62)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
    }

    drawScene(ctx) {
      const P = this.preset;

      if (this.settings.bg !== 'transparent' && this.settings.bg !== 'green') {
        const glow = ctx.createRadialGradient(640, 260, 30, 640, 320, 470);
        glow.addColorStop(0, `rgba(124,92,255,0.18)`);
        glow.addColorStop(1, 'rgba(124,92,255,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(640, 320, 470, 0, Math.PI * 2);
        ctx.fill();
      }

      this.drawNeck(ctx, P);

      const breath = Math.sin(this.t * 1.15);
      ctx.save();
      ctx.translate(640, 720);
      ctx.scale(1 + breath * 0.004, 1 + breath * 0.006);
      this.drawBody(ctx, P);
      ctx.restore();

      // başın kölgəsi (sinə üzərinə)
      const sh = ctx.createRadialGradient(640, 470, 10, 640, 470, 165);
      sh.addColorStop(0, 'rgba(0,0,0,0.26)');
      sh.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sh;
      ctx.beginPath();
      ctx.ellipse(640, 478, 165, 44, 0, 0, Math.PI * 2);
      ctx.fill();

      const sway = Math.sin(this.t * 0.52) * 0.018 + Math.sin(this.t * 0.23) * 0.012;
      const bob = Math.sin(this.t * 1.0) * 2.0;
      const nod = this.mode === 'speaking' ? Math.sin(this.t * 4.1) * 0.012
        : this.mode === 'listening' ? Math.sin(this.t * 1.35) * 0.009 : 0;
      const tilt = this.mode === 'thinking' ? -0.045 : 0;

      ctx.save();
      ctx.translate(640, 300 + bob);
      ctx.rotate(sway + nod + tilt);
      this.drawHead(ctx, P);
      ctx.restore();

      if (this.mode === 'thinking') this.drawThinking(ctx);
    }

    drawNeck(ctx, P) {
      const g = ctx.createLinearGradient(0, 386, 0, 500);
      g.addColorStop(0, P.skinDeep);
      g.addColorStop(0.45, P.skin);
      g.addColorStop(1, P.skin);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(596, 380);
      ctx.bezierCurveTo(594, 434, 588, 464, 570, 486);
      ctx.lineTo(710, 486);
      ctx.bezierCurveTo(692, 464, 686, 434, 684, 380);
      ctx.closePath();
      ctx.fill();

      // çənə kölgəsi
      ctx.fillStyle = 'rgba(60,32,20,0.20)';
      ctx.beginPath();
      ctx.ellipse(640, 392, 52, 19, 0, 0, Math.PI);
      ctx.fill();
    }

    drawBody(ctx, P) {
      // pencək
      ctx.beginPath();
      ctx.moveTo(-308, 0);
      ctx.bezierCurveTo(-298, -122, -250, -198, -152, -224);
      ctx.bezierCurveTo(-94, -240, -44, -248, 0, -248);
      ctx.bezierCurveTo(44, -248, 94, -240, 152, -224);
      ctx.bezierCurveTo(250, -198, 298, -122, 308, 0);
      ctx.closePath();

      const jg = ctx.createLinearGradient(-270, -240, 240, 0);
      jg.addColorStop(0, P.jacketDeep);
      jg.addColorStop(0.42, P.jacket);
      jg.addColorStop(1, P.jacketDeep);
      ctx.fillStyle = jg;
      ctx.fill();

      // köynək
      ctx.beginPath();
      ctx.moveTo(-62, -244);
      ctx.lineTo(0, -120);
      ctx.lineTo(62, -244);
      ctx.quadraticCurveTo(0, -206, -62, -244);
      ctx.closePath();
      ctx.fillStyle = P.shirt;
      ctx.fill();

      // yaxa hissələri
      ctx.fillStyle = 'rgba(0,0,0,0.20)';
      ctx.beginPath();
      ctx.moveTo(-70, -246);
      ctx.lineTo(0, -118);
      ctx.lineTo(-30, -110);
      ctx.lineTo(-100, -240);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(70, -246);
      ctx.lineTo(0, -118);
      ctx.lineTo(30, -110);
      ctx.lineTo(100, -240);
      ctx.closePath();
      ctx.fill();

      // çiyin işığı
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-286, -8);
      ctx.bezierCurveTo(-276, -118, -232, -190, -146, -216);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255,255,255,0.045)';
      ctx.beginPath();
      ctx.moveTo(286, -8);
      ctx.bezierCurveTo(276, -118, 232, -190, 146, -216);
      ctx.stroke();
    }

    drawHead(ctx, P) {
      const rx = 98;
      const ry = 120;
      const open = this.blinkOpen();
      const browLift = (this.mode === 'speaking' ? 3.5 : 0)
        + (this.mode === 'thinking' ? 5 : this.mode === 'listening' ? 2.5 : 0)
        + Math.max(0, this.mouth - 0.45) * 3;

      this.drawHairBack(ctx, P, rx, ry);

      // qulaqlar
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(s * (rx - 3), 8, 15, 23, s * 0.12, 0, Math.PI * 2);
        ctx.fillStyle = P.skin;
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(s * (rx - 1), 8, 6.5, 11, s * 0.12, 0, Math.PI * 2);
        ctx.fillStyle = P.skinDeep;
        ctx.fill();
      }

      // üz
      const fg = ctx.createRadialGradient(-26, -46, 12, 0, 10, 200);
      fg.addColorStop(0, P.skinLight);
      fg.addColorStop(0.58, P.skin);
      fg.addColorStop(1, P.skinDeep);
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = fg;
      ctx.fill();

      // üzün yan kölgəsi
      const side = ctx.createLinearGradient(-rx, 0, 0, 0);
      side.addColorStop(0, 'rgba(90,50,30,0.16)');
      side.addColorStop(0.45, 'rgba(90,50,30,0)');
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = side;
      ctx.fill();

      // yanaq allığı
      for (const s of [-1, 1]) {
        const cg = ctx.createRadialGradient(s * 54, 40, 2, s * 54, 40, 34);
        cg.addColorStop(0, 'rgba(232,120,120,0.17)');
        cg.addColorStop(1, 'rgba(232,120,120,0)');
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.arc(s * 54, 40, 34, 0, Math.PI * 2);
        ctx.fill();
      }

      this.drawBrows(ctx, P, browLift);
      this.drawEye(ctx, P, -39, -20, open);
      this.drawEye(ctx, P, 39, -20, open);

      // burun
      ctx.strokeStyle = 'rgba(150,100,80,0.42)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-1, 2);
      ctx.quadraticCurveTo(-8, 24, 3, 31);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(7, 33, 6.5, 3.6, 0.4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(190,135,105,0.30)';
      ctx.fill();

      this.drawMouth(ctx, P);
      this.drawHairFront(ctx, P, rx, ry);

      if (P.glasses) this.drawGlasses(ctx);
    }

    drawHairBack(ctx, P, rx, ry) {
      ctx.fillStyle = P.hair;
      const style = P.hairStyle;

      if (style === 'long') {
        ctx.beginPath();
        ctx.moveTo(-rx - 9, -ry * 0.34);
        ctx.bezierCurveTo(-rx - 34, ry * 0.55, -rx - 30, ry * 1.42, -rx + 4, ry * 1.62);
        ctx.bezierCurveTo(-rx * 0.5, ry * 1.78, rx * 0.5, ry * 1.78, rx - 4, ry * 1.62);
        ctx.bezierCurveTo(rx + 30, ry * 1.42, rx + 34, ry * 0.55, rx + 9, -ry * 0.34);
        ctx.bezierCurveTo(rx * 0.62, -ry * 1.16, -rx * 0.62, -ry * 1.16, -rx - 9, -ry * 0.34);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = P.hairLight;
        ctx.lineWidth = 4;
        ctx.globalAlpha = 0.65;
        ctx.beginPath();
        ctx.moveTo(-rx - 2, ry * 0.35);
        ctx.quadraticCurveTo(-rx - 18, ry * 0.95, -rx + 8, ry * 1.46);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(rx + 2, ry * 0.35);
        ctx.quadraticCurveTo(rx + 18, ry * 0.95, rx - 8, ry * 1.46);
        ctx.stroke();
        ctx.globalAlpha = 1;
        return;
      }

      if (style === 'bun') {
        ctx.beginPath();
        ctx.ellipse(0, -ry * 0.18, rx + 7, ry * 0.98, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(rx * 0.62, -ry * 0.86, 30, 0, Math.PI * 2);
        ctx.fill();
        return;
      }

      if (style === 'curly') {
        for (let i = 0; i < 12; i++) {
          const a = Math.PI * (1.06 + (i / 11) * 0.88);
          ctx.beginPath();
          ctx.arc(Math.cos(a) * (rx + 4), Math.sin(a) * (ry + 2) - 18, 25, 0, Math.PI * 2);
          ctx.fill();
        }
        return;
      }

      // short
      ctx.beginPath();
      ctx.ellipse(0, -ry * 0.16, rx + 6, ry * 0.97, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    drawHairFront(ctx, P, rx, ry) {
      ctx.save();
      ctx.fillStyle = P.hair;
      const style = P.hairStyle;

      if (style === 'long' || style === 'bun') {
        ctx.beginPath();
        ctx.moveTo(-rx - 4, -ry * 0.16);
        ctx.bezierCurveTo(-rx - 2, -ry * 0.94, rx * 0.6, -ry * 1.2, rx + 3, -ry * 0.42);
        ctx.bezierCurveTo(rx * 0.74, -ry * 0.62, rx * 0.18, -ry * 0.36, -rx * 0.12, -ry * 0.5);
        ctx.bezierCurveTo(-rx * 0.52, -ry * 0.62, -rx * 0.84, -ry * 0.5, -rx - 4, -ry * 0.16);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-rx * 0.56, -ry * 0.72);
        ctx.quadraticCurveTo(-rx * 0.08, -ry * 0.92, rx * 0.44, -ry * 0.6);
        ctx.stroke();
      } else if (style === 'short') {
        ctx.beginPath();
        ctx.moveTo(-rx - 3, -ry * 0.24);
        ctx.bezierCurveTo(-rx - 6, -ry * 0.96, rx * 0.55, -ry * 1.14, rx + 3, -ry * 0.36);
        ctx.bezierCurveTo(rx * 0.6, -ry * 0.56, rx * 0.16, -ry * 0.42, -rx * 0.1, -ry * 0.56);
        ctx.bezierCurveTo(-rx * 0.5, -ry * 0.72, -rx * 0.82, -ry * 0.54, -rx - 3, -ry * 0.24);
        ctx.closePath();
        ctx.fill();
      } else {
        for (let i = 0; i < 8; i++) {
          const x = -rx * 0.82 + i * (rx * 1.64 / 7);
          const y = -ry * 0.86 + Math.sin(i * 1.1) * 6;
          ctx.beginPath();
          ctx.arc(x, y, 15.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();
    }

    drawBrows(ctx, P, lift) {
      ctx.save();
      ctx.strokeStyle = P.hair;
      ctx.lineWidth = 6.5;
      ctx.lineCap = 'round';
      for (const s of [-1, 1]) {
        ctx.save();
        ctx.translate(s * 40, -56 - lift);
        ctx.beginPath();
        ctx.moveTo(-s * 19, 2.5);
        ctx.quadraticCurveTo(0, -6, s * 18, 0.5);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }

    drawEye(ctx, P, x, y, open) {
      const w = 30;
      const h = 17;

      ctx.save();
      ctx.translate(x, y);

      ctx.beginPath();
      ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#f6f2ef';
      ctx.fill();

      ctx.save();
      ctx.beginPath();
      ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.clip();

      const gx = this.gaze.x * 3.4;
      const gy = this.gaze.y * 2.4 + 0.6;
      ctx.beginPath();
      ctx.arc(gx, gy, 6.8, 0, Math.PI * 2);
      ctx.fillStyle = P.eye;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(gx, gy, 3.1, 0, Math.PI * 2);
      ctx.fillStyle = '#14100d';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(gx - 2.2, gy - 2.4, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fill();

      const lid = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
      lid.addColorStop(0, 'rgba(70,45,32,0.32)');
      lid.addColorStop(0.55, 'rgba(70,45,32,0)');
      ctx.fillStyle = lid;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.restore();

      if (open < 0.995) {
        const cover = (1 - open) * (h + 3);
        ctx.beginPath();
        ctx.moveTo(-w / 2 - 1, -h / 2 - 4);
        ctx.lineTo(w / 2 + 1, -h / 2 - 4);
        ctx.lineTo(w / 2 + 1, -h / 2 + cover);
        ctx.quadraticCurveTo(0, -h / 2 + cover + 3.5, -w / 2 - 1, -h / 2 + cover);
        ctx.closePath();
        ctx.fillStyle = P.skin;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(-w / 2, -h / 2 + cover);
        ctx.quadraticCurveTo(0, -h / 2 + cover + 3.5, w / 2, -h / 2 + cover);
        ctx.strokeStyle = 'rgba(30,20,16,0.8)';
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.moveTo(-w / 2 - 1, -h / 2 + 1);
      ctx.quadraticCurveTo(0, -h / 2 - 3.8, w / 2 + 1, -h / 2 + 1);
      ctx.strokeStyle = 'rgba(28,18,14,0.72)';
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-w / 2 + 2, h / 2 - 1);
      ctx.quadraticCurveTo(0, h / 2 + 2.5, w / 2 - 2, h / 2 - 1);
      ctx.strokeStyle = 'rgba(120,85,65,0.32)';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      ctx.restore();
    }

    drawMouth(ctx, P) {
      const y = 66;
      const open = this.mouth;
      const smile = 0.55 + (this.mode === 'listening' ? 0.2 : 0);
      const w = 50 + smile * 4;

      if (open < 0.06) {
        ctx.beginPath();
        ctx.moveTo(-w / 2, y);
        ctx.quadraticCurveTo(0, y + 9 + smile * 6, w / 2, y);
        ctx.strokeStyle = P.lipsDeep;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(-w / 2 + 8, y + 3.4);
        ctx.quadraticCurveTo(0, y + 11 + smile * 5, w / 2 - 8, y + 3.4);
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 2.4;
        ctx.stroke();
        return;
      }

      const h = 7 + open * 42;

      const lipPath = () => {
        ctx.beginPath();
        ctx.moveTo(-w / 2, y);
        ctx.quadraticCurveTo(-w / 4, y - h * 0.30, 0, y - h * 0.20);
        ctx.quadraticCurveTo(w / 4, y - h * 0.30, w / 2, y);
        ctx.quadraticCurveTo(w / 4, y + h * 0.98, 0, y + h * 0.98);
        ctx.quadraticCurveTo(-w / 4, y + h * 0.98, -w / 2, y);
        ctx.closePath();
      };

      lipPath();
      ctx.fillStyle = P.lips;
      ctx.fill();

      ctx.save();
      lipPath();
      ctx.clip();

      ctx.fillStyle = '#3d1720';
      ctx.beginPath();
      ctx.ellipse(0, y + h * 0.34, w * 0.36, h * 0.64, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.ellipse(0, y - h * 0.14, w * 0.30, Math.min(5.4, h * 0.22), 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(248,246,242,0.94)';
      ctx.fill();

      ctx.beginPath();
      ctx.ellipse(0, y + h * 0.74, w * 0.22, h * 0.2, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(170,80,92,0.55)';
      ctx.fill();
      ctx.restore();

      lipPath();
      ctx.strokeStyle = P.lipsDeep;
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }

    drawGlasses(ctx) {
      ctx.save();
      ctx.strokeStyle = 'rgba(44, 50, 68, 0.82)';
      ctx.lineWidth = 2.2;

      for (const s of [-1, 1]) {
        roundRect(ctx, s * 39 - 27, -38, 54, 38, 13);
        const lg = ctx.createLinearGradient(0, -38, 0, 0);
        lg.addColorStop(0, 'rgba(226,236,255,0.10)');
        lg.addColorStop(1, 'rgba(226,236,255,0.02)');
        ctx.fillStyle = lg;
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(s * 39 - 18, -32);
        ctx.lineTo(s * 39 - 5, -32);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 2.4;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(44, 50, 68, 0.82)';
        ctx.lineWidth = 2.2;
      }

      ctx.beginPath();
      ctx.moveTo(-12, -22);
      ctx.lineTo(12, -22);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-66, -24);
      ctx.lineTo(-93, -14);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(66, -24);
      ctx.lineTo(93, -14);
      ctx.stroke();

      ctx.restore();
    }

    drawThinking(ctx) {
      const dots = 3;
      const baseX = 118;
      const baseY = -150;
      ctx.save();
      ctx.fillStyle = 'rgba(10,14,26,0.72)';
      roundRect(ctx, baseX, baseY, 78, 40, 14);
      ctx.fill();
      ctx.strokeStyle = 'rgba(148,163,184,0.22)';
      ctx.lineWidth = 1;
      ctx.stroke();

      for (let i = 0; i < dots; i++) {
        const a = 0.35 + 0.65 * Math.max(0, Math.sin(this.t * 4 - i * 0.7));
        ctx.beginPath();
        ctx.arc(baseX + 22 + i * 17, baseY + 20 + Math.sin(this.t * 4 - i * 0.7) * 2, 4.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(199,210,254,${a})`;
        ctx.fill();
      }
      ctx.restore();
    }

    drawHud(ctx, w, h) {
      if (this.settings.hud) {
        const name = this.name || this.preset.label;
        const barH = 40;
        const x = 26;
        const y = h - barH - 26;

        ctx.save();
        ctx.font = '600 17px Inter, "Segoe UI", system-ui, sans-serif';
        const textW = ctx.measureText(name).width;
        const barW = textW + 62;

        ctx.fillStyle = 'rgba(8,12,22,0.55)';
        roundRect(ctx, x, y, barW, barH, 12);
        ctx.fill();
        ctx.strokeStyle = 'rgba(148,163,184,0.22)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(x + 21, y + barH / 2, 4.2, 0, Math.PI * 2);
        ctx.fillStyle = this.connected ? '#34d399' : '#64748b';
        ctx.fill();

        ctx.fillStyle = '#e8ecf5';
        ctx.textBaseline = 'middle';
        ctx.fillText(name, x + 36, y + barH / 2 + 1);
        ctx.restore();
      }

      this.drawCaption(ctx, w, h);
    }

    drawCaption(ctx, w, h) {
      const text = this.caption.trim();
      if (!this.settings.captions || !text || this.mode !== 'speaking') return;

      ctx.save();
      const maxW = Math.min(900, w * 0.76);
      ctx.font = '500 19px Inter, "Segoe UI", system-ui, sans-serif';

      let lines = wrapText(ctx, text, maxW - 44);
      if (lines.length > 2) {
        lines = lines.slice(0, 2);
        lines[1] = `${lines[1].replace(/[.,;:!?]?$/, '')}…`;
      }

      const lineH = 26;
      const boxW = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 44;
      const boxH = lines.length * lineH + 26;
      const x = (w - boxW) / 2;
      const y = h - boxH - 96;

      ctx.fillStyle = 'rgba(6,10,20,0.66)';
      roundRect(ctx, x, y, boxW, boxH, 14);
      ctx.fill();
      ctx.strokeStyle = 'rgba(148,163,184,0.18)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#eef2fb';
      ctx.textBaseline = 'middle';
      ctx.font = '500 19px Inter, "Segoe UI", system-ui, sans-serif';
      lines.forEach((line, i) => {
        const lw = ctx.measureText(line).width;
        ctx.fillText(line, x + (boxW - lw) / 2, y + 24 + i * lineH);
      });
      ctx.restore();
    }

    destroy() {
      this.stopAudio();
    }

    stopAudio() {
      const a = this.speakAudio;
      this.speakAudio = null;
      if (!a) return;
      try {
        a.el.onended = null;
        a.el.pause();
        a.el.src = '';
      } catch { /* ignore */ }
    }
  }

  registerProvider('procedural', (canvas) => new ProceduralAvatar(canvas));

  /* =========================================================
     Səhnə + vəziyyət
     ========================================================= */
  const canvas = document.getElementById('stage');
  const avatar = createProvider('procedural', canvas);
  if (!avatar) throw new Error('Avatar provider tapılmadı.');

  const view = {
    seq: -1,
    connected: false,
    speakTimer: 0,
    captionTimer: 0,
    pendingAudio: null,
  };

  let actx = null;

  function ensureAudioCtx() {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    if (!actx) actx = new C();
    if (actx.state === 'suspended') actx.resume().catch(() => {});
    return actx;
  }

  function setConnected(on) {
    if (view.connected === on) return;
    view.connected = on;
    avatar.setConnected(on);
    const hint = document.getElementById('connHint');
    if (hint) {
      hint.textContent = on
        ? 'Server: qoşulub ✓ (Copilot ilə sinxron)'
        : 'Server: qoşulmayıb — Copilot açıqdır?';
      hint.style.color = on ? '#34d399' : '#ff4d6d';
    }
  }

  /* ---------- səs ---------- */
  async function startAudio(id) {
    const res = await fetch(`${API}/audio/${encodeURIComponent(id)}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('audio ' + res.status);

    const blob = await res.blob();
    const el = new Audio(URL.createObjectURL(blob));
    el.playsInline = true;

    const ctx = ensureAudioCtx();
    if (ctx) {
      const src = ctx.createMediaElementSource(el);
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      an.smoothingTimeConstant = 0.5;
      const gain = ctx.createGain();
      gain.gain.value = Number(settings.volume) || 1;
      src.connect(an);
      an.connect(gain);
      gain.connect(ctx.destination);
      avatar.speakAudio = { el, an, gain, data: new Uint8Array(an.fftSize) };
    } else {
      el.volume = Number(settings.volume) || 1;
      avatar.speakAudio = { el, an: null, gain: null, data: null };
    }

    el.onended = () => {
      if (avatar.speakAudio && avatar.speakAudio.el === el) finishSpeak();
    };

    await el.play();

    // audio həqiqi müddəti ilə bitiş taymerini dəqiqləşdir
    clearTimeout(view.speakTimer);
    const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
    if (dur) view.speakTimer = setTimeout(finishSpeak, dur * 1000 + 900);
  }

  /* ---------- danışıq ---------- */
  async function startSpeak(ev) {
    stopSpeak();

    const now = performance.now() / 1000;
    avatar.speak = {
      startedAt: now,
      sim: buildVisemes(ev.text || ''),
      mi: 0,
    };
    avatar.setMode('speaking');

    if (settings.captions) avatar.setCaption(ev.text || '');

    if (ev.audio) {
      try {
        await startAudio(ev.audio);
      } catch (err) {
        // səs bloklanıbsa istifadəçiyə "aktivləşdir" pəncərəsi göstər
        if (err && (err.name === 'NotAllowedError' || String(err).includes('NotAllowed'))) {
          view.pendingAudio = avatar.speakAudio && avatar.speakAudio.el;
          showGate();
        }
      }
    }

    clearTimeout(view.speakTimer);
    view.speakTimer = setTimeout(
      finishSpeak,
      Math.max(1600, avatar.speak.sim.total * 1000 + 1400)
    );
  }

  function finishSpeak() {
    clearTimeout(view.speakTimer);
    avatar.stopAudio();
    avatar.speak = null;
    if (avatar.mode === 'speaking') avatar.setMode('idle');

    clearTimeout(view.captionTimer);
    view.captionTimer = setTimeout(() => {
      if (avatar.mode !== 'speaking') avatar.setCaption('');
    }, 1400);
  }

  function stopSpeak() {
    clearTimeout(view.speakTimer);
    avatar.stopAudio();
    avatar.speak = null;
    if (avatar.mode === 'speaking') avatar.setMode('idle');
  }

  /* ---------- server hadisələri ---------- */
  function handleEvent(ev) {
    if (!ev || !ev.type) return;
    if (ev.type === 'speak') startSpeak(ev);
    else if (ev.type === 'stop') stopSpeak();
    else if (ev.type === 'caption') {
      avatar.setCaption(ev.text || '');
      if (settings.captions) avatar.setMode('speaking');
    }
  }

  async function poll() {
    let next = 1000;
    try {
      const res = await fetch(`${API}/poll?since=${view.seq < 0 ? 'latest' : view.seq}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('http');
      const data = await res.json();

      setConnected(true);
      next = 140;

      if (typeof data.seq === 'number') view.seq = data.seq;

      const levelAge = typeof data.levelAge === 'number' ? data.levelAge : -1;
      if (typeof data.level === 'number' && (levelAge < 0 || levelAge < 700)) {
        avatar.setLevel(data.level);
      } else {
        avatar.setLevel(0);
      }

      const events = Array.isArray(data.events) ? data.events : [];
      for (const ev of events) handleEvent(ev);

      // hadisə yoxdursa serverin cari vəziyyətinə uyğunlaş.
      // Avatar özü danışırsa (audio/simulyasiya) server "idle" deyə onu kəsmirik.
      if (!events.length && !avatar.speak && !avatar.speakAudio) {
        if (data.state && data.state !== avatar.mode) {
          if (data.state === 'speaking') {
            if (!avatar.speak) avatar.setMode('speaking');
          } else {
            avatar.setMode(data.state);
            avatar.setCaption('');
          }
        }
      }
    } catch {
      setConnected(false);
      next = 1000;
    }
    setTimeout(poll, next);
  }

  /* =========================================================
     UI
     ========================================================= */
  const el = {
    panel: document.getElementById('panel'),
    gear: document.getElementById('gear'),
    panelClose: document.getElementById('panelClose'),
    presets: document.getElementById('presets'),
    name: document.getElementById('avatarName'),
    bg: document.getElementById('bg'),
    volume: document.getElementById('volume'),
    volLabel: document.getElementById('volLabel'),
    captions: document.getElementById('captions'),
    micLips: document.getElementById('micLips'),
    hud: document.getElementById('hud'),
    testBtn: document.getElementById('testBtn'),
    fullBtn: document.getElementById('fullBtn'),
    obsUrl: document.getElementById('obsUrl'),
    gate: document.getElementById('gate'),
    gateBtn: document.getElementById('gateBtn'),
  };

  function applySettings() {
    document.body.dataset.bg = settings.bg;
    document.body.dataset.obs = IS_OBS ? '1' : '0';

    if (el.bg) el.bg.value = settings.bg;
    if (el.captions) el.captions.checked = !!settings.captions;
    if (el.micLips) el.micLips.checked = !!settings.micLips;
    if (el.hud) el.hud.checked = !!settings.hud;
    if (el.volume) el.volume.value = String(settings.volume);
    if (el.volLabel) el.volLabel.textContent = `${Math.round((Number(settings.volume) || 1) * 100)}%`;
    if (el.name) {
      el.name.value = (settings.name || '').trim();
      el.name.placeholder = PRESETS[settings.preset] ? PRESETS[settings.preset].label : 'Ad';
    }
    if (el.obsUrl) el.obsUrl.textContent = `${location.origin}/avatar.html?obs=1`;

    if (avatar.speakAudio && avatar.speakAudio.gain) {
      avatar.speakAudio.gain.gain.value = Number(settings.volume) || 1;
    }

    avatar.setSettings(settings);
    avatar.setPreset(settings.preset);
    avatar.resize();
  }

  function openPanel(open, persist = true) {
    if (!el.panel) return;
    el.panel.hidden = !open;
    if (!persist) return;
    settings.panelOpen = !!open;
    saveSettings();
  }

  function buildPresets() {
    if (!el.presets) return;
    el.presets.innerHTML = '';
    Object.entries(PRESETS).forEach(([key, p]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'preset';
      btn.title = p.label;
      btn.setAttribute('aria-label', p.label);
      btn.setAttribute('aria-pressed', String(key === settings.preset));
      const dot = document.createElement('span');
      dot.style.background = `linear-gradient(135deg, ${p.skin} 0 52%, ${p.hair} 52% 100%)`;
      btn.appendChild(dot);
      btn.addEventListener('click', () => {
        settings.preset = key;
        saveSettings();
        applySettings();
        buildPresets();
      });
      el.presets.appendChild(btn);
    });
  }

  function showGate() {
    if (el.gate) el.gate.hidden = false;
  }

  el.gear?.addEventListener('click', () => openPanel(el.panel?.hidden));
  el.panelClose?.addEventListener('click', () => openPanel(false));

  el.name?.addEventListener('input', () => {
    settings.name = el.name.value;
    saveSettings();
    avatar.setSettings(settings);
  });

  el.bg?.addEventListener('change', () => {
    settings.bg = el.bg.value;
    saveSettings();
    applySettings();
  });

  el.volume?.addEventListener('input', () => {
    settings.volume = Number(el.volume.value);
    el.volLabel.textContent = `${Math.round(settings.volume * 100)}%`;
    if (avatar.speakAudio) {
      if (avatar.speakAudio.gain) avatar.speakAudio.gain.gain.value = settings.volume;
      else avatar.speakAudio.el.volume = settings.volume;
    }
    saveSettings();
  });

  el.captions?.addEventListener('change', () => {
    settings.captions = el.captions.checked;
    if (!settings.captions) avatar.setCaption('');
    saveSettings();
  });

  el.micLips?.addEventListener('change', () => {
    settings.micLips = el.micLips.checked;
    saveSettings();
    avatar.setSettings(settings);
  });

  el.hud?.addEventListener('change', () => {
    settings.hud = el.hud.checked;
    saveSettings();
    avatar.setSettings(settings);
  });

  el.testBtn?.addEventListener('click', () => {
    ensureAudioCtx();
    startSpeak({ text: 'Salam! Mən sizin virtual müsahibinizəm. Necəsiniz?' });
  });

  el.fullBtn?.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  });

  el.gateBtn?.addEventListener('click', async () => {
    el.gate.hidden = true;
    ensureAudioCtx();
    const el2 = view.pendingAudio;
    view.pendingAudio = null;
    if (el2) {
      try { await el2.play(); } catch { /* ignore */ }
    }
  });

  window.addEventListener('pointerdown', () => {
    if (actx && actx.state === 'suspended') actx.resume().catch(() => {});
  }, { passive: true });

  window.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
    if (e.key === 'h' || e.key === 'H') openPanel(el.panel?.hidden);
    if (e.key === 'c' || e.key === 'C') {
      settings.captions = !settings.captions;
      el.captions.checked = settings.captions;
      saveSettings();
    }
  });

  /* ---------- dövrə ---------- */
  let last = performance.now() / 1000;

  function frame(nowMs) {
    const now = nowMs / 1000;
    const dt = Math.min(0.05, Math.max(0, now - last));
    last = now;

    avatar.update(dt);
    avatar.draw();
    requestAnimationFrame(frame);
  }

  /* ---------- start ---------- */
  buildPresets();
  applySettings();
  openPanel(!IS_OBS && settings.panelOpen, !IS_OBS);

  if (IS_OBS) {
    document.body.dataset.obs = '1';
  }

  requestAnimationFrame(frame);
  poll();

  // ilk klikdə audio kontekstini aç (brauzer siyasəti)
  window.addEventListener('load', () => {
    if (!IS_OBS) ensureAudioCtx();
  });
})();

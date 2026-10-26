/* Element Atlas video studio.
   Renders vertical explainer videos (1080 × 1920, 30 fps) frame by frame: the 3D shots come from the atlas's own
   scene code (atlas/js/scenes.js and views.js), the captions and interface pieces are drawn on a 2D canvas on top,
   and WebCodecs encodes H.264 video plus an AAC music bed into an MP4 (packed by mp4-muxer). Finished files are
   POSTed to the local preview server (.claude/serve.ps1 -UploadDir video/out). The parts live in parts.js. */
(function () {
  'use strict';
  const A = window.Atlas, S = A.S, B = A.build, T = window.THREE, V3 = T.Vector3;
  const W = 1080, H = 1920, FPS = 30, SR = 48000;
  const URL_TEXT = 'btaimoor54-beep.github.io/element-atlas';
  const C = {
    ink: '#080d13', panel: '#0d151d', raise: '#131e28', line: '#213140', line2: '#2e4456', text: '#dce6ee',
    muted: '#8b9cab', faint: '#5d6e7d', accent: '#6fd3ff', warm: '#ffbf4f', bg1: '#0e1924', bg2: '#080d13', red: '#ff5f52',
  };
  const F = {
    display: '"Bricolage Grotesque", "Segoe UI", sans-serif',
    body: '"Schibsted Grotesk", "Segoe UI", sans-serif',
    mono: '"JetBrains Mono", Consolas, monospace',
  };
  const STAGE = { x: 36, y: 250, w: 1008, h: 1150, r: 34 };
  const out = document.getElementById('out');
  const g = out.getContext('2d');
  const statusEl = document.getElementById('status');
  const say = (s) => { statusEl.textContent = s; };

  /* ---------- small helpers ---------- */
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
  const fade = (lt, dur, inT = 0.3, outT = 0.25) => Math.min(clamp(lt / inT), clamp((dur - lt) / outT));
  const nc = document.createElement('canvas').getContext('2d');
  function rgb(c) {
    nc.fillStyle = '#000'; nc.fillStyle = c; const s = nc.fillStyle;
    if (s[0] === '#') return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
    const m = s.match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number) : [0, 0, 0];
  }
  const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return `rgb(${Math.round(lerp(x[0], y[0], t))},${Math.round(lerp(x[1], y[1], t))},${Math.round(lerp(x[2], y[2], t))})`; };
  const alpha = (c, a) => { const x = rgb(c); return `rgba(${x[0]},${x[1]},${x[2]},${a})`; };
  const SUBS = '₀₁₂₃₄₅₆₇₈₉';
  const formula = (f) => String(f || '').replace(/\d/g, (d) => SUBS[+d]);
  const yieldNow = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });

  /* ---------- 2D drawing kit ---------- */
  function rr(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  const font = (weight, size, fam) => { g.font = `${weight} ${size}px ${fam}`; };
  function textW(s, weight, size, fam) { font(weight, size, fam); return g.measureText(s).width; }

  // rich text: *word* is highlighted; words reveal one after another
  function parseRich(s) {
    const words = []; let cur = [], hl = false, buf = '';
    const flush = () => { if (buf) { cur.push({ t: buf, hl }); buf = ''; } };
    for (const ch of s) {
      if (ch === '*') { flush(); hl = !hl; continue; }
      if (/\s/.test(ch)) { flush(); if (cur.length) { words.push(cur); cur = []; } continue; }
      buf += ch;
    }
    flush(); if (cur.length) words.push(cur);
    return words;
  }
  function rich(s, x, y, maxW, size, lh, lt, opts) {
    opts = opts || {};
    const base = opts.color || C.text, hlc = opts.hl || C.accent, wt = opts.weight || 600, hw = opts.hlWeight || 700, fam = opts.fam || F.body;
    const words = parseRich(s);
    const space = textW(' ', wt, size, fam);
    const lines = [[]]; let lineW = 0;
    for (const wd of words) {
      const w = wd.reduce((s2, r) => s2 + textW(r.t, r.hl ? hw : wt, size, fam), 0);
      if (lines[lines.length - 1].length && lineW + space + w > maxW) { lines.push([]); lineW = 0; }
      lines[lines.length - 1].push({ wd, w }); lineW += (lineW ? space : 0) + w;
    }
    g.textBaseline = 'alphabetic';
    let k = 0;
    lines.forEach((line, li) => {
      const total = line.reduce((s2, it, i) => s2 + it.w + (i ? space : 0), 0);
      let cx = opts.center ? x + (maxW - total) / 2 : x;
      for (const it of line) {
        const a = lt == null ? 1 : clamp((lt - k * 0.045) / 0.22); k++;
        const dy = (1 - easeOut(a)) * 18;
        for (const r of it.wd) {
          font(r.hl ? hw : wt, size, fam);
          g.fillStyle = alpha(r.hl ? hlc : base, a * (opts.alpha == null ? 1 : opts.alpha));
          g.fillText(r.t, cx, y + li * lh + dy);
          cx += g.measureText(r.t).width;
        }
        cx += space;
      }
    });
    return lines.length;
  }

  function logo(x, y, s) {
    g.save(); g.translate(x, y); g.scale(s / 64, s / 64);
    rr(0, 0, 64, 64, 14); g.fillStyle = '#0e1924'; g.fill(); g.strokeStyle = C.line2; g.lineWidth = 1.5; g.stroke();
    g.strokeStyle = C.accent; g.lineWidth = 3;
    for (const a of [0, 60, -60]) { g.save(); g.translate(32, 32); g.rotate((a * Math.PI) / 180); g.beginPath(); g.ellipse(0, 0, 24, 9, 0, 0, Math.PI * 2); g.stroke(); g.restore(); }
    g.beginPath(); g.arc(32, 32, 5.5, 0, Math.PI * 2); g.fillStyle = C.red; g.fill();
    g.beginPath(); g.arc(56, 32, 3, 0, Math.PI * 2); g.fillStyle = C.warm; g.fill();
    g.restore();
  }
  function pill(label, x, y, opts) {
    opts = opts || {};
    const size = opts.size || 30, fam = opts.fam || F.mono, wt = opts.weight || 600, padX = opts.padX || 22, h = opts.h || size * 1.9;
    const w = textW(label, wt, size, fam) + padX * 2;
    const c = opts.color || C.accent, a = opts.alpha == null ? 1 : opts.alpha;
    const px = opts.right ? x - w : opts.center ? x - w / 2 : x;
    rr(px, y, w, h, h / 2);
    g.fillStyle = opts.fill || alpha(c, 0.12 * a); g.fill();
    g.strokeStyle = alpha(opts.border || c, (opts.borderAlpha == null ? 0.55 : opts.borderAlpha) * a); g.lineWidth = 2; g.stroke();
    font(wt, size, fam); g.fillStyle = alpha(opts.textColor || c, a); g.textBaseline = 'middle'; g.fillText(label, px + padX, y + h / 2 + 1);
    g.textBaseline = 'alphabetic';
    return { x: px, y, w, h };
  }
  function pointer(x, y, press, a) {
    a = a == null ? 1 : a;
    if (press > 0 && press < 1) {
      g.beginPath(); g.arc(x, y, 26 + 80 * easeOut(press), 0, Math.PI * 2);
      g.strokeStyle = `rgba(255,255,255,${0.7 * (1 - press) * a})`; g.lineWidth = 6; g.stroke();
    }
    const s = press > 0 && press < 0.35 ? 0.85 : 1;
    g.beginPath(); g.arc(x, y, 30 * s, 0, Math.PI * 2); g.fillStyle = `rgba(255,255,255,${0.93 * a})`; g.fill();
    g.lineWidth = 5; g.strokeStyle = `rgba(8,13,19,${0.55 * a})`; g.stroke();
  }
  // pointer travelling from p0 to p1 between t0 and t1, tapping at tTap
  function pointerPath(lt, p0, p1, t0, t1, tTap, a) {
    const k = ease((lt - t0) / (t1 - t0));
    pointer(lerp(p0[0], p1[0], k), lerp(p0[1], p1[1], k), tTap != null ? clamp((lt - tTap) / 0.6) : 0, a);
  }
  function slider(label, valueText, frac, x, y, w, a) {
    g.save(); g.globalAlpha = a == null ? 1 : a;
    rr(x, y, w, 120, 26); g.fillStyle = 'rgba(8,13,19,0.82)'; g.fill(); g.strokeStyle = C.line; g.lineWidth = 2; g.stroke();
    font(600, 32, F.body); g.fillStyle = C.muted; g.fillText(label, x + 30, y + 72);
    const tx = x + 260, tw = w - 260 - 210, ty = y + 60;
    rr(tx, ty - 7, tw, 14, 7); g.fillStyle = C.line2; g.fill();
    rr(tx, ty - 7, tw * frac, 14, 7); g.fillStyle = C.warm; g.fill();
    g.beginPath(); g.arc(tx + tw * frac, ty, 20, 0, Math.PI * 2); g.fillStyle = C.warm; g.fill(); g.strokeStyle = '#080d13'; g.lineWidth = 4; g.stroke();
    font(600, 34, F.mono); g.fillStyle = C.warm; g.fillText(valueText, x + w - 185, y + 73);
    g.restore();
  }
  function hud(items, x, y, a, size) {
    size = size || 28;
    const h = Math.round(size * 2.15);
    let cx = x;
    for (const [k, v, warm] of items) {
      const kw = textW(k, 500, size, F.mono), vw = textW(v, 600, size, F.mono), w = kw + vw + size * 1.9;
      g.save(); g.globalAlpha = a == null ? 1 : a;
      rr(cx, y, w, h, h / 2); g.fillStyle = 'rgba(8,13,19,0.78)'; g.fill(); g.strokeStyle = warm ? alpha(C.warm, 0.6) : C.line; g.lineWidth = 2; g.stroke();
      font(500, size, F.mono); g.fillStyle = C.muted; g.textBaseline = 'middle'; g.fillText(k, cx + size * 0.7, y + h / 2 + 1);
      font(600, size, F.mono); g.fillStyle = warm ? C.warm : C.text; g.fillText(v, cx + size * 1.15 + kw, y + h / 2 + 1);
      g.textBaseline = 'alphabetic'; g.restore();
      cx += w + 14;
    }
  }

  /* ---------- the site's interface pieces, drawn ---------- */
  function cellColor(el, mode) {
    const r = B.colorFor(el, mode);
    return { c: r.c, fill: !!r.fill, dim: !!r.dim };
  }
  // periodic table: rows 1–7, then the two f-block rows (9, 10) after a gap
  function tableGeom(rect) {
    const gap = 4, cw = (rect.w - 17 * gap) / 18, ch = cw * 1.12, fGap = ch * 0.38;
    const at = (el) => {
      const r = el.pos.row;
      const y = r <= 7 ? rect.y + (r - 1) * (ch + gap) : rect.y + 7 * (ch + gap) + fGap + (r - 9) * (ch + gap);
      return { x: rect.x + (el.pos.col - 1) * (cw + gap), y, w: cw, h: ch };
    };
    return { cw, ch, at, bottom: rect.y + 9 * (ch + gap) + fGap };
  }
  function table(rect, opts) {
    opts = opts || {};
    const geo = tableGeom(rect);
    const mode = opts.mode || 'category', from = opts.fromMode, k = opts.blend == null ? 1 : opts.blend;
    for (const el of A.elements) {
      const p = geo.at(el);
      const appear = opts.appear == null ? 1 : easeOut(clamp((opts.appear - (el.pos.col + el.pos.row) * 0.035) / 0.35));
      if (appear <= 0) continue;
      let cc = cellColor(el, mode);
      if (from && k < 1) { const c0 = cellColor(el, from); cc = { c: mix(c0.c, cc.c, k), fill: k > 0.5 ? cc.fill : c0.fill, dim: k > 0.5 ? cc.dim : c0.dim }; }
      const hot = opts.highlight === el.symbol ? (opts.hot == null ? 1 : opts.hot) : 0;
      const s = (0.6 + 0.4 * appear) * (1 + 0.35 * hot);
      const w = p.w * s, h = p.h * s, x = p.x + (p.w - w) / 2, y = p.y + (p.h - h) / 2;
      g.save(); g.globalAlpha = appear * (cc.dim ? 0.3 : 1) * (opts.highlight && !hot ? 1 - 0.45 * (opts.hot || 0) : 1);
      if (hot) { g.shadowColor = alpha(cc.c, 0.9); g.shadowBlur = 30 * hot; }
      rr(x, y, w, h, 6 * s); g.fillStyle = cc.fill ? cc.c : mix(cc.c, opts.raise || C.raise, 0.86); g.fill();
      g.shadowBlur = 0;
      if (!cc.fill) { g.strokeStyle = alpha(cc.c, 0.5 + 0.5 * hot); g.lineWidth = 1.5 + 2 * hot; g.stroke(); }
      font(700, Math.round(w * 0.42), F.display); g.fillStyle = cc.fill ? A.onColor(cc.c) : cc.c;
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(el.symbol, x + w / 2, y + h * 0.58);
      font(500, Math.round(w * 0.2), F.mono); g.fillStyle = cc.fill ? alpha(A.onColor(cc.c), 0.75) : opts.muted || C.muted; g.fillText(String(el.z), x + w / 2, y + h * 0.2);
      g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.restore();
    }
    return geo;
  }
  function legend(mode, x, y, maxW, a) {
    let items;
    if (mode === 'state') items = ['solid', 'liquid', 'gas'].map((k) => [A.STATES[k], k[0].toUpperCase() + k.slice(1)]);
    else if (mode === 'origin') items = A.ORIGINS.map((o) => [A.originOf(o.key).color, o.label]);
    else if (mode === 'electronegativity') items = null;
    else items = A.CATS.map((c) => [A.catOf(c.key).color, c.label]);
    g.save(); g.globalAlpha = a == null ? 1 : a;
    if (!items) {
      const w = 520, gr = g.createLinearGradient(x, 0, x + w, 0);
      for (let i = 0; i <= 10; i++) gr.addColorStop(i / 10, A.ramp(i / 10));
      font(500, 26, F.mono); g.fillStyle = C.muted; g.fillText('0.7  pulls weakly', x, y + 26);
      rr(x, y + 44, w, 22, 11); g.fillStyle = gr; g.fill();
      g.fillText('4.0  pulls hard', x + w - textW('4.0  pulls hard', 500, 26, F.mono), y + 100);
      g.restore(); return;
    }
    let cx = x, cy = y;
    font(500, 26, F.body);
    for (const [c, label] of items) {
      const w = g.measureText(label).width + 52;
      if (cx + w > x + maxW) { cx = x; cy += 50; }
      g.beginPath(); g.arc(cx + 14, cy + 18, 10, 0, Math.PI * 2); g.fillStyle = c; g.fill();
      g.fillStyle = C.muted; g.fillText(label, cx + 32, cy + 27);
      cx += w;
    }
    g.restore();
  }
  function card(el, rect, a, photoImg) {
    const cat = A.catOf(el.category);
    g.save(); g.globalAlpha = a;
    rr(rect.x, rect.y, rect.w, rect.h, 26); g.fillStyle = C.panel; g.fill(); g.strokeStyle = alpha(cat.color, 0.7); g.lineWidth = 3; g.stroke();
    const bx = rect.x + 30, by = rect.y + 30, bs = Math.min(200, rect.h - 60);
    rr(bx, by, bs, bs, 18); g.fillStyle = mix(cat.color, C.raise, 0.82); g.fill(); g.strokeStyle = cat.color; g.lineWidth = 2.5; g.stroke();
    g.textAlign = 'center'; font(700, Math.round(bs * 0.46), F.display); g.fillStyle = cat.color; g.fillText(el.symbol, bx + bs / 2, by + bs * 0.62);
    font(500, 30, F.mono); g.fillStyle = C.muted; g.fillText(String(el.z), bx + bs / 2, by + bs * 0.88); g.textAlign = 'left';
    const tx = bx + bs + 34;
    font(700, 58, F.display); g.fillStyle = C.text; g.fillText(el.name, tx, by + 56);
    font(500, 28, F.body); g.fillStyle = C.muted; g.fillText(`${cat.label} · ${String(el.state).toLowerCase()}`, tx, by + 100);
    const rows = [['Mass', String(el.atomicMass)], ['Electrons', String(el.electronConfiguration).replace(/(\d)([spdf])(\d+)/g, '$1$2^$3')], ['Shells', (el.shells || []).join(' · ')]];
    rows.forEach(([k, v], i) => {
      font(500, 28, F.body); g.fillStyle = C.muted; g.fillText(k, tx, by + 152 + i * 44);
      font(500, 28, F.mono); g.fillStyle = C.text; g.fillText(v.replace(/\^(\d+)/g, (m, d) => d.split('').map((x) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+x]).join('')), tx + 150, by + 152 + i * 44);
    });
    if (photoImg) {
      const pw = 190, ph = bs, px = rect.x + rect.w - 30 - pw, py = by;
      g.save(); rr(px, py, pw, ph, 16); g.clip();
      const s = Math.max(pw / photoImg.width, ph / photoImg.height);
      g.drawImage(photoImg, px + (pw - photoImg.width * s) / 2, py + (ph - photoImg.height * s) / 2, photoImg.width * s, photoImg.height * s);
      g.restore(); rr(px, py, pw, ph, 16); g.strokeStyle = C.line; g.lineWidth = 2; g.stroke();
    }
    g.restore();
  }
  function select(label, value, x, y, w, a) {
    g.save(); g.globalAlpha = a == null ? 1 : a;
    font(500, 28, F.body); g.fillStyle = C.muted; g.fillText(label, x, y + 52);
    const lw = g.measureText(label).width + 22;
    rr(x + lw, y, w - lw, 76, 16); g.fillStyle = C.raise; g.fill(); g.strokeStyle = alpha(C.accent, 0.7); g.lineWidth = 2.5; g.stroke();
    font(600, 32, F.body); g.fillStyle = C.text; g.fillText(value, x + lw + 24, y + 50);
    g.beginPath(); const ax = x + w - 40, ay = y + 34; g.moveTo(ax - 12, ay); g.lineTo(ax, ay + 12); g.lineTo(ax + 12, ay);
    g.strokeStyle = C.muted; g.lineWidth = 4; g.stroke();
    g.restore();
  }
  function searchBox(text, caret, results, x, y, w, a) {
    g.save(); g.globalAlpha = a == null ? 1 : a;
    rr(x, y, w, 96, 20); g.fillStyle = C.raise; g.fill(); g.strokeStyle = alpha(C.accent, 0.8); g.lineWidth = 3; g.stroke();
    g.beginPath(); g.arc(x + 48, y + 44, 16, 0, Math.PI * 2); g.strokeStyle = C.muted; g.lineWidth = 4; g.stroke();
    g.beginPath(); g.moveTo(x + 60, y + 56); g.lineTo(x + 72, y + 68); g.stroke();
    font(600, 40, F.body); g.fillStyle = text ? C.text : C.faint; g.fillText(text || 'Search elements and compounds…', x + 96, y + 62);
    if (caret) { const cx = x + 96 + textW(text, 600, 40, F.body) + 4; g.fillStyle = C.accent; g.fillRect(cx, y + 26, 4, 46); }
    results.forEach((r, i) => {
      const ry = y + 120 + i * 104, ra = clamp(r.a == null ? 1 : r.a);
      if (ra <= 0) return;
      g.save(); g.globalAlpha *= ra;
      rr(x, ry, w, 90, 18); g.fillStyle = i === 0 ? mix(C.accent, C.panel, 0.84) : C.panel; g.fill(); g.strokeStyle = i === 0 ? alpha(C.accent, 0.6) : C.line; g.lineWidth = 2; g.stroke();
      font(600, 36, F.body); g.fillStyle = C.text; g.fillText(r.name, x + 30, ry + 57);
      font(600, 32, F.mono); g.fillStyle = C.accent; const fw = g.measureText(r.right).width; g.fillText(r.right, x + w - 30 - fw, ry + 57);
      g.restore();
    });
    g.restore();
  }
  function levelPills(active, x, y, w, a, hot) {
    const L = B.LEVELS;
    const per = 3, gap = 12, pw = (w - gap * (per - 1)) / per, ph = 70;
    L.forEach(([key, label], i) => {
      const col = i % per, row = Math.floor(i / per);
      const px = x + col * (pw + gap), py = y + row * (ph + gap);
      const on = key === active;
      g.save(); g.globalAlpha = a == null ? 1 : a;
      rr(px, py, pw, ph, 18); g.fillStyle = on ? mix(C.accent, C.raise, 0.8) : 'rgba(8,13,19,0.78)'; g.fill();
      g.strokeStyle = on ? alpha(C.accent, 0.4 + 0.6 * (hot == null ? 1 : hot)) : C.line; g.lineWidth = on ? 3 : 2; g.stroke();
      font(500, 26, F.mono); g.fillStyle = on ? C.accent : C.faint; g.fillText(String(i + 1), px + 22, py + 45);
      font(on ? 700 : 600, 31, F.body); g.fillStyle = on ? C.text : C.muted; g.fillText(label, px + 54, py + 46);
      g.restore();
    });
    return { bottom: y + 2 * (ph + gap) };
  }
  function meter(dchi, x, y, w, a, mark) {
    g.save(); g.globalAlpha = a == null ? 1 : a;
    rr(x, y, w, 170, 26); g.fillStyle = 'rgba(8,13,19,0.82)'; g.fill(); g.strokeStyle = C.line; g.lineWidth = 2; g.stroke();
    const tx = x + 40, tw = w - 80, ty = y + 70;
    const stops = [[0, '#5fb7ff'], [0.121, '#5fb7ff'], [0.121, '#9ccc65'], [0.545, '#9ccc65'], [0.545, '#ff8a5c'], [1, '#ff8a5c']];
    const gr = g.createLinearGradient(tx, 0, tx + tw, 0); stops.forEach(([s, c]) => gr.addColorStop(s, c));
    rr(tx, ty, tw, 18, 9); g.fillStyle = gr; g.fill();
    const mx = tx + tw * clamp(dchi / 3.3);
    g.beginPath(); g.moveTo(mx, ty - 6); g.lineTo(mx - 14, ty - 30); g.lineTo(mx + 14, ty - 30); g.closePath(); g.fillStyle = C.text; g.fill();
    font(600, 30, mark ? F.body : F.mono); g.fillStyle = C.text; g.textAlign = 'center'; g.fillText(mark || 'Δχ ' + dchi.toFixed(2), mx, ty - 40); g.textAlign = 'left';
    font(500, 26, F.body); g.fillStyle = C.muted;
    g.fillText('shared evenly', tx, ty + 64); const tr = 'transferred'; g.fillText(tr, tx + tw - textW(tr, 500, 26, F.body), ty + 64);
    g.restore();
  }
  // opening: the 3D stays at full brightness from the first frame (the header already shows the part title);
  // only a "PART n OF 4" pill sits at the top of the stage
  function titleOverlay(kicker, title, sub, lt, dur, y) {
    const a = fade(lt, dur, 0.25, 0.35);
    pill(kicker, W / 2, y || STAGE.y + 36, { center: true, alpha: a, size: 32, fill: `rgba(8,13,19,${0.8 * a})` });
  }
  function endCard(part, lt, dur) {
    const a = clamp(lt / 0.4);
    g.save(); g.globalAlpha = a;
    const cx = W / 2;
    logo(cx - 70, STAGE.y + 120, 140);
    g.textAlign = 'center';
    font(700, 84, F.display); g.fillStyle = C.text; g.fillText(part.endTitle || 'Try it free', cx, STAGE.y + 390);
    font(500, 36, F.body); g.fillStyle = C.muted; g.fillText('Open it in any browser:', cx, STAGE.y + 470);
    rr(STAGE.x + 60, STAGE.y + 510, STAGE.w - 120, 190, 30); g.fillStyle = mix(C.accent, C.panel, 0.88); g.fill(); g.strokeStyle = alpha(C.accent, 0.8); g.lineWidth = 3; g.stroke();
    font(600, 50, F.mono); g.fillStyle = C.accent; g.fillText('btaimoor54-beep', cx, STAGE.y + 590);
    g.fillText('.github.io/element-atlas', cx, STAGE.y + 656);
    const chips = ['118 elements', '238 substances', '3D simulations'];
    font(600, 30, F.mono);
    const cw = chips.map((c) => g.measureText(c).width + 44), total = cw.reduce((s, w) => s + w, 0) + 24;
    let x = cx - total / 2;
    g.textAlign = 'left';
    chips.forEach((c, i) => { pill(c, x, STAGE.y + 760, { size: 30, color: C.warm, alpha: clamp((lt - 0.3 - i * 0.15) / 0.3) }); x += cw[i] + 12; });
    g.textAlign = 'center';
    font(500, 34, F.body); g.fillStyle = C.muted; g.fillText('Link in the description', cx, STAGE.y + 900);
    if (part.next) { font(600, 38, F.body); g.fillStyle = C.text; g.fillText(part.next, cx, STAGE.y + 1010); }
    g.textAlign = 'left';
    g.restore();
  }
  function photo(img, rect, caption, credit, a) {
    g.save(); g.globalAlpha = a;
    g.save(); rr(rect.x, rect.y, rect.w, rect.h, 26); g.clip();
    const s = Math.max(rect.w / img.width, rect.h / img.height);
    g.drawImage(img, rect.x + (rect.w - img.width * s) / 2, rect.y + (rect.h - img.height * s) / 2, img.width * s, img.height * s);
    g.restore();
    rr(rect.x, rect.y, rect.w, rect.h, 26); g.strokeStyle = C.line2; g.lineWidth = 3; g.stroke();
    font(600, 32, F.body); g.fillStyle = C.text; g.fillText(caption, rect.x + 6, rect.y + rect.h + 56);
    font(500, 22, F.mono); g.fillStyle = C.muted; g.fillText(credit, rect.x + 6, rect.y + rect.h + 96);
    g.restore();
  }

  /* ---------- 3D: the atlas's own scenes rendered off-screen ---------- */
  const RS = 1.5; // supersampling
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(RS); renderer.setSize(STAGE.w, STAGE.h, false); renderer.setClearColor(0x000000, 0);
  const scene3 = new T.Scene();
  const camera = new T.PerspectiveCamera(40, STAGE.w / STAGE.h, 0.01, 2000);
  scene3.add(new T.HemisphereLight(0xd6ecff, 0x18222c, 0.9));
  const key = new T.DirectionalLight(0xffffff, 0.85); key.position.set(6, 9, 7); scene3.add(key);
  const rim = new T.DirectionalLight(0x6fd3ff, 0.35); rim.position.set(-7, -3, -6); scene3.add(rim);
  const Y = new V3(0, 1, 0);
  let shot = null;
  const isShared = (x) => !!(x && x.userData && x.userData.shared);
  function disposeTree(obj) {
    obj.traverse((o) => {
      if (o.geometry && !isShared(o.geometry)) o.geometry.dispose();
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) { if (m.map && !isShared(m.map)) m.map.dispose(); if (!isShared(m)) m.dispose(); }
    });
  }
  function fitDist(r) {
    const half = (camera.fov * Math.PI) / 360, halfH = Math.atan(Math.tan(half) * camera.aspect);
    return (r / Math.sin(Math.min(half, halfH))) * 1.04;
  }
  function useScene(id, make) {
    if (shot && shot.id === id) return shot.built;
    clearScene();
    const b = make();
    shot = { id, built: b };
    scene3.add(b.group);
    scene3.fog = b.fog ? new T.FogExp2(0x07121a, b.fog / fitDist(b.radius || 5)) : null;
    return b;
  }
  function clearScene() { if (shot) { scene3.remove(shot.built.group); disposeTree(shot.built.group); shot = null; } scene3.fog = null; }
  function frameCamera(b, lt, cam) {
    cam = cam || {};
    const r = (cam.radius || b.radius || 5) * (cam.fit || 1);
    const base = (cam.dir ? new V3(cam.dir[0], cam.dir[1], cam.dir[2]) : b.view && b.view.dir ? b.view.dir.clone() : new V3(0.35, 0.28, 1)).normalize();
    const dir = base.applyAxisAngle(Y, (((cam.orbit != null ? cam.orbit : 10) * Math.PI) / 180) * lt);
    const z = cam.zoom ? lerp(cam.zoom[0], cam.zoom[1], ease((lt - (cam.zoomAt || 0)) / (cam.zoomDur || 5))) : 1;
    const dist = fitDist(r) * z;
    camera.position.copy(dir.multiplyScalar(dist));
    camera.near = Math.max(0.01, dist / 200); camera.far = dist * 20; camera.updateProjectionMatrix();
    camera.lookAt(0, cam.lookY || 0, 0);
  }
  // Hydrogen bonds as thick gold dashes in 2D: WebGL draws the simulation's dashed lines only 1 pixel wide,
  // too thin to see on a phone. Each segment of the simulation's H-bond line set is projected with the camera.
  const pa = new V3(), pb = new V3();
  function drawHBonds(b, opts) {
    opts = opts || {};
    let L = null;
    b.group.traverse((o) => { if (!L && o.isLineSegments && o.material && o.material.isLineDashedMaterial) L = o; });
    if (!L || !L.visible) return 0;
    L.updateMatrixWorld(true);
    const pos = L.geometry.attributes.position, n = L.geometry.drawRange.count, rect = opts.rect || STAGE;
    const toScreen = (v) => [rect.x + ((v.x + 1) / 2) * rect.w, rect.y + ((1 - v.y) / 2) * rect.h];
    g.save(); g.globalAlpha = opts.alpha == null ? 1 : opts.alpha;
    g.strokeStyle = C.warm; g.lineWidth = opts.width || 6; g.lineCap = 'round'; g.setLineDash(opts.dash || [14, 10]);
    let k = 0;
    for (let i = 0; i + 1 < n; i += 2) {
      pa.fromBufferAttribute(pos, i).applyMatrix4(L.matrixWorld).project(camera);
      pb.fromBufferAttribute(pos, i + 1).applyMatrix4(L.matrixWorld).project(camera);
      if (Math.abs(pa.z) > 1 || Math.abs(pb.z) > 1) continue;
      const s0 = toScreen(pa), s1 = toScreen(pb);
      g.beginPath(); g.moveTo(s0[0], s0[1]); g.lineTo(s1[0], s1[1]); g.stroke(); k++;
    }
    g.restore();
    return k;
  }
  // draw the current 3D shot into a rectangle of the frame (the whole stage by default)
  function draw3D(a, rect) {
    renderer.render(scene3, camera);
    rect = rect || STAGE;
    g.save(); g.globalAlpha = a == null ? 1 : a;
    g.drawImage(renderer.domElement, rect.x, rect.y, rect.w, rect.h);
    g.restore();
  }

  /* ---------- assets ---------- */
  const images = {};
  function img(src) {
    if (!images[src]) images[src] = new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
    return images[src];
  }
  const loaded = {};
  async function preload(part) {
    for (const src of part.images || []) loaded[src] = await img(src);
  }

  /* ---------- frame composition ---------- */
  function segAt(part, t) {
    for (const s of part.segs) if (t >= s.at && t < s.at + s.dur) return s;
    return part.segs[part.segs.length - 1];
  }
  function drawFrame(part, t) {
    const seg = segAt(part, t), lt = t - seg.at;
    if (g.reset) g.reset(); // a fresh drawing state every frame (no clip or alpha can leak from an earlier one)
    // page background
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0b131b'); bg.addColorStop(1, '#05080c');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // brand row and part title
    logo(60, 66, 76);
    font(700, 46, F.display); g.fillStyle = C.text; g.textBaseline = 'middle'; g.fillText('The Element Atlas', 156, 106); g.textBaseline = 'alphabetic';
    pill(`Part ${part.n} of 4`, W - 60, 76, { right: true, size: 28 });
    font(700, 64, F.display); g.fillStyle = C.text; g.fillText(part.title, 60, 214);
    // stage
    rr(STAGE.x, STAGE.y, STAGE.w, STAGE.h, STAGE.r);
    const sg = g.createRadialGradient(W / 2, STAGE.y + STAGE.h * 0.4, 0, W / 2, STAGE.y + STAGE.h * 0.4, STAGE.w * 0.95);
    sg.addColorStop(0, C.bg1); sg.addColorStop(0.7, C.bg2); g.fillStyle = sg; g.fill();
    g.save(); rr(STAGE.x, STAGE.y, STAGE.w, STAGE.h, STAGE.r); g.clip();
    const env = { lt, dur: seg.dur, p: clamp(lt / seg.dur), a: seg.noFade ? 1 : fade(lt, seg.dur), t };
    if (seg.scene) {
      const b = useScene(`${part.n}:${seg.id}`, seg.scene);
      if (seg.update) seg.update(b, lt, env); else if (b.update) b.update(1 / FPS, lt); // some scenes (orbital clouds) are static
      frameCamera(b, lt, seg.camera);
      env.built = b;
      if (!seg.manual3D) draw3D(env.a);
    } else clearScene();
    if (seg.draw) seg.draw(env);
    if (seg.title) titleOverlay(seg.title[0], seg.title[1], seg.title[2], lt, seg.dur, seg.titleY);
    if (seg.end) endCard(part, lt, seg.dur);
    g.restore();
    rr(STAGE.x, STAGE.y, STAGE.w, STAGE.h, STAGE.r); g.strokeStyle = C.line; g.lineWidth = 2; g.stroke();
    // step label and caption
    const ca = fade(lt, seg.dur, 0.25, 0.2);
    if (seg.step) pill(seg.step.toUpperCase(), 60, 1440, { size: 28, alpha: ca, color: seg.stepColor || C.accent });
    if (seg.caption) rich(seg.caption, 60, seg.step ? 1588 : 1530, 960, 60, 76, lt - 0.1, { alpha: ca });
    // address and progress
    g.textAlign = 'center'; font(500, 30, F.mono); g.fillStyle = C.muted; g.fillText(URL_TEXT, W / 2, 1838); g.textAlign = 'left';
    rr(60, 1868, W - 120, 10, 5); g.fillStyle = C.line; g.fill();
    rr(60, 1868, (W - 120) * clamp(t / part.duration), 10, 5); g.fillStyle = C.accent; g.fill();
  }

  /* ---------- music bed (generated, so there is nothing to license) ---------- */
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const PROG = [[48, 52, 55, 59], [45, 48, 52, 55], [41, 45, 48, 52], [43, 47, 50, 55]]; // Cmaj7 Am7 Fmaj7 G
  async function makeMusic(variant, seconds) {
    const ctx = new OfflineAudioContext(2, Math.ceil(SR * seconds), SR);
    const rnd = A.rng(17 + variant);
    const shift = [0, 2, -3, 5][(variant - 1) % 4];
    const master = ctx.createGain();
    master.gain.setValueAtTime(0, 0); master.gain.linearRampToValueAtTime(0.9, 1.5);
    master.gain.setValueAtTime(0.9, seconds - 2.5); master.gain.linearRampToValueAtTime(0, seconds - 0.05);
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
    master.connect(comp); comp.connect(ctx.destination);
    const ir = ctx.createBuffer(2, Math.floor(SR * 2.6), SR);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] = (rnd() * 2 - 1) * Math.pow(1 - i / d.length, 3); }
    const verb = ctx.createConvolver(); verb.buffer = ir; const wet = ctx.createGain(); wet.gain.value = 0.32; verb.connect(wet); wet.connect(master);
    const bus = ctx.createGain(); bus.gain.value = 1; bus.connect(master); bus.connect(verb);
    const echo = ctx.createDelay(1); const fb = ctx.createGain(); fb.gain.value = 0.28; const echoOut = ctx.createGain(); echoOut.gain.value = 0.35;
    echo.connect(fb); fb.connect(echo); echo.connect(echoOut); echoOut.connect(bus);
    const bpm = 92, beat = 60 / bpm, bar = beat * 4; echo.delayTime.value = beat * 0.75;
    const chordAt = (t) => PROG[Math.floor(t / (2 * bar)) % PROG.length].map((m) => m + shift);
    for (let t = 0; t < seconds; t += 2 * bar) {
      for (const m of chordAt(t)) {
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1000; lp.Q.value = 0.4;
        const gn = ctx.createGain(); const end = Math.min(seconds, t + 2 * bar);
        gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(0.024, t + 1.2); gn.gain.setValueAtTime(0.024, end - 0.4); gn.gain.linearRampToValueAtTime(0, end + 0.9);
        lp.connect(gn); gn.connect(bus);
        for (const det of [-8, 8]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m + 12); o.detune.value = det; o.connect(lp); o.start(t); o.stop(end + 1); }
      }
      const root = chordAt(t)[0];
      for (let b = 0; b < 8; b += 2) {
        const tb = t + b * beat; if (tb > seconds - 1) break;
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = mtof(root - 12);
        const gn = ctx.createGain(); gn.gain.setValueAtTime(0, tb); gn.gain.linearRampToValueAtTime(0.11, tb + 0.02); gn.gain.exponentialRampToValueAtTime(0.0008, tb + beat * 1.8);
        o.connect(gn); gn.connect(bus); o.start(tb); o.stop(tb + beat * 2);
      }
    }
    let i = 0;
    for (let t = bar; t < seconds - 1.2; t += beat / 2, i++) {
      const ch = chordAt(t), notes = [ch[0] + 24, ch[1] + 24, ch[2] + 24, ch[3] + 24, ch[2] + 24, ch[1] + 24];
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(notes[i % notes.length]);
      const gn = ctx.createGain(); const v = 0.045 * (i % 2 ? 0.7 : 1);
      gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(v, t + 0.006); gn.gain.exponentialRampToValueAtTime(0.0005, t + 0.5);
      o.connect(gn); gn.connect(bus); gn.connect(echo); o.start(t); o.stop(t + 0.55);
    }
    for (let t = 2 * bar; t < seconds - 1.5; t += beat) {
      const beatIdx = Math.round(t / beat) % 4;
      if (beatIdx === 0 || beatIdx === 2) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(115, t); o.frequency.exponentialRampToValueAtTime(44, t + 0.13);
        const gn = ctx.createGain(); gn.gain.setValueAtTime(0.2, t); gn.gain.exponentialRampToValueAtTime(0.0005, t + 0.3);
        o.connect(gn); gn.connect(master); o.start(t); o.stop(t + 0.32);
      }
    }
    return ctx.startRendering();
  }

  /* ---------- encoding ---------- */
  async function encodeAudio(muxer, buf, bitrate) {
    const enc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => { throw e; } });
    enc.configure({ codec: 'mp4a.40.2', sampleRate: SR, numberOfChannels: 2, bitrate: bitrate || 160000 });
    const L = buf.getChannelData(0), R = buf.getChannelData(1), N = buf.length, step = 1024;
    for (let i = 0; i < N; i += step) {
      const n = Math.min(step, N - i), data = new Float32Array(n * 2);
      data.set(L.subarray(i, i + n), 0); data.set(R.subarray(i, i + n), n);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: SR, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((i * 1e6) / SR), data });
      enc.encode(ad); ad.close();
    }
    await enc.flush(); enc.close();
  }
  async function upload(name, data) {
    const r = await fetch('/upload?name=' + encodeURIComponent(name), { method: 'POST', body: data });
    if (!r.ok) throw new Error('upload failed: ' + r.status);
    return r.text();
  }
  const canvasBlob = (c, type, q) => new Promise((res) => c.toBlob(res, type, q));

  // one H.264 + AAC MP4 output; frames are drawn into it from the main canvas (scaled if smaller)
  async function makeOutput(w, h, codec, bitrate, audioBitrate, music) {
    const muxer = new Mp4Muxer.Muxer({
      target: new Mp4Muxer.ArrayBufferTarget(),
      video: { codec: 'avc', width: w, height: h, frameRate: FPS },
      audio: { codec: 'aac', numberOfChannels: 2, sampleRate: SR },
      fastStart: 'in-memory', firstTimestampBehavior: 'offset',
    });
    await encodeAudio(muxer, music, audioBitrate);
    const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { Studio.error = String(e); } });
    enc.configure({ codec, width: w, height: h, bitrate, framerate: FPS, latencyMode: 'quality', avc: { format: 'avc' } });
    let src = out;
    if (w !== W) { src = document.createElement('canvas'); src.width = w; src.height = h; }
    return {
      muxer, enc, w,
      push(f) {
        if (src !== out) { const c = src.getContext('2d'); c.imageSmoothingQuality = 'high'; c.drawImage(out, 0, 0, w, h); }
        const vf = new VideoFrame(src, { timestamp: Math.round((f * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
        enc.encode(vf, { keyFrame: f % (FPS * 2) === 0 }); vf.close();
      },
      async finish() { await enc.flush(); enc.close(); muxer.finalize(); return muxer.target.buffer; },
    };
  }

  // opts.small: also write a 720 × 1280 copy under 10 MB for WhatsApp ("-whatsapp.mp4")
  async function render(n, opts) {
    opts = Object.assign({ encode: true, sheet: true, from: 0, to: null, small: true }, opts);
    const part = Studio.parts.find((p) => p.n === n);
    await preload(part);
    const total = Math.round(part.duration * FPS), last = opts.to == null ? total : Math.round(opts.to * FPS);
    clearScene();
    const outs = [];
    const t0 = performance.now();
    if (opts.encode) {
      say(`Part ${n}: composing music…`);
      const music = await makeMusic(n, part.duration);
      outs.push(Object.assign(await makeOutput(W, H, 'avc1.640028', 7_000_000, 160000, music), { file: part.file }));
      if (opts.small) outs.push(Object.assign(await makeOutput(720, 1280, 'avc1.64001f', 2_000_000, 96000, music), { file: part.file.replace(/\.mp4$/, '-whatsapp.mp4') }));
    }
    // contact sheet: one still from the middle of every segment
    const sheetTimes = part.segs.map((s) => +(s.at + s.dur * 0.6).toFixed(2));
    const sheet = document.createElement('canvas'); sheet.width = 270 * 4; sheet.height = 480 * Math.ceil(sheetTimes.length / 4) + 0;
    const sg = sheet.getContext('2d'); sg.fillStyle = '#000'; sg.fillRect(0, 0, sheet.width, sheet.height);
    const stills = [];
    for (let f = 0; f < last; f++) {
      const t = f / FPS;
      drawFrame(part, t);
      if (opts.sheet) {
        const si = sheetTimes.findIndex((s) => Math.round(s * FPS) === f);
        if (si >= 0) { sg.drawImage(out, (si % 4) * 270, Math.floor(si / 4) * 480, 270, 480); if (opts.stills) stills.push([t, await canvasBlob(out, 'image/jpeg', 0.9)]); }
      }
      if (f < Math.round(opts.from * FPS)) continue;
      for (const o of outs) { o.push(f); while (o.enc.encodeQueueSize > 4) await yieldNow(); }
      if (f % 10 === 0) { say(`Part ${n}: frame ${f}/${last} (${((performance.now() - t0) / 1000).toFixed(0)} s)`); await yieldNow(); }
      if (Studio.error) throw new Error(Studio.error);
    }
    const result = { part: n, frames: last, seconds: +((performance.now() - t0) / 1000).toFixed(1) };
    result.files = [];
    for (const o of outs) {
      const buf = await o.finish();
      await upload(o.file, buf);
      result.files.push({ file: o.file, width: o.w, mb: +(buf.byteLength / 1048576).toFixed(2) });
    }
    if (opts.sheet) result.sheet = await upload(part.file.replace(/\.mp4$/, '-sheet.jpg'), await canvasBlob(sheet, 'image/jpeg', 0.88));
    for (const [t, blob] of stills) await upload(part.file.replace(/\.mp4$/, `-still-${t.toFixed(1)}s.jpg`), blob);
    say(`Part ${n} done: ${JSON.stringify(result)}`);
    return result;
  }
  // one frame for a quick look (simulations restart from the start of their segment)
  async function still(n, t, name) {
    const part = Studio.parts.find((p) => p.n === n);
    await preload(part);
    const seg = segAt(part, t);
    clearScene();
    for (let f = Math.round(seg.at * FPS); f <= Math.round(t * FPS); f++) drawFrame(part, f / FPS);
    return upload(name || `preview-part${n}-${t.toFixed(1)}s.jpg`, await canvasBlob(out, 'image/jpeg', 0.9));
  }

  window.Studio = {
    W, H, FPS, C, F, STAGE, URL_TEXT, g, A, S, B, T, V3,
    util: { clamp, lerp, ease, easeOut, fade, mix, alpha, formula, rr, font, textW, rich, pill, pointer, pointerPath, slider, hud, logo },
    ui: { table, tableGeom, legend, card, select, searchBox, levelPills, meter, photo, titleOverlay, endCard },
    draw3D, drawHBonds, frameCamera, clearScene, loaded, camera,
    parts: [], render, still, error: null,
    async ready() {
      await A.load();
      await Promise.all(['700 64px "Bricolage Grotesque"', '600 40px "Schibsted Grotesk"', '700 40px "Schibsted Grotesk"', '500 30px "JetBrains Mono"', '600 30px "JetBrains Mono"'].map((f) => document.fonts.load(f)));
      say('Ready. Studio.render(n) renders part n.');
      return true;
    },
  };
})();

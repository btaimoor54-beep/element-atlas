/* The Element Atlas: core helpers, data, chemistry utilities, routing and search. */
'use strict';
(function () {
  const A = (window.Atlas = {});
  const $ = (A.$ = (s, r = document) => r.querySelector(s));
  A.$$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- DOM ---------- */
  A.h = function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'html') el.innerHTML = v; // only ever passed markup we built from escaped text
        else if (k === 'style') el.style.cssText = v;
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : String(kid));
    }
    return el;
  };
  const h = A.h;
  /* replaceChildren that skips empty slots (DOM would otherwise insert the text "null") */
  A.fill = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false && k !== ''));
  A.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  /* Chemical formula → HTML with subscripts and a trailing charge as superscript. */
  A.formulaHTML = function (f) {
    if (!f) return '';
    let s = String(f).trim(), charge = '', m;
    if ((m = s.match(/^([A-Z][a-z]?)(\d*[+\-−])$/))) { s = m[1]; charge = m[2]; }
    else if ((m = s.match(/^(.*\S)\s+(\d*[+\-−])$/))) { s = m[1]; charge = m[2]; }
    else if ((m = s.match(/^(.*[\]\)])(\d*[+\-−])$/))) { s = m[1]; charge = m[2]; }
    else if ((m = s.match(/^(.*[A-Za-z0-9])([+\-−])$/)) && !/\s/.test(s)) { s = m[1]; charge = m[2]; }
    let out = A.esc(s).replace(/([A-Za-z\)\]])(\d+(?:\.\d+)?)/g, '$1<sub>$2</sub>');
    if (charge) out += '<sup>' + A.esc(charge.replace('-', '−')) + '</sup>';
    return out;
  };
  A.formulaEl = (f, cls) => h('span', { class: cls || null, html: A.formulaHTML(f) });

  /* ---------- Formatting ---------- */
  A.num = function (v, digits) {
    if (v == null || v === '' || Number.isNaN(+v)) return null;
    const n = +v;
    if (digits != null) return n.toLocaleString('en-US', { maximumFractionDigits: digits });
    const a = Math.abs(n);
    const d = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 1 ? 3 : a >= 0.01 ? 4 : 6;
    return n.toLocaleString('en-US', { maximumFractionDigits: d });
  };
  A.tempK = (k) => (k == null ? null : `${A.num(k, 2)} K · ${A.num(+k - 273.15, 1)} °C`);

  /* ---------- Categories, colors, scales ---------- */
  /* ---------- Theme ---------- */
  A.isLight = function () {
    const t = document.documentElement.getAttribute('data-theme');
    if (t === 'light') return true;
    if (t === 'dark') return false;
    return !!(window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches);
  };
  /* Pick readable text (near-black or near-white) for a filled background colour */
  A.onColor = function (hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return '#0b1118';
    const [r, g, b] = [0, 2, 4].map((i) => { const c = parseInt(m[1].slice(i, i + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return L > 0.2 ? '#0b1118' : '#f4f7fa';
  };
  A.noValue = () => (A.isLight() ? '#dde4ea' : '#2a3540');

  /* ---------- Categories, colors, scales (dark / light variants) ---------- */
  A.CATS = [
    { key: 'alkali metal', label: 'Alkali metal', dark: '#ff6f61', light: '#a82d21' },
    { key: 'alkaline earth metal', label: 'Alkaline earth metal', dark: '#ffa552', light: '#924b05' },
    { key: 'transition metal', label: 'Transition metal', dark: '#f2d16b', light: '#705400' },
    { key: 'post-transition metal', label: 'Post-transition metal', dark: '#9ccc65', light: '#386710' },
    { key: 'metalloid', label: 'Metalloid', dark: '#4dd0b5', light: '#0a6454' },
    { key: 'nonmetal', label: 'Reactive nonmetal', dark: '#5fb7ff', light: '#175a9d' },
    { key: 'halogen', label: 'Halogen', dark: '#8c9eff', light: '#4651c2' },
    { key: 'noble gas', label: 'Noble gas', dark: '#c18bff', light: '#7438bd' },
    { key: 'lanthanide', label: 'Lanthanide', dark: '#f78fd2', light: '#992767' },
    { key: 'actinide', label: 'Actinide', dark: '#ff7aa2', light: '#a51e47' },
  ];
  A.catOf = (key) => {
    const c = A.CATS.find((x) => x.key === String(key || '').toLowerCase());
    if (!c) return { key, label: key || 'Unknown', color: A.isLight() ? '#5d6b77' : '#8b9cab' };
    return { key: c.key, label: c.label, color: A.isLight() ? c.light : c.dark };
  };
  A.METALS = new Set(['alkali metal', 'alkaline earth metal', 'transition metal', 'post-transition metal', 'lanthanide', 'actinide']);
  A.isMetal = (el) => A.METALS.has(String(el.category || '').toLowerCase());

  A.ORIGINS = [
    { key: 'big bang', label: 'Big Bang', dark: '#7fb2ff', light: '#2a63c4' },
    { key: 'dying low-mass stars', label: 'Dying low-mass stars', dark: '#ffd166', light: '#9a6a00' },
    { key: 'exploding massive stars', label: 'Exploding massive stars', dark: '#ff7b5c', light: '#c8401f' },
    { key: 'exploding white dwarfs', label: 'Exploding white dwarfs', dark: '#7ee0c3', light: '#127d61' },
    { key: 'merging neutron stars', label: 'Merging neutron stars', dark: '#c79bff', light: '#7240c4' },
    { key: 'cosmic ray fission', label: 'Cosmic-ray fission', dark: '#f5a3d4', light: '#b0337f' },
    { key: 'human synthesis', label: 'Made by humans', dark: '#9aa7b3', light: '#56636e' },
    { key: 'radioactive decay', label: 'Decay of uranium and thorium', dark: '#e3b47c', light: '#9b5a1c' },
  ];
  A.originOf = (k) => {
    const o = A.ORIGINS.find((x) => x.key === String(k || '').toLowerCase());
    if (!o) return { key: k, label: k, color: A.isLight() ? '#56636e' : '#9aa7b3' };
    return { key: o.key, label: o.label, color: A.isLight() ? o.light : o.dark };
  };
  A.originsOf = (el) => (el.origin && el.origin.length ? el.origin : ['radioactive decay']);
  A.STATES = { solid: '#a9bccb', liquid: '#4fd1c5', gas: '#ffbf4f', unknown: '#56636f' };

  const RAMP = ['#1d2b53', '#245d8c', '#2f9a9b', '#7cc77a', '#e9e27c'];
  const hex2rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16));
  A.ramp = function (t) {
    t = Math.min(1, Math.max(0, t));
    const p = t * (RAMP.length - 1), i = Math.min(RAMP.length - 2, Math.floor(p)), f = p - i;
    const a = hex2rgb(RAMP[i]), b = hex2rgb(RAMP[i + 1]);
    return '#' + a.map((v, k) => Math.round(v + (b[k] - v) * f).toString(16).padStart(2, '0')).join('');
  };
  A.rampCSS = 'linear-gradient(90deg,' + RAMP.join(',') + ')';

  /* ---------- Periodic-table layout (IUPAC 18-column, f-block below) ---------- */
  A.periodOf = (z) => (z <= 2 ? 1 : z <= 10 ? 2 : z <= 18 ? 3 : z <= 36 ? 4 : z <= 54 ? 5 : z <= 86 ? 6 : 7);
  A.position = function (z) {
    if (z === 1) return { col: 1, row: 1 };
    if (z === 2) return { col: 18, row: 1 };
    const p = A.periodOf(z);
    if (p === 2 || p === 3) {
      const first = p === 2 ? 3 : 11, i = z - first;
      return { col: i < 2 ? i + 1 : i + 11, row: p };
    }
    if (p === 4 || p === 5) return { col: z - (p === 4 ? 18 : 36), row: p };
    const base = p === 6 ? 55 : 87;
    if (z < base + 2) return { col: z - base + 1, row: p };
    if (z <= base + 16) return { col: z - base + 1, row: p === 6 ? 9 : 10, f: true }; // La–Lu, Ac–Lr in the f rows
    return { col: z - base - 13, row: p }; // Hf (72) → column 4, Rn (86) → 18
  };

  /* ---------- Electron configurations ---------- */
  const CORES = { He: '1s2', Ne: '[He] 2s2 2p6', Ar: '[Ne] 3s2 3p6', Kr: '[Ar] 3d10 4s2 4p6', Xe: '[Kr] 4d10 5s2 5p6', Rn: '[Xe] 4f14 5d10 6s2 6p6' };
  const LNUM = { s: 0, p: 1, d: 2, f: 3 };
  A.LCHAR = 'spdf';
  const MADELUNG = ['1s', '2s', '2p', '3s', '3p', '4s', '3d', '4p', '5s', '4d', '5p', '6s', '4f', '5d', '6p', '7s', '5f', '6d', '7p'];
  const CAP = [2, 6, 10, 14];
  function expandCores(s) { return s.replace(/\[(\w+)\]/g, (_, g) => (CORES[g] ? expandCores(CORES[g]) + ' ' : '')); }
  function aufbau(z) {
    const out = [];
    let left = z;
    for (const k of MADELUNG) {
      if (left <= 0) break;
      const l = LNUM[k[1]], c = Math.min(CAP[l], left);
      out.push({ n: +k[0], l, key: k, count: c });
      left -= c;
    }
    return out;
  }
  /* Returns subshells [{n, l, key, count}] sorted by n then l. Falls back to Madelung filling if the text does not add up to Z. */
  A.parseConfig = function (str, z) {
    const txt = expandCores(String(str || '').replace(/\(.*?\)/g, ' ').replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c)));
    const acc = {};
    const re = /(\d)\s*([spdf])\s*(\d{1,2})/g;
    let m;
    while ((m = re.exec(txt))) acc[m[1] + m[2]] = (acc[m[1] + m[2]] || 0) + +m[3];
    let list = Object.keys(acc).map((k) => ({ n: +k[0], l: LNUM[k[1]], key: k, count: acc[k] }));
    const total = list.reduce((s, x) => s + x.count, 0);
    if (z && total !== z) list = aufbau(z);
    return list.sort((a, b) => a.n - b.n || a.l - b.l);
  };
  A.shellCounts = function (sub) {
    const shells = [];
    for (const s of sub) shells[s.n - 1] = (shells[s.n - 1] || 0) + s.count;
    for (let i = 0; i < shells.length; i++) shells[i] = shells[i] || 0;
    return shells;
  };
  A.SHELL_NAMES = ['K', 'L', 'M', 'N', 'O', 'P', 'Q'];
  /* Valence electrons for bonding pictures: main-group count; for d/f elements the outer s (plus a note). */
  A.valence = function (el) {
    const g = el.group;
    if (el.z === 2) return 2;
    if (g === 1 || g === 2) return g;
    if (g >= 13 && g <= 18) return g - 10;
    const sub = A.parseConfig(el.electronConfiguration, el.z);
    const maxN = Math.max(...sub.map((s) => s.n));
    return sub.filter((s) => s.n === maxN).reduce((a, s) => a + s.count, 0) || 2;
  };

  /* ---------- Data ---------- */
  async function getJSON(url) {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(url + ' → HTTP ' + r.status);
    return r.json();
  }
  A.load = async function () {
    const [els, cmps, photos] = await Promise.all([
      getJSON('data/elements.json'),
      getJSON('data/compounds.json').catch(() => []),
      getJSON('data/photos.json').catch(() => ({})),
    ]);
    A.elements = els.slice().sort((a, b) => a.z - b.z);
    A.byZ = {}; A.bySym = {};
    for (const e of A.elements) {
      A.byZ[e.z] = e; A.bySym[e.symbol] = e;
      e.sub = A.parseConfig(e.electronConfiguration, e.z);
      e.shells = A.shellCounts(e.sub);
      e.pos = A.position(e.z);
    }
    A.compounds = cmps || [];
    A.cmpById = {};
    A.cmpsByEl = {};
    for (const c of A.compounds) {
      A.cmpById[c.id] = c;
      for (const s of c.elements || []) (A.cmpsByEl[s] = A.cmpsByEl[s] || []).push(c);
    }
    A.photos = photos || {};
  };
  A.elColor = (sym) => {
    const e = A.bySym && A.bySym[sym];
    return e && /^#[0-9a-f]{6}$/i.test(e.color || '') ? e.color : '#ff1493';
  };

  /* ---------- Routing ---------- */
  A.views = {};
  A.current = null;
  A.lastArg = {};
  /* Theme switch: explicit 'light' / 'dark' saved in this browser; otherwise follow the viewer or system */
  const THEME_KEY = 'element-atlas-theme';
  const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>';
  const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
  function paintThemeUI() {
    const light = A.isLight();
    // the website tints the phone's browser bar to match the header (the Artifact has no theme-color tag, so nothing happens there)
    for (const m of A.$$('meta[name="theme-color"]')) m.setAttribute('content', light ? '#ffffff' : '#0d151d');
    const b = $('#theme-btn');
    if (!b) return;
    b.innerHTML = (light ? MOON : SUN) + '<span>' + (light ? 'Dark' : 'Light') + '</span>';
    b.title = light ? 'Switch to the dark theme' : 'Switch to the light theme';
  }
  A.setTheme = function (t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    try { if (t) localStorage.setItem(THEME_KEY, t); else localStorage.removeItem(THEME_KEY); } catch (e) { /* storage is optional */ }
    paintThemeUI();
    A.refresh();
  };
  A.initTheme = function () {
    let saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) { saved = null; }
    if (saved === 'light' || saved === 'dark') document.documentElement.setAttribute('data-theme', saved);
    paintThemeUI();
    const b = $('#theme-btn');
    if (b) b.addEventListener('click', () => A.setTheme(A.isLight() ? 'dark' : 'light'));
    if (window.matchMedia) {
      const mq = matchMedia('(prefers-color-scheme: light)');
      const onChange = () => { paintThemeUI(); A.refresh(); };
      if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
    }
    // the viewer can also switch themes by changing the root attribute
    new MutationObserver(() => { paintThemeUI(); A.refresh(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  };
  /* Re-render the current view so theme-dependent colours update */
  let refreshQueued = false;
  A.refresh = function () {
    if (refreshQueued || !A.current) return;
    refreshQueued = true;
    requestAnimationFrame(() => {
      refreshQueued = false;
      const v = A.views[A.current];
      if (v && v.retheme) v.retheme();
    });
  };
  /* ---------- Full screen for the 3D stages ---------- */
  // Uses the browser's Fullscreen API when the page may; otherwise (e.g. an embed that blocks it, or iPhone Safari)
  // the stage simply fills the window. Esc or the button leaves either mode.
  const FS_ICONS = {
    enter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    exit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>',
  };
  const nativeFs = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  let maxed = null;
  function paintFs() {
    const on = nativeFs() || maxed;
    for (const b of A.$$('.fs-btn')) {
      const active = !!on && b.closest('.stage') === on;
      b.setAttribute('aria-pressed', String(active));
      b.setAttribute('aria-label', active ? 'Exit full screen' : 'Full screen');
      b.title = active ? 'Exit full screen (Esc)' : 'Full screen (F)';
      b.innerHTML = active ? FS_ICONS.exit : FS_ICONS.enter;
    }
    document.body.classList.toggle('stage-maxed', !!maxed);
  }
  function setMaxed(stage) {
    if (maxed) maxed.classList.remove('is-max');
    maxed = stage;
    if (stage) stage.classList.add('is-max');
    paintFs();
  }
  A.exitFullscreen = function () {
    if (nativeFs()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    if (maxed) setMaxed(null);
  };
  A.toggleFullscreen = function (stage) {
    if (nativeFs() || maxed) return A.exitFullscreen();
    const req = stage.requestFullscreen || stage.webkitRequestFullscreen;
    if (!req || !(document.fullscreenEnabled || document.webkitFullscreenEnabled)) return setMaxed(stage);
    // some embedded browsers neither grant nor refuse the request; fill the window if nothing happens soon
    let settled = false;
    const fallback = () => { if (!settled) { settled = true; if (!nativeFs()) setMaxed(stage); } };
    try {
      const p = req.call(stage);
      if (p && p.then) p.then(() => { settled = true; }, fallback);
    } catch (e) { fallback(); }
    setTimeout(fallback, 700);
  };
  A.initFullscreen = function () {
    for (const b of A.$$('.fs-btn')) b.addEventListener('click', () => A.toggleFullscreen(b.closest('.stage')));
    document.addEventListener('fullscreenchange', paintFs);
    document.addEventListener('webkitfullscreenchange', paintFs);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && maxed) { setMaxed(null); return; }
      if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey && !/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) {
        const stage = A.$$('.stage').find((s) => s.getClientRects().length);
        if (stage) A.toggleFullscreen(stage);
      }
    });
    paintFs();
  };

  A.go = function (view, arg, opts) {
    const v = A.views[view];
    if (!v) return;
    if (view !== A.current) A.exitFullscreen();
    if (arg) A.lastArg[view] = arg;
    for (const b of A.$$('.tabs button')) b.setAttribute('aria-selected', String(b.dataset.view === view));
    for (const k in A.views) { const sec = $('#v-' + k); if (sec) sec.hidden = k !== view; }
    if (A.current && A.current !== view && A.views[A.current].leave) A.views[A.current].leave();
    A.current = view;
    const token = v.show(arg) || view;
    if (!(opts && opts.noHash)) {
      try { history.replaceState(null, '', '#' + token); } catch (e) { /* hash is a convenience only */ }
    }
  };
  A.route = function () {
    const t = (location.hash || '').slice(1);
    let m;
    if ((m = t.match(/^el-(\d{1,3})$/)) && A.byZ[+m[1]]) return A.go('element', { z: +m[1] }, { noHash: true });
    if ((m = t.match(/^cmp-([a-z0-9\-]+)$/)) && A.cmpById[m[1]]) return A.go('compounds', { id: m[1] }, { noHash: true });
    if ((m = t.match(/^mix-(\d{1,3})-(\d{1,3})$/))) return A.go('combine', { a: +m[1], b: +m[2] }, { noHash: true });
    if (t === 'compounds') return A.go('compounds', null, { noHash: true });
    if (t === 'combine') return A.go('combine', null, { noHash: true });
    if (t === 'element') return A.go('element', null, { noHash: true });
    A.go('table', null, { noHash: true });
  };

  /* ---------- Search ---------- */
  function searchAll(q) {
    q = q.trim().toLowerCase();
    if (!q) return [];
    const out = [];
    for (const e of A.elements) {
      const sym = e.symbol.toLowerCase(), name = e.name.toLowerCase(), alt = String(e.altName || '').toLowerCase();
      let score = 0;
      if (sym === q || String(e.z) === q) score = 100;
      else if (name === q || alt === q) score = 95;
      else if (name.startsWith(q) || (alt && alt.startsWith(q))) score = 80;
      else if (name.includes(q) || (alt && alt.includes(q))) score = 50;
      if (score) out.push({ score, kind: 'el', label: e.name, key: e.symbol + ' · ' + e.z, go: () => A.go('element', { z: e.z }) });
    }
    for (const c of A.compounds) {
      const name = String(c.name || '').toLowerCase(), f = String(c.formula || '').toLowerCase();
      const aka = (c.aka || []).join(' ').toLowerCase();
      let score = 0;
      if (f === q || name === q) score = 90;
      else if (name.startsWith(q)) score = 70;
      else if (name.includes(q) || aka.includes(q)) score = 45;
      else if (f.includes(q) && q.length > 1) score = 40;
      if (score) out.push({ score, kind: 'cmp', label: c.name, key: c.formula, go: () => A.go('compounds', { id: c.id }) });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 12);
  }
  A.initSearch = function () {
    const q = $('#q'), box = $('#qres');
    let items = [], active = -1;
    const close = () => { box.hidden = true; active = -1; };
    const render = () => {
      box.replaceChildren(...items.map((it, i) => h('button', { type: 'button', class: i === active ? 'active' : null, onclick: () => { it.go(); q.value = ''; close(); } },
        h('span', { text: it.label }),
        it.kind === 'cmp' ? A.formulaEl(it.key, 'k') : h('span', { class: 'k', text: it.key }))));
      box.hidden = !items.length;
    };
    q.addEventListener('input', () => { items = searchAll(q.value); active = items.length ? 0 : -1; render(); });
    q.addEventListener('keydown', (e) => {
      if (box.hidden) return;
      if (e.key === 'ArrowDown') { active = Math.min(items.length - 1, active + 1); render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); render(); e.preventDefault(); }
      else if (e.key === 'Enter' && items[active]) { items[active].go(); q.value = ''; close(); }
      else if (e.key === 'Escape') close();
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.search')) close(); });
  };

  /* Seeded random so 3D arrangements are stable between visits. */
  A.rng = function (seed) {
    let s = (seed >>> 0) || 1;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  };
})();

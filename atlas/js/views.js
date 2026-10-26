/* The Element Atlas: views (periodic table, element explorer, compounds, combine). */
'use strict';
(function () {
  const A = window.Atlas, S = A.S, h = A.h, $ = A.$;
  const T = window.THREE, V3 = T.Vector3;
  const fmtSym = (s) => s;

  /* ---------- small shared bits ---------- */
  function section(title, ...kids) { return h('section', null, h('h2', { text: title }), ...kids); }
  function dl(rows) {
    const d = h('dl', { class: 'props' });
    for (const [k, v, pred] of rows) {
      if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue;
      d.append(h('dt', { text: k }), h('dd', null, v, pred ? h('span', { class: 'p', text: 'predicted' }) : null));
    }
    return d;
  }
  function list(items) { return items && items.length ? h('ul', { class: 'plain' }, items.map((t) => h('li', { text: t }))) : null; }
  function elTileStyle(el) { return '--c:' + A.catOf(el.category).color; }
  const stateLabel = (s) => ({ solid: 'Solid', liquid: 'Liquid', gas: 'Gas', unknown: 'Unknown' })[String(s || 'unknown').toLowerCase()] || s;

  /* =====================================================================
     PERIODIC TABLE
     ===================================================================== */
  const COLOR_MODES = [
    ['category', 'Element family'],
    ['state', 'State at room temperature'],
    ['electronegativity', 'Electronegativity (Pauling)'],
    ['origin', 'Where the atoms were made'],
    ['discovery', 'When it was discovered'],
    ['density', 'Density'],
    ['melting', 'Melting point'],
    ['photo', 'Real photo available'],
  ];
  function discoveryEra(el) {
    const y = String((el.discovery && el.discovery.year) || '');
    if (/ancient|prehist/i.test(y)) return 0;
    const n = parseInt(y, 10);
    if (!n) return 0;
    return n < 1800 ? 1 : n < 1900 ? 2 : n < 1950 ? 3 : n < 2000 ? 4 : 5;
  }
  const ERAS = [['Ancient', '#e9e27c'], ['1600s–1799', '#7cc77a'], ['1800–1899', '#2f9a9b'], ['1900–1949', '#245d8c'], ['1950–1999', '#6a5acd'], ['2000 and later', '#c18bff']];
  function colorFor(el, mode) {
    switch (mode) {
      case 'state': return { c: A.STATES[String(el.state || 'unknown').toLowerCase()] || A.STATES.unknown, fill: true };
      case 'electronegativity': return el.electronegativity == null ? { c: A.noValue(), dim: true } : { c: A.ramp((el.electronegativity - 0.7) / (4.0 - 0.7)), fill: true };
      case 'origin': return { c: A.originOf(A.originsOf(el)[0]).color, fill: true };
      case 'discovery': return { c: ERAS[discoveryEra(el)][1], fill: true };
      case 'density': return el.density == null ? { c: A.noValue(), dim: true } : { c: A.ramp((Math.log10(el.density) + 4.2) / (Math.log10(23) + 4.2)), fill: true };
      case 'melting': return el.meltingPoint == null ? { c: A.noValue(), dim: true } : { c: A.ramp(Math.min(1, el.meltingPoint / 3800)), fill: true };
      case 'photo': return A.photos[el.symbol] ? { c: A.isLight() ? '#16917a' : '#4dd0b5', fill: true } : { c: A.noValue(), dim: true };
      default: return { c: A.catOf(el.category).color };
    }
  }
  function legendFor(mode) {
    const sw = (c, t) => h('span', null, h('i', { style: 'background:' + c }), t);
    const ramp = (lo, hi) => [h('span', { text: lo }), h('i', { class: 'ramp', style: 'background:' + A.rampCSS }), h('span', { text: hi })];
    switch (mode) {
      case 'state': return [sw(A.STATES.solid, 'Solid'), sw(A.STATES.liquid, 'Liquid'), sw(A.STATES.gas, 'Gas'), sw(A.STATES.unknown, 'Unknown')];
      case 'electronegativity': return [h('span', null, ...ramp('0.7', '4.0')), sw(A.noValue(), 'No value')];
      case 'origin': return A.ORIGINS.map((o) => sw(A.originOf(o.key).color, o.label));
      case 'discovery': return ERAS.map(([t, c]) => sw(c, t));
      case 'density': return [h('span', null, ...ramp('0.0001 g/cm³', '22.6 g/cm³ (log scale)'))];
      case 'melting': return [h('span', null, ...ramp('0 K', '3,800 K'))];
      case 'photo': return [sw(A.isLight() ? '#16917a' : '#4dd0b5', 'Photo of a real sample'), sw(A.noValue(), 'None: too rare or too short-lived')];
      default: return A.CATS.map((c) => sw(A.catOf(c.key).color, c.label)).concat(h('span', { class: 'muted', text: 'Dashed border: predicted' }));
    }
  }
  const table = {
    built: false, mode: 'category', hover: null,
    build() {
      const sec = $('#v-table');
      const legend = h('div', { class: 'legend', id: 'pt-legend' });
      const sel = h('select', { id: 'colorby', onchange: (e) => { this.mode = e.target.value; this.paint(); } }, COLOR_MODES.map(([k, t]) => h('option', { value: k, text: t })));
      const grid = h('div', { class: 'pt', id: 'pt' });
      for (let g = 1; g <= 18; g++) grid.append(h('div', { class: 'glabel', style: `grid-column:${g};grid-row:1`, text: g }));
      this.peek = h('div', { class: 'peek', style: 'grid-row:2 / 5' });
      grid.append(this.peek);
      grid.append(h('div', { class: 'cell ph', style: 'grid-column:3;grid-row:7', text: '57–71' }));
      grid.append(h('div', { class: 'cell ph', style: 'grid-column:3;grid-row:8', text: '89–103' }));
      grid.append(h('div', { class: 'gap-row', style: 'grid-column:1 / -1;grid-row:9' }));
      grid.append(h('div', { class: 'plabel', style: 'grid-column:1 / 3;grid-row:10;align-self:center;text-align:right;padding-right:6px', text: 'Lanthanides' }));
      grid.append(h('div', { class: 'plabel', style: 'grid-column:1 / 3;grid-row:11;align-self:center;text-align:right;padding-right:6px', text: 'Actinides' }));
      this.cells = {};
      for (const el of A.elements) {
        const p = el.pos;
        const c = h('button', {
          type: 'button', class: 'cell' + (el.categoryPredicted ? ' pred' : ''), style: `grid-column:${p.col};grid-row:${p.row + 1}`,
          'aria-label': `${el.name}, ${el.symbol}, atomic number ${el.z}`,
          onclick: () => A.go('element', { z: el.z }),
          onmouseenter: () => this.showPeek(el), onfocus: () => this.showPeek(el),
        }, h('span', { class: 'z', text: el.z }), h('span', { class: 'sy', text: el.symbol }), h('span', { class: 'nm', text: el.name }));
        this.cells[el.z] = c;
        grid.append(c);
      }
      sec.replaceChildren(h('div', { class: 'table-wrap' },
        h('div', { class: 'table-head' },
          h('div', null, h('h1', { text: 'Every element, from the nucleus out' }),
            h('p', { text: 'Pick an element to explore its atom, nucleus, electron orbitals, how its atoms bond, what it looks like as a solid, liquid or gas, and a photo of a real sample. Then see what it builds when it combines with others.' })),
          h('div', { class: 'colorby' }, h('label', { for: 'colorby', text: 'Color by' }), sel)),
        legend,
        h('div', { class: 'pt-scroll' }, grid)));
      this.built = true;
      this.paint();
      this.showPeek(A.byZ[8]);
    },
    paint() {
      for (const el of A.elements) {
        const c = this.cells[el.z], r = colorFor(el, this.mode);
        c.style.setProperty('--c', r.c);
        c.style.setProperty('--on', A.onColor(r.c));
        c.classList.toggle('fill', !!r.fill);
        c.classList.toggle('dim', !!r.dim);
      }
      $('#pt-legend').replaceChildren(...legendFor(this.mode));
      this.paintedLight = A.isLight();
    },
    retheme() { if (this.built) { this.paint(); this.showPeek(this.lastPeek); } },
    showPeek(el) {
      if (!el) return;
      this.lastPeek = el;
      const ph = A.photos[el.symbol];
      const cat = A.catOf(el.category);
      this.peek.style.setProperty('--c', cat.color);
      this.peek.replaceChildren(
        h('div', { class: 'big' }, h('b', { text: el.symbol }), h('span', { text: el.z })),
        h('div', { style: 'min-width:0' },
          h('h3', { text: el.name }),
          h('div', { class: 'sub', text: `${cat.label} · ${stateLabel(el.state)} at room temperature` }),
          h('dl', null,
            h('dt', { text: 'Atomic mass' }), h('dd', { text: el.atomicMass }),
            h('dt', { text: 'Electrons' }), h('dd', { text: el.electronConfiguration }),
            h('dt', { text: 'Shells' }), h('dd', { text: (el.shells || []).join(' · ') }))),
        ph ? h('img', { src: ph.file, alt: ph.caption || el.name, loading: 'lazy' }) : h('div', { class: 'noimg', text: 'No photo of a real sample exists' }));
    },
    show() {
      if (!this.built) this.build();
      else if (this.paintedLight !== A.isLight()) this.retheme(); // the theme changed while another view was open
      return 'table';
    },
  };
  A.views.table = table;

  /* =====================================================================
     ELEMENT EXPLORER
     ===================================================================== */
  const LEVELS = [
    ['atom', 'Atom'], ['nucleus', 'Nucleus'], ['orbitals', 'Orbitals'], ['bonding', 'Bonding'], ['matter', 'Matter'], ['sample', 'Real sample'],
  ];
  function semfPerNucleon(Z, Am) {
    if (Am < 12) return null;
    const N = Am - Z;
    let B = 15.75 * Am - 17.8 * Math.pow(Am, 2 / 3) - 0.711 * Z * (Z - 1) / Math.cbrt(Am) - 23.7 * (N - Z) * (N - Z) / Am;
    const d = 11.18 / Math.sqrt(Am);
    if (Z % 2 === 0 && N % 2 === 0) B += d; else if (Z % 2 === 1 && N % 2 === 1) B -= d;
    return B / Am;
  }

  /* Lattice to draw for an element's solid: its real cell when it is a simple one,
     otherwise the closest simple model sized from the real nearest-neighbour distance. */
  const DRAWABLE = ['bcc', 'fcc', 'hcp', 'diamond', 'graphite', 'simple-cubic'];
  function drawLattice(el) {
    const b = el.bulk || {};
    const type = DRAWABLE.includes(String(b.renderAs)) ? b.renderAs : null;
    if (!type) return null;
    if (b.lattice === type && b.latticeConstantPm) return { type, a: +b.latticeConstantPm, c: b.cPm ? +b.cPm : null, simplified: false };
    const ef = el.elementalForm || {};
    const nn = +ef.bondLengthPm || 2.2 * (+el.covalentRadius || 140);
    const a = type === 'bcc' ? (2 * nn) / Math.sqrt(3) : type === 'fcc' ? nn * Math.SQRT2 : type === 'diamond' ? (4 * nn) / Math.sqrt(3) : type === 'graphite' ? nn * Math.sqrt(3) : nn;
    return { type, a, c: type === 'hcp' ? a * 1.633 : type === 'graphite' ? 670.8 : null, simplified: true };
  }

  /* Geometry of the pure element's own molecule / network */
  /* Atoms and bonds (Å) of an element's free molecule (H₂ … I₂, P₄, S₈) or single atom (noble gases); null otherwise */
  function elementalGeometry(el) {
    const ef = el.elementalForm || {};
    const kind = String(ef.kind || 'unknown').toLowerCase();
    const sym = el.symbol, form = String(ef.formula || sym);
    const bl = (ef.bondLengthPm ? +ef.bondLengthPm : 2 * (+el.covalentRadius || 100)) / 100;
    if (kind === 'monatomic') return { atoms: [{ el: sym, p: new V3() }], bonds: [] };
    if (kind === 'diatomic') return { atoms: [{ el: sym, p: new V3(-bl / 2, 0, 0) }, { el: sym, p: new V3(bl / 2, 0, 0) }], bonds: [{ a: 0, b: 1, o: +ef.bondOrder || 1 }] };
    if (kind === 'polyatomic' && /^P4/.test(form)) {
      const s = 2.21 / (2 * Math.SQRT2);
      const atoms = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map((v) => ({ el: sym, p: new V3(v[0] * s, v[1] * s, v[2] * s) }));
      const bonds = []; for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) bonds.push({ a: i, b: j, o: 1 });
      return { atoms, bonds };
    }
    if (kind === 'polyatomic' && /^S8/.test(form)) {
      const R = 2.351, hh = 0.496;
      const atoms = Array.from({ length: 8 }, (_, k) => ({ el: sym, p: new V3(R * Math.cos((k * Math.PI) / 4), (k % 2 ? hh : -hh), R * Math.sin((k * Math.PI) / 4)) }));
      return { atoms, bonds: atoms.map((_, k) => ({ a: k, b: (k + 1) % 8, o: 1 })) };
    }
    return null;
  }
  /* Real state of an element at temperature K (kelvin), from its melting and boiling points */
  function elementState(el, K) {
    const mp = el.meltingPoint != null ? +el.meltingPoint : null, bp = el.boilingPoint != null ? +el.boilingPoint : null;
    if (mp == null && bp == null) return null;
    if (mp == null) return K < bp ? (el.z === 2 ? 'liquid' : 'solid') : 'gas';
    if (bp == null) return K < mp ? 'solid' : 'liquid';
    if (mp >= bp) return K < bp ? 'solid' : 'gas';
    return K < mp ? 'solid' : K < bp ? 'liquid' : 'gas';
  }
  function elementalBuild(el, opt) {
    const ef = el.elementalForm || {};
    const kind = String(ef.kind || 'unknown').toLowerCase();
    const sym = el.symbol;
    const form = String(ef.formula || sym);
    const geo = kind === 'monatomic' ? null : elementalGeometry(el);
    if (geo) return S.molecule(geo.atoms, geo.bonds, { lonePairs: S.lonePairCounts(geo.atoms, geo.bonds), labels: opt.labels, measure: opt.measure });
    if (kind === 'polyatomic') {
      if (/chain|^Se|^Te/i.test(form) || sym === 'Se' || sym === 'Te') {
        const r = sym === 'Te' ? 1.1735 : 0.984, c = sym === 'Te' ? 5.929 : 4.954;
        const atoms = [];
        for (let ch = 0; ch < 3; ch++) {
          const off = [new V3(0, 0, 0), new V3(4.4, 0, 0), new V3(2.2, 0, 3.8)][ch];
          for (let k = 0; k < 10; k++) atoms.push({ el: sym, p: new V3(r * Math.cos((2 * Math.PI * k) / 3) + off.x, (c * k) / 3 - (c * 4.5) / 3, r * Math.sin((2 * Math.PI * k) / 3) + off.z) });
        }
        const bonds = [];
        for (let ch = 0; ch < 3; ch++) for (let k = 0; k < 9; k++) bonds.push({ a: ch * 10 + k, b: ch * 10 + k + 1, o: 1 });
        return S.molecule(atoms, bonds, { lonePairs: S.lonePairCounts(atoms, bonds), labels: false });
      }
    }
    if (kind === 'network') {
      const ra = String((el.bulk && el.bulk.renderAs) || '').toLowerCase();
      if (sym === 'B') {
        const phi = (1 + Math.sqrt(5)) / 2, k = 0.885;
        const v = [];
        for (const a of [-1, 1]) for (const b of [-phi, phi]) { v.push([0, a, b], [a, b, 0], [b, 0, a]); }
        const atoms = v.map((p) => ({ el: sym, p: new V3(p[0] * k, p[1] * k, p[2] * k) }));
        const bonds = [];
        for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) if (atoms[i].p.distanceTo(atoms[j].p) < 1.9) bonds.push({ a: i, b: j, o: 0.67 });
        return S.molecule(atoms, bonds, { labels: false });
      }
      const L = drawLattice(el) || { type: ra === 'graphite' ? 'graphite' : 'diamond', a: 543 };
      const type = ['diamond', 'graphite', 'simple-cubic'].includes(L.type) ? L.type : 'diamond';
      return S.crystal({ type, a: L.a, c: L.c, n: type === 'graphite' ? [3, 3, 1] : type === 'simple-cubic' ? [3, 3, 3] : [1, 1, 1] }, { A: sym }, { bonds: 'covalent', cell: true });
    }
    if (kind === 'metallic') {
      const L = drawLattice(el) || { type: 'fcc', a: 2.2 * (+el.covalentRadius || 140) * Math.SQRT2 };
      const type = ['bcc', 'fcc', 'hcp', 'simple-cubic'].includes(L.type) ? L.type : 'fcc';
      return S.crystal({ type, a: L.a, c: L.c, n: type === 'hcp' ? [2, 2, 1] : [2, 2, 2], seed: el.z }, { A: sym }, { bonds: 'none', sea: true, metal: true, radius: (at, nn) => nn * 0.3 });
    }
    return S.lonelyAtom(el);
  }

  /* Units and sites for the temperature view */
  function matterBuild(el) {
    const ef = el.elementalForm || {};
    const kind = String(ef.kind || 'unknown').toLowerCase();
    const sym = el.symbol, bulk = el.bulk || {};
    const ra = String(bulk.renderAs || '').toLowerCase();
    const bl = (ef.bondLengthPm ? +ef.bondLengthPm : 2 * (+el.covalentRadius || 100)) / 100;
    let unit = [{ el: sym, p: new V3() }], unitBonds = [];
    let spacing, sites;
    const metal = kind === 'metallic';
    if (kind === 'diatomic') { unit = [{ el: sym, p: new V3(-bl / 2, 0, 0) }, { el: sym, p: new V3(bl / 2, 0, 0) }]; unitBonds = [[0, 1]]; }
    else if (kind === 'polyatomic' && /^P4/.test(ef.formula || '')) {
      const s = 2.21 / (2 * Math.SQRT2);
      unit = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map((v) => ({ el: sym, p: new V3(v[0] * s, v[1] * s, v[2] * s) }));
      unitBonds = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
    } else if (kind === 'polyatomic' && /^S8/.test(ef.formula || '')) {
      unit = Array.from({ length: 8 }, (_, k) => ({ el: sym, p: new V3(2.351 * Math.cos((k * Math.PI) / 4), k % 2 ? 0.496 : -0.496, 2.351 * Math.sin((k * Math.PI) / 4)) }));
      unitBonds = unit.map((_, k) => [k, (k + 1) % 8]);
    }
    const unitSize = unit.reduce((m, a) => Math.max(m, a.p.length()), 0);
    const atomR = unit.length > 1 ? S.ballR(sym) * 1.05 : null;
    let cellObj = null, solidR;
    const DL = unit.length === 1 ? drawLattice(el) : null;
    if (DL) {
      const L = S.latticePoints({ type: DL.type, a: DL.a, c: DL.c, n: DL.type === 'hcp' ? [3, 3, 2] : DL.type === 'diamond' ? [1, 1, 1] : DL.type === 'graphite' ? [3, 3, 1] : [2, 2, 2] });
      sites = L.atoms.map((x) => x.p);
      spacing = L.nn;
    } else {
      spacing = unit.length > 1 ? unitSize * 2 + 1.6 : 2 * (+el.vdwRadius || +el.covalentRadius * 1.6 || 200) / 100 * 0.9;
      const n = unit.length > 4 ? 3 : 4;
      sites = [];
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) sites.push(new V3((i - (n - 1) / 2) * spacing, (j - (n - 1) / 2) * spacing, (k - (n - 1) / 2) * spacing));
    }
    solidR = sites.reduce((m, p) => Math.max(m, p.length()), 0) + spacing * 0.5;
    return S.matter({
      unit, unitBonds, sites, atomR: atomR || spacing * 0.42, solidR, box: solidR * 2.1, metal, sea: metal, seed: el.z,
    });
  }

  const ex = {
    z: 8, level: 'atom', nucleusMode: 'nucleus', orbSel: null, temp: 298, toggles: { electrons: true, lone: true, labels: false, measure: true },
    simScene: 'molecule', built: false,
    leave() { simUI.stop(); },
    build() {
      const lv = $('#levels');
      lv.replaceChildren(...LEVELS.map(([k, t], i) => h('button', { type: 'button', role: 'tab', id: 'lv-' + k, 'aria-selected': 'false', onclick: () => this.setLevel(k) }, h('i', { text: i + 1 }), t)));
      this.built = true;
    },
    show(arg) {
      if (!this.built) this.build();
      S.mount($('#stage-element'));
      if (arg && arg.z && A.byZ[arg.z]) { if (arg.z !== this.z) { this.orbSel = null; this.nucleusMode = 'nucleus'; } this.z = arg.z; }
      if (arg && arg.level) this.level = arg.level;
      this.renderPanel();
      this.setLevel(this.level, true);
      return 'el-' + this.z;
    },
    el() { return A.byZ[this.z]; },
    retheme() { if (this.built) { const p = $('#el-panel'), top = p.scrollTop; this.renderPanel(); p.scrollTop = top; } },
    setLevel(k, force) {
      this.level = k;
      for (const b of A.$$('#levels button')) b.setAttribute('aria-selected', String(b.id === 'lv-' + k));
      this.renderStage();
    },
    renderStage() {
      const el = this.el(), cap = $('#el-cap'), ctr = $('#el-ctrls');
      ctr.replaceChildren(); cap.replaceChildren();
      simUI.stop(); $('#el-hud').hidden = true;
      const shells = el.shells || [];
      const autoRot = h('label', null, h('input', { type: 'checkbox', id: 'el-rot', checked: !S.reduceMotion, onchange: (e) => S.setAutoRotate(e.target.checked) }), 'Orbit camera');
      S.setAutoRotate(!S.reduceMotion);
      if (this.level === 'atom') {
        S.show(S.atom(el));
        cap.append(h('span', null, h('b', { text: 'Bohr model. ' }), `${el.name} has ${el.z} electron${el.z > 1 ? 's' : ''} in ${shells.length} shell${shells.length > 1 ? 's' : ''} (${shells.join(', ')}). The outer, valence electrons are gold: they do the bonding. Rings are a simplification; electrons really fill 3D orbitals. The nucleus is drawn about 10,000 times too big.`));
      } else if (this.level === 'nucleus') {
        const Am = S.massNumber(el), N = Am - el.z;
        const modes = [['nucleus', 'Whole nucleus'], ['proton', 'Inside a proton'], ['neutron', 'Inside a neutron']];
        ctr.append(...modes.map(([k, t]) => h('button', { type: 'button', class: 'chipbtn', 'aria-pressed': String(this.nucleusMode === k), onclick: () => { this.nucleusMode = k; this.renderStage(); } }, t)));
        if (this.nucleusMode === 'nucleus') {
          S.show(S.nucleus(el));
          const be = semfPerNucleon(el.z, Am);
          cap.append(h('span', null, h('b', { text: `${el.symbol}-${Am}: ` }), `${el.z} protons (red) and ${N} neutrons (grey), bound by the strong nuclear force. Radius ≈ ${A.num(1.2 * Math.cbrt(Am), 1)} fm (1 fm = 10⁻¹⁵ m).` + (be ? ` Binding energy ≈ ${A.num(be, 2)} MeV per nucleon (semi-empirical estimate).` : '')));
        } else {
          S.show(S.nucleon(this.nucleusMode));
          const p = this.nucleusMode === 'proton';
          cap.append(h('span', null, h('b', { text: p ? 'Proton = up + up + down. ' : 'Neutron = up + down + down. ' }), p ? 'Charges +2/3 + 2/3 − 1/3 = +1. ' : 'Charges +2/3 − 1/3 − 1/3 = 0. ', 'Quark colors are the strong-force "color charge". The gold springs are gluons; pale pairs are short-lived quark–antiquark pairs. Quark masses make up only about 1% of the nucleon mass; the rest is field energy.'));
        }
      } else if (this.level === 'orbitals') {
        const sub = el.sub || [];
        if (!this.orbSel) {
          const maxN = Math.max(...sub.map((s) => s.n));
          this.orbSel = new Set(sub.filter((s) => s.n === maxN || (s.l >= 2 && s.count < 4 * s.l + 2)).map((s) => s.key));
        }
        ctr.append(h('span', { class: 'muted', text: 'Subshells:' }), ...sub.map((s) => h('button', {
          type: 'button', class: 'chipbtn', 'aria-pressed': String(this.orbSel.has(s.key)),
          onclick: () => { if (this.orbSel.has(s.key)) { if (this.orbSel.size > 1) this.orbSel.delete(s.key); } else this.orbSel.add(s.key); this.renderStage(); },
        }, s.key, h('sup', { text: s.count }))));
        const chosen = sub.filter((s) => this.orbSel.has(s.key));
        S.show(S.orbitals(el, chosen));
        cap.append(h('span', null, h('b', { text: 'Electron clouds. ' }), `Showing ${chosen.map((s) => s.key + s.count).join(' ')}. Each dot is a place an electron could be found; denser means more likely. Cyan and orange are the two signs (phases) of the wavefunction, which decide how orbitals overlap when atoms bond. Shapes come from hydrogen-like wavefunctions; sizes are compressed so big shells fit.`));
      } else if (this.level === 'bonding') {
        const ef = el.elementalForm || {};
        // molecular elements and noble gases also get the water-lab scenes: a pair, a cluster and many in motion
        const geo = elementalGeometry(el);
        const unit = String(ef.kind || '').toLowerCase() === 'monatomic' ? 'atom' : 'molecule';
        const scene = geo ? this.simScene : 'molecule';
        const chips = geo ? SCENES.map(([k, t]) => h('button', { type: 'button', class: 'chipbtn', 'aria-pressed': String(scene === k), onclick: () => { this.simScene = k; this.renderStage(); } },
          k === 'molecule' ? (unit === 'atom' ? 'One atom' : 'Molecule') : unit === 'atom' ? t.replace('molecules', 'atoms') : t)) : [];
        if (scene !== 'molecule') {
          const ref = el.meltingPoint != null ? +el.meltingPoint : el.boilingPoint != null ? +el.boilingPoint : 150;
          const defT = scene === 'pair' ? Math.round(Math.min(100, Math.max(5, ref * 0.9))) : scene === 'cluster' ? Math.round(Math.min(400, Math.max(5, ref * 0.9))) : 300;
          simUI.run({ key: 'el-' + el.z, name: el.name + (ef.formula && ef.formula !== el.symbol ? ' (' + ef.formula + ')' : ''), unit, geo, scene, cap: S.simCapacity(geo.atoms.length),
            defT, seed: el.z * 3, realState: (K) => elementState(el, K), stage: $('#stage-element'), capEl: cap, ctrEl: ctr, lead: chips });
          return; // the simulation panel has its own controls, including the orbit toggle
        }
        ctr.append(...chips);
        const built = elementalBuild(el, { labels: this.toggles.labels, measure: this.toggles.measure });
        S.show(built);
        if (built.setVisible) { built.setVisible('electrons', this.toggles.electrons); built.setVisible('lone', this.toggles.lone); }
        const tg = (key, text) => h('label', null, h('input', { type: 'checkbox', checked: this.toggles[key], onchange: (e) => { this.toggles[key] = e.target.checked; if (key === 'labels') this.renderStage(); else if (built.setVisible) built.setVisible(key === 'electrons' ? 'electrons' : key === 'measure' ? 'measure' : 'lone', e.target.checked); } }), text);
        if (['diatomic', 'polyatomic', 'network'].includes(String(ef.kind || '').toLowerCase())) ctr.append(tg('electrons', 'Shared electrons'), tg('lone', 'Lone pairs'));
        if (['diatomic', 'polyatomic'].includes(String(ef.kind || '').toLowerCase())) ctr.append(tg('labels', 'Labels'));
        if (built.hasMeasure) ctr.append(tg('measure', 'Angles & lengths'));
        const simp = ['metallic', 'network'].includes(String(ef.kind || '').toLowerCase()) && drawLattice(el) && drawLattice(el).simplified;
        cap.append(h('span', null, h('b', { text: (ef.formula || el.symbol) + '. ' }), ef.description || 'No bonding data.',
          String(ef.kind) === 'metallic' ? ' Cyan dots are the shared sea of valence electrons.' : '',
          simp ? ' The real crystal is more complex; a simpler lattice is drawn.' : ''));
      } else if (this.level === 'matter') {
        const m = matterBuild(el);
        S.show(m);
        const mp = el.meltingPoint != null ? +el.meltingPoint : null, bp = el.boilingPoint != null ? +el.boilingPoint : null;
        const maxT = Math.max(400, Math.round(((bp || mp || 300) * 1.35) / 10) * 10);
        if (this.temp > maxT) this.temp = 298;
        const val = h('span', { class: 'val' });
        const capText = h('span');
        const apply = () => {
          const t = this.temp;
          let phase;
          if (mp == null && bp == null) phase = String(el.state || 'solid').toLowerCase() === 'gas' ? 'gas' : 'solid';
          else if (mp == null) phase = t < bp ? (el.z === 2 ? 'liquid' : 'solid') : 'gas';
          else if (bp == null) phase = t < mp ? 'solid' : 'liquid';
          else if (mp >= bp) phase = t < bp ? 'solid' : 'gas';
          else phase = t < mp ? 'solid' : t < bp ? 'liquid' : 'gas';
          if (phase === 'unknown') phase = 'solid';
          const ref = phase === 'solid' ? mp || bp || 1000 : phase === 'liquid' ? bp || 2 * mp : (bp || mp || 300);
          m.setState(phase, Math.min(1.5, t / Math.max(1, ref)));
          val.textContent = `${t} K · ${A.num(t - 273.15, 0)} °C`;
          const bits = [];
          if (mp != null) bits.push(`melts at ${A.tempK(mp)}`);
          if (bp != null) bits.push(`boils${mp == null || mp >= bp ? ' (or sublimes)' : ''} at ${A.tempK(bp)}`);
          const unk = String(el.state || '').toLowerCase() === 'unknown' || el.statePredicted;
          capText.replaceChildren(h('b', { text: `${phase[0].toUpperCase() + phase.slice(1)} at ${t} K. ` }),
            `${el.name} ${bits.length ? bits.join(' and ') + '.' : 'has no measured melting or boiling point.'} ` +
            (phase === 'solid' && el.bulk && el.bulk.structure ? `Solid structure: ${el.bulk.structure}${el.bulk.latticeConstantPm ? `, a = ${A.num(el.bulk.latticeConstantPm, 1)} pm` : ''}${drawLattice(el) && drawLattice(el).simplified ? ' (drawn as a simpler lattice)' : ''}. ` : '') +
            (phase === 'gas' ? 'In a real gas the particles are about 10 times farther apart than shown. ' : '') +
            (unk ? 'Values for this element are predictions.' : ''));
        };
        const slider = h('input', { type: 'range', id: 'el-temp', min: 1, max: maxT, step: 1, value: this.temp, 'aria-label': 'Temperature in kelvin', oninput: (e) => { this.temp = +e.target.value; apply(); } });
        ctr.append(h('span', { class: 'muted', text: 'Temperature' }), slider, val, h('button', { type: 'button', class: 'chipbtn', onclick: () => { this.temp = 298; slider.value = 298; apply(); } }, 'Room temp'));
        cap.append(capText);
        apply();
      } else if (this.level === 'sample') {
        const ph = A.photos[el.symbol];
        if (ph) {
          S.show(S.specimen(ph.file));
          cap.append(h('span', null, h('b', { text: 'Real sample. ' }), ph.caption || el.name, h('br'), h('span', { class: 'muted', text: `Photo: ${ph.credit || 'Wikimedia Commons'} · ${ph.license || ''}` })));
        } else {
          S.show(S.lonelyAtom(el));
          cap.append(h('span', null, h('b', { text: 'No photo exists. ' }), el.z >= 100 ? `Only a handful of ${el.name} atoms have ever been made, one at a time, and they decay within moments, so there has never been a visible sample.` : `No freely licensed photograph of a ${el.name} sample is available. ${el.appearance || ''}`));
        }
      }
      ctr.append(autoRot);
    },
    renderPanel() {
      const el = this.el(), cat = A.catOf(el.category), panel = $('#el-panel');
      const ph = A.photos[el.symbol];
      const prev = A.byZ[el.z - 1], next = A.byZ[el.z + 1];
      const iso = el.isotopes || {};
      const ef = el.elementalForm || {};
      const ie = el.ionizationEnergy != null ? `${A.num(el.ionizationEnergy, 3)} eV · ${A.num(el.ionizationEnergy * 96.485, 0)} kJ/mol` : null;
      const valSubs = (el.sub || []).filter((s) => s.n === Math.max(...el.sub.map((x) => x.n)) || (s.l >= 2 && s.count < 4 * s.l + 2));
      const boxes = h('div', { class: 'boxes' }, valSubs.map((s) => {
        const occ = S.hundFill(s.l, s.count);
        return h('div', { class: 'sub' }, h('div', { class: 'row' }, occ.map((o) => h('span', { class: 'orb', text: o === 2 ? '↑↓' : o === 1 ? '↑' : '' }))), h('span', { class: 'lab', text: s.key }));
      }));
      const stableRows = (iso.stable || []).map((s) => h('tr', null,
        h('td', { class: 'n', text: `${el.symbol}-${s.A}` }),
        h('td', { class: 'n', text: s.abundance != null ? A.num(s.abundance, 4) + ' %' : '—' }),
        h('td', null, h('div', { class: 'bar', style: `width:${Math.max(2, +s.abundance || 0)}%` }))));
      const radRows = (iso.radioactive || []).map((s) => h('tr', null,
        h('td', { class: 'n', text: `${el.symbol}-${s.A}` }),
        h('td', { class: 'n', text: s.halfLife || '' }),
        h('td', { text: s.note || '' })));
      const cmps = A.cmpsByEl[el.symbol] || [];
      A.fill(panel, 
        h('div', { class: 'navrow' },
          h('button', { type: 'button', disabled: !prev, onclick: () => prev && A.go('element', { z: prev.z }) }, prev ? `← ${prev.z} ${prev.name}` : ''),
          h('button', { type: 'button', disabled: !next, onclick: () => next && A.go('element', { z: next.z }) }, next ? `${next.z} ${next.name} →` : '')),
        h('div', { class: 'el-head', style: elTileStyle(el) },
          h('div', { class: 'el-tile' }, h('span', { class: 'z', text: el.z }), h('span', { class: 'sy', text: el.symbol }), h('span', { class: 'm', text: el.atomicMass })),
          h('div', null, h('h1', { text: el.name }),
            h('div', { class: 'chips' },
              h('span', { class: 'chip cat', style: '--c:' + cat.color, text: cat.label + (el.categoryPredicted ? ' (predicted)' : '') }),
              h('span', { class: 'chip', text: stateLabel(el.state) + (el.statePredicted ? ' (predicted)' : '') }),
              h('span', { class: 'chip', text: `${el.block}-block · period ${el.period}${el.group ? ' · group ' + el.group : ''}` })))),
        ph ? h('figure', { class: 'photo' },
          h('img', { src: ph.file, alt: ph.caption || el.name, onclick: () => lightbox(ph) }),
          h('figcaption', { text: ph.caption || '' }),
          h('span', { class: 'credit' }, `Photo: ${ph.credit || 'Wikimedia Commons'} · `, ph.licenseUrl ? h('a', { href: ph.licenseUrl, target: '_blank', rel: 'noopener', text: ph.license }) : ph.license || '', ' · ', h('a', { href: ph.page, target: '_blank', rel: 'noopener', text: 'source' })))
          : h('div', { class: 'nophoto', text: el.z >= 100 ? 'No photo: no one has ever made enough of this element to see.' : 'No freely licensed photo of a real sample is available.' }),
        el.summary ? h('p', { text: el.summary }) : null,
        section('Key numbers', dl([
          ['Atomic number', String(el.z)],
          ['Atomic mass', el.atomicMass + ' u'],
          ['Electronegativity', el.electronegativity != null ? A.num(el.electronegativity, 2) + ' (Pauling)' : null],
          ['1st ionization energy', ie],
          ['Electron affinity', el.electronAffinity != null ? A.num(el.electronAffinity, 3) + ' eV' : null],
          ['Covalent radius', el.covalentRadius != null ? el.covalentRadius + ' pm' : null],
          ['Van der Waals radius', el.vdwRadius != null ? el.vdwRadius + ' pm' : null],
          ['Melting point', A.tempK(el.meltingPoint)],
          ['Boiling point', A.tempK(el.boilingPoint)],
          ['Density', el.density != null ? A.num(el.density) + ' g/cm³' : null, el.statePredicted],
          ['Oxidation states', (el.oxidationStates || []).map((x) => (x > 0 ? '+' + x : String(x).replace('-', '−'))).join(', ') + ((el.otherOxidationStates || []).length ? ` (also ${(el.otherOxidationStates).map((x) => (x > 0 ? '+' + x : String(x).replace('-', '−'))).join(', ')})` : '')],
          ['Crystal structure', el.bulk && el.bulk.structure],
          ['Abundance in crust', el.crustAbundancePpm != null ? A.num(el.crustAbundancePpm) + ' ppm' : null],
          ['Discovered', el.discovery ? `${el.discovery.year}${el.discovery.by ? ' · ' + el.discovery.by : ''}` : null],
          ['Name', el.nameOrigin],
        ])),
        section('Electrons', h('div', { class: 'config', text: el.electronConfiguration + (el.configPredicted ? '  (predicted)' : '') }),
          h('div', { class: 'muted', style: 'font-size:12.5px', text: `Shells ${A.SHELL_NAMES.slice(0, el.shells.length).join(' ')}: ${el.shells.join(' · ')}. Outer subshells (Hund’s rule fills each orbital singly before pairing):` }), boxes),
        section('Isotopes',
          stableRows.length ? h('table', { class: 'iso' }, h('tr', null, h('th', { text: 'Stable' }), h('th', { text: 'Abundance' }), h('th', { text: '' })), stableRows) : h('p', { class: 'muted', text: 'No stable isotopes: every atom of this element is radioactive.' }),
          radRows.length ? h('table', { class: 'iso', style: 'margin-top:10px' }, h('tr', null, h('th', { text: 'Radioactive' }), h('th', { text: 'Half-life' }), h('th', { text: 'Note' })), radRows) : null),
        section('Where its atoms came from',
          h('div', { class: 'origin' }, A.originsOf(el).map((o) => { const x = A.originOf(o); return h('span', { class: 'chip', style: `color:${x.color};border-color:${x.color}66`, text: x.label }); })),
          el.originNote ? h('p', { class: 'muted', style: 'margin-top:6px;font-size:13px', text: el.originNote }) : null),
        section('How its atoms bond',
          h('p', null, h('b', { text: (ef.formula || el.symbol) + ' · ' }), ef.description || ''),
          (ef.allotropes || []).length ? h('ul', { class: 'plain', style: 'margin-top:8px' }, ef.allotropes.map((a) => h('li', null, h('b', { text: a.name }), a.note ? ': ' + a.note : ''))) : null),
        section('What it looks like', h('p', { text: el.appearance || '' })),
        (el.uses || []).length ? section('Uses', list(el.uses)) : null,
        (el.facts || []).length ? section('Did you know', list(el.facts)) : null,
        section('In living things', h('p', { text: el.biology || 'None known.' })),
        section('Hazards', h('p', { text: el.hazards || '' })),
        section(`Compounds in this atlas (${cmps.length})`,
          cmps.length ? h('div', { class: 'cmp-links' }, cmps.map((c) => h('button', { type: 'button', onclick: () => A.go('compounds', { id: c.id }) }, A.formulaEl(c.formula), ' ', c.name)))
            : h('p', { class: 'muted', text: el.z >= 104 ? 'Too few atoms have been made for ordinary chemistry.' : 'No compounds of this element are in the library yet.' }),
          h('div', { style: 'margin-top:10px' }, h('button', { type: 'button', class: 'chipbtn', onclick: () => A.go('combine', { a: el.z, b: el.z === 8 ? 1 : 8 }) }, `Combine ${el.symbol} with another element →`))),
        h('p', { class: 'note', text: 'Numbers start from PubChem’s periodic table and were cross-checked against IUPAC, NIST and the CRC Handbook. Values marked predicted are theoretical. Photos come from Wikimedia Commons under the license shown.' }));
      panel.scrollTop = 0;
    },
  };
  A.views.element = ex;

  function lightbox(ph) {
    const lb = h('div', { class: 'lightbox', role: 'dialog', 'aria-label': 'Photo', tabindex: '-1', onclick: () => lb.remove(), onkeydown: (e) => { if (e.key === 'Escape') lb.remove(); } },
      h('div', null, h('img', { src: ph.file, alt: ph.caption || '' }), h('p', { text: (ph.caption || '') + ' · ' + (ph.credit || '') + ' · ' + (ph.license || '') })));
    document.body.append(lb); lb.focus();
  }

  /* =====================================================================
     COMPOUNDS
     ===================================================================== */
  /* VSEPR shapes: unit vectors from the central atom to each ligand, in ligand order. */
  const R3 = Math.sqrt(3);
  const SHAPES = {
    'linear': () => [[0, 0, 1], [0, 0, -1]],
    'bent': (ang) => { const t = ((ang || 104.5) * Math.PI) / 360; return [[Math.sin(t), 0, -Math.cos(t)], [-Math.sin(t), 0, -Math.cos(t)]]; },
    'trigonal-planar': () => [[1, 0, 0], [-0.5, R3 / 2, 0], [-0.5, -R3 / 2, 0]],
    'trigonal-pyramidal': (ang) => {
      const c = Math.cos(((ang || 107) * Math.PI) / 180), ca = Math.sqrt((2 * c + 1) / 3), sa = Math.sqrt(1 - ca * ca);
      return [0, 1, 2].map((k) => [sa * Math.cos((k * 2 * Math.PI) / 3), sa * Math.sin((k * 2 * Math.PI) / 3), -ca]);
    },
    'tetrahedral': () => [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map((v) => v.map((x) => x / R3)),
    'trigonal-bipyramidal': () => [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-0.5, R3 / 2, 0], [-0.5, -R3 / 2, 0]],
    'seesaw': () => [[0, 0, 1], [0, 0, -1], [-0.5, R3 / 2, 0], [-0.5, -R3 / 2, 0]],
    'T-shaped': (ang) => { const d = (((180 - (ang || 180)) / 2) * Math.PI) / 180; return [[-Math.sin(d), 0, Math.cos(d)], [-Math.sin(d), 0, -Math.cos(d)], [-1, 0, 0]]; },
    'square-planar': () => [[1, 0, 0], [0, 1, 0], [-1, 0, 0], [0, -1, 0]],
    'square-pyramidal': (ang) => { const t = ((ang || 90) * Math.PI) / 180, z = Math.cos(t), s = Math.sin(t); return [[0, 0, 1], [s, 0, z], [0, s, z], [-s, 0, z], [0, -s, z]]; },
    'octahedral': () => [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]],
    'pentagonal-bipyramidal': () => [[0, 0, 1], [0, 0, -1]].concat([0, 1, 2, 3, 4].map((k) => [Math.cos((k * 2 * Math.PI) / 5), Math.sin((k * 2 * Math.PI) / 5), 0])),
  };
  function perp(d, u, v) { u.crossVectors(d, Math.abs(d.y) < 0.9 ? new V3(0, 1, 0) : new V3(1, 0, 0)).normalize(); v.crossVectors(d, u); }
  /* spec: {center, shape, angle?, ligands:[{el, r, o, ext?:[{el,r,o}], hs?, hr?}]} → atoms and bonds (Å) */
  function buildVsepr(spec) {
    const atoms = [{ el: spec.center, p: new V3() }], bonds = [];
    const dirs = (SHAPES[spec.shape] || SHAPES.tetrahedral)(spec.angle);
    (spec.ligands || []).forEach((lg, i) => {
      const d = new V3().fromArray(dirs[i % dirs.length]).normalize();
      const p = d.clone().multiplyScalar(+lg.r || 1.5);
      const li = atoms.length;
      atoms.push({ el: lg.el, p });
      bonds.push({ a: 0, b: li, o: +lg.o || 1 });
      if (lg.e != null) bonds[bonds.length - 1].e = +lg.e;
      addHs(atoms, bonds, li, d, lg.hs, lg.hr, lg.ext && lg.ext.length ? 1 : 0);
      let prev = li, pos = p.clone(), dir = d.clone();
      (lg.ext || []).forEach((x) => {
        if (x.ang) { // bend away from the straight line by (180 − ang) degrees
          const u = new V3(), v = new V3(); perp(dir, u, v);
          const t = ((180 - x.ang) * Math.PI) / 180;
          dir = dir.clone().multiplyScalar(Math.cos(t)).addScaledVector(u, Math.sin(t)).normalize();
        }
        pos = pos.clone().addScaledVector(dir, +x.r || 1.1);
        const xi = atoms.length;
        atoms.push({ el: x.el, p: pos });
        bonds.push({ a: prev, b: xi, o: +x.o || 1 });
        addHs(atoms, bonds, xi, dir, x.hs, x.hr, 0);
        prev = xi;
      });
    });
    return { atoms, bonds };
  }
  /* Hydrogens on a terminal atom, spread around its outward axis (tetrahedral-like). */
  function addHs(atoms, bonds, idx, axis, n, hr, skip) {
    n = +n || 0;
    if (!n) return;
    const p = atoms[idx].p, u = new V3(), v = new V3();
    perp(axis, u, v);
    const t = ((n === 2 && !skip ? 52.25 : 70.5) * Math.PI) / 180;
    const slots = n + (skip || 0);
    for (let k = 0; k < n; k++) {
      const phi = ((k + (skip || 0)) * 2 * Math.PI) / slots;
      const hd = axis.clone().multiplyScalar(Math.cos(t)).addScaledVector(u, Math.sin(t) * Math.cos(phi)).addScaledVector(v, Math.sin(t) * Math.sin(phi));
      const hi = atoms.length;
      atoms.push({ el: 'H', p: p.clone().addScaledVector(hd, +hr || 1.09) });
      bonds.push({ a: idx, b: hi, o: 1 });
    }
  }
  /* Adamantane-like cage X4Y6 (As4O6, P4O6) with optional terminal atoms (P4O10). */
  function buildCage(st) {
    // X at (±a,±a,±a), bridging Y at (±b,0,0)…: |XY|² = D + 2a² and cos(X–Y–X) = (D − 2a²)/(D + 2a²), D = (b − a)²
    const c = Math.cos((st.ang * Math.PI) / 180);
    const k = (2 * (1 + c)) / (1 - c);
    const a = Math.sqrt((st.ab * st.ab) / (k + 2)), D = k * a * a, b = a + Math.sqrt(D);
    const atoms = [], bonds = [];
    const X = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
    X.forEach((v) => atoms.push({ el: st.x, p: new V3(v[0] * a, v[1] * a, v[2] * a) }));
    const Y = [[b, 0, 0], [-b, 0, 0], [0, b, 0], [0, -b, 0], [0, 0, b], [0, 0, -b]];
    Y.forEach((v) => atoms.push({ el: st.y, p: new V3(v[0], v[1], v[2]) }));
    for (let i = 0; i < 4; i++) for (let j = 4; j < 10; j++) if (atoms[i].p.distanceTo(atoms[j].p) < st.ab * 1.05) bonds.push({ a: i, b: j, o: 1 });
    if (st.terminal) X.forEach((v, i) => {
      const d = new V3(v[0], v[1], v[2]).normalize();
      const ti = atoms.length;
      atoms.push({ el: st.terminal.el, p: atoms[i].p.clone().addScaledVector(d, st.terminal.r) });
      bonds.push({ a: i, b: ti, o: st.terminal.o || 2 });
    });
    return { atoms, bonds };
  }
  /* Buckminsterfullerene: truncated icosahedron; 6:6 edges (not in a pentagon) drawn as double bonds. */
  function buildFullerene(st) {
    const phi = (1 + Math.sqrt(5)) / 2, raw = [];
    const evenPerms = (x, y, z) => [[x, y, z], [y, z, x], [z, x, y]];
    const signs = (v) => { const out = []; for (const sx of v[0] ? [1, -1] : [1]) for (const sy of v[1] ? [1, -1] : [1]) for (const sz of v[2] ? [1, -1] : [1]) out.push([v[0] * sx, v[1] * sy, v[2] * sz]); return out; };
    for (const base of [[0, 1, 3 * phi], [1, 2 + phi, 2 * phi], [phi, 2, phi * phi * phi]]) for (const p of evenPerms(...base)) for (const s of signs(p)) raw.push(s);
    const k = (st.cc || 1.42) / 2;
    const atoms = raw.map((v) => ({ el: 'C', p: new V3(v[0] * k, v[1] * k, v[2] * k) }));
    const edges = [], nb = atoms.map(() => []);
    for (let i = 0; i < atoms.length; i++) for (let j = i + 1; j < atoms.length; j++) if (atoms[i].p.distanceTo(atoms[j].p) < 2.2 * k) { edges.push([i, j]); nb[i].push(j); nb[j].push(i); }
    const inPentagon = (a, b) => {
      // a 5-cycle a-b-x-y-z-a
      for (const x of nb[b]) if (x !== a) for (const y of nb[x]) if (y !== b && y !== a) for (const z of nb[y]) if (z !== x && z !== b && nb[a].includes(z)) return true;
      return false;
    };
    const bonds = edges.map(([a, b]) => ({ a, b, o: inPentagon(a, b) ? 1 : 2 }));
    return { atoms, bonds };
  }
  /* Metallocene sandwich: metal between two eclipsed CnHn rings */
  function buildSandwich(st) {
    const n = st.ring || 5, cc = st.cc || 1.42, R = cc / (2 * Math.sin(Math.PI / n)), dz = st.d || 1.66, ch = st.ch || 1.08;
    const atoms = [{ el: st.metal || 'Fe', p: new V3() }], bonds = [];
    for (const z of [dz, -dz]) {
      const base = atoms.length;
      for (let k = 0; k < n; k++) { const a = (k * 2 * Math.PI) / n; atoms.push({ el: 'C', p: new V3(R * Math.cos(a), z, R * Math.sin(a)) }); }
      for (let k = 0; k < n; k++) {
        const a = (k * 2 * Math.PI) / n;
        atoms.push({ el: 'H', p: new V3((R + ch) * Math.cos(a), z, (R + ch) * Math.sin(a)) });
        bonds.push({ a: base + k, b: base + ((k + 1) % n), o: 1.5 }, { a: base + k, b: base + n + k, o: 1 }, { a: 0, b: base + k, o: 0.5 });
      }
    }
    return { atoms, bonds };
  }
  function unitGeometry(u) {
    if (u.el) return { atoms: [{ el: u.el, p: new V3() }], bonds: [] };
    if (u.vsepr) return buildVsepr(u.vsepr);
    return { atoms: (u.atoms || []).map((a) => ({ el: a[0], p: new V3(+a[1], +a[2], +a[3]) })), bonds: (u.bonds || []).map((b) => ({ a: b[0], b: b[1], o: +b[2] || 1 })) };
  }

  const GEN = { vsepr: buildVsepr, sandwich: buildSandwich, cage: buildCage, fullerene: buildFullerene };
  /* Atoms and bonds (Å) of a compound that exists as discrete molecules; null for crystals, alloys and ion sets. */
  function molecularGeometry(c) {
    const st = c.structure || {};
    if (GEN[st.mode]) return GEN[st.mode](st);
    if (st.mode === 'xyz' && Array.isArray(st.atoms) && st.atoms.length) {
      const atoms = st.atoms.map((a, i) => ({ el: a[0], p: new V3(+a[1], +a[2], +a[3]), q: st.charges ? +st.charges[i] || 0 : 0 }));
      const bonds = (st.bonds || []).map((b) => ({ a: b[0], b: b[1], o: +b[2] || 1, e: b[3] != null ? +b[3] : null })).filter((b) => atoms[b.a] && atoms[b.b]);
      return { atoms, bonds };
    }
    return null;
  }

  function compoundBuild(c, opt) {
    const st = c.structure || {};
    const mode = st.mode;
    const g = molecularGeometry(c);
    if (g) return S.molecule(g.atoms, g.bonds, { style: opt.style, lonePairs: opt.lone ? S.lonePairCounts(g.atoms, g.bonds) : null, labels: opt.labels && g.atoms.length <= 40, measure: opt.measure });
    if (mode === 'lattice') {
      const types = (c.bonding && c.bonding.types) || [];
      const n = st.type === 'molybdenite' ? [3, 3, 1] : st.type === 'laves-c15' ? [1, 1, 1] : st.type === 'cacu5' ? [2, 2, 2] : undefined;
      if (types.some((t) => /metallic/i.test(t)) && !types.some((t) => /ionic|covalent/i.test(t))) {
        const roleA = Array.isArray(st.cationMix) ? st.cationMix : st.cation;
        return S.crystal({ type: st.type, a: +st.a, c: st.c ? +st.c : null, n, seed: 7 }, { A: roleA, X: st.anion, B: st.b }, { bonds: 'none', sea: true, metal: true, cell: true, radius: (at, nn) => nn * 0.4 });
      }
      const ionic = types.some((t) => /ionic/i.test(t)) && !/zincblende|wurtzite|cristobalite|tungsten-carbide|molybdenite/.test(st.type);
      return S.crystal({ type: st.type, a: +st.a, c: st.c ? +st.c : null, u: st.u ? +st.u : null, n, seed: 4 }, { A: st.cation, X: st.anion, B: st.b }, { bonds: ionic ? 'ionic' : 'covalent', cell: true, electrons: !ionic && opt.electrons });
    }
    if (mode === 'alloy') {
      const comp = (st.composition || []).map((x) => ({ el: x.el, fraction: +x.fraction }));
      const type = ['fcc', 'bcc', 'hcp'].includes(st.lattice) ? st.lattice : 'fcc';
      const a = +st.a || (type === 'bcc' ? 287 : 360);
      const spec = { type, a, c: st.c ? +st.c : null, n: type === 'hcp' ? [3, 3, 2] : [3, 3, 3], seed: 21 };
      let extra = null;
      if (st.interstitial && st.interstitial.el) { // small atoms (carbon in steel) in octahedral gaps at cube-edge midpoints
        const L = S.latticePoints(spec), rnd = A.rng(5), half = a / 200;
        const lim = L.atoms.reduce((m, x) => Math.max(m, Math.abs(x.p.x)), 0) - 0.01;
        const cand = L.atoms.map((x) => x.p.clone().add(new V3(half, 0, 0))).filter((p) => p.x <= lim);
        const k = Math.max(2, Math.round(L.atoms.length * (+st.interstitial.fraction || 0.03)));
        extra = [];
        for (let i = 0; i < k && cand.length; i++) extra.push({ el: st.interstitial.el, p: cand.splice(Math.floor(rnd() * cand.length), 1)[0] });
      }
      return S.crystal(spec, { A: comp }, { bonds: 'none', sea: true, metal: true, radius: (at, nn) => nn * 0.32, extra });
    }
    if (mode === 'ions' && Array.isArray(st.units)) {
      const atoms = [], bonds = [], tags = [];
      const units = [];
      st.units.forEach((u) => { for (let k = 0; k < Math.min(14, Math.max(1, +u.count || 1)); k++) units.push(u); });
      const n = Math.min(units.length, 24);
      const cols = Math.ceil(Math.sqrt(n));
      const geos = units.slice(0, n).map(unitGeometry);
      const span = Math.max(3.4, ...geos.map((g) => 2 * g.atoms.reduce((m, a) => Math.max(m, a.p.length()), 0) + 2.4));
      geos.forEach((g, idx) => {
        const u = units[idx];
        const r = g.atoms.reduce((m, a) => Math.max(m, a.p.length()), 0);
        const gx = (idx % cols) - (cols - 1) / 2, gy = Math.floor(idx / cols) - (Math.ceil(n / cols) - 1) / 2;
        const off = new V3(gx * span, -gy * span, (((idx * 7) % 3) - 1) * 0.6);
        const base = atoms.length;
        g.atoms.forEach((a) => atoms.push({ el: a.el, p: a.p.clone().add(off) }));
        g.bonds.forEach((b) => bonds.push({ a: base + b.a, b: base + b.b, o: b.o }));
        tags.push({ text: u.label, p: off.clone().add(new V3(0, r + 0.9, 0)), charge: +u.charge || 0 });
      });
      const m = S.molecule(atoms, bonds, { style: opt.style, lonePairs: null, labels: false });
      tags.forEach((t) => {
        const s = S.label(t.text.replace(/-$/, '−').replace(/ (\d*)-$/, ' $1−'), { size: 0.36, px: 40, color: t.charge > 0 ? '#ffa552' : t.charge < 0 ? '#6fd3ff' : '#dce6ee', depthTest: false });
        s.position.copy(t.p); m.group.add(s);
      });
      m.radius = Math.max(m.radius, cols * 2.2);
      return m;
    }
    return S.lonelyAtom(A.bySym[(c.elements || ['H'])[0]] || A.byZ[1]);
  }

  /* Water-lab style scenes: the same molecule as a pair, a cluster or many molecules in motion */
  const SIM_SPEEDS = [0.25, 0.5, 1, 2, 3, 5, 8, 12];
  const SCENES = [['molecule', 'Molecule'], ['pair', 'Two molecules'], ['cluster', 'Cluster'], ['bulk', 'Many molecules']];
  function simInfo(c) {
    const geo = molecularGeometry(c);
    if (!geo) return null;
    const st = c.structure || {};
    const formal = geo.atoms.reduce((s, a) => s + (a.q || 0), 0) + (+st.charge || 0);
    if (formal !== 0 || /[+\-−]$/.test(String(c.formula || '').trim())) return null; // charged species are not simulated as free molecules
    const n = geo.atoms.length, cap = S.simCapacity(n);
    return { geo, n, cap, pair: n <= 80, many: n <= 40 && cap >= 4 };
  }
  /* The compound's real state at a temperature, from its measured melting and boiling points */
  function realState(c, K) {
    const mp = c.meltingPointC, bp = c.boilingPointC, C = K - 273.15;
    if (mp == null && bp == null) return null;
    if (mp != null && bp != null && bp <= mp) return C < bp ? 'solid' : 'gas'; // sublimes at 1 atm (CO₂, SF₆)
    if (mp == null && bp != null) return C < bp ? 'solid' : 'gas'; // no liquid at 1 atm: the boiling point is the sublimation point (acetylene)
    if (mp != null && C < mp) return 'solid';
    if (bp != null && C >= bp) return 'gas';
    if (mp != null) return 'liquid';
    return null;
  }

  /* Unique bond lengths and angles of a molecule, measured from its 3D model */
  const bondSym = (o) => (o >= 2.5 ? '≡' : o >= 1.75 ? '=' : '–');
  function measureGeometry(g) {
    const zOf = (s) => (A.bySym[s] ? A.bySym[s].z : 0);
    const nb = g.atoms.map(() => []);
    g.bonds.forEach((b) => { nb[b.a].push(b.b); nb[b.b].push(b.a); });
    const lengths = [], angles = [];
    let polar = null;
    g.bonds.forEach((b) => {
      const [x, y] = [g.atoms[b.a].el, g.atoms[b.b].el].sort((p, q) => zOf(q) - zOf(p)); // heavier atom first
      const o = +b.o || 1;
      const kind = x + bondSym(o) + y + (o > 1.25 && o < 1.75 ? ' (ring)' : '');
      const pm = g.atoms[b.a].p.distanceTo(g.atoms[b.b].p) * 100;
      if (pm > 1 && !lengths.some((l) => l.kind === kind && Math.abs(l.pm - pm) < 1.5)) lengths.push({ kind, pm });
      const ex = A.bySym[x], ey = A.bySym[y];
      const d = ex && ey && ex.electronegativity != null && ey.electronegativity != null ? Math.abs(ex.electronegativity - ey.electronegativity) : null;
      if (d != null && (!polar || d > polar.d)) polar = { kind: x + bondSym(o) + y, d };
    });
    g.atoms.forEach((a, i) => {
      const ns = nb[i];
      for (let x = 0; x < ns.length; x++) for (let y = x + 1; y < ns.length; y++) {
        const deg = (g.atoms[ns[x]].p.clone().sub(a.p).angleTo(g.atoms[ns[y]].p.clone().sub(a.p)) * 180) / Math.PI;
        if (deg > 178) continue;
        const ends = [g.atoms[ns[x]].el, g.atoms[ns[y]].el].sort((p, q) => zOf(q) - zOf(p));
        const kind = ends[0] + '–' + a.el + '–' + ends[1];
        if (!angles.some((l) => l.kind === kind && Math.abs(l.deg - deg) < 1.5)) angles.push({ kind, deg });
      }
    });
    return { lengths, angles, polar };
  }
  const bondClass = (d) => (d < 0.4 ? 'nonpolar covalent' : d < 1.8 ? 'polar covalent' : 'strongly polar, nearly ionic');

  /* =====================================================================
     WATER-LAB SIMULATION PANEL: one running simulation with its controls, caption and HUD.
     Shared by compound molecules and element molecules (H₂, N₂, O₂, halogens, P₄, S₈, noble gases).
     ===================================================================== */
  const SIM_CHARGES = { pair: true, cluster: false, bulk: false }; // partial-charge labels shown by default, per scene
  function polarityNote(d) {
    if (d < 0.05) return 'At this setting the electrons are shared evenly, so there are no partial charges.';
    if (d < 0.4) return 'At this setting the sharing is nearly even: almost nonpolar.';
    if (d < 1.0) return 'At this setting the sharing is uneven: polar bonds.';
    return 'At this setting the sharing is strongly uneven: very polar bonds.';
  }
  function drawSpark(cvs, hist) {
    const g = cvs.getContext('2d'), w = cvs.width, hh = cvs.height;
    g.clearRect(0, 0, w, hh);
    if (hist.length < 2) return;
    const pts = hist.slice(-120), maxY = Math.max(1, Math.ceil(Math.max(...pts) + 0.25));
    const xs = w / 119, y = (val) => hh - 3 - (Math.min(val, maxY) / maxY) * (hh - 6);
    const path = () => { g.beginPath(); pts.forEach((val, i) => (i ? g.lineTo(i * xs, y(val)) : g.moveTo(0, y(val)))); };
    path(); g.lineTo((pts.length - 1) * xs, hh); g.lineTo(0, hh); g.closePath();
    g.fillStyle = 'rgba(255,191,79,.18)'; g.fill();
    path(); g.strokeStyle = '#ffbf4f'; g.lineWidth = 2.5; g.stroke();
  }
  const simUI = {
    polarity: 1, speedIdx: 4, electrons: true, lone: true, clouds: true, showHB: true, frozen: false, temps: {}, charges: {}, timer: null,
    stop() { clearInterval(this.timer); this.timer = null; },
    /* o: {key, name, unit: 'molecule'|'atom', geo, scene, cap, defT, seed, realState(K), stage, capEl, ctrEl, lead: [nodes before the controls]} */
    run(o) {
      this.stop();
      const scene = o.scene, tpl = S.simTemplate(o.geo.atoms, o.geo.bonds);
      const count = scene === 'pair' ? 2 : scene === 'cluster' ? Math.min(12, o.cap) : Math.min(64, o.cap);
      const tKey = o.key + ':' + scene;
      const T0 = this.temps[tKey] != null ? this.temps[tKey] : o.defT;
      const sim = S.molSim(tpl, { count, layout: scene, T: T0, speed: SIM_SPEEDS[this.speedIdx], chargeScale: this.polarity, seed: o.seed + count });
      S.show(sim);
      const chargesOn = this.charges[scene] != null ? this.charges[scene] : SIM_CHARGES[scene];
      sim.setVisible('electrons', this.electrons); sim.setVisible('lone', this.lone); sim.setVisible('clouds', this.clouds);
      sim.setVisible('charges', chargesOn); sim.setVisible('hbonds', this.showHB); sim.setFrozen(this.frozen);
      S.setAutoRotate(!S.reduceMotion);
      const hb = sim.canHBond, polar = sim.dchiMax >= 0.05;
      const atomsOnly = o.unit === 'atom';
      const plural = atomsOnly ? 'atoms' : 'molecules';
      // caption
      const capSpan = h('span');
      const updateCap = () => {
        const K = this.temps[tKey] != null ? this.temps[tKey] : T0;
        const real = o.realState ? o.realState(K) : null;
        capSpan.replaceChildren(h('b', { text: (count === 2 ? 'Two ' + plural : count + ' ' + plural) + ' of ' + o.name + '. ' }),
          atomsOnly ? 'Each atom moves under a simple force field with sizes from van der Waals radii. ' : 'Each one moves and tumbles under a simple force field: atom sizes come from van der Waals radii' + (polar ? ' and partial charges (δ+ and δ−) from electronegativity, so opposite charges attract. ' : '. '),
          polar ? '' : 'With no partial charges, only weak van der Waals attraction holds them together. ',
          hb ? 'Dashed gold lines are hydrogen bonds: an H on one molecule held by a lone pair on another (H···acceptor under 2.6 Å, nearly in line). ' : '',
          polar ? polarityNote(sim.dchiMax * this.polarity) + ' ' : '',
          real ? `In reality, at ${K} K ${o.name.split(' (')[0].toLowerCase()} is a ${real}. ` : '',
          'Simulated melting and boiling temperatures are only approximate.');
      };
      updateCap();
      // controls: each label, slider and value stay together when the controls wrap
      const tval = h('span', { class: 'val', text: T0 + ' K' });
      const pval = h('span', { class: 'val', text: 'Δχ ' + (sim.dchiMax * this.polarity).toFixed(2) });
      const sval = h('span', { class: 'val', text: SIM_SPEEDS[this.speedIdx] + ' fs/frame' });
      const tg = (k, label, kind, get, set) => h('label', null, h('input', { type: 'checkbox', checked: get(), onchange: (e) => { set(e.target.checked); sim.setVisible(kind, e.target.checked); } }), label);
      const flag = (k) => [() => this[k], (v) => { this[k] = v; }];
      const freeze = h('button', { type: 'button', class: 'chipbtn', 'aria-pressed': String(this.frozen), onclick: () => { this.frozen = !this.frozen; sim.setFrozen(this.frozen); freeze.setAttribute('aria-pressed', String(this.frozen)); freeze.textContent = this.frozen ? 'Resume motion' : 'Freeze motion'; } }, this.frozen ? 'Resume motion' : 'Freeze motion');
      o.ctrEl.replaceChildren(...(o.lead || []), ...[
        h('label', { class: 'slider' }, h('span', { text: 'Temperature' }),
          h('input', { type: 'range', min: 5, max: 800, step: 5, value: T0, 'aria-label': 'Temperature in kelvin', oninput: (e) => { const K = +e.target.value; this.temps[tKey] = K; sim.setTemp(K); tval.textContent = K + ' K'; updateCap(); } }), tval),
        polar ? h('label', { class: 'slider' }, h('span', { text: 'Polarity' }),
          h('input', { type: 'range', min: 0, max: 100, step: 1, value: Math.round(this.polarity * 100), 'aria-label': 'How hard the more electronegative atom pulls the shared electrons', oninput: (e) => { this.polarity = e.target.value / 100; sim.setChargeScale(this.polarity); pval.textContent = 'Δχ ' + (sim.dchiMax * this.polarity).toFixed(2); updateCap(); } }), pval) : null,
        h('label', { class: 'slider' }, h('span', { text: 'Speed' }),
          h('input', { type: 'range', min: 0, max: SIM_SPEEDS.length - 1, step: 1, value: this.speedIdx, 'aria-label': 'Simulation speed', oninput: (e) => { this.speedIdx = +e.target.value; sim.setSpeed(SIM_SPEEDS[this.speedIdx]); sval.textContent = SIM_SPEEDS[this.speedIdx] + ' fs/frame'; } }), sval),
        sim.hasElectrons ? tg('electrons', 'Shared electrons', 'electrons', ...flag('electrons')) : null,
        sim.hasLonePairs ? tg('lone', 'Lone pairs', 'lone', ...flag('lone')) : null,
        sim.hasClouds ? tg('clouds', 'Electron clouds', 'clouds', ...flag('clouds')) : null,
        sim.hasCharges ? tg('charges', 'Partial charges', 'charges', () => chargesOn, (v) => { this.charges[scene] = v; }) : null,
        hb ? tg('showHB', 'Hydrogen bonds', 'hbonds', ...flag('showHB')) : null,
        freeze,
        h('button', { type: 'button', class: 'chipbtn', onclick: () => this.run(o) }, 'Restart'),
        h('label', null, h('input', { type: 'checkbox', checked: !S.reduceMotion, onchange: (e) => S.setAutoRotate(e.target.checked) }), 'Orbit camera'),
      ].filter(Boolean));
      o.capEl.replaceChildren(capSpan);
      // HUD: temperature, hydrogen bonds (count, per molecule and a live chart), simulated time
      const hud = o.stage.querySelector('.hud'), q = (k) => hud.querySelector('[data-hud="' + k + '"]');
      hud.hidden = false;
      q('hb-chip').hidden = !hb; q('spark-chip').hidden = !hb;
      const tick = () => {
        const s = sim.stats(), hist = sim.history();
        q('t').textContent = Math.round(s.T) + ' K';
        q('time').textContent = s.ps.toFixed(2) + ' ps';
        if (!hb) return;
        q('hb').textContent = s.hb;
        q('per').textContent = (s.hb / s.N).toFixed(2);
        drawSpark(q('spark'), hist);
      };
      tick();
      this.timer = setInterval(tick, 300);
      return sim;
    },
  };

  const cv = {
    id: null, cat: 'All', q: '', style: 'ball', electrons: true, lone: true, labels: true, measure: null, built: false,
    scene: 'molecule',
    leave() { simUI.stop(); },
    retheme() { const c = A.cmpById[this.id]; if (this.built && c) { const p = $('#c-panel'), top = p.scrollTop; this.renderPanel(c); p.scrollTop = top; } },
    build() {
      const cats = ['All'].concat([...new Set(A.compounds.map((c) => c.category))]);
      const sel = $('#ccat');
      sel.replaceChildren(...cats.map((c) => h('option', { value: c, text: c === 'All' ? `All categories (${A.compounds.length})` : c })));
      sel.onchange = () => { this.cat = sel.value; this.renderList(); };
      $('#cq').oninput = (e) => { this.q = e.target.value.trim().toLowerCase(); this.renderList(); };
      this.built = true;
    },
    show(arg) {
      if (!this.built) this.build();
      S.mount($('#stage-compound'));
      if (arg && arg.id && A.cmpById[arg.id]) this.id = arg.id;
      if (!this.id && A.compounds.length) this.id = (A.cmpById.water ? 'water' : A.compounds[0].id);
      this.renderList();
      this.renderCompound();
      return this.id ? 'cmp-' + this.id : 'compounds';
    },
    renderList() {
      const box = $('#clist');
      const q = this.q;
      const match = (c) => (this.cat === 'All' || c.category === this.cat) && (!q || [c.name, c.formula, (c.aka || []).join(' '), (c.elements || []).join(' ')].join(' ').toLowerCase().includes(q) || (c.elements || []).some((s) => s.toLowerCase() === q));
      const groups = {};
      for (const c of A.compounds) if (match(c)) (groups[c.category] = groups[c.category] || []).push(c);
      const kids = [];
      for (const g in groups) {
        kids.push(h('h4', { text: g }));
        for (const c of groups[g]) kids.push(h('button', { type: 'button', 'aria-current': String(c.id === this.id), onclick: () => A.go('compounds', { id: c.id }) }, h('span', { text: c.name }), A.formulaEl(c.formula, 'f')));
      }
      if (!kids.length) kids.push(h('p', { class: 'muted', style: 'padding:10px', text: 'No compounds match.' }));
      box.replaceChildren(...kids);
      const cur = box.querySelector('[aria-current="true"]');
      if (cur) cur.scrollIntoView({ block: 'nearest' });
    },
    renderCompound() {
      const c = A.cmpById[this.id];
      if (!c) { $('#c-panel').replaceChildren(h('p', { class: 'muted', text: 'The compound library is still loading.' })); return; }
      simUI.stop();
      const info = simInfo(c);
      const avail = SCENES.filter(([k]) => k === 'molecule' || (info && (k === 'pair' ? info.pair : info.many)));
      if (!avail.some(([k]) => k === this.scene)) this.scene = 'molecule';
      const tabs = $('#c-scenes');
      tabs.hidden = avail.length < 2;
      tabs.replaceChildren(...avail.map(([k, t]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(this.scene === k), onclick: () => { this.scene = k; this.renderCompound(); } }, t)));
      $('#c-hud').hidden = true;
      if (this.scene === 'molecule') this.renderMolecule(c); else this.renderSim(c, info);
      this.renderPanel(c);
    },
    renderSim(c, info) {
      const mpK = c.meltingPointC != null ? c.meltingPointC + 273.15 : null;
      const defT = this.scene === 'pair' ? 100 : this.scene === 'cluster' ? Math.round(Math.min(400, Math.max(40, mpK ? mpK * 0.9 : 150)) / 5) * 5 : 300;
      simUI.run({ key: c.id, name: c.name, unit: 'molecule', geo: info.geo, scene: this.scene, cap: info.cap, defT, seed: c.id.length * 7, realState: (K) => realState(c, K), stage: $('#stage-compound'), capEl: $('#c-cap'), ctrEl: $('#c-ctrls') });
    },
    renderMolecule(c) {
      const cap = $('#c-cap'), ctr = $('#c-ctrls');
      const st = c.structure || {};
      const g = molecularGeometry(c);
      // angles and bond lengths start switched on for small molecules, where they stay readable
      const measureOn = this.measure != null ? this.measure : !!g && g.atoms.length <= 12;
      const built = compoundBuild(c, { style: this.style, lone: this.lone, labels: this.labels, electrons: this.electrons, measure: measureOn });
      S.show(built);
      if (built.setVisible) { built.setVisible('electrons', this.electrons); built.setVisible('lone', this.lone); }
      const tg = (k, t, rebuild) => h('label', null, h('input', { type: 'checkbox', checked: this[k], onchange: (e) => { this[k] = e.target.checked; if (rebuild) this.renderCompound(); else if (built.setVisible) built.setVisible(k === 'electrons' ? 'electrons' : 'lone', e.target.checked); } }), t);
      ctr.replaceChildren();
      const molecular = ['xyz', 'vsepr', 'sandwich', 'cage', 'fullerene'].includes(st.mode);
      if (molecular || st.mode === 'ions') {
        ctr.append(h('button', { type: 'button', class: 'chipbtn', 'aria-pressed': String(this.style === 'ball'), onclick: () => { this.style = 'ball'; this.renderCompound(); } }, 'Ball & stick'),
          h('button', { type: 'button', class: 'chipbtn', 'aria-pressed': String(this.style === 'space'), onclick: () => { this.style = 'space'; this.renderCompound(); } }, 'Space-filling'));
        if (this.style === 'ball') ctr.append(...[tg('electrons', 'Shared electrons'), molecular ? tg('lone', 'Lone pairs', true) : null, molecular ? tg('labels', 'Labels', true) : null,
          built.hasMeasure ? h('label', null, h('input', { type: 'checkbox', checked: measureOn, onchange: (e) => { this.measure = e.target.checked; built.setVisible('measure', e.target.checked); } }), 'Angles & lengths') : null].filter(Boolean));
      }
      ctr.append(h('label', null, h('input', { type: 'checkbox', checked: !S.reduceMotion, onchange: (e) => S.setAutoRotate(e.target.checked) }), 'Orbit camera'));
      S.setAutoRotate(!S.reduceMotion);
      const sharing = 'Each pair of moving dots on a bond is a shared electron pair: one pair for a single bond, two for a double, three for a triple. Dots sit nearer the atom that pulls electrons harder. Violet dots are lone pairs.' + (built.hasMeasure ? ' Gold arcs mark bond angles; blue labels give bond lengths.' : '');
      const capText = {
        xyz: (st.source ? st.source + '. ' : '') + sharing,
        vsepr: 'Shape built from measured bond lengths and angles. ' + sharing,
        cage: 'A cage built from measured bond lengths and angles. ' + sharing,
        fullerene: '60 carbon atoms in 12 pentagons and 20 hexagons. Double bonds sit on the edges shared by two hexagons. ' + sharing,
        sandwich: 'The iron sits between two flat five-carbon rings; thin lines show it bonding to all ten carbons at once. ' + sharing,
        lattice: `Crystal (${st.type}${st.a ? ', a = ' + A.num(st.a, 1) + ' pm' : ''}). The gold box is one unit cell; the crystal repeats it in every direction. Ball sizes are not to scale.`,
        alloy: 'Metal atoms share a sea of loose electrons (cyan). Atoms of each metal are placed at random in their real proportions; the real microstructure is more complex.',
        ions: 'Ions in one formula unit, with charges. The real crystal packs them in a repeating 3D pattern that is not shown here.',
      }[st.mode] || '';
      cap.replaceChildren(h('span', null, h('b', { text: c.name + '. ' }), capText, st.note ? ' ' + st.note : ''));
    },
    /* "By the numbers", as in the water lab: lengths and angles measured from the 3D model, plus electronegativities */
    numbers(c) {
      const g = molecularGeometry(c);
      const chis = (c.elements || []).map((s) => A.bySym[s]).filter((e) => e && e.electronegativity != null).map((e) => e.symbol + ' ' + A.num(e.electronegativity, 2));
      if (!g || !g.bonds.length) return chis.length > 1 ? section('By the numbers', dl([['Electronegativity', chis.join(' · ')]])) : null;
      const m = measureGeometry(g);
      const more = (arr, n) => (arr.length > n ? ` · +${arr.length - n} more` : '');
      return section('By the numbers', dl([
        ['Bond lengths', m.lengths.slice(0, 8).map((l) => `${l.kind} ${A.num(l.pm, 1)} pm`).join(' · ') + more(m.lengths, 8)],
        ['Bond angles', m.angles.slice(0, 8).map((a) => `${a.kind} ${A.num(a.deg, 1)}°`).join(' · ') + more(m.angles, 8)],
        ['Electronegativity', chis.length ? chis.join(' · ') : null],
        ['Most polar bond', m.polar ? `${m.polar.kind}, Δχ ${A.num(m.polar.d, 2)} (${bondClass(m.polar.d)})` : null],
      ]), h('p', { class: 'note', text: 'Lengths and angles are measured from the 3D model shown, so they match the arcs and labels in the view.' }));
    },
    renderPanel(c) {
      const panel = $('#c-panel');
      const b = c.bonding || {};
      A.fill(panel, 
        h('div', null, h('div', { class: 'formula-big', html: A.formulaHTML(c.formula) }), h('h1', { style: 'margin:4px 0 0;font:700 26px/1.1 var(--display)', text: c.name }),
          (c.aka || []).length ? h('div', { class: 'muted', style: 'font-size:12.5px;margin-top:4px', text: 'Also: ' + c.aka.join(', ') }) : null,
          h('div', { class: 'chips' }, h('span', { class: 'chip', text: c.category }), c.state ? h('span', { class: 'chip', text: c.state }) : null, (b.types || []).map((t) => h('span', { class: 'chip', style: 'color:var(--accent);border-color:color-mix(in srgb, var(--accent) 45%, transparent)', text: t })))),
        c.summary ? h('p', { text: c.summary }) : null,
        section('Made of', h('div', { class: 'cmp-links' }, (c.elements || []).map((s) => { const e = A.bySym[s]; return e ? h('button', { type: 'button', style: '--c:' + A.catOf(e.category).color, onclick: () => A.go('element', { z: e.z }) }, h('b', { style: 'color:var(--c)', text: s }), ' ', e.name) : null; }))),
        section('Bonds and electron sharing', h('p', { text: b.summary || '' }), b.electronSharing ? h('p', { style: 'margin-top:8px', text: b.electronSharing }) : null,
          dl([['Shape', b.geometry], ['Bond lengths', b.bondLengths]])),
        this.numbers(c),
        c.formation ? section('How it forms', h('p', { class: 'config', style: 'font-size:13.5px', html: A.esc(c.formation).replace(/->/g, '→').replace(/([A-Za-z\)\]])(\d+)/g, '$1<sub>$2</sub>') })) : null,
        section('Properties', dl([
          ['State', c.state],
          ['Melting point', c.meltingPointC != null ? A.num(c.meltingPointC, 1) + ' °C' : null],
          ['Boiling point', c.boilingPointC != null ? A.num(c.boilingPointC, 1) + ' °C' : null],
          ['Found / made', c.occurrence],
        ])),
        (c.uses || []).length ? section('Uses', list(c.uses)) : null,
        (c.facts || []).length ? section('Did you know', list(c.facts)) : null,
        c.hazards ? section('Hazards', h('p', { text: c.hazards })) : null,
        c.pubchemCid ? h('p', { class: 'note' }, 'More data: ', h('a', { href: 'https://pubchem.ncbi.nlm.nih.gov/compound/' + c.pubchemCid, target: '_blank', rel: 'noopener', text: 'PubChem CID ' + c.pubchemCid })) : null);
      panel.scrollTop = 0;
    },
  };
  A.views.compounds = cv;

  /* =====================================================================
     COMBINE TWO ELEMENTS
     ===================================================================== */
  const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
  function predict(ea, eb) {
    const xa = ea.electronegativity, xb = eb.electronegativity;
    const noble = (e) => String(e.category).toLowerCase() === 'noble gas';
    const res = { kind: 'covalent', title: '', why: '', formula: null, order: 1, transfer: 0, dchi: xa != null && xb != null ? Math.abs(xa - xb) : null };
    if (noble(ea) || noble(eb)) {
      const other = noble(ea) ? eb : ea, ng = noble(ea) ? ea : eb;
      if (['Xe', 'Kr', 'Rn'].includes(ng.symbol) && ['F', 'O'].includes(other.symbol)) {
        res.kind = 'covalent'; res.title = 'Rare noble-gas compound';
        res.why = `${ng.name} has a full outer shell, but its outermost electrons are far enough from the nucleus that ${other.name}, one of the most electronegative elements, can pull them into bonds. Compounds such as XeF₂, XeF₄ and KrF₂ exist.`;
      } else {
        res.kind = 'none'; res.title = 'No stable compound';
        res.why = `${ng.name} has a full outer shell, so its atoms neither give, take nor share electrons under normal conditions.`;
      }
      return res;
    }
    if (ea.z === eb.z) {
      if (A.isMetal(ea)) { res.kind = 'metallic'; res.title = 'Metallic bonding'; res.why = `${ea.name} atoms pool their valence electrons into a shared sea that holds the positive ions together.`; }
      else { res.kind = 'covalent'; res.title = 'Nonpolar covalent'; res.why = `Identical atoms pull equally, so they share electrons evenly.`; res.order = (ea.elementalForm && +ea.elementalForm.bondOrder) || 1; res.formula = (ea.elementalForm && ea.elementalForm.formula) || ea.symbol; }
      return res;
    }
    if (A.isMetal(ea) && A.isMetal(eb)) {
      res.kind = 'metallic'; res.title = 'Metallic bonding (alloy)';
      res.why = `Both are metals. Mixed together they usually form an alloy or intermetallic compound in which both kinds of atoms share one sea of delocalized electrons.`;
      return res;
    }
    // positive partner = lower electronegativity
    let pos = ea, neg = eb;
    if (xa != null && xb != null && xa > xb) { pos = eb; neg = ea; }
    const ox = (e) => (e.oxidationStates || []).map(Number).filter((n) => !Number.isNaN(n));
    const pPos = ox(pos).filter((n) => n > 0); const pNeg = ox(neg).filter((n) => n < 0);
    const cp = pPos.length ? pPos[0] : Math.max(1, A.valence(pos));
    const cn = pNeg.length ? -pNeg[0] : Math.max(1, 8 - A.valence(neg));
    const g = gcd(cp, cn), nPos = cn / g, nNeg = cp / g;
    const sub = (s, n) => s + (n > 1 ? n : '');
    let first = pos, second = neg, n1 = nPos, n2 = nNeg;
    if (pos.symbol === 'H' && [13, 14, 15].includes(neg.group)) { first = neg; second = pos; n1 = nNeg; n2 = nPos; }
    res.formula = sub(first.symbol, n1) + sub(second.symbol, n2);
    const d = res.dchi;
    const metalNon = A.isMetal(pos) !== A.isMetal(neg);
    if (d != null && (d >= 1.8 || (metalNon && d >= 1.2))) {
      res.kind = 'ionic'; res.title = 'Ionic bond';
      res.transfer = Math.min(3, cp);
      res.why = `${neg.name} pulls electrons much harder (Δχ = ${A.num(d, 2)}), so ${pos.name} gives ${cp > 1 ? cp + ' electrons' : 'an electron'} away and becomes a positive ion, and ${neg.name} becomes a negative ion. Opposite charges attract.`;
    } else if (d != null && d >= 0.4) {
      res.kind = 'covalent'; res.title = 'Polar covalent bond';
      res.why = `The atoms share electron pairs, but ${neg.name} pulls them closer (Δχ = ${A.num(d, 2)}), giving it a partial negative charge (δ−) and ${pos.name} a partial positive one (δ+).`;
    } else {
      res.kind = 'covalent'; res.title = 'Nonpolar covalent bond';
      res.why = `The two atoms pull on electrons almost equally (Δχ = ${d != null ? A.num(d, 2) : 'unknown'}), so they share electron pairs nearly evenly.`;
    }
    if (res.kind === 'covalent') {
      const needA = pos.z === 1 ? 1 : Math.max(1, 8 - A.valence(pos)), needB = neg.z === 1 ? 1 : Math.max(1, 8 - A.valence(neg));
      res.order = Math.max(1, Math.min(3, needA, needB));
    }
    return res;
  }
  const mix = {
    a: 11, b: 17, built: false,
    show(arg) {
      S.mount($('#stage-combine'));
      if (arg && arg.a && A.byZ[arg.a]) this.a = arg.a;
      if (arg && arg.b && A.byZ[arg.b]) this.b = arg.b;
      this.render();
      return `mix-${this.a}-${this.b}`;
    },
    render() {
      const ea = A.byZ[this.a], eb = A.byZ[this.b];
      const opts = (v) => A.elements.map((e) => h('option', { value: e.z, selected: e.z === v, text: `${e.z} · ${e.symbol} · ${e.name}` }));
      const sa = h('select', { id: 'mix-a', onchange: (e) => A.go('combine', { a: +e.target.value, b: this.b }) }, opts(this.a));
      const sb = h('select', { id: 'mix-b', onchange: (e) => A.go('combine', { a: this.a, b: +e.target.value }) }, opts(this.b));
      const r = predict(ea, eb);
      S.show(S.combine(ea, eb, r.kind === 'covalent' && /noble/i.test(r.title) ? 'covalent' : r.kind, { order: r.order, transfer: r.transfer }));
      S.setAutoRotate(false);
      const known = A.compounds.filter((c) => (c.elements || []).includes(ea.symbol) && (c.elements || []).includes(eb.symbol) && (ea.z !== eb.z || (c.elements || []).length === 1));
      const pct = r.dchi != null ? Math.min(100, (r.dchi / 3.3) * 100) : null;
      $('#m-cap').replaceChildren(h('span', null, h('b', { text: r.title + '. ' }),
        r.kind === 'ionic' ? 'Watch the gold valence electron' + (r.transfer > 1 ? 's' : '') + ' jump to the other atom.' :
        r.kind === 'covalent' ? 'Watch electrons from both atoms pair up between them and stay shared.' :
        r.kind === 'metallic' ? 'Watch the valence electrons leave both atoms and roam around them.' : 'The atoms meet and drift apart again.'));
      $('#m-ctrls').replaceChildren(h('label', null, h('input', { type: 'checkbox', onchange: (e) => S.setAutoRotate(e.target.checked) }), 'Orbit camera'));
      $('#m-panel').replaceChildren(
        h('div', null, h('h1', { style: 'margin:0;font:700 26px/1.1 var(--display)', text: 'Combine two elements' }),
          h('p', { class: 'muted', style: 'margin-top:6px', text: 'Choose any two elements to see how their atoms would bond, and which real compounds in this atlas contain both.' })),
        h('div', { class: 'pick' }, h('label', { for: 'mix-a' }, 'First element', sa), h('span', { class: 'plus', text: '+' }), h('label', { for: 'mix-b' }, 'Second element', sb)),
        h('div', { class: 'verdict' },
          h('div', { class: 'kind', text: r.title }),
          r.formula ? h('div', null, h('span', { class: 'muted', text: 'Simplest formula by charge balance: ' }), h('span', { class: 'formula-big', style: 'font-size:18px', html: A.formulaHTML(r.formula) })) : null,
          h('p', { text: r.why }),
          pct != null ? h('div', null,
            h('div', { class: 'meter' }, h('div', { class: 'track' }), h('div', { class: 'mk', style: `left:${pct}%` })),
            h('div', { class: 'meter-l' }, h('span', { text: 'Δχ 0' }), h('span', { text: '0.4', style: 'left:12.1%' }), h('span', { text: '1.8', style: 'left:54.5%' }), h('span', { text: '3.3' })),
            h('div', { class: 'meter-l2' }, h('span', { text: 'shared evenly' }), h('span', { text: 'transferred' }))) : null),
        section('The two atoms', dl([
          [ea.name, `${ea.symbol} · χ ${ea.electronegativity != null ? A.num(ea.electronegativity, 2) : '—'} · ${A.valence(ea)} valence e⁻ · usual charge ${(ea.oxidationStates || []).join(', ')}`],
          [eb.name, `${eb.symbol} · χ ${eb.electronegativity != null ? A.num(eb.electronegativity, 2) : '—'} · ${A.valence(eb)} valence e⁻ · usual charge ${(eb.oxidationStates || []).join(', ')}`],
        ])),
        section(`Real compounds with both (${known.length})`, known.length ? h('div', { class: 'cmp-links' }, known.map((c) => h('button', { type: 'button', onclick: () => A.go('compounds', { id: c.id }) }, A.formulaEl(c.formula), ' ', c.name))) : h('p', { class: 'muted', text: 'None in this atlas yet. The prediction above is a rule of thumb, not a guarantee that the compound exists.' })),
        section('Try a famous pair', h('div', { class: 'cmp-links' }, [[11, 17, 'Na + Cl'], [1, 8, 'H + O'], [6, 8, 'C + O'], [7, 1, 'N + H'], [20, 9, 'Ca + F'], [29, 30, 'Cu + Zn'], [54, 9, 'Xe + F'], [26, 8, 'Fe + O'], [14, 8, 'Si + O'], [31, 33, 'Ga + As']].map(([x, y, t]) => h('button', { type: 'button', onclick: () => A.go('combine', { a: x, b: y }) }, t)))),
        h('p', { class: 'note', text: 'Bond type uses Pauling electronegativity difference (Δχ): below 0.4 nonpolar covalent, 0.4–1.8 polar covalent, above about 1.8 (or a metal with a nonmetal well apart) ionic. The formula balances each element’s most common charge. Real chemistry has many exceptions: carbon and oxygen also make CO, and iron makes FeO, Fe₂O₃ and Fe₃O₄.' }));
    },
  };
  A.views.combine = mix;

  /* =====================================================================
     START
     ===================================================================== */
  async function start() {
    A.initTheme();
    A.initFullscreen();
    for (const b of A.$$('.tabs button')) b.addEventListener('click', () => A.go(b.dataset.view));
    try {
      await A.load();
    } catch (e) {
      $('#v-table').replaceChildren(h('div', { class: 'loading', text: 'Could not load the element data: ' + e.message }));
      return;
    }
    A.initSearch();
    A.route();
    window.addEventListener('hashchange', A.route);
  }
  start();
})();

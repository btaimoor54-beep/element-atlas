/* The four explainer videos: a timeline of segments per part (see storyboard.md).
   Segment: { id, at, dur, step, caption, scene() -> atlas 3D scene, camera {orbit °/s, zoom [from,to] over zoomDur from zoomAt, dir, lookY, fit, radius},
              update(built, lt, env), draw(env), title [kicker], titleY, end, manual3D }  — times in seconds. */
(function () {
  'use strict';
  const P = window.Studio, { util: U, ui, STAGE, C, F, A, B, S, g } = P;
  const el = (s) => A.bySym[s];
  const cmp = (id) => A.cmpById[id];
  const TABLE = { x: 66, y: 420, w: 948, h: 560 };
  const IN = (x) => STAGE.x + x; // stage-relative x
  const FRAME = 1 / P.FPS;

  /* helpers */
  function tabs(labels, active, y, a) {
    let x = STAGE.x + 30;
    for (const l of labels) {
      const on = l === active, w = U.textW(l, on ? 700 : 600, 30, F.body) + 44;
      g.save(); g.globalAlpha = a;
      U.rr(x, y, w, 64, 16); g.fillStyle = on ? U.mix(C.accent, C.raise, 0.8) : 'rgba(8,13,19,0.78)'; g.fill();
      g.strokeStyle = on ? U.alpha(C.accent, 0.9) : C.line; g.lineWidth = on ? 3 : 2; g.stroke();
      U.font(on ? 700 : 600, 30, F.body); g.fillStyle = on ? C.text : C.muted; g.fillText(l, x + 22, y + 43);
      g.restore();
      x += w + 10;
    }
  }
  const SCENE_TABS = ['Molecule', 'Two molecules', 'Cluster', 'Many'];
  const hideSprites = (b) => { b.group.traverse((o) => { if (o.isSprite) o.visible = false; }); return b; };
  // start an animated scene part-way through, e.g. at a moment when no quark hides behind another from this camera
  const startAt = (b, t0) => { const u = b.update; b.update = (dt, t) => u(dt, t + t0); return b; };
  // prewarm: frames simulated before the shot starts (optionally at a lower temperature, so a cluster has time to gather)
  function sim(c, layout, count, T, speed, prewarm, charges, opts) {
    opts = opts || {};
    const info = B.simInfo(c);
    const tpl = S.simTemplate(info.geo.atoms, info.geo.bonds);
    const s = S.molSim(tpl, { count, layout, T: opts.warmT || T, speed, chargeScale: 1, seed: 7 * c.id.length + count, follow: !!opts.follow });
    for (const k of ['electrons', 'lone', 'clouds', 'hbonds']) s.setVisible(k, true);
    s.setVisible('charges', !!charges);
    for (let i = 0; i < (prewarm || 0); i++) s.update(FRAME, i * FRAME);
    s.setTemp(T);
    return s;
  }
  // several scenes in one shot, switching at given local times (radius and view follow the visible one)
  function sequence(steps) {
    const group = new P.T.Group();
    const built = steps.map(([, make]) => { const b = make(); group.add(b.group); return b; });
    const api = {
      group, radius: built[0].radius, view: built[0].view, idx: 0,
      update(dt, t) {
        let i = 0; steps.forEach(([at], k) => { if (t >= at) i = k; });
        built.forEach((b, k) => { b.group.visible = k === i; });
        api.idx = i; api.radius = built[i].radius; api.view = built[i].view;
        if (built[i].update) built[i].update(dt, t - steps[i][0]); // orbital clouds are static
      },
    };
    return api;
  }
  const dip = (lt, ats, w) => Math.min(...ats.map((at) => 1 - 0.85 * Math.max(0, 1 - Math.abs(lt - at) / w))); // brief dim around cuts
  function stageNote(text, a, y) {
    U.pill(text, P.W / 2, y || STAGE.y + STAGE.h - 110, { center: true, size: 30, alpha: a, fam: F.body, weight: 600, color: C.text, border: C.line2, fill: `rgba(8,13,19,${0.8 * a})`, borderAlpha: 1 });
  }
  const molBuild = (id) => () => B.compoundBuild(cmp(id), { style: 'ball', lone: true, labels: true, electrons: true, measure: true });

  /* ===================== Part 1: the periodic table ===================== */
  const MODES = [['state', 'State at room temperature'], ['origin', 'Where the atoms were made']];
  const part1 = {
    n: 1, title: 'Find any element', duration: 30, file: 'element-atlas-part1-find-any-element.mp4',
    images: ['img/O.jpg'], next: 'Next: Part 2 · Zoom into an atom',
    segs: [
      { id: 'title', at: 0, dur: 3.2, title: ['PART 1 OF 4'], noFade: true,
        caption: 'A quick tour of the free *Element Atlas* website.',
        draw: (e) => ui.table(TABLE, { appear: 0.6 + e.lt * 1.2 }) },
      { id: 'table', at: 3.2, dur: 5.4, step: 'Periodic table',
        caption: 'All *118 elements*, laid out like the real periodic table.',
        draw: (e) => { const geo = ui.table(TABLE, {}); ui.legend('category', IN(30), geo.bottom + 30, STAGE.w - 60, e.a); } },
      { id: 'tap', at: 8.6, dur: 5.8, step: 'Tap',
        caption: '*Tap* any element to open its card.',
        draw: (e) => {
          const geo = P.ui.tableGeom(TABLE), o = geo.at(el('O'));
          const hot = U.easeOut((e.lt - 1.45) / 0.4);
          ui.table(TABLE, { highlight: 'O', hot });
          const k = U.easeOut((e.lt - 1.7) / 0.5);
          if (k > 0) ui.card(el('O'), { x: TABLE.x, y: geo.bottom + 60 + (1 - k) * 60, w: TABLE.w, h: 300 }, k, P.loaded['img/O.jpg']);
          if (e.lt < 2.6) U.pointerPath(e.lt, [540, 1330], [o.x + o.w / 2, o.y + o.h / 2], 0.25, 1.3, 1.4, U.clamp((2.6 - e.lt) / 0.4));
        } },
      { id: 'colorby', at: 14.4, dur: 5.8, step: 'Color by',
        caption: 'Use *Color by* to see states, where atoms were made and more.',
        draw: (e) => {
          const i = Math.min(1, Math.floor(e.lt / 2.9)), into = e.lt - i * 2.9;
          const mode = MODES[i][0], from = i === 0 ? 'category' : MODES[i - 1][0];
          ui.select('Color by', MODES[i][1], IN(30), STAGE.y + 40, STAGE.w - 60, 1);
          const geo = ui.table(TABLE, { mode, fromMode: from, blend: U.ease((into - 0.25) / 0.5) });
          ui.legend(mode, IN(30), geo.bottom + 30, STAGE.w - 60, U.clamp((into - 0.4) / 0.4));
          const tap = [IN(STAGE.w - 70), STAGE.y + 78];
          if (into < 0.9) U.pointer(tap[0], tap[1], U.clamp((into - 0.05) / 0.6), U.clamp(Math.min(into / 0.15, (0.9 - into) / 0.25)));
        } },
      { id: 'search', at: 20.2, dur: 5.4, step: 'Search',
        caption: 'Or *search* for any element or compound.',
        scene: molBuild('water'), camera: { orbit: 14, lookY: -0.55, fit: 1.35 }, manual3D: true,
        draw: (e) => {
          const q = 'water', typed = q.slice(0, Math.max(0, Math.min(q.length, Math.floor((e.lt - 0.35) / 0.18))));
          const hits = A.compounds.filter((c) => /water/i.test(c.name)).slice(0, 3)
            .map((c, i) => ({ name: c.name.replace(/ \(.*\)$/, ''), right: U.formula(c.formula), a: (e.lt - 1.45 - i * 0.12) / 0.3 }));
          const opened = U.easeOut((e.lt - 3.4) / 0.5);
          if (opened > 0) P.draw3D(opened * e.a);
          ui.searchBox(typed, typed.length < q.length || Math.floor(e.lt * 2) % 2 === 0, typed.length === q.length ? hits.map((h) => Object.assign(h, { a: h.a * (1 - opened) })) : [], IN(30), STAGE.y + 40, STAGE.w - 60, 1);
          if (e.lt > 2.1 && e.lt < 3.9) U.pointerPath(e.lt, [760, 1300], [520, STAGE.y + 40 + 120 + 45], 2.1, 2.9, 3.0, U.clamp((3.9 - e.lt) / 0.3));
        } },
      { id: 'end', at: 25.6, dur: 4.4, end: true, step: 'Try it', caption: 'Free · no sign-up · works on *any phone*.' },
    ],
  };

  /* ===================== Part 2: the element explorer ===================== */
  const O = () => el('O');
  const levelDraw = (key) => (e) => ui.levelPills(key, IN(30), STAGE.y + 30, STAGE.w - 60, 1, U.clamp(e.lt / 0.4));
  // one 2p orbital: its two lobes are the classic dumbbell (the full 2p⁴ set overlaps into a ball)
  function onePOrbital() {
    const b = S.orbitals(O(), [{ n: 2, l: 1, key: '2p', count: 1 }]);
    b.group.traverse((o) => { if (o.isPoints) o.material.size *= 2; if (o.isSprite) o.visible = false; });
    return b;
  }
  const part2 = {
    n: 2, title: 'Zoom into an atom', duration: 30, file: 'element-atlas-part2-zoom-into-an-atom.mp4',
    images: ['img/O.jpg'], next: 'Next: Part 3 · Molecules in motion',
    segs: [
      { id: 'title', at: 0, dur: 3, title: ['PART 2 OF 4'], noFade: true,
        caption: 'Pick an element, then zoom through *six levels*.',
        scene: () => S.atom(O()), camera: { orbit: 12, zoom: [1.25, 1.0], zoomDur: 3 } },
      { id: 'atom', at: 3, dur: 4.5, step: 'Level 1 · Atom',
        caption: '*Atom*: electrons in shells. The outer (gold) ones do the bonding.',
        scene: () => S.atom(O()), camera: { orbit: 10, zoom: [1.1, 0.9], lookY: 0.6 }, draw: levelDraw('atom') },
      { id: 'nucleus', at: 7.5, dur: 5, step: 'Level 2 · Nucleus',
        caption: '*Nucleus*: 8 protons and 8 neutrons, each made of *3 quarks*.',
        scene: () => sequence([[0, () => S.nucleus(O())], [2.6, () => startAt(hideSprites(S.nucleon('proton')), 7.75)]]),
        camera: { orbit: 16, lookY: 0.12, fit: 0.8 }, manual3D: true,
        draw: (e) => {
          P.draw3D(e.a * U.clamp(dip(e.lt, [2.6], 0.25)));
          levelDraw('nucleus')(e);
          stageNote(e.built.idx === 0 ? '8 protons (red) · 8 neutrons (grey)' : 'Proton = up + up + down quarks (charge +1)', U.clamp(Math.min(e.lt - 0.3, Math.abs(e.lt - 2.6) - 0.2) / 0.3));
        } },
      { id: 'orbitals', at: 12.5, dur: 3, step: 'Level 3 · Orbitals',
        caption: '*Orbitals*: clouds showing where electrons are likely to be.',
        scene: onePOrbital, camera: { orbit: 4, dir: [0, 0.25, 1], fit: 0.72, lookY: 0.1 },
        draw: (e) => { levelDraw('orbitals')(e); stageNote('Two lobes, like a dumbbell', U.clamp((e.lt - 0.3) / 0.3)); } },
      { id: 'bonding', at: 15.5, dur: 4, step: 'Level 4 · Bonding',
        caption: '*Bonding*: two oxygen atoms share electrons to make *O₂*.',
        scene: () => B.elementalBuild(O(), { labels: true, measure: true }), camera: { orbit: 8, lookY: 0.15, fit: 1.25 }, draw: levelDraw('bonding') },
      { id: 'matter', at: 19.5, dur: 4.2, step: 'Level 5 · Matter',
        caption: '*Matter*: change the temperature: solid, liquid, gas.',
        // close on the solid and liquid, pulling back to the whole box as the gas spreads out
        scene: () => B.matterBuild(O()), camera: { orbit: 10, lookY: 0.1, fit: 1.35, zoom: [0.45, 1], zoomAt: 2.75, zoomDur: 0.8 },
        update: (b, lt, e) => {
          // each phase is held about a second: solid at 40 K, liquid at 72 K, gas at 150 K (O₂ melts at 54 K, boils at 90 K)
          const K = Math.round(lt < 1.3 ? 40 : lt < 1.6 ? U.lerp(40, 72, U.ease((lt - 1.3) / 0.3)) : lt < 2.8 ? 72 : U.lerp(72, 150, U.ease((lt - 2.8) / 0.3)));
          const o = O(), phase = K < o.meltingPoint ? 'solid' : K < o.boilingPoint ? 'liquid' : 'gas';
          b.setState(phase, phase === 'gas' ? 1.5 : Math.min(1.5, K / (phase === 'solid' ? o.meltingPoint : o.boilingPoint)));
          b.update(phase === 'solid' ? FRAME : FRAME * 3, lt); // sped up so the liquid visibly flows within its second
          e.K = K; e.phase = phase;
        },
        draw: (e) => {
          levelDraw('matter')(e);
          U.slider('Temperature', `${e.K} K`, (e.K - 30) / 130, IN(30), STAGE.y + STAGE.h - 150, STAGE.w - 60, e.a);
          U.pill(e.phase[0].toUpperCase() + e.phase.slice(1), STAGE.x + STAGE.w - 30, STAGE.y + 210, { right: true, size: 34, fam: F.body, color: e.phase === 'gas' ? C.warm : e.phase === 'liquid' ? '#4fd1c5' : '#a9bccb', alpha: e.a });
        } },
      { id: 'sample', at: 23.7, dur: 2.3, step: 'Level 6 · Real sample',
        caption: 'Real *photos* of the elements.',
        draw: (e) => {
          levelDraw('sample')(e);
          const k = U.easeOut(e.lt / 0.5);
          ui.photo(P.loaded['img/O.jpg'], { x: IN(110), y: STAGE.y + 230 + (1 - k) * 40, w: STAGE.w - 220, h: 640 }, 'Liquid oxygen is pale blue', 'Photo: Staff Sgt. Nika Glover, U.S. Air Force · public domain', k * e.a);
        } },
      { id: 'end', at: 26, dur: 4, end: true, step: 'Try it', caption: 'Explore all *118 elements*, level by level.' },
    ],
  };

  /* ===================== Part 3: molecules in motion ===================== */
  const water = () => cmp('water');
  const hbChip = (e, y) => { const s = e.built.stats(); U.hud([['H-bonds', String(s.hb), true]], IN(30), y || STAGE.y + 116, e.a, 40); };
  const part3 = {
    n: 3, title: 'Molecules in motion', duration: 30, file: 'element-atlas-part3-molecules-in-motion.mp4',
    next: 'Next: Part 4 · Make your own bonds',
    segs: [
      { id: 'title', at: 0, dur: 3, title: ['PART 3 OF 4'], noFade: true,
        caption: 'See how molecules *move* and *stick together*.',
        scene: () => sim(water(), 'bulk', 64, 300, 4, 240), camera: { orbit: 8 },
        draw: (e) => P.drawHBonds(e.built, { width: 4, alpha: e.a }) },
      { id: 'molecule', at: 3, dur: 5, step: 'Molecule',
        caption: 'Pick any of *238 substances*: see its shape and bond angles.',
        scene: () => sequence([[0, molBuild('methane')], [1.6, molBuild('ammonia')], [3.2, molBuild('water')]]),
        camera: { orbit: 7, fit: 1.3, lookY: 0.25 }, manual3D: true,
        draw: (e) => { P.draw3D(e.a * U.clamp(dip(e.lt, [1.6, 3.2], 0.2))); tabs(SCENE_TABS, 'Molecule', STAGE.y + 30, 1); } },
      { id: 'pair', at: 8, dur: 5, step: 'Two molecules',
        caption: 'A *hydrogen bond* (gold dashes) holds them together.',
        scene: () => sim(water(), 'pair', 2, 100, 2, 20, false), camera: { orbit: 10, radius: 2.6 },
        draw: (e) => { P.drawHBonds(e.built, { width: 8, dash: [18, 12], alpha: e.a }); tabs(SCENE_TABS, 'Two molecules', STAGE.y + 30, 1); } },
      { id: 'cluster', at: 13, dur: 6, step: 'Cluster',
        caption: 'Hydrogen bonds *form and break* as the molecules move.',
        scene: () => sim(water(), 'cluster', 12, 185, 3, 3000, false, { warmT: 150, follow: true }), camera: { orbit: 12, radius: 6.2, lookY: -0.3 },
        draw: (e) => { P.drawHBonds(e.built, { width: 6, alpha: e.a }); tabs(SCENE_TABS, 'Cluster', STAGE.y + 30, 1); hbChip(e); } },
      { id: 'bulk', at: 19, dur: 6, step: 'Many molecules',
        caption: '*Heat them up* and the hydrogen bonds break.',
        // run at 16 fs a frame so the network visibly breaks up within the shot (about 95 H-bonds down to 25)
        scene: () => { const s = sim(water(), 'bulk', 64, 250, 8, 900); s.setSpeed(16); return s; }, camera: { orbit: 8, lookY: -0.3 },
        update: (b, lt, e) => { e.K = Math.round(U.lerp(250, 800, U.ease((lt - 0.3) / 3.0))); b.setTemp(e.K); b.update(FRAME, lt); },
        draw: (e) => {
          P.drawHBonds(e.built, { width: 4, alpha: e.a });
          tabs(SCENE_TABS, 'Many', STAGE.y + 30, 1); hbChip(e);
          U.slider('Temperature', `${e.K} K`, (e.K - 5) / 795, IN(30), STAGE.y + STAGE.h - 150, STAGE.w - 60, e.a);
        } },
      { id: 'end', at: 25, dur: 5, end: true, step: 'Try it', caption: 'Water, salt, caffeine, DNA bases and *many more*.' },
    ],
  };

  /* ===================== Part 4: combine, theme, full screen ===================== */
  function combine(a, b) { const ea = el(a), eb = el(b), r = B.predict(ea, eb); const s = S.combine(ea, eb, r.kind, { order: r.order, transfer: r.transfer }); s.verdict = r; return s; }
  function picker(a, b, alphaV) {
    const ea = el(a), eb = el(b), w = (STAGE.w - 60 - 70) / 2;
    [[ea, IN(30)], [eb, IN(30) + w + 70]].forEach(([e, x]) => {
      g.save(); g.globalAlpha = alphaV;
      U.rr(x, STAGE.y + 40, w, 90, 18); g.fillStyle = C.raise; g.fill(); g.strokeStyle = U.alpha(A.catOf(e.category).color, 0.8); g.lineWidth = 3; g.stroke();
      U.font(700, 40, F.display); g.fillStyle = A.catOf(e.category).color; g.fillText(e.symbol, x + 26, STAGE.y + 100);
      U.font(600, 34, F.body); g.fillStyle = C.text; g.fillText(e.name, x + 26 + U.textW(e.symbol, 700, 40, F.display) + 18, STAGE.y + 98);
      g.restore();
    });
    U.font(700, 56, F.display); g.fillStyle = U.alpha(C.muted, alphaV); g.textAlign = 'center'; g.fillText('+', P.W / 2, STAGE.y + 106); g.textAlign = 'left';
  }
  const verdictPill = (text, a) => U.pill(text, P.W / 2, STAGE.y + 170, { center: true, size: 36, fam: F.body, weight: 700, color: C.warm, alpha: a });
  function themeMock(light, rect) {
    const pal = light ? { bg: '#edf1f5', panel: '#ffffff', raise: '#f1f4f7', line: '#d3dce4', text: '#132029', muted: '#4c5c69' } : { bg: '#080d13', panel: '#0d151d', raise: '#131e28', line: '#213140', text: '#dce6ee', muted: '#8b9cab' };
    g.fillStyle = pal.bg; g.fillRect(rect.x, rect.y, rect.w, rect.h);
    g.fillStyle = pal.panel; g.fillRect(rect.x, rect.y, rect.w, 120); g.fillStyle = pal.line; g.fillRect(rect.x, rect.y + 120, rect.w, 2);
    U.font(700, 40, F.display); g.fillStyle = pal.text; g.fillText('The Element Atlas', rect.x + 40, rect.y + 74);
    U.rr(rect.x + rect.w - 120, rect.y + 28, 80, 64, 14); g.fillStyle = pal.raise; g.fill(); g.strokeStyle = pal.line; g.lineWidth = 2; g.stroke();
    const cx = rect.x + rect.w - 80, cy = rect.y + 60;
    if (light) { g.beginPath(); g.arc(cx, cy, 13, 0, Math.PI * 2); g.fillStyle = pal.text; g.fill(); g.beginPath(); g.arc(cx + 7, cy - 6, 11, 0, Math.PI * 2); g.fillStyle = pal.raise; g.fill(); }
    else { g.beginPath(); g.arc(cx, cy, 10, 0, Math.PI * 2); g.strokeStyle = pal.text; g.lineWidth = 3.5; g.stroke(); for (let k = 0; k < 8; k++) { const an = (k * Math.PI) / 4; g.beginPath(); g.moveTo(cx + Math.cos(an) * 15, cy + Math.sin(an) * 15); g.lineTo(cx + Math.cos(an) * 20, cy + Math.sin(an) * 20); g.stroke(); } }
    U.font(700, 46, F.display); g.fillStyle = pal.text; g.fillText('Every element, from', rect.x + 40, rect.y + 200); g.fillText('the nucleus out', rect.x + 40, rect.y + 254);
    const root = document.documentElement, before = root.getAttribute('data-theme');
    root.setAttribute('data-theme', light ? 'light' : 'dark');
    ui.table({ x: rect.x + 30, y: rect.y + 310, w: rect.w - 60, h: 520 }, { raise: pal.raise, muted: pal.muted });
    if (before) root.setAttribute('data-theme', before); else root.removeAttribute('data-theme');
    return [cx, cy];
  }
  const BOND_CAM = { orbit: 0, dir: [0, 0.45, 1], fit: 0.8, lookY: 0.3 };
  const part4 = {
    n: 4, title: 'Make your own bonds', duration: 30, file: 'element-atlas-part4-make-your-own-bonds.mp4',
    endTitle: 'Free for everyone', next: 'Share it with your class!',
    segs: [
      // the opening holds the two atoms apart (frozen at the start of the animation) so the next shot picks up smoothly
      { id: 'title', at: 0, dur: 3, title: ['PART 4 OF 4'], titleY: STAGE.y + 170, noFade: true, // below the element picker
        caption: 'Pick *any two elements* and see how they bond.',
        scene: () => combine('Na', 'Cl'), camera: BOND_CAM, update: (b) => b.update(0, 0),
        draw: () => picker('Na', 'Cl', 1) },
      { id: 'ionic', at: 3, dur: 6, step: 'Ionic',
        caption: 'Sodium *gives* an electron to chlorine: an *ionic bond*, NaCl.',
        scene: () => combine('Na', 'Cl'), camera: BOND_CAM, noFade: true,
        draw: (e) => { picker('Na', 'Cl', 1); if (e.lt > 3.2) verdictPill(`${e.built.verdict.title} · NaCl`, U.clamp((e.lt - 3.2) / 0.4)); } },
      { id: 'covalent', at: 9, dur: 5.5, step: 'Covalent',
        caption: 'Hydrogen and oxygen *share* electrons, but oxygen pulls harder.',
        scene: () => combine('H', 'O'), camera: Object.assign({}, BOND_CAM, { lookY: 0.2 }),
        draw: (e) => {
          picker('H', 'O', 1);
          if (e.lt > 2.5) verdictPill(e.built.verdict.title, U.clamp((e.lt - 2.5) / 0.4));
          ui.meter(e.built.verdict.dchi, IN(30), STAGE.y + STAGE.h - 200, STAGE.w - 60, U.clamp((e.lt - 0.4) / 0.4), 'uneven sharing');
        } },
      { id: 'theme', at: 14.5, dur: 5, step: 'Theme',
        caption: 'Switch between *dark and light* with one tap.',
        draw: (e) => {
          const rect = { x: STAGE.x + 40, y: STAGE.y + 60, w: STAGE.w - 80, h: STAGE.h - 120 };
          g.save(); U.rr(rect.x, rect.y, rect.w, rect.h, 26); g.clip();
          const btn = themeMock(false, rect);
          const k = U.easeOut((e.lt - 1.7) / 0.9);
          if (k > 0) { g.save(); g.beginPath(); g.arc(btn[0], btn[1], k * 1500, 0, Math.PI * 2); g.clip(); themeMock(true, rect); g.restore(); }
          g.restore();
          U.rr(rect.x, rect.y, rect.w, rect.h, 26); g.strokeStyle = C.line2; g.lineWidth = 3; g.stroke();
          if (e.lt < 2.6) U.pointerPath(e.lt, [560, 1250], btn, 0.3, 1.4, 1.5, U.clamp((2.6 - e.lt) / 0.4));
        } },
      { id: 'fullscreen', at: 19.5, dur: 5.5, step: 'Full screen',
        caption: 'Go *full screen*, on a phone or a computer.',
        scene: () => B.compoundBuild(cmp('sodium-chloride'), { style: 'ball', electrons: true }), camera: { orbit: 16, fit: 1.0 }, manual3D: true,
        draw: (e) => {
          const k = U.ease((e.lt - 1.5) / 0.9);
          const small = { x: STAGE.x + 150, y: STAGE.y + 250, w: STAGE.w - 300, h: (STAGE.w - 300) * (STAGE.h / STAGE.w) * 0.72 };
          const r = { x: U.lerp(small.x, STAGE.x, k), y: U.lerp(small.y, STAGE.y, k), w: U.lerp(small.w, STAGE.w, k), h: U.lerp(small.h, STAGE.h, k) };
          g.save(); U.rr(r.x, r.y, r.w, r.h, U.lerp(24, STAGE.r, k)); g.fillStyle = '#0e1924'; g.fill(); g.clip();
          const s = Math.max(r.w / STAGE.w, r.h / STAGE.h), dw = STAGE.w * s, dh = STAGE.h * s;
          P.draw3D(e.a, { x: r.x + (r.w - dw) / 2, y: r.y + (r.h - dh) / 2, w: dw, h: dh });
          g.restore();
          if (k < 1) { U.rr(r.x, r.y, r.w, r.h, 24); g.strokeStyle = U.alpha(C.line2, 1 - k); g.lineWidth = 3; g.stroke(); }
          const bx = r.x + r.w - 70, by = r.y + 24;
          g.save(); g.globalAlpha = e.a; U.rr(bx, by, 54, 54, 12); g.fillStyle = 'rgba(8,13,19,0.8)'; g.fill(); g.strokeStyle = C.line2; g.lineWidth = 2; g.stroke();
          g.strokeStyle = C.text; g.lineWidth = 3.5; g.lineCap = 'round'; const q = 9;
          // corner brackets: pointing outwards = "full screen", inwards once it has expanded = "exit full screen"
          [[bx + 13, by + 13, 1, 1], [bx + 41, by + 13, -1, 1], [bx + 13, by + 41, 1, -1], [bx + 41, by + 41, -1, -1]].forEach(([x, y, sx, sy]) => {
            g.beginPath();
            if (k < 0.5) { g.moveTo(x, y + sy * q); g.lineTo(x, y); g.lineTo(x + sx * q, y); }
            else { g.moveTo(x, y + sy * q); g.lineTo(x + sx * q, y + sy * q); g.lineTo(x + sx * q, y); }
            g.stroke();
          });
          g.restore();
          if (e.lt < 2.2) U.pointerPath(e.lt, [560, 1250], [small.x + small.w - 43, small.y + 51], 0.3, 1.2, 1.3, U.clamp((2.2 - e.lt) / 0.3));
          if (e.lt > 2.6) stageNote('Works on any phone · no sign-up · free', U.clamp((e.lt - 2.6) / 0.4));
        } },
      { id: 'end', at: 25, dur: 5, end: true, step: 'Try it', caption: 'Explore *118 elements* and *238 substances* in 3D.' },
    ],
  };

  P.parts.push(part1, part2, part3, part4);
  P.ready();
})();

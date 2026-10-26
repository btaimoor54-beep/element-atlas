/* The Element Atlas: 3D scenes (three.js r128). Units are ångströms in molecule and crystal scenes. */
'use strict';
(function () {
  const A = window.Atlas;
  const T = window.THREE;
  const V3 = T.Vector3;
  const S = (A.S = {});
  const reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  S.reduceMotion = reduceMotion;

  /* ---------- Renderer, one shared canvas moved between stages ---------- */
  let renderer, scene, camera, controls, current = null, ro = null, host = null, last = 0, time = 0;
  S.init = function () {
    if (renderer) return;
    renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(40, 1, 0.01, 2000);
    camera.position.set(0, 2, 12);
    controls = new T.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = !reduceMotion;
    controls.autoRotateSpeed = 0.55;
    scene.add(new T.HemisphereLight(0xd6ecff, 0x18222c, 0.9));
    const key = new T.DirectionalLight(0xffffff, 0.85); key.position.set(6, 9, 7); scene.add(key);
    const rim = new T.DirectionalLight(0x6fd3ff, 0.35); rim.position.set(-7, -3, -6); scene.add(rim);
    ro = new ResizeObserver(resize);
    ro.observe(renderer.domElement);
    requestAnimationFrame(loop);
  };
  function resize() {
    if (!host) return;
    const r = renderer.domElement.getBoundingClientRect(); // on small screens the canvas can be shorter than its stage
    const w = Math.max(1, r.width), hgt = Math.max(1, r.height);
    renderer.setSize(w, hgt, false);
    const oldAspect = camera.aspect;
    camera.aspect = w / hgt;
    camera.updateProjectionMatrix();
    // keep the scene framed when the view changes shape (full screen, phone rotation), relative to the user's own zoom
    if (current && controls && Math.abs(oldAspect - camera.aspect) > 0.01) {
      const k = fitDistance(current.radius || 5, camera.aspect) / fitDistance(current.radius || 5, oldAspect);
      const off = camera.position.clone().sub(controls.target).multiplyScalar(k);
      camera.position.copy(controls.target).add(off);
      controls.maxDistance = Math.max(controls.maxDistance, off.length() * 1.5);
      camera.far = Math.max(camera.far, off.length() * 20);
      camera.updateProjectionMatrix();
    }
  }
  // camera distance at which a sphere of radius r fits the view
  function fitDistance(r, aspect) {
    const fov = (camera.fov * Math.PI) / 180;
    return (r / Math.sin(fov / 2)) * (aspect < 1 ? 1.25 / Math.max(0.55, aspect) : 1.05);
  }
  S.mount = function (container) {
    S.init();
    if (host === container) return;
    if (host) ro.unobserve(host);
    host = container;
    container.prepend(renderer.domElement);
    ro.observe(container);
    resize();
  };
  S.setAutoRotate = (on) => { if (controls) controls.autoRotate = !!on && !reduceMotion; };
  S.currentScene = () => current; // for inspection and tests
  S.paused = false;
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    // nothing to show while the stage is hidden (another view is open): don't simulate or draw
    if (!host || !host.isConnected || !host.getClientRects().length) { requestAnimationFrame(loop); return; }
    if (!S.paused) time += dt;
    if (current && current.update) current.update(S.paused ? 0 : dt, time);
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  function disposeTree(obj) {
    obj.traverse((o) => {
      if (o.geometry && !isShared(o.geometry)) o.geometry.dispose();
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) { if (m.map && !isShared(m.map)) m.map.dispose(); if (!isShared(m)) m.dispose(); }
    });
  }
  /* Show a scene made by a builder: {group, radius, update?, view?: {dir, target}} */
  S.show = function (built, keepCamera) {
    if (current) { scene.remove(current.group); disposeTree(current.group); }
    current = built;
    scene.add(built.group);
    if (!keepCamera) {
      const r = built.radius || 5;
      const dir = (built.view && built.view.dir ? built.view.dir.clone() : new V3(0.35, 0.28, 1)).normalize();
      const dist = fitDistance(r, camera.aspect);
      camera.position.copy(dir.multiplyScalar(dist));
      controls.target.set(0, 0, 0);
      camera.near = Math.max(0.01, dist / 200); camera.far = dist * 20; camera.updateProjectionMatrix();
      controls.minDistance = r * 0.15; controls.maxDistance = dist * 4;
    }
    // depth fog for crowded simulation scenes (density scaled to the viewing distance)
    scene.fog = built.fog ? new T.FogExp2(0x07121a, built.fog / fitDistance(built.radius || 5, camera.aspect)) : null;
    controls.update();
  };

  /* ---------- Shared resources ---------- */
  function shared(x) { x.userData = x.userData || {}; x.userData.shared = true; return x; }
  const isShared = (x) => !!(x && x.userData && x.userData.shared);
  const GEO = {
    sphere: shared(new T.SphereGeometry(1, 28, 20)),
    sphereLo: shared(new T.SphereGeometry(1, 12, 8)),
    cyl: shared(new T.CylinderGeometry(1, 1, 1, 14, 1, false)),
  };
  const glowTex = (function () {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    return shared(new T.CanvasTexture(c));
  })();
  const COLORS = { proton: 0xff5f52, neutron: 0x93a7b9, electron: 0x6fd3ff, valence: 0xffbf4f, lone: 0xb48cff, ring: 0x2e4456 };
  S.COLORS = COLORS;

  function label(text, opts) {
    opts = opts || {};
    const font = (opts.weight || 600) + ' ' + (opts.px || 44) + 'px "Schibsted Grotesk", "Segoe UI", sans-serif';
    const c = document.createElement('canvas'); const g = c.getContext('2d');
    g.font = font;
    const w = Math.ceil(g.measureText(text).width) + 28, hh = (opts.px || 44) + 22;
    c.width = w; c.height = hh;
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (opts.bg) { g.fillStyle = opts.bg; roundRect(g, 2, 2, w - 4, hh - 4, 12); g.fill(); }
    g.lineWidth = 8; g.strokeStyle = 'rgba(8,13,19,.85)'; if (!opts.bg) g.strokeText(text, w / 2, hh / 2 + 2);
    g.fillStyle = opts.color || '#dce6ee'; g.fillText(text, w / 2, hh / 2 + 2);
    const tex = new T.CanvasTexture(c);
    const s = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: opts.depthTest !== false }));
    const size = opts.size || 0.5;
    s.scale.set((size * w) / hh, size, 1);
    s.renderOrder = 10;
    return s;
  }
  S.label = label;
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  const M4 = new T.Matrix4(), Q = new T.Quaternion(), IDQ = new T.Quaternion(), SC = new V3(), Y = new V3(0, 1, 0), X = new V3(1, 0, 0);
  const tmpC = new T.Color();

  /* Instanced spheres: items [{p, r, color}] */
  function spheres(items, opts) {
    opts = opts || {};
    const mat = opts.basic
      ? new T.MeshBasicMaterial({ color: 0xffffff, transparent: !!opts.opacity, opacity: opts.opacity || 1 })
      : new T.MeshStandardMaterial({ color: 0xffffff, roughness: opts.rough != null ? opts.rough : 0.38, metalness: opts.metal || 0.05, transparent: !!opts.opacity, opacity: opts.opacity || 1 });
    const m = new T.InstancedMesh(opts.lo ? GEO.sphereLo : GEO.sphere, mat, Math.max(1, items.length));
    m.count = items.length;
    items.forEach((it, i) => {
      m.setMatrixAt(i, M4.compose(it.p, IDQ, SC.setScalar(it.r)));
      m.setColorAt(i, tmpC.set(it.color));
    });
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.frustumCulled = false;
    return m;
  }
  /* Instanced cylinders: items [{a, b, r, color}] */
  function cylinders(items, opts) {
    opts = opts || {};
    const mat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, transparent: !!opts.opacity, opacity: opts.opacity || 1 });
    const m = new T.InstancedMesh(GEO.cyl, mat, Math.max(1, items.length));
    m.count = items.length;
    const d = new V3(), mid = new V3();
    items.forEach((it, i) => {
      d.subVectors(it.b, it.a); const len = d.length() || 1e-6; d.divideScalar(len);
      Q.setFromUnitVectors(Y, d); mid.addVectors(it.a, it.b).multiplyScalar(0.5);
      m.setMatrixAt(i, M4.compose(mid, Q, SC.set(it.r, len, it.r)));
      m.setColorAt(i, tmpC.set(it.color));
    });
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.frustumCulled = false;
    return m;
  }
  /* Moving electron dots: small bright spheres plus a soft glow. */
  function dots(n, color, radius, glow) {
    const group = new T.Group();
    const mesh = new T.InstancedMesh(GEO.sphereLo, new T.MeshBasicMaterial({ color }), Math.max(1, n));
    mesh.count = n; mesh.frustumCulled = false;
    const geo = new T.BufferGeometry();
    const pos = new Float32Array(Math.max(1, n) * 3);
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setDrawRange(0, n);
    const pts = new T.Points(geo, new T.PointsMaterial({ color, size: glow || radius * 9, map: glowTex, transparent: true, blending: T.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
    pts.frustumCulled = false;
    group.add(mesh, pts);
    const api = {
      group, n,
      set(i, p) { mesh.setMatrixAt(i, M4.compose(p, IDQ, SC.setScalar(radius))); pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; },
      commit() { mesh.instanceMatrix.needsUpdate = true; geo.attributes.position.needsUpdate = true; },
    };
    return api;
  }
  function ring(radius, color, tube) {
    const m = new T.Mesh(new T.TorusGeometry(radius, tube || 0.012, 6, 160), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }));
    return m;
  }
  function basis(dir, u, v) { u.crossVectors(dir, Math.abs(dir.y) < 0.9 ? Y : X).normalize(); v.crossVectors(dir, u); }

  /* ---------- Element helpers ---------- */
  const EL = (sym) => (A.bySym && A.bySym[sym]) || null;
  const chi = (sym) => { const e = EL(sym); return e && e.electronegativity != null ? +e.electronegativity : null; };
  const ballR = (sym) => { const e = EL(sym); const c = e && e.covalentRadius ? +e.covalentRadius : 120; return 0.14 + 0.0023 * c; };
  const vdwR = (sym) => { const e = EL(sym); const v = e && e.vdwRadius ? +e.vdwRadius : 200; return (v / 100) * 0.92; };
  S.ballR = ballR;

  /* ===================================================================
     1. ATOM: nucleus and Bohr shells with orbiting electrons
     =================================================================== */
  function nucleonPositions(count, spacing, seed) {
    const pts = [];
    const lim = Math.ceil(Math.cbrt(count) * 1.1) + 2;
    const s = spacing / Math.SQRT2;
    for (let i = -lim; i <= lim; i++) for (let j = -lim; j <= lim; j++) for (let k = -lim; k <= lim; k++) {
      if ((i + j + k) & 1) continue;
      pts.push(new V3(i * s + 0.13, j * s + 0.07, k * s + 0.05));
    }
    pts.sort((a, b) => a.lengthSq() - b.lengthSq());
    const out = pts.slice(0, count);
    const c = new V3(); out.forEach((p) => c.add(p)); c.divideScalar(Math.max(1, out.length));
    out.forEach((p) => p.sub(c));
    const rnd = A.rng(seed || 7);
    for (let i = out.length - 1; i > 0; i--) { const r = Math.floor(rnd() * (i + 1)); const t = out[i]; out[i] = out[r]; out[r] = t; }
    return out;
  }
  function massNumber(el) {
    const iso = el.isotopes || {};
    if (iso.displayA) return +iso.displayA;
    const m = parseFloat(String(el.atomicMass || '').replace(/[\[\]()]/g, ''));
    return Math.max(el.z, Math.round(m || el.z * 2));
  }
  S.massNumber = massNumber;

  function nucleusGroup(el, radiusTarget, jiggle) {
    const Aa = massNumber(el), Z = el.z;
    const pos = nucleonPositions(Aa, 1, el.z * 31 + Aa);
    const R = Math.cbrt(Aa) * 0.62 + 0.3;
    const k = radiusTarget ? radiusTarget / R : 1;
    const base = pos.map((p) => p.clone().multiplyScalar(k));
    const items = base.map((p, i) => ({ p, r: 0.5 * k * 0.96, color: i < Z ? COLORS.proton : COLORS.neutron }));
    const mesh = spheres(items, { rough: 0.32 });
    const g = new T.Group(); g.add(mesh);
    const phase = base.map((_, i) => i * 2.399);
    const p = new V3();
    return {
      group: g, radius: R * k, A: Aa, N: Aa - Z,
      update(dt, t) {
        if (!jiggle || reduceMotion) return;
        for (let i = 0; i < base.length; i++) {
          const a = phase[i] + t * 3.1;
          p.set(Math.sin(a) * 0.035, Math.cos(a * 1.3) * 0.035, Math.sin(a * 0.7) * 0.035).multiplyScalar(k).add(base[i]);
          mesh.setMatrixAt(i, M4.compose(p, IDQ, SC.setScalar(0.5 * k * 0.96)));
        }
        mesh.instanceMatrix.needsUpdate = true;
      },
    };
  }

  S.atom = function (el, opts) {
    opts = opts || {};
    const group = new T.Group();
    const nuc = nucleusGroup(el, 0.55, true);
    group.add(nuc.group);
    const shells = el.shells || [];
    const nS = shells.length;
    const total = shells.reduce((a, b) => a + b, 0);
    const radii = shells.map((_, k) => 1.25 + k * 1.05);
    const tilts = shells.map((_, k) => new T.Euler(Math.PI / 2 + Math.sin(k * 2.1) * 0.55, k * 0.9, Math.cos(k * 1.7) * 0.35));
    const inner = dots(total - (shells[nS - 1] || 0), COLORS.electron, 0.075);
    const outer = dots(shells[nS - 1] || 0, COLORS.valence, 0.09);
    group.add(inner.group, outer.group);
    const ringObjs = [];
    shells.forEach((c, k) => {
      const r = ring(radii[k], k === nS - 1 ? 0x6a5a2c : COLORS.ring, 0.01);
      r.rotation.copy(tilts[k]);
      group.add(r); ringObjs.push(r);
      const lab = label(A.SHELL_NAMES[k] + ' · ' + c, { color: k === nS - 1 ? '#ffbf4f' : '#8b9cab', size: 0.32, px: 40 });
      const lp = new V3(radii[k], 0, 0).applyEuler(tilts[k]);
      lab.position.copy(lp).multiplyScalar(1.0).add(new V3(0, 0.22, 0));
      group.add(lab);
    });
    const p = new V3();
    const speeds = radii.map((r, k) => 1.25 / Math.pow(k + 1, 0.9));
    function update(dt, t) {
      let ii = 0, oi = 0;
      shells.forEach((c, k) => {
        for (let j = 0; j < c; j++) {
          const ang = (j / c) * Math.PI * 2 + t * speeds[k] * (k % 2 ? -1 : 1);
          p.set(Math.cos(ang) * radii[k], Math.sin(ang) * radii[k], 0).applyEuler(tilts[k]);
          if (k === nS - 1) outer.set(oi++, p); else inner.set(ii++, p);
        }
      });
      inner.commit(); outer.commit();
      nuc.update(dt, t);
    }
    update(0, 0);
    return { group, radius: (radii[nS - 1] || 1.5) + 0.6, update, info: { A: nuc.A, N: nuc.N, shells } };
  };

  /* ===================================================================
     2. NUCLEUS close-up, and the inside of a proton or neutron
     =================================================================== */
  S.nucleus = function (el) {
    const group = new T.Group();
    const nuc = nucleusGroup(el, null, true);
    group.add(nuc.group);
    const halo = new T.Mesh(GEO.sphere, new T.MeshBasicMaterial({ color: 0xff8a6b, transparent: true, opacity: 0.06, depthWrite: false }));
    halo.scale.setScalar(nuc.radius + 0.6);
    group.add(halo);
    return { group, radius: nuc.radius + 1.2, update: nuc.update, info: { A: nuc.A, N: nuc.N } };
  };

  S.nucleon = function (kind) {
    const group = new T.Group();
    const shell = new T.Mesh(GEO.sphere, new T.MeshStandardMaterial({ color: kind === 'proton' ? 0xff5f52 : 0x93a7b9, transparent: true, opacity: 0.1, depthWrite: false, roughness: 0.2 }));
    shell.scale.setScalar(3.2); group.add(shell);
    const edge = new T.Mesh(GEO.sphere, new T.MeshBasicMaterial({ color: kind === 'proton' ? 0xff5f52 : 0x93a7b9, wireframe: true, transparent: true, opacity: 0.08 }));
    edge.scale.setScalar(3.22); group.add(edge);
    const flavors = kind === 'proton' ? ['u', 'u', 'd'] : ['u', 'd', 'd'];
    const colorCharge = [0xff4d4d, 0x4dff88, 0x4d8dff];
    const quarks = flavors.map((f, i) => {
      const m = new T.Mesh(GEO.sphere, new T.MeshStandardMaterial({ color: colorCharge[i], emissive: colorCharge[i], emissiveIntensity: 0.35, roughness: 0.3 }));
      m.scale.setScalar(0.38); group.add(m);
      const lab = label((f === 'u' ? 'up  +2/3' : 'down  −1/3'), { size: 0.36, color: '#dce6ee', px: 38 });
      group.add(lab);
      return { m, lab, f, seed: i * 2.1 + 0.5 };
    });
    // Gluon field: beads along wavy springs between each pair of quarks
    const pairs = [[0, 1], [1, 2], [2, 0]];
    const BEADS = 34;
    const beads = new T.InstancedMesh(GEO.sphereLo, new T.MeshBasicMaterial({ color: 0xffd166 }), pairs.length * BEADS);
    beads.frustumCulled = false; group.add(beads);
    // Virtual quark–antiquark pairs that flicker in and out of the "sea"
    const SEA = 6;
    const sea = new T.InstancedMesh(GEO.sphereLo, new T.MeshBasicMaterial({ color: 0xcfd8e3, transparent: true, opacity: 0.7 }), SEA * 2);
    sea.frustumCulled = false; group.add(sea);
    const rnd = A.rng(kind === 'proton' ? 11 : 13);
    const seaState = Array.from({ length: SEA }, () => ({ c: new V3(), d: new V3(), born: -rnd() * 3, life: 0.8 + rnd() * 1.2 }));
    const qp = flavors.map(() => new V3()), p = new V3(), d = new V3(), u = new V3(), v = new V3();
    function update(dt, t) {
      quarks.forEach((q, i) => {
        const s = q.seed, tt = t * 0.9;
        qp[i].set(Math.sin(tt * 1.1 + s) * 1.3 + Math.cos(tt * 0.6 + s * 2) * 0.5, Math.cos(tt * 0.9 + s * 1.7) * 1.2, Math.sin(tt * 0.7 + s * 3) * 1.2);
        qp[i].clampLength(0, 2.3);
        q.m.position.copy(qp[i]);
        q.lab.position.copy(qp[i]).add(new V3(0, 0.62, 0));
      });
      let bi = 0;
      pairs.forEach(([a, b], k) => {
        d.subVectors(qp[b], qp[a]); const len = d.length() || 1; d.divideScalar(len); basis(d, u, v);
        for (let j = 0; j < BEADS; j++) {
          const f = (j + 0.5) / BEADS, w = Math.sin(f * Math.PI * 7 - t * 9 + k) * 0.13 * Math.sin(f * Math.PI);
          p.copy(qp[a]).addScaledVector(d, len * f).addScaledVector(u, w).addScaledVector(v, Math.cos(f * Math.PI * 7 - t * 9 + k) * 0.13 * Math.sin(f * Math.PI));
          beads.setMatrixAt(bi++, M4.compose(p, IDQ, SC.setScalar(0.045)));
        }
      });
      beads.instanceMatrix.needsUpdate = true;
      seaState.forEach((s, i) => {
        let age = t - s.born;
        if (age > s.life || age < 0) { s.born = t + rnd() * 0.6; s.life = 0.6 + rnd() * 1.2; s.c.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(0.6 + rnd() * 1.9); s.d.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(); age = 0; }
        const k = Math.max(0, Math.sin((Math.max(0, t - s.born) / s.life) * Math.PI));
        const sep = 0.12 + 0.25 * k;
        p.copy(s.c).addScaledVector(s.d, sep); sea.setMatrixAt(i * 2, M4.compose(p, IDQ, SC.setScalar(0.09 * k + 0.001)));
        p.copy(s.c).addScaledVector(s.d, -sep); sea.setMatrixAt(i * 2 + 1, M4.compose(p, IDQ, SC.setScalar(0.09 * k + 0.001)));
      });
      sea.instanceMatrix.needsUpdate = true;
    }
    update(0, 0);
    return { group, radius: 3.6, update };
  };

  /* ===================================================================
     3. ORBITALS: electron clouds sampled from hydrogen-like wavefunctions
     =================================================================== */
  const ANG = [
    [['s', () => 1]],
    [['px', (x) => x], ['py', (x, y) => y], ['pz', (x, y, z) => z]],
    [['dxy', (x, y) => x * y], ['dyz', (x, y, z) => y * z], ['dz²', (x, y, z) => 3 * z * z - 1], ['dxz', (x, y, z) => x * z], ['dx²−y²', (x, y) => x * x - y * y]],
    [['fy(3x²−y²)', (x, y) => y * (3 * x * x - y * y)], ['fxyz', (x, y, z) => x * y * z], ['fyz²', (x, y, z) => y * (5 * z * z - 1)], ['fz³', (x, y, z) => z * (5 * z * z - 3)],
     ['fxz²', (x, y, z) => x * (5 * z * z - 1)], ['fz(x²−y²)', (x, y, z) => z * (x * x - y * y)], ['fx(x²−3y²)', (x, y) => x * (x * x - 3 * y * y)]],
  ];
  S.ORBITAL_NAMES = ANG.map((l) => l.map((o) => o[0]));
  const angMax = ANG.map((l) => l.map(([, f]) => {
    const r = A.rng(99); let m = 0;
    for (let i = 0; i < 6000; i++) {
      const z = r() * 2 - 1, ph = r() * Math.PI * 2, s = Math.sqrt(1 - z * z);
      const v = f(s * Math.cos(ph), s * Math.sin(ph), z); m = Math.max(m, v * v);
    }
    return m * 1.02;
  }));
  function laguerre(k, alpha, x) {
    if (k === 0) return 1;
    let l0 = 1, l1 = 1 + alpha - x;
    for (let i = 1; i < k; i++) { const l2 = ((2 * i + 1 + alpha - x) * l1 - (i + alpha) * l0) / (i + 1); l0 = l1; l1 = l2; }
    return l1;
  }
  const radial = (n, l, r) => { const rho = (2 * r) / n; return Math.pow(rho, l) * Math.exp(-rho / 2) * laguerre(n - l - 1, 2 * l + 1, rho); };
  const radialCache = {};
  function radialSampler(n, l) {
    const key = n + '' + l;
    if (radialCache[key]) return radialCache[key];
    const rmax = 4 * n * n + 12, N = 3000, cdf = new Float64Array(N + 1);
    let acc = 0;
    for (let i = 1; i <= N; i++) { const r = (i / N) * rmax, R = radial(n, l, r); acc += r * r * R * R; cdf[i] = acc; }
    for (let i = 0; i <= N; i++) cdf[i] /= acc;
    return (radialCache[key] = (u) => {
      let lo = 0, hi = N;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cdf[mid] < u) lo = mid; else hi = mid; }
      return (hi / N) * rmax;
    });
  }
  /* Sample points of one orbital; returns Float32Array positions and signs. Radius is compressed for display. */
  function sampleOrbital(n, l, mi, count, seed) {
    const rnd = A.rng(seed), f = ANG[l][mi][1], mx = angMax[l][mi], rs = radialSampler(n, l);
    const pos = new Float32Array(count * 3), sign = new Int8Array(count);
    for (let i = 0; i < count; i++) {
      let x, y, z, a;
      for (let guard = 0; guard < 400; guard++) {
        z = rnd() * 2 - 1; const ph = rnd() * Math.PI * 2, s = Math.sqrt(1 - z * z);
        x = s * Math.cos(ph); y = s * Math.sin(ph); a = f(x, y, z);
        if (rnd() * mx <= a * a) break;
      }
      const r = rs(rnd());
      const R = radial(n, l, r);
      const rv = 0.9 * Math.pow(r, 0.62);
      // three.js is y-up: show the chemist's z axis as up
      pos[i * 3] = x * rv; pos[i * 3 + 1] = z * rv; pos[i * 3 + 2] = -y * rv;
      sign[i] = (R * a) >= 0 ? 1 : -1;
    }
    return { pos, sign };
  }
  S.hundFill = function (l, count) {
    const m = 2 * l + 1, occ = new Array(m).fill(0);
    for (let e = 0; e < count; e++) occ[e < m ? e : e - m] += 1;
    return occ;
  };
  /* subs: [{n,l,count,key}] to draw */
  S.orbitals = function (el, subs) {
    const group = new T.Group();
    const core = new T.Mesh(GEO.sphere, new T.MeshStandardMaterial({ color: 0xff7b5c, emissive: 0xff5f52, emissiveIntensity: 0.5 }));
    core.scale.setScalar(0.08); group.add(core);
    let rmax = 1.5;
    const POS = new T.Color(0x6fd3ff), NEG = new T.Color(0xffa552);
    const clouds = [];
    subs.forEach((s) => {
      const occ = S.hundFill(s.l, s.count);
      occ.forEach((o, mi) => {
        if (!o) return;
        const count = Math.round((o === 2 ? 2600 : 1600) * (1 + 0.3 * (s.n - 1)));
        const { pos, sign } = sampleOrbital(s.n, s.l, mi, count, s.n * 100 + s.l * 10 + mi + 1);
        const col = new Float32Array(count * 3);
        const radii = [];
        for (let i = 0; i < count; i++) {
          const c = sign[i] > 0 ? POS : NEG;
          col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
          radii.push(Math.hypot(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]));
        }
        radii.sort((a, b) => a - b);
        rmax = Math.max(rmax, radii[Math.floor(radii.length * 0.97)]); // ignore the thin outermost tail
        clouds.push({ pos, col, o });
      });
    });
    const dotSize = Math.max(0.1, rmax * 0.032);
    clouds.forEach(({ pos, col, o }) => {
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pos, 3));
      geo.setAttribute('color', new T.BufferAttribute(col, 3));
      group.add(new T.Points(geo, new T.PointsMaterial({ size: dotSize, map: glowTex, vertexColors: true, transparent: true, opacity: o === 2 ? 0.85 : 0.6, blending: T.AdditiveBlending, depthWrite: false })));
    });
    // axes in the chemist's convention (z up)
    const L = rmax * 0.95;
    const axes = new T.LineSegments(new T.BufferGeometry().setFromPoints([new V3(-L, 0, 0), new V3(L, 0, 0), new V3(0, -L, 0), new V3(0, L, 0), new V3(0, 0, -L), new V3(0, 0, L)]), new T.LineBasicMaterial({ color: 0x2e4456 }));
    group.add(axes);
    [['x', new V3(L + 0.25, 0, 0)], ['z', new V3(0, L + 0.25, 0)], ['y', new V3(0, 0, -L - 0.25)]].forEach(([t, p]) => { const s = label(t, { size: 0.32, color: '#8b9cab', px: 40 }); s.position.copy(p); group.add(s); });
    return { group, radius: rmax * 0.9 + 0.4, view: { dir: new V3(0.55, 0.35, 1) } };
  };

  /* ===================================================================
     4. MOLECULES: atoms, bonds by order, shared electron pairs, lone pairs
     =================================================================== */
  /* atoms: [{el, p:V3, q?}]  bonds: [{a, b, o}] */
  S.molecule = function (atoms, bonds, opts) {
    opts = opts || {};
    const group = new T.Group();
    const space = opts.style === 'space';
    const items = atoms.map((at) => ({ p: at.p, r: space ? vdwR(at.el) : ballR(at.el), color: A.elColor(at.el) }));
    group.add(spheres(items, { rough: 0.35 }));
    const nb = atoms.map(() => []);
    bonds.forEach((b) => { nb[b.a].push(b.b); nb[b.b].push(b.a); });
    const cyl = [];
    const elecSpecs = [];
    if (!space) {
      const d = new V3(), perp = new V3(), tmp = new V3();
      bonds.forEach((b) => {
        const pa = atoms[b.a].p, pb = atoms[b.b].p;
        d.subVectors(pb, pa); const len = d.length(); if (len < 1e-6) return; d.divideScalar(len);
        const o = +b.o || 1;
        const strands = o >= 2.5 ? 3 : o >= 1.25 ? 2 : 1;
        // a perpendicular in the plane of a neighbouring atom, so double bonds lie flat in rings
        const third = nb[b.a].find((k) => k !== b.b) ?? nb[b.b].find((k) => k !== b.a);
        if (third != null) { tmp.subVectors(atoms[third].p, pa); perp.copy(tmp).addScaledVector(d, -tmp.dot(d)); }
        if (third == null || perp.lengthSq() < 1e-6) perp.crossVectors(d, Math.abs(d.y) < 0.9 ? Y : X);
        perp.normalize();
        const ca = A.elColor(atoms[b.a].el), cb = A.elColor(atoms[b.b].el);
        const r = o < 0.75 ? 0.035 : strands === 1 ? 0.075 : 0.05;
        const spread = strands === 1 ? [0] : strands === 2 ? [-0.075, 0.075] : [-0.11, 0, 0.11];
        spread.forEach((off, si) => {
          const a1 = pa.clone().addScaledVector(perp, off), b1 = pb.clone().addScaledVector(perp, off);
          const m1 = a1.clone().lerp(b1, 0.5);
          const partial = (o === 1.5 || (o > 1 && o < 2) || (o > 2 && o < 3)) && si === strands - 1;
          cyl.push({ a: a1, b: m1, r: partial ? r * 0.6 : r, color: ca }, { a: m1, b: b1, r: partial ? r * 0.6 : r, color: cb });
        });
        const ne = b.e != null ? +b.e : Math.max(1, Math.round(o * 2));
        if (opts.electrons !== false && ne > 0) elecSpecs.push({ a: b.a, b: b.b, n: ne, o });
      });
      if (cyl.length) group.add(cylinders(cyl));
    }
    // shared electrons: dots moving along each bond, centred toward the more electronegative atom
    const totalE = elecSpecs.reduce((s, e) => s + e.n, 0);
    const ed = totalE ? dots(totalE, COLORS.electron, 0.045, 0.32) : null;
    if (ed) group.add(ed.group);
    // lone pairs
    const lpSpecs = [];
    if (opts.lonePairs) {
      atoms.forEach((at, i) => {
        const L = opts.lonePairs[i] || 0;
        if (!L) return;
        const bondDirs = nb[i].map((j) => atoms[j].p.clone().sub(at.p).normalize());
        const dirs = lonePairDirections(bondDirs, L, i);
        dirs.forEach((dir, k) => lpSpecs.push({ i, dir, k }));
      });
    }
    const ld = lpSpecs.length ? dots(lpSpecs.length * 2, COLORS.lone, 0.042, 0.3) : null;
    if (ld) group.add(ld.group);
    const lpClouds = lpSpecs.map((s) => {
      const m = new T.Mesh(GEO.sphereLo, new T.MeshBasicMaterial({ color: COLORS.lone, transparent: true, opacity: 0.12, blending: T.AdditiveBlending, depthWrite: false }));
      const r0 = ballR(atoms[s.i].el);
      m.position.copy(atoms[s.i].p).addScaledVector(s.dir, r0 + 0.2);
      m.quaternion.setFromUnitVectors(Y, s.dir);
      m.scale.set(0.16, 0.24, 0.16);
      group.add(m);
      return m;
    });
    if (opts.labels) {
      atoms.forEach((at) => {
        const s = label(at.el + (at.q ? (at.q > 0 ? (at.q > 1 ? at.q : '') + '+' : (at.q < -1 ? -at.q : '') + '−') : ''), { size: 0.28, color: '#dce6ee', px: 40, depthTest: false });
        s.position.copy(at.p).add(new V3(0, (space ? vdwR(at.el) : ballR(at.el)) + 0.22, 0));
        group.add(s);
      });
    }
    // bond angles and lengths measured from the drawn geometry; each kind is shown once so big molecules stay readable
    const measure = new T.Group();
    if (!space && atoms.length <= 80) {
      const seenA = [], seenL = [];
      const order = atoms.map((_, i) => i).sort((i, j) => nb[j].length - nb[i].length || i - j); // most-bonded atoms first
      const da = new V3(), db = new V3(), axis = new V3(), bis = new V3();
      for (const i of order) {
        const ns = nb[i];
        for (let x = 0; x < ns.length && seenA.length < 8; x++) for (let y = x + 1; y < ns.length && seenA.length < 8; y++) {
          da.subVectors(atoms[ns[x]].p, atoms[i].p); db.subVectors(atoms[ns[y]].p, atoms[i].p);
          const la = da.length(), lb = db.length(), ang = da.angleTo(db), deg = (ang * 180) / Math.PI;
          if (deg > 178 || deg < 1) continue;
          const kind = atoms[i].el + ':' + [atoms[ns[x]].el, atoms[ns[y]].el].sort().join('-');
          if (seenA.some((s) => s.kind === kind && Math.abs(s.deg - deg) < 1.5)) continue;
          seenA.push({ kind, deg });
          da.divideScalar(la); db.divideScalar(lb);
          axis.crossVectors(da, db).normalize();
          const rr = Math.min(0.62 * Math.min(la, lb), ballR(atoms[i].el) + 0.28);
          const pts = [];
          for (let s = 0; s <= 24; s++) pts.push(da.clone().applyAxisAngle(axis, (ang * s) / 24).multiplyScalar(rr).add(atoms[i].p));
          // a thin tube rather than a line: WebGL draws lines only one pixel wide
          measure.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 24, 0.016, 6, false), new T.MeshBasicMaterial({ color: 0xffcf73 })));
          const fan = new T.BufferGeometry().setFromPoints([atoms[i].p.clone()].concat(pts));
          fan.setIndex(pts.slice(1).map((_, s) => [0, s + 1, s + 2]).flat());
          measure.add(new T.Mesh(fan, new T.MeshBasicMaterial({ color: 0xffbf4f, transparent: true, opacity: 0.28, side: T.DoubleSide, depthWrite: false })));
          const tag = label(deg.toFixed(1) + '°', { size: 0.24, px: 40, color: '#ffcf73', depthTest: false });
          tag.position.copy(atoms[i].p).addScaledVector(bis.addVectors(da, db).normalize(), rr + 0.3);
          measure.add(tag);
        }
      }
      const mid0 = new V3(); atoms.forEach((a) => mid0.add(a.p)); mid0.divideScalar(atoms.length);
      const dir = new V3(), out = new V3(), uu = new V3(), vv = new V3();
      bonds.forEach((b) => {
        if (seenL.length >= 6) return;
        const pa = atoms[b.a].p, pb = atoms[b.b].p, pm = pa.distanceTo(pb) * 100;
        const kind = [atoms[b.a].el, atoms[b.b].el].sort().join('-') + ':' + (+b.o || 1);
        if (pm < 1 || seenL.some((s) => s.kind === kind && Math.abs(s.pm - pm) < 1.5)) return;
        seenL.push({ kind, pm });
        dir.subVectors(pb, pa).normalize();
        out.addVectors(pa, pb).multiplyScalar(0.5).sub(mid0);
        out.addScaledVector(dir, -out.dot(dir));
        if (out.lengthSq() < 1e-4) { basis(dir, uu, vv); out.copy(uu); }
        const tag = label(Math.round(pm) + ' pm', { size: 0.2, px: 36, color: '#8fd6ff', depthTest: false });
        tag.position.addVectors(pa, pb).multiplyScalar(0.5).addScaledVector(out.normalize(), 0.24);
        measure.add(tag);
      });
      measure.visible = !!opts.measure;
      group.add(measure);
    }
    const d = new V3(), c = new V3(), u = new V3(), v = new V3(), e = new V3();
    function update(dt, t) {
      if (ed) {
        let k = 0;
        elecSpecs.forEach((s, si) => {
          const pa = atoms[s.a].p, pb = atoms[s.b].p;
          d.subVectors(pb, pa); const len = d.length(); d.divideScalar(len);
          const xa = chi(atoms[s.a].el), xb = chi(atoms[s.b].el);
          let f = 0.5;
          if (xa != null && xb != null) { const shift = Math.min(0.2, 0.13 * Math.abs(xb - xa)); f = xb > xa ? 0.5 + shift : 0.5 - shift; }
          c.copy(pa).addScaledVector(d, len * f);
          basis(d, u, v);
          for (let j = 0; j < s.n; j++) {
            const pair = Math.floor(j / 2), within = j % 2;
            const ph = t * 2.3 + si * 0.77 + pair * 1.9 + within * Math.PI;
            const psi = t * 0.8 + si * 1.3 + (pair * Math.PI) / Math.max(1, Math.ceil(s.n / 2)) + within * 0.6;
            e.copy(c).addScaledVector(d, len * 0.27 * Math.cos(ph))
              .addScaledVector(u, 0.13 * Math.sin(ph) * Math.cos(psi))
              .addScaledVector(v, 0.13 * Math.sin(ph) * Math.sin(psi));
            ed.set(k++, e);
          }
        });
        ed.commit();
      }
      if (ld) {
        lpSpecs.forEach((s, k) => {
          const r0 = ballR(atoms[s.i].el);
          c.copy(atoms[s.i].p).addScaledVector(s.dir, r0 + 0.2);
          basis(s.dir, u, v);
          for (let j = 0; j < 2; j++) {
            const ph = t * 2.1 + k * 1.3 + j * Math.PI, psi = t * 1.1 + k;
            e.copy(c).addScaledVector(s.dir, 0.11 * Math.cos(ph)).addScaledVector(u, 0.1 * Math.sin(ph) * Math.cos(psi)).addScaledVector(v, 0.1 * Math.sin(ph) * Math.sin(psi));
            ld.set(k * 2 + j, e);
          }
        });
        ld.commit();
      }
      if (opts.update) opts.update(dt, t);
    }
    update(0, 0);
    const center = new V3(); atoms.forEach((a) => center.add(a.p)); center.divideScalar(Math.max(1, atoms.length));
    let radius = 1;
    atoms.forEach((a) => { radius = Math.max(radius, a.p.distanceTo(center) + (space ? vdwR(a.el) : ballR(a.el)) + 0.3); });
    group.position.sub(center);
    return {
      group, radius, update, view: { dir: faceOnDir(atoms.map((a) => a.p)) },
      setVisible(kind, on) {
        if (kind === 'electrons' && ed) ed.group.visible = on;
        if (kind === 'lone') { if (ld) ld.group.visible = on; lpClouds.forEach((m) => (m.visible = on)); }
        if (kind === 'measure') measure.visible = on;
      },
      hasMeasure: measure.children.length > 0,
    };
  };
  /* Camera direction facing a molecule's flattest side: the normal of its best-fit plane (smallest principal axis),
     tilted a little for depth. Planar molecules such as water or benzene are then seen face-on with true angles. */
  function faceOnDir(points) {
    const c = new V3(); points.forEach((p) => c.add(p)); c.divideScalar(Math.max(1, points.length));
    let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
    points.forEach((p) => { const x = p.x - c.x, y = p.y - c.y, z = p.z - c.z; xx += x * x; xy += x * y; xz += x * z; yy += y * y; yz += y * z; zz += z * z; });
    const tr = xx + yy + zz + 1e-6;
    const v = new V3(0.3, 0.4, 0.86); // power iteration on (tr·I − C): its top eigenvector is C's smallest
    for (let i = 0; i < 40; i++) {
      v.set((tr - xx) * v.x - xy * v.y - xz * v.z, -xy * v.x + (tr - yy) * v.y - yz * v.z, -xz * v.x - yz * v.y + (tr - zz) * v.z);
      if (v.lengthSq() < 1e-12) return new V3(0.35, 0.28, 1);
      v.normalize();
    }
    if (v.z < 0) v.negate();
    return v.addScaledVector(Math.abs(v.y) < 0.9 ? Y : X, 0.3).normalize();
  }
  /* Spread lone-pair directions away from bonds and from each other (VSEPR-like relaxation). */
  function lonePairDirections(bondDirs, L, seed) {
    const rnd = A.rng(seed * 17 + 3);
    const avg = new V3(); bondDirs.forEach((b) => avg.add(b));
    const away = avg.lengthSq() > 1e-6 ? avg.clone().negate().normalize() : new V3(0, 1, 0);
    const lp = [];
    for (let i = 0; i < L; i++) lp.push(away.clone().add(new V3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.8)).normalize());
    const f = new V3(), tmp = new V3();
    for (let it = 0; it < 120; it++) {
      for (let i = 0; i < L; i++) {
        f.set(0, 0, 0);
        const others = bondDirs.concat(lp.filter((_, j) => j !== i));
        for (const o of others) { tmp.subVectors(lp[i], o); const d2 = Math.max(0.02, tmp.lengthSq()); f.addScaledVector(tmp, 1 / d2); }
        lp[i].addScaledVector(f, 0.03).normalize();
      }
    }
    return lp;
  }
  /* Lone pairs for p-block atoms from valence, bond orders and formal charge: (V − Σorder − q) / 2 */
  S.lonePairCounts = function (atoms, bonds) {
    const sum = atoms.map(() => 0);
    bonds.forEach((b) => { const o = +b.o || 1; sum[b.a] += o; sum[b.b] += o; });
    return atoms.map((at, i) => {
      const e = EL(at.el);
      if (!e || e.z === 1 || A.isMetal(e)) return 0;
      const g = e.group;
      if (!(g >= 13 && g <= 18)) return 0;
      const V = e.z === 2 ? 2 : g - 10; // helium's full shell is a single pair
      const L = Math.floor((V - sum[i] - (at.q || 0)) / 2 + 1e-6);
      return Math.max(0, Math.min(4, L));
    });
  };

  /* ===================================================================
     5. CRYSTALS and LATTICES
     =================================================================== */
  /* Conventional cell basis in fractional coordinates, role A (cation / atom), X (anion), B (perovskite B site). */
  function cellBasis(type, u) {
    const fcc = [[0, 0, 0], [0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5]];
    const shift = (list, s) => list.map((p) => [p[0] + s[0], p[1] + s[1], p[2] + s[2]]);
    const tag = (list, role) => list.map((f) => ({ f, role }));
    switch (type) {
      case 'sc': case 'simple-cubic': return { hex: false, sites: tag([[0, 0, 0]], 'A') };
      case 'bcc': return { hex: false, sites: tag([[0, 0, 0], [0.5, 0.5, 0.5]], 'A') };
      case 'fcc': return { hex: false, sites: tag(fcc, 'A') };
      case 'diamond': return { hex: false, sites: tag(fcc.concat(shift(fcc, [0.25, 0.25, 0.25])), 'A') };
      case 'rocksalt': return { hex: false, sites: tag(fcc, 'A').concat(tag(shift(fcc, [0.5, 0, 0]), 'X')) };
      case 'cesium-chloride': return { hex: false, sites: tag([[0, 0, 0]], 'A').concat(tag([[0.5, 0.5, 0.5]], 'X')) };
      case 'zincblende': return { hex: false, sites: tag(fcc, 'A').concat(tag(shift(fcc, [0.25, 0.25, 0.25]), 'X')) };
      case 'fluorite': case 'antifluorite': {
        const x = []; for (const a of [0.25, 0.75]) for (const b of [0.25, 0.75]) for (const c of [0.25, 0.75]) x.push([a, b, c]);
        return type === 'fluorite' ? { hex: false, sites: tag(fcc, 'A').concat(tag(x, 'X')) } : { hex: false, sites: tag(fcc, 'X').concat(tag(x, 'A')) };
      }
      case 'perovskite': return { hex: false, sites: tag([[0, 0, 0]], 'A').concat(tag([[0.5, 0.5, 0.5]], 'B'), tag([[0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5]], 'X')) };
      case 'cristobalite': {
        const si = fcc.concat(shift(fcc, [0.25, 0.25, 0.25]));
        const nbv = [[0.25, 0.25, 0.25], [0.25, -0.25, -0.25], [-0.25, 0.25, -0.25], [-0.25, -0.25, 0.25]];
        const o = [];
        for (const p of fcc) for (const n of nbv) o.push([p[0] + n[0] / 2, p[1] + n[1] / 2, p[2] + n[2] / 2].map((x) => ((x % 1) + 1) % 1));
        return { hex: false, sites: tag(si, 'A').concat(tag(o, 'X')) };
      }
      case 'rutile': {
        const w = u || 0.305;
        return { hex: false, tet: true, sites: tag([[0, 0, 0], [0.5, 0.5, 0.5]], 'A').concat(tag([[w, w, 0], [1 - w, 1 - w, 0], [0.5 + w, 0.5 - w, 0.5], [0.5 - w, 0.5 + w, 0.5]], 'X')) };
      }
      case 'hcp': return { hex: true, sites: tag([[0, 0, 0], [1 / 3, 2 / 3, 0.5]], 'A') };
      case 'wurtzite': { const w = u || 0.382; return { hex: true, sites: tag([[1 / 3, 2 / 3, 0], [2 / 3, 1 / 3, 0.5]], 'A').concat(tag([[1 / 3, 2 / 3, w], [2 / 3, 1 / 3, 0.5 + w]], 'X')) }; }
      case 'graphite': return { hex: true, sites: tag([[0, 0, 0.25], [0, 0, 0.75], [1 / 3, 2 / 3, 0.25], [2 / 3, 1 / 3, 0.75]], 'A') };
      case 'tungsten-carbide': return { hex: true, sites: tag([[0, 0, 0]], 'A').concat(tag([[1 / 3, 2 / 3, 0.5]], 'X')) };
      case 'cacu5': // SmCo5, LaNi5: rare earth at the origin, transition metal on two layers
        return { hex: true, sites: tag([[0, 0, 0]], 'A').concat(tag([[1 / 3, 2 / 3, 0], [2 / 3, 1 / 3, 0], [0.5, 0, 0.5], [0, 0.5, 0.5], [0.5, 0.5, 0.5]], 'X')) };
      case 'laves-c15': { // MgCu2 type (origin choice 2): A on a diamond net, B on corner-sharing tetrahedra
        const T4 = [[0, 0, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [0.5, 0.5, 0]];
        const wrap = (p) => p.map((x) => ((x % 1) + 1) % 1);
        const A8 = [], B16 = [];
        for (const t of T4) {
          for (const s of [[1 / 8, 1 / 8, 1 / 8], [7 / 8, 3 / 8, 3 / 8]]) A8.push(wrap([s[0] + t[0], s[1] + t[1], s[2] + t[2]]));
          for (const s of [[0.5, 0.5, 0.5], [0.25, 0.75, 0], [0.75, 0, 0.25], [0, 0.25, 0.75]]) B16.push(wrap([s[0] + t[0], s[1] + t[1], s[2] + t[2]]));
        }
        return { hex: false, sites: tag(A8, 'A').concat(tag(B16, 'X')) };
      }
      case 'molybdenite': { // 2H-MoS2: trigonal-prismatic layers, S at ±δ from each Mo plane
        const d = u || 0.128;
        return { hex: true, sites: tag([[0, 0, 0.25], [1 / 3, 2 / 3, 0.75]], 'A').concat(tag([[1 / 3, 2 / 3, 0.25 + d], [1 / 3, 2 / 3, 0.25 - d], [0, 0, 0.75 + d], [0, 0, 0.75 - d]], 'X')) };
      }
      default: return { hex: false, sites: tag([[0, 0, 0]], 'A') };
    }
  }
  /* Build a supercell: returns {atoms:[{p, role}], cell:{a1,a2,a3}, nn} with lengths in Å */
  S.latticePoints = function (spec) {
    const type = spec.type;
    const b = cellBasis(type, spec.u);
    const a = (spec.a || 400) / 100, c = (spec.c || (b.hex ? spec.a * 1.633 : spec.a) || 400) / 100;
    let a1, a2, a3;
    if (b.hex) { a1 = new V3(a, 0, 0); a2 = new V3(-a / 2, (a * Math.sqrt(3)) / 2, 0); a3 = new V3(0, 0, c); }
    else { a1 = new V3(a, 0, 0); a2 = new V3(0, a, 0); a3 = new V3(0, 0, b.tet || spec.c ? c : a); }
    const n = spec.n || (b.hex ? [3, 3, 2] : b.sites.length > 6 ? [2, 2, 2] : [3, 3, 3]);
    const atoms = [];
    const eps = 1e-6;
    for (let i = 0; i <= n[0]; i++) for (let j = 0; j <= n[1]; j++) for (let k = 0; k <= n[2]; k++) {
      for (const s of b.sites) {
        const fx = s.f[0] + i, fy = s.f[1] + j, fz = s.f[2] + k;
        if (fx > n[0] + eps || fy > n[1] + eps || fz > n[2] + eps) continue;
        const p = new V3().addScaledVector(a1, fx).addScaledVector(a2, fy).addScaledVector(a3, fz);
        atoms.push({ p, role: s.role });
      }
    }
    // centre
    const ctr = new V3().addScaledVector(a1, n[0] / 2).addScaledVector(a2, n[1] / 2).addScaledVector(a3, n[2] / 2);
    atoms.forEach((x) => x.p.sub(ctr));
    // nearest-neighbour distance (between A and X if both exist, else A–A)
    const hasX = atoms.some((x) => x.role === 'X');
    let nn = Infinity;
    const sample = atoms.slice(0, 120);
    for (const p of sample) for (const q of atoms) {
      if (p === q) continue;
      if (hasX && (p.role === q.role)) continue;
      const d = p.p.distanceTo(q.p); if (d > 0.3 && d < nn) nn = d;
    }
    return { atoms, cell: { a1, a2, a3, n, ctr }, nn: isFinite(nn) ? nn : a, hex: b.hex };
  };
  function cellEdges(cell) {
    const { a1, a2, a3, ctr } = cell;
    const o = new V3().sub(ctr);
    const P = (i, j, k) => o.clone().addScaledVector(a1, i).addScaledVector(a2, j).addScaledVector(a3, k);
    const pts = [];
    const E = [[0, 0, 0, 1, 0, 0], [0, 0, 0, 0, 1, 0], [0, 0, 0, 0, 0, 1], [1, 0, 0, 1, 1, 0], [1, 0, 0, 1, 0, 1], [0, 1, 0, 1, 1, 0], [0, 1, 0, 0, 1, 1], [0, 0, 1, 1, 0, 1], [0, 0, 1, 0, 1, 1], [1, 1, 0, 1, 1, 1], [1, 0, 1, 1, 1, 1], [0, 1, 1, 1, 1, 1]];
    for (const e of E) pts.push(P(e[0], e[1], e[2]), P(e[3], e[4], e[5]));
    return new T.LineSegments(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: 0xffbf4f, transparent: true, opacity: 0.85 }));
  }
  /* Electron "sea" wandering among metal ions */
  function electronSea(bounds, count, seed) {
    const ds = dots(count, COLORS.electron, 0.04, 0.26);
    const rnd = A.rng(seed || 5);
    const st = Array.from({ length: count }, () => ({ p: new V3((rnd() - 0.5) * 2 * bounds, (rnd() - 0.5) * 2 * bounds, (rnd() - 0.5) * 2 * bounds), v: new V3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(1.4 + rnd()) }));
    return {
      group: ds.group,
      update(dt) {
        for (let i = 0; i < count; i++) {
          const s = st[i];
          s.v.x += (rnd() - 0.5) * 3 * dt; s.v.y += (rnd() - 0.5) * 3 * dt; s.v.z += (rnd() - 0.5) * 3 * dt;
          s.v.clampLength(0.8, 2.4);
          s.p.addScaledVector(s.v, dt);
          for (const ax of ['x', 'y', 'z']) { if (s.p[ax] > bounds) { s.p[ax] = bounds; s.v[ax] *= -1; } if (s.p[ax] < -bounds) { s.p[ax] = -bounds; s.v[ax] *= -1; } }
          ds.set(i, s.p);
        }
        ds.commit();
      },
    };
  }
  /* Draw a lattice given element symbols for roles. opts: {bonds:'ionic'|'covalent'|'none', sea:boolean, legend?} */
  S.crystal = function (spec, roles, opts) {
    opts = opts || {};
    const L = S.latticePoints(spec);
    const group = new T.Group();
    const nn = L.nn;
    const rnd = A.rng(spec.seed || 3);
    const atoms = L.atoms.map((x) => {
      let el = roles[x.role] || roles.A;
      if (Array.isArray(el)) { // alloy: pick by fraction
        let r = rnd(), acc = 0; let pick = el[0].el;
        for (const c of el) { acc += c.fraction; if (r <= acc) { pick = c.el; break; } }
        el = pick;
      }
      return { el, p: x.p, role: x.role };
    });
    const ionic = opts.bonds === 'ionic';
    const radiusFor = (at) => {
      if (opts.radius) return opts.radius(at, nn);
      if (ionic) return at.role === 'X' ? nn * 0.36 : nn * 0.24;
      return opts.bonds === 'covalent' ? Math.min(0.38, nn * 0.24) : nn * 0.32;
    };
    group.add(spheres(atoms.map((at) => ({ p: at.p, r: radiusFor(at), color: A.elColor(at.el) })), { rough: opts.metal ? 0.25 : 0.38, metal: opts.metal ? 0.35 : 0.05 }));
    if (opts.bonds && opts.bonds !== 'none') {
      const cyl = [];
      const lim = nn * 1.12;
      for (let i = 0; i < atoms.length; i++) for (let j = i + 1; j < atoms.length; j++) {
        const ai = atoms[i], aj = atoms[j];
        if (ionic && ai.role === aj.role) continue;
        const dd = ai.p.distanceTo(aj.p);
        if (dd > lim || dd < 0.3) continue;
        const mid = ai.p.clone().lerp(aj.p, 0.5);
        cyl.push({ a: ai.p, b: mid, r: ionic ? 0.035 : 0.06, color: ionic ? '#4a5d6e' : A.elColor(ai.el) }, { a: mid, b: aj.p, r: ionic ? 0.035 : 0.06, color: ionic ? '#4a5d6e' : A.elColor(aj.el) });
      }
      if (cyl.length) group.add(cylinders(cyl, { opacity: ionic ? 0.7 : 0 }));
      // shared electrons on covalent network bonds
      if (opts.bonds === 'covalent' && opts.electrons !== false) {
        const pairs = [];
        for (let i = 0; i < atoms.length; i++) for (let j = i + 1; j < atoms.length; j++) {
          const dd = atoms[i].p.distanceTo(atoms[j].p);
          if (dd < lim && dd > 0.3) pairs.push([i, j]);
        }
        const ed = dots(pairs.length * 2, COLORS.electron, 0.035, 0.24);
        group.add(ed.group);
        const d = new V3(), c = new V3(), u = new V3(), v = new V3(), e = new V3();
        const prev = opts.update;
        opts.update = (dt, t) => {
          pairs.forEach(([i, j], k) => {
            d.subVectors(atoms[j].p, atoms[i].p); const len = d.length(); d.divideScalar(len);
            c.copy(atoms[i].p).addScaledVector(d, len / 2); basis(d, u, v);
            for (let s = 0; s < 2; s++) {
              const ph = t * 2 + k * 0.7 + s * Math.PI;
              e.copy(c).addScaledVector(d, len * 0.25 * Math.cos(ph)).addScaledVector(u, 0.1 * Math.sin(ph) * Math.cos(t + k)).addScaledVector(v, 0.1 * Math.sin(ph) * Math.sin(t + k));
              ed.set(k * 2 + s, e);
            }
          });
          ed.commit();
          if (prev) prev(dt, t);
        };
      }
    }
    if (ionic && opts.charges) {
      atoms.slice(0, 400).forEach((at) => {
        if (Math.abs(at.p.x) > 0.01 || at.role === 'B') return; // label one plane only, keeps it readable
      });
    }
    if (opts.extra && opts.extra.length) {
      group.add(spheres(opts.extra.map((x) => ({ p: x.p, r: x.r || nn * 0.16, color: A.elColor(x.el) })), { rough: 0.4 }));
    }
    if (opts.cell !== false) group.add(cellEdges(L.cell));
    let radius = 1;
    atoms.forEach((a) => (radius = Math.max(radius, a.p.length() + 0.5)));
    let sea = null;
    if (opts.sea) { sea = electronSea(radius * 0.62, Math.min(160, Math.round(atoms.length * 1.2)), spec.seed); group.add(sea.group); }
    return {
      group, radius, nn, atoms, cell: L.cell,
      update(dt, t) { if (sea) sea.update(dt); if (opts.update) opts.update(dt, t); },
    };
  };

  /* ===================================================================
     6. MATTER: the element as solid, liquid or gas at a chosen temperature
     =================================================================== */
  /* units: rigid groups of atoms in local coordinates, e.g. [[{el,p}],...]; sites: home positions for the solid */
  S.matter = function (cfg) {
    const group = new T.Group();
    const unit = cfg.unit; // [{el, p:V3}] local
    const sites = cfg.sites; // [V3]
    const N = sites.length;
    const atomCount = N * unit.length;
    const radius = cfg.atomR || 0.4;
    const mesh = new T.InstancedMesh(GEO.sphere, new T.MeshStandardMaterial({ color: 0xffffff, roughness: cfg.metal ? 0.25 : 0.38, metalness: cfg.metal ? 0.35 : 0.05 }), Math.max(1, atomCount));
    mesh.frustumCulled = false;
    for (let i = 0; i < atomCount; i++) mesh.setColorAt(i, tmpC.set(A.elColor(unit[i % unit.length].el)));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
    let bondMesh = null;
    const ub = cfg.unitBonds || [];
    if (ub.length) {
      bondMesh = new T.InstancedMesh(GEO.cyl, new T.MeshStandardMaterial({ color: 0xc9d6e2, roughness: 0.5 }), Math.max(1, N * ub.length));
      bondMesh.frustumCulled = false; group.add(bondMesh);
    }
    const box = cfg.box; // half-size of gas box
    const boxLines = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(box * 2, box * 2, box * 2)), new T.LineBasicMaterial({ color: 0x2e4456, transparent: true, opacity: 0.6 }));
    group.add(boxLines);
    let cellLines = cfg.cellObj || null;
    if (cellLines) group.add(cellLines);
    let sea = null;
    if (cfg.sea) { sea = electronSea(cfg.solidR * 0.8, Math.min(140, N), 9); group.add(sea.group); }
    const rnd = A.rng(cfg.seed || 1);
    const st = sites.map((s) => ({ p: s.clone(), v: new V3(), q: new T.Quaternion().setFromEuler(new T.Euler(rnd() * 6, rnd() * 6, rnd() * 6)), w: new V3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5), home: s.clone(), ph: rnd() * 6 }));
    const homeQ = sites.map(() => new T.Quaternion());
    if (cfg.homeQ) cfg.homeQ.forEach((q, i) => homeQ[i].copy(q));
    let phase = 'solid', Tn = 0.5;
    const api = {
      group, radius: Math.max(box, cfg.solidR) + 0.8,
      setState(ph, tnorm) {
        if (ph !== phase) {
          if (ph === 'gas') st.forEach((s) => s.v.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(2 + rnd() * 2));
          if (ph === 'liquid') st.forEach((s) => s.v.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.6));
        }
        phase = ph; Tn = tnorm;
        boxLines.visible = ph === 'gas';
        if (cellLines) cellLines.visible = ph === 'solid';
        if (sea) sea.group.visible = ph !== 'gas';
      },
      update(dt, t) {
        const amp = 0.04 + 0.12 * Math.min(1.2, Tn);
        const speed = 2.2 * Math.sqrt(Math.max(0.15, Tn));
        const liqR = cfg.solidR * 1.05;
        for (let i = 0; i < N; i++) {
          const s = st[i];
          if (phase === 'solid') {
            s.p.lerp(s.home, Math.min(1, dt * 3));
            s.q.slerp(homeQ[i], Math.min(1, dt * 3));
          } else if (phase === 'liquid') {
            s.v.x += (rnd() - 0.5) * 6 * dt; s.v.y += (rnd() - 0.5) * 6 * dt; s.v.z += (rnd() - 0.5) * 6 * dt;
            s.v.clampLength(0, 0.9 * speed * 0.5);
            s.p.addScaledVector(s.v, dt);
            const L = s.p.length(); if (L > liqR) { s.p.multiplyScalar(liqR / L); s.v.multiplyScalar(-0.5); }
            if (unit.length > 1) { Q.setFromAxisAngle(s.w.clone().normalize(), dt * 1.5); s.q.premultiply(Q); }
          } else {
            s.v.clampLength(speed * 0.7, speed * 1.3);
            s.p.addScaledVector(s.v, dt);
            for (const ax of ['x', 'y', 'z']) { if (s.p[ax] > box - 0.6) { s.p[ax] = box - 0.6; s.v[ax] = -Math.abs(s.v[ax]); } if (s.p[ax] < -box + 0.6) { s.p[ax] = -box + 0.6; s.v[ax] = Math.abs(s.v[ax]); } }
            if (unit.length > 1) { Q.setFromAxisAngle(s.w.clone().normalize(), dt * 3); s.q.premultiply(Q); }
          }
          const jig = phase === 'solid' ? amp : phase === 'liquid' ? amp * 0.6 : 0;
          const a = s.ph + t * 9;
          const jx = Math.sin(a) * jig, jy = Math.cos(a * 1.31) * jig, jz = Math.sin(a * 0.77) * jig;
          for (let k = 0; k < unit.length; k++) {
            const lp = unit[k].p.clone().applyQuaternion(s.q).add(s.p);
            lp.x += jx; lp.y += jy; lp.z += jz;
            mesh.setMatrixAt(i * unit.length + k, M4.compose(lp, IDQ, SC.setScalar(radius)));
            unit[k].wp = lp;
          }
          if (bondMesh) {
            ub.forEach((b, bi) => {
              const pa = unit[b[0]].wp, pb = unit[b[1]].wp;
              const dd = new V3().subVectors(pb, pa); const len = dd.length(); dd.divideScalar(len);
              Q.setFromUnitVectors(Y, dd);
              bondMesh.setMatrixAt(i * ub.length + bi, M4.compose(pa.clone().lerp(pb, 0.5), Q, SC.set(0.07, len, 0.07)));
            });
          }
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (bondMesh) bondMesh.instanceMatrix.needsUpdate = true;
        if (sea) sea.update(dt);
      },
    };
    return api;
  };

  /* ===================================================================
     7. SPECIMEN: the real photograph on a floating plate
     =================================================================== */
  S.specimen = function (url, onReady) {
    const group = new T.Group();
    const plateGeo = new T.PlaneGeometry(1, 1);
    const mat = new T.MeshBasicMaterial({ color: 0xffffff, side: T.DoubleSide });
    const plate = new T.Mesh(plateGeo, mat);
    const frame = new T.Mesh(new T.BoxGeometry(1, 1, 0.08), new T.MeshStandardMaterial({ color: 0x1b2833, roughness: 0.5, metalness: 0.3 }));
    group.add(frame, plate);
    plate.position.z = 0.045;
    const back = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshStandardMaterial({ color: 0x131e28, side: T.DoubleSide }));
    back.position.z = -0.045; back.rotation.y = Math.PI; group.add(back);
    new T.TextureLoader().load(url, (tex) => {
      const w = tex.image.width, hgt = tex.image.height, ar = w / hgt;
      const W = ar >= 1 ? 6 : 6 * ar, H = ar >= 1 ? 6 / ar : 6;
      plate.scale.set(W, H, 1); back.scale.set(W + 0.3, H + 0.3, 1); frame.scale.set(W + 0.3, H + 0.3, 1);
      tex.minFilter = T.LinearFilter;
      mat.map = tex; mat.needsUpdate = true;
      if (onReady) onReady(ar);
    }, undefined, () => { if (onReady) onReady(null); });
    plate.scale.set(6, 4.5, 1); frame.scale.set(6.3, 4.8, 1); back.scale.set(6.3, 4.8, 1);
    return {
      group, radius: 3.6, view: { dir: new V3(0.18, 0.08, 1) },
      update(dt, t) { if (!reduceMotion) { group.rotation.y = Math.sin(t * 0.35) * 0.22; group.rotation.x = Math.sin(t * 0.27) * 0.06; } },
    };
  };

  /* A lone glowing atom, for elements no one has ever seen */
  S.lonelyAtom = function (el) {
    const at = S.atom(el);
    const g = new T.Group(); g.add(at.group);
    const halo = new T.Points(new T.BufferGeometry().setFromPoints([new V3()]), new T.PointsMaterial({ size: at.radius * 3.2, map: glowTex, color: 0x6fd3ff, transparent: true, opacity: 0.22, blending: T.AdditiveBlending, depthWrite: false }));
    g.add(halo);
    return { group: g, radius: at.radius, update: at.update };
  };

  /* ===================================================================
     8. COMBINE: two atoms meeting — ionic transfer, covalent sharing, metallic sea, or no bond
     =================================================================== */
  S.combine = function (ea, eb, kind, cfg) {
    const group = new T.Group();
    const mk = (el) => {
      const g = new T.Group();
      const core = new T.Mesh(GEO.sphere, new T.MeshStandardMaterial({ color: A.elColor(el.symbol), roughness: 0.35 }));
      core.scale.setScalar(0.55); g.add(core);
      const ringR = 1.6;
      const rg = ring(ringR, 0x3a5468, 0.012); rg.rotation.x = Math.PI / 2; g.add(rg);
      const lab = label(el.symbol, { size: 0.5, color: '#dce6ee', px: 52, depthTest: false }); lab.position.set(0, 0.95, 0); g.add(lab);
      const chg = label('', { size: 0.4 }); chg.visible = false; g.add(chg);
      group.add(g);
      return { g, core, ringR, el, lab };
    };
    const a = mk(ea), b = mk(eb);
    const va = Math.min(8, A.valence(ea)), vb = Math.min(8, A.valence(eb));
    const ed = dots(va + vb, COLORS.valence, 0.085);
    group.add(ed.group);
    const chargeLabels = [null, null];
    if (kind === 'ionic' && cfg.transfer) {
      const pa = label('+' + (cfg.transfer > 1 ? cfg.transfer : ''), { size: 0.42, color: '#ffa552', px: 48, depthTest: false });
      const pb = label('−' + (cfg.transfer > 1 ? cfg.transfer : ''), { size: 0.42, color: '#6fd3ff', px: 48, depthTest: false });
      pa.visible = pb.visible = false; group.add(pa, pb); chargeLabels[0] = pa; chargeLabels[1] = pb;
    }
    const p = new V3();
    const CYCLE = 9;
    const xa = ea.electronegativity, xb = eb.electronegativity;
    function update(dt, t) {
      const tc = reduceMotion ? 6.5 : t % CYCLE;
      const approach = Math.min(1, tc / 2.2);
      const ease = approach * approach * (3 - 2 * approach);
      const meet = Math.max(0, Math.min(1, (tc - 2.2) / 2.2));
      const far = 4.2, near = kind === 'none' ? 3.6 + Math.sin(Math.max(0, tc - 2.2) * 1.2) * 0.6 : kind === 'ionic' ? 2.6 : kind === 'metallic' ? 2.5 : 2.2;
      const sep = far + (near - far) * ease;
      a.g.position.set(-sep / 2, 0, 0); b.g.position.set(sep / 2, 0, 0);
      let k = 0;
      const ionicScale = kind === 'ionic' ? meet : 0;
      a.core.scale.setScalar(0.55 * (1 - 0.25 * ionicScale)); b.core.scale.setScalar(0.55 * (1 + 0.2 * ionicScale));
      if (chargeLabels[0]) { chargeLabels[0].visible = chargeLabels[1].visible = meet > 0.95; chargeLabels[0].position.set(-sep / 2, -1.0, 0); chargeLabels[1].position.set(sep / 2, -1.0, 0); }
      const place = (atom, i, n, extra) => {
        const ang = (i / n) * Math.PI * 2 + t * 0.9 + (extra || 0);
        p.set(Math.cos(ang) * atom.ringR, 0, Math.sin(ang) * atom.ringR).add(atom.g.position);
        return p;
      };
      if (kind === 'ionic') {
        const tr = cfg.transfer || 1;
        for (let i = 0; i < va; i++) {
          if (i < tr) {
            const from = place(a, i, va).clone();
            const to = place(b, vb + i, vb + tr).clone();
            ed.set(k++, from.lerp(to, meet).add(new V3(0, Math.sin(meet * Math.PI) * 0.9, 0)));
          } else ed.set(k++, place(a, i, va));
        }
        for (let i = 0; i < vb; i++) ed.set(k++, place(b, i, vb + tr * meet));
      } else if (kind === 'covalent') {
        const order = cfg.order || 1;
        const mid = new V3(0, 0, 0);
        let f = 0;
        if (xa != null && xb != null) f = Math.max(-0.45, Math.min(0.45, (xb - xa) * 0.25));
        mid.x = f;
        let sa = 0, sb = 0;
        for (let i = 0; i < va; i++) {
          const base = place(a, i, va).clone();
          if (sa < order) {
            const ph = t * 2.4 + sa * 2.1;
            const tgt = mid.clone().add(new V3(Math.cos(ph) * 0.45, Math.sin(ph) * 0.18 + (sa - (order - 1) / 2) * 0.32, Math.sin(ph) * 0.18));
            ed.set(k++, base.lerp(tgt, meet)); sa++;
          } else ed.set(k++, base);
        }
        for (let i = 0; i < vb; i++) {
          const base = place(b, i, vb, 0.4).clone();
          if (sb < order) {
            const ph = t * 2.4 + sb * 2.1 + Math.PI;
            const tgt = mid.clone().add(new V3(Math.cos(ph) * 0.45, Math.sin(ph) * 0.18 + (sb - (order - 1) / 2) * 0.32, Math.sin(ph) * 0.18));
            ed.set(k++, base.lerp(tgt, meet)); sb++;
          } else ed.set(k++, base);
        }
      } else if (kind === 'metallic') {
        for (let i = 0; i < va + vb; i++) {
          const own = i < va ? place(a, i, va).clone() : place(b, i - va, vb).clone();
          const ang = t * (0.7 + (i % 3) * 0.3) + i * 1.7;
          const cloud = new V3(Math.cos(ang) * (sep / 2 + 1.1), Math.sin(ang * 1.3) * 0.8, Math.sin(ang) * 1.3);
          ed.set(k++, own.lerp(cloud, meet));
        }
      } else {
        for (let i = 0; i < va; i++) ed.set(k++, place(a, i, va));
        for (let i = 0; i < vb; i++) ed.set(k++, place(b, i, vb));
      }
      ed.commit();
    }
    update(0, 0);
    return { group, radius: 4.4, update, view: { dir: new V3(0.1, 0.55, 1) } };
  };

  /* ===================================================================
     9. MOLECULE SIMULATION (like the water lab): many rigid molecules moving under a simple
        force field. Lennard-Jones sizes come from van der Waals radii; partial charges come from
        electronegativity differences across each bond. Units: Å, kcal/mol, amu; 1 time unit = 48.888 fs.
     =================================================================== */
  const KB = 0.0019872041, KC = 332.0636, DT = 1 / 48.888, RC = 9, RC2 = RC * RC, INV_RC2 = 1 / RC2, FMAX = 250, KW = 5, TAU = 3;
  // well depths, kcal/mol (noble gases from their measured Lennard-Jones fits: Ar 120 K, Kr 171 K, Xe 221 K)
  const EPS_EL = { H: 0.02, He: 0.02, B: 0.1, C: 0.07, N: 0.17, O: 0.155, F: 0.06, Ne: 0.07, Si: 0.3, P: 0.2, S: 0.25, Cl: 0.27, Ar: 0.238, Br: 0.4, Kr: 0.34, I: 0.5, Xe: 0.44, Rn: 0.5 };
  const HB_EL = new Set(['N', 'O', 'F']);
  const massOf = (sym) => { const e = EL(sym); const m = e ? parseFloat(String(e.atomicMass).replace(/[\[\]]/g, '')) : NaN; return m > 0 ? m : 12; };
  S.SIM_PAIR_BUDGET = 140000;
  S.simCapacity = (n) => Math.floor(Math.sqrt(S.SIM_PAIR_BUDGET) / Math.max(1, n));

  /* Template for one rigid molecule: centred atoms, partial charges, LJ parameters, H-bond donors/acceptors */
  S.simTemplate = function (atoms, bonds) {
    const n = atoms.length;
    const mass = atoms.map((a) => massOf(a.el));
    const M = mass.reduce((s, x) => s + x, 0);
    const com = new V3();
    atoms.forEach((a, i) => com.addScaledVector(a.p, mass[i]));
    com.divideScalar(M);
    const local = atoms.map((a) => a.p.clone().sub(com));
    let I = 0;
    local.forEach((p, i) => (I += mass[i] * p.lengthSq()));
    // a linear molecule cannot spin about its own axis: 2 rotational degrees of freedom, not 3
    const far = local.reduce((best, p) => (p.lengthSq() > best.lengthSq() ? p : best), new V3());
    const axis = far.lengthSq() > 1e-6 ? far.clone().normalize() : null;
    const linear = !!axis && local.every((p) => p.clone().addScaledVector(axis, -p.dot(axis)).lengthSq() < 0.0025);
    const rotDof = !axis ? 0 : linear ? 2 : 3;
    I = Math.max(0.8, linear ? I : (I * 2) / 3); // perpendicular moment if linear, else mean principal moment, amu·Å²
    const q = new Float64Array(n);
    bonds.forEach((b) => {
      const xa = chi(atoms[b.a].el), xb = chi(atoms[b.b].el);
      if (xa == null || xb == null) return;
      const d = 0.33 * (xb - xa) * ((+b.o || 1) > 1.2 ? 1.4 : 1); // ≈ TIP3P charges for water (O −0.82, H +0.41)
      q[b.a] += d; q[b.b] -= d;
    });
    let formal = 0;
    atoms.forEach((a, i) => { if (a.q) { q[i] += 0.5 * a.q; formal += a.q; } q[i] = Math.max(-1.2, Math.min(1.2, q[i])); });
    let sum = 0;
    for (let i = 0; i < n; i++) sum += q[i];
    const shift = (sum - 0.5 * formal) / n; // undo clamping drift so the net charge stays exact
    for (let i = 0; i < n; i++) q[i] -= shift;
    const sig = atoms.map((a) => (a.el === 'H' ? 0.8 : (2 * ((EL(a.el) && EL(a.el).vdwRadius) || 170)) / 100));
    const eps = atoms.map((a) => (EPS_EL[a.el] != null ? EPS_EL[a.el] : 0.15));
    const donors = [];
    bonds.forEach((b) => {
      const ea = atoms[b.a].el, eb = atoms[b.b].el;
      if (ea === 'H' && HB_EL.has(eb)) donors.push({ h: b.a, d: b.b });
      else if (eb === 'H' && HB_EL.has(ea)) donors.push({ h: b.b, d: b.a });
    });
    const acceptors = [];
    atoms.forEach((a, i) => { if (HB_EL.has(a.el)) acceptors.push(i); });
    const rCore = local.reduce((m, p) => Math.max(m, p.length()), 0);
    // lone pairs in the molecule's own frame (same rules as the single-molecule view)
    const nbr = atoms.map(() => []);
    bonds.forEach((b) => { nbr[b.a].push(b.b); nbr[b.b].push(b.a); });
    const lpCount = S.lonePairCounts(atoms, bonds);
    const lonePairs = [];
    atoms.forEach((a, i) => {
      if (!lpCount[i] || !nbr[i].length) return; // a lone atom (noble gas) has a spherical cloud, not separate pairs
      lonePairDirections(nbr[i].map((j) => local[j].clone().sub(local[i]).normalize()), lpCount[i], i).forEach((dir) => lonePairs.push({ i, dir }));
    });
    const dchiMax = bonds.reduce((m, b) => { const xa = chi(atoms[b.a].el), xb = chi(atoms[b.b].el); return xa != null && xb != null ? Math.max(m, Math.abs(xa - xb)) : m; }, 0);
    return { n, atoms: atoms.map((a, i) => ({ el: a.el, p: local[i] })), bonds, q, mass: M, I, sig, eps, donors, acceptors, rCore, netFormal: formal, axis: linear ? axis : null, rotDof, lonePairs, dchiMax };
  };

  let chargeTex = null;
  function chargeTextures() {
    if (chargeTex) return chargeTex;
    const mk = (text, color) => {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d');
      g.font = '600 64px "Schibsted Grotesk", "Segoe UI", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 10; g.strokeStyle = 'rgba(8,13,19,.85)'; g.strokeText(text, 64, 66);
      g.fillStyle = color; g.fillText(text, 64, 66);
      return shared(new T.CanvasTexture(c));
    };
    return (chargeTex = { minus: mk('δ−', '#ff8a80'), plus: mk('δ+', '#dce6ee') });
  }

  /* cfg: {count, layout: 'pair'|'cluster'|'bulk', T, speed (fs per frame), chargeScale 0..1, seed, electrons} */
  S.molSim = function (tpl, cfg) {
    const n = tpl.n, N = cfg.count, nb = tpl.bonds.length;
    const rnd = A.rng(cfg.seed || 3);
    const gauss = () => { let u = 0; while (u === 0) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
    const group = new T.Group();
    let Ttarget = cfg.T || 298, speed = cfg.speed || 3, qs = cfg.chargeScale != null ? cfg.chargeScale : 1, acc = 0, simFs = 0, Tshown = Ttarget, frozen = false, hbCount = 0;

    // ---- pair tables
    const SIG = new Float64Array(n * n), EPS = new Float64Array(n * n), QQ = new Float64Array(n * n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      SIG[i * n + j] = 0.5 * (tpl.sig[i] + tpl.sig[j]);
      EPS[i * n + j] = Math.sqrt(tpl.eps[i] * tpl.eps[j]);
      QQ[i * n + j] = tpl.q[i] * tpl.q[j];
    }
    // ---- initial placement
    // start far enough apart that atoms do not overlap (big atoms such as xenon need more than 3.2 Å);
    // a cluster starts packed like a droplet, as in the water lab
    const maxSig = Math.max(...tpl.sig);
    const spacing = 2 * tpl.rCore + (cfg.layout === 'cluster' ? Math.max(2.8, 0.95 * maxSig) : Math.max(3.2, 1.12 * maxSig));
    const sites = [];
    let W;
    if (cfg.layout === 'pair') {
      W = spacing * 1.6 + 2;
      sites.push(new V3(-spacing / 2, 0, 0), new V3(spacing / 2, 0, 0));
    } else {
      const k = Math.ceil(Math.cbrt(N));
      W = (spacing * k) / 2 + (cfg.layout === 'cluster' ? 1.5 : 1);
      for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) for (let l = 0; l < k; l++) sites.push(new V3((i - (k - 1) / 2) * spacing, (j - (k - 1) / 2) * spacing, (l - (k - 1) / 2) * spacing));
      for (let i = sites.length - 1; i > 0; i--) { const r = Math.floor(rnd() * (i + 1)); const t = sites[i]; sites[i] = sites[r]; sites[r] = t; }
    }
    const mols = [];
    for (let m = 0; m < N; m++) {
      const u1 = rnd(), u2 = rnd() * 2 * Math.PI, u3 = rnd() * 2 * Math.PI, a = Math.sqrt(1 - u1), b = Math.sqrt(u1);
      const sv = Math.sqrt((KB * Ttarget) / tpl.mass), sw = Math.sqrt((KB * Ttarget) / tpl.I);
      mols.push({
        p: sites[m].clone(), v: new V3(gauss() * sv, gauss() * sv, gauss() * sv), q: new T.Quaternion(a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3)),
        w: new V3(gauss() * sw, gauss() * sw, gauss() * sw), f: new V3(), t: new V3(),
      });
    }
    // two molecules that can hydrogen-bond start with one H pointing at the other's lone pair, 1.9 Å away (as in the water lab)
    if (cfg.layout === 'pair' && N === 2 && tpl.donors.length && tpl.acceptors.length && n <= 30) {
      const dn = tpl.donors[0];
      const acc = tpl.acceptors.find((i) => tpl.atoms[i].el === 'O') ?? tpl.acceptors[0];
      const [ma, mb] = mols;
      ma.q.setFromUnitVectors(tpl.atoms[dn.h].p.clone().sub(tpl.atoms[dn.d].p).normalize(), X);
      const hA = tpl.atoms[dn.h].p.clone().applyQuaternion(ma.q);
      const lpB = tpl.lonePairs.find((l) => l.i === acc);
      const outB = lpB ? lpB.dir.clone() : tpl.atoms[acc].p.lengthSq() > 1e-6 ? tpl.atoms[acc].p.clone().normalize() : X.clone();
      mb.q.setFromUnitVectors(outB, X.clone().negate());
      ma.p.set(0, 0, 0);
      mb.p.copy(hA).add(new V3(1.9, 0, 0)).sub(tpl.atoms[acc].p.clone().applyQuaternion(mb.q));
      const mid = ma.p.clone().add(mb.p).multiplyScalar(0.5);
      ma.p.sub(mid); mb.p.sub(mid);
      mols.forEach((M) => { M.v.multiplyScalar(0.55); M.w.multiplyScalar(0.55); }); // start cool, like the water lab
    }
    const removeDrift = () => { const avg = new V3(); mols.forEach((m) => avg.add(m.v)); avg.divideScalar(N); mols.forEach((m) => m.v.sub(avg)); };
    removeDrift();
    // keep only the rotations the molecule really has (none for one atom, no axial spin if linear)
    const axW = new V3();
    const fixSpin = (M) => {
      if (tpl.rotDof === 0) M.w.set(0, 0, 0);
      else if (tpl.axis) { axW.copy(tpl.axis).applyQuaternion(M.q); M.w.addScaledVector(axW, -M.w.dot(axW)); }
    };
    if (tpl.rotDof < 3) mols.forEach(fixSpin);
    const dof = Math.max(1, (3 + tpl.rotDof) * N - 3);

    // ---- physics
    const WP = new Float64Array(N * n * 3), FA = new Float64Array(N * n * 3);
    const tmp = new V3(), rv = new V3(), fv = new V3(), cr = new V3();
    const cut = (RC + 2 * tpl.rCore) * (RC + 2 * tpl.rCore);
    function computeForces() {
      for (let m = 0; m < N; m++) {
        const M = mols[m];
        M.f.set(0, 0, 0); M.t.set(0, 0, 0);
        for (let k = 0; k < n; k++) {
          tmp.copy(tpl.atoms[k].p).applyQuaternion(M.q).add(M.p);
          const o = (m * n + k) * 3;
          WP[o] = tmp.x; WP[o + 1] = tmp.y; WP[o + 2] = tmp.z;
        }
      }
      FA.fill(0);
      const q2 = qs * qs;
      for (let a = 0; a < N; a++) {
        const Pa = mols[a].p;
        for (let b = a + 1; b < N; b++) {
          const Pb = mols[b].p;
          const dx = Pb.x - Pa.x, dy = Pb.y - Pa.y, dz = Pb.z - Pa.z;
          if (dx * dx + dy * dy + dz * dz > cut) continue;
          for (let i = 0; i < n; i++) {
            const ia = (a * n + i) * 3, xi = WP[ia], yi = WP[ia + 1], zi = WP[ia + 2];
            for (let j = 0; j < n; j++) {
              const jb = (b * n + j) * 3;
              const rx = WP[jb] - xi, ry = WP[jb + 1] - yi, rz = WP[jb + 2] - zi;
              const r2 = rx * rx + ry * ry + rz * rz;
              if (r2 > RC2) continue;
              const ij = i * n + j;
              let f = 0;
              const e = EPS[ij];
              if (e > 0) {
                const s = SIG[ij], rr = Math.max(r2, 0.49 * s * s);
                const s2 = (s * s) / rr, s6 = s2 * s2 * s2;
                f += (24 * e * (2 * s6 * s6 - s6)) / rr;
              }
              const qq = QQ[ij] * q2;
              if (qq !== 0) {
                const rr = Math.max(r2, 0.5), g = 1 / rr - INV_RC2;
                if (g > 0) f += (KC * qq * g) / Math.sqrt(rr);
              }
              const mag = Math.abs(f) * Math.sqrt(r2);
              if (mag > FMAX) f *= FMAX / mag;
              const fx = f * rx, fy = f * ry, fz = f * rz;
              FA[jb] += fx; FA[jb + 1] += fy; FA[jb + 2] += fz;
              FA[ia] -= fx; FA[ia + 1] -= fy; FA[ia + 2] -= fz;
            }
          }
        }
      }
      for (let m = 0; m < N; m++) {
        const M = mols[m];
        for (let k = 0; k < n; k++) {
          const o = (m * n + k) * 3;
          fv.set(FA[o], FA[o + 1], FA[o + 2]);
          rv.set(WP[o] - M.p.x, WP[o + 1] - M.p.y, WP[o + 2] - M.p.z);
          M.f.add(fv);
          M.t.add(cr.crossVectors(rv, fv));
        }
        for (const ax of ['x', 'y', 'z']) {
          const c = M.p[ax];
          if (c > W) M.f[ax] -= KW * (c - W); else if (c < -W) M.f[ax] += KW * (-W - c);
        }
      }
    }
    const axis = new V3(), dq = new T.Quaternion();
    let steps = 0;
    function step() {
      const h = DT * 0.5;
      for (const M of mols) {
        M.v.addScaledVector(M.f, h / tpl.mass);
        M.w.addScaledVector(M.t, h / tpl.I);
        M.p.addScaledVector(M.v, DT);
        const wl = M.w.length();
        if (wl > 1e-9) { axis.copy(M.w).divideScalar(wl); dq.setFromAxisAngle(axis, wl * DT); M.q.premultiply(dq).normalize(); }
      }
      computeForces();
      let ke = 0;
      for (const M of mols) {
        M.v.addScaledVector(M.f, h / tpl.mass);
        M.w.addScaledVector(M.t, h / tpl.I);
        if (tpl.rotDof < 3) fixSpin(M);
        if (M.v.lengthSq() > 4) M.v.setLength(2);
        if (M.w.lengthSq() > 100) M.w.setLength(10);
        ke += 0.5 * tpl.mass * M.v.lengthSq() + 0.5 * tpl.I * M.w.lengthSq();
      }
      const Tcur = (2 * ke) / (dof * KB);
      if (Tcur > 1e-6) {
        const lam = Math.min(1.08, Math.max(0.92, Math.sqrt(1 + (DT / TAU) * (Ttarget / Tcur - 1))));
        for (const M of mols) { M.v.multiplyScalar(lam); M.w.multiplyScalar(lam); }
      }
      Tshown += (Tcur - Tshown) * 0.01;
      simFs += 1;
      if (++steps % 200 === 0) removeDrift();
    }
    computeForces();

    // ---- visuals
    const big = N > 20;
    const ar = tpl.atoms.map((a) => ballR(a.el) * (big ? 0.85 : 1));
    const atomMesh = new T.InstancedMesh(big ? GEO.sphereLo : GEO.sphere, new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 }), N * n);
    atomMesh.frustumCulled = false;
    for (let m = 0; m < N; m++) for (let k = 0; k < n; k++) atomMesh.setColorAt(m * n + k, tmpC.set(A.elColor(tpl.atoms[k].el)));
    if (atomMesh.instanceColor) atomMesh.instanceColor.needsUpdate = true;
    group.add(atomMesh);
    let bondMesh = null;
    if (nb) {
      bondMesh = new T.InstancedMesh(GEO.cyl, new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45 }), N * nb * 2);
      bondMesh.frustumCulled = false;
      for (let m = 0; m < N; m++) tpl.bonds.forEach((b, bi) => {
        bondMesh.setColorAt((m * nb + bi) * 2, tmpC.set(A.elColor(tpl.atoms[b.a].el)));
        bondMesh.setColorAt((m * nb + bi) * 2 + 1, tmpC.set(A.elColor(tpl.atoms[b.b].el)));
      });
      if (bondMesh.instanceColor) bondMesh.instanceColor.needsUpdate = true;
      group.add(bondMesh);
    }
    // shared electrons on every bond, if the total stays manageable
    const eSpecs = tpl.bonds.map((b) => ({ b, n: b.e != null ? +b.e : Math.min(6, Math.max(1, Math.round((+b.o || 1) * 2))) }));
    const ePer = eSpecs.reduce((s, e) => s + e.n, 0);
    const ed = ePer * N > 0 && ePer * N <= 2400 ? dots(ePer * N, COLORS.electron, big ? 0.035 : 0.045, big ? 0.24 : 0.3) : null;
    if (ed) group.add(ed.group);
    // electron clouds: where each shared pair and each lone pair is likely to be (additive glow, as in the water lab)
    const cloudMat = (color, opacity) => new T.MeshBasicMaterial({ color, transparent: true, opacity, blending: T.AdditiveBlending, depthWrite: false });
    const bondCloud = N * nb > 0 && N * nb <= 3000 ? new T.InstancedMesh(GEO.sphereLo, cloudMat(COLORS.electron, 0.15), N * nb) : null;
    const nlp = tpl.lonePairs.length;
    const lpCloud = N * nlp > 0 && N * nlp <= 1500 ? new T.InstancedMesh(GEO.sphereLo, cloudMat(COLORS.lone, 0.13), N * nlp) : null;
    const ld = lpCloud ? dots(N * nlp * 2, COLORS.lone, big ? 0.035 : 0.042, big ? 0.22 : 0.3) : null;
    [bondCloud, lpCloud].forEach((m) => { if (m) { m.frustumCulled = false; group.add(m); } });
    if (ld) group.add(ld.group);
    const show = { electrons: true, lone: true, clouds: true };
    const applyShow = () => {
      if (ed) ed.group.visible = show.electrons;
      if (bondCloud) bondCloud.visible = show.electrons && show.clouds;
      if (ld) ld.group.visible = show.lone;
      if (lpCloud) lpCloud.visible = show.lone && show.clouds;
    };
    // partial-charge labels on every molecule, while the count stays readable
    const sprites = [];
    const charged = [];
    for (let k = 0; k < n; k++) if (Math.abs(tpl.q[k]) >= 0.15) charged.push(k);
    if (charged.length && N * charged.length <= 700) {
      const tx = chargeTextures();
      for (let m = 0; m < N; m++) for (const k of charged) {
        const s = new T.Sprite(new T.SpriteMaterial({ map: tpl.q[k] < 0 ? tx.minus : tx.plus, transparent: true, depthWrite: false }));
        s.scale.setScalar(big ? 0.34 : 0.42); s.renderOrder = 10;
        group.add(s);
        sprites.push({ s, m, k });
      }
    }
    // hydrogen bonds
    const maxHB = Math.max(1, N * tpl.donors.length);
    const hbPos = new Float32Array(maxHB * 6), hbDist = new Float32Array(maxHB * 2);
    const hbGeo = new T.BufferGeometry();
    hbGeo.setAttribute('position', new T.BufferAttribute(hbPos, 3));
    hbGeo.setAttribute('lineDistance', new T.BufferAttribute(hbDist, 1));
    hbGeo.setDrawRange(0, 0);
    const hbLines = new T.LineSegments(hbGeo, new T.LineDashedMaterial({ color: 0xffbf4f, dashSize: 0.16, gapSize: 0.12, transparent: true, opacity: 0.95 }));
    hbLines.frustumCulled = false;
    group.add(hbLines);
    const box = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(W * 2 + 2 * tpl.rCore, W * 2 + 2 * tpl.rCore, W * 2 + 2 * tpl.rCore)), new T.LineBasicMaterial({ color: 0x2e4456, transparent: true, opacity: 0.5 }));
    box.visible = cfg.layout !== 'pair';
    group.add(box);

    const P = new V3(), Pb = new V3(), d = new V3(), c = new V3(), u = new V3(), v = new V3(), e = new V3(), mid = new V3(), lpw = new V3();
    const atomPos = (m, k, out) => { const o = (m * n + k) * 3; return out.set(WP[o], WP[o + 1], WP[o + 2]); };
    const HB_COS = Math.cos((50 * Math.PI) / 180);
    function draw(t) {
      for (let m = 0; m < N; m++) for (let k = 0; k < n; k++) atomMesh.setMatrixAt(m * n + k, M4.compose(atomPos(m, k, P), IDQ, SC.setScalar(ar[k])));
      atomMesh.instanceMatrix.needsUpdate = true;
      if (bondMesh) {
        for (let m = 0; m < N; m++) tpl.bonds.forEach((b, bi) => {
          atomPos(m, b.a, P); atomPos(m, b.b, Pb);
          d.subVectors(Pb, P); const len = d.length() || 1e-6; d.divideScalar(len);
          Q.setFromUnitVectors(Y, d);
          const r = (+b.o || 1) < 0.75 ? 0.035 : 0.07;
          mid.copy(P).addScaledVector(d, len * 0.25);
          bondMesh.setMatrixAt((m * nb + bi) * 2, M4.compose(mid, Q, SC.set(r, len / 2, r)));
          mid.copy(P).addScaledVector(d, len * 0.75);
          bondMesh.setMatrixAt((m * nb + bi) * 2 + 1, M4.compose(mid, Q, SC.set(r, len / 2, r)));
        });
        bondMesh.instanceMatrix.needsUpdate = true;
      }
      // shared pairs: dots and cloud sit nearer the atom that pulls harder, more so at higher polarity
      const doE = !!(ed && ed.group.visible), doC = !!(bondCloud && bondCloud.visible);
      if (doE || doC) {
        let k = 0;
        const cw = 0.2 + 0.05 * (1 - qs);
        for (let m = 0; m < N; m++) eSpecs.forEach((s, si) => {
          atomPos(m, s.b.a, P); atomPos(m, s.b.b, Pb);
          d.subVectors(Pb, P); const len = d.length() || 1e-6; d.divideScalar(len);
          const xa = chi(tpl.atoms[s.b.a].el), xb = chi(tpl.atoms[s.b.b].el);
          let f = 0.5;
          if (xa != null && xb != null) { const sh = Math.min(0.2, 0.13 * Math.abs(xb - xa) * qs); f = xb > xa ? 0.5 + sh : 0.5 - sh; }
          c.copy(P).addScaledVector(d, len * f);
          if (doC) { Q.setFromUnitVectors(Y, d); bondCloud.setMatrixAt(m * nb + si, M4.compose(c, Q, SC.set(cw, len * 0.6, cw))); }
          if (!doE) return;
          basis(d, u, v);
          for (let j = 0; j < s.n; j++) {
            const ph = t * 2.3 + si * 0.77 + m * 1.3 + Math.floor(j / 2) * 1.9 + (j % 2) * Math.PI;
            const psi = t * 0.8 + si * 1.3 + m + Math.floor(j / 2) * 1.1;
            e.copy(c).addScaledVector(d, len * 0.27 * Math.cos(ph)).addScaledVector(u, 0.12 * Math.sin(ph) * Math.cos(psi)).addScaledVector(v, 0.12 * Math.sin(ph) * Math.sin(psi));
            ed.set(k++, e);
          }
        });
        if (doE) ed.commit();
        if (doC) bondCloud.instanceMatrix.needsUpdate = true;
      }
      // lone pairs: two electrons in a lobe pointing away from the bonds
      const doD = !!(ld && ld.group.visible), doL = !!(lpCloud && lpCloud.visible);
      if (doD || doL) {
        for (let m = 0; m < N; m++) tpl.lonePairs.forEach((l, li) => {
          const idx = m * nlp + li;
          lpw.copy(l.dir).applyQuaternion(mols[m].q);
          atomPos(m, l.i, P);
          c.copy(P).addScaledVector(lpw, ar[l.i] + 0.2);
          if (doL) { Q.setFromUnitVectors(Y, lpw); lpCloud.setMatrixAt(idx, M4.compose(c, Q, SC.set(0.17, 0.26, 0.17))); }
          if (!doD) return;
          basis(lpw, u, v);
          for (let j = 0; j < 2; j++) {
            const ph = t * 2.1 + idx * 1.3 + j * Math.PI, psi = t * 1.1 + idx;
            e.copy(c).addScaledVector(lpw, 0.11 * Math.cos(ph)).addScaledVector(u, 0.1 * Math.sin(ph) * Math.cos(psi)).addScaledVector(v, 0.1 * Math.sin(ph) * Math.sin(psi));
            ld.set(idx * 2 + j, e);
          }
        });
        if (doD) ld.commit();
        if (doL) lpCloud.instanceMatrix.needsUpdate = true;
      }
      sprites.forEach((sp) => {
        atomPos(sp.m, sp.k, P);
        d.copy(P).sub(mols[sp.m].p);
        if (d.lengthSq() < 1e-6) d.set(0, 1, 0);
        sp.s.position.copy(P).addScaledVector(d.normalize(), ar[sp.k] + 0.32);
        sp.s.material.opacity = Math.min(1, qs * 1.2);
      });
      // hydrogen bonds: donor H on one molecule, acceptor N/O/F on another, H···A < 2.6 Å, D–H···A > 130°
      // (always counted for the HUD; the toggle only hides the dashed lines)
      let nh = 0;
      if (tpl.donors.length && tpl.acceptors.length) {
        for (let a = 0; a < N; a++) for (const dn of tpl.donors) {
          atomPos(a, dn.h, P); atomPos(a, dn.d, Pb);
          d.subVectors(P, Pb).normalize();
          let best = 2.6, bx = null;
          for (let b = 0; b < N; b++) {
            if (b === a) continue;
            for (const ac of tpl.acceptors) {
              const o = (b * n + ac) * 3;
              e.set(WP[o] - P.x, WP[o + 1] - P.y, WP[o + 2] - P.z);
              const dist = e.length();
              if (dist >= best) continue;
              if (d.dot(e) / dist > HB_COS) { best = dist; bx = o; }
            }
          }
          if (bx != null) {
            const o = nh * 6;
            hbPos[o] = P.x; hbPos[o + 1] = P.y; hbPos[o + 2] = P.z;
            hbPos[o + 3] = WP[bx]; hbPos[o + 4] = WP[bx + 1]; hbPos[o + 5] = WP[bx + 2];
            hbDist[nh * 2] = 0; hbDist[nh * 2 + 1] = best;
            nh++;
          }
        }
      }
      hbCount = nh;
      hbGeo.setDrawRange(0, nh * 2);
      hbGeo.attributes.position.needsUpdate = true;
      hbGeo.attributes.lineDistance.needsUpdate = true;
    }
    draw(0);
    const hist = []; // hydrogen bonds per molecule, sampled every 8 frames
    let frames = 0;
    const com = new V3();
    return {
      group, radius: cfg.layout === 'pair' ? spacing + tpl.rCore + 1.5 : cfg.layout === 'cluster' ? W * 0.72 + tpl.rCore : W + tpl.rCore + 1.2, view: { dir: new V3(0.35, 0.3, 1) },
      fog: 0.4,
      update(dt, t) {
        if (!frozen && dt > 0) {
          acc += speed;
          let guard = 0;
          while (acc >= 1 && guard++ < 40) { step(); acc -= 1; }
        }
        // keep one or two molecules centred as they drift, like the water lab
        if (N <= 2) { com.set(0, 0, 0); mols.forEach((M) => com.add(M.p)); group.position.lerp(com.divideScalar(N).negate(), 0.05); }
        draw(t);
        if (dt > 0 && ++frames % 8 === 0) { hist.push(hbCount / N); if (hist.length > 300) hist.shift(); }
      },
      setTemp(K) { Ttarget = Math.max(5, +K || 298); },
      setSpeed(fs) { speed = +fs || 1; },
      setChargeScale(x) { qs = Math.max(0, Math.min(1, +x)); },
      setFrozen(on) { frozen = !!on; },
      setVisible(kind, on) {
        if (kind in show) { show[kind] = !!on; applyShow(); }
        if (kind === 'charges') sprites.forEach((sp) => (sp.s.visible = on));
        if (kind === 'hbonds') hbLines.visible = on;
      },
      hasElectrons: !!ed, hasLonePairs: !!ld, hasClouds: !!(bondCloud || lpCloud), hasCharges: sprites.length > 0,
      canHBond: tpl.donors.length > 0 && tpl.acceptors.length > 0, dchiMax: tpl.dchiMax,
      history() { return hist; },
      stats() { return { T: Tshown, hb: hbCount, ps: simFs / 1000, N }; },
    };
  };

  S.THREE = T;
})();

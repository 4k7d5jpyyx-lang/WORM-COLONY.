/* =========================
   WORM COLONY — script.js (PASTE-READY v3)
   Fix: colonies are NOT circles (true irregular blobs + limb bulges)
   ✅ Log cap + auto-merge spam
   ✅ Irregular colony shapes + “limbs” that grow with MC
   ✅ Worms move along blobby fields (not orbit rings)
   ✅ Tap select • Drag pan • Pinch zoom • Double-tap recenter
   ✅ New colony every $50k MC (cap 8)
   ✅ Buyers + Volume + MC => nutrients => growth
   ✅ Mutations + shockwaves + segmented worms
   ========================= */

(() => {
  // ---------- DOM ----------
  const canvas = document.getElementById("c");
  if (!canvas) return;
  const ctx = canvas.getContext("2d", { alpha: true });

  const el = (id) => document.getElementById(id);
  const elBuyers = el("buyers");
  const elVol = el("vol");
  const elMcap = el("mcap");
  const elCols = el("cols");
  const elWorms = el("worms");
  const elLog = el("log");

  const btnFeed = el("feedBtn");
  const btnSmall = el("smallFeed");
  const btnBig = el("bigFeed");
  const btnMutate = el("mutateBtn");
  const btnReset = el("resetBtn");

  // ---------- Utils ----------
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b + 1));
  const hypot = Math.hypot;

  function fmtUSD(n) {
    const abs = Math.abs(n);
    if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `$${Math.round(n).toLocaleString()}`;
    return `$${Math.round(n)}`;
  }
  const hsl = (h, s, l, a = 1) => `hsla(${h}, ${s}%, ${l}%, ${a})`;
  const nowStr = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // ---------- Log (cap + merge) ----------
  function logEvent(type, msg) {
    if (!elLog) return;

    const MAX_LOG_ITEMS = 14;
    const MERGE_WINDOW_MS = 2500;
    const now = Date.now();

    const last = elLog.firstElementChild;
    if (last) {
      const lastType = last.getAttribute("data-type");
      const lastMsg = last.getAttribute("data-msg");
      const lastTs = Number(last.getAttribute("data-ts") || 0);

      if ((lastType === type || lastMsg === msg) && (now - lastTs) < MERGE_WINDOW_MS) {
        const countEl = last.querySelector(".count");
        const n = (countEl ? Number(countEl.textContent) : 1) + 1;

        if (countEl) countEl.textContent = String(n);
        else {
          const c = document.createElement("div");
          c.className = "count";
          c.textContent = "2";
          c.style.position = "absolute";
          c.style.right = "12px";
          c.style.top = "10px";
          c.style.padding = "3px 8px";
          c.style.borderRadius = "999px";
          c.style.border = "1px solid rgba(255,255,255,.14)";
          c.style.background = "rgba(255,255,255,.06)";
          c.style.fontSize = "11px";
          c.style.color = "rgba(233,238,247,.78)";
          last.appendChild(c);
          last.style.position = "relative";
        }

        last.setAttribute("data-ts", String(now));
        const t = last.querySelector(".time");
        if (t) t.textContent = nowStr();
        return;
      }
    }

    const wrap = document.createElement("div");
    wrap.setAttribute("data-type", type);
    wrap.setAttribute("data-msg", msg);
    wrap.setAttribute("data-ts", String(now));

    wrap.style.border = "1px solid rgba(255,255,255,.10)";
    wrap.style.background = "rgba(0,0,0,.18)";
    wrap.style.borderRadius = "14px";
    wrap.style.padding = "10px";
    wrap.style.marginBottom = "10px";

    const pill = document.createElement("span");
    pill.textContent =
      type === "mutation" ? "MUTATION" :
      type === "split" ? "SPLIT" :
      type === "milestone" ? "MILESTONE" : "INFO";
    pill.style.display = "inline-block";
    pill.style.padding = "4px 8px";
    pill.style.borderRadius = "999px";
    pill.style.fontSize = "10px";
    pill.style.letterSpacing = ".14em";
    pill.style.textTransform = "uppercase";
    pill.style.marginLeft = "8px";
    pill.style.border = "1px solid rgba(255,255,255,.14)";
    pill.style.background = "rgba(255,255,255,.06)";

    if (type === "mutation") { pill.style.borderColor = "rgba(255,77,255,.28)"; pill.style.background = "rgba(255,77,255,.10)"; }
    if (type === "split")    { pill.style.borderColor = "rgba(109,255,181,.30)"; pill.style.background = "rgba(109,255,181,.10)"; }
    if (type === "milestone"){ pill.style.borderColor = "rgba(100,169,255,.30)"; pill.style.background = "rgba(100,169,255,.10)"; }

    const top = document.createElement("div");
    top.style.fontSize = "11px";
    top.style.letterSpacing = ".08em";
    top.style.color = "rgba(233,238,247,.65)";
    const time = document.createElement("span");
    time.className = "time";
    time.textContent = nowStr();
    top.appendChild(time);
    top.appendChild(pill);

    const body = document.createElement("div");
    body.style.marginTop = "6px";
    body.style.fontSize = "13px";
    body.style.color = "rgba(233,238,247,.88)";
    body.textContent = msg;

    wrap.appendChild(top);
    wrap.appendChild(body);
    elLog.prepend(wrap);

    while (elLog.children.length > MAX_LOG_ITEMS) {
      elLog.removeChild(elLog.lastElementChild);
    }
  }

  // ---------- Camera ----------
  const cam = { x: 0, y: 0, zoom: 1, minZoom: 0.65, maxZoom: 2.4 };

  function screenToWorld(sx, sy) {
    const r = canvas.getBoundingClientRect();
    let x = sx - r.left;
    let y = sy - r.top;

    x -= r.width / 2;
    y -= r.height / 2;

    x /= cam.zoom;
    y /= cam.zoom;

    x += r.width / 2 - cam.x;
    y += r.height / 2 - cam.y;

    return { x, y };
  }

  // ---------- Resize ----------
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  window.addEventListener("resize", resize);

  // ---------- DNA ----------
  const DNA_POOL = [
    { name: "CALM",      chaos: 0.25, speed: 0.75, temper: 0.20 },
    { name: "ORBITAL",   chaos: 0.35, speed: 0.88, temper: 0.35 },
    { name: "GLIDER",    chaos: 0.50, speed: 1.00, temper: 0.45 },
    { name: "AGGRESSIVE",chaos: 0.75, speed: 1.15, temper: 0.85 },
    { name: "CHAOTIC",   chaos: 0.98, speed: 1.00, temper: 0.70 }
  ];
  function pickDNA() {
    const base = DNA_POOL[randi(0, DNA_POOL.length - 1)];
    return {
      name: base.name,
      chaos: clamp(base.chaos + rand(-0.08, 0.08), 0.15, 1.0),
      speed: clamp(base.speed + rand(-0.10, 0.12), 0.55, 1.25),
      temper: clamp(base.temper + rand(-0.10, 0.10), 0.10, 0.95),
      hueA: randi(145, 165),
      hueB: randi(195, 220)
    };
  }

  // ---------- Blob + Limbs (ACTUALLY non-circular) ----------
  // Smooth-ish noise
  function smoothNoise1(x) {
    return Math.sin(x) * 0.6 + Math.sin(x * 0.57 + 1.7) * 0.3 + Math.sin(x * 1.31 + 0.2) * 0.1;
  }

  // circular distance between angles
  function angDist(a, b) {
    let d = Math.abs(((a - b + Math.PI) % TAU) - Math.PI);
    return d;
  }

  // limb schedule: increases at each 50k MC (soft capped)
  function globalLimbCount(mcap) {
    // 0 limbs under 25k; ramps to 6 by ~350k
    const t = clamp((mcap - 50_000) / 300_000, 0, 1);
    return Math.floor(t * 6);
  }
  function globalLimbStrength(mcap) {
    return clamp((mcap - 50_000) / 250_000, 0, 1);
  }

  // colony boundary radius multiplier (big bulges at limb anchors)
  function blobMul(col, ang, t) {
    const s1 = col.blobSeed1, s2 = col.blobSeed2, s3 = col.blobSeed3;

    // base organic warble
    const base =
      smoothNoise1(ang * (2.0 + s1) + t * (0.25 + s2)) * 0.55 +
      smoothNoise1(ang * (3.4 + s2) - t * (0.18 + s3)) * 0.25 +
      smoothNoise1(ang * (5.2 + s3) + t * (0.12 + s1)) * 0.15;

    let mul = 1.0 + base * 0.25;

    // limb bulges
    const L = col.limbCount;
    if (L > 0) {
      const ls = col.limbStrength * (0.35 + 0.65 * col.limbStyle);
      for (let i = 0; i < L; i++) {
        const la = col.limbAngles[i];
        const width = col.limbWidths[i];       // radians
        const height = col.limbHeights[i];     // multiplier amount
        const d = angDist(ang, la);
        const bulge = Math.exp(-(d * d) / (2 * width * width));
        mul += bulge * ls * height; // real protrusions
      }

      // subtle breathing
      mul *= 1.0 + Math.sin(t * (0.6 + col.limbStyle) + s2 * 3.0) * 0.02 * col.limbStrength;
    }

    return clamp(mul, 0.65, 1.55);
  }

  function initLimbs(col) {
    col.limbStyle = rand(0.2, 1.0);
    col.limbCount = 0;
    col.limbStrength = 0;

    col.limbAngles = [];
    col.limbWidths = [];
    col.limbHeights = [];

    const maxL = 6;
    const baseAng = rand(0, TAU);
    for (let i = 0; i < maxL; i++) {
      const a = (baseAng + (i * TAU) / maxL + rand(-0.45, 0.45)) % TAU;
      col.limbAngles.push(a);
      col.limbWidths.push(rand(0.18, 0.40));
      col.limbHeights.push(rand(0.18, 0.45)); // pronounced bulges
    }
  }

  function updateLimbs(col) {
    const g = globalLimbCount(state.mcap);
    const s = globalLimbStrength(state.mcap);

    // colony bias
    const bias = 0.85 + col.blobSeed2 * 0.25;
    col.limbCount = Math.min(6, Math.max(0, Math.floor(g * bias)));
    col.limbStrength = clamp(s * bias, 0, 1.15);
  }

  // ---------- State ----------
  const MAX_COLONIES = 8;
  const SPLIT_STEP_MC = 50_000;
  const START_MC = 25_000;

  const state = {
    buyers: 0,
    volume: 0,
    mcap: START_MC,
    nutrients: 0,
    colonies: [],
    selectedColonyId: 1,
    shockwaves: [],
    t: 0,
    nextSplitAt: SPLIT_STEP_MC,
    lastMutationAt: performance.now()
  };

  // ---------- Colony/Worm builders ----------
  function makeWorm(col, idx) {
    const segCount = randi(28, 44);
    const segLen = rand(6.2, 8.6);
    const baseR = rand(12, 20);
    const hue = Math.random() < 0.5 ? col.dna.hueA : col.dna.hueB;

    const head = { x: col.cx + rand(-30, 30), y: col.cy + rand(-30, 30) };
    const pts = [];
    for (let i = 0; i < segCount; i++) pts.push({ x: head.x, y: head.y });

    return {
      id: `${col.id}-${idx}-${Math.random().toString(16).slice(2, 6)}`,
      pts,
      segLen,
      baseR,
      hue,
      phase: rand(0, 999),
      drift: { x: rand(-1, 1), y: rand(-1, 1) },
      energy: rand(0.35, 0.95),
      age: 0,
      mutations: 0,

      // steer vector makes movement not “orbit-y”
      steer: { x: rand(-1, 1), y: rand(-1, 1) },
      steerT: rand(0.15, 1.0)
    };
  }

  function makeColony(id, cx, cy) {
    const dna = pickDNA();
    const col = {
      id,
      cx,
      cy,
      dna,
      worms: [],
      radius: rand(135, 190),
      badgePulse: 0,
      mutations: 0,

      blobSeed1: rand(0.2, 1.2),
      blobSeed2: rand(0.2, 1.2),
      blobSeed3: rand(0.2, 1.2),
      blobSpin: rand(-0.6, 0.6),

      limbStyle: rand(0.2, 1.0),
      limbCount: 0,
      limbStrength: 0,
      limbAngles: [],
      limbWidths: [],
      limbHeights: []
    };

    initLimbs(col);
    updateLimbs(col);

    const startW = randi(10, 15);
    for (let i = 0; i < startW; i++) col.worms.push(makeWorm(col, i));
    return col;
  }

  const totalWorms = () => state.colonies.reduce((a, c) => a + c.worms.length, 0);

  // ---------- Shockwaves ----------
  function spawnShockwave(x, y, hue = 160) {
    state.shockwaves.push({ x, y, hue, r: 0, a: 0.9, speed: rand(240, 360), width: rand(2.5, 4.2) });
  }

  // ---------- Selecting ----------
  function selectedColony() {
    return state.colonies.find(c => c.id === state.selectedColonyId) || state.colonies[0];
  }

  function pickColonyAt(wx, wy) {
    let best = null, bestD = 1e9;
    for (const col of state.colonies) {
      const d = hypot(wx - col.cx, wy - col.cy);
      const hit = (col.radius * 0.78) + 34 / cam.zoom;
      if (d < hit && d < bestD) { best = col; bestD = d; }
    }
    return best;
  }

  function selectColony(col) {
    if (!col) return;
    state.selectedColonyId = col.id;
    col.badgePulse = 1;
    logEvent("info", `Selected Colony #${col.id} • DNA: ${col.dna.name}`);
    spawnShockwave(col.cx, col.cy, col.dna.hueA);
  }

  // ---------- Colony spawning ----------
  function maybeSpawnColonies() {
    while (state.colonies.length < MAX_COLONIES && state.mcap >= state.nextSplitAt) {
      const id = state.colonies.length + 1;

      const r = canvas.getBoundingClientRect();
      const viewCx = (r.width / 2) - cam.x;
      const viewCy = (r.height / 2) - cam.y;

      const dist = rand(300, 560);
      const ang = rand(0, TAU);
      const cx = viewCx + Math.cos(ang) * dist;
      const cy = viewCy + Math.sin(ang) * dist;

      state.colonies.push(makeColony(id, cx, cy));
      logEvent("split", `Colony #${id} founded at ${fmtUSD(state.nextSplitAt)} MC.`);
      spawnShockwave(cx, cy, randi(150, 220));

      state.nextSplitAt += SPLIT_STEP_MC;
    }
  }

  // ---------- Mutations ----------
  function mutateWorm(w, col) {
    w.mutations += 1;
    col.mutations += 1;

    w.baseR = clamp(w.baseR * rand(0.92, 1.10), 10, 26);
    w.segLen = clamp(w.segLen * rand(0.92, 1.08), 5.8, 9.6);
    w.energy = clamp(w.energy + rand(-0.10, 0.16), 0.25, 1.0);
    w.hue = (w.hue + randi(-24, 28) + 360) % 360;

    w.steer.x = clamp(w.steer.x + rand(-0.9, 0.9), -1.8, 1.8);
    w.steer.y = clamp(w.steer.y + rand(-0.9, 0.9), -1.8, 1.8);
    w.steerT = rand(0.12, 0.75);

    const what = Math.random() < 0.5 ? "Color shift" : (Math.random() < 0.5 ? "Body growth" : "Aggression spike");
    logEvent("mutation", `${what} • Worm ${w.id.split("-").slice(-1)[0]} (Colony #${col.id})`);
    spawnShockwave(col.cx, col.cy, w.hue);
  }

  function randomMutationTick(tNow) {
    const nutrientFactor = clamp(state.nutrients / 1400, 0, 1);
    const p = 0.0012 + nutrientFactor * 0.012;
    if (Math.random() < p && (tNow - state.lastMutationAt) > 850) {
      state.lastMutationAt = tNow;
      const col = state.colonies[randi(0, state.colonies.length - 1)];
      if (!col || col.worms.length === 0) return;
      mutateWorm(col.worms[randi(0, col.worms.length - 1)], col);
    }
  }

  function forceMutation() {
    const col = selectedColony();
    if (!col) return;
    for (let i = 0; i < Math.min(3, col.worms.length); i++) mutateWorm(col.worms[randi(0, col.worms.length - 1)], col);
    state.nutrients += 140;
    updateHUD();
  }

  // ---------- Metrics / Feeding ----------
  function simBuy(mult = 1) {
    const buyersAdd = Math.random() < 0.75 ? 1 : 2;
    const volAdd = rand(220, 980) * mult;
    const mcAdd = rand(700, 2800) * mult;

    state.buyers += buyersAdd;
    state.volume += volAdd;
    state.mcap += mcAdd;

    state.nutrients += (buyersAdd * 30) + (volAdd * 0.032) + (mcAdd * 0.020);

    const col = selectedColony();
    if (col) spawnShockwave(col.cx, col.cy, col.dna.hueA);

    logEvent("info", `Buy • +${buyersAdd} buyers • +${fmtUSD(volAdd)} vol • +${fmtUSD(mcAdd)} MC`);
    updateHUD();
  }

  // ---------- Input ----------
  canvas.style.touchAction = "none";
  let activePointers = new Map();
  let isPanning = false;
  let panStart = { x: 0, y: 0, camX: 0, camY: 0 };
  let pinchStart = null;
  let lastTapTime = 0;

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.size === 2) {
      const pts = Array.from(activePointers.values());
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      pinchStart = { dist: hypot(dx, dy), zoom: cam.zoom };
      isPanning = false;
      return;
    }

    isPanning = true;
    panStart = { x: e.clientX, y: e.clientY, camX: cam.x, camY: cam.y };
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.size === 2 && pinchStart) {
      const pts = Array.from(activePointers.values());
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      const dist = hypot(dx, dy);
      cam.zoom = clamp(pinchStart.zoom * (dist / pinchStart.dist), cam.minZoom, cam.maxZoom);
      return;
    }

    if (isPanning) {
      const dx = (e.clientX - panStart.x) / cam.zoom;
      const dy = (e.clientY - panStart.y) / cam.zoom;
      cam.x = panStart.camX + dx;
      cam.y = panStart.camY + dy;
    }
  });

  canvas.addEventListener("pointerup", (e) => {
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) pinchStart = null;

    const moved = Math.abs(e.clientX - panStart.x) + Math.abs(e.clientY - panStart.y);
    if (moved < 10) {
      const t = performance.now();
      const w = screenToWorld(e.clientX, e.clientY);

      const picked = pickColonyAt(w.x, w.y);
      if (picked) selectColony(picked);

      if (t - lastTapTime < 320) {
        const col = selectedColony();
        if (col) {
          const r = canvas.getBoundingClientRect();
          cam.x = cam.x + ((r.width / 2) - col.cx);
          cam.y = cam.y + ((r.height / 2) - col.cy);
          spawnShockwave(col.cx, col.cy, col.dna.hueB);
          logEvent("info", "Centered on selected colony.");
        }
      }
      lastTapTime = t;
    }
    isPanning = false;
  });

  canvas.addEventListener("pointercancel", () => {
    activePointers.clear();
    pinchStart = null;
    isPanning = false;
  });

  // ---------- Simulation ----------
  function step(dt) {
    state.t += dt;

    // nutrients decay
    const burn = Math.min(state.nutrients, 32 * dt);
    state.nutrients -= burn;

    // drip from metrics
    state.nutrients += (state.buyers * 0.018 + state.volume * 0.000009 + state.mcap * 0.0000045) * dt;

    // spawn colonies
    maybeSpawnColonies();

    // mutations
    randomMutationTick(performance.now());

    // shockwaves
    for (let i = state.shockwaves.length - 1; i >= 0; i--) {
      const s = state.shockwaves[i];
      s.r += s.speed * dt;
      s.a -= 0.60 * dt;
      if (s.a <= 0) state.shockwaves.splice(i, 1);
    }

    // colonies update
    for (const col of state.colonies) {
      updateLimbs(col);

      const targetR = clamp(145 + state.nutrients * 0.020, 125, 240);
      col.radius = lerp(col.radius, targetR, 0.03);

      if (col.badgePulse > 0) col.badgePulse = Math.max(0, col.badgePulse - 1.15 * dt);

      // worms
      for (const w of col.worms) {
        w.age += dt;

        // random steering timer (breaks circular patterns)
        w.steerT -= dt;
        if (w.steerT <= 0) {
          w.steerT = rand(0.12, 1.1) * lerp(1.0, 0.55, col.dna.temper);
          w.steer.x = clamp(lerp(w.steer.x, rand(-1, 1), 0.75), -1.8, 1.8);
          w.steer.y = clamp(lerp(w.steer.y, rand(-1, 1), 0.75), -1.8, 1.8);
        }

        const pts = w.pts;
        const head = pts[0];

        // direction from center (used to find boundary normal)
        const cx = col.cx, cy = col.cy;
        const dx0 = head.x - cx;
        const dy0 = head.y - cy;
        const ang0 = Math.atan2(dy0, dx0);

        // boundary radius at that angle
        const mul = blobMul(col, ang0 + col.blobSpin * state.t * 0.35, state.t);
        const boundary = (col.radius * 0.68) * mul;

        // “boundary point” (normal)
        const bx = cx + Math.cos(ang0) * boundary;
        const by = cy + Math.sin(ang0) * boundary;

        // tangent direction (perpendicular) to slide along blob edge
        const tx = -Math.sin(ang0);
        const ty =  Math.cos(ang0);

        // mix: pull toward boundary + slide tangentially + add steering noise
        const pullToEdge = 0.55;             // strong edge attraction -> non-circular blobs show
        const slide = 0.75 + col.dna.chaos;  // tangential motion
        const steer = 0.55 + col.dna.chaos;

        const toBx = (bx - head.x);
        const toBy = (by - head.y);

        // drift evolves
        w.drift.x = clamp(w.drift.x + rand(-0.22, 0.22) * dt, -2.2, 2.2);
        w.drift.y = clamp(w.drift.y + rand(-0.22, 0.22) * dt, -2.2, 2.2);

        const spd = (46 + w.energy * 58) * col.dna.speed;

        const vx =
          toBx * pullToEdge +
          tx * slide * 70 +
          w.steer.x * steer * 35 +
          w.drift.x * 12;

        const vy =
          toBy * pullToEdge +
          ty * slide * 70 +
          w.steer.y * steer * 35 +
          w.drift.y * 12;

        const vd = Math.max(1e-6, hypot(vx, vy));
        head.x += (vx / vd) * spd * dt;
        head.y += (vy / vd) * spd * dt;

        // keep within a soft “outer” boundary (prevents drifting off screen)
        const ddx = head.x - cx;
        const ddy = head.y - cy;
        const d = hypot(ddx, ddy);
        const outer = col.radius * 1.25;
        if (d > outer) {
          head.x = lerp(head.x, cx + (ddx / d) * outer, 0.10);
          head.y = lerp(head.y, cy + (ddy / d) * outer, 0.10);
        }

        // segments follow
        for (let i = 1; i < pts.length; i++) {
          const p = pts[i];
          const prev = pts[i - 1];
          const ddx2 = p.x - prev.x;
          const ddy2 = p.y - prev.y;
          const dist = Math.max(1e-6, hypot(ddx2, ddy2));
          const want = w.segLen;

          const pull = (dist - want) * 0.58;
          p.x -= (ddx2 / dist) * pull;
          p.y -= (ddy2 / dist) * pull;

          // subtle wobble (not too “sine-y”)
          const wob = (Math.sin(state.t * 2.8 + w.phase + i * 0.33) + Math.sin(state.t * 1.7 + i * 0.21)) * 0.18;
          p.x += (-ddy2 / dist) * wob * w.baseR * 0.06;
          p.y += (ddx2 / dist) * wob * w.baseR * 0.06;
        }
      }

      // worm growth (soft cap)
      const softCap = 20 + Math.floor((state.nutrients / 450));
      const maxW = clamp(softCap, 18, 44);
      if (col.worms.length < maxW && state.nutrients > 220 && Math.random() < 0.010) {
        col.worms.push(makeWorm(col, col.worms.length));
        state.nutrients -= 35;
      }
    }

    updateHUD();
  }

  // ---------- Drawing ----------
  function drawVignette() {
    const r = canvas.getBoundingClientRect();
    const g = ctx.createRadialGradient(r.width * 0.55, r.height * 0.55, 60, r.width * 0.55, r.height * 0.55, Math.max(r.width, r.height));
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, r.width, r.height);
  }

  function drawColonyBlob(col, sel) {
    ctx.beginPath();
    const steps = 84;
    for (let i = 0; i <= steps; i++) {
      const ang = (i / steps) * TAU + col.blobSpin * state.t * 0.35;
      const mul = blobMul(col, ang, state.t * 0.6);
      const rr = (col.radius * 0.68) * mul;
      const x = col.cx + Math.cos(ang) * rr;
      const y = col.cy + Math.sin(ang) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();

    ctx.strokeStyle = hsl(col.dna.hueA, 95, 62, sel ? 0.16 : 0.10);
    ctx.lineWidth = sel ? 2.4 : 1.7;
    ctx.shadowColor = hsl(col.dna.hueA, 95, 62, sel ? 0.18 : 0.10);
    ctx.shadowBlur = sel ? 18 : 12;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // inner glow fill
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    ctx.fill();
  }

  function draw() {
    const r = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);

    ctx.save();
    ctx.translate(r.width / 2, r.height / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-r.width / 2 + cam.x, -r.height / 2 + cam.y);

    for (const col of state.colonies) {
      const sel = col.id === state.selectedColonyId;

      // blob shape (this is the colony boundary)
      drawColonyBlob(col, sel);

      // subtle core ring
      ctx.beginPath();
      ctx.arc(col.cx, col.cy, col.radius * 0.34, 0, TAU);
      ctx.strokeStyle = hsl(col.dna.hueB, 90, 60, sel ? 0.18 : 0.11);
      ctx.lineWidth = sel ? 2.6 : 1.8;
      ctx.stroke();

      // DNA badge
      const badgeW = 190, badgeH = 46;
      const bx = col.cx - badgeW / 2;
      const by = col.cy - col.radius * 0.68 - 64;
      const lift = col.badgePulse > 0 ? (Math.sin(performance.now() / 70) * 2.5 * col.badgePulse) : 0;

      ctx.save();
      ctx.translate(0, lift);
      const rr = 14;

      ctx.beginPath();
      ctx.moveTo(bx + rr, by);
      ctx.arcTo(bx + badgeW, by, bx + badgeW, by + badgeH, rr);
      ctx.arcTo(bx + badgeW, by + badgeH, bx, by + badgeH, rr);
      ctx.arcTo(bx, by + badgeH, bx, by, rr);
      ctx.arcTo(bx, by, bx + badgeW, by, rr);
      ctx.closePath();

      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(bx + 16, by + badgeH / 2, 5, 0, TAU);
      ctx.fillStyle = hsl(col.dna.hueA, 95, 62, 0.95);
      ctx.shadowColor = hsl(col.dna.hueA, 95, 62, 0.45);
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = "rgba(233,238,247,0.90)";
      ctx.font = "600 12px Space Grotesk, system-ui, -apple-system";
      ctx.fillText(`Colony #${col.id}`, bx + 30, by + 18);

      ctx.fillStyle = "rgba(233,238,247,0.68)";
      ctx.font = "500 11px Space Grotesk, system-ui, -apple-system";
      ctx.fillText(`DNA: ${col.dna.name} • Limbs: ${col.limbCount}`, bx + 30, by + 34);

      ctx.restore();

      // worms
      for (const w of col.worms) {
        const pts = w.pts;

        // glow stroke
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.strokeStyle = hsl(w.hue, 95, 62, 0.10);
        ctx.lineWidth = w.baseR * 0.55;
        ctx.shadowColor = hsl(w.hue, 95, 62, 0.22);
        ctx.shadowBlur = 18;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
        ctx.shadowBlur = 0;

        // bead body
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          const t = i / (pts.length - 1);
          const rad = lerp(w.baseR * 0.85, w.baseR * 0.20, t);
          const alpha = lerp(0.90, 0.18, t);

          ctx.beginPath();
          ctx.arc(p.x, p.y, rad, 0, TAU);
          ctx.fillStyle = hsl((w.hue + t * 10) % 360, 95, lerp(60, 52, t), alpha);
          ctx.fill();

          if (i % 5 === 0) {
            ctx.beginPath();
            ctx.arc(p.x - rad * 0.25, p.y - rad * 0.25, rad * 0.28, 0, TAU);
            ctx.fillStyle = "rgba(255,255,255,0.12)";
            ctx.fill();
          }
        }

        // head glow
        const head = pts[0];
        ctx.beginPath();
        ctx.arc(head.x, head.y, w.baseR * 0.45, 0, TAU);
        ctx.fillStyle = "rgba(255,255,255,0.16)";
        ctx.shadowColor = hsl(w.hue, 95, 62, 0.40);
        ctx.shadowBlur = 16;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // shockwaves
    for (const s of state.shockwaves) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.strokeStyle = hsl(s.hue, 95, 62, s.a);
      ctx.lineWidth = s.width;
      ctx.shadowColor = hsl(s.hue, 95, 62, s.a * 0.55);
      ctx.shadowBlur = 18;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    ctx.restore();
    drawVignette();
  }

  // ---------- HUD ----------
  function updateHUD() {
    if (elBuyers) elBuyers.textContent = String(state.buyers);
    if (elVol) elVol.textContent = fmtUSD(state.volume);
    if (elMcap) elMcap.textContent = fmtUSD(state.mcap);
    if (elCols) elCols.textContent = String(state.colonies.length);
    if (elWorms) elWorms.textContent = String(totalWorms());
  }

  // ---------- Controls ----------
  if (btnFeed) btnFeed.addEventListener("click", () => simBuy(1));
  if (btnSmall) btnSmall.addEventListener("click", () => simBuy(0.6));
  if (btnBig) btnBig.addEventListener("click", () => simBuy(1.75));
  if (btnMutate) btnMutate.addEventListener("click", forceMutation);
  if (btnReset) btnReset.addEventListener("click", () => init(true));

  // ---------- Init ----------
  function init(clear = false) {
    resize();

    state.buyers = 0;
    state.volume = 0;
    state.mcap = START_MC;
    state.nutrients = 0;
    state.t = 0;

    state.shockwaves = [];
    state.colonies = [];
    state.selectedColonyId = 1;
    state.nextSplitAt = SPLIT_STEP_MC;
    state.lastMutationAt = performance.now();

    const r = canvas.getBoundingClientRect();
    state.colonies.push(makeColony(1, r.width / 2, r.height / 2));

    cam.x = 0; cam.y = 0; cam.zoom = 1;

    if (clear && elLog) elLog.innerHTML = "";
    logEvent("info", "Ready • Tap colonies • Drag pan • Pinch zoom • Double-tap center.");
    logEvent("info", "Blobs grow limbs as MC rises (real protrusions).");
    updateHUD();

    setTimeout(() => selectColony(state.colonies[0]), 50);
  }

  // ---------- Loop ----------
  let last = performance.now();
  function loop(t) {
    const dt = Math.min(0.033, (t - last) / 1000);
    last = t;
    step(dt);
    draw();
    requestAnimationFrame(loop);
  }

  init(false);
  requestAnimationFrame(loop);
})();

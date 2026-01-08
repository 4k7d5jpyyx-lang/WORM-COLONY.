/* =========================
   WORM COLONY — script.js (PASTE-READY, UPDATED)
   ✅ Log: capped + auto-merge spam
   ✅ Colonies: irregular blob shapes (not circles)
   ✅ Grow “limbs”: blob gains protrusions as MC rises (and per-colony age)
   ✅ iPhone: tap-select, drag pan, pinch zoom, double-tap recenter
   ✅ Buyers + Volume + MC => nutrients => growth + worms
   ✅ Mutation events + shockwaves + DNA badges
   ✅ Colonies spawn every $50k MC (cap 8)
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

  // ---------- Utilities ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b + 1));
  const TAU = Math.PI * 2;

  function fmtUSD(n) {
    const abs = Math.abs(n);
    if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `$${Math.round(n).toLocaleString()}`;
    return `$${Math.round(n)}`;
  }
  function hsl(h, s, l, a = 1) {
    return `hsla(${h}, ${s}%, ${l}%, ${a})`;
  }
  function nowStr() {
    const d = new Date();
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  // ---------- Log: capped + auto-merge spam ----------
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

    // styling inline so it works with any CSS
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

  function clearLog() {
    if (elLog) elLog.innerHTML = "";
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

  const ro = new ResizeObserver(() => resize());
  ro.observe(canvas);
  window.addEventListener("resize", resize);

  // ---------- DNA ----------
  const DNA_POOL = [
    { name: "CALM",      chaos: 0.25, speed: 0.70, curl: 0.55, temper: 0.20 },
    { name: "ORBITAL",   chaos: 0.30, speed: 0.82, curl: 1.10, temper: 0.35 },
    { name: "GLIDER",    chaos: 0.45, speed: 1.00, curl: 0.30, temper: 0.40 },
    { name: "AGGRESSIVE",chaos: 0.70, speed: 1.15, curl: 0.85, temper: 0.85 },
    { name: "CHAOTIC",   chaos: 0.95, speed: 0.98, curl: 0.35, temper: 0.70 }
  ];

  function pickDNA() {
    const base = DNA_POOL[randi(0, DNA_POOL.length - 1)];
    return {
      name: base.name,
      chaos: clamp(base.chaos + rand(-0.08, 0.08), 0.15, 1.0),
      speed: clamp(base.speed + rand(-0.10, 0.12), 0.55, 1.25),
      curl:  clamp(base.curl  + rand(-0.18, 0.18), 0.20, 1.35),
      temper:clamp(base.temper+ rand(-0.10, 0.10), 0.10, 0.95),
      hueA: randi(145, 165),
      hueB: randi(195, 220)
    };
  }

  // ---------- Irregular blob + limb math ----------
  function smoothNoise1(x) {
    // cheap smooth noise blend
    return Math.sin(x) * 0.6 + Math.sin(x * 0.57 + 1.7) * 0.3 + Math.sin(x * 1.31 + 0.2) * 0.1;
  }

  // limbCount grows with MC; 0..6
  function globalLimbCount(mcap) {
    // 0 limbs until 25k; ramp up after 50k, saturate ~350k
    const t = clamp((mcap - 50_000) / 300_000, 0, 1);
    return Math.floor(t * 6);
  }

  function limbStrength(mcap) {
    // strength 0..1
    return clamp((mcap - 50_000) / 250_000, 0, 1);
  }

  // returns multiplier (0.70..1.35) depending on angle and time
  function colonyBlob(col, ang, t, mcap) {
    const s1 = col.blobSeed1, s2 = col.blobSeed2, s3 = col.blobSeed3;

    // base blobby outline
    const n =
      smoothNoise1(ang * (2.0 + s1) + t * (0.25 + s2)) * 0.60 +
      smoothNoise1(ang * (3.4 + s2) - t * (0.18 + s3)) * 0.28 +
      smoothNoise1(ang * (5.2 + s3) + t * (0.12 + s1)) * 0.18;

    let mul = 1.0 + n * 0.22;

    // limb features: add protrusions that “grow”
    const L = col.limbCount;
    if (L > 0) {
      const ls = col.limbStrength * (0.35 + 0.65 * col.limbStyle); // 0..~1
      // limb waveform: sum of “bulges” around limb angles
      for (let i = 0; i < L; i++) {
        const la = col.limbAngles[i];
        const width = col.limbWidths[i];
        // circular distance between angles
        let d = Math.abs(((ang - la + Math.PI) % (TAU)) - Math.PI);
        // bulge curve (Gaussian-ish)
        const bulge = Math.exp(-(d * d) / (2 * width * width));
        mul += bulge * ls * col.limbHeights[i];
      }

      // animate limb growth / breathing
      mul *= 1.0 + Math.sin(t * (0.6 + col.limbStyle) + s2 * 3.0) * 0.015 * col.limbStrength;
    }

    return clamp(mul, 0.70, 1.38);
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

  // ---------- Builders ----------
  function makeWorm(col, idx) {
    const segCount = randi(26, 40);
    const segLen = rand(6.0, 8.2);
    const baseR = rand(12, 20);
    const wob = rand(0.8, 1.35);
    const hue = Math.random() < 0.5 ? col.dna.hueA : col.dna.hueB;

    const ang = rand(0, TAU);
    const rad = rand(12, col.radius * 0.50);
    const headX = col.cx + Math.cos(ang) * rad;
    const headY = col.cy + Math.sin(ang) * rad;

    const pts = [];
    for (let i = 0; i < segCount; i++) pts.push({ x: headX, y: headY });

    return {
      id: `${col.id}-${idx}-${Math.random().toString(16).slice(2, 6)}`,
      colId: col.id,
      pts,
      segLen,
      baseR,
      wob,
      hue,
      phase: rand(0, 999),
      drift: { x: rand(-1, 1), y: rand(-1, 1) },
      energy: rand(0.35, 0.95),
      age: 0,
      mutations: 0,
      aim: { x: rand(-1, 1), y: rand(-1, 1) },
      aimTimer: rand(0.2, 1.2)
    };
  }

  function initLimbs(col) {
    // set limb anchors around the colony
    col.limbCount = 0;
    col.limbStrength = 0;
    col.limbStyle = rand(0.2, 1.0);

    col.limbAngles = [];
    col.limbWidths = [];
    col.limbHeights = [];

    // we pre-generate a pool of limb slots (up to 6)
    const maxL = 6;
    const baseAng = rand(0, TAU);
    for (let i = 0; i < maxL; i++) {
      // spaced-ish but not perfectly
      const jitter = rand(-0.35, 0.35);
      const a = (baseAng + (i * TAU) / maxL + jitter) % TAU;
      col.limbAngles.push(a);
      col.limbWidths.push(rand(0.22, 0.42));  // how wide the limb bulge is
      col.limbHeights.push(rand(0.12, 0.34)); // how tall the bulge is
    }
  }

  function updateLimbs(col) {
    // global limbs from MC, plus slight per-colony differences
    const g = globalLimbCount(state.mcap);
    const s = limbStrength(state.mcap);

    // colony-specific modifier
    const bias = 0.85 + col.blobSeed2 * 0.25; // 0.85..1.15
    col.limbCount = Math.min(6, Math.max(0, Math.floor(g * bias)));
    col.limbStrength = clamp(s * bias, 0, 1.1);
  }

  function makeColony(id, cx, cy) {
    const dna = pickDNA();
    const col = {
      id,
      cx,
      cy,
      dna,
      worms: [],
      radius: rand(125, 175),
      badgePulse: 0,
      mutations: 0,
      createdAt: performance.now(),

      blobSeed1: rand(0.2, 1.2),
      blobSeed2: rand(0.2, 1.2),
      blobSeed3: rand(0.2, 1.2),
      blobSpin: rand(-0.5, 0.5),

      limbCount: 0,
      limbStrength: 0,
      limbStyle: rand(0.2, 1.0),
      limbAngles: [],
      limbWidths: [],
      limbHeights: []
    };

    initLimbs(col);
    updateLimbs(col);

    const startWorms = randi(10, 15);
    for (let i = 0; i < startWorms; i++) col.worms.push(makeWorm(col, i));
    return col;
  }

  function totalWorms() {
    let n = 0;
    for (const c of state.colonies) n += c.worms.length;
    return n;
  }

  // ---------- Shockwaves ----------
  function spawnShockwave(x, y, hue = 160) {
    state.shockwaves.push({
      x, y, hue,
      r: 0,
      a: 0.9,
      speed: rand(240, 360),
      width: rand(2.5, 4.2)
    });
  }

  // ---------- Pick/Select ----------
  function selectedColony() {
    return state.colonies.find(c => c.id === state.selectedColonyId) || state.colonies[0];
  }

  function pickColonyAt(wx, wy) {
    let best = null;
    let bestD = 1e9;
    for (const col of state.colonies) {
      const dx = wx - col.cx;
      const dy = wy - col.cy;
      const d = Math.hypot(dx, dy);
      const hit = (col.radius * 0.55) + 34 / cam.zoom;
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

      const dist = rand(260, 460);
      const ang = rand(0, TAU);

      const cx = viewCx + Math.cos(ang) * dist;
      const cy = viewCy + Math.sin(ang) * dist;

      const col = makeColony(id, cx, cy);
      state.colonies.push(col);

      logEvent("split", `Colony #${id} founded at ${fmtUSD(state.nextSplitAt)} MC.`);
      spawnShockwave(cx, cy, randi(150, 220));

      state.nextSplitAt += SPLIT_STEP_MC;
    }
  }

  // ---------- Mutations ----------
  function mutateWorm(w, col) {
    w.mutations += 1;
    col.mutations += 1;

    w.baseR = clamp(w.baseR * rand(0.92, 1.08), 10, 26);
    w.segLen = clamp(w.segLen * rand(0.92, 1.08), 5.6, 9.6);
    w.energy = clamp(w.energy + rand(-0.10, 0.16), 0.25, 1.0);
    w.wob = clamp(w.wob + rand(-0.12, 0.18), 0.7, 1.6);
    w.hue = (w.hue + randi(-18, 22) + 360) % 360;

    w.aim.x = clamp(w.aim.x + rand(-0.8, 0.8), -1.5, 1.5);
    w.aim.y = clamp(w.aim.y + rand(-0.8, 0.8), -1.5, 1.5);

    const what =
      Math.random() < 0.34 ? "Color shift" :
      Math.random() < 0.5 ? "Body growth" : "Aggression spike";

    logEvent("mutation", `${what} • Worm ${w.id.split("-").slice(-1)[0]} (Colony #${col.id})`);
    spawnShockwave(col.cx, col.cy, w.hue);
  }

  function randomMutationTick(tNow) {
    const nutrientFactor = clamp(state.nutrients / 1400, 0, 1);
    const baseChance = 0.0015 + nutrientFactor * 0.0105;
    if (Math.random() < baseChance && (tNow - state.lastMutationAt) > 850) {
      state.lastMutationAt = tNow;
      const col = state.colonies[randi(0, state.colonies.length - 1)];
      if (!col || col.worms.length === 0) return;
      const w = col.worms[randi(0, col.worms.length - 1)];
      mutateWorm(w, col);
    }
  }

  function forceMutation() {
    const col = selectedColony();
    if (!col) return;
    const count = Math.min(3, col.worms.length);
    for (let i = 0; i < count; i++) {
      const w = col.worms[randi(0, col.worms.length - 1)];
      mutateWorm(w, col);
    }
    state.nutrients += 140;
    updateHUD();
  }

  // ---------- Feeding / Metrics ----------
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
      pinchStart = { dist: Math.hypot(dx, dy), zoom: cam.zoom };
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
      const dist = Math.hypot(dx, dy);
      const next = pinchStart.zoom * (dist / pinchStart.dist);
      cam.zoom = clamp(next, cam.minZoom, cam.maxZoom);
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

  // ---------- Simulation step ----------
  function step(dt) {
    state.t += dt;

    // slow nutrient decay
    const burn = Math.min(state.nutrients, 32 * dt);
    state.nutrients -= burn;

    // continuous drip from metrics
    state.nutrients += (state.buyers * 0.018 + state.volume * 0.000009 + state.mcap * 0.0000045) * dt;

    // update limbs (grow with MC)
    for (const col of state.colonies) updateLimbs(col);

    // spawn colonies at thresholds
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

    // worms + colony breathing
    for (const col of state.colonies) {
      const dna = col.dna;

      const targetR = clamp(140 + state.nutrients * 0.020, 120, 225);
      col.radius = lerp(col.radius, targetR, 0.03);

      if (col.badgePulse > 0) col.badgePulse = Math.max(0, col.badgePulse - 1.15 * dt);

      for (const w of col.worms) {
        w.age += dt;

        // update aim to create sporadic movement
        w.aimTimer -= dt;
        if (w.aimTimer <= 0) {
          w.aimTimer = rand(0.15, 1.25) * lerp(1.0, 0.6, dna.temper);
          const bias = rand(-1, 1);
          w.aim.x = clamp(lerp(w.aim.x, rand(-1, 1) + bias * 0.3, 0.7), -1.5, 1.5);
          w.aim.y = clamp(lerp(w.aim.y, rand(-1, 1) - bias * 0.3, 0.7), -1.5, 1.5);
        }

        const pts = w.pts;
        const head = pts[0];

        // irregular boundary angle
        const a = (state.t * 0.85 + w.phase) * dna.speed;
        const ang = a * dna.curl + col.blobSpin * state.t;

        // blob multiplier (+ limbs)
        const mul = colonyBlob(col, ang, state.t, state.mcap);

        // target on blob boundary
        const boundaryR = (col.radius * 0.55) * mul;
        const blobX = Math.cos(ang) * boundaryR;
        const blobY = Math.sin(ang) * boundaryR;

        const chaos = dna.chaos;
        const jitterX = (Math.sin(a * 2.7 + w.phase) + Math.sin(a * 1.3)) * 10 * chaos;
        const jitterY = (Math.cos(a * 2.2 + w.phase) + Math.cos(a * 1.1)) * 10 * chaos;

        // drift evolves slowly
        w.drift.x = clamp(w.drift.x + rand(-0.26, 0.26) * dt * (0.6 + chaos), -2.2, 2.2);
        w.drift.y = clamp(w.drift.y + rand(-0.26, 0.26) * dt * (0.6 + chaos), -2.2, 2.2);

        // darting
        const dartChance = dna.temper * 0.010 * (1 + chaos);
        const dart = (Math.random() < dartChance * dt) ? rand(18, 52) : 0;

        const tx = col.cx + blobX + jitterX + w.drift.x * 26 + w.aim.x * 22 + rand(-dart, dart);
        const ty = col.cy + blobY + jitterY + w.drift.y * 26 + w.aim.y * 22 + rand(-dart, dart);

        const speed = (40 + w.energy * 58) * dna.speed;
        const vx = (tx - head.x);
        const vy = (ty - head.y);
        const vd = Math.max(1e-6, Math.hypot(vx, vy));
        head.x += (vx / vd) * speed * dt;
        head.y += (vy / vd) * speed * dt;

        // leash to blob-ish boundary (soft pull toward center when too far)
        const ddx = head.x - col.cx;
        const ddy = head.y - col.cy;
        const d = Math.hypot(ddx, ddy);
        const leash = (col.radius * 0.86) * mul;
        if (d > leash) {
          head.x = lerp(head.x, col.cx + (ddx / d) * leash, 0.07);
          head.y = lerp(head.y, col.cy + (ddy / d) * leash, 0.07);
        }

        // segments
        for (let i = 1; i < pts.length; i++) {
          const p = pts[i];
          const prev = pts[i - 1];
          const dx = p.x - prev.x;
          const dy = p.y - prev.y;
          const dist = Math.max(1e-6, Math.hypot(dx, dy));
          const want = w.segLen;

          const pull = (dist - want) * 0.55;
          p.x -= (dx / dist) * pull;
          p.y -= (dy / dist) * pull;

          const wob = Math.sin(state.t * 3.4 + w.phase + i * 0.25) * w.wob * 0.35;
          p.x += (-dy / dist) * wob;
          p.y += (dx / dist) * wob;
        }
      }

      // add worms slowly when nutrients are high
      const softCap = 20 + Math.floor((state.nutrients / 450));
      const maxW = clamp(softCap, 18, 42);
      if (col.worms.length < maxW && state.nutrients > 220 && Math.random() < 0.010) {
        col.worms.push(makeWorm(col, col.worms.length));
        state.nutrients -= 35;
      }
    }

    updateHUD();
  }

  // ---------- Draw helpers ----------
  function drawVignette() {
    const r = canvas.getBoundingClientRect();
    const g = ctx.createRadialGradient(
      r.width * 0.55, r.height * 0.55, 60,
      r.width * 0.55, r.height * 0.55, Math.max(r.width, r.height)
    );
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, r.width, r.height);
  }

  // ---------- Draw ----------
  function draw() {
    const r = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);

    ctx.save();
    ctx.translate(r.width / 2, r.height / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-r.width / 2 + cam.x, -r.height / 2 + cam.y);

    for (const col of state.colonies) {
      const sel = col.id === state.selectedColonyId;

      // MAIN RING (still exists as a “core”)
      ctx.beginPath();
      ctx.arc(col.cx, col.cy, col.radius * 0.50, 0, TAU);
      ctx.strokeStyle = hsl(col.dna.hueB, 90, 60, sel ? 0.20 : 0.12);
      ctx.lineWidth = sel ? 3.2 : 2.1;
      ctx.shadowColor = hsl(col.dna.hueB, 90, 60, sel ? 0.14 : 0.08);
      ctx.shadowBlur = sel ? 18 : 10;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // IRREGULAR BLOB OUTLINE (shows weird shape + limbs)
      ctx.beginPath();
      const steps = 72;
      for (let i = 0; i <= steps; i++) {
        const ang = (i / steps) * TAU + col.blobSpin * state.t * 0.35;
        const mul = colonyBlob(col, ang, state.t * 0.6, state.mcap);
        const rr = (col.radius * 0.55) * mul;
        const x = col.cx + Math.cos(ang) * rr;
        const y = col.cy + Math.sin(ang) * rr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = hsl(col.dna.hueA, 95, 62, sel ? 0.14 : 0.08);
      ctx.lineWidth = sel ? 2.2 : 1.6;
      ctx.shadowColor = hsl(col.dna.hueA, 95, 62, sel ? 0.18 : 0.10);
      ctx.shadowBlur = sel ? 18 : 12;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // DNA badge
      const badgeW = 170;
      const badgeH = 44;
      const bx = col.cx - badgeW / 2;
      const by = col.cy - col.radius * 0.55 - 58;

      const pulse = col.badgePulse;
      const lift = pulse > 0 ? (Math.sin(performance.now() / 70) * 2.5 * pulse) : 0;

      ctx.save();
      ctx.translate(0, lift);

      ctx.beginPath();
      const rr = 14;
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

      ctx.fillStyle = "rgba(233,238,247,0.88)";
      ctx.font = "600 12px Space Grotesk, system-ui, -apple-system";
      ctx.fillText(`Colony #${col.id}`, bx + 30, by + 17);

      ctx.fillStyle = "rgba(233,238,247,0.70)";
      ctx.font = "500 11px Space Grotesk, system-ui, -apple-system";
      ctx.fillText(`DNA: ${col.dna.name} • Limbs: ${col.limbCount}`, bx + 30, by + 33);

      ctx.restore();

      // worms
      for (const w of col.worms) {
        const pts = w.pts;

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
  function init(isReset = false) {
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
    const cx = r.width / 2;
    const cy = r.height / 2;
    state.colonies.push(makeColony(1, cx, cy));

    cam.x = 0;
    cam.y = 0;
    cam.zoom = 1;

    if (isReset) clearLog();
    logEvent("info", "Ready • Tap colonies, drag to pan, pinch to zoom.");
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

  // boot
  init(false);
  requestAnimationFrame(loop);
})();

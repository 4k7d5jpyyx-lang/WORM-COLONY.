/* =========================
   WORM COLONY — script.js (PASTE-READY)
   iPhone-friendly interactions + clean sim

   ✅ Tap colony to select (works on iOS)
   ✅ Drag to pan, pinch to zoom, double-tap to recenter
   ✅ New colony at $50k MC increments (cap 8)
   ✅ Buyers + Volume + MC drive nutrients/growth
   ✅ Mutation events + mutation log + shockwaves
   ✅ Worms are detailed (segmented “beads”), motion is sporadic (not perfect circles)
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

  // ---------- Logging (works even if your CSS is different) ----------
  function logEvent(type, msg) {
    if (!elLog) return;
    const wrap = document.createElement("div");
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
    top.textContent = nowStr();
    top.appendChild(pill);

    const body = document.createElement("div");
    body.style.marginTop = "6px";
    body.style.fontSize = "13px";
    body.style.color = "rgba(233,238,247,.88)";
    body.textContent = msg;

    wrap.appendChild(top);
    wrap.appendChild(body);
    elLog.prepend(wrap);

    // limit
    while (elLog.children.length > 70) elLog.removeChild(elLog.lastChild);
  }

  function clearLog() {
    if (elLog) elLog.innerHTML = "";
  }

  // ---------- Camera (pan/zoom) ----------
  const cam = {
    x: 0,
    y: 0,
    zoom: 1,
    minZoom: 0.65,
    maxZoom: 2.4
  };

  function screenToWorld(sx, sy) {
    const r = canvas.getBoundingClientRect();

    // screen -> canvas local
    let x = sx - r.left;
    let y = sy - r.top;

    // invert draw transform:
    x -= r.width / 2;
    y -= r.height / 2;

    x /= cam.zoom;
    y /= cam.zoom;

    x += r.width / 2 - cam.x;
    y += r.height / 2 - cam.y;

    return { x, y };
  }

  function worldToScreen(wx, wy) {
    const r = canvas.getBoundingClientRect();
    let x = wx + cam.x;
    let y = wy + cam.y;

    x -= r.width / 2;
    y -= r.height / 2;

    x *= cam.zoom;
    y *= cam.zoom;

    x += r.width / 2;
    y += r.height / 2;
    return { x, y };
  }

  // ---------- Resize (iOS-safe DPR) ----------
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    // draw in CSS pixels
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---------- DNA ----------
  const DNA_POOL = [
    { name: "CALM",      chaos: 0.25, speed: 0.70, curl: 0.55, temper: 0.20 },
    { name: "ORBITAL",   chaos: 0.30, speed: 0.80, curl: 1.10, temper: 0.35 },
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
      hueA: randi(145, 165), // neon green
      hueB: randi(195, 220)  // neon blue
    };
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

  // ---------- Colony & Worm builders ----------
  function makeWorm(col, idx) {
    const segCount = randi(26, 40);       // detail segments
    const segLen = rand(6.0, 8.2);        // spacing
    const baseR = rand(12, 20);           // “not too big/small”
    const wob = rand(0.8, 1.35);
    const hue = Math.random() < 0.5 ? col.dna.hueA : col.dna.hueB;

    // place near colony center
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
      // sporadic “intent” vector
      aim: { x: rand(-1, 1), y: rand(-1, 1) },
      aimTimer: rand(0.2, 1.2)
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
      radius: rand(125, 175),
      badgePulse: 0,
      mutations: 0,
      createdAt: performance.now()
    };

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

  // ---------- Picking / Selecting ----------
  function pickColonyAt(wx, wy) {
    let best = null;
    let bestD = 1e9;

    for (const col of state.colonies) {
      const dx = wx - col.cx;
      const dy = wy - col.cy;
      const d = Math.hypot(dx, dy);

      // easier hitbox on mobile; scales a bit with zoom
      const hit = (col.radius * 0.55) + 34 / cam.zoom;
      if (d < hit && d < bestD) {
        best = col;
        bestD = d;
      }
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

  function selectedColony() {
    return state.colonies.find(c => c.id === state.selectedColonyId) || state.colonies[0];
  }

  // ---------- Colony spawning (every 50k MC) ----------
  function maybeSpawnColonies() {
    while (state.colonies.length < MAX_COLONIES && state.mcap >= state.nextSplitAt) {
      const id = state.colonies.length + 1;

      // place around current view center (world)
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

    // small physical changes
    w.baseR = clamp(w.baseR * rand(0.92, 1.08), 10, 26);
    w.segLen = clamp(w.segLen * rand(0.92, 1.08), 5.6, 9.6);
    w.energy = clamp(w.energy + rand(-0.10, 0.16), 0.25, 1.0);
    w.wob = clamp(w.wob + rand(-0.12, 0.18), 0.7, 1.6);

    // neon hue shift
    w.hue = (w.hue + randi(-18, 22) + 360) % 360;

    // personality spike (more sporadic)
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
    const baseChance = 0.0015 + nutrientFactor * 0.0105; // per-frame-ish chance
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

  // ---------- Feeding / Growth ----------
  function simBuy(mult = 1) {
    const buyersAdd = Math.random() < 0.75 ? 1 : 2;
    const volAdd = rand(220, 980) * mult;
    const mcAdd = rand(700, 2800) * mult;

    state.buyers += buyersAdd;
    state.volume += volAdd;
    state.mcap += mcAdd;

    // nutrients conversion
    state.nutrients += (buyersAdd * 30) + (volAdd * 0.032) + (mcAdd * 0.020);

    const col = selectedColony();
    if (col) spawnShockwave(col.cx, col.cy, col.dna.hueA);

    logEvent("info", `Buy • +${buyersAdd} buyers • +${fmtUSD(volAdd)} vol • +${fmtUSD(mcAdd)} MC`);
    updateHUD();
  }

  // ---------- Input (Pointer Events for iOS) ----------
  canvas.style.touchAction = "none";

  let activePointers = new Map();
  let isPanning = false;
  let panStart = { x: 0, y: 0, camX: 0, camY: 0 };
  let pinchStart = null;
  let lastTapTime = 0;

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // two-finger pinch start
    if (activePointers.size === 2) {
      const pts = Array.from(activePointers.values());
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      pinchStart = { dist: Math.hypot(dx, dy), zoom: cam.zoom };
      isPanning = false;
      return;
    }

    // single finger: pan start
    isPanning = true;
    panStart = { x: e.clientX, y: e.clientY, camX: cam.x, camY: cam.y };
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // pinch zoom
    if (activePointers.size === 2 && pinchStart) {
      const pts = Array.from(activePointers.values());
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      const dist = Math.hypot(dx, dy);
      const next = pinchStart.zoom * (dist / pinchStart.dist);
      cam.zoom = clamp(next, cam.minZoom, cam.maxZoom);
      return;
    }

    // pan
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

    // tap detection
    const moved = Math.abs(e.clientX - panStart.x) + Math.abs(e.clientY - panStart.y);
    if (moved < 10) {
      const t = performance.now();
      const w = screenToWorld(e.clientX, e.clientY);

      const picked = pickColonyAt(w.x, w.y);
      if (picked) selectColony(picked);

      // double tap recenter on selected
      if (t - lastTapTime < 320) {
        const col = selectedColony();
        if (col) {
          const r = canvas.getBoundingClientRect();
          cam.x = cam.x + ((r.width / 2) - col.cx);
          cam.y = cam.y + ((r.height / 2) - col.cy);
          spawnShockwave(col.cx, col.cy, col.dna.hueB);
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

    // nutrients decay slowly
    const burn = Math.min(state.nutrients, 32 * dt);
    state.nutrients -= burn;

    // continuous drip from metrics (buyers/volume/mcap)
    state.nutrients += (state.buyers * 0.018 + state.volume * 0.000009 + state.mcap * 0.0000045) * dt;

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

      // colony “breathes” based on nutrients
      const targetR = clamp(140 + state.nutrients * 0.020, 120, 215);
      col.radius = lerp(col.radius, targetR, 0.03);

      if (col.badgePulse > 0) col.badgePulse = Math.max(0, col.badgePulse - 1.15 * dt);

      for (const w of col.worms) {
        w.age += dt;

        // update “aim” occasionally to make movement sporadic
        w.aimTimer -= dt;
        if (w.aimTimer <= 0) {
          w.aimTimer = rand(0.15, 1.25) * lerp(1.0, 0.6, dna.temper);
          // steer aim toward a random direction + small bias to orbit
          const bias = rand(-1, 1);
          w.aim.x = clamp(lerp(w.aim.x, rand(-1, 1) + bias * 0.3, 0.7), -1.5, 1.5);
          w.aim.y = clamp(lerp(w.aim.y, rand(-1, 1) - bias * 0.3, 0.7), -1.5, 1.5);
        }

        const pts = w.pts;
        const head = pts[0];

        // “orbit-ish” base + chaotic jitter + drift + aim
        const a = (state.t * 0.85 + w.phase) * dna.speed;
        const curl = dna.curl;

        const orbitX = Math.cos(a * curl) * (col.radius * 0.20);
        const orbitY = Math.sin(a * (curl * 0.92)) * (col.radius * 0.18);

        const chaos = dna.chaos;
        const jitterX = (Math.sin(a * 2.7 + w.phase) + Math.sin(a * 1.3)) * 10 * chaos;
        const jitterY = (Math.cos(a * 2.2 + w.phase) + Math.cos(a * 1.1)) * 10 * chaos;

        // drift evolves slowly
        w.drift.x = clamp(w.drift.x + rand(-0.26, 0.26) * dt * (0.6 + chaos), -2.2, 2.2);
        w.drift.y = clamp(w.drift.y + rand(-0.26, 0.26) * dt * (0.6 + chaos), -2.2, 2.2);

        // occasional “dart” when temper is high
        const dartChance = dna.temper * 0.010 * (1 + chaos);
        const dart = (Math.random() < dartChance * dt) ? rand(18, 52) : 0;

        // target point
        const tx = col.cx + orbitX + jitterX + w.drift.x * 26 + w.aim.x * 22 + rand(-dart, dart);
        const ty = col.cy + orbitY + jitterY + w.drift.y * 26 + w.aim.y * 22 + rand(-dart, dart);

        // move head
        const speed = (40 + w.energy * 58) * dna.speed;
        const vx = (tx - head.x);
        const vy = (ty - head.y);
        const vd = Math.max(1e-6, Math.hypot(vx, vy));
        head.x += (vx / vd) * speed * dt;
        head.y += (vy / vd) * speed * dt;

        // soft leash to colony
        const ddx = head.x - col.cx;
        const ddy = head.y - col.cy;
        const d = Math.hypot(ddx, ddy);
        const leash = col.radius * 0.86;
        if (d > leash) {
          head.x = lerp(head.x, col.cx + (ddx / d) * leash, 0.07);
          head.y = lerp(head.y, col.cy + (ddy / d) * leash, 0.07);
        }

        // follow-the-leader segments
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

          // subtle wobble along chain
          const wob = Math.sin(state.t * 3.4 + w.phase + i * 0.25) * w.wob * 0.35;
          p.x += (-dy / dist) * wob;
          p.y += (dx / dist) * wob;
        }
      }

      // growth: if nutrients are high, add worms slowly (capped)
      const softCap = 20 + Math.floor((state.nutrients / 450));
      const maxW = clamp(softCap, 18, 42);
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
    const g = ctx.createRadialGradient(
      r.width * 0.55, r.height * 0.55, 60,
      r.width * 0.55, r.height * 0.55, Math.max(r.width, r.height)
    );
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, r.width, r.height);
  }

  function drawDNABadge(col) {
    const r = canvas.getBoundingClientRect();
    const pos = worldToScreen(col.cx, col.cy);

    // draw badges in WORLD space (so they pan/zoom correctly)
    // -> we will draw them while camera transform is active, so use world coords.
    // We'll do it inside draw() in world-space.
    // (kept as a stub; drawn inline in draw())
  }

  function draw() {
    const r = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);

    // camera transform (world -> screen)
    ctx.save();
    ctx.translate(r.width / 2, r.height / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-r.width / 2 + cam.x, -r.height / 2 + cam.y);

    for (const col of state.colonies) {
      const sel = col.id === state.selectedColonyId;

      // colony ring
      ctx.beginPath();
      ctx.arc(col.cx, col.cy, col.radius * 0.55, 0, TAU);
      ctx.strokeStyle = hsl(col.dna.hueB, 90, 60, sel ? 0.20 : 0.12);
      ctx.lineWidth = sel ? 3.2 : 2.1;
      ctx.shadowColor = hsl(col.dna.hueB, 90, 60, sel ? 0.14 : 0.08);
      ctx.shadowBlur = sel ? 18 : 10;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // DNA badge (world space)
      const badgeW = 170;
      const badgeH = 44;
      const bx = col.cx - badgeW / 2;
      const by = col.cy - col.radius * 0.55 - 58;

      const pulse = col.badgePulse;
      const lift = pulse > 0 ? (Math.sin(performance.now() / 70) * 2.5 * pulse) : 0;

      ctx.save();
      ctx.translate(0, lift);

      // badge background
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

      // neon dot
      ctx.beginPath();
      ctx.arc(bx + 16, by + badgeH / 2, 5, 0, TAU);
      ctx.fillStyle = hsl(col.dna.hueA, 95, 62, 0.95);
      ctx.shadowColor = hsl(col.dna.hueA, 95, 62, 0.45);
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;

      // text
      ctx.fillStyle = "rgba(233,238,247,0.88)";
      ctx.font = "600 12px Space Grotesk, system-ui, -apple-system";
      ctx.fillText(`Colony #${col.id}`, bx + 30, by + 17);

      ctx.fillStyle = "rgba(233,238,247,0.70)";
      ctx.font = "500 11px Space Grotesk, system-ui, -apple-system";
      ctx.fillText(`DNA: ${col.dna.name}`, bx + 30, by + 33);

      ctx.restore();

      // worms (segmented beads)
      for (const w of col.worms) {
        const pts = w.pts;

        // glow path behind the beads
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

        // beads
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          const t = i / (pts.length - 1);
          const rad = lerp(w.baseR * 0.85, w.baseR * 0.20, t); // thick head → thin tail
          const alpha = lerp(0.90, 0.18, t);

          ctx.beginPath();
          ctx.arc(p.x, p.y, rad, 0, TAU);
          ctx.fillStyle = hsl((w.hue + t * 10) % 360, 95, lerp(60, 52, t), alpha);
          ctx.fill();

          // spec highlight
          if (i % 5 === 0) {
            ctx.beginPath();
            ctx.arc(p.x - rad * 0.25, p.y - rad * 0.25, rad * 0.28, 0, TAU);
            ctx.fillStyle = "rgba(255,255,255,0.12)";
            ctx.fill();
          }
        }

        // head glow dot
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

    // shockwaves on top (world space)
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

    // vignette in screen space
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

  // ---------- Controls wiring ----------
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

    // place first colony at canvas center (world coords)
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

    // auto select colony #1
    setTimeout(() => selectColony(state.colonies[0]), 50);
  }

  // resize observers (best on iPhone)
  const ro = new ResizeObserver(() => resize());
  ro.observe(canvas);
  window.addEventListener("resize", resize);

  // ---------- Main loop ----------
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

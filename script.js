/* =========================
   WORM COLONY — script.js (FINISHED PASTE-READY)
   ✅ Irregular blobs + limb protrusions (NOT circles)
   ✅ Territory warps (feed/volume/mutation storm)
   ✅ Boss worm (rare, trail, pulses, big shockwaves)
   ✅ Bridges/tunnels on colony spawn + worm travel
   ✅ Biome zones + behavioral influence
   ✅ Heatmap density glow
   ✅ Minimap (tap to jump + viewport hint)
   ✅ Audio toggle (auto-adds button if missing)
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

  // ---------- SPICE TUNING ----------
  const SPICE = {
    // warps decay (seconds)
    feedWarpSecs: 6.5,
    volWarpSecs: 10,
    mutationStormSecs: 8,

    // boss worm
    bossChancePerBuy: 0.065, // ~6.5% chance each buy click
    bossMinCooldown: 18,     // sec cooldown
    bossPulseEvery: 2.4,
    bossTrailLen: 22,

    // bridges
    bridgeDrawWidth: 2.2,
    bridgeTravelChance: 0.0045, // per worm per sec

    // minimap
    minimapSize: 132,
    minimapPad: 14,

    // heatmap
    heatDotR: 14,
    heatAlpha: 0.035
  };

  // ---------- Log (cap + merge spam) ----------
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
      type === "milestone" ? "MILESTONE" :
      type === "boss" ? "BOSS" : "INFO";
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
    if (type === "boss")     { pill.style.borderColor = "rgba(255,212,86,.30)"; pill.style.background = "rgba(255,212,86,.10)"; }

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

    while (elLog.children.length > MAX_LOG_ITEMS) elLog.removeChild(elLog.lastElementChild);
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

  // ---------- Audio (toggle) ----------
  let audioCtx = null;
  let audioMuted = true;

  function ensureAudio() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {}
  }

  function beep(type = "click") {
    if (audioMuted) return;
    ensureAudio();
    if (!audioCtx) return;

    const t0 = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();

    let freq = 220, dur = 0.08, gain = 0.06;
    if (type === "shock") { freq = 70;  dur = 0.12; gain = 0.10; }
    if (type === "mut")   { freq = 520; dur = 0.10; gain = 0.07; }
    if (type === "boss")  { freq = 110; dur = 0.18; gain = 0.12; }

    o.type = "sine";
    o.frequency.setValueAtTime(freq, t0);

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    o.connect(g);
    g.connect(audioCtx.destination);

    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function addAudioToggleIfMissing() {
    let btn = document.getElementById("audioBtn");
    if (btn) return btn;

    const host = document.querySelector(".controls") || document.body;
    btn = document.createElement("button");
    btn.id = "audioBtn";
    btn.textContent = "Audio: Off";
    btn.style.border = "1px solid rgba(255,255,255,.14)";
    btn.style.background = "rgba(0,0,0,.25)";
    btn.style.color = "rgba(233,238,247,.85)";
    btn.style.borderRadius = "12px";
    btn.style.padding = "10px 12px";
    btn.style.font = "600 12px system-ui, -apple-system";
    btn.style.cursor = "pointer";
    btn.style.marginLeft = "8px";
    btn.style.backdropFilter = "blur(10px)";
    host.appendChild(btn);
    return btn;
  }

  const audioBtn = addAudioToggleIfMissing();
  if (audioBtn) {
    audioBtn.addEventListener("click", async () => {
      ensureAudio();
      audioMuted = !audioMuted;
      audioBtn.textContent = audioMuted ? "Audio: Off" : "Audio: On";
      if (!audioMuted) beep("click");
    });
  }

  // ---------- Biomes + DNA ----------
  const BIOMES = [
    { name: "NEON GARDEN", hue: 155, drift: 0.85 },
    { name: "DEEP SEA",    hue: 210, drift: 1.00 },
    { name: "TOXIC",       hue: 285, drift: 1.20 },
    { name: "EMBER",       hue: 35,  drift: 1.10 }
  ];

  const DNA_POOL = [
    { name: "CALM",       chaos: 0.25, speed: 0.75, temper: 0.20 },
    { name: "ORBITAL",    chaos: 0.35, speed: 0.90, temper: 0.35 },
    { name: "GLIDER",     chaos: 0.50, speed: 1.00, temper: 0.45 },
    { name: "AGGRESSIVE", chaos: 0.75, speed: 1.15, temper: 0.85 },
    { name: "CHAOTIC",    chaos: 0.98, speed: 1.00, temper: 0.70 }
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

  // ---------- Blob + Limbs ----------
  function smoothNoise1(x) {
    return Math.sin(x) * 0.6 + Math.sin(x * 0.57 + 1.7) * 0.3 + Math.sin(x * 1.31 + 0.2) * 0.1;
  }
  function angDist(a, b) {
    return Math.abs(((a - b + Math.PI) % TAU) - Math.PI);
  }

  function globalLimbCount(mcap) {
    const t = clamp((mcap - 50_000) / 300_000, 0, 1);
    return Math.floor(t * 6);
  }
  function globalLimbStrength(mcap) {
    return clamp((mcap - 50_000) / 250_000, 0, 1);
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
      col.limbHeights.push(rand(0.20, 0.52));
    }
  }

  function updateLimbs(col, mcap) {
    const g = globalLimbCount(mcap);
    const s = globalLimbStrength(mcap);
    const bias = 0.85 + col.blobSeed2 * 0.25;
    col.limbCount = Math.min(6, Math.max(0, Math.floor(g * bias)));
    col.limbStrength = clamp(s * bias, 0, 1.15);
  }

  function blobMul(col, ang, t) {
    const s1 = col.blobSeed1, s2 = col.blobSeed2, s3 = col.blobSeed3;

    const warp = clamp(col.warpFeed + col.warpVol + col.warpStorm, 0, 2.2);
    const amp = 0.25 + warp * 0.22;

    const base =
      smoothNoise1(ang * (2.0 + s1) + t * (0.25 + s2)) * 0.55 +
      smoothNoise1(ang * (3.4 + s2) - t * (0.18 + s3)) * 0.25 +
      smoothNoise1(ang * (5.2 + s3) + t * (0.12 + s1)) * 0.15;

    let mul = 1.0 + base * amp;

    const L = col.limbCount;
    if (L > 0) {
      const ls = col.limbStrength * (0.35 + 0.65 * col.limbStyle) * (1.0 + warp * 0.55);
      for (let i = 0; i < L; i++) {
        const la = col.limbAngles[i];
        const width = col.limbWidths[i];
        const height = col.limbHeights[i] * (1.0 + warp * 0.35);
        const d = angDist(ang, la);
        const bulge = Math.exp(-(d * d) / (2 * width * width));
        mul += bulge * ls * height;
      }
      mul *= 1.0 + Math.sin(t * (0.6 + col.limbStyle) + s2 * 3.0) * 0.02 * col.limbStrength;
    }

    return clamp(mul, 0.60, 1.70);
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
    bridges: [],

    t: 0,
    nextSplitAt: SPLIT_STEP_MC,

    lastMutationAt: performance.now(),
    lastVol: 0,
    lastMcap: START_MC,

    bossCooldown: 0
  };

  // ---------- Builders ----------
  function makeWorm(col, idx, opts = {}) {
    const segCount = opts.boss ? randi(44, 62) : randi(28, 44);
    const segLen = opts.boss ? rand(7.8, 10.2) : rand(6.2, 8.6);
    const baseR  = opts.boss ? rand(18, 26) : rand(12, 20);
    const hue = opts.boss ? 52 : (Math.random() < 0.5 ? col.dna.hueA : col.dna.hueB);

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
      energy: opts.boss ? rand(0.75, 1.0) : rand(0.35, 0.95),
      age: 0,
      mutations: 0,

      steer: { x: rand(-1, 1), y: rand(-1, 1) },
      steerT: rand(0.15, 1.0),

      boss: !!opts.boss,
      bossPulseT: rand(0.4, 1.2),
      trail: []
    };
  }

  function makeColony(id, cx, cy) {
    const dna = pickDNA();
    const biome = BIOMES[randi(0, BIOMES.length - 1)];

    const col = {
      id, cx, cy,
      dna, biome,
      worms: [],
      radius: rand(135, 190),
      badgePulse: 0,
      mutations: 0,

      blobSeed1: rand(0.2, 1.2),
      blobSeed2: rand(0.2, 1.2),
      blobSeed3: rand(0.2, 1.2),
      blobSpin: rand(-0.6, 0.6),

      warpFeed: 0,
      warpVol: 0,
      warpStorm: 0,

      limbStyle: rand(0.2, 1.0),
      limbCount: 0,
      limbStrength: 0,
      limbAngles: [],
      limbWidths: [],
      limbHeights: []
    };

    initLimbs(col);
    updateLimbs(col, state.mcap);

    const startW = randi(10, 15);
    for (let i = 0; i < startW; i++) col.worms.push(makeWorm(col, i));
    return col;
  }

  const totalWorms = () => state.colonies.reduce((a, c) => a + c.worms.length, 0);

  // ---------- Bridges / tunnels ----------
  function addBridge(fromId, toId) {
    state.bridges.push({
      a: fromId,
      b: toId,
      prog: 0,
      hue: 175 + rand(-18, 18)
    });
  }

  // ---------- Shockwaves ----------
  function spawnShockwave(x, y, hue = 160, strength = 1) {
    state.shockwaves.push({
      x, y, hue,
      r: 0,
      a: 0.9,
      speed: rand(240, 360) * (0.8 + 0.6 * strength),
      width: rand(2.5, 4.2) * (0.8 + 0.7 * strength)
    });
    beep("shock");
  }

  // ---------- Selecting + picking ----------
  function selectedColony() {
    return state.colonies.find(c => c.id === state.selectedColonyId) || state.colonies[0];
  }

  function pickColonyAt(wx, wy) {
    let best = null, bestD = 1e9;
    for (const col of state.colonies) {
      const d = hypot(wx - col.cx, wy - col.cy);
      const hit = (col.radius * 0.80) + 34 / cam.zoom;
      if (d < hit && d < bestD) { best = col; bestD = d; }
    }
    return best;
  }

  function selectColony(col) {
    if (!col) return;
    state.selectedColonyId = col.id;
    col.badgePulse = 1;
    logEvent("info", `Selected Colony #${col.id} • DNA: ${col.dna.name} • Biome: ${col.biome.name}`);
    spawnShockwave(col.cx, col.cy, col.dna.hueA, 0.8);
  }

  // ---------- Colony spawn milestones ----------
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

      const newCol = makeColony(id, cx, cy);
      state.colonies.push(newCol);

      const parent = selectedColony() || state.colonies[0];
      addBridge(parent.id, newCol.id);

      logEvent("split", `Colony #${id} founded at ${fmtUSD(state.nextSplitAt)} MC.`);
      spawnShockwave(cx, cy, randi(150, 220), 1.2);

      state.nextSplitAt += SPLIT_STEP_MC;
    }
  }

  // ---------- Mutations / storms ----------
  function triggerStorm(col) {
    col.warpStorm = Math.min(1, col.warpStorm + 0.85);
  }

  function mutateWorm(w, col) {
    w.mutations += 1;
    col.mutations += 1;

    w.baseR = clamp(w.baseR * rand(0.92, 1.10), 10, 28);
    w.segLen = clamp(w.segLen * rand(0.92, 1.08), 5.8, 10.4);
    w.energy = clamp(w.energy + rand(-0.10, 0.16), 0.25, 1.0);
    w.hue = (w.hue + randi(-24, 28) + 360) % 360;

    w.steer.x = clamp(w.steer.x + rand(-0.9, 0.9), -2.0, 2.0);
    w.steer.y = clamp(w.steer.y + rand(-0.9, 0.9), -2.0, 2.0);
    w.steerT = rand(0.12, 0.75);

    triggerStorm(col);
    logEvent("mutation", `${Math.random() < 0.5 ? "Color shift" : "Behavior spike"} • Worm ${w.id.split("-").slice(-1)[0]} (Colony #${col.id})`);
    beep("mut");
    spawnShockwave(col.cx, col.cy, w.hue, 1.0);
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
    for (let i = 0; i < Math.min(3, col.worms.length); i++) {
      mutateWorm(col.worms[randi(0, col.worms.length - 1)], col);
    }
    state.nutrients += 140;
    updateHUD();
  }

  // ---------- Boss Worm ----------
  function maybeSpawnBoss(col) {
    if (!col) return;
    if (state.bossCooldown > 0) return;
    if (Math.random() > SPICE.bossChancePerBuy) return;

    state.bossCooldown = SPICE.bossMinCooldown;

    const boss = makeWorm(col, col.worms.length, { boss: true });
    col.worms.unshift(boss);

    col.warpVol = Math.min(1, col.warpVol + 0.95);
    spawnShockwave(col.cx, col.cy, 55, 1.8);
    beep("boss");
    logEvent("boss", `ALPHA WORM EMERGED in Colony #${col.id}`);
  }

  // ---------- Warps triggers ----------
  function triggerFeedWarp(col, intensity = 1) {
    col.warpFeed = Math.min(1, col.warpFeed + 0.55 * intensity);
  }
  function triggerVolWarp(col, intensity = 1) {
    col.warpVol = Math.min(1, col.warpVol + 0.65 * intensity);
  }

  // ---------- Buy simulation (you’ll later replace with real DEX data) ----------
  function simBuy(mult = 1) {
    const buyersAdd = Math.random() < 0.75 ? 1 : 2;
    const volAdd = rand(220, 980) * mult;
    const mcAdd = rand(700, 2800) * mult;

    state.buyers += buyersAdd;
    state.volume += volAdd;
    state.mcap += mcAdd;

    state.nutrients += (buyersAdd * 30) + (volAdd * 0.032) + (mcAdd * 0.020);

    const col = selectedColony();
    if (col) {
      triggerFeedWarp(col, 1);
      if (volAdd > 900) triggerVolWarp(col, 1);
      spawnShockwave(col.cx, col.cy, col.dna.hueA, 0.9);
      maybeSpawnBoss(col);
    }

    beep("click");
    logEvent("info", `Buy • +${buyersAdd} buyers • +${fmtUSD(volAdd)} vol • +${fmtUSD(mcAdd)} MC`);
    updateHUD();
  }

  // ---------- Input (pan/zoom + minimap taps) ----------
  canvas.style.touchAction = "none";
  let activePointers = new Map();
  let isPanning = false;
  let panStart = { x: 0, y: 0, camX: 0, camY: 0 };
  let pinchStart = null;
  let lastTapTime = 0;

  function minimapRect() {
    const r = canvas.getBoundingClientRect();
    const size = SPICE.minimapSize;
    const pad = SPICE.minimapPad;
    return { x: r.width - pad - size, y: pad, w: size, h: size };
  }

  function colonyBounds() {
    if (!state.colonies.length) return null;
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const c of state.colonies) {
      const r = c.radius * 1.1;
      minX = Math.min(minX, c.cx - r);
      minY = Math.min(minY, c.cy - r);
      maxX = Math.max(maxX, c.cx + r);
      maxY = Math.max(maxY, c.cy + r);
    }
    const pad = 120;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    return { minX, minY, maxX, maxY };
  }

  function minimapTapToJump(sx, sy) {
    const mm = minimapRect();
    const rect = canvas.getBoundingClientRect();
    const rx = sx - rect.left;
    const ry = sy - rect.top;

    if (rx < mm.x || rx > mm.x + mm.w || ry < mm.y || ry > mm.y + mm.h) return false;

    const bounds = colonyBounds();
    if (!bounds) return true;

    const nx = (rx - mm.x) / mm.w;
    const ny = (ry - mm.y) / mm.h;

    const wx = lerp(bounds.minX, bounds.maxX, nx);
    const wy = lerp(bounds.minY, bounds.maxY, ny);

    const r = canvas.getBoundingClientRect();
    cam.x = cam.x + ((r.width / 2) - wx);
    cam.y = cam.y + ((r.height / 2) - wy);

    spawnShockwave(wx, wy, 190, 0.7);
    logEvent("info", "Minimap jump.");
    return true;
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (minimapTapToJump(e.clientX, e.clientY)) return;

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
          spawnShockwave(col.cx, col.cy, col.dna.hueB, 0.9);
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

  // ---------- Heatmap points ----------
  const heatPts = [];
  function pushHeat(x, y, hue) {
    heatPts.push({ x, y, hue });
    if (heatPts.length > 900) heatPts.splice(0, heatPts.length - 900);
  }

  // ---------- Worm bridge travel ----------
  function findBridgeFor(colId) {
    const built = state.bridges.filter(b => b.prog > 0.95 && (b.a === colId || b.b === colId));
    if (!built.length) return null;
    return built[randi(0, built.length - 1)];
  }

  function teleportWormToColony(w, fromCol, toCol) {
    const ang = rand(0, TAU);
    const mul = blobMul(toCol, ang, state.t);
    const rr = (toCol.radius * 0.55) * mul;

    const hx = toCol.cx + Math.cos(ang) * rr;
    const hy = toCol.cy + Math.sin(ang) * rr;

    for (const p of w.pts) { p.x = hx; p.y = hy; }
    w.trail.length = 0;

    spawnShockwave(hx, hy, toCol.dna.hueA, 1.0);
    logEvent("info", `Worm traveled: Colony #${fromCol.id} → #${toCol.id}`);
  }

  // ---------- Simulation step ----------
  function step(dt) {
    state.t += dt;

    state.bossCooldown = Math.max(0, state.bossCooldown - dt);

    // nutrients decay + drip
    state.nutrients = Math.max(0, state.nutrients - 32 * dt);
    state.nutrients += (state.buyers * 0.018 + state.volume * 0.000009 + state.mcap * 0.0000045) * dt;

    maybeSpawnColonies();
    randomMutationTick(performance.now());

    // shockwaves
    for (let i = state.shockwaves.length - 1; i >= 0; i--) {
      const s = state.shockwaves[i];
      s.r += s.speed * dt;
      s.a -= 0.60 * dt;
      if (s.a <= 0) state.shockwaves.splice(i, 1);
    }

    // bridges build
    for (const b of state.bridges) b.prog = Math.min(1, b.prog + dt * 0.75);

    // detect spikes
    const dv = state.volume - state.lastVol;
    const dmc = state.mcap - state.lastMcap;
    state.lastVol = state.volume;
    state.lastMcap = state.mcap;

    if (dv > 2500) {
      const col = selectedColony();
      if (col) triggerVolWarp(col, 1);
    }
    if (dmc > 6000) {
      const col = selectedColony();
      if (col) col.warpVol = Math.min(1, col.warpVol + 0.25);
    }

    // colonies update
    for (const col of state.colonies) {
      updateLimbs(col, state.mcap);

      // decay warps
      col.warpFeed  = Math.max(0, col.warpFeed  - dt / SPICE.feedWarpSecs);
      col.warpVol   = Math.max(0, col.warpVol   - dt / SPICE.volWarpSecs);
      col.warpStorm = Math.max(0, col.warpStorm - dt / SPICE.mutationStormSecs);

      const warpSum = col.warpFeed + col.warpVol + col.warpStorm;

      // radius adjusts with nutrients + warps
      const targetR = clamp(145 + state.nutrients * 0.020 + warpSum * 12, 125, 255);
      col.radius = lerp(col.radius, targetR, 0.03);

      if (col.badgePulse > 0) col.badgePulse = Math.max(0, col.badgePulse - 1.15 * dt);

      for (const w of col.worms) {
        w.age += dt;

        // steering
        w.steerT -= dt;
        if (w.steerT <= 0) {
          const biomeDrift = col.biome.drift;
          w.steerT = rand(0.12, 1.1) * lerp(1.0, 0.55, col.dna.temper) / biomeDrift;
          w.steer.x = clamp(lerp(w.steer.x, rand(-1, 1), 0.75), -2.0, 2.0);
          w.steer.y = clamp(lerp(w.steer.y, rand(-1, 1), 0.75), -2.0, 2.0);
        }

        const pts = w.pts;
        const head = pts[0];

        // heatmap
        pushHeat(head.x, head.y, w.hue);

        // boss trail + pulses
        if (w.boss) {
          w.trail.unshift({ x: head.x, y: head.y });
          if (w.trail.length > SPICE.bossTrailLen) w.trail.pop();

          w.bossPulseT -= dt;
          if (w.bossPulseT <= 0) {
            w.bossPulseT = SPICE.bossPulseEvery + rand(-0.4, 0.6);
            spawnShockwave(head.x, head.y, 55, 1.4);
          }
        }

        // movement along blob boundary
        const cx = col.cx, cy = col.cy;
        const dx0 = head.x - cx;
        const dy0 = head.y - cy;
        const ang0 = Math.atan2(dy0, dx0);

        const mul = blobMul(col, ang0 + col.blobSpin * state.t * 0.35, state.t);
        const boundary = (col.radius * 0.68) * mul;

        const bx = cx + Math.cos(ang0) * boundary;
        const by = cy + Math.sin(ang0) * boundary;

        const tx = -Math.sin(ang0);
        const ty =  Math.cos(ang0);

        const warpBoost = 1.0 + (col.warpVol * 0.7 + col.warpStorm * 0.9);
        const pullToEdge = 0.62 * warpBoost;
        const slide = (0.80 + col.dna.chaos) * warpBoost;
        const steer = (0.60 + col.dna.chaos) * warpBoost;

        const driftRate = (0.22 + col.dna.chaos * 0.22) * col.biome.drift;
        w.drift.x = clamp(w.drift.x + rand(-driftRate, driftRate) * dt, -2.4, 2.4);
        w.drift.y = clamp(w.drift.y + rand(-driftRate, driftRate) * dt, -2.4, 2.4);

        const bossBoost = w.boss ? 1.55 : 1.0;
        const spd = (46 + w.energy * 58) * col.dna.speed * bossBoost;

        const toBx = (bx - head.x);
        const toBy = (by - head.y);

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

        // keep near colony
        const ddx = head.x - cx;
        const ddy = head.y - cy;
        const d = hypot(ddx, ddy);
        const outer = col.radius * (1.28 + col.warpStorm * 0.12);
        if (d > outer) {
          head.x = lerp(head.x, cx + (ddx / d) * outer, 0.11);
          head.y = lerp(head.y, cy + (ddy / d) * outer, 0.11);
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

          const wob = (Math.sin(state.t * 2.8 + w.phase + i * 0.33) + Math.sin(state.t * 1.7 + i * 0.21)) * 0.18;
          p.x += (-ddy2 / dist) * wob * w.baseR * 0.06;
          p.y += (ddx2 / dist) * wob * w.baseR * 0.06;
        }

        // bridge travel
        if (!w.boss && Math.random() < SPICE.bridgeTravelChance * dt) {
          const bridge = findBridgeFor(col.id);
          if (bridge) {
            const otherId = (bridge.a === col.id) ? bridge.b : bridge.a;
            const toCol = state.colonies.find(c => c.id === otherId);
            if (toCol) teleportWormToColony(w, col, toCol);
          }
        }
      }

      // worm growth
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
    const g = ctx.createRadialGradient(
      r.width * 0.55, r.height * 0.55, 60,
      r.width * 0.55, r.height * 0.55, Math.max(r.width, r.height)
    );
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, r.width, r.height);
  }

  function drawHeatmap() {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = Math.max(0, heatPts.length - 420); i < heatPts.length; i++) {
      const p = heatPts[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, SPICE.heatDotR, 0, TAU);
      ctx.fillStyle = hsl(p.hue, 95, 62, SPICE.heatAlpha);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBridge(b) {
    const A = state.colonies.find(c => c.id === b.a);
    const B = state.colonies.find(c => c.id === b.b);
    if (!A || !B) return;

    const mx = (A.cx + B.cx) * 0.5;
    const my = (A.cy + B.cy) * 0.5;
    const dx = B.cx - A.cx;
    const dy = B.cy - A.cy;
    const len = Math.max(1e-6, hypot(dx, dy));
    const nx = -dy / len;
    const ny = dx / len;
    const bend = 90 + Math.sin(state.t * 0.9 + b.hue) * 20;
    const cx = mx + nx * bend;
    const cy = my + ny * bend;

    const steps = 60;
    const kMax = Math.floor(steps * b.prog);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineWidth = SPICE.bridgeDrawWidth;
    ctx.strokeStyle = hsl(b.hue, 95, 62, 0.16 + 0.10 * b.prog);
    ctx.shadowColor = hsl(b.hue, 95, 62, 0.22);
    ctx.shadowBlur = 12;

    ctx.beginPath();
    for (let i = 0; i <= kMax; i++) {
      const t = i / steps;
      const x = (1 - t) * (1 - t) * A.cx + 2 * (1 - t) * t * cx + t * t * B.cx;
      const y = (1 - t) * (1 - t) * A.cy + 2 * (1 - t) * t * cy + t * t * B.cy;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.restore();
  }

  function drawColonyBlob(col, sel) {
    const warpSum = col.warpFeed + col.warpVol + col.warpStorm;

    // biome aura
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.beginPath();
    ctx.arc(col.cx, col.cy, col.radius * (0.95 + warpSum * 0.08), 0, TAU);
    ctx.fillStyle = hsl(col.biome.hue, 95, 56, 0.06 + warpSum * 0.06);
    ctx.fill();
    ctx.restore();

    // blob boundary
    ctx.beginPath();
    const steps = 90;
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

    const glowA = 0.10 + warpSum * 0.10 + (sel ? 0.05 : 0);
    ctx.strokeStyle = hsl(col.dna.hueA, 95, 62, glowA);
    ctx.lineWidth = sel ? 2.6 : 1.8;
    ctx.shadowColor = hsl(col.dna.hueA, 95, 62, 0.18 + warpSum * 0.12);
    ctx.shadowBlur = sel ? (18 + warpSum * 10) : (12 + warpSum * 8);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "rgba(0,0,0,0.07)";
    ctx.fill();

    // core ring
    ctx.beginPath();
    ctx.arc(col.cx, col.cy, col.radius * 0.34, 0, TAU);
    ctx.strokeStyle = hsl(col.dna.hueB, 90, 60, sel ? 0.18 : 0.11);
    ctx.lineWidth = sel ? 2.6 : 1.8;
    ctx.stroke();
  }

  function drawBadge(col) {
    const badgeW = 210, badgeH = 48;
    const bx = col.cx - badgeW / 2;
    const by = col.cy - col.radius * 0.68 - 66;
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
    ctx.fillStyle = hsl(col.biome.hue, 95, 62, 0.95);
    ctx.shadowColor = hsl(col.biome.hue, 95, 62, 0.45);
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "rgba(233,238,247,0.92)";
    ctx.font = "600 12px Space Grotesk, system-ui, -apple-system";
    ctx.fillText(`Colony #${col.id}`, bx + 30, by + 18);

    ctx.fillStyle = "rgba(233,238,247,0.68)";
    ctx.font = "500 11px Space Grotesk, system-ui, -apple-system";
    ctx.fillText(`DNA: ${col.dna.name} • ${col.biome.name}`, bx + 30, by + 34);

    ctx.fillStyle = "rgba(233,238,247,0.55)";
    ctx.font = "600 10px Space Grotesk, system-ui, -apple-system";
    ctx.fillText(`LIMBS: ${col.limbCount}`, bx + badgeW - 70, by + 18);

    ctx.restore();
  }

  function drawBossTrail(w) {
    if (!w.boss || !w.trail || w.trail.length < 3) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.beginPath();
    ctx.moveTo(w.trail[0].x, w.trail[0].y);
    for (let i = 1; i < w.trail.length; i++) ctx.lineTo(w.trail[i].x, w.trail[i].y);
    ctx.strokeStyle = hsl(55, 98, 62, 0.18);
    ctx.lineWidth = w.baseR * 0.40;
    ctx.shadowColor = hsl(55, 98, 62, 0.30);
    ctx.shadowBlur = 18;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  function drawWorm(w, col) {
    const pts = w.pts;

    drawBossTrail(w);

    // glow path
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);

    const glowAlpha = w.boss ? 0.18 : 0.10;
    ctx.strokeStyle = hsl(w.hue, 95, 62, glowAlpha);
    ctx.lineWidth = w.baseR * (w.boss ? 0.70 : 0.55);
    ctx.shadowColor = hsl(w.hue, 95, 62, w.boss ? 0.32 : 0.22);
    ctx.shadowBlur = w.boss ? 22 : 18;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.shadowBlur = 0;

    // beads
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const t = i / (pts.length - 1);
      const rad = lerp(w.baseR * 0.90, w.baseR * 0.20, t);
      const alpha = lerp(0.90, 0.18, t);

      const tintHue = col.biome.hue;
      const mixHue = (w.hue * 0.70 + tintHue * 0.30) % 360;

      ctx.beginPath();
      ctx.arc(p.x, p.y, rad, 0, TAU);
      ctx.fillStyle = hsl((mixHue + t * 10) % 360, 95, lerp(60, 52, t), alpha);
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
    ctx.shadowColor = hsl(w.hue, 95, 62, w.boss ? 0.55 : 0.40);
    ctx.shadowBlur = w.boss ? 20 : 16;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function drawMinimap() {
    const bounds = colonyBounds();
    if (!bounds) return;

    const r = canvas.getBoundingClientRect();
    const mm = minimapRect();

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // background
    ctx.beginPath();
    ctx.roundRect(mm.x, mm.y, mm.w, mm.h, 14);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.stroke();

    // dots
    for (const c of state.colonies) {
      const nx = (c.cx - bounds.minX) / (bounds.maxX - bounds.minX);
      const ny = (c.cy - bounds.minY) / (bounds.maxY - bounds.minY);
      const x = mm.x + nx * mm.w;
      const y = mm.y + ny * mm.h;

      const sel = c.id === state.selectedColonyId;
      ctx.beginPath();
      ctx.arc(x, y, sel ? 5.2 : 3.8, 0, TAU);
      ctx.fillStyle = hsl(c.biome.hue, 95, 62, sel ? 0.95 : 0.70);
      ctx.fill();

      if (sel) {
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, TAU);
        ctx.strokeStyle = hsl(c.biome.hue, 95, 62, 0.25);
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
    }

    // viewport hint
    const vw = r.width / cam.zoom;
    const vh = r.height / cam.zoom;
    const viewCx = (r.width / 2) - cam.x;
    const viewCy = (r.height / 2) - cam.y;

    const vminX = viewCx - vw / 2;
    const vminY = viewCy - vh / 2;
    const vmaxX = viewCx + vw / 2;
    const vmaxY = viewCy + vh / 2;

    const nx0 = (vminX - bounds.minX) / (bounds.maxX - bounds.minX);
    const ny0 = (vminY - bounds.minY) / (bounds.maxY - bounds.minY);
    const nx1 = (vmaxX - bounds.minX) / (bounds.maxX - bounds.minX);
    const ny1 = (vmaxY - bounds.minY) / (bounds.maxY - bounds.minY);

    const x0 = mm.x + nx0 * mm.w;
    const y0 = mm.y + ny0 * mm.h;
    const x1 = mm.x + nx1 * mm.w;
    const y1 = mm.y + ny1 * mm.h;

    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x0, y0, (x1 - x0), (y1 - y0));

    ctx.restore();
  }

  function draw() {
    const r = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);

    // camera transform
    ctx.save();
    ctx.translate(r.width / 2, r.height / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-r.width / 2 + cam.x, -r.height / 2 + cam.y);

    // bridges behind everything
    for (const b of state.bridges) drawBridge(b);

    // heatmap behind worms
    drawHeatmap();

    // colonies
    for (const col of state.colonies) {
      const sel = col.id === state.selectedColonyId;
      drawColonyBlob(col, sel);
      drawBadge(col);
      for (const w of col.worms) drawWorm(w, col);
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

    // screen-space overlay
    drawMinimap();
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
  if (btnFeed)  btnFeed.addEventListener("click", () => simBuy(1));
  if (btnSmall) btnSmall.addEventListener("click", () => simBuy(0.6));
  if (btnBig)   btnBig.addEventListener("click", () => simBuy(1.75));
  if (btnMutate) btnMutate.addEventListener("click", forceMutation);
  if (btnReset)  btnReset.addEventListener("click", () => init(true));

  // ---------- Init ----------
  function init(clearLog = false) {
    resize();

    state.buyers = 0;
    state.volume = 0;
    state.mcap = START_MC;
    state.nutrients = 0;

    state.colonies = [];
    state.selectedColonyId = 1;

    state.shockwaves = [];
    state.bridges = [];

    state.t = 0;
    state.nextSplitAt = SPLIT_STEP_MC;
    state.lastMutationAt = performance.now();
    state.lastVol = 0;
    state.lastMcap = START_MC;
    state.bossCooldown = 0;

    heatPts.length = 0;

    const r = canvas.getBoundingClientRect();
    const c1 = makeColony(1, r.width / 2, r.height / 2);
    state.colonies.push(c1);

    cam.x = 0; cam.y = 0; cam.zoom = 1;

    if (clearLog && elLog) elLog.innerHTML = "";
    logEvent("info", "Ready • Tap colonies • Drag pan • Pinch zoom • Double-tap center.");
    logEvent("info", "Minimap: tap to jump. Boss worm can spawn on buys.");
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

  // ---------- Patch: add missing canvas roundRect for older browsers ----------
  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      const rr = Math.min(r, w / 2, h / 2);
      this.beginPath();
      this.moveTo(x + rr, y);
      this.arcTo(x + w, y, x + w, y + h, rr);
      this.arcTo(x + w, y + h, x, y + h, rr);
      this.arcTo(x, y + h, x, y, rr);
      this.arcTo(x, y, x + w, y, rr);
      this.closePath();
      return this;
    };
  }

  // boot
  init(false);
  requestAnimationFrame(loop);
})();

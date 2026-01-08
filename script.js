/* =========================
   WORM COLONY — script.js (ALL UPDATES APPLIED)
   - Focus mode + zoom controls
   - Events: Whale Buy / Sell-off / Volume Storm
   - DNA visible personalities (movement + styling)
   - Signature colony silhouettes
   - Territory drift
   - Parallax starfield + neon grid
   - Biome dust particles
   - Auras around colonies
   - Diverse worm colors + mixed direction motion
   - Capture PNG with overlay
   - Log cap + auto-merge spam
   ========================= */

(() => {
  // ----- DOM -----
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d", { alpha: true });

  const el = (id) => document.getElementById(id);
  const elBuyers = el("buyers");
  const elVol = el("vol");
  const elMcap = el("mcap");
  const elCols = el("cols");
  const elWorms = el("worms");
  const elLog = el("log");

  const toast = el("toast");

  const btnFeed = el("feedBtn");
  const btnSmall = el("smallFeed");
  const btnBig = el("bigFeed");
  const btnSell = el("sellBtn");
  const btnStorm = el("stormBtn");
  const btnMutate = el("mutateBtn");
  const btnReset = el("resetBtn");

  const btnFocus = el("focusBtn");
  const btnZoomIn = el("zoomInBtn");
  const btnZoomOut = el("zoomOutBtn");
  const btnCapture = el("captureBtn");

  const focusPanel = el("focusPanel");
  const fpSelected = el("fpSelected");
  const fpDNA = el("fpDNA");
  const fpBiome = el("fpBiome");
  const fpStyle = el("fpStyle");

  // ----- Math utils -----
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b + 1));
  const hypot = Math.hypot;

  const hsl = (h, s, l, a = 1) => `hsla(${((h % 360) + 360) % 360}, ${s}%, ${l}%, ${a})`;

  function fmtUSD(n) {
    const abs = Math.abs(n);
    if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `$${Math.round(n).toLocaleString()}`;
    return `$${Math.round(n)}`;
  }

  // ----- Resize -----
  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.floor(r.width * dpr));
    canvas.height = Math.max(1, Math.floor(r.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  new ResizeObserver(resize).observe(canvas);
  window.addEventListener("resize", resize);

  // ----- Toast -----
  let toastT = 0;
  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("on");
    toastT = 2.0;
  }

  // ----- Log (cap + merge) -----
  function nowStr() {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function logEvent(type, msg) {
    if (!elLog) return;
    const MAX = 14;
    const MERGE_MS = 2500;
    const now = Date.now();

    const last = elLog.firstElementChild;
    if (last) {
      const lastType = last.getAttribute("data-type");
      const lastMsg = last.getAttribute("data-msg");
      const lastTs = Number(last.getAttribute("data-ts") || 0);

      if ((lastType === type || lastMsg === msg) && (now - lastTs) < MERGE_MS) {
        const c = last.querySelector(".count");
        const n = (c ? Number(c.textContent) : 1) + 1;
        if (c) c.textContent = String(n);
        else {
          const cc = document.createElement("div");
          cc.className = "count";
          cc.textContent = "2";
          last.appendChild(cc);
        }
        last.setAttribute("data-ts", String(now));
        const time = last.querySelector(".time");
        if (time) time.textContent = nowStr();
        return;
      }
    }

    const item = document.createElement("div");
    item.className = "logItem";
    item.setAttribute("data-type", type);
    item.setAttribute("data-msg", msg);
    item.setAttribute("data-ts", String(now));

    const top = document.createElement("div");
    top.className = "logTop";
    const time = document.createElement("span");
    time.className = "time";
    time.textContent = nowStr();

    const pill = document.createElement("span");
    pill.className = "pill";
    if (type === "mutation") pill.classList.add("mut"), (pill.textContent = "MUTATION");
    else if (type === "split") pill.classList.add("split"), (pill.textContent = "SPLIT");
    else if (type === "milestone") pill.classList.add("mil"), (pill.textContent = "MILESTONE");
    else if (type === "boss") pill.classList.add("boss"), (pill.textContent = "BOSS");
    else pill.textContent = "INFO";

    top.appendChild(time);
    top.appendChild(pill);

    const body = document.createElement("div");
    body.className = "logBody";
    body.textContent = msg;

    item.appendChild(top);
    item.appendChild(body);
    elLog.prepend(item);

    while (elLog.children.length > MAX) elLog.removeChild(elLog.lastElementChild);
  }

  // ----- Camera -----
  const cam = { x: 0, y: 0, zoom: 1, minZoom: 0.65, maxZoom: 2.6 };
  function screenToWorld(sx, sy) {
    const r = canvas.getBoundingClientRect();
    let x = sx - r.left;
    let y = sy - r.top;
    x -= r.width / 2; y -= r.height / 2;
    x /= cam.zoom; y /= cam.zoom;
    x += r.width / 2 - cam.x;
    y += r.height / 2 - cam.y;
    return { x, y };
  }

  // ----- Biomes & DNA -----
  const BIOMES = [
    { name: "NEON GARDEN", hue: 155, dust: 160 },
    { name: "DEEP SEA", hue: 210, dust: 205 },
    { name: "TOXIC", hue: 285, dust: 292 },
    { name: "EMBER", hue: 35, dust: 42 }
  ];

  // DNA now drives *obvious* motion & styling
  const DNA_POOL = [
    { name: "CALM", style: "GLIDE", chaos: 0.25, speed: 0.78, wiggle: 0.35 },
    { name: "ORBITAL", style: "SPIRAL", chaos: 0.35, speed: 0.90, wiggle: 0.55 },
    { name: "GLIDER", style: "ARC", chaos: 0.50, speed: 1.00, wiggle: 0.70 },
    { name: "AGGRESSIVE", style: "DASH", chaos: 0.75, speed: 1.15, wiggle: 0.90 },
    { name: "CHAOTIC", style: "ZIGZAG", chaos: 0.98, speed: 1.05, wiggle: 1.10 }
  ];

  function pickDNA() {
    const base = DNA_POOL[randi(0, DNA_POOL.length - 1)];
    return {
      name: base.name,
      style: base.style,
      chaos: clamp(base.chaos + rand(-0.10, 0.10), 0.15, 1.0),
      speed: clamp(base.speed + rand(-0.12, 0.14), 0.55, 1.35),
      wiggle: clamp(base.wiggle + rand(-0.10, 0.12), 0.20, 1.30)
    };
  }

  function makePalette(biomeHue) {
    const h0 = biomeHue + rand(-18, 18);
    return [
      h0,
      h0 + 28 + rand(-8, 8),
      h0 + 160 + rand(-12, 12),
      h0 + 205 + rand(-12, 12),
      h0 + 320 + rand(-12, 12)
    ].map(h => ((h % 360) + 360) % 360);
  }

  // ----- Irregular blob with signature silhouettes -----
  function smoothNoise1(x) {
    return Math.sin(x) * 0.6 + Math.sin(x * 0.57 + 1.7) * 0.3 + Math.sin(x * 1.31 + 0.2) * 0.1;
  }
  function angDist(a, b) {
    return Math.abs(((a - b + Math.PI) % TAU) - Math.PI);
  }

  // signature silhouette patterns
  const SILHOUETTES = ["CROWN", "FORK", "COMET", "CLAW"];
  function initSignatureLimbs(col) {
    col.sig = SILHOUETTES[randi(0, SILHOUETTES.length - 1)];
    col.limbAngles = [];
    col.limbWidths = [];
    col.limbHeights = [];
    const maxL = 6;

    const base = rand(0, TAU);
    let pattern = [];
    if (col.sig === "CROWN") pattern = [0, 0.5, 1.0, 3.2, 3.7, 4.2];
    if (col.sig === "FORK")  pattern = [0, 0.35, 0.7, 3.2, 3.55, 3.9];
    if (col.sig === "COMET") pattern = [0.15, 0.5, 0.9, 2.6, 2.95, 3.3];
    if (col.sig === "CLAW")  pattern = [0.0, 0.55, 1.1, 4.0, 4.55, 5.1];

    for (let i = 0; i < maxL; i++) {
      const a = (base + (pattern[i] || (i * TAU) / maxL) + rand(-0.22, 0.22)) % TAU;
      col.limbAngles.push(a);
      col.limbWidths.push(rand(0.16, 0.36));
      col.limbHeights.push(rand(0.22, 0.58));
    }
  }

  function globalLimbCount(mcap) {
    const t = clamp((mcap - 50_000) / 300_000, 0, 1);
    return Math.floor(t * 6);
  }
  function globalLimbStrength(mcap) {
    return clamp((mcap - 50_000) / 250_000, 0, 1);
  }

  function updateLimbs(col, mcap) {
    const g = globalLimbCount(mcap);
    const s = globalLimbStrength(mcap);
    const bias = 0.85 + col.seed2 * 0.25;
    col.limbCount = Math.min(6, Math.max(0, Math.floor(g * bias)));
    col.limbStrength = clamp(s * bias, 0, 1.25);
  }

  function blobMul(col, ang, t) {
    const warp = clamp(col.warpFeed + col.warpVol + col.warpStorm, 0, 2.2);
    const amp = 0.26 + warp * 0.26;
    const base =
      smoothNoise1(ang * (2.0 + col.seed1) + t * (0.25 + col.seed2)) * 0.55 +
      smoothNoise1(ang * (3.4 + col.seed2) - t * (0.18 + col.seed3)) * 0.25 +
      smoothNoise1(ang * (5.2 + col.seed3) + t * (0.12 + col.seed1)) * 0.15;

    let mul = 1.0 + base * amp;

    const L = col.limbCount;
    if (L > 0) {
      const ls = col.limbStrength * (0.35 + 0.65 * col.limbStyle) * (1.0 + warp * 0.55);
      for (let i = 0; i < L; i++) {
        const la = col.limbAngles[i];
        const width = col.limbWidths[i];
        const height = col.limbHeights[i] * (1.0 + warp * 0.45);
        const d = angDist(ang, la);
        const bulge = Math.exp(-(d * d) / (2 * width * width));
        mul += bulge * ls * height;
      }
    }

    return clamp(mul, 0.58, 1.80);
  }

  // ----- State -----
  const MAX_COLONIES = 8;
  const SPLIT_STEP_MC = 50_000;
  const START_MC = 25_000;

  const state = {
    buyers: 0,
    volume: 0,
    mcap: START_MC,
    nutrients: 0,

    colonies: [],
    selectedId: 1,

    // events / visuals
    shockwaves: [],
    heatPts: [],
    dust: [],
    t: 0,

    // warp globals
    slowMoT: 0,
    flashA: 0,
    bannerT: 0,
    bannerText: "",

    nextSplitAt: SPLIT_STEP_MC,
    lastMutationAt: performance.now(),

    focusOn: false
  };

  // ----- Shockwaves -----
  function shock(x, y, hue, strength = 1) {
    state.shockwaves.push({
      x, y, hue,
      r: 0,
      a: 0.85,
      speed: rand(240, 360) * (0.85 + 0.6 * strength),
      w: rand(2.4, 4.2) * (0.85 + 0.7 * strength)
    });
  }

  // ----- Heatmap -----
  function pushHeat(x, y, hue) {
    state.heatPts.push({ x, y, hue });
    if (state.heatPts.length > 1200) state.heatPts.splice(0, state.heatPts.length - 1200);
  }

  // ----- Worms -----
  function makeWorm(col, idx, boss = false) {
    const segCount = boss ? randi(46, 66) : randi(26, 46);
    const segLen = boss ? rand(7.9, 10.6) : rand(6.0, 9.0);
    const baseR  = boss ? rand(18, 26) : rand(11, 19);

    const huePick = col.palette[randi(0, col.palette.length - 1)];
    const hue = boss ? 52 : (huePick + rand(-16, 16));

    const head = { x: col.cx + rand(-30, 30), y: col.cy + rand(-30, 30) };
    const pts = [];
    for (let i = 0; i < segCount; i++) pts.push({ x: head.x, y: head.y });

    return {
      pts,
      segLen,
      baseR,
      hue,
      hueDrift: rand(-22, 22),
      sat: rand(78, 100),
      lum: rand(50, 66),
      phase: rand(0, 999),

      // different directions + lanes
      orbitDir: Math.random() < 0.5 ? -1 : 1,
      lane: rand(-1.15, 1.15),

      // steering bias per DNA style
      steer: { x: rand(-1, 1), y: rand(-1, 1) },
      steerT: rand(0.12, 1.0),

      energy: boss ? rand(0.80, 1.0) : rand(0.30, 0.98),
      boss,
      trail: []
    };
  }

  function makeColony(id, cx, cy) {
    const dna = pickDNA();
    const biome = BIOMES[randi(0, BIOMES.length - 1)];
    const palette = makePalette(biome.hue);

    const col = {
      id, cx, cy,
      vx: rand(-18, 18), vy: rand(-18, 18), // territory drift
      dna, biome, palette,

      worms: [],
      radius: rand(145, 200),

      seed1: rand(0.2, 1.2),
      seed2: rand(0.2, 1.2),
      seed3: rand(0.2, 1.2),
      spin: rand(-0.6, 0.6),

      warpFeed: 0,
      warpVol: 0,
      warpStorm: 0,

      auraPhase: rand(0, 999),
      limbStyle: rand(0.25, 1.0),
      limbCount: 0,
      limbStrength: 0,

      sig: "—",
      limbAngles: [],
      limbWidths: [],
      limbHeights: [],

      bossCooldown: 0
    };

    initSignatureLimbs(col);
    updateLimbs(col, state.mcap);

    const startW = randi(10, 15);
    for (let i = 0; i < startW; i++) col.worms.push(makeWorm(col, i, false));
    return col;
  }

  const totalWorms = () => state.colonies.reduce((a, c) => a + c.worms.length, 0);
  const selected = () => state.colonies.find(c => c.id === state.selectedId) || state.colonies[0];

  // ----- Spawn colonies at MC milestones -----
  function spawnMilestones() {
    while (state.colonies.length < MAX_COLONIES && state.mcap >= state.nextSplitAt) {
      const id = state.colonies.length + 1;

      const r = canvas.getBoundingClientRect();
      const viewCx = (r.width / 2) - cam.x;
      const viewCy = (r.height / 2) - cam.y;

      const dist = rand(340, 620);
      const ang = rand(0, TAU);
      const cx = viewCx + Math.cos(ang) * dist;
      const cy = viewCy + Math.sin(ang) * dist;

      const col = makeColony(id, cx, cy);
      state.colonies.push(col);

      showToast(`New Colony #${id} unlocked at ${fmtUSD(state.nextSplitAt)} MC`);
      logEvent("milestone", `New Colony #${id} • ${fmtUSD(state.nextSplitAt)} MC • silhouette: ${col.sig}`);
      shock(cx, cy, col.palette[0], 1.3);

      state.flashA = Math.max(state.flashA, 0.45);
      state.slowMoT = Math.max(state.slowMoT, 0.85);
      state.bannerT = 2.0;
      state.bannerText = `COLONY #${id} FORMED`;

      state.nextSplitAt += SPLIT_STEP_MC;
    }
  }

  // ----- HUD -----
  function updateHUD() {
    if (elBuyers) elBuyers.textContent = String(state.buyers);
    if (elVol) elVol.textContent = fmtUSD(state.volume);
    if (elMcap) elMcap.textContent = fmtUSD(state.mcap);
    if (elCols) elCols.textContent = String(state.colonies.length);
    if (elWorms) elWorms.textContent = String(totalWorms());

    const col = selected();
    if (fpSelected) fpSelected.textContent = `#${col?.id ?? 1}`;
    if (fpDNA) fpDNA.textContent = col?.dna?.name ?? "—";
    if (fpBiome) fpBiome.textContent = col?.biome?.name ?? "—";
    if (fpStyle) fpStyle.textContent = col?.sig ? `${col.sig} / ${col.dna.style}` : "—";
  }

  // ----- Events -----
  function feed(mult = 1) {
    const buyersAdd = Math.random() < 0.75 ? 1 : 2;
    const volAdd = rand(220, 980) * mult;
    const mcAdd = rand(700, 2800) * mult;

    state.buyers += buyersAdd;
    state.volume += volAdd;
    state.mcap += mcAdd;

    state.nutrients += (buyersAdd * 30) + (volAdd * 0.032) + (mcAdd * 0.020);

    const col = selected();
    col.warpFeed = Math.min(1, col.warpFeed + 0.55 * mult);
    if (volAdd > 900) col.warpVol = Math.min(1, col.warpVol + 0.60);

    shock(col.cx, col.cy, col.palette[0], 0.9);

    // chance boss on bigger buys
    col.bossCooldown = Math.max(0, col.bossCooldown - 1);
    if (mult >= 1.6 && col.bossCooldown <= 0 && Math.random() < 0.55) {
      col.bossCooldown = 8;
      col.worms.unshift(makeWorm(col, col.worms.length, true));
      logEvent("boss", `ALPHA WORM emerged in Colony #${col.id}`);
      showToast("ALPHA WORM EMERGED");
      shock(col.cx, col.cy, 55, 1.8);
      state.flashA = Math.max(state.flashA, 0.45);
    }

    logEvent("info", `Buy • +${buyersAdd} buyers • +${fmtUSD(volAdd)} vol • +${fmtUSD(mcAdd)} MC`);
    updateHUD();
  }

  function sellOff() {
    const col = selected();
    const dropVol = rand(800, 2400);
    const dropMc = rand(1200, 4200);

    state.volume = Math.max(0, state.volume - dropVol);
    state.mcap = Math.max(1_000, state.mcap - dropMc);
    state.nutrients = Math.max(0, state.nutrients - rand(120, 260));

    // scatter: flip directions + push lanes
    for (const w of col.worms) {
      if (Math.random() < 0.55) w.orbitDir *= -1;
      w.lane = clamp(w.lane + rand(-0.6, 0.6), -1.25, 1.25);
      w.steer.x = clamp(w.steer.x + rand(-1.2, 1.2), -2.2, 2.2);
      w.steer.y = clamp(w.steer.y + rand(-1.2, 1.2), -2.2, 2.2);
    }

    col.warpStorm = Math.min(1, col.warpStorm + 0.65);
    showToast("Sell-off shock • colony destabilized");
    logEvent("info", `Sell-off • −${fmtUSD(dropVol)} vol • −${fmtUSD(dropMc)} MC`);
    shock(col.cx, col.cy, 300, 1.25);
    updateHUD();
  }

  function volumeStorm() {
    const col = selected();
    col.warpVol = Math.min(1, col.warpVol + 1.0);
    col.warpStorm = Math.min(1, col.warpStorm + 0.85);

    state.bannerT = 2.0;
    state.bannerText = "VOLUME STORM";
    state.flashA = Math.max(state.flashA, 0.35);

    showToast("Volume Storm • mutations spike");
    logEvent("milestone", `Volume Storm in Colony #${col.id}`);
    shock(col.cx, col.cy, col.palette[2], 1.4);
  }

  function mutateBurst() {
    const col = selected();
    const n = Math.min(4, col.worms.length);
    for (let i = 0; i < n; i++) {
      const w = col.worms[randi(0, col.worms.length - 1)];
      w.hueDrift += rand(-22, 22);
      w.sat = clamp(w.sat + rand(-12, 12), 70, 100);
      w.lum = clamp(w.lum + rand(-10, 10), 45, 70);
      if (Math.random() < 0.25) w.orbitDir *= -1;
      w.lane = clamp(w.lane + rand(-0.4, 0.4), -1.25, 1.25);
      w.segLen = clamp(w.segLen * rand(0.92, 1.08), 5.8, 10.8);
      w.baseR  = clamp(w.baseR  * rand(0.92, 1.10), 10, 28);
    }
    col.warpStorm = Math.min(1, col.warpStorm + 1.0);
    state.nutrients += 160;
    showToast("Mutation burst");
    logEvent("mutation", `Mutation burst • Colony #${col.id}`);
    shock(col.cx, col.cy, 292, 1.25);
    updateHUD();
  }

  // ----- Focus / Zoom / Capture -----
  function setFocus(on) {
    state.focusOn = on;
    if (btnFocus) btnFocus.textContent = on ? "Focus: On" : "Focus: Off";
    if (focusPanel) focusPanel.classList.toggle("on", on);
    showToast(on ? "Focus mode enabled" : "Focus mode disabled");
  }

  function zoomBy(f) {
    cam.zoom = clamp(cam.zoom * f, cam.minZoom, cam.maxZoom);
  }

  function capturePNG() {
    // draw once more with overlay banner
    const r = canvas.getBoundingClientRect();

    // Use current canvas pixels (already drawn). Add overlay via temp canvas.
    const tmp = document.createElement("canvas");
    tmp.width = canvas.width;
    tmp.height = canvas.height;
    const tctx = tmp.getContext("2d");

    tctx.drawImage(canvas, 0, 0);

    // overlay text (scaled to DPR)
    const dpr = canvas.width / r.width;
    tctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const pad = 14;
    const w = Math.min(r.width - 26, 560);
    const x = (r.width - w) / 2;
    const y = 18;

    tctx.beginPath();
    roundRect(tctx, x, y, w, 56, 16);
    tctx.fillStyle = "rgba(0,0,0,.45)";
    tctx.fill();
    tctx.strokeStyle = "rgba(255,255,255,.14)";
    tctx.stroke();

    tctx.fillStyle = "rgba(233,238,247,.92)";
    tctx.font = "900 13px system-ui,-apple-system";
    tctx.fillText("WORM COLONY", x + pad, y + 22);

    tctx.fillStyle = "rgba(233,238,247,.82)";
    tctx.font = "800 12px system-ui,-apple-system";
    const col = selected();
    tctx.fillText(`$WORM • ${fmtUSD(state.mcap)} MC • Colony #${col.id}`, x + pad, y + 42);

    const url = tmp.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = "worm-colony.png";
    document.body.appendChild(a);
    a.click();
    a.remove();

    showToast("Captured PNG");
  }

  function roundRect(c, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
  }

  // ----- Background (parallax stars + neon grid) -----
  const stars = Array.from({ length: 220 }, () => ({
    x: rand(-2000, 2000),
    y: rand(-2000, 2000),
    r: rand(0.6, 1.8),
    a: rand(0.08, 0.22),
    tw: rand(0, 999)
  }));

  function drawBackground(r) {
    const viewCx = (r.width / 2) - cam.x;
    const viewCy = (r.height / 2) - cam.y;

    // Parallax stars (slower than world)
    ctx.save();
    ctx.translate(r.width / 2, r.height / 2);
    ctx.scale(1, 1);
    ctx.translate(-r.width / 2, -r.height / 2);

    // subtle grid anchored to world
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.strokeStyle = "rgba(120,255,210,.10)";
    ctx.lineWidth = 1;

    const grid = 90;
    const ox = (-(cam.x) * cam.zoom) % (grid * cam.zoom);
    const oy = (-(cam.y) * cam.zoom) % (grid * cam.zoom);

    for (let x = ox; x < r.width; x += grid * cam.zoom) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, r.height);
      ctx.stroke();
    }
    for (let y = oy; y < r.height; y += grid * cam.zoom) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(r.width, y);
      ctx.stroke();
    }
    ctx.restore();

    // stars
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const s of stars) {
      const px = (s.x - viewCx) * 0.06 + r.width * 0.5;
      const py = (s.y - viewCy) * 0.06 + r.height * 0.5;
      const tw = 0.5 + 0.5 * Math.sin(state.t * 0.8 + s.tw);
      ctx.beginPath();
      ctx.arc(px, py, s.r * (0.75 + tw * 0.5), 0, TAU);
      ctx.fillStyle = `rgba(255,255,255,${s.a})`;
      ctx.fill();
    }
    ctx.restore();

    ctx.restore();
  }

  // ----- Dust particles -----
  function spawnDust(col) {
    const hue = col.biome.dust;
    state.dust.push({
      x: col.cx + rand(-col.radius, col.radius),
      y: col.cy + rand(-col.radius, col.radius),
      vx: rand(-14, 14),
      vy: rand(-14, 14),
      a: rand(0.10, 0.20),
      r: rand(0.8, 2.2),
      hue
    });
    if (state.dust.length > 260) state.dust.splice(0, state.dust.length - 260);
  }

  // ----- Drawing helpers -----
  function drawHeat() {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const start = Math.max(0, state.heatPts.length - 520);
    for (let i = start; i < state.heatPts.length; i++) {
      const p = state.heatPts[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, 14, 0, TAU);
      ctx.fillStyle = hsl(p.hue, 95, 62, 0.035);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawAura(col, sel) {
    const warp = col.warpFeed + col.warpVol + col.warpStorm;
    const pulse = 0.5 + 0.5 * Math.sin(state.t * (0.9 + col.dna.chaos * 0.35) + col.auraPhase);
    const rBase = col.radius * (0.92 + warp * 0.08);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    // outer mist
    ctx.beginPath();
    ctx.arc(col.cx, col.cy, rBase * (1.14 + pulse * 0.04), 0, TAU);
    ctx.fillStyle = hsl(col.biome.hue, 96, 56, 0.055 + warp * 0.075 + (sel ? 0.05 : 0));
    ctx.fill();

    // inner color
    ctx.beginPath();
    ctx.arc(col.cx, col.cy, rBase * (0.76 + pulse * 0.03), 0, TAU);
    ctx.fillStyle = hsl(col.palette[0], 98, 60, 0.045 + warp * 0.055);
    ctx.fill();

    // storm aura
    if (col.warpStorm > 0.01) {
      ctx.beginPath();
      ctx.arc(col.cx, col.cy, rBase * (1.22 + pulse * 0.06), 0, TAU);
      ctx.fillStyle = hsl(292, 98, 64, 0.03 + col.warpStorm * 0.09);
      ctx.fill();
    }

    // selection ring gradient
    if (sel) {
      const g = ctx.createRadialGradient(col.cx, col.cy, rBase * 0.75, col.cx, col.cy, rBase * 1.34);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(0.55, hsl(col.palette[2], 98, 62, 0.10));
      g.addColorStop(1, hsl(col.palette[0], 98, 62, 0.18));
      ctx.beginPath();
      ctx.arc(col.cx, col.cy, rBase * 1.28, 0, TAU);
      ctx.fillStyle = g;
      ctx.fill();
    }

    ctx.restore();
  }

  function drawColony(col, sel) {
    drawAura(col, sel);

    ctx.beginPath();
    const steps = 96;
    for (let i = 0; i <= steps; i++) {
      const ang = (i / steps) * TAU + col.spin * state.t * 0.35;
      const mul = blobMul(col, ang, state.t * 0.6);
      const rr = (col.radius * 0.68) * mul;
      const x = col.cx + Math.cos(ang) * rr;
      const y = col.cy + Math.sin(ang) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();

    const warp = col.warpFeed + col.warpVol + col.warpStorm;
    ctx.strokeStyle = hsl(col.palette[0], 95, 62, 0.10 + warp * 0.12 + (sel ? 0.06 : 0));
    ctx.lineWidth = sel ? 2.8 : 2.0;
    ctx.shadowColor = hsl(col.palette[0], 95, 62, 0.20 + warp * 0.16);
    ctx.shadowBlur = sel ? (22 + warp * 10) : (14 + warp * 8);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "rgba(0,0,0,0.06)";
    ctx.fill();

    // core ring
    ctx.beginPath();
    ctx.arc(col.cx, col.cy, col.radius * 0.34, 0, TAU);
    ctx.strokeStyle = hsl(col.palette[2], 90, 60, sel ? 0.20 : 0.12);
    ctx.lineWidth = sel ? 2.4 : 1.7;
    ctx.stroke();

    // badge text
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "rgba(233,238,247,.86)";
    ctx.font = "900 12px system-ui,-apple-system";
    ctx.fillText(`Colony #${col.id}`, col.cx - 38, col.cy - col.radius * 0.76 - 24);
    ctx.fillStyle = "rgba(233,238,247,.62)";
    ctx.font = "800 11px system-ui,-apple-system";
    ctx.fillText(`${col.sig} • ${col.dna.style}`, col.cx - 48, col.cy - col.radius * 0.76 - 8);
    ctx.restore();
  }

  function drawWorm(w, col) {
    const pts = w.pts;

    // boss trail
    if (w.boss && w.trail.length > 2) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.beginPath();
      ctx.moveTo(w.trail[0].x, w.trail[0].y);
      for (let i = 1; i < w.trail.length; i++) ctx.lineTo(w.trail[i].x, w.trail[i].y);
      ctx.strokeStyle = hsl(55, 98, 62, 0.18);
      ctx.lineWidth = w.baseR * 0.42;
      ctx.shadowColor = hsl(55, 98, 62, 0.34);
      ctx.shadowBlur = 18;
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // glow spine
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);

    const glowA = w.boss ? 0.20 : 0.11;
    ctx.strokeStyle = hsl(w.hue, w.sat, 62, glowA);
    ctx.lineWidth = w.baseR * (w.boss ? 0.72 : 0.55);
    ctx.shadowColor = hsl(w.hue, w.sat, 62, w.boss ? 0.36 : 0.24);
    ctx.shadowBlur = w.boss ? 22 : 16;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.shadowBlur = 0;

    // bead segments
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const t = i / (pts.length - 1);
      const rad = lerp(w.baseR * 0.92, w.baseR * 0.18, t);
      const alpha = lerp(0.92, 0.18, t);

      const mixHue = (w.hue * 0.74 + col.biome.hue * 0.26) % 360;

      ctx.beginPath();
      ctx.arc(p.x, p.y, rad, 0, TAU);
      ctx.fillStyle = hsl((mixHue + t * 12) % 360, w.sat, lerp(w.lum + 6, w.lum - 2, t), alpha);
      ctx.fill();

      if (i % 5 === 0) {
        ctx.beginPath();
        ctx.arc(p.x - rad * 0.25, p.y - rad * 0.25, rad * 0.28, 0, TAU);
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        ctx.fill();
      }
    }
  }

  function drawShockwaves() {
    for (let i = state.shockwaves.length - 1; i >= 0; i--) {
      const s = state.shockwaves[i];
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.strokeStyle = hsl(s.hue, 95, 62, s.a);
      ctx.lineWidth = s.w;
      ctx.shadowColor = hsl(s.hue, 95, 62, s.a * 0.55);
      ctx.shadowBlur = 18;
      ctx.stroke();
      ctx.shadowBlur = 0;

      if (s.a <= 0) state.shockwaves.splice(i, 1);
    }
  }

  function drawVignette(r) {
    const g = ctx.createRadialGradient(
      r.width * 0.55, r.height * 0.55, 60,
      r.width * 0.55, r.height * 0.55, Math.max(r.width, r.height)
    );
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,0.58)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, r.width, r.height);
  }

  function drawBanner(r) {
    if (state.bannerT <= 0) return;
    const t = clamp(state.bannerT / 2.0, 0, 1);
    const a = clamp(1 - (1 - t) * 1.2, 0, 1);
    const w = Math.min(r.width - 26, 560);
    const x = (r.width - w) / 2;
    const y = 16 + (1 - a) * -16;

    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.globalAlpha = a;

    roundRect(ctx, x, y, w, 52, 16);
    ctx.fillStyle = "rgba(0,0,0,0.40)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + 16, y + 10);
    ctx.lineTo(x + w - 16, y + 10);
    ctx.strokeStyle = "rgba(120,255,210,0.26)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "rgba(233,238,247,0.92)";
    ctx.font = "900 13px system-ui,-apple-system";
    ctx.fillText("EVENT", x + 14, y + 22);

    ctx.fillStyle = "rgba(233,238,247,0.82)";
    ctx.font = "800 13px system-ui,-apple-system";
    ctx.fillText(state.bannerText || "", x + 14, y + 40);

    ctx.restore();
  }

  function drawFlash(r) {
    if (state.flashA <= 0) return;
    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.fillStyle = `rgba(120, 220, 255, ${state.flashA * 0.26})`;
    ctx.fillRect(0,0,r.width,r.height);
    ctx.restore();
  }

  // ----- Simulation step -----
  function step(dtRaw) {
    const slow = state.slowMoT > 0 ? 0.42 : 1;
    const dt = dtRaw * slow;

    state.t += dt;
    if (state.slowMoT > 0) state.slowMoT = Math.max(0, state.slowMoT - dtRaw);
    if (state.flashA > 0) state.flashA = Math.max(0, state.flashA - dtRaw * 1.6);
    if (state.bannerT > 0) state.bannerT = Math.max(0, state.bannerT - dtRaw);

    // toast timer
    if (toastT > 0) {
      toastT = Math.max(0, toastT - dtRaw);
      if (toastT === 0 && toast) toast.classList.remove("on");
    }

    // nutrients drift
    state.nutrients = Math.max(0, state.nutrients - 32 * dt);
    state.nutrients += (state.buyers * 0.018 + state.volume * 0.000009 + state.mcap * 0.0000045) * dt;

    // spawn colony milestones
    spawnMilestones();

    // random micro mutation
    if (Math.random() < (0.0012 + clamp(state.nutrients / 1400, 0, 1) * 0.012) && (performance.now() - state.lastMutationAt) > 900) {
      state.lastMutationAt = performance.now();
      const col = state.colonies[randi(0, state.colonies.length - 1)];
      if (col && col.worms.length) {
        const w = col.worms[randi(0, col.worms.length - 1)];
        w.hueDrift += rand(-22, 22);
        col.warpStorm = Math.min(1, col.warpStorm + 0.7);
        logEvent("mutation", `Chromatic mutation • Colony #${col.id}`);
        shock(col.cx, col.cy, w.hue, 1.0);
      }
    }

    // update colonies
    for (const col of state.colonies) {
      updateLimbs(col, state.mcap);

      // territory drift (subtle)
      const driftAmp = 0.28 + col.dna.chaos * 0.32;
      col.vx = clamp(col.vx + rand(-6, 6) * dt * driftAmp, -26, 26);
      col.vy = clamp(col.vy + rand(-6, 6) * dt * driftAmp, -26, 26);
      col.cx += col.vx * dt * 0.20;
      col.cy += col.vy * dt * 0.20;

      // warp decay
      col.warpFeed = Math.max(0, col.warpFeed - dt / 6.5);
      col.warpVol  = Math.max(0, col.warpVol - dt / 10);
      col.warpStorm= Math.max(0, col.warpStorm - dt / 8);

      const warp = col.warpFeed + col.warpVol + col.warpStorm;
      const targetR = clamp(145 + state.nutrients * 0.020 + warp * 14, 125, 280);
      col.radius = lerp(col.radius, targetR, 0.03);

      // dust
      if (Math.random() < 0.16) spawnDust(col);

      // worms
      for (const w of col.worms) {
        const pts = w.pts;
        const head = pts[0];

        pushHeat(head.x, head.y, w.hue);

        // hue drift for diversity
        w.hue = (w.hue + (w.hueDrift * dt * 0.02) + Math.sin(state.t * 0.25 + w.phase) * 0.6 * dt) % 360;

        // boss trail
        if (w.boss) {
          w.trail.unshift({ x: head.x, y: head.y });
          if (w.trail.length > 22) w.trail.pop();
          if (Math.random() < 0.01) shock(head.x, head.y, 55, 1.2);
        }

        // steering changes
        w.steerT -= dt;
        if (w.steerT <= 0) {
          w.steerT = rand(0.12, 1.15) * lerp(1.0, 0.60, col.dna.chaos);
          w.steer.x = clamp(lerp(w.steer.x, rand(-1, 1), 0.75), -2.2, 2.2);
          w.steer.y = clamp(lerp(w.steer.y, rand(-1, 1), 0.75), -2.2, 2.2);
          if (!w.boss && Math.random() < 0.08 * col.dna.chaos) w.orbitDir *= -1;
        }

        // move along irregular boundary (NOT circles)
        const cx = col.cx, cy = col.cy;
        const dx0 = head.x - cx;
        const dy0 = head.y - cy;
        const ang0 = Math.atan2(dy0, dx0);

        const angSpin = col.spin * state.t * 0.35;
        const mul = blobMul(col, ang0 + angSpin, state.t);
        const laneScale = 0.58 + (w.lane * 0.12);
        const boundary = (col.radius * laneScale) * mul;

        const bx = cx + Math.cos(ang0) * boundary;
        const by = cy + Math.sin(ang0) * boundary;

        // tangent + dna styles
        const tx = -Math.sin(ang0) * w.orbitDir;
        const ty =  Math.cos(ang0) * w.orbitDir;

        const warpBoost = 1.0 + (col.warpVol * 0.85 + col.warpStorm * 1.05);
        const bossBoost = w.boss ? 1.55 : 1.0;

        // style shaping
        let slide = (0.9 + col.dna.chaos) * warpBoost;
        let pull  = (0.62 + (col.dna.style === "GLIDE" ? 0.10 : 0)) * warpBoost;
        let steer = (0.62 + col.dna.chaos) * warpBoost;

        // special DNA movement signatures
        const phasePush = Math.sin(state.t * (1.2 + col.dna.wiggle) + w.phase) * 10;
        let extraX = 0, extraY = 0;

        if (col.dna.style === "SPIRAL") {
          extraX += Math.cos(state.t * 1.4 + w.phase) * 18;
          extraY += Math.sin(state.t * 1.4 + w.phase) * 18;
        } else if (col.dna.style === "ARC") {
          extraX += Math.cos(state.t * 0.9 + w.phase) * 26;
          extraY += Math.sin(state.t * 0.9 + w.phase) * 10;
        } else if (col.dna.style === "DASH") {
          slide *= 1.18;
          steer *= 1.12;
          if (Math.random() < 0.006) shock(head.x, head.y, col.palette[1], 0.8);
        } else if (col.dna.style === "ZIGZAG") {
          extraX += Math.sign(Math.sin(state.t * 3.1 + w.phase)) * 20;
          extraY += Math.sign(Math.cos(state.t * 2.7 + w.phase)) * 16;
        }

        const spd = (46 + w.energy * 62) * col.dna.speed * bossBoost;

        const toBx = (bx - head.x);
        const toBy = (by - head.y);

        const vx =
          toBx * pull +
          tx * slide * (70 + phasePush) +
          w.steer.x * steer * 35 +
          extraX * 0.30;

        const vy =
          toBy * pull +
          ty * slide * (70 - phasePush) +
          w.steer.y * steer * 35 +
          extraY * 0.30;

        const vd = Math.max(1e-6, hypot(vx, vy));
        head.x += (vx / vd) * spd * dt;
        head.y += (vy / vd) * spd * dt;

        // keep near colony
        const ddx = head.x - cx;
        const ddy = head.y - cy;
        const d = hypot(ddx, ddy);
        const outer = col.radius * (1.36 + col.warpStorm * 0.12);
        if (d > outer) {
          head.x = lerp(head.x, cx + (ddx / d) * outer, 0.12);
          head.y = lerp(head.y, cy + (ddy / d) * outer, 0.12);
        }

        // segments follow (with wiggle)
        for (let i = 1; i < pts.length; i++) {
          const p = pts[i];
          const prev = pts[i - 1];
          const ddx2 = p.x - prev.x;
          const ddy2 = p.y - prev.y;
          const dist = Math.max(1e-6, hypot(ddx2, ddy2));

          const want = w.segLen;
          const pullSeg = (dist - want) * 0.58;
          p.x -= (ddx2 / dist) * pullSeg;
          p.y -= (ddy2 / dist) * pullSeg;

          const wob = (
            Math.sin(state.t * (2.2 + col.dna.wiggle) + w.phase + i * 0.33) +
            Math.sin(state.t * (1.6 + col.dna.wiggle * 0.6) + i * 0.21)
          ) * 0.18;

          p.x += (-ddy2 / dist) * wob * w.baseR * 0.06;
          p.y += ( ddx2 / dist) * wob * w.baseR * 0.06;
        }
      }

      // worm growth
      const softCap = 20 + Math.floor((state.nutrients / 450));
      const maxW = clamp(softCap, 18, 52);
      if (col.worms.length < maxW && state.nutrients > 220 && Math.random() < 0.010) {
        col.worms.push(makeWorm(col, col.worms.length, false));
        state.nutrients -= 35;
      }
    }

    // dust update
    for (let i = state.dust.length - 1; i >= 0; i--) {
      const d = state.dust[i];
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.a -= dt * 0.03;
      if (d.a <= 0) state.dust.splice(i, 1);
    }

    // shock update
    for (const s of state.shockwaves) {
      s.r += s.speed * dt;
      s.a -= 0.60 * dt;
    }

    // focus camera lock
    if (state.focusOn) {
      const col = selected();
      const r = canvas.getBoundingClientRect();
      cam.x = lerp(cam.x, cam.x + ((r.width / 2) - col.cx), 0.08);
      cam.y = lerp(cam.y, cam.y + ((r.height / 2) - col.cy), 0.08);
    }

    updateHUD();
  }

  // ----- Draw -----
  function draw() {
    const r = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);

    // Background UI space
    drawBackground(r);

    // World transform
    ctx.save();
    ctx.translate(r.width / 2, r.height / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-r.width / 2 + cam.x, -r.height / 2 + cam.y);

    // heatmap behind
    drawHeat();

    // dust
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const d of state.dust) {
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, TAU);
      ctx.fillStyle = hsl(d.hue, 95, 62, d.a);
      ctx.fill();
    }
    ctx.restore();

    // colonies + worms
    for (const col of state.colonies) {
      const sel = col.id === state.selectedId;
      drawColony(col, sel);
      for (const w of col.worms) drawWorm(w, col);
    }

    // shockwaves
    drawShockwaves();

    ctx.restore();

    // overlays
    drawVignette(r);
    drawBanner(r);
    drawFlash(r);
  }

  // ----- Input (pan/zoom/select) -----
  canvas.style.touchAction = "none";
  let activePointers = new Map();
  let isPanning = false;
  let panStart = { x: 0, y: 0, camX: 0, camY: 0 };
  let pinchStart = null;
  let lastTapTime = 0;

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
    state.selectedId = col.id;
    logEvent("info", `Selected Colony #${col.id} • DNA: ${col.dna.name} • ${col.biome.name}`);
    showToast(`Selected Colony #${col.id}`);
    shock(col.cx, col.cy, col.palette[0], 0.9);
    updateHUD();
  }

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

    if (isPanning && !state.focusOn) {
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
        const col = selected();
        const r = canvas.getBoundingClientRect();
        cam.x = cam.x + ((r.width / 2) - col.cx);
        cam.y = cam.y + ((r.height / 2) - col.cy);
        showToast("Centered");
        shock(col.cx, col.cy, col.palette[2], 0.9);
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

  // ----- Buttons -----
  btnFeed?.addEventListener("click", () => feed(1));
  btnSmall?.addEventListener("click", () => feed(0.6));
  btnBig?.addEventListener("click", () => { feed(1.85); state.bannerT = 2.0; state.bannerText = "WHALE BUY"; state.flashA = Math.max(state.flashA, 0.45); state.slowMoT = 0.85; });
  btnSell?.addEventListener("click", () => { state.bannerT = 2.0; state.bannerText = "SELL-OFF"; state.flashA = Math.max(state.flashA, 0.28); sellOff(); });
  btnStorm?.addEventListener("click", () => volumeStorm());
  btnMutate?.addEventListener("click", () => mutateBurst());
  btnReset?.addEventListener("click", () => init(true));

  btnFocus?.addEventListener("click", () => {
    state.focusOn = !state.focusOn;
    btnFocus.textContent = state.focusOn ? "Focus: On" : "Focus: Off";
    focusPanel?.classList.toggle("on", state.focusOn);
    showToast(state.focusOn ? "Focus mode enabled" : "Focus mode disabled");
  });

  btnZoomIn?.addEventListener("click", () => zoomBy(1.15));
  btnZoomOut?.addEventListener("click", () => zoomBy(0.87));
  btnCapture?.addEventListener("click", () => capturePNG());

  function zoomBy(f) {
    cam.zoom = clamp(cam.zoom * f, cam.minZoom, cam.maxZoom);
  }

  // ----- Capture -----
  function capturePNG() {
    const r = canvas.getBoundingClientRect();

    const tmp = document.createElement("canvas");
    tmp.width = canvas.width;
    tmp.height = canvas.height;
    const tctx = tmp.getContext("2d");
    tctx.drawImage(canvas, 0, 0);

    const dpr = canvas.width / r.width;
    tctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const w = Math.min(r.width - 26, 560);
    const x = (r.width - w) / 2;
    const y = 18;

    roundRect(tctx, x, y, w, 56, 16);
    tctx.fillStyle = "rgba(0,0,0,.45)";
    tctx.fill();
    tctx.strokeStyle = "rgba(255,255,255,.14)";
    tctx.stroke();

    tctx.fillStyle = "rgba(233,238,247,.92)";
    tctx.font = "900 13px system-ui,-apple-system";
    tctx.fillText("WORM COLONY", x + 14, y + 22);

    tctx.fillStyle = "rgba(233,238,247,.82)";
    tctx.font = "800 12px system-ui,-apple-system";
    const col = selected();
    tctx.fillText(`$WORM • ${fmtUSD(state.mcap)} MC • Colony #${col.id}`, x + 14, y + 42);

    const url = tmp.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = "worm-colony.png";
    document.body.appendChild(a);
    a.click();
    a.remove();

    showToast("Captured PNG");
  }

  // ----- roundRect polyfill -----
  function roundRect(c, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
  }

  // ----- Init -----
  function init(clearLog = false) {
    resize();

    state.buyers = 0;
    state.volume = 0;
    state.mcap = START_MC;
    state.nutrients = 0;

    state.colonies = [];
    state.selectedId = 1;

    state.shockwaves = [];
    state.heatPts = [];
    state.dust = [];

    state.t = 0;
    state.slowMoT = 0;
    state.flashA = 0;
    state.bannerT = 0;
    state.bannerText = "";
    state.nextSplitAt = SPLIT_STEP_MC;
    state.lastMutationAt = performance.now();
    state.focusOn = false;

    cam.x = 0; cam.y = 0; cam.zoom = 1;

    const r = canvas.getBoundingClientRect();
    const c1 = makeColony(1, r.width / 2, r.height / 2);
    state.colonies.push(c1);

    if (clearLog && elLog) elLog.innerHTML = "";
    logEvent("info", "Ready • Tap colonies • Drag pan • Pinch zoom • Double tap center");
    logEvent("info", "Events enabled: Whale Buy / Sell-off / Volume Storm");
    showToast("Worm Colony ready");
    updateHUD();
  }

  // ----- Loop -----
  let last = performance.now();
  function loop(t) {
    const dt = Math.min(0.033, (t - last) / 1000);
    last = t;
    step(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // ----- Boot -----
  init(false);
  requestAnimationFrame(loop);
})();

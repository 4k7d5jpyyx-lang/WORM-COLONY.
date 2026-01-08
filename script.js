(() => {
  const $ = (id) => document.getElementById(id);

  const canvas = $("c");
  const ctx = canvas.getContext("2d");

  const elBuyers = $("buyers");
  const elVol = $("vol");
  const elMcap = $("mcap");
  const elCols = $("cols");
  const elWorms = $("worms");
  const logEl = $("log");

  const btnFeed = $("feedBtn");
  const btnReset = $("resetBtn");
  const btnSmall = $("smallFeed");
  const btnBig = $("bigFeed");
  const btnMutate = $("mutateBtn");

  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp  = (a,b,t)=>a+(b-a)*t;
  const rand  = (a=1,b)=> (b===undefined ? Math.random()*a : a+(b-a)*Math.random());
  const TAU   = Math.PI * 2;

  const fmtMoney = (n) => {
    if (n >= 1e9) return `$${(n/1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n/1e6).toFixed(2)}M`;
    if (n >= 1e3) return `$${Math.round(n).toLocaleString()}`;
    return `$${Math.round(n)}`;
  };

  // ---------- Canvas DPI
  function resize(){
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width  = Math.max(1, Math.floor(r.width  * dpr));
    canvas.height = Math.max(1, Math.floor(r.height * dpr));
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  addEventListener("resize", resize, { passive:true });
  resize();

  // ---------- Log
  function logEvent(type, msg){
    if (!logEl) return;
    if (logEl.dataset.init !== "1"){
      logEl.dataset.init = "1";
      logEl.innerHTML = "";
    }

    const stamp = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    const pill =
      type === "mutation" ? `<span class="pill mutation">MUTATION</span>` :
      type === "split" ? `<span class="pill split">SPLIT</span>` :
      type === "milestone" ? `<span class="pill milestone">MILESTONE</span>` :
      `<span class="pill">INFO</span>`;

    const row = document.createElement("div");
    row.className = "evt";
    row.innerHTML = `
      <div class="t">${stamp} ${pill}</div>
      <div class="m">${msg}</div>
    `;
    logEl.prepend(row);

    const items = logEl.querySelectorAll(".evt");
    if (items.length > 18) items[items.length - 1].remove();
  }

  // ---------- World state
  const state = {
    buyers: 0,
    volume: 0,
    mcap: 25000,
    colonies: 1,
    nutrients: 0,
    t: 0,

    // ✅ NEW: milestone gate starts at 0 so first split triggers at 50k
    lastMcapGate: 0,

    // interaction
    selectedColonyId: 1
  };

  const LIMITS = {
    maxColonies: 8,
    maxWorms: 260
  };

  const GROW = {
    nutrientsPerBuyDollar: 0.10,
    volRateBase: 16,
    volRateMcapFactor: 0.35,
    nutrientsFromVol: 0.0025,

    wormSpawnCost: 55,
    wormSpawnMinGap: 0.16,

    baseRadius: 70,
    radiusPerLog: 22,

    // random splitting (kept, but mcap splits will now drive colonies)
    splitMinNutrients: 70,
    splitChanceBase: 0.020,      // reduced a bit since mcap now forces splits
    splitNutrientCost: 55,
    randomSplitImpulse: 0.0014,  // reduced to avoid too many colonies pre-50k

    // ✅ NEW: exact colony spawns at 50k increments
    mcapSplitStep: 50000
  };

  // ---------- Noise
  function hash1(n){ const s=Math.sin(n)*43758.5453123; return s-Math.floor(s); }
  function noise1(x){
    const i=Math.floor(x), f=x-i;
    const a=hash1(i*12.9898), b=hash1((i+1)*12.9898);
    const u=f*f*(3-2*f);
    return a+(b-a)*u;
  }
  function fbm(x){
    let v=0, amp=0.55, f=1.0;
    for(let k=0;k<4;k++){
      v += (noise1(x*f)*2-1)*amp;
      f *= 2.05;
      amp *= 0.55;
    }
    return v;
  }

  // ---------- Colony DNA
  function makeColonyDNA(id){
    const base = 145 + id*11 + rand(-6, 6);
    const span = 55 + rand(-10, 10);

    const temper = clamp(rand(0.25, 1.0), 0.25, 1.0);
    const wiggle = clamp(rand(0.25, 1.0), 0.25, 1.0);
    const splitAffinity = clamp(rand(0.25, 1.0), 0.25, 1.0);

    const label =
      temper > 0.78 ? "CHAOTIC" :
      temper > 0.55 ? "AGGRESSIVE" :
      "STABLE";

    return {
      hueA: base % 360,
      hueB: (base + span) % 360,
      temper,
      wiggle,
      splitAffinity,
      label
    };
  }

  // ---------- Shockwaves
  const shockwaves = [];
  function addShockwave(x,y, hueA, hueB, strength=1, kind="event"){
    shockwaves.push({ x, y, t: 0, dur: 1.1 + strength*0.35, strength, hueA, hueB, kind });
  }
  function stepShockwaves(dt){
    for (let i=shockwaves.length-1;i>=0;i--){
      shockwaves[i].t += dt;
      if (shockwaves[i].t >= shockwaves[i].dur) shockwaves.splice(i,1);
    }
  }
  function drawShockwaves(){
    for (const s of shockwaves){
      const p = clamp(s.t / s.dur, 0, 1);
      const ease = 1 - Math.pow(1-p, 3);
      const radius = 20 + ease * (260 + s.strength*140);
      const alpha = (1-p) * (0.22 + s.strength*0.18);

      ctx.lineWidth = 2.4 + (1-p)*2.0;
      const grad = ctx.createLinearGradient(s.x-radius, s.y, s.x+radius, s.y);
      grad.addColorStop(0, `hsla(${s.hueA},95%,65%,${alpha})`);
      grad.addColorStop(1, `hsla(${s.hueB},95%,65%,${alpha})`);
      ctx.strokeStyle = grad;
      ctx.beginPath();
      ctx.arc(s.x, s.y, radius, 0, TAU);
      ctx.stroke();

      const g2 = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, radius*0.8);
      g2.addColorStop(0, `hsla(${s.hueA},95%,65%,${alpha*0.55})`);
      g2.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, radius*0.8, 0, TAU);
      ctx.fill();
    }
  }

  // ---------- Colonies
  const colonies = [{
    id: 1,
    x: canvas.getBoundingClientRect().width/2,
    y: canvas.getBoundingClientRect().height/2,
    r: GROW.baseRadius,
    dna: makeColonyDNA(1),
    createdAt: performance.now()
  }];

  function getCol(id){
    return colonies.find(c => c.id === id) || colonies[0];
  }

  // ---------- Worms
  const worms = [];
  let spawnCooldown = 0;

  function makeWorm(colonyId, mutated=false){
    const c = getCol(colonyId);
    const segs = Math.floor(rand(26, 48));
    const pts  = [];
    const seed = rand(0, 9999);
    const ang  = rand(0, TAU);

    const sx = c.x + Math.cos(ang) * rand(8, 22);
    const sy = c.y + Math.sin(ang) * rand(8, 22);

    for (let i=0;i<segs;i++){
      const u=i/(segs-1);
      pts.push({
        x: sx + Math.cos(ang + u*1.0) * u * rand(10, 26),
        y: sy + Math.sin(ang + u*1.0) * u * rand(10, 26),
      });
    }

    return {
      colonyId,
      pts,
      seed,

      speed: rand(0.55, 1.10),
      baseThickness: rand(0.85, 1.35),

      kink: 0,
      kinkCd: rand(0.8, 2.4),
      spacingJitter: rand(0.85, 1.15),

      mutation: mutated ? rand(0.4, 1.0) : 0,
      hueShift: mutated ? rand(-80, 80) : 0,

      mode: Math.random() < 0.55 ? "wander" : "swirl",
      modeTimer: rand(1.6, 4.8),

      burst: 0,
      burstCd: rand(0.7, 2.6),
    };
  }

  function seedInitial(){
    worms.length = 0;
    for (let i=0;i<12;i++) worms.push(makeWorm(1, Math.random() < 0.18));
  }
  seedInitial();

  function updateUI(){
    elBuyers.textContent = String(state.buyers);
    elVol.textContent = fmtMoney(state.volume);
    elMcap.textContent = fmtMoney(state.mcap);
    elCols.textContent = String(state.colonies);
    elWorms.textContent = String(worms.length);
  }
  updateUI();

  // ---------- Colony stats (for badge + panel)
  function colonyStats(colId){
    let wCount = 0;
    for (const w of worms) if (w.colonyId === colId) wCount++;

    let muts = 0;
    for (const w of worms) if (w.colonyId === colId && (w.mutation > 0.45 || Math.abs(w.hueShift) > 60)) muts++;

    return { worms: wCount, mutations: muts };
  }

  // ---------- Mutations
  function triggerMutation(reason="random"){
    if (!worms.length) return;
    const w = worms[Math.floor(rand(0, worms.length))];
    const idx = worms.indexOf(w) + 1;
    const c = getCol(w.colonyId);
    const roll = Math.random();

    if (roll < 0.40){
      w.mutation = Math.max(w.mutation, rand(0.45, 1.0));
      w.hueShift += rand(-140, 140);
      logEvent("mutation", `Color shift on Worm #${idx} (${reason}).`);
    } else if (roll < 0.70){
      w.baseThickness *= rand(1.08, 1.25);
      w.mutation = Math.max(w.mutation, rand(0.35, 0.95));
      logEvent("mutation", `Body growth on Worm #${idx} (${reason}).`);
    } else {
      w.speed *= rand(1.12, 1.55);
      w.burst = Math.max(w.burst, rand(0.45, 1.15));
      w.kink  = Math.max(w.kink, rand(0.35, 1.0));
      logEvent("mutation", `Aggression spike on Worm #${idx} (${reason}).`);
    }

    addShockwave(c.x, c.y, c.dna.hueA, c.dna.hueB, 0.9, "mutation");
  }

  // ---------- Split helper
  function splitNewColonyFromWorm(w, reason="split"){
    if (colonies.length >= LIMITS.maxColonies) return;

    const r = canvas.getBoundingClientRect();
    const parent = getCol(w.colonyId);

    const ang = rand(0, TAU);
    const dist = rand(115, 235);
    const nx = clamp(parent.x + Math.cos(ang)*dist, 80, r.width - 80);
    const ny = clamp(parent.y + Math.sin(ang)*dist, 120, r.height - 80);

    const newId = colonies.length + 1;
    const dna = makeColonyDNA(newId);

    colonies.push({ id:newId, x:nx, y:ny, r: 52, dna, createdAt: performance.now() });
    state.colonies = colonies.length;

    // move this worm and spawn starters
    w.colonyId = newId;
    worms.push(makeWorm(newId, Math.random() < 0.30));
    if (Math.random() < 0.60) worms.push(makeWorm(newId, Math.random() < 0.30));

    w.burst = Math.max(w.burst, rand(0.7, 1.3));
    w.kink  = Math.max(w.kink, rand(0.5, 1.2));
    state.nutrients = Math.max(0, state.nutrients - GROW.splitNutrientCost);

    logEvent("split", `New colony founded (#${newId}) @ ${fmtMoney(state.mcap)} · DNA: ${dna.label} (${reason}).`);

    addShockwave(parent.x, parent.y, parent.dna.hueA, parent.dna.hueB, 1.0, "split");
    addShockwave(nx, ny, dna.hueA, dna.hueB, 1.2, "split");

    if (Math.random() < 0.60) triggerMutation(reason);
  }

  // ---------- Buy hook (demo)
  function onBuy({usdAmount=250}){
    state.buyers += 1;
    state.volume += usdAmount;

    const impact = usdAmount * (1.7 + rand(0.2, 1.1));
    state.mcap += impact;

    state.nutrients += usdAmount * GROW.nutrientsPerBuyDollar;

    const mutChance = 0.11 + clamp(usdAmount/900, 0, 0.12);
    if (Math.random() < mutChance) triggerMutation("buy");

    const c = getCol(state.selectedColonyId || 1);
    addShockwave(c.x, c.y, c.dna.hueA, c.dna.hueB, clamp(usdAmount/520, 0.25, 0.9), "buy");

    updateUI();
  }

  // volume drift sim
  function volumeDrip(dt){
    const m = Math.log10(Math.max(10, state.mcap));
    const rate = (GROW.volRateBase + state.buyers*1.1) * (0.8 + m*GROW.volRateMcapFactor);
    state.volume += rate * dt;
    state.nutrients += (rate * dt) * GROW.nutrientsFromVol;

    if (Math.random() < (0.003 + clamp(rate/220, 0, 0.012)) * dt * 60) {
      triggerMutation("volume");
    }
  }

  function mcapToRadius(mcap){
    const m = Math.log10(Math.max(10, mcap));
    return GROW.baseRadius + (m - 3.7) * GROW.radiusPerLog;
  }

  // spawn worms
  function trySpawnWorm(dt){
    spawnCooldown = Math.max(0, spawnCooldown - dt);

    while (state.nutrients >= GROW.wormSpawnCost && spawnCooldown <= 0){
      if (worms.length >= LIMITS.maxWorms) { state.nutrients = 0; break; }

      const targetCol =
        Math.random() < 0.55 ? (state.selectedColonyId || 1) :
        (Math.random() < 0.68 ? 1 : colonies[Math.floor(rand(0, colonies.length))].id);

      worms.push(makeWorm(targetCol, Math.random() < 0.20));
      state.nutrients -= GROW.wormSpawnCost;
      spawnCooldown = GROW.wormSpawnMinGap;
    }
  }

  // optional random split (kept small now)
  function maybeRandomSplit(dt){
    if (colonies.length >= LIMITS.maxColonies) return;
    if (state.nutrients < GROW.splitMinNutrients) return;

    if (Math.random() < (GROW.randomSplitImpulse * dt * 60)) {
      const w = worms[Math.floor(rand(0, worms.length))];
      splitNewColonyFromWorm(w, "random");
      return;
    }

    const mcapBoost = clamp(state.mcap / 180000, 0, 2.0);
    const volBoost  = clamp(state.volume / 250000, 0, 2.0);
    const dnaPressure = colonies.reduce((acc, c) => acc + c.dna.splitAffinity, 0) / colonies.length;

    const chancePerSec = GROW.splitChanceBase * (1 + mcapBoost*0.75 + volBoost*0.45 + dnaPressure*0.25);

    if (Math.random() < chancePerSec * dt){
      const w = worms[Math.floor(rand(0, worms.length))];
      splitNewColonyFromWorm(w, "pressure");
    }
  }

  // ---------- Interaction: tap/click colonies
  function pointerPos(ev){
    const rect = canvas.getBoundingClientRect();
    const x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left;
    const y = (ev.touches ? ev.touches[0].clientY : ev.clientY) - rect.top;
    return {x,y};
  }
  function pickColony(x,y){
    let best=null, bestD=1e9;
    for (const c of colonies){
      const d = Math.hypot(x - c.x, y - c.y);
      if (d < bestD){ bestD=d; best=c; }
    }
    if (best && bestD <= Math.max(52, best.r*1.55)) return best;
    return null;
  }
  function selectColony(id){
    state.selectedColonyId = id;
    const c = getCol(id);
    logEvent("info", `Selected Colony #${id} (DNA: ${c.dna.label}).`);
    addShockwave(c.x, c.y, c.dna.hueA, c.dna.hueB, 0.75, "select");
  }
  canvas.addEventListener("click", (ev) => {
    const {x,y} = pointerPos(ev);
    const c = pickColony(x,y);
    if (c) selectColony(c.id);
  }, { passive:true });
  canvas.addEventListener("touchstart", (ev) => {
    const {x,y} = pointerPos(ev);
    const c = pickColony(x,y);
    if (c) selectColony(c.id);
  }, { passive:true });

  // ---------- Helpers for badges / text
  function roundRect(ctx, x, y, w, h, r){
    const rr = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+rr, y);
    ctx.arcTo(x+w, y, x+w, y+h, rr);
    ctx.arcTo(x+w, y+h, x, y+h, rr);
    ctx.arcTo(x, y+h, x, y, rr);
    ctx.arcTo(x, y, x+w, y, rr);
    ctx.closePath();
  }

  function drawColonyBadges(){
    const pad = 8;
    ctx.font = "12px Space Grotesk, system-ui";
    ctx.textBaseline = "middle";

    for (const c of colonies){
      const label = `#${c.id} · ${c.dna.label}`;
      const metrics = colonyStats(c.id);
      const sub = `${metrics.worms} worms · ${metrics.mutations} muts`;

      const w1 = ctx.measureText(label).width;
      const w2 = ctx.measureText(sub).width;
      const bw = Math.max(w1, w2) + pad*2;
      const bh = 38;

      const x = c.x - bw/2;
      const y = c.y - (c.r*1.55 + 28);

      const grad = ctx.createLinearGradient(x, y, x+bw, y);
      grad.addColorStop(0, `hsla(${c.dna.hueA},95%,55%,0.22)`);
      grad.addColorStop(1, `hsla(${c.dna.hueB},95%,55%,0.18)`);

      ctx.fillStyle = grad;
      roundRect(ctx, x, y, bw, bh, 10);
      ctx.fill();

      ctx.strokeStyle = `hsla(${c.dna.hueB},95%,70%,${c.id === state.selectedColonyId ? 0.65 : 0.32})`;
      ctx.lineWidth = 1;
      roundRect(ctx, x, y, bw, bh, 10);
      ctx.stroke();

      ctx.fillStyle = "rgba(233,238,247,0.92)";
      ctx.fillText(label, x+pad, y+12);
      ctx.fillStyle = "rgba(233,238,247,0.70)";
      ctx.fillText(sub, x+pad, y+28);
    }

    // selected colony panel (top-right of stage)
    const sel = getCol(state.selectedColonyId || 1);
    const s = colonyStats(sel.id);
    const title = `Selected: Colony #${sel.id}`;
    const line1 = `DNA: ${sel.dna.label} · Temper ${(sel.dna.temper*100)|0}%`;
    const line2 = `Worms: ${s.worms} · Mutations: ${s.mutations}`;

    const pW = Math.max(
      ctx.measureText(title).width,
      ctx.measureText(line1).width,
      ctx.measureText(line2).width
    ) + 18;

    const stageW = canvas.getBoundingClientRect().width;
    const px = stageW - pW - 14;
    const py = 64;

    ctx.fillStyle = "rgba(0,0,0,0.38)";
    roundRect(ctx, px, py, pW, 54, 12);
    ctx.fill();

    ctx.strokeStyle = `hsla(${sel.dna.hueB},95%,70%,0.32)`;
    ctx.lineWidth = 1;
    roundRect(ctx, px, py, pW, 54, 12);
    ctx.stroke();

    ctx.fillStyle = "rgba(233,238,247,0.92)";
    ctx.fillText(title, px+10, py+16);
    ctx.fillStyle = "rgba(233,238,247,0.75)";
    ctx.fillText(line1, px+10, py+32);
    ctx.fillStyle = "rgba(233,238,247,0.70)";
    ctx.fillText(line2, px+10, py+46);
  }

  // ---------- Main step loop
  function step(dt){
    state.t += dt;
    volumeDrip(dt);

    const r = canvas.getBoundingClientRect();
    const main = colonies[0];

    main.x = lerp(main.x, r.width/2, 0.05);
    main.y = lerp(main.y, r.height/2, 0.05);
    main.r = lerp(main.r, clamp(mcapToRadius(state.mcap), 55, 245), 0.05);

    for (let i=1;i<colonies.length;i++){
      const c = colonies[i];
      const drift = 0.06 + c.dna.temper*0.08;
      c.x = clamp(c.x + fbm(state.t*0.12 + c.id*10)*drift, 70, r.width-70);
      c.y = clamp(c.y + fbm(state.t*0.11 + c.id*20)*drift, 110, r.height-70);
      c.r = lerp(c.r, clamp(46 + Math.log10(state.mcap+10)*9, 45, 125), 0.02);
    }

    trySpawnWorm(dt);

    // optional random splits (small)
    maybeRandomSplit(dt);

    // worm motion
    const t = state.t;
    for (const w of worms){
      const c = getCol(w.colonyId);
      const dna = c.dna;

      w.modeTimer -= dt;
      if (w.modeTimer <= 0){
        w.modeTimer = rand(1.4, 4.6);
        w.mode = Math.random() < (0.50 + dna.temper*0.15) ? "wander" : "swirl";
      }

      w.burstCd -= dt;
      if (w.burstCd <= 0){
        w.burstCd = rand(0.6, 2.4);
        if (Math.random() < (0.17 + dna.temper*0.08)) w.burst = rand(0.25, 1.05);
      }
      w.burst = Math.max(0, w.burst - dt*0.75);

      w.kinkCd -= dt;
      if (w.kinkCd <= 0){
        w.kinkCd = rand(0.7, 2.2);
        if (Math.random() < (0.16 + dna.temper*0.12)) w.kink = rand(0.25, 1.0);
      }
      w.kink = Math.max(0, w.kink - dt*0.55);

      const head = w.pts[0];

      const n1 = fbm(t*0.55 + w.seed*0.07);
      const n2 = fbm(t*0.40 + w.seed*0.11 + 33.3);

      const swirlAng = (t*(0.70 + dna.temper*0.20) + w.seed*0.001) + n1*(0.65 + dna.temper*0.35);
      const swirlRad = c.r * (0.42 + n2*0.24) + c.r*0.18;
      const swirlX = c.x + Math.cos(swirlAng) * swirlRad;
      const swirlY = c.y + Math.sin(swirlAng) * swirlRad;

      const wanderAng = (t*(0.34 + dna.temper*0.18) + w.seed*0.02) + fbm(t*(0.9 + dna.temper*0.25) + w.seed)*1.35;
      const wanderRad = c.r * (0.55 + fbm(t*0.6 + w.seed*0.2)* (0.45 + dna.temper*0.20));
      const wanderX = c.x + Math.cos(wanderAng) * wanderRad;
      const wanderY = c.y + Math.sin(wanderAng) * wanderRad;

      const mix = (w.mode === "wander") ? 0.66 : 0.34;
      const tx = lerp(swirlX, wanderX, mix);
      const ty = lerp(swirlY, wanderY, mix);

      const speed = w.speed * (1 + w.burst*2.0) * (0.95 + dna.temper*0.25);

      const jx = fbm(t*2.1 + w.seed*0.4) * (0.45 + dna.temper*0.35 + w.kink*0.25);
      const jy = fbm(t*2.0 + w.seed*0.7 + 9.2) * (0.45 + dna.temper*0.35 + w.kink*0.25);

      head.x = lerp(head.x, tx + jx, 0.10 + 0.05*speed);
      head.y = lerp(head.y, ty + jy, 0.10 + 0.05*speed);

      head.x = clamp(head.x, 22, r.width-22);
      head.y = clamp(head.y, 22, r.height-22);

      const elasticity = 0.42 + w.mutation*0.10 + dna.temper*0.08;

      for (let i=1;i<w.pts.length;i++){
        const p=w.pts[i], prev=w.pts[i-1];
        const dx=prev.x-p.x, dy=prev.y-p.y;
        const dist=Math.max(0.001, Math.hypot(dx,dy));

        const u = i/(w.pts.length-1);
        const belly = Math.sin(u*Math.PI);
        const spacing = (5.7 + (w.baseThickness*1.85))*w.spacingJitter + belly*0.35;

        const kinkTerm = Math.sin(t*2.6 + i*0.35 + w.seed) * (0.22 + dna.wiggle*0.35) * w.kink;
        const target = spacing + kinkTerm;

        const pull = (dist-target)*elasticity;
        p.x += (dx/dist)*pull;
        p.y += (dy/dist)*pull;
      }
    }

    // ✅ NEW: Force a colony at 50k mcap increments
    while (state.mcap >= state.lastMcapGate + GROW.mcapSplitStep) {
      state.lastMcapGate += GROW.mcapSplitStep;
      logEvent("milestone", `MCap milestone: ${fmtMoney(state.lastMcapGate)} reached.`);

      const c = getCol(state.selectedColonyId || 1);
      addShockwave(c.x, c.y, c.dna.hueA, c.dna.hueB, 1.2, "milestone");

      if (colonies.length < LIMITS.maxColonies && worms.length) {
        const candidate = worms[Math.floor(rand(0, worms.length))];
        splitNewColonyFromWorm(candidate, `mcap ${fmtMoney(state.lastMcapGate)}`);
      } else {
        logEvent("info", "Colony cap reached (8). No more milestone splits.");
      }

      if (Math.random() < 0.65) triggerMutation("mcap milestone");
    }

    stepShockwaves(dt);
    updateUI();
  }

  // ---------- Draw helpers for worms
  function drawWorms(){
    for (const w of worms){
      const c = getCol(w.colonyId);
      const dna = c.dna;
      const pts = w.pts;
      if (pts.length < 3) continue;

      const baseHue = (dna.hueA + w.hueShift) % 360;
      const altHue  = (dna.hueB + w.hueShift) % 360;

      for (let i=pts.length-1; i>=0; i--){
        const p = pts[i];
        const u = i/(pts.length-1);
        const belly = Math.sin(u*Math.PI);

        const radius = (2.15 + belly*3.7) * w.baseThickness * (1 + w.mutation*0.55);

        const prev = pts[Math.max(0, i-1)];
        const next = pts[Math.min(pts.length-1, i+1)];
        const vx = next.x - prev.x;
        const vy = next.y - prev.y;
        const len = Math.max(0.001, Math.hypot(vx, vy));
        const nx = -vy/len;
        const ny =  vx/len;

        const wig = (0.2 + dna.wiggle*0.95) * (1 + w.kink*0.9);
        const wave = Math.sin(state.t*(2.2 + dna.temper*1.4) + i*0.65 + w.seed) * (0.55 + belly*0.8) * wig;

        const ox = nx * wave;
        const oy = ny * wave;

        const hue = baseHue + (altHue-baseHue)*u*0.62;
        const alpha = 0.68 + belly*0.22;

        ctx.fillStyle = `hsla(${hue}, 95%, 70%, ${0.10 + belly*0.09})`;
        ctx.beginPath();
        ctx.arc(p.x+ox, p.y+oy, radius*2.25, 0, TAU);
        ctx.fill();

        ctx.fillStyle = `hsla(${hue}, 95%, 66%, ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x+ox, p.y+oy, radius, 0, TAU);
        ctx.fill();

        ctx.fillStyle = `hsla(${(hue+10)%360}, 95%, 78%, ${0.12 + belly*0.10})`;
        ctx.beginPath();
        ctx.arc(p.x+ox - 0.35, p.y+oy - 0.35, radius*0.55, 0, TAU);
        ctx.fill();
      }

      const h = pts[0];
      const headPulse = (Math.sin(state.t*3.1 + w.seed)*0.5+0.5);
      const headR = (6.0 + w.mutation*4.2) * w.baseThickness;

      ctx.fillStyle = `hsla(${baseHue}, 95%, 74%, ${0.32 + headPulse*0.20})`;
      ctx.beginPath();
      ctx.arc(h.x, h.y, headR*2.0, 0, TAU);
      ctx.fill();

      ctx.fillStyle = `hsla(${(baseHue+12)%360}, 95%, 68%, 0.92)`;
      ctx.beginPath();
      ctx.arc(h.x, h.y, headR, 0, TAU);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.65)";
      ctx.beginPath();
      ctx.arc(h.x + headR*0.28, h.y - headR*0.22, Math.max(1.1, headR*0.18), 0, TAU);
      ctx.fill();
    }
  }

  // ---------- Draw
  function draw(){
    const r = canvas.getBoundingClientRect();
    ctx.fillStyle = "rgba(5,6,10,0.12)";
    ctx.fillRect(0,0,r.width,r.height);

    // colony glows + selection
    for (const c of colonies){
      const pulse = (Math.sin(state.t*1.1 + c.id)*0.5+0.5);
      const glow = 0.05 + clamp(state.mcap/1e7,0,0.10) + clamp(state.volume/2e6,0,0.08);

      const grd = ctx.createRadialGradient(c.x,c.y,0,c.x,c.y,c.r*2.9);
      grd.addColorStop(0, `hsla(${c.dna.hueA}, 95%, 65%, ${glow + pulse*0.04})`);
      grd.addColorStop(0.55, `hsla(${c.dna.hueB}, 95%, 65%, ${(glow*0.75) + pulse*0.03})`);
      grd.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(c.x,c.y,c.r*2.9,0,TAU);
      ctx.fill();

      if (c.id === state.selectedColonyId){
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = `hsla(${c.dna.hueB}, 95%, 70%, 0.55)`;
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r*1.35 + 10 + pulse*2.5, 0, TAU);
        ctx.stroke();
      }
    }

    drawWorms();
    drawShockwaves();
    drawColonyBadges();
  }

  // ---------- Loop
  let last = performance.now();
  function loop(now){
    const dt = Math.min(0.033, (now-last)/1000);
    last = now;
    step(dt);
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // ---------- Controls
  function simulateBuy(usd){ onBuy({ usdAmount: usd }); }

  btnFeed?.addEventListener("click", () => simulateBuy(250));
  btnSmall?.addEventListener("click", () => simulateBuy(75));
  btnBig?.addEventListener("click", () => simulateBuy(450));
  btnMutate?.addEventListener("click", () => triggerMutation("manual"));

  btnReset?.addEventListener("click", () => {
    state.buyers = 0;
    state.volume = 0;
    state.mcap = 25000;
    state.colonies = 1;
    state.nutrients = 0;
    state.t = 0;

    // ✅ reset milestone gate so first split is at 50k
    state.lastMcapGate = 0;

    state.selectedColonyId = 1;

    colonies.length = 1;
    colonies[0].id = 1;
    colonies[0].x = canvas.getBoundingClientRect().width/2;
    colonies[0].y = canvas.getBoundingClientRect().height/2;
    colonies[0].r = GROW.baseRadius;
    colonies[0].dna = makeColonyDNA(1);

    shockwaves.length = 0;

    seedInitial();

    if (logEl){
      logEl.dataset.init = "0";
      logEl.innerHTML = "Waiting for activity…";
    }

    updateUI();
    logEvent("info", "Simulation reset. Milestone splits: every $50k starting at $50k.");
  });

  // Intro
  logEvent("info", "Upgrades live: shockwaves, DNA badges, tap-to-select colonies, +$50k mcap milestone splits.");
})();
setTimeout(() => {
  console.log("JS LOADED OK");
  logEvent("info", "Simulation heartbeat OK.");
}, 500);

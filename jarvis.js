/* Atlas: the command center. It hears you (Chrome's speech recognition), thinks with a real AI model
   (Puter: free, no API key, you sign in once), answers out loud in a natural AI voice, and knows your
   classes, due dates and trading desk. If the AI is unreachable it still answers from your own data. */
(function () {
  'use strict';
  const B = window.Brain, $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  const P = B.M.profile(), NAME = (P.assistant || 'Atlas'); document.title = NAME;
  $('#aname').textContent = NAME.toUpperCase(); $('#bigName').textContent = NAME.toUpperCase();

  /* ---------------- voices ---------------- */
  // OpenAI and ElevenLabs voices through Puter sound like real people; the Mac voice is the last resort.
  // ElevenLabs voices are the ones the Jarvis builders on TikTok use (George is the warm British one).
  // Kokoro voices run inside your own browser: free, no account, no limits. They're the default.
  const APP = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && location.port === '8787';   // true inside the Atlas app on the Mac
  let VOICES = [
    { id: 'k:bm_george', label: 'George · British · free', provider: 'kokoro' }, { id: 'k:bm_fable', label: 'Fable · British · free', provider: 'kokoro' },
    { id: 'k:bf_emma', label: 'Emma · British · free', provider: 'kokoro' }, { id: 'k:af_heart', label: 'Heart · free', provider: 'kokoro' },
    { id: 'JBFqnCBsd6RMkjVDRZzb', label: 'George · ElevenLabs', provider: 'elevenlabs' }, { id: 'onwK4e9ZLuTAKqWW03F9', label: 'Daniel · ElevenLabs', provider: 'elevenlabs' },
    { id: 'nPczCjzI2devNBz1zQrb', label: 'Brian', provider: 'elevenlabs' }, { id: 'cgSgspJ2msm6clMCkdW9', label: 'Jessica', provider: 'elevenlabs' },
    { id: 'ash', label: 'Ash', provider: 'openai' }, { id: 'coral', label: 'Coral', provider: 'openai' },
    { id: 'mac', label: 'Mac voice', provider: 'browser' }
  ];
  const STYLE = 'Talk like a relaxed, warm friend in a casual conversation: natural pace, real emotion, small pauses, a little smile in your voice when joking. Never sound like a narrator reading text.';
  let voice = ls.get('atlas_voice4', 'k:bm_george'), talkMode = ls.get('atlas_talkmode', true), auto = ls.get('atlas_auto', true);
  // In the Mac app every voice is a free one that runs on the Mac itself.
  if (APP) VOICES = VOICES.filter(v => v.provider === 'kokoro').concat([{ id: 'k:bm_daniel', label: 'Daniel · British · free', provider: 'kokoro' }, { id: 'k:bm_lewis', label: 'Lewis · British · free', provider: 'kokoro' }, { id: 'k:am_michael', label: 'Michael · free', provider: 'kokoro' }, { id: 'k:af_bella', label: 'Bella · free', provider: 'kokoro' }]);
  if (!VOICES.some(v => v.id === voice)) voice = VOICES[0].id;
  function renderVoices() { $('#voices').innerHTML = VOICES.map(v => `<button type="button" data-voice="${v.id}" aria-pressed="${v.id === voice}">${esc(v.label)}</button>`).join(''); }

  /* ---------------- state + display ---------------- */
  let state = 'idle', busy = false, rec = null, audio = null, chat = ls.get('atlas_chat2', []), mem = ls.get('atlas_mem', []);
  const STATUS = { idle: () => chat.length ? 'Your turn · tap the galaxy or press space' : 'Tap the galaxy or press space to talk', listening: () => 'Listening · just pause when you\'re done', thinking: () => 'Thinking', speaking: () => 'Speaking · tap to cut in', error: () => 'Something went wrong · try again' };
  function brainWord() { try { if (helper.ok) return helperReady() ? 'Claude Code online' : 'setup needed'; return aiOK ? 'AI online' : 'AI offline'; } catch (e) { return 'starting'; } }
  function setState(s) {
    state = s; Sky.set(s); $('#status').textContent = STATUS[s]();
    $$('#states span[data-s]').forEach(x => x.classList.toggle('on', x.dataset.s === s));
    $('#line').textContent = `● Core · ${{ idle: 'idle', listening: 'listening', thinking: 'working', speaking: 'speaking', error: 'error' }[s]} · connected vault · ${brainWord()}`;
    $('#talk').classList.toggle('live', s === 'listening');
    $('#talk').textContent = s === 'listening' ? 'Listening · tap to send' : s === 'speaking' ? 'Tap to cut in' : 'Tap to talk';
  }
  function renderChat() {
    const L = chat; let you = '', ai = '';
    if (L.length) { const a = L[L.length - 1]; if (a.role === 'assistant') { ai = a.content; const p = L[L.length - 2]; if (p && p.role === 'user') you = p.content; } else you = a.content; }
    $('#you').textContent = you ? `“${you}”` : ''; $('#ai').textContent = ai || (you ? '' : `${B.greet()} Talk to me like you would a friend. I know your classes, what's due and what your trading desk is doing.`);
    $('#chat').innerHTML = L.slice(-16, -2 > -L.length ? -2 : undefined).map(m => `<p class="${m.role === 'user' ? 'me' : ''}">${esc(m.content)}</p>`).join('');
  }

  /* ---------------- the galaxy ---------------- */
  let G3 = null;
  const Sky = (() => {
    const c = $('#sky'), g = c.getContext('2d'), still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const N = innerWidth < 900 ? 5200 : 9000, ARMS = 2, Pp = [], STARS = [];
    for (let i = 0; i < N; i++) {
      const r = .04 + .96 * Math.pow(Math.random(), 1.25), arm = (i % ARMS) / ARMS * Math.PI * 2;
      const ox = .16 * Math.pow(Math.random(), 3) * (Math.random() < .5 ? -1 : 1), oy = .16 * Math.pow(Math.random(), 3) * (Math.random() < .5 ? -1 : 1);
      Pp.push({ r, a: arm + r * 6.4, ox: ox * (.25 + r), oy: oy * (.25 + r), b: Math.random(), s: Math.random() * 6.283 });
    }
    for (let i = 0; i < 260; i++) STARS.push({ x: Math.random(), y: Math.random(), b: Math.random() * .5 + .1 });
    const T = { idle: [.05, .9, .75], listening: [.07, 1.1, 1], thinking: [.22, 1.05, .9], speaking: [.07, 1.06, 1], error: [.03, .95, .55] };
    let W = 1, H = 1, dpr = 1, st = 'idle', spin = .05, scale = .9, glow = .75, pulse = 0, rot = 0, last = 0, nextSyl = 0; const t0 = performance.now();
    function size() { const r = c.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); W = c.width = Math.max(1, Math.round(r.width * dpr)); H = c.height = Math.max(1, Math.round(r.height * dpr)); }
    function draw(now) {
      const dt = last ? Math.min(.05, (now - last) / 1000) : 0; last = now; const t = (now - t0) / 1000;
      const [sp, sc, gl] = T[st], e = 1 - Math.pow(.002, dt);
      spin += (sp - spin) * e; scale += (sc - scale) * e; glow += (gl - glow) * e; pulse *= Math.pow(.02, dt); rot += spin * dt;
      if (st === 'speaking' && t > nextSyl) { pulse = Math.min(1.4, pulse + .45 + Math.random() * .5); nextSyl = t + .1 + Math.random() * .16; }
      if (st === 'listening' && t > nextSyl) { pulse = Math.min(.8, pulse + .12 + Math.random() * .15); nextSyl = t + .3 + Math.random() * .3; }
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.clearRect(0, 0, W, H); g.fillStyle = '#fff';
      for (const s of STARS) { g.globalAlpha = s.b * (.6 + .4 * Math.sin(t * .7 + s.x * 40)); g.fillRect(s.x * W, s.y * H, dpr, dpr); }
      const b = $('#core').getBoundingClientRect(), cr = c.getBoundingClientRect();
      const cx = (b.left + b.width / 2 - cr.left) * dpr, cy = (b.top + b.height / 2 - cr.top) * dpr, R = Math.min(b.width, b.height) / 2 * dpr * .95 * (scale + pulse * .035), br = 1 + Math.sin(t * .9) * .012;
      const halo = g.createRadialGradient(cx, cy, 0, cx, cy, R * .55);
      halo.addColorStop(0, `rgba(255,255,255,${(.22 * glow + .12 * pulse).toFixed(3)})`); halo.addColorStop(.35, `rgba(200,215,255,${(.07 * glow).toFixed(3)})`); halo.addColorStop(1, 'rgba(200,215,255,0)');
      g.globalAlpha = 1; g.fillStyle = halo; g.fillRect(cx - R, cy - R, R * 2, R * 2);
      g.globalCompositeOperation = 'lighter'; g.fillStyle = '#E8EEFF';
      for (let i = 0; i < N; i++) {
        const p = Pp[i], ang = p.a - rot, rr = p.r * R * br, x = cx + Math.cos(ang) * rr + p.ox * R, y = cy + Math.sin(ang) * rr * .92 + p.oy * R;
        const core = Math.max(0, 1 - p.r * 1.25), tw = .55 + .45 * Math.sin(p.s + t * 2.2);
        g.globalAlpha = Math.min(1, (.3 + .5 * core + .3 * p.b) * glow * tw + pulse * .12 * core);
        const z = (core > .8 ? 1.7 : p.b > .93 ? 1.6 : .95) * dpr; g.fillRect(x - z / 2, y - z / 2, z, z);
      }
    }
    let dead = false;
    function loop(now) { if (dead) return; draw(now); if (!still) requestAnimationFrame(loop); }
    addEventListener('resize', size); size(); requestAnimationFrame(loop);
    return { set(s) { st = T[s] ? s : 'idle'; if (G3) G3.set(st); if (still && !dead) draw(performance.now()); }, pulse(v) { pulse = Math.min(1.4, pulse + (v || .5)); if (G3) G3.pulse(v); }, kill() { dead = true; c.style.display = 'none'; } };
  })();


  /* ---------------- the 3D galaxy (three.js) ----------------
     A tilted spiral galaxy of ~60k glowing particles, warm core to teal to violet arms, with a starfield,
     a slow camera drift and mouse parallax. It spins faster while working, brightens while listening
     and pulses with each word while speaking. Falls back to the flat galaxy if WebGL isn't available. */
  (async () => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let THREE; try { THREE = await import('https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js'); } catch (e) { return; }
    const canvas = document.createElement('canvas'); canvas.id = 'sky3'; canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0';
    $('#sky').after(canvas);
    let renderer; try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' }); } catch (e) { canvas.remove(); return; }
    const dpr = Math.min(2, devicePixelRatio || 1); renderer.setPixelRatio(dpr);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(42, 1, .1, 200);
    const N = innerWidth < 900 ? 26000 : 60000, R = 5, ARMS = 3;
    const pos = new Float32Array(N * 3), rnd = new Float32Array(N * 3), col = new Float32Array(N * 3), scl = new Float32Array(N);
    const cIn = new THREE.Color('#ffe2b0'), cMid = new THREE.Color('#38e8d2'), cOut = new THREE.Color('#7a5cff'), tmp = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const r = Math.pow(Math.random(), 1.1) * R, arm = (i % ARMS) / ARMS * Math.PI * 2, spin = r * 1.05;
      pos[i * 3] = Math.cos(arm + spin) * r; pos[i * 3 + 1] = 0; pos[i * 3 + 2] = Math.sin(arm + spin) * r;
      const k = .32 * r + .15, rr = () => Math.pow(Math.random(), 3) * (Math.random() < .5 ? 1 : -1) * k;
      rnd[i * 3] = rr(); rnd[i * 3 + 1] = rr() * .45; rnd[i * 3 + 2] = rr();
      const t = r / R; if (t < .45) tmp.copy(cIn).lerp(cMid, t / .45); else tmp.copy(cMid).lerp(cOut, (t - .45) / .55);
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b; scl[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aRandom', new THREE.BufferAttribute(rnd, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('aScale', new THREE.BufferAttribute(scl, 1));
    const U = { uRot: { value: 0 }, uTime: { value: 0 }, uSize: { value: 44 * dpr }, uPulse: { value: 0 }, uGlow: { value: .8 } };
    const mat = new THREE.ShaderMaterial({ uniforms: U, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `uniform float uRot, uTime, uSize, uPulse; attribute float aScale; attribute vec3 aRandom; varying vec3 vColor; varying float vA;
        void main(){ vec4 mp = modelMatrix * vec4(position, 1.0); float d = length(mp.xz); float a = atan(mp.z, mp.x) + uRot / (d * .55 + .35);
          mp.x = cos(a) * d; mp.z = sin(a) * d; mp.xyz += aRandom * (1.0 + uPulse * .25);
          vec4 vp = viewMatrix * mp; gl_Position = projectionMatrix * vp;
          gl_PointSize = uSize * (.35 + aScale) * (1.0 + uPulse * .5) / -vp.z;
          vColor = color; vA = .55 + .45 * sin(uTime * 2.2 + aScale * 40.0); }`,
      fragmentShader: `uniform float uGlow; varying vec3 vColor; varying float vA;
        void main(){ float d = distance(gl_PointCoord, vec2(.5)); float s = pow(max(0.0, 1.0 - d * 2.0), 2.4); gl_FragColor = vec4(vColor * s * (1.3 + uGlow * 1.2), s * vA); }` });
    const galaxy = new THREE.Points(geo, mat); scene.add(galaxy);
    // core glow
    const gc = document.createElement('canvas'); gc.width = gc.height = 128; const gx = gc.getContext('2d'), gr = gx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,240,215,1)'); gr.addColorStop(.25, 'rgba(255,200,140,.45)'); gr.addColorStop(.6, 'rgba(120,200,255,.08)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    gx.fillStyle = gr; gx.fillRect(0, 0, 128, 128);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(gc), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); glow.scale.set(3.4, 3.4, 1); scene.add(glow);
    // background stars
    const SN = 1800, sp = new Float32Array(SN * 3);
    for (let i = 0; i < SN; i++) { const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, rr = 40 + Math.random() * 40, q = Math.sqrt(1 - u * u); sp[i * 3] = q * Math.cos(th) * rr; sp[i * 3 + 1] = u * rr; sp[i * 3 + 2] = q * Math.sin(th) * rr; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xcfd8ff, size: 1.3 * dpr, sizeAttenuation: false, transparent: true, opacity: .7, depthWrite: false })); scene.add(stars);
    const TT = { idle: [.12, .8], listening: [.16, 1.15], thinking: [.55, 1], speaking: [.16, 1.2], error: [.06, .45] };
    let st = 'idle', spin = .12, gl = .8, pulse = 0, mx = 0, my = 0, last = 0, nextSyl = 0, W = 1, H = 1;
    addEventListener('pointermove', e => { mx = e.clientX / innerWidth - .5; my = e.clientY / innerHeight - .5; });
    function fit() {
      W = canvas.clientWidth; H = canvas.clientHeight; renderer.setSize(W, H, false); camera.aspect = W / H;
      const b = $('#core').getBoundingClientRect(), cr = canvas.getBoundingClientRect(), cx = b.left + b.width / 2 - cr.left, cy = b.top + b.height / 2 - cr.top;
      const want = Math.max(160, Math.min(b.width, b.height)), dist = (2 * R * .82) * H / want / (2 * Math.tan(THREE.MathUtils.degToRad(21)));
      camera.userData.dist = dist; camera.setViewOffset(W, H, W / 2 - cx, H / 2 - cy, W, H); camera.updateProjectionMatrix();
    }
    addEventListener('resize', fit); new ResizeObserver(fit).observe($('#core')); fit();
    function frame(now) {
      requestAnimationFrame(frame); if (document.hidden) return;
      const dt = last ? Math.min(.05, (now - last) / 1000) : 0; last = now; const t = now / 1000, [ts, tg] = TT[st] || TT.idle, e = 1 - Math.pow(.002, dt);
      spin += (ts - spin) * e; gl += (tg - gl) * e; pulse *= Math.pow(.03, dt);
      if (st === 'speaking' && t > nextSyl) { pulse = Math.min(1.4, pulse + .4 + Math.random() * .5); nextSyl = t + .1 + Math.random() * .16; }
      if (st === 'listening' && t > nextSyl) { pulse = Math.min(.7, pulse + .1 + Math.random() * .12); nextSyl = t + .3 + Math.random() * .3; }
      U.uRot.value += spin * dt; U.uTime.value = t; U.uPulse.value = pulse; U.uGlow.value = gl;
      const d = camera.userData.dist || 14, ang = .55 + Math.sin(t * .05) * .06 + my * .18, yaw = t * .02 + mx * .35;
      camera.position.set(Math.sin(yaw) * Math.cos(ang) * d, Math.sin(ang) * d, Math.cos(yaw) * Math.cos(ang) * d); camera.lookAt(0, 0, 0);
      glow.scale.setScalar(3.2 + pulse * .9 + (gl - .8) * 1.2); stars.rotation.y = t * .004;
      renderer.render(scene, camera);
    }
    G3 = { set(s) { st = TT[s] ? s : 'idle'; }, pulse(v) { pulse = Math.min(1.4, pulse + (v || .5)); } };
    G3.set(state); Sky.kill(); requestAnimationFrame(frame);
  })();

  /* ---------------- panels ---------------- */
  const tfmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const dfmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', weekday: 'short', month: 'short', day: 'numeric' });
  function clock() { const d = new Date(); $('#clock').textContent = tfmt.format(d); $('#date').textContent = dfmt.format(d).replace(/\./g, '').replace(/,/g, ' ·'); }
  const prices = { gold: null, btc: null };
  async function livePrices() {
    try { const [sp, bt] = await Promise.all([Data.goldSpot(), Data.ticker('btc')]); if (sp) prices.gold = sp.price; if (bt) prices.btc = bt.price; if (!sp) { const g = await Data.ticker('gold'); if (g) prices.gold = g.price; } } catch (e) {}
    renderPanels();
  }
  const dayStr = d => new Date(d + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' }).replace(/\./g, '');
  function schoolLists() {
    const z = B.tzNow(), all = B.M.tasks().filter(t => !t.done), late = all.filter(t => t.due && t.due < z.date).sort((a, b) => a.due < b.due ? -1 : 1);
    const soon = all.filter(t => t.due && t.due >= z.date && t.due <= B.dateAdd(z.date, 14)).sort((a, b) => a.due < b.due ? -1 : 1);
    return { late, soon, done: B.M.tasks().filter(t => t.done).length, total: B.M.tasks().length };
  }
  function renderPanels() {
    const snap = B.M.snapshot(), T = B.trading(), r = B.readiness(), z = B.tzNow();
    const goldPx = prices.gold || (snap && snap.gold && snap.gold.price), btcPx = prices.btc || (snap && snap.btc && snap.btc.price);
    const V = [
      ['Gold · XAU/USD', goldPx ? '$' + Number(goldPx).toFixed(2) : '—', B.goldOpen(z) ? (snap && snap.gold ? snap.gold.word : 'market open') : 'market closed', ''],
      ['Bitcoin', btcPx ? '$' + Math.round(btcPx).toLocaleString('en-US') : '—', snap && snap.btc ? snap.btc.word : 'open the desk for the call', ''],
      ['Demo account', B.usd(T.book.balance), `${(T.book.pos || []).length} open · autopilot ${T.auto.on ? 'on' : 'off'}`, T.book.balance < 10000 ? 'dn' : ''],
      ['Readiness', r.score + '/100', r.verdict, r.score < 50 ? 'dn' : '']
    ];
    $('#vitals').innerHTML = V.map(([k, v, sub, cls]) => `<div class="vital"><div class="k"><span>${esc(k)}</span><em class="${cls}">${esc(sub)}</em></div><b>${esc(v)}</b></div>`).join('');
    const S = schoolLists();
    $('#week').innerHTML = `<div class="k">School · <span>next 2 weeks</span></div><b>${S.soon.length}<small>due · ${S.late.length} missed</small></b><div class="bar"><i style="width:${S.total ? Math.round(S.done / S.total * 100) : 0}%"></i></div><div class="k" style="margin-top:6px"><span>${S.done} of ${S.total} done</span></div>`;
    const D = S.late.map(t => [t, true]).concat(S.soon.map(t => [t, false])).slice(0, 3);
    $('#dirs').innerHTML = D.length ? D.map(([t, late]) => `<li class="${late ? 'late' : ''}"><span>${esc(t.text.replace(/^Missed: /, ''))}<small>${late ? 'missed · ' : ''}${esc(dayStr(t.due))}</small></span></li>`).join('') : '<li><span>Nothing due. Nice.</span></li>';
  }

  /* ---------------- the brain ---------------- */
  let aiOK = false;
  const hasPuter = () => !!(window.puter && puter.ai && puter.auth);
  // The Atlas app on the Mac: this page is then served by the app itself, and the brain is Claude Code on this computer.
  const INAPP = APP;
  let helper = { ok: false };
  const helperReady = () => helper.ok && helper.claude && helper.signedIn;
  async function checkHelper(fresh) {
    if (!INAPP) return false;
    try { const r = await fetch('/health' + (fresh ? '?fresh=1' : ''), { cache: 'no-store' }); helper = Object.assign({ ok: true }, await r.json()); } catch (e) { helper = { ok: false }; }
    $$('.mac').forEach(el => { el.hidden = !helperReady(); });
    const box = $('#setupBox'); box.hidden = !helper.ok || helperReady();
    if (!box.hidden) $('#setupTxt').innerHTML = !helper.claude ? '<b>One-time setup.</b> Atlas thinks with Claude Code, which is included in your Claude Pro plan. Press the button: a Terminal window installs it from claude.ai and asks you to sign in.' : '<b>Sign in once.</b> Press the button and sign in with your Claude account in the window that opens.';
    $('#quit').hidden = !helper.ok;
    if (helper.ok) { const sv = document.querySelector('.bot span:last-child'); if (sv) sv.textContent = 'Saved on this Mac'; setState(state);
      $('#brainSub').textContent = 'on this Mac'; $('#aiOn').classList.toggle('ok', helperReady()); $('#aiTxt').textContent = helperReady() ? 'Claude Code on this Mac · can use your Mac' : 'Waiting for setup'; $('#connect').hidden = true; $('#offline').hidden = true; }
    return helperReady();
  }
  const TOOLWORD = n => /Gmail/i.test(n) ? 'Checking your email…' : /WebSearch|WebFetch/.test(n) ? 'Searching the web…' : /Read|Glob|Grep/.test(n) ? 'Looking through your files…' : /Write|Edit/.test(n) ? 'Writing a file…' : 'Working on your Mac…';
  async function thinkHelper(text, onText) {
    const body = { text, facts: knowledge() }, img = eyeFrame(); if (img) { body.image = img; body.eye = eyeKind === 'scr' ? 'screen' : 'camera'; }
    const r = await fetch('/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '', out = '', err = null, added = [];
    for (;;) {
      const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2); if (!line.startsWith('data: ')) continue;
        let ev; try { ev = JSON.parse(line.slice(6)); } catch (e) { continue; }
        if (ev.t) { out += ev.t; onText && onText(out); }
        else if (ev.tool) $('#status').textContent = TOOLWORD(ev.tool);
        else if (ev.error) err = ev;
        else if (ev.done) added = ev.added || [];
      }
    }
    if (added.length) { const T = B.M.tasks(); added.forEach(a => T.push({ id: 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), text: a.title, due: String(a.due).slice(0, 10), domain: 'life', done: false })); B.M.setTasks(T); renderPanels(); }
    if (err) { out = (out ? out + ' ' : '') + (err.text || ''); onText && onText(out); checkHelper(true); }
    return out.trim();
  }
  // Atlas speaks up by itself when a reminder comes due (while this window is open).
  async function pollDue() {
    if (!helper.ok || busy || state !== 'idle') return;
    try {
      const d = (await (await fetch('/due', { cache: 'no-store' })).json()).due || []; if (!d.length) return;
      const say = `Quick reminder, ${P.name || 'Yazdan'}: ${d.map(x => x.title).join('. Also, ')}.`;
      await fetch('/ack', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: d.map(x => x.id) }) });
      chat.push({ role: 'assistant', content: say }); ls.set('atlas_chat2', chat); renderChat(); $('#you').textContent = ''; $('#ai').textContent = say;
      if (talkMode) { await speak(say); if (state === 'speaking') setState('idle'); }
    } catch (e) {}
  }
  // Eyes: your camera or your screen. While one is on, Atlas gets a fresh picture with each thing you say.
  let eyeStream = null, eyeKind = null;
  function eyeOff() { if (eyeStream) eyeStream.getTracks().forEach(t => t.stop()); eyeStream = null; eyeKind = null; $('#eye').hidden = true; $('#eye').srcObject = null; paintEye(); }
  function paintEye() { [['#cam', 'cam', 'Camera'], ['#scr', 'scr', 'Share screen']].forEach(([id, k, label]) => { const b = $(id), on = eyeKind === k; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); b.textContent = on ? label + ' · on' : label; }); }
  async function eye(kind) {
    const was = eyeKind; eyeOff(); if (was === kind) { $('#status').textContent = 'Camera and screen are off.'; return; }
    try {
      eyeStream = kind === 'cam' ? await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }) : await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      eyeKind = kind; const v = $('#eye'); v.srcObject = eyeStream; v.hidden = false; await v.play().catch(() => {});
      eyeStream.getVideoTracks()[0].addEventListener('ended', eyeOff);
      $('#status').textContent = kind === 'cam' ? 'Camera on. Hold something up and ask me about it.' : 'I can see your screen. Ask me what to do next.';
    } catch (e) { eyeOff(); $('#status').textContent = kind === 'cam' ? 'Camera blocked. Allow it in the box Chrome shows, or in System Settings, Privacy & Security, Camera.' : 'Screen sharing was cancelled or blocked (System Settings, Privacy & Security, Screen Recording).'; }
    paintEye();
  }
  function eyeFrame() {
    const v = $('#eye'); if (!eyeStream || !v.videoWidth) return null;
    const max = eyeKind === 'scr' ? 1568 : 1024, k = Math.min(1, max / Math.max(v.videoWidth, v.videoHeight)), c = document.createElement('canvas');
    c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k); c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', .82).split(',')[1];
  }
  async function checkAI() {
    let signed = false; try { signed = hasPuter() && await puter.auth.isSignedIn(); } catch (e) {}
    aiOK = signed; if (helper.ok) { setState(state); return aiOK; }
    $('#aiOn').classList.toggle('ok', aiOK);
    $('#aiTxt').textContent = !hasPuter() ? (location.protocol === 'file:' ? 'Answering from your own data. The full AI and voices need the online version.' : 'Offline: answering from your own data') : aiOK ? 'AI connected (Puter, free)' : 'Connect once to give Atlas a real brain and voice';
    $('#connect').hidden = !hasPuter() || aiOK; setState(state);
    return aiOK;
  }
  async function connect() { if (!hasPuter()) return false; try { await puter.auth.signIn(); } catch (e) {} return checkAI(); }
  function knowledge() {
    const z = B.tzNow(), S = schoolLists(), snap = B.M.snapshot();
    const week = [1, 2, 3, 4, 5].map(d => { const date = B.dateAdd(z.date, (d - z.wd + 7) % 7); const ev = B.eventsOn(date); return `${B.DSHORT[d]}: ${ev.length ? ev.map(e => `${e.title} ${B.fmtHM(e.s)}-${B.fmtHM(e.e)}${e.optional ? ' (optional)' : ''}`).join(', ') : 'no classes'}`; }).join('\n');
    return [`Now: ${dfmt.format(new Date())} ${tfmt.format(new Date())} in Toronto.`, B.context(), `Weekly classes:\n${week}`,
      `Missed school work: ${S.late.map(t => `${t.text} (was due ${t.due})`).join('; ') || 'none'}.`,
      `Due in the next 2 weeks: ${S.soon.map(t => `${t.text} (due ${dayStr(t.due)})`).join('; ') || 'nothing'}.`,
      `Live prices: gold ${prices.gold ? '$' + prices.gold.toFixed(2) : 'unknown'}, Bitcoin ${prices.btc ? '$' + Math.round(prices.btc) : 'unknown'}. Gold market ${B.goldOpen(z) ? 'open' : 'closed (it trades Sunday 6 PM to Friday 5 PM Eastern)'}.`,
      snap ? `Trading desk calls: gold says "${snap.gold ? snap.gold.word : '?'}", Bitcoin says "${snap.btc ? snap.btc.word : '?'}".` : '',
      `His tested strategies: Quiet Breakout (gold 1 hour), Gold Trend and Bitcoin Trend Rider (4 hour, buys only), London Breakout (weak edge).`,
      window.OS_ABOUT ? `About him (he wrote this):\n${window.OS_ABOUT}` : '',
      news.length ? `Today's news headlines (Google News Canada): ${news.join(' | ')}` : '',
      `Things he has told you before: ${mem.join('; ') || 'nothing yet'}.`].filter(Boolean).join('\n');
  }
  const SYSTEM = `You are Atlas, Yazdan's own AI and a friend in his corner. He's a denturism student at Georgian College in Toronto who is learning to trade gold and Bitcoin on a demo account.
You are talking OUT LOUD in a real back-and-forth conversation, so sound like a person, not an assistant:
- Short turns, usually one to three sentences. Longer only if he asks you to explain.
- Contractions and everyday words. React first ("oh nice", "ugh, that's a lot"), then answer.
- A light joke or friendly teasing now and then when it fits. Never forced, not every turn.
- Ask him something back sometimes, like a friend would.
- No lists, no markdown, no emoji, no symbols. Say numbers and times the way people say them.
- Never call yourself an AI model, never say you're reading or typing.
Use the facts below; if something isn't there, say you don't know. Be honest about trading: never promise profits; real money only after weeks of steady demo trading that follows his rules.
Actions: to add something to his to-do list, end your reply with a line [[ADD: short title | YYYY-MM-DD]]. To remember a fact he tells you about himself, end with [[REMEMBER: the fact]]. Mention what you did in a few words.`;
  const textOf = r => { if (r == null) return ''; if (typeof r === 'string') return r; const c = r.message && r.message.content; if (typeof c === 'string') return c; if (Array.isArray(c)) return c.map(x => x.text || '').join(''); return String(r.text || r); };
  // Streams the reply; onText gets the text so far. Remembers which model worked last time.
  let news = [], newsAt = 0;
  async function getNews() {
    if (Date.now() - newsAt < 20 * 60e3 && news.length) return;
    try {
      const f = (window.puter && puter.net && puter.net.fetch) ? puter.net.fetch : null; if (!f) return;
      const r = await f('https://news.google.com/rss?hl=en-CA&gl=CA&ceid=CA:en'); const x = await r.text();
      news = [...x.matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>/g)].slice(0, 10).map(m => m[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim()); newsAt = Date.now();
    } catch (e) {}
  }
  // Free offline brain: an open AI model (Llama 3.2, about 2 GB, downloaded once) running on your own computer's chip.
  // Used when Puter isn't connected or its free allowance runs out. Only after you turn it on.
  let local = null, localLoading = null;
  let gpuOK = false; const canLocal = () => gpuOK;
  (async () => { try { gpuOK = !!navigator.gpu && !!(await navigator.gpu.requestAdapter()); } catch (e) {} const b = document.getElementById('offline'); if (b) b.hidden = !gpuOK; })();
  function loadLocal() {
    if (!localLoading) localLoading = (async () => {
      const w = await import('https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.79/+esm');
      local = await w.CreateMLCEngine('Llama-3.2-3B-Instruct-q4f16_1-MLC', { initProgressCallback: p => { $('#aiTxt').textContent = 'Downloading the free offline brain… ' + Math.round((p.progress || 0) * 100) + '% (one time only)'; } });
      $('#aiTxt').textContent = aiOK ? 'AI connected (Puter, free) · offline brain ready' : 'Offline brain ready (free, runs on this computer)'; return local;
    })().catch(e => { localLoading = null; $('#aiTxt').textContent = 'The offline brain needs Chrome on a Mac or PC with a modern graphics chip.'; throw e; });
    return localLoading;
  }
  async function thinkLocal(text, onText) {
    const eng = local || await loadLocal();
    const msgs = [{ role: 'system', content: SYSTEM + '\n\nFACTS\n' + knowledge() }].concat(chat.slice(-8).map(m => ({ role: m.role, content: m.content })));
    const r = await eng.chat.completions.create({ messages: msgs, stream: true, temperature: .8, max_tokens: 300 }); let out = '';
    for await (const c of r) { const t = c.choices[0] && c.choices[0].delta && c.choices[0].delta.content || ''; if (t) { out += t; onText && onText(out); } }
    return out.trim();
  }
  async function think(text, onText) {
    if (helper.ok) {
      if (helperReady()) { try { const o = await thinkHelper(text, onText); if (o) return o; } catch (e) {} await checkHelper(true); }
      if (!helperReady()) { const o = "My brain isn't set up on this Mac yet. Press the Set up button on the right, and I'll be ready in a couple of minutes."; onText && onText(o); return o; }
    }
    if (/news|headline|happening|going on in the world/i.test(text)) await getNews();
    if (!aiOK && hasPuter()) await checkAI();
    if (aiOK) {
      const msgs = [{ role: 'system', content: SYSTEM + '\n\nFACTS\n' + knowledge() }].concat(chat.slice(-14).map(m => ({ role: m.role, content: m.content })));
      const tried = ls.get('atlas_model', null), models = [tried, 'claude-sonnet-4-5', 'gpt-4o-mini', null].filter((m, i, A) => A.indexOf(m) === i && (m !== undefined));
      for (const model of models) {
        try {
          const opt = Object.assign({ stream: true }, model ? { model } : {});
          const r = await puter.ai.chat(msgs, opt); let out = '';
          if (r && typeof r[Symbol.asyncIterator] === 'function') { for await (const part of r) { const t = part && (part.text || (part.message && part.message.content)) || ''; if (t) { out += t; onText && onText(out); } } }
          else { out = textOf(r); onText && onText(out); }
          if (out.trim()) { ls.set('atlas_model', model); return out.trim(); }
        } catch (e) { if (e && /sign|auth|401/i.test(String(e.message || e))) { aiOK = false; break; } }
      }
    }
    if (ls.get('atlas_local', false) && canLocal()) { try { const o = await thinkLocal(text, onText); if (o) return o; } catch (e) {} }
    const r = B.route(text); const out = r.text + (aiOK ? '' : ' (Connect the AI on the right, or turn on the free offline brain, so I can really chat with you.)'); onText && onText(out); return out;
  }
  function actions(reply) {
    let out = reply;
    out = out.replace(/\[\[ADD:\s*([^|\]]+)\|\s*(\d{4}-\d{2}-\d{2})\s*\]\]/gi, (_, title, due) => { const T = B.M.tasks(); T.push({ id: 'a' + Date.now().toString(36), text: title.trim(), due, domain: 'school', done: false }); B.M.setTasks(T); renderPanels(); return ''; });
    out = out.replace(/\[\[REMEMBER:\s*([^\]]+)\]\]/gi, (_, f) => { mem = mem.filter(x => x !== f.trim()).concat([f.trim()]).slice(-40); ls.set('atlas_mem', mem); return ''; });
    return out.trim();
  }

  /* ---------------- speaking ---------------- */
  function stopVoice() { try { if (audio) { audio.pause(); audio = null; } } catch (e) {} try { speechSynthesis.cancel(); } catch (e) {} }
  // Speaker: fetch the voice for each sentence as soon as it's written and play them in order.
  const cleanSay = t => t.replace(/\[\[[^\]]*\]\]/g, '').replace(/[*_#`>\[\]]/g, '').trim();
  // Try the chosen voice; if that service fails, use a backup human voice instead of the robot one.
  let ttsGood = null;
  // Kokoro: a free open-source voice model (about 90 MB, downloaded once, then cached by the browser).
  let kokoro = null, kokoroLoading = null, kChain = Promise.resolve(), kokoroFast = innerWidth >= 900;
  function loadKokoro() {
    if (!kokoroLoading) kokoroLoading = (async () => {
      const { KokoroTTS } = await import('https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm');
      let gpu = false; try { gpu = innerWidth >= 900 && !!navigator.gpu && !!(await navigator.gpu.requestAdapter()); } catch (e) {}
      kokoroFast = gpu;
      const seen = {}; let lastPct = -1;
      kokoro = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: gpu ? 'fp32' : 'q8', device: gpu ? 'webgpu' : 'wasm',
        progress_callback: p => { if (!p || !p.file || !p.total) return; seen[p.file] = [p.loaded || 0, p.total]; const L = Object.values(seen), pct = Math.round(L.reduce((a, x) => a + x[0], 0) / L.reduce((a, x) => a + x[1], 0) * 100);
          if (pct !== lastPct && pct < 100) { lastPct = pct; $('#hint').textContent = `Downloading my voice (first time only)… ${pct}%`; } } });
      $('#hint').textContent = 'Talk, then pause. Atlas answers out loud. Press Escape to stop it.';
      return kokoro;
    })().catch(e => { kokoroLoading = null; throw e; });
    return kokoroLoading;
  }
  function kokoroSay(text, kv) { // one sentence at a time, in order
    const job = kChain.then(async () => { const k = kokoro || await loadKokoro(); const a = await k.generate(text, { voice: kv }); return new Audio(URL.createObjectURL(a.toBlob())); });
    kChain = job.catch(() => {}); return job;
  }
  window.AtlasKokoro = { load: loadKokoro, say: kokoroSay };
  async function ttsFetch(text) {
    const v = VOICES.find(x => x.id === voice) || VOICES[0];
    if (v.provider === 'browser') return null;
    if (v.provider === 'kokoro') {
      // free voice first; while it's still downloading the first time, borrow the Puter voice so you never hear the robot
      // fast computers: free voice first. Phones (slower): Puter's free voice first while it lasts, then Kokoro.
      if ((kokoro && kokoroFast) || !aiOK) { try { return await kokoroSay(text, v.id.slice(2)); } catch (e) { if (!aiOK) return null; } }
      else if (!kokoro) loadKokoro().catch(() => {});
    }
    if (!aiOK) { try { return await kokoroSay(text, v.provider === 'kokoro' ? v.id.slice(2) : 'bm_george'); } catch (e) { return null; } }
    const t = text.slice(0, 2900), tries = [];
    if (ttsGood) tries.push(ttsGood);
    if (v.provider !== 'openai') tries.push({ provider: 'elevenlabs', model: 'eleven_flash_v2_5', voice: v.provider === 'elevenlabs' ? v.id : 'JBFqnCBsd6RMkjVDRZzb' });
    if (v.provider === 'elevenlabs') tries.push({ provider: 'elevenlabs', model: 'eleven_flash_v2_5', voice: v.id }, { provider: 'elevenlabs', model: 'eleven_multilingual_v2', voice: v.id });
    if (v.provider === 'openai') tries.push({ provider: 'openai', model: 'gpt-4o-mini-tts', voice: v.id, instructions: STYLE });
    tries.push({ provider: 'openai', model: 'gpt-4o-mini-tts', voice: 'ash', instructions: STYLE }, { provider: 'aws-polly', voice: 'Matthew', engine: 'neural' });
    for (const o of tries) {
      if (ttsGood && o !== ttsGood && o.voice !== v.id && ttsGood.voice === v.id) continue;
      try { const a = await puter.ai.txt2speech(t, o); if (a) { if (o.voice === v.id || !ttsGood) ttsGood = o; return a; } } catch (e) {}
    }
    if (v.provider === 'kokoro') { try { return await kokoroSay(text, v.id.slice(2)); } catch (e) {} }
    return null;
  }
  function Speaker() {
    let used = 0, chain = Promise.resolve(), stopped = false, any = false;
    const play = (text, fetched) => { chain = chain.then(async () => {
      if (stopped || !talkMode) return; const a = await fetched; if (stopped) return; setState('speaking'); any = true;
      if (a) { audio = a; await new Promise(res => { a.onended = res; a.onerror = res; a.onpause = res; a.play().catch(res); }); audio = null; }
      else await new Promise(res => B.Voice.speak(text, () => Sky.pulse(.6), res));
    }); };
    const queue = text => { const t = cleanSay(text); if (t && talkMode) play(t, ttsFetch(t)); };
    return {
      feed(full) { // queue each finished sentence (at least ~25 characters at a time)
        const rest = full.slice(used), m = rest.match(/^[\s\S]{25,}?[.!?…](?=\s)/);
        if (m) { used += m[0].length; queue(m[0]); }
      },
      async finish(full) { queue(full.slice(used)); used = full.length; await chain; return any; },
      stop() { stopped = true; }
    };
  }
  let speaker = null;
  function stopVoice() { if (speaker) speaker.stop(); try { if (audio) { audio.pause(); audio = null; } } catch (e) {} try { speechSynthesis.cancel(); } catch (e) {} }
  async function speak(text) { const sp = Speaker(); speaker = sp; setState('speaking'); await sp.finish(text); }

  /* ---------------- listening ---------------- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  function listen() {
    if (busy) return;
    if (!SR) { $('#status').textContent = 'Voice needs Google Chrome. You can type below.'; $('#inp').focus(); return; }
    stopVoice(); if (rec) { try { rec.stop(); } catch (e) {} return; }
    rec = new SR(); rec.lang = 'en-US'; rec.interimResults = true; rec.continuous = false; let final = '';
    rec.onstart = () => setState('listening');
    rec.onresult = e => { let interim = ''; for (let i = e.resultIndex; i < e.results.length; i++) { const x = e.results[i]; if (x.isFinal) final += x[0].transcript; else interim += x[0].transcript; } $('#you').textContent = `“${(final + interim).trim()}”`; $('#ai').textContent = ''; Sky.pulse(.4); };
    rec.onerror = e => { rec = null; setState('idle'); $('#status').textContent = e.error === 'not-allowed' ? 'Microphone blocked. Click the mic icon in the address bar and allow it.' : e.error === 'no-speech' ? 'I didn\'t hear anything. Tap to try again.' : 'Voice hiccup. Tap to try again, or type.'; };
    rec.onend = () => { rec = null; if (final.trim()) ask(final.trim()); else if (state === 'listening') setState('idle'); };
    try { rec.start(); } catch (e) { rec = null; setState('idle'); }
  }

  /* ---------------- one turn ---------------- */
  async function ask(text) {
    if (busy || !text) return; busy = true; stopVoice();
    chat.push({ role: 'user', content: text }); renderChat(); setState('thinking'); B.M.addLog('you', text);
    let reply; const sp = talkMode ? Speaker() : null; speaker = sp;
    try { reply = await think(text, t => { $('#ai').textContent = cleanSay(t); if (sp) sp.feed(t); }); }
    catch (e) { reply = 'Sorry, I lost my train of thought. Say that again?'; }
    const said = reply; reply = actions(reply);
    chat.push({ role: 'assistant', content: reply }); chat = chat.slice(-40); ls.set('atlas_chat2', chat); B.M.addLog('atlas', reply);
    renderChat(); busy = false;
    if (sp) await sp.finish(said);
    if (state === 'speaking' || state === 'thinking') setState('idle');
    if (auto && talkMode && SR && !/^(ok(ay)? )?(bye|goodbye|that's all|thanks,? that's it|good ?night|stop)\b/i.test(text)) setTimeout(() => { if (state === 'idle' && !busy) listen(); }, 350);
  }

  /* ---------------- wiring ---------------- */
  $('#core').addEventListener('click', () => { if (state === 'speaking') { stopVoice(); setState('idle'); listen(); } else if (state !== 'thinking') listen(); });
  $('#talk').addEventListener('click', () => $('#core').click());
  $('#bar').addEventListener('submit', e => { e.preventDefault(); const v = $('#inp').value.trim(); if (v) { $('#inp').value = ''; ask(v); } });
  $('#connect').addEventListener('click', connect);
  $('#quit').addEventListener('click', async e => { e.preventDefault(); eyeOff(); stopVoice(); try { await fetch('/quit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); } catch (x) {} helper = { ok: false }; $('#status').textContent = 'Atlas is off. Close this window; open the Atlas app to start it again.'; try { top.close(); } catch (x) {} });
  $('#cam').addEventListener('click', () => eye('cam')); $('#scr').addEventListener('click', () => eye('scr'));
  $('#setup').addEventListener('click', async () => { $('#setupTxt').innerHTML = '<b>A Terminal window is opening.</b> Follow the two steps there, then come back. This box disappears when it is done.'; try { await fetch('/setup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); } catch (e) {} });
  $('#guide').addEventListener('click', e => { const q = e.target.closest('q'); if (q) { $('#inp').value = q.textContent; $('#inp').focus(); } });
  if (INAPP) { checkHelper(); setInterval(() => { if (!helperReady()) checkHelper(true); }, 5000); setInterval(pollDue, 20000); }
  // free offline brain switch (only on computers that can run it)
  const offBtn = $('#offline'); offBtn.hidden = !canLocal();
  const offLbl = () => { const on = ls.get('atlas_local', false); offBtn.textContent = on ? 'Offline brain: on' : 'Free offline brain'; offBtn.setAttribute('aria-pressed', on); };
  offBtn.addEventListener('click', () => { const on = !ls.get('atlas_local', false); ls.set('atlas_local', on); offLbl(); if (on) loadLocal().catch(() => {}); });
  offLbl(); if (ls.get('atlas_local', false) && canLocal()) setTimeout(() => loadLocal().catch(() => {}), 4000);
  // get the free voice ready early (desktop right away, phone on first tap)
  if ((VOICES.find(x => x.id === voice) || {}).provider === 'kokoro') { if (innerWidth >= 900) setTimeout(() => loadKokoro().catch(() => {}), 1500); else addEventListener('pointerdown', () => loadKokoro().catch(() => {}), { once: true }); }
  $('#clear').addEventListener('click', () => { chat = []; ls.set('atlas_chat2', chat); renderChat(); });
  $('#mTalk').addEventListener('click', () => { talkMode = true; ls.set('atlas_talkmode', true); $('#mTalk').classList.add('on'); $('#mType').classList.remove('on'); });
  $('#mType').addEventListener('click', () => { talkMode = false; ls.set('atlas_talkmode', false); stopVoice(); $('#mType').classList.add('on'); $('#mTalk').classList.remove('on'); });
  const paintAuto = () => $('#auto').classList.toggle('on', auto);
  $('#auto').addEventListener('click', () => { auto = !auto; ls.set('atlas_auto', auto); paintAuto(); });
  document.addEventListener('click', e => {
    const s = e.target.closest('[data-say]'); if (s) { ask(s.dataset.say); return; }
    const v = e.target.closest('[data-voice]'); if (v) { voice = v.dataset.voice; ls.set('atlas_voice4', voice); ttsGood = null; renderVoices(); if (!busy) { stopVoice(); speak(`Hey ${P.name || 'Yazdan'}, it's ${NAME}. This is how I'd sound.`).then(() => { if (state === 'speaking') setState('idle'); }); } }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { stopVoice(); if (rec) try { rec.abort(); } catch (x) {} setState('idle'); return; }
    if (e.code === 'Space' && !/INPUT|TEXTAREA/.test(document.activeElement && document.activeElement.tagName || '')) { e.preventDefault(); $('#core').click(); }
  });
  if (!talkMode) { $('#mType').classList.add('on'); $('#mTalk').classList.remove('on'); }
  renderVoices(); paintAuto(); renderChat(); renderPanels(); setState('idle'); clock(); setInterval(clock, 1000);
  livePrices(); setInterval(livePrices, 20000); addEventListener('storage', renderPanels);
  checkAI(); setTimeout(checkAI, 2500);
})();

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
  const VOICES = [
    { id: 'JBFqnCBsd6RMkjVDRZzb', label: 'George · British', provider: 'elevenlabs' }, { id: 'onwK4e9ZLuTAKqWW03F9', label: 'Daniel · British', provider: 'elevenlabs' },
    { id: 'nPczCjzI2devNBz1zQrb', label: 'Brian', provider: 'elevenlabs' }, { id: 'cgSgspJ2msm6clMCkdW9', label: 'Jessica', provider: 'elevenlabs' },
    { id: 'ash', label: 'Ash', provider: 'openai' }, { id: 'coral', label: 'Coral', provider: 'openai' },
    { id: 'mac', label: 'Mac voice', provider: 'browser' }
  ];
  const STYLE = 'Talk like a relaxed, warm friend in a casual conversation: natural pace, real emotion, small pauses, a little smile in your voice when joking. Never sound like a narrator reading text.';
  let voice = ls.get('atlas_voice3', 'JBFqnCBsd6RMkjVDRZzb'), talkMode = ls.get('atlas_talkmode', true), auto = ls.get('atlas_auto', true);
  function renderVoices() { $('#voices').innerHTML = VOICES.map(v => `<button type="button" data-voice="${v.id}" aria-pressed="${v.id === voice}">${esc(v.label)}</button>`).join(''); }

  /* ---------------- state + display ---------------- */
  let state = 'idle', busy = false, rec = null, audio = null, chat = ls.get('atlas_chat2', []), mem = ls.get('atlas_mem', []);
  const STATUS = { idle: () => chat.length ? 'Your turn · tap the galaxy or press space' : 'Tap the galaxy or press space to talk', listening: () => 'Listening · just pause when you\'re done', thinking: () => 'Thinking', speaking: () => 'Speaking · tap to cut in', error: () => 'Something went wrong · try again' };
  function setState(s) {
    state = s; Sky.set(s); $('#status').textContent = STATUS[s]();
    $$('#states span[data-s]').forEach(x => x.classList.toggle('on', x.dataset.s === s));
    $('#line').textContent = `● Core · ${{ idle: 'idle', listening: 'listening', thinking: 'working', speaking: 'speaking', error: 'error' }[s]} · connected vault · ${aiOK ? 'AI online' : 'AI offline'}`;
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
    function loop(now) { draw(now); if (!still) requestAnimationFrame(loop); }
    addEventListener('resize', size); size(); requestAnimationFrame(loop);
    return { set(s) { st = T[s] ? s : 'idle'; if (still) draw(performance.now()); }, pulse(v) { pulse = Math.min(1.4, pulse + (v || .5)); } };
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
  async function checkAI() {
    let signed = false; try { signed = hasPuter() && await puter.auth.isSignedIn(); } catch (e) {}
    aiOK = signed; $('#aiOn').classList.toggle('ok', aiOK);
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
  async function think(text, onText) {
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
    const r = B.route(text); const out = r.text + (aiOK ? '' : ' (Connect the AI on the right so I can really chat with you.)'); onText && onText(out); return out;
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
  function ttsFetch(text) {
    const v = VOICES.find(x => x.id === voice) || VOICES[0];
    if (v.provider === 'browser' || !aiOK) return Promise.resolve(null);
    const opts = v.provider === 'openai' ? { provider: 'openai', model: 'gpt-4o-mini-tts', voice: v.id, instructions: STYLE } : { provider: 'elevenlabs', model: 'eleven_flash_v2_5', voice: v.id };
    return puter.ai.txt2speech(text.slice(0, 2900), opts).catch(() => null);
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
  $('#clear').addEventListener('click', () => { chat = []; ls.set('atlas_chat2', chat); renderChat(); });
  $('#mTalk').addEventListener('click', () => { talkMode = true; ls.set('atlas_talkmode', true); $('#mTalk').classList.add('on'); $('#mType').classList.remove('on'); });
  $('#mType').addEventListener('click', () => { talkMode = false; ls.set('atlas_talkmode', false); stopVoice(); $('#mType').classList.add('on'); $('#mTalk').classList.remove('on'); });
  const paintAuto = () => $('#auto').classList.toggle('on', auto);
  $('#auto').addEventListener('click', () => { auto = !auto; ls.set('atlas_auto', auto); paintAuto(); });
  document.addEventListener('click', e => {
    const s = e.target.closest('[data-say]'); if (s) { ask(s.dataset.say); return; }
    const v = e.target.closest('[data-voice]'); if (v) { voice = v.dataset.voice; ls.set('atlas_voice3', voice); renderVoices(); if (!busy) { stopVoice(); speak(`Hey ${P.name || 'Yazdan'}, it's ${NAME}. This is how I'd sound.`).then(() => { if (state === 'speaking') setState('idle'); }); } }
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

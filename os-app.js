/* My OS: one place for school, work, trading, notes, content and your apps. Uses the same memory as the Trading Desk and Atlas. */
(function () {
  'use strict';
  const B = window.Brain, $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const IN_APP = !!(window.osApp && window.osApp.electron);
  const VIEWS = ['home', 'atlas', 'trading', 'learn', 'charts', 'school', 'vault', 'create', 'apps', 'settings'];
  const TITLES = { learn: 'Learn', home: 'Home', atlas: 'Atlas', trading: 'Trading Desk', charts: 'Charts', school: 'School', vault: 'Vault', create: 'Create', apps: 'Apps', settings: 'Settings' };
  const S = Object.assign({ portal: '', broker: '', tele: 'https://web.telegram.org/a/' }, B.ls.get('os_links', {}));
  let homeOrb = null;

  /* ---------------- routing ---------------- */
  function route() {
    const v = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home';
    VIEWS.forEach(x => { $('#v-' + x).hidden = x !== v; });
    $$('.rail [data-v]').forEach(a => a.toggleAttribute('aria-current', a.dataset.v === v)); $$('.rail [data-v]').forEach(a => { if (a.dataset.v === v) a.setAttribute('aria-current', 'page'); });
    $('#tbView').textContent = TITLES[v];
    const fr = $('#v-' + v + ' iframe[data-src]'); if (fr && !fr.getAttribute('src')) fr.src = IN_APP ? fr.dataset.src.replace(/(\.html)/, '$1?app=1') : fr.dataset.src;
    if (homeOrb) homeOrb.setState(v === 'home' ? 'idle' : 'idle');
    if (v === 'charts') charts();
    if (v === 'school') renderSchool();
    if (v === 'vault') renderVault();
    if (v === 'create') { kling(); renderContent(); }
    if (v === 'apps') renderApps();
    if (v === 'settings') renderSettings();
    if (v === 'home') renderHome();
    // panels slide in one after another
    $$('#v-' + v + ' > *, #v-' + v + ' > .cols > *, #v-' + v + ' > .cards4 > *').forEach((el, i) => { el.classList.remove('stg'); void el.offsetWidth; el.style.setProperty('--i', i); el.classList.add('stg'); });
  }
  // numbers count up
  function countUp(el, text) {
    if (!el) return; const m = String(text).match(/^(\D*)([\d,]+(?:\.\d+)?)(.*)$/);
    if (!m || matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = text; return; }
    const target = parseFloat(m[2].replace(/,/g, '')), dec = (m[2].split('.')[1] || '').length, t0 = performance.now(), D = 900;
    if (el.dataset.shown === text) return; el.dataset.shown = text;
    const step = now => { const k = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - k, 3), v = target * e;
      el.textContent = m[1] + v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + m[3]; if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  /* ---------------- opening things inside ---------------- */
  // In the desktop app every site opens in a tab inside the app. In a normal browser, sites that refuse to be
  // shown inside other pages (Claude, Blackboard, Kling, Telegram…) open in their own window instead.
  const tabs = []; let curTab = null;
  function openInside(url, title) {
    if (!url) return;
    if (!/^https?:/.test(url)) { if (url.startsWith('index.html') || url.startsWith('jarvis.html')) { const v = url.startsWith('jarvis') ? 'atlas' : 'trading'; const fr = $('#v-' + v + ' iframe'); fr.src = url; location.hash = v; } else location.href = url; return; }
    let t = tabs.find(x => x.url === url);
    if (!t) { t = { id: B.uid(), url, title: title || new URL(url).hostname.replace('www.', '') }; tabs.push(t); }
    curTab = t.id; location.hash = 'apps'; renderTabs();
  }
  function renderTabs() {
    const bar = $('#appTabs'), fr = $('#appFrame'); bar.hidden = fr.hidden = !tabs.length; if (!tabs.length) return;
    bar.innerHTML = tabs.map(t => `<button type="button" data-tab="${t.id}" aria-pressed="${t.id === curTab}">${esc(t.title)}<i data-close="${t.id}" aria-label="Close tab">×</i></button>`).join('');
    const t = tabs.find(x => x.id === curTab) || tabs[0]; curTab = t.id;
    if (IN_APP) {
      // the desktop app shows every site inside, in its own tab that stays signed in
      $$('webview', fr).forEach(w => { if (!tabs.some(x => x.id === w.dataset.tab)) w.remove(); else w.style.display = w.dataset.tab === t.id ? 'flex' : 'none'; });
      if (!$(`webview[data-tab="${t.id}"]`, fr)) { const w = document.createElement('webview'); w.dataset.tab = t.id; w.setAttribute('src', t.url); w.setAttribute('partition', 'persist:myos'); w.setAttribute('allowpopups', ''); w.style.cssText = 'width:100%;height:100%;display:flex'; w.addEventListener('page-title-updated', e => { t.title = (e.title || t.title).slice(0, 28); $$('#appTabs button').forEach(b => { if (b.dataset.tab === t.id) b.firstChild.textContent = t.title; }); }); fr.appendChild(w); }
      $$('.blocked', fr).forEach(x => x.remove());
      return;
    }
    const embeddable = /tradingview\.com\/widgetembed|youtube\.com\/embed|youtube-nocookie|s\.tradingview/.test(t.url);
    fr.innerHTML = embeddable ? `<iframe src="${esc(t.url)}" title="${esc(t.title)}"></iframe>`
      : `<div class="blocked"><b>${esc(t.title)} doesn't allow other pages to show it inside them.</b><span class="muted small">That's a security setting on their side. The desktop app (Yazdan OS.app) opens it right here in a tab. In this browser, it opens in its own window.</span><div class="appbtns" style="justify-content:center"><button class="btn gold" data-pop="${esc(t.url)}">Open ${esc(t.title)}</button></div></div>`;
  }

  /* ---------------- top bar ---------------- */
  const dfmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', weekday: 'long', month: 'long', day: 'numeric' });
  const tfmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit' });
  function clock() { const d = new Date(); $('#tbClock').textContent = tfmt.format(d).replace(/\./g, ''); $('#tbDate').textContent = dfmt.format(d); tickNext(); tickTimeline(); }
  function answer(you, r) {
    const el = $('#answer'), acts = [];
    if (r.claude) acts.push(`<button class="btn small gold" data-url="${esc(r.claude)}">Open in Claude</button>`);
    (r.actions || []).forEach(a => acts.push(a.say ? `<button class="btn small" data-say="${esc(a.say)}">${esc(a.label)}</button>` : `<button class="btn small" data-url="${esc(a.href)}">${esc(a.label)}</button>`));
    el.innerHTML = `<button class="x" aria-label="Close">×</button><span class="eyebrow">${r.tier === 1 ? 'Instant' : r.tier === 2 ? 'From the playbook' : 'Handed to Claude'} · ${esc(you)}</span><p>${esc(r.text)}</p>${acts.length ? `<div class="acts">${acts.join('')}</div>` : ''}`;
    el.hidden = false;
  }
  function ask(text) {
    B.M.addLog('you', text); const r = B.route(text); B.M.addLog('atlas', r.text, { tier: r.tier });
    answer(text, r); renderHome();
    if (r.analyze) openInside(`index.html?analyze=${r.analyze}#${r.analyze}`);
    else if (r.open) openInside(r.open);
    if (r.tier === 3 && r.claude) setTimeout(() => openInside(r.claude, 'Claude'), 700);
    if (r.did === 'schedule') renderSchool();
  }

  /* ---------------- home ---------------- */
  function renderHome() {
    const P = B.M.profile(), z = B.tzNow(), h = z.m / 60;
    $('#greet').innerHTML = `${h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'}, <em>${esc(P.name)}</em>.`;
    const ev = B.eventsOn(z.date).filter(e => !e.optional), due = B.tasksDue(1);
    $('#greetSub').textContent = `${ev.length ? `${ev.length} class${ev.length > 1 ? 'es' : ''} today` : z.wd === 5 ? 'No school today' : 'Nothing scheduled today'}${due.length ? `, ${due.length} task${due.length > 1 ? 's' : ''} due soon` : ''}. ${B.goldOpen(z) ? 'Gold is open.' : 'Gold is closed right now.'}`;
    $('#aName2').textContent = P.assistant || 'Atlas';
    // goals
    const rv = B.review(), L = B.M.learn(), wk = (() => { const d = new Date(z.date + 'T12:00:00'); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return Math.floor(d.getTime() / 1000) - 12 * 3600; })();
    const goals = B.M.goals().map(g => { let p = g.progress || 0; if (g.auto === 'planTrades') p = rv.perTrade.filter(x => x.p.openedAt >= wk && !x.ms.length).length; if (g.auto === 'lessons') p = Object.values(L.lessons).filter(Boolean).length; return Object.assign({}, g, { p }); });
    $('#goals').innerHTML = goals.map(g => `<div class="goal"><span>${esc(g.text)}</span><span>${Math.min(g.p, g.target)}/${g.target}</span><div class="gbar"><i style="--w:${Math.min(1, g.p / g.target)}"></i></div></div>`).join('');
    // cards
    const T = B.trading(), snap = T.snap, r = B.readiness();
    countUp($('#hBal'), B.usd(snap && snap.equity ? snap.equity : T.book.balance));
    $('#hOpen').textContent = `${(T.book.pos || []).length} open · ${T.mine.length} trades by hand`;
    $('#hAuto').textContent = T.auto.on ? 'Autopilot on' : 'Autopilot off'; $('#hAuto').dataset.tone = T.auto.on ? 'green' : '';
    $('#hGoldW').textContent = snap && snap.gold ? snap.gold.word : 'Open the desk for the call'; $('#hBtcW').textContent = snap && snap.btc ? snap.btc.word : '-';
    const C = 2 * Math.PI * 30; $('#hRing').innerHTML = `<svg viewBox="0 0 74 74"><circle class="t" cx="37" cy="37" r="30"/><circle class="f" cx="37" cy="37" r="30" style="stroke-dasharray:${C};stroke-dashoffset:${C * (1 - r.score / 100)}"/></svg><b>${r.score}</b>`;
    $('#hReadyV').textContent = r.verdict;
    // due next (missed in red) and today's classes
    const all = B.M.tasks().filter(t => !t.done && t.due).sort((a, b) => a.due.localeCompare(b.due)), lateL = all.filter(t => t.due < z.date), soonL = all.filter(t => t.due >= z.date);
    const dl = d => d === z.date ? 'today' : d === B.dateAdd(z.date, 1) ? 'tomorrow' : new Date(d + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' }).replace(/\./g, '');
    const nx = lateL.slice(0, 3).map(t => [t, true]).concat(soonL.map(t => [t, false])).slice(0, Math.max(3, Math.min(5, lateL.length + 2)));
    $('#dueNext').innerHTML = nx.length ? nx.map(([t, l]) => `<li class="${l ? 'late' : ''}"><span>${esc(t.text.replace(/^Missed: /, ''))}</span><small>${l ? 'missed · ' : ''}${dl(t.due)}</small></li>`).join('') : '<li><span>Nothing due. Nice.</span><small></small></li>';
    const evAll = B.eventsOn(z.date); $('#clsDay').textContent = B.DAYS[z.wd];
    $('#todayCls').innerHTML = evAll.length ? evAll.map(e => `<li class="${z.m >= e.e ? 'past' : ''}"><span>${esc(e.title)}${e.optional ? ' (optional)' : ''}</span><small>${B.fmtHM(e.s)} – ${B.fmtHM(e.e)}</small></li>`).join('') : `<li><span>No classes today.</span><small>${(B.nextEvent() || {}).title ? 'next: ' + esc(B.nextEvent().title) : ''}</small></li>`;
    renderTimeline(); renderTasks(); renderFeed(); renderSkills(); renderAutos(); tickNext();
  }
  function tickNext() {
    const n = B.nextEvent(), c = B.nowEvent(); if (!$('#nextTitle')) return;
    if (c) { $('#nextTitle').textContent = c.title; $('#nextWhen').textContent = `Now, until ${B.fmtHM(c.e)}`; const left = c.e - B.tzNow().m; $('#nextCd').textContent = `${Math.floor(left / 60) ? Math.floor(left / 60) + 'h ' : ''}${left % 60}m left`; return; }
    if (!n) { $('#nextTitle').textContent = 'Nothing scheduled'; $('#nextWhen').textContent = 'Add classes in School'; $('#nextCd').textContent = ''; return; }
    $('#nextTitle').textContent = n.title; $('#nextWhen').textContent = `${n.inDays === 0 ? 'Today' : n.inDays === 1 ? 'Tomorrow' : B.DAYS[new Date(n.date + 'T12:00:00').getDay()]} ${B.fmtHM(n.s)}`;
    const z = B.tzNow(), mins = n.inDays * 1440 + n.s - z.m; $('#nextCd').textContent = `in ${Math.floor(mins / 1440) ? Math.floor(mins / 1440) + 'd ' : ''}${Math.floor(mins % 1440 / 60)}h ${mins % 60}m`;
  }
  function renderTimeline() {
    const z = B.tzNow(), ev = B.eventsOn(z.date), W = B.marketWindows(z.date), S0 = 6 * 60, S1 = 24 * 60, pct = m => (Math.max(S0, Math.min(S1, m)) - S0) / (S1 - S0) * 100;
    $('#tlDay').textContent = B.DAYS[z.wd];
    $('#timeline').innerHTML = W.filter(w => w.e > S0).map(w => `<i class="mw" data-k="${w.kind}" style="left:${pct(w.s)}%;width:${pct(w.e) - pct(w.s)}%" title="${esc(w.what)}"></i>`).join('')
      + ev.map(e => `<div class="blk${e.optional ? ' opt' : ''}" data-k="${e.kind}" style="left:${pct(e.s)}%;width:${pct(e.e) - pct(e.s)}%" title="${esc(e.title)} ${B.fmtHM(e.s)}-${B.fmtHM(e.e)}">${esc(e.title)}</div>`).join('')
      + [6, 9, 12, 15, 18, 21].map(hh => `<span class="tick" style="left:${pct(hh * 60)}%">${hh === 12 ? '12p' : hh < 12 ? hh + 'a' : hh - 12 + 'p'}</span>`).join('') + `<i class="nowl" style="left:${pct(z.m)}%"></i>`;
  }
  function tickTimeline() { const z = B.tzNow(), n = $('#timeline .nowl'); if (n) n.style.left = ((Math.max(360, Math.min(1440, z.m)) - 360) / 1080 * 100) + '%'; }
  function taskHTML(t) { const z = B.tzNow(), late = t.due && t.due < z.date && !t.done; return `<li class="${t.done ? 'done' : ''}" data-id="${t.id}"><input type="checkbox" ${t.done ? 'checked' : ''} aria-label="Done"><span>${esc(t.text)}</span><span class="due ${late ? 'late' : ''}">${t.due ? (t.due === z.date ? 'today' : t.due === B.dateAdd(z.date, 1) ? 'tomorrow' : t.due.slice(5)) : ''}</span><button class="del" aria-label="Delete">×</button></li>`; }
  function renderTasks() {
    const T = B.M.tasks().slice().sort((a, b) => (a.done - b.done) || (a.due || '9999').localeCompare(b.due || '9999'));
    $('#tasks').innerHTML = T.length ? T.slice(0, 30).map(taskHTML).join('') : '<li class="muted small">No tasks. Add one above, or tell Atlas "add task study anatomy by Monday".</li>';
    $('#taskCount').textContent = `${T.filter(t => !t.done).length} open`;
  }
  function renderFeed() {
    const L = B.M.log().slice(-8);
    $('#feed').innerHTML = L.length ? L.map(m => `<li class="${m.who === 'you' ? 'you' : ''}">${m.who === 'you' ? '' : `<b>${esc(m.who === 'atlas' || m.who === 'coach' ? (B.M.profile().assistant || 'Coach') : m.who)}</b>`}${esc(m.text)}</li>`).join('') : `<li><b>Coach</b>${esc(B.greet())} Ask me about your day, your trades, or tell me to add something.</li>`;
    const f = $('#feed'); f.scrollTop = f.scrollHeight;
  }
  const SKILLS = [
    ['/plan-today', 'Your day with school and the best trading windows', 'plan my day', 1],
    ['/trading-review', 'How your demo trading is going, and what to fix', 'how am I doing', 1],
    ['/ready-check', 'Are you ready for real money or a funded challenge?', 'am I ready for real money', 1],
    ['/markets', 'Gold and Bitcoin right now', 'what is gold doing now', 1],
    ['/analyze-gold', 'Draw the levels and pick the best strategy', 'analyze gold', 1],
    ['/explain-r', 'What "R" and position size mean', 'what is R', 2],
    ['/study-plan', 'A week of study around your classes', 'make me a study plan for this week around my classes and quiz me', 3],
    ['/weekly-review', 'Review your week: school, trading, content', 'do a weekly review of my school, trading and content this week and tell me what to change', 3]
  ];
  function renderSkills() { $('#skillGrid').innerHTML = SKILLS.map(([n, d, say, tier]) => `<button type="button" class="skill" data-say="${esc(say)}"><b>${n}</b><span>${esc(d)}</span><span class="chip" data-tone="${tier === 1 ? 'green' : tier === 2 ? 'blue' : 'violet'}">${tier === 1 ? 'instant' : tier === 2 ? 'playbook' : 'Claude'}</span></button>`).join(''); }
  function nextRun(a) {
    if (!a.cron || a.status !== 'on') return null; const [mi, hr] = a.cron.split(' ');
    const t = new Date(); t.setSeconds(0, 0);
    for (let k = 0; k < 60 * 24 * 2; k++) { t.setMinutes(t.getMinutes() + 1); const H = a.utc ? t.getUTCHours() : +new Intl.DateTimeFormat('en-US', { timeZone: 'America/Toronto', hour: 'numeric', hourCycle: 'h23' }).format(t), M = t.getMinutes(); if (M !== +mi) continue; if (hr.startsWith('*/') ? H % +hr.slice(2) === 0 : H === +hr) return t; }
    return null;
  }
  function autoHTML(a) { const n = nextRun(a); return `<li><b>${esc(a.name)}</b><span>${esc(a.what)}</span><span class="chip" data-tone="${a.status === 'on' ? 'green' : ''}">${a.status === 'on' ? 'on' : 'paused'}</span>${n ? `<small>next ${tfmt.format(n).replace(/\./g, '')}${n.getDate() !== new Date().getDate() ? ' tomorrow' : ''}</small>` : `<small>${esc(a.when)}</small>`}</li>`; }
  function renderAutos() { $('#autos').innerHTML = B.M.automations().map(autoHTML).join(''); }
  function renderContent() { $('#contentAutos').innerHTML = B.M.automations().filter(a => a.domain === 'content').map(autoHTML).join(''); }

  /* ---------------- charts (TradingView widgets, inside the OS) ---------------- */
  let chartSym = 'OANDA:XAUUSD', chartIv = '60', tvLoad = null;
  function tvWidget(el, sym) { const id = 'tv' + B.uid(); el.id = id; new window.TradingView.widget({ container_id: id, symbol: sym, interval: chartIv, timezone: 'America/Toronto', theme: 'dark', style: '1', locale: 'en', autosize: true, hide_side_toolbar: false, allow_symbol_change: true, details: true, backgroundColor: '#0A0D14', studies: sym.includes('BTC') ? ['MASimple@tv-basicstudies'] : ['DONCH@tv-basicstudies'] }); }
  function charts() {
    const wrap = $('#tvwrap'), syms = chartSym === 'both' ? ['OANDA:XAUUSD', 'COINBASE:BTCUSD'] : [chartSym];
    wrap.className = 'tvwrap' + (syms.length > 1 ? ' two' : ''); wrap.innerHTML = syms.map(() => '<div></div>').join('');
    const go = () => $$('div', wrap).forEach((el, i) => tvWidget(el, syms[i]));
    if (window.TradingView) return go();
    tvLoad = tvLoad || new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://s3.tradingview.com/tv.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    tvLoad.then(go, () => { wrap.innerHTML = '<div class="blocked"><b>TradingView could not load.</b><span class="muted">Check the internet connection.</span></div>'; });
  }

  /* ---------------- school ---------------- */
  const CLS = { hub: 'All classes', orofacial: 'Orofacial', dentures: 'Complete Dentures', intro: 'Intro to Denturism', materials: 'Dental Materials', anatomy: 'Anatomy' };
  function renderHubs() {
    const el = $('#hubs'); if (!el) return;
    const portal = S.portal || window.OS_PORTAL || 'https://gc.blackboard.com/ultra';
    el.innerHTML = `<a class="hub portal" href="${esc(portal)}" target="_blank" rel="noopener"><i>School portal</i><b>Blackboard</b><small>Courses, grades and announcements. Opens in its own window (Blackboard doesn't allow being shown inside other pages).</small></a>`
      + (window.OS_STUDY || []).map(h => `<a class="hub" href="${esc(h.url)}" target="_blank" rel="noopener"><i>${esc(CLS[h.cls] || h.cls)}</i><b>${esc(h.title)}</b><small>${esc(h.what)}</small></a>`).join('');
  }
  function renderSchool() {
    renderHubs();
    const S0 = 7 * 60, S1 = 22 * 60, H = 420, y = m => (Math.max(S0, Math.min(S1, m)) - S0) / (S1 - S0) * H, z = B.tzNow();
    const sched = B.M.schedule(), days = [1, 2, 3, 4, 5];
    let html = '<div></div>' + days.map(d => `<div class="hdr ${d === z.wd ? 'today' : ''}">${B.DSHORT[d]}</div>`).join('');
    html += `<div class="hours">${[8, 10, 12, 14, 16, 18, 20].map(hh => `<span style="top:${y(hh * 60)}px">${hh > 12 ? hh - 12 : hh}${hh < 12 ? 'a' : 'p'}</span>`).join('')}</div>`;
    html += days.map(d => `<div class="col">${sched.filter(e => e.days.includes(d)).map(e => { const s = B.toMin(e.start), en = B.toMin(e.end); return `<div class="cls${e.optional ? ' opt' : ''}" data-k="${e.kind}" data-id="${e.id}" style="top:${y(s)}px;height:${Math.max(22, y(en) - y(s))}px" title="Click to remove">${esc(e.title)}<small>${B.fmtHM(s)}–${B.fmtHM(en)}</small></div>`; }).join('')}${d === z.wd && z.m > S0 && z.m < S1 ? `<i class="nowl" style="top:${y(z.m)}px"></i>` : ''}</div>`).join('');
    $('#week').innerHTML = html;
    const st = B.M.tasks().filter(t => t.domain === 'school'), wkEnd = B.dateAdd(z.date, (7 - z.wd) % 7), nxEnd = B.dateAdd(wkEnd, 7);
    const G = [['Missed', st.filter(t => !t.done && t.due && t.due < z.date), 'late'], ['This week', st.filter(t => !t.done && t.due && t.due >= z.date && t.due <= wkEnd), ''], ['Next week', st.filter(t => !t.done && t.due && t.due > wkEnd && t.due <= nxEnd), ''], ['Later', st.filter(t => !t.done && (!t.due || t.due > nxEnd)), ''], ['Done', st.filter(t => t.done), '']];
    $('#schoolTasks').innerHTML = st.length ? G.filter(g => g[1].length).map(([h, L, cls]) => `<li class="sgroup ${cls}"><h3>${h} · ${L.length}</h3><ul class="tasks">${L.sort((a, b) => (a.due || '9').localeCompare(b.due || '9')).map(taskHTML).join('')}</ul></li>`).join('') : '<li class="muted small">No school tasks yet. Add one on Home or say "add task anatomy notes by Monday".</li>';
    $('#portalNote').textContent = 'Georgian Blackboard opens in its own window. Your study hubs are below.';
  }
  let pomo = { left: 1500, run: false, work: true, t: null };
  function pomoTick() { const m = Math.floor(pomo.left / 60), s = pomo.left % 60; $('#pomoT').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`; }
  function pomoStep() { if (!pomo.run) return; pomo.left--; if (pomo.left <= 0) { pomo.work = !pomo.work; pomo.left = pomo.work ? 1500 : 300; $('#pomoMsg').textContent = pomo.work ? 'Break over. Back to it.' : 'Nice. 5-minute break.'; B.Voice.speak(pomo.work ? 'Break is over. Back to studying.' : 'Good work. Take five.'); } pomoTick(); }

  /* ---------------- vault (notes) ---------------- */
  let folder = 'all', noteId = null, saveT = null;
  function renderVault() {
    const N = B.M.notes(), q = ($('#noteSearch').value || '').toLowerCase();
    $('#folders').innerHTML = ['all', 'inbox', 'school', 'trading', 'ideas', 'work'].map(f => `<button type="button" data-f="${f}" aria-pressed="${f === folder}">${f}</button>`).join('');
    const list = N.filter(n => (folder === 'all' || n.folder === folder) && (!q || (n.title + ' ' + n.body).toLowerCase().includes(q)));
    $('#notes').innerHTML = list.length ? list.map(n => `<li data-id="${n.id}" class="${n.id === noteId ? 'on' : ''}"><b>${esc(n.title || 'Untitled')}</b><span>${esc(n.folder)} · ${new Date(n.t * 1000).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}</span></li>`).join('') : '<li class="muted small">No notes here yet.</li>';
    const n = N.find(x => x.id === noteId);
    $('#noteTitle').value = n ? n.title : ''; $('#noteBody').value = n ? n.body : ''; $('#noteFolder').value = n ? n.folder : 'inbox';
  }
  function saveNote() {
    const N = B.M.notes(); let n = N.find(x => x.id === noteId);
    if (!n) { if (!$('#noteTitle').value && !$('#noteBody').value) return; n = { id: B.uid(), t: Math.floor(B.now()) }; N.unshift(n); noteId = n.id; }
    n.title = $('#noteTitle').value; n.body = $('#noteBody').value; n.folder = $('#noteFolder').value; n.t = Math.floor(B.now());
    B.M.setNotes(N); $('#noteSaved').textContent = 'Saved'; renderVaultList();
  }
  function renderVaultList() { const keep = [$('#noteTitle').value, $('#noteBody').value, $('#noteFolder').value]; renderVault(); [$('#noteTitle').value, $('#noteBody').value, $('#noteFolder').value] = keep; }

  /* ---------------- create: Kling prompt builder ---------------- */
  function kling() {
    const v = id => $('#' + id).value.trim();
    const p = `${v('kSub')}, ${v('kAct')}. Camera: ${v('kCam')}, smooth and steady. Look: ${v('kLook')}. Motion first: the movement is clear from the first second and keeps building to the end. Duration ${v('kLen')} seconds, aspect ratio ${v('kAr')}. No text, no logos, no watermarks.`;
    $('#kOut').textContent = p; return p;
  }

  /* ---------------- apps ---------------- */
  const APPS = () => [
    ['Trading Desk', 'index.html#gold', 'Your desk, bots and Learn', '#F5C451', 'T'],
    ['Atlas', 'jarvis.html', 'Voice assistant', '#5EEAD4', 'A'],
    ['Claude', 'https://claude.ai/new', 'Hand off real work', '#D97757', 'C'],
    ['ChatGPT', 'https://chatgpt.com/', 'Second opinion', '#10A37F', 'G'],
    ['Blackboard', S.portal || '', S.portal ? 'Your school portal' : 'Add the link in Settings', '#60A5FA', 'B'],
    ['TradingView', 'https://www.tradingview.com/chart/', 'Your real charts + the Desk script', '#2962FF', 'TV'],
    ['Broker', S.broker || '', S.broker ? 'Your trading platform' : 'Add the link in Settings', '#34D399', '$'],
    ['Telegram', S.tele || 'https://web.telegram.org/a/', 'Trades by Scott', '#2AABEE', '✈'],
    ['Kling', 'https://app.klingai.com/global/', 'AI video', '#A78BFA', 'K'],
    ['TikTok', 'https://www.tiktok.com/@stickman_factss', '@stickman_factss', '#FE2C55', '♪'],
    ['Instagram', 'https://www.instagram.com/mindsetover_limits/', '@mindsetover_limits', '#E1306C', 'IG'],
    ['YouTube Studio', 'https://studio.youtube.com/', 'Your channel', '#FF0033', '▶'],
    ['Gmail', 'https://mail.google.com/', 'Email', '#EA4335', 'M']
  ];
  function renderApps() {
    $('#appGrid').innerHTML = APPS().map(([n, u, d, c, i]) => `<button type="button" class="app" data-open="${esc(u)}" data-name="${esc(n)}"><span class="ico" style="background:${c}">${esc(i)}</span><b>${esc(n)}</b><span>${esc(d)}</span></button>`).join('');
    renderTabs();
  }
  const appURL = name => { const a = APPS().find(x => x[0].toLowerCase() === name); return a ? a[1] : ''; };

  /* ---------------- settings ---------------- */
  function renderSettings() {
    const P = B.M.profile(); $('#sName').value = P.name; $('#sAssist').value = P.assistant || 'Atlas';
    $('#sPortal').value = S.portal; $('#sBroker').value = S.broker; $('#sTele').value = S.tele;
    const sel = $('#sVoice'), V = B.Voice.speakOK ? speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)) : [];
    sel.innerHTML = '<option value="">Automatic</option>' + V.map(v => `<option ${v.name === P.voice ? 'selected' : ''}>${esc(v.name)}</option>`).join('');
  }

  /* ---------------- wiring ---------------- */
  document.addEventListener('click', e => {
    const say = e.target.closest('[data-say]'), url = e.target.closest('[data-url]'), go = e.target.closest('[data-go]'), app = e.target.closest('[data-app]'), cl = e.target.closest('[data-claude]'), op = e.target.closest('[data-open]'), pop = e.target.closest('[data-pop]');
    if (e.target.closest('.answer .x')) { $('#answer').hidden = true; return; }
    if (say) return ask(say.dataset.say);
    if (url) return openInside(url.dataset.url);
    if (go) { location.hash = go.dataset.go; return; }
    if (app && app.dataset.app === 'portal') { window.open(S.portal || window.OS_PORTAL, '_blank', 'noopener'); return; }
    if (app) { const u = app.dataset.app === 'portal' ? S.portal : appURL(app.dataset.app); if (!u) { location.hash = 'settings'; $('#sMsg').textContent = 'Add the link first, then press Save.'; return; } return openInside(u, app.textContent.replace('Open ', '').trim()); }
    if (cl) return openInside(B.claudeURL(cl.dataset.claude), 'Claude');
    if (op) { const u = op.dataset.open; if (!u) { location.hash = 'settings'; $('#sMsg').textContent = `Add your ${op.dataset.name} link, then press Save.`; return; } return openInside(u, op.dataset.name); }
    if (pop) { window.open(pop.dataset.pop, 'os_' + B.uid(), 'width=1200,height=820'); return; }
    const tab = e.target.closest('[data-tab]'); if (tab) { const x = e.target.closest('[data-close]'); if (x) { const i = tabs.findIndex(t => t.id === x.dataset.close); tabs.splice(i, 1); if (curTab === x.dataset.close) curTab = tabs[0] && tabs[0].id; } else curTab = tab.dataset.tab; renderTabs(); }
  });
  $('#cmd').addEventListener('submit', e => { e.preventDefault(); const v = $('#cmdIn').value.trim(); if (v) { $('#cmdIn').value = ''; ask(v); } });
  document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#cmdIn').focus(); } if (e.key === 'Escape') $('#answer').hidden = true; });
  let rec = null;
  $('#cmdMic').addEventListener('click', () => {
    if (rec) { try { rec.stop(); } catch (e) {} return; }
    if (!B.Voice.supported) { $('#cmdIn').focus(); $('#cmdIn').placeholder = IN_APP ? 'Press fn twice to dictate, then Enter' : 'Voice not supported in this browser. Type instead.'; return; }
    rec = B.Voice.listen(t => ask(t), (st, x) => { $('#cmdMic').classList.toggle('live', st === 'listening' || st === 'hearing'); if (st === 'hearing') $('#cmdIn').value = x || ''; if (st === 'idle' || st === 'error') { rec = null; if (st === 'idle') $('#cmdIn').value = ''; } });
  });
  $('#taskForm').addEventListener('submit', e => { e.preventDefault(); const v = $('#taskIn').value.trim(); if (!v) return; $('#taskIn').value = ''; const r = B.addFromText(/^(add|todo|task)/i.test(v) ? v : 'task ' + v); if (r) renderHome(); });
  $('#feedForm').addEventListener('submit', e => { e.preventDefault(); const v = $('#feedIn').value.trim(); if (v) { $('#feedIn').value = ''; ask(v); } });
  const onTaskClick = e => { const li = e.target.closest('li[data-id]'); if (!li) return; const T = B.M.tasks(), t = T.find(x => x.id === li.dataset.id); if (!t) return; if (e.target.matches('input[type=checkbox]')) t.done = e.target.checked; else if (e.target.closest('.del')) T.splice(T.indexOf(t), 1); else return; B.M.setTasks(T); renderHome(); renderSchool(); };
  $('#tasks').addEventListener('click', onTaskClick); $('#schoolTasks').addEventListener('click', onTaskClick);
  // school
  $('#cfDays').innerHTML = [1, 2, 3, 4, 5, 6, 0].map(d => `<label><input type="checkbox" value="${d}" ${d >= 1 && d <= 5 ? '' : ''}>${B.DSHORT[d]}</label>`).join('');
  $('#addClassBtn').addEventListener('click', () => { $('#classForm').hidden = !$('#classForm').hidden; });
  $('#cfCancel').addEventListener('click', () => { $('#classForm').hidden = true; });
  $('#classForm').addEventListener('submit', e => { e.preventDefault(); const days = $$('#cfDays input:checked').map(i => +i.value); if (!days.length) return; const S2 = B.M.schedule(); S2.push({ id: B.uid(), title: $('#cfTitle').value.trim(), kind: $('#cfKind').value, days, start: $('#cfStart').value, end: $('#cfEnd').value }); B.M.setSchedule(S2); $('#classForm').hidden = true; $('#classForm').reset(); renderSchool(); renderHome(); });
  $('#week').addEventListener('click', e => { const c = e.target.closest('.cls'); if (!c) return; if (!c.dataset.armed) { c.dataset.armed = '1'; c.style.outline = '2px solid var(--down)'; setTimeout(() => { if (c.isConnected) { delete c.dataset.armed; c.style.outline = ''; } }, 2500); return; } const S2 = B.M.schedule().filter(x => x.id !== c.dataset.id); B.M.setSchedule(S2); renderSchool(); renderHome(); });
  $('#pomoGo').addEventListener('click', () => { pomo.run = !pomo.run; $('#pomoGo').textContent = pomo.run ? 'Pause' : 'Start'; if (pomo.run && !pomo.t) pomo.t = setInterval(pomoStep, 1000); $('#pomoMsg').textContent = pomo.run ? (pomo.work ? 'Focus. Phone face down.' : 'Break time.') : 'Paused.'; });
  $('#pomoReset').addEventListener('click', () => { pomo.run = false; pomo.work = true; pomo.left = 1500; $('#pomoGo').textContent = 'Start'; pomoTick(); });
  // vault
  $('#newNote').addEventListener('click', () => { noteId = null; renderVault(); $('#noteTitle').focus(); });
  $('#notes').addEventListener('click', e => { const li = e.target.closest('li[data-id]'); if (li) { noteId = li.dataset.id; renderVault(); } });
  $('#folders').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) { folder = b.dataset.f; renderVault(); } });
  $('#noteSearch').addEventListener('input', renderVault);
  ['noteTitle', 'noteBody', 'noteFolder'].forEach(id => $('#' + id).addEventListener('input', () => { $('#noteSaved').textContent = 'Saving…'; clearTimeout(saveT); saveT = setTimeout(saveNote, 500); }));
  $('#noteDel').addEventListener('click', () => { const N = B.M.notes().filter(n => n.id !== noteId); B.M.setNotes(N); noteId = null; renderVault(); });
  $('#noteClaude').addEventListener('click', () => { const N = B.M.notes().slice(0, 30); openInside(B.claudeURL(`Here are my notes. Organise them into clear folders and a short summary of each, and pull out any tasks with due dates:\n\n${N.map(n => `# ${n.title} (${n.folder})\n${n.body}`).join('\n\n').slice(0, 6000)}`), 'Claude'); });
  // create
  ['kSub', 'kAct', 'kCam', 'kLook', 'kLen', 'kAr'].forEach(id => $('#' + id).addEventListener('input', kling));
  $('#kCopy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(kling()); $('#kCopy').textContent = 'Copied'; setTimeout(() => { $('#kCopy').textContent = 'Copy prompt'; }, 1500); } catch (e) {} });
  $('#kClaude').addEventListener('click', () => openInside(B.claudeURL(`Use the Kling AI skill to make this video (show me the settings and credits before you generate): ${kling()}`), 'Claude'));
  // charts
  $('#chartSym').addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (!b) return; chartSym = b.dataset.s; $$('#chartSym button').forEach(x => x.setAttribute('aria-pressed', x === b)); charts(); });
  $('#chartIv').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; chartIv = b.dataset.i; $$('#chartIv button').forEach(x => x.setAttribute('aria-pressed', x === b)); charts(); });
  $('#chartAnalyze').addEventListener('click', () => openInside(`index.html?analyze=${chartSym.includes('BTC') ? 'btc' : 'gold'}#${chartSym.includes('BTC') ? 'btc' : 'gold'}`));
  // settings
  $('#sSave').addEventListener('click', () => { B.M.setProfile({ name: $('#sName').value.trim() || 'Yazdan', assistant: $('#sAssist').value.trim() || 'Atlas', voice: $('#sVoice').value }); S.portal = $('#sPortal').value.trim(); S.broker = $('#sBroker').value.trim(); S.tele = $('#sTele').value.trim(); B.ls.set('os_links', S); $('#sMsg').textContent = 'Saved.'; renderHome(); });
  $('#sExport').addEventListener('click', () => { const blob = new Blob([B.M.exportAll()], { type: 'application/json' }), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `my-os-backup-${B.tzNow().date}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); });
  $('#sImport').addEventListener('change', async e => { const f = e.target.files[0]; if (!f) return; try { B.M.importAll(await f.text()); $('#sMsg').textContent = 'Backup restored.'; renderHome(); } catch (err) { $('#sMsg').textContent = 'That file is not a backup from this app.'; } });
  $('#sTest').addEventListener('click', () => { B.M.setProfile({ voice: $('#sVoice').value }); B.Voice.speak(`Hi ${B.M.profile().name}, this is ${B.M.profile().assistant || 'Atlas'}.`); });
  // live prices for the market card
  async function prices() { try { const [sp, b] = await Promise.all([Data.goldSpot(), Data.ticker('btc')]); if (sp) $('#hGold').textContent = '$' + sp.price.toFixed(2); if (b) $('#hBtc').textContent = '$' + Math.round(b.price).toLocaleString('en-US'); } catch (e) {} }
  if (IN_APP && window.osApp.onOpenTab) window.osApp.onOpenTab((url, title) => openInside(url, title));
  window.addEventListener('hashchange', route);
  window.addEventListener('storage', () => { if (!$('#v-home').hidden) renderHome(); });
  Orb.create($('#homeOrb'), { count: 6500 }).then(o => { homeOrb = o; });
  route(); clock(); setInterval(clock, 15000); prices(); setInterval(prices, 30000); kling(); pomoTick();
})();

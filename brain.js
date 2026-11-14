/* Brain: the shared memory and "thinking" for the Trading Desk coach, the OS dashboard and the voice assistant.
   Everything lives in this browser (localStorage), shared by every page in this folder.
   Request routing works like the agentic-OS idea:
     Tier 1  instant, no AI: your schedule, tasks, trading numbers, opening things, adding things
     Tier 2  quick answers from the built-in playbook: lessons, rules, definitions
     Tier 3  real work: handed to Claude with all the context it needs (opens claude.ai with the request filled in) */
(function (root) {
  'use strict';
  const TZN = 'America/Toronto';
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  const now = () => Date.now() / 1000;
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const uid = () => Math.random().toString(36).slice(2, 9);
  const usd = n => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const sgn = n => (n >= 0 ? '+' : '-') + '$' + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const DSHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const fmtHM = m => { const h = Math.floor(m / 60) % 24, mm = m % 60; return `${h % 12 || 12}${mm ? ':' + String(mm).padStart(2, '0') : ''} ${h < 12 ? 'AM' : 'PM'}`; };
  const toMin = s => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };
  // Toronto clock
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZN, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' });
  function tzNow(t) {
    const p = {}; for (const x of parts.formatToParts(new Date((t || now()) * 1000))) p[x.type] = x.value;
    return { y: +p.year, mo: +p.month, d: +p.day, m: (+p.hour % 24) * 60 + (+p.minute), wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday), date: `${p.year}-${p.month}-${p.day}` };
  }
  const dateAdd = (date, n) => { const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

  /* ---------------- memory ---------------- */
  const DEF_PROFILE = { name: 'Yazdan', assistant: 'Atlas', voice: '', wake: 7 * 60, sleep: 23 * 60 };
  const M = {
    profile() { return Object.assign({}, DEF_PROFILE, ls.get('os_profile', {})); },
    setProfile(p) { ls.set('os_profile', Object.assign(M.profile(), p)); },
    schedule() { return ls.get('os_schedule', null) || (root.OS_SEED && root.OS_SEED.schedule) || []; },
    setSchedule(s) { ls.set('os_schedule', s); },
    // Saved tasks plus any new ones from os-config.js. Seed tasks you delete are remembered so they don't come back.
    tasks() {
      const seed = (root.OS_SEED && root.OS_SEED.tasks) || [], saved = ls.get('os_tasks', null);
      if (!saved) return seed.map(t => Object.assign({}, t));
      const gone = ls.get('os_tasks_gone', []), have = new Set(saved.map(t => t.id));
      return saved.concat(seed.filter(t => !have.has(t.id) && !gone.includes(t.id)).map(t => Object.assign({}, t)));
    },
    setTasks(t) {
      const ids = new Set(t.map(x => x.id)), gone = ls.get('os_tasks_gone', []);
      ((root.OS_SEED && root.OS_SEED.tasks) || []).forEach(s => { if (!ids.has(s.id) && !gone.includes(s.id)) gone.push(s.id); });
      ls.set('os_tasks_gone', gone); ls.set('os_tasks', t);
    },
    goals() { return ls.get('os_goals', null) || [
      { id: 'g1', domain: 'trading', text: 'Take 10 demo trades that follow the plan', target: 10, auto: 'planTrades' },
      { id: 'g2', domain: 'trading', text: 'Finish 3 lessons in Learn', target: 3, auto: 'lessons' },
      { id: 'g3', domain: 'school', text: 'Finish every homework task on time', target: 5, progress: 0 }
    ]; },
    setGoals(g) { ls.set('os_goals', g); },
    notes() { return ls.get('os_notes', []); },
    setNotes(n) { ls.set('os_notes', n); },
    log() { return ls.get('os_log', []); },
    addLog(who, text, extra) { const L = M.log(); L.push(Object.assign({ t: Math.floor(now()), who, text }, extra || {})); ls.set('os_log', L.slice(-300)); },
    clearLog() { ls.set('os_log', []); },
    learn() { return Object.assign({ lessons: {}, quiz: {}, drills: { n: 0, right: 0 } }, ls.get('os_learn', {})); },
    setLearn(l) { ls.set('os_learn', l); },
    snapshot() { return ls.get('desk_snapshot', null); },
    automations() { return root.OS_AUTOMATIONS || []; },
    brief() { return root.OS_BRIEF || null; },
    exportAll() { const out = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^(os_|v2_|desk_|coach_)/.test(k)) out[k] = localStorage.getItem(k); } return JSON.stringify({ app: 'yazdan-os', v: 1, at: new Date().toISOString(), data: out }); },
    importAll(json) { const j = JSON.parse(json); if (!j || !j.data) throw new Error('Not a backup file'); for (const [k, v] of Object.entries(j.data)) localStorage.setItem(k, v); }
  };

  /* ---------------- schedule ---------------- */
  function eventsOn(date) {
    const wd = new Date(date + 'T12:00:00').getDay();
    return M.schedule().filter(e => (e.days || []).includes(wd) && (!e.from || date >= e.from) && (!e.to || date <= e.to))
      .map(e => Object.assign({}, e, { s: toMin(e.start), e: toMin(e.end) })).sort((a, b) => a.s - b.s);
  }
  function nowEvent() { const z = tzNow(); return eventsOn(z.date).find(e => z.m >= e.s && z.m < e.e) || null; }
  function nextEvent() {
    const z = tzNow();
    for (let k = 0; k < 8; k++) { const date = dateAdd(z.date, k); const ev = eventsOn(date).find(e => k > 0 || e.s > z.m); if (ev) return Object.assign({ date, inDays: k }, ev); }
    return null;
  }
  function tasksDue(days) {
    const z = tzNow(), lim = dateAdd(z.date, days == null ? 1 : days);
    return M.tasks().filter(t => !t.done).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999')).filter(t => !t.due || t.due <= lim);
  }
  const KIND_WORD = { school: 'School', work: 'Work', gym: 'Gym', other: 'Busy' };

  /* ---------------- markets: when things happen (Toronto time) ---------------- */
  function goldOpen(z) { if (z.wd === 6 || (z.wd === 5 && z.m >= 1020) || (z.wd === 0 && z.m < 1080)) return false; return !(z.m >= 1020 && z.m < 1080); }
  function marketWindows(date) {
    const wd = new Date(date + 'T12:00:00').getDay(), W = [];
    if (wd === 6 || (wd === 0)) W.push({ s: 0, e: wd === 0 ? 1080 : 1440, what: 'Gold is closed for the weekend', kind: 'closed' });
    if (wd >= 1 && wd <= 5) {
      W.push({ s: 120, e: 600, what: 'London Breakout window (gold, 2 to 10 AM)', kind: 'london' });
      W.push({ s: 480, e: 720, what: 'Gold\'s busiest hours (London + New York)', kind: 'busy' });
      W.push({ s: 510, e: 525, what: '8:30 AM US data: wait 15 min', kind: 'news' });
      W.push({ s: 1020, e: wd === 5 ? 1440 : 1080, what: wd === 5 ? 'Gold closed for the weekend from 5 PM' : 'Gold daily break (5 to 6 PM)', kind: 'closed' });
    }
    if (wd !== 5 && wd !== 6) W.push({ s: 1200, e: 1440, what: 'Asian range builds (8 PM to 2 AM)', kind: 'asia' });
    return W;
  }
  // 4-hour candles close at 3 / 7 / 11 (AM and PM) Toronto time in winter, 4 / 8 / 12 in summer (they follow UTC)
  function next4hClose() { const t = now(), n = Math.ceil((t + 1) / 14400) * 14400; return n; }

  /* ---------------- trading memory (read from the trading desk's saved data) ---------------- */
  function trading() {
    const book = ls.get('v2_book', { balance: 10000, pos: [], hist: [] }) || { balance: 10000, pos: [], hist: [] };
    const set = Object.assign({ acct: 10000, risk: 1 }, ls.get('v2_settings', {}));
    const auto = ls.get('v2_auto', { on: false, log: [] }) || { on: false, log: [] };
    const bots = ls.get('v2_bots', {}) || {};
    const calls = ls.get('v2_calls', []) || [];
    const hist = (book.hist || []).slice().sort((a, b) => a.closedAt - b.closedAt);
    const mine = hist.filter(p => !p.auto), ap = hist.filter(p => p.auto);
    const botTot = Object.values(bots).reduce((s, B) => { let bal = B.seed || 10000; for (const x of Object.values(B.trades || {}).sort((a, b) => a.t - b.t)) if (x.R != null) bal += x.R * bal * 0.01; return s + bal - (B.seed || 10000); }, 0);
    return { book, set, auto, bots, calls, hist, mine, ap, botTot, snap: M.snapshot() };
  }
  function statsOf(list) {
    const n = list.length; if (!n) return { n: 0, win: 0, pnl: 0, avgR: 0, best: null, worst: null };
    const w = list.filter(p => p.pnl > 0), Rs = list.filter(p => p.r != null).map(p => p.r);
    return { n, win: Math.round(w.length / n * 100), pnl: list.reduce((s, p) => s + p.pnl, 0), avgR: Rs.length ? Rs.reduce((a, b) => a + b, 0) / Rs.length : 0,
      best: list.reduce((a, b) => (b.pnl > (a ? a.pnl : -Infinity) ? b : a), null), worst: list.reduce((a, b) => (b.pnl < (a ? a.pnl : Infinity) ? b : a), null) };
  }
  // mistake detector for trades placed by hand
  function mistakesOf(p, prev) {
    const out = [];
    if (p.riskPct != null && p.riskPct > 2.05) out.push({ k: 'size', t: `Risked ${p.riskPct.toFixed(1)}% of the account. Keep it at 1% (2% max). Prop firms fail people for exactly this.` });
    if (p.ctx && p.ctx.atr && Math.abs(p.entry - p.sl0) < 0.6 * p.ctx.atr) out.push({ k: 'tight', t: `The stop was only ${(Math.abs(p.entry - p.sl0) / p.ctx.atr).toFixed(1)} × ATR away. Normal wiggles hit stops that close. 2 to 3 × ATR gives a trade room to breathe.` });
    if (p.ctx && p.mk === 'gold' && p.ctx.up != null && (p.side > 0) !== p.ctx.up) out.push({ k: 'trend', t: `It went against the trend (gold was ${p.ctx.up ? 'above' : 'below'} its 50-day average). Trading against the trend is the most common way beginners lose.` });
    if (p.ctx && p.mk === 'btc' && p.side < 0) out.push({ k: 'trend', t: 'It was a Bitcoin short. The only Bitcoin strategy that held up over 5 years buys uptrends only.' });
    if (p.ctx && p.ctx.news) out.push({ k: 'news', t: 'It was opened during a news release. Prices jump around then. Wait 15 minutes after.' });
    if (prev && prev.pnl < 0 && p.openedAt - prev.closedAt < 30 * 60) out.push({ k: 'revenge', t: `It was opened ${Math.max(1, Math.round((p.openedAt - prev.closedAt) / 60))} min after a loss. That's a revenge trade. After a loss, take a 30-minute break.` });
    if (p.ctx && /^Wait|Don't/.test(p.ctx.word || '') && !p.auto) out.push({ k: 'nosignal', t: `The desk said "${p.ctx.word}" when you entered. Trading without a setup is guessing.` });
    return out;
  }
  function review() {
    const T = trading(), L = T.mine, out = { all: statsOf(T.hist), mine: statsOf(L), auto: statsOf(T.ap), issues: {}, perTrade: [], byHour: {}, byMk: {} };
    L.forEach((p, i) => {
      const ms = mistakesOf(p, L[i - 1]); out.perTrade.push({ p, ms }); ms.forEach(m => { out.issues[m.k] = (out.issues[m.k] || 0) + 1; });
      const h = p.ctx ? Math.floor(p.ctx.m / 60) : null; if (h != null) { out.byHour[h] = out.byHour[h] || { n: 0, pnl: 0 }; out.byHour[h].n++; out.byHour[h].pnl += p.pnl; }
      out.byMk[p.mk] = out.byMk[p.mk] || { n: 0, pnl: 0 }; out.byMk[p.mk].n++; out.byMk[p.mk].pnl += p.pnl;
    });
    // overtrading: more than 5 trades by hand on one day
    const perDay = {}; L.forEach(p => { const d = tzNow(p.openedAt).date; perDay[d] = (perDay[d] || 0) + 1; });
    out.busyDays = Object.entries(perDay).filter(([, n]) => n > 5).length; if (out.busyDays) out.issues.over = out.busyDays;
    out.clean = out.perTrade.filter(x => !x.ms.length).length;
    return out;
  }

  /* ---------------- prop-firm style challenge + readiness ---------------- */
  const RULESETS = {
    twoStep: { name: '2-step challenge, phase 1', target: 10, daily: 5, max: 10, minDays: 4, bestDay: null },
    twoStep2: { name: '2-step challenge, phase 2', target: 5, daily: 5, max: 10, minDays: 4, bestDay: null },
    oneStep: { name: '1-step challenge', target: 10, daily: 3, max: 6, minDays: 2, bestDay: 50 },
    safe: { name: 'My safe rules', target: 6, daily: 2, max: 5, minDays: 10, bestDay: 40 }
  };
  function challenge() {
    const C = Object.assign({ rules: 'twoStep', start: null, size: 10000 }, ls.get('os_challenge', {}));
    const R = RULESETS[C.rules] || RULESETS.twoStep, T = trading();
    const list = T.hist.filter(p => C.start == null || p.closedAt >= C.start);
    const byDay = {}; list.forEach(p => { const d = tzNow(p.closedAt).date; byDay[d] = (byDay[d] || 0) + p.pnl; });
    let eq = 0, peak = 0, maxDD = 0; const curve = [0];
    list.forEach(p => { eq += p.pnl; peak = Math.max(peak, eq); maxDD = Math.min(maxDD, eq - 0); curve.push(eq); });
    const base = C.size, profitPct = eq / base * 100, worstDay = Math.min(0, ...Object.values(byDay)), worstDayPct = worstDay / base * 100, lowPct = Math.min(0, ...curve) / base * 100;
    const days = Object.keys(byDay).length, bestDayV = Math.max(0, ...Object.values(byDay)), bestShare = eq > 0 ? bestDayV / eq * 100 : 0;
    const broke = [];
    if (-worstDayPct >= R.daily) broke.push(`a day lost ${(-worstDayPct).toFixed(1)}% (limit ${R.daily}%)`);
    if (-lowPct >= R.max) broke.push(`the account fell ${(-lowPct).toFixed(1)}% below the start (limit ${R.max}%)`);
    const passed = !broke.length && profitPct >= R.target && days >= R.minDays && (!R.bestDay || bestShare <= R.bestDay);
    return { C, R, list, profitPct, worstDayPct, lowPct, days, bestShare, broke, passed, status: broke.length ? 'Failed' : passed ? 'Passed' : list.length ? 'In progress' : 'Not started', curve };
  }
  function readiness() {
    const T = trading(), rv = review(), L = T.mine, learn = M.learn(), ch = challenge();
    const n = L.length, st = rv.mine, planPct = n ? rv.clean / n * 100 : 0;
    const lessons = Object.values(learn.lessons).filter(Boolean).length, quizAvg = (() => { const q = Object.values(learn.quiz); return q.length ? q.reduce((a, b) => a + b, 0) / q.length : 0; })();
    const items = [
      { k: 'learn', t: 'Know the rules', d: `${lessons} of 8 lessons done, quiz average ${Math.round(quizAvg)}%`, score: Math.min(1, lessons / 8) * 0.6 + Math.min(1, quizAvg / 80) * 0.4, w: 15 },
      { k: 'sample', t: 'Enough practice trades', d: `${n} trades by hand. You need at least 30 to know anything.`, score: Math.min(1, n / 30), w: 20 },
      { k: 'plan', t: 'Follow the plan', d: n ? `${Math.round(planPct)}% of your trades had no mistakes (aim for 80%+)` : 'No trades yet', score: n ? Math.min(1, planPct / 80) : 0, w: 25 },
      { k: 'edge', t: 'Make money after costs', d: n ? `Average ${st.avgR >= 0 ? '+' : ''}${st.avgR.toFixed(2)}R per trade, total ${sgn(st.pnl)}` : 'No trades yet', score: n < 10 ? 0 : st.avgR > 0.15 ? 1 : st.avgR > 0 ? 0.6 : 0, w: 20 },
      { k: 'risk', t: 'Never break the loss limits', d: n ? `Worst day ${ch.worstDayPct.toFixed(1)}%, lowest point ${ch.lowPct.toFixed(1)}%` : 'No trades yet', score: !n ? 0 : (-ch.worstDayPct < 2.5 && -ch.lowPct < 5 ? 1 : -ch.worstDayPct < 4 ? 0.5 : 0), w: 20 }
    ];
    const score = Math.round(items.reduce((s, x) => s + x.score * x.w, 0));
    const verdict = score >= 85 ? 'Ready to try a small challenge' : score >= 60 ? 'Getting close' : score >= 30 ? 'Building the habits' : 'Just starting';
    return { score, verdict, items, n, ch };
  }

  /* ---------------- built-in playbook (tier 2 answers) ---------------- */
  const KB = [
    [/quiet ?breakout|\bqb\b/, 'Quiet Breakout (gold, 1-hour chart): only trade after a calm stretch, when the average candle size (ATR) is at or below normal. Buy when a 1-hour candle closes above the 20-hour high while gold is above its 50-day average, or sell when it closes below the 20-hour low under the average. Stop 3 × ATR away, then it trails. No fixed target, so winners can run. It made about +77R over 5 years after costs.'],
    [/trend rider|gold trend|donchian|turtle/, 'Trend Rider (4-hour chart, buys only): when price is above its 200-candle average and a 4-hour candle closes above the recent high (7 days on Bitcoin, about 3 days on gold), buy. Stop 3 × ATR below. Sell when a 4-hour candle closes below the recent low. Only about a third of trades win, but the winners are big. It held up over 5 years on Bitcoin (+49R) and gold (+23R).'],
    [/london|asian range/, 'London Breakout: mark the Asian range from 8 PM to 2 AM. From 2 AM to 10 AM, the first 15-minute close outside the range is the trade, only in the direction of the 50-day average. Stop at the other side of the range, target 2.5R, close by 2 PM. It\'s the most popular gold strategy on YouTube. It only made money with the trend filter, and it had a 33R drop along the way.'],
    [/\bicc\b|indication|correction|continuation/, 'ICC = Indication, Correction, Continuation. A 4-hour candle breaks a swing (indication), price pulls back at least 30% (correction), then a 15-minute candle breaks the pullback (continuation). In the 5-year test it lost money on gold and Bitcoin, even with a trend filter, so the desk keeps it as practice only.'],
    [/\bR\b|r multiple|what is r|risk unit/i, '"R" is the amount you risk on a trade. If your stop would lose $100, then 1R = $100. A +2R trade made $200 and a -1R trade lost $100. Thinking in R lets you compare trades of different sizes.'],
    [/atr|average true range|candle size/, 'ATR (average true range) is the average size of a candle, including gaps. If gold\'s 1-hour ATR is $12, a stop $4 away gets hit by normal noise. The desk puts stops 3 × ATR away.'],
    [/position size|lot size|how (much|big)|sizing/, 'Size every trade so the stop costs 1% of your account. Size = (account × 1%) ÷ stop distance. Example: $10,000 account, stop $15 away on gold: $100 ÷ $15 = 6.7 ounces = 0.07 lots. The trade ticket\'s "Size for 1% risk" button does this for you.'],
    [/stop loss|stop-loss|\bsl\b/, 'A stop loss is the price where you admit the idea was wrong and get out. Put it where the idea is wrong, like past the swing low or 3 × ATR away, never at a random round number. Never move it further away.'],
    [/support|resistance/, 'Support is a price where buyers stepped in before. Resistance is a price where sellers stepped in. Price often reacts there again. The more times a level was touched, the stronger it is. When a level breaks cleanly, it often flips: old resistance becomes support.'],
    [/sweep|liquidity|stop hunt/, 'A liquidity sweep is when price pokes past an obvious level (like yesterday\'s high), triggers the stops sitting there, then snaps back. It\'s popular on TikTok, but in the 5-year gold test, trading every sweep lost money. Use sweeps as context, not as a signal on their own.'],
    [/spread|commission|fees|costs/, 'Every trade costs the spread plus any commission. On gold it\'s small, about 0.015% each way. But on tiny stops (scalping), costs eat a big chunk of every trade. That\'s why the 1-5 minute strategies all lost money in testing.'],
    [/prop|funded|challenge|ftmo/, 'Prop firm challenges usually ask for about +10% profit without losing more than 5% in a day or 10% in total. Most people fail in the first week by risking too much. The desk\'s Challenge tracker runs those same rules on your demo trades. Pass it on demo, more than once, before paying for a real one.'],
    [/journal|why journal/, 'Your journal is your trading memory. For every trade write: the setup, why you took it, where the stop was and why, and how you felt. After 30 trades, patterns show up, like your worst hour or your favourite mistake.'],
    [/trend|uptrend|downtrend/, 'An uptrend makes higher highs and higher lows. A downtrend makes lower highs and lower lows. The simplest filter: only buy above the 50-day average and only sell below it. Every strategy on the desk that held up uses a trend filter.'],
    [/risk management|how much risk|risk per trade/, 'Risk 1% per trade. Ten losses in a row (it happens) costs about 10%. At 5% per trade, the same streak costs 40% and ends a funded account. Small risk is what lets you survive long enough for the edge to show.'],
    [/candle|candlestick/, 'Each candle shows one time period: open, high, low, close. Green closed higher than it opened, red closed lower. The desk only acts when a candle closes, because a candle can change completely before then.']
  ];
  function kb(text) { const t = text.toLowerCase(); const hit = KB.find(([re]) => re.test(t)); return hit ? hit[1] : null; }

  /* ---------------- Claude hand-off (tier 3) ---------------- */
  function context() {
    const p = M.profile(), z = tzNow(), T = trading(), ev = eventsOn(z.date), tasks = tasksDue(7), r = readiness();
    const snap = T.snap;
    return [`About me: ${p.name}, Toronto, student who is learning to trade gold and Bitcoin on a demo account.`,
      ev.length ? `My schedule today: ${ev.map(e => `${e.title} ${fmtHM(e.s)}-${fmtHM(e.e)}`).join(', ')}.` : 'No classes or shifts saved for today.',
      tasks.length ? `Open tasks: ${tasks.slice(0, 6).map(t => t.text + (t.due ? ` (due ${t.due})` : '')).join('; ')}.` : '',
      `Demo account: balance ${usd(T.book.balance)}, ${T.mine.length} trades by hand, ${T.ap.length} by autopilot. Readiness score ${r.score}/100 (${r.verdict}).`,
      snap ? `Trading desk right now: gold ${snap.gold ? snap.gold.word : '?'}, Bitcoin ${snap.btc ? snap.btc.word : '?'}.` : ''].filter(Boolean).join(' ');
  }
  function claudeURL(request) { return 'https://claude.ai/new?q=' + encodeURIComponent(`${request}\n\n(Context from my OS: ${context()})`); }

  /* ---------------- talking like a person ---------------- */
  function greet() {
    const p = M.profile(), z = tzNow(), h = z.m / 60;
    return h < 5 ? pick([`Up late, ${p.name}?`, `Night owl mode, ${p.name}.`]) : h < 12 ? pick([`Morning, ${p.name}.`, `Good morning, ${p.name}.`, `Hey ${p.name}, morning.`]) : h < 17 ? pick([`Hey ${p.name}.`, `Afternoon, ${p.name}.`, `What's up, ${p.name}.`]) : pick([`Evening, ${p.name}.`, `Hey ${p.name}, good evening.`]);
  }
  function dayLine(date) {
    const ev = eventsOn(date), z = tzNow();
    if (!ev.length) return M.schedule().length ? 'Nothing on your schedule today.' : 'Your schedule is empty. Tell me your classes and shifts (like "add school Mon-Fri 8:45 to 3:15") and I\'ll plan around them.';
    return ev.map(e => `${e.title} ${fmtHM(e.s)} to ${fmtHM(e.e)}${date === z.date && z.m >= e.s && z.m < e.e ? ' (now)' : ''}`).join(', ') + '.';
  }
  function planDay(offset) {
    const z = tzNow(), date = dateAdd(z.date, offset || 0), ev = eventsOn(date), W = marketWindows(date), T = trading(), lines = [];
    const busy = (s, e) => ev.some(x => s < x.e && e > x.s);
    const wd = new Date(date + 'T12:00:00').getDay();
    lines.push(`${offset ? DAYS[wd] : 'Today'}: ${dayLine(date)}`);
    const tasks = tasksDue(2), late = tasks.filter(t => t.due && t.due < z.date), soon = tasks.filter(t => !t.due || t.due >= z.date);
    if (soon.length) lines.push(`Due soon: ${soon.slice(0, 4).map(t => t.text + (t.due ? ` (${t.due === z.date ? 'today' : t.due === dateAdd(z.date, 1) ? 'tomorrow' : 'in 2 days'})` : '')).join('; ')}.`);
    if (late.length) lines.push(`Still missed: ${late.slice(0, 3).map(t => t.text.replace(/^Missed: /, '')).join('; ')}. Ask those instructors if you can still hand them in.`);
    const goldBusy = W.find(w => w.kind === 'busy');
    const fridayLate = wd === 5 && (offset || z.m >= 1020);
    if (fridayLate && !offset) lines.push('Gold closed for the weekend at 5 PM and reopens Sunday 6 PM. Bitcoin still trades. Good time for a Learn lesson, a "Buy, Sell or Wait?" drill and a look back at this week\'s trades.');
    else if (wd === 6 || wd === 0) lines.push('Gold is closed for the weekend (it reopens Sunday 6 PM). Good day for a Learn lesson and a "Buy, Sell or Wait?" drill. Bitcoin still trades, but Trend Rider only acts on 4-hour closes.');
    else if (goldBusy && !offset && z.m >= goldBusy.e) lines.push('Gold\'s busiest hours (8 AM to noon) are done for today. Afternoon moves are usually smaller, so it\'s a good time to review and practise rather than force trades.');
    else if (goldBusy && busy(goldBusy.s, goldBusy.e)) lines.push('Gold\'s busiest hours (8 AM to noon) are during your schedule. Don\'t trade from your phone in class. Turn Autopilot on so the desk takes the proven setups, and check the results after.');
    else if (goldBusy) lines.push('You\'re free during gold\'s busiest hours (8 AM to noon). That\'s your best live practice window. Open the Gold page, press Analyze, and only take setups the desk marks as ready.');
    const free = []; let cur = Math.max(M.profile().wake, offset ? 0 : z.m);
    for (const e of ev.concat([{ s: M.profile().sleep, e: 1440 }])) { if (e.s - cur >= 45) free.push([cur, e.s]); cur = Math.max(cur, e.e); }
    if (free.length) lines.push(`Free time: ${free.slice(0, 3).map(([a, b]) => `${fmtHM(a)} to ${fmtHM(b)}`).join(', ')}. ${tasks.length ? 'Homework first, then trading practice.' : 'Use 30 minutes of it for trading practice: one lesson plus a review of your last trades.'}`);
    if (T.auto && T.auto.on) lines.push('Autopilot is on, so the desk will take Quiet Breakout and Trend setups by itself.');
    return lines;
  }
  function tradingLine() {
    const T = trading(), st = statsOf(T.mine), snap = T.snap, out = [];
    if (snap && now() - snap.t < 6 * 3600) { if (snap.gold) out.push(`Gold ${snap.gold.price ? '$' + Number(snap.gold.price).toFixed(2) : ''}: ${snap.gold.word}. ${snap.gold.why || ''}`); if (snap.btc) out.push(`Bitcoin ${snap.btc.price ? '$' + Math.round(snap.btc.price).toLocaleString('en-US') : ''}: ${snap.btc.word}.`); }
    out.push(`Your demo account: ${usd(T.book.balance)}${(T.book.pos || []).length ? `, ${(T.book.pos || []).length} trade${T.book.pos.length > 1 ? 's' : ''} open` : ''}.`);
    if (st.n) out.push(`By hand: ${st.n} trades, ${st.win}% wins, ${sgn(st.pnl)}.`);
    if (T.ap.length) out.push(`Autopilot: ${T.ap.length} trades, ${sgn(statsOf(T.ap).pnl)}.`);
    return out.join(' ');
  }
  function coachReview() {
    const rv = review(), T = trading(), out = [], n = rv.mine.n;
    if (!n) return `You haven't placed a trade by hand yet. That's fine. Start with one lesson in Learn, then press Analyze on the Gold page and wait for a setup the desk marks as ready. ${T.ap.length ? `Autopilot has taken ${T.ap.length} trade${T.ap.length > 1 ? 's' : ''} for you so far (${sgn(statsOf(T.ap).pnl)}).` : ''}`;
    out.push(`Real talk on your ${n} trade${n > 1 ? 's' : ''} by hand: ${rv.mine.win}% won, ${sgn(rv.mine.pnl)} total, average ${rv.mine.avgR >= 0 ? '+' : ''}${rv.mine.avgR.toFixed(2)}R.`);
    const iss = Object.entries(rv.issues).sort((a, b) => b[1] - a[1]);
    const NAME = { size: 'risking too much', tight: 'stops too tight', trend: 'trading against the trend', news: 'trading into news', revenge: 'revenge trades after a loss', nosignal: 'trading without a setup', over: 'overtrading (more than 5 trades a day)' };
    if (iss.length) out.push(`Your #1 habit to fix: ${NAME[iss[0][0]]} (${iss[0][1]} time${iss[0][1] > 1 ? 's' : ''}).${iss[1] ? ` Then: ${NAME[iss[1][0]]}.` : ''}`);
    else out.push('No rule-breaks so far. That\'s honestly the hardest part, so keep it up.');
    out.push(`${rv.clean} of ${n} trades followed the plan.`);
    if (T.ap.length) { const a = statsOf(T.ap); out.push(`For comparison, autopilot is ${sgn(a.pnl)} over ${a.n} trades.`); }
    const hrs = Object.entries(rv.byHour).filter(([, v]) => v.n >= 3).sort((a, b) => a[1].pnl - b[1].pnl);
    if (hrs.length) out.push(`Your worst hour so far is around ${fmtHM(+hrs[0][0] * 60)} (${sgn(hrs[0][1].pnl)}).`);
    return out.join(' ');
  }
  function tradeBreakdown(p) {
    if (!p) return 'No closed trades yet.';
    const T = trading(), L = T.mine, i = L.findIndex(x => x.id === p.id), ms = p.auto ? [] : mistakesOf(p, L[i - 1]);
    const mk = p.mk === 'gold' ? 'gold' : 'Bitcoin', res = p.pnl >= 0 ? `won ${sgn(p.pnl)}` : `lost ${usd(Math.abs(p.pnl))}`;
    const head = p.auto ? `Autopilot's ${mk} ${p.side > 0 ? 'buy' : 'sell'} (${p.auto.name}) ${res}${p.r != null ? ` (${p.r >= 0 ? '+' : ''}${p.r.toFixed(2)}R)` : ''}.` : `Your ${mk} ${p.side > 0 ? 'buy' : 'sell'} ${res}${p.r != null ? ` (${p.r >= 0 ? '+' : ''}${p.r.toFixed(2)}R)` : ''}.`;
    if (p.auto) return `${head} ${p.pnl >= 0 ? 'The rules did their job.' : 'Losses like this are normal. Even the best strategy loses about half the time. What matters is that the loss stayed at 1R.'}`;
    if (!ms.length) return `${head} ${p.pnl >= 0 ? pick(['Clean trade. You followed the plan and got paid.', 'That\'s how it\'s done: plan, stop, patience.']) : pick(['Good loss, honestly. You followed the plan and the stop did its job. That\'s a win for your habits.', 'You did everything right and still lost. That happens. Keep the same process.'])}`;
    return `${head} ${p.pnl >= 0 ? 'You made money, but there\'s a habit to fix, because it\'ll cost you later:' : 'Here\'s what to fix:'} ${ms.map(m => m.t).join(' ')}`;
  }
  function readinessLine() {
    const r = readiness();
    const weak = r.items.slice().sort((a, b) => a.score - b.score)[0];
    return `Readiness: ${r.score}/100, "${r.verdict}". ${r.n < 30 ? `You've got ${r.n} trades by hand. Prop firms test you over weeks, so you need a few weeks of steady demo trading, not a few days.` : ''} Biggest gap: ${weak.t.toLowerCase()} (${weak.d}). ${r.score < 85 ? 'Don\'t pay for a challenge or use real money yet. When this hits 85+ and the Challenge tracker shows a pass, try the smallest account first.' : 'You\'re close. Pass the Challenge tracker on demo twice in a row first, then start with the smallest account.'}`;
  }

  /* ---------------- adding things by talking ---------------- */
  const DAYMAP = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  function parseDays(s) {
    s = s.toLowerCase(); if (/weekdays|mon(day)?\s*(-|to|–)\s*fri/.test(s)) return [1, 2, 3, 4, 5]; if (/weekends?/.test(s)) return [0, 6]; if (/every ?day|daily/.test(s)) return [0, 1, 2, 3, 4, 5, 6];
    const r = s.match(/\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\s*(?:-|to|–)\s*(sun|mon|tue|wed|thu|fri|sat)/); if (r) { const a = DAYMAP[r[1]], b = DAYMAP[r[2]], o = []; for (let d = a; ; d = (d + 1) % 7) { o.push(d); if (d === b) break; } return o; }
    const out = []; for (const [k, v] of Object.entries(DAYMAP)) if (new RegExp('\\b' + k).test(s)) out.push(v); return out.length ? out : [1, 2, 3, 4, 5];
  }
  function parseTime(s, pmHint) {
    const m = String(s).trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/); if (!m) return null;
    let h = +m[1]; const mm = +(m[2] || 0), ap = m[3];
    if (ap && ap[0] === 'p' && h < 12) h += 12; if (ap && ap[0] === 'a' && h === 12) h = 0;
    if (!ap && pmHint && h < 7) h += 12;
    return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  function addFromText(text) {
    const t = text.trim();
    // "add school mon-fri 8:45 to 3:15" / "add work sat 10am-4pm"
    let m = t.match(/^(?:add|i have|put)\s+(school|class(?:es)?|work|shift|job|gym|practice|[a-z ]{2,24}?)\s+(?:on\s+)?(.+?)\s+(?:from\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm|a|p)?)\s*(?:-|to|until|–)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm|a|p)?)\s*$/i);
    if (m) {
      const kind = /school|class/i.test(m[1]) ? 'school' : /work|shift|job/i.test(m[1]) ? 'work' : /gym|practice/i.test(m[1]) ? 'gym' : 'other';
      const start = parseTime(m[3]), end = parseTime(m[4], true); if (!start || !end) return null;
      const ev = { id: uid(), title: kind === 'other' ? m[1].trim().replace(/^\w/, c => c.toUpperCase()) : KIND_WORD[kind], kind, days: parseDays(m[2]), start, end };
      const S = M.schedule(); S.push(ev); M.setSchedule(S);
      return { kind: 'schedule', text: `Added: ${ev.title}, ${ev.days.map(d => DSHORT[d]).join(' ')}, ${fmtHM(toMin(start))} to ${fmtHM(toMin(end))}. I'll plan around it.` };
    }
    // "remind me / todo / task: study for chem test by friday"
    m = t.match(/^(?:add (?:a )?(?:task|todo|to-do)|todo|task|remind me to|i need to|homework:?)\s*:?\s*(.+)$/i);
    if (m) {
      let body = m[1], due = null; const z = tzNow();
      const dm = body.match(/\s+(?:by|on|due|for)\s+(today|tonight|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{4}-\d{2}-\d{2})\s*$/i);
      if (dm) { body = body.slice(0, dm.index); const w = dm[1].toLowerCase(); if (w === 'today' || w === 'tonight') due = z.date; else if (w === 'tomorrow') due = dateAdd(z.date, 1); else if (/\d{4}/.test(w)) due = w; else { const target = DAYS.map(d => d.toLowerCase()).indexOf(w); let k = (target - z.wd + 7) % 7; if (k === 0) k = 7; due = dateAdd(z.date, k); } }
      const domain = /homework|test|exam|essay|study|assignment|class|quiz|school|project/i.test(body) ? 'school' : /shift|work|boss/i.test(body) ? 'work' : /trade|chart|gold|btc|bitcoin|journal|lesson/i.test(body) ? 'trading' : /video|tiktok|post|youtube|reel/i.test(body) ? 'content' : 'life';
      const T = M.tasks(); T.push({ id: uid(), text: body.trim(), due, domain, done: false, created: Math.floor(now()) }); M.setTasks(T);
      return { kind: 'task', text: `Got it, added "${body.trim()}"${due ? ` for ${due === z.date ? 'today' : due === dateAdd(z.date, 1) ? 'tomorrow' : due}` : ''}.` };
    }
    m = t.match(/^(?:note|save this|remember)\s*:?\s*(.+)$/i);
    if (m) { const N = M.notes(); N.unshift({ id: uid(), folder: 'inbox', title: m[1].slice(0, 60), body: m[1], t: Math.floor(now()) }); M.setNotes(N); return { kind: 'note', text: 'Saved to your inbox notes.' }; }
    return null;
  }

  /* ---------------- the router ---------------- */
  // returns { tier, text, actions: [{label, href|act}] }
  function route(input, ctx) {
    ctx = ctx || {}; const t = String(input || '').trim(), q = t.toLowerCase(), P = M.profile();
    if (!t) return { tier: 1, text: 'I\'m listening.' };
    const added = addFromText(t); if (added) return { tier: 1, text: added.text, did: added.kind };
    if (/^(hi|hey|yo|hello|sup|what'?s up|good (morning|afternoon|evening))\b/.test(q)) return { tier: 1, text: `${greet()} ${pick(['What are we working on?', 'Want your plan for today?', 'How can I help?'])}`, actions: [{ label: 'Plan my day', say: 'plan my day' }, { label: 'How am I trading?', say: 'how am I doing' }] };
    if (/plan (my|the|today)|what('?s| is) (my )?(plan|schedule)|today'?s plan|what should i do( today)?|my day/.test(q)) return { tier: 1, text: planDay(/tomorrow/.test(q) ? 1 : 0).join('\n') };
    if (/tomorrow/.test(q) && /schedule|plan|class|work/.test(q)) return { tier: 1, text: planDay(1).join('\n') };
    if (/next (class|shift|thing|event)|when('?s| is) (my )?(next|school|work|class)|am i (free|busy)/.test(q)) { const n = nextEvent(), c = nowEvent(); return { tier: 1, text: (c ? `You're in ${c.title} until ${fmtHM(c.e)}. ` : '') + (n ? `Next: ${n.title} ${n.inDays === 0 ? 'today' : n.inDays === 1 ? 'tomorrow' : DAYS[new Date(n.date + 'T12:00:00').getDay()]} at ${fmtHM(n.s)}.` : 'Nothing coming up on your schedule.') }; }
    if (/(what'?s|whats|what is|what do i have|anything|any|show|list).*(due|homework|assignments?|tasks?|to ?dos?)|my (tasks|homework|assignments|to ?do)|\bdue\b.*(this|next) week|\bmissed\b/.test(q)) {
      const z = tzNow(), T = tasksDue(7), late = T.filter(x => x.due && x.due < z.date), soon = T.filter(x => !x.due || x.due >= z.date);
      const day = d => d === z.date ? 'today' : d === dateAdd(z.date, 1) ? 'tomorrow' : new Date(d + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
      const f = x => x.text.replace(/^Missed: /, '') + (x.due ? ` (${day(x.due)})` : '');
      const text = (late.length ? `You missed ${late.length}: ${late.map(f).join('; ')}. Email those instructors and ask if you can still hand them in. ` : '') + (soon.length ? `Coming up: ${soon.slice(0, 6).map(f).join('; ')}.` : 'Nothing else due this week.');
      return { tier: 1, text: T.length ? text : 'Nothing due this week. Nice.' };
    }
    if (/how am i (doing|trading)|my (stats|performance|trading)|review (me|my)|how('?s| is) my trading|report card/.test(q)) return { tier: 1, text: `${tradingLine()} ${coachReview()}` };
    if (/last trade|why did i (lose|win)|what went wrong/.test(q)) { const L = trading().hist; return { tier: 1, text: tradeBreakdown(L[L.length - 1]) }; }
    if (/ready|real money|funded|prop( firm)?|challenge|go live/.test(q) && !/what is|explain/.test(q)) return { tier: 1, text: readinessLine(), actions: [{ label: 'Open the Challenge tracker', href: 'index.html#learn' }] };
    if (/(gold|xau|bitcoin|btc|market|price).*(now|doing|today|looking)|(how|what)('?s| is| about) (gold|bitcoin|btc|the market)|^(gold|bitcoin|btc)\??$|should i (buy|sell|trade)|can i trade|any (setups?|trades?|signals?)/.test(q)) return { tier: 1, text: tradingLine() + ' Open the desk and press Analyze for the full plan with levels.', actions: [{ label: 'Open Gold', href: 'index.html#gold' }, { label: 'Open Bitcoin', href: 'index.html#btc' }] };
    if (/autopilot|bots?\b/.test(q) && !/what is|explain/.test(q)) { const T = trading(); return { tier: 1, text: `Autopilot is ${T.auto.on ? 'on' : 'off'}. ${T.ap.length ? `It has taken ${T.ap.length} trades in your account (${sgn(statsOf(T.ap).pnl)}).` : ''} The 6 practice bots together are ${sgn(T.botTot)}.`, actions: [{ label: 'Open Auto-trader', href: 'index.html#bots' }] }; }
    if (/^(open|go to|show)\b/.test(q)) {
      const map = [[/gold/, 'index.html#gold'], [/bitcoin|btc/, 'index.html#btc'], [/bots?|auto/, 'index.html#bots'], [/learn|lesson|quiz|challenge/, 'index.html#learn'], [/plan|record/, 'index.html#plan'], [/desk|trading/, 'index.html#home'], [/os|dashboard/, 'os.html'], [/atlas|jarvis|voice|assistant/, 'jarvis.html'], [/tradingview/, 'https://www.tradingview.com/chart/'], [/claude/, 'https://claude.ai/new']];
      const hit = map.find(([re]) => re.test(q)); if (hit) return { tier: 1, text: 'Opening it.', open: hit[1] };
    }
    if (/analy[sz]e/.test(q)) { const mk = /bitcoin|btc/.test(q) ? 'btc' : 'gold'; return { tier: 1, text: `Reading the ${mk === 'btc' ? 'Bitcoin' : 'gold'} chart.`, analyze: mk, open: `index.html#${mk}` }; }
    if (/scott|telegram|calls?\b/.test(q)) { const C = trading().calls.filter(c => c.status === 'closed'), R = C.reduce((s, c) => s + c.R, 0); return { tier: 1, text: C.length ? `You've tracked ${C.length} of Scott's calls: ${R >= 0 ? '+' : ''}${R.toFixed(1)}R total. Paste new ones on the Auto-trader page to keep score.` : 'No Telegram calls tracked yet. Paste one on the Auto-trader page and I\'ll keep score against the bots.' }; }
    if (/schedule|classes|shifts?/.test(q)) return { tier: 1, text: M.schedule().length ? `Your week: ${M.schedule().map(e => `${e.title} ${e.days.map(d => DSHORT[d]).join('/')} ${fmtHM(toMin(e.start))}-${fmtHM(toMin(e.end))}`).join('; ')}.` : 'No schedule yet. Say something like "add school Mon-Fri 8:45 to 3:15" or "add work Sat 10am to 4pm".' };
    if (/time is it|what time/.test(q)) { const z = tzNow(); return { tier: 1, text: `It's ${fmtHM(z.m)} in Toronto.` }; }
    // tier 2: playbook
    const k = kb(q); if (k && (/what|how|why|explain|teach|tell me|mean|\?/.test(q) || q.split(' ').length <= 4)) return { tier: 2, text: k };
    // tier 3: real work for Claude
    return { tier: 3, text: pick(['That one needs real thinking, so I\'m handing it to Claude with your context.', 'That\'s a job for Claude. I\'ll pass it over with everything it needs.', 'Sending that to Claude, with your schedule and trading context attached.']), claude: claudeURL(t) };
  }

  /* ---------------- voice ---------------- */
  const Voice = {
    supported: !!(root.SpeechRecognition || root.webkitSpeechRecognition) && !(root.osApp && root.osApp.electron) && !/[?&]app=1/.test(location.search),
    speakOK: 'speechSynthesis' in root,
    pickVoice() {
      if (!Voice.speakOK) return null; const V = speechSynthesis.getVoices(), want = M.profile().voice;
      const mine = V.find(v => v.name === want); if (mine) return mine;
      const E = V.filter(v => /^en([-_]|$)/i.test(v.lang)), id = v => v.name + ' ' + v.voiceURI;
      const score = v => (/premium|neural|natural/i.test(id(v)) ? 40 : /enhanced/i.test(id(v)) ? 30 : 0) + (/^(Ava|Zoe|Evan|Nathan|Jamie|Samantha|Allison|Daniel|Google US English|Google UK English Male)/i.test(v.name) ? 10 : 0) + (/en[-_](US|CA)/i.test(v.lang) ? 3 : 0) - (/Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Wobble|Whisper|Zarvox|Trinoids|Organ|Jester|Superstar|Good News|Junior|Ralph|Fred|Kathy/i.test(v.name) ? 100 : 0);
      return E.sort((a, b) => score(b) - score(a))[0] || null;
    },
    speak(text, onBoundary, onEnd) {
      if (!Voice.speakOK || !text) { onEnd && onEnd(); return; }
      speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(String(text).replace(/\n/g, '. ').replace(/\$/g, '').slice(0, 900));
      const v = Voice.pickVoice(); if (v) u.voice = v; u.rate = 1; u.pitch = 1;
      u.onboundary = onBoundary || null; u.onend = () => onEnd && onEnd(); u.onerror = () => onEnd && onEnd();
      speechSynthesis.speak(u);
    },
    stop() { if (Voice.speakOK) speechSynthesis.cancel(); },
    listen(onText, onState) {
      const R = root.SpeechRecognition || root.webkitSpeechRecognition; if (!R) { onState && onState('unsupported'); return null; }
      const r = new R(); r.lang = 'en-US'; r.interimResults = true; r.continuous = false; let final = '';
      r.onstart = () => onState && onState('listening');
      r.onresult = e => { let interim = ''; for (let i = e.resultIndex; i < e.results.length; i++) { const x = e.results[i]; if (x.isFinal) final += x[0].transcript; else interim += x[0].transcript; } onState && onState('hearing', (final + interim).trim()); };
      r.onerror = e => onState && onState('error', e.error);
      r.onend = () => { onState && onState('idle'); if (final.trim()) onText(final.trim()); };
      try { r.start(); } catch (e) { onState && onState('error', e.message); }
      return r;
    }
  };
  if (Voice.speakOK) { try { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => {}; } catch (e) {} }

  root.Brain = { M, ls, now, tzNow, dateAdd, fmtHM, toMin, DAYS, DSHORT, KIND_WORD, eventsOn, nowEvent, nextEvent, tasksDue, marketWindows, goldOpen, next4hClose,
    trading, statsOf, review, mistakesOf, challenge, readiness, RULESETS, kb, KB, claudeURL, context, greet, planDay, tradingLine, coachReview, tradeBreakdown, readinessLine, addFromText, route, Voice, usd, sgn, uid, pick };
})(window);

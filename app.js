/* Trading Desk v2: page logic. Strategy maths lives in engine.js (the same file the 5-year test ran). */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const now = () => Date.now() / 1000;
  const TZN = 'America/Toronto';
  const RES = window.RESULTS || {};
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };

  /* ---------------- formatting ---------------- */
  const fmtN = (n, d) => n == null || !isFinite(n) ? '-' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const money = (n, mk) => n == null ? '-' : '$' + fmtN(n, mk === 'btc' ? 0 : 2);
  const usd = n => (n < 0 ? '-$' : '$') + fmtN(Math.abs(n), 0);
  const fR = r => r == null ? 'open' : (r > 0 ? '+' : '') + r.toFixed(2) + 'R';
  const dtWhen = new Intl.DateTimeFormat('en-CA', { timeZone: TZN, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const dtShort = new Intl.DateTimeFormat('en-CA', { timeZone: TZN, weekday: 'short', hour: 'numeric', minute: '2-digit' });
  const dtClock = new Intl.DateTimeFormat('en-CA', { timeZone: TZN, weekday: 'short', hour: 'numeric', minute: '2-digit', second: '2-digit' });
  const dtTime = new Intl.DateTimeFormat('en-CA', { timeZone: TZN, hour: 'numeric', minute: '2-digit' });
  const when = t => dtWhen.format(new Date(t * 1000)).replace(/\./g, '');
  const whenS = t => dtShort.format(new Date(t * 1000)).replace(/\./g, '');
  const hm = t => dtTime.format(new Date(t * 1000)).replace(/\./g, '');
  const ago = s => s < 90 ? 'just now' : s < 5400 ? Math.round(s / 60) + ' min ago' : s < 172800 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' days ago';

  /* ---------------- settings ---------------- */
  const SET = Object.assign({ acct: 10000, risk: 1, alerts: false, sound: true, theme: 'dark' }, ls.get('v2_settings', {}));
  if (SET.theme !== 'light') SET.theme = 'dark';
  const saveSet = () => ls.set('v2_settings', SET);
  const riskUSD = () => SET.acct * SET.risk / 100;

  /* ---------------- markets & strategies ---------------- */
  const MK = {
    gold: {
      name: 'Gold', sym: 'XAUUSD', tv: 'OANDA:XAUUSD', gold: true, cost: 0.00015,
      strats: [
        { id: 'quiet', name: 'Quiet Breakout', tf: 3600, main: true, res: 'goldQuiet', tone: 'green', badge: 'Held up 5 years',
          rules: ['1-hour chart. Trade with the daily 50-day trend.', 'Only after a calm stretch, when ATR is at or below normal.', 'Enter on a close past the 20-hour high or low. 3 ATR trailing stop, no fixed target.'],
          note: 'All 40 setting combinations tested made money. Most of the profit came in trending years, like 2025. Flat years were about break-even.',
          run: c => Engine.quietBreakout(c.h1, { gold: true, cost: 0.00015, dailySrc: c.d }) },
        { id: 'trend', name: 'Gold Trend', tf: 14400, res: 'goldTrend', tone: 'green', badge: 'Held up 5 years',
          rules: ['4-hour chart. Buys only, while gold is above its 200-candle average.', 'Buy when a 4-hour candle closes above the highest high of the last 20 candles (about 3 days).', 'Stop 3 ATR below. Exit on a 4-hour close below the 10-candle low, or before the weekend close.'],
          note: 'The classic "Turtle" channel breakout, buys only. All 16 setting combinations tested made money (+12R to +28R). Be careful: most of it came in 2025, when gold went up a lot. In a falling market it would sit out or lose a little.',
          run: c => Engine.trendRider(c.h4, { n: 20, x: 10, trendN: 200, gold: true, cost: 0.00015, asset: 'gold', name: 'Gold Trend' }) },
        { id: 'london', name: 'London Breakout', tf: 900, res: 'goldLondon', tone: 'yellow', badge: 'Weak edge',
          rules: ['Mark the Asian range: 8 PM to 2 AM (Toronto time).', 'From 2 AM to 10 AM, trade the first 15-min close outside the range, only in the direction of the 50-day average.', 'Stop at the other side of the range. Target 2.5R. Close by 2 PM. One trade a day.'],
          note: 'The most popular gold strategy on YouTube. On its own it lost money (-38R). With our 50-day trend filter it made +23R, but it had a -33R drop along the way and lost 20R in 2023. Practise it, but trust the Quiet Breakout more.',
          run: c => Engine.londonBreakout(c.m15, { cost: 0.00015, dailySrc: c.d }) },
        { id: 'icc', name: 'ICC', tf: 900, res: 'goldIcc', tone: 'yellow', badge: 'Practice only',
          rules: ['Indication: a 4-hour close breaks a swing high or low.', 'Correction: a pullback of at least 30%. Continuation: a 15-min close past the pullback.', 'Only with the daily 50-day trend. Target 2R. Weekdays 8 AM to 4 PM.'],
          note: 'This is the ICC you asked to keep, now with a trend filter added. Over 5 years it still lost money (it was -50R before the filter). Use it to practise spotting the pattern, not to place trades.',
          run: c => Engine.icc(c.m15, { gold: true, cost: 0.00015, dailySrc: c.d }) }
      ]
    },
    btc: {
      name: 'Bitcoin', sym: 'BTCUSD', tv: 'COINBASE:BTCUSD', gold: false, cost: 0.001,
      strats: [
        { id: 'trend', name: 'Trend Rider', tf: 14400, main: true, res: 'btcTrend', tone: 'green', badge: 'Held up 5 years',
          rules: ['4-hour chart. Buys only, and only while Bitcoin is above its 200-candle average (about 33 days).', 'Buy when a 4-hour candle closes above the highest high of the last 40 candles (about 7 days).', 'Stop 3 ATR below the entry. Exit when a 4-hour candle closes below the lowest low of the last 20 candles. No fixed target.'],
          note: 'This replaces ICC on Bitcoin. It catches the big Bitcoin runs and cuts losers fast. Only 36% of trades win, but the winners average about 3.4R. It made +49R after 0.1% fees and +45R at 0.2%. Most of the profit came in 2023 and 2024. 2022 (a falling year) lost about 4R, and 2025 was flat. It goes weeks without a trade.',
          run: c => Engine.trendRider(c.h4, { cost: 0.001 }) },
        { id: 'bb', name: 'Bollinger Breakout', tf: 3600, res: 'btcBB', resLow: 'btcBBlow', tone: 'yellow', badge: 'Practice only',
          rules: ['1-hour chart. Close outside the Bollinger band (20, 2).', 'Only above the 200-hour and 9-day averages for buys, below both for sells.', 'Stop past the 10-candle low or high. Target 2R.'],
          note: 'Faster trades, for practice. It made +52.8R with low fees (0.02%, limit orders), but lost 9R at normal 0.1% fees, and small changes to the settings flipped the result. It is not proven.',
          run: c => Engine.bbBreakout(c.h1, { cost: 0.001, dailySrc: c.d }) }
      ]
    }
  };

  const S = {};
  for (const mk of Object.keys(MK)) S[mk] = {
    s15: new Data.Series(mk, 900, 45), s1h: new Data.Series(mk, 3600, 130), sD: new Data.Series(mk, 86400, 290),
    tick: null, prevPrice: null, out: {}, ready: false, err: null, first: true, botFirst: true, tf: ls.get('v2_tf3_' + mk, mk === 'btc' ? 14400 : 3600), view: 'desk', chart: null, ui: null
  };
  let OFF = ls.get('v2_off', null), SPOT = null, lastOK = 0;
  const off = mk => mk === 'gold' ? (OFF || 0) : 0;
  const seen = ls.get('v2_seen', {});

  /* ---------------- gold sessions / news (Toronto time = New York time) ---------------- */
  const NEWS = [[495, 525, '8:30 AM US data'], [595, 615, '10 AM US data'], [825, 855, '2 PM Fed (on Fed days)']];
  const newsAt = m => NEWS.find(([a, b]) => m >= a && m < b);
  function goldOpenInfo(t) {
    const z = Engine.tz(t);
    if (!Engine.goldClosed(t)) return { open: true, z };
    const weekend = z.wd === 5 || (z.wd === 4 && z.m >= 1020) || (z.wd === 6 && z.m < 1080);
    return { open: false, z, reopen: weekend ? 'Sunday 6 PM' : '6 PM' };
  }

  /* ---------------- compute ---------------- */
  function compute(mk) {
    const st = S[mk], c = { h1: st.s1h.closed(), m15: st.s15.closed(), d: st.sD.closed() };
    if (c.h1.length < 260 || c.d.length < 60) return;
    c.h4 = h4Of(c.h1);
    for (const s of MK[mk].strats) {
      if (s.tf === 900 && c.m15.length < 400) continue;
      if (s.tf === 14400 && c.h4.length < 260) continue;
      const r = s.run(c), first = (s.tf === 900 ? c.m15 : c.h1)[0].t;
      r.trades.forEach(t => { t.name = s.name; t.sid = s.id; t.market = mk; t.tf = s.tf; t.main = !!s.main; t.practice = s.tone !== 'green'; });
      r.shown = r.trades.filter(t => t.t >= first + (s.tf === 900 ? 12 : s.tf === 14400 ? 45 : 25) * 86400);
      st.out[s.id] = r;
    }
    st.ready = true;
    checkAlerts(mk);
    syncBots(mk);
    autopilot(mk);
  }
  // complete 4-hour candles built from closed 1-hour candles (UTC 0, 4, 8... like Binance and TradingView)
  function h4Of(h1) {
    const B = Engine.resample(h1, 14400); if (!B.length || !h1.length) return B;
    const lastEnd = h1[h1.length - 1].t + 3600; if (B[B.length - 1].t + 14400 > lastEnd) B.pop();
    return B;
  }
  function tradesOf(mk) { return Object.values(S[mk].out).flatMap(r => r.shown || []); }

  /* ---------------- alerts ---------------- */
  let audioCtx = null;
  function beep() {
    if (!SET.sound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = audioCtx.currentTime;
      [0, .18].forEach((d, k) => { const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.frequency.value = k ? 988 : 784; g.gain.setValueAtTime(.0001, t0 + d); g.gain.exponentialRampToValueAtTime(.2, t0 + d + .02); g.gain.exponentialRampToValueAtTime(.0001, t0 + d + .25); o.connect(g).connect(audioCtx.destination); o.start(t0 + d); o.stop(t0 + d + .3); });
    } catch (e) {}
  }
  let toastTimer;
  function toast(title, body) {
    const el = $('#toast'); el.innerHTML = `<b></b><span></span>`; el.firstChild.textContent = title; el.lastChild.textContent = body; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 12000);
    el.onclick = () => { el.hidden = true; };
  }
  function alertFor(t) {
    const o = off(t.market), side = t.d === 1 ? 'BUY' : 'SELL', mkName = MK[t.market].name;
    const title = `${side} setup: ${mkName}, ${t.name}${t.practice ? ' (practice)' : ''}`;
    const body = `Entry ${money(t.e + o, t.market)}, stop ${money(t.stop + o, t.market)}${t.tgt != null ? ', target ' + money(t.tgt + o, t.market) : ', trailing stop'}. Signal at the ${hm(t.t)} close.`;
    toast(title, body); beep();
    if (SET.alerts && 'Notification' in window && Notification.permission === 'granted') { try { new Notification(title, { body, tag: t.market + t.sid + t.t }); } catch (e) {} }
  }
  function checkAlerts(mk) {
    const st = S[mk], t0 = now(); let changed = false;
    for (const t of tradesOf(mk)) {
      const key = `${mk}|${t.sid}|${t.t}|${t.d}`;
      if (!(key in seen)) { seen[key] = Math.round(t0); changed = true; if (!st.first && t0 - t.t < t.tf * 2 + 300) alertFor(t); }
    }
    st.first = false;
    if (changed) { const ks = Object.keys(seen); if (ks.length > 600) ks.sort((a, b) => seen[a] - seen[b]).slice(0, ks.length - 600).forEach(k => delete seen[k]); ls.set('v2_seen', seen); }
  }

  /* ---------------- offset (PAXG -> XAUUSD) ---------------- */
  function updateOffset() {
    const g = S.gold, t = now();
    if (!SPOT || !g.tick || Engine.goldClosed(t) || t - SPOT.t > 900 || t - g.tick.t > 300) return;
    const o = SPOT.price - g.tick.price; if (Math.abs(o) > 80) return;
    OFF = OFF == null ? o : OFF * 0.8 + o * 0.2; ls.set('v2_off', OFF);
  }
  function displayPrice(mk) {
    const st = S[mk], t = now();
    if (mk === 'gold' && SPOT && !Engine.goldClosed(t) && t - SPOT.t < 300) return SPOT.price;
    if (st.tick) return st.tick.price + off(mk);
    const c = st.s1h.bars; return c.length ? c[c.length - 1].c + off(mk) : null;
  }

  /* ---------------- status for the big card ---------------- */
  function sizeText(mk, e, stop) {
    const dist = Math.abs(e - stop); if (!(dist > 0)) return '-';
    const u = riskUSD() / dist;
    return mk === 'gold' ? `${(u / 100).toFixed(2)} lots (${u.toFixed(1)} oz)` : `${u.toFixed(4)} BTC`;
  }
  function status(mk) {
    const st = S[mk], cfg = MK[mk], t = now(), o = off(mk), p = displayPrice(mk);
    if (st.err) return { word: "Can't load data", tone: 'yellow', why: 'Check your internet, then reload the page. The desk tried Coinbase and Binance.', checks: [] };
    if (!st.ready) return { word: 'Loading', tone: null, why: 'Getting the last 130 days of candles so the strategy can run.', checks: [] };
    const main = cfg.strats.find(s => s.main), r = st.out[main.id], live = r.trades.find(x => x.R == null);
    const gi = goldOpenInfo(t), z = gi.z, news = newsAt(z.m), checks = [];
    const practice = false;
    let res = { word: 'Wait', tone: null, checks, ticket: null };
    const sx = r.state || {};

    if (mk === 'gold') {
      const trendTxt = sx.up ? 'Gold is above its 50-day average, so buys only' : 'Gold is below its 50-day average, so sells only';
      checks.push({ s: 'ok', t: trendTxt, d: `50-day average ${money(sx.d50 + o, mk)}, last close ${money(sx.close + o, mk)}` });
      checks.push({ s: sx.calm ? 'ok' : 'no', t: sx.calm ? 'The market is calm' : 'The market is too jumpy right now', d: `Candle size (ATR) ${money(sx.atr, mk)} vs usual ${money(sx.a100, mk)}. Must be at or below usual.` });
      const lvl = sx.up ? sx.hi : sx.lo, dist = p != null ? Math.abs(p - (lvl + o)) : null;
      checks.push({ s: 'wait', t: `${sx.up ? 'BUY if a 1-hour candle closes above' : 'SELL if a 1-hour candle closes below'} ${money(lvl + o, mk)}`, d: dist != null ? `That's ${money(dist, mk)} from the price now.${sx.calm ? '' : ' It only counts once the market is calm.'}` : '' });
      checks.push(gi.open ? (news ? { s: 'wait', t: `News time: ${news[2]}`, d: 'Prices can jump. Don\'t enter until 15 minutes after.' } : { s: 'ok', t: 'Gold is open', d: z.m >= 960 && z.m < 1020 ? 'Daily break at 5 PM. No new trades in the last hour.' : 'Closes daily 5 to 6 PM, and Fri 5 PM to Sun 6 PM' })
        : { s: 'no', t: 'Gold is closed', d: `Reopens ${gi.reopen}` });
      const nextClose = Math.ceil((t + 1) / 3600) * 3600;
      checks.push({ s: 'ok', t: `Next 1-hour candle closes at ${hm(nextClose)}`, d: `In ${Math.max(1, Math.round((nextClose - t) / 60))} min. Signals only count at the close.` });
      const stopD = 3 * (sx.atr || 0);
      checks.push({ s: 'ok', t: `Risk ${SET.risk}% = ${usd(riskUSD())} per trade`, d: `Stop is about ${money(stopD, mk)} away (3 × ATR), so about ${sizeText(mk, 0, stopD)}` });
    } else {
      checks.push({ s: sx.up ? 'ok' : 'no', t: sx.up ? 'Bitcoin is in an uptrend, so buys are allowed' : 'Bitcoin is below its 200-candle average, so Trend Rider stays out', d: `4-hour 200-candle average ${money(sx.trend, mk)}, last 4-hour close ${money(sx.close, mk)}. Trend Rider only buys.` });
      const dist = p != null && sx.hi != null ? sx.hi - p : null;
      checks.push({ s: 'wait', t: `BUY if a 4-hour candle closes above ${money(sx.hi, mk)}`, d: (dist != null ? `That's the 7-day high, ${money(Math.abs(dist), mk)} ${dist >= 0 ? 'above' : 'below'} the price now.` : 'That is the 7-day high.') + (sx.up ? '' : ' It only counts once Bitcoin is back above the average.') });
      checks.push({ s: 'ok', t: `Exit line: a 4-hour close below ${money(sx.lo, mk)}`, d: 'The lowest low of the last 20 candles (about 3 days). It rises as price rises, so winners can run.' });
      const next4 = Math.ceil((t + 1) / 14400) * 14400;
      checks.push({ s: news ? 'wait' : 'ok', t: news ? `News time: ${news[2]}` : `Next 4-hour candle closes at ${hm(next4)}`, d: news ? 'Prices can jump around US data.' : `In ${Math.max(1, Math.round((next4 - t) / 60))} min. Bitcoin trades 24/7. Signals only count at the close.` });
      const stopD = 3 * (sx.atr || 0);
      checks.push({ s: 'ok', t: `Risk ${SET.risk}% = ${usd(riskUSD())} per trade`, d: `Stop is about ${money(stopD, mk)} away (3 × 4-hour ATR), so about ${sizeText(mk, 0, stopD)}` });
    }

    if (live) {
      const fresh = t - live.t < live.tf + 600, side = live.d === 1 ? 'BUY' : 'SELL';
      const stopNow = (live.liveStop != null ? live.liveStop : live.stop) + o;
      res.ticket = { e: money(live.e + o, mk), stopLbl: live.tgt == null ? 'Trailing stop' : 'Stop', stop: money(stopNow, mk), tgt: live.tgt == null ? 'None (trails)' : money(live.tgt + o, mk), size: sizeText(mk, live.e, live.stop) };
      if (fresh) {
        res.word = `${practice ? 'Practice ' : ''}${side} setup`; res.tone = live.d === 1 ? 'green' : 'red';
        const moved = p != null ? (p - (live.e + o)) * live.d : 0;
        res.why = `${live.why} Signal at the ${hm(live.t)} close at ${money(live.e + o, mk)}. Price now ${money(p, mk)}.` + (moved > 0.5 * live.risk ? ' Price has already run a fair way. If you are late, skip it rather than chase.' : '');
      } else {
        res.word = `In a ${practice ? 'practice ' : ''}${side.toLowerCase()}`; res.tone = 'blue';
        res.why = `${side === 'BUY' ? 'Bought' : 'Sold'} ${whenS(live.t)} at ${money(live.e + o, mk)}. ${live.tgt == null ? (mk === 'btc' && live.sid === 'trend' ? `The stop is ${money(live.stop, mk)}. Close the trade if a 4-hour candle closes below ${money(sx.lo, mk)}.` : `The trailing stop is now ${money(stopNow, mk)}. Close the trade if a 1-hour candle closes past it${mk === 'gold' ? ', or before 5 PM' : ''}.`) : `Stop ${money(stopNow, mk)}, target ${money(live.tgt + o, mk)}.`}`;
      }
    } else if (mk === 'gold' && !gi.open) {
      res.word = "Don't trade now"; res.tone = 'yellow'; res.why = `Gold is closed. It reopens ${gi.reopen} (Toronto time).`;
    } else if (news) {
      res.word = "Don't trade now"; res.tone = 'yellow'; res.why = `${news[2]} is out around now. Prices can jump, so wait 15 minutes.`;
    } else if (mk === 'gold' && z.m >= 960 && z.m < 1020) {
      res.word = 'Wait'; res.why = 'Gold takes its daily break at 5 PM, so no new trades in the last hour. The strategy restarts after 6 PM.';
    } else if (mk === 'gold') {
      res.word = 'Wait';
      res.why = !sx.calm ? 'Gold is moving too wildly for this strategy. It only trades breakouts that come out of a calm stretch, so let it settle.'
        : `Everything is ready except the breakout. Watch for a 1-hour candle to close ${sx.up ? 'above' : 'below'} ${money((sx.up ? sx.hi : sx.lo) + o, mk)}.`;
    } else {
      res.word = 'Wait';
      res.why = sx.up ? `Bitcoin is in an uptrend. Trend Rider is waiting for a 4-hour candle to close above ${money(sx.hi, mk)} (the 7-day high).`
        : `Bitcoin is below its 200-candle average (${money(sx.trend, mk)}), so Trend Rider waits on the sidelines. It only buys in uptrends and can go weeks without a trade. That's normal.`;
    }
    res.badge = mk === 'gold' ? { t: 'Quiet Breakout · tested 5 yrs', tone: 'green' } : { t: 'Trend Rider · tested 5 yrs', tone: 'green' };
    return res;
  }

  /* ---------------- market view ---------------- */
  function buildMarket(mk) {
    const sec = $('#view-' + mk); sec.appendChild($('#marketTpl').content.cloneNode(true));
    const root = sec.querySelector('.market'); const f = {}; $$('[data-f]', root).forEach(el => { f[el.dataset.f] = el; });
    f.name.textContent = MK[mk].name; f.sym.textContent = MK[mk].sym;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches, art = mk === 'gold' ? 'gold' : 'coin';
    f.obj.onload = () => { f.obj.hidden = false; }; f.obj.onerror = () => { f.obj.hidden = true; };
    f.obj.src = `assets/${art}.${still ? 'png' : 'webp'}`;
    S[mk].ui = f;
    f.stratTag.textContent = mk === 'gold' ? 'Quiet Breakout' : 'Trend Rider'; f.stratTag.dataset.tone = 'green';
    // timeframe buttons (the TradingView pane follows the same timeframe)
    $$('[data-tf]', f.tfs).forEach(b => b.setAttribute('aria-pressed', +b.dataset.tf === S[mk].tf));
    f.tfs.addEventListener('click', e => {
      const b = e.target.closest('[data-tf]'); if (!b || +b.dataset.tf === S[mk].tf) return;
      S[mk].tf = +b.dataset.tf; ls.set('v2_tf3_' + mk, S[mk].tf); $$('[data-tf]', f.tfs).forEach(x => x.setAttribute('aria-pressed', x === b));
      drawChart(mk); if (S[mk].tvDone) { S[mk].tvDone = false; loadTV(mk); }
      if (S[mk].analysis) runAnalyze(mk);
    });
    // layout: marked / split / TradingView
    const modeInk = $('.mode-ink', f.modes);
    const moveModeInk = () => { const b = $(`[data-mode="${S[mk].mode}"]`, f.modes); if (b && modeInk) { modeInk.style.width = b.offsetWidth + 'px'; modeInk.style.transform = `translateX(${b.offsetLeft - 3}px)`; } };
    const setMode = m => {
      S[mk].mode = m; ls.set('v2_mode', m); f.panes.dataset.mode = m; f.ws.dataset.mode = m;
      $$('[data-mode]', f.modes).forEach(x => x.setAttribute('aria-pressed', x.dataset.mode === m)); moveModeInk();
      if (m !== 'marked') loadTV(mk);
      setTimeout(() => S[mk].chart && S[mk].chart.refit(), 430);
    };
    S[mk].setMode = setMode; S[mk].moveModeInk = moveModeInk;
    f.modes.addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); });
    new ResizeObserver(moveModeInk).observe(f.modes);
    S[mk].chart = DeskChart.create(f.ws, mk); S[mk].chart.init();
    bindTrade(mk);
    setMode(ls.get('v2_mode', innerWidth >= 1000 ? 'split' : 'marked'));
    // strategy cards
    f.strats.innerHTML = MK[mk].strats.map(s => {
      const R = RES[s.res] || {};
      const years = Object.entries(R.years || {});
      const mx = Math.max(1, ...years.map(([, v]) => Math.abs(v)));
      return `<div class="card strat reveal" data-sid="${s.id}">
        <div class="cardhead"><h2>${s.name}</h2><span class="tag" data-tone="${s.tone}">${s.badge}</span></div>
        <div class="now" data-tone="grey" data-now>Loading…</div>
        <ul class="rule">${s.rules.map(x => `<li>${x}</li>`).join('')}</ul>
        <div class="stats">
          <div><span>Trades (5 yrs)</span><b>${R.n ?? '-'}</b></div>
          <div><span>Win rate</span><b>${R.win ?? '-'}%</b></div>
          <div><span>Total after costs</span><b class="${R.R >= 0 ? 'pos' : 'neg'}">${R.R >= 0 ? '+' : ''}${R.R}R</b></div>
          <div><span>Worst drop</span><b>${R.dd}R</b></div>
          <div><span>Losing streak</span><b>${R.streak}</b></div>
          <div><span>Last 12 months</span><b class="${R.test >= 0 ? 'pos' : 'neg'}">${R.test >= 0 ? '+' : ''}${R.test}R</b></div>
        </div>
        <div class="bars" aria-label="Result by year">${years.map(([y, v], i) => `<div class="b" style="--i:${i}"><s>${v >= 0 ? '+' : ''}${Math.round(v)}</s><i class="${v < 0 ? 'neg' : ''}" style="height:${Math.max(3, Math.abs(v) / mx * 46)}px"></i><em>${y === '2021' ? "'21*" : "'" + y.slice(2)}</em></div>`).join('')}</div>
        <p class="note">${s.note}${years.length ? ' *2021 covers Oct to Dec only.' : ''}</p>
      </div>`;
    }).join('');
    observeReveal(root);
  }

  const cssv = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const SHORT = { 'Quiet Breakout': 'QB', 'ICC': 'ICC', 'Bollinger Breakout': 'BB', 'Trend Rider': 'TR' };
  // the strategy's own lines on the 1-hour chart, and the live price that would trigger the next signal
  function marks(mk) {
    const st = S[mk], o = off(mk), U = Engine.util, c = st.s1h.closed(), d = st.sD.closed(), main = MK[mk].strats.find(s => s.main), r = st.out[main.id];
    if (c.length < 260 || !r) return { overlays: [], triggers: [] };
    const tail = c.slice(-700), H = tail.map(b => b.h), Lo = tail.map(b => b.l), C = tail.map(b => b.c), sx = r.state || {};
    const line = (vals, from) => tail.map((b, i) => ({ time: b.t, value: vals[i] + o })).slice(from);
    const overlays = [], triggers = [];
    if (mk === 'gold') {
      const hi = U.rollMax(H, 20), lo = U.rollMin(Lo, 20), d50 = U.daily(tail, 3600, x => U.sma(x, 50), d);
      overlays.push({ id: 'chHi', color: cssv('--cyan'), width: 1, style: 2, step: true, data: line(hi, 20) });
      overlays.push({ id: 'chLo', color: cssv('--cyan'), width: 1, style: 2, step: true, data: line(lo, 20) });
      overlays.push({ id: 'd50', color: cssv('--gold'), width: 2, data: tail.map((b, i) => d50[i] == null ? null : { time: b.t, value: d50[i] + o }).filter(Boolean) });
      if (sx.hi != null) triggers.push(sx.up ? { price: sx.hi + o, title: `BUY above ${fmtN(sx.hi + o, 2)}`, color: cssv('--up'), strong: !!sx.calm } : { price: sx.lo + o, title: `SELL below ${fmtN(sx.lo + o, 2)}`, color: cssv('--down'), strong: !!sx.calm });
    } else {
      // Trend Rider lines live on 4-hour candles: 7-day high (entry), 3-day low (exit), 200-candle average (trend)
      const h4 = h4Of(c), T4 = h4.slice(-400), C4 = T4.map(b => b.c);
      const hi = U.rollMax(T4.map(b => b.h), 40), lo = U.rollMin(T4.map(b => b.l), 20), s200 = U.sma(h4.map(b => b.c), 200).slice(-T4.length);
      const l4 = (vals, from) => T4.map((b, i) => ({ time: b.t, value: vals[i] })).slice(from);
      overlays.push({ id: 'trHi', color: cssv('--cyan'), width: 1, style: 2, step: true, data: l4(hi, 40) });
      overlays.push({ id: 'trLo', color: cssv('--blue'), width: 1, style: 2, step: true, data: l4(lo, 20) });
      overlays.push({ id: 's200', color: cssv('--gold'), width: 2, data: h4.length > 210 ? l4(s200, 0) : [] });
      if (sx.hi != null) triggers.push({ price: sx.hi, title: `BUY above ${fmtN(sx.hi, 0)}`, color: cssv('--up'), strong: !!sx.up });
      return { overlays, triggers, tf: 14400 };
    }
    return { overlays, triggers, tf: 3600 };
  }
  function drawChart(mk) {
    const st = S[mk]; if (!st.chart || !st.s1h.bars.length) return;
    let bars = st.tf === 900 ? st.s15.bars : st.tf === 14400 ? Engine.resample(st.s1h.bars, 14400) : st.tf === 86400 ? st.sD.bars : st.s1h.bars;
    if (!bars.length) bars = st.s1h.bars;
    const o = off(mk);
    st.chart.setBars(bars, o, bars === st.s1h.bars ? 3600 : st.tf);
    st.chart.setSignals(tradesOf(mk).map(t => ({ t: t.t, d: t.d, e: t.e + o, stop: t.stop + o, tgt: t.tgt == null ? null : t.tgt + o, liveStop: t.liveStop == null ? null : t.liveStop + o, R: t.R == null ? null : t.Rf, exit: t.exit == null ? null : t.exit + o, exitT: t.exitT, name: t.name, short: SHORT[t.name] })));
    const mm = marks(mk);
    st.chart.setOverlays(st.tf <= (mm.tf || 3600) ? mm.overlays : []);
    st.chart.setTriggers(mm.triggers);
    st.ui.chartNote.textContent = mk === 'gold'
      ? `Candles come from PAXG (a gold-backed token, ${st.s1h.source || 'Coinbase'}). They're shifted by ${OFF == null ? 'the gap, once it has been measured' : (OFF >= 0 ? '+' : '-') + '$' + Math.abs(OFF).toFixed(2)} so prices match XAUUSD spot. The last candle on the right is still forming, and signals only use closed candles.`
      : `Candles come from ${st.s1h.source || 'Coinbase'} BTC-USD. The last candle on the right is still forming, and signals only use closed candles.`;
  }

  let tvLoading = null;
  function loadTV(mk) {
    const st = S[mk]; if (st.tvDone || st.tvBusy) return; st.tvBusy = true;
    const id = 'tv_' + mk; st.ui.tv.id = id;
    const IV = { 900: '15', 3600: '60', 14400: '240', 86400: 'D' };
    // TradingView does not let other sites draw on its chart, so it gets the strategy's own indicator instead
    // the strategy's own levels as TradingView indicators: the Donchian channel IS the breakout line
    const tf = st.tf, D = n => ({ id: 'DONCH@tv-basicstudies', inputs: { length: n } }), MA = n => ({ id: 'MASimple@tv-basicstudies', inputs: { length: n } });
    const studies = mk === 'gold' ? (tf === 3600 ? [D(20)] : tf === 14400 ? [D(20), MA(200)] : tf === 86400 ? [MA(50)] : [D(20)])
      : (tf === 14400 ? [D(40), MA(200)] : tf === 86400 ? [MA(50)] : [MA(200), { id: 'BB@tv-basicstudies', inputs: { length: 20 } }]);
    const make = () => { st.tvBusy = false; try { st.ui.tv.innerHTML = ''; new window.TradingView.widget({ container_id: id, studies, backgroundColor: isDark() ? '#0B0E14' : '#FFFFFF', gridColor: isDark() ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)', symbol: MK[mk].tv, interval: IV[st.tf] || '60', timezone: TZN, theme: isDark() ? 'dark' : 'light', style: '1', locale: 'en', autosize: true, hide_side_toolbar: false, allow_symbol_change: true, details: true }); st.tvDone = true; } catch (e) { st.ui.tv.textContent = 'TradingView could not load.'; } };
    if (window.TradingView) return make();
    tvLoading = tvLoading || new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://s3.tradingview.com/tv.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    tvLoading.then(make, () => { st.tvBusy = false; tvLoading = null; st.ui.tv.innerHTML = '<div class="tvwait">TradingView could not load. Check your internet, then switch layouts to try again.</div>'; });
  }

  function renderMarket(mk) {
    const st = S[mk], f = st.ui; if (!f) return;
    const p = displayPrice(mk), o = off(mk);
    // price + change
    if (p != null) {
      f.price.textContent = money(p, mk);
      if (st.prevPrice != null && p !== st.prevPrice) { f.price.parentElement.classList.remove('tick-up', 'tick-down'); void f.price.offsetWidth; f.price.parentElement.classList.add(p > st.prevPrice ? 'tick-up' : 'tick-down'); setTimeout(() => f.price.parentElement.classList.remove('tick-up', 'tick-down'), 700); }
      st.prevPrice = p;
      const h = st.s1h.bars, ref = h.find(b => b.t >= now() - 86400);
      if (ref) { const ch = p - (ref.o + o), pc = ch / (ref.o + o) * 100; f.chg.textContent = `${ch >= 0 ? '+' : ''}${fmtN(pc, 2)}% today`; f.chg.style.color = ch >= 0 ? 'var(--up)' : 'var(--down)'; }
    }
    // freshness
    const age = st.s1h.lastClosedAge(), late = st.ready && age > 3600 + 900;
    f.fresh.classList.toggle('late', late);
    f.fresh.textContent = !st.ready ? (st.err ? 'Could not load candles' : 'Loading live candles…')
      : late ? `Data is late: the last 1-hour candle closed ${ago(age)}. Signals may be behind.`
      : `Last 1-hour candle closed ${hm(st.s1h.closed().slice(-1)[0].t + 3600)} · ${mk === 'gold' && SPOT && !Engine.goldClosed(now()) && now() - SPOT.t < 300 ? 'spot price live' : 'last trade ' + (st.tick ? ago(now() - st.tick.t) : '-')}${mk === 'gold' && OFF != null ? ` · XAUUSD = PAXG ${OFF >= 0 ? '+' : '-'} $${Math.abs(OFF).toFixed(2)}` : ''}`;
    // status
    const s = status(mk);
    if (f.word.textContent !== s.word) { f.word.textContent = s.word; f.word.classList.remove('swap'); void f.word.offsetWidth; f.word.classList.add('swap'); }
    if (s.tone) f.word.dataset.tone = s.tone; else delete f.word.dataset.tone;
    f.why.textContent = s.why || '';
    if (s.badge) { f.badge.textContent = s.badge.t; f.badge.dataset.tone = s.badge.tone; }
    f.ticket.hidden = !s.ticket;
    if (s.ticket) { f.tEntry.textContent = s.ticket.e; f.tStopLbl.textContent = s.ticket.stopLbl; f.tStop.textContent = s.ticket.stop; f.tTgt.textContent = s.ticket.tgt; f.tSize.textContent = s.ticket.size; }
    const ck = JSON.stringify(s.checks);
    if (f.checks.dataset.k !== ck) {
      f.checks.dataset.k = ck;
      f.checks.innerHTML = s.checks.map((c, i) => `<li style="--i:${i}"><i class="${c.s}">${c.s === 'ok' ? '✓' : c.s === 'no' ? '✕' : '…'}</i><div>${esc(c.t)}<small>${esc(c.d || '')}</small></div></li>`).join('');
    }
    renderBook(mk);
    if (!st.ready) return;
    // strategy "now" lines
    for (const s2 of MK[mk].strats) {
      const el = $(`[data-sid="${s2.id}"] [data-now]`, st.ui.strats); const r = st.out[s2.id]; if (!el || !r) continue;
      const live = r.trades.find(x => x.R == null), last = [...r.trades].reverse().find(x => x.R != null);
      let txt, tone = 'grey';
      if (live) { txt = `In a ${live.d === 1 ? 'BUY' : 'SELL'} since ${whenS(live.t)} at ${money(live.e + o, mk)}. Stop ${money((live.liveStop ?? live.stop) + o, mk)}${live.tgt != null ? `, target ${money(live.tgt + o, mk)}` : ' (trailing)'}`; tone = live.d === 1 ? 'green' : 'red'; }
      else if (s2.id === 'trend' && r.state) { const v = r.state; txt = v.up ? `Uptrend. Waiting for a 4-hour close above ${money(v.hi + o, mk)}.` : `${MK[mk].name} is below its 200-candle average (${money(v.trend + o, mk)}). Sitting out until the uptrend comes back.`; tone = v.up ? 'blue' : 'grey'; }
      else if (s2.id === 'london' && r.state) { const v = r.state; txt = v.hi == null ? 'Waiting for the Asian range (8 PM to 2 AM).' : v.building ? `Asian range building: ${money(v.lo + o, mk)} to ${money(v.hi + o, mk)}.` : v.done ? (v.why === 'traded' ? 'Traded today already. One trade a day.' : `No trade today: ${v.why}.`) : v.window ? `Watching for a 15-min close ${v.up ? 'above ' + money(v.hi + o, mk) : 'below ' + money(v.lo + o, mk)} until 10 AM.` : 'London window closed. Next Asian range starts at 8 PM.'; tone = v.window && !v.done ? 'blue' : 'grey'; }
      else if (s2.id === 'icc' && r.state) { const v = r.state; txt = v.phase === 'impulse' ? `4-hour ${v.d === 1 ? 'break up' : 'break down'} spotted. Waiting for a pullback.` : v.phase === 'correcting' ? `Pullback in progress (${Math.round(v.ret * 100)}% so far, needs 30%).` : `Ready: waiting for a 15-min close ${v.d === 1 ? 'above' : 'below'} ${money(v.piv + o, mk)}.`; tone = 'blue'; }
      else txt = last ? `No trade open. Last: ${last.d === 1 ? 'BUY' : 'SELL'} ${whenS(last.t)}, ${fR(last.Rf)} (${last.res}).` : 'No trade open, and no signals in the loaded history.';
      el.textContent = txt; el.dataset.tone = tone;
    }
    // latest signals table
    const T = tradesOf(mk).sort((a, b) => b.t - a.t).slice(0, 12);
    f.log.innerHTML = T.length ? `<thead><tr><th>When</th><th>Strategy</th><th>Side</th><th>Entry</th><th>Stop</th><th>Exit</th><th>Result</th></tr></thead><tbody>${T.map(t => rowHTML(t, false)).join('')}</tbody>` : `<tbody><tr><td class="empty">No signals in the loaded history yet.</td></tr></tbody>`;
  }
  function rowHTML(t, withMarket) {
    const mk = t.market, o = off(mk), r = t.R == null ? null : t.Rf;
    const res = r == null ? '<span class="tag" data-tone="blue">open</span>' : `${fR(r)} <span class="muted">${usd(r * riskUSD())}</span>`;
    const seenTag = withMarket ? (() => { const s = seen[`${mk}|${t.sid}|${t.t}|${t.d}`]; return s != null && s - t.t < t.tf * 2 + 300 ? '<span class="tag" data-tone="green">seen live</span>' : '<span class="tag" data-tone="grey">found later</span>'; })() : '';
    return `<tr><td>${when(t.t)}</td>${withMarket ? `<td>${MK[mk].name}</td>` : ''}<td>${t.name}${t.practice ? ' <span class="tag" data-tone="yellow">practice</span>' : ''}</td><td><span class="tag" data-tone="${t.d === 1 ? 'green' : 'red'}">${t.d === 1 ? 'BUY' : 'SELL'}</span></td><td>${money(t.e + o, mk)}</td><td>${money(t.stop + o, mk)}</td><td>${t.exit == null ? '-' : money(t.exit + o, mk) + ` <span class="muted">${t.res}</span>`}</td><td class="${r == null ? '' : r > 0 ? 'pos' : 'neg'}">${res}</td>${withMarket ? `<td>${seenTag}</td>` : ''}</tr>`;
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------------- plan view ---------------- */
  function renderPlan() {
    const t = now(), gi = goldOpenInfo(t), z = gi.z, news = newsAt(z.m);
    $('#planTime').textContent = dtClock.format(new Date(t * 1000)).replace(/\./g, '');
    let word, why;
    if (!gi.open) { word = 'Gold is closed'; why = `It reopens ${gi.reopen}. Bitcoin is open 24/7, but it's practice only.`; }
    else if (news) { word = 'News time: wait'; why = `${news[2]}. Don't enter new trades until about 15 minutes after.`; }
    else if (z.m >= 960 && z.m < 1020) { word = 'Last hour before the break'; why = 'Gold pauses 5 to 6 PM. Close open Quiet Breakout trades before 5, and take no new ones.'; }
    else if (z.m >= 180 && z.m < 720) { word = 'Busiest hours'; why = 'London and New York are both open, so most breakouts happen now. The Quiet Breakout still needs a calm stretch first. Check the Gold page.'; }
    else { word = 'Quiet hours'; why = 'Asia session and the afternoon are usually calmer. The Quiet Breakout can still fire at any open hour, so let the Gold page tell you.'; }
    $('#planWord').textContent = word; $('#planWhy').textContent = why;
    // timeline
    const tl = $('#timeline'); const weekendDay = z.wd === 5;
    const segs = weekendDay ? [[0, 1440, 'grey']] : [[0, 180, 'blue'], [180, 720, 'green'], [720, 1020, 'blue'], [1020, 1080, 'grey'], [1080, 1440, 'blue']];
    if (z.wd === 6) segs.splice(0, segs.length, [0, 1080, 'grey'], [1080, 1440, 'blue']);
    if (z.wd === 4) segs.splice(3, 2, [1020, 1440, 'grey']);
    const key = z.wd + ':' + Math.floor(z.m / 5);
    if (tl.dataset.k !== key) {
      tl.dataset.k = key;
      tl.innerHTML = segs.map(([a, b, tone]) => `<div class="s" data-tone="${tone}" style="width:${(b - a) / 14.4}%"></div>`).join('')
        + NEWS.map(([a, b]) => `<div class="nw" style="left:${a / 14.4}%;width:${(b - a) / 14.4}%"></div>`).join('')
        + [0, 3, 6, 9, 12, 15, 18, 21].map(h => `<span class="tk" style="left:${h / 24 * 100}%">${h === 0 ? '12a' : h < 12 ? h + 'a' : h === 12 ? '12p' : (h - 12) + 'p'}</span>`).join('')
        + `<div class="nl" style="left:${z.m / 14.4}%"></div>`;
    }
    // settings line
    $('#riskLine').textContent = `${SET.risk}% of ${usd(SET.acct)} = ${usd(riskUSD())} risked per trade. 1R = ${usd(riskUSD())}.`;
    // record
    const rows = [['goldQuiet', 'Quiet Breakout', 'Gold', 'green', 'Held up'], ['goldIcc', 'ICC + trend', 'Gold', 'yellow', 'Practice'], ['btcTrend', 'Trend Rider', 'Bitcoin', 'green', 'Held up'], ['btcBB', 'Bollinger Breakout', 'Bitcoin', 'yellow', 'Practice'], ['btcIcc', 'ICC (removed)', 'Bitcoin', 'red', 'Lost money']];
    if (!$('#recTable').dataset.done && RES.goldQuiet) {
      $('#recTable').dataset.done = 1;
      $('#recRange').textContent = `${new Date(RES.from * 1000).toLocaleDateString('en-CA', { month: 'short', year: 'numeric' })} to ${new Date(RES.to * 1000).toLocaleDateString('en-CA', { month: 'short', year: 'numeric' })}`;
      $('#recTable').innerHTML = `<thead><tr><th>Strategy</th><th>Market</th><th>Trades</th><th>Win %</th><th>Total after costs</th><th>Profit factor</th><th>Worst drop</th><th>Losing streak</th><th>Last 12 months</th><th></th></tr></thead><tbody>${rows.map(([k, n, m, tone, v]) => { const R = RES[k]; return `<tr><td>${n}</td><td>${m}</td><td>${R.n}</td><td>${R.win}%</td><td class="${R.R >= 0 ? 'pos' : 'neg'}">${R.R >= 0 ? '+' : ''}${R.R}R <span class="muted">${usd(R.R * riskUSD())}</span></td><td>${R.pf}</td><td>${R.dd}R</td><td>${R.streak}</td><td class="${R.test >= 0 ? 'pos' : 'neg'}">${R.test >= 0 ? '+' : ''}${R.test}R</td><td><span class="tag" data-tone="${tone}">${v}</span></td></tr>`; }).join('')}</tbody>`;
      $('#recYears').innerHTML = rows.map(([k, n, m]) => { const Y = Object.entries(RES[k].years), mx = Math.max(1, ...Y.map(([, v]) => Math.abs(v))); return `<div><h3>${n} · ${m}</h3><div class="bars">${Y.map(([y, v], i) => `<div class="b" style="--i:${i}"><s>${v >= 0 ? '+' : ''}${Math.round(v)}</s><i class="${v < 0 ? 'neg' : ''}" style="height:${Math.max(3, Math.abs(v) / mx * 46)}px"></i><em>'${y.slice(2)}</em></div>`).join('')}</div></div>`; }).join('');
    }
    // all signals log
    const T = ['gold', 'btc'].flatMap(tradesOf).sort((a, b) => b.t - a.t).slice(0, 40);
    $('#allLog').innerHTML = T.length ? `<thead><tr><th>When</th><th>Market</th><th>Strategy</th><th>Side</th><th>Entry</th><th>Stop</th><th>Exit</th><th>Result</th><th>Seen</th></tr></thead><tbody>${T.map(t => rowHTML(t, true)).join('')}</tbody>` : `<tbody><tr><td class="empty">Signals appear here once the live candles load.</td></tr></tbody>`;
  }

  /* ---------------- home ---------------- */
  function renderHome() {
    for (const mk of ['gold', 'btc']) {
      const el = $(`[data-tile="${mk}"]`); if (!el) continue;
      const p = displayPrice(mk), s = status(mk);
      $('[data-k=price]', el).textContent = p == null ? '--' : money(p, mk);
      const tag = $('[data-k=tag]', el); tag.textContent = s.word; tag.dataset.tone = s.tone || 'grey';
      $('[data-k=why]', el).textContent = s.why || '';
    }
  }
  function countUp(root) {
    const go = () => $$('[data-count]', root).forEach(el => {
      const to = +el.dataset.count, dec = +(el.dataset.dec || 0), pre = el.dataset.pre || '', suf = el.dataset.suf || '', t0 = performance.now(), D = 1400;
      const step = t => { const k = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - k, 3), v = to * e; el.textContent = (v < 0 ? '-' : pre) + Math.abs(v).toFixed(dec) + suf; if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
    const o = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { o.disconnect(); go(); } }, { threshold: .4 }); o.observe(root);
  }

  /* ---------------- tabs / routing ---------------- */
  const VIEWS = ['home', 'gold', 'btc', 'bots', 'learn', 'plan'];
  function route() {
    const v = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home';
    VIEWS.forEach(x => { $('#view-' + x).hidden = x !== v; });
    $$('[data-tab]').forEach(a => { if (a.dataset.tab === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    const a = $(`.tabs a[data-tab="${v}"]`), ink = $('.tabs .ink');
    if (a && ink) { ink.style.width = a.offsetWidth + 'px'; ink.style.transform = `translateX(${a.offsetLeft}px)`; }
    window.scrollTo({ top: 0 });
    if (S[v]) { requestAnimationFrame(() => { if (S[v].chart) S[v].chart.ensureFit(); if (S[v].moveModeInk) S[v].moveModeInk(); }); if (S[v].ready) renderMarket(v); }
    else if (v === 'plan') renderPlan();
    if (v === 'home') renderHome();
    if (v === 'bots') renderBots();
    if (v === 'learn' && window.Learn) Learn.render();
    observeReveal(document);
    current = v;
  }
  let current = 'home';

  /* ---------------- reveal ---------------- */
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('shown'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -40px 0px' }) : null;
  function observeReveal(root) { $$('.reveal:not(.shown)', root).forEach((el, i) => { el.style.setProperty('--i', i % 4); if (io) io.observe(el); else el.classList.add('shown'); }); }

  /* ---------------- theme ---------------- */
  const isDark = () => document.documentElement.dataset.theme !== 'light';
  function applyTheme() {
    document.documentElement.dataset.theme = SET.theme;
    try { localStorage.setItem('v2_theme', SET.theme); } catch (e) {}
    for (const mk of Object.keys(MK)) { if (S[mk].chart) { S[mk].chart.retheme(); drawChart(mk); } if (S[mk].tvDone) { S[mk].tvDone = false; loadTV(mk); } }
  }

  /* ---------------- settings form ---------------- */
  function bindSettings() {
    const a = $('#setAcct'), r = $('#setRisk'), al = $('#setAlerts'), so = $('#setSound'), th = $('#setTheme');
    a.value = SET.acct; r.value = SET.risk; al.checked = SET.alerts; so.checked = SET.sound; th.value = SET.theme;
    a.addEventListener('change', () => { const v = +a.value; if (v >= 100) { SET.acct = v; saveSet(); renderAll(); } else a.value = SET.acct; });
    r.addEventListener('change', () => { const v = +r.value; if (v > 0 && v <= 5) { SET.risk = v; saveSet(); renderAll(); } else r.value = SET.risk; });
    al.addEventListener('change', async () => {
      SET.alerts = al.checked; saveSet();
      if (al.checked && 'Notification' in window && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch (e) {} }
      if (al.checked && 'Notification' in window && Notification.permission === 'denied') toast('Pop-up alerts are blocked', 'Your browser blocked notifications for this page. Alerts will still show here with a sound while the tab is open.');
    });
    so.addEventListener('change', () => { SET.sound = so.checked; saveSet(); });
    th.addEventListener('change', () => { SET.theme = th.value; saveSet(); applyTheme(); });
    $('#testAlert').addEventListener('click', () => { toast('Test alert: BUY setup, Gold, Quiet Breakout', 'This is what a real alert looks like. Keep this tab open to get them.'); beep(); if (SET.alerts && 'Notification' in window && Notification.permission === 'granted') { try { new Notification('Trading Desk test alert', { body: 'Alerts are working.' }); } catch (e) {} } });
  }

  function snapshot() {
    const o = {}; for (const mk of Object.keys(MK)) { if (!S[mk].ready) continue; const s2 = status(mk); o[mk] = { price: displayPrice(mk), word: s2.word, why: s2.why || '', badge: s2.badge ? s2.badge.t : '' }; }
    const eq = BOOK.balance + BOOK.pos.reduce((s3, p) => { const px = displayPrice(p.mk); return s3 + (px == null ? 0 : pnlOf(p, px)); }, 0);
    ls.set('desk_snapshot', Object.assign({ t: Math.floor(now()), balance: BOOK.balance, equity: eq, open: BOOK.pos.length, auto: AUTO.on }, o));
  }
  function renderAll() { try { snapshot(); } catch (e) {} if (current === 'plan') renderPlan(); else if (current === 'home') renderHome(); else if (current === 'bots') renderBots(); else if (S[current]) renderMarket(current); }

  /* ---------------- loading & refresh ---------------- */
  async function loadMarket(mk) {
    const st = S[mk];
    try {
      await Promise.all([st.s1h.load(), st.sD.load(), Data.ticker(mk).then(x => { st.tick = x; })]);
      compute(mk); drawChart(mk); if (current === mk) renderMarket(mk); lastOK = now();
      await st.s15.load(); compute(mk); drawChart(mk); if (current === mk || current === 'plan') renderAll();
    } catch (e) { st.err = e; if (current === mk) renderMarket(mk); }
  }
  async function refresh() {
    for (const mk of Object.keys(MK)) {
      const st = S[mk]; if (!st.s1h.bars.length) continue;
      const ok = await Promise.all([st.s1h.update(), st.s15.bars.length ? st.s15.update() : true]);
      if (now() - st.sD.lastFetch > 1800) await st.sD.update();
      if (ok.some(Boolean)) { lastOK = now(); compute(mk); drawChart(mk); }
    }
    renderAll();
  }
  async function refreshPrices() {
    const [g, b, sp] = await Promise.all([Data.ticker('gold'), Data.ticker('btc'), Data.goldSpot()]);
    if (g) S.gold.tick = g; if (b) S.btc.tick = b; if (sp) SPOT = sp;
    if (g || b) lastOK = Math.max(lastOK, now() - 1);
    updateOffset(); checkPositions(); checkCalls();
    if (current === 'home') renderHome(); else if (current === 'bots') renderBots(); else if (S[current]) renderMarket(current);
  }
  function tickClock() {
    const t = now();
    $('#clock').textContent = dtClock.format(new Date(t * 1000)).replace(/\./g, '') + ' ET';
    const d = $('#netDot'); d.className = 'dot ' + (lastOK && t - lastOK < 180 ? 'live' : lastOK ? 'late' : '');
    if (current === 'plan') { const pt = $('#planTime'); if (pt) pt.textContent = dtClock.format(new Date(t * 1000)).replace(/\./g, ''); }
  }


  /* ---------------- demo trading (practice account, saved in this browser) ---------------- */
  const BOOK = Object.assign({ balance: 10000, pos: [], hist: [] }, ls.get('v2_book', {}));
  const saveBook = () => ls.set('v2_book', BOOK);
  const UNIT = { gold: { name: 'lots', mult: 100, step: 0.01, dp: 2 }, btc: { name: 'BTC', mult: 1, step: 0.0001, dp: 4 } };
  const pnlOf = (p, px) => (px - p.entry) * p.side * p.qty * UNIT[p.mk].mult;
  const r2 = (x, dp = 2) => Math.round(x * 10 ** dp) / 10 ** dp;
  function atrNow(mk) { const c = S[mk].s1h.closed(); if (c.length < 30) return null; const A = Engine.util.ema(Engine.util.trs(c), 14); return A[A.length - 1]; }
  function liveSetup(mk) { const main = MK[mk].strats.find(s => s.main), r = S[mk].out[main.id]; return r ? r.trades.find(x => x.R == null) : null; }

  function bindTrade(mk) {
    const f = S[mk].ui, U = UNIT[mk]; S[mk].tk = { side: 1 };
    f.unit.textContent = U.name; f.qty.step = U.step; f.qty.min = U.step;
    f.sl.step = f.tp.step = mk === 'btc' ? '1' : '0.01';
    f.trailRow.hidden = mk !== 'gold';
    const setSide = d => {
      S[mk].tk.side = d; $$('[data-side]', f.trade).forEach(b => { if (b.parentElement.classList.contains('sidesw')) b.setAttribute('aria-pressed', +b.dataset.side === d); });
      if (!f.sl.value || f.sl.dataset.auto === '1') autoStop();
      updateTicket(mk);
    };
    const autoStop = () => { const p = displayPrice(mk), a = atrNow(mk); if (p == null || a == null) return; f.sl.value = r2(p - S[mk].tk.side * 3 * a, mk === 'btc' ? 0 : 2); f.sl.dataset.auto = '1'; if (!f.qty.value || f.qty.dataset.auto === '1') size1(); updateTicket(mk); };
    const size1 = () => { const p = displayPrice(mk), sl = +f.sl.value; if (p == null || !sl) return; const q = Math.max(U.step, Math.floor(riskUSD() / Math.abs(p - sl) / U.mult / U.step) * U.step); f.qty.value = q.toFixed(U.dp); f.qty.dataset.auto = '1'; updateTicket(mk); };
    S[mk].autoStop = autoStop;
    $('.sidesw', f.trade).addEventListener('click', e => { const b = e.target.closest('[data-side]'); if (b) setSide(+b.dataset.side); });
    f.size1.addEventListener('click', size1);
    f.autoStop.addEventListener('click', autoStop);
    for (const k of ['qty', 'sl', 'tp']) f[k].addEventListener('input', () => { f[k].dataset.auto = '0'; updateTicket(mk); });
    f.useSetup.addEventListener('click', () => {
      const t = liveSetup(mk); if (!t) return; const o = off(mk);
      setSide(t.d); f.sl.value = r2((t.liveStop != null ? t.liveStop : t.stop) + o, mk === 'btc' ? 0 : 2); f.sl.dataset.auto = '0';
      f.tp.value = t.tgt != null ? r2(t.tgt + o, mk === 'btc' ? 0 : 2) : ''; f.trail.checked = mk === 'gold' && t.tgt == null; size1();
    });
    f.place.addEventListener('click', () => {
      const p = displayPrice(mk), d = S[mk].tk.side, q = +f.qty.value, sl = +f.sl.value, tp = f.tp.value === '' ? null : +f.tp.value;
      const err = m => { f.tmsg.textContent = m; f.tmsg.classList.add('err'); };
      f.tmsg.classList.remove('err');
      if (p == null) return err('No live price yet. Wait a second and try again.');
      if (MK[mk].gold && Engine.goldClosed(now())) return err('Gold is closed right now, so the order would not fill. It reopens at 6 PM (Sunday 6 PM on weekends).');
      if (!(q > 0)) return err('Enter a size above 0.');
      if (!sl || (sl - p) * d >= 0) return err(d > 0 ? 'For a buy, the stop loss must be below the price.' : 'For a sell, the stop loss must be above the price.');
      if (tp != null && (tp - p) * d <= 0) return err(d > 0 ? 'For a buy, the take profit must be above the price.' : 'For a sell, the take profit must be below the price.');
      const pos = { id: Date.now(), mk, side: d, qty: q, entry: p, sl, sl0: sl, tp, trail: mk === 'gold' && f.trail.checked, openedAt: now(), lastChk: now(), ctx: ctxOf(mk), riskPct: Math.abs(p - sl) * q * U.mult / BOOK.balance * 100 };
      BOOK.pos.push(pos); saveBook();
      f.tmsg.textContent = `${d > 0 ? 'Bought' : 'Sold'} ${q} ${U.name} at ${money(p, mk)}. It's in "Your demo trades" and on the chart.`;
      toast(`Demo ${d > 0 ? 'BUY' : 'SELL'} placed`, `${q} ${U.name} ${MK[mk].name} at ${money(p, mk)}, stop ${money(sl, mk)}${tp != null ? ', target ' + money(tp, mk) : ''}.`); beep();
      f.place.classList.remove('pop'); void f.place.offsetWidth; f.place.classList.add('pop');
      renderBook(mk);
      if (window.Coach) Coach.onTradeOpened(pos);
    });
    f.reset.addEventListener('click', () => {
      const b = f.reset;
      if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Tap again to reset'; setTimeout(() => { delete b.dataset.armed; b.textContent = 'Reset to $10,000'; }, 3000); return; }
      BOOK.balance = 10000; BOOK.pos = []; BOOK.hist = []; saveBook(); delete b.dataset.armed; b.textContent = 'Reset to $10,000'; for (const m of Object.keys(MK)) renderBook(m);
    });
    f.openTbl.addEventListener('click', e => { const b = e.target.closest('[data-close]'); if (b) closePos(+b.dataset.close, displayPrice(mk), 'Closed by you'); });
    setTimeout(autoStop, 0);
  }
  function updateTicket(mk) {
    const st = S[mk], f = st.ui; if (!f || !st.tk) return;
    const U = UNIT[mk], p = displayPrice(mk), d = st.tk.side, q = +f.qty.value || 0, sl = +f.sl.value, tp = f.tp.value === '' ? null : +f.tp.value;
    if ((!f.sl.value || f.sl.dataset.auto === '1') && p != null && atrNow(mk) != null && !f.sl.value) st.autoStop();
    const s = status(mk), live = liveSetup(mk);
    f.callTag.textContent = s.word; f.callTag.dataset.tone = s.tone || 'grey'; f.useSetup.hidden = !live;
    const closed = MK[mk].gold && Engine.goldClosed(now());
    f.place.dataset.side = d; f.place.disabled = closed || p == null;
    f.place.textContent = closed ? 'Gold is closed' : `${d > 0 ? 'Buy' : 'Sell'} ${q ? q.toFixed(U.dp) : ''} ${U.name} at ${p == null ? '...' : money(p, mk)}`;
    if (p != null && sl && q) {
      const risk = Math.abs(p - sl) * q * U.mult, bad = (sl - p) * d >= 0;
      const rew = tp != null ? Math.abs(tp - p) * q * U.mult : null;
      f.riskLine.innerHTML = bad ? `<span class="neg">The stop is on the wrong side of the price.</span>`
        : `If the stop is hit: <b class="neg">-${usd(risk)}</b> (${(risk / BOOK.balance * 100).toFixed(1)}% of your balance)` + (rew != null ? ` · Target: <b class="pos">+${usd(rew)}</b> (${(rew / risk).toFixed(1)}R)` : f.trail.checked && mk === 'gold' ? ' · No target, the stop trails' : '');
    } else f.riskLine.textContent = 'Set a size and a stop loss to see your risk.';
  }
  function closePos(id, px, reason) {
    const i = BOOK.pos.findIndex(p => p.id === id); if (i < 0 || px == null) return;
    const p = BOOK.pos[i], v = pnlOf(p, px), risk = Math.abs(p.entry - p.sl0) * p.qty * UNIT[p.mk].mult;
    BOOK.pos.splice(i, 1); BOOK.balance += v;
    BOOK.hist.unshift(Object.assign({}, p, { exit: px, pnl: v, r: risk ? v / risk : null, reason, closedAt: now() })); BOOK.hist = BOOK.hist.slice(0, 100);
    saveBook(); toast(`Demo trade closed: ${v >= 0 ? '+' : '-'}${usd(Math.abs(v))}`, `${MK[p.mk].name} ${p.side > 0 ? 'buy' : 'sell'} closed at ${money(px, p.mk)} (${reason.toLowerCase()}).`); beep();
    renderBook(p.mk); renderAuto();
    if (window.Coach) Coach.onTradeClosed(BOOK.hist[0]);
  }
  // check stops and targets: every candle since the last check (catches quick spikes), then the live price
  function checkPositions() {
    for (const p of BOOK.pos.slice()) {
      const st = S[p.mk]; if (!st.s15.bars.length) continue;
      const o = off(p.mk);
      if (p.trail && p.mk === 'gold') {
        const c = st.s1h.closed().filter(b => b.t >= Math.floor(p.openedAt / 3600) * 3600 + 3600), a = atrNow('gold');
        if (c.length && a) { const ext = p.side > 0 ? Math.max(...c.map(b => b.c)) + o : Math.min(...c.map(b => b.c)) + o; const ns = p.side > 0 ? Math.max(p.sl, ext - 3 * a) : Math.min(p.sl, ext + 3 * a); if (ns !== p.sl) { p.sl = r2(ns); saveBook(); } }
      }
      let hit = null;
      for (const b of st.s15.bars) {
        if (b.t + 900 <= p.lastChk) continue;
        const lo = b.l + o, hi = b.h + o;
        if (p.side > 0 ? lo <= p.sl : hi >= p.sl) { hit = [p.sl, 'Stop loss hit']; break; }
        if (p.tp != null && (p.side > 0 ? hi >= p.tp : lo <= p.tp)) { hit = [p.tp, 'Target hit']; break; }
      }
      const px = displayPrice(p.mk);
      if (!hit && px != null) { if (p.side > 0 ? px <= p.sl : px >= p.sl) hit = [p.sl, 'Stop loss hit']; else if (p.tp != null && (p.side > 0 ? px >= p.tp : px <= p.tp)) hit = [p.tp, 'Target hit']; }
      if (hit) closePos(p.id, hit[0], hit[1]); else { p.lastChk = now() - 60; }
    }
    saveBook();
  }
  function renderBook(mk) {
    const st = S[mk], f = st.ui; if (!f) return;
    const open = BOOK.pos.reduce((s, p) => { const px = displayPrice(p.mk); return s + (px == null ? 0 : pnlOf(p, px)); }, 0);
    f.acct.innerHTML = `Balance <b>${usd(BOOK.balance)}</b> · Equity <b>${usd(BOOK.balance + open)}</b> · Open <b class="${open >= 0 ? 'pos' : 'neg'}">${open >= 0 ? '+' : '-'}${usd(Math.abs(open))}</b>`;
    const P = BOOK.pos.filter(p => p.mk === mk), H = BOOK.hist.filter(p => p.mk === mk).slice(0, 15), U = UNIT[mk];
    f.openTbl.innerHTML = P.length ? `<thead><tr><th>Opened</th><th>Side</th><th>Size</th><th>Entry</th><th>Now</th><th>Stop</th><th>Target</th><th>P&amp;L</th><th></th></tr></thead><tbody>${P.map(p => { const px = displayPrice(mk), v = px == null ? 0 : pnlOf(p, px); return `<tr><td>${when(p.openedAt)}</td><td><span class="tag" data-tone="${p.side > 0 ? 'green' : 'red'}">${p.side > 0 ? 'BUY' : 'SELL'}</span></td><td>${p.qty} ${U.name}</td><td>${money(p.entry, mk)}</td><td>${money(px, mk)}</td><td>${money(p.sl, mk)}${p.trail ? ' <span class="muted">trailing</span>' : ''}</td><td>${p.tp == null ? '-' : money(p.tp, mk)}</td><td class="${v >= 0 ? 'pos' : 'neg'}">${v >= 0 ? '+' : '-'}${usd(Math.abs(v))}</td><td><button type="button" class="btn ghost" data-close="${p.id}">Close</button></td></tr>`; }).join('')}</tbody>`
      : `<tbody><tr><td class="empty">No open demo trades on ${MK[mk].name}. Use "Place a demo trade" on the right.</td></tr></tbody>`;
    f.histTbl.innerHTML = H.length ? `<thead><tr><th>Closed</th><th>Side</th><th>Size</th><th>Entry</th><th>Exit</th><th>Why</th><th>Result</th></tr></thead><tbody>${H.map(p => `<tr><td>${when(p.closedAt)}</td><td><span class="tag" data-tone="${p.side > 0 ? 'green' : 'red'}">${p.side > 0 ? 'BUY' : 'SELL'}</span></td><td>${p.qty} ${U.name}</td><td>${money(p.entry, mk)}</td><td>${money(p.exit, mk)}</td><td class="muted">${p.reason}</td><td class="${p.pnl >= 0 ? 'pos' : 'neg'}">${p.pnl >= 0 ? '+' : '-'}${usd(Math.abs(p.pnl))}${p.r != null ? ` <span class="muted">${p.r >= 0 ? '+' : ''}${p.r.toFixed(2)}R</span>` : ''}</td></tr>`).join('')}</tbody>`
      : `<tbody><tr><td class="empty">Closed trades show up here with their result.</td></tr></tbody>`;
    if (st.chart) st.chart.setPositions(P.map(p => ({ side: p.side, entry: p.entry, sl: p.sl, tp: p.tp, label: `${p.side > 0 ? 'Long' : 'Short'} ${p.qty}` })));
    updateTicket(mk);
  }


  /* ---------------- auto-trader: bots that trade practice accounts by themselves ---------------- */
  // A bot takes every signal its strategy gives on live candles, from its start time on. The engine re-runs on the
  // real candle history each time the site opens, so trades that happened while the site was closed are filled in.
  const BOT_DEF = [
    { id: 'goldQB', mk: 'gold', sid: 'quiet', name: 'Gold · Quiet Breakout', style: 'Longer trades', res: 'goldQuiet', tone: 'green', note: 'The strategy that held up over 5 years. A few trades a week, and winners are left to run.' },
    { id: 'goldTrend', mk: 'gold', sid: 'trend', name: 'Gold · Trend', style: 'Long trades', res: 'goldTrend', tone: 'green', note: '4-hour breakouts, buys only, held for days. Held up over 5 years, mostly thanks to 2025.' },
    { id: 'goldLondon', mk: 'gold', sid: 'london', name: 'Gold · London Breakout', style: 'Small trades', res: 'goldLondon', tone: 'yellow', note: 'The YouTube favourite: trade the break of the Asian range, with the trend. Up to one trade a day, closed by 2 PM. A weak edge.' },
    { id: 'goldICC', mk: 'gold', sid: 'icc', name: 'Gold · ICC', style: 'Small trades', res: 'goldIcc', tone: 'red', note: '15-minute entries with a 2R target. It lost money in the 5-year test, so this shows how it does live.' },
    { id: 'btcTrend', mk: 'btc', sid: 'trend', name: 'Bitcoin · Trend Rider', style: 'Long trades', res: 'btcTrend', tone: 'green', note: 'Replaces ICC on Bitcoin. Buys 4-hour breakouts in uptrends and rides them for days or weeks. Held up over 5 years.' },
    { id: 'btcBB', mk: 'btc', sid: 'bb', name: 'Bitcoin · Bollinger', style: 'Faster trades', res: 'btcBB', tone: 'yellow', note: '1-hour breakouts with a 2R target. Practice only: it only made money with very low fees in testing.' }
  ];
  const BACKFILL = 30 * 86400;
  const BOTS = ls.get('v2_bots', {}) || {};
  for (const d of BOT_DEF) if (!BOTS[d.id]) BOTS[d.id] = { start: Math.floor(now() - BACKFILL), seed: 10000, pauses: [], trades: {}, backfilled: true };
  const saveBots = () => ls.set('v2_bots', BOTS);
  const botOn = B => !B.pauses.some(p => p[1] == null);
  const pausedAt = (B, t) => B.pauses.some(([x, y]) => t >= x && (y == null || t < y));
  function syncBots(mk) {
    let changed = false;
    for (const d of BOT_DEF) {
      if (d.mk !== mk) continue;
      const B = BOTS[d.id], r = S[mk].out[d.sid]; if (!r) continue;
      for (const t of r.trades) {
        if (t.t < B.start || pausedAt(B, t.t)) continue;
        const k = t.t + '|' + t.d, old = B.trades[k];
        const rec = { t: t.t, d: t.d, e: t.e, stop: t.stop, tgt: t.tgt == null ? null : t.tgt, risk: t.risk, R: t.R == null ? null : +t.Rf.toFixed(4), exit: t.exit == null ? null : t.exit, exitT: t.exitT || null, res: t.res, liveStop: t.liveStop == null ? null : t.liveStop, tf: t.tf };
        if (!old || old.R !== rec.R || old.liveStop !== rec.liveStop || old.exit !== rec.exit) {
          if (!old && !S[mk].botFirst && now() - t.t < t.tf * 2 + 300) { toast(`Auto-trader: ${d.name} ${t.d === 1 ? 'bought' : 'sold'}`, `Entry ${money(t.e + off(mk), mk)}, stop ${money(t.stop + off(mk), mk)}. Practice money.`); if (window.Coach) Coach.botSays(d.name + ' bot', `I just ${t.d === 1 ? 'bought' : 'sold'} at ${money(t.e + off(mk), mk)}. Stop ${money(t.stop + off(mk), mk)}${t.tgt != null ? `, target ${money(t.tgt + off(mk), mk)}` : ', no fixed target'}. ${t.why || ''}`, t.d === 1 ? 'green' : 'red'); }
          if (old && old.R == null && rec.R != null && !S[mk].botFirst) { toast(`Auto-trader: ${d.name} closed a trade`, `${rec.R >= 0 ? '+' : ''}${rec.R.toFixed(2)}R (${rec.res}).`); if (window.Coach) Coach.botSays(d.name + ' bot', `Closed my trade: ${rec.R >= 0 ? '+' : ''}${rec.R.toFixed(2)}R (${rec.res}).`, rec.R >= 0 ? 'green' : 'red'); }
          B.trades[k] = rec; changed = true;
        }
      }
      const ks = Object.keys(B.trades); if (ks.length > 400) ks.sort((x, y) => B.trades[x].t - B.trades[y].t).slice(0, ks.length - 400).forEach(k => delete B.trades[k]);
    }
    S[mk].botFirst = false;
    if (changed) saveBots();
  }
  // money: each trade risks 1% of the bot's balance when it opens; the result in R (after costs) turns into dollars
  function botBook(d) {
    const B = BOTS[d.id], list = Object.values(B.trades).sort((x, y) => x.t - y.t), o = off(d.mk);
    let bal = B.seed, wins = 0, open = null; const rows = [], curve = [bal];
    for (const x of list) {
      const riskUsd = bal * 0.01, units = riskUsd / x.risk;
      if (x.R == null) { open = Object.assign({ riskUsd, units }, x); continue; }
      const pnl = x.R * riskUsd; bal += pnl; if (pnl > 0) wins++;
      rows.push(Object.assign({ riskUsd, units, pnl }, x)); curve.push(bal);
    }
    let upnl = 0; const px = displayPrice(d.mk);
    if (open && px != null) upnl = (px - o - open.e) * open.d / open.risk * open.riskUsd;
    return { bal, eq: bal + upnl, upnl, rows, open, curve, wins, n: rows.length, o, B };
  }
  /* ---------------- Autopilot: the desk trades YOUR demo account by itself (only strategies you switch on) ---------------- */
  // It mirrors the engine: same entry candle, same stop, same exit. You can still trade by hand next to it.
  const AUTO_STRATS = [['gold', 'quiet', 'Gold · Quiet Breakout', true], ['gold', 'trend', 'Gold · Trend (4h)', true], ['btc', 'trend', 'Bitcoin · Trend Rider', true], ['gold', 'london', 'Gold · London Breakout (weak edge)', false], ['gold', 'icc', 'Gold · ICC (lost money in tests)', false], ['btc', 'bb', 'Bitcoin · Bollinger (practice)', false]];
  const AUTO = Object.assign({ on: false, since: 0, strats: Object.fromEntries(AUTO_STRATS.map(([m, s, , d]) => [m + ':' + s, d])), log: [] }, ls.get('v2_auto', {}));
  const saveAuto = () => ls.set('v2_auto', AUTO);
  function autoLog(msg, tone) { AUTO.log.unshift({ t: Math.floor(now()), msg, tone: tone || 'grey' }); AUTO.log = AUTO.log.slice(0, 60); saveAuto(); if (window.Coach) Coach.botSays('Autopilot', msg, tone); }
  function autopilot(mk) {
    const o = off(mk); let changed = false;
    // manage what autopilot already holds: follow the engine's stop, close when the engine closes
    for (const p of BOOK.pos.slice()) {
      if (!p.auto || p.mk !== mk) continue;
      const r = S[mk].out[p.auto.sid]; if (!r) continue;
      const t = r.trades.find(x => x.t === p.auto.t && x.d === p.side);
      if (!t) continue;
      if (t.R != null) { closePos(p.id, t.exit + o, `Autopilot: ${t.res}`); changed = true; continue; }
      const ns = (t.liveStop != null ? t.liveStop : t.stop) + o;
      if (p.side > 0 ? ns > p.sl + 1e-9 : ns < p.sl - 1e-9) { p.sl = r2(ns, mk === 'btc' ? 0 : 2); changed = true; }
    }
    if (AUTO.on) for (const sd of MK[mk].strats) {
      if (!AUTO.strats[mk + ':' + sd.id]) continue;
      const r = S[mk].out[sd.id]; if (!r) continue;
      const t = r.trades.find(x => x.R == null); if (!t) continue;
      const key = `${mk}|${sd.id}|${t.t}`;
      if (t.t < AUTO.since || now() - t.t > t.tf + 900) continue;               // only fresh signals, seen live after you switched it on
      if (BOOK.pos.some(p => p.auto && p.auto.key === key) || BOOK.hist.some(p => p.auto && p.auto.key === key)) continue;
      if (MK[mk].gold && Engine.goldClosed(now())) continue;
      const px = displayPrice(mk); if (px == null) continue;
      const sl = (t.liveStop != null ? t.liveStop : t.stop) + o; if ((sl - px) * t.d >= 0) continue;
      const U = UNIT[mk], q = Math.max(U.step, Math.floor(BOOK.balance * SET.risk / 100 / Math.abs(px - sl) / U.mult / U.step) * U.step);
      const pos = { id: Date.now() + Math.floor(Math.random() * 1000), mk, side: t.d, qty: +q.toFixed(U.dp), entry: px, sl: r2(sl, mk === 'btc' ? 0 : 2), sl0: r2(sl, mk === 'btc' ? 0 : 2), tp: t.tgt == null ? null : r2(t.tgt + o, mk === 'btc' ? 0 : 2), trail: false, openedAt: now(), lastChk: now(),
        auto: { key, sid: sd.id, t: t.t, name: sd.name }, why: t.why, ctx: ctxOf(mk) };
      BOOK.pos.push(pos); changed = true;
      autoLog(`${t.d > 0 ? 'Bought' : 'Sold'} ${pos.qty} ${U.name} ${MK[mk].name} at ${money(px, mk)} for ${sd.name}. Stop ${money(pos.sl, mk)}${pos.tp != null ? ', target ' + money(pos.tp, mk) : ', the exit follows the strategy'}.`, t.d > 0 ? 'green' : 'red');
      toast(`Autopilot ${t.d > 0 ? 'BUY' : 'SELL'}: ${MK[mk].name}`, `${sd.name} at ${money(px, mk)}, stop ${money(pos.sl, mk)}. Practice money.`); beep();
    }
    if (changed) { saveBook(); renderBook(mk); }
  }
  // what the desk was saying when a trade was opened (the coach uses it to review your trades)
  function ctxOf(mk) {
    const main = MK[mk].strats.find(s => s.main), r = S[mk].out[main.id], sx = (r && r.state) || {}, z = Engine.tz(now());
    return { word: status(mk).word, up: mk === 'gold' ? !!sx.up : !!sx.up, calm: sx.calm, atr: atrNow(mk), news: !!newsAt(z.m), m: z.m, wd: z.wd };
  }
  function renderAuto() {
    const el = $('#autoCard'); if (!el) return;
    $('#autoOn').checked = AUTO.on;
    $('#autoState').textContent = AUTO.on ? `On since ${whenS(AUTO.since)}. It trades your demo account by itself while this page is open.` : 'Off. Switch it on and the desk will place the trades for you.';
    $('#autoState').dataset.tone = AUTO.on ? 'green' : 'grey';
    $('#autoList').innerHTML = AUTO_STRATS.map(([m, sid, name]) => { const k = m + ':' + sid, sd = MK[m].strats.find(x => x.id === sid), R = RES[sd.res] || {}; return `<label class="autorow"><input type="checkbox" data-k="${k}" ${AUTO.strats[k] ? 'checked' : ''}><span>${name}</span><span class="rchip ${R.R >= 0 ? 'pos' : 'neg'}">${R.R >= 0 ? '+' : ''}${R.R}R</span></label>`; }).join('');
    const mine = BOOK.hist.filter(p => p.auto), pnl = mine.reduce((s2, p) => s2 + p.pnl, 0), open = BOOK.pos.filter(p => p.auto).length;
    $('#autoStats').innerHTML = `<div><span>Autopilot trades</span><b>${mine.length}</b></div><div><span>Open now</span><b>${open}</b></div><div><span>Result</span><b class="${pnl >= 0 ? 'pos' : 'neg'}">${sgn(pnl)}</b></div>`;
    $('#autoLog').innerHTML = AUTO.log.length ? AUTO.log.slice(0, 8).map(l => `<li><time>${whenS(l.t)}</time><span data-tone="${l.tone}">${esc(l.msg)}</span></li>`).join('') : '<li class="muted">Nothing yet. Trades show up here the moment autopilot takes one.</li>';
    $$('[data-f="autoTag"]').forEach(t => { t.textContent = AUTO.on ? 'Autopilot on' : 'Autopilot off'; t.dataset.tone = AUTO.on ? 'green' : 'grey'; });
  }
  function bindAuto() {
    const el = $('#autoCard'); if (!el) return;
    $('#autoOn').addEventListener('change', e => { AUTO.on = e.target.checked; if (AUTO.on) AUTO.since = Math.floor(now()) - 60; saveAuto(); autoLog(AUTO.on ? 'Autopilot switched on. I\'ll take the next signals from the strategies you ticked.' : 'Autopilot switched off. Open trades it took stay open and keep following their exit rules.', AUTO.on ? 'green' : 'grey'); renderAuto(); });
    $('#autoList').addEventListener('change', e => { const k = e.target.dataset.k; if (!k) return; AUTO.strats[k] = e.target.checked; saveAuto(); renderAuto(); });
    $$('[data-f="autoTag"]').forEach(t => t.addEventListener('click', () => { location.hash = 'bots'; setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300); }));
  }

  const spark = (vals, w = 240, h = 48) => {
    if (vals.length < 2) vals = [vals[0] || 0, vals[0] || 0];
    const mn = Math.min(...vals), mx = Math.max(...vals), sp = mx - mn || 1;
    const pts = vals.map((v, i) => `${(i / (vals.length - 1) * w).toFixed(1)},${(h - 4 - (v - mn) / sp * (h - 8)).toFixed(1)}`).join(' ');
    const up = vals[vals.length - 1] >= vals[0];
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${up ? 'var(--up)' : 'var(--down)'}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
  };
  const pct = (x, s) => `${x >= 0 ? '+' : ''}${(x / s * 100).toFixed(2)}%`;
  const sgn = v => `${v >= 0 ? '+' : '-'}${usd(Math.abs(v))}`;

  function renderBots() {
    if (!$('#botGrid')) return;
    const books = BOT_DEF.map(d => [d, botBook(d)]);
    const tot = books.reduce((s, [, b]) => s + b.eq, 0), seed = books.reduce((s, [, b]) => s + b.B.seed, 0);
    const started = Math.min(...BOT_DEF.map(d => BOTS[d.id].start));
    $('#botSum').innerHTML = `<div><span class="eyebrow">All ${BOT_DEF.length} bots</span><b class="mono ${tot >= seed ? 'pos' : 'neg'}">${usd(tot)}</b><span class="small muted">${sgn(tot - seed)} (${pct(tot - seed, seed)}) since ${new Date(started * 1000).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}</span></div>
      <div><span class="eyebrow">Open trades</span><b class="mono">${books.filter(([, b]) => b.open).length}</b><span class="small muted">right now</span></div>
      <div><span class="eyebrow">Closed trades</span><b class="mono">${books.reduce((s, [, b]) => s + b.n, 0)}</b><span class="small muted">${books.some(([, b]) => b.B.backfilled) ? 'includes 30 days filled in from history' : ''}</span></div>`;
    $('#botGrid').innerHTML = books.map(([d, b]) => {
      const on = botOn(b.B), R = RES[d.res] || {};
      const st = b.open ? `<div class="botnow" data-tone="${b.open.d === 1 ? 'green' : 'red'}">In a <b>${b.open.d === 1 ? 'BUY' : 'SELL'}</b> since ${whenS(b.open.t)} at ${money(b.open.e + b.o, d.mk)} · stop ${money((b.open.liveStop ?? b.open.stop) + b.o, d.mk)}${b.open.tgt != null ? ` · target ${money(b.open.tgt + b.o, d.mk)}` : ' (trailing)'} · <b class="${b.upnl >= 0 ? 'pos' : 'neg'}">${sgn(b.upnl)}</b></div>`
        : `<div class="botnow" data-tone="grey">${on ? 'Watching for its next setup. It trades on its own when one appears.' : 'Paused. It is not taking new trades.'}</div>`;
      return `<div class="card bot reveal${on ? '' : ' off'}" data-bot="${d.id}">
        <div class="cardhead"><h2>${d.name}</h2><span class="tag" data-tone="${d.style === 'Small trades' ? 'blue' : 'green'}">${d.style}</span></div>
        <div class="botbal"><b class="mono">${usd(b.eq)}</b><span class="mono ${b.eq >= b.B.seed ? 'pos' : 'neg'}">${sgn(b.eq - b.B.seed)} · ${pct(b.eq - b.B.seed, b.B.seed)}</span></div>
        ${spark(b.curve.concat(b.open ? [b.eq] : []))}
        ${st}
        <div class="stats">
          <div><span>Trades</span><b>${b.n}</b></div>
          <div><span>Win rate</span><b>${b.n ? Math.round(b.wins / b.n * 100) + '%' : '-'}</b></div>
          <div><span>5-yr test</span><b class="${R.R >= 0 ? 'pos' : 'neg'}">${R.R >= 0 ? '+' : ''}${R.R}R</b></div>
        </div>
        <p class="note">${d.note}</p>
        <div class="tbtns"><button type="button" class="btn ghost" data-act="toggle">${on ? 'Pause' : 'Start again'}</button><button type="button" class="btn ghost" data-act="reset">Reset to $10,000</button></div>
      </div>`;
    }).join('');
    $$('.bot.reveal', $('#botGrid')).forEach(el => el.classList.add('shown'));
    // leaderboard
    const youRows = BOOK.hist.filter(p => !p.auto), youPnl = youRows.reduce((s, p) => s + p.pnl, 0), youW = youRows.filter(p => p.pnl > 0).length;
    const apRows = BOOK.hist.filter(p => p.auto), apPnl = apRows.reduce((s, p) => s + p.pnl, 0), apW = apRows.filter(p => p.pnl > 0).length;
    const cl = CALLS.filter(c => c.status === 'closed'), cR = cl.reduce((s, c) => s + c.R, 0), cW = cl.filter(c => c.R > 0).length;
    const lines = books.map(([d, b]) => ({ who: d.name, tag: 'Bot', pnl: b.eq - b.B.seed, n: b.n, w: b.wins }))
      .concat([{ who: 'You', tag: 'Manual', pnl: youPnl, n: youRows.length, w: youW }, { who: 'Autopilot (your account)', tag: 'Auto', pnl: apPnl, n: apRows.length, w: apW }, { who: 'Telegram calls', tag: 'Scott', pnl: cR * riskUSD(), n: cl.length, w: cW }])
      .sort((x, y) => y.pnl - x.pnl);
    $('#board').innerHTML = `<thead><tr><th>#</th><th>Who</th><th>Result</th><th>Trades</th><th>Win rate</th></tr></thead><tbody>${lines.map((l, i) => `<tr><td>${i + 1}</td><td>${l.who} <span class="tag" data-tone="${l.tag === 'Bot' ? 'grey' : l.tag === 'Manual' ? 'blue' : 'yellow'}">${l.tag}</span></td><td class="${l.pnl >= 0 ? 'pos' : 'neg'}">${sgn(l.pnl)}</td><td>${l.n}</td><td>${l.n ? Math.round(l.w / l.n * 100) + '%' : '-'}</td></tr>`).join('')}</tbody>`;
    // every bot trade
    const all = books.flatMap(([d, b]) => b.rows.map(x => [d, b, x]).concat(b.open ? [[d, b, Object.assign({ pnl: null }, b.open)]] : [])).sort((x, y) => y[2].t - x[2].t).slice(0, 60);
    $('#botLog').innerHTML = all.length ? `<thead><tr><th>When</th><th>Bot</th><th>Side</th><th>Size</th><th>Entry</th><th>Stop</th><th>Exit</th><th>Result</th></tr></thead><tbody>${all.map(([d, b, x]) => `<tr><td>${when(x.t)}</td><td>${d.name}</td><td><span class="tag" data-tone="${x.d === 1 ? 'green' : 'red'}">${x.d === 1 ? 'BUY' : 'SELL'}</span></td><td>${d.mk === 'gold' ? (x.units / 100).toFixed(2) + ' lots' : x.units.toFixed(4) + ' BTC'}</td><td>${money(x.e + b.o, d.mk)}</td><td>${money(x.stop + b.o, d.mk)}</td><td>${x.exit == null ? '<span class="tag" data-tone="blue">open</span>' : money(x.exit + b.o, d.mk) + ` <span class="muted">${x.res}</span>`}</td><td class="${x.pnl == null ? '' : x.pnl >= 0 ? 'pos' : 'neg'}">${x.pnl == null ? sgn(b.upnl) + ' <span class="muted">so far</span>' : sgn(x.pnl) + ` <span class="muted">${x.R >= 0 ? '+' : ''}${x.R.toFixed(2)}R</span>`}</td></tr>`).join('')}</tbody>`
      : `<tbody><tr><td class="empty">No bot trades yet. They appear as soon as a strategy gives a signal.</td></tr></tbody>`;
    renderCalls(); renderAuto();
  }
  function bindBots() {
    $('#botGrid').addEventListener('click', e => {
      const b = e.target.closest('[data-act]'), card = e.target.closest('[data-bot]'); if (!b || !card) return;
      const B = BOTS[card.dataset.bot];
      if (b.dataset.act === 'toggle') { if (botOn(B)) B.pauses.push([Math.floor(now()), null]); else B.pauses[B.pauses.length - 1][1] = Math.floor(now()); }
      if (b.dataset.act === 'reset') {
        if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Tap again to reset'; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'Reset to $10,000'; } }, 3000); return; }
        BOTS[card.dataset.bot] = { start: Math.floor(now()), seed: 10000, pauses: [], trades: {}, backfilled: false };
      }
      saveBots(); for (const mk of Object.keys(MK)) syncBots(mk); renderBots();
    });
  }

  /* ---------------- Telegram calls (Scott) ---------------- */
  const CALLS = ls.get('v2_calls', []) || [];
  const saveCalls = () => ls.set('v2_calls', CALLS);
  function parseCall(txt) {
    const T = txt.replace(/,(?=\d{3}\b)/g, '').replace(/\s+/g, ' ');
    const num = s => s == null ? null : parseFloat(s);
    const out = { mk: /\b(btc|bitcoin|xbt)\b/i.test(T) ? 'btc' : /\b(xau|gold)/i.test(T) ? 'gold' : null, side: null, entry: null, sl: null, tps: [] };
    const sideM = T.match(/\b(buy|long|sell|short)\b/i); if (sideM) out.side = /buy|long/i.test(sideM[1]) ? 1 : -1;
    const slM = T.match(/\b(?:sl|s\/l|stop\s*loss|stop)\b\s*[:@=\-]?\s*(\d+(?:\.\d+)?)/i); if (slM) out.sl = num(slM[1]);
    const re = /\b(?:tp\s*\d?|t\/p\s*\d?|take\s*profit\s*\d?|target\s*\d?)\b\s*[:@=\-]?\s*(\d+(?:\.\d+)?)/gi; let m;
    while ((m = re.exec(T))) out.tps.push(num(m[1]));
    const enM = T.match(/\b(?:entry|enter|@)\s*[:@=\-]?\s*(\d+(?:\.\d+)?)(?:\s*[-–\/]\s*(\d+(?:\.\d+)?))?/i) || T.match(/\b(?:buy|long|sell|short)\b(?:\s+(?:xauusd|xau\/usd|gold|btcusd|btc|bitcoin|now|limit|stop|at|from|zone|@|:|-))*\s*(\d+(?:\.\d+)?)(?:\s*[-–\/]\s*(\d+(?:\.\d+)?))?/i);
    if (enM) { const a1 = num(enM[1]), a2 = num(enM[2]); out.entry = a2 ? (a1 + a2) / 2 : a1; }
    const big = v => v != null && v > 100;
    if (!big(out.entry)) out.entry = null; if (!big(out.sl)) out.sl = null; out.tps = out.tps.filter(big);
    if (/\bnow\b|\bmarket\b|\bcmp\b/i.test(T) && out.entry == null) out.entry = null;
    return out;
  }
  function bindCalls() {
    const fill = () => {
      const p = parseCall($('#callText').value);
      if (p.mk) $('#cMk').value = p.mk; if (p.side) $('#cSide').value = String(p.side);
      $('#cEntry').value = p.entry ?? ''; $('#cSL').value = p.sl ?? ''; $('#cTP').value = p.tps[0] ?? '';
      const miss = [!p.side && 'buy or sell', !p.sl && 'stop loss', !p.tps.length && 'take profit'].filter(Boolean);
      $('#cMsg').textContent = miss.length ? `I couldn't find the ${miss.join(', ')} in the message. Fill ${miss.length > 1 ? 'them' : 'it'} in, then tap "Track this call".` : `Read it: ${p.side > 0 ? 'BUY' : 'SELL'} ${p.mk === 'btc' ? 'Bitcoin' : 'gold'}${p.entry ? ' at ' + p.entry : ' at the live price'}, SL ${p.sl}, TP ${p.tps.join(' / ')}. ${p.tps.length > 1 ? 'Tracking the first take profit. ' : ''}Check the numbers, then tap "Track this call".`;
      $('#cMsg').classList.remove('err');
    };
    $('#cParse').addEventListener('click', fill);
    $('#callText').addEventListener('paste', () => setTimeout(fill, 0));
    $('#cTrack').addEventListener('click', () => {
      const mk = $('#cMk').value, d = +$('#cSide').value, en = $('#cEntry').value === '' ? null : +$('#cEntry').value, sl = +$('#cSL').value, tp = +$('#cTP').value, px = displayPrice(mk);
      const err = m => { $('#cMsg').textContent = m; $('#cMsg').classList.add('err'); };
      const ref = en ?? px;
      if (ref == null) return err('No live price yet. Give it a second and try again.');
      if (!sl || (sl - ref) * d >= 0) return err(d > 0 ? 'For a buy, the stop loss must be below the entry.' : 'For a sell, the stop loss must be above the entry.');
      if (!tp || (tp - ref) * d <= 0) return err(d > 0 ? 'For a buy, the take profit must be above the entry.' : 'For a sell, the take profit must be below the entry.');
      const fillNow = en == null || Math.abs(en - px) / px < 0.0015;
      CALLS.unshift({ id: Date.now(), mk, side: d, entry: fillNow ? (en ?? px) : en, sl, tp, src: $('#cSrc').value.trim() || 'Telegram', text: $('#callText').value.slice(0, 300), created: now(), status: fillNow ? 'open' : 'pending', filledAt: fillNow ? now() : null, lastChk: now() });
      saveCalls(); $('#cMsg').classList.remove('err');
      $('#cMsg').textContent = fillNow ? 'Tracking it. It filled at ' + money(en ?? px, mk) + '.' : `Tracking it. It's waiting for price to reach ${money(en, mk)} (it cancels after 24 hours if it never gets there).`;
      $('#callText').value = ''; renderBots();
    });
    $('#cClear').addEventListener('click', () => { for (let i = CALLS.length - 1; i >= 0; i--) if (CALLS[i].status === 'closed' || CALLS[i].status === 'expired') CALLS.splice(i, 1); saveCalls(); renderBots(); });
    $('#callTbl').addEventListener('click', e => { const b = e.target.closest('[data-cclose]'); if (!b) return; const c = CALLS.find(x => x.id === +b.dataset.cclose); if (c) finishCall(c, displayPrice(c.mk), 'Closed by you'); renderBots(); });
  }
  function finishCall(c, px, why) {
    if (px == null) return;
    if (c.status === 'pending') { c.status = 'expired'; c.reason = why; saveCalls(); return; }
    c.status = 'closed'; c.exit = px; c.R = (px - c.entry) * c.side / Math.abs(c.entry - c.sl); c.reason = why; c.closedAt = now(); saveCalls();
    toast(`Telegram call closed: ${c.R >= 0 ? '+' : ''}${c.R.toFixed(2)}R`, `${MK[c.mk].name} ${c.side > 0 ? 'buy' : 'sell'} from ${c.src}: ${why.toLowerCase()} at ${money(px, c.mk)}.`);
  }
  function checkCalls() {
    let ch = false;
    for (const c of CALLS) {
      if (c.status !== 'pending' && c.status !== 'open') continue;
      const st = S[c.mk]; if (!st.s15.bars.length) continue;
      const o = off(c.mk), px = displayPrice(c.mk);
      const bars = st.s15.bars.filter(b => b.t + 900 > c.lastChk).map(b => ({ h: b.h + o, l: b.l + o }));
      if (px != null) bars.push({ h: px, l: px });
      for (const b of bars) {
        if (c.status === 'pending') {
          if (b.l <= c.entry && b.h >= c.entry) { c.status = 'open'; c.filledAt = now(); ch = true; }
          else continue;
        }
        if (c.side > 0 ? b.l <= c.sl : b.h >= c.sl) { finishCall(c, c.sl, 'Stop loss hit'); ch = true; break; }
        if (c.side > 0 ? b.h >= c.tp : b.l <= c.tp) { finishCall(c, c.tp, 'Take profit hit'); ch = true; break; }
      }
      if (c.status === 'pending' && now() - c.created > 86400) { c.status = 'expired'; c.reason = 'Price never reached the entry'; ch = true; }
      if (c.status === 'pending' || c.status === 'open') c.lastChk = now() - 60;
    }
    saveCalls(); if (ch && current === 'bots') renderBots();
  }
  function renderCalls() {
    const t = $('#callTbl'); if (!t) return;
    t.innerHTML = CALLS.length ? `<thead><tr><th>Sent</th><th>From</th><th>Market</th><th>Side</th><th>Entry</th><th>Stop</th><th>Target</th><th>Status</th><th>Result</th><th></th></tr></thead><tbody>${CALLS.slice(0, 40).map(c => {
      const px = displayPrice(c.mk), live = c.status === 'open' && px != null ? (px - c.entry) * c.side / Math.abs(c.entry - c.sl) : null;
      const r = c.status === 'closed' ? c.R : live;
      const stTag = { pending: ['blue', 'waiting for entry'], open: ['blue', 'open'], closed: [c.R >= 0 ? 'green' : 'red', c.R >= 0 ? 'won' : 'lost'], expired: ['grey', 'never filled'] }[c.status];
      return `<tr title="${esc(c.text || '')}"><td>${when(c.created)}</td><td>${esc(c.src)}</td><td>${MK[c.mk].name}</td><td><span class="tag" data-tone="${c.side > 0 ? 'green' : 'red'}">${c.side > 0 ? 'BUY' : 'SELL'}</span></td><td>${money(c.entry, c.mk)}</td><td>${money(c.sl, c.mk)}</td><td>${money(c.tp, c.mk)}</td><td><span class="tag" data-tone="${stTag[0]}">${stTag[1]}</span></td><td class="${r == null ? '' : r >= 0 ? 'pos' : 'neg'}">${r == null ? '-' : `${r >= 0 ? '+' : ''}${r.toFixed(2)}R <span class="muted">${sgn(r * riskUSD())}${c.status === 'open' ? ' so far' : ''}</span>`}</td><td>${c.status === 'open' || c.status === 'pending' ? `<button type="button" class="btn ghost" data-cclose="${c.id}">${c.status === 'open' ? 'Close' : 'Cancel'}</button>` : ''}</td></tr>`;
    }).join('')}</tbody>` : `<tbody><tr><td class="empty">No calls tracked yet. Paste one of Scott's Telegram calls above.</td></tr></tbody>`;
  }


  /* ---------------- chart scanner: one button, ranks every strategy for right now ---------------- */
  const sleepMs = ms => new Promise(r => setTimeout(r, ms));
  function sessionNow() {
    const t = now(), z = Engine.tz(t), gi = goldOpenInfo(t), m = z.m, news = newsAt(m);
    const name = !gi.open ? 'Gold closed' : m >= 180 && m < 480 ? 'London session' : m >= 480 && m < 720 ? 'London + New York overlap' : m >= 720 && m < 1020 ? 'New York afternoon' : 'Asia session';
    return { t, z, gi, m, news, name, busy: gi.open && m >= 180 && m < 1020, weekend: z.wd >= 5 };
  }
  function conditions(mk) {
    const st = S[mk], c = st.s1h.closed(), d = st.sD.closed(), U = Engine.util;
    if (c.length < 120 || d.length < 55) return null;
    const A = U.ema(U.trs(c), 14), A100 = U.ema(A, 100), atr = A[A.length - 1], ratio = atr / A100[A100.length - 1];
    const dc = d.map(x => x.c), s50 = U.sma(dc, 50), last = c[c.length - 1].c, d50 = s50[s50.length - 1];
    const day = c.slice(-24), hi = Math.max(...day.map(b => b.h)), lo = Math.min(...day.map(b => b.l)), first = day[0].o;
    const tr50 = U.sma(U.trs(c), 50), sideways = (hi - lo) <= 3.2 * tr50[tr50.length - 1] * 1.6;
    const LL10 = Math.min(...c.slice(-10).map(b => b.l)), HH10 = Math.max(...c.slice(-10).map(b => b.h));
    return { atr, ratio, vol: ratio <= 1 ? 'calm' : ratio <= 1.3 ? 'normal' : 'jumpy', up: last > d50, d50, last, chg: (last - first) / first * 100, hi, lo, sideways, LL10, HH10 };
  }
  function scanCandidates() {
    const ses = sessionNow(), out = [];
    const EDGE = { 'gold:quiet': 40, 'gold:trend': 28, 'gold:london': 16, 'gold:icc': 6, 'btc:trend': 36, 'btc:bb': 10 };
    for (const mk of Object.keys(MK)) {
      const st = S[mk], o = off(mk), C = conditions(mk), px = displayPrice(mk); if (!C || px == null) continue;
      const closed = MK[mk].gold && !ses.gi.open;
      for (const s of MK[mk].strats) {
        const r = st.out[s.id]; if (!r) continue;
        const live = r.trades.find(x => x.R == null), c = { mk, sid: s.id, name: s.name, mname: MK[mk].name, why: [], score: EDGE[mk + ':' + s.id] || 0, edge: RES[s.res] ? RES[s.res].R : null, practice: s.tone !== 'green' };
        const dp = mk === 'btc' ? 0 : 2, P = v => money(v, mk);
        if (live && now() - live.t < live.tf + 600) {
          const ls_ = (live.liveStop ?? live.stop) + o;
          Object.assign(c, { status: 'now', side: live.d, entry: px, entryText: `${live.d > 0 ? 'BUY' : 'SELL'} now, near ${P(px)}`, stop: ls_, tgt: live.tgt == null ? null : live.tgt + o, trail: live.tgt == null });
          c.head = `Signal just fired at the ${hm(live.t)} close.`; c.why.push(live.why);
          if (Math.abs(px - (live.e + o)) > 0.5 * live.risk) c.why.push('Price has already moved a fair way from the signal. If it is far past the entry, skip it rather than chase.');
        } else if (live) {
          Object.assign(c, { status: 'in', side: live.d, entry: live.e + o, stop: (live.liveStop ?? live.stop) + o, tgt: live.tgt == null ? null : live.tgt + o, trail: live.tgt == null });
          c.entryText = `Already in a ${live.d > 0 ? 'buy' : 'sell'} since ${whenS(live.t)} at ${P(live.e + o)}`;
          c.head = 'This strategy is already in a trade. If you are not in it, don\'t chase it. Wait for the next one.';
        } else if (s.id === 'quiet') {
          const sx = r.state || {}, L = (sx.up ? sx.hi : sx.lo) + o, dist = Math.abs(px - L) / C.atr;
          const side = sx.up ? 1 : -1, stop = L - side * 3 * C.atr;
          Object.assign(c, { side, entry: L, stop, tgt: null, trail: true, entryText: `${side > 0 ? 'BUY if' : 'SELL if'} a 1-hour candle closes ${side > 0 ? 'above' : 'below'} ${P(L)}` });
          if (sx.calm) { c.status = 'armed'; c.score += Math.max(0, 10 - 4 * dist); c.head = `Ready. Gold is calm and ${sx.up ? 'above' : 'below'} its 50-day average, so it's waiting for the breakout.`; }
          else { c.status = 'forming'; c.head = `Not yet. Gold is too jumpy (ATR ${P(C.atr)} vs normal ${P(C.atr / C.ratio)}). The strategy only trades breakouts that come out of a calm stretch.`; }
          c.why.push(`The trigger is ${dist.toFixed(1)} ATR away from the price now (${P(Math.abs(px - L))}).`);
        } else if (s.id === 'icc') {
          const v = r.state, z = ses.z, inWin = z.wd < 5 && z.m >= 480 && z.m < 960;
          if (!v) { c.status = 'none'; c.head = 'No 4-hour break to trade, so there\'s no ICC pattern right now.'; }
          else if (v.phase === 'ready') {
            const stop = v.ph + o - v.d * 0.1 * v.atr, entry = v.piv + o, tgt = entry + v.d * 2 * Math.abs(entry - stop), withTrend = (v.d === 1) === C.up;
            Object.assign(c, { side: v.d, entry, stop, tgt, trail: false, entryText: `${v.d > 0 ? 'BUY if' : 'SELL if'} a 15-min candle closes ${v.d > 0 ? 'above' : 'below'} ${P(entry)}` });
            if (!withTrend) { c.status = 'none'; c.head = `An ICC pattern is ready, but it goes against the daily trend, so the filter would skip it.`; }
            else { c.status = 'armed'; c.head = `Ready. There was a 4-hour ${v.d > 0 ? 'break up' : 'break down'}, then a ${Math.round(v.ret * 100)}% pullback. Now it needs the continuation candle.`; if (!inWin) { c.score -= 8; c.why.push('ICC only enters between 8 AM and 4 PM on weekdays, so it will wait for that window.'); } }
          } else if (v.phase === 'correcting') { c.status = 'forming'; c.side = v.d; c.head = `Forming. There was a 4-hour ${v.d > 0 ? 'break up' : 'break down'} and price is pulling back (${Math.round(v.ret * 100)}% so far, needs 30%).`; }
          else { c.status = 'forming'; c.side = v.d; c.head = `Early. A 4-hour ${v.d > 0 ? 'break up' : 'break down'} just happened. Waiting for a pullback.`; }
        } else if (s.id === 'trend') {
          const sx = r.state || {}, entry = sx.hi, stop = sx.hi - 3 * (sx.atr || 0), dist = Math.abs(px - entry) / (sx.atr || C.atr);
          Object.assign(c, { side: 1, entry, stop, tgt: null, trail: true, exitLine: sx.lo, entryText: `BUY if a 4-hour candle closes above ${P(entry)}` });
          const nm = MK[mk].name, days = mk === 'gold' ? 'about 3-day' : '7-day';
          if (mk === 'gold') { c.entry = entry + o; c.stop = stop + o; c.exitLine = sx.lo + o; c.entryText = `BUY if a 4-hour candle closes above ${P(entry + o)}`; }
          if (sx.up) { c.status = 'armed'; c.score += Math.max(0, 10 - 3 * dist); c.head = `Ready. ${nm} is in an uptrend (above its 200-candle average), so it's waiting for a 4-hour close above the ${days} high.`; }
          else { c.status = 'none'; c.head = `Not now. ${nm} is below its 200-candle average (${P(sx.trend + o)}), and this strategy only buys in uptrends. Waiting on the sidelines is part of the plan.`; }
          c.why.push(`The trigger is ${dist.toFixed(1)} ATR (${P(Math.abs(px - entry))}) from the price now.`);
        } else if (s.id === 'london') {
          const sx = r.state || {}, z = ses.z;
          if (sx.hi == null) { c.status = 'none'; c.head = 'The Asian range has not formed yet. It builds from 8 PM to 2 AM.'; }
          else if (sx.building) { c.status = 'forming'; c.head = `The Asian range is building: ${P(sx.lo + o)} to ${P(sx.hi + o)}. Breakouts count from 2 AM.`; }
          else if (sx.done) { c.status = 'none'; c.head = sx.why === 'traded' ? 'Today\'s London breakout already happened. One trade a day.' : `No trade today: ${sx.why}.`; }
          else if (sx.window) {
            const side = sx.up ? 1 : -1, entry = (side > 0 ? sx.hi : sx.lo) + o, stop0 = (side > 0 ? sx.lo : sx.hi) + o, cap = entry * 0.006, stop = Math.abs(entry - stop0) > cap ? entry - side * cap : stop0;
            Object.assign(c, { status: 'armed', side, entry, stop, tgt: entry + side * 2.5 * Math.abs(entry - stop), trail: false, rr: '2.5R', entryText: `${side > 0 ? 'BUY if' : 'SELL if'} a 15-min candle closes ${side > 0 ? 'above' : 'below'} ${P(entry)}` });
            c.head = `Ready. The Asian range is ${P(sx.lo + o)} to ${P(sx.hi + o)}. With the trend ${side > 0 ? 'up' : 'down'}, only a ${side > 0 ? 'break above' : 'break below'} counts, until 10 AM.`;
            c.score += Math.max(0, 8 - 3 * Math.abs(px - entry) / C.atr);
          } else { c.status = 'none'; c.head = z.m >= 600 && z.m < 1200 ? 'The London window (2 AM to 10 AM) is over for today. Next range starts at 8 PM.' : 'Waiting for the next Asian range.'; }
          c.why.push('Weak edge: +23R over 5 years with the trend filter, but with a -33R drop on the way. Without the filter it lost money.');
        } else if (s.id === 'bb') {
          const sx = r.state || {};
          if (sx.trendUp || sx.trendDn) {
            const side = sx.trendUp ? 1 : -1, entry = side > 0 ? sx.up : sx.dn, stop = side > 0 ? C.LL10 - 0.1 * C.atr : C.HH10 + 0.1 * C.atr, tgt = entry + side * 2 * Math.abs(entry - stop);
            Object.assign(c, { status: 'armed', side, entry, stop, tgt, trail: false, entryText: `${side > 0 ? 'BUY if' : 'SELL if'} a 1-hour candle closes ${side > 0 ? 'above' : 'below'} ${P(entry)}` });
            c.head = `Ready. Bitcoin is in a ${side > 0 ? 'up' : 'down'}trend, so it's waiting for a close outside the Bollinger band.`;
            c.score += Math.max(0, 8 - 3 * Math.abs(px - entry) / C.atr);
          } else { c.status = 'none'; c.head = 'No clear trend (price is between the 200-hour and 9-day averages), so no Bollinger signal is possible.'; }
        }
        if (closed) { c.status = 'closed'; c.head = `Gold is closed until ${ses.gi.reopen} (Toronto time). For when it reopens: ${c.head ? c.head.charAt(0).toLowerCase() + c.head.slice(1) : ''}`; }
        c.score += { now: 45, armed: 22, in: 10, forming: 5, none: 0, closed: 0 }[c.status] || 0;
        if (c.status === 'closed' || c.status === 'none') c.score = Math.min(c.score, 8);
        if (mk === 'gold' && ses.busy) { c.score += 6; c.why.push(`It's the ${ses.name}, when gold moves the most.`); }
        if (ses.news) { c.score -= 15; c.why.push(`News time (${ses.news[2]}). Wait 15 minutes before entering.`); }
        if (mk === 'btc' && s.id === 'trend') c.why.push(`Held up over 5 years of testing (+${RES.btcTrend ? RES.btcTrend.R : 49}R after 0.1% fees, worst drop ${RES.btcTrend ? RES.btcTrend.dd : -6}R). It wins only about a third of the time, but the winners are big.`);
        if (mk === 'btc' && s.id === 'bb') c.why.push('Practice only. It lost money at normal 0.1% fees over 5 years.');
        if (mk === 'gold' && s.id === 'quiet') c.why.push('This is the only strategy that made money over 5 years of testing (+75R after costs, worst drop −8R).');
        if (mk === 'gold' && s.id === 'icc') c.why.push('Practice only. ICC lost money over 5 years, even with a trend filter.');
        if (mk === 'gold' && s.id === 'trend') c.why.push(`Held up over 5 years (+${RES.goldTrend ? RES.goldTrend.R : 23}R, worst drop ${RES.goldTrend ? RES.goldTrend.dd : -6.5}R), but most of it came in 2025's big rally.`);
        if (c.stop != null && c.entry != null) { const dist = Math.abs(c.entry - c.stop), U = UNIT[mk], q = Math.max(U.step, Math.floor(riskUSD() / dist / U.mult / U.step) * U.step); c.size = `${q.toFixed(U.dp)} ${U.name} risks about ${usd(q * dist * U.mult)}`; }
        c.score = Math.max(0, Math.min(100, Math.round(c.score)));
        out.push(c);
      }
    }
    return out.sort((x, y) => y.score - x.score);
  }
  const STATUS_TAG = { now: ['green', 'Trade now'], armed: ['yellow', 'Ready, waiting for trigger'], in: ['blue', 'Already in a trade'], forming: ['grey', 'Setting up'], none: ['grey', 'No setup'], closed: ['grey', 'Market closed'] };
  function scanCardHTML(c, best) {
    const P = v => money(v, c.mk), tag = STATUS_TAG[c.status];
    const exit = c.sid === 'london' ? `Take profit at ${P(c.tgt)} (2.5 × your risk), or close by 2 PM.` : c.sid === 'trend' ? `No fixed target. Sell when a 4-hour candle closes below the 3-day low${c.exitLine != null ? ` (now ${P(c.exitLine)})` : ''}. That line rises as price rises.` : c.trail ? 'No fixed target. The stop trails 3 × ATR behind the best 1-hour close. Close before 5 PM.' : c.tgt != null ? `Take profit at ${P(c.tgt)} (2 × your risk)` : '';
    const plan = c.entryText ? `<dl class="plan">
        <div><dt>${c.side > 0 ? 'Buy' : 'Sell'}</dt><dd>${c.entryText}</dd></div>
        ${c.stop != null ? `<div><dt>Stop loss</dt><dd>${P(c.stop)}</dd></div>` : ''}
        ${exit ? `<div><dt>Take profit</dt><dd>${exit}</dd></div>` : ''}
        ${c.size ? `<div><dt>Size (${SET.risk}%)</dt><dd>${c.size}</dd></div>` : ''}
      </dl>` : '';
    return `<div class="scard${best ? ' best' : ''}">
      <div class="scard-top">${best ? '<span class="tag" data-tone="yellow">Best right now</span>' : ''}<h3>${c.mname} · ${c.name}</h3><span class="tag" data-tone="${tag[0]}">${tag[1]}</span>${c.practice ? '<span class="tag" data-tone="grey">practice</span>' : ''}</div>
      <div class="meter" aria-label="Score ${c.score} out of 100"><i style="--w:${c.score / 100}"></i><b class="mono">${c.score}</b></div>
      <p class="shead">${esc(c.head || '')}</p>
      ${plan}
      ${c.why.length ? `<ul class="swhy">${c.why.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
      <div class="tbtns">${c.status === 'now' ? `<button type="button" class="btn primary" data-load="${c.mk}|${c.sid}">Load into a demo trade</button>` : ''}<a class="btn ghost" href="#${c.mk}" data-close>Open the ${c.mname} chart</a></div>
    </div>`;
  }
  let scanning = false, lastScan = [];
  async function runScan() {
    if (scanning) return; scanning = true;
    const sheet = $('#scanSheet'); sheet.hidden = false; requestAnimationFrame(() => sheet.classList.add('open'));
    document.body.classList.add('noscroll'); $$('[data-scan]').forEach(b => b.classList.add('busy'));
    const steps = ['Getting the newest candles for gold and Bitcoin', 'Checking the session, news times and whether gold is open', 'Reading gold: trend, how calm it is, breakout levels, ICC pattern', 'Reading Bitcoin: 4-hour trend, 7-day high, Bollinger bands', 'Ranking every strategy for right now'];
    const ol = $('#scanSteps'); ol.hidden = false; ol.innerHTML = steps.map((s, i) => `<li data-i="${i}"><i></i>${s}</li>`).join(''); $('#scanOut').innerHTML = '';
    const mark = (i, cls) => { const li = $(`[data-i="${i}"]`, ol); if (li) li.className = cls; };
    try {
      mark(0, 'on');
      for (let k = 0; k < 60 && !(S.gold.ready && S.btc.ready && S.btc.out.trend); k++) await sleepMs(500);
      await Promise.all([refresh(), refreshPrices(), sleepMs(500)]); mark(0, 'done');
      for (let i = 1; i < steps.length; i++) { mark(i, 'on'); await sleepMs(380); mark(i, 'done'); }
      lastScan = scanCandidates();
      const ses = sessionNow();
      $('#scanTime').textContent = `${dtClock.format(new Date()).replace(/\./g, '')} Toronto · ${ses.name}${ses.news ? ' · news time' : ''}`;
      const best = lastScan.find(c => c.status === 'now' || c.status === 'armed');
      const cond = ['gold', 'btc'].map(mk => { const C = conditions(mk); return C ? `<div><span class="eyebrow">${MK[mk].name}</span><b class="mono">${money(displayPrice(mk), mk)}</b><span class="small">${C.up ? 'Uptrend' : 'Downtrend'} (vs 50-day) · ${C.vol} · ${C.sideways ? 'moving sideways' : 'moving'} · <span class="${C.chg >= 0 ? 'pos' : 'neg'}">${C.chg >= 0 ? '+' : ''}${C.chg.toFixed(2)}% 24h</span></span></div>` : ''; }).join('');
      $('#scanOut').innerHTML = `<div class="scond">${cond}</div>
        ${best ? '' : `<div class="scard best wait"><div class="scard-top"><span class="tag" data-tone="yellow">Best right now</span><h3>Wait. Nothing is ready.</h3></div><p class="shead">No strategy has a setup that's ready right now. That's normal, because good setups don't show up every hour. Keep the site open and it will alert you when one does. The list below shows what each strategy is waiting for.</p></div>`}
        ${lastScan.map(c => scanCardHTML(c, c === best)).join('')}
        <p class="small muted snote">How the ranking works: each strategy gets points for how it did over 5 years of testing, how ready its setup is right now, and whether it's a good time of day. The scan can't see the future, and no setup wins every time. Use demo money.</p>`;
      $$('.scard', $('#scanOut')).forEach((el, i) => el.style.setProperty('--i', i));
      ol.hidden = true;
    } catch (e) { $('#scanOut').innerHTML = `<p class="tnote err">The scan couldn't get fresh data. Check your internet and try again.</p>`; }
    $$('[data-scan]').forEach(b => b.classList.remove('busy')); scanning = false;
  }
  function closeScan() { const s = $('#scanSheet'); s.classList.remove('open'); document.body.classList.remove('noscroll'); setTimeout(() => { s.hidden = true; }, 220); }
  function loadIntoTicket(mk, sid) {
    const c = lastScan.find(x => x.mk === mk && x.sid === sid); if (!c) return;
    closeScan(); location.hash = mk;
    setTimeout(() => {
      const f = S[mk].ui; $(`.sidesw [data-side="${c.side}"]`, f.trade).click();
      f.sl.value = (+c.stop).toFixed(mk === 'btc' ? 0 : 2); f.sl.dataset.auto = '0';
      f.tp.value = c.tgt != null ? (+c.tgt).toFixed(mk === 'btc' ? 0 : 2) : ''; f.trail.checked = !!c.trail && mk === 'gold';
      f.size1.click(); f.trade.scrollIntoView({ behavior: 'smooth', block: 'center' });
      f.tmsg.textContent = 'Loaded from the scan. Check the numbers, then press the button to place the demo trade.';
    }, 350);
  }
  function bindScan() {
    $$('[data-scan]').forEach(b => b.addEventListener('click', runScan));
    $('#scanSheet').addEventListener('click', e => {
      const l = e.target.closest('[data-load]'); if (l) { const [mk, sid] = l.dataset.load.split('|'); return loadIntoTicket(mk, sid); }
      if (e.target.closest('[data-close]')) closeScan();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#scanSheet').hidden) closeScan(); });
  }

  /* ---------------- Analyze: read the chart, draw on it, pick the best strategy for right now ---------------- */
  const TFN = { 900: '15-minute', 3600: '1-hour', 14400: '4-hour', 86400: 'daily' };
  function barsFor(mk) { const st = S[mk]; return st.tf === 900 ? st.s15.closed() : st.tf === 14400 ? h4Of(st.s1h.closed()) : st.tf === 86400 ? st.sD.closed() : st.s1h.closed(); }
  const FAILED = [['NY opening range breakout', 'NY ORB'], ['Liquidity sweep reversal (ICT)', 'Sweep'], ['EMA 9/21 crossover', 'EMA'], ['Bollinger + RSI reversal', 'BB+RSI'], ['Fair value gap retest (SMC)', 'FVG'], ['Supertrend', 'Supertrend']];
  function researchRow(name) { return (RES.research || []).find(r => r.name.startsWith(name)); }
  function buildAnalysis(mk) {
    const st = S[mk], o = off(mk), B = barsFor(mk), tf = st.tf;
    if (!st.ready || B.length < 120) return null;
    const R = Analyze.read(B, { gold: MK[mk].gold }), dp = mk === 'btc' ? 0 : 2, P = v => money(v, mk), px = displayPrice(mk) ?? (R.price + o), atr = R.atr;
    const all = scanCandidates(); lastScan = all;
    const cands = all.filter(c => c.mk === mk), isLive = c => ['now', 'armed', 'in'].includes(c.status);
    const best = cands.find(c => (c.status === 'now' || c.status === 'in') && !c.practice) || cands.find(c => isLive(c) && !c.practice) || cands.find(isLive)
      || cands.find(c => c.status === 'closed' && c.entry != null && !c.practice) || null;
    const A = { zones: [], lines: [], hlines: [], boxes: [], marks: [], swings: [], plan: null };
    for (const z of R.zones.above) A.zones.push({ top: z.top + o, bot: z.bot + o, color: 'down', label: `RESISTANCE · ${z.n} SWINGS`, t: B[Math.max(0, z.first - 3)].t });
    for (const z of R.zones.below) A.zones.push({ top: z.top + o, bot: z.bot + o, color: 'up', label: `SUPPORT · ${z.n} SWINGS`, t: B[Math.max(0, z.first - 3)].t });
    for (const l of R.trendlines) A.lines.push({ a: { t: l.a.t, p: l.a.p + o }, b: { t: l.b.t, p: l.b.p + o }, extend: true, color: l.top ? 'down' : 'up', label: l.top ? 'falling trend line' : 'rising trend line' });
    if (R.prevDay && tf < 86400) A.hlines.push({ p: R.prevDay.h + o, t: R.prevDay.t1, color: 'amber', dash: true, label: `YESTERDAY HIGH ${fmtN(R.prevDay.h + o, dp)}` }, { p: R.prevDay.l + o, t: R.prevDay.t1, color: 'amber', dash: true, label: `YESTERDAY LOW ${fmtN(R.prevDay.l + o, dp)}` });
    if (R.asia && tf <= 3600) A.boxes.push({ t1: R.asia.t1, t2: R.asia.t2 + tf, top: R.asia.h + o, bot: R.asia.l + o, color: 'amber', label: 'ASIAN RANGE' });
    A.swings = R.structure.labels.slice(-6).map(x => ({ t: x.t, p: x.p + o, text: x.text, top: x.top, color: x.text === 'HH' || x.text === 'HL' ? 'up' : 'down' }));
    const evName = n => ({ "yesterday's high": 'YDAY HIGH', "yesterday's low": 'YDAY LOW', 'Asian high': 'ASIA HIGH', 'Asian low': 'ASIA LOW', resistance: 'RESISTANCE', support: 'SUPPORT' }[n] || n.toUpperCase());
    A.marks = R.events.map(e => ({ t: e.t, p: e.p + o, up: e.d > 0, color: e.d > 0 ? 'up' : 'down', text: e.kind === 'sweep' ? `SWEEP · ${evName(e.level.name)}` : `BREAKOUT ${e.d > 0 ? '▲' : '▼'} ${evName(e.level.name)}` }));
    // the other strategies' triggers, as thin dashed lines
    for (const c of cands) if (c !== best && c.status === 'armed' && c.entry != null && Math.abs(c.entry - px) < 6 * atr)
      A.hlines.push({ p: c.entry, color: c.side > 0 ? 'up' : 'down', dash: true, w: 1, label: `${c.name.toUpperCase()}: ${c.side > 0 ? 'BUY ABOVE' : 'SELL BELOW'} ${fmtN(c.entry, dp)}` });
    if (best && best.entry != null && best.stop != null) {
      const rr = best.tgt != null ? (Math.abs(best.tgt - best.entry) / Math.abs(best.entry - best.stop)).toFixed(1) + 'R' : '';
      A.plan = { side: best.side, entry: best.entry, stop: best.stop, tgt: best.tgt, wait: best.status === 'armed' || best.status === 'closed', rr,
        note: best.sid === 'trend' ? `EXIT: 4H CLOSE BELOW ${fmtN(best.exitLine, dp)}` : best.trail ? 'NO TARGET · STOP TRAILS 3×ATR' : '' };
    }
    // trend + scenarios (chart-technical-analyst method: structure, averages, levels, then 3 scenarios that add up to 100%)
    const sc = (R.structure.trend === 'up' ? 1 : R.structure.trend === 'down' ? -1 : 0) + (R.maTrend === 'up' ? 1 : R.maTrend === 'down' ? -1 : 0);
    const res1 = R.zones.above[0], res2 = R.zones.above[1], sup1 = R.zones.below[0], sup2 = R.zones.below[1];
    const farA = R.zones.above.filter(z => z.bot + o > px + 0.5 * atr), farB = R.zones.below.filter(z => z.top + o < px - 0.5 * atr);
    const upT = farA[0] ? farA[0].bot + o : px + 2 * atr, upT2 = farA[1] ? farA[1].bot + o : upT + 2 * atr, dnT = farB[0] ? farB[0].top + o : px - 2 * atr, dnT2 = farB[1] ? farB[1].top + o : dnT - 2 * atr;
    const bull = 35 + 10 * sc, bear = 35 - 10 * sc, side = 100 - bull - bear;
    const scen = [
      { k: 'up', name: 'Goes up', prob: bull, text: `Pushes up to ${P(upT)}, then ${P(upT2)}.`, inv: `Wrong if a candle closes below ${P(dnT)}.` },
      { k: 'side', name: 'Moves sideways', prob: side, text: `Chops between ${P(dnT)} and ${P(upT)}.`, inv: 'Ends when a candle closes outside that box.' },
      { k: 'down', name: 'Goes down', prob: bear, text: `Drops to ${P(dnT)}, then ${P(dnT2)}.`, inv: `Wrong if a candle closes above ${P(upT)}.` }
    ].sort((a, b) => b.prob - a.prob);
    const trendTxt = R.structure.trend === 'up' ? 'higher highs and higher lows (an uptrend)' : R.structure.trend === 'down' ? 'lower highs and lower lows (a downtrend)' : 'mixed swings (no clear trend, more like a range)';
    const maTxt = R.maTrend === 'up' ? 'above its 50 and 200 averages, which point up' : R.maTrend === 'down' ? 'below its 50 and 200 averages, which point down' : 'tangled up with its 50 and 200 averages';
    const levels = [
      ...R.zones.above.map(z => ({ p: (z.top + z.bot) / 2 + o, lo: z.bot + o, hi: z.top + o, type: 'Resistance', tone: 'red', str: z.n >= 4 ? 'Strong' : z.n >= 3 ? 'Medium' : 'Light', note: `${z.n} swing points here. Sellers showed up before.` })),
      ...R.zones.below.map(z => ({ p: (z.top + z.bot) / 2 + o, lo: z.bot + o, hi: z.top + o, type: 'Support', tone: 'green', str: z.n >= 4 ? 'Strong' : z.n >= 3 ? 'Medium' : 'Light', note: `${z.n} swing points here. Buyers showed up before.` })),
      ...(R.prevDay ? [{ p: R.prevDay.h + o, type: "Yesterday's high", tone: 'yellow', str: 'Medium', note: 'Stops often sit just above it.' }, { p: R.prevDay.l + o, type: "Yesterday's low", tone: 'yellow', str: 'Medium', note: 'Stops often sit just below it.' }] : []),
      ...R.trendlines.map(l => ({ p: l.now + o, type: l.top ? 'Falling trend line' : 'Rising trend line', tone: l.top ? 'red' : 'green', str: l.touch >= 4 ? 'Strong' : 'Light', note: `Where the line is now. Touched about ${l.touch} times.` })),
      ...(R.asia && MK[mk].gold ? [{ p: R.asia.h + o, type: 'Asian high', tone: 'yellow', str: 'Light', note: 'London breakout level.' }, { p: R.asia.l + o, type: 'Asian low', tone: 'yellow', str: 'Light', note: 'London breakout level.' }] : [])
    ].sort((a, b) => b.p - a.p);
    return { mk, tf, A, R, best, cands, scen, trendTxt, maTxt, levels, px, sc, t: now(), o };
  }

  function verdictOf(an) {
    const b = an.best, P = v => money(v, an.mk);
    if (!b) return { word: 'Wait', tone: 'grey', line: `No strategy has a setup on ${MK[an.mk].name} right now. Good trades don't show up every hour.` };
    const side = b.side > 0 ? 'BUY' : 'SELL';
    if (b.status === 'now') return { word: `${side} now`, tone: b.side > 0 ? 'green' : 'red', line: `${b.name} just fired at the last candle close. ${b.practice ? 'This one is practice only.' : 'This strategy held up over 5 years.'}` };
    if (b.status === 'in') return { word: `In a ${side.toLowerCase()}`, tone: 'blue', line: `${b.name}${b.practice ? ' (practice only)' : ''} is already in a trade. If you missed it, wait for the next one rather than chasing.` };
    if (b.status === 'closed') return { word: `${side} ${b.side > 0 ? 'above' : 'below'} ${P(b.entry)}`, tone: 'grey', line: `Gold is closed right now. When it reopens, ${b.name} is set to ${side.toLowerCase()} if a 1-hour candle closes ${b.side > 0 ? 'above' : 'below'} ${P(b.entry)}. The levels may shift a little after the first candles.` };
    return { word: `${side} ${b.side > 0 ? 'above' : 'below'} ${P(b.entry)}`, tone: 'yellow', line: `Nothing to do yet. ${b.name} is ready and waiting for a ${b.sid === 'london' ? '15-minute' : b.sid === 'trend' ? '4-hour' : '1-hour'} candle to close ${b.side > 0 ? 'above' : 'below'} ${P(b.entry)}.` };
  }

  function reportHTML(an) {
    const mk = an.mk, P = v => money(v, mk), v = verdictOf(an), b = an.best, U = UNIT[mk];
    const rec = s => { const r = RES[s.res]; return r ? `<span class="rchip ${r.R >= 0 ? 'pos' : 'neg'}">${r.R >= 0 ? '+' : ''}${r.R}R in 5 yrs</span>` : ''; };
    const stratOf = c => MK[mk].strats.find(s => s.id === c.sid);
    const planBlock = b && b.entry != null ? `<dl class="plan">
        <div><dt>${b.side > 0 ? 'Buy' : 'Sell'}</dt><dd>${esc(b.entryText || '')}</dd></div>
        <div><dt>Stop loss</dt><dd>${P(b.stop)} <span class="muted">(${P(Math.abs(b.entry - b.stop))} away)</span></dd></div>
        <div><dt>Take profit</dt><dd>${b.sid === 'trend' ? `No fixed target. Sell on a 4-hour close below ${P(b.exitLine)}.` : b.trail ? 'No fixed target. The stop trails 3 × ATR behind the best close.' : b.tgt != null ? `${P(b.tgt)} <span class="muted">(${(Math.abs(b.tgt - b.entry) / Math.abs(b.entry - b.stop)).toFixed(1)} × your risk)</span>` : '-'}</dd></div>
        ${b.size ? `<div><dt>Size at ${SET.risk}%</dt><dd>${esc(b.size)}</dd></div>` : ''}
      </dl>` : '<p class="muted">No entry, stop or target yet, because nothing is set up. The lines on the chart show what to watch.</p>';
    const why = b ? [b.head, ...b.why].filter(Boolean) : [];
    const ranked = an.cands.map((c, i) => { const s = stratOf(c), tag = STATUS_TAG[c.status] || ['grey', c.status]; return `<li style="--i:${i}"><div class="rk-top"><b>${esc(c.name)}</b>${rec(s)}<span class="tag" data-tone="${tag[0]}">${tag[1]}</span>${c.practice ? '<span class="tag" data-tone="grey">practice</span>' : ''}</div><div class="meter"><i style="--w:${c.score / 100}"></i><b class="mono">${c.score}</b></div><p>${esc(c.head || '')}</p></li>`; }).join('');
    const failed = FAILED.map(([n, sh]) => { const r = researchRow(n); return r ? `<li><b>${esc(n)}</b><span class="rchip neg">${r.R}R</span><span class="muted small">${r.n} trades, ${r.win}% wins</span></li>` : ''; }).join('');
    const legend = [
      ['up', 'Green band', 'Support: a price where buyers stepped in at least twice. Price often bounces here, and a clean break below it is bearish.'],
      ['down', 'Red band', 'Resistance: a price where sellers stepped in. Price often stalls here, and a clean break above it is bullish.'],
      ['amber', 'Yellow dashed lines', "Yesterday's high and low. Big players' stop orders sit just past them, so price often pokes through them (a sweep) or breaks out from them."],
      ['amber', 'Yellow box', MK[mk].gold ? 'The Asian range (8 PM to 2 AM). The London Breakout trades the first clean break of this box.' : 'Ranges where price moved sideways.'],
      ['up', 'Slanted lines', 'Trend lines join two swing points. Price riding along one shows the trend. A close through it is an early warning.'],
      ['ink', 'HH · HL · LH · LL', 'Market structure. Higher highs and higher lows = uptrend. Lower highs and lower lows = downtrend.'],
      ['ink', 'Box on the right', 'The plan from the best strategy: entry line, red = what you risk, green = what you aim for. Dashed means "only if the trigger happens".']
    ].map(([c, t, d]) => `<li><i class="sw" data-c="${c}"></i><div><b>${t}</b><span>${d}</span></div></li>`).join('');
    return `<div class="rep-head">
        <div><span class="eyebrow">Analysis · ${MK[mk].name} · ${TFN[an.tf]} chart · ${hm(an.t)}</span>
        <h2 class="verdict" data-tone="${v.tone}">${esc(v.word)}</h2><p class="lead2">${esc(v.line)}</p></div>
        <div class="rep-actions"><button type="button" class="btn ghost" data-act="reanalyze">Read it again</button>${b && b.status === 'now' ? `<button type="button" class="btn primary" data-act="loadplan">Load into a demo trade</button>` : ''}<button type="button" class="btn ghost" data-act="pine">Put it on my TradingView</button><button type="button" class="linkbtn" data-act="clear">Clear drawings</button></div>
      </div>
      <div class="rep-grid">
        <section class="rcard"><h3>The plan${b ? ` · ${esc(b.name)}` : ''}</h3>${b ? `<div class="rk-top">${rec(stratOf(b))}${b.practice ? '<span class="tag" data-tone="yellow">practice only</span>' : '<span class="tag" data-tone="green">held up 5 years</span>'}</div>` : ''}${planBlock}${why.length ? `<ul class="swhy">${why.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}</section>
        <section class="rcard"><h3>Trend</h3><div class="tgauge" style="--g:${(an.sc + 2) / 4}"><i></i><span>Down</span><span>Sideways</span><span>Up</span></div><p>On the ${TFN[an.tf]} chart, the last swings made ${an.trendTxt}. Price is ${an.maTxt}.</p><p class="muted small">ATR (average candle size) is ${P(an.R.atr)}. Stops closer than that get hit by normal noise.</p></section>
        <section class="rcard"><h3>Key levels</h3><div class="tablewrap"><table class="log lv"><thead><tr><th>Price</th><th>What</th><th>Strength</th></tr></thead><tbody>${an.levels.map(l => `<tr class="${Math.abs(l.p - an.px) < an.R.atr ? 'near' : ''}"><td class="mono">${l.lo != null ? `${P(l.lo)}–${fmtN(l.hi, mk === 'btc' ? 0 : 2)}` : P(l.p)}</td><td><span class="tag" data-tone="${l.tone}">${esc(l.type)}</span><small>${esc(l.note)}</small></td><td>${l.str}</td></tr>`).join('')}<tr class="nowrow"><td class="mono">${P(an.px)}</td><td colspan="2">Price now</td></tr></tbody></table></div></section>
        <section class="rcard"><h3>What could happen next</h3><ul class="scen">${an.scen.map(x => `<li data-k="${x.k}"><div class="scen-top"><b>${x.name}</b><span class="mono">${x.prob}%</span></div><div class="pbar"><i style="--w:${x.prob / 100}"></i></div><p>${esc(x.text)} <span class="muted">${esc(x.inv)}</span></p></li>`).join('')}</ul><p class="muted small">Rough odds from the trend and structure, not a promise. The three add up to 100%.</p></section>
        <section class="rcard wide"><h3>Which strategy fits right now</h3><ol class="rank">${ranked}</ol>
          <details class="failed"><summary>Popular YouTube and TikTok strategies I tested that lost money</summary><p class="small muted">Same 5 years of gold data, same fees (0.015% each way). These are drawn as patterns on the chart (sweeps, breakouts), but the desk won't trade them.</p><ul>${failed}</ul></details></section>
        <section class="rcard wide learn"><h3>What the drawings mean</h3><ul class="legend">${legend}</ul><p class="small">Practice: open TradingView, pick the horizontal line tool, and draw these same levels yourself. Then press "Put it on my TradingView" to check your work against the desk.</p></section>
      </div>
      <p class="small muted disc">Educational chart reading, not financial advice. Practice with demo money.</p>`;
  }

  function tvRibbon(an) {
    const mk = an.mk, P = v => money(v, mk), items = [];
    const pl = an.A.plan;
    if (pl) { items.push([pl.side > 0 ? 'up' : 'down', `${pl.side > 0 ? 'Buy' : 'Sell'} ${pl.wait ? (pl.side > 0 ? 'above' : 'below') : 'at'}`, pl.entry], ['down', 'Stop loss', pl.stop]); if (pl.tgt != null) items.push(['up', 'Take profit', pl.tgt]); }
    for (const l of an.levels.slice(0, pl ? 3 : 5)) items.push([l.tone === 'red' ? 'down' : l.tone === 'green' ? 'up' : 'amber', l.type, l.lo != null ? (l.lo + l.hi) / 2 : l.p]);
    return `<button type="button" class="tvr-head" data-act="tvfold" aria-label="Show or hide the analysis levels"><b>Analysis levels</b><span>Find them on TradingView's price scale</span><i aria-hidden="true">▾</i></button><ul>${items.map(([c, t, p]) => `<li><i class="sw" data-c="${c}"></i><span>${esc(t)}</span><b class="mono">${P(p)}</b></li>`).join('')}</ul><button type="button" class="btn tiny" data-act="pine">Draw these on my TradingView</button>`;
  }

  async function runAnalyze(mk) {
    const st = S[mk], f = st.ui; if (!f || st.analyzing) return;
    st.analyzing = true; f.analyze.classList.add('busy'); f.analyze.setAttribute('aria-busy', 'true');
    try {
      for (let k = 0; k < 40 && !st.ready; k++) await sleepMs(500);
      if (st.mode === 'tv') st.setMode('split');
      await Promise.all([refresh(), refreshPrices()]);
      const an = buildAnalysis(mk);
      if (!an) { toast('Not enough candles yet', 'Give it a few seconds to load, then press Analyze again.'); return; }
      st.analysis = an;
      st.chart.setAnalysis(an.A, true);
      f.report.innerHTML = reportHTML(an); f.report.hidden = false;
      f.report.classList.remove('in'); void f.report.offsetWidth; f.report.classList.add('in');
      f.tvLevels.innerHTML = tvRibbon(an); f.tvLevels.hidden = false;
      const v = verdictOf(an); f.anChip.hidden = false; f.anChip.dataset.tone = v.tone; f.anChip.querySelector('b').textContent = v.word;
      if (window.Coach) Coach.onAnalysis(an, v);
    } catch (e) { console.error(e); toast('Analyze failed', 'Something went wrong reading the chart. Try again in a moment.'); }
    finally { st.analyzing = false; f.analyze.classList.remove('busy'); f.analyze.removeAttribute('aria-busy'); }
  }
  function clearAnalysis(mk) { const st = S[mk], f = st.ui; st.analysis = null; st.chart.setAnalysis(null); f.report.hidden = true; f.tvLevels.hidden = true; f.anChip.hidden = true; }
  function bindAnalyze(mk) {
    const f = S[mk].ui;
    f.analyze.addEventListener('click', () => runAnalyze(mk));
    f.anChip.addEventListener('click', e => { if (e.target.closest('[data-act="clear"]')) clearAnalysis(mk); else f.report.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    const onAct = e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const a = b.dataset.act;
      if (a === 'reanalyze') runAnalyze(mk);
      else if (a === 'clear') clearAnalysis(mk);
      else if (a === 'pine') openPine(mk);
      else if (a === 'tvfold') f.tvLevels.classList.toggle('fold');
      else if (a === 'loadplan') { const an = S[mk].analysis; if (an && an.best) loadIntoTicket(mk, an.best.sid); }
    };
    f.report.addEventListener('click', onAct); f.tvLevels.addEventListener('click', onAct);
  }

  /* ---------------- TradingView: the same drawings on the user's own TradingView, via a Pine Script indicator ---------------- */
  function openPine(mk) {
    const d = $('#pineDlg'); if (!d) return;
    $('#pineCode').textContent = window.PINE_SCRIPT || '';
    $('#pineTf').textContent = mk === 'btc' ? 'COINBASE:BTCUSD on the 4-hour chart (Trend Rider)' : 'OANDA:XAUUSD on the 1-hour chart (Quiet Breakout), 15-minute for the London Breakout, 4-hour for Gold Trend';
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  }
  function bindPine() {
    const d = $('#pineDlg'); if (!d) return;
    d.addEventListener('click', async e => {
      if (e.target === d || e.target.closest('[data-close]')) { d.close ? d.close() : d.removeAttribute('open'); return; }
      if (e.target.closest('[data-copy]')) {
        const txt = window.PINE_SCRIPT || '', msg = $('#pineMsg');
        try { await navigator.clipboard.writeText(txt); msg.textContent = 'Copied. Now paste it into the Pine Editor on TradingView.'; }
        catch (err) { const r = document.createRange(); r.selectNodeContents($('#pineCode')); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); msg.textContent = 'Press Cmd+C to copy the selected script.'; }
      }
    });
  }

  /* ---------------- start ---------------- */
  buildMarket('gold'); buildMarket('btc'); bindSettings(); bindBots(); bindCalls(); bindScan(); bindAnalyze('gold'); bindAnalyze('btc'); bindPine(); bindAuto(); renderAuto();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) $$('[data-art]').forEach(img => { img.src = `assets/${img.dataset.art}.png`; });
  $$('[data-art]').forEach(img => { img.onerror = () => { img.style.display = 'none'; }; });
  if (RES.goldQuiet) { const b = $('.band'); const v = [RES.goldQuiet.R, RES.goldQuiet.win, RES.goldQuiet.dd, RES.goldQuiet.test]; $$('[data-count]', b).forEach((el, i) => { el.dataset.count = v[i]; }); countUp(b); }
  window.addEventListener('hashchange', route); window.addEventListener('resize', () => { const a = $(`.tabs a[data-tab="${current}"]`), ink = $('.tabs .ink'); if (a && ink) { ink.style.width = a.offsetWidth + 'px'; ink.style.transform = `translateX(${a.offsetLeft}px)`; } });
  route(); tickClock(); setInterval(tickClock, 1000);
  Data.goldSpot().then(sp => { SPOT = sp; updateOffset(); });
  loadMarket('gold').then(() => loadMarket('btc'));
  setInterval(refreshPrices, 15000);
  setInterval(refresh, 60000);
  setInterval(() => { if (current === 'plan') renderPlan(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { refreshPrices(); refresh(); } });
  // live particle orb behind the gold on the home page
  if (window.Orb && $('#heroOrb') && !matchMedia('(prefers-reduced-motion: reduce)').matches) Orb.create($('#heroOrb'), { count: innerWidth < 700 ? 3500 : 7000, ring: true, distance: 5.2, interactive: true });
  // opened from the OS or Atlas with ?analyze=gold / ?analyze=btc
  const qa = new URLSearchParams(location.search).get('analyze');
  if (qa && MK[qa]) { let tries = 0; const go = () => { if (S[qa].ready) runAnalyze(qa); else if (tries++ < 60) setTimeout(go, 700); }; setTimeout(go, 1200); }
  window.__desk2 = { S, MK, status, loadIntoTicket, setScan: x => { lastScan = x; }, runAnalyze, buildAnalysis, scanCandidates, botBook: id => botBook(BOT_DEF.find(d => d.id === id)), BOT_DEF, BOOK: () => BOOK, money, off, displayPrice, RES, SET };
})();

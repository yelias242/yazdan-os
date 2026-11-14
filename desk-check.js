// Desk check: runs the Trading Desk's exact strategies (engine.js) on fresh candles and prints a JSON report.
// Used by the scheduled alerts and the morning coach brief.  usage: node desk-check.js [lookbackHours=4.2]
const E = require('./engine.js');
const HOURS = +(process.argv[2] || 4.2), NOW = Date.now() / 1000;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJSON(url) { for (let a = 0; a < 4; a++) { try { const r = await fetch(url, { headers: { 'user-agent': 'desk-check' } }); if (r.ok) return await r.json(); } catch (e) {} await sleep(800 * (a + 1)); } throw new Error('fetch failed ' + url); }
async function klines(sym, iv, days) {
  const step = { '15m': 900, '1h': 3600 }[iv], out = []; let t = (NOW - days * 86400) * 1000;
  while (t < NOW * 1000) {
    const k = await getJSON(`https://data-api.binance.vision/api/v3/klines?symbol=${sym}&interval=${iv}&startTime=${Math.floor(t)}&limit=1000`);
    if (!k.length) break; for (const r of k) out.push({ t: r[0] / 1000, o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] });
    t = k[k.length - 1][0] + step * 1000; if (k.length < 1000) break;
  }
  return out.filter(b => b.t + step <= NOW);           // closed candles only
}
const h4 = h1 => { const B = E.resample(h1, 14400); if (B.length && B[B.length - 1].t + 14400 > h1[h1.length - 1].t + 3600) B.pop(); return B; };
const fmt = (x, d) => x == null ? null : +x.toFixed(d);
(async () => {
  const [g1, g15, b1] = await Promise.all([klines('PAXGUSDT', '1h', 150), klines('PAXGUSDT', '15m', 40), klines('BTCUSDT', '1h', 150)]);
  let spot = null; try { const j = await getJSON('https://api.gold-api.com/price/XAU'); spot = +j.price; } catch (e) {}
  const goldOpen = !E.goldClosed(NOW);
  // XAUUSD = PAXG + offset. While gold is closed, compare spot with the last PAXG candle from open hours.
  let ref = g1[g1.length - 1]; if (!goldOpen) for (let i = g1.length - 1; i >= 0; i--) if (!E.goldClosed(g1[i].t) && !E.goldClosed(g1[i].t + 3599)) { ref = g1[i]; break; }
  const off = spot && Math.abs(spot - ref.c) < 80 ? spot - ref.c : 0;
  const S = [
    { mk: 'gold', id: 'quiet', name: 'Quiet Breakout', tested: '+77R over 5 yrs', r: E.quietBreakout(g1, { gold: true, cost: 0.00015, dailySrc: g1 }), dp: 2, o: off },
    { mk: 'gold', id: 'trend', name: 'Gold Trend (4h)', tested: '+23R over 5 yrs', r: E.trendRider(h4(g1), { n: 20, x: 10, trendN: 200, gold: true, cost: 0.00015, asset: 'gold', name: 'Gold Trend' }), dp: 2, o: off },
    { mk: 'gold', id: 'london', name: 'London Breakout (weak edge)', tested: '+23R over 5 yrs, -33R drop', r: E.londonBreakout(g15, { cost: 0.00015, dailySrc: g1 }), dp: 2, o: off },
    { mk: 'btc', id: 'trend', name: 'Trend Rider (BTC 4h)', tested: '+49R over 5 yrs', r: E.trendRider(h4(b1), { cost: 0.001 }), dp: 0, o: 0 }
  ];
  const fresh = [], open = [], week = [], state = {};
  for (const s of S) {
    for (const t of s.r.trades) {
      const row = { market: s.mk, strategy: s.name, side: t.d > 0 ? 'BUY' : 'SELL', signalClose: new Date(t.t * 1000).toISOString(), entry: fmt(t.e + s.o, s.dp), stop: fmt((t.liveStop ?? t.stop) + s.o, s.dp), target: t.tgt == null ? null : fmt(t.tgt + s.o, s.dp), result: t.R == null ? 'open' : `${t.Rf >= 0 ? '+' : ''}${t.Rf.toFixed(2)}R (${t.res})`, why: t.why, tested: s.tested };
      if (t.t >= NOW - HOURS * 3600) fresh.push(row);
      if (t.R == null) open.push(row);
      if (t.R != null && t.exitT >= NOW - 7 * 86400) week.push(row);
    }
    const x = s.r.state || {};
    if (s.id === 'quiet') state.quiet = { trend: x.up ? 'up (above 50-day avg)' : 'down (below 50-day avg)', calm: !!x.calm, trigger: x.up ? `BUY if a 1h candle closes above ${fmt(x.hi + off, 2)}` : `SELL if a 1h candle closes below ${fmt(x.lo + off, 2)}` };
    if (s.id === 'trend') state[s.mk + 'Trend'] = { uptrend: !!x.up, trigger: x.up ? `BUY if a 4h candle closes above ${fmt(x.hi + s.o, s.dp)}` : `sitting out: below the 200-candle average (${fmt(x.trend + s.o, s.dp)})`, exitLine: fmt(x.lo + s.o, s.dp) };
    if (s.id === 'london') state.london = { asia: x.hi != null ? `${fmt(x.lo + off, 2)} to ${fmt(x.hi + off, 2)}` : null, building: !!x.building, window: !!x.window, done: !!x.done, note: x.why || '' };
  }
  console.log(JSON.stringify({ at: new Date(NOW * 1000).toISOString(), lookbackHours: HOURS, goldOpen, goldSpot: spot, goldPAXGOffset: fmt(off, 2), btc: fmt(b1[b1.length - 1].c, 0), fresh, open, last7days: week, state }, null, 1));
})().catch(e => { console.log(JSON.stringify({ error: String(e && e.message || e) })); process.exit(1); });

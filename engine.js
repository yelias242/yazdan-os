/* Trading Desk v2 — strategy engine.
   The SAME file runs the 5-year backtest (Node) and the live site (browser), so what the site
   shows is exactly what was tested. Rules:
   - Only CLOSED candles are ever used (the caller drops the candle still forming).
   - Entry = close of the signal candle. Stop/target checked from the next candle.
     A candle that touches both stop and target counts as a loss.
   - Daily values only use days that have already closed.
   - Gold: no trades while the market is closed (Fri 5 PM - Sun 6 PM, daily 5-6 PM Toronto);
     open trades are closed at the last price before a close. */
(function (root) {
  'use strict';
  const TZN = 'America/Toronto';
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: TZN, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', weekday: 'short' });
  const WD = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const tzc = new Map();
  function tz(t) {
    let r = tzc.get(t); if (r) return r;
    const p = {}; for (const x of dtf.formatToParts(new Date(t * 1000))) p[x.type] = x.value;
    r = { m: (+p.hour % 24) * 60 + (+p.minute), wd: WD[p.weekday] };
    if (tzc.size > 400000) tzc.clear(); tzc.set(t, r); return r;
  }
  function goldClosed(t) {
    const { m, wd } = tz(t);
    if (wd === 5 || (wd === 4 && m >= 1020) || (wd === 6 && m < 1080)) return true;
    return m >= 1020 && m < 1080;
  }

  /* ---------- helpers (same maths as the Python test) ---------- */
  function resample(B, tf) {
    const out = []; let cur = null;
    for (const b of B) {
      const k = b.t - (b.t % tf);
      if (!cur || cur.t !== k) { if (cur) out.push(cur); cur = { t: k, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v || 0 }; }
      else { if (b.h > cur.h) cur.h = b.h; if (b.l < cur.l) cur.l = b.l; cur.c = b.c; cur.v += b.v || 0; }
    }
    if (cur) out.push(cur);
    return out;
  }
  function ema(v, n) { const k = 2 / (n + 1), o = []; for (const x of v) o.push(o.length ? x * k + o[o.length - 1] * (1 - k) : x); return o; }
  function sma(v, n) { const o = []; let s = 0; v.forEach((x, i) => { s += x; if (i >= n) s -= v[i - n]; o.push(s / Math.min(i + 1, n)); }); return o; }
  function stdev(v, n) {
    const o = []; let s = 0, s2 = 0;
    v.forEach((x, i) => { s += x; s2 += x * x; if (i >= n) { s -= v[i - n]; s2 -= v[i - n] * v[i - n]; } const m = Math.min(i + 1, n); o.push(Math.sqrt(Math.max(0, s2 / m - (s / m) ** 2))); });
    return o;
  }
  function trs(B) { return B.map((b, i) => i ? Math.max(b.h - b.l, Math.abs(b.h - B[i - 1].c), Math.abs(b.l - B[i - 1].c)) : b.h - b.l); }
  function rollMax(v, n) { const o = []; for (let i = 0; i < v.length; i++) { let m = -Infinity; for (let j = Math.max(0, i - n + 1); j <= i; j++) if (v[j] > m) m = v[j]; o.push(m); } return o; }
  function rollMin(v, n) { const o = []; for (let i = 0; i < v.length; i++) { let m = Infinity; for (let j = Math.max(0, i - n + 1); j <= i; j++) if (v[j] < m) m = v[j]; o.push(m); } return o; }
  // value of a daily indicator known when bar i CLOSES (last fully closed UTC day)
  function daily(B, tf, fn, src) {
    const D = resample(src || B, 86400), vals = fn(D.map(d => d.c)), out = new Array(B.length).fill(null);
    let j = -1;
    B.forEach((b, i) => { while (j + 1 < D.length && D[j + 1].t + 86400 <= b.t + tf) j++; out[i] = j >= 0 ? vals[j] : null; });
    return out;
  }

  /* ---------- simulator (identical to the Python sim) ---------- */
  function sim(B, sigs, o) {
    const N = B.length, out = []; let busy = -1;
    for (const s of sigs) {
      const { i, d, stop } = s;
      if (i <= busy || (o.gold && (goldClosed(B[i].t) || goldClosed(B[i].t + o.tf)))) continue;
      const e = B[i].c, risk = Math.abs(e - stop);
      if (!(risk > 0) || (stop - e) * d >= 0) continue;
      const tr = { name: o.name, t: B[i].t + o.tf, i, d, e, stop, tgt: s.tgt, risk, why: s.why, R: null, res: 'open', trail: s.trail };
      let q, ex = null, R = null;
      const end = Math.min(N, i + 1 + s.hold);
      for (q = i + 1; q < end; q++) {
        const x = B[q];
        if (s.exitAtOpen && q === i + s.hold) { R = (x.o - e) * d / risk; ex = x.o; tr.res = 'time'; break; }
        if (d === 1 ? x.l <= stop : x.h >= stop) { R = -1; ex = stop; tr.res = 'stop'; break; }
        if (s.tgt != null && (d === 1 ? x.h >= s.tgt : x.l <= s.tgt)) { R = (s.tgt - e) * d / risk; ex = s.tgt; tr.res = 'target'; break; }
        const shut = o.gold && goldClosed(x.t + o.tf);
        if (shut || (s.exitf && s.exitf(q, d))) { R = (x.c - e) * d / risk; ex = x.c; tr.res = shut ? 'market close' : 'exit rule'; break; }
      }
      if (R == null && end - 1 - i >= s.hold) { q = Math.min(N - 1, i + s.hold); ex = B[q].c; R = (ex - e) * d / risk; tr.res = 'time'; }
      if (R == null) { tr.liveStop = s.liveStop ? s.liveStop(N - 1) : stop; out.push(tr); busy = Infinity; continue; }
      tr.R = R; tr.Rf = R - (e + ex) * o.cost / risk; tr.exit = ex; tr.exitT = B[q].t + o.tf;
      out.push(tr); busy = q;
    }
    return out;
  }

  /* ---------- 1. Quiet Breakout (1-hour) — main strategy ---------- */
  function quietBreakout(B, o) {
    o = Object.assign({ n: 20, trail: 3, side: 0, tf: 3600, name: 'Quiet Breakout' }, o);
    const N = B.length, C = B.map(b => b.c), A = ema(trs(B), 14), A100 = ema(A, 100);
    const hi = rollMax(B.map(b => b.h), o.n), lo = rollMin(B.map(b => b.l), o.n);
    const D50 = daily(B, o.tf, c => sma(c, 50), o.dailySrc);
    const sigs = [];
    let state = null;
    for (let i = 201; i < N; i++) {
      if (D50[i] == null) continue;
      const calm = A[i] <= A100[i];
      if (i === N - 1) state = { hi: hi[i], lo: lo[i], d50: D50[i], calm, atr: A[i], a100: A100[i], up: C[i] > D50[i], close: C[i], t: B[i].t };
      if (!calm) continue;
      if (o.side >= 0 && C[i] > hi[i - 1] && C[i] > D50[i]) {
        const st = C[i] - o.trail * A[i], k = i, a = o.trail;
        const peak = q => { let m = -Infinity; for (let j = k; j < q; j++) if (C[j] > m) m = C[j]; return m; };
        sigs.push({ i, d: 1, stop: st, tgt: null, hold: 400, trail: a,
          exitf: q => C[q] < peak(q) - a * A[q], liveStop: q => Math.max(st, peak(q + 1) - a * A[q]),
          why: `Closed above the ${o.n}-hour high in a calm market, with gold above its 50-day average (uptrend).` });
      } else if (o.side <= 0 && C[i] < lo[i - 1] && C[i] < D50[i]) {
        const st = C[i] + o.trail * A[i], k = i, a = o.trail;
        const low = q => { let m = Infinity; for (let j = k; j < q; j++) if (C[j] < m) m = C[j]; return m; };
        sigs.push({ i, d: -1, stop: st, tgt: null, hold: 400, trail: a,
          exitf: q => C[q] > low(q) + a * A[q], liveStop: q => Math.min(st, low(q + 1) + a * A[q]),
          why: `Closed below the ${o.n}-hour low in a calm market, with price below its 50-day average (downtrend).` });
      }
    }
    return { trades: sim(B, sigs, o), state, tf: o.tf };
  }

  /* ---------- 2. Bollinger breakout (1-hour, both sides) — BTC "closest" ---------- */
  function bbBreakout(B, o) {
    o = Object.assign({ K: 2, TG: 2, tf: 3600, name: 'Bollinger Breakout' }, o);
    const N = B.length, C = B.map(b => b.c), A = ema(trs(B), 14), m = sma(C, 20), s = stdev(C, 20), S200 = sma(C, 200), D9 = daily(B, o.tf, c => sma(c, 9), o.dailySrc);
    const up = m.map((x, i) => x + o.K * s[i]), dn = m.map((x, i) => x - o.K * s[i]);
    const LL = rollMin(B.map(b => b.l), 10), HH = rollMax(B.map(b => b.h), 10);
    const sigs = []; let state = null;
    for (let i = 201; i < N; i++) {
      if (D9[i] == null) continue;
      if (i === N - 1) state = { close: C[i], s200: S200[i], d9: D9[i], up: up[i], dn: dn[i], trendUp: C[i] > S200[i] && C[i] > D9[i], trendDn: C[i] < S200[i] && C[i] < D9[i] };
      if (C[i] > up[i] && C[i - 1] <= up[i - 1] && C[i] > S200[i] && C[i] > D9[i]) {
        const st = LL[i] - 0.1 * A[i]; sigs.push({ i, d: 1, stop: st, tgt: C[i] + o.TG * (C[i] - st), hold: 96, why: 'Closed above the upper Bollinger band while above the 200-hour and 9-day averages.' });
      } else if (C[i] < dn[i] && C[i - 1] >= dn[i - 1] && C[i] < S200[i] && C[i] < D9[i]) {
        const st = HH[i] + 0.1 * A[i]; sigs.push({ i, d: -1, stop: st, tgt: C[i] - o.TG * (st - C[i]), hold: 96, why: 'Closed below the lower Bollinger band while below the 200-hour and 9-day averages.' });
      }
    }
    return { trades: sim(B, sigs, o), state, tf: o.tf };
  }

  /* ---------- 3. ICC (4-hour indication, 15-min entry) + daily 50 trend filter — practice ---------- */
  function icc(B, o) {
    o = Object.assign({ tf: 900, name: 'ICC', trend: true }, o);
    const N = B.length, A = (() => { const t = trs(B), a = []; for (let i = 0; i < N; i++) { const w = t.slice(Math.max(0, i - 13), i + 1); a.push(w.reduce((x, y) => x + y, 0) / w.length); } return a; })();
    const D50 = daily(B, o.tf, c => sma(c, 50), o.dailySrc);
    const HT = 14400, G = HT / o.tf, H = [];
    for (let i = 0; i < N; i++) {
      if (B[i].t % HT !== 0) continue;
      const g = []; for (let j = i; j < Math.min(N, i + G); j++) if (B[j].t < B[i].t + HT) g.push(B[j]);
      if (g.length === G) H.push({ h: Math.max(...g.map(x => x.h)), l: Math.min(...g.map(x => x.l)), c: g[G - 1].c, end: i + G - 1 });
    }
    const sh = new Map(), sl = new Map();
    for (let j = 2; j < H.length - 2; j++) {
      if (H[j].h > Math.max(H[j - 1].h, H[j - 2].h) && H[j].h >= Math.max(H[j + 1].h, H[j + 2].h)) sh.set(H[j + 2].end, [H[j].h, j]);
      if (H[j].l < Math.min(H[j - 1].l, H[j - 2].l) && H[j].l <= Math.min(H[j + 1].l, H[j + 2].l)) sl.set(H[j + 2].end, [H[j].l, j]);
    }
    const hend = new Map(H.map((h, k) => [h.end, k]));
    const EXP = 96, HOLD = 64; let lastH = null, lastL = null, st = null, view = null; const sigs = [];
    for (let i = 0; i < N; i++) {
      const b = B[i], z = tz(b.t);
      if (hend.has(i)) {
        const k = hend.get(i), h = H[k];
        if (lastL && h.c < lastL[0] && (!st || st.d !== -1)) { st = { d: -1, start: Math.max(...H.slice(Math.max(0, lastL[1] - 6), k + 1).map(x => x.h)), ext: h.l, extI: i, t0: i }; lastL = null; }
        else if (lastH && h.c > lastH[0] && (!st || st.d !== 1)) { st = { d: 1, start: Math.min(...H.slice(Math.max(0, lastH[1] - 6), k + 1).map(x => x.l)), ext: h.h, extI: i, t0: i }; lastH = null; }
      }
      if (sh.has(i)) lastH = sh.get(i);
      if (sl.has(i)) lastL = sl.get(i);
      view = null;
      if (!st) continue;
      const d = st.d;
      if (i - st.t0 > EXP) { st = null; continue; }
      if ((d === -1 && b.l < st.ext) || (d === 1 && b.h > st.ext)) { st.ext = d === -1 ? b.l : b.h; st.extI = i; view = { phase: 'impulse', d, ext: st.ext, start: st.start }; continue; }
      if (i - st.extI < 4) { view = { phase: 'impulse', d, ext: st.ext, start: st.start }; continue; }
      let phI = st.extI;
      for (let k = st.extI; k < i; k++) if (d === -1 ? B[k].h > B[phI].h : B[k].l < B[phI].l) phI = k;
      const ph = d === -1 ? B[phI].h : B[phI].l, leg = Math.abs(st.start - st.ext);
      if (leg <= 0 || (d === -1 && ph >= st.start) || (d === 1 && ph <= st.start)) { st = null; continue; }
      const ret = Math.abs(ph - st.ext) / leg;
      const w = B.slice(Math.max(st.extI, i - 3), i);
      const piv = d === -1 ? Math.min(...w.map(x => x.l)) : Math.max(...w.map(x => x.h));
      view = { phase: ret >= 0.3 && i - phI >= 1 ? 'ready' : 'correcting', d, piv, ret, ph, atr: A[i], ext: st.ext, start: st.start };
      if (ret < 0.3 || i - phI < 1) continue;
      if (!((d === -1 && b.c < piv) || (d === 1 && b.c > piv))) continue;
      if (z.wd >= 5 || !(z.m >= 480 && z.m < 960)) continue;
      const e = b.c, stop = d === -1 ? ph + 0.1 * A[i] : ph - 0.1 * A[i], risk = Math.abs(e - stop);
      if (risk < 0.5 * A[i] || risk > 6 * A[i]) { st = null; continue; }
      const okTrend = !o.trend || (D50[i] != null && (d === 1 ? b.c > D50[i] : b.c < D50[i]));
      if (okTrend) sigs.push({ i, d, stop, tgt: e + d * 2 * risk, hold: HOLD, exitAtOpen: true,
        why: `4-hour ${d === 1 ? 'break up' : 'break down'} (indication), pulled back ${Math.round(ret * 100)}% (correction), then a 15-min close past the pullback (continuation)${o.trend ? ', with the daily trend' : ''}.` });
      st = null; view = null;
    }
    // ICC exits at the OPEN of the time-out candle, like the original desk test
    return { trades: sim(B, sigs, o), state: view, tf: o.tf };
  }


  /* ---------- 4. Trend Rider (Bitcoin, 4-hour, buys only) ---------- */
  // Buy when a 4-hour candle closes above the highest high of the previous 40 candles, only while price is above
  // its 200-candle average. First stop 3 x ATR below. Exit when a 4-hour candle closes below the lowest low of the
  // previous 20 candles. Tested Oct 2021 - Nov 2026 on Binance BTC/USDT 1h data at 0.1% and 0.2% per side.
  function trendRider(B, o) {
    o = Object.assign({ n: 40, x: 20, trendN: 200, k: 3, tf: 14400, name: 'Trend Rider' }, o);
    const N = B.length, C = B.map(b => b.c), A = ema(trs(B), 14), T = sma(C, o.trendN);
    const hiN = rollMax(B.map(b => b.h), o.n), loX = rollMin(B.map(b => b.l), o.x);
    const sigs = []; let state = null;
    for (let i = Math.max(o.trendN + 10, o.n + 1); i < N; i++) {
      if (i === N - 1) state = { close: C[i], trend: T[i], up: C[i] > T[i], hi: hiN[i], lo: loX[i], atr: A[i], t: B[i].t };
      if (C[i] > hiN[i - 1] && C[i] > T[i]) {
        const st = C[i] - o.k * A[i];
        sigs.push({ i, d: 1, stop: st, tgt: null, hold: 5000, trail: true,
          exitf: q => C[q] < loX[q - 1], liveStop: q => Math.max(st, loX[q]),
          why: `A 4-hour candle closed above the highest point of the last ${o.n} candles (about ${Math.round(o.n * 4 / 24)} days), with ${o.asset || 'Bitcoin'} above its ${o.trendN}-candle average (uptrend).` });
      }
    }
    return { trades: sim(B, sigs, o), state, tf: o.tf };
  }

  /* ---------- 5. London Breakout of the Asian range (15-min, gold) — popular YouTube strategy + our 50-day trend filter ----------
     Asian range = 8 PM to 2 AM New York time. From 2 AM to 10 AM, the first 15-min close outside the range is the trade,
     only in the direction of the 50-day average. Stop at the other side of the range (max 0.6% away), target 2.5R,
     close by 2 PM. Skip days when the range is tiny (< 0.3%) or huge (> 1.6%). One trade a day. */
  function londonBreakout(B, o) {
    o = Object.assign({ rs: 1200, re: 120, we: 600, ex: 840, rr: 2.5, minR: 0.003, maxR: 0.016, cap: 0.006, tf: 900, gold: true, name: 'London Breakout' }, o);
    const N = B.length, C = B.map(b => b.c), D50 = daily(B, o.tf, c => sma(c, 50), o.dailySrc), sigs = [];
    const dayKey = t => { const z = tz(t); return Math.floor((t - z.m * 60 + (z.m >= 1080 ? 86400 : 0)) / 86400); };
    let day = null, hi = -Infinity, lo = Infinity, t1 = null, done = false, state = null, why = '';
    for (let i = 1; i < N; i++) {
      const t = B[i].t, z = tz(t), k = dayKey(t);
      if (k !== day) { day = k; hi = -Infinity; lo = Infinity; t1 = null; done = false; why = ''; }
      const inR = z.m >= o.rs || z.m < o.re, inW = z.m >= o.re && z.m < o.we;
      if (inR) { hi = Math.max(hi, B[i].h); lo = Math.min(lo, B[i].l); if (t1 == null) t1 = t; }
      else if (!done && inW && isFinite(hi)) {
        const w = (hi - lo) / C[i];
        if (w < o.minR || w > o.maxR) { done = true; why = w < o.minR ? 'range too small' : 'range too big'; }
        else {
          const d = C[i] > hi ? 1 : C[i] < lo ? -1 : 0;
          if (d && D50[i] != null && (C[i] > D50[i]) !== (d === 1)) { done = true; why = 'broke out against the 50-day trend'; }
          else if (d) {
            let stop = d === 1 ? lo : hi; const cap = C[i] * o.cap; if (Math.abs(C[i] - stop) > cap) stop = C[i] - d * cap;
            const ex = o.ex;
            sigs.push({ i, d, stop, tgt: C[i] + d * o.rr * Math.abs(C[i] - stop), hold: 96, exitf: q => { const m = tz(B[q].t + 900).m; return m >= ex && m < ex + 120; },
              why: `A 15-minute candle closed ${d === 1 ? 'above' : 'below'} the Asian range (${hi.toFixed(2)} to ${lo.toFixed(2)}) during London hours, in the direction of the 50-day trend.` });
            done = true; why = 'traded';
          }
        }
      }
      if (i === N - 1) state = { hi: isFinite(hi) ? hi : null, lo: isFinite(lo) ? lo : null, t1, building: inR, window: inW, done, why, d50: D50[i], up: D50[i] != null ? C[i] > D50[i] : null, close: C[i], width: isFinite(hi) ? (hi - lo) / C[i] : null };
    }
    return { trades: sim(B, sigs, o), state, tf: o.tf };
  }

  function stats(T, from) {
    T = T.filter(t => t.R != null && (from == null || t.t >= from));
    const n = T.length; if (!n) return { n: 0, win: 0, R: 0, pf: 0, dd: 0, streak: 0 };
    let eq = 0, pk = 0, dd = 0, st = 0, mx = 0, gw = 0, gl = 0, w = 0;
    for (const t of T) { eq += t.Rf; pk = Math.max(pk, eq); dd = Math.min(dd, eq - pk); if (t.Rf > 0) { w++; gw += t.Rf; st = 0; } else { gl -= t.Rf; st++; mx = Math.max(mx, st); } }
    return { n, win: 100 * w / n, R: eq, pf: gl ? gw / gl : 99, dd, streak: mx };
  }

  const api = { quietBreakout, bbBreakout, icc, trendRider, londonBreakout, stats, resample, goldClosed, tz, sim, util: { ema, sma, stdev, trs, rollMax, rollMin, daily } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Engine = api;
})(typeof window !== 'undefined' ? window : globalThis);

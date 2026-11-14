/* Chart reader for the Analyze button. Pure maths on closed candles, so it runs the same in Node and the browser.
   Finds: swing points and market structure (HH / HL / LH / LL), support and resistance zones (prices that were
   touched several times), trend lines, yesterday's high and low, the Asian session range (gold), recent breakouts
   and liquidity sweeps (price pokes past a level, then closes back inside). */
(function (root) {
  'use strict';
  const E = root.Engine || (typeof require !== 'undefined' ? require('./engine.js') : null);
  const U = E.util;

  function swings(B, k) {
    const out = [];
    for (let i = k; i < B.length - k; i++) {
      let hi = true, lo = true;
      for (let j = i - k; j <= i + k; j++) { if (j === i) continue; if (B[j].h >= B[i].h) hi = false; if (B[j].l <= B[i].l) lo = false; }
      if (hi) out.push({ i, t: B[i].t, p: B[i].h, top: true });
      if (lo) out.push({ i, t: B[i].t, p: B[i].l, top: false });
    }
    return out;
  }

  // label the last few swing highs and lows: higher high, lower low...
  function structure(S) {
    const H = S.filter(s => s.top), L = S.filter(s => !s.top), lab = [];
    for (let i = 1; i < H.length; i++) lab.push(Object.assign({}, H[i], { text: H[i].p > H[i - 1].p ? 'HH' : 'LH' }));
    for (let i = 1; i < L.length; i++) lab.push(Object.assign({}, L[i], { text: L[i].p > L[i - 1].p ? 'HL' : 'LL' }));
    lab.sort((a, b) => a.i - b.i);
    const lh = lab.filter(x => x.top).slice(-2), ll = lab.filter(x => !x.top).slice(-2);
    const ups = [...lh, ...ll].filter(x => x.text === 'HH' || x.text === 'HL').length, dns = [...lh, ...ll].filter(x => x.text === 'LH' || x.text === 'LL').length;
    const trend = ups >= 3 ? 'up' : dns >= 3 ? 'down' : 'range';
    return { labels: lab.slice(-8), trend, ups, dns };
  }

  // group swing prices that sit close together into zones; more touches = stronger
  function zones(B, S, atr, price) {
    const pts = S.map(s => ({ p: s.p, i: s.i, top: s.top })).sort((a, b) => a.p - b.p), tol = 0.6 * atr, Z = [];
    for (const q of pts) {
      const z = Z.find(z => q.p - z.hi <= tol && z.lo - q.p <= tol && Math.max(z.hi, q.p) - Math.min(z.lo, q.p) <= 1.1 * atr);
      if (z) { z.lo = Math.min(z.lo, q.p); z.hi = Math.max(z.hi, q.p); z.n++; z.last = Math.max(z.last, q.i); z.first = Math.min(z.first, q.i); }
      else Z.push({ lo: q.p, hi: q.p, n: 1, last: q.i, first: q.i });
    }
    const N = B.length;
    for (const z of Z) {
      // count candles that touched the zone and turned (wick into it, close outside of it)
      const top = z.hi + 0.15 * atr, bot = z.lo - 0.15 * atr; let touches = 0;
      for (let i = Math.max(1, N - 400); i < N; i++) { const b = B[i]; if (b.h >= bot && b.l <= top && (b.c > top || b.c < bot)) touches++; }
      z.top = top; z.bot = bot; z.touches = Math.max(z.n, Math.min(touches, z.n * 3));
      z.score = z.n * 2 + Math.min(6, touches / 3) + (N - z.last < 120 ? 2 : 0);
    }
    const good = [];
    for (const z of Z.filter(z => z.n >= 2).sort((a, b) => b.score - a.score)) if (!good.some(g => z.bot < g.top + 0.3 * atr && z.top > g.bot - 0.3 * atr)) good.push(z);
    const above = good.filter(z => z.bot > price).sort((a, b) => a.bot - b.bot).slice(0, 4).sort((a, b) => b.score - a.score).slice(0, 2);
    const below = good.filter(z => z.top < price).sort((a, b) => b.top - a.top).slice(0, 4).sort((a, b) => b.score - a.score).slice(0, 2);
    const inside = good.filter(z => z.bot <= price && z.top >= price).slice(0, 1);
    return { above, below, inside };
  }

  // trend lines through two swing points that price has respected since
  function trendlines(B, S, atr) {
    const N = B.length, out = [];
    for (const top of [false, true]) {
      const P = S.filter(s => s.top === top && s.i > N - 220);
      let best = null;
      for (let a = 0; a < P.length; a++) for (let b = a + 1; b < P.length; b++) {
        const A = P[a], C = P[b]; if (C.i - A.i < 8) continue;
        if (!top && C.p <= A.p) continue; if (top && C.p >= A.p) continue;     // rising support, falling resistance
        const m = (C.p - A.p) / (C.i - A.i); let ok = true, touch = 0;
        for (let i = A.i; i < N; i++) {
          const y = A.p + m * (i - A.i), b2 = B[i];
          if (!top && b2.c < y - 0.25 * atr && i > C.i) { ok = false; break; }
          if (top && b2.c > y + 0.25 * atr && i > C.i) { ok = false; break; }
          if (!top && i < C.i && b2.l < y - 0.35 * atr) { ok = false; break; }
          if (top && i < C.i && b2.h > y + 0.35 * atr) { ok = false; break; }
          if (Math.abs((top ? b2.h : b2.l) - y) < 0.3 * atr) touch++;
        }
        if (!ok) continue;
        const sc = touch + (C.i - A.i) / 30 + (N - C.i < 60 ? 2 : 0);
        if (!best || sc > best.sc) best = { a: A, b: C, m, sc, top, touch };
      }
      if (best) out.push({ top, a: { t: best.a.t, p: best.a.p }, b: { t: best.b.t, p: best.b.p }, now: best.a.p + best.m * (N - 1 - best.a.i), touch: best.touch });
    }
    return out;
  }

  // gold trades on New York days that start at 6 PM; Bitcoin uses UTC days
  function dayKeyGold(t) { const z = E.tz(t); return Math.floor((t - z.m * 60 + (z.m >= 1080 ? 86400 : 0)) / 86400); }
  function prevDay(B, gold) {
    const key = gold ? dayKeyGold : t => Math.floor(t / 86400), days = new Map();
    for (const b of B) { const k = key(b.t); const d = days.get(k); if (d) { d.h = Math.max(d.h, b.h); d.l = Math.min(d.l, b.l); d.c = b.c; d.t2 = b.t; } else days.set(k, { k, h: b.h, l: b.l, o: b.o, c: b.c, t1: b.t, t2: b.t }); }
    const ks = [...days.keys()].sort((a, b) => a - b), today = days.get(ks[ks.length - 1]), prev = days.get(ks[ks.length - 2]);
    return { today, prev };
  }
  function asiaRange(B) {
    // 8 PM to 2 AM New York time, for the current gold day
    const last = B[B.length - 1], k = dayKeyGold(last.t); let r = null;
    for (let i = B.length - 1; i >= 0 && i > B.length - 60; i--) {
      const b = B[i]; if (dayKeyGold(b.t) !== k) break; const m = E.tz(b.t).m;
      if (m >= 1200 || m < 120) { if (!r) r = { t1: b.t, t2: b.t, h: b.h, l: b.l }; r.t1 = b.t; r.h = Math.max(r.h, b.h); r.l = Math.min(r.l, b.l); }
    }
    return r;
  }
  // last time price closed through a level, and last sweep (wick through, close back)
  function events(B, lv, atr, look) {
    const N = B.length, out = [];
    for (const L of lv) {
      for (let i = N - 1; i > N - look && i > 1; i--) {
        const b = B[i], pb = B[i - 1];
        if (pb.c <= L.p && b.c > L.p + 0.1 * atr) { out.push({ i, t: b.t, p: b.l, kind: 'breakout', d: 1, level: L }); break; }
        if (pb.c >= L.p && b.c < L.p - 0.1 * atr) { out.push({ i, t: b.t, p: b.h, kind: 'breakout', d: -1, level: L }); break; }
        if (b.h > L.p + 0.05 * atr && b.c < L.p && pb.c < L.p) { out.push({ i, t: b.t, p: b.h, kind: 'sweep', d: -1, level: L }); break; }
        if (b.l < L.p - 0.05 * atr && b.c > L.p && pb.c > L.p) { out.push({ i, t: b.t, p: b.l, kind: 'sweep', d: 1, level: L }); break; }
      }
    }
    return out.sort((a, b) => b.i - a.i).slice(0, 2);
  }

  function read(B, o) {
    o = Object.assign({ gold: false, k: 3 }, o);
    const N = B.length, A = U.ema(U.trs(B), 14), atr = A[N - 1], price = B[N - 1].c;
    const S = swings(B.slice(-420), o.k).map(s => Object.assign(s, { i: s.i + Math.max(0, N - 420) }));
    const st = structure(S), Z = zones(B, S, atr, price), TL = trendlines(B, S, atr), PD = prevDay(B, o.gold), AS = o.gold ? asiaRange(B) : null;
    const C = B.map(b => b.c), e50 = U.ema(C, 50), e200 = U.ema(C, 200);
    const lv = [...Z.above.map(z => ({ p: z.bot, name: 'resistance' })), ...Z.below.map(z => ({ p: z.top, name: 'support' }))];
    if (PD.prev) lv.push({ p: PD.prev.h, name: "yesterday's high" }, { p: PD.prev.l, name: "yesterday's low" });
    if (AS) lv.push({ p: AS.h, name: 'Asian high' }, { p: AS.l, name: 'Asian low' });
    const ev = events(B, lv, atr, 30);
    const maTrend = price > e50[N - 1] && e50[N - 1] > e200[N - 1] ? 'up' : price < e50[N - 1] && e50[N - 1] < e200[N - 1] ? 'down' : 'mixed';
    return { atr, price, swings: S, structure: st, zones: Z, trendlines: TL, prevDay: PD.prev, today: PD.today, asia: AS, events: ev, ema50: e50[N - 1], ema200: e200[N - 1], maTrend, last: B[N - 1] };
  }

  const api = { read, swings, structure, zones, trendlines, prevDay, asiaRange, events, dayKeyGold };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Analyze = api;
})(typeof window !== 'undefined' ? window : globalThis);

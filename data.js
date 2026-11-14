/* Live data for Trading Desk v2.
   - Candles: Coinbase (PAXG-USD for gold, BTC-USD), Binance public data as backup.
   - Only CLOSED candles are handed to the strategies; the one still forming is kept apart.
   - Gold spot (XAUUSD) from gold-api.com. PAXG is a token that tracks gold within a few
     dollars, so the site measures the gap while gold is open and shows levels in XAUUSD terms. */
(function (root) {
  'use strict';
  const PRODUCTS = { gold: { cb: 'PAXG-USD', bn: 'PAXGUSDT' }, btc: { cb: 'BTC-USD', bn: 'BTCUSDT' } };
  const BN_IV = { 900: '15m', 3600: '1h', 86400: '1d' };
  const now = () => Date.now() / 1000;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function getJSON(url, tries = 3) {
    let err;
    for (let a = 0; a < tries; a++) {
      try {
        const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 15000);
        const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' }); clearTimeout(tm);
        if (r.status === 429) { await sleep(800 * (a + 1)); continue; }
        if (!r.ok) throw new Error(r.status + ' ' + url);
        return await r.json();
      } catch (e) { err = e; await sleep(400 * (a + 1)); }
    }
    throw err;
  }
  const iso = t => new Date(t * 1000).toISOString();

  async function coinbase(product, gran, start, end) {
    const out = [], step = gran * 300, chunks = [];
    for (let s = start; s < end; s += step) chunks.push([s, Math.min(end, s + step)]);
    for (let i = 0; i < chunks.length; i += 3) {
      const res = await Promise.all(chunks.slice(i, i + 3).map(([a, b]) =>
        getJSON(`https://api.exchange.coinbase.com/products/${product}/candles?granularity=${gran}&start=${iso(a)}&end=${iso(b)}`)));
      for (const list of res) for (const k of list) out.push({ t: k[0], l: +k[1], h: +k[2], o: +k[3], c: +k[4], v: +k[5] || 0 });
    }
    return out;
  }
  async function binance(sym, gran, start, end) {
    const out = []; let t = start * 1000;
    while (t < end * 1000) {
      const k = await getJSON(`https://data-api.binance.vision/api/v3/klines?symbol=${sym}&interval=${BN_IV[gran]}&startTime=${t}&limit=1000`);
      if (!k.length) break;
      for (const r of k) out.push({ t: r[0] / 1000, o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] || 0 });
      t = k[k.length - 1][0] + gran * 1000;
      if (k.length < 1000) break;
    }
    return out;
  }
  function clean(list) {
    const m = new Map(); for (const b of list) if (b && isFinite(b.c) && b.h >= b.l) m.set(b.t, b);
    return [...m.values()].sort((a, b) => a.t - b.t);
  }

  /* A series keeps its candles, merges updates, and splits closed vs forming. */
  class Series {
    constructor(market, gran, days) { this.market = market; this.gran = gran; this.days = days; this.bars = []; this.source = null; this.lastFetch = 0; }
    async load() {
      const end = Math.floor(now() / this.gran) * this.gran + this.gran, start = end - this.days * 86400, P = PRODUCTS[this.market];
      let list = [];
      try { list = await coinbase(P.cb, this.gran, start, end); this.source = 'Coinbase'; } catch (e) { list = []; }
      if (list.length < 50) { try { list = await binance(P.bn, this.gran, start, end); this.source = 'Binance'; } catch (e) {} }
      if (!list.length) throw new Error('no data');
      this.bars = clean(list); this.lastFetch = now();
    }
    async update() {
      const end = Math.floor(now() / this.gran) * this.gran + this.gran, start = end - this.gran * 12, P = PRODUCTS[this.market];
      let list = [];
      try { list = this.source === 'Binance' ? await binance(P.bn, this.gran, start, end) : await coinbase(P.cb, this.gran, start, end); }
      catch (e) { try { list = await binance(P.bn, this.gran, start, end); } catch (e2) { return false; } }
      if (!list.length) return false;
      this.bars = clean(this.bars.concat(list)).slice(-Math.ceil(this.days * 86400 / this.gran) - 50); this.lastFetch = now();
      return true;
    }
    closed() { const t = now(); return this.bars.filter(b => b.t + this.gran <= t); }
    forming() { const b = this.bars[this.bars.length - 1]; return b && b.t + this.gran > now() ? b : null; }
    lastClosedAge() { const c = this.closed(); return c.length ? now() - (c[c.length - 1].t + this.gran) : Infinity; }
  }

  async function ticker(market) {
    try { const j = await getJSON(`https://api.exchange.coinbase.com/products/${PRODUCTS[market].cb}/ticker`, 1); return { price: +j.price, t: Date.parse(j.time) / 1000 }; }
    catch (e) {
      try { const j = await getJSON(`https://data-api.binance.vision/api/v3/ticker/price?symbol=${PRODUCTS[market].bn}`, 1); return { price: +j.price, t: now() }; } catch (e2) { return null; }
    }
  }
  async function goldSpot() {
    try { const j = await getJSON('https://api.gold-api.com/price/XAU', 1); return { price: +j.price, t: Date.parse(j.updatedAt) / 1000 }; } catch (e) { return null; }
  }

  root.Data = { Series, ticker, goldSpot };
})(window);

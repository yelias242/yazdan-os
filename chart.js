/* Chart workstation for Trading Desk v2 (built on Lightweight Charts 4.1, TradingView's open-source library).
   Draws, on the SAME candles the strategies read:
   - buy / sell markers with the result, and TradingView-style trade zones (red = risk to the stop, green = reward)
   - the live breakout levels (where the next signal would trigger) and the strategy's own lines
   - auto-marked sideways ranges, volume, a pulsing live price
   - your own drawings: horizontal line, trend line, box (saved in this browser). */
(function (root) {
  'use strict';
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fmtP = n => n == null || !isFinite(n) ? '-' : Number(n).toLocaleString('en-US', { minimumFractionDigits: n > 1000 ? 0 : 2, maximumFractionDigits: n > 1000 ? (n > 20000 ? 0 : 2) : 2 });
  const tfmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const dfmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric' });
  const hfmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit' });
  const alpha = (hex, a) => { const h = hex.replace('#', ''); if (h.length !== 6) return hex; return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`; };

  const ICON = {
    cursor: '<path d="M5 3l12 6-5 1.6L9.8 16z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
    hline: '<path d="M3 10h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="10" cy="10" r="1.8" fill="currentColor"/>',
    trend: '<path d="M4 15L16 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="4" cy="15" r="1.8" fill="currentColor"/><circle cx="16" cy="5" r="1.8" fill="currentColor"/>',
    box: '<rect x="3.5" y="5" width="13" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.7"/>',
    undo: '<path d="M7 6L4 9l3 3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.5 9H12a4 4 0 010 8H9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    clear: '<path d="M5 6h10M8 6V4.5h4V6M6.5 6l.7 10h5.6l.7-10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
    fit: '<path d="M3 7V3h4M17 7V3h-4M3 13v4h4M17 13v4h-4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>'
  };
  const svg = k => `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">${ICON[k]}</svg>`;

  function theme() {
    return {
      layout: { background: { type: 'solid', color: 'transparent' }, textColor: css('--muted'), fontFamily: '"Geist Mono", ui-monospace, monospace', fontSize: 11 },
      grid: { vertLines: { color: css('--grid') }, horzLines: { color: css('--grid') } },
      rightPriceScale: { borderColor: css('--line') },
      timeScale: { borderColor: css('--line'), timeVisible: true, secondsVisible: false, rightOffset: 8 },
      crosshair: { mode: 0, vertLine: { color: css('--muted'), style: 3, labelBackgroundColor: css('--muted') }, horzLine: { color: css('--muted'), style: 3, labelBackgroundColor: css('--muted') } }
    };
  }

  function create(wsRoot, key) {
    const part = n => wsRoot.querySelector(`[data-ws="${n}"]`);
    const el = part('chart'), tools = part('tools'), layersEl = part('layers'), legend = part('legend'), hint = part('hint'), chip = part('range');
    const LW = root.LightweightCharts;
    const chart = LW.createChart(el, Object.assign(theme(), {
      autoSize: true,
      localization: { timeFormatter: t => tfmt.format(new Date(t * 1000)).replace(/\./g, '') },
      timeScale: Object.assign(theme().timeScale, { tickMarkFormatter: (t, type) => (type <= 2 ? dfmt : hfmt).format(new Date(t * 1000)).replace(/\./g, '') })
    }));
    const vol = chart.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 }, visible: false });
    const series = chart.addCandlestickSeries({ upColor: css('--up'), downColor: css('--down'), borderVisible: false, wickUpColor: css('--up'), wickDownColor: css('--down'), priceLineColor: css('--gold'), priceLineStyle: 2 });
    series.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.2 } });
    // invisible line on the closes, only there for the pulsing "live price" dot
    const pulse = chart.addLineSeries({ color: css('--gold'), lineWidth: 2, lineVisible: false, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false, lastPriceAnimation: reduced() ? 0 : 1 });
    const ts = chart.timeScale();

    /* ---------- saved state ---------- */
    const KEY = 'v2draw_' + key;
    let store = { h: [], t: [], b: [], _order: [] };
    try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) store = Object.assign(store, s); } catch (e) {}
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} };
    let L = { signals: true, zones: true, levels: true, ranges: true, volume: true };
    try { L = Object.assign(L, JSON.parse(localStorage.getItem('v2layers') || '{}')); } catch (e) {}
    const saveL = () => { try { localStorage.setItem('v2layers', JSON.stringify(L)); } catch (e) {} };

    /* ---------- time <-> x ---------- */
    let data = [], signals = [], ranges = [], breakouts = [], rangeNow = null, tfNow = 3600, offNow = 0, lastBars = [];
    function idxOf(t) {
      const n = data.length; if (!n) return null;
      if (t <= data[0].time) return 0;
      const last = data[n - 1].time;
      if (t >= last) { const step = n > 1 ? last - data[n - 2].time : tfNow; return n - 1 + (t - last) / step; }
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (data[m].time <= t) lo = m; else hi = m; }
      return lo + (t - data[lo].time) / (data[hi].time - data[lo].time);
    }
    function timeAt(logical) {
      const n = data.length; if (!n || logical == null) return null;
      const i = Math.floor(logical);
      if (i >= n - 1) { const step = n > 1 ? data[n - 1].time - data[n - 2].time : tfNow; return data[n - 1].time + (logical - (n - 1)) * step; }
      if (i < 0) return data[0].time;
      return data[i].time + (logical - i) * (data[i + 1].time - data[i].time);
    }
    // logicalToCoordinate only takes whole bar numbers (a fraction returns 0), so interpolate between bars
    const xAt = i => { if (i == null) return null; const f = Math.floor(i), a = ts.logicalToCoordinate(f); if (a == null) return null; if (i === f) return a; const b = ts.logicalToCoordinate(f + 1); return b == null ? a : a + (i - f) * (b - a); };
    const xOf = t => xAt(idxOf(t));
    const barIdx = t => { const i = idxOf(t); return i == null ? null : Math.floor(i); };
    const xBar = t => { const i = barIdx(t); return i == null ? null : xAt(i); };
    const yOf = p => series.priceToCoordinate(p);

    /* ---------- auto ranges ---------- */
    function findRanges() {
      ranges = []; breakouts = []; rangeNow = null;
      const B = data, n = B.length; if (n < 60) return;
      const tr = B.map((b, i) => i ? Math.max(b.high - b.low, Math.abs(b.high - B[i - 1].close), Math.abs(b.low - B[i - 1].close)) : b.high - b.low);
      const atr = []; let s = 0; tr.forEach((x, i) => { s += x; if (i >= 50) s -= tr[i - 50]; atr.push(s / Math.min(i + 1, 50)); });
      const LEN = 24, K = 3.2; let i = Math.max(1, n - 700);
      while (i < n - LEN) {
        let hi = B[i].high, lo = B[i].low, j = i;
        while (j + 1 < n) { const h2 = Math.max(hi, B[j + 1].high), l2 = Math.min(lo, B[j + 1].low); if (h2 - l2 > K * atr[i]) break; hi = h2; lo = l2; j++; }
        if (j - i + 1 >= LEN) {
          const r = { t1: B[i].time, t2: B[j].time, hi, lo, open: j === n - 1 }; ranges.push(r);
          if (r.open) rangeNow = r;
          else { const k = j + 1, d = B[k].close > hi ? 1 : B[k].close < lo ? -1 : 0; if (d) breakouts.push({ t: B[k].time, d, p: d === 1 ? B[k].high : B[k].low }); }
          i = j + 1;
        } else i++;
      }
    }

    /* ---------- fade-in for zones (state indication, 260ms ease-out) ---------- */
    let zA = 1, zT0 = 0;
    function fadeZones() {
      if (reduced()) { zA = 1; return redraw(); }
      zT0 = performance.now(); zA = 0;
      const step = now => { const k = Math.min(1, (now - zT0) / 260); zA = 1 - Math.pow(1 - k, 3); redraw(); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }

    /* ---------- auto-analysis (drawn by the Analyze button) ---------- */
    // A = { zones, lines, hlines, boxes, marks, swings, plan }. Items draw on one after another, then stay.
    let AN = null, anP = 1, anT0 = 0, beam = -1;
    const AN_MS = 2600;
    function animateAnalysis() {
      if (reduced()) { anP = 1; beam = -1; return redraw(); }
      anT0 = performance.now(); anP = 0;
      const step = now => { const k = Math.min(1, (now - anT0) / AN_MS); anP = k; beam = k < .45 ? k / .45 : -1; redraw(); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }
    // eased progress of item i out of n (each item starts a little after the one before it)
    const itemP = (i, n) => { const st = .12 + .62 * (n > 1 ? i / (n - 1) : 0), k = Math.max(0, Math.min(1, (anP - st) / .2)); return 1 - Math.pow(1 - k, 3); };
    function pill(c, hr, vr, x, y, text, bg, fg, align) {
      const pad = 5, w = c.measureText(text).width / hr + pad * 2, h = 16;
      let x0 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
      c.fillStyle = bg; c.beginPath();
      if (c.roundRect) c.roundRect(x0 * hr, (y - h / 2) * vr, w * hr, h * vr, 4 * hr); else c.rect(x0 * hr, (y - h / 2) * vr, w * hr, h * vr);
      c.fill(); c.fillStyle = fg; c.textBaseline = 'middle'; c.fillText(text, (x0 + pad) * hr, y * vr); c.textBaseline = 'top';
      return w;
    }
    function drawAnalysis(c, hr, vr, W, H) {
      if (!AN) return;
      const col = k => ({ up: css('--up'), down: css('--down'), blue: css('--blue'), amber: css('--amber'), cyan: css('--cyan'), ink: css('--ink'), muted: css('--muted') }[k] || k);
      const right = W / hr - 2, lastX = data.length ? xAt(data.length - 1) : right;
      const all = [...(AN.boxes || []).map(x => ['box', x]), ...(AN.zones || []).map(x => ['zone', x]), ...(AN.hlines || []).map(x => ['h', x]), ...(AN.lines || []).map(x => ['line', x]), ...(AN.swings || []).map(x => ['sw', x]), ...(AN.marks || []).map(x => ['mark', x])];
      const n = all.length + 1;
      c.font = `600 ${10.5 * vr}px "Geist Mono", ui-monospace, monospace`;
      all.forEach(([kind, it], i) => {
        const k = itemP(i, n); if (k <= 0) return;
        const cl = col(it.color || 'blue');
        if (kind === 'zone') {
          const x1 = it.t ? Math.max(0, xOf(it.t) ?? 0) : 0, y1 = yOf(it.top), y2 = yOf(it.bot); if (y1 == null || y2 == null) return;
          const x2 = x1 + (right - x1) * k;
          c.globalAlpha = .13 * k; c.fillStyle = cl; c.fillRect(x1 * hr, y1 * vr, (x2 - x1) * hr, Math.max(2, y2 - y1) * vr);
          c.globalAlpha = .55 * k; c.strokeStyle = cl; c.lineWidth = hr; c.setLineDash([]); c.beginPath(); c.moveTo(x1 * hr, y1 * vr); c.lineTo(x2 * hr, y1 * vr); c.moveTo(x1 * hr, y2 * vr); c.lineTo(x2 * hr, y2 * vr); c.stroke();
          if (k > .6) { c.globalAlpha = Math.min(1, (k - .6) / .4); c.fillStyle = cl; c.textBaseline = 'bottom'; c.fillText(it.label, (Math.max(x1, 4) + 4) * hr, (y1 - 2) * vr); c.textBaseline = 'top'; }
        } else if (kind === 'box') {
          const x1 = xOf(it.t1), x2f = it.t2 ? xOf(it.t2) : lastX, y1 = yOf(it.top), y2 = yOf(it.bot); if ([x1, x2f, y1, y2].some(v => v == null)) return;
          const x2 = x1 + (x2f - x1) * k;
          c.globalAlpha = .1 * k; c.fillStyle = cl; c.fillRect(x1 * hr, y1 * vr, (x2 - x1) * hr, (y2 - y1) * vr);
          c.globalAlpha = .8 * k; c.strokeStyle = cl; c.lineWidth = hr; c.setLineDash([3 * hr, 3 * hr]); c.strokeRect(x1 * hr, y1 * vr, (x2 - x1) * hr, (y2 - y1) * vr); c.setLineDash([]);
          c.globalAlpha = k; c.fillStyle = cl; c.fillText(it.label, (x1 + 4) * hr, (y1 + 3) * vr);
        } else if (kind === 'h') {
          const y = yOf(it.p); if (y == null) return;
          const x1 = it.t ? (xOf(it.t) ?? 0) : 0, x2 = x1 + (right - x1) * k;
          c.globalAlpha = .9 * k; c.strokeStyle = cl; c.lineWidth = (it.w || 1.2) * hr; c.setLineDash(it.dash ? [6 * hr, 4 * hr] : []); c.beginPath(); c.moveTo(x1 * hr, y * vr); c.lineTo(x2 * hr, y * vr); c.stroke(); c.setLineDash([]);
          if (k > .6) { c.globalAlpha = Math.min(1, (k - .6) / .4); c.fillStyle = cl; c.textBaseline = 'bottom'; c.fillText(it.label, Math.max(4, Math.min(lastX - c.measureText(it.label).width / hr - 6, x1 + 6)) * hr, (y - 2) * vr); c.textBaseline = 'top'; }
        } else if (kind === 'line') {
          const xa = xOf(it.a.t), ya = yOf(it.a.p), xb = xOf(it.b.t), yb = yOf(it.b.p); if ([xa, ya, xb, yb].some(v => v == null) || xb === xa) return;
          const slope = (yb - ya) / (xb - xa), xe = it.extend ? right : xb, ye = ya + slope * (xe - xa);
          const xk = xa + (xe - xa) * k, yk = ya + (ye - ya) * k;
          c.globalAlpha = .95; c.strokeStyle = cl; c.lineWidth = 1.6 * hr; c.beginPath(); c.moveTo(xa * hr, ya * vr); c.lineTo(xk * hr, yk * vr); c.stroke();
          for (const [xx, yy] of [[xa, ya], [xb, yb]]) if (xx <= xk + .5) { c.fillStyle = cl; c.beginPath(); c.arc(xx * hr, yy * vr, 3 * hr, 0, 7); c.fill(); }
          if (k > .7) { c.globalAlpha = Math.min(1, (k - .7) / .3); const lx = xa + (xe - xa) * .55, ly = ya + slope * (lx - xa); c.fillStyle = cl; c.save(); c.translate(lx * hr, ly * vr); c.rotate(Math.atan2(slope * vr, hr)); c.textBaseline = 'bottom'; c.fillText(it.label, 0, -3 * vr); c.restore(); c.textBaseline = 'top'; }
        } else if (kind === 'sw') {
          const x = xBar(it.t), y = yOf(it.p); if (x == null || y == null) return;
          c.globalAlpha = k; c.fillStyle = cl; c.textBaseline = it.top ? 'bottom' : 'top'; const w = c.measureText(it.text).width / hr; c.fillText(it.text, (x - w / 2) * hr, (it.top ? y - 4 : y + 4) * vr); c.textBaseline = 'top';
        } else if (kind === 'mark') {
          const x = xBar(it.t), y = yOf(it.p); if (x == null || y == null) return;
          const dy = it.up ? 1 : -1, yy = y + dy * (14 + 10 * (1 - k));
          c.globalAlpha = k; c.fillStyle = cl; c.beginPath(); c.moveTo(x * hr, (y + dy * 3) * vr); c.lineTo((x - 5) * hr, (y + dy * 10) * vr); c.lineTo((x + 5) * hr, (y + dy * 10) * vr); c.closePath(); c.fill();
          pill(c, hr, vr, x, yy + dy * 8, it.text, alpha(cl, .92), '#0B0E14', 'center');
        }
      });
      // the plan: a position box to the right of the last candle (TradingView long/short tool)
      const P = AN.plan; const kp = itemP(n - 1, n);
      if (P && kp > 0 && data.length) {
        const ye = yOf(P.entry), ys = yOf(P.stop), yt = P.tgt != null ? yOf(P.tgt) : null; if (ye == null || ys == null) return;
        const x1 = lastX + 6, x2 = Math.max(x1 + 60, right - 64), xm = x1 + (x2 - x1) * kp, up = css('--up'), down = css('--down');
        c.globalAlpha = .26 * kp; c.fillStyle = down; c.fillRect(x1 * hr, Math.min(ye, ys) * vr, (xm - x1) * hr, Math.abs(ys - ye) * vr);
        if (yt != null) { c.fillStyle = up; c.fillRect(x1 * hr, Math.min(ye, yt) * vr, (xm - x1) * hr, Math.abs(yt - ye) * vr); }
        c.globalAlpha = kp; c.strokeStyle = css('--ink'); c.lineWidth = 1.5 * hr; c.setLineDash(P.wait ? [5 * hr, 4 * hr] : []); c.beginPath(); c.moveTo(x1 * hr, ye * vr); c.lineTo(xm * hr, ye * vr); c.stroke(); c.setLineDash([]);
        if (kp > .5) {
          c.globalAlpha = Math.min(1, (kp - .5) / .5);
          pill(c, hr, vr, x1 + 4, ye + (P.side > 0 ? 11 : -11), `${P.side > 0 ? 'BUY' : 'SELL'} ${P.wait ? 'above' : '@'} ${fmtP(P.entry)}`.replace('above', P.side > 0 ? 'above' : 'below'), alpha(css('--ink'), .92), '#0B0E14');
          pill(c, hr, vr, x1 + 4, ys + (P.side > 0 ? 10 : -10), `SL ${fmtP(P.stop)}`, alpha(down, .92), '#0B0E14');
          if (yt != null) pill(c, hr, vr, x1 + 4, yt + (P.side > 0 ? -10 : 10), `TP ${fmtP(P.tgt)}${P.rr ? '  ' + P.rr : ''}`, alpha(up, .92), '#0B0E14');
          else if (P.note) pill(c, hr, vr, x1 + 4, ye + (P.side > 0 ? -12 : 12), P.note, alpha(up, .92), '#0B0E14');
        }
      }
      c.globalAlpha = 1;
    }

    /* ---------- the drawing layer ---------- */
    let preview = null, tool = 'cursor', anchor = null;
    const layer = {
      _view: { zOrder: () => 'normal', renderer: () => ({ draw(target) {
        target.useBitmapCoordinateSpace(({ context: c, horizontalPixelRatio: hr, verticalPixelRatio: vr, bitmapSize }) => {
          const W = bitmapSize.width, up = css('--up'), down = css('--down'), blue = css('--blue'), ink = css('--ink'), amber = css('--amber'), muted = css('--muted');
          c.font = `${11 * vr}px "Geist Mono", ui-monospace, monospace`; c.textBaseline = 'top';
          const vis = ts.getVisibleLogicalRange(), dim = AN ? .35 : 1;
          // ranges
          if (L.ranges && !AN) {
            for (const r of ranges) {
              const x1 = xOf(r.t1), x2 = r.open ? W / hr : xOf(r.t2), y1 = yOf(r.hi), y2 = yOf(r.lo);
              if ([x1, x2, y1, y2].some(v => v == null)) continue;
              c.globalAlpha = r.open ? .14 : .07; c.fillStyle = amber; c.fillRect(x1 * hr, y1 * vr, (x2 - x1) * hr, (y2 - y1) * vr); c.globalAlpha = .75;
              c.setLineDash([4 * hr, 4 * hr]); c.strokeStyle = amber; c.lineWidth = hr; c.strokeRect(x1 * hr, y1 * vr, (x2 - x1) * hr, (y2 - y1) * vr); c.setLineDash([]); c.globalAlpha = 1;
              c.fillStyle = amber; c.fillText(r.open ? 'SIDEWAYS NOW' : 'RANGE', x1 * hr + 4 * hr, y1 * vr + 3 * vr);
            }
            for (const b of breakouts) { const x = xBar(b.t), y = yOf(b.p); if (x == null || y == null) continue; c.fillStyle = b.d === 1 ? up : down; c.fillText(b.d === 1 ? '▲ breakout' : '▼ breakout', x * hr - 28 * hr, (b.d === 1 ? y - 16 : y + 5) * vr); }
          }
          // trade zones, like TradingView's long / short position tool
          if (L.zones) for (const s of signals) {
            const i1 = barIdx(s.t - 1); if (i1 == null) continue;
            const live = s.R == null, i2 = live ? null : barIdx(s.exitT - 1);
            if (vis && ((i2 != null && i2 < vis.from - 1) || i1 > vis.to + 1)) continue;
            const x1 = xAt(i1), x2 = live ? W / hr : xAt(Math.max(i1 + 1, i2));
            if (x1 == null || x2 == null) continue;
            const ye = yOf(s.e), stop = live && s.liveStop != null ? s.liveStop : s.stop, ys = yOf(stop);
            const reward = s.tgt != null ? s.tgt : (!live && s.R > 0 ? s.exit : null), yt = reward == null ? null : yOf(reward);
            if (ye == null || ys == null) continue;
            c.globalAlpha = dim * zA * (live ? .22 : .085); c.fillStyle = down; c.fillRect(x1 * hr, Math.min(ye, ys) * vr, (x2 - x1) * hr, Math.abs(ys - ye) * vr);
            if (yt != null) { c.fillStyle = up; c.fillRect(x1 * hr, Math.min(ye, yt) * vr, (x2 - x1) * hr, Math.abs(yt - ye) * vr); }
            c.globalAlpha = dim * zA * .8; c.strokeStyle = ink; c.lineWidth = hr; c.beginPath(); c.moveTo(x1 * hr, ye * vr); c.lineTo(x2 * hr, ye * vr); c.stroke();
            if (!live && s.exit != null) { const yx = yOf(s.exit); if (yx != null) { c.fillStyle = s.R > 0 ? up : down; c.beginPath(); c.arc(x2 * hr, yx * vr, 3.5 * hr, 0, 7); c.fill(); } }
            if (live) {
              c.globalAlpha = zA; c.fillStyle = ink;
              const lab = [[s.e, 'ENTRY ' + fmtP(s.e), ink], [stop, (s.tgt == null ? 'TRAILING STOP ' : 'STOP ') + fmtP(stop), down]];
              if (s.tgt != null) lab.push([s.tgt, 'TARGET ' + fmtP(s.tgt), up]);
              for (const [p, t, col] of lab) { const yy = yOf(p); if (yy == null) continue; c.fillStyle = col; c.fillText(t, x1 * hr + 6 * hr, yy * vr + (p === s.e ? 3 : -15) * vr); }
            }
            c.globalAlpha = 1;
          }
          // your drawings
          c.lineWidth = 1.6 * hr;
          const seg = (a, b, colr) => { const x1 = xOf(a.t), x2 = xOf(b.t), y1 = yOf(a.p), y2 = yOf(b.p); if ([x1, x2, y1, y2].some(v => v == null)) return; c.strokeStyle = colr; c.beginPath(); c.moveTo(x1 * hr, y1 * vr); c.lineTo(x2 * hr, y2 * vr); c.stroke(); for (const [xx, yy] of [[x1, y1], [x2, y2]]) { c.fillStyle = colr; c.beginPath(); c.arc(xx * hr, yy * vr, 3 * hr, 0, 7); c.fill(); } };
          const box = (a, b, colr) => { const x1 = xOf(a.t), x2 = xOf(b.t), y1 = yOf(a.p), y2 = yOf(b.p); if ([x1, x2, y1, y2].some(v => v == null)) return; c.globalAlpha = .12; c.fillStyle = colr; c.fillRect(x1 * hr, y1 * vr, (x2 - x1) * hr, (y2 - y1) * vr); c.globalAlpha = 1; c.strokeStyle = colr; c.strokeRect(x1 * hr, y1 * vr, (x2 - x1) * hr, (y2 - y1) * vr); };
          for (const l of store.t) seg(l.a, l.b, blue);
          for (const r of store.b) box(r.a, r.b, blue);
          if (preview && anchor) { c.globalAlpha = .7; (tool === 'trend' ? seg : box)(anchor, preview, blue); c.globalAlpha = 1; }
          c.globalAlpha = 1; void muted;
          drawAnalysis(c, hr, vr, W, bitmapSize.height);
          // scanning beam while the analysis draws
          if (beam >= 0) {
            const bx = beam * W, g = c.createLinearGradient(bx - 90 * hr, 0, bx, 0);
            g.addColorStop(0, 'rgba(94,234,212,0)'); g.addColorStop(1, 'rgba(94,234,212,.22)');
            c.globalAlpha = 1; c.fillStyle = g; c.fillRect(bx - 90 * hr, 0, 90 * hr, bitmapSize.height);
            c.fillStyle = 'rgba(94,234,212,.9)'; c.fillRect(bx, 0, 1.5 * hr, bitmapSize.height);
          }
        });
      } }) },
      attached({ requestUpdate }) { this.req = requestUpdate; }, detached() {},
      paneViews() { return [this._view]; }, updateAllViews() {}
    };
    series.attachPrimitive(layer);
    const redraw = () => layer.req && layer.req();

    /* ---------- markers (native, so they sit exactly on the signal candle) ---------- */
    function setMarkers() {
      if (!L.signals || !data.length || AN) { series.setMarkers([]); return; }
      const m = [];
      for (const s of signals) {
        const i = barIdx(s.t - 1); if (i == null || i < 0 || i >= data.length) continue;
        const buy = s.d === 1, res = s.R == null ? 'open' : (s.R > 0 ? '+' : '') + s.R.toFixed(1) + 'R';
        m.push({ time: data[i].time, position: buy ? 'belowBar' : 'aboveBar', shape: buy ? 'arrowUp' : 'arrowDown', color: buy ? css('--up') : css('--down'), text: `${buy ? 'BUY' : 'SELL'} ${s.short || ''} ${res}`.replace(/\s+/g, ' ') });
      }
      m.sort((a, b) => a.time - b.time);
      series.setMarkers(m);
    }

    /* ---------- lines: your horizontal lines + live breakout levels ---------- */
    let hRefs = [], trigRefs = [], triggers = [];
    function drawH() { hRefs.forEach(r => { try { series.removePriceLine(r); } catch (e) {} }); hRefs = store.h.map(p => series.createPriceLine({ price: p, color: css('--blue'), lineWidth: 1, lineStyle: 0, axisLabelVisible: true, title: 'my line' })); }
    function drawTriggers() {
      trigRefs.forEach(r => { try { series.removePriceLine(r); } catch (e) {} }); trigRefs = [];
      if (!L.levels) return;
      trigRefs = triggers.map(t => series.createPriceLine({ price: t.price, color: t.color, lineWidth: t.strong ? 2 : 1, lineStyle: t.strong ? 0 : 2, axisLabelVisible: true, title: t.title }));
    }
    const overlays = new Map(); let overlayList = [];
    function drawOverlays() {
      const want = new Set(L.levels ? overlayList.map(o => o.id) : []);
      for (const [id, s] of overlays) if (!want.has(id)) { chart.removeSeries(s); overlays.delete(id); }
      if (!L.levels) return;
      for (const o of overlayList) {
        let s = overlays.get(o.id);
        if (!s) { s = chart.addLineSeries({ lineWidth: o.width || 1, lineStyle: o.style || 0, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false, lineType: o.step ? 1 : 0, autoscaleInfoProvider: () => null }); overlays.set(o.id, s); }
        s.applyOptions({ color: o.color, lineWidth: o.width || 1, lineStyle: o.style || 0 });
        s.setData(o.data);
      }
    }

    /* ---------- legend (OHLC of the candle under the cursor, TradingView style) ---------- */
    function showLegend(b) {
      if (!legend || !b) return;
      const ch = b.close - b.open, pc = ch / b.open * 100, col = ch >= 0 ? 'var(--up)' : 'var(--down)';
      legend.innerHTML = `<span>O <b>${fmtP(b.open)}</b></span><span>H <b>${fmtP(b.high)}</b></span><span>L <b>${fmtP(b.low)}</b></span><span>C <b style="color:${col}">${fmtP(b.close)}</b></span><span style="color:${col}">${ch >= 0 ? '+' : ''}${pc.toFixed(2)}%</span>`;
    }
    chart.subscribeCrosshairMove(p => {
      if (anchor) { const pt = pointOf(p); if (pt) { preview = pt; redraw(); } }
      const b = p && p.seriesData && p.seriesData.get(series);
      showLegend(b || data[data.length - 1]);
    });

    /* ---------- tools (left rail) ---------- */
    tools.innerHTML = `<span class="tool-ink" aria-hidden="true"></span>
      <button type="button" data-tool="cursor" aria-pressed="true" title="Move the chart">${svg('cursor')}</button>
      <button type="button" data-tool="hline" aria-pressed="false" title="Horizontal line: tap a price">${svg('hline')}</button>
      <button type="button" data-tool="trend" aria-pressed="false" title="Trend line: tap two points">${svg('trend')}</button>
      <button type="button" data-tool="box" aria-pressed="false" title="Box: tap two corners">${svg('box')}</button>
      <span class="sep" aria-hidden="true"></span>
      <button type="button" data-act="undo" title="Undo last drawing">${svg('undo')}</button>
      <button type="button" data-act="clear" title="Clear all drawings (tap twice)">${svg('clear')}</button>
      <button type="button" data-act="fit" title="Reset the view">${svg('fit')}</button>`;
    const ink = tools.querySelector('.tool-ink');
    const HINTS = { cursor: '', hline: 'Tap a price on the chart.', trend: 'Tap the first point, then the second.', box: 'Tap one corner, then the opposite corner.' };
    function moveInk() { const b = tools.querySelector(`[data-tool="${tool}"]`); if (b && ink) ink.style.transform = `translate(${b.offsetLeft}px, ${b.offsetTop}px)`; }
    function setTool(t) {
      tool = t; anchor = null; preview = null;
      tools.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === t));
      moveInk(); hint.textContent = HINTS[t]; hint.classList.toggle('on', !!HINTS[t]); el.style.cursor = t === 'cursor' ? '' : 'crosshair';
      chart.applyOptions({ handleScroll: t === 'cursor', handleScale: t === 'cursor' }); redraw();
    }
    tools.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.tool) return setTool(b.dataset.tool);
      if (b.dataset.act === 'undo') { const last = store._order.pop(); if (last) store[last].pop(); save(); drawH(); redraw(); }
      if (b.dataset.act === 'fit') { fitted = false; api.ensureFit(); }
      if (b.dataset.act === 'clear') {
        if (b.dataset.armed) { store = { h: [], t: [], b: [], _order: [] }; save(); drawH(); redraw(); delete b.dataset.armed; b.classList.remove('armed'); hint.textContent = ''; hint.classList.remove('on'); }
        else { b.dataset.armed = '1'; b.classList.add('armed'); hint.textContent = 'Tap the bin again to clear your drawings.'; hint.classList.add('on'); setTimeout(() => { delete b.dataset.armed; b.classList.remove('armed'); if (tool === 'cursor') { hint.textContent = ''; hint.classList.remove('on'); } }, 3000); }
      }
    });
    new ResizeObserver(moveInk).observe(tools);
    const pointOf = p => { if (!p || !p.point) return null; const t = timeAt(ts.coordinateToLogical(p.point.x)), price = series.coordinateToPrice(p.point.y); return t == null || price == null ? null : { t, p: price }; };
    chart.subscribeClick(p => {
      if (tool === 'cursor') return;
      const pt = pointOf(p); if (!pt) return;
      if (tool === 'hline') { store.h.push(pt.p); store._order.push('h'); save(); drawH(); setTool('cursor'); return; }
      if (!anchor) { anchor = pt; hint.textContent = 'Now tap the second point.'; return; }
      const k = tool === 'trend' ? 't' : 'b'; store[k].push({ a: anchor, b: pt }); store._order.push(k); save(); setTool('cursor');
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && tool !== 'cursor') setTool('cursor'); });

    /* ---------- layers (chips under the chart) ---------- */
    layersEl.querySelectorAll('[data-layer]').forEach(b => b.setAttribute('aria-pressed', !!L[b.dataset.layer]));
    layersEl.addEventListener('click', e => {
      const b = e.target.closest('[data-layer]'); if (!b) return;
      const k = b.dataset.layer; L[k] = !L[k]; b.setAttribute('aria-pressed', L[k]); saveL();
      if (k === 'signals') setMarkers();
      if (k === 'levels') { drawTriggers(); drawOverlays(); }
      if (k === 'volume') vol.applyOptions({ visible: L.volume });
      if (k === 'zones') fadeZones();
      updateChip(); redraw();
    });
    vol.applyOptions({ visible: L.volume });
    function updateChip() {
      if (!chip) return; chip.hidden = !L.ranges;
      chip.textContent = rangeNow ? `Sideways now: ${fmtP(rangeNow.lo)} to ${fmtP(rangeNow.hi)}` : 'Not in a sideways range';
      chip.dataset.tone = rangeNow ? 'yellow' : 'grey';
    }

    let lastKey = '', fitted = false, sigKey = '', posRefs = [], posKey = '';
    const api = {
      chart, series,
      setBars(bars, offset, tf) {
        const tfChanged = tf !== tfNow; tfNow = tf; offNow = offset; lastBars = bars;
        const k = tf + ':' + bars.length + ':' + (bars.length ? bars[bars.length - 1].t + ':' + bars[bars.length - 1].c : 0) + ':' + offset.toFixed(2);
        if (k === lastKey && !tfChanged) return;
        data = bars.map(b => ({ time: b.t, open: b.o + offset, high: b.h + offset, low: b.l + offset, close: b.c + offset }));
        series.setData(data);
        const upA = alpha(css('--up'), .32), dnA = alpha(css('--down'), .32);
        vol.setData(bars.map(b => ({ time: b.t, value: b.v || 0, color: b.c >= b.o ? upA : dnA })));
        pulse.setData(data.map(d => ({ time: d.time, value: d.close })));
        if (tfChanged || !lastKey) {
          if (tfChanged) fitted = false;
          if (!reduced()) { el.classList.remove('wipe'); void el.offsetWidth; el.classList.add('wipe'); }
        }
        if (lastKey.split(':')[1] !== String(bars.length) || tfChanged) { findRanges(); updateChip(); }
        lastKey = k; api.ensureFit(); setMarkers(); showLegend(data[data.length - 1]); redraw();
      },
      setSignals(list) {
        signals = list; setMarkers();
        const k = list.map(s => s.t + ':' + s.R + ':' + s.liveStop).join('|');
        if (k !== sigKey) { sigKey = k; fadeZones(); } else redraw();
      },
      setTriggers(list) { triggers = list; drawTriggers(); },
      setPositions(list) {
        const k = JSON.stringify(list); if (k === posKey) return; posKey = k;
        posRefs.forEach(r => { try { series.removePriceLine(r); } catch (e) {} }); posRefs = [];
        for (const p of list) {
          posRefs.push(series.createPriceLine({ price: p.entry, color: css('--blue'), lineWidth: 2, lineStyle: 0, axisLabelVisible: true, title: p.label }));
          posRefs.push(series.createPriceLine({ price: p.sl, color: css('--down'), lineWidth: 1, lineStyle: 1, axisLabelVisible: true, title: 'SL' }));
          if (p.tp != null) posRefs.push(series.createPriceLine({ price: p.tp, color: css('--up'), lineWidth: 1, lineStyle: 1, axisLabelVisible: true, title: 'TP' }));
        }
      },
      setOverlays(list) { overlayList = list; drawOverlays(); },
      setAnalysis(A, animate) {
        AN = A; ts.applyOptions({ rightOffset: A ? 26 : 8 }); setMarkers();
        if (A && animate) { api.refit(); animateAnalysis(); } else { anP = 1; redraw(); }
      },
      hasAnalysis() { return !!AN; },
      ensureFit() { if (fitted || !el.clientWidth || !data.length) return; const n = Math.round(Math.min(160, Math.max(50, el.clientWidth / 7))); ts.setVisibleLogicalRange({ from: Math.max(0, data.length - n), to: data.length + (AN ? 24 : 6) }); fitted = true; },
      refit() { fitted = false; api.ensureFit(); },
      retheme() {
        chart.applyOptions(theme());
        series.applyOptions({ upColor: css('--up'), downColor: css('--down'), wickUpColor: css('--up'), wickDownColor: css('--down'), priceLineColor: css('--gold') });
        pulse.applyOptions({ color: css('--gold') });
        lastKey = ''; if (lastBars.length) api.setBars(lastBars, offNow, tfNow);
        drawH(); drawTriggers(); setMarkers(); redraw();
      },
      init() { drawH(); requestAnimationFrame(moveInk); }
    };
    return api;
  }
  root.DeskChart = { create };
})(window);

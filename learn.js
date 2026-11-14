/* Learn: lessons + quizzes, a "Buy, Sell or Wait?" drill on real gold history, your trade journal review,
   and the "ready for real money / funded" tracker that grades your demo trading against prop-firm style rules. */
(function (root) {
  'use strict';
  const B = root.Brain; if (!B) return;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const dfmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const when = t => dfmt.format(new Date(t * 1000)).replace(/\./g, '');

  /* ---------------- lessons ---------------- */
  const SVG = {
    candle: `<svg viewBox="0 0 220 110"><g stroke-width="2"><line x1="40" y1="12" x2="40" y2="98" stroke="var(--up)"/><rect x="28" y="30" width="24" height="46" rx="3" fill="var(--up)"/><line x1="110" y1="16" x2="110" y2="96" stroke="var(--down)"/><rect x="98" y="34" width="24" height="40" rx="3" fill="var(--down)"/></g><g font-size="10" fill="var(--muted)"><text x="60" y="34">close</text><text x="60" y="78">open</text><text x="130" y="38">open</text><text x="130" y="76">close</text><text x="150" y="20">high = top of wick</text><text x="150" y="98">low = bottom</text></g></svg>`,
    trend: `<svg viewBox="0 0 220 110"><polyline points="10,95 45,60 65,75 105,38 125,52 165,18 185,30 210,10" fill="none" stroke="var(--up)" stroke-width="2.5"/><g font-size="10" font-weight="600"><text x="98" y="32" fill="var(--up)">HH</text><text x="60" y="88" fill="var(--up)">HL</text><text x="158" y="13" fill="var(--up)">HH</text><text x="119" y="66" fill="var(--up)">HL</text></g></svg>`,
    sr: `<svg viewBox="0 0 220 110"><rect x="0" y="18" width="220" height="12" fill="var(--down)" opacity=".18"/><rect x="0" y="78" width="220" height="12" fill="var(--up)" opacity=".18"/><polyline points="5,60 30,26 50,70 75,84 100,40 120,24 140,64 160,82 185,50 215,10" fill="none" stroke="var(--ink)" stroke-width="2"/><text x="6" y="14" font-size="10" fill="var(--down)">resistance</text><text x="6" y="104" font-size="10" fill="var(--up)">support</text><text x="168" y="12" font-size="10" fill="var(--gold)">breakout</text></svg>`,
    risk: `<svg viewBox="0 0 220 110"><rect x="40" y="20" width="140" height="40" fill="var(--up)" opacity=".22"/><rect x="40" y="60" width="140" height="20" fill="var(--down)" opacity=".25"/><line x1="40" y1="60" x2="180" y2="60" stroke="var(--ink)" stroke-width="2"/><g font-size="10"><text x="186" y="24" fill="var(--up)">target +2R</text><text x="186" y="63" fill="var(--ink)">entry</text><text x="186" y="83" fill="var(--down)">stop -1R</text></g></svg>`,
    qb: `<svg viewBox="0 0 220 110"><line x1="0" y1="40" x2="150" y2="40" stroke="var(--cyan)" stroke-dasharray="4 4"/><line x1="0" y1="70" x2="150" y2="70" stroke="var(--cyan)" stroke-dasharray="4 4"/><polyline points="5,55 20,48 35,62 50,50 65,60 80,52 95,58 110,50 125,56 140,48 160,22 180,14 200,20 215,8" fill="none" stroke="var(--ink)" stroke-width="2"/><text x="6" y="34" font-size="10" fill="var(--cyan)">20-hour high</text><text x="40" y="94" font-size="10" fill="var(--muted)">calm, small candles</text><text x="150" y="44" font-size="10" fill="var(--up)">BUY on the close</text></svg>`,
    trendrider: `<svg viewBox="0 0 220 110"><path d="M0 92 C60 86 120 70 220 40" fill="none" stroke="var(--gold)" stroke-width="2"/><polyline points="0,80 30,70 50,76 80,56 100,62 130,40 150,46 180,24 210,18" fill="none" stroke="var(--ink)" stroke-width="2"/><line x1="70" y1="54" x2="140" y2="54" stroke="var(--cyan)" stroke-dasharray="4 4"/><text x="6" y="104" font-size="10" fill="var(--gold)">200 average</text><text x="140" y="60" font-size="10" fill="var(--cyan)">7-day high</text></svg>`,
    london: `<svg viewBox="0 0 220 110"><rect x="10" y="40" width="90" height="30" fill="var(--gold)" opacity=".15" stroke="var(--gold)" stroke-dasharray="3 3"/><polyline points="12,55 30,46 45,64 60,50 80,60 98,52 120,34 140,26 160,30 190,14" fill="none" stroke="var(--ink)" stroke-width="2"/><text x="14" y="36" font-size="10" fill="var(--gold)">Asian range 8 PM-2 AM</text><text x="112" y="56" font-size="10" fill="var(--up)">break after 2 AM</text></svg>`,
    mind: `<svg viewBox="0 0 220 110"><g font-size="11"><text x="10" y="24" fill="var(--down)">loss → revenge trade → bigger loss</text><text x="10" y="52" fill="var(--muted)">vs</text><text x="10" y="80" fill="var(--up)">loss → 30 min break → next setup</text></g></svg>`
  };
  const LESSONS = [
    { id: 'l1', title: 'Candles and timeframes', min: 3, svg: 'candle', body: [
      'Each candle is one slice of time: on a 1-hour chart, one candle = one hour. It shows four prices: open, high, low and close.',
      'Green means it closed higher than it opened. Red means it closed lower. The thin lines (wicks) show how far price went before it came back.',
      'A candle can look like a breakout halfway through and then fall back. That\'s why every strategy on the desk only acts when the candle CLOSES.'],
      quiz: [['On a 4-hour chart, one candle covers…', ['4 minutes', '4 hours', '4 days'], 1, 'Each candle is one period of the chart\'s timeframe.'],
        ['Why does the desk wait for the candle to close?', ['To be slower on purpose', 'A candle can change completely before it closes', 'Because TradingView needs it'], 1, 'Mid-candle breakouts often fail. The close is the only price that\'s final.'],
        ['A long wick on top of a candle shows…', ['Price went up, then sellers pushed it back down', 'The candle closed at its high', 'Nothing'], 0, 'The wick is where price went but couldn\'t stay.']] },
    { id: 'l2', title: 'Trend and market structure', min: 4, svg: 'trend', body: [
      'An uptrend makes higher highs (HH) and higher lows (HL). A downtrend makes lower highs (LH) and lower lows (LL). The Analyze button labels these for you.',
      'The simplest trend filter: compare price with its 50-day average (gold) or 200-candle average (Bitcoin, 4-hour). Above means buys only, below means sells only.',
      'Every strategy that held up over 5 years uses a trend filter. The ones without one, like London Breakout on its own, lost money.'],
      quiz: [['Higher highs and higher lows mean…', ['Downtrend', 'Uptrend', 'No trend'], 1, 'Rising swing points = uptrend.'],
        ['Gold is below its 50-day average. The Quiet Breakout can…', ['Only buy', 'Only sell', 'Buy and sell'], 1, 'It only trades with the trend.'],
        ['What happened to London Breakout without a trend filter?', ['It made the most money', 'It lost money (-38R)', 'It was not tested'], 1, 'With the filter it made +23R. Without it, -38R.']] },
    { id: 'l3', title: 'Support, resistance, breakouts and sweeps', min: 4, svg: 'sr', body: [
      'Support is where buyers stepped in before. Resistance is where sellers did. The more swings at a level, the stronger it is.',
      'A breakout is a candle CLOSING through a level. A sweep is price poking through a level (taking out the stops sitting there) and closing back inside.',
      'TikTok loves sweeps, but in the 5-year gold test, trading every sweep lost money. Use levels as context and let a tested strategy decide the entry.'],
      quiz: [['A sweep is when price…', ['Closes far beyond a level', 'Pokes past a level and closes back inside', 'Never reaches the level'], 1, 'It sweeps the stops, then snaps back.'],
        ['A level touched 4 times is…', ['Weaker than one touched once', 'Stronger', 'The same'], 1, 'More reactions = more traders watching it.'],
        ['Did "trade every liquidity sweep" make money on gold over 5 years?', ['Yes, a lot', 'No, it lost money', 'It broke even'], 1, 'Every version tested lost money after costs.']] },
    { id: 'l4', title: 'Risk: R, stops and position size', min: 5, svg: 'risk', calc: true, body: [
      '"1R" is what you lose if the stop is hit. Risk 1% of the account per trade: on $10,000, 1R = $100.',
      'Put the stop where the idea is wrong (past a swing, or 2 to 3 × ATR away). Then size the trade so that stop distance costs exactly 1R: size = (account × 1%) ÷ stop distance.',
      'At 1% risk, ten losses in a row costs about 10%. At 5% risk it costs about 40%, and a prop firm would have closed your account long before that.'],
      quiz: [['$10,000 account, 1% risk, gold stop $20 away. How many ounces?', ['5 oz (0.05 lots)', '50 oz', '0.5 oz'], 0, '$100 ÷ $20 = 5 oz = 0.05 lots.'],
        ['A trade made +2R with 1R = $100. You made…', ['$2', '$200', '$20'], 1, '2 × $100.'],
        ['Where should the stop go?', ['A round number that feels safe', 'Where the trade idea is proven wrong', 'Very close so losses are small'], 1, 'Too-close stops get hit by noise.']] },
    { id: 'l5', title: 'Quiet Breakout (gold, 1-hour)', min: 4, svg: 'qb', body: [
      'Step 1: wait for calm. The average candle size (ATR) must be at or below its normal level.',
      'Step 2: trade the break. A 1-hour candle closes above the 20-hour high (buy, only above the 50-day average) or below the 20-hour low (sell, only below it).',
      'Step 3: let it run. The stop starts 3 × ATR away and trails behind the best close. There\'s no fixed target. Over 5 years: +77R after costs, worst drop -8R, and all 40 nearby settings made money.'],
      quiz: [['Quiet Breakout only trades when…', ['The market is calm first', 'News is out', 'The market is jumpy'], 0, 'Breakouts from calm stretches tend to run.'],
        ['Its target is…', ['2R fixed', 'None: the stop trails', '10R'], 1, 'Winners are left to run.'],
        ['Gold is above its 50-day average and closes below the 20-hour low. The trade is…', ['Sell', 'Buy', 'No trade (it would be against the trend)'], 2, 'Sells only happen below the 50-day average.']] },
    { id: 'l6', title: 'Trend Rider and Gold Trend (4-hour)', min: 3, svg: 'trendrider', body: [
      'Buys only, and only while price is above its 200-candle average.',
      'Buy when a 4-hour candle closes above the recent high (40 candles on Bitcoin, about 7 days; 20 on gold, about 3 days). Stop 3 × ATR below. Sell when a 4-hour candle closes below the recent low.',
      'It wins only about a third of the time on Bitcoin, but the average winner is about 3.4 times the average loser. Expect long quiet stretches, and that\'s normal.'],
      quiz: [['Trend Rider wins about…', ['90% of trades', 'a third of trades, with big winners', 'never'], 1, 'A low win rate is fine when winners are much bigger.'],
        ['Bitcoin is below its 200-candle average. Trend Rider…', ['Sells', 'Sits out', 'Buys more'], 1, 'It only buys uptrends.'],
        ['Why is ICC no longer used on Bitcoin?', ['It lost money in the 5-year test', 'Scott said so', 'It was too slow'], 0, 'ICC lost money on Bitcoin even with low fees.']] },
    { id: 'l7', title: 'London Breakout, and why most YouTube strategies fail', min: 4, svg: 'london', body: [
      'London Breakout: mark the Asian range (8 PM to 2 AM). From 2 AM to 10 AM, trade the first 15-minute close outside it, with the 50-day trend. Stop at the other side, target 2.5R, close by 2 PM.',
      'I tested the most popular YouTube and TikTok gold strategies on 5 years of data with real costs. NY opening range, liquidity sweeps, EMA 9/21, Bollinger + RSI and FVG retests all lost money.',
      'Why they fail: small stops mean costs eat a big part of every trade, and a video can show 5 great examples out of 500 trades. Only trust what survives a long test.'],
      quiz: [['The Asian range is marked from…', ['8 PM to 2 AM Toronto time', '9:30 to 10 AM', 'Noon to 1 PM'], 0, 'That\'s when Asia trades gold.'],
        ['The EMA 9/21 cross on gold over 5 years…', ['Made +87%', 'Lost money', 'Wasn\'t tested'], 1, 'It lost money in the desk\'s test, unlike the claims online.'],
        ['Why do small-stop strategies struggle?', ['Costs are a bigger part of each trade', 'They\'re too slow', 'Brokers ban them'], 0, 'A $0.60 cost on a $3 stop is 20% of your risk.']] },
    { id: 'l8', title: 'Your head, your journal, and prop firms', min: 4, svg: 'mind', body: [
      'Most blown accounts come from three habits: revenge trading after a loss, overtrading on boring days, and risking more to "win it back".',
      'Journal every trade: setup, why you took it, the stop and why it was there, and how you felt. The Coach reads your trades and flags these habits for you.',
      'Prop firm challenges usually want about +10% without losing 5% in a day or 10% in total. Most people fail in the first week. Pass the Challenge tracker on demo, more than once, before you pay for a real one.'],
      quiz: [['You just lost a trade. The best next move is…', ['Double the size to win it back', 'Take a break, then wait for the next real setup', 'Trade the opposite way'], 1, 'Revenge trades are the #1 account killer.'],
        ['A typical challenge daily loss limit is…', ['5%', '50%', 'No limit'], 0, 'Usually 3 to 5% of the starting balance.'],
        ['How many demo trades before your stats mean much?', ['3', 'At least 30', '1'], 1, 'Small samples lie.']] }
  ];

  /* ---------------- rendering ---------------- */
  let curLesson = null;
  function renderReady() {
    const r = B.readiness(), el = $('#readyCard'); if (!el) return;
    const C = 2 * Math.PI * 52, off = C * (1 - r.score / 100);
    $('#readyRing').innerHTML = `<svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" class="rtrack"/><circle cx="60" cy="60" r="52" class="rfill" style="stroke-dasharray:${C};stroke-dashoffset:${off}"/></svg><div><b class="mono">${r.score}</b><span>/ 100</span></div>`;
    $('#readyVerdict').textContent = r.verdict;
    $('#readyItems').innerHTML = r.items.map(x => `<li><i style="--w:${x.score}"></i><div><b>${esc(x.t)}</b><span>${esc(x.d)}</span></div></li>`).join('');
  }
  function renderChallenge() {
    const ch = B.challenge(), el = $('#chalCard'); if (!el) return;
    $('#chalRules').value = ch.C.rules;
    const R = ch.R, bars = [
      ['Profit', `${ch.profitPct >= 0 ? '+' : ''}${ch.profitPct.toFixed(1)}% of ${R.target}% target`, Math.max(0, Math.min(1, ch.profitPct / R.target)), 'up'],
      ['Worst day', `${ch.worstDayPct.toFixed(1)}% (limit -${R.daily}%)`, Math.min(1, -ch.worstDayPct / R.daily), 'down'],
      ['Lowest point', `${ch.lowPct.toFixed(1)}% (limit -${R.max}%)`, Math.min(1, -ch.lowPct / R.max), 'down'],
      ['Trading days', `${ch.days} of ${R.minDays} minimum`, Math.min(1, ch.days / R.minDays), 'up']
    ];
    if (R.bestDay) bars.push(['Best day share', `${ch.bestShare.toFixed(0)}% (must stay under ${R.bestDay}%)`, Math.min(1, ch.bestShare / R.bestDay), 'down']);
    $('#chalStatus').textContent = ch.status; $('#chalStatus').dataset.tone = ch.status === 'Passed' ? 'green' : ch.status === 'Failed' ? 'red' : ch.status === 'In progress' ? 'blue' : 'grey';
    $('#chalBars').innerHTML = bars.map(([k, d, w, c]) => `<li><div><b>${k}</b><span class="mono">${d}</span></div><div class="cbar" data-c="${c}"><i style="--w:${w}"></i></div></li>`).join('');
    $('#chalNote').textContent = ch.broke.length ? `Failed: ${ch.broke.join(' and ')}. Press "Start over" to try again. Failing on demo is free; that's the point.` : ch.C.start ? `Counting your demo trades (by hand and autopilot) closed since ${when(ch.C.start)}.` : 'Counting all your demo trades. Press "Start over" to begin a fresh attempt from now.';
  }
  function renderLessons() {
    const L = B.M.learn(), el = $('#lessonGrid'); if (!el) return;
    el.innerHTML = LESSONS.map((l, i) => `<button type="button" class="lesson ${L.lessons[l.id] ? 'done' : ''}" data-lesson="${l.id}" style="--i:${i}"><span class="lnum mono">${String(i + 1).padStart(2, '0')}</span><b>${esc(l.title)}</b><span class="small muted">${l.min} min${L.quiz[l.id] != null ? ` · quiz ${L.quiz[l.id]}%` : ''}</span>${L.lessons[l.id] ? '<span class="tag" data-tone="green">done</span>' : ''}</button>`).join('');
  }
  function openLesson(id) {
    const l = LESSONS.find(x => x.id === id); if (!l) return; curLesson = l;
    const box = $('#lessonBox'); box.hidden = false;
    box.innerHTML = `<div class="cardhead"><h2>${esc(l.title)}</h2><button type="button" class="btn ghost" data-act="closeLesson">Close</button></div>
      <div class="lgrid"><div class="ltext">${l.body.map(p => `<p>${esc(p)}</p>`).join('')}${l.calc ? calcHTML() : ''}</div><div class="lsvg">${SVG[l.svg] || ''}</div></div>
      <h3 class="subhead">Quick quiz</h3><ol class="quiz">${l.quiz.map(([q, opts], qi) => `<li data-q="${qi}"><p>${esc(q)}</p><div class="qopts">${opts.map((o, oi) => `<button type="button" data-o="${oi}">${esc(o)}</button>`).join('')}</div><p class="qwhy" hidden></p></li>`).join('')}</ol>
      <p class="small muted" id="quizScore"></p>`;
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (l.calc) bindCalc();
  }
  function calcHTML() { return `<div class="calc"><h3 class="subhead">Position size calculator</h3><div class="calcf"><label>Account<input type="number" id="cAcct" value="10000"></label><label>Risk %<input type="number" id="cRisk" value="1" step="0.25"></label><label>Entry<input type="number" id="cEn" value="4000" step="0.01"></label><label>Stop<input type="number" id="cSt" value="3980" step="0.01"></label><label>Market<select id="cMkt"><option value="gold">Gold</option><option value="btc">Bitcoin</option></select></label></div><p class="calcout mono" id="cOut"></p></div>`; }
  function bindCalc() {
    const upd = () => { const a = +$('#cAcct').value, r = +$('#cRisk').value, d = Math.abs(+$('#cEn').value - +$('#cSt').value), mk = $('#cMkt').value; if (!(a > 0 && r > 0 && d > 0)) { $('#cOut').textContent = 'Fill in all the boxes.'; return; } const risk = a * r / 100, units = risk / d; $('#cOut').innerHTML = `Risk ${B.usd(risk)} · ${mk === 'gold' ? `${units.toFixed(2)} oz = <b>${(units / 100).toFixed(2)} lots</b>` : `<b>${units.toFixed(4)} BTC</b>`} · a +2R win = ${B.usd(risk * 2)}`; };
    ['cAcct', 'cRisk', 'cEn', 'cSt', 'cMkt'].forEach(id => $('#' + id).addEventListener('input', upd)); upd();
  }
  function answer(li, oi) {
    if (!curLesson || li.dataset.done) return; const qi = +li.dataset.q, [, , right, why] = curLesson.quiz[qi]; li.dataset.done = oi === right ? 'right' : 'wrong';
    $$('[data-o]', li).forEach(b => { b.disabled = true; if (+b.dataset.o === right) b.classList.add('right'); else if (+b.dataset.o === oi) b.classList.add('wrong'); });
    const w = $('.qwhy', li); w.hidden = false; w.textContent = (oi === right ? 'Right. ' : 'Not quite. ') + why;
    const items = $$('.quiz li', $('#lessonBox')); if (items.every(x => x.dataset.done)) {
      const sc = Math.round(items.filter(x => x.dataset.done === 'right').length / items.length * 100), L = B.M.learn();
      L.quiz[curLesson.id] = Math.max(L.quiz[curLesson.id] || 0, sc); L.lessons[curLesson.id] = true; B.M.setLearn(L);
      $('#quizScore').textContent = `Quiz: ${sc}%. ${sc === 100 ? 'Perfect.' : 'Read the explanations, then try the next lesson.'} Lesson marked as done.`;
      renderLessons(); renderReady();
      if (root.Coach) root.Coach.botSays('Learn', `Lesson done: "${curLesson.title}" (quiz ${sc}%).`, 'green');
    }
  }

  /* ---------------- Buy, Sell or Wait? drill on real gold candles ---------------- */
  let drill = null, dchart = null, dseries = null;
  function newDrill() {
    const D = root.__desk2; if (!D || !D.S.gold.ready) { $('#drillMsg').textContent = 'Gold candles are still loading. Try again in a few seconds.'; return; }
    const bars = D.S.gold.s1h.closed(), out = D.S.gold.out.quiet; if (bars.length < 400 || !out) return;
    const trades = out.trades.filter(t => t.R != null), useSig = Math.random() < 0.5 && trades.length;
    let i, ans, t = null;
    if (useSig) { t = trades[Math.floor(Math.random() * trades.length)]; i = t.i; ans = t.d > 0 ? 'buy' : 'sell'; }
    else { for (let k = 0; k < 50; k++) { i = 300 + Math.floor(Math.random() * (bars.length - 340)); if (!out.trades.some(x => Math.abs(x.i - i) <= 2)) break; } ans = 'wait'; }
    drill = { i, ans, t, bars, done: false };
    const o = D.off('gold'), view = bars.slice(i - 90, i + 1).map(b => ({ time: b.t, open: b.o + o, high: b.h + o, low: b.l + o, close: b.c + o }));
    const el = $('#drillChart'); el.innerHTML = '';
    const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    dchart = root.LightweightCharts.createChart(el, { autoSize: true, layout: { background: { type: 'solid', color: 'transparent' }, textColor: css('--muted'), fontFamily: '"Geist Mono", monospace', fontSize: 11 }, grid: { vertLines: { color: css('--grid') }, horzLines: { color: css('--grid') } }, rightPriceScale: { borderColor: css('--line') }, timeScale: { borderColor: css('--line'), timeVisible: true, rightOffset: 4 }, handleScroll: false, handleScale: false });
    dseries = dchart.addCandlestickSeries({ upColor: css('--up'), downColor: css('--down'), borderVisible: false, wickUpColor: css('--up'), wickDownColor: css('--down') });
    dseries.setData(view); dchart.timeScale().fitContent();
    const U = root.Engine.util, H = bars.slice(0, i + 1).map(b => b.h), Lo = bars.slice(0, i + 1).map(b => b.l), hi = U.rollMax(H, 20), lo = U.rollMin(Lo, 20);
    const ch = dchart.addLineSeries({ color: css('--cyan'), lineWidth: 1, lineStyle: 2, lastValueVisible: false, priceLineVisible: false, lineType: 1, autoscaleInfoProvider: () => null });
    const cl = dchart.addLineSeries({ color: css('--cyan'), lineWidth: 1, lineStyle: 2, lastValueVisible: false, priceLineVisible: false, lineType: 1, autoscaleInfoProvider: () => null });
    ch.setData(bars.slice(i - 90, i).map((b, k) => ({ time: bars[i - 90 + k + 1].t, value: hi[i - 90 + k] + o })));
    cl.setData(bars.slice(i - 90, i).map((b, k) => ({ time: bars[i - 90 + k + 1].t, value: lo[i - 90 + k] + o })));
    $('#drillQ').textContent = `Gold, 1-hour chart, ${when(bars[i].t + 3600)}. The last candle just closed. The dashed lines are the 20-hour high and low. What does the Quiet Breakout say?`;
    $('#drillMsg').textContent = ''; $$('#drillBtns button').forEach(b => { b.disabled = false; b.className = ''; });
  }
  function answerDrill(pickA) {
    if (!drill || drill.done) return; drill.done = true;
    const D = root.__desk2, o = D.off('gold'), right = pickA === drill.ans, L = B.M.learn();
    L.drills.n++; if (right) L.drills.right++; B.M.setLearn(L);
    $$('#drillBtns button').forEach(b => { b.disabled = true; if (b.dataset.a === drill.ans) b.className = 'right'; else if (b.dataset.a === pickA) b.className = 'wrong'; });
    const next = drill.bars.slice(drill.i + 1, drill.i + 31).map(b => ({ time: b.t, open: b.o + o, high: b.h + o, low: b.l + o, close: b.c + o }));
    for (const b of next) dseries.update(b);
    dchart.timeScale().fitContent();
    let msg = right ? 'Right. ' : 'Not this time. ';
    if (drill.t) { const t = drill.t; dseries.setMarkers([{ time: drill.bars[drill.i].t, position: t.d > 0 ? 'belowBar' : 'aboveBar', shape: t.d > 0 ? 'arrowUp' : 'arrowDown', color: t.d > 0 ? '#34D399' : '#F87171', text: `${t.d > 0 ? 'BUY' : 'SELL'} ${t.Rf >= 0 ? '+' : ''}${t.Rf.toFixed(1)}R` }]); msg += `${t.why} The trade ended ${t.Rf >= 0 ? '+' : ''}${t.Rf.toFixed(2)}R (${t.res}).`; }
    else msg += 'No signal here: either the candle didn\'t close past the 20-hour high or low, the market wasn\'t calm, or the break went against the 50-day trend. Waiting is a position too.';
    $('#drillMsg').textContent = msg + ` Your score: ${L.drills.right}/${L.drills.n}.`;
  }

  /* ---------------- journal review ---------------- */
  function renderJournal() {
    const el = $('#journalTbl'); if (!el) return; const rv = B.review(), list = rv.perTrade.slice().reverse().slice(0, 25);
    $('#journalSum').innerHTML = `<div><span>By hand</span><b>${rv.mine.n}</b></div><div><span>Followed the plan</span><b>${rv.mine.n ? Math.round(rv.clean / rv.mine.n * 100) + '%' : '-'}</b></div><div><span>Win rate</span><b>${rv.mine.n ? rv.mine.win + '%' : '-'}</b></div><div><span>Average</span><b class="${rv.mine.avgR >= 0 ? 'pos' : 'neg'}">${rv.mine.n ? (rv.mine.avgR >= 0 ? '+' : '') + rv.mine.avgR.toFixed(2) + 'R' : '-'}</b></div>`;
    el.innerHTML = list.length ? `<thead><tr><th>Closed</th><th>Trade</th><th>Result</th><th>Coach notes</th></tr></thead><tbody>${list.map(({ p, ms }) => `<tr><td>${when(p.closedAt)}</td><td>${p.mk === 'gold' ? 'Gold' : 'Bitcoin'} <span class="tag" data-tone="${p.side > 0 ? 'green' : 'red'}">${p.side > 0 ? 'BUY' : 'SELL'}</span></td><td class="${p.pnl >= 0 ? 'pos' : 'neg'}">${B.sgn(p.pnl)}${p.r != null ? ` <span class="muted">${p.r >= 0 ? '+' : ''}${p.r.toFixed(2)}R</span>` : ''}</td><td class="jnote">${ms.length ? ms.map(m => `<span class="tag" data-tone="yellow">${m.k}</span> ${esc(m.t)}`).join('<br>') : '<span class="tag" data-tone="green">followed the plan</span>'}</td></tr>`).join('')}</tbody>`
      : `<tbody><tr><td class="empty">Place a few demo trades by hand and the coach will review each one here.</td></tr></tbody>`;
  }

  function render() { renderReady(); renderChallenge(); renderLessons(); renderJournal(); }
  function bind() {
    const v = $('#view-learn'); if (!v) return;
    v.addEventListener('click', e => {
      const l = e.target.closest('[data-lesson]'); if (l) return openLesson(l.dataset.lesson);
      const o = e.target.closest('.quiz [data-o]'); if (o) return answer(o.closest('li'), +o.dataset.o);
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'closeLesson') { $('#lessonBox').hidden = true; curLesson = null; }
      if (a.dataset.act === 'newDrill') newDrill();
      if (a.dataset.act === 'chalReset') { const C = Object.assign({}, B.ls.get('os_challenge', {}), { start: Math.floor(B.now()) }); B.ls.set('os_challenge', C); renderChallenge(); }
      if (a.dataset.act === 'askCoach' && root.Coach) { root.Coach.open(); root.Coach.ask('am I ready for real money'); }
    });
    $('#drillBtns').addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b) answerDrill(b.dataset.a); });
    $('#chalRules').addEventListener('change', e => { const C = Object.assign({}, B.ls.get('os_challenge', {}), { rules: e.target.value }); B.ls.set('os_challenge', C); renderChallenge(); });
  }
  root.Learn = { render, LESSONS, newDrill };
  function start() { bind(); render(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})(window);

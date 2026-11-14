/* Coach: a chat that talks to you like a person about your trading, your day and what to do next.
   It reads the same memory as the OS dashboard and the voice assistant (brain.js), so the conversation follows you. */
(function (root) {
  'use strict';
  const B = root.Brain; if (!B) return;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const tfmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit' });
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SPK_ON = '<svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true"><path d="M3 8h3l4-3v10l-4-3H3z" fill="currentColor"/><path d="M13 7.5a3.5 3.5 0 010 5M15 5a7 7 0 010 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>', SPK_OFF = '<svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true"><path d="M3 8h3l4-3v10l-4-3H3z" fill="currentColor"/><path d="M13.5 8l4 4m0-4l-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  let open = false, unread = 0, speakOn = B.ls.get('coach_speak', false), listening = null;

  const CHIPS = [['Plan my day', 'plan my day'], ['How am I doing?', 'how am I doing'], ['Review my last trade', 'review my last trade'], ['Ready for real money?', 'am I ready for real money'], ['Analyze gold', 'analyze gold'], ['Teach me Quiet Breakout', 'what is the quiet breakout']];

  function mount() {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <button type="button" class="coach-orb" id="coachOrb" aria-label="Open your coach" aria-expanded="false"><span class="orb-core" aria-hidden="true"><i></i></span><b class="orb-badge" hidden>0</b></button>
      <section class="coach" id="coach" aria-label="Coach" hidden>
        <header class="coach-head">
          <span class="orb-core small" aria-hidden="true"><i></i></span>
          <div><b>Coach</b><span>Knows your trades, bots and schedule</span></div>
          <button type="button" class="iconbtn" data-act="speak" aria-pressed="${speakOn}" title="Read replies out loud">${speakOn ? SPK_ON : SPK_OFF}</button>
          <button type="button" class="iconbtn" data-act="close" aria-label="Close the coach">×</button>
        </header>
        <ol class="coach-log" id="coachLog" aria-live="polite"></ol>
        <div class="coach-chips" id="coachChips">${CHIPS.map(([l, s]) => `<button type="button" data-say="${esc(s)}">${l}</button>`).join('')}</div>
        <form class="coach-input" id="coachForm" autocomplete="off">
          <button type="button" class="iconbtn mic" data-act="mic" aria-label="Talk instead of typing" ${B.Voice.supported ? '' : 'hidden'}><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><rect x="7" y="2.5" width="6" height="10" rx="3" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M4.5 9.5a5.5 5.5 0 0011 0M10 15v2.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></button>
          <input id="coachIn" type="text" placeholder="Ask anything, or: add school Mon 8 to 10:30" aria-label="Message the coach">
          <button type="submit" class="btn send" aria-label="Send">↑</button>
        </form>
      </section>`;
    document.body.appendChild(wrap);
    $('#coachOrb').addEventListener('click', toggle);
    $('#coach').addEventListener('click', e => {
      const a = e.target.closest('[data-act]'), s = e.target.closest('[data-say]'), l = e.target.closest('[data-open]');
      if (s) return ask(s.dataset.say);
      if (l) { const h = l.dataset.open; if (/^https?:/.test(h)) root.open(h, '_blank', 'noopener'); else location.href = h; return; }
      if (!a) return;
      if (a.dataset.act === 'close') toggle(false);
      if (a.dataset.act === 'speak') { speakOn = !speakOn; B.ls.set('coach_speak', speakOn); a.setAttribute('aria-pressed', speakOn); a.innerHTML = speakOn ? SPK_ON : SPK_OFF; if (!speakOn) B.Voice.stop(); }
      if (a.dataset.act === 'mic') mic(a);
    });
    $('#coachForm').addEventListener('submit', e => { e.preventDefault(); const v = $('#coachIn').value.trim(); if (v) { $('#coachIn').value = ''; ask(v); } });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && open) toggle(false); });
    render();
    dailyCheckIn();
  }

  function toggle(force) {
    open = typeof force === 'boolean' ? force : !open;
    const c = $('#coach'), orb = $('#coachOrb');
    orb.setAttribute('aria-expanded', open);
    if (open) { c.hidden = false; requestAnimationFrame(() => c.classList.add('open')); unread = 0; badge(); scrollEnd(); setTimeout(() => $('#coachIn').focus({ preventScroll: true }), 250); }
    else { c.classList.remove('open'); setTimeout(() => { if (!open) c.hidden = true; }, 260); }
  }
  function badge() { const b = $('.orb-badge'); if (!b) return; b.hidden = !unread; b.textContent = unread; $('#coachOrb').classList.toggle('ping', !!unread); }
  function scrollEnd() { const l = $('#coachLog'); if (l) l.scrollTop = l.scrollHeight; }

  function bubble(m) {
    const who = m.who === 'you' ? 'you' : m.who === 'coach' || m.who === 'atlas' ? 'coach' : 'bot';
    const acts = (m.actions || []).map(a => a.say ? `<button type="button" data-say="${esc(a.say)}">${esc(a.label)}</button>` : `<button type="button" data-open="${esc(a.href)}">${esc(a.label)}</button>`).join('');
    const claude = m.claude ? `<button type="button" class="toclaude" data-open="${esc(m.claude)}">Open in Claude ↗</button>` : '';
    return `<li class="msg m-${who}${m.tone ? ' t-' + m.tone : ''}">${who === 'bot' ? `<span class="bywho">${esc(m.who)}</span>` : ''}<div class="bub">${esc(m.text).replace(/\n/g, '<br>')}</div>${acts || claude ? `<div class="macts">${acts}${claude}</div>` : ''}<time>${tfmt.format(new Date(m.t * 1000)).replace(/\./g, '')}${m.tier ? ` · ${m.tier === 1 ? 'instant' : m.tier === 2 ? 'playbook' : 'Claude'}` : ''}</time></li>`;
  }
  function render() { const L = B.M.log().slice(-80), el = $('#coachLog'); if (!el) return; el.innerHTML = L.length ? L.map(bubble).join('') : `<li class="msg m-coach"><div class="bub">${esc(B.greet())} I'm your coach. I can see your demo trades, the bots and your schedule. Ask me anything, or tap a button below.</div></li>`; scrollEnd(); }

  function say(text, extra, who) {
    B.M.addLog(who || 'coach', text, extra); render();
    if (!open) { unread++; badge(); }
    if (speakOn && (who || 'coach') === 'coach') B.Voice.speak(text);
  }
  async function ask(text) {
    B.M.addLog('you', text); render();
    const el = $('#coachLog'); const typing = document.createElement('li'); typing.className = 'msg m-coach typing'; typing.innerHTML = '<div class="bub"><i></i><i></i><i></i></div>'; el.appendChild(typing); scrollEnd();
    await new Promise(r => setTimeout(r, reduced() ? 120 : 420 + Math.random() * 400));
    typing.remove();
    const r = B.route(text);
    say(r.text, { tier: r.tier, actions: r.actions, claude: r.claude });
    if (r.analyze && root.__desk2) { if (location.hash.slice(1) !== r.analyze) location.hash = r.analyze; setTimeout(() => root.__desk2.runAnalyze(r.analyze), 450); }
    else if (r.open && !/^https?:/.test(r.open) && r.open.startsWith('index.html#')) { location.hash = r.open.split('#')[1]; }
    else if (r.open) setTimeout(() => { if (/^https?:/.test(r.open)) root.open(r.open, '_blank', 'noopener'); else location.href = r.open; }, 500);
  }
  function mic(btn) {
    if (listening) { try { listening.stop(); } catch (e) {} return; }
    const inp = $('#coachIn');
    listening = B.Voice.listen(txt => { inp.value = ''; ask(txt); }, (state, extra) => {
      btn.classList.toggle('live', state === 'listening' || state === 'hearing');
      if (state === 'hearing') inp.value = extra || '';
      if (state === 'idle' || state === 'error') listening = null;
      if (state === 'error' && extra === 'not-allowed') say('I can\'t hear you because the microphone is blocked. Allow it in the browser\'s address bar, or just type.');
    });
  }

  function dailyCheckIn() {
    const z = B.tzNow(); if (B.ls.get('coach_day', '') === z.date) return;
    B.ls.set('coach_day', z.date);
    setTimeout(() => {
      const lines = B.planDay(0);
      say(`${B.greet()} Here's your day.\n${lines.join('\n')}`, { actions: [{ label: 'How am I doing?', say: 'how am I doing' }, { label: 'Ready for real money?', say: 'am I ready for real money' }] });
    }, 2500);
  }

  root.Coach = {
    open: () => toggle(true), ask,
    onAnalysis(an, v) {
      const mk = an.mk === 'gold' ? 'gold' : 'Bitcoin', b = an.best;
      const tip = b && b.status === 'armed' ? 'Nothing to do until that candle closes. If you\'re in class, Autopilot can take it for you.' : b && b.status === 'now' ? 'If you take it, use the stop on the chart and size it at 1%.' : 'No setup means no trade. That\'s a decision too.';
      say(`I read the ${mk} ${{ 900: '15-minute', 3600: '1-hour', 14400: '4-hour', 86400: 'daily' }[an.tf]} chart: ${v.word}. ${v.line} ${tip}`);
    },
    onTradeOpened(p) {
      const T = B.trading(), last = T.mine[T.mine.length - 1];
      const ms = B.mistakesOf(Object.assign({ sl0: p.sl }, p), last && last.closedAt ? last : null);
      if (ms.length) say(`Heads up on that ${p.side > 0 ? 'buy' : 'sell'}: ${ms.map(m => m.t).join(' ')}`, { tone: 'warn' });
      else say(pick(['Logged it. Stop is in, size is sane. Now leave it alone and let the plan work.', 'Nice, that one follows the rules. Don\'t move the stop further away, whatever happens.', 'Trade logged. Good risk. Walk away from the screen for a bit if you can.']));
    },
    onTradeClosed(p) { say(B.tradeBreakdown(p), { tone: p && p.pnl >= 0 ? 'good' : 'bad' }); },
    botSays(who, msg, tone) { B.M.addLog(who, msg, { tone }); render(); if (!open) { unread++; badge(); } }
  };
  const pick = B.pick;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})(window);

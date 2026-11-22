// Расчёт рабочего времени с перерывами и личная 3D-карточка сотрудника.
// Используется и на странице сотрудника, и в панели управляющего.
window.TabelStats = (function () {
  const TZ = 'Asia/Samarkand';
  const fDay = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const dateOf = ts => fDay.format(new Date(ts));            // YYYY-MM-DD по Самарканду
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // «7ч 05м»
  function fmt(ms) {
    const m = Math.max(0, Math.round(ms / 60000));
    return `${Math.floor(m / 60)}ч ${String(m % 60).padStart(2, '0')}м`;
  }
  const dmy = d => d ? d.split('-').reverse().join('.') : '';
  const hhmm = r => r ? r.time.slice(0, 5) : '—';

  function finalize(s, now) {
    const end = s.out ? s.out.ts : (s.current ? now : null);
    s.totalMs = s.in && end ? end - s.in.ts : 0;
    s.breakMs = s.breaks.reduce((a, b) => {
      const e = b.end ? b.end.ts : (s.current ? now : (s.out ? s.out.ts : b.start.ts));
      return a + Math.max(0, e - b.start.ts);
    }, 0);
    s.netMs = Math.max(0, s.totalMs - s.breakMs);
    s.date = (s.in || s.out).date;
    s.complete = !!(s.in && s.out);
    return s;
  }

  // Собирает смены: приход → (перерывы) → уход
  function build(records, now = Date.now()) {
    const by = {};
    [...records].sort((a, b) => a.ts - b.ts).forEach(r => (by[r.employeeId] = by[r.employeeId] || []).push(r));
    const shifts = [];
    for (const list of Object.values(by)) {
      let cur = null;
      const close = outRec => {
        if (cur.breakOpen) { cur.breaks.push({ start: cur.breakOpen, end: outRec }); cur.breakOpen = null; }
        cur.out = outRec; shifts.push(finalize(cur, now)); cur = null;
      };
      for (const r of list) {
        if (r.type === 'in') { if (cur) close(null); cur = { in: r, out: null, breaks: [], breakOpen: null, employeeId: r.employeeId, name: r.name }; }
        else if (r.type === 'out') { if (cur) close(r); else shifts.push(finalize({ in: null, out: r, breaks: [], employeeId: r.employeeId, name: r.name }, now)); }
        else if (r.type === 'break_start') { if (cur && !cur.breakOpen) cur.breakOpen = r; }
        else if (r.type === 'break_end') { if (cur && cur.breakOpen) { cur.breaks.push({ start: cur.breakOpen, end: r }); cur.breakOpen = null; } }
      }
      if (cur) {
        cur.current = true; cur.onBreak = !!cur.breakOpen;
        if (cur.breakOpen) cur.breaks.push({ start: cur.breakOpen, end: null, open: true });
        cur.breakOpen = null;
        shifts.push(finalize(cur, now));
      }
    }
    return shifts.sort((a, b) => (b.in || b.out).ts - (a.in || a.out).ts);
  }

  function sum(shifts) {
    return shifts.reduce((a, s) => ({ count: a.count + (s.in ? 1 : 0), netMs: a.netMs + s.netMs, breakMs: a.breakMs + s.breakMs, breaks: a.breaks + s.breaks.length }),
      { count: 0, netMs: 0, breakMs: 0, breaks: 0 });
  }

  // Границы периодов по Самарканду
  function periods(now = Date.now()) {
    const today = dateOf(now);
    const [y, m, d] = today.split('-').map(Number);
    const wd = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;      // 0 = понедельник
    const mon = new Date(Date.UTC(y, m - 1, d - wd)).toISOString().slice(0, 10);
    return { today, weekFrom: mon, monthFrom: today.slice(0, 8) + '01' };
  }

  function summary(shifts, now = Date.now()) {
    const p = periods(now);
    return {
      today: sum(shifts.filter(s => s.date === p.today)),
      week: sum(shifts.filter(s => s.date >= p.weekFrom)),
      month: sum(shifts.filter(s => s.date >= p.monthFrom)),
    };
  }

  // ---------- 3D-карточка ----------
  const css = `
  .pc-back{position:fixed;inset:0;z-index:900;background:rgba(2,10,7,.78);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;align-items:flex-start;justify-content:center;padding:24px 14px;overflow-y:auto;perspective:1200px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  .pc{position:relative;width:100%;max-width:520px;color:#f3f1ea;border-radius:24px;padding:22px;transform-origin:50% 0;
      background:linear-gradient(150deg,#123826 0%,#0a2218 55%,#071711 100%);border:1px solid rgba(255,255,255,.14);
      box-shadow:0 40px 90px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.15);animation:pcIn .7s cubic-bezier(.2,.8,.2,1.15)}
  @keyframes pcIn{from{opacity:0;transform:rotateY(-35deg) rotateX(12deg) translateY(40px) scale(.9)}to{opacity:1;transform:none}}
  .pc-x{position:absolute;right:14px;top:12px;width:36px;height:36px;border-radius:50%;border:0;background:rgba(255,255,255,.1);color:#fff;font-size:20px;cursor:pointer}
  .pc-head{display:flex;gap:14px;align-items:center;margin-bottom:18px}
  .pc-ava{width:58px;height:58px;border-radius:18px;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:800;color:#04140d;flex:none;
          background:linear-gradient(135deg,#3ee6a0,#ffcf5a);box-shadow:0 10px 25px rgba(62,230,160,.35);animation:pcSpin 6s ease-in-out infinite;transform-style:preserve-3d}
  @keyframes pcSpin{0%,100%{transform:rotateY(0)}50%{transform:rotateY(25deg) rotateX(8deg)}}
  .pc-name{font-size:21px;font-weight:800;margin:0}
  .pc-sub{font-size:13px;color:#a9b8b0;margin-top:2px}
  .pc-live{display:inline-flex;align-items:center;gap:6px;font-size:13px;margin-top:6px;padding:3px 10px;border-radius:20px;background:rgba(62,230,160,.15);color:#7ff0bf}
  .pc-live.brk{background:rgba(255,207,90,.15);color:#ffd97a}
  .pc-live i{width:8px;height:8px;border-radius:50%;background:currentColor;animation:pcBlink 1.2s infinite}
  @keyframes pcBlink{50%{opacity:.25}}
  .pc-tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;perspective:700px;margin-bottom:18px}
  .pc-tile{padding:14px 10px;border-radius:16px;text-align:center;transform-style:preserve-3d;transition:transform .25s;animation:pcTile .6s cubic-bezier(.2,.8,.2,1.2) both;
           background:linear-gradient(160deg,var(--a),var(--b));box-shadow:0 12px 25px rgba(0,0,0,.35)}
  .pc-tile:nth-child(2){animation-delay:.08s}.pc-tile:nth-child(3){animation-delay:.16s}
  @keyframes pcTile{from{opacity:0;transform:rotateX(-70deg) translateY(20px)}}
  .pc-tile:hover{transform:rotateX(10deg) rotateY(-10deg) translateZ(8px)}
  .pc-tile small{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.5px;opacity:.85}
  .pc-tile b{display:block;font-size:22px;margin:4px 0 2px;transform:translateZ(20px)}
  .pc-tile span{font-size:11px;opacity:.85}
  .t1{--a:#17b877;--b:#0b6b45}.t2{--a:#5aa9ff;--b:#2d63c9}.t3{--a:#ffb547;--b:#d9792a}
  .pc h3{font-size:14px;text-transform:uppercase;letter-spacing:.6px;color:#a9b8b0;margin:6px 0 10px}
  .pc-list{display:flex;flex-direction:column;gap:8px}
  .pc-row{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:11px 12px;border-radius:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);animation:pcRow .45s ease-out both}
  @keyframes pcRow{from{opacity:0;transform:translateX(-14px) rotateY(-15deg)}}
  .pc-date{font-weight:700;font-size:14px;min-width:84px}
  .pc-date small{display:block;font-weight:400;color:#a9b8b0;font-size:11px}
  .pc-times{font-size:13px;color:#d9e2dd}
  .pc-times em{font-style:normal;color:#ffd97a;font-size:12px;display:block}
  .pc-net{font-weight:800;font-size:15px;color:#7ff0bf;text-align:right}
  .pc-net.warn{color:#ff9d8c;font-size:12px}
  .pc-empty{color:#a9b8b0;text-align:center;padding:18px}
  @media (max-width:420px){.pc-tile b{font-size:18px}.pc{padding:18px}}
  @media (prefers-reduced-motion: reduce){.pc,.pc-ava,.pc-tile,.pc-row{animation:none!important}}`;

  const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  const wdOf = d => { const [y, m, dd] = d.split('-').map(Number); return WD[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()]; };

  function cardHtml(name, shifts, now) {
    const s = summary(shifts, now);
    const cur = shifts.find(x => x.current);
    const live = cur ? `<div class="pc-live ${cur.onBreak ? 'brk' : ''}"><i></i>${cur.onBreak ? 'На перерыве' : 'На смене'} с ${hhmm(cur.in)} · чистое время ${fmt(cur.netMs)}</div>` : '';
    const tile = (cls, title, v) => `<div class="pc-tile ${cls}"><small>${title}</small><b>${fmt(v.netMs)}</b><span>смен: ${v.count}<br>☕ ${fmt(v.breakMs)}</span></div>`;
    const rows = shifts.slice(0, 20).map((x, i) => {
      const br = x.breaks.length ? `<em>☕ ${x.breaks.length} перерыв(а): ${fmt(x.breakMs)}</em>` : '';
      const net = x.current ? `<div class="pc-net">${fmt(x.netMs)}<br><small style="font-weight:400;font-size:11px;color:#a9b8b0">идёт</small></div>`
        : x.complete ? `<div class="pc-net">${fmt(x.netMs)}</div>` : `<div class="pc-net warn">${x.in ? 'нет ухода' : 'нет прихода'}</div>`;
      return `<div class="pc-row" style="animation-delay:${Math.min(i, 10) * 0.04}s"><div class="pc-date">${dmy(x.date)}<small>${wdOf(x.date)}</small></div>
        <div class="pc-times">${hhmm(x.in)} → ${x.current ? 'сейчас' : hhmm(x.out)}${br}</div>${net}</div>`;
    }).join('');
    return `<div class="pc" role="dialog" aria-label="Карточка сотрудника"><button class="pc-x" aria-label="Закрыть">×</button>
      <div class="pc-head"><div class="pc-ava">${esc((name || '?').trim().charAt(0).toUpperCase())}</div>
        <div><p class="pc-name">${esc(name)}</p><div class="pc-sub">Личная карточка · время Самарканда</div>${live}</div></div>
      <div class="pc-tiles">${tile('t1', 'Сегодня', s.today)}${tile('t2', 'Неделя', s.week)}${tile('t3', 'Месяц', s.month)}</div>
      <h3>Последние смены</h3>
      <div class="pc-list">${rows || '<div class="pc-empty">Пока нет смен</div>'}</div></div>`;
  }

  // Открыть карточку. getRecords — функция, возвращающая актуальные записи (для живого таймера)
  function openCard(name, getRecords) {
    if (!document.getElementById('pc-style')) { const st = document.createElement('style'); st.id = 'pc-style'; st.textContent = css; document.head.appendChild(st); }
    const back = document.createElement('div'); back.className = 'pc-back';
    const render = first => {
      const html = cardHtml(name, build(getRecords()), Date.now());
      if (first) back.innerHTML = html;
      else {   // обновляем только цифры, без повторной анимации
        const tmp = document.createElement('div'); tmp.innerHTML = html;
        ['.pc-live', '.pc-tiles', '.pc-list'].forEach(sel => {
          const a = back.querySelector(sel), b = tmp.querySelector(sel);
          if (a && b) { b.querySelectorAll('*').forEach(el => el.style.animation = 'none'); b.style.animation = 'none'; a.replaceWith(b); }
        });
      }
    };
    render(true);
    document.body.appendChild(back);
    const timer = setInterval(() => render(false), 30000);
    const close = () => { clearInterval(timer); back.remove(); };
    back.addEventListener('click', e => { if (e.target === back || e.target.classList.contains('pc-x')) close(); });
    return close;
  }

  return { build, sum, summary, periods, fmt, dateOf, openCard };
})();

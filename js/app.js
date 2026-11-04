/* =====================================================================
   app.js — منطق الموقع. لا يحتاج تعديلًا؛ كل المحتوى في data.js
   كل صفحة HTML لها data-page، وهذا الملف يرسم محتوى الصفحة المناسبة.
   ===================================================================== */
(function () {
  "use strict";

  const S = window.SITE, SES = window.SESSIONS, WK = window.WEEKS, RES = window.RESOURCES,
        QZ = window.QUIZZES, ALERTS = window.ALERTS, PROJ = window.PROJECTS || [];
  let STUDENTS = window.STUDENTS;
  const PAGE = document.body.dataset.page;
  const Q = new URLSearchParams(location.search);

  /* ---------- أدوات ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem("dab_" + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("dab_" + k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem("dab_" + k); } catch (e) {} }
  };
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pad = n => String(n).padStart(2, "0");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const keepQ = Q.get("today") ? "&today=" + Q.get("today") : "";   // للتجربة فقط

  let sess = store.get("sess", null);                          // {role:"trainee"|"trainer", name}
  let isTr = !!sess && sess.role === "trainer";
  const API = () => String(S.api || "").trim();
  const ov = store.get("students", null);
  if (!API() && isTr && ov && Array.isArray(ov) && ov.length) STUDENTS = ov;   // وضع التجربة بدون سيرفر فقط
  let me = sess && sess.role === "trainee" ? sess.name : null;
  let trainer = isTr;                                          // وضع التعديل
  let timers = [];
  const clearTimers = () => { timers.forEach(t => clearInterval(t)); timers = []; };

  /* ---------- الربط مع Google Sheet (Apps Script) + محتوى الموقع القابل للتعديل ---------- */
  let CONTENT = {};
  async function api(action, body = {}) {
    const r = await fetch(API(), { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(Object.assign({ action, pin: sess && sess.pin }, body)) });
    return r.json();
  }
  const normStu = s => ({ name: s.name, github: s.github || "", email: s.email || "", points: s.points || 0, joined: s.joined || "", checkins: s.checkins || {}, quiz: s.quiz || {}, subPts: s.subPts || 0,
    att: Array.from({ length: SES.length }, (_, i) => (s.att && s.att[i] != null) ? s.att[i] : null), hw: Array.from({ length: SES.length }, (_, i) => (s.hw && s.hw[i] != null) ? s.hw[i] : null) });
  function applyContent(c) {
    CONTENT = c || {};
    Object.assign(S, CONTENT.site || {});
    if (Array.isArray(CONTENT.alerts)) { ALERTS.length = 0; CONTENT.alerts.forEach(a => ALERTS.push(a)); }
    Object.entries(CONTENT.sessions || {}).forEach(([n, v]) => { if (SES[n - 1]) Object.assign(SES[n - 1], v); });
    Object.entries(CONTENT.weeks || {}).forEach(([n, v]) => { const w = WK.find(x => String(x.n) === String(n)); if (w) Object.assign(w, v); });
  }
  let SUBS = [], MINE = [];
  const applyRemote = j => { applyContent(j.content || {}); STUDENTS = (j.students || []).map(normStu); if (j.subs) SUBS = j.subs; };
  async function loadRemote() {
    if (!API()) return false;
    const key = sess && sess.role === "trainer" && sess.pin;
    try {
      let j;
      if (key) j = await api("full");
      else { const c = new AbortController(), t = setTimeout(() => c.abort(), 15000); j = await (await fetch(API() + "?action=data", { signal: c.signal })).json(); clearTimeout(t); }
      if (j.err === "pin") { store.del("sess"); location.reload(); return false; }
      if (!j.ok) throw 0;
      store.set("remote", j); applyRemote(j); return true;
    } catch (e) { return false; }
  }
  /* ---------- الأقفال: الاختبارات (q1…q8) والمهام (a1…a4) والمشروع (p5) مقفلة عن الطلاب حتى يفتحها المدرّب ---------- */
  const UNL = () => Array.isArray(S.unlocked) ? S.unlocked : [];
  const canSee = id => isTr || UNL().includes(id);
  const qOpen = () => isTr || UNL().some(x => /^q/.test(x));      // هل يوجد أي اختبار مفتوح؟
  const tm = () => S.sessionTime ? " · " + esc(S.sessionTime) : "";
  const TK = () => window.TASKS || { assignments: [], project: {} };

  /* ---------- أيقونات ---------- */
  const P = {
    home: '<path d="M3 11l9-8 9 8M5 10v10h14V10"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
    check: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v3H9zM9.5 14l2 2 3.5-4"/>',
    quiz: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01"/>',
    rocket: '<path d="M5 15c-1 1-1.5 4-1.5 4s3-.5 4-1.5M14 4c3 0 6 0 6 0s0 3 0 6c0 4-4 7-8 8l-4-4c1-4 4-8 6-10z"/><circle cx="15" cy="9" r="1.5"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M10 17h4"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2 .7 3.5 2.6 3.5 5.5"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    bell: '<path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4zM10 21h4"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/><path d="M12 15v2"/>',
    unlock: '<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 7.6-1.7"/><path d="M12 15v2"/>'
  };
  const ico = (n, cls = "ico") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]}</svg>`;

  /* ---------- التواريخ ---------- */
  function today() {
    const p = Q.get("today");
    const d = p ? new Date(p + "T12:00:00") : new Date();
    d.setHours(12, 0, 0, 0); return d;
  }
  function sessionDate(i) {
    const o = SES[i] && SES[i].date;
    if (o && /^\d{4}-\d{2}-\d{2}$/.test(o)) return new Date(o + "T12:00:00");
    const d = new Date(S.startDate + "T12:00:00");
    const per = (S.sessionDays || []).length || 1;
    d.setDate(d.getDate() + Math.floor(i / per) * 7 + (S.sessionDays[i % per] || 0)); return d;
  }
  const dayDiff = i => Math.round((sessionDate(i) - today()) / 864e5);
  const status = i => { const d = dayDiff(i); return d < 0 ? "past" : d === 0 ? "today" : "up"; };
  const fmtLong = d => d.toLocaleDateString("ar-u-ca-gregory-nu-latn", { weekday: "long", day: "numeric", month: "long" });
  const fmtShort = d => d.getDate() + "/" + (d.getMonth() + 1);
  const nextIdx = () => { for (let i = 0; i < SES.length; i++) if (dayDiff(i) >= 0) return i; return -1; };
  /* أسبوع المشروع (بلا جلسات): يبدأ بعد الأسابيع التدريبية وينتهي في endDate */
  const projW = () => WK.find(w => w.project);
  const trainW = () => WK.filter(w => !w.project);
  const projStart = () => { const d = new Date(S.startDate + "T12:00:00"); d.setDate(d.getDate() + trainW().length * 7); return d; };
  const projEnd = () => { if (S.endDate && /^\d{4}-\d{2}-\d{2}$/.test(S.endDate)) return new Date(S.endDate + "T12:00:00"); const d = projStart(); d.setDate(d.getDate() + 6); return d; };
  const curWeekN = () => { const ni = nextIdx(); return ni >= 0 ? SES[ni].week : (projW() ? projW().n : SES[SES.length - 1].week); };

  /* بطاقة مقفلة: رمادية مموّهة بخطوط وهمية فقط (لا نص حقيقي في الصفحة) */
  const lockedCard = (label, sub, cls = "", lines = 4) => `<div class="lk ${cls}" role="button" tabindex="0" aria-label="${esc(label)} — مقفل"><div class="lk-ghost" aria-hidden="true">${Array.from({ length: lines }, (_, i) => `<i style="width:${[72, 94, 58, 84, 66, 90, 50, 78][i % 8]}%"></i>`).join("")}</div><div class="lk-badge">${ico("lock", "ico lg")}<b>${esc(label)}</b><small>${esc(sub || "مقفل — يفتحه المدرّب في الوقت المناسب")}</small></div></div>`;
  const lockSw = (id, mini) => { if (!isTr) return ""; const on = UNL().includes(id); return `<button type="button" class="lock-sw ${on ? "on" : ""} ${mini ? "mini" : ""}" data-lock="${id}" title="${on ? "مفتوح للطلاب — اضغطي لإعادة القفل" : "مقفل عن الطلاب — اضغطي للفتح"}">${ico(on ? "unlock" : "lock", "ico sm")}${mini ? "" : `<span>${on ? "مفتوح للطلاب — اضغطي للقفل" : "مقفل عن الطلاب — اضغطي للفتح"}</span>`}</button>`; };
  async function toggleLock(id) {
    const set = new Set(UNL()); set.has(id) ? set.delete(id) : set.add(id);
    const n = cloneC(); n.site = Object.assign({}, n.site, { unlocked: [...set] });
    await saveContent(n, null); render();
  }
  function bindLocks() {
    $$("[data-lock]").forEach(b => b.onclick = e => { e.preventDefault(); e.stopPropagation(); toggleLock(b.dataset.lock); });
    $$(".lk").forEach(el => { const f = () => toast("🔒 مقفل — سيفتحه المدرّب في الوقت المناسب"); el.onclick = f; el.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); f(); } }; });
  }

  /* ---------- حسابات ---------- */
  function stat(key, cols) {
    let ok = 0, tot = 0, bad = 0, mid = 0;
    STUDENTS.forEach(s => s[key].forEach((v, i) => {
      if (cols && !cols.includes(i)) return;
      if (v === null || v === undefined) return;
      tot++; if (v === 1) ok++; else if (v === 2) mid++; else bad++;
    }));
    const good = ok + mid;
    return { ok, mid, bad, tot, good, pct: tot ? Math.round(good / tot * 100) : 0 };
  }
  const weekCols = w => SES.map((s, i) => s.week === w ? i : -1).filter(i => i >= 0);
  const pctOf = arr => { let ok = 0, t = 0; arr.forEach(v => { if (v === null || v === undefined) return; t++; if (v === 1 || v === 2) ok++; }); return t ? Math.round(ok / t * 100) : 0; };
  const streakOf = arr => { let b = 0, c = 0; arr.forEach(v => { if (v === 1 || v === 2) { c++; b = Math.max(b, c); } else if (v === 0) c = 0; }); return b; };

  const bestMap = () => {
    if (API() && me) { const s = STUDENTS.find(x => x.name === me), o = {}; Object.entries((s && s.quiz) || {}).forEach(([n, v]) => { o[n] = { score: v[0], total: v[1] }; }); return o; }
    return store.get("quiz", {});
  };
  const quizPts = r => r.score * 10 + (r.score === r.total ? 10 : 0);
  const localPoints = () => Object.values(bestMap()).reduce((a, r) => a + r.score * 10 + (r.score === r.total ? 10 : 0), 0);
  function board() {
    const loc = API() ? 0 : localPoints();
    const list = STUDENTS.map(s => ({ name: s.name, pts: xpOf(s), me: false, tmp: false }));
    if (me) {
      const r = list.find(x => x.name === me), st = stuOf(me), extra = Math.max(0, loc - ((st && st.points) || 0));
      if (r) { r.me = true; if (extra) { r.pts += extra; r.tmp = true; } }
      else if (loc > 0) list.push({ name: me, pts: loc, me: true, tmp: true });
    }
    return list.sort((a, b) => b.pts - a.pts);
  }
  function awards() {
    const st = STUDENTS.map(s => ({ name: s.name, pts: xpOf(s), att: pctOf(s.att), hw: pctOf(s.hw), streak: streakOf(s.att) }));
    const top = k => { const m = Math.max(...st.map(x => x[k])); return { v: m, names: st.filter(x => x[k] === m).map(x => x.name) }; };
    return [
      { ic: "trophy", t: "الأعلى XP", ...top("pts"), fmt: v => v + " XP" },
      { ic: "target", t: "الأكثر التزامًا بالحضور", ...top("att"), fmt: v => v + "%" },
      { ic: "check", t: "الأكثر انتظامًا في تسليم الواجبات", ...top("hw"), fmt: v => v + "%" },
      { ic: "bolt", t: "أطول سلسلة حضور متواصل", ...top("streak"), fmt: v => v + " جلسات" }
    ];
  }
  const whoText = names => names.length <= 2 ? names.join(" و") : names.slice(0, 2).join(" و") + " +" + (names.length - 2);

  /* ---------- واجهات صغيرة ---------- */
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 3200); }
  const dlg = $("#dlg");
  function openDlg(inner) { dlg.innerHTML = inner; if (!dlg.open) dlg.showModal(); }
  function closeDlg() { if (dlg.open) dlg.close(); }
  dlg.addEventListener("click", e => { if (e.target === dlg) closeDlg(); });

  function updateChip() { $("#meChip").textContent = sess ? (isTr ? "المدرّبة · " : "") + sess.name : "دخول"; }
  function askMe() {
    if (!sess) return showGate();
    const s = me ? stuOf(me) : null;
    openDlg(`<h3>${isTr ? "حساب المدرّبة" : "حسابي"}</h3>
      <div style="display:flex;align-items:center;gap:12px;margin:10px 0">${avHtml(sess.name)}<div><b>${esc(sess.name)}</b>${s && s.github ? `<br><a class="mono" href="https://github.com/${esc(s.github)}" target="_blank" rel="noopener">@${esc(s.github)}</a>` : ""}${s && s.email ? `<br><small class="muted">${esc(s.email)}</small>` : ""}</div></div>
      <div class="row"><button class="btn" id="outBtn">تسجيل الخروج</button><button class="btn" id="clsBtn">إغلاق</button></div>`);
    $("#outBtn").onclick = () => { store.del("sess"); location.href = location.pathname; };
    $("#clsBtn").onclick = closeDlg;
  }
  const ensureMe = cb => me ? cb() : toast("سجّلي الدخول كمتدرب لإرسال النتائج");

  /* ---------- الإرسال (Endpoint أو GitHub Issues) ---------- */
  async function submitRecord(kind, payload, title) {
    if (S.formEndpoint) {
      try {
        const r = await fetch(S.formEndpoint, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ kind, ...payload }) });
        if (r.ok) return "endpoint";
      } catch (e) {}
    }
    const body = Object.entries(payload).map(([k, v]) => "**" + k + ":** " + v).join("\n\n");
    window.open("https://github.com/" + S.repo + "/issues/new?title=" + encodeURIComponent(title) + "&body=" + encodeURIComponent(body) + "&labels=" + encodeURIComponent(kind), "_blank", "noopener");
    return "issue";
  }

  /* ---------- رسوم ---------- */
  function ringSvg(segments, centerText, size = 130) {
    const r = 48, C = 2 * Math.PI * r; let acc = 0;
    const arcs = segments.map(s => {
      const len = C * s.v; const o = `<circle cx="60" cy="60" r="${r}" fill="none" stroke="${s.c}" stroke-width="12" stroke-linecap="butt" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-acc}" transform="rotate(-90 60 60)"/>`;
      acc += len; return o;
    }).join("");
    return `<svg viewBox="0 0 120 120" width="${size}" height="${size}" role="img" aria-label="${esc(centerText)}"><circle cx="60" cy="60" r="${r}" fill="none" stroke="#1d2b4a" stroke-width="12"/>${arcs}<text x="60" y="68" text-anchor="middle" class="big">${esc(centerText)}</text></svg>`;
  }
  function confetti() {
    if (reduced) return;
    const cv = $("#confetti"), ctx = cv.getContext("2d"); cv.width = innerWidth; cv.height = innerHeight;
    const cols = ["#38bdf8", "#facc15", "#34d399", "#fb923c", "#a78bfa", "#e8edf7"];
    const ps = Array.from({ length: 140 }, () => ({ x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * .4, vx: (Math.random() - .5) * 3, vy: 2 + Math.random() * 4, s: 5 + Math.random() * 7, r: Math.random() * 6, vr: (Math.random() - .5) * .3, c: cols[Math.floor(Math.random() * cols.length)] }));
    let f = 0;
    (function tick() {
      ctx.clearRect(0, 0, cv.width, cv.height);
      ps.forEach(p => { p.x += p.vx; p.y += p.vy; p.r += p.vr; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore(); });
      if (++f < 200) requestAnimationFrame(tick); else ctx.clearRect(0, 0, cv.width, cv.height);
    })();
  }
  function animate() {
    $$("[data-count]").forEach(el => {
      const target = +el.dataset.count, suf = el.dataset.suf || "";
      if (reduced) { el.textContent = target + suf; return; }
      const t0 = performance.now();
      (function step(t) {
        const k = Math.min(1, (t - t0) / 1000), e = 1 - Math.pow(1 - k, 3);
        el.textContent = Math.round(target * e) + suf;
        if (k < 1 && el.isConnected) requestAnimationFrame(step);
      })(t0);
    });
    setTimeout(() => $$("[data-w]").forEach(e => { e.style.width = e.dataset.w + "%"; }), 60);
  }
  const pageHead = (kicker, title, sub) => `<div class="pagehead"><div class="container"><h1>${title}</h1><p>${sub}</p></div></div>`;

  /* =====================================================================
     الرئيسية — ملخص فقط: وين وصلنا، الأرقام، المميزون، التنبيهات
     ===================================================================== */
  function pageHome() {
    const att = stat("att"), hw = stat("hw");
    const done = SES.filter((_, i) => dayDiff(i) < 0).length;
    const ni = nextIdx(), list = board(), qo = ni >= 0 && canSee("q" + SES[ni].n);
    const myRow = me ? list.find(x => x.me) : null;
    const curWeek = curWeekN();
    const q = keepQ ? "?" + keepQ.slice(1) : "";

    let next;
    if (ni < 0) next = today() <= projEnd()
      ? `<span class="lab">أسبوع المشروع النهائي</span><h3>انتهت الجلسات وبقي المشروع</h3><p class="muted">آخر موعد: ${fmtLong(projEnd())}.</p>${canSee("p5") ? `<a class="btn btn-pri btn-sm" href="projects.html${q}">المشروع النهائي</a>` : ""}`
      : `<span class="lab">اكتمل المعسكر</span><h3>مبروك على الإنجاز</h3><p class="muted">لا تنسوا مراجعة المصادر.</p>`;
    else {
      const s = SES[ni], d = sessionDate(ni);
      next = `<span class="lab">${dayDiff(ni) === 0 ? "جلسة اليوم" : "الجلسة القادمة"} · ${s.n} من ${SES.length}</span>
        <h3>${esc(s.ar)}</h3><div class="en">${esc(s.en)}</div>
        <p class="muted" style="margin:8px 0 0">${fmtLong(d)}${tm()}</p>
        ${s.place ? `<p style="margin:6px 0 0"><b>المكان:</b> ${/^https?:\/\//i.test(s.place) ? `<a href="${esc(s.place)}" target="_blank" rel="noopener">رابط الجلسة</a>` : esc(s.place)}</p>` : ""}
        ${S.nextNote ? `<p class="muted" style="margin:6px 0 0">${esc(S.nextNote)}</p>` : ""}
        <div class="countdown"><div><b id="cdD">--</b><small>days</small></div><div><b id="cdH">--</b><small>hrs</small></div><div><b id="cdM">--</b><small>min</small></div><div><b id="cdS">--</b><small>sec</small></div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn btn-pri btn-sm" href="agenda.html?w=${s.week}${keepQ}#s${s.n}">تفاصيل الجلسة</a>${qo ? `<a class="btn btn-sm" href="quizzes.html?s=${s.n}${keepQ}">اختبار الجلسة</a>` : ""}</div>`;
    }

    const weeks = WK.map(w => {
      if (w.project) {
        const t = today(), st = projStart(), en = projEnd(), span = Math.max(1, Math.round((en - st) / 864e5) + 1), el = Math.min(span, Math.max(0, Math.round((t - st) / 864e5) + 1));
        return `<a class="wcard c-${w.color}" href="agenda.html?w=${w.n}${keepQ}"><span class="wn">${w.n}</span><h3>${esc(w.ar || w.title)}</h3><p>${esc(w.goal)}</p>
          <div class="cnt"><span>${t > en ? "اكتمل" : t >= st ? "جارٍ" : "قادم"}</span><span class="mono">${fmtShort(st)} – ${fmtShort(en)}</span></div><div class="bar"><i data-w="${Math.round(el / span * 100)}"></i></div></a>`;
      }
      const all = SES.filter(s => s.week === w.n), d = all.filter(s => dayDiff(s.n - 1) < 0).length;
      return `<a class="wcard c-${w.color}" href="agenda.html?w=${w.n}${keepQ}"><span class="wn">${w.n}</span><h3>${esc(w.ar || w.title.split("&")[0].trim())}</h3><p>${esc(w.goal)}</p>
        <div class="cnt"><span>${d === all.length ? "اكتمل" : d === 0 && curWeek < w.n ? "قادم" : "جارٍ"}</span><span class="mono">${d}/${all.length}</span></div><div class="bar"><i data-w="${Math.round(d / all.length * 100)}"></i></div></a>`;
    }).join("");

    /* بطاقات الاختبارات والمهام والمشروع: تظهر مقفلة للطلاب بلا أي تفاصيل */
    const nQ = SES.length, oQ = SES.filter(x => UNL().includes("q" + x.n)).length, asg = TK().assignments || [], oA = asg.filter(x => UNL().includes(x.id)).length, oP = UNL().includes("p5");
    const tile = (ic, name, ready, tot, href, id) => `<div class="tile ${ready ? "" : "is-locked"}"><div class="tile-ghost" aria-hidden="true"><i></i><i></i><i></i></div><div class="tile-in">${ico(ready ? ic : "lock", "ico lg")}<h3>${name}</h3><p class="muted">${ready ? `${ready} من ${tot} مفتوح` : "مقفل — يفتحه المدرّب"}</p>${ready || isTr ? `<a class="btn btn-sm ${ready ? "btn-pri" : ""}" href="${href}${q}">${ready ? "افتح" : "معاينة"}</a>` : `<a class="btn btn-sm" href="${href}${q}">عرض</a>`}</div></div>`;
    const tiles = `<div class="grid g3">${tile("quiz", "الاختبارات القصيرة", oQ, nQ, "quizzes.html")}${tile("check", "المهام الأسبوعية", oA, asg.length, "quizzes.html#tasks")}${tile("rocket", "المشروع النهائي", oP ? 1 : 0, 1, "projects.html")}</div>`;

    const about = `<section class="section" style="padding-top:10px"><div class="container">
      <div class="sec-head"><h2>عن <span class="acc">المعسكر</span></h2></div>
      <div class="grid g2 about">
        <div class="card"><h3>نبذة</h3><p style="margin:0">${esc(S.about || "")}</p></div>
        <div class="card"><h3>الفئة المستهدفة</h3><p style="margin:0">${esc(S.audience || "")}</p></div>
        <div class="card"><h3>المحاور</h3><ul class="plain">${(S.axes || []).map(a => `<li>${esc(a)}</li>`).join("")}</ul></div>
        <div class="card"><h3>توقيت المعسكر</h3><ul class="plain">${(S.timing || []).map(a => `<li>${esc(a)}</li>`).join("")}</ul></div>
      </div></div></section>`;

    const top3 = list.slice(0, 3).map((p, i) => {
      const st = STUDENTS.find(s => s.name === p.name);
      return `<div class="card stu">${avHtml(p.name)}<span class="rk">المركز ${i + 1}</span><h3>${esc(p.name)}</h3>
        <div class="row"><span>XP <b>${p.pts}</b></span>${st ? `<span>حضور <b>${pctOf(st.att)}%</b></span><span>واجبات <b>${pctOf(st.hw)}%</b></span>` : ""}</div></div>`;
    }).join("");

    const alertsBox = ALERTS.length || isTr ? `<div class="next alerts"><span class="lab">${ico("bell")} تنبيهات مهمة</span>
        ${ALERTS.length ? `<ul class="notice">${ALERTS.map(a => `<li><span class="t ${esc(a.type)}">${a.type === "deadline" ? "موعد" : a.type === "important" ? "مهم" : "معلومة"}</span><span class="tx">${esc(a.text)}</span>${a.date ? `<span class="d">${esc(a.date)}</span>` : ""}</li>`).join("")}</ul>` : '<p class="muted" style="margin:8px 0 0">لا توجد تنبيهات (تظهر هذه الرسالة لكِ فقط). أضيفي تنبيهًا من لوحة التحكم.</p>'}</div>` : "";
    return `
    <div class="container hero">
      <div>
        <h1>${esc(S.heroPre)} <span class="acc">${esc(S.heroAccent)}</span> ${esc(S.heroPost)}</h1>
        <p class="lead">${esc(S.heroLead)}</p>
        <div class="btns"><a class="btn btn-pri" href="agenda.html${q}">استعرض الأجندة</a>${qo ? `<a class="btn" href="quizzes.html${q}">اختبار اليوم</a>` : ""}</div>
        <p class="where">${S.progressNote ? esc(S.progressNote) : today() < new Date(S.startDate + "T12:00:00") ? `يبدأ المعسكر <b>${fmtLong(new Date(S.startDate + "T12:00:00"))}</b>.` : `نحن الآن في <b>الأسبوع ${curWeek} من ${WK.length}</b> — أنجزنا ${done} جلسة من ${SES.length}.`}</p>
      </div>
      <div class="hero-side${ALERTS.length || isTr ? " two" : ""}">
        <div class="next">${next}</div>
        ${alertsBox}
      </div>
    </div>

    ${about}

    <section class="section" style="padding-top:20px">
      <div class="container">
        <div class="sec-head"><h2>أين <span class="acc">وصلنا؟</span></h2><p>أربعة أسابيع تدريبية وأسبوع للمشروع النهائي، ولكل أسبوع هدف واضح. اضغط على أي أسبوع لعرض تفاصيله.</p></div>
        <div class="grid g5">${weeks}</div>
      </div>
    </section>

    <section class="section" style="padding-top:0">
      <div class="container">
        <div class="sec-head"><h2>الاختبارات والمهام <span class="acc">والمشروع</span></h2><p>تُفتح تباعًا بقرار المدرّب. ما زال مقفلًا يظهر لك رماديًا.</p></div>
        ${tiles}
      </div>
    </section>

    <section class="section band">
      <div class="container stats">
        <div><span class="n" data-count="${att.pct}" data-suf="%">0%</span><span class="l">نسبة الحضور العامة</span></div>
        <div><span class="n" data-count="${hw.good}">0</span><span class="l">واجب مسلَّم من ${hw.tot}</span></div>
        <div><span class="n" data-count="${done}">0</span><span class="l">جلسة منجزة من ${SES.length}</span></div>
        <div><span class="n" data-count="${STUDENTS.length}">0</span><span class="l">مشارك في المعسكر</span></div>
      </div>
    </section>

    ${STUDENTS.length ? `<section class="section">
      <div class="container">
        <div class="sec-head"><h2>الطلاب <span class="acc">المميزون</span></h2><p>الأعلى نقاطًا من الحضور والواجبات والمشاركة حتى الآن.</p></div>
        <div class="grid g3">${top3}</div>
        <div class="mini"><span>${myRow ? `ترتيبك: <b>${list.indexOf(myRow) + 1}</b> من ${list.length} · ${myRow.pts} XP` : isTr ? "مسجّلة الدخول كمدرّبة" : `<button class="btn-link" id="homeMe">سجّل دخولك</button> لترى ترتيبك`}</span><a class="btn btn-sm" href="tracker.html?tab=board${keepQ}">لوحة المتصدرين كاملة</a></div>
      </div>
    </section>` : ""}



    ${qo ? `<section class="section" style="padding-bottom:0">
      <div class="container"><div class="cta"><h2>جاهز لاختبار اليوم؟</h2><a class="btn" href="quizzes.html${ni >= 0 ? "?s=" + SES[ni].n + keepQ : q}">ابدأ الاختبار</a></div></div>
    </section>` : ""}`;
  }
  function bindHome() {
    const b = $("#homeMe"); if (b) b.onclick = () => askMe();
    const ni = nextIdx();
    if (ni >= 0 && $("#cdD")) {
      const target = sessionDate(ni); target.setHours(S.sessionHour ?? 20, 0, 0, 0);
      const tick = () => {
        let diff = Math.max(0, Math.floor((target - (Q.get("today") ? today().getTime() : Date.now())) / 1000));
        $("#cdD").textContent = Math.floor(diff / 86400); diff %= 86400;
        $("#cdH").textContent = pad(Math.floor(diff / 3600)); diff %= 3600;
        $("#cdM").textContent = pad(Math.floor(diff / 60)); $("#cdS").textContent = pad(diff % 60);
      };
      tick(); timers.push(setInterval(tick, 1000));
    }
    animate();
  }

  /* =====================================================================
     الأجندة والمصادر
     ===================================================================== */
  let agendaWeek = null;
  function sessCard(s) {
    const i = s.n - 1, st = status(i), d = sessionDate(i);
    const yt = v => v.u || ("https://www.youtube.com/results?search_query=" + encodeURIComponent(v.q || v.t));
    return `<article class="sess ${st === "today" ? "today" : ""}" id="s${s.n}">
      <header><span class="no">SESSION ${pad(s.n)}</span><span class="badge ${st}">${st === "past" ? "انتهت" : st === "today" ? "اليوم" : "قادمة"}</span></header>
      <h4>${esc(s.ar)}</h4><div class="en">${esc(s.en)}</div>
      <div class="date">${fmtLong(d)}${tm()}${s.place ? " · " + (/^https?:\/\//i.test(s.place) ? `<a href="${esc(s.place)}" target="_blank" rel="noopener">رابط الجلسة</a>` : esc(s.place)) : ""}</div>
      <p>${esc(s.desc)}</p>
      <ul>${(s.topics || []).map(t => `<li>${esc(t)}</li>`).join("")}</ul>
      <div class="links">
        ${(s.refs || []).map(r => `<a href="${esc(r.u)}" target="_blank" rel="noopener">${esc(r.t)}</a>`).join("")}
        ${(s.videos || []).map(v => `<a href="${esc(yt(v))}" target="_blank" rel="noopener">${esc(v.t)}</a>`).join("")}
      </div>
      <div class="acts">
        ${s.colab ? `<a class="btn btn-pri btn-sm" href="${esc(s.colab)}" target="_blank" rel="noopener">Colab Notebook</a>` : `<span class="btn btn-sm off">Colab · قريبًا</span>`}
        ${canSee("q" + s.n) ? `<a class="btn btn-sm" href="quizzes.html?s=${s.n}${keepQ}">اختبار</a>` : `<span class="btn btn-sm off lockchip">${ico("lock", "ico sm")} اختبار · مقفل</span>`}
      </div></article>`;
  }
  function pageAgenda() {
    if (agendaWeek === null) {
      const w = Q.get("w");
      if (w !== null && +w >= 0 && +w <= WK.length) agendaWeek = +w;
      else agendaWeek = curWeekN();
    }
    const weeks = agendaWeek ? WK.filter(w => w.n === agendaWeek) : WK;
    return pageHead("الأجندة والمصادر", "أجندة المعسكر", "8 جلسات في 4 أسابيع (الاثنين والأربعاء) + أسبوع للمشروع النهائي — لكل جلسة موضوعاتها ورابط Colab ومراجع.") + `
    <div class="container">
      <div class="tabs" role="tablist">
        <button class="tab ${agendaWeek === 0 ? "on" : ""}" data-w="0">كل الأسابيع</button>
        ${WK.map(w => `<button class="tab c-${w.color} ${agendaWeek === w.n ? "on" : ""}" data-w="${w.n}">الأسبوع ${w.n}</button>`).join("")}
      </div>
      ${weeks.map(w => `<div class="weekbox c-${w.color}"><div class="weekhead"><div><h3><small>WEEK ${w.n}</small>${esc(w.title)}${w.ar ? ` <span class="muted" style="font-weight:600;font-size:.8em">· ${esc(w.ar)}</span>` : ""}</h3><p>${esc(w.goal)}</p></div></div>${w.project
        ? `<div class="grid g2"><div class="card"><h4>أسبوع العمل على المشروع</h4><p class="muted" style="margin:0">من ${fmtLong(projStart())} إلى ${fmtLong(projEnd())}. لا جلسات في هذا الأسبوع؛ العمل على المشروع والتسليم.</p>${canSee("p5") ? `<p style="margin:12px 0 0"><a class="btn btn-pri btn-sm" href="projects.html${keepQ ? "?" + keepQ.slice(1) : ""}">المشروع النهائي</a></p>${lockSw("p5")}` : ""}</div>${canSee("p5") ? "" : lockedCard("المشروع النهائي", "", "", 3)}</div>`
        : `<div class="grid g3">${SES.filter(s => s.week === w.n).map(sessCard).join("")}</div>`}</div>`).join("")}
      ${(S.notes || []).length ? `<div class="card" style="margin-top:10px"><h3>ملاحظات هامة</h3><ul class="plain">${S.notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul></div>` : ""}

      <div class="block" style="margin-top:50px">
        <div class="card-h"><h2>المصادر الأساسية لكل أسبوع</h2></div>
        <div class="res-grid">${RES.map(r => { const w = WK.find(x => x.n === r.week); return `<div class="res-row c-${w.color}"><div class="w"><small>WEEK ${r.week}</small>${esc(r.label)}</div>${[["book", "الكتاب العلمي"], ["platform", "المنصة التعليمية"], ["channel", "قناة اليوتيوب"]].map(k => `<div><small>${k[1]}</small><a href="${esc(r[k[0]].u)}" target="_blank" rel="noopener">${esc(r[k[0]].t)}</a></div>`).join("")}</div>`; }).join("")}</div>
      </div>
    </div>`;
  }
  function bindAgenda() {
    $$(".tab").forEach(b => b.onclick = () => { agendaWeek = +b.dataset.w; history.replaceState(null, "", "?w=" + agendaWeek + keepQ); render(); });
    if (location.hash) { const el = $(location.hash); if (el) setTimeout(() => el.scrollIntoView({ block: "center" }), 80); }
  }

  /* =====================================================================
     الحضور والمهام (+ لوحة المتصدرين + تقدّمي)
     ===================================================================== */
  let tv = ["att", "hw", "board", "mine"].includes(Q.get("tab")) ? Q.get("tab") : "att", tWeek = 0, tQuery = "";
  const SYM = { att: { 1: "✓", 0: "✕", 2: "⏱" }, hw: { 1: "✓", 0: "✕", 2: "◐" } };
  const LBL = { att: { 1: "حاضر", 0: "غائب", 2: "متأخر / معتذر" }, hw: { 1: "مسلَّم", 0: "لم يُسلَّم", 2: "متأخر" } };

  function pageTracker() {
    if (tv === "mine" && isTr) tv = "att";
    return pageHead("الحضور والواجبات", "سجلّ الحضور والواجبات", "صفّك مُظلَّل عند اختيار اسمك. تابع حضورك وواجباتك وترتيبك بين المشاركين.") + `
    <div class="container">
      <div class="toolbar">
        <div class="seg" role="tablist"><button data-tv="att" class="${tv === "att" ? "on" : ""}">الحضور</button><button data-tv="hw" class="${tv === "hw" ? "on" : ""}">الواجبات</button><button data-tv="board" class="${tv === "board" ? "on" : ""}">المتصدرون</button>${isTr ? "" : `<button data-tv="mine" class="${tv === "mine" ? "on" : ""}">تقدّمي</button>`}</div>
        <span id="tcontrols" style="display:contents"></span>
        ${isTr ? `<button class="btn btn-sm" id="trainerBtn" style="margin-inline-start:auto">${trainer ? "إيقاف وضع التعديل" : "تفعيل وضع التعديل"}</button>` : ""}
      </div>
      <div id="attPanel"></div>
      <div id="tbody"></div>
    </div>`;
  }
  const encodeRow = arr => arr.map(v => v === null ? "-" : v).join("").replace(/-+$/, "");

  function renderTracker() {
    clearTimers();
    const body = $("#tbody"), ctl = $("#tcontrols"), ap = $("#attPanel");
    ap.innerHTML = tv === "att" ? attPanelHtml() : ""; if (tv === "att") bindAttPanel();
    if (tv === "mine") { ctl.innerHTML = ""; body.innerHTML = mineHtml(); bindMine(); return; }
    if (tv === "board") { ctl.innerHTML = ""; body.innerHTML = boardHtml(); animate(); return; }
    ctl.innerHTML = `<select id="tw"><option value="0">كل الأسابيع</option>${trainW().map(w => `<option value="${w.n}" ${tWeek === w.n ? "selected" : ""}>الأسبوع ${w.n}</option>`).join("")}</select>
      <input type="search" id="tq" placeholder="ابحث عن اسم…" value="${esc(tQuery)}" aria-label="بحث">`;
    $("#tw").onchange = e => { tWeek = +e.target.value; drawTable(); };
    $("#tq").oninput = e => { tQuery = e.target.value; drawTable(); };
    drawTable();
  }

  function boardHtml() {
    const list = board(), max = Math.max(1, ...list.map(x => x.pts)), top = list.slice(0, 3);
    return `<div class="card"><div class="podium">${top.map((p, i) => `<div class="pod p${i + 1}"><div class="pos">${i + 1}</div><div class="nm">${esc(p.name)}</div><div class="pt">${p.pts} XP</div></div>`).join("")}</div>
      <ol class="lb">${list.map((p, i) => `<li class="${p.me ? "me" : ""}"><span class="rk">${i + 1}</span><span class="nm">${avHtml(p.name)}${esc(p.name)}${p.me ? " (أنت)" : ""}${(() => { const st = stuOf(p.name); return st ? badgesOf(st).map(b => `<span class="bmini" title="${esc(b.t)}">${ico(b.ic, "ico sm")}</span>`).join("") : ""; })()}${p.tmp ? '<span class="tag" title="نقاط اختباراتك على هذا المتصفح، وتُعتمد بعد تسليم نتائجك">مؤقتة</span>' : ""}</span><span class="pts">${p.pts}</span><div class="track"><i data-w="${Math.round(p.pts / max * 100)}"></i></div></li>`).join("")}</ol>
      <p class="muted" style="font-size:13px;margin:14px 0 0">XP = حضور في الوقت ${XP.att} (متأخر ${XP.late}) + واجب مسلَّم ${XP.hw} (متأخر ${XP.hwLate}) + نقاط إضافية من المدرّبة${qOpen() ? " + نقاط الاختبارات" : ""}.</p></div>`;
  }

  function drawTable() {
    const cols = SES.map((s, i) => i).filter(i => !tWeek || SES[i].week === tWeek);
    const rows = STUDENTS.map((s, idx) => ({ s, idx })).filter(r => r.s.name.includes(tQuery.trim()));
    const sym = SYM[tv];
    const head = cols.map(i => `<th title="${esc(SES[i].ar)}">S${SES[i].n}<small>${fmtShort(sessionDate(i))}</small></th>`).join("");
    const body = rows.map(({ s, idx }) => {
      const arr = s[tv]; let ok = 0, tot = 0;
      cols.forEach(i => { const v = arr[i]; if (v !== null && v !== undefined) { tot++; if (v === 1 || v === 2) ok++; } });
      const cells = cols.map(i => {
        const v = arr[i] ?? null, inner = v === null ? "·" : sym[v], cls = "cell " + (v === null ? "" : "v" + v);
        return trainer ? `<td><button class="${cls}" data-r="${idx}" data-c="${i}" aria-label="تبديل الحالة">${inner}</button></td>` : `<td><span class="${cls}" title="${v === null ? "لم تُسجَّل" : LBL[tv][v]}">${inner}</span></td>`;
      }).join("");
      const pts = xpOf(s) + (trainer ? ` <input type="text" inputmode="numeric" value="${s.points || 0}" data-p="${idx}" title="نقاط إضافية يدوية" style="width:60px;padding:4px 8px;text-align:center">` : "");
      const pc = tot ? Math.round(ok / tot * 100) : null;
      return `<tr class="${s.name === me ? "me" : ""}"><td>${avHtml(s.name)}${esc(s.name)}</td>${cells}<td class="pct">${pc === null ? "—" : pc + "%"}${pc === null ? "" : `<div class="mbar"><i style="width:${pc}%"></i></div>`}</td><td class="pct">${pts}</td></tr>`;
    }).join("");
    const foot = cols.map(i => { let ok = 0, tot = 0; STUDENTS.forEach(s => { const v = s[tv][i]; if (v !== null && v !== undefined) { tot++; if (v === 1 || v === 2) ok++; } }); return `<td>${tot ? Math.round(ok / tot * 100) + "%" : "·"}</td>`; }).join("");
    const tb = $("#tbody");
    tb.innerHTML = `
      ${trainer ? `<div class="trainer-bar"><strong>وضع المدرّبة:</strong> ${API() ? "اضغطي أي خانة لتبديل الحالة — تُحفظ فورًا في Google Sheet وتظهر لكل الطلاب." : "⚠️ التخزين السحابي غير مربوط (api فارغ في data.js): التعديلات تُحفظ على هذا المتصفح فقط."}
        ${API() ? '<button class="btn btn-sm" id="refresh">↻ تحديث</button>' : ""}<button class="btn btn-sm" id="exCsv">تصدير CSV</button><button class="btn btn-sm" id="exitTrainer">إيقاف التعديل</button></div>` : ""}
      <div class="tbl-wrap"><table class="tr"><thead><tr><th>الاسم</th>${head}<th>النسبة</th><th>XP</th></tr></thead><tbody>${body || `<tr><td colspan="${cols.length + 3}" style="padding:24px">${STUDENTS.length ? "لا نتائج" : "لا يوجد متدربون بعد — شاركي رابط التسجيل مع طلابك (من لوحة التحكم ← الربط والتشغيل)."}</td></tr>`}</tbody><tfoot><tr><td>المتوسط</td>${foot}<td></td><td></td></tr></tfoot></table></div>
      <div class="key">${[1, 0, 2].map(v => `<span><span class="cell v${v}">${sym[v]}</span>${LBL[tv][v]}</span>`).join("")}<span><span class="cell">·</span>لم تُسجَّل بعد</span></div>`;
    if (trainer) {
      $$("button.cell", tb).forEach(b => b.onclick = () => {
        const r = +b.dataset.r, c = +b.dataset.c, cur = STUDENTS[r][tv][c] ?? null, order = [null, 1, 0, 2];
        const nv = order[(order.indexOf(cur) + 1) % 4], st = STUDENTS[r]; st[tv][c] = nv; drawTable(); persistCell(st, tv, c, nv);
      });
      $$("[data-p]", tb).forEach(inp => inp.onchange = () => { const st = STUDENTS[+inp.dataset.p]; st.points = Math.max(0, parseInt(inp.value) || 0); persistPoints(st); });
      $("#exCsv").onclick = exportCsv;
      const rf = $("#refresh"); if (rf) rf.onclick = async () => { rf.disabled = true; const ok = await loadRemote(); toast(ok ? "تم التحديث ✓" : "تعذّر التحديث"); renderTracker(); };
      $("#exitTrainer").onclick = () => { trainer = false; render(); };
    }
  }
  /* حفظ تعديلات المدرّبة: سحابيًا (خلية واحدة فقط كي لا نمسح حضورًا سجّله طالب في الأثناء) أو محليًا */
  function cloudFail() { toast("⚠️ لم يُحفظ على السحابة — تحقّقي من الاتصال ثم أعيدي التحديث"); }
  function persistCell(st, key, i, v) {
    if (!API()) return store.set("students", STUDENTS);
    api("cell", { name: st.name, key, i, v }).then(r => { if (!r.ok) cloudFail(); }).catch(cloudFail);
  }
  function persistPoints(st) {
    if (!API()) { store.set("students", STUDENTS); return toast("تم الحفظ على هذا المتصفح"); }
    api("points", { name: st.name, v: st.points }).then(r => r.ok ? toast("تم حفظ النقاط ✓") : cloudFail()).catch(cloudFail);
  }
  function exportCsv() {
    const head = ["الاسم", "النقاط", ...SES.map(s => "حضور " + s.n), ...SES.map(s => "واجب " + s.n)];
    const rows = STUDENTS.map(s => [s.name, s.points || 0, ...SES.map((_, i) => s.att[i] == null ? "" : LBL.att[s.att[i]]), ...SES.map((_, i) => s.hw[i] == null ? "" : LBL.hw[s.hw[i]])]);
    const csv = "﻿" + [head, ...rows].map(r => r.map(x => '"' + String(x).replace(/"/g, '""') + '"').join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = "tracker.csv"; a.click();
  }
  function mineHtml() {
    const m = store.get("mine", {}), qb = bestMap(); let n = 0;
    const rows = SES.map(s => {
      const r = m[s.n] || {}, q = qb[s.n];
      n += (r.nb ? 1 : 0) + (r.hw ? 1 : 0) + (q ? 1 : 0);
      return `<div class="mine-row"><span class="mono">S${s.n}</span><span>${esc(s.ar)}${q ? ` <span class="badge up">اختبار ${q.score}/${q.total}</span>` : ""}</span>
        <label class="chk"><input type="checkbox" data-s="${s.n}" data-k="nb" ${r.nb ? "checked" : ""}> Notebook</label>
        <label class="chk"><input type="checkbox" data-s="${s.n}" data-k="hw" ${r.hw ? "checked" : ""}> الواجب</label></div>`;
    }).join("");
    const pct = Math.round(n / (SES.length * 3) * 100);
    return profileHtml() + `<div class="split" style="margin-top:18px"><div class="card"><h3>قائمة إنجازي</h3><p class="muted" style="font-size:14px">تُحفظ على متصفحك فقط لمساعدتك على المتابعة. السجلّ الرسمي هو ما تُسجّله المدرّبة.</p><div class="mine-list">${rows}</div></div>
      <div class="card" style="text-align:center;position:sticky;top:84px"><h3 style="justify-content:center">تقدّمك الكلي</h3><div class="ring-wrap">${ringSvg([{ v: pct / 100, c: "#38bdf8" }], pct + "%", 170)}</div>
      <p class="muted">${n} من ${SES.length * 3} مهمة (Notebook + واجب + اختبار لكل جلسة)</p><p>نقاط اختباراتك: <b class="mono">${localPoints()}</b></p>${me ? "" : '<button class="btn btn-sm btn-pri" id="mineMe">اختر اسمك</button>'}</div></div>`;
  }
  function bindMine() {
    $$("[data-s]").forEach(c => c.onchange = () => {
      const m = store.get("mine", {}), k = c.dataset.s; m[k] = m[k] || {}; m[k][c.dataset.k] = c.checked; store.set("mine", m);
      const y = scrollY; renderTracker(); scrollTo(0, y);
    });
    const b = $("#mineMe"); if (b) b.onclick = () => askMe();
    loadRepos();
  }
  function bindTracker() {
    $$("[data-tv]").forEach(b => b.onclick = () => { tv = b.dataset.tv; $$("[data-tv]").forEach(x => x.classList.toggle("on", x === b)); renderTracker(); });
    const tb = $("#trainerBtn"); if (tb) tb.onclick = () => { trainer = !trainer; render(); };
    renderTracker();
  }

  /* =====================================================================
     الاختبارات القصيرة
     ===================================================================== */
  let qs = null;
  const pageQuiz = () => `<div id="quizHead"></div><div class="container" id="quizStage"></div>`;

  const asgCard = a => canSee(a.id)
    ? `<div class="card asg c-${(WK.find(w => w.n === a.week) || {}).color || "blue"}" style="border-top:4px solid var(--c)"><span class="badge">الأسبوع ${a.week}</span><h3 style="margin-top:8px">${esc(a.title)}</h3><p>${esc(a.desc)}</p>${(a.todo || []).length ? `<ul class="plain">${a.todo.map(t => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}${a.due ? `<p class="muted" style="margin:8px 0 0"><b>موعد التسليم:</b> ${esc(a.due)}</p>` : ""}${isTr ? `<div style="margin-top:12px">${lockSw(a.id)}</div>` : API() && me ? `<div class="subbox" data-key="${a.id}"></div>` : ""}</div>`
    : lockedCard("مهمة الأسبوع " + a.week, "", "", 5);

  /* ---------- تسليمات الطالب (تُحفظ في الشيت) ---------- */
  async function loadMine() {
    try { const r = await api("mine", { name: me, email: sess && sess.email }); if (r.ok) MINE = r.subs; } catch (e) {}
    return MINE;
  }
  const subStatusBadge = x => `<span class="badge ${x.status === "مقبول" ? "up" : ""}">${esc(x.status)}</span>`;
  function subInfo(x) {
    return `${subStatusBadge(x)}${x.points ? ` <b class="mono">+${x.points} نقطة</b>` : ""}<div class="muted" style="margin-top:4px"><a href="${esc(x.link)}" target="_blank" rel="noopener" dir="ltr">${esc(x.link)}</a></div>${x.comment ? `<div class="explain" style="margin-top:8px"><b>ملاحظة المدرّبة:</b> ${esc(x.comment)}</div>` : ""}`;
  }
  function dueLate(a) {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(a.due || ""); if (!m) return false;
    const d = new Date(m[1] + "T23:59:59"); return Date.now() > d.getTime() && !Q.get("today");
  }
  function drawSubBoxes() {
    $$(".subbox").forEach(box => {
      const key = box.dataset.key, a = (TK().assignments || []).find(x => x.id === key), cur = MINE.find(x => x.key === key);
      const locked = cur && cur.status === "مقبول";
      box.innerHTML = `<hr style="border:0;border-top:1px solid var(--line,#ddd);margin:14px 0"><b>تسليمك</b>
        ${cur ? `<div style="margin:8px 0">${subInfo(cur)}</div>` : '<p class="muted" style="margin:6px 0">لم تسلّم بعد.</p>'}
        ${locked ? "" : `<form class="sform" data-key="${key}"><div class="fld"><label for="lk_${key}">رابط التسليم (Colab أو Drive أو غيره)</label><input type="url" id="lk_${key}" dir="ltr" placeholder="https://…" value="${esc(cur ? cur.link : "")}"></div>
        <div class="fld"><label for="nt_${key}">ملاحظة (اختيارية)</label><input type="text" id="nt_${key}" maxlength="300" value="${esc(cur ? cur.note : "")}"></div>
        <div class="err" data-sub-err></div><button class="btn btn-pri btn-sm" type="submit">${cur ? "تحديث التسليم" : "سلّم المهمة"}</button></form>`}`;
      const f = $("form", box); if (!f) return;
      f.onsubmit = async e => {
        e.preventDefault();
        const link = $("#lk_" + key).value.trim(), er = $("[data-sub-err]", f);
        if (!/^https?:\/\/\S+\.\S+/i.test(link)) { er.textContent = "أدخل رابطًا صحيحًا يبدأ بـ https://"; return; }
        er.textContent = ""; const btn = $("button", f); btn.disabled = true;
        let r; try { r = await api("submit", { name: me, email: sess && sess.email, kind: "task", key, link, note: $("#nt_" + key).value.trim(), late: dueLate(a), hw: a.week * 2 - 1 }); } catch (x) { r = { ok: false, err: "net" }; }
        btn.disabled = false;
        if (!r.ok) { er.textContent = r.err === "accepted" ? "قُبل تسليمك مسبقًا." : "تعذّر الإرسال، حاول مرة أخرى."; return; }
        toast("تم التسليم ✓"); const st = stuOf(me); if (st) st.hw[a.week * 2 - 1] = dueLate(a) ? 2 : 1;
        await loadMine(); drawSubBoxes();
      };
    });
  }

  function renderSelect() {
    const best = bestMap(), ni = nextIdx(), asg = TK().assignments || [];
    $("#quizHead").innerHTML = pageHead("", "الاختبارات والمهام", "اختبار قصير لكل جلسة ومهمة لكل أسبوع. يفتحها المدرّب تباعًا، وما زال مقفلًا يظهر لك رماديًا.");
    $("#quizStage").innerHTML = `
      ${isTr ? `<div class="trainer-bar">🔑 أنتِ ترين كل شيء مفتوحًا للمعاينة. استخدمي زر القفل على كل عنصر لفتحه للطلاب أو إعادة قفله (أو من لوحة التحكم ← الأقفال).</div>` : ""}
      <div class="card" style="margin-bottom:22px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><span><b>نقاط اختباراتك:</b> <span class="mono" style="color:var(--pri);font-size:1.1em">${localPoints()}</span></span>${me ? `<span class="muted">${esc(me)}</span>` : '<button class="btn btn-sm btn-pri" id="qMe">اختر اسمك</button>'}</div>
      <div class="sec-head"><h2>الاختبارات <span class="acc">القصيرة</span></h2><p>5 أسئلة · تقييم فوري مع شرح · كل إجابة صحيحة = 10 نقاط (+10 للعلامة الكاملة) · تُحتسب المحاولة الأولى، والإعادة للتدريب.</p></div>
      <div class="grid g4">${trainW().map(w => `<div class="card c-${w.color}" style="border-top:4px solid var(--c)"><h3>الأسبوع ${w.n}</h3><div class="qchips">${SES.filter(s => s.week === w.n).map(s => {
        const id = "q" + s.n;
        if (!canSee(id)) return `<div class="qchip lk-chip" role="button" tabindex="0" aria-label="اختبار الجلسة ${s.n} — مقفل"><span class="lk-lines" aria-hidden="true"></span><span class="lk-lab">${ico("lock", "ico sm")} اختبار الجلسة ${s.n}</span></div>`;
        const b = best[s.n];
        return `<div class="qrow"><button class="qchip c-${w.color}" data-n="${s.n}"><span>${s.n}. ${esc(s.ar)}${ni === s.n - 1 ? " " : ""}</span>${b ? `<span class="sc ${b.score === b.total ? "perfect" : ""}">${b.score}/${b.total}</span>` : ""}</button>${lockSw(id, true)}</div>`;
      }).join("")}</div></div>`).join("")}</div>
      <div class="sec-head" id="tasks" style="margin-top:50px"><h2>المهام <span class="acc">الأسبوعية</span></h2><p>في كل أسبوع مهمة أو اختبار يجب إنجازه، إضافةً إلى النقاش الحواري في مجموعة التليقرام.</p></div>
      <div class="grid g2">${asg.map(asgCard).join("")}</div>`;
    $$(".qchip[data-n]").forEach(b => b.onclick = () => { location.href = "quizzes.html?s=" + b.dataset.n + keepQ; });
    $$(".lk-chip").forEach(el => { const f = () => toast("🔒 مقفل — سيفتحه المدرّب في الوقت المناسب"); el.onclick = f; el.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); f(); } }; });
    const m = $("#qMe"); if (m) m.onclick = () => askMe();
    if (API() && me && !isTr) loadMine().then(drawSubBoxes);
    if (location.hash === "#tasks") { const el = $("#tasks"); if (el) setTimeout(() => el.scrollIntoView({ block: "start" }), 80); }
  }
  function startQuiz(n) {
    const bank = QZ[n]; if (!bank || !canSee("q" + n)) return renderSelect();
    const items = shuffle(bank).map(q => { const opts = shuffle([q.c, ...q.w]); return { q: q.q, opts, ans: opts.indexOf(q.c), e: q.e }; });
    qs = { n, items, i: 0, score: 0, log: [] };
    $("#quizHead").innerHTML = ""; $("#quizStage").style.paddingTop = "34px";
    renderQ();
  }
  function renderQ() {
    const { n, items, i } = qs, it = items[i], s = SES[n - 1], stage = $("#quizStage");
    stage.innerHTML = `<div class="quiz-box">
      <div class="q-top"><span>الجلسة ${n}: ${esc(s.ar)}</span><span class="mono">${i + 1} / ${items.length}</span></div>
      <div class="progress"><i style="width:${i / items.length * 100}%"></i></div>
      <div class="qcard"><h3>${esc(it.q)}</h3>
        <div class="opts">${it.opts.map((o, k) => `<button class="opt" data-k="${k}"><span class="k">${"أبجد"[k]}</span><span>${esc(o)}</span></button>`).join("")}</div>
        <div id="fb"></div></div>
      <div style="text-align:center;margin-top:16px"><a class="btn-link" href="quizzes.html${keepQ ? "?" + keepQ.slice(1) : ""}">إنهاء والعودة للقائمة</a></div></div>`;
    requestAnimationFrame(() => { const p = $(".progress i"); if (p) p.style.width = ((i + .0001) / items.length * 100) + "%"; });
    $$(".opt").forEach(b => b.onclick = () => {
      const k = +b.dataset.k, ok = k === it.ans;
      $$(".opt").forEach(x => { x.disabled = true; const kk = +x.dataset.k; if (kk === it.ans) x.classList.add("right"); else if (kk === k) x.classList.add("wrong"); });
      if (ok) qs.score++;
      qs.log.push({ q: it.q, ok, correct: it.opts[it.ans] });
      $("#fb").innerHTML = `<div class="explain"><b>${ok ? "إجابة صحيحة!" : "❌ ليست الإجابة الصحيحة."}</b> ${esc(it.e)}</div>
        <div style="margin-top:14px;text-align:end"><button class="btn btn-pri" id="nxt">${i + 1 === items.length ? "عرض النتيجة" : "السؤال التالي ←"}</button></div>`;
      $("#nxt").onclick = () => { qs.i++; qs.i >= items.length ? finishQuiz() : renderQ(); };
      $("#nxt").focus();
    });
  }
  function finishQuiz() {
    const { n, items, score, log } = qs, total = items.length, stage = $("#quizStage");
    const best = bestMap(), prev = best[n], improved = !prev || score > prev.score;
    if (!API() && improved) { best[n] = { score, total, at: Date.now() }; store.set("quiz", best); }
    const pts = score * 10 + (score === total ? 10 : 0);
    const msg = score === total ? "ممتاز! علامة كاملة " : score >= total * .8 ? "أداء رائع " : score >= total * .6 ? "جيّد، راجع الأخطاء وأعد المحاولة" : "لا بأس — راجع المصادر وجرّب مرة أخرى ";
    if (score >= total * .8) confetti();
    stage.innerHTML = `<div class="quiz-box result"><div class="qcard">
      <div class="score-ring">${ringSvg([{ v: score / total, c: score === total ? "#34d399" : "#38bdf8" }], score + "/" + total, 170)}</div>
      <h3>${msg}</h3>
      ${API() ? '<p id="qSave" class="muted">جارٍ حفظ نتيجتك…</p>' : `<p>حصلت على <b class="mono" style="color:var(--pri)">${pts}</b> نقطة في هذه المحاولة${improved ? " — وهي أفضل نتيجة لك " : ` (أفضل نتيجة سابقة ${prev.score}/${prev.total})`}.</p>
      <p class="muted">مجموع نقاط اختباراتك: <b class="mono">${localPoints()}</b></p>`}
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:12px">
        <button class="btn btn-pri" id="again">إعادة الاختبار</button>
        ${API() ? "" : '<button class="btn" id="sendRes">أرسل نتيجتي للمدرّبة</button>'}
        <a class="btn" href="quizzes.html${keepQ ? "?" + keepQ.slice(1) : ""}">اختبار آخر</a><a class="btn" href="tracker.html?tab=board${keepQ}">المتصدرون</a></div>
      <div class="review">${log.map(l => `<div class="${l.ok ? "" : "bad"}">${l.ok ? "✔" : "✘"} ${esc(l.q)}${l.ok ? "" : `<br><small class="muted">الصحيح: ${esc(l.correct)}</small>`}</div>`).join("")}</div>
    </div></div>`;
    $("#again").onclick = () => startQuiz(n);
    if (API()) saveQuiz(n, score, total);
    const sr = $("#sendRes"); if (sr) sr.onclick = () => ensureMe(async () => {
      const how = await submitRecord("quiz", { "الاسم": me, "الجلسة": n + " — " + SES[n - 1].ar, "النتيجة": score + "/" + total, "النقاط": pts, "التاريخ": new Date().toLocaleString("ar") }, "نتيجة اختبار — " + me + " — جلسة " + n);
      toast(how === "endpoint" ? "تم إرسال نتيجتك ✓" : "فُتحت صفحة GitHub: اضغط Submit new issue لإتمام الإرسال");
    });
  }
  async function saveQuiz(n, score, total) {
    const el = $("#qSave"); if (!el) return;
    if (!me || isTr) { el.textContent = isTr ? "وضع المعاينة: لا تُحفظ نتيجة المدرّبة." : "سجّل الدخول كمتدرب لتُحفظ نتيجتك."; return; }
    let r; try { r = await api("quiz", { name: me, email: sess && sess.email, n, score, total }); } catch (e) { r = { ok: false, err: "net" }; }
    if (!r.ok) { el.textContent = "⚠️ تعذّر حفظ النتيجة. تحقق من الاتصال ثم أعد الاختبار."; return; }
    const st = stuOf(me); if (st && r.first) { st.quiz = st.quiz || {}; st.quiz[n] = [r.score, r.total]; }
    const pts = r.score * 10 + (r.score === r.total ? 10 : 0);
    el.innerHTML = r.first ? `حُفظت محاولتك الأولى: <b class="mono">${r.score}/${r.total}</b> — <b class="mono" style="color:var(--pri)">${pts}</b> نقطة. الإعادة بعد ذلك للتدريب فقط.`
      : `هذه إعادة للتدريب. درجتك المحتسبة (المحاولة الأولى): <b class="mono">${r.score}/${r.total}</b>.`;
  }
  function bindQuiz() { const n = +Q.get("s"); if (n && QZ[n] && canSee("q" + n)) startQuiz(n); else renderSelect(); }

  /* =====================================================================
     المشاريع
     ===================================================================== */
  function pageProjects() {
    const T = TK().project || {};
    if (!canSee("p5")) return pageHead("", "المشروع النهائي", "يُفتح في أسبوع المشروع بقرار المدرّب.") + `<div class="container" style="max-width:860px">${lockedCard("المشروع النهائي", "", "lk-big", 8)}</div>`;
    const subs = store.get("subs", []), d = store.get("draft", {});
    const f = (id, label, ph, extra = "", hint = "") => `<div class="fld"><label for="${id}">${label}</label><input ${extra} id="${id}" name="${id}" placeholder="${ph}" value="${esc(d[id] || "")}">${hint ? `<small>${hint}</small>` : ""}<div class="err" data-err="${id}"></div></div>`;
    return pageHead("المشاريع", "تسليم المشروع النهائي", esc(T.desc || "")) + `
    <div class="container">
      ${isTr ? `<div class="trainer-bar">${lockSw("p5")}<span>المشروع مفتوح للطلاب حاليًا. اضغطي الزر لإعادة قفله.</span></div>` : ""}
      <div class="split block">
        <form class="card" id="pform" novalidate>
          <h3>نموذج التسليم</h3>
          ${f("team", "اسم الفريق (أو اسمك إن كان فرديًا)", "مثال: Insight Squad", 'type="text" required maxlength="60"')}
          ${f("leader", "صاحب المشروع / قائد الفريق", "الاسم", 'type="text" required maxlength="60"')}
          ${f("members", "أعضاء الفريق (إن وُجدوا)", "أسماء الأعضاء مفصولة بفاصلة", 'type="text" maxlength="200"')}
          ${f("title", "عنوان المشروع", "مثال: Chat with Your Sales Data", 'type="text" required maxlength="100"')}
          ${f("github", "رابط GitHub", "https://github.com/username/repo", 'type="url" required dir="ltr"', "رابط المستودع، ويجب أن يحوي README")}
          ${f("demo", "رابط العرض التقديمي أو الـ Demo", "https://…", 'type="url" required dir="ltr"', "Presentation (Google Slides / PDF) أو تطبيق Streamlit / Colab")}
          <div class="fld"><label for="desc">وصف مختصر</label><textarea id="desc" rows="3" maxlength="400" placeholder="ما المشكلة؟ ما البيانات؟ ما النموذج؟">${esc(d.desc || "")}</textarea></div>
          <button class="btn btn-pri" type="submit">تسليم المشروع</button>
          <small class="muted">${API() ? "يُحفظ التسليم عند المدرّبة مباشرة ويمكنك تحديثه قبل القبول." : "ستُفتح صفحة GitHub جاهزة التعبئة (Issue) لإتمام التسليم."} المسودة تُحفظ تلقائيًا.</small>
        </form>
        <div style="display:grid;gap:18px">
          <div class="card"><h3>خطوات المشروع</h3><ol class="steps">
            ${(T.steps || []).map(x => `<li><span>${esc(x)}</span></li>`).join("")}</ol></div>
          <div class="card"><h3>معايير التقييم</h3><div class="rubric">
            ${(T.rubric || []).map(r => `<div class="row"><span>${r[0]}</span><b class="mono">${r[1]}</b><div class="bar"><i data-w="${r[1] * 3}"></i></div></div>`).join("")}</div></div>
        </div>
      </div>
      ${API() && me && !isTr ? `<div class="block" id="mineP"></div>` : ""}
      ${!API() && subs.length ? `<div class="block"><div class="card-h"><h2>تسليماتي على هذا المتصفح</h2></div><div class="grid g3">${subs.map(p => `<div class="proj c-green"><span class="badge up">${esc(p.date)}</span><h4>${esc(p.title)}</h4><p class="muted" style="margin:0">${esc(p.team)}</p></div>`).join("")}</div></div>` : ""}
      ${PROJ.length ? `<div class="block"><div class="card-h"><h2>مشاريع الدفعة</h2></div>
      <div class="grid g3">${PROJ.map((p, i) => `<div class="proj c-${["blue", "yellow", "green"][i % 3]}"><span class="badge">${esc(p.tag || "PROJECT")}</span><h4>${esc(p.title)}</h4><p class="muted" style="margin:0 0 12px;font-size:14px">${esc(p.team)} · ${esc(p.leader)}</p><div style="display:flex;gap:8px;flex-wrap:wrap">${p.github ? `<a class="btn btn-sm" target="_blank" rel="noopener" href="${esc(p.github)}">GitHub</a>` : ""}${p.demo ? `<a class="btn btn-sm btn-pri" target="_blank" rel="noopener" href="${esc(p.demo)}">Demo</a>` : ""}</div></div>`).join("")}</div></div>` : ""}
    </div>`;
  }
  function bindProjects() {
    if (API() && me && !isTr && $("#mineP")) loadMine().then(() => {
      const x = MINE.find(y => y.key === "p5"), T = TK().project || {}; if (!x) return;
      let rub = []; try { rub = (JSON.parse(x.extra || "{}").rubric) || []; } catch (e) {}
      $("#mineP").innerHTML = `<div class="card"><h3>تسليمك للمشروع</h3>${subInfo(x)}${rub.length ? `<div class="rubric" style="margin-top:10px">${(T.rubric || []).map((r, i) => `<div class="row"><span>${esc(r[0])}</span><b class="mono">${rub[i] ?? "—"} / ${r[1]}</b></div>`).join("")}</div>` : ""}</div>`;
    });
    const form = $("#pform"); if (!form) return;
    if (me && !$("#leader").value) $("#leader").value = me;
    form.addEventListener("input", () => { const d = {}; $$("input,textarea", form).forEach(x => { d[x.id] = x.value; }); store.set("draft", d); });
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const v = id => $("#" + id).value.trim(), errs = {};
      if (!v("team")) errs.team = "اكتب اسم الفريق";
      if (!v("leader")) errs.leader = "اكتب اسم القائد";
      if (!v("title")) errs.title = "اكتب عنوان المشروع";
      if (!/^https:\/\/(www\.)?github\.com\/[^\/\s]+\/[^\/\s]+/i.test(v("github"))) errs.github = "أدخل رابط مستودع GitHub صحيح، مثل https://github.com/user/repo";
      if (!/^https?:\/\/\S+\.\S+/i.test(v("demo"))) errs.demo = "أدخل رابطًا صحيحًا يبدأ بـ https://";
      $$("[data-err]").forEach(el => { el.textContent = errs[el.dataset.err] || ""; });
      const first = Object.keys(errs)[0]; if (first) { $("#" + first).focus(); return; }
      if (API()) {
        if (!me) { toast("سجّل الدخول كمتدرب لتسليم المشروع"); return; }
        const btn = $("button[type=submit]", form); btn.disabled = true;
        let r; try { r = await api("submit", { name: me, email: sess && sess.email, kind: "project", key: "p5", link: v("github"), note: v("title"), late: S.endDate && Date.now() > new Date(S.endDate + "T23:59:59").getTime() && !Q.get("today"), extra: { team: v("team"), leader: v("leader"), members: v("members"), title: v("title"), demo: v("demo"), desc: v("desc") } }); } catch (x) { r = { ok: false, err: "net" }; }
        btn.disabled = false;
        if (!r.ok) { toast(r.err === "accepted" ? "قُبل مشروعك مسبقًا" : "⚠️ تعذّر التسليم، حاول مرة أخرى"); return; }
        store.del("draft"); confetti(); toast("تم تسليم مشروعك ✓"); await loadMine(); setTimeout(render, 400); return;
      }
      const how = await submitRecord("project", { "الفريق": v("team"), "القائد": v("leader"), "الأعضاء": v("members") || "—", "العنوان": v("title"), "GitHub": v("github"), "Demo / Presentation": v("demo"), "الوصف": v("desc") || "—" }, "تسليم مشروع — " + v("team"));
      const subs = store.get("subs", []); subs.unshift({ team: v("team"), title: v("title"), date: new Date().toLocaleDateString("ar-u-ca-gregory-nu-latn") }); store.set("subs", subs);
      store.del("draft"); confetti();
      toast(how === "endpoint" ? "تم تسليم مشروعك بنجاح " : "فُتحت صفحة GitHub: اضغط Submit new issue لإتمام التسليم");
      setTimeout(render, 600);
    });
    animate();
  }

  /* =====================================================================
     إضافات: الدخول، التسجيل التلقائي، الحضور برمز مؤقت، المهام (GitHub)، XP والأوسمة
     ===================================================================== */
  const nulls = () => Array(SES.length).fill(null);
  const stuOf = n => STUDENTS.find(s => s.name === n);
  const persistMe = () => { const s = me && stuOf(me); if (s) store.set("rec", s); };
  const fmtDT = iso => iso ? new Date(iso).toLocaleString("ar-u-ca-gregory-nu-latn", { dateStyle: "medium", timeStyle: "short" }) : "";
  const fmtT = iso => new Date(iso).toLocaleTimeString("ar-u-nu-latn", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

  /* ---------- الصورة الرمزية (من GitHub إن وُجد الحساب) ---------- */
  function avHtml(name, cls = "av") {
    const s = stuOf(name), gh = s && s.github, l = esc(String(name || "").trim()[0] || "·");
    return `<div class="${cls}"><span>${l}</span>${gh ? `<img src="https://github.com/${encodeURIComponent(gh)}.png?size=96" alt="" loading="lazy" onerror="this.remove()">` : ""}</div>`;
  }

  /* ---------- XP والأوسمة ---------- */
  const XP = { att: 10, late: 5, hw: 20, hwLate: 10 };
  function xpOf(s) {
    let x = (s.points || 0) + (s.subPts || 0);
    Object.values(s.quiz || {}).forEach(v => { x += v[0] * 10 + (v[0] === v[1] ? 10 : 0); });
    (s.att || []).forEach(v => { if (v === 1) x += XP.att; else if (v === 2) x += XP.late; });
    (s.hw || []).forEach(v => { if (v === 1) x += XP.hw; else if (v === 2) x += XP.hwLate; });
    return x;
  }
  function badgesOf(s) {
    const b = [], att = s.att || [], hwa = s.hw || [];
    if (att.filter(v => v != null).length >= 3 && pctOf(att) >= 90) b.push({ ic: "target", t: "ملتزم بالحضور", d: "حضور 90% فأكثر" });
    if (streakOf(att) >= 5) b.push({ ic: "bolt", t: "سلسلة حضور", d: "5 جلسات متواصلة أو أكثر" });
    if (hwa.filter(v => v != null).length >= 3 && pctOf(hwa) >= 90) b.push({ ic: "rocket", t: "منتظم بالواجبات", d: "تسليم 90% فأكثر من الواجبات" });
    if (s.name === me && Object.values(bestMap()).some(r => r.score === r.total)) b.push({ ic: "quiz", t: "عبقري الاختبارات", d: "علامة كاملة في اختبار" });
    return b;
  }
  const badgeChip = b => `<span class="bdg" title="${esc(b.d)}">${ico(b.ic, "ico sm")}${esc(b.t)}</span>`;

  /* ---------- بوابة الدخول والتسجيل ---------- */
  const GH_RE = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;
  function register(name, email, gh) {
    let s = stuOf(name);
    if (!s) { s = { name, att: nulls(), hw: nulls(), points: 0, tasks: {}, checkins: {}, joined: new Date().toISOString() }; STUDENTS.push(s); }
    s.email = email; s.github = gh; s.tasks = s.tasks || {}; s.checkins = s.checkins || {};
    store.set("rec", s); return s;
  }
  function mergeMine() {
    if (!me || API()) return;
    let s = stuOf(me); const r = store.get("rec", null);
    if (!s && r && r.name === me) { STUDENTS.push(r); s = r; }
    else if (s && r && r.name === me && r !== s) {
      ["github", "email", "joined"].forEach(k => { if (!s[k] && r[k]) s[k] = r[k]; });
      s.tasks = Object.assign({}, r.tasks, s.tasks); s.checkins = Object.assign({}, r.checkins, s.checkins);
      ["att", "hw"].forEach(k => { s[k] = s[k] || nulls(); (r[k] || []).forEach((v, i) => { if (v != null && s[k][i] == null) s[k][i] = v; }); });
    }
    if (s) { s.tasks = s.tasks || {}; s.checkins = s.checkins || {}; store.set("rec", s); }
  }
  function applySess() {
    isTr = !!sess && sess.role === "trainer";
    me = sess && sess.role === "trainee" ? sess.name : null;
    trainer = isTr;
    if (isTr) { const o = store.get("students", null); if (o && Array.isArray(o) && o.length) STUDENTS = o; }
    mergeMine(); updateChip(); drawNav(); render();
  }
  function showGate() {
    if ($("#gate")) return;
    const g = document.createElement("div"); g.id = "gate"; g.className = "gate"; document.body.appendChild(g);
    document.body.classList.add("gated");
    const shell = inner => { g.innerHTML = `<div class="gate-card card"><span class="brand-mark">DA</span><h2>${esc(S.name)}</h2>${inner}</div>`; };
    const done = (role, name, extra) => { sess = Object.assign({ role, name }, extra || {}); store.set("sess", sess); g.remove(); document.body.classList.remove("gated"); applySess(); };
    const fld = (id, label, extra = "", hint = "") => `<div class="fld"><label for="${id}">${label}</label><input type="text" id="${id}" ${extra}>${hint ? `<small>${hint}</small>` : ""}<div class="err" data-e="${id}"></div></div>`;
    const setErr = e => $$("[data-e]", g).forEach(x => { x.textContent = e[x.dataset.e] || ""; });

    function roleStep() {
      shell(`<p class="muted">اختر نوع الدخول للمتابعة</p><div class="roles">
        <button class="role" data-r="trainee">${ico("users", "ico lg")}<b>متدرب</b><small>تسجيل جديد أو دخول</small></button>
        <button class="role" data-r="trainer">${ico("flag", "ico lg")}<b>المدرّبة</b><small>الاسم + رمز الدخول</small></button></div>`);
      $$(".role", g).forEach(b => b.onclick = () => b.dataset.r === "trainee" ? traineeStep("new") : trainerStep());
    }
    function trainerStep() {
      shell(`<p class="muted">دخول المدرّبة</p>${fld("gN", "الاسم", 'maxlength="40" autocomplete="off"')}
        <div class="fld"><label for="gP">رمز الدخول</label><input type="password" id="gP" inputmode="numeric" autocomplete="off"><div class="err" data-e="gP"></div></div>
        <div class="row"><button class="btn btn-pri" id="gGo">دخول</button><button class="btn" id="gBack">رجوع</button></div>`);
      $("#gBack").onclick = roleStep;
      const go = async () => {
        const n = $("#gN").value.trim(), pin = $("#gP").value;
        if (!n) return setErr({ gN: "اكتبي الاسم" });
        if (!API()) { if (pin !== String(S.trainerPin)) return setErr({ gP: "الرمز غير صحيح" }); return done("trainer", n); }
        const btn = $("#gGo"); btn.disabled = true; btn.textContent = "جارٍ التحقق…";
        let r; try { r = await api("auth", { pin }); } catch (e) { r = { ok: false, err: "net" }; }
        btn.disabled = false; btn.textContent = "دخول";
        if (!r.ok) return setErr({ gP: r.err === "pin" ? "الرمز غير صحيح" : "تعذّر الاتصال بالسيرفر، حاولي مجددًا" });
        sess = { role: "trainer", name: n, pin }; await loadRemote(); done("trainer", n, { pin });
      };
      $("#gGo").onclick = go; $("#gP").onkeydown = e => { if (e.key === "Enter") go(); }; $("#gN").focus();
    }
    function traineeStep(tab) {
      const names = STUDENTS.map(s => s.name), rec = store.get("rec", null);
      if (rec && !names.includes(rec.name)) names.push(rec.name);
      shell(`<div class="seg" style="margin:6px 0 16px"><button data-t="new" class="${tab === "new" ? "on" : ""}">تسجيل جديد</button><button data-t="in" class="${tab === "in" ? "on" : ""}">لدي حساب</button></div>
      ${tab === "new" ? `<form id="regF" novalidate class="gform">
          ${fld("gName", "الاسم الثلاثي", 'maxlength="60" autocomplete="name"')}
          ${fld("gMail", "البريد الإلكتروني", 'type="email" dir="ltr" maxlength="80" autocomplete="email"')}
          ${fld("gGh", "اسم المستخدم في GitHub (اختياري)", 'dir="ltr" maxlength="60" placeholder="octocat"', "اتركه فارغًا إن لم يكن لديك حساب")}
          <div class="row"><button class="btn btn-pri" type="submit" id="gReg">انضمام للمعسكر</button><button class="btn" type="button" id="gBack">رجوع</button></div></form>`
      : `<div class="gform"><div class="fld"><label for="gSel">اختر اسمك</label><select id="gSel"><option value="">— اختر —</option>${names.map(n => `<option>${esc(n)}</option>`).join("")}</select><div class="err" data-e="gSel"></div></div>
          ${API() ? fld("gMail2", "بريدك المسجَّل", 'type="email" dir="ltr" autocomplete="email"') : ""}
          <div class="row"><button class="btn btn-pri" id="gIn">دخول</button><button class="btn" id="gBack">رجوع</button></div></div>`}`);
      $("#gBack").onclick = roleStep;
      $$(".seg button", g).forEach(b => b.onclick = () => traineeStep(b.dataset.t));
      if (tab === "in") {
        $("#gIn").onclick = async () => {
          const n = $("#gSel").value; if (!n) return setErr({ gSel: "اختر اسمك من القائمة" });
          if (API()) {
            const b = $("#gIn"); b.disabled = true;
            let r; try { r = await api("login", { name: n, email: $("#gMail2").value }); } catch (e) { r = { ok: false, err: "net" }; }
            b.disabled = false;
            if (!r.ok) return setErr({ gMail2: r.err === "mail" ? "البريد لا يطابق المسجَّل" : "تعذّر الاتصال بالسيرفر" });
          }
          const em = API() ? $("#gMail2").value.trim() : ""; sess = { role: "trainee", name: n, email: em }; me = n; mergeMine(); done("trainee", n, { email: em });
        };
        return;
      }
      $("#regF").onsubmit = async e => {
        e.preventDefault();
        const name = $("#gName").value.trim().replace(/\s+/g, " "), mail = $("#gMail").value.trim(),
              gh = $("#gGh").value.trim().replace(/^https?:\/\/github\.com\//i, "").replace(/^@/, "").replace(/\/.*$/, ""), er = {};
        if (name.split(" ").length < 3) er.gName = "اكتب الاسم الثلاثي";
        if (!/^\S+@\S+\.\S+$/.test(mail)) er.gMail = "أدخل بريدًا صحيحًا";
        if (gh && !GH_RE.test(gh)) er.gGh = "اسم مستخدم GitHub غير صالح";
        setErr(er); if (Object.keys(er).length) return;
        const btn = $("#gReg"); btn.disabled = true; btn.textContent = "جارٍ التحقق…";
        if (gh) try { const r = await fetch("https://api.github.com/users/" + encodeURIComponent(gh)); if (r.status === 404) { btn.disabled = false; btn.textContent = "انضمام للمعسكر"; return setErr({ gGh: "هذا الحساب غير موجود في GitHub" }); } } catch (x) {}
        if (API()) {
          btn.textContent = "جارٍ التسجيل…";
          let r; try { r = await api("register", { name, email: mail, github: gh }); } catch (x) { r = { ok: false, err: "net" }; }
          if (!r.ok) { btn.disabled = false; btn.textContent = "انضمام للمعسكر"; return setErr({ gName: r.err === "exists" ? "هذا الاسم مسجَّل مسبقًا — استخدم «لدي حساب»" : "تعذّر الاتصال بالسيرفر، حاول مرة أخرى" }); }
        }
        register(name, mail, gh); done("trainee", name, { email: mail }); toast("تم تسجيلك في المعسكر ✓");
      };
    }
    Q.get("join") ? traineeStep("new") : roleStep();
  }

  /* ---------- الحضور برمز مؤقت (يُحسب من الوقت + سرّ، فيعمل بين الأجهزة بلا سيرفر) ---------- */
  const OTP_MS = () => (S.otpMinutes || 5) * 60000;
  const hash32 = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const otpFor = w => String(hash32((S.otpSecret || "x") + ":" + w) % 10000).padStart(4, "0");
  const otpWin = () => Math.floor(Date.now() / OTP_MS());
  const otpOk = c => { const w = otpWin(), el = Date.now() - w * OTP_MS(); return c === otpFor(w) || (el < 60000 && c === otpFor(w - 1)); };
  let otpS = { code: "----", end: 0, busy: false };
  async function fetchOtp() {
    if (otpS.busy) return; otpS.busy = true;
    try { const r = await api("otp"); if (r.ok) otpS = { code: r.code, end: Date.now() + r.left * 1000, busy: false }; } catch (e) {}
    otpS.busy = false;
  }
  const todayIdx = () => SES.findIndex((_, i) => dayDiff(i) === 0);

  function attPanelHtml() {
    const ni = todayIdx();
    if (isTr) {
      const past = SES.map((_, i) => i).filter(i => dayDiff(i) < 0), ci = ni >= 0 ? ni : past[past.length - 1];
      let sum = "";
      if (ci !== undefined) {
        const c = { 1: 0, 2: 0, 0: 0, n: 0 };
        STUDENTS.forEach(s => { const v = s.att[ci]; if (v === 1 || v === 2 || v === 0) c[v]++; else c.n++; });
        sum = `<div class="sumrow"><span class="sum ok"><b>${c[1]}</b> حاضر</span><span class="sum late"><b>${c[2]}</b> متأخر</span><span class="sum bad"><b>${c[0]}</b> غائب</span><span class="sum"><b>${c.n}</b> لم يُسجَّل</span><small class="muted">جلسة ${SES[ci].n} — ${esc(SES[ci].ar)}</small></div>`;
      }
      return `<div class="card attp"><div class="otpbox"><div><small class="muted">رمز الحضور الحالي — يتغيّر كل ${S.otpMinutes || 5} دقائق</small>
        <div class="otp mono" id="otpCode">----</div><small>ينتهي بعد <b class="mono" id="otpLeft">--:--</b></small></div>
        <div class="otpbtns"><button class="btn btn-sm" id="cpInvite">نسخ رابط التسجيل</button>${ci !== undefined ? `<button class="btn btn-sm" id="markAbs" data-ci="${ci}">غير المسجّلين ← غائب</button>` : ""}</div></div>${sum}</div>`;
    }
    const s = stuOf(me);
    if (ni < 0) return `<div class="card attp"><b>تسجيل الحضور</b><p class="muted" style="margin:4px 0 0">يُفتح تسجيل الحضور يوم الجلسة: اكتب الرمز الظاهر على شاشة المدرّبة.</p></div>`;
    const v = s && s.att[ni], t = s && s.checkins && s.checkins[ni + 1];
    if (v === 1 || v === 2) return `<div class="card attp"><b>✓ تم تسجيل حضورك</b> <span class="badge ${v === 2 ? "" : "up"}">${v === 2 ? "متأخر" : "في الوقت"}</span>${t ? `<span class="muted mono"> · ${fmtT(t)}</span>` : ""}</div>`;
    return `<div class="card attp"><b>سجّل حضورك — جلسة ${SES[ni].n}</b><form id="ciF" class="cirow"><input type="text" id="ciCode" inputmode="numeric" maxlength="4" placeholder="0000" dir="ltr" autocomplete="off"><button class="btn btn-pri" type="submit">تسجيل</button></form><div class="err" id="ciE"></div></div>`;
  }
  function bindAttPanel() {
    if (isTr) {
      const tick = () => {
        const el = $("#otpCode"); if (!el) return;
        if (API()) {
          if (Date.now() >= otpS.end - 800) fetchOtp();
          el.textContent = otpS.code; const left = Math.max(0, Math.ceil((otpS.end - Date.now()) / 1000));
          $("#otpLeft").textContent = pad(Math.floor(left / 60)) + ":" + pad(left % 60); return;
        }
        const w = otpWin(); el.textContent = otpFor(w); const left = Math.max(0, Math.ceil(((w + 1) * OTP_MS() - Date.now()) / 1000)); $("#otpLeft").textContent = pad(Math.floor(left / 60)) + ":" + pad(left % 60);
      };
      tick(); timers.push(setInterval(tick, 1000));
      if (API()) timers.push(setInterval(async () => { if (document.activeElement && /INPUT|SELECT/.test(document.activeElement.tagName)) return; if (await loadRemote()) renderTracker(); }, 30000));   // تحديث تلقائي أثناء الجلسة
      $("#cpInvite").onclick = () => { const u = new URL("index.html?join=1", location.href).href; try { navigator.clipboard.writeText(u); } catch (e) {} toast("تم نسخ رابط التسجيل ✓"); };
      const m = $("#markAbs"); if (m) m.onclick = async () => {
        const ci = +m.dataset.ci; STUDENTS.forEach(s => { if (s.att[ci] == null) s.att[ci] = 0; });
        if (API()) { try { const r = await api("absent", { i: ci }); if (!r.ok) throw 0; } catch (e) { cloudFail(); } } else store.set("students", STUDENTS);
        renderTracker(); toast("سُجّل غير الحاضرين كغائبين");
      };
      return;
    }
    const f = $("#ciF"); if (f) f.onsubmit = e => { e.preventDefault(); checkin($("#ciCode").value.trim()); };
  }
  async function checkin(code) {
    const ni = todayIdx(), s = stuOf(me), err = m => { $("#ciE").textContent = m; };
    if (ni < 0 || !s) return err("لا توجد جلسة اليوم");
    if (!/^\d{4}$/.test(code)) return err("أدخل الرمز المكوّن من 4 أرقام");
    const now = new Date(), start = sessionDate(ni); start.setHours(S.sessionHour ?? 20, 0, 0, 0);
    const late = !Q.get("today") && now - start > (S.lateAfterMin ?? 15) * 60000;
    let v = late ? 2 : 1;
    if (API()) {
      const b = $("#ciF button"); b.disabled = true; err("");
      let r; try { r = await api("checkin", { name: me, code, session: ni + 1, late }); } catch (e) { r = { ok: false, err: "net" }; }
      b.disabled = false;
      if (!r.ok) return err(r.err === "code" ? "الرمز غير صحيح أو انتهت صلاحيته" : "تعذّر الاتصال بالسيرفر، أعد المحاولة");
      v = r.v;
    } else if (!otpOk(code)) return err("الرمز غير صحيح أو انتهت صلاحيته");
    s.att[ni] = v; s.checkins = s.checkins || {}; s.checkins[ni + 1] = now.toISOString(); persistMe(); renderTracker();
    toast(v === 2 ? "سُجّل حضورك (متأخر) +" + XP.late + " XP" : "سُجّل حضورك +" + XP.att + " XP");
  }

  /* ---------- ملف المتدرب: أوسمة + مستودعات GitHub ---------- */
  function profileHtml() {
    const s = stuOf(me); if (!s) return "";
    const bs = badgesOf(s), gh = s.github;
    return `<div class="card prof"><div class="profhead">${avHtml(me, "av lg")}<div><h3 style="margin:0">${esc(me)}</h3>${gh ? `<a class="mono" href="https://github.com/${esc(gh)}?tab=repositories" target="_blank" rel="noopener">@${esc(gh)}</a>` : '<small class="muted">لم يُربط حساب GitHub</small>'}</div><div class="xpbig"><b class="mono">${xpOf(s)}</b><small>XP</small></div></div>
      <div class="bdgs">${bs.length ? bs.map(badgeChip).join("") : '<span class="muted" style="font-size:14px">لا أوسمة بعد — احضر في الوقت وسلّم مهامك لتحصل عليها.</span>'}</div>
      ${gh ? '<div id="repos" class="repos"><small class="muted">جارٍ تحميل مستودعاتك…</small></div>' : ""}</div>`;
  }
  async function loadRepos() {
    const s = me && stuOf(me), box = $("#repos"); if (!s || !s.github || !box) return;
    try {
      const r = await fetch("https://api.github.com/users/" + encodeURIComponent(s.github) + "/repos?sort=pushed&per_page=4");
      if (!r.ok) throw 0; const j = await r.json();
      box.innerHTML = j.length ? j.map(x => `<a class="repo" href="${esc(x.html_url)}" target="_blank" rel="noopener"><b>${esc(x.name)}</b><small class="muted">${esc(x.language || "")}</small></a>`).join("") : '<small class="muted">لا مستودعات عامة بعد</small>';
    } catch (e) { box.innerHTML = ""; }
  }

  /* =====================================================================
     لوحة التحكم (للمدرّبة فقط): تعديل كل شيء في الموقع
     ===================================================================== */
  let adTab = "site", adAlerts = [];
  const AD_TABS = [["site", "الموقع والنصوص"], ["locks", "الأقفال"], ["alerts", "التنبيهات"], ["sessions", "الجلسات"], ["subs", "التسليمات والاختبارات"], ["people", "المتدربون"], ["setup", "الربط والتشغيل"]];
  const val = id => { const e = document.getElementById(id); return e ? e.value : ""; };
  const inp = (id, label, v, extra = "", hint = "") => `<div class="fld"><label for="${id}">${label}</label><input type="text" id="${id}" value="${esc(v ?? "")}" ${extra}>${hint ? `<small>${hint}</small>` : ""}</div>`;
  const area = (id, label, v, rows = 3, hint = "") => `<div class="fld"><label for="${id}">${label}</label><textarea id="${id}" rows="${rows}">${esc(v ?? "")}</textarea>${hint ? `<small>${hint}</small>` : ""}</div>`;
  const swt = (id, label, on, hint) => `<label style="display:flex;gap:12px;align-items:flex-start;margin:12px 0;cursor:pointer"><input type="checkbox" id="${id}" ${on ? "checked" : ""} style="margin-top:7px;width:18px;height:18px"><span><b>${label}</b>${hint ? `<br><small class="muted">${hint}</small>` : ""}</span></label>`;
  const cloneC = () => JSON.parse(JSON.stringify(CONTENT || {}));

  async function saveContent(next, btn) {
    const old = btn && btn.textContent; if (btn) { btn.disabled = true; btn.textContent = "جارٍ الحفظ…"; }
    try {
      if (API()) { const r = await api("saveContent", { content: next }); if (!r.ok) throw 0; } else store.set("content", next);
      applyContent(next); applySite(); toast(API() ? "تم الحفظ ✓ — يظهر الآن لكل الطلاب" : "تم الحفظ على هذا المتصفح فقط (اربطي السيرفر ليظهر للطلاب)");
    } catch (e) { toast("⚠️ تعذّر الحفظ — تحقّقي من الاتصال وأعيدي المحاولة"); }
    if (btn) { btn.disabled = false; btn.textContent = old; }
  }

  function pageAdmin() {
    if (!isTr) return pageHead("", "لوحة التحكم", "هذه الصفحة للمدرّبة فقط.") + `<div class="container"><div class="card" style="text-align:center"><p>سجّلي الدخول كمدرّبة للوصول إلى لوحة التحكم.</p><button class="btn btn-pri" id="adLogin">تسجيل الدخول</button></div></div>`;
    return pageHead("", "لوحة التحكم", "عدّلي أي شيء في الموقع من هنا — يُحفظ ويظهر للطلاب مباشرة بدون رفع ملفات.") + `<div class="container">
      ${API() ? "" : '<div class="trainer-bar">⚠️ التخزين السحابي غير مربوط (الحقل <code>api</code> فارغ في data.js): ما تعدّلينه يُحفظ على هذا المتصفح فقط ولن يراه الطلاب ولن تصلكِ بياناتهم. افتحي تبويب «الربط والتشغيل».</div>'}
      <div class="toolbar"><div class="seg" role="tablist" style="flex-wrap:wrap">${AD_TABS.map(t => `<button data-ad="${t[0]}" class="${adTab === t[0] ? "on" : ""}">${t[1]}</button>`).join("")}</div></div>
      <div id="adBody"></div></div>`;
  }
  function bindAdmin() {
    const l = $("#adLogin"); if (l) { l.onclick = () => showGate(); return; }
    if (!isTr) return;
    $$("[data-ad]").forEach(b => b.onclick = () => { adTab = b.dataset.ad; $$("[data-ad]").forEach(x => x.classList.toggle("on", x === b)); renderAd(); });
    renderAd();
  }
  function renderAd() { const b = $("#adBody"); ({ site: adSite, locks: adLocks, alerts: adAlertsUi, sessions: adSessions, people: adPeople, subs: adSubs, setup: adSetup })[adTab](b); }

  /* --- التسليمات والتصحيح + نتائج الاختبارات --- */
  function adSubs(b) {
    if (!API()) { b.innerHTML = '<div class="card"><p class="muted">اربطي الشيت (الحقل api) لتظهر التسليمات هنا.</p></div>'; return; }
    const T = TK().project || {}, rub = T.rubric || [], pending = SUBS.filter(x => x.status !== "مقبول");
    const qrows = STUDENTS.map(st => `<tr><td>${esc(st.name)}</td>${SES.map((_, i) => { const v = (st.quiz || {})[i + 1]; return `<td class="mono">${v ? v[0] + "/" + v[1] : "—"}</td>`; }).join("")}</tr>`).join("");
    const qs = SES.map((_, i) => { const n = i + 1, bank = QZ[n] || []; return { n, taken: STUDENTS.filter(st => (st.quiz || {})[n]).length, avg: (() => { const a = STUDENTS.map(st => (st.quiz || {})[n]).filter(Boolean); return a.length ? Math.round(a.reduce((t, v) => t + v[0] / v[1], 0) / a.length * 100) : null; })(), q: bank.length }; });
    const card = x => {
      const isP = x.kind === "project"; let ex = {}; try { ex = JSON.parse(x.extra || "{}"); } catch (e) {}
      const asg = (TK().assignments || []).find(a => a.id === x.key), title = isP ? "المشروع النهائي" : (asg ? asg.title : x.key);
      return `<div class="card" data-sub="${esc(x.id)}" style="margin-bottom:14px"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><b>${esc(x.name)}</b>${subStatusBadge(x)}</div>
        <div class="muted" style="margin:4px 0">${esc(title)} · ${esc(fmtDT(x.at))}</div>
        <div><a href="${esc(x.link)}" target="_blank" rel="noopener" dir="ltr">${esc(x.link)}</a>${ex.demo ? ` · <a href="${esc(ex.demo)}" target="_blank" rel="noopener" dir="ltr">Demo</a>` : ""}</div>
        ${isP ? `<p style="margin:6px 0">${esc(ex.team || "")} — ${esc(ex.title || "")}${ex.members ? " · " + esc(ex.members) : ""}${ex.desc ? "<br>" + esc(ex.desc) : ""}</p>` : x.note ? `<p style="margin:6px 0">${esc(x.note)}</p>` : ""}
        ${isP ? `<div class="rubric">${rub.map((r, i) => `<div class="row"><span>${esc(r[0])}</span><span class="mono">/ ${r[1]}</span><input type="number" min="0" max="${r[1]}" data-rb="${i}" value="${(ex.rubric || [])[i] ?? ""}" style="width:70px"></div>`).join("")}</div>` : `<div class="fld"><label>نقاط</label><input type="number" min="0" data-pts value="${x.points || 0}" style="width:90px"></div>`}
        <div class="fld"><label>تعليق للطالب</label><input type="text" data-cm maxlength="300" value="${esc(x.comment)}"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-pri btn-sm" data-rv="مقبول">مقبول</button><button class="btn btn-sm" data-rv="يحتاج تعديل">يحتاج تعديل</button></div></div>`;
    };
    b.innerHTML = `<div class="sec-head"><h2>بانتظار التصحيح (${pending.length})</h2></div>
      ${pending.length ? pending.map(card).join("") : '<div class="card"><p class="muted">لا توجد تسليمات بانتظار التصحيح.</p></div>'}
      <div class="sec-head" style="margin-top:30px"><h2>تم تصحيحها (${SUBS.length - pending.length})</h2></div>
      ${SUBS.filter(x => x.status === "مقبول").map(card).join("")}
      <div class="sec-head" style="margin-top:30px"><h2>نتائج الاختبارات (المحاولة الأولى)</h2></div>
      <div class="card"><div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">${qs.filter(x => x.taken).map(x => `<span class="badge">جلسة ${x.n}: ${x.taken} متدرب · متوسط ${x.avg}%</span>`).join("") || '<span class="muted">لا نتائج بعد.</span>'}</div>
      <div class="tbl-wrap"><table class="tr"><thead><tr><th>المتدرب</th>${SES.map((_, i) => `<th>${i + 1}</th>`).join("")}</tr></thead><tbody>${qrows}</tbody></table></div></div>`;
    $$("[data-sub]", b).forEach(c => $$("[data-rv]", c).forEach(btn => btn.onclick = async () => {
      const x = SUBS.find(y => y.id === c.dataset.sub), isP = x.kind === "project", extra = {}; let pts = +(($("[data-pts]", c) || {}).value || 0);
      if (isP) { extra.rubric = $$("[data-rb]", c).map(i => Math.max(0, +i.value || 0)); pts = extra.rubric.reduce((t, v) => t + v, 0); try { Object.assign(extra, JSON.parse(x.extra || "{}"), { rubric: extra.rubric }); } catch (e) {} }
      btn.disabled = true;
      let r; try { r = await api("review", { id: x.id, status: btn.dataset.rv, comment: $("[data-cm]", c).value, points: pts, extra: isP ? extra : null }); } catch (e) { r = { ok: false }; }
      if (!r.ok) { btn.disabled = false; return toast("⚠️ تعذّر الحفظ"); }
      toast("تم الحفظ ✓ — يصل للطالب"); await loadRemote(); renderAd();
    }));
  }

  /* --- الموقع والنصوص --- */
  function adSite(b) {
    b.innerHTML = `<div class="card"><h3>معلومات عامة</h3><div class="ad-grid">
        ${inp("f_name", "اسم المعسكر", S.name)}${inp("f_shortName", "الاسم في الشريط العلوي", S.shortName || S.name)}
        ${inp("f_trainer", "اسم المدرّبة (يظهر في الفوتر)", S.trainer)}${inp("f_footerNote", "نبذة الفوتر", S.footerNote || "")}
        <div class="fld"><label for="f_startDate">تاريخ أول جلسة</label><input type="date" id="f_startDate" value="${esc(S.startDate)}" style="width:100%"><small>الجلسات الأخرى تُحسب منه. ولأي جلسة تاريخ خاص من تبويب «الجلسات».</small></div>
        <div class="fld"><label for="f_endDate">نهاية المعسكر (آخر يوم في أسبوع المشروع)</label><input type="date" id="f_endDate" value="${esc(S.endDate || "")}" style="width:100%"></div>
        ${inp("f_days", "أيام الجلسات في الأسبوع", (S.sessionDays || []).join(","), 'dir="ltr"', "رقمان أو ثلاثة: 0 = نفس يوم بداية الأسبوع، 2 = بعده بيومين… مثال: 0,2 (الاثنين والأربعاء إن بدأ المعسكر يوم اثنين)")}
        ${inp("f_time", "وقت الجلسة (للعرض)", S.sessionTime, "", "مثال: 8:00 م — اتركيه فارغًا إن لم تحدّدي الساعة بعد")}${inp("f_hour", "الساعة بنظام 24 (للعدّاد التنازلي)", S.sessionHour, 'dir="ltr" inputmode="numeric"')}
        ${inp("f_late", "التأخير يُحتسب بعد (دقيقة)", S.lateAfterMin, 'dir="ltr" inputmode="numeric"')}
      </div></div>
      <div class="card" style="margin-top:16px"><h3>الصفحة الرئيسية</h3><div class="ad-grid">
        ${inp("f_heroPre", "العنوان — الجزء الأول", S.heroPre)}${inp("f_heroAccent", "العنوان — الجزء الملوّن", S.heroAccent)}${inp("f_heroPost", "العنوان — الجزء الأخير", S.heroPost)}
      </div>${area("f_heroLead", "الوصف تحت العنوان", S.heroLead, 2)}
      ${area("f_progress", "أين وصلنا؟ (نص حر)", S.progressNote, 2, "اتركيه فارغًا ليُحسب تلقائيًا من التواريخ، مثال: «أنهينا الأسبوع الثالث وندخل الآن في RAG».")}
      ${area("f_nextNote", "ملاحظة تحت «الجلسة القادمة»", S.nextNote, 2, "مثال: «الجلسة عن بُعد على Zoom — الرابط في مجموعة الواتساب». المكان الخاص بكل جلسة يُكتب من تبويب «الجلسات».")}</div>
      <div class="card" style="margin-top:16px"><h3>الأسابيع</h3>${WK.map(w => `<div class="ad-grid">${inp("w" + w.n + "_t", "الأسبوع " + w.n + " — العنوان", w.title, 'dir="ltr"')}${inp("w" + w.n + "_g", "الهدف", w.goal)}</div>`).join("")}</div>
      <div class="card" style="margin-top:16px"><h3>الاختبارات والمهام والمشروع</h3><p class="muted" style="margin:0">فتحها وقفلها من تبويب «الأقفال» (أو بزر القفل على كل عنصر في صفحته).</p></div>
      <div style="margin:18px 0"><button class="btn btn-pri" id="adSave">حفظ</button></div>`;
    $("#adSave").onclick = e => {
      const days = val("f_days").split(/[,،\s]+/).filter(Boolean).map(Number);
      if (days.length < 1 || days.length > 3 || days.some(n => !(n >= 0 && n <= 6))) return toast("أيام الجلسات: رقم إلى ثلاثة أرقام بين 0 و6، مثل 0,2");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(val("f_startDate"))) return toast("اختاري تاريخ أول جلسة");
      const n = cloneC(); n.site = Object.assign({}, n.site, { name: val("f_name"), shortName: val("f_shortName"), trainer: val("f_trainer"), footerNote: val("f_footerNote"), startDate: val("f_startDate"), endDate: val("f_endDate"), sessionDays: days, sessionTime: val("f_time"), sessionHour: +val("f_hour") || 20, lateAfterMin: +val("f_late") || 15, heroPre: val("f_heroPre"), heroAccent: val("f_heroAccent"), heroPost: val("f_heroPost"), heroLead: val("f_heroLead"), progressNote: val("f_progress"), nextNote: val("f_nextNote") });
      n.weeks = {}; WK.forEach(w => { n.weeks[w.n] = { title: val("w" + w.n + "_t"), goal: val("w" + w.n + "_g") }; });
      saveContent(n, e.target);
    };
  }


  /* --- الأقفال --- */
  function adLocks(b) {
    const row = (id, label) => `<label class="lockrow"><input type="checkbox" data-ck="${id}" ${UNL().includes(id) ? "checked" : ""}><span>${label}</span></label>`;
    b.innerHTML = `<div class="card"><h3>أقفال الاختبارات والمهام والمشروع</h3>
      <p class="muted">كل ما لم تفعّليه يراه الطلاب رماديًا مموّهًا عليه قفل، بدون أي تفاصيل. فعّلي المربع ثم احفظي ليُفتح لكل الطلاب.</p>
      <h4 style="margin-top:18px">الاختبارات</h4>${SES.map(s => row("q" + s.n, `اختبار الجلسة ${s.n} — ${esc(s.ar)}`)).join("")}
      <h4 style="margin-top:18px">المهام الأسبوعية</h4>${(TK().assignments || []).map(a => row(a.id, esc(a.title))).join("")}
      <h4 style="margin-top:18px">المشروع</h4>${row("p5", "المشروع النهائي")}
      <div class="row" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:20px"><button class="btn btn-pri" id="lkSave" type="button">حفظ</button><button class="btn" id="lkAll" type="button">تحديد الكل</button><button class="btn" id="lkNone" type="button">قفل الكل</button></div></div>`;
    const all = v => $$("[data-ck]").forEach(c => { c.checked = v; });
    $("#lkAll").onclick = () => all(true); $("#lkNone").onclick = () => all(false);
    $("#lkSave").onclick = e => { const n = cloneC(); n.site = Object.assign({}, n.site, { unlocked: $$("[data-ck]").filter(c => c.checked).map(c => c.dataset.ck) }); saveContent(n, e.target); };
  }

  /* --- التنبيهات --- */
  function readAlerts() { return $$(".arow").map(r => ({ type: $(".a-type", r).value, text: $(".a-text", r).value.trim(), date: $(".a-date", r).value.trim() })); }
  function adAlertsUi(b) {
    if (!$(".arow")) adAlerts = ALERTS.map(a => Object.assign({}, a)); else adAlerts = readAlerts();
    const row = (a, i) => `<div class="arow" data-i="${i}"><select class="a-type">${[["important", "مهم"], ["deadline", "موعد"], ["info", "معلومة"]].map(t => `<option value="${t[0]}" ${a.type === t[0] ? "selected" : ""}>${t[1]}</option>`).join("")}</select>
      <input type="text" class="a-text" value="${esc(a.text)}" placeholder="نص التنبيه"><input type="text" class="a-date" value="${esc(a.date || "")}" placeholder="مثال: هذا الأسبوع"><button class="btn btn-sm a-del" type="button">حذف</button></div>`;
    b.innerHTML = `<div class="card"><h3>التنبيهات في الصفحة الرئيسية</h3><p class="muted" style="font-size:14px">تظهر للطلاب بنفس الترتيب. إن لم يوجد أي تنبيه يختفي القسم عنهم.</p>
      <div id="alist">${adAlerts.map(row).join("") || '<p class="muted">لا توجد تنبيهات بعد.</p>'}</div>
      <div class="row" style="display:flex;gap:10px;margin-top:14px"><button class="btn" id="aAdd" type="button">+ إضافة تنبيه</button><button class="btn btn-pri" id="aSave" type="button">حفظ</button></div></div>`;
    $("#aAdd").onclick = () => { adAlerts = $(".arow") ? readAlerts() : []; adAlerts.push({ type: "info", text: "", date: "" }); $("#alist").innerHTML = adAlerts.map(row).join(""); bindDel(); $$(".a-text").pop().focus(); };
    const bindDel = () => $$(".a-del").forEach(d => d.onclick = () => { d.closest(".arow").remove(); });
    bindDel();
    $("#aSave").onclick = e => { const n = cloneC(); n.alerts = readAlerts().filter(a => a.text); saveContent(n, e.target); };
  }

  /* --- الجلسات --- */
  const linesOf = arr => (arr || []).map(r => r.t + " | " + (r.u || r.q || "")).join("\n");
  const parseLinks = (txt, needUrl) => txt.split("\n").map(l => l.trim()).filter(Boolean).map(l => { const [t, ...r] = l.split("|"), u = r.join("|").trim(), o = { t: t.trim() }; if (/^https?:\/\//i.test(u)) o.u = u; else if (!needUrl) o.q = u || o.t; return o; }).filter(o => o.t && (!needUrl || o.u));
  function adSessions(b) {
    b.innerHTML = `<p class="muted" style="margin:0 0 12px">اضغطي على الجلسة لتعديلها: العنوان، الوصف، المحاور، التاريخ، المكان/الرابط، رابط Colab والمراجع.</p>
      ${SES.map(s => `<details class="acc" ${s.n === (nextIdx() + 1) ? "open" : ""}><summary><b>الجلسة ${s.n}</b> — ${esc(s.ar)} <small class="muted">· ${fmtShort(sessionDate(s.n - 1))}</small></summary><div class="acc-in">
        <div class="ad-grid">${inp("s" + s.n + "_ar", "العنوان بالعربية", s.ar)}${inp("s" + s.n + "_en", "العنوان بالإنجليزية", s.en, 'dir="ltr"')}</div>
        ${area("s" + s.n + "_desc", "الوصف", s.desc, 2)}
        <div class="ad-grid"><div class="fld"><label for="s${s.n}_date">تاريخ الجلسة (اتركيه فارغًا ليُحسب تلقائيًا)</label><input type="date" id="s${s.n}_date" value="${esc(s.date || "")}" style="width:100%"></div>
        ${inp("s" + s.n + "_place", "المكان أو رابط الجلسة", s.place || "", "", "اسم المكان أو رابط Zoom/Meet — يظهر في الجلسة القادمة")}</div>
        ${inp("s" + s.n + "_colab", "رابط Colab Notebook", s.colab || "", 'dir="ltr" placeholder="https://colab.research.google.com/…"')}
        ${area("s" + s.n + "_topics", "المحاور (كل سطر محور)", (s.topics || []).join("\n"), 4)}
        ${area("s" + s.n + "_refs", "المراجع (كل سطر: العنوان | الرابط)", linesOf(s.refs), 3)}
        ${area("s" + s.n + "_vids", "الفيديوهات (كل سطر: العنوان | رابط أو كلمات بحث يوتيوب)", linesOf(s.videos), 2)}
      </div></details>`).join("")}
      <div style="margin:18px 0"><button class="btn btn-pri" id="sSave">حفظ كل الجلسات</button></div>`;
    $("#sSave").onclick = e => {
      const n = cloneC(); n.sessions = {};
      SES.forEach(s => { const k = "s" + s.n + "_"; n.sessions[s.n] = { ar: val(k + "ar"), en: val(k + "en"), desc: val(k + "desc"), date: val(k + "date"), place: val(k + "place").trim(), colab: val(k + "colab").trim(), topics: val(k + "topics").split("\n").map(x => x.trim()).filter(Boolean), refs: parseLinks(val(k + "refs"), true), videos: parseLinks(val(k + "vids"), false) }; });
      saveContent(n, e.target);
    };
  }

  /* --- المتدربون --- */
  function stuDlg(st) {
    openDlg(`<h3>${st ? "تعديل متدرب" : "إضافة متدرب"}</h3>${inp("d_name", "الاسم", st ? st.name : "")}${inp("d_mail", "البريد", st ? st.email : "", 'dir="ltr"')}${inp("d_gh", "حساب GitHub", st ? st.github : "", 'dir="ltr"')}${inp("d_pts", "نقاط إضافية", st ? st.points : 0, 'dir="ltr" inputmode="numeric"')}
      <div class="err" id="d_err" style="color:var(--bad);font-size:13px;min-height:1em"></div><div class="row"><button class="btn btn-pri" id="d_ok">حفظ</button><button class="btn" id="d_x">إلغاء</button></div>`);
    $("#d_x").onclick = closeDlg;
    $("#d_ok").onclick = async () => {
      const o = { name: val("d_name").trim().replace(/\s+/g, " "), email: val("d_mail").trim(), github: val("d_gh").trim().replace(/^@/, ""), points: Math.max(0, parseInt(val("d_pts")) || 0) };
      if (!o.name) return ($("#d_err").textContent = "اكتبي الاسم");
      if (API()) {
        let r; try { r = await api("saveStudent", Object.assign({ oldName: st ? st.name : "" }, o)); } catch (e) { r = { ok: false }; }
        if (!r.ok) return ($("#d_err").textContent = r.err === "exists" ? "يوجد متدرب بنفس الاسم" : "تعذّر الحفظ، حاولي مجددًا");
        await loadRemote();
      } else {
        const cur = st || { name: o.name, att: nulls(), hw: nulls(), tasks: {}, checkins: {} }; if (!st) STUDENTS.push(cur);
        Object.assign(cur, o); store.set("students", STUDENTS);
      }
      closeDlg(); renderAd(); toast("تم الحفظ ✓");
    };
  }
  function adPeople(b) {
    b.innerHTML = `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px"><h3 style="margin:0">المتدربون (${STUDENTS.length})</h3>
      <div style="display:flex;gap:8px"><button class="btn btn-sm" id="pRef">↻ تحديث</button><button class="btn btn-sm btn-pri" id="pAdd">+ إضافة متدرب</button></div></div>
      ${STUDENTS.length ? `<div class="tbl-wrap"><table class="tr"><thead><tr><th>الاسم</th><th>البريد</th><th>GitHub</th><th>الحضور</th><th>الواجبات</th><th>XP</th><th></th></tr></thead><tbody>
      ${STUDENTS.map((s, i) => `<tr><td style="text-align:start">${esc(s.name)}</td><td dir="ltr">${esc(s.email || "—")}</td><td dir="ltr">${esc(s.github || "—")}</td><td>${pctOf(s.att)}%</td><td>${pctOf(s.hw)}%</td><td>${xpOf(s)}</td><td><button class="btn btn-sm" data-e="${i}">تعديل</button> <button class="btn btn-sm" data-d="${i}">حذف</button></td></tr>`).join("")}</tbody></table></div>` : '<p class="muted">لا يوجد متدربون بعد. شاركي رابط التسجيل (تبويب «الربط والتشغيل») أو أضيفيهم يدويًا.</p>'}
      <p class="muted" style="font-size:13px;margin:12px 0 0">الحضور والواجبات تعدّلينها من صفحة «الحضور والواجبات». كل البيانات محفوظة أيضًا في Google Sheet الخاص بكِ.</p></div>`;
    $("#pAdd").onclick = () => stuDlg(null);
    $("#pRef").onclick = async () => { toast((await loadRemote()) ? "تم التحديث ✓" : "تعذّر التحديث"); renderAd(); };
    $$("[data-e]").forEach(x => x.onclick = () => stuDlg(STUDENTS[+x.dataset.e]));
    $$("[data-d]").forEach(x => x.onclick = () => {
      const st = STUDENTS[+x.dataset.d];
      openDlg(`<h3>حذف ${esc(st.name)}؟</h3><p class="muted">سيُحذف المتدرب مع كل حضوره وواجباته. لا يمكن التراجع.</p><div class="row"><button class="btn btn-pri" id="d_yes">نعم، احذفي</button><button class="btn" id="d_no">إلغاء</button></div>`);
      $("#d_no").onclick = closeDlg;
      $("#d_yes").onclick = async () => {
        if (API()) { try { const r = await api("deleteStudent", { name: st.name }); if (!r.ok) throw 0; await loadRemote(); } catch (e) { closeDlg(); return cloudFail(); } }
        else { STUDENTS = STUDENTS.filter(y => y !== st); store.set("students", STUDENTS); }
        closeDlg(); renderAd(); toast("تم الحذف");
      };
    });
  }

  /* --- الربط والتشغيل --- */
  function adSetup(b) {
    const base = new URL("index.html", location.href).href.replace(/index\.html.*$/, "");
    b.innerHTML = `<div class="card"><h3>حالة الربط</h3>
      <p>${API() ? "✅ الموقع مربوط بـ Google Sheet — كل تسجيل وحضور يصل إلى جدولكِ تلقائيًا." : "⚠️ غير مربوط بعد. الصقي رابط Apps Script في الحقل <code>api</code> داخل <code>js/data.js</code> (الخطوات في ملف «دليل-التشغيل.md»)."}</p>
      ${API() ? '<button class="btn btn-sm" id="pTest">اختبار الاتصال</button>' : ""}</div>
      <div class="card" style="margin-top:16px"><h3>الروابط التي ترسلينها للطلاب</h3>
      <div class="fld"><label>رابط الموقع</label><input type="text" readonly dir="ltr" value="${esc(base)}" onfocus="this.select()"></div>
      <div class="fld"><label>رابط التسجيل المباشر (يفتح نموذج الانضمام)</label><input type="text" readonly dir="ltr" value="${esc(base + "index.html?join=1")}" onfocus="this.select()"></div>
      <p class="muted" style="font-size:13.5px">كل طالب يسجّل مرة واحدة (الاسم الثلاثي + البريد)، وبعدها يدخل من «لدي حساب» بالاسم والبريد.</p></div>
      <div class="card" style="margin-top:16px"><h3>يوم الجلسة</h3><ol class="steps"><li><span>افتحي صفحة «الحضور والواجبات» ← تبويب «الحضور».</span></li><li><span>اعرضي الرمز المكوّن من 4 أرقام على الشاشة (يتغيّر كل 5 دقائق).</span></li><li><span>يكتب الطالب الرمز من صفحته فيُسجَّل «حاضر» أو «متأخر» مع الوقت.</span></li><li><span>بعد الجلسة اضغطي «غير المسجّلين ← غائب»، ثم علّمي الواجبات بالضغط على الخانات.</span></li></ol></div>`;
    const t = $("#pTest"); if (t) t.onclick = async () => { t.disabled = true; const ok = await loadRemote(); t.disabled = false; toast(ok ? "الاتصال سليم ✓ (" + STUDENTS.length + " متدرب)" : "⚠️ تعذّر الاتصال — راجعي رابط api"); };
  }

  /* =====================================================================
     التشغيل
     ===================================================================== */
  const PAGES = {
    home: { t: "الرئيسية", html: pageHome, bind: bindHome },
    agenda: { t: "الأجندة والمصادر", html: pageAgenda, bind: bindAgenda },
    tracker: { t: "الحضور والواجبات", html: pageTracker, bind: bindTracker },
    quiz: { t: "الاختبارات", html: pageQuiz, bind: bindQuiz },
    projects: { t: "المشروع النهائي", html: pageProjects, bind: bindProjects },
    admin: { t: "لوحة التحكم", html: pageAdmin, bind: bindAdmin }
  };
  const NAV = [["index.html", "home", "الرئيسية", "home"], ["agenda.html", "agenda", "الأجندة والمصادر", "cal"], ["tracker.html", "tracker", "الحضور والواجبات", "check"], ["quizzes.html", "quiz", "الاختبارات والمهام", "quiz"], ["projects.html", "projects", "المشروع النهائي", "rocket"]];
  function drawNav() {
    const items = isTr ? NAV.concat([["admin.html", "admin", "لوحة التحكم", "flag"]]) : NAV;
    $("#nav").innerHTML = items.map(n => `<a href="${n[0]}${keepQ ? "?" + keepQ.slice(1) : ""}" data-page="${n[1]}" ${n[1] === PAGE ? 'class="active" aria-current="page"' : ""}>${n[2]}</a>`).join("");
  }
  function applySite() {
    $$(".brand span:not(.brand-mark)").forEach(e => { e.textContent = S.shortName || S.name; });
    const fp = $(".footer-grid p"); if (fp && S.footerNote) fp.textContent = S.footerNote;
    $("#footerTrainer").textContent = S.trainer;
  }
  function render() {
    clearTimers();
    const p = PAGES[PAGE] || PAGES.home;
    $("#app").innerHTML = `<div class="page">${p.html()}</div>`;
    if (p.bind) p.bind();
    bindLocks();
    document.title = p.t + " · " + S.name;
  }

  $("#burger").onclick = () => { const o = $("#nav").classList.toggle("open"); $("#burger").setAttribute("aria-expanded", o); };
  $("#meChip").onclick = () => askMe();
  (async function boot() {
    drawNav();
    if (API()) {
      $("#app").innerHTML = '<div class="container" style="padding:90px 0;text-align:center"><p class="muted">جارٍ التحميل…</p></div>';
      if (!(await loadRemote())) { const c = store.get("remote", null); if (c && !(sess && sess.role === "trainer")) applyRemote(c); }
    } else applyContent(store.get("content", {}));
    applySite();
    if (sess) applySess(); else { updateChip(); showGate(); }
  })();
})();


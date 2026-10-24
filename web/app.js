/* Điểm danh – Từ BV TLS – by Dr Huy - BV TLS
 * Kiểm soát sinh viên có mặt tại khu vực lâm sàng từ 07:00 đến 11:00.
 * Chạy chung cho app Android (Capacitor) và web PWA trên iPhone. */
(() => {
  'use strict';

  const CFG = window.APP_CONFIG || {};
  const $ = id => document.getElementById(id);
  const Cap = window.Capacitor;
  const NATIVE = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  const UA = navigator.userAgent;
  const IS_IOS = /iPhone|iPad|iPod/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const IS_ANDROID = /Android/i.test(UA);
  const STANDALONE = navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  const PLATFORM = NATIVE ? 'android' : (IS_IOS ? 'ios-web' : 'web');
  const plug = n => (NATIVE ? Cap.registerPlugin(n) : null);
  const BG = plug('BackgroundGeolocation');
  const AntiFake = plug('AntiFake');
  const Notif = plug('LocalNotifications');
  const Http = plug('CapacitorHttp');
  const Device = plug('Device');
  const TZ = 'Asia/Ho_Chi_Minh';
  const VERSION = '1.4.0';

  const S = {
    session: load('dd_session'),
    cfg: {
      hospital: 'Bệnh viện Sản Nhi Kiên Giang', lat: 9.9731417, lng: 105.0975708, checkinRadius: 20, leaveRadius: 60,
      gpsTolerance: 10, gpsMaxAcc: 50, openTime: '05:30', deadline: '07:00', endTime: '11:00', schoolDays: '2,3,4,5,6',
      pingMinutes: 2, slots: [], slotWindow: 15,
      purpose: 'Kiểm soát sinh viên có mặt tại khu vực lâm sàng từ 07:00 đến 11:00'
    },
    offset: 0, deviceId: null, student: null, today: null, slots: [],
    loc: null, samples: [], tracking: false, lastSent: 0, sending: false, outStreak: 0, lastState: 'TRONG',
    simReported: false, antiFake: null, antiFakeAt: 0, models: null, cam: null, endTimer: null, busy: false
  };

  /* ============================ tiện ích ============================ */
  function load(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function now() { return new Date(Date.now() + S.offset); }
  function vn(d) {
    const o = {};
    new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
      minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(d || now()).forEach(x => { o[x.type] = x.value; });
    const h = o.hour === '24' ? '00' : o.hour;
    return { h: +h, mi: +o.minute, s: +o.second, min: +h * 60 + +o.minute, hms: h + ':' + o.minute + ':' + o.second,
      hm: h + ':' + o.minute, dmy: o.day + '/' + o.month + '/' + o.year, ymd: o.year + '-' + o.month + '-' + o.day };
  }
  const hhmm = s => { const p = String(s).split(':'); return +p[0] * 60 + +(p[1] || 0); };
  const m2s = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  function haversine(a, b, c, d) {
    const R = 6371000, r = Math.PI / 180, dLat = (c - a) * r, dLon = (d - b) * r;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
  const distOf = l => haversine(l.lat, l.lng, S.cfg.lat, S.cfg.lng);
  const effDist = l => Math.max(0, distOf(l) - Math.min(l.acc, S.cfg.gpsTolerance));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function show(id) {
    document.querySelectorAll('.screen').forEach(s => { s.hidden = s.id !== id; }); window.scrollTo(0, 0);
    if (id === 'scr-login' && !document.querySelector('input[name="classCode"]')) loadClasses();
  }
  function toast(msg, ms) {
    const t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, ms || 3500);
  }
  function setMsg(id, msg, ok) { const e = $(id); e.textContent = msg || ''; e.classList.toggle('ok', !!ok); }
  function fill(cls, v) { document.querySelectorAll('.' + cls).forEach(e => { e.textContent = v; }); }
  function isSchoolDay() {
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(now());
    const thu = { Mon: 2, Tue: 3, Wed: 4, Thu: 5, Fri: 6, Sat: 7, Sun: 8 }[wd];
    return String(S.cfg.schoolDays).split(',').map(x => +x.trim()).includes(thu);
  }

  /* ============================ máy chủ ============================ */
  async function api(action, data) {
    if (!CFG.API_URL || /^DAN_/.test(CFG.API_URL)) throw new Error('Chưa cấu hình địa chỉ máy chủ trong config.js.');
    const body = JSON.stringify(Object.assign({ action, platform: PLATFORM, deviceId: S.deviceId, appVersion: VERSION }, data || {}));
    let d;
    if (NATIVE) {
      // Gọi HTTP bằng lớp native để không bị Android chặn khi app chạy nền
      const r = await Http.post({ url: CFG.API_URL, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, data: body,
        connectTimeout: 20000, readTimeout: 60000 });
      d = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
    } else {
      const r = await fetch(CFG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body, redirect: 'follow' });
      d = await r.json();
    }
    if (d && d.serverTime) S.offset = d.serverTime - Date.now();
    if (d && d.config) applyConfig(d.config);
    return d;
  }

  function applyConfig(c) {
    Object.assign(S.cfg, c);
    fill('js-hospital', siteList().map(x => x.name).join(' hoặc '));
    fill('js-deadline', S.cfg.deadline); fill('js-end', S.cfg.endTime); fill('js-win', S.cfg.slotWindow);
    fill('js-slots', (S.cfg.slots || []).join(', ') || 'không có');
    $('ruleSlots').hidden = !(S.cfg.slots || []).length;
    fill('js-purpose', S.cfg.purpose + '.');
    setSite(activeSiteCode());
  }

  /* ---------- cơ sở thực tập (nhiều bệnh viện) ---------- */
  S.siteCode = load('dd_site') || '';
  S.sitePicked = !!S.siteCode;
  function siteList() {
    return (S.cfg.sites && S.cfg.sites.length) ? S.cfg.sites
      : [{ code: 'KG', name: S.cfg.hospital, address: S.cfg.address, lat: S.cfg.lat, lng: S.cfg.lng, r1: S.cfg.checkinRadius, r2: S.cfg.leaveRadius }];
  }
  /** Đã điểm danh thì khóa theo cơ sở đã điểm danh, chưa thì theo lựa chọn hoặc cơ sở gần nhất. */
  function activeSiteCode() {
    const ci = S.today && S.today.checkin;
    return (ci && ci.site) || S.siteCode;
  }
  function setSite(code, manual) {
    const list = siteList();
    const site = list.find(x => x.code === code) || list[0];
    S.siteCode = site.code;
    if (manual) { S.sitePicked = true; save('dd_site', site.code); }
    S.cfg.hospital = site.name; S.cfg.address = site.address; S.cfg.lat = site.lat; S.cfg.lng = site.lng;
    S.cfg.checkinRadius = site.r1; S.cfg.leaveRadius = site.r2;
    $('hospitalName').textContent = site.name;
    fill('js-r1', site.r1); fill('js-r2', site.r2);
    $('lblIn').textContent = site.r1 + ' m'; $('lblOut').textContent = site.r2 + ' m';
    $('radar').querySelector('.ring-in').setAttribute('r', (74 * site.r1 / site.r2).toFixed(1));
    $('lblIn').setAttribute('y', (80 - 74 * site.r1 / site.r2 - 4).toFixed(0));
    renderSites();
    if (S.loc) drawRadar(S.loc);
  }
  function renderSites() {
    const card = $('cardSite'); if (!card) return;
    const list = siteList(), ci = S.today && S.today.checkin;
    card.hidden = !!ci || list.length < 2;
    if (card.hidden) return;
    $('siteList').innerHTML = list.map(x => {
      const d = S.loc ? Math.round(haversine(S.loc.lat, S.loc.lng, x.lat, x.lng)) : null;
      const dTxt = d === null ? '' : d >= 1000 ? (d / 1000).toFixed(1) + ' km' : d + ' m';
      return '<label class="class-opt"><input type="radio" name="site" value="' + esc(x.code) + '"' + (x.code === S.siteCode ? ' checked' : '') + '>' +
        '<span>' + esc(x.name) + '<small>' + esc(x.address || '') + (dTxt ? ' · cách bạn ' + dTxt : '') + '</small></span></label>';
    }).join('');
    $('siteList').querySelectorAll('input[name="site"]').forEach(r => r.onchange = () => setSite(r.value, true));
    $('siteHint').textContent = S.sitePicked ? 'Bạn đã tự chọn cơ sở.' : 'App tự chọn cơ sở gần bạn nhất. Có thể đổi nếu chọn sai.';
  }
  function autoPickSite(l) {
    if (S.sitePicked || (S.today && S.today.checkin)) return;
    const list = siteList(); if (list.length < 2) return;
    const near = list.reduce((a, b) => (haversine(l.lat, l.lng, b.lat, b.lng) < haversine(l.lat, l.lng, a.lat, a.lng) ? b : a));
    if (near.code !== S.siteCode) setSite(near.code);
    else if (!renderSites._t || Date.now() - renderSites._t > 15000) { renderSites._t = Date.now(); renderSites(); }
  }

  async function getDeviceId() {
    if (NATIVE) { try { const r = await Device.getId(); if (r && r.identifier) return 'A-' + r.identifier; } catch (e) {} }
    let id = load('dd_device');
    if (!id) {
      id = (IS_IOS ? 'I-' : 'W-') + (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
      save('dd_device', id);
    }
    return id;
  }

  /* ============================ khởi động ============================ */
  async function boot() {
    $('ver').textContent = 'Phiên bản ' + VERSION + (NATIVE ? ' · Android' : IS_IOS ? ' · iPhone (web)' : '');
    if (!NATIVE && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
    if (load('dd_lec')) { Lec.start(); return; }
    if (!gate()) return;
    S.deviceId = await getDeviceId();
    setInterval(tick, 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && S.student) refresh(true); });
    if (!S.session) { show('scr-login'); return; }
    await refresh();
  }

  function gate() {
    if (NATIVE) return true;
    const body = $('gateBody');
    const lecBtn = () => { const b = document.createElement('button'); b.className = 'btn ghost'; b.style.marginTop = '14px';
      b.textContent = 'Đăng nhập dành cho giảng viên'; b.onclick = () => show('scr-leclogin'); body.appendChild(b); };
    if (IS_ANDROID) {
      $('gateTitle').textContent = 'Android phải dùng app Điểm danh';
      body.innerHTML = '<p>Sinh viên dùng điện thoại Android cài ứng dụng <b>Điểm danh</b> (file APK do BV TLS cung cấp). ' +
        'App có theo dõi định vị khi chạy nền và chặn phần mềm giả lập vị trí.</p>' +
        '<a class="btn" id="apkLink">Tải app Điểm danh cho Android</a>';
      $('apkLink').href = CFG.APK_URL || '#';
      lecBtn(); show('scr-gate'); return false;
    }
    if (!IS_IOS) {
      $('gateTitle').textContent = 'Mở bằng điện thoại';
      body.innerHTML = '<p>Ứng dụng chỉ dùng trên điện thoại của sinh viên: Android cài app Điểm danh, iPhone dùng bản web thêm vào màn hình chính.</p>';
      lecBtn(); show('scr-gate'); return false;
    }
    if (!STANDALONE) {
      $('gateTitle').textContent = 'Thêm Điểm danh vào màn hình chính';
      body.innerHTML = '<ol class="steps"><li>Mở trang này bằng <b>Safari</b>.</li>' +
        '<li>Bấm nút <b>Chia sẻ</b> (ô vuông có mũi tên lên).</li>' +
        '<li>Chọn <b>Thêm vào MH chính</b> rồi bấm <b>Thêm</b>.</li>' +
        '<li>Mở biểu tượng <b>Điểm danh</b> (BV TLS nền đỏ) vừa xuất hiện trên màn hình chính.</li></ol>' +
        '<p class="muted">Chỉ bản mở từ màn hình chính mới điểm danh được.</p>';
      lecBtn(); show('scr-gate'); return false;
    }
    return true;
  }

  async function refresh(quiet) {
    if (!S.session) return;
    if (!quiet) { $('loadingText').textContent = 'Đang kết nối máy chủ…'; show('scr-loading'); }
    let r;
    try { r = await api('status', { mssv: S.session.mssv, regCode: S.session.classCode, regName: S.session.fullName }); }
    catch (e) { if (!quiet) fail('Không kết nối được', e.message || String(e)); return; }
    if (!r.ok) {
      if (r.code === 'NO_STUDENT' || r.code === 'BAD_CLASS') { S.session = null; save('dd_session', null); show('scr-login'); setMsg('loginMsg', r.msg); return; }
      if (!quiet) fail('Lỗi', r.msg); return;
    }
    S.student = r.student; S.today = r.today; S.slots = r.today.slots || [];
    if (r.inbox) handleInbox(r.inbox);
    route();
  }

  function fail(title, text) { $('errorTitle').textContent = title; $('errorText').textContent = text; show('scr-error'); }

  function route() {
    const st = S.student;
    $('btnLogout').hidden = false;
    if (!st.deviceMatch) {
      fail('Điện thoại chưa được cấp phép', 'MSSV ' + st.mssv + ' đã gắn với một điện thoại khác. Mỗi sinh viên chỉ dùng 1 điện thoại. Liên hệ quản trị BV TLS nếu bạn đổi máy.');
      return;
    }
    if (!S.session.consent) { fill('js-who', st.name + ' · ' + st.mssv); show('scr-consent'); return; }
    if (!st.enrolled) { fill('js-who', st.name + ' · MSSV ' + st.mssv); show('scr-enroll'); return; }
    renderHome();
  }

  /* ============================ đăng nhập, đồng ý, đăng ký ============================ */
  $('formLogin').addEventListener('submit', async ev => {
    ev.preventDefault();
    const fullName = $('inName').value.trim().replace(/\s+/g, ' ');
    const mssv = $('inMssv').value.trim().toUpperCase();
    const picked = document.querySelector('input[name="classCode"]:checked');
    const classCode = picked ? picked.value : '';
    if (!fullName || !mssv) { setMsg('loginMsg', 'Nhập đủ họ và tên, MSSV.'); return; }
    if (!classCode) { setMsg('loginMsg', 'Tích chọn mã lớp của bạn.'); return; }
    setMsg('loginMsg', 'Đang kiểm tra…', true);
    try {
      const r = await api('status', { mssv, classCode, fullName });
      if (!r.ok) { setMsg('loginMsg', r.msg); return; }
      S.session = { mssv, classCode, fullName, consent: false }; save('dd_session', S.session);
      S.student = r.student; S.today = r.today; S.slots = r.today.slots || [];
    if (r.inbox) handleInbox(r.inbox);
      setMsg('loginMsg', ''); route();
    } catch (e) { setMsg('loginMsg', e.message || 'Không kết nối được máy chủ.'); }
  });

  /** Tải danh sách mã lớp (giảng viên nhập ở ô MA_LOP) để sinh viên tích chọn. */
  async function loadClasses() {
    const box = $('classList');
    box.innerHTML = '<p class="muted">Đang tải danh sách mã lớp…</p>';
    try {
      const r = await api('classes');
      const list = (r && r.classes) || [];
      if (!list.length) { box.innerHTML = '<p class="form-msg">Giảng viên chưa nhập mã lớp. Liên hệ giảng viên.</p>'; return; }
      box.innerHTML = list.map((c, i) => '<label class="class-opt"><input type="radio" name="classCode" value="' + esc(c.code) + '"' + (list.length === 1 ? ' checked' : '') + '>' +
        '<span>' + esc(c.code) + (c.group && c.group.toUpperCase() !== c.code ? '<small>Nhóm ' + esc(c.group) + '</small>' : '') + '</span></label>').join('');
    } catch (e) {
      box.innerHTML = '<p class="form-msg">Không tải được mã lớp. Kiểm tra mạng.</p><button type="button" class="btn ghost small" id="btnReloadClasses">Thử lại</button>';
      $('btnReloadClasses').onclick = loadClasses;
    }
  }

  $('cbConsent').addEventListener('change', e => { $('btnConsent').disabled = !e.target.checked; });
  $('btnConsent').addEventListener('click', () => { S.session.consent = true; save('dd_session', S.session); route(); });
  $('btnRetry').addEventListener('click', () => (S.session ? refresh() : show('scr-login')));

  $('btnEnroll').addEventListener('click', async () => {
    if (S.busy) return;
    S.busy = true; setMsg('enrollMsg', '');
    try {
      const f = await scanFace({ title: 'Đăng ký khuôn mặt', samples: 4, blink: false });
      if (!f) return;
      const photo = stamp(f.canvas, ['ĐĂNG KÝ KHUÔN MẶT', S.student.name + ' · ' + S.student.mssv, vn().dmy + ' ' + vn().hms + ' (GMT+7)']);
      setMsg('enrollMsg', 'Đang gửi…', true);
      const r = await api('enroll', { mssv: S.session.mssv, classCode: S.session.classCode, fullName: S.session.fullName, descriptors: f.descriptors, liveness: false, photo });
      if (!r.ok) { setMsg('enrollMsg', r.msg); return; }
      toast(r.msg + (S.student.isNew ? ' Bạn đã được thêm vào danh sách lớp.' : ''), 5000); S.student.enrolled = true; await refresh();
    } catch (e) { setMsg('enrollMsg', e.message || String(e)); }
    finally { S.busy = false; }
  });

  /* ============================ trang chính ============================ */
  function renderHome() {
    const st = S.student, t = S.today;
    fill('js-name', st.name);
    fill('js-meta', 'MSSV ' + st.mssv + (st.group ? ' · ' + st.group : ''));
    show('scr-home');
    const ci = t && t.checkin;
    setSite(activeSiteCode());
    $('cardCheckin').hidden = !!ci;
    $('cardDone').hidden = !ci;
    if (ci) {
      $('doneTime').textContent = ci.time.slice(0, 5) + ' · ' + vn().dmy;
      $('donePill').textContent = ci.status === 'Đúng giờ' ? 'Đúng giờ' : 'Trễ ' + ci.late + ' phút';
      $('donePill').className = 'pill ' + (ci.status === 'Đúng giờ' ? 'ok' : 'warn');
      const ph = load('dd_photo_' + t.date);
      $('donePhoto').hidden = !ph; if (ph) $('donePhoto').src = ph;
    }
    renderSlots();
    tick();
    startLocationForState();
  }

  function shiftOver() { return vn().min >= hhmm(S.cfg.endTime); }

  async function startLocationForState() {
    const ci = S.today && S.today.checkin;
    if (shiftOver() || !isSchoolDay()) { await stopTracking(shiftOver() ? 'Đã hết ca ' + S.cfg.endTime + ', ứng dụng không theo dõi vị trí.' : 'Hôm nay không có lịch.'); return; }
    if (ci) await startTracking(); else await Loc.start(false);
  }

  function tick() {
    const t = vn();
    $('clock').textContent = t.hms; $('dateText').textContent = t.dmy;
    if (!S.student || $('scr-home').hidden) return;
    const dl = $('deadline');
    const m = t.min + t.s / 60, open = hhmm(S.cfg.openTime), dead = hhmm(S.cfg.deadline), end = hhmm(S.cfg.endTime);
    const ci = S.today && S.today.checkin;
    let txt = '', cls = '';
    if (!isSchoolDay()) txt = 'Hôm nay không có lịch điểm danh.';
    else if (m >= end) { txt = 'Đã hết ca ' + S.cfg.endTime + '. Ứng dụng không còn theo dõi vị trí.'; }
    else if (ci) { const left = Math.ceil(end - m); txt = 'Đang trong ca. Kết thúc lúc ' + S.cfg.endTime + ', còn ' + Math.floor(left / 60) + ' giờ ' + (left % 60) + ' phút. Ở trong bán kính ' + S.cfg.leaveRadius + ' m.'; }
    else if (m < open) txt = 'Mở điểm danh lúc ' + S.cfg.openTime + '.';
    else if (m < dead) txt = 'Đang mở điểm danh.';
    else { txt = 'Sau ' + S.cfg.deadline + ': bắt buộc ghi chú giải thích lý do trước khi điểm danh.'; cls = 'warn'; }
    dl.textContent = txt; dl.className = 'deadline ' + cls;
    $('btnCheckin').disabled = !isSchoolDay() || m < open || m >= end || S.busy;
    const needNote = !ci && m >= dead;
    $('noteLabel').textContent = needNote ? 'Ghi chú giải thích lý do (bắt buộc sau ' + S.cfg.deadline + ')' : 'Ghi chú (không bắt buộc)';
    $('btnLogout').hidden = !S.session;
    if (ci && S.tracking && m >= end) stopTracking('Đã hết ca ' + S.cfg.endTime + ', ứng dụng ngừng theo dõi vị trí.');
    renderSlots(true);
  }

  /* ---------- mốc xác nhận giữa ca ---------- */
  function slotNow() {
    const m = vn().min, w = S.cfg.slotWindow;
    return (S.slots || []).map(s => {
      let st = s.status;
      if (st !== 'done' && st !== 'na') {
        const a = hhmm(s.time);
        st = m < a ? 'upcoming' : m < a + w ? 'open' : 'missed';
      }
      return Object.assign({}, s, { status: st });
    });
  }
  function renderSlots(light) {
    const card = $('cardSlots');
    const ci = S.today && S.today.checkin;
    const list = slotNow();
    card.hidden = !ci || !list.length;
    if (card.hidden) return;
    const key = list.map(s => s.time + s.status).join('|');
    const openS = list.find(s => s.status === 'open');
    $('btnConfirm').hidden = !openS;
    if (openS) $('btnConfirm').textContent = 'Xác nhận có mặt mốc ' + openS.time + ' (đến ' + openS.end + ')';
    if (light && key === renderSlots._k) return;
    renderSlots._k = key;
    const label = { done: 'Đã xác nhận', open: 'Đang mở', upcoming: 'Sắp tới', missed: 'Bỏ lỡ', na: 'Không áp dụng' };
    $('slotList').innerHTML = list.map(s => '<div class="slot ' + s.status + '"><b>' + s.time + '</b><small>' + label[s.status] + '</small></div>').join('');
    const done = list.filter(s => s.status === 'done').length, need = list.filter(s => s.status !== 'na').length;
    $('slotPill').textContent = done + '/' + need;
    $('slotPill').className = 'pill ' + (list.some(s => s.status === 'missed') ? 'bad' : done === need ? 'ok' : '');
    const next = list.find(s => s.status === 'upcoming');
    $('slotHint').textContent = (next ? 'Mốc tiếp theo ' + next.time + ', mở trong ' + S.cfg.slotWindow + ' phút. ' : '') +
      (PLATFORM === 'ios-web' ? 'iPhone không tự nhắc, hãy đặt báo thức cho các mốc này.' : 'App sẽ gửi thông báo nhắc khi đến mốc.');
  }

  /* ============================ định vị ============================ */
  const Loc = {
    id: null, bg: false,
    async start(bg) {
      if (this.id !== null && this.bg === bg) return;
      await this.stop();
      this.bg = bg;
      if (NATIVE) {
        const opts = { requestPermissions: true, stale: false, distanceFilter: 0 };
        if (bg) {
          opts.backgroundTitle = 'Điểm danh – BV TLS';
          opts.backgroundMessage = 'Đang ghi nhận có mặt tại ' + S.cfg.hospital + ' đến ' + S.cfg.endTime + '.';
        }
        this.id = await BG.addWatcher(opts, (l, err) => {
          if (err) { onLocErr(err); return; }
          if (l) onLoc({ lat: l.latitude, lng: l.longitude, acc: l.accuracy, simulated: !!l.simulated, t: Date.now() });
        });
      } else {
        if (!navigator.geolocation) { onLocErr({ message: 'Thiết bị không hỗ trợ định vị.' }); return; }
        this.id = navigator.geolocation.watchPosition(
          p => onLoc({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, simulated: false, t: Date.now() }),
          e => onLocErr(e), { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
      }
    },
    async stop() {
      if (this.id === null) return;
      const id = this.id; this.id = null;
      try { if (NATIVE) await BG.removeWatcher({ id }); else navigator.geolocation.clearWatch(id); } catch (e) {}
    }
  };

  function onLocErr(e) {
    const code = e && (e.code === 'NOT_AUTHORIZED' || e.code === 1) ? 'denied' : 'other';
    $('locPill').textContent = code === 'denied' ? 'Chưa cấp quyền' : 'Lỗi định vị';
    $('locPill').className = 'pill bad';
    $('accText').textContent = code === 'denied'
      ? (NATIVE ? 'Cấp quyền Vị trí (chính xác) cho app Điểm danh.' : 'Vào Cài đặt > Quyền riêng tư > Dịch vụ định vị > Safari/Điểm danh, chọn “Khi dùng ứng dụng” và bật “Vị trí chính xác”.')
      : (e && e.message) || 'Không lấy được vị trí. Bật GPS và thử lại.';
    $('btnAppSettings').hidden = !NATIVE;
    if (NATIVE) $('cardTrack').hidden = false;
  }

  function onLoc(l) {
    S.loc = l;
    S.samples.push(l); if (S.samples.length > 30) S.samples.shift();
    autoPickSite(l);
    drawRadar(l);
    if (l.simulated) showFake('Phát hiện vị trí giả lập trên điện thoại. Tắt ứng dụng fake GPS, nếu không bạn sẽ bị ghi vi phạm.');
    if (S.tracking) maybeSend(l);
  }

  function drawRadar(l) {
    const d = distOf(l), eff = effDist(l), R = S.cfg.leaveRadius;
    $('distText').textContent = Math.round(d) + ' m';
    $('accText').textContent = 'Cách tâm bệnh viện · sai số GPS ±' + Math.round(l.acc) + ' m';
    const pill = $('locPill');
    if (l.acc > S.cfg.gpsMaxAcc) { pill.textContent = 'GPS yếu'; pill.className = 'pill warn'; }
    else if (eff <= S.cfg.checkinRadius) { pill.textContent = 'Trong vùng điểm danh'; pill.className = 'pill ok'; }
    else if (eff <= R) { pill.textContent = 'Trong khu vực ' + R + ' m'; pill.className = 'pill ' + (S.today && S.today.checkin ? 'ok' : 'warn'); }
    else { pill.textContent = 'Ngoài khu vực'; pill.className = 'pill bad'; }
    // vị trí tương đối trên radar (bắc lên trên)
    const k = 74 / R;
    const dy = (l.lat - S.cfg.lat) * 111320, dx = (l.lng - S.cfg.lng) * 111320 * Math.cos(S.cfg.lat * Math.PI / 180);
    let x = dx * k, y = -dy * k; const r = Math.hypot(x, y);
    if (r > 76) { x = x / r * 76; y = y / r * 76; }
    $('radarDot').setAttribute('cx', (80 + x).toFixed(1)); $('radarDot').setAttribute('cy', (80 + y).toFixed(1));
    $('radarAcc').setAttribute('cx', (80 + x).toFixed(1)); $('radarAcc').setAttribute('cy', (80 + y).toFixed(1));
    $('radarAcc').setAttribute('r', Math.min(76, l.acc * k).toFixed(1));
  }

  /** Lấy vị trí mới, đủ chính xác. Trả kèm cờ chống giả lập. */
  async function freshFix(maxWait) {
    const t0 = Date.now();
    await Loc.start(S.tracking && NATIVE);
    let best = null;
    while (Date.now() - t0 < (maxWait || 12000)) {
      const fresh = S.samples.filter(s => s.t >= t0 - 2000);
      if (fresh.length) best = fresh.reduce((a, b) => (b.acc < a.acc ? b : a));
      if (best && fresh.length >= 3 && best.acc <= 15) break;
      await sleep(400);
    }
    if (!best) throw new Error('Không lấy được vị trí. Bật GPS, cấp quyền vị trí chính xác và ra chỗ thoáng.');
    const recent = S.samples.filter(s => s.t >= t0 - 2000);
    const identical = recent.length >= 6 && recent.every(s => s.lat === recent[0].lat && s.lng === recent[0].lng && s.acc === recent[0].acc);
    return Object.assign({}, best, { simulated: recent.some(s => s.simulated), identicalSamples: identical });
  }

  /* ---------- chống phần mềm giả lập vị trí (Android) ---------- */
  async function antiFake(force) {
    if (!NATIVE) return undefined;
    if (!force && S.antiFake && Date.now() - S.antiFakeAt < 5 * 60000) return S.antiFake;
    try {
      const r = await AntiFake.check();
      S.antiFake = { activeMock: r.activeMock || [], installedMock: r.installedMock || [], rooted: !!r.rooted, devOptions: !!r.devOptions };
      S.antiFakeAt = Date.now();
      if (S.antiFake.activeMock.length) showFake('Đang bật ứng dụng vị trí mô phỏng: ' + S.antiFake.activeMock.join(', ') + '. Tắt trong Tùy chọn nhà phát triển và gỡ ứng dụng này.');
      else if (S.antiFake.installedMock.length) showFake('Máy có cài ứng dụng giả lập vị trí: ' + S.antiFake.installedMock.join(', ') + '. Gỡ cài đặt để điểm danh.');
      else $('fakeAlert').hidden = true;
    } catch (e) { S.antiFake = null; }
    return S.antiFake;
  }
  function showFake(msg) { const a = $('fakeAlert'); a.textContent = msg; a.hidden = false; }

  /* ---------- theo dõi trong ca ---------- */
  async function startTracking() {
    if (shiftOver()) return;
    if (NATIVE) {
      try { await Notif.requestPermissions(); } catch (e) {}
      scheduleSlotReminders();
    }
    S.tracking = true;
    await Loc.start(true);
    $('cardTrack').hidden = false;
    $('trackPill').textContent = 'Đang theo dõi'; $('trackPill').className = 'pill ok';
    $('trackText').textContent = NATIVE
      ? 'App ghi nhận vị trí kể cả khi tắt màn hình, đến ' + S.cfg.endTime + '. Không tắt GPS, không vuốt tắt app. Nếu điện thoại hay tự tắt app, vào cài đặt pin và chọn “Không hạn chế” cho Điểm danh.'
      : 'iPhone chỉ gửi vị trí khi đang mở app Điểm danh (Apple không cho web chạy nền). ' +
        ((S.cfg.slots || []).length ? 'Mở app tại mỗi mốc xác nhận giữa ca. ' : 'Thỉnh thoảng mở app để gửi vị trí. ') + 'Ra khỏi ' + S.cfg.leaveRadius + ' m khi mở app sẽ bị ghi nhận.';
    $('btnAppSettings').hidden = !NATIVE;
    clearTimeout(S.endTimer);
    const msLeft = (hhmm(S.cfg.endTime) - vn().min) * 60000 - vn().s * 1000;
    S.endTimer = setTimeout(() => stopTracking('Đã hết ca ' + S.cfg.endTime + ', ứng dụng ngừng theo dõi vị trí.'), Math.max(1000, msLeft));
    S.lastSent = 0;
    if (S.loc) maybeSend(S.loc);
  }

  async function stopTracking(text) {
    S.tracking = false;
    clearTimeout(S.endTimer);
    await Loc.stop();
    if (NATIVE) { try { const p = await Notif.getPending(); if (p.notifications.length) await Notif.cancel({ notifications: p.notifications.map(n => ({ id: n.id })) }); } catch (e) {} }
    $('cardTrack').hidden = !(S.today && S.today.checkin);
    $('trackPill').textContent = 'Đã dừng'; $('trackPill').className = 'pill';
    $('trackText').textContent = text || '';
    $('locPill').textContent = 'Đã ngừng định vị'; $('locPill').className = 'pill';
    $('accText').textContent = text || '';
    $('leaveAlert').hidden = true;
  }

  async function maybeSend(l) {
    if (shiftOver()) { stopTracking('Đã hết ca ' + S.cfg.endTime + ', ứng dụng ngừng theo dõi vị trí.'); return; }
    const okAcc = l.acc <= S.cfg.gpsMaxAcc, eff = effDist(l), R = S.cfg.leaveRadius;
    S.outStreak = okAcc && eff > R ? S.outStreak + 1 : (okAcc ? 0 : S.outStreak);
    const leaving = S.outStreak >= 10 && S.lastState !== 'NGOAI';
    const back = okAcc && S.lastState === 'NGOAI' && eff <= R - 10;
    const due = Date.now() - S.lastSent >= S.cfg.pingMinutes * 60000;
    const sim = l.simulated && !S.simReported;
    if (!(due || leaving || back || sim) || S.sending) return;
    S.sending = true;
    try {
      const af = await antiFake(false);
      const r = await api('ping', { mssv: S.session.mssv, lat: l.lat, lng: l.lng, acc: l.acc, simulated: !!l.simulated, confirmedOut: leaving, antiFake: af });
      S.lastSent = Date.now();
      if (sim) S.simReported = true;
      if (!r.ok) return;
      if (r.slots) { S.slots = r.slots; renderSlots(); }
      if (r.inbox) handleInbox(r.inbox);
      if (!r.track) { stopTracking(r.reason); return; }
      if (r.state === 'NGOAI' && S.lastState !== 'NGOAI') {
        const msg = 'Bạn đã ra ngoài khu vực ' + R + ' m quanh ' + S.cfg.hospital + ' (cách ' + r.dist + ' m). Sự kiện đã được ghi vào báo cáo.';
        $('leaveAlert').textContent = msg; $('leaveAlert').hidden = false;
        if (NATIVE) { try { await Notif.schedule({ notifications: [{ id: 900, title: 'Bạn đã rời khu vực lâm sàng', body: msg }] }); } catch (e) {} }
      }
      if (r.state === 'TRONG') $('leaveAlert').hidden = true;
      S.lastState = r.state;
    } catch (e) { /* mạng chập chờn: lần sau gửi lại */ }
    finally { S.sending = false; }
  }

  async function scheduleSlotReminders() {
    try {
      const p = await Notif.getPending();
      if (p.notifications.length) await Notif.cancel({ notifications: p.notifications.map(n => ({ id: n.id })) });
      const t = vn(), base = now().getTime() - (t.s * 1000);
      const list = slotNow().filter(s => s.status === 'upcoming').map((s, i) => ({
        id: 100 + i, title: 'Xác nhận giữa ca ' + s.time,
        body: 'Mở app Điểm danh và quét khuôn mặt trước ' + s.end + '.',
        schedule: { at: new Date(base + (hhmm(s.time) - t.min) * 60000 - S.offset), allowWhileIdle: true }
      }));
      if (list.length) await Notif.schedule({ notifications: list });
    } catch (e) {}
  }

  /* ---------- đăng xuất ---------- */
  $('btnLogout').addEventListener('click', async () => {
    if (load('dd_lec')) { if (confirmBox('Đăng xuất tài khoản giảng viên?')) { Lec.logout(); $('btnLogout').hidden = true; } return; }
    if (S.tracking && S.today && S.today.checkin && !shiftOver()) {
      toast('Đang trong ca (đến ' + S.cfg.endTime + '), không đăng xuất được. Sau ' + S.cfg.endTime + ' mới đăng xuất.', 5000);
      return;
    }
    if (!confirmBox('Đăng xuất khỏi ứng dụng? Bạn sẽ phải nhập lại MSSV và mã lớp.')) return;
    await stopTracking('');
    try { localStorage.removeItem('dd_session'); Object.keys(localStorage).filter(k => k.indexOf('dd_photo_') === 0).forEach(k => localStorage.removeItem(k)); } catch (e) {}
    S.session = null; S.student = null; S.today = null; S.slots = [];
    $('inName').value = ''; $('inMssv').value = ''; $('classList').innerHTML = '';
    S.inbox = []; renderInbox(); $('inNote').value = ''; setMsg('loginMsg', '');
    $('cbConsent').checked = false; $('btnConsent').disabled = true;
    $('btnLogout').hidden = true;
    show('scr-login');
  });
  function confirmBox(msg) { try { return window.confirm(msg); } catch (e) { return true; } }

  $('btnRefreshLoc').addEventListener('click', async () => {
    if (shiftOver()) { toast('Đã hết ca, ứng dụng không định vị.'); return; }
    S.samples = []; await Loc.stop(); await Loc.start(S.tracking && NATIVE); toast('Đang định vị lại…');
  });
  $('btnAppSettings').addEventListener('click', () => { if (NATIVE) BG.openSettings(); });

  /* ============================ điểm danh và xác nhận ============================ */
  $('btnCheckin').addEventListener('click', () => doFaceAction('checkin'));
  $('btnConfirm').addEventListener('click', () => doFaceAction('confirm'));

  async function doFaceAction(kind, req) {
    if (S.busy) return;
    const msgId = kind === 'checkin' ? 'checkinMsg' : kind === 'answer' ? 'inboxMsg' : 'confirmMsg';
    const radius = kind === 'checkin' ? S.cfg.checkinRadius : S.cfg.leaveRadius;
    if (kind === 'checkin' && vn().min >= hhmm(S.cfg.deadline) && $('inNote').value.trim().length < 10) {
      setMsg(msgId, 'Sau ' + S.cfg.deadline + ' phải ghi chú giải thích lý do (ít nhất 10 ký tự) rồi mới điểm danh.');
      $('inNote').focus();
      return;
    }
    S.busy = true; setMsg(msgId, 'Đang kiểm tra vị trí…', true);
    try {
      const af = await antiFake(true);
      if (NATIVE && !af) throw new Error('Không kiểm tra được phần mềm giả lập vị trí. Cài lại app Điểm danh bản mới nhất.');
      if (af && af.activeMock.length) throw new Error('Đang bật ứng dụng vị trí mô phỏng: ' + af.activeMock.join(', ') + '.');
      const fix = await freshFix();
      if (fix.simulated) throw new Error('Phát hiện vị trí giả lập. Tắt ứng dụng fake GPS rồi thử lại.');
      if (fix.acc > S.cfg.gpsMaxAcc) throw new Error('GPS chưa đủ chính xác (±' + Math.round(fix.acc) + ' m). Ra chỗ thoáng, chờ vài giây rồi thử lại.');
      if (effDist(fix) > radius) throw new Error('Bạn đang cách tâm bệnh viện ' + Math.round(distOf(fix)) + ' m, ngoài bán kính ' + radius + ' m.');
      setMsg(msgId, '');
      let slot = '';
      if (kind === 'confirm') { const o = slotNow().find(s => s.status === 'open'); if (!o) throw new Error('Hiện không trong khung giờ xác nhận.'); slot = o.time; }

      for (;;) {
        const f = await scanFace({ title: kind === 'checkin' ? 'Điểm danh' : kind === 'answer' ? 'Xác nhận cho giảng viên' : 'Xác nhận mốc ' + slot, samples: 2 });
        if (!f) return;
        const l = S.loc && S.loc.t > Date.now() - 30000 && S.loc.acc <= fix.acc + 5 ? S.loc : fix;
        const t = vn();
        const photo = stamp(f.canvas, [
          (kind === 'checkin' ? 'ĐIỂM DANH · ' : kind === 'answer' ? 'XÁC NHẬN THEO YÊU CẦU GV · ' : 'XÁC NHẬN GIỮA CA ' + slot + ' · ') + S.cfg.hospital,
          S.student.name + ' · ' + S.student.mssv,
          t.dmy + ' ' + t.hms + ' (GMT+7) · cách tâm ' + Math.round(distOf(l)) + ' m (±' + Math.round(l.acc) + ' m)'
        ]);
        const note = kind === 'checkin' ? $('inNote').value.trim() : '';
        const ans = await review(photo, kind === 'checkin' ? 'Kiểm tra ảnh điểm danh' : 'Kiểm tra ảnh xác nhận',
          (note ? 'Ghi chú: ' + note + '. ' : '') + 'Giờ chính thức là giờ máy chủ nhận được ảnh.',
          async () => {
            const r = await api(kind, { id: req && req.id, mssv: S.session.mssv, lat: l.lat, lng: l.lng, acc: l.acc, simulated: !!(l.simulated || fix.simulated),
              identicalSamples: fix.identicalSamples, antiFake: af, site: S.siteCode, descriptor: f.descriptor, faceCount: 1, liveness: true, photo, note });
            if (!r.ok) throw new Error(r.msg);
            return r;
          });
        if (ans === 'retake') continue;
        if (!ans) return;
        toast(ans.msg, 5000);
        if (kind === 'checkin') {
          save('dd_photo_' + ans.date, photo);
          S.today.checkin = { time: ans.time, status: ans.status, late: ans.late, site: ans.site || S.siteCode };
          $('inNote').value = '';
        }
        if (ans.slots) S.slots = ans.slots;
        if (kind === 'answer') { S.inbox = S.inbox.filter(m => m.id !== req.id); renderInbox(); }
        renderHome();
        return;
      }
    } catch (e) { setMsg(msgId, e.message || String(e)); }
    finally { S.busy = false; }
  }

  /* ============================ thông báo từ giảng viên ============================ */
  S.inbox = [];
  function handleInbox(list) {
    S.inbox = list || [];
    let seen = load('dd_seen') || [];
    const fresh = S.inbox.filter(m => !seen.includes(m.id));
    if (fresh.length) {
      seen = seen.concat(fresh.map(m => m.id)).slice(-200); save('dd_seen', seen);
      fresh.forEach(m => notifyLocal(m));
      if (navigator.vibrate) { try { navigator.vibrate([200, 100, 200]); } catch (e) {} }
      if (!document.hidden) toast('Có ' + fresh.length + ' thông báo mới từ giảng viên', 5000);
    }
    renderInbox();
  }
  async function notifyLocal(m) {
    if (!NATIVE) return;
    try {
      await Notif.schedule({ notifications: [{ id: 2000 + (parseInt(m.id, 16) % 100000),
        title: (m.type === 'XN' ? 'Yêu cầu xác nhận có mặt' : 'Thông báo') + ' – ' + m.from,
        body: m.text + (m.deadline ? ' (trước ' + m.deadline + ')' : '') }] });
    } catch (e) {}
  }
  function esc(t) { return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function renderInbox() {
    const card = $('cardInbox');
    if (!card) return;
    card.hidden = !S.inbox.length;
    $('inboxCount').textContent = S.inbox.length;
    $('inboxList').innerHTML = S.inbox.map(m => '<div class="msg ' + (m.type === 'XN' ? 'req' : '') + '">' +
      '<div class="msg-head"><b>' + (m.type === 'XN' ? 'Yêu cầu xác nhận có mặt' : 'Thông báo') + '</b><small>' + esc(m.from) + ' · ' + m.sentAt + '</small></div>' +
      '<p>' + esc(m.text) + '</p>' +
      (m.type === 'XN'
        ? '<p class="msg-dead">Hạn chót ' + m.deadline + '. Quét khuôn mặt tại khu vực lâm sàng.</p><button class="btn" data-ans="' + m.id + '">Xác nhận có mặt ngay</button>'
        : '<button class="btn ghost small" data-ack="' + m.id + '">Đã đọc</button>') + '</div>').join('');
    $('inboxList').querySelectorAll('[data-ack]').forEach(b => b.onclick = async () => {
      b.disabled = true;
      try { const r = await api('ack', { mssv: S.session.mssv, id: b.dataset.ack }); if (!r.ok) throw new Error(r.msg); S.inbox = S.inbox.filter(m => m.id !== b.dataset.ack); renderInbox(); }
      catch (e) { setMsg('inboxMsg', e.message || 'Không gửi được.'); b.disabled = false; }
    });
    $('inboxList').querySelectorAll('[data-ans]').forEach(b => b.onclick = () => doFaceAction('answer', { id: b.dataset.ans }));
  }
  // Khi đang mở app: hỏi thông báo mới mỗi 45 giây
  setInterval(async () => {
    if (document.hidden || !S.session || !S.student || $('scr-home').hidden || S.busy) return;
    try { const r = await api('inbox', { mssv: S.session.mssv }); if (r.ok) handleInbox(r.inbox); } catch (e) {}
  }, 45000);

  /* ============================ giảng viên ============================ */
  const Lec = {
    data: null, sel: new Set(), filter: 'all', timer: null,
    start() {
      const s = load('dd_lec');
      if (!s) { show('scr-leclogin'); return; }
      $('lecName').textContent = s.name;
      $('btnLogout').hidden = false;
      show('scr-lec');
      this.load();
      clearInterval(this.timer);
      this.timer = setInterval(() => { if (!document.hidden && !$('scr-lec').hidden) this.load(true); }, 30000);
    },
    async load(quiet) {
      const s = load('dd_lec'); if (!s) return;
      if (!quiet) $('lecInfo').textContent = 'Đang tải…';
      try {
        const r = await api('lecOverview', { token: s.token });
        if (!r.ok) { if (r.code === 'AUTH') { this.logout(); setMsg('lecLoginMsg', r.msg); } else $('lecInfo').textContent = r.msg; return; }
        this.data = r; this.render();
      } catch (e) { $('lecInfo').textContent = 'Không kết nối được máy chủ.'; }
    },
    statusOf(st) {
      const c = st.checkin, l = st.live;
      if (!c) return { k: 'absent', label: 'Chưa điểm danh', cls: 'bad' };
      if (l && l.lost) return { k: 'warn', label: 'Mất tín hiệu', cls: 'bad' };
      if (l && l.state === 'NGOAI') return { k: 'warn', label: 'Ngoài khu vực', cls: 'bad' };
      return { k: 'ok', label: c.status === 'Đúng giờ' ? 'Có mặt' : 'Trễ ' + c.late + "'", cls: c.status === 'Đúng giờ' ? 'ok' : 'warn' };
    },
    render() {
      const r = this.data, list = r.students;
      const stat = { all: list.length, ok: 0, late: 0, absent: 0, warn: 0 };
      list.forEach(st => { const x = this.statusOf(st); if (x.k === 'absent') stat.absent++; else if (x.k === 'warn') stat.warn++; else stat.ok++; if (st.checkin && st.checkin.status !== 'Đúng giờ') stat.late++; });
      $('lecInfo').textContent = vn().dmy + ' · cập nhật ' + vn().hm + ' · ' + (r.config.sites || [{ name: r.config.hospital }]).map(x => x.name).join(', ');
      $('lecStats').innerHTML = [['Tổng', stat.all], ['Đã điểm danh', stat.all - stat.absent], ['Trễ', stat.late], ['Vắng', stat.absent], ['Ngoài vùng/mất tín hiệu', stat.warn]]
        .map(x => '<div><b>' + x[1] + '</b><small>' + x[0] + '</small></div>').join('');
      const sel = $('lecFilter');
      if (!sel.dataset.sites && (r.config.sites || []).length > 1) {
        sel.dataset.sites = '1';
        r.config.sites.forEach(x => { const o = document.createElement('option'); o.value = 'site:' + x.code; o.textContent = 'Tại ' + x.name; sel.appendChild(o); });
      }
      const shown = list.filter(st => {
        if (this.filter.indexOf('site:') === 0) return st.checkin && st.checkin.site === this.filter.slice(5);
        const k = this.statusOf(st).k; return this.filter === 'all' || this.filter === k || (this.filter === 'in' && k !== 'absent');
      });
      $('lecList').innerHTML = shown.map(st => {
        const x = this.statusOf(st), c = st.checkin, l = st.live;
        const sub = c ? 'Điểm danh ' + c.time + ((r.config.sites || []).length > 1 && c.siteName ? ' tại ' + c.siteName : '') + (l && l.dist !== '' ? ' · cách ' + l.dist + ' m' : '') + (l && l.last ? ' · cập nhật ' + String(l.last).substr(0, 5) : '') +
          ' · giữa ca ' + c.slots + (c.leaves ? ' · rời vùng ' + c.leaves + ' lần' : '') + (c.platform === 'ios-web' ? ' · iPhone' : '') : (st.enrolled ? 'Đã đăng ký khuôn mặt' : 'Chưa đăng ký khuôn mặt');
        return '<label class="lec-row"><input type="checkbox" data-m="' + st.mssv + '"' + (this.sel.has(st.mssv) ? ' checked' : '') + '>' +
          '<span class="lec-main"><b>' + esc(st.name) + '</b><small>' + st.mssv + (st.group ? ' · ' + esc(st.group) : '') + '</small><small>' + esc(sub) + '</small>' +
          (c && c.note ? '<small class="note">Ghi chú: ' + esc(c.note) + '</small>' : '') + '</span><span class="pill ' + x.cls + '">' + x.label + '</span></label>';
      }).join('') || '<p class="muted">Không có sinh viên.</p>';
      $('lecList').querySelectorAll('input[data-m]').forEach(cb => cb.onchange = () => { cb.checked ? this.sel.add(cb.dataset.m) : this.sel.delete(cb.dataset.m); this.updSel(); });
      this.updSel();
      const st = { 'Đã gửi': '', 'Đã nhận': 'warn', 'Đã xem': 'ok', 'Có mặt': 'ok', 'Quá hạn': 'bad' };
      $('lecMsgs').innerHTML = r.messages.map(m => '<div class="lec-msg"><div><b>' + esc(m.studentName) + '</b> <small>' + m.sentAt + ' · ' +
        (m.type === 'XN' ? 'Yêu cầu xác nhận' : 'Thông báo') + '</small><p>' + esc(m.text) + '</p>' + (m.result && m.status !== 'Có mặt' ? '<small class="note">' + esc(m.result.split(' | ')[0]) + '</small>' : '') +
        '</div><span class="pill ' + (st[m.status] || '') + '">' + m.status + (m.ackAt ? ' ' + m.ackAt : '') + '</span></div>').join('') || '<p class="muted">Chưa gửi yêu cầu nào hôm nay.</p>';
    },
    updSel() { $('lecSelCount').textContent = this.sel.size ? 'Đã chọn ' + this.sel.size + ' sinh viên' : 'Chưa chọn sinh viên'; $('btnLecSend').disabled = !this.sel.size; },
    logout() { clearInterval(this.timer); save('dd_lec', null); try { localStorage.removeItem('dd_lec'); } catch (e) {} this.data = null; this.sel.clear(); show('scr-leclogin'); }
  };

  $('formLecLogin').addEventListener('submit', async ev => {
    ev.preventDefault();
    setMsg('lecLoginMsg', 'Đang kiểm tra…', true);
    try {
      const r = await api('lecLogin', { user: $('inLecUser').value.trim(), pass: $('inLecPass').value });
      if (!r.ok) { setMsg('lecLoginMsg', r.msg); return; }
      save('dd_lec', { token: r.token, name: r.name }); $('inLecPass').value = ''; setMsg('lecLoginMsg', '');
      if (!S.deviceId) S.deviceId = await getDeviceId();
      Lec.start();
    } catch (e) { setMsg('lecLoginMsg', e.message || 'Không kết nối được máy chủ.'); }
  });
  $('btnToLec').addEventListener('click', () => show('scr-leclogin'));
  $('btnToStudent').addEventListener('click', () => location.reload());
  $('lecFilter').addEventListener('change', e => { Lec.filter = e.target.value; Lec.render(); });
  $('btnLecAll').addEventListener('click', () => {
    const boxes = [...$('lecList').querySelectorAll('input[data-m]')];
    const all = boxes.length && boxes.every(b => Lec.sel.has(b.dataset.m));
    boxes.forEach(b => all ? Lec.sel.delete(b.dataset.m) : Lec.sel.add(b.dataset.m));
    Lec.render();
  });
  $('lecType').addEventListener('change', e => { $('lecMinWrap').hidden = e.target.value !== 'XN'; });
  $('btnLecRefresh').addEventListener('click', () => Lec.load());
  $('btnLecSend').addEventListener('click', async () => {
    const s = load('dd_lec'); if (!s || !Lec.sel.size) return;
    const type = $('lecType').value, text = $('lecText').value.trim();
    if (type === 'TB' && !text) { setMsg('lecSendMsg', 'Nhập nội dung thông báo.'); return; }
    $('btnLecSend').disabled = true; setMsg('lecSendMsg', 'Đang gửi…', true);
    try {
      const r = await api('lecSend', { token: s.token, mssv: [...Lec.sel], type, text, minutes: Number($('lecMin').value) || 10 });
      if (!r.ok) throw new Error(r.msg);
      setMsg('lecSendMsg', r.msg, true); $('lecText').value = ''; Lec.sel.clear(); Lec.load(true);
    } catch (e) { setMsg('lecSendMsg', e.message || 'Gửi không thành công.'); }
    finally { Lec.updSel(); }
  });

  /** Hiện ảnh để sinh viên kiểm tra. Trả 'retake', null (hủy) hoặc kết quả gửi. */
  function review(photo, title, note, submit) {
    return new Promise(resolve => {
      $('reviewTitle').textContent = title; $('reviewImg').src = photo; $('reviewNote').textContent = note; setMsg('reviewMsg', '');
      $('review').hidden = false;
      const done = v => { $('review').hidden = true; $('btnRetake').onclick = $('btnSubmit').onclick = null; resolve(v); };
      $('btnRetake').onclick = () => done('retake');
      $('btnSubmit').onclick = async () => {
        $('btnSubmit').disabled = $('btnRetake').disabled = true; setMsg('reviewMsg', 'Đang gửi lên máy chủ…', true);
        try { done(await submit()); }
        catch (e) { setMsg('reviewMsg', e.message || 'Gửi không thành công.'); }
        finally { $('btnSubmit').disabled = $('btnRetake').disabled = false; }
      };
    });
  }

  /* ============================ camera và nhận diện khuôn mặt ============================ */
  function loadModels() {
    if (!S.models) {
      S.models = (async () => {
        try { await faceapi.tf.setBackend('webgl'); } catch (e) { try { await faceapi.tf.setBackend('cpu'); } catch (e2) {} }
        await faceapi.tf.ready();
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri('models'),
          faceapi.nets.faceLandmark68Net.loadFromUri('models'),
          faceapi.nets.faceRecognitionNet.loadFromUri('models')
        ]);
      })().catch(e => { S.models = null; throw e; });
    }
    return S.models;
  }

  function ear(pts) {
    const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    return (d(pts[1], pts[5]) + d(pts[2], pts[4])) / (2 * d(pts[0], pts[3]));
  }
  const euclid = (a, b) => Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0));
  const mean = arr => arr[0].map((_, i) => arr.reduce((s, a) => s + a[i], 0) / arr.length);

  /**
   * Quét khuôn mặt. blink = true: kiểm tra người thật bằng nhắm mở mắt (dùng khi điểm danh, xác nhận).
   * blink = false: chỉ chụp nhiều mẫu khuôn mặt ổn định (dùng khi đăng ký).
   * Trả { descriptors, descriptor, canvas } hoặc null nếu người dùng đóng camera.
   */
  async function scanFace({ title, samples, blink = true }) {
    const video = $('video'), step = $('camStep'), bar = $('camProgress'), oval = $('oval');
    $('camTitle').textContent = title; step.textContent = 'Đang mở camera…'; bar.style.width = '0%'; oval.className = 'oval';
    $('cam').hidden = false;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    } catch (e) {
      $('cam').hidden = true;
      throw new Error('Không mở được camera. Cấp quyền Camera cho ' + (NATIVE ? 'app Điểm danh' : 'Điểm danh trong Cài đặt của iPhone') + ' rồi thử lại.');
    }
    video.srcObject = stream;
    try { await video.play(); } catch (e) {}
    const stop = () => { stream.getTracks().forEach(t => t.stop()); video.srcObject = null; $('cam').hidden = true; };
    try {
      step.textContent = 'Đang tải mô hình nhận diện…';
      await loadModels();
    } catch (e) { stop(); throw new Error('Không tải được mô hình nhận diện khuôn mặt. Kiểm tra mạng rồi thử lại.'); }

    const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
    return new Promise((resolve, reject) => {
      let phase = 'align', base = [], descs = [], canvas = null, phaseAt = Date.now(), closed = false;
      const t0 = Date.now();
      let alive = true;
      const end = (v, err) => { if (!alive) return; alive = false; stop(); $('btnCamClose').onclick = null; err ? reject(err) : resolve(v); };
      $('btnCamClose').onclick = () => end(null);
      const say = (txt, cls, pct) => { step.textContent = txt; oval.className = 'oval ' + (cls || ''); if (pct != null) bar.style.width = pct + '%'; };
      const restart = msg => { phase = 'align'; base = []; descs = []; canvas = null; phaseAt = Date.now(); say(msg, 'bad', 0); };

      const loop = async () => {
        if (!alive) return;
        if (Date.now() - t0 > 60000) { end(null, new Error('Hết thời gian quét. Đứng nơi đủ sáng, nhìn thẳng camera rồi thử lại.')); return; }
        try {
          if (video.readyState < 2) { setTimeout(loop, 100); return; }
          const needDesc = phase === 'align' || phase === 'verify';
          let res = faceapi.detectAllFaces(video, opts).withFaceLandmarks();
          if (needDesc) res = res.withFaceDescriptors();
          res = await res;
          if (!alive) return;
          if (res.length !== 1) {
            if (res.length > 1) { if (phase !== 'align') restart('Chỉ một người trong khung hình'); else say('Chỉ một người trong khung hình', 'bad'); }
            else say('Đưa khuôn mặt vào khung oval', 'bad');
            setTimeout(loop, 60); return;
          }
          const r = res[0], box = r.detection.box, vw = video.videoWidth || 640, vh = video.videoHeight || 480;
          if (box.width < vw * 0.26) { say('Đưa điện thoại lại gần hơn', 'bad'); setTimeout(loop, 60); return; }
          if (Math.abs(box.x + box.width / 2 - vw / 2) > vw * 0.22 || Math.abs(box.y + box.height / 2 - vh / 2) > vh * 0.25) {
            say('Đưa khuôn mặt vào giữa khung', 'bad'); setTimeout(loop, 60); return;
          }
          const e = (ear(r.landmarks.getLeftEye()) + ear(r.landmarks.getRightEye())) / 2;

          if (phase === 'align') {
            if (base.length >= 2 && e < (base.reduce((s, x) => s + x, 0) / base.length) * 0.8) { setTimeout(loop, 60); return; } // đang chớp mắt, bỏ khung này
            base.push(e);
            descs.push(Array.from(r.descriptor));
            if (descs.length > 1 && euclid(descs[descs.length - 1], descs[0]) > 0.45) { restart('Giữ yên khuôn mặt'); setTimeout(loop, 60); return; }
            if (!canvas || r.detection.score > canvas.score) {
              canvas = document.createElement('canvas'); canvas.width = vw; canvas.height = vh;
              canvas.getContext('2d').drawImage(video, 0, 0, vw, vh); canvas.score = r.detection.score;
            }
            say('Giữ yên, nhìn thẳng camera…', 'ok', Math.round((blink ? 50 : 95) * descs.length / samples));
            if (descs.length >= samples && base.length >= 3) {
              if (!blink) { say('Hoàn tất', 'ok', 100); end({ descriptors: descs, descriptor: mean(descs), canvas }); return; }
              phase = 'close'; phaseAt = Date.now(); say('Nhắm mắt lại', 'ok', 60);
            }
          } else if (phase === 'close') {
            const b = base.reduce((s, x) => s + x, 0) / base.length;
            if (e < b * 0.78 || e < 0.18) { closed = true; phase = 'open'; phaseAt = Date.now(); say('Mở mắt ra', 'ok', 80); }
            else if (Date.now() - phaseAt > 6000) { phaseAt = Date.now(); say('Nhắm hẳn mắt khoảng 1 giây', 'bad', 60); }
          } else if (phase === 'open') {
            const b = base.reduce((s, x) => s + x, 0) / base.length;
            if (e > b * 0.82) { phase = 'verify'; say('Đang xác minh…', 'ok', 90); }
            else if (Date.now() - phaseAt > 8000) restart('Mở mắt và làm lại từ đầu');
          } else if (phase === 'verify') {
            const d = Array.from(r.descriptor);
            const m0 = mean(descs);
            if (!closed || euclid(d, m0) > 0.5) { restart('Khuôn mặt thay đổi, làm lại'); setTimeout(loop, 60); return; }
            descs.push(d);
            say('Hoàn tất', 'ok', 100);
            end({ descriptors: descs, descriptor: mean(descs), canvas });
            return;
          }
        } catch (err) { /* bỏ qua khung lỗi */ }
        setTimeout(loop, 40);
      };
      say('Đưa khuôn mặt vào khung oval', '', 0);
      loop();
    });
  }

  /** Đóng dấu thời gian, họ tên, vị trí và nhãn BV TLS lên ảnh. */
  function stamp(src, lines) {
    const W = 480, H = Math.round(src.height * W / src.width);
    const c = $('work'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0, W, H);
    const all = lines.concat(['Từ BV TLS · by Dr Huy - BV TLS']);
    const lh = 19, pad = 10, bandH = pad * 2 + lh * all.length;
    g.fillStyle = 'rgba(0,0,0,0.62)'; g.fillRect(0, H - bandH, W, bandH);
    g.textBaseline = 'top';
    all.forEach((t, i) => {
      g.font = (i === 0 ? '700 ' : i === all.length - 1 ? 'italic 500 ' : '600 ') + (i === 0 ? 15 : 14) + 'px "Be Vietnam Pro", system-ui, sans-serif';
      g.fillStyle = i === all.length - 1 ? '#ffd4cf' : '#ffffff';
      let s = t; while (g.measureText(s).width > W - pad * 2 && s.length > 4) s = s.slice(0, -2) + '…';
      g.fillText(s, pad, H - bandH + pad + i * lh);
    });
    g.fillStyle = '#c62828'; g.fillRect(10, 10, 66, 26);
    g.fillStyle = '#ffffff'; g.font = '800 15px "Be Vietnam Pro", system-ui, sans-serif'; g.textBaseline = 'middle';
    g.fillText('BV TLS', 17, 24);
    return c.toDataURL('image/jpeg', 0.82);
  }

  boot();
})();

// AUTO-DETECT ANDROID NAVIGATION MODE (3-Button vs Gesture)
(function () {
  const t = document.createElement('div');
  t.style.paddingBottom = 'env(safe-area-inset-bottom,0px)';
  document.documentElement.appendChild(t);
  const s = parseInt(getComputedStyle(t).paddingBottom);
  document.documentElement.removeChild(t);
  // Buttons typically report >30px (around 48px), Gesture reports ~24px or less
  document.documentElement.setAttribute('data-nav', s > 30 ? 'buttons' : 'gesture');
})();

// ===== HARDWARE-AWARE PERFORMANCE TIER ENGINE =====
async function updatePerformanceTier() {
  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const androidMatch = navigator.userAgent.match(/Android (\d+)/);
  const androidVer = androidMatch ? parseInt(androidMatch[1]) : 0;

  let tier = 'mid';
  if (mem >= 4 && cores > 4 && androidVer >= 14) tier = 'high';
  else if (mem <= 2 || cores <= 2 || androidVer < 9) tier = 'low';

  // Battery Watcher
  try {
    if (navigator.getBattery) {
      const battery = await navigator.getBattery();
      if (battery.level <= 0.20 && !battery.charging) tier = 'low';
      battery.onlevelchange = updatePerformanceTier;
      battery.onchargingchange = updatePerformanceTier;
    }
  } catch (e) { }

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) tier = 'low';

  document.documentElement.setAttribute('data-tier', tier);
  document.body.classList.remove('low-end', 'ultra-mode');
  if (tier === 'low') document.body.classList.add('low-end');
  else if (tier === 'high') document.body.classList.add('ultra-mode');
}
updatePerformanceTier();
updatePerformanceTier();

// ===== STATUS BAR COLOR SYNC =====
let isStatusSyncing = false;
async function syncStatusBar() {
  if (isStatusSyncing) return;
  if (!window.Capacitor || !window.Capacitor.isNativePlatform()) return;

  isStatusSyncing = true;
  try {
    const isDark = document.body.getAttribute('data-theme') === 'dark' ||
      (!document.body.getAttribute('data-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const color = isDark ? '#111116' : '#EAEEF2';

    const { StatusBar } = Capacitor.Plugins;
    if (StatusBar) {
      await StatusBar.setBackgroundColor({ color });
      await StatusBar.setStyle({ style: isDark ? 'DARK' : 'LIGHT' });
    }
  } catch (e) {
    console.warn('StatusBar sync failed', e);
  } finally {
    isStatusSyncing = false;
  }
}

// ===== LIQUID BLOB NAV ANIMATION =====
function updateBlobPosition(activeBtn) {
  const blob = document.getElementById('bnav-blob');
  const nav = document.getElementById('bnav-main');
  if (!blob || !nav || !activeBtn) return;
  const navRect = nav.getBoundingClientRect();
  const btnRect = activeBtn.getBoundingClientRect();
  const left = btnRect.left - navRect.left;
  const width = btnRect.width;
  blob.style.transform = `translateX(${left}px) translateZ(0)`;
  blob.style.width = width + 'px';
  blob.style.opacity = '1';
}

// Icon init
lucide.createIcons({ attrs: { 'stroke-width': 2.5 } });

// GLOBAL SCROLL SMOTHNESS & HEADER CRYSTAL
document.addEventListener('scroll', e => {
  if (e.target.classList && e.target.classList.contains('scroll')) {
    const top = e.target.scrollTop;
    const page = e.target.parentElement;
    const header = page.querySelector('.topbar') || page.querySelector('.home-header');
    if (header) {
      if (top > 12) header.classList.add('scrolled-header');
      else header.classList.remove('scrolled-header');
    }
  }
}, true);

// ANDROID NATIVE BACK BUTTON & PERSISTENCE
if (window.Capacitor && (Capacitor.getPlatform() === 'android' || Capacitor.isNativePlatform())) {
  const { App } = Capacitor.Plugins;

  // Consume first back press to prevent immediate browser-default exit
  history.pushState({ page: 'home' }, '');

  App.addListener('backButton', ({ canGoBack }) => {
    // 1. Close modals first
    if (closeTopmostModal()) {
      history.pushState({ page: 'home' }, ''); // Maintain history lock
      return;
    }

    // 2. If not on home tab, return to home
    const activePage = document.querySelector('.page.active');
    if (activePage && activePage.id !== 'pg-home') {
      switchNav('home');
      history.pushState({ page: 'home' }, ''); // Maintain history lock
      return;
    }

    // 3. Double tap to exit on Home
    if (!exitTap) {
      exitTap = true;
      showToast("Tap again to exit");
      setTimeout(() => exitTap = false, 2000);
      history.pushState({ page: 'home' }, ''); // Re-push to prevent browser from leaving
      return;
    }

    App.exitApp();
  });

  App.addListener('appStateChange', ({ isActive }) => { if (!isActive) saveData(); });
}

function lp(el, cb) {
  let t, sx, sy;
  const start = (e) => {
    sx = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
    sy = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;
    t = setTimeout(() => {
      // No vibration
      el.classList.add('lp-active');
      cb();
      setTimeout(() => el.classList.remove('lp-active'), 250);
      t = null;
    }, 400);
  };
  const cancel = (e) => {
    if (e && e.type === 'touchmove' && sx !== undefined) {
      const dx = Math.abs(e.touches[0].clientX - sx);
      const dy = Math.abs(e.touches[0].clientY - sy);
      if (dx < 10 && dy < 10) return;
    }
    if (t) { clearTimeout(t); t = null; }
    el.classList.remove('lp-active');
  };
  el.addEventListener('mousedown', start);
  el.addEventListener('touchstart', start, { passive: true });
  el.addEventListener('touchmove', cancel, { passive: true });
  el.addEventListener('touchend', cancel);
  el.addEventListener('mouseup', cancel);
  el.addEventListener('mouseleave', cancel);
  el.addEventListener('contextmenu', e => e.preventDefault());
}
function dt(el, cb) {
  let last = 0; el.addEventListener('click', () => {
    const now = Date.now(); if (now - last < 300) { cb(); last = 0; } else last = now;
  });
}
function sw(el, cb) {
  /* ── Touch (mobile) ── */
  let sx, sy, st;
  el.addEventListener('touchstart', e => {
    // Ignore swipes that start on the date strip or other scrollable horizontal regions
    if (e.target.closest('.ds-wrap') || e.target.closest('.wv-row')) return;

    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
    st = Date.now();
  }, { passive: true });
  el.addEventListener('touchmove', e => { }, { passive: true });
  el.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    const dt = Date.now() - st;
    // Strict linear swipe only (must be mostly horizontal)
    if (dt < 600 && Math.abs(dx) > 60 && Math.abs(dy) < Math.abs(dx) * 0.8) {
      const velocity = Math.abs(dx) / dt;
      let days = (velocity > 3.5) ? 2 : 1;
      cb((dx > 0 ? -1 : 1) * days);
    }
  }, { passive: true });

  /* ── Trackpad / mouse wheel (desktop) ── */
  let wheelAccum = 0;
  let wheelLocked = false;
  el.addEventListener('wheel', e => {
    if (e.target.closest('.ds-wrap') || e.target.closest('.wv-row')) return;
    if (Math.abs(e.deltaX) < Math.abs(e.deltaY) * 0.6) return;
    if (e.cancelable) e.preventDefault();
    if (wheelLocked) return;
    wheelAccum += e.deltaX;
    if (Math.abs(wheelAccum) > 60) {
      const dir = wheelAccum > 0 ? 1 : -1;
      wheelAccum = 0;
      wheelLocked = true;
      cb(dir);
      setTimeout(() => { wheelLocked = false; }, 400); // 400ms lock for smoothness
    }
  }, { passive: false });
}

const COLS = ['#0084FF', '#00D97E', '#FF3B30', '#9F5DFF', '#FF9F0A', '#FF375F', '#00D1FF', '#FFD60A'];
let subjects = [], classes = [], tasks = [], holidays = [];
let groups = [];
let notifSettings = {
  enabled: true,
  classRemind: true,
  testRemind: true,
  examRemind: true,
  taskRemind: true,
  leadMins: 15
};

// HARDENED STRUCTURED LOCAL DATABASE (IndexedDB + Multi-Store Sync)
const DB_NAME = 'MySkedul_Storage_Prod', STORES = ['subjects', 'classes', 'tasks', 'meta', 'calendar'];
function getDB() {
  return new Promise(res => {
    const req = indexedDB.open(DB_NAME, 3);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      STORES.forEach(s => { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s); });
    };
    req.onsuccess = e => res(e.target.result);
    req.onerror = () => res(null);
  });
}

let isSaving = false;
async function saveData() {
  if (isSaving) return;
  isSaving = true;

  const meta = { globalUserName, globalUserEmail, ts: Date.now() };
  const cal = { holidays, examDays, testOverrides };
  const settings = { notifSettings };

  try {
    localStorage.setItem('MySkedul_FullBackup', JSON.stringify({ subjects, classes, tasks, meta, cal, settings }));
  } catch (e) { }

  try {
    const db = await getDB(); if (!db) throw 'No DB';
    const tx = db.transaction(STORES, 'readwrite');
    tx.objectStore('meta').put(meta, 'current');
    tx.objectStore('subjects').put(subjects, 'list');
    tx.objectStore('classes').put(classes, 'list');
    tx.objectStore('tasks').put(tasks, 'list');
    tx.objectStore('calendar').put(cal, 'data');
    tx.objectStore('meta').put(notifSettings, 'notifSettings');
    await new Promise((res, rej) => {
      tx.oncomplete = res;
      tx.onerror = rej;
    });
  } catch (e) { console.error('DB Save error', e); }

  if (window.Capacitor && window.Capacitor.isNativePlatform()) {
    // Internal storage fallback backup - catch errors to prevent main thread blocking
    try {
      const { Filesystem } = Capacitor.Plugins;
      const { Directory, Encoding } = Capacitor;
      if (Filesystem) {
        await Filesystem.writeFile({
          path: 'myskedul_internal.json',
          data: JSON.stringify({ subjects, classes, tasks, meta, cal, settings }),
          directory: Directory.Data,
          encoding: Encoding.UTF8
        });
      }
    } catch (e) { }

    // Schedule notifications last as it is the heaviest operation
    if (notifSettings.enabled) await scheduleAllNotifications();
  }

  isSaving = false;
}

async function loadData() {
  try {
    const db = await getDB(); if (!db) throw 'No DB';
    const tx = db.transaction(STORES, 'readonly');
    const [m, s, c, t, l] = await Promise.all([
      new Promise(r => { const g = tx.objectStore('meta').get('current'); g.onsuccess = () => r(g.result); g.onerror = () => r(null); }),
      new Promise(r => { const g = tx.objectStore('subjects').get('list'); g.onsuccess = () => r(g.result); g.onerror = () => r(null); }),
      new Promise(r => { const g = tx.objectStore('classes').get('list'); g.onsuccess = () => r(g.result); g.onerror = () => r(null); }),
      new Promise(r => { const g = tx.objectStore('tasks').get('list'); g.onsuccess = () => r(g.result); g.onerror = () => r(null); }),
      new Promise(r => { const g = tx.objectStore('calendar').get('data'); g.onsuccess = () => r(g.result); g.onerror = () => r(null); })
    ]);

    if (m) {
      globalUserName = m.globalUserName || m.pName || 'Student';
      globalUserEmail = m.globalUserEmail || m.pEmail || '';
    }
    if (Array.isArray(s) && s.length) subjects = s;
    if (Array.isArray(c)) classes = c;
    if (Array.isArray(t)) tasks = t;
    if (l) {
      if (l.holidays) holidays = l.holidays;
      if (l.examDays) examDays = l.examDays;
      if (l.testOverrides) testOverrides = l.testOverrides;
    }

    const ns = await new Promise(r => { const g = tx.objectStore('meta').get('notifSettings'); g.onsuccess = () => r(g.result); g.onerror = () => r(null); });
    if (ns) notifSettings = ns;


  } catch (e) {
    // Native file fallback
    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
      try {
        const { Filesystem } = Capacitor.Plugins;
        const { Directory, Encoding } = Capacitor;
        const res = await Filesystem.readFile({ path: 'myskedul_internal.json', directory: Directory.Data, encoding: Encoding.UTF8 });
        if (res.data) {
          const d = JSON.parse(res.data);
          if (Array.isArray(d.subjects)) subjects = d.subjects;
          if (Array.isArray(d.classes)) classes = d.classes;
          if (Array.isArray(d.tasks)) tasks = d.tasks;
          if (Array.isArray(d.holidays)) holidays = d.holidays;
          if (Array.isArray(d.examDays)) examDays = d.examDays;
          if (Array.isArray(d.testOverrides)) testOverrides = d.testOverrides;
          if (d.globalUserName || d.meta?.globalUserName) globalUserName = d.meta?.globalUserName || d.globalUserName;
          return;
        }
      } catch (err) { }
    }

    // Final fallback to legacy browser local storage
    let raw = localStorage.getItem('MySkedul_data') || localStorage.getItem('MySkedul_FullBackup');
    if (raw) {
      try {
        const d = JSON.parse(raw);
        if (d.subjects) subjects = d.subjects;
        if (d.classes) classes = d.classes;
        if (d.tasks) tasks = d.tasks;
        if (d.globalUserName || d.pName) globalUserName = d.globalUserName || d.pName;
        if (d.globalUserEmail || d.pEmail) globalUserEmail = d.globalUserEmail || d.pEmail;
      } catch (err) { }
    }
  }
}

document.addEventListener('visibilitychange', () => { if (document.hidden) saveData(); });
window.addEventListener('beforeunload', saveData);

// HAPTIC ENGINE
function haptic(type = 'light') {
  // Haptics disabled per request
  return;
}

const sn = id => { const s = subjects.find(x => x.id === id); return s ? s.name : 'Unknown'; };
const sc = id => { const s = subjects.find(x => x.id === id); return s ? s.color : '#0D0D0D'; };

let n = new Date();
let todayMins = n.getHours() * 60 + n.getMinutes();
function t2m(t) { const [h, m] = t.split(':'); return parseInt(h) * 60 + parseInt(m); }
function status(c) { const s = t2m(c.start), e = t2m(c.end); if (todayMins >= s && todayMins < e) return 'current'; if (todayMins >= e) return 'past'; return 'upcoming'; }

// Exam Days: array of {date:'2026-04-05', subject:'Math', start:'09:00', end:'12:00', room:'Hall A'}
let examDays = [];
// Test Overrides: array of {date:'2026-03-27', classId:2, subject:'', room:'', start:'', end:''}
let testOverrides = [];

// Global Nav
function switchNav(tab) {
  const pages = document.querySelectorAll('.page');
  const tabs = document.querySelectorAll('.nb');

  // Capture state BEFORE clearing classes
  const tabOrder = ['home', 'sched', 'tasks', 'groups', 'profile'];
  const curTab = Array.from(tabs).find(t => t.classList.contains('active'))?.id?.replace('bnav-', '') || 'home';
  const curIdx = tabOrder.indexOf(curTab);
  const nextIdx = tabOrder.indexOf(tab);
  const dx = nextIdx > curIdx ? 16 : -16;

  pages.forEach(p => p.classList.remove('active'));
  tabs.forEach(b => { if (b) b.classList.remove('active') });

  const targetPage = document.getElementById('pg-' + (tab === 'sched' ? 'scheds' : tab));
  const targetTab = document.getElementById('bnav-' + tab);

  if (targetPage) {
    targetPage.classList.remove('active', 'stagger-reveal');
    void targetPage.offsetWidth; // Force reflow
    targetPage.classList.add('active', 'stagger-reveal');

    // Re-trigger Header SlideDown
    const hdr = targetPage.querySelector('.home-header, .topbar, .profile-header');
    if (hdr) {
      hdr.classList.remove('slide-down');
      void hdr.offsetWidth;
      hdr.classList.add('slide-down');
    }
    setTimeout(() => targetPage.classList.remove('stagger-reveal'), 1000);
  }
  if (targetTab) {
    targetTab.classList.add('active');
    const blob = document.getElementById('bnav-blob');
    if (blob) {
      const idx = tabOrder.indexOf(tab);
      blob.style.transform = `translateX(${idx * 100}%)`;
    }
  }

  // Layered Content Rendering
  if (tab === 'home') { renderHome(); setTimeout(scrollToSelected, 50); }
  else if (tab === 'sched') renderSchedList();
  else if (tab === 'tasks') renderTasks();
  else if (tab === 'groups') renderGroups();
  else if (tab === 'subjs') renderSubjList('subjs-list', 'sj-srch');
  else if (tab === 'profile') updateProfUI();

  // Update FAB visibility
  const fbHome = document.getElementById('fab-home');
  const fbTasks = document.getElementById('fab-tasks');
  if (fbHome) fbHome.style.display = (tab === 'home' ? 'flex' : 'none');
  if (fbTasks) fbTasks.style.display = (tab === 'tasks' ? 'flex' : 'none');
}

// Quick Actions
function openQuickActions() {
  const selDateStr = n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
  const isToday = n.toDateString() === new Date().toDateString();
  const dayName = isToday ? "Today" : n.toLocaleDateString('en-US', { weekday: 'long' });

  const isExam = examDays.some(e => e.date === selDateStr);
  const hasTests = testOverrides.some(t => t.date === selDateStr);

  const et = document.getElementById('qa-exam-title');
  const es = document.getElementById('qa-exam-sub');
  const tt = document.getElementById('qa-test-title');
  const ts = document.getElementById('qa-test-sub');

  if (isExam) {
    et.textContent = "Remove Exam Day";
    es.textContent = "Unmark " + dayName;
    document.getElementById('qa-exam-btn').onclick = () => { closeModal('m-quick-actions'); setTimeout(() => { removeExamDay(selDateStr); }, 200); };
  } else {
    et.textContent = "Exam Day";
    es.textContent = "Mark " + dayName;
    document.getElementById('qa-exam-btn').onclick = () => { closeModal('m-quick-actions'); setTimeout(() => { markExamDay(selDateStr); }, 200); };
  }

  if (hasTests) {
    tt.textContent = "Remove Class Test";
    ts.textContent = "Clear " + dayName;
    document.getElementById('qa-test-btn').onclick = () => { closeModal('m-quick-actions'); setTimeout(() => { clearTests(selDateStr); }, 200); };
  } else {
    tt.textContent = "Class Test";
    ts.textContent = "Mark " + dayName;
    document.getElementById('qa-test-btn').onclick = () => { closeModal('m-quick-actions'); setTimeout(() => openTestPicker(selDateStr), 200); };
  }

  openModal('m-quick-actions');
  lucide.createIcons({ attrs: { 'stroke-width': 2.5 } });
}

// Calendar Generator
let curSelDateStr = new Date().toDateString();
let calendarLoaded = false;
function generateCalendar() {
  const ds = document.getElementById('home-ds');
  if (!ds) return;

  const base = new Date();
  base.setDate(base.getDate() - 60);

  if (calendarLoaded) {
    // Smart Update: Only update classes and dots without clearing DOM
    const btns = ds.querySelectorAll('.db');
    btns.forEach((btn, i) => {
      const d = new Date(base); d.setDate(base.getDate() + i);
      const dIso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const isExam = examDays.some(e => e.date === dIso);
      const isTestDay = testOverrides.some(t => t.date === dIso);
      const isHol = holidays.includes(dIso);
      const isTot = d.toDateString() === new Date().toDateString();
      const dStr = d.toDateString();

      let bCls = 'db' + (isTot ? ' tod' : '');
      if (isExam) bCls += ' exam-day';
      else if (isTestDay) bCls += ' test-day';
      else if (isHol) bCls += ' holiday';
      if (curSelDateStr === dStr) bCls += ' sel';
      btn.className = bCls;

      const dotCont = btn.querySelector('.dot-row');
      if (dotCont) {
        let dots = '';
        if (isExam) dots = `<span class="cdot" style="background:var(--red)"></span>`;
        else if (isTestDay) dots = `<span class="cdot" style="background:#FF9800"></span>`;
        else if (isHol) dots = `<span class="cdot" style="background:var(--green)"></span>`;
        else dots = `<span class="cdot" style="background:var(--sub)"></span>`;
        if (dotCont.innerHTML !== dots) dotCont.innerHTML = dots;
      }
    });
    return;
  }

  ds.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 120; i++) {
    const d = new Date(base); d.setDate(base.getDate() + i);
    const dn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
    const dm = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
    const num = d.getDate();
    const isTot = d.toDateString() === new Date().toDateString();
    const dStr = d.toDateString();
    const dIso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const isExam = examDays.some(e => e.date === dIso);
    const isTestDay = testOverrides.some(t => t.date === dIso);
    const isHol = holidays.includes(dIso);



    const btn = document.createElement('div');
    let bCls = '';
    if (isExam) bCls = ' exam-day';
    else if (isTestDay) bCls = ' test-day';
    else if (isHol) bCls = ' holiday';

    btn.className = 'db' + (isTot ? ' tod' : '') + bCls;
    if (curSelDateStr === dStr) btn.classList.add('sel');

    let dots = '';
    if (isExam) dots = `<span class="cdot" style="background:var(--red)"></span>`;
    else if (isTestDay) dots = `<span class="cdot" style="background:#FF9800"></span>`;
    else if (isHol) dots = `<span class="cdot" style="background:var(--green)"></span>`;
    else dots = `<span class="cdot" style="background:var(--sub)"></span>`;

    btn.innerHTML = `<span class="dn${d.getDay() === 0 ? ' sun' : ''}">${dn}</span><span class="dd${d.getDay() === 0 ? ' sun' : ''}">${num}</span><span class="dm">${dm}</span><div class="dot-row">${dots}</div>`;
    btn.onclick = () => {
      curSelDateStr = dStr;
      document.querySelectorAll('.db').forEach(b => { b.classList.remove('sel'); });
      btn.classList.add('sel');
      n = new Date(dStr);
      updateHeader(); renderHome();
      scrollToSelected();
    };
    lp(btn, () => toggleExamDay(dIso));
    dt(btn, () => toggleHoliday(dIso));
    frag.appendChild(btn);
  }
  ds.appendChild(frag);
  calendarLoaded = true;
}

// ULTRA-SMOOTH (200FPS FEEL) SCROLL ENGINE
// HIGH-REFRESH RATE SMOOTH SCROLL (120Hz/90Hz Optimized)
function smoothScrollTo(el, target, duration = 450) {
  if (!el) return;
  const start = el.scrollLeft;
  const change = target - start;
  const startTime = performance.now();

  function animate(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Quad-Out Velocity (Snappier initial speed for high-refresh feel)
    const ease = progress * (2 - progress);

    el.scrollLeft = start + change * ease;

    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  }
  requestAnimationFrame(animate);
}

function checkTodayBtn() {
  const ds = document.getElementById('home-ds');
  const tb = document.getElementById('today-btn');
  const t = ds ? ds.querySelector('.tod') : null;
  if (!tb || !ds || !t) return;
  const idealLeft = t.offsetLeft - ds.offsetWidth / 2 + 25;
  tb.style.display = Math.abs(ds.scrollLeft - idealLeft) > 100 ? 'flex' : 'none';
}

function scrollToToday() {
  const ds = document.getElementById('home-ds');
  const t = ds ? ds.querySelector('.tod') : null;
  if (!ds || !t) return;
  smoothScrollTo(ds, t.offsetLeft - ds.offsetWidth / 2 + 25, 500);
}

function scrollToTodaySmooth() {
  setTimeout(scrollToToday, 100);
}

function scrollToSelected() {
  const ds = document.getElementById('home-ds');
  const sel = ds ? ds.querySelector('.db.sel') : null;
  if (!ds || !sel) return;
  smoothScrollTo(ds, sel.offsetLeft - ds.offsetWidth / 2 + 25, 400);
}

function getWeekNumber(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function updateHeader() {
  const hdr = document.getElementById('home-header-text');
  const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][n.getDay()];
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][n.getMonth()];
  const dateStr = dayName + ', ' + mon + ' ' + n.getDate();
  if (hdr) hdr.textContent = dateStr;
}

function changeDate(days) {
  n.setDate(n.getDate() + days);
  curSelDateStr = n.toDateString();
  updateHeader();
  generateCalendar();
  renderHome();
  scrollToSelected();
  checkTodayBtn();
}

// HOME RENDER
function renderHome() {
  const cont = document.getElementById('h-list');
  if (cont) cont.innerHTML = '';

  const q = (document.getElementById('h-srch')?.value || '').toLowerCase();
  const now = new Date();
  const todayMins = now.getHours() * 60 + now.getMinutes();
  const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][n.getDay()];
  const selDateStr = n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
  const isToday = n.toDateString() === now.toDateString();

  const examEntry = examDays.find(e => e.date === selDateStr);
  const isExamDay = !!examEntry;
  const isHoliday = holidays.includes(selDateStr);

  let dc = classes.filter(c => c.days.includes(dayName) && (!q || sn(c.sj).toLowerCase().includes(q)));
  dc.sort((a, b) => t2m(a.start) - t2m(b.start));

  document.getElementById('st-cnt').textContent = isHoliday ? 'Off' : (isExamDay ? 'Exam' : dc.length);
  document.getElementById('st-start').textContent = isHoliday ? '—' : (isExamDay && examEntry.start ? examEntry.start : (dc[0] ? dc[0].start : '—'));

  if (isExamDay && examEntry) {
    const exhtml = `<div class="card exam-card"><div class="exam-badge">EXAM</div><div class="exam-title">${examEntry.subject}</div><div class="exam-time">${examEntry.start} - ${examEntry.end}</div><div class="exam-room">${examEntry.room || 'TBA'}</div></div>`;
    cont.innerHTML += exhtml;
  }

  dc.forEach(c => {
    const objStatus = status(c);
    const startMins = t2m(c.start);
    const endMins = t2m(c.end);
    const progressPct = isToday && objStatus === 'current' ? Math.min(100, Math.max(0, ((todayMins - startMins) / (endMins - startMins)) * 100)) : 0;

    const html = `<div class="card" data-class="${c.id}">
      <div class="card-header" style="background-color: ${sc(c.sj)}dd">
        <div class="subject-name">${sn(c.sj)}</div>
        <div class="time">${c.start} - ${c.end}</div>
      </div>
      <div class="card-body">
        <div class="class-info"><strong>${c.classroom || 'TBA'}</strong></div>
        <div class="teacher-info">${c.teacher || 'Staff'}</div>
        <div class="status-badge ${objStatus}">${objStatus.toUpperCase()}</div>
      </div>
      ${isToday && objStatus === 'current' ? `<div class="live-pb" data-start="${startMins}" data-end="${endMins}" style="width: ${progressPct}%"></div>` : ''}
    </div>`;
    cont.innerHTML += html;
  });

  if (dc.length === 0 && !isExamDay && !isHoliday) {
    cont.innerHTML += '<div class="empty-state"><p>No classes</p></div>';
  }
}

// SCHEDULE LIST RENDER
function renderSchedList() {
  const cont = document.getElementById('scheds-list');
  if (cont) cont.innerHTML = '';

  // Weekly view
  const weekStart = new Date(n);
  const day = weekStart.getDay();
  weekStart.setDate(weekStart.getDate() - day);

  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
    const dayLabel = d.toDateString() === n.toDateString() ? 'Today' : d.toDateString() === new Date().toDateString() ? 'Now' : dayName;

    let dc = classes.filter(c => c.days.includes(dayName));
    dc.sort((a, b) => t2m(a.start) - t2m(b.start));

    let html = `<div class="sched-day"><div class="day-label">${dayLabel}</div>`;
    dc.forEach(c => {
      html += `<div class="sched-item" style="border-left: 4px solid ${sc(c.sj)}">
        <div class="si-time">${c.start}</div>
        <div class="si-name">${sn(c.sj)}</div>
        <div class="si-room">${c.classroom || 'TBA'}</div>
      </div>`;
    });
    html += '</div>';
    cont.innerHTML += html;
  }
}

function buildTimetable() {
  const cont = document.getElementById('timetable-container');
  if (!cont) return;
  cont.innerHTML = '';

  const hours = [];
  for (let h = 6; h <= 18; h++) hours.push(String(h).padStart(2, '0') + ':00');

  let html = '<div class="timetable-grid">';
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Header
  html += '<div class="timetable-header">';
  html += '<div class="timetable-time"></div>';
  days.forEach(d => html += `<div class="timetable-day">${d}</div>`);
  html += '</div>';

  // Rows
  hours.forEach(h => {
    html += `<div class="timetable-row"><div class="timetable-time">${h}</div>`;
    days.forEach(d => {
      const matches = classes.filter(c => c.days.includes(d) && c.start.startsWith(h.split(':')[0]));
      if (matches.length > 0) {
        const c = matches[0];
        html += `<div class="timetable-cell" style="background: ${sc(c.sj)}33; border-left: 3px solid ${sc(c.sj)}">${sn(c.sj)}</div>`;
      } else {
        html += '<div class="timetable-cell"></div>';
      }
    });
    html += '</div>';
  });
  html += '</div>';
  cont.innerHTML = html;
}

// TASKS RENDER
function renderTasks() {
  const cont = document.getElementById('tasks-list');
  if (cont) cont.innerHTML = '';

  const q = (document.getElementById('t-srch')?.value || '').toLowerCase();
  let t = tasks.filter(x => !q || x.title.toLowerCase().includes(q));
  t.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const prio = { high: 0, medium: 1, low: 2 };
    return (prio[a.priority] || 2) - (prio[b.priority] || 2);
  });

  t.forEach(task => {
    const html = `<div class="task-item ${task.done ? 'done' : ''}">
      <input type="checkbox" ${task.done ? 'checked' : ''} onchange="togT(${task.id})">
      <div class="task-content">
        <div class="task-title">${task.title}</div>
        <div class="task-date">${task.dueDate || 'No date'}</div>
      </div>
      <div class="priority-badge ${task.priority}">${task.priority}</div>
      <button class="btn-icon" onclick="deleteTask(${task.id})"><i data-lucide="trash-2"></i></button>
    </div>`;
    cont.innerHTML += html;
  });

  lucide.createIcons({ attrs: { 'stroke-width': 2.5 } });
}

// GROUPS RENDER
function renderGroups() {
  const cont = document.getElementById('groups-list');
  if (cont) cont.innerHTML = '';

  if (groups.length === 0) {
    cont.innerHTML = '<div class="empty-state"><p>No groups yet</p></div>';
    return;
  }

  groups.forEach(g => {
    const html = `<div class="group-card">
      <div class="group-header">${g.name}</div>
      <div class="group-members">${g.members.length} members</div>
    </div>`;
    cont.innerHTML += html;
  });

  lucide.createIcons({ attrs: { 'stroke-width': 2.5 } });
}

// CLASS MANAGEMENT
function openAddClass() {
  document.getElementById('i-cname').value = '';
  document.getElementById('i-start').value = '09:00';
  document.getElementById('i-end').value = '10:00';
  document.getElementById('i-room').value = '';
  document.getElementById('i-teacher').value = '';
  document.getElementById('i-days-container').querySelectorAll('input').forEach(x => x.checked = false);
  document.getElementById('i-subj').value = subjects[0]?.id || '';
  openModal('m-class');
  renderSubjList('m-subjpick', 'i-subjpick-srch');
}

function openEditClass(classId) {
  const c = classes.find(x => x.id === classId);
  if (!c) return;
  document.getElementById('i-cname').value = c.classroom || '';
  document.getElementById('i-start').value = c.start;
  document.getElementById('i-end').value = c.end;
  document.getElementById('i-room').value = c.classroom || '';
  document.getElementById('i-teacher').value = c.teacher || '';
  document.getElementById('i-subj').value = c.sj;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  days.forEach((d, i) => {
    document.getElementById('i-day-' + i).checked = c.days.includes(d);
  });
  openModal('m-class');
  document.getElementById('m-class-del-btn').style.display = 'block';
  document.getElementById('m-class-del-btn').onclick = () => { deleteClass(classId); closeModal('m-class'); };
}

function saveClass() {
  const cname = document.getElementById('i-cname').value || 'Classroom';
  const start = document.getElementById('i-start').value;
  const end = document.getElementById('i-end').value;
  const room = document.getElementById('i-room').value || '';
  const teacher = document.getElementById('i-teacher').value || '';
  const subj = document.getElementById('i-subj').value;

  const days = [];
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (let i = 0; i < 7; i++) {
    if (document.getElementById('i-day-' + i)?.checked) days.push(dayLabels[i]);
  }

  if (!start || !end || days.length === 0 || !subj) {
    showToast('Fill all fields');
    return;
  }

  if (document.getElementById('m-class-del-btn').style.display !== 'none') {
    // Edit mode - find and update
    const c = classes.find(x => x.id === parseInt(document.getElementById('m-class-id').value || 0));
    if (c) {
      c.classroom = cname; c.start = start; c.end = end; c.room = room; c.teacher = teacher; c.sj = subj; c.days = days;
    }
  } else {
    // Add mode
    classes.push({ id: Date.now(), classroom: cname, start, end, room, teacher, sj: subj, days });
  }

  saveData(); renderHome(); renderSchedList(); closeModal('m-class'); showToast('Class saved');
  document.getElementById('m-class-del-btn').style.display = 'none';
}

function deleteClass(classId) {
  classes = classes.filter(x => x.id !== classId);
  saveData(); renderHome(); renderSchedList(); showToast('Class deleted');
}

// SUBJECT MANAGEMENT
function openNewSubj() {
  document.getElementById('i-sname').value = '';
  document.getElementById('i-scolor').value = COLS[subjects.length % COLS.length];
  openModal('m-subj');
}

function openEditSubj(subjId) {
  const s = subjects.find(x => x.id === subjId);
  if (!s) return;
  document.getElementById('i-sname').value = s.name;
  document.getElementById('i-scolor').value = s.color;
  openModal('m-subj');
  document.getElementById('m-subj-del-btn').style.display = 'block';
  document.getElementById('m-subj-del-btn').onclick = () => { deleteSubject(subjId); closeModal('m-subj'); };
}

function openNewSubjInline() {
  const modal = document.getElementById('m-newsuj');
  if (modal) openModal('m-newsuj');
}

function saveNewSubj() {
  const name = document.getElementById('i-sname').value.trim();
  const color = document.getElementById('i-scolor').value;

  if (!name) { showToast('Enter subject name'); return; }

  if (document.getElementById('m-subj-del-btn').style.display !== 'none') {
    // Edit
    const s = subjects.find(x => x.id === parseInt(document.getElementById('m-subj-id').value || 0));
    if (s) { s.name = name; s.color = color; }
  } else {
    // Add
    subjects.push({ id: Date.now(), name, color });
  }

  saveData(); renderHome(); renderSchedList(); closeModal('m-subj'); showToast('Subject saved');
  document.getElementById('m-subj-del-btn').style.display = 'none';
}

function deleteSubject(subjId) {
  subjects = subjects.filter(x => x.id !== subjId);
  saveData(); renderHome(); renderSchedList(); showToast('Subject deleted');
}

function pickSubj() {
  // For subject picker modal - called from modal
  const selected = document.querySelector('.subj-pick-item.active');
  if (selected) document.getElementById('i-subj').value = selected.dataset.id;
  closeModal('m-subjpick');
}

function renderSubjList(containerId, searchId) {
  const cont = document.getElementById(containerId);
  if (cont) cont.innerHTML = '';

  const q = (document.getElementById(searchId)?.value || '').toLowerCase();
  const list = subjects.filter(s => s.name.toLowerCase().includes(q));

  list.forEach(s => {
    const html = `<div class="subj-item" data-id="${s.id}" style="background: ${s.color}33; border-left: 4px solid ${s.color}">
      <div class="subj-name">${s.name}</div>
      <button class="btn-icon" onclick="deleteSubject(${s.id})"><i data-lucide="trash-2"></i></button>
    </div>`;
    cont.innerHTML += html;
  });

  lucide.createIcons({ attrs: { 'stroke-width': 2.5 } });
}

function cycleColor(subjId) {
  const s = subjects.find(x => x.id === subjId);
  if (!s) return;
  const curIdx = COLS.indexOf(s.color);
  s.color = COLS[(curIdx + 1) % COLS.length];
  saveData();
}

// TASK MANAGEMENT
function openAddTask() {
  document.getElementById('i-ttitle').value = '';
  document.getElementById('i-tdue').value = n.toISOString().split('T')[0];
  document.getElementById('i-tprio').value = 'medium';
  openModal('m-task');
}

function saveTask() {
  const title = document.getElementById('i-ttitle').value.trim();
  const due = document.getElementById('i-tdue').value;
  const prio = document.getElementById('i-tprio').value;

  if (!title) { showToast('Enter task name'); return; }

  tasks.push({ id: Date.now(), title, dueDate: due, priority: prio, done: false });
  saveData(); renderTasks(); closeModal('m-task'); showToast('Task added');
}

function deleteTask(taskId) {
  tasks = tasks.filter(x => x.id !== taskId);
  saveData(); renderTasks(); showToast('Task deleted');
}

function togT(taskId) {
  const t = tasks.find(x => x.id === taskId);
  if (t) t.done = !t.done;
  saveData(); renderTasks();
}

// EXAM & TEST SYSTEM
function markExamDay(dateStr) {
  const name = prompt('Subject name:');
  if (!name) return;
  const start = prompt('Start time (HH:MM):', '09:00');
  const end = prompt('End time (HH:MM):', '12:00');
  const room = prompt('Room:', 'TBA');

  if (start && end) {
    examDays.push({ date: dateStr, subject: name, start, end, room: room || 'TBA' });
    saveData(); generateCalendar(); renderHome(); showToast('Exam marked');
  }
}

function toggleExamDay(dateStr) {
  const idx = examDays.findIndex(e => e.date === dateStr);
  if (idx >= 0) removeExamDay(dateStr);
  else markExamDay(dateStr);
}

function removeExamDay(dateStr) {
  examDays = examDays.filter(e => e.date !== dateStr);
  saveData(); generateCalendar(); renderHome(); showToast('Exam removed');
}

function deleteExamFromEditor(dateStr) {
  removeExamDay(dateStr);
}

function openExamEditor(dateStr) {
  const exam = examDays.find(e => e.date === dateStr);
  if (exam) {
    document.getElementById('i-exam-subj').value = exam.subject;
    document.getElementById('i-exam-start').value = exam.start;
    document.getElementById('i-exam-end').value = exam.end;
    document.getElementById('i-exam-room').value = exam.room;
    openModal('m-exam-edit');
  }
}

function saveExamDetails() {
  // Would update exam details here
  showToast('Exam updated');
  closeModal('m-exam-edit');
}

function openTestPicker(dateStr) {
  // Pick classes for that day to mark as test day
  const dayName = new Date(dateStr).toDateString().split(' ')[0];
  const dayMap = { 'Sun': 'Sun', 'Mon': 'Mon', 'Tue': 'Tue', 'Wed': 'Wed', 'Thu': 'Thu', 'Fri': 'Fri', 'Sat': 'Sat' };

  openModal('m-test-pick');
  // Populate with classes from that day
}

function updateTestName() { }
function updateTestRoom() { }

function openSingleTestEditor(testId) { }
function unmarkSingleTest(testId) { }
function handleTestLongPress() { }

function toggleTestOverride(dateStr, classId) {
  const existing = testOverrides.find(t => t.date === dateStr && t.classId === classId);
  if (existing) testOverrides = testOverrides.filter(t => !(t.date === dateStr && t.classId === classId));
  else testOverrides.push({ date: dateStr, classId, subject: '', room: '', start: '', end: '' });
  saveData(); generateCalendar(); showToast(existing ? 'Test removed' : 'Test marked');
}

function toggleHoliday(dateStr) {
  const idx = holidays.indexOf(dateStr);
  if (idx >= 0) holidays.splice(idx, 1);
  else holidays.push(dateStr);
  saveData(); generateCalendar(); renderHome(); showToast(idx >= 0 ? 'Holiday removed' : 'Holiday marked');
}

function clearTests(dateStr) {
  testOverrides = testOverrides.filter(t => t.date !== dateStr);
  saveData(); generateCalendar(); showToast('Tests cleared');
}

// CLOUD SHARING & EXPORT/IMPORT
function exportSchedule() {
  const data = { subjects, classes, tasks, holidays, examDays, testOverrides };
  const rid = 'shed-' + Math.random().toString(36).substr(2, 9).toUpperCase();
  const fn = `${rid}-MySkedul.json`;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fn;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Exported as ' + fn);
}

function restoreFromFile() {
  document.getElementById('restore-file-input').click();
}

function importSchedule() {
  const file = document.getElementById('restore-file-input').files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      subjects = data.subjects || subjects;
      classes = data.classes || classes;
      tasks = data.tasks || tasks;
      holidays = data.holidays || holidays;
      examDays = data.examDays || examDays;
      testOverrides = data.testOverrides || testOverrides;
      saveData(); renderHome(); renderSchedList(); renderTasks(); showToast('Restored');
    } catch (err) {
      showToast('Import failed');
    }
  };
  reader.readAsText(file);
}

function setSchedView(view) {
  // Switch between different schedule views
}

function getExportData() {
  return { subjects, classes, tasks, holidays, examDays, testOverrides };
}

function shareAsFile() {
  const data = getExportData();
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  if (navigator.share) {
    navigator.share({ title: 'My Schedule', files: [new File([blob], 'schedule.json', { type: 'application/json' })] });
  } else {
    const a = document.createElement('a');
    a.href = url;
    a.download = 'schedule.json';
    a.click();
    URL.revokeObjectURL(url);
  }
}

function openShareID() {
  openModal('m-share-id');
  document.getElementById('share-code').textContent = Math.random().toString(36).substr(2, 15).toUpperCase();
}

function backupToFile() {
  const data = getExportData();
  const fn = 'MySkedul-Backup-' + new Date().toISOString().split('T')[0] + '.json';
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fn;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Backed up as ' + fn);
}

function importIDDirect(code) {
  // Try importing from share code
  showToast('Code: ' + code);
}

function openImportID() {
  openModal('m-import-id');
}

function importFromID() {
  const code = document.getElementById('import-code-input').value.trim();
  if (!code) return;
  importIDDirect(code);
  closeModal('m-import-id');
}

function clearAllData() {
  if (confirm('Clear all data? This cannot be undone.')) {
    subjects = [];
    classes = [];
    tasks = [];
    holidays = [];
    examDays = [];
    testOverrides = [];
    saveData();
    location.reload();
  }
}

// NOTIFICATIONS
async function scheduleAllNotifications() {
  if (!notifSettings.enabled) return;
  if (!window.Capacitor || !Capacitor.isNativePlatform()) return;

  try {
    // Clear old notifications
    await Capacitor.Plugins.LocalNotifications.cancel({ notifications: [] });

    // Schedule for next 14 days
    const notifs = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
      const classes_today = classes.filter(c => c.days.includes(dayName));

      classes_today.forEach((c, idx) => {
        if (notifSettings.classRemind) {
          const [h, m] = c.start.split(':');
          const mins = parseInt(h) * 60 + parseInt(m) - notifSettings.leadMins;
          notifs.push({
            id: Date.now() + idx,
            title: sn(c.sj),
            body: `Class at ${c.start}`,
            schedule: { at: new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(mins / 60), mins % 60) }
          });
        }
      });
    }

    if (notifs.length > 0) {
      await Capacitor.Plugins.LocalNotifications.schedule({ notifications: notifs });
    }
  } catch (e) {
    console.warn('Notifications schedule failed', e);
  }
}

function openNotifSettings() {
  document.getElementById('notif-enabled').checked = notifSettings.enabled;
  document.getElementById('notif-class').checked = notifSettings.classRemind;
  document.getElementById('notif-test').checked = notifSettings.testRemind;
  document.getElementById('notif-exam').checked = notifSettings.examRemind;
  document.getElementById('notif-lead').value = notifSettings.leadMins;
  openModal('m-notif');
}

function saveNotifSettings() {
  notifSettings.enabled = document.getElementById('notif-enabled').checked;
  notifSettings.classRemind = document.getElementById('notif-class').checked;
  notifSettings.testRemind = document.getElementById('notif-test').checked;
  notifSettings.examRemind = document.getElementById('notif-exam').checked;
  notifSettings.leadMins = parseInt(document.getElementById('notif-lead').value) || 15;
  saveData();
  closeModal('m-notif');
  showToast('Notifications updated');
}

function testNotification() {
  showToast('Test notification sent!');
  if (window.Capacitor && Capacitor.isNativePlatform()) {
    setTimeout(() => {
      Capacitor.Plugins.LocalNotifications.schedule({
        notifications: [{
          id: 9999,
          title: 'MySkedul Test',
          body: 'This is a test notification',
          schedule: { in: { value: 2, unit: 'second' } }
        }]
      }).catch(e => console.log('Test notif error', e));
    }, 2000);
  }
}

function cancelAllNotifications() {
  if (window.Capacitor && Capacitor.isNativePlatform()) {
    Capacitor.Plugins.LocalNotifications.cancel({ notifications: [] }).then(() => showToast('Notifications cleared')).catch(console.log);
  }
}

// PROFILE & SETTINGS
let globalUserName = 'Anshul Yadav', globalUserEmail = 'ronakyadavyt@gmail.com';

function updateProfUI() {
  if (!globalUserName) globalUserName = 'Student';
  const char = (globalUserName && globalUserName.length > 0) ? globalUserName[0].toUpperCase() : 'S';
  document.getElementById('p-av').textContent = char;
  document.getElementById('h-av').textContent = char;
  document.getElementById('h-uname').textContent = globalUserName;
  document.getElementById('p-name').textContent = globalUserName;
  document.getElementById('p-email').textContent = globalUserEmail;
  const ver = 'v1.2.0';
  const about = document.getElementById('about-text');
  if (about) about.innerHTML = `MySkedul ${ver}<br>Smart Timetable Manager`;
}

function openEditProfile() {
  document.getElementById('i-pn').value = globalUserName;
  document.getElementById('i-pe').value = globalUserEmail;
  openModal('m-profile');
}

function saveProfile() {
  globalUserName = document.getElementById('i-pn').value || 'Student';
  globalUserEmail = document.getElementById('i-pe').value;
  updateProfUI();
  saveData();
  closeModal('m-profile');
  showToast('Profile saved');
}

// THEME & PREFERENCES
function toggleDarkMode() {
  const modes = ['system', 'light', 'dark'];
  let cur = localStorage.getItem('MySkedul_theme') || 'system';
  let next = modes[(modes.indexOf(cur) + 1) % modes.length];
  localStorage.setItem('MySkedul_theme', next);
  applyTheme(next);
  haptic('light');
}

function applyTheme(mode) {
  const html = document.documentElement;
  const el = document.body;
  const lbl = document.getElementById('theme-lbl');
  const tog = document.getElementById('dk-tog');

  html.classList.add('theme-transitioning');

  el.removeAttribute('data-theme');
  if (tog) tog.classList.remove('on');
  if (lbl) lbl.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);

  if (mode === 'dark') {
    el.setAttribute('data-theme', 'dark');
    if (tog) tog.classList.add('on');
  } else if (mode === 'light') {
    el.setAttribute('data-theme', 'light');
  } else if (mode === 'system') {
    const sysDk = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (sysDk) { if (el) el.setAttribute('data-theme', 'dark'); if (tog) tog.classList.add('on'); }
  }

  setTimeout(() => syncStatusBar(), 50);
  setTimeout(() => html.classList.remove('theme-transitioning'), 500);
}

function toggleSet(el, id) {
  el.querySelector('.toggle').classList.toggle('on');
}

// SOCIAL & COMMUNITY
function openTelegram() {
  window.open('https://t.me/your_telegram_channel', '_blank');
}

function shareApp() {
  const text = 'MySkedul - Smart Timetable Manager for Students';
  if (navigator.share) {
    navigator.share({ title: 'MySkedul', text });
  } else {
    alert(text);
  }
}

// MODAL & UTILITY FUNCTIONS
let skipNextPopstate = false;
let exitTap = false;

function uMS() {
  requestAnimationFrame(() => {
    document.body.classList.toggle('modal-open', document.querySelectorAll('.mo.active').length > 0);
  });
}

function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('active');
  uMS();
  lucide.createIcons({ attrs: { 'stroke-width': 2.5 } });
  history.pushState({ modal: id }, '');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (!el || !el.classList.contains('active')) return;
  el.classList.remove('active');
  uMS();
  if (history.state && history.state.modal === id) {
    skipNextPopstate = true;
    history.back();
  }
}

function closeTopmostModal() {
  const open = [...document.querySelectorAll('.mo.active')];
  if (open.length > 0) {
    const top = open[open.length - 1];
    top.classList.remove('active');
    uMS();
    return true;
  }
  return false;
}

window.addEventListener('popstate', (e) => {
  if (skipNextPopstate) {
    skipNextPopstate = false;
    return;
  }

  if (closeTopmostModal()) return;

  const activePage = document.querySelector('.page.active');
  if (activePage && activePage.id !== 'pg-home') {
    switchNav('home');
    history.pushState({ page: 'home' }, '');
    return;
  }

  if (!exitTap) {
    exitTap = true;
    showToast("Tap again to exit");
    history.pushState({ page: 'home' }, '');
    setTimeout(() => exitTap = false, 2000);
    return;
  }
});

history.replaceState({ page: 'home' }, '');

let tt;
function showToast(m) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = m;
  t.classList.add('show');
  clearTimeout(tt);
  tt = setTimeout(() => t.classList.remove('show'), 2000);
}

// BOOT SEQUENCE & INITIALIZATION
window.addEventListener('load', async () => {
  if (location.protocol === 'file:' && !window.Capacitor) {
    console.warn("MySkedul: Running via file://. Cloud features may be blocked.");
  }

  syncStatusBar();

  requestAnimationFrame(() => {
    const homeTab = document.getElementById('bnav-home');
    if (homeTab) updateBlobPosition(homeTab);
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const stored = localStorage.getItem('MySkedul_theme') || 'system';
    if (stored === 'system') applyTheme('system');
  });

  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => {
      const activeTab = document.querySelector('.nb.active');
      if (activeTab) updateBlobPosition(activeTab);
    });
    const nav = document.getElementById('bnav-main');
    if (nav) ro.observe(nav);
  }

  setInterval(() => {
    todayMins = new Date().getHours() * 60 + new Date().getMinutes();
    document.querySelectorAll('.live-pb').forEach(pb => {
      const start = parseInt(pb.dataset.start), end = parseInt(pb.dataset.end);
      const pct = Math.min(100, Math.max(0, ((todayMins - start) / (end - start)) * 100));
      pb.style.width = pct + '%';
    });
  }, 30000);
});
  if (Math.abs(ds.scrollLeft - idealLeft) > 30 || curSelDateStr !== new Date().toDateString()) {
    tb.classList.remove('hidden');
  } else {
    tb.classList.add('hidden');
  }
}

function scrollToToday(smooth = true) {
  curSelDateStr = new Date().toDateString();
  n = new Date();
  // Start scrolling IMMEDIATELY for zero-latency feel
  if (smooth) scrollToTodaySmooth();

  // Defer rendering slightly to prioritize scroll animation frames
  setTimeout(() => {
    updateHeader();
    generateCalendar();
    renderHome();
  }, 80);
}

function scrollToTodaySmooth() {
  const ds = document.getElementById('home-ds');
  const t = ds ? ds.querySelector('.tod') : null;
  if (t && ds) {
    smoothScrollTo(ds, t.offsetLeft - ds.offsetWidth / 2 + 33, 120); // Faster snap (120ms)
  } else {
    const sel = ds.querySelector('.ds-d.sel');
    if (sel) smoothScrollTo(ds, sel.offsetLeft - ds.offsetWidth / 2 + 33, 120); // Faster snap (120ms)
  }
}


function scrollToSelected() {
  const ds = document.getElementById('home-ds');
  const sel = ds ? (ds.querySelector('.sel') || ds.querySelector('.tod')) : null;
  if (sel && ds) {
    smoothScrollTo(ds, sel.offsetLeft - ds.offsetWidth / 2 + 33, 200);
  }
}

function getWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

function updateHeader() {
  document.getElementById('h-day').textContent = n.toLocaleDateString('en-US', { weekday: 'long' });
  document.getElementById('h-date').textContent = n.getDate() + ' ' + n.toLocaleDateString('en-US', { month: 'long' });
  const mlbl = document.getElementById('h-month-lbl');
  if (mlbl) { mlbl.textContent = n.toLocaleDateString('en-US', { month: 'long' }) + ' ' + n.getFullYear(); }
  const wlbl = document.getElementById('h-week-lbl');
  if (wlbl) { wlbl.textContent = 'Week ' + getWeekNumber(n); }
  checkTodayBtn();
}

let navLock = false;
function changeDate(days) {
  if (navLock) return;
  navLock = true;
  setTimeout(() => { navLock = false; }, 400); // 400ms lock for smoothness

  n.setDate(n.getDate() + days);
  curSelDateStr = n.toDateString();
  const list = document.getElementById('h-list');
  if (list) {
    const dist = 50; // Stable distance
    list.style.setProperty('--slide-dx', (days > 0 ? dist : -dist) + 'px');
    list.style.animation = 'none';
    list.offsetHeight;
    // Super smooth cubic-bezier for a native fluid feel
    const dur = 0.45;
    const ease = 'cubic-bezier(0.16, 1, 0.3, 1)';
    list.style.animation = days > 0 ? `slideInRight ${dur}s ${ease}` : `slideInLeft ${dur}s ${ease}`;
  }
  updateHeader();
  renderHome();
  generateCalendar();
  scrollToSelected();
}
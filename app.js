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
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
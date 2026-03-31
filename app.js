/* MySkedul — app.js | Part 1: Constants, Init & Performance Engine */

'use strict';

// subject color palette
const COLS = ['#0084FF', '#00D97E', '#FF3B30', '#9F5DFF', '#FF9F0A', '#FF375F', '#00D1FF', '#FFD60A'];

// app state
let subjects     = [];
let classes      = [];
let tasks        = [];
let holidays     = [];
let groups       = [];
let examDays     = [];
let testOverrides = [];
let globalUserName  = 'Anshul Yadav';
let globalUserEmail = 'ianshulyadav@gmail.com';

let notifSettings = {
  enabled:      true,
  classRemind:  true,
  testRemind:   true,
  examRemind:   true,
  taskRemind:   true,
  leadMins:     15
};

// ---- Performance Engine ----
// detects device tier and applies the right CSS class
// also listens to battery so it can drop to efficiency mode on low charge
async function updatePerformanceTier() {
  const mem   = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;

  let isEfficiency = mem <= 2 || cores <= 2 || /Android (4|5|6|7|8)/i.test(navigator.userAgent);
  let isUltra      = mem >= 8 && cores >= 8;

  try {
    if (navigator.getBattery) {
      const battery = await navigator.getBattery();
      if (battery.level <= 0.20 && !battery.charging) {
        isEfficiency = true;
        isUltra      = false;
      }
      battery.addEventListener('levelchange',   updatePerformanceTier);
      battery.addEventListener('chargingchange', updatePerformanceTier);
    }
  } catch (e) {}

  document.body.classList.remove('low-end', 'ultra-mode');
  if (isEfficiency) document.body.classList.add('low-end');
  else if (isUltra) document.body.classList.add('ultra-mode');

  document.documentElement.style.colorScheme = 'light dark';
}
updatePerformanceTier();

// ---- Icon Init ----
lucide.createIcons({ attrs: { 'stroke-width': 2.5 } });

// ---- Scroll Header Effect ----
// adds .scrolled-header when user scrolls down so topbar gets a glass bg
document.addEventListener('scroll', e => {
  if (e.target.classList && e.target.classList.contains('scroll')) {
    const top    = e.target.scrollTop;
    const page   = e.target.parentElement;
    const header = page.querySelector('.topbar') || page.querySelector('.home-header');
    if (header) {
      if (top > 12) header.classList.add('scrolled-header');
      else           header.classList.remove('scrolled-header');
    }
  }
}, true);

// ---- Helpers ----
const sn = id => { const s = subjects.find(x => x.id === id); return s ? s.name  : 'Unknown'; };
const sc = id => { const s = subjects.find(x => x.id === id); return s ? s.color : '#0D0D0D'; };
const t2m = t  => { const [h, m] = t.split(':'); return parseInt(h) * 60 + parseInt(m); };

function status(c) {
  const now  = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const s = t2m(c.start), e = t2m(c.end);
  if (mins >= s && mins < e) return 'current';
  if (mins >= e)             return 'past';
  return 'upcoming';
}

// ---- Toast ----
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
}

// ---- Onboarding ----
function finishOnboarding() {
  const n = document.getElementById('ob-name').value.trim()  || 'Student';
  const e = document.getElementById('ob-email').value.trim() || '';
  globalUserName  = n;
  globalUserEmail = e;
  updateProfUI();
  saveData();
  localStorage.setItem('MySkedul_onboarded', '1');
  closeModal('m-onboarding');
  showToast('Welcome, ' + globalUserName + '!');
}

// ---- App Entry ----
window.onload = async () => {
  await loadData();
  generateCalendar();
  renderHome();
  scrollToToday();
  updateProfUI();
  applyTheme(localStorage.getItem('MySkedul_theme') || 'system');

  const ds = document.getElementById('home-ds');
  if (ds) ds.addEventListener('scroll', checkTodayBtn);

  const pgHome = document.getElementById('pg-home');
  if (pgHome) sw(pgHome, dir => changeDate(dir));

  // push initial history state so back gesture hits our handler first
  history.replaceState({ page: 'home' }, '');

  setTimeout(() => {
    const loader = document.getElementById('loading-screen');
    if (loader) {
      loader.style.opacity = '0';
      setTimeout(() => {
        loader.remove();
        if (!localStorage.getItem('MySkedul_onboarded')) openModal('m-onboarding');
      }, 600);
    }
  }, 1200);
};

// save on tab hide / close
document.addEventListener('visibilitychange', () => { if (document.hidden) saveData(); });
window.addEventListener('beforeunload', saveData);
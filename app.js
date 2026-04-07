/* ============================================================
   MySkedul — app.js
   Day 1: Core Data Model, localStorage Persistence,
          Navigation Controller, Utility Helpers, Toast
   ============================================================ */

/* ---------- Colour Palette ---------- */
const COLS = [
  '#3B82F6','#22C55E','#EF4444','#8B5CF6',
  '#F97316','#EC4899','#14B8A6','#FFC107'
];

/* ---------- App State ---------- */
let subjects = [
  { id: 1, name: 'Mathematics',      color: '#3B82F6' },
  { id: 2, name: 'Physics',          color: '#22C55E' },
  { id: 3, name: 'English Lit',      color: '#EC4899' },
  { id: 4, name: 'Computer Science', color: '#8B5CF6' }
];

let classes = [
  { id: 1, sj: 1, room: 'Room 101',    teacher: 'Mr. Smith',  start: '08:00', end: '09:30', days: ['Mon','Wed'] },
  { id: 2, sj: 2, room: 'Lab 3',       teacher: 'Dr. Brown',  start: '10:00', end: '11:30', days: ['Thu'] },
  { id: 3, sj: 3, room: '2F',          teacher: 'Mrs. White', start: '19:00', end: '19:09', days: ['Fri'] },
  { id: 4, sj: 4, room: 'Computer Lab',teacher: 'Prof. Davis',start: '14:00', end: '15:30', days: ['Tue','Fri'] }
];

let tasks         = [];
let holidays      = [];
let examDays      = [];   // [{ date, subject, start, end, room }]
let testOverrides = [];   // [{ date, classId, name, room }]
let groups = [
  { id: 1, name: 'CS-2024 Batch A',  mem: ['You','Arjun','Priya'], lmsg: 'Project submission deadline extended.', av: '💻' },
  { id: 2, name: 'Math Study Group', mem: ['You','Ankit'],         lmsg: 'Sharing notes for Chapter 5.', av: '📐' }
];

let pName  = 'Student';
let pEmail = '';

/* ---------- Persistence ---------- */
const STORAGE_KEY = 'myskedul_data';

function saveData() {
  const payload = { subjects, classes, tasks, holidays, examDays, testOverrides, pName, pEmail };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const d = JSON.parse(raw);
    if (d.subjects)      subjects      = d.subjects;
    if (d.classes)       classes       = d.classes;
    if (d.tasks)         tasks         = d.tasks;
    if (d.holidays)      holidays      = d.holidays;
    if (d.examDays)      examDays      = d.examDays;
    if (d.testOverrides) testOverrides = d.testOverrides;
    if (d.pName)         pName         = d.pName;
    if (d.pEmail)        pEmail        = d.pEmail;
  } catch (e) {
    console.warn('MySkedul: failed to parse saved data', e);
  }
}

/* ---------- Subject Helpers ---------- */
const sn = id => { const s = subjects.find(x => x.id === id); return s ? s.name : 'Unknown'; };
const sc = id => { const s = subjects.find(x => x.id === id); return s ? s.color : '#0D0D0D'; };

/* ---------- Time Helpers ---------- */
let n = new Date();
let todayMins = n.getHours() * 60 + n.getMinutes();

function t2m(t) {
  const [h, m] = t.split(':');
  return parseInt(h) * 60 + parseInt(m);
}

function status(c) {
  const s = t2m(c.start), e = t2m(c.end);
  if (todayMins >= s && todayMins < e) return 'current';
  if (todayMins >= e) return 'past';
  return 'upcoming';
}

/* ---------- Navigation ---------- */
function switchNav(tab) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nb').forEach(b => b && b.classList.remove('active'));

  const pageId = tab === 'sched' ? 'pg-scheds' : 'pg-' + tab;
  const page = document.getElementById(pageId);
  if (page) page.classList.add('active');

  const navBtn = document.getElementById('bnav-' + tab);
  if (navBtn) navBtn.classList.add('active');

  if (tab === 'home')   renderHome();
  if (tab === 'sched')  renderSchedList();
  if (tab === 'tasks')  renderTasks();
  if (tab === 'groups') renderGroups();
  if (tab === 'subjs')  renderSubjList('subjs-list', 'sj-srch');
}

/* ---------- Toast ---------- */
let _toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
}

/* ---------- Modal Helpers (with Android back-gesture support) ---------- */
function openModal(id) {
  document.getElementById(id).classList.add('open');
  history.pushState({ modal: id }, '');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (!el || !el.classList.contains('open')) return;
  el.classList.remove('open');
  if (history.state && history.state.modal === id) history.back();
}

function closeTopmostModal() {
  const open = [...document.querySelectorAll('.mo.open')];
  if (open.length > 0) {
    open[open.length - 1].classList.remove('open');
    return true;
  }
  return false;
}

window.addEventListener('popstate', () => {
  if (closeTopmostModal()) return;
  const active = document.querySelector('.page.active');
  if (active && active.id !== 'pg-home') {
    switchNav('home');
    history.pushState({ page: 'home' }, '');
  }
});

history.replaceState({ page: 'home' }, '');

/* ---------- Long-press & Double-tap ---------- */
function lp(el, cb) {
  let t;
  const start = () => {
    t = setTimeout(() => {
      if ('vibrate' in navigator) navigator.vibrate(40);
      el.classList.add('lp-active');
      cb();
      setTimeout(() => el.classList.remove('lp-active'), 200);
      t = null;
    }, 600);
  };
  const cancel = () => { clearTimeout(t); t = null; el.classList.remove('lp-active'); };
  el.addEventListener('mousedown', start);
  el.addEventListener('touchstart', e => { if (e.cancelable) start(e); }, { passive: true });
  el.addEventListener('mouseup',    cancel);
  el.addEventListener('mouseleave', cancel);
  el.addEventListener('touchend',   cancel);
  el.addEventListener('contextmenu', e => e.preventDefault());
}

function dt(el, cb) {
  let last = 0;
  el.addEventListener('click', () => {
    const now = Date.now();
    if (now - last < 300) { cb(); last = 0; } else last = now;
  });
}

/* ---------- Boot ---------- */
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  // Dark mode restore
  if (localStorage.getItem('dk') === '1') {
    document.documentElement.setAttribute('data-theme', 'dark');
    const tog = document.getElementById('dk-tog');
    if (tog) tog.classList.add('on');
  }
  lucide.createIcons();
  renderHome();
  updateProfUI();
});
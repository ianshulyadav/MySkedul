/**
 * MySkedul — data-layer.js
 * ============================================================
 * Single-file offline backend. Drop into your project and add:
 *   <script src="data-layer.js"></script>
 *
 * Exposes: window.DB (DataStore facade) + window.genId
 * ============================================================
 */

// ═══════════════════════════════════════════════════════════
// SECTION 1 — DB (Singleton IndexedDB connection)
// ═══════════════════════════════════════════════════════════

const DB_NAME    = 'MySkedul_Storage_Prod';
const DB_VERSION = 4;
const STORES     = ['subjects', 'classes', 'tasks', 'meta', 'calendar'];

let _db      = null;
let _opening = null;

function getDB() {
  if (_db) return Promise.resolve(_db);
  if (_opening) return _opening;

  _opening = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      STORES.forEach(name => {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      });
    };

    req.onsuccess = (e) => {
      _db = e.target.result;
      _db.onversionchange = () => { _db.close(); _db = null; _opening = null; };
      _opening = null;
      resolve(_db);
    };

    req.onerror = (e) => {
      _opening = null;
      console.error('[MySkedul DB] open failed', e.target.error);
      reject(e.target.error);
    };

    req.onblocked = () => console.warn('[MySkedul DB] open blocked');
  });

  return _opening;
}

function dbGet(store, key) {
  return getDB().then(db => new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror   = () => reject(req.error);
  }));
}

function dbPut(store, key, value) {
  return getDB().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
    tx.onerror    = () => reject(tx.error);
  }));
}

function dbBatchPut(ops) {
  return getDB().then(db => new Promise((resolve, reject) => {
    const storeNames = [...new Set(ops.map(o => o.store))];
    const tx = db.transaction(storeNames, 'readwrite');
    ops.forEach(({ store, key, value }) => tx.objectStore(store).put(value, key));
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
    tx.onabort    = () => reject(new Error('Transaction aborted'));
  }));
}

// ═══════════════════════════════════════════════════════════
// SECTION 2 — Models (Validation)
// ═══════════════════════════════════════════════════════════

class ValidationError extends Error {
  constructor(msg) { super(msg); this.name = 'ValidationError'; }
}

function requireString(val, field, maxLen = 200) {
  if (typeof val !== 'string' || !val.trim()) throw new ValidationError(`${field} required`);
  if (val.length > maxLen) throw new ValidationError(`${field} too long (max ${maxLen})`);
  return val.trim();
}

function optionalString(val, field, maxLen = 200) {
  if (val === undefined || val === null || val === '') return '';
  if (typeof val !== 'string') throw new ValidationError(`${field} must be string`);
  if (val.length > maxLen) throw new ValidationError(`${field} too long`);
  return val.trim();
}

function requireId(val) {
  if (typeof val !== 'number' || !Number.isFinite(val) || val <= 0)
    throw new ValidationError('id must be positive finite number');
  return val;
}

const TIME_RE  = /^\d{2}:\d{2}$/;
const DATE_RE  = /^\d{4}-\d{2}-\d{2}$/;
const DAY_SET  = new Set(['Mon','Tue','Wed','Thu','Fri','Sat','Sun']);
const PRIO_SET = new Set(['high','med','low']);

function requireTime(val, field) {
  if (!TIME_RE.test(val)) throw new ValidationError(`${field} must be HH:MM`);
  return val;
}
function optionalTime(val) { return (val && TIME_RE.test(val)) ? val : ''; }
function optionalDate(val) { return (val && DATE_RE.test(val)) ? val : ''; }
function requireDate(val, field) {
  if (!DATE_RE.test(val)) throw new ValidationError(`${field} must be YYYY-MM-DD`);
  return val;
}

class Subject {
  constructor(d) {
    this.id    = requireId(d.id);
    this.name  = requireString(d.name, 'Subject name', 100);
    this.color = optionalString(d.color, 'color', 20) || '#6C63FF';
  }
  toJSON() { return { id: this.id, name: this.name, color: this.color }; }
  static fromJSON(r)     { return new Subject(r); }
  static safeFromJSON(r) { try { return Subject.fromJSON(r); } catch { return null; } }
}

class ScheduleClass {
  constructor(d) {
    this.id      = requireId(d.id);
    this.sj      = requireId(d.sj);
    this.start   = requireTime(d.start, 'start');
    this.end     = requireTime(d.end,   'end');
    this.room    = optionalString(d.room,    'room',    100);
    this.teacher = optionalString(d.teacher, 'teacher', 100);
    this.days    = this._validateDays(d.days);
    const [sh, sm] = this.start.split(':').map(Number);
    const [eh, em] = this.end.split(':').map(Number);
    if (sh * 60 + sm >= eh * 60 + em) throw new ValidationError('start must be before end');
  }
  _validateDays(days) {
    if (!Array.isArray(days) || days.length === 0) throw new ValidationError('days must be non-empty array');
    days.forEach(d => { if (!DAY_SET.has(d)) throw new ValidationError(`invalid day: ${d}`); });
    return [...new Set(days)];
  }
  toJSON() { return { id: this.id, sj: this.sj, start: this.start, end: this.end, room: this.room, teacher: this.teacher, days: this.days }; }
  static fromJSON(r)     { return new ScheduleClass(r); }
  static safeFromJSON(r) { try { return ScheduleClass.fromJSON(r); } catch { return null; } }
}

class Task {
  constructor(d) {
    this.id      = requireId(d.id);
    this.name    = requireString(d.name, 'Task name', 200);
    this.subj    = optionalString(d.subj, 'subj', 100);
    this.prio    = PRIO_SET.has(d.prio) ? d.prio : 'med';
    this.dueDate = optionalDate(d.dueDate);
    this.dueTime = optionalTime(d.dueTime);
    this.done    = !!d.done;
  }
  toJSON() { return { id: this.id, name: this.name, subj: this.subj, prio: this.prio, dueDate: this.dueDate, dueTime: this.dueTime, done: this.done }; }
  static fromJSON(r)     { return new Task(r); }
  static safeFromJSON(r) { try { return Task.fromJSON(r); } catch { return null; } }
}

class ExamDay {
  constructor(d) {
    this.date    = requireDate(d.date, 'date');
    this.subject = optionalString(d.subject, 'subject', 100);
    this.start   = optionalTime(d.start);
    this.end     = optionalTime(d.end);
    this.room    = optionalString(d.room, 'room', 100);
  }
  toJSON() { return { date: this.date, subject: this.subject, start: this.start, end: this.end, room: this.room }; }
  static fromJSON(r)     { return new ExamDay(r); }
  static safeFromJSON(r) { try { return ExamDay.fromJSON(r); } catch { return null; } }
}

class TestOverride {
  constructor(d) {
    this.date    = requireDate(d.date, 'date');
    this.classId = requireId(d.classId);
    this.name    = optionalString(d.name, 'name', 100);
    this.room    = optionalString(d.room, 'room', 100);
  }
  toJSON() { return { date: this.date, classId: this.classId, name: this.name, room: this.room }; }
  static fromJSON(r)     { return new TestOverride(r); }
  static safeFromJSON(r) { try { return TestOverride.fromJSON(r); } catch { return null; } }
}

class UserMeta {
  constructor(d = {}) {
    this.globalUserName  = optionalString(d.globalUserName || d.pName,  'name',  100) || 'Student';
    this.globalUserEmail = optionalString(d.globalUserEmail || d.pEmail, 'email', 200);
    this.ts = typeof d.ts === 'number' ? d.ts : Date.now();
  }
  toJSON() { return { globalUserName: this.globalUserName, globalUserEmail: this.globalUserEmail, ts: this.ts }; }
  static fromJSON(r) { return new UserMeta(r || {}); }
}

class NotifSettings {
  constructor(d = {}) {
    this.enabled     = d.enabled     !== false;
    this.classRemind = d.classRemind !== false;
    this.testRemind  = d.testRemind  !== false;
    this.examRemind  = d.examRemind  !== false;
    this.taskRemind  = d.taskRemind  !== false;
    this.leadMins    = Number.isFinite(d.leadMins) && d.leadMins > 0 ? d.leadMins : 15;
  }
  toJSON() { return { enabled: this.enabled, classRemind: this.classRemind, testRemind: this.testRemind, examRemind: this.examRemind, taskRemind: this.taskRemind, leadMins: this.leadMins }; }
  static fromJSON(r) { return new NotifSettings(r || {}); }
}

function genId() { return Date.now() * 1000 + Math.floor(Math.random() * 1000); }

// ═══════════════════════════════════════════════════════════
// SECTION 3 — Repositories (CRUD per entity)
// ═══════════════════════════════════════════════════════════

class ListRepo {
  constructor(store, key, Model) {
    this._store = store; this._key = key; this._Model = Model;
  }

  async _readRaw() {
    try { const r = await dbGet(this._store, this._key); return Array.isArray(r) ? r : []; }
    catch (e) { console.error(`[Repo ${this._key}] read failed`, e); return []; }
  }

  async getAll() {
    const raw   = await this._readRaw();
    const items = raw.map(r => this._Model.safeFromJSON(r)).filter(Boolean);
    if (items.length !== raw.length)
      console.warn(`[Repo ${this._key}] ${raw.length - items.length} corrupt records dropped`);
    return items;
  }

  async _writeAll(items) {
    try { await dbPut(this._store, this._key, items.map(i => i.toJSON())); }
    catch (e) {
      if (e.name === 'QuotaExceededError') throw new Error('Storage full. Please clear old data.');
      throw e;
    }
  }

  async getById(id) { return (await this.getAll()).find(x => x.id === id) || null; }
}

class SubjectRepo extends ListRepo {
  constructor() { super('subjects', 'list', Subject); }

  async create(data) {
    const all  = await this.getAll();
    const subj = new Subject(data);
    if (all.some(s => s.name.toLowerCase() === subj.name.toLowerCase()))
      throw new ValidationError(`Subject "${subj.name}" already exists`);
    all.push(subj);
    await this._writeAll(all);
    return subj;
  }

  async update(id, patch) {
    const all = await this.getAll();
    const idx = all.findIndex(s => s.id === id);
    if (idx === -1) throw new Error('Subject not found');
    const merged = new Subject({ ...all[idx].toJSON(), ...patch, id });
    all[idx] = merged;
    await this._writeAll(all);
    return merged;
  }

  async delete(id) {
    const all = await this.getAll();
    if (!all.some(s => s.id === id)) throw new Error('Subject not found');
    await this._writeAll(all.filter(s => s.id !== id));
  }
}

class ClassRepo extends ListRepo {
  constructor() { super('classes', 'list', ScheduleClass); }

  async create(data) {
    const cls = new ScheduleClass(data);
    const all = await this.getAll();
    all.push(cls);
    await this._writeAll(all);
    return cls;
  }

  async update(id, patch) {
    const all = await this.getAll();
    const idx = all.findIndex(c => c.id === id);
    if (idx === -1) throw new Error('Class not found');
    const merged = new ScheduleClass({ ...all[idx].toJSON(), ...patch, id });
    all[idx] = merged;
    await this._writeAll(all);
    return merged;
  }

  async delete(id) {
    const all = await this.getAll();
    if (!all.some(c => c.id === id)) throw new Error('Class not found');
    await this._writeAll(all.filter(c => c.id !== id));
  }

  async deleteBySubject(subjectId) {
    const all = await this.getAll();
    await this._writeAll(all.filter(c => c.sj !== subjectId));
  }

  async getByDay(dayName) {
    return (await this.getAll()).filter(c => c.days.includes(dayName));
  }
}

class TaskRepo extends ListRepo {
  constructor() { super('tasks', 'list', Task); }

  async create(data) {
    const task = new Task(data);
    const all  = await this.getAll();
    all.push(task);
    await this._writeAll(all);
    return task;
  }

  async update(id, patch) {
    const all = await this.getAll();
    const idx = all.findIndex(t => t.id === id);
    if (idx === -1) throw new Error('Task not found');
    const merged = new Task({ ...all[idx].toJSON(), ...patch, id });
    all[idx] = merged;
    await this._writeAll(all);
    return merged;
  }

  async toggleDone(id) {
    const all = await this.getAll();
    const idx = all.findIndex(t => t.id === id);
    if (idx === -1) throw new Error('Task not found');
    all[idx] = new Task({ ...all[idx].toJSON(), done: !all[idx].done });
    await this._writeAll(all);
    return all[idx];
  }

  async delete(id) {
    const all = await this.getAll();
    if (!all.some(t => t.id === id)) throw new Error('Task not found');
    await this._writeAll(all.filter(t => t.id !== id));
  }
}

class CalendarRepo {
  async _readAll() {
    try { return (await dbGet('calendar', 'data')) || {}; } catch { return {}; }
  }
  async _writeAll(cal) { await dbPut('calendar', 'data', cal); }

  async getHolidays() {
    const cal = await this._readAll();
    return (Array.isArray(cal.holidays) ? cal.holidays : []).filter(d => DATE_RE.test(d));
  }
  async addHoliday(date) {
    const cal = await this._readAll();
    const h   = Array.isArray(cal.holidays) ? cal.holidays : [];
    if (!h.includes(date)) h.push(date);
    await this._writeAll({ ...cal, holidays: h });
  }
  async removeHoliday(date) {
    const cal = await this._readAll();
    await this._writeAll({ ...cal, holidays: (cal.holidays || []).filter(d => d !== date) });
  }
  async toggleHoliday(date) {
    const h = await this.getHolidays();
    if (h.includes(date)) await this.removeHoliday(date);
    else await this.addHoliday(date);
  }

  async getExamDays() {
    const cal = await this._readAll();
    return (Array.isArray(cal.examDays) ? cal.examDays : []).map(r => ExamDay.safeFromJSON(r)).filter(Boolean);
  }
  async upsertExamDay(data) {
    const ed  = new ExamDay(data);
    const cal = await this._readAll();
    const arr = Array.isArray(cal.examDays) ? cal.examDays : [];
    const idx = arr.findIndex(e => e.date === ed.date);
    if (idx >= 0) arr[idx] = ed.toJSON(); else arr.push(ed.toJSON());
    await this._writeAll({ ...cal, examDays: arr });
    return ed;
  }
  async removeExamDay(date) {
    const cal = await this._readAll();
    await this._writeAll({ ...cal, examDays: (cal.examDays || []).filter(e => e.date !== date) });
  }

  async getTestOverrides() {
    const cal = await this._readAll();
    return (Array.isArray(cal.testOverrides) ? cal.testOverrides : []).map(r => TestOverride.safeFromJSON(r)).filter(Boolean);
  }
  async upsertTestOverride(data) {
    const to  = new TestOverride(data);
    const cal = await this._readAll();
    const arr = Array.isArray(cal.testOverrides) ? cal.testOverrides : [];
    const idx = arr.findIndex(t => t.date === to.date && t.classId === to.classId);
    if (idx >= 0) arr[idx] = to.toJSON(); else arr.push(to.toJSON());
    await this._writeAll({ ...cal, testOverrides: arr });
    return to;
  }
  async removeTestOverride(date, classId) {
    const cal = await this._readAll();
    await this._writeAll({ ...cal, testOverrides: (cal.testOverrides || []).filter(t => !(t.date === date && t.classId === classId)) });
  }
  async removeAllTestOverridesForDate(date) {
    const cal = await this._readAll();
    await this._writeAll({ ...cal, testOverrides: (cal.testOverrides || []).filter(t => t.date !== date) });
  }
  async snapshot() { return this._readAll(); }
  async restore(snap) {
    await this._writeAll({
      holidays:      (snap.holidays      || []).filter(d => DATE_RE.test(d)),
      examDays:      (snap.examDays      || []).map(r => ExamDay.safeFromJSON(r)?.toJSON()).filter(Boolean),
      testOverrides: (snap.testOverrides || []).map(r => TestOverride.safeFromJSON(r)?.toJSON()).filter(Boolean),
    });
  }
}

class MetaRepo {
  async getMeta() {
    try { return UserMeta.fromJSON(await dbGet('meta', 'current')); } catch { return new UserMeta(); }
  }
  async saveMeta(data) {
    const meta = new UserMeta({ ...(await this.getMeta()).toJSON(), ...data, ts: Date.now() });
    await dbPut('meta', 'current', meta.toJSON());
    return meta;
  }
  async getNotifSettings() {
    try { return NotifSettings.fromJSON(await dbGet('meta', 'notifSettings')); } catch { return new NotifSettings(); }
  }
  async saveNotifSettings(data) {
    const s = new NotifSettings(data);
    await dbPut('meta', 'notifSettings', s.toJSON());
    return s;
  }
}

// ═══════════════════════════════════════════════════════════
// SECTION 4 — DataStore Facade (window.DB)
// ═══════════════════════════════════════════════════════════

const _subjectRepo  = new SubjectRepo();
const _classRepo    = new ClassRepo();
const _taskRepo     = new TaskRepo();
const _calRepo      = new CalendarRepo();
const _metaRepo     = new MetaRepo();

let _saveQueue = Promise.resolve();

function enqueue(fn) {
  _saveQueue = _saveQueue.then(fn).catch(e => console.error('[DataStore] queued op failed', e));
  return _saveQueue;
}

const LS_KEY = 'MySkedul_FullBackup';

async function mirrorToLS() {
  try { 
    const snap = await DataStore.snapshot();
    localStorage.setItem(LS_KEY, JSON.stringify(snap)); 
    await mirrorToCapacitor(snap);
  }
  catch (e) { if (e.name === 'QuotaExceededError') localStorage.removeItem(LS_KEY); }
}

async function mirrorToCapacitor(snap) {
  if (!window.Capacitor?.isNativePlatform()) return;
  try {
    const { Filesystem } = Capacitor.Plugins;
    const { Directory, Encoding } = Capacitor;
    if (Filesystem) await Filesystem.writeFile({ path: 'myskedul_internal.json', data: JSON.stringify(snap), directory: Directory.Data, encoding: Encoding.UTF8 });
  } catch (e) { console.warn('[DataStore] Capacitor mirror failed', e); }
}

const DataStore = {

  // ── Bootstrap ────────────────────────────────────────────

  async load() {
    try {
      const [subjects, classes, tasks, meta, notifSettings, holidays, examDays, testOverrides] = await Promise.all([
        _subjectRepo.getAll(), _classRepo.getAll(), _taskRepo.getAll(),
        _metaRepo.getMeta(), _metaRepo.getNotifSettings(),
        _calRepo.getHolidays(), _calRepo.getExamDays(), _calRepo.getTestOverrides(),
      ]);
      return { subjects, classes, tasks, meta, notifSettings, holidays, examDays, testOverrides };
    } catch (e) {
      console.warn('[DataStore] IDB load failed, falling back', e);
      return this._loadFallback();
    }
  },

  async _loadFallback() {
    if (window.Capacitor?.isNativePlatform()) {
      try {
        const { Filesystem } = Capacitor.Plugins;
        const { Directory, Encoding } = Capacitor;
        const res = await Filesystem.readFile({ path: 'myskedul_internal.json', directory: Directory.Data, encoding: Encoding.UTF8 });
        if (res?.data) { await this.restore(JSON.parse(res.data)); return this.load(); }
      } catch {}
    }
    const raw = localStorage.getItem(LS_KEY) || localStorage.getItem('MySkedul_data');
    if (raw) { try { await this.restore(JSON.parse(raw)); return this.load(); } catch {} }
    return { subjects: [], classes: [], tasks: [], meta: new UserMeta(), notifSettings: new NotifSettings(), holidays: [], examDays: [], testOverrides: [] };
  },

  // ── Snapshot / Restore ───────────────────────────────────

  async snapshot() {
    const [subjects, classes, tasks, meta, notifSettings, cal] = await Promise.all([
      _subjectRepo.getAll(), _classRepo.getAll(), _taskRepo.getAll(),
      _metaRepo.getMeta(), _metaRepo.getNotifSettings(), _calRepo.snapshot(),
    ]);
    return {
      subjects:      subjects.map(s => s.toJSON()),
      classes:       classes.map(c => c.toJSON()),
      tasks:         tasks.map(t => t.toJSON()),
      meta:          meta.toJSON(),
      notifSettings: notifSettings.toJSON(),
      holidays:      cal.holidays      || [],
      examDays:      cal.examDays      || [],
      testOverrides: cal.testOverrides || [],
      _v: 4, _ts: Date.now(),
    };
  },

  async restore(raw) {
    return enqueue(async () => {
      const safe = (arr, Model) => Array.isArray(arr) ? arr.map(r => { try { return new Model(r).toJSON(); } catch { return null; } }).filter(Boolean) : [];
      await dbBatchPut([
        { store: 'subjects', key: 'list',         value: safe(raw.subjects, Subject)           },
        { store: 'classes',  key: 'list',          value: safe(raw.classes, ScheduleClass)      },
        { store: 'tasks',    key: 'list',          value: safe(raw.tasks, Task)                 },
        { store: 'meta',     key: 'current',       value: { globalUserName: raw.globalUserName || raw.meta?.globalUserName || 'Student', globalUserEmail: raw.globalUserEmail || raw.meta?.globalUserEmail || '', ts: Date.now() } },
        { store: 'meta',     key: 'notifSettings', value: raw.notifSettings || {}              },
        { store: 'calendar', key: 'data',          value: { holidays: raw.holidays || [], examDays: raw.examDays || [], testOverrides: raw.testOverrides || [] } },
      ]);
      await mirrorToLS();
    });
  },

  // ── Subjects ─────────────────────────────────────────────

  subjects: {
    getAll:  ()          => _subjectRepo.getAll(),
    getById: (id)        => _subjectRepo.getById(id),
    create:  (data)      => enqueue(() => _subjectRepo.create({ ...data, id: genId() }).then(s => { mirrorToLS(); return s; })),
    update:  (id, patch) => enqueue(() => _subjectRepo.update(id, patch).then(s => { mirrorToLS(); return s; })),
    delete:  (id)        => enqueue(async () => { await _subjectRepo.delete(id); await _classRepo.deleteBySubject(id); mirrorToLS(); }),
  },

  // ── Classes ──────────────────────────────────────────────

  classes: {
    getAll:   ()          => _classRepo.getAll(),
    getByDay: (day)       => _classRepo.getByDay(day),
    create:   (data)      => enqueue(() => _classRepo.create({ ...data, id: genId() }).then(c => { mirrorToLS(); return c; })),
    update:   (id, patch) => enqueue(() => _classRepo.update(id, patch).then(c => { mirrorToLS(); return c; })),
    delete:   (id)        => enqueue(() => _classRepo.delete(id).then(() => mirrorToLS())),
  },

  // ── Tasks ────────────────────────────────────────────────

  tasks: {
    getAll:     ()          => _taskRepo.getAll(),
    create:     (data)      => enqueue(() => _taskRepo.create({ ...data, id: genId() }).then(t => { mirrorToLS(); return t; })),
    update:     (id, patch) => enqueue(() => _taskRepo.update(id, patch).then(t => { mirrorToLS(); return t; })),
    toggleDone: (id)        => enqueue(() => _taskRepo.toggleDone(id).then(t => { mirrorToLS(); return t; })),
    delete:     (id)        => enqueue(() => _taskRepo.delete(id).then(() => mirrorToLS())),
  },

  // ── Calendar ─────────────────────────────────────────────

  calendar: {
    getHolidays:            ()            => _calRepo.getHolidays(),
    addHoliday:             (date)        => enqueue(() => _calRepo.addHoliday(date).then(() => mirrorToLS())),
    removeHoliday:          (date)        => enqueue(() => _calRepo.removeHoliday(date).then(() => mirrorToLS())),
    toggleHoliday:          (date)        => enqueue(() => _calRepo.toggleHoliday(date).then(() => mirrorToLS())),
    getExamDays:            ()            => _calRepo.getExamDays(),
    upsertExamDay:          (data)        => enqueue(() => _calRepo.upsertExamDay(data).then(e => { mirrorToLS(); return e; })),
    removeExamDay:          (date)        => enqueue(() => _calRepo.removeExamDay(date).then(() => mirrorToLS())),
    getTestOverrides:       ()            => _calRepo.getTestOverrides(),
    upsertTestOverride:     (data)        => enqueue(() => _calRepo.upsertTestOverride(data).then(t => { mirrorToLS(); return t; })),
    removeTestOverride:     (date, clsId) => enqueue(() => _calRepo.removeTestOverride(date, clsId).then(() => mirrorToLS())),
    clearTestsForDate:      (date)        => enqueue(() => _calRepo.removeAllTestOverridesForDate(date).then(() => mirrorToLS())),
  },

  // ── Meta / Notifs ─────────────────────────────────────────

  meta: {
    get:  ()     => _metaRepo.getMeta(),
    save: (data) => enqueue(() => _metaRepo.saveMeta(data).then(m => { mirrorToLS(); return m; })),
  },

  notifSettings: {
    get:  ()     => _metaRepo.getNotifSettings(),
    save: (data) => enqueue(() => _metaRepo.saveNotifSettings(data).then(s => { mirrorToLS(); return s; })),
  },

  // ── Flush / Clear ─────────────────────────────────────────

  async flush() {
    await _saveQueue;
    await mirrorToLS();
  },

  async clearAll() {
    localStorage.clear();
    if (_db) { _db.close(); _db = null; }
    await new Promise((res, rej) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = res; req.onerror = rej; req.onblocked = rej;
    });
  },
};

// ─── Global exposure ─────────────────────────────────────────────────────────
window.DB    = DataStore;
window.genId = genId;

// ─── Auto-flush ──────────────────────────────────────────────────────────────
document.addEventListener('visibilitychange', () => { if (document.hidden) DataStore.flush(); });
window.addEventListener('beforeunload', () => DataStore.flush());

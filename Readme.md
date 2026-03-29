# MySkedul — Academic OS for Students 🎓

> A mobile-first student planner for managing classes, exams, tests and assignments.

---

## What is this?

MySkedul is a student timetable app that feels like a native mobile experience — but runs entirely in your browser. It was built to solve a simple problem: existing schedule apps are either too complex, too basic, or too slow. MySkedul is fast, offline-first, and genuinely beautiful to use.

It handles your full academic life — class schedules, exam days, class tests, tasks, and holidays — all in one place, with cloud sharing so you can send your timetable to a friend in seconds.

---

## Features

### 📅 Smart Schedule Management
- Add classes with subject, time, room, teacher, and days of the week
- Automatically shows today's classes with live progress bars
- Classes are tagged as **Now**, **Next Up**, or **Past** in real time
- Swipe left/right to navigate between days (or use the date strip)

### 🗓️ Calendar & Special Days
- Scrollable 120-day date strip with dot indicators
- Mark any day as an **Exam Day**, **Class Test**, or **Holiday**
- Long press a date card to toggle exam status
- Double tap to mark as holiday
- Exam and test days are highlighted with distinct colors

### 👆 Gesture System
MySkedul is built around touch-first interactions — almost everything has a gesture shortcut:

| Gesture | Where | What it does |
|---|---|---|
| **Swipe Left** | Home screen | Go to next day |
| **Swipe Right** | Home screen | Go to previous day |
| **Fast Swipe** | Home screen | Jumps 2 days at once (velocity-based) |
| **Long Press** | Date card | Toggle Exam Day on/off |
| **Double Tap** | Date card | Toggle Holiday on/off |
| **Long Press** | Class card | Instantly mark/unmark as Class Test |
| **Tap** | Class card | Open edit screen |
| **Tap** | Exam card | Open exam detail editor |
| **Trackpad Swipe** | Desktop/web | Horizontal scroll changes day (like mobile) |

Swipe detection is strict — it only fires on mostly-horizontal movement, so vertical scrolling never accidentally triggers day navigation. Velocity is also measured, so a fast flick skips two days for quicker navigation. There's also a 400ms navigation lock after each swipe so rapid accidental double-triggers can't happen.

### ✅ Task Manager
- Add assignments and tasks with due date, time, subject, and priority
- Priority levels: High / Medium / Low with color-coded badges
- Check off tasks when done (with strikethrough animation)

### ☁️ Cloud Schedule Sharing
- Generate a 6-character Share Code for your schedule
- Anyone can import it by entering the code — no account needed
- Also supports file-based export/import (JSON)

### 🎨 Themes & Performance
- Light, Dark, and System-auto theme modes
- Smooth animated transitions (optimized for 120Hz screens)
- Auto performance detection for low-end devices (2GB RAM mode)
- Full offline support via IndexedDB — works without internet

### 📱 Mobile-First
- Built for Android and iOS via Capacitor
- Supports Android hardware back button
- Safe area insets for notch/punch-hole screens
- Haptic feedback on interactions

---

## Tech Stack

| Layer | What's Used |
|---|---|
| Language | Vanilla HTML, CSS, JavaScript (no frameworks) |
| Storage | IndexedDB (primary) + LocalStorage (fallback) |
| Icons | Lucide Icons (via CDN) |
| Fonts | DM Sans (Google Fonts) |
| Cloud | Cloudflare Workers (for Share ID feature) |
| Native | Capacitor (Android/iOS wrapper) |

No build tools. No npm. No bundler. Just one `.html` file.

---

## How to Run

**In a browser (recommended for development):**
```
# Clone the repo
git clone https://github.com/ianshulyadav/myskedul.git

# Open in browser — no server needed
open index.html
```

> ⚠️ Cloud Share features (Generate/Import ID) require a live HTTP connection. Running via `file://` will block those requests due to CORS — everything else works fine.

**For local testing with cloud features:**
```
# Use any simple local server
npx serve .
# or
python -m http.server 8080
```

---

## File Structure

```
myskedul/
│
├── index.html          # App shell — structure and page layout only
├── style.css           # All styling — themes, animations, components
├── app.js              # All logic — data, gestures, rendering, modals
├── logo.png            # App icon
└── README.md           # You're reading this
```

The codebase is split into three clean files so each part of the app can be worked on and committed independently — structure, design, and logic stay fully separated.

---

## Planned Features

- [ ] Push notifications (Capacitor LocalNotifications)
- [ ] Study Groups with shared notes
- [ ] Week view timetable grid
- [ ] Attendance tracker
- [ ] Widget support (Android home screen)
- [ ] PWA install support

---

## Contributing

This project is in active development. If you find a bug or have a feature idea:

1. Open an issue describing the problem or suggestion
2. Fork the repo, make your changes, and open a PR
3. Keep changes focused — one feature or fix per PR

---

## Community

Join the Telegram group for updates, feature requests, and support:
👉 [t.me/myskedulapp](https://t.me/myskedulapp)

---

## License

MIT — free to use, modify, and distribute. Credit appreciated but not required.

---

<div align="center">
  <sub>Built with ☕ and way too many late nights by <a href="https://github.com/ianshulyadav">Anshul Yadav</a></sub>
</div>

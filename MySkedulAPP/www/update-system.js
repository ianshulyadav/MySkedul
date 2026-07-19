let isUpdateAvailableValue = false;
let latestUpdateData = null;

const UPDATE_CONFIG_URL = 'https://raw.githubusercontent.com/ianshulyadav/MySkedul/main/version.json';
const CURRENT_APP_VERSION = '1.3.04';

// Initialize update system
async function initUpdateSystem() {
  if (CURRENT_APP_VERSION.includes('nightly')) {
    console.log("[MySkedul] Nightly build detected. Skipping update checks.");
    return;
  }
  await handleWhatsNew();
  await checkForUpdates();
  attachClickListeners();
  setupResumeCheck();
}

function setupResumeCheck() {
  if (window.Capacitor?.isNativePlatform()) {
    Capacitor.Plugins.App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) checkForUpdates();
    });
  } else {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkForUpdates();
    });
  }
}

function attachClickListeners() {
  const card = document.getElementById('profile-app-details');
  if (card) {
    card.style.cursor = 'pointer';
    card.style.pointerEvents = 'auto';
    card.onclick = null;
    card.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.handleAppDetailsClick();
    };
  }
}

/**
 * Parses version strings like "1.6.04.26" to compare them.
 */
function isNewerVersion(local, remote) {
  const lParts = local.split('.').map(Number);
  const rParts = remote.split('.').map(Number);
  for (let i = 0; i < Math.max(lParts.length, rParts.length); i++) {
    const l = lParts[i] || 0;
    const r = rParts[i] || 0;
    if (r > l) return true;
    if (r < l) return false;
  }
  return false;
}

async function checkForUpdates() {
  if (localStorage.getItem('MySkedul_updateNotificationsEnabled') === 'false') {
    return;
  }
  try {
    const response = await fetch(UPDATE_CONFIG_URL, { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();

    if (data.version && isNewerVersion(CURRENT_APP_VERSION, data.version)) {
      isUpdateAvailableValue = true;
      latestUpdateData = data;
      updateProfileUI();

      const isForce = data.forceUpdate === true || data.force === true;
      const sessionKey = 'update_popup_shown_auto_' + data.version;

      if (isForce || !sessionStorage.getItem(sessionKey)) {
        sessionStorage.setItem(sessionKey, 'true');
        showUpdatePopup(data, false);
      }
      scheduleUpdateNotification(data.version);
    } else {
      isUpdateAvailableValue = false;
      updateProfileUI();
      cancelUpdateNotifications();
    }
  } catch (e) {
    console.warn("Update check failed.");
  }
}

function updateProfileUI() {
  const badge = document.getElementById('update-badge');
  const premiumTag = document.getElementById('app-premium-tag');
  const versionLbl = document.getElementById('app-version-lbl');
  const navDot = document.getElementById('nav-update-dot');

  if (navDot) navDot.style.display = isUpdateAvailableValue ? 'block' : 'none';

  if (isUpdateAvailableValue && badge) {
    badge.style.display = 'block';
    if (premiumTag) premiumTag.style.display = 'none';
    if (versionLbl) {
      versionLbl.innerText = `New Update Available • v${latestUpdateData?.version || ''}`;
      versionLbl.style.color = 'var(--theme)';
      versionLbl.style.fontWeight = '700';
    }
  } else if (badge) {
    badge.style.display = 'none';
    if (premiumTag) premiumTag.style.display = 'block';
    if (versionLbl) {
      versionLbl.innerText = `v${CURRENT_APP_VERSION}`;
      versionLbl.style.color = 'var(--sub)';
      versionLbl.style.fontWeight = '500';
    }
  }
  attachClickListeners();
}

window.handleAppDetailsClick = () => {
  if (isUpdateAvailableValue && latestUpdateData) {
    showUpdatePopup(latestUpdateData, false);
  } else {
    openAppChangelog();
  }
};

function isLowEndDevice() {
  const memory = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  return memory <= 2 || cores <= 4;
}

function showUpdatePopup(config, autoStart = false) {
  const isForce = config.forceUpdate === true || config.force === true;
  if (!isForce && !autoStart && sessionStorage.getItem('update_dismissed_' + config.version)) return;

  const modalId = 'm-app-update';
  let modal = document.getElementById(modalId);
  if (!modal) {
    modal = document.createElement('div');
    modal.className = `mo center${isForce ? ' force-update' : ''}`;
    modal.id = modalId;
    modal.onclick = (e) => {
      if (e.target === modal && !isForce) closeUpdateModal(modalId, config.version);
    };
    document.body.appendChild(modal);
  }

  const dismissBtnHtml = isForce ? '' :
    `<button class="btn-s" style="flex:1; background:var(--border); color:var(--text); border-radius:20px; font-weight:800; padding:16px; border:none;" onclick="closeUpdateModal('${modalId}', '${config.version}')">Dismiss</button>`;

  // Dynamically resolve release APK build links
  const versionTag = config.version.startsWith('v') ? config.version : 'v' + config.version;
  const cleanVer = config.version.replace(/^v/, '');
  const apkHigh = (config.apk && config.apk.high) ? config.apk.high : `https://github.com/ianshulyadav/MySkedul/releases/download/${versionTag}/MySkedul-v${cleanVer}-high.apk`;
  const apkLow = (config.apk && config.apk.low) ? config.apk.low : `https://github.com/ianshulyadav/MySkedul/releases/download/${versionTag}/MySkedul-v${cleanVer}-low.apk`;

  let buttonsHtml = `
    <div id="update-actions" style="display:flex; flex-direction:column; gap:12px; margin-top:24px; width:100%;">
      <button class="btn-p" style="margin:0; border-radius:15px; font-weight:800; padding:16px; background:var(--theme); color:#fff; border:none;" onclick="startInAppDownload('${apkHigh}', 'Full')">Download Update</button>
      <button class="btn-p" style="margin:0; border-radius:15px; font-weight:800; padding:12px; background:rgba(108,99,255,0.05); color:var(--theme); border:1.5px solid var(--theme); font-size:13px;" onclick="startInAppDownload('${apkLow}', 'Lite')">Download Lite (Older Phones)</button>
      <div style="display:flex; gap:12px; margin-top:4px;">${dismissBtnHtml}</div>
    </div>
  `;

  modal.innerHTML = `
    <div class="ms" style="padding:32px 24px; text-align:center; border-radius:32px; box-shadow:0 30px 90px rgba(0,0,0,0.2); max-width: 380px; background:var(--bg);">
      <div id="update-icon-box" style="width:72px; height:72px; background:rgba(108,99,255,0.08); border-radius:24px; display:flex; align-items:center; justify-content:center; margin:0 auto 20px; color:var(--theme);">
        <i data-lucide="download-cloud" style="width:36px; height:36px; stroke-width:2.2;"></i>
      </div>
      <div id="update-title" style="font-size:24px; font-weight:900; letter-spacing:-0.5px; margin-bottom:8px; color:var(--text);">Updating MySkedul</div>
      <div id="update-ver" style="font-size:13px; font-weight:900; color:var(--theme); background:rgba(108,99,255,0.1); display:inline-block; padding:4px 12px; border-radius:12px; margin-bottom:16px;">v${config.version}</div>
      <p id="update-msg" style="font-size:14px; color:var(--sub); font-weight:600; line-height:1.6; padding:0 10px; margin-bottom:0;">
        ${config.message || "A new version of MySkedul is available. Please update to continue using all features smoothly."}
      </p>
      
      <div id="update-actions" style="display:flex; flex-direction:column; gap:12px; margin-top:24px; width:100%;">
        ${buttonsHtml}
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();
  requestAnimationFrame(() => modal.classList.add('active'));

  if (autoStart) {
    setTimeout(() => {
      const url = isLowEndDevice() ? apkLow : apkHigh;
      if (url) startInAppDownload(url);
    }, 400);
  }
}

async function startInAppDownload(url, type = "") {
  const title = document.getElementById('update-title');
  const msg = document.getElementById('update-msg');
  const iconBox = document.getElementById('update-icon-box');

  if (title) title.innerText = "Opening Browser";
  if (msg) msg.innerText = "Please confirm the download in your browser to complete the update.";
  if (iconBox) iconBox.innerHTML = '<i data-lucide="external-link" class="spin-slow" style="width:36px; height:36px;"></i>';
  if (window.lucide) window.lucide.createIcons();

  // Use a small delay for visual feedback before opening
  setTimeout(() => {
    window.open(url, '_system');

    if (title) title.innerText = "Download Started";
    if (iconBox) iconBox.innerHTML = '<i data-lucide="check-circle-2" style="width:36px; height:36px;"></i>';
    if (window.lucide) window.lucide.createIcons();
  }, 1000);
}

function closeUpdateModal(modalId, version) {
  sessionStorage.setItem('update_dismissed_' + version, 'true');
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
    setTimeout(() => {
      modal.remove();
      // Ensure body blur is cleared if no other modals are open
      if (window.uMS) {
        window.uMS();
      } else {
        const active = document.querySelectorAll('.mo.active').length > 0;
        document.body.classList.toggle('modal-open', active);
      }
    }, 400);
  }
}

async function handleWhatsNew() {
  const shownKey = 'whats_new_shown_' + CURRENT_APP_VERSION;
  if (!localStorage.getItem(shownKey)) {
    localStorage.setItem(shownKey, 'true');
    localStorage.setItem('last_app_version', CURRENT_APP_VERSION);
    await cancelUpdateNotifications();

    const savedChangelogKey = 'pending_changelog_' + CURRENT_APP_VERSION;
    const rawChangelog = localStorage.getItem(savedChangelogKey);
    let changelog = [];
    if (rawChangelog) {
      try { changelog = JSON.parse(rawChangelog); } catch (e) { }
      localStorage.removeItem(savedChangelogKey);
    }

    if (CURRENT_APP_VERSION === '1.3.04' && changelog.length === 0) {
      changelog = DEFAULT_CHANGELOG_LIST;
    }
    
    // Only show What's New if the user is upgrading (already onboarded)
    const hasOnboarded = localStorage.getItem('MySkedul_onboarded');
    if (hasOnboarded) {
      showWhatsNewPopup(CURRENT_APP_VERSION, changelog, DEFAULT_CHANGELOG_TEXT);
    }
  }
}

const DEFAULT_CHANGELOG_TEXT = "New Update v1.3.04! Group Sharing & import Schedules ";
const DEFAULT_CHANGELOG_LIST = [
  "<i data-lucide='rocket' style='color:#FF6B6B; width:18px; margin-right:4px; vertical-align:middle;'></i> <b>Whats new</b>: Major upgrade to the Academic OS experience.",
  "<i data-lucide='users' style='color:#6C63FF; width:18px; margin-right:4px; vertical-align:middle;'></i> <b>Group Tab</b>: Find and import schedules based on your section.",
  "<i data-lucide='cloud-download' style='color:#4FACFE; width:18px; margin-right:4px; vertical-align:middle;'></i> <b>Cloud Save</b>: View cloud snapshots and export schedules as premium PDFs.",
  "<i data-lucide='hammer' style='color:#A8A8A8; width:18px; margin-right:4px; vertical-align:middle;'></i> <b>Bug fixes</b>: Optimized performance and UI fixes."
];

function openAppChangelog() {
  showWhatsNewPopup(CURRENT_APP_VERSION, DEFAULT_CHANGELOG_LIST, DEFAULT_CHANGELOG_TEXT);
}

function showWhatsNewPopup(version, logArray, customText) {
  const modalId = 'm-whats-new';
  let modal = document.createElement('div');
  modal.className = 'mo center';
  modal.id = modalId;
  modal.onclick = (e) => { if (e.target === modal) closeWhatsNewModal(modalId); };

  let listHtml = (logArray && logArray.length) ? logArray.map(item => {
    // Separate icon and text for better structure
    const iconMatch = item.match(/<i.*<\/i>/);
    const iconStr = iconMatch ? iconMatch[0] : '';
    const textStr = item.replace(iconStr, '').trim();

    return `
      <li style="display:flex; align-items:flex-start; gap:14px; margin-bottom:18px; text-align:left;">
        <div style="flex-shrink:0; width:22px; display:flex; justify-content:center; pt:3px;">${iconStr}</div>
        <div style="flex:1; line-height:1.5;">${textStr}</div>
      </li>
    `;
  }).join('') : '';

  modal.innerHTML = `
    <div class="ms" style="padding:32px 24px; text-align:center; border-radius:32px; box-shadow:0 30px 90px rgba(0,0,0,0.2); max-width: 380px; background:var(--bg);">
      <div style="width:72px; height:72px; background:rgba(108,99,255,0.08); border-radius:24px; display:flex; align-items:center; justify-content:center; margin:0 auto 20px; color:var(--theme);">
        <i data-lucide="arrow-up-circle" style="width:36px; height:36px; stroke-width:2.2;"></i>
      </div>
      <div style="font-size:24px; font-weight:900; margin-bottom:8px; color:var(--text);">Success!</div>
      <div style="font-size:13px; font-weight:900; color:var(--theme); margin-bottom:20px;">v${version} Installed</div>
      <p style="font-size:14px; color:var(--sub); font-weight:600; text-align:left; margin-bottom:20px;">${customText}</p>
      <ul style="text-align:left; font-size:14px; color:var(--text); font-weight:600; list-style-type:none; padding:0; margin-bottom:24px; line-height:1.6;">${listHtml}</ul>
      <button class="btn-p" style="width:100%; height:64px; border-radius:26px; font-weight:900; font-size:16px; background:var(--theme); color:#fff; border:none; box-shadow:0 12px 24px rgba(108,99,255,0.3);" onclick="closeWhatsNewModal('${modalId}')">Excellent</button>
    </div>
  `;
  document.body.appendChild(modal);
  if (window.lucide) window.lucide.createIcons();
  requestAnimationFrame(() => modal.classList.add('active'));
}

function closeWhatsNewModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
    setTimeout(() => modal.remove(), 400);
  }
}

const NOTIF_ID_UPDATE = 889900;
async function scheduleUpdateNotification(newVersion) {
  if (!window.Capacitor?.isNativePlatform()) return;
  try {
    const { LocalNotifications } = Capacitor.Plugins;
    if (!LocalNotifications) return;
    const permStatus = await LocalNotifications.checkPermissions();
    if (permStatus.display !== 'granted') await LocalNotifications.requestPermissions();

    const scheduleDate = new Date();
    scheduleDate.setDate(scheduleDate.getDate() + 2);
    await LocalNotifications.cancel({ notifications: [{ id: NOTIF_ID_UPDATE }] });
    await LocalNotifications.schedule({
      notifications: [{
        id: NOTIF_ID_UPDATE,
        title: "Update Available!",
        body: `MySkedul v${newVersion} is ready for you.`,
        schedule: { at: scheduleDate, allowWhileIdle: true },
        extra: { isUpdate: true }
      }]
    });
  } catch (e) { }
}

async function cancelUpdateNotifications() {
  if (!window.Capacitor?.isNativePlatform()) return;
  try {
    const { LocalNotifications } = Capacitor.Plugins;
    if (LocalNotifications) await LocalNotifications.cancel({ notifications: [{ id: NOTIF_ID_UPDATE }] });
  } catch (e) { }
}

if (window.Capacitor?.isNativePlatform()) {
  document.addEventListener('deviceready', () => {
    try {
      const { LocalNotifications } = Capacitor.Plugins;
      if (LocalNotifications) {
        LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
          if (action.notification.extra && action.notification.extra.isUpdate) setTimeout(checkForUpdates, 1000);
        });
      }
    } catch (e) { }
  });
}

window.initUpdateSystem = initUpdateSystem;
window.checkForUpdates = checkForUpdates;

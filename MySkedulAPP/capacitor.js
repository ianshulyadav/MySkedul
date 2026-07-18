// Capacitor.js - Mock for web preview
// This file is normally injected by the native platform at runtime.
console.log('Capacitor mock loaded for web preview.');
window.Capacitor = window.Capacitor || {
  isNativePlatform: () => false,
  getPlatform: () => 'web',
  Plugins: {}
};

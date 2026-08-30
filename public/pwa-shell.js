(() => {
  const existing = window.__villagerPwaShell;
  if (existing?.initialized) return;

  const state = existing ?? {};
  state.initialized = true;
  state.deferredPrompt = state.deferredPrompt ?? null;
  state.registrationStarted = false;
  state.registrationReady = false;
  state.registration = null;
  state.error = null;
  window.__villagerPwaShell = state;

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    state.deferredPrompt = event;
    window.dispatchEvent(new Event('villager:install-ready'));
  });

  window.addEventListener('appinstalled', () => {
    state.deferredPrompt = null;
    window.dispatchEvent(new Event('villager:installed'));
  });

  if (!('serviceWorker' in navigator)) return;
  const eligibleOrigin = location.protocol === 'https:' || location.hostname === 'localhost';
  if (!eligibleOrigin) return;

  state.registrationStarted = true;
  navigator.serviceWorker.register('./sw.js?v=0.3.2-install3', { updateViaCache: 'none' })
    .then(() => navigator.serviceWorker.ready)
    .then(registration => {
      state.registration = registration;
      state.registrationReady = true;
      window.dispatchEvent(new Event('villager:pwa-ready'));
    })
    .catch(error => {
      state.error = error;
      console.warn('[PWA SERVICE WORKER]', error);
      window.dispatchEvent(new Event('villager:pwa-error'));
    });
})();

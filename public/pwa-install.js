(() => {
  let deferredPrompt = null;
  let button = null;
  let status = null;
  let statusTimer = null;

  const isInstalled = () =>
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.navigator.standalone === true;

  const setStatus = message => {
    if (!status) return;
    if (statusTimer) clearTimeout(statusTimer);
    status.textContent = message;
    status.hidden = false;
    statusTimer = setTimeout(() => {
      status.hidden = true;
    }, 5000);
  };

  const syncButton = () => {
    if (!button) return;
    if (isInstalled()) {
      button.hidden = true;
      return;
    }
    button.hidden = false;
    button.dataset.installReady = deferredPrompt ? 'true' : 'false';
  };

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    syncButton();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    if (button) button.hidden = true;
    if (status) status.hidden = true;
  });

  const setup = () => {
    button = document.querySelector('#install-app-button');
    status = document.querySelector('#install-app-status');
    if (!button || !status) return;

    syncButton();

    button.addEventListener('click', async () => {
      if (!deferredPrompt) {
        setStatus('Chrome has not made app installation available yet.');
        return;
      }

      const prompt = deferredPrompt;
      deferredPrompt = null;
      syncButton();

      try {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        if (choice?.outcome !== 'accepted') {
          setStatus('Installation was cancelled. You can try again later.');
        }
      } catch (error) {
        console.warn('[PWA INSTALL]', error);
        setStatus('The browser could not open the installer.');
      }
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup, { once: true });
  } else {
    setup();
  }
})();

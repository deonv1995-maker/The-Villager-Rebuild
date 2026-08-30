export function registerVillagerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const eligibleOrigin = location.protocol === 'https:' || location.hostname === 'localhost';
  if (!eligibleOrigin) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js?v=0.3.2-old-shell1', { updateViaCache: 'none' }).catch(error => {
      console.warn('[PWA SERVICE WORKER]', error);
    });
  }, { once: true });
}

export function installDesktopPrompt() {
  if (!window.matchMedia('(min-width: 900px) and (pointer: fine)').matches) return;
  if (window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches) return;

  const button = document.createElement('button');
  button.className = 'desktop-install';
  button.type = 'button';
  button.hidden = true;
  button.textContent = 'INSTALL GAME';
  button.style.cssText = [
    'position:fixed',
    'left:18px',
    'bottom:18px',
    'z-index:30',
    'padding:10px 14px',
    'border-radius:12px',
    'border:1px solid rgba(225,207,151,.6)',
    'background:rgba(15,34,25,.9)',
    'color:#fff8e8',
    'font:800 12px system-ui,sans-serif',
    'letter-spacing:.04em',
    'cursor:pointer',
    'backdrop-filter:blur(6px)'
  ].join(';');
  document.body.append(button);

  let deferredPrompt = null;
  const hide = () => {
    deferredPrompt = null;
    button.hidden = true;
  };

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    button.hidden = false;
  });

  window.addEventListener('appinstalled', hide);

  button.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    hide();
  });
}

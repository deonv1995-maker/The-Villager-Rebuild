export function registerVillagerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const eligibleOrigin = location.protocol === 'https:' || location.hostname === 'localhost';
  if (!eligibleOrigin) return;

  const shellState = window.__villagerPwaShell;
  if (shellState?.registrationStarted) return;

  navigator.serviceWorker.register('./sw.js?v=0.3.2-install3', { updateViaCache: 'none' }).catch(error => {
    console.warn('[PWA SERVICE WORKER]', error);
  });
}

export function installDesktopPrompt() {
  if (window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches) return;

  const button = document.createElement('button');
  button.className = 'pwa-install';
  button.type = 'button';
  button.hidden = true;
  button.textContent = 'INSTALL APP';

  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  button.style.cssText = [
    'position:fixed',
    coarsePointer ? 'left:50%' : 'left:18px',
    coarsePointer ? 'bottom:12px' : 'bottom:18px',
    coarsePointer ? 'transform:translateX(-50%)' : '',
    'z-index:60',
    coarsePointer ? 'padding:8px 12px' : 'padding:10px 14px',
    'border-radius:12px',
    'border:1px solid rgba(225,207,151,.72)',
    'background:rgba(15,34,25,.94)',
    'color:#fff8e8',
    'font:800 12px system-ui,sans-serif',
    'letter-spacing:.04em',
    'cursor:pointer',
    'backdrop-filter:blur(6px)',
    'box-shadow:0 3px 12px rgba(0,0,0,.24)'
  ].filter(Boolean).join(';');
  document.body.append(button);

  let deferredPrompt = window.__villagerPwaShell?.deferredPrompt ?? null;

  const show = prompt => {
    deferredPrompt = prompt ?? window.__villagerPwaShell?.deferredPrompt ?? null;
    button.hidden = !deferredPrompt;
    button.disabled = false;
  };

  const hide = () => {
    deferredPrompt = null;
    button.hidden = true;
    button.disabled = false;
  };

  if (deferredPrompt) show(deferredPrompt);

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    if (window.__villagerPwaShell) window.__villagerPwaShell.deferredPrompt = event;
    show(event);
  });
  window.addEventListener('villager:install-ready', () => show());
  window.addEventListener('appinstalled', hide);
  window.addEventListener('villager:installed', hide);

  button.addEventListener('click', async () => {
    const prompt = deferredPrompt ?? window.__villagerPwaShell?.deferredPrompt;
    if (!prompt) return;

    button.disabled = true;
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } finally {
      if (window.__villagerPwaShell) window.__villagerPwaShell.deferredPrompt = null;
      hide();
    }
  });
}

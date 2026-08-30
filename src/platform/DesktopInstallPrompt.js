function isNativeShell() {
  return Boolean(window.Capacitor?.isNativePlatform?.());
}

export function registerVillagerServiceWorker() {
  if (isNativeShell()) return;
  if (!('serviceWorker' in navigator)) return;
  const eligibleOrigin = location.protocol === 'https:' || location.hostname === 'localhost';
  if (!eligibleOrigin) return;

  const register = async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', {
        scope: './',
        updateViaCache: 'none'
      });
      await registration.update();
      window.__villagerPwa = {
        ...(window.__villagerPwa ?? {}),
        serviceWorkerRegistered: true,
        scope: registration.scope
      };
    } catch (error) {
      window.__villagerPwa = {
        ...(window.__villagerPwa ?? {}),
        serviceWorkerRegistered: false,
        serviceWorkerError: String(error?.message ?? error)
      };
      console.warn('[PWA SERVICE WORKER]', error);
    }
  };

  if (document.readyState === 'complete') void register();
  else window.addEventListener('load', () => void register(), { once: true });
}

export function installAppPrompt() {
  if (isNativeShell()) return;
  if (window.matchMedia('(display-mode: standalone)').matches) return;

  const button = document.createElement('button');
  button.className = 'app-install';
  button.type = 'button';
  button.hidden = true;
  button.textContent = 'INSTALL GAME';
  button.setAttribute('aria-label', 'Install The Villager as an app');
  button.style.cssText = [
    'position:fixed',
    'right:max(12px,env(safe-area-inset-right))',
    'top:max(54px,calc(env(safe-area-inset-top) + 48px))',
    'z-index:40',
    'padding:9px 13px',
    'border-radius:999px',
    'border:1px solid rgba(225,207,151,.65)',
    'background:rgba(15,34,25,.94)',
    'color:#fff8e8',
    'font:800 11px system-ui,sans-serif',
    'letter-spacing:.04em',
    'cursor:pointer',
    'touch-action:manipulation',
    'box-shadow:0 4px 14px rgba(0,0,0,.2)',
    'backdrop-filter:blur(6px)'
  ].join(';');
  document.body.append(button);

  let deferredPrompt = null;

  const updateDebugState = state => {
    window.__villagerPwa = {
      ...(window.__villagerPwa ?? {}),
      ...state
    };
  };

  const hide = () => {
    deferredPrompt = null;
    button.hidden = true;
  };

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    button.hidden = false;
    updateDebugState({ installPromptAvailable: true });
  });

  window.addEventListener('appinstalled', () => {
    updateDebugState({ installPromptAvailable: false, installed: true });
    hide();
  });

  button.addEventListener('click', async event => {
    event.preventDefault();
    if (!deferredPrompt) return;

    const prompt = deferredPrompt;
    deferredPrompt = null;
    button.hidden = true;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    updateDebugState({
      installPromptAvailable: false,
      installChoice: choice?.outcome ?? 'unknown'
    });
  });
}

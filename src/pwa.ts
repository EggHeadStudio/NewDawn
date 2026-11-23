interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaOptions {
  prepareUpdate: () => Promise<boolean>;
  cancelUpdate: () => void;
  hasActiveGame: () => boolean;
  notify: (message: string) => void;
}

export const UPDATE_RESUME_KEY = 'new-dawn-resume-after-update';

export function setupPwa(options: PwaOptions) {
  const installButton = document.querySelector<HTMLButtonElement>('#installGame')!;
  const iosHint = document.querySelector<HTMLElement>('#iosInstallHint')!;
  const updatePanel = document.querySelector<HTMLElement>('#updatePanel')!;
  const updateButton = document.querySelector<HTMLButtonElement>('#applyUpdate')!;
  const laterButton = document.querySelector<HTMLButtonElement>('#laterUpdate')!;
  let installEvent: InstallEvent | undefined;
  let registration: ServiceWorkerRegistration | undefined;
  let updating = false;

  const standalone = () => matchMedia('(display-mode: standalone)').matches
    || ('standalone' in navigator && navigator.standalone === true);
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIos && !standalone()) iosHint.classList.remove('hidden');
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installEvent = event as InstallEvent;
    if (!standalone()) installButton.classList.remove('hidden');
  });
  window.addEventListener('appinstalled', () => {
    installEvent = undefined;
    installButton.classList.add('hidden');
    iosHint.classList.add('hidden');
  });
  installButton.addEventListener('click', async () => {
    if (!installEvent) return;
    try {
      await installEvent.prompt();
      await installEvent.userChoice;
      installEvent = undefined;
      installButton.classList.add('hidden');
    } catch (error) {
      console.error('Installation prompt failed', error);
      options.notify('Could not open the installation prompt.');
    }
  });

  const checkWaiting = () => {
    if (registration?.waiting && navigator.serviceWorker.controller) updatePanel.classList.remove('hidden');
  };
  const checkForUpdates = async () => {
    if (!registration) return;
    try { await registration.update(); checkWaiting(); }
    catch (error) { console.warn('Update check failed', error); }
  };
  laterButton.addEventListener('click', () => updatePanel.classList.add('hidden'));
  updateButton.addEventListener('click', async () => {
    if (updating || !registration?.waiting) return;
    updating = true;
    updateButton.disabled = true;
    laterButton.disabled = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let controllerHandler: (() => void) | undefined;
    try {
      if (!await options.prepareUpdate()) throw new Error('Current game could not be saved');
      const waiting = registration.waiting;
      if (!waiting) throw new Error('Update is no longer waiting');
      if (options.hasActiveGame()) sessionStorage.setItem(UPDATE_RESUME_KEY, '1');
      controllerHandler = () => {
        if (timeout) clearTimeout(timeout);
        location.reload();
      };
      navigator.serviceWorker.addEventListener('controllerchange', controllerHandler, { once: true });
      timeout = setTimeout(() => {
        if (controllerHandler) navigator.serviceWorker.removeEventListener('controllerchange', controllerHandler);
        try { sessionStorage.removeItem(UPDATE_RESUME_KEY); }
        catch (error) { console.warn('Could not clear update resume marker', error); }
        updating = false;
        updateButton.disabled = false;
        laterButton.disabled = false;
        options.cancelUpdate();
        options.notify('Update did not activate. Your game is still open.');
      }, 12000);
      waiting.postMessage({ type: 'SKIP_WAITING' });
    } catch (error) {
      if (timeout) clearTimeout(timeout);
      if (controllerHandler) navigator.serviceWorker.removeEventListener('controllerchange', controllerHandler);
      console.error('Update cancelled', error);
      options.cancelUpdate();
      options.notify('Update cancelled. Your game remains open.');
      updating = false;
      updateButton.disabled = false;
      laterButton.disabled = false;
    }
  });

  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' }).then(result => {
    registration = result;
    checkWaiting();
    result.addEventListener('updatefound', () => {
      const worker = result.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed') checkWaiting();
      });
    });
    void checkForUpdates();
  }).catch(error => {
    console.warn('Offline support unavailable', error);
    options.notify('Offline support is unavailable.');
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void checkForUpdates(); });
  setInterval(() => { if (!document.hidden) void checkForUpdates(); }, 60 * 60 * 1000);
}

export function enterImmersiveMode() {
  if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
    void document.documentElement.requestFullscreen().catch(error => console.info('Fullscreen unavailable', error));
  }
}

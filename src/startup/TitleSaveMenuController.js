const CONTINUE_FADE_MS = 980;

export class TitleSaveMenuController {
  constructor({
    profiles = [],
    setStatus,
    onContinue,
    documentRef = globalThis.document,
    windowRef = globalThis.window
  } = {}) {
    this.profiles = Array.isArray(profiles) ? profiles : [];
    this.setStatus = setStatus;
    this.onContinue = typeof onContinue === 'function' ? onContinue : null;
    this.documentRef = documentRef;
    this.windowRef = windowRef;
    this.attached = false;
    this.handoffStarted = false;
  }

  attach() {
    if (this.attached || this.profiles.length === 0) return false;
    const actions = this.documentRef?.querySelector?.('.title-menu-actions');
    const newGameButton = actions?.querySelector?.('.title-new-game');
    if (!actions || !newGameButton) return false;

    const label = newGameButton.querySelector('span:last-child');
    if (label) label.textContent = 'NEW GAME';

    const selectButton = this.documentRef.createElement('button');
    selectButton.className = 'title-play title-select-profile';
    selectButton.type = 'button';
    selectButton.setAttribute('aria-expanded', 'false');
    selectButton.innerHTML = `
      <span class="title-play-mark" aria-hidden="true">◆</span>
      <span>SELECT PROFILE</span>
    `;

    const profileList = this.documentRef.createElement('div');
    profileList.className = 'title-profile-list';
    profileList.hidden = true;
    profileList.setAttribute('aria-label', 'Saved player profiles');

    for (const profile of this.profiles) {
      const profileButton = this.documentRef.createElement('button');
      profileButton.className = 'title-profile-entry';
      profileButton.type = 'button';
      profileButton.dataset.profileId = profile.id;
      profileButton.innerHTML = `
        <span class="title-profile-entry-mark" aria-hidden="true">◆</span>
        <span>${this.#escapeHtml(profile.name)}</span>
      `;
      profileButton.addEventListener('click', () => this.#continueProfile(profile, {
        profileButton,
        selectButton,
        newGameButton
      }));
      profileList.appendChild(profileButton);
    }

    actions.insertBefore(selectButton, newGameButton);
    actions.insertBefore(profileList, newGameButton);

    selectButton.addEventListener('click', () => {
      if (this.handoffStarted) return;
      const open = profileList.hidden;
      profileList.hidden = !open;
      selectButton.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    newGameButton.addEventListener('click', () => {
      profileList.hidden = true;
      selectButton.setAttribute('aria-expanded', 'false');
    });

    this.attached = true;
    return true;
  }

  #continueProfile(profile, { profileButton, selectButton, newGameButton }) {
    if (this.handoffStarted) return;
    this.handoffStarted = true;
    profileButton.disabled = true;
    selectButton.disabled = true;
    newGameButton.disabled = true;
    this.documentRef.querySelectorAll?.('.title-profile-entry')?.forEach?.(button => {
      button.disabled = true;
    });
    this.documentRef.querySelector('.title-scene-ui')?.classList.add('is-leaving');
    this.documentRef.querySelector('.title-transition')?.classList.add('is-covering');
    this.setStatus?.(`PROFILE · ${profile.name.toUpperCase()} · LOADING`);
    this.windowRef?.setTimeout?.(() => void this.onContinue?.(profile), CONTINUE_FADE_MS);
  }

  #escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
}

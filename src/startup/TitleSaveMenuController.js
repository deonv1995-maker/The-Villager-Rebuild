const CONTINUE_FADE_MS = 980;

export class TitleSaveMenuController {
  constructor({
    profiles = [],
    setStatus,
    onContinue,
    onDelete,
    documentRef = globalThis.document,
    windowRef = globalThis.window
  } = {}) {
    this.profiles = Array.isArray(profiles) ? profiles : [];
    this.setStatus = setStatus;
    this.onContinue = typeof onContinue === 'function' ? onContinue : null;
    this.onDelete = typeof onDelete === 'function' ? onDelete : null;
    this.documentRef = documentRef;
    this.windowRef = windowRef;
    this.attached = false;
    this.handoffStarted = false;
    this.deleteInProgress = false;
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
    profileList.setAttribute('aria-label', 'Player profiles');

    for (const profile of this.profiles) {
      const playable = profile.hasSave !== false;
      const profileRow = this.documentRef.createElement('div');
      profileRow.className = 'title-profile-row';
      profileRow.dataset.profileId = profile.id;

      const profileButton = this.documentRef.createElement('button');
      profileButton.className = 'title-profile-entry';
      profileButton.type = 'button';
      profileButton.dataset.profileId = profile.id;
      profileButton.disabled = !playable;
      profileButton.setAttribute(
        'aria-label',
        playable ? `Continue ${profile.name}` : `${profile.name}, no saved world available`
      );
      profileButton.innerHTML = `
        <span class="title-profile-entry-mark" aria-hidden="true">◆</span>
        <span class="title-profile-entry-copy">
          <span class="title-profile-entry-name">${this.#escapeHtml(profile.name)}</span>
          ${playable ? '' : '<span class="title-profile-entry-state">NO SAVED WORLD</span>'}
        </span>
      `;
      if (playable) {
        profileButton.addEventListener('click', () => this.#continueProfile(profile, {
          profileButton,
          selectButton,
          newGameButton
        }));
      }

      const deleteButton = this.documentRef.createElement('button');
      deleteButton.className = 'title-profile-delete';
      deleteButton.type = 'button';
      deleteButton.textContent = 'DELETE';
      deleteButton.setAttribute('aria-label', `Delete profile ${profile.name}`);
      deleteButton.addEventListener('click', () => void this.#deleteProfile(profile, {
        profileRow,
        profileButton,
        deleteButton,
        profileList,
        selectButton,
        newGameButton
      }));

      profileRow.append(profileButton, deleteButton);
      profileList.appendChild(profileRow);
    }

    actions.insertBefore(selectButton, newGameButton);
    actions.insertBefore(profileList, newGameButton);

    selectButton.addEventListener('click', () => {
      if (this.handoffStarted || this.deleteInProgress) return;
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
    if (this.handoffStarted || this.deleteInProgress) return;
    this.handoffStarted = true;
    profileButton.disabled = true;
    selectButton.disabled = true;
    newGameButton.disabled = true;
    this.documentRef.querySelectorAll?.('.title-profile-entry, .title-profile-delete')?.forEach?.(button => {
      button.disabled = true;
    });
    this.documentRef.querySelector('.title-scene-ui')?.classList.add('is-leaving');
    this.documentRef.querySelector('.title-transition')?.classList.add('is-covering');
    this.setStatus?.(`PROFILE · ${profile.name.toUpperCase()} · LOADING`);
    this.windowRef?.setTimeout?.(() => void this.onContinue?.(profile), CONTINUE_FADE_MS);
  }

  async #deleteProfile(profile, {
    profileRow,
    profileButton,
    deleteButton,
    profileList,
    selectButton,
    newGameButton
  }) {
    if (this.handoffStarted || this.deleteInProgress) return;

    const confirmed = this.windowRef?.confirm?.(
      `Delete "${profile.name}"?\n\nThis permanently deletes this profile and its saved world.`
    ) ?? false;
    if (!confirmed) return;

    this.deleteInProgress = true;
    profileButton.disabled = true;
    deleteButton.disabled = true;
    selectButton.disabled = true;
    newGameButton.disabled = true;

    try {
      const deleted = await this.onDelete?.(profile);
      if (!deleted) throw new Error('Profile could not be deleted');

      this.profiles = this.profiles.filter(entry => entry.id !== profile.id);
      profileRow.remove();

      if (this.profiles.length === 0) {
        profileList.remove();
        selectButton.remove();
      }

      this.setStatus?.(`PROFILE · ${profile.name.toUpperCase()} · DELETED`);
    } catch (error) {
      profileButton.disabled = profile.hasSave === false;
      deleteButton.disabled = false;
      this.setStatus?.(`PROFILE · DELETE FAILED · ${error?.message ?? error}`, true);
    } finally {
      this.deleteInProgress = false;
      newGameButton.disabled = false;
      if (this.profiles.length > 0) selectButton.disabled = false;
    }
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

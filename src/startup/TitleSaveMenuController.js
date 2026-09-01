const CONTINUE_FADE_MS = 980;

export class TitleSaveMenuController {
  constructor({ store, setStatus, onContinue, documentRef = globalThis.document, windowRef = globalThis.window } = {}) {
    if (!store) throw new Error('TitleSaveMenuController requires a save store');
    this.store = store;
    this.setStatus = setStatus;
    this.onContinue = typeof onContinue === 'function' ? onContinue : null;
    this.documentRef = documentRef;
    this.windowRef = windowRef;
    this.attached = false;
    this.handoffStarted = false;
  }

  attach() {
    if (this.attached || !this.store.hasValidSave()) return false;
    const actions = this.documentRef?.querySelector?.('.title-menu-actions');
    const newGameButton = actions?.querySelector?.('.title-play');
    if (!actions || !newGameButton) return false;

    const label = newGameButton.querySelector('span:last-child');
    if (label) label.textContent = 'NEW GAME';

    const continueButton = this.documentRef.createElement('button');
    continueButton.className = 'title-play title-continue';
    continueButton.type = 'button';
    continueButton.innerHTML = `
      <span class="title-play-mark" aria-hidden="true">◆</span>
      <span>CONTINUE</span>
    `;
    actions.insertBefore(continueButton, newGameButton);
    continueButton.addEventListener('click', () => {
      if (this.handoffStarted) return;
      this.handoffStarted = true;
      continueButton.disabled = true;
      newGameButton.disabled = true;
      this.documentRef.querySelector('.title-scene-ui')?.classList.add('is-leaving');
      this.documentRef.querySelector('.title-transition')?.classList.add('is-covering');
      this.setStatus?.('CONTINUE · LOADING SAVE POINT');
      this.windowRef?.setTimeout?.(() => void this.onContinue?.(), CONTINUE_FADE_MS);
    });

    this.attached = true;
    return true;
  }
}

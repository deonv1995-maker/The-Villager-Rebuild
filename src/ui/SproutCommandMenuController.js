export class SproutCommandMenuController {
  constructor({ game, controller } = {}) {
    if (!game || !controller) throw new Error('SproutCommandMenuController requires game and Sprout controller');
    this.game = game;
    this.controller = controller;
    this.root = null;
    this.toggle = null;
    this.menu = null;
    this.energyFill = null;
    this.energyValue = null;
    this.activeLabel = null;
    this.commandList = null;
    this.running = false;
    this.frameId = null;
    this.open = false;
    this.lastSignature = '';
  }

  start() {
    if (this.running) return false;
    this.running = true;
    this.#build();
    this.frameId = globalThis.requestAnimationFrame?.(this.#frame) ?? null;
    return true;
  }

  dispose() {
    if (this.frameId !== null) globalThis.cancelAnimationFrame?.(this.frameId);
    this.frameId = null;
    this.running = false;
    this.root?.remove();
    this.root = null;
  }

  #build() {
    const root = document.createElement('div');
    root.className = 'sprout-command-access';
    root.hidden = true;

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'sprout-command-toggle';
    toggle.setAttribute('aria-label', 'Open Sprout commands');
    toggle.setAttribute('aria-expanded', 'false');

    const title = document.createElement('span');
    title.textContent = 'SPROUT';
    const value = document.createElement('strong');
    value.textContent = '100%';
    const track = document.createElement('span');
    track.className = 'sprout-energy-track';
    track.setAttribute('aria-hidden', 'true');
    const fill = document.createElement('span');
    fill.className = 'sprout-energy-fill';
    track.appendChild(fill);
    toggle.append(title, value, track);

    const menu = document.createElement('section');
    menu.className = 'sprout-command-menu';
    menu.hidden = true;
    menu.setAttribute('aria-label', 'Sprout command menu');

    const header = document.createElement('div');
    header.className = 'sprout-command-header';
    const heading = document.createElement('strong');
    heading.textContent = 'SPROUT COMMANDS';
    const active = document.createElement('span');
    active.textContent = 'STOWED';
    header.append(heading, active);

    const list = document.createElement('div');
    list.className = 'sprout-command-list';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'sprout-command-cancel';
    cancel.dataset.sproutCommand = 'cancel';
    cancel.textContent = 'Recall / cancel';

    menu.append(header, list, cancel);
    root.append(toggle, menu);
    document.body.appendChild(root);

    toggle.addEventListener('pointerdown', event => {
      event.preventDefault();
      this.#setOpen(!this.open);
    });
    menu.addEventListener('pointerdown', event => {
      const button = event.target.closest?.('[data-sprout-command]');
      if (!button || button.disabled) return;
      event.preventDefault();
      this.controller.issueCommand(button.dataset.sproutCommand);
      this.#setOpen(false);
    });

    this.root = root;
    this.toggle = toggle;
    this.menu = menu;
    this.energyFill = fill;
    this.energyValue = value;
    this.activeLabel = active;
    this.commandList = list;
  }

  #frame = () => {
    if (!this.running) return;
    this.#render(this.controller.getCommandState());
    this.frameId = globalThis.requestAnimationFrame?.(this.#frame) ?? null;
  };

  #render(state) {
    if (!this.root || !state) return;
    const signature = JSON.stringify({
      available: state.available,
      percent: state.percent,
      recharging: state.recharging,
      active: state.activeCommandId,
      commands: state.commands.map(entry => [entry.id, entry.enabled, entry.active])
    });
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;

    this.root.hidden = !state.available;
    if (!state.available) {
      this.#setOpen(false);
      return;
    }

    this.energyValue.textContent = state.percent + '%';
    this.energyFill.style.width = state.percent + '%';
    this.toggle.dataset.recharging = state.recharging ? 'true' : 'false';
    this.toggle.dataset.active = state.activeCommandId ? 'true' : 'false';
    this.activeLabel.textContent = state.activeCommandLabel ?? (state.recharging ? 'RECHARGING' : 'STOWED');

    const fragment = document.createDocumentFragment();
    for (const entry of state.commands) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.sproutCommand = entry.id;
      button.disabled = !entry.enabled && !entry.active;
      button.classList.toggle('active', entry.active);

      const label = document.createElement('span');
      label.textContent = entry.label;
      const cost = document.createElement('small');
      cost.textContent = entry.id === 'harvest-tree'
        ? entry.energyCost + '% / laser pass'
        : entry.id === 'collect-logs'
          ? entry.energyCost + '% / log'
          : entry.energyCost + '% energy';
      button.append(label, cost);
      fragment.appendChild(button);
    }
    this.commandList.replaceChildren(fragment);
  }

  #setOpen(open) {
    this.open = Boolean(open && !this.root?.hidden);
    if (this.menu) this.menu.hidden = !this.open;
    if (this.toggle) {
      this.toggle.setAttribute('aria-expanded', this.open ? 'true' : 'false');
      this.toggle.setAttribute('aria-label', this.open ? 'Close Sprout commands' : 'Open Sprout commands');
    }
  }
}

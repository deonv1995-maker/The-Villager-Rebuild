export class MobileHud {
  constructor({ player, canvas }) {
    this.player = player;
    this.canvas = canvas;
    this.root = document.createElement('div');
    this.root.className = 'mobile-hud';
    this.root.innerHTML = `
      <div class="hud-note">FOUNDATION TEST · drag right side to look</div>
      <div class="joystick" data-role="joystick"><img class="joystick-pad" src="./assets/ui/mobile/joystick-pad.svg" alt=""><img class="joystick-nub" src="./assets/ui/mobile/joystick-nub.svg" alt=""></div>
      <button class="hud-button sprint" type="button" aria-label="Sprint"><img class="button-bg" src="./assets/ui/mobile/button-circle.svg" alt=""><img class="button-icon" src="./assets/ui/mobile/icon-hand.svg" alt=""></button>
      <button class="hud-button jump" type="button" aria-label="Jump"><img class="button-bg" src="./assets/ui/mobile/button-circle.svg" alt=""><img class="button-icon" src="./assets/ui/mobile/icon-jump.svg" alt=""></button>
    `;
    document.body.appendChild(this.root);
    this.#bindJoystick();
    this.#bindButtons();
    this.#bindLook();
  }

  #bindJoystick() {
    const pad = this.root.querySelector('[data-role="joystick"]');
    const nub = pad.querySelector('.joystick-nub');
    let pointer = null;

    const update = event => {
      const rect = pad.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = event.clientX - cx;
      let dy = event.clientY - cy;
      const max = rect.width * 0.31;
      const length = Math.hypot(dx, dy);
      if (length > max) {
        dx = dx / length * max;
        dy = dy / length * max;
      }
      nub.style.transform = `translate(${dx}px, ${dy}px)`;
      this.player.setMove(dx / max, -dy / max);
    };

    const reset = () => {
      pointer = null;
      nub.style.transform = 'translate(0, 0)';
      this.player.setMove(0, 0);
    };

    pad.addEventListener('pointerdown', event => {
      pointer = event.pointerId;
      pad.setPointerCapture(pointer);
      update(event);
    });
    pad.addEventListener('pointermove', event => {
      if (event.pointerId === pointer) update(event);
    });
    pad.addEventListener('pointerup', reset);
    pad.addEventListener('pointercancel', reset);
  }

  #bindButtons() {
    const jump = this.root.querySelector('.jump');
    const sprint = this.root.querySelector('.sprint');

    jump.addEventListener('pointerdown', event => {
      event.preventDefault();
      this.player.jump();
    });

    const setSprint = value => this.player.setSprint(value);
    sprint.addEventListener('pointerdown', event => {
      event.preventDefault();
      sprint.setPointerCapture(event.pointerId);
      setSprint(true);
    });
    sprint.addEventListener('pointerup', () => setSprint(false));
    sprint.addEventListener('pointercancel', () => setSprint(false));
  }

  #bindLook() {
    let pointer = null;
    let lastX = 0;
    let lastY = 0;

    this.canvas.addEventListener('pointerdown', event => {
      if (event.clientX < window.innerWidth * 0.45) return;
      pointer = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      this.canvas.setPointerCapture(pointer);
    });

    this.canvas.addEventListener('pointermove', event => {
      if (event.pointerId !== pointer) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      this.player.rotateCamera(dx, dy);
    });

    const release = event => {
      if (event.pointerId === pointer) pointer = null;
    };
    this.canvas.addEventListener('pointerup', release);
    this.canvas.addEventListener('pointercancel', release);
  }
}

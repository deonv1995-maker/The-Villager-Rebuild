export class RestTransitionOverlay {
  constructor({ root = document.getElementById('app-shell') } = {}) {
    if (!root) throw new Error('RestTransitionOverlay requires an app-shell root');
    this.root = root;
    this.element = document.createElement('div');
    this.element.className = 'rest-transition';
    this.element.setAttribute('aria-hidden', 'true');
    this.element.innerHTML = '<div class="rest-transition__sleep" aria-hidden="true"><span>💤</span><span>💤</span><span>💤</span></div>';
    this.root.append(this.element);
    this.setFade(0);
  }

  begin(source = 'campfire') {
    this.element.dataset.source = source;
    this.element.classList.add('active');
    this.element.classList.remove('sleeping');
    document.body.classList.add('rest-transition-active');
    this.setFade(0);
  }

  setFade(value) {
    const fade = Math.max(0, Math.min(1, Number(value) || 0));
    this.element.style.setProperty('--rest-transition-fade', fade.toFixed(3));
  }

  setSleeping(sleeping) {
    this.element.classList.toggle('sleeping', Boolean(sleeping));
  }

  finish() {
    this.setFade(0);
    this.element.classList.remove('active', 'sleeping');
    delete this.element.dataset.source;
    document.body.classList.remove('rest-transition-active');
  }

  dispose() {
    this.finish();
    this.element.remove();
  }
}

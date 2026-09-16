import { RangerAppearancePresentation } from '../player/RangerAppearancePresentation.js';

/**
 * Title-scene adapter for the production player-facing presentation.
 *
 * KayKit remains the hidden pose/animation authority so the established title
 * idle and shipwreck jump clips keep their exact timing. The visible body is
 * resolved through RangerAppearancePresentation, the same compatibility boundary
 * gameplay uses; today that boundary selects Hero M and retains the Prisma body
 * only as the production fallback.
 */
export class TitleHeroPresentation {
  constructor({ root, model }) {
    if (!root || !model) throw new Error('Title Hero presentation requires the KayKit root and animation driver');

    this.root = root;
    this.model = model;
    this.player = {
      root,
      model,
      assetMode: 'kaykit',
      terrain: null,
      grounded: false,
      jumpStage: 0,
      animationState: 'Idle_A',
      getPosition: target => root.getWorldPosition(target),
      onCameraModeChange: () => () => {},
      isFirstPerson: () => false,
      isToolActing: () => false
    };

    this.appearance = new RangerAppearancePresentation({ player: this.player });
    this.readyPromise = this.appearance.heroMLoadPromise.then(active => {
      if (!active || !this.appearance.heroMReady) {
        console.warn('[TITLE HERO M FALLBACK]', this.appearance.heroMLoadError ?? 'Hero M was unavailable');
      }
      return active;
    });
  }

  setAnimationState(name) {
    this.player.animationState = name;
  }

  update(dt) {
    this.appearance.update(dt);
  }

  dispose() {
    this.appearance.cameraModeUnsubscribe?.();
  }
}

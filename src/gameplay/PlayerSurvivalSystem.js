import { WORLD_DAY_MINUTES } from '../data/WorldTimeDefinitions.js';
import { PLAYER_SURVIVAL } from '../data/SurvivalDefinitions.js';

const finiteNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export class PlayerSurvivalSystem {
  constructor({ definition = PLAYER_SURVIVAL } = {}) {
    this.definition = definition;
    this.health = definition.startingHealth;
    this.hunger = definition.startingHunger;
  }

  getSnapshot() {
    const maxHealth = this.definition.maxHealth;
    const maxHunger = this.definition.maxHunger;
    return {
      health: this.health,
      maxHealth,
      hunger: this.hunger,
      maxHunger,
      healthPercent: maxHealth > 0 ? this.health / maxHealth : 0,
      hungerPercent: maxHunger > 0 ? this.hunger / maxHunger : 0,
      starving: this.hunger <= 0,
      defeated: this.health <= 0
    };
  }

  isDefeated() {
    return this.health <= 0;
  }

  advanceWorldMinutes(worldMinutes) {
    const minutes = Math.max(0, finiteNumber(worldMinutes, 0));
    if (minutes <= 0 || this.isDefeated()) {
      return { changed: false, hungerLoss: 0, damage: 0, source: null, defeated: this.isDefeated() };
    }

    const hungerBefore = this.hunger;
    const healthBefore = this.health;
    const drainPerMinute = Math.max(0, finiteNumber(this.definition.hungerLossPerWorldDay, 0)) / WORLD_DAY_MINUTES;
    let starvationMinutes = this.hunger <= 0 ? minutes : 0;

    if (drainPerMinute > 0 && this.hunger > 0) {
      const minutesToEmpty = this.hunger / drainPerMinute;
      this.hunger = clamp(this.hunger - drainPerMinute * minutes, 0, this.definition.maxHunger);
      if (minutes > minutesToEmpty) starvationMinutes = minutes - minutesToEmpty;
    }

    if (starvationMinutes > 0) {
      const damagePerMinute = Math.max(0, finiteNumber(this.definition.starvationDamagePerWorldHour, 0)) / 60;
      this.health = clamp(this.health - damagePerMinute * starvationMinutes, 0, this.definition.maxHealth);
    }

    const hungerLoss = hungerBefore - this.hunger;
    const damage = healthBefore - this.health;
    return {
      changed: hungerLoss > 0 || damage > 0,
      hungerLoss,
      damage,
      source: damage > 0 ? 'starvation' : null,
      defeated: this.isDefeated()
    };
  }

  applyDamage(amount, { source = 'unknown' } = {}) {
    const requested = Math.max(0, finiteNumber(amount, 0));
    if (requested <= 0 || this.isDefeated()) {
      return { changed: false, damage: 0, source, defeated: this.isDefeated() };
    }

    const before = this.health;
    this.health = clamp(this.health - requested, 0, this.definition.maxHealth);
    return {
      changed: this.health !== before,
      damage: before - this.health,
      source,
      defeated: this.isDefeated()
    };
  }

  restoreHealth(amount) {
    const before = this.health;
    this.health = clamp(this.health + Math.max(0, finiteNumber(amount, 0)), 0, this.definition.maxHealth);
    return this.health - before;
  }

  restoreHunger(amount) {
    const before = this.hunger;
    this.hunger = clamp(this.hunger + Math.max(0, finiteNumber(amount, 0)), 0, this.definition.maxHunger);
    return this.hunger - before;
  }

  recoverAfterDefeat() {
    this.health = clamp(this.definition.recoveryHealth, 1, this.definition.maxHealth);
    this.hunger = clamp(this.definition.recoveryHunger, 0, this.definition.maxHunger);
    return this.getSnapshot();
  }

  captureState() {
    return {
      health: Number(this.health.toFixed(3)),
      hunger: Number(this.hunger.toFixed(3))
    };
  }

  restoreState(state) {
    const health = finiteNumber(state?.health, this.definition.startingHealth);
    const hunger = finiteNumber(state?.hunger, this.definition.startingHunger);
    this.health = clamp(health, 0, this.definition.maxHealth);
    this.hunger = clamp(hunger, 0, this.definition.maxHunger);
    return true;
  }
}

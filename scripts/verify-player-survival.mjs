import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PLAYER_SURVIVAL } from '../src/data/SurvivalDefinitions.js';
import { ANIMAL_DEFINITIONS } from '../src/data/AnimalDefinitions.js';
import { PlayerSurvivalSystem } from '../src/gameplay/PlayerSurvivalSystem.js';

assert.equal(PLAYER_SURVIVAL.maxHealth, 100);
assert.equal(PLAYER_SURVIVAL.maxHunger, 100);
assert.ok(PLAYER_SURVIVAL.hungerLossPerWorldDay > 0);
assert.ok(PLAYER_SURVIVAL.starvationDamagePerWorldHour > 0);
assert.ok(PLAYER_SURVIVAL.lavaDamagePerSecond > 0, 'Lava damage must remain data-driven');

const survival = new PlayerSurvivalSystem();
assert.deepEqual(survival.captureState(), { health: 100, hunger: 100 });

const quarterDay = survival.advanceWorldMinutes(360);
assert.equal(Number(quarterDay.hungerLoss.toFixed(3)), 15);
assert.equal(Number(survival.getSnapshot().hunger.toFixed(3)), 85);
assert.equal(quarterDay.damage, 0);

const wolfDamage = ANIMAL_DEFINITIONS.wolf.ecology.aggression.damage;
assert.ok(wolfDamage > 0, 'Wolf aggression must expose data-driven player damage');
const hit = survival.applyDamage(wolfDamage, { source: 'wolf' });
assert.equal(hit.damage, wolfDamage);
assert.equal(hit.source, 'wolf');
assert.equal(survival.getSnapshot().health, 100 - wolfDamage);

survival.restoreState({ health: 20, hunger: 1 });
const starvation = survival.advanceWorldMinutes(120);
assert.equal(survival.getSnapshot().hunger, 0);
assert.ok(starvation.damage > 0, 'Hunger depletion must cause starvation damage');
assert.ok(survival.getSnapshot().health < 20);

survival.restoreState({ health: -100, hunger: 999 });
assert.equal(survival.getSnapshot().health, 0, 'Restore must clamp health');
assert.equal(survival.getSnapshot().hunger, 100, 'Restore must clamp hunger');
const recovered = survival.recoverAfterDefeat();
assert.equal(recovered.health, PLAYER_SURVIVAL.recoveryHealth);
assert.equal(recovered.hunger, PLAYER_SURVIVAL.recoveryHunger);

const restored = new PlayerSurvivalSystem();
restored.restoreState({ health: 73.5, hunger: 42.25 });
assert.deepEqual(restored.captureState(), { health: 73.5, hunger: 42.25 });

const [gameApp, hud, persistence, animalActor, sleepRuntime, indexHtml, survivalCss] = await Promise.all([
  readFile('src/core/GameApp.js', 'utf8'),
  readFile('src/ui/MobileHud.js', 'utf8'),
  readFile('src/persistence/GameStatePersistence.js', 'utf8'),
  readFile('src/world/WildAnimalActor.js', 'utf8'),
  readFile('src/gameplay/CampfireSleepRuntimeController.js', 'utf8'),
  readFile('index.html', 'utf8'),
  readFile('src/survival.css', 'utf8')
]);

for (const requirement of [
  'this.survival = new PlayerSurvivalSystem()',
  'this.survival?.advanceWorldMinutes',
  'this.survival?.applyDamage',
  '#updateEnvironmentalHazards',
  'getLavaContact',
  "source: 'lava'",
  '#recoverPlayerFromDefeat',
  'setSurvivalVitals'
]) {
  assert.ok(gameApp.includes(requirement), `GameApp is missing survival contract: ${requirement}`);
}

assert.ok(hud.includes('class="survival-vitals"'), 'HUD must render health/hunger bars');
assert.ok(hud.includes('setSurvivalVitals(state)'), 'HUD must expose one survival-vitals rendering boundary');
assert.ok(persistence.includes('survival: game.survival?.captureState?.() ?? null'), 'Save state must persist survival');
assert.ok(persistence.includes('game.survival?.restoreState?.(state.survival)'), 'Save restore must restore survival');
assert.ok(animalActor.includes('damage: Math.max(0, Number(aggression.damage) || 0)'), 'Wildlife attacks must carry configured damage');
assert.ok(sleepRuntime.includes('this.game.survival?.advanceWorldMinutes?.(skippedMinutes)'), 'Sleep skips must still consume hunger');
assert.ok(indexHtml.includes('./src/survival.css'), 'Survival HUD stylesheet must be included');
assert.ok(survivalCss.includes('.survival-vital.health') && survivalCss.includes('.survival-vital.hunger'));
assert.ok(
  survivalCss.includes('left: 50%;')
    && survivalCss.includes('transform: translateX(-50%);')
    && survivalCss.includes('top: max(8px, calc(env(safe-area-inset-top) + 6px));'),
  'Health and hunger must stay centered at the top of the mobile HUD'
);

console.log('Player hunger, damage, persistence, sleep progression and HUD contracts verified.');

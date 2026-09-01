import { WildlifePopulationSystem } from './WildlifePopulationSystem.js';

// Retain the established GameApp-facing name while the implementation now
// manages the island wildlife population instead of one hard-coded Day-1 pig.
export class DayOneHuntSystem extends WildlifePopulationSystem {}

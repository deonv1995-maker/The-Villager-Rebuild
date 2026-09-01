# Wildlife Ecology and Presentation

## Scope

This pass replaces the prototype wildlife presentation and sparse encounter layout without changing terrain generation, Ranger controls, construction, the shipwreck intro, PWA architecture, or the established hunting/loot interfaces.

## Population budget

The mobile-first runtime budget is 37 animals:

| Species | Count | Social layout | Habitat | Default activity |
| --- | ---: | --- | --- | --- |
| Wild Pig | 8 | groups of 2–3 | shoreline / beach edge | scavenging |
| Deer | 10 | groups of 3–5 | open fields | grazing |
| Rabbit | 16 | clusters of 2–4 | forest | grazing / hopping |
| Fox | 2 | solitary | forest | prowling / rabbit hunting |
| Wolf | 1 | solitary | deep forest | prowling / territorial aggression |

`src/data/WildlifePopulationDefinitions.js` is the single source of truth for population counts, group size, grouping radius, spacing, slope limits, and habitat selection.

## Habitat rules

`WildlifePopulationSystem` places social-group anchors first and then resolves members around the anchor. Group spacing applies within a species so different species may share an ecological zone.

- Pigs prefer sand or playable ground immediately beside sampled sand, keeping them close to the shoreline instead of the island interior.
- Deer prefer low-forest-cover, grass-rich open ground.
- Rabbits and foxes prefer forest cover with viable vegetation.
- The wolf uses the strongest forest-cover weighting and is kept to a single deep-forest territorial animal.

The population sampler keeps a Ranger-spawn exclusion radius and terrain slope/playability checks. If a member offset is invalid, it falls back toward its valid group anchor rather than creating an invalid actor.

## Behavior boundaries

`AnimalDefinitions` owns species roles. `WildAnimalActor` executes shared states; it does not contain species-name special cases for normal ecology.

Shared states now include wandering, grazing, scavenging, prowling, fleeing, hunting, chasing and attacking. Deer/rabbits remain prey around the Ranger. Foxes select nearby rabbits as prey and trigger rabbit flight while pursuing them. This pass deliberately does not permanently consume rabbits through autonomous predation so a long session cannot silently empty the forest population.

The wolf is territorial: entering its configured aggro radius starts a chase, and entering attack range creates a wildlife attack event. The Ranger integration applies collision-resolved knockback/stagger feedback rather than inventing a separate health/survival-stat system before that system exists as an authoritative gameplay layer.

## Presentation and animation

`DayOneAnimalPresentation` is the shared visual adapter. It supports both FBX and glTF, skeleton-safe cloning, cached source templates, `AnimationMixer` playback and state-driven clip selection/crossfades.

- Deer, fox and wolf use vendored Quaternius animated glTF assets.
- The existing Qiwii pig remains the authoritative pig model in this pass. Its source model is static, so scavenging and locomotion receive lightweight procedural presentation motion while preserving that production mesh.
- Rabbit remains a lightweight articulated procedural runtime animal to avoid adding another unverified asset source; its head and limbs now animate for hopping/walking, fleeing and grazing instead of the old rigid primitive bob.

Animation lookup is tolerant of source clip naming and maps behavior onto idle, walk, run/gallop, attack and foraging-like clips. When an imported animal lacks a dedicated grazing/eating clip, a small presentation-layer foraging posture makes the state readable without changing ecology logic.

## Asset provenance

The animated deer, fox and wolf are vendored locally from the Quaternius **Ultimate Animated Animal Pack**, released under CC0 1.0. The repository pins the imported source to immutable upstream commit `db3df04d1e4714298a09510b26fb6de6645138a2` and stores the pack license at `licenses/quaternius-ultimate-animated-animals-cc0.txt`.

Uploaded packs were reviewed before use:

- **Oh Deer a Little Family** was not imported because its included license is CC BY-NC-SA and therefore unsuitable for a game that may be sold commercially.
- **EverythingLibrary_Animals_002** was not imported because the uploaded archive did not include sufficient license provenance for production use.
- **Animal QiwiiPack** is compatible with the existing Qiwii pig already in the repository; no redundant competing pig system was added.

## Extension rule

New species should be added through `AnimalDefinitions` and `WildlifePopulationDefinitions`, with presentation assets registered through `AssetPaths`. Predator/prey roles should use the shared ecology interfaces rather than a new parallel AI system. Population increases should be tested on target Android hardware before increasing the current 37-animal budget.

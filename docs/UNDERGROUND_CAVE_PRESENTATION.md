# Underground Cave Presentation

This document records the visual rules for discovered underground pockets.

## Goal

Caves must read as authored places rather than smooth empty blobs or round holes, while preserving the existing tunneling architecture, collision authority, save format and mobile performance boundaries.

The visual direction draws from common cave-composition patterns used in exploration and platform games: asymmetrical silhouettes, strong ceiling/floor contrast, perimeter massing, recognizable focal formations, restrained emissive accents and environmental landmarks. The implementation uses those principles rather than copying any specific game's assets or layouts.

## Ownership boundaries

- `UndergroundTunnelingSystem` remains the authoritative density, excavation, support, ceiling and collision source.
- `UndergroundPocketProfile` is the shared geometric source of truth for deterministic chamber floors, walls and ceilings.
- `UndergroundPocketContentSystem` owns presentation and rewards inside discovered deterministic pockets and must read the shared chamber profile rather than reconstructing its own cave shape.
- Cave dressing must not introduce a second collider, terrain height source, mining system or save authority.
- Content is created only when a pocket is discovered and remains deterministic for the same pocket id.
- New presentation should stay lightweight enough for mobile. Avoid per-pocket dynamic lights, particle systems or unbounded procedural mesh counts unless later profiling proves them safe.

## Chamber silhouette rules

A discovered chamber should combine several layers of shape:

- a broad, explicit horizontal cave floor across the usable chamber instead of the lower half of a sphere;
- rotated elliptical chamber lobes and offset side alcoves so walls do not form a circular bowl;
- a higher crown lobe plus lower side ceilings to create an irregular roof silhouette;
- floor detail: boulders, stalagmites, collectible stone and ruins;
- ceiling detail: deterministic stalactites distributed across the chamber rather than only at the perimeter;
- wall detail: broad irregular rock shelves/masses that break up otherwise smooth chamber walls;
- occasional floor-to-ceiling formations near the edge of the traversable area to create stronger landmarks and depth;
- crystal accents used as focal highlights, not as uniform wallpaper.

The cave-density mesh still determines the real walkable void. The deterministic outer pocket radius is only a broad-phase/chunk boundary; it must never be rendered as the visible chamber shape. Presentation geometry is decorative and should stay toward the chamber perimeter so it does not contradict the collision model.

## Readability

The central content footprint must remain readable for Ranger traversal and interactions. Major decorative formations should cluster toward the outer chamber band. Treasure, Sprout shards and collectible stone continue to use their existing interaction rules and deterministic placement.

Crystals may use emissive materials for visual contrast, but the system should avoid adding point lights by default. This gives caves a stronger visual hierarchy without multiplying mobile lighting cost.

## Future expansion

Future cave biomes may vary materials, crystal palettes, fungal dressing, water, ruins or resource themes through data-driven presentation profiles. Those variants should continue to reuse the same tunneling density and pocket-discovery systems rather than creating biome-specific cave physics.

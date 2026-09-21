# Underground Cave Presentation

This document records the visual rules for discovered underground pockets.

## Goal

Caves must read as authored places rather than smooth empty blobs, while preserving the existing tunneling architecture, collision authority, save format and mobile performance boundaries.

The visual direction draws from common cave-composition patterns used in exploration and platform games: asymmetrical silhouettes, strong ceiling/floor contrast, perimeter massing, recognizable focal formations, restrained emissive accents and environmental landmarks. The implementation uses those principles rather than copying any specific game's assets or layouts.

## Ownership boundaries

- `UndergroundTunnelingSystem` remains the authoritative density, excavation, support, ceiling and collision source.
- `UndergroundPocketContentSystem` owns presentation and rewards inside discovered deterministic pockets.
- Cave dressing must not introduce a second collider, terrain height source, mining system or save authority.
- Content is created only when a pocket is discovered and remains deterministic for the same pocket id.
- New presentation should stay lightweight enough for mobile. Avoid per-pocket dynamic lights, particle systems or unbounded procedural mesh counts unless later profiling proves them safe.

## Chamber silhouette rules

A discovered chamber should combine several layers of shape:

- floor detail: boulders, stalagmites, collectible stone and ruins;
- ceiling detail: deterministic stalactites distributed across the chamber rather than only at the perimeter;
- wall detail: broad irregular rock shelves/masses that break up otherwise smooth chamber walls;
- occasional floor-to-ceiling formations near the edge of the traversable area to create stronger landmarks and depth;
- crystal accents used as focal highlights, not as uniform wallpaper.

The cave-density mesh still determines the real walkable void. Presentation geometry is decorative and should stay toward the chamber perimeter so it does not contradict the collision model.

## Readability

The central content footprint must remain readable for Ranger traversal and interactions. Major decorative formations should cluster toward the outer chamber band. Treasure, Sprout shards and collectible stone continue to use their existing interaction rules and deterministic placement.

Crystals may use emissive materials for visual contrast, but the system should avoid adding point lights by default. This gives caves a stronger visual hierarchy without multiplying mobile lighting cost.

## Future expansion

Future cave biomes may vary materials, crystal palettes, fungal dressing, water, ruins or resource themes through data-driven presentation profiles. Those variants should continue to reuse the same tunneling density and pocket-discovery systems rather than creating biome-specific cave physics.

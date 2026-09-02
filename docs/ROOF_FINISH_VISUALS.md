# Finished thatch roof visuals

Completed thatch panels use a procedural finish inspired by layered hand-laid hay roofs while keeping the existing roof footprint, crafting cost, save identity, and interior-fade behavior intact.

Each panel now contains:

- four overlapping thatch courses with alternating warm straw tones;
- deterministic triangular straw fringe along every course edge;
- a darker underlay that reads as roof thickness between the layers;
- timber fascia along the eave and timber rake trim on exposed gable ends;
- one rounded ridge bundle with three rope ties, owned by the canonical `a` panel so adjoining slopes never duplicate it.

The finish is generated from each panel's existing four corners. Shared multi-bay edges suppress their internal rake trim and meet at the ridge without overlapping cap extensions. The result follows rotated buildings, terrain-adapted frame heights, and every bay produced by the roof topology without introducing a new placement step or save field.

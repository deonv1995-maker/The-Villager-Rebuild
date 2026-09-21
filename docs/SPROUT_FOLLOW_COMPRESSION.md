# Sprout follow/compression transition

Status: **follow model retired; compression retained**.

The previous Sprout implementation continuously followed the Ranger, navigated collision, routed through constructed doors, roamed while idle and automatically collected nearby resources. That locomotion model has been retired in favor of the command-driven companion defined in `SPROUT_COMPANION.md`.

Compression remains an active visual and transactional mechanic. When a command requests a legitimate loose resource, Sprout reserves it through `GatherableSystem`, displays the blue compression transfer, commits the reserved pickup, and only then adds it to the shared `InventorySystem`.

This document is retained so older design references do not imply that follower navigation is still authoritative. New Sprout movement or utility work must use the current stow/deploy/command boundary instead of rebuilding permanent follower pathfinding.

import { RESOURCE_DEFINITIONS } from './ResourceDefinitions.js';
import { TOOL_DEFINITIONS } from './ToolDefinitions.js';

export const CRAFTED_ITEM_DEFINITIONS = Object.freeze(
  Object.fromEntries(Object.values(TOOL_DEFINITIONS).map(tool => [
    tool.id,
    Object.freeze({
      id: tool.id,
      label: tool.label,
      kind: tool.role === 'projectile' || tool.role === 'melee' ? 'weapon' : 'tool'
    })
  ]))
);

export const INVENTORY_RESOURCE_DEFINITIONS = Object.freeze(
  Object.fromEntries(
    Object.entries(RESOURCE_DEFINITIONS).filter(([, definition]) => definition.storage === 'inventory')
  )
);

export const INVENTORY_DEFINITIONS = Object.freeze({
  ...INVENTORY_RESOURCE_DEFINITIONS,
  ...CRAFTED_ITEM_DEFINITIONS
});

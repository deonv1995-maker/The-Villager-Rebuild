const WORK_TARGETS = Object.freeze({
  axe: Object.freeze(new Set(['tree'])),
  pickaxe: Object.freeze(new Set(['rock'])),
  hammer: Object.freeze(new Set(['placed-log', 'campfire']))
});

const WEAPON_TOOLS = Object.freeze(new Set(['spear', 'sword']));
const GENERIC_INTERACTION_TARGETS = Object.freeze(new Set([
  'carcass',
  'physical-resource',
  'resource'
]));

const iconForTool = toolId => toolId ?? 'hand';

export function resolveContextAction({
  carryingLog = false,
  buildPreviewValid = false,
  interactionTarget = null,
  campfireAction = null,
  toolId = null,
  huntTarget = null,
  externalActions = []
} = {}) {
  if (carryingLog) {
    return {
      source: 'interaction',
      available: Boolean(interactionTarget) && Boolean(buildPreviewValid),
      icon: 'hand',
      label: interactionTarget?.actionLabel ?? 'Place carried log',
      caption: 'PLACE'
    };
  }

  if (campfireAction?.previewing) {
    return {
      source: 'campfire',
      available: Boolean(campfireAction.available),
      icon: 'campfire',
      label: campfireAction.label ?? 'Confirm campfire placement',
      caption: 'PLACE'
    };
  }

  const workTargets = WORK_TARGETS[toolId];
  if (workTargets?.has(interactionTarget?.type)) {
    return {
      source: 'interaction',
      available: true,
      icon: toolId,
      label: interactionTarget.actionLabel ?? `${toolId} action`,
      caption: toolId === 'axe' ? 'CHOP' : toolId === 'pickaxe' ? 'MINE' : 'BUILD'
    };
  }

  if (WEAPON_TOOLS.has(toolId) && huntTarget) {
    return {
      source: 'attack',
      available: true,
      icon: toolId,
      label: toolId === 'spear'
        ? `Throw spear at ${huntTarget.label}`
        : `Slash ${huntTarget.label}`,
      caption: toolId === 'spear' ? 'THROW' : 'SLASH'
    };
  }

  if (GENERIC_INTERACTION_TARGETS.has(interactionTarget?.type)) {
    return {
      source: 'interaction',
      available: true,
      icon: interactionTarget?.icon ?? 'hand',
      label: interactionTarget?.actionLabel ?? `Pick up ${interactionTarget?.label ?? 'item'}`,
      caption: interactionTarget?.type === 'carcass' ? 'GATHER' : 'PICK UP'
    };
  }

  const sortedExternal = [...externalActions]
    .filter(action => action?.id)
    .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0));
  if (sortedExternal.length > 0) {
    const action = sortedExternal[0];
    return {
      source: 'external',
      externalId: action.id,
      available: Boolean(action.available),
      icon: action.icon ?? 'hand',
      label: action.label ?? 'Action',
      caption: action.caption ?? 'ACTION'
    };
  }

  if (campfireAction?.available) {
    return {
      source: 'campfire',
      available: true,
      icon: 'campfire',
      label: campfireAction.label ?? 'Preview campfire placement',
      caption: 'BUILD'
    };
  }

  return {
    source: null,
    available: false,
    icon: iconForTool(toolId),
    label: toolId ? 'No action in range' : 'Nothing to interact with',
    caption: 'ACTION'
  };
}

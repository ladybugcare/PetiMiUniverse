import type { ActionDefinition } from './types';

const actions = new Map<string, ActionDefinition>();

export function registerAction(def: ActionDefinition): void {
  if (actions.has(def.id)) {
    throw new Error(`Action already registered: ${def.id}`);
  }
  actions.set(def.id, def);
}

export function getAction(id: string): ActionDefinition | undefined {
  return actions.get(id);
}

export function listActions(): ActionDefinition[] {
  return [...actions.values()];
}

export function clearActionRegistryForTests(): void {
  actions.clear();
}

import {
  registerGroomingActions,
  resetGroomingActionsRegistrationForTests,
} from './grooming/registerGroomingActions';
import {
  registerClinicalActions,
  resetClinicalActionsRegistrationForTests,
} from './clinical/registerClinicalActions';
import { clearActionRegistryForTests } from './registry';

let ready = false;

/** Registra o catálogo da POC (idempotente). */
export function ensureActionsRegistered(): void {
  if (ready) return;
  registerGroomingActions();
  registerClinicalActions();
  ready = true;
}

export function resetActionsRegistrationForTests(): void {
  ready = false;
  resetGroomingActionsRegistrationForTests();
  resetClinicalActionsRegistrationForTests();
  clearActionRegistryForTests();
}

import {
  canCheckInBoardingFromArrival,
  canCheckInClinicalFromArrival,
  canQueueGroomingFromArrival,
  canUpdateParentOnArrival,
  resolvePickupArrivalModule,
  shouldApplyPickupArrival,
} from '../pickupArrival';
import { appointmentStatusForGroomingStage } from '../groomingStages';

describe('pickupArrival (pure)', () => {
  describe('shouldApplyPickupArrival', () => {
    it('dispara em pickup → completed', () => {
      expect(shouldApplyPickupArrival('pickup', 'completed', 'in_transit')).toBe(true);
    });

    it('dispara em clinic_return → completed', () => {
      expect(shouldApplyPickupArrival('clinic_return', 'completed', 'arrived')).toBe(true);
    });

    it('não dispara em delivery', () => {
      expect(shouldApplyPickupArrival('delivery', 'completed', 'arrived')).toBe(false);
    });

    it('não dispara em in_transit', () => {
      expect(shouldApplyPickupArrival('pickup', 'in_transit', 'arrived')).toBe(false);
    });

    it('não redispara se já estava completed', () => {
      expect(shouldApplyPickupArrival('pickup', 'completed', 'completed')).toBe(false);
    });
  });

  describe('resolvePickupArrivalModule', () => {
    it('prioriza appointment_kind de hotel/creche', () => {
      expect(
        resolvePickupArrivalModule({
          appointmentKind: 'hotel_stay',
          serviceGroups: ['banho_tosa'],
        }),
      ).toBe('boarding');
      expect(
        resolvePickupArrivalModule({ appointmentKind: 'daycare_block', serviceGroups: [] }),
      ).toBe('boarding');
    });

    it('roteia clínica / internação / cirurgia', () => {
      expect(resolvePickupArrivalModule({ serviceGroups: ['clinica'] })).toBe('clinical');
      expect(resolvePickupArrivalModule({ serviceGroups: ['internacao'] })).toBe('clinical');
      expect(resolvePickupArrivalModule({ serviceGroups: ['cirurgia'] })).toBe('clinical');
    });

    it('roteia banho e tosa', () => {
      expect(resolvePickupArrivalModule({ serviceGroups: ['banho_tosa'] })).toBe('grooming');
    });

    it('roteia hotel/creche por service_group', () => {
      expect(resolvePickupArrivalModule({ serviceGroups: ['hotel'] })).toBe('boarding');
      expect(resolvePickupArrivalModule({ serviceGroups: ['creche'] })).toBe('boarding');
    });

    it('retorna null sem módulo operacional', () => {
      expect(resolvePickupArrivalModule({ serviceGroups: ['leva_traz'] })).toBeNull();
      expect(resolvePickupArrivalModule({ serviceGroups: [] })).toBeNull();
    });

    it('prioriza clínica sobre banho quando ambos estão nas linhas', () => {
      expect(
        resolvePickupArrivalModule({ serviceGroups: ['banho_tosa', 'clinica'] }),
      ).toBe('clinical');
    });
  });

  describe('guards de não-regressão', () => {
    it('não atualiza pai terminal', () => {
      expect(canUpdateParentOnArrival('cancelled')).toBe(false);
      expect(canUpdateParentOnArrival('done')).toBe(false);
      expect(canUpdateParentOnArrival('paid')).toBe(false);
      expect(canUpdateParentOnArrival('confirmed')).toBe(true);
    });

    it('só enfileira grooming em scheduled/checked_in/queued', () => {
      expect(canQueueGroomingFromArrival('scheduled')).toBe(true);
      expect(canQueueGroomingFromArrival('checked_in')).toBe(true);
      expect(canQueueGroomingFromArrival('queued')).toBe(true);
      expect(canQueueGroomingFromArrival('in_service')).toBe(false);
      expect(canQueueGroomingFromArrival('ready')).toBe(false);
    });

    it('só check-in clínico em pending/confirmed/checked_in', () => {
      expect(canCheckInClinicalFromArrival('confirmed')).toBe(true);
      expect(canCheckInClinicalFromArrival('checked_in')).toBe(true);
      expect(canCheckInClinicalFromArrival('in_progress')).toBe(false);
      expect(canCheckInClinicalFromArrival('done')).toBe(false);
    });

    it('só check-in boarding em reserved/checked_in', () => {
      expect(canCheckInBoardingFromArrival('reserved')).toBe(true);
      expect(canCheckInBoardingFromArrival('checked_in')).toBe(true);
      expect(canCheckInBoardingFromArrival('checked_out')).toBe(false);
      expect(canCheckInBoardingFromArrival('cancelled')).toBe(false);
    });
  });
});

describe('appointmentStatusForGroomingStage (chegada L&T)', () => {
  it('mapeia fila (queued/checked_in) para agenda checked_in', () => {
    expect(appointmentStatusForGroomingStage('checked_in')).toBe('checked_in');
    expect(appointmentStatusForGroomingStage('queued')).toBe('checked_in');
  });

  it('mapeia serviço ativo para in_progress', () => {
    expect(appointmentStatusForGroomingStage('in_service')).toBe('in_progress');
    expect(appointmentStatusForGroomingStage('finishing')).toBe('in_progress');
  });
});

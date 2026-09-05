import { getRoleDisplayName, hasPermission, hasEffectivePermission, isClinicAdminRole, type Role } from '../permissions';

describe('permissions', () => {
  describe('hasPermission', () => {
    it('CADMIN tem qualquer permissão Hub', () => {
      expect(hasPermission('CADMIN', 'hub.financial.write')).toBe(true);
    });

    it('CASSISTANT não tem hub.financial.write', () => {
      expect(hasPermission('CASSISTANT', 'hub.financial.write')).toBe(false);
    });

    it('CASSISTANT tem permissões de caixa (recepção + caixa)', () => {
      expect(hasPermission('CASSISTANT', 'hub.financial.read')).toBe(true);
      expect(hasPermission('CASSISTANT', 'hub.cash.session')).toBe(true);
      expect(hasPermission('CASSISTANT', 'hub.cash.receive')).toBe(true);
      expect(hasPermission('CASSISTANT', 'hub.receivables.create')).toBe(true);
    });

    it('CFINANCE tem hub.cash.receive', () => {
      expect(hasPermission('CFINANCE', 'hub.cash.receive')).toBe(true);
    });

    it('CVET_INTERNAL não vê caixa nem financeiro', () => {
      expect(hasPermission('CVET_INTERNAL', 'hub.clinic.write')).toBe(true);
      expect(hasPermission('CVET_INTERNAL', 'hub.financial.read')).toBe(false);
      expect(hasPermission('CVET_INTERNAL', 'hub.receivables.create')).toBe(false);
      expect(hasPermission('CVET_INTERNAL', 'hub.cash.session')).toBe(false);
    });

    it('CGROOMER não tem hub.financial.write', () => {
      expect(hasPermission('CGROOMER', 'hub.financial.write')).toBe(false);
    });

    it('role inválido retorna false', () => {
      expect(hasPermission('INVALID' as Role, 'hub.pets.read')).toBe(false);
    });
  });

  describe('hasEffectivePermission', () => {
    it('une permissões do papel com as das áreas operacionais', () => {
      expect(hasEffectivePermission('CGROOMER', 'hub.clinic.read', ['clinica'])).toBe(true);
      expect(hasEffectivePermission('CGROOMER', 'hub.clinic.read', [])).toBe(false);
    });

    it('área leva_traz concede execução (sem manage) para CSTAFF', () => {
      expect(hasEffectivePermission('CSTAFF', 'pickup.routes.read', ['leva_traz'])).toBe(true);
      expect(hasEffectivePermission('CSTAFF', 'pickup.stops.update', ['leva_traz'])).toBe(true);
      expect(hasEffectivePermission('CSTAFF', 'pickup.routes.manage', ['leva_traz'])).toBe(false);
    });

    it('área banho_tosa concede fila de grooming para CSTAFF', () => {
      expect(hasEffectivePermission('CSTAFF', 'grooming.queue.manage', ['banho_tosa'])).toBe(true);
      expect(hasEffectivePermission('CSTAFF', 'hub.pets.read', ['banho_tosa'])).toBe(true);
      expect(hasEffectivePermission('CSTAFF', 'hub.clinic.write', ['banho_tosa'])).toBe(false);
    });

    it('CSTAFF sozinho não tem módulos operacionais', () => {
      expect(hasPermission('CSTAFF', 'pickup.routes.read')).toBe(false);
      expect(hasPermission('CSTAFF', 'unit.view')).toBe(true);
    });
  });

  describe('isClinicAdminRole', () => {
    it('reconhece CADMIN case-insensitive', () => {
      expect(isClinicAdminRole('cadmin')).toBe(true);
    });

    it('retorna false para roles não admin', () => {
      expect(isClinicAdminRole('CASSISTANT')).toBe(false);
      expect(isClinicAdminRole(undefined)).toBe(false);
    });
  });

  describe('getRoleDisplayName', () => {
    it('retorna label pt-BR para CADMIN', () => {
      expect(getRoleDisplayName('CADMIN')).toBe('Administrador da Clínica');
    });

    it('retorna o próprio role quando desconhecido', () => {
      expect(getRoleDisplayName('UNKNOWN' as Role)).toBe('UNKNOWN');
    });
  });
});

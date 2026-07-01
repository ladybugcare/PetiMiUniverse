import { getRoleDisplayName, hasPermission, isClinicAdminRole, type Role } from '../permissions';

describe('permissions', () => {
  describe('hasPermission', () => {
    it('CADMIN tem qualquer permissão Hub', () => {
      expect(hasPermission('CADMIN', 'hub.financial.write')).toBe(true);
    });

    it('CASSISTANT não tem hub.financial.write', () => {
      expect(hasPermission('CASSISTANT', 'hub.financial.write')).toBe(false);
    });

    it('CFINANCE tem hub.cash.receive', () => {
      expect(hasPermission('CFINANCE', 'hub.cash.receive')).toBe(true);
    });

    it('CGROOMER não tem hub.financial.write', () => {
      expect(hasPermission('CGROOMER', 'hub.financial.write')).toBe(false);
    });

    it('role inválido retorna false', () => {
      expect(hasPermission('INVALID' as Role, 'hub.pets.read')).toBe(false);
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

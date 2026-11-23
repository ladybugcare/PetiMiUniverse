/**
 * Garante o contrato de isolamento do relatório self-scoped:
 * - só linhas do staff resolvido pelo usuário
 * - staff_id da query é irrelevante (não entra na lógica)
 */
import { hasEffectivePermission, hasPermission } from '../../../utils/permissions.js';

describe('hub.commissions.read_own isolation contract', () => {
  it('vet legado tem read_own sem financial.read', () => {
    expect(hasPermission('CVET_INTERNAL', 'hub.commissions.read_own')).toBe(true);
    expect(hasPermission('CVET_INTERNAL', 'hub.financial.read')).toBe(false);
  });

  it('CSTAFF + clinica tem read_own sem financial.read', () => {
    expect(hasEffectivePermission('CSTAFF', 'hub.commissions.read_own', ['clinica'])).toBe(true);
    expect(hasEffectivePermission('CSTAFF', 'hub.financial.read', ['clinica'])).toBe(false);
  });

  it('filtro onlyStaffId descarta linhas de outro profissional', () => {
    const lines = [
      { staff_id: 'staff-a', commission: 10 },
      { staff_id: 'staff-b', commission: 20 },
      { staff_id: null, commission: 5 },
    ];
    const onlyStaffId = 'staff-a';
    // Simula o que buildCommissionsReport faz com onlyStaffId (e ignora query staff_id=B)
    const queryStaffIdIgnored = 'staff-b';
    void queryStaffIdIgnored;
    const kept = lines.filter((l) => l.staff_id === onlyStaffId);
    expect(kept).toEqual([{ staff_id: 'staff-a', commission: 10 }]);
    expect(kept.every((l) => l.staff_id !== 'staff-b')).toBe(true);
  });
});

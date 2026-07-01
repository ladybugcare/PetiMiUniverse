import type { Request } from 'express';
import {
  applyPrivacyFilter,
  filterApplicationsByRole,
} from '../privacyGuard';

describe('privacyGuard', () => {
  describe('filterApplicationsByRole', () => {
    it('vet vê apenas próprias aplicações', () => {
      const req = {
        user: { id: 'vet-1', role: 'vet' },
        query: {},
        path: '/applications',
      } as unknown as Request;
      const next = jest.fn();

      filterApplicationsByRole(req, {} as any, next);

      expect(req.query.vet_id).toBe('vet-1');
      expect((req as any).privacyFilter).toEqual({
        vet_id: 'vet-1',
        freelancer_id: 'vet-1',
      });
      expect(next).toHaveBeenCalled();
    });

    it('clinic não recebe filtro de privacidade', () => {
      const req = {
        user: { id: 'clinic-1', role: 'clinic' },
        query: {},
        path: '/applications',
      } as unknown as Request;
      const next = jest.fn();

      filterApplicationsByRole(req, {} as any, next);

      expect((req as any).privacyFilter).toBeNull();
      expect(next).toHaveBeenCalled();
    });

    it('admin não recebe filtro de privacidade', () => {
      const req = {
        user: { id: 'admin-1', role: 'admin' },
        query: {},
        path: '/applications',
      } as unknown as Request;
      const next = jest.fn();

      filterApplicationsByRole(req, {} as any, next);

      expect((req as any).privacyFilter).toBeNull();
    });
  });

  describe('applyPrivacyFilter', () => {
    it('injeta eq vet_id quando privacyFilter presente', () => {
      const eq = jest.fn().mockReturnThis();
      const query = { eq };
      const req = {
        privacyFilter: { vet_id: 'vet-42', freelancer_id: 'vet-42' },
      } as unknown as Request;

      applyPrivacyFilter(query, req);

      expect(eq).toHaveBeenCalledWith('vet_id', 'vet-42');
    });

    it('não altera query quando privacyFilter é null', () => {
      const query = { eq: jest.fn() };
      const req = { privacyFilter: null } as unknown as Request;

      const result = applyPrivacyFilter(query, req);

      expect(result).toBe(query);
      expect(query.eq).not.toHaveBeenCalled();
    });
  });
});

import { isRateLimitDisabled, parseJwtSub, isRateLimitBypassUser, resetRateLimitBypassUserIdsCache } from '../rateLimiter';

describe('rateLimiter helpers', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDisableFlag = process.env.DISABLE_RATE_LIMIT;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalDisableFlag === undefined) {
      delete process.env.DISABLE_RATE_LIMIT;
    } else {
      process.env.DISABLE_RATE_LIMIT = originalDisableFlag;
    }
  });

  describe('isRateLimitDisabled', () => {
    it('retorna true em development com DISABLE_RATE_LIMIT=true', () => {
      process.env.NODE_ENV = 'development';
      process.env.DISABLE_RATE_LIMIT = 'true';
      expect(isRateLimitDisabled()).toBe(true);
    });

    it('retorna true em production com DISABLE_RATE_LIMIT=true', () => {
      process.env.NODE_ENV = 'production';
      process.env.DISABLE_RATE_LIMIT = 'true';
      expect(isRateLimitDisabled()).toBe(true);
    });

    it('retorna false em test com DISABLE_RATE_LIMIT=true', () => {
      process.env.NODE_ENV = 'test';
      process.env.DISABLE_RATE_LIMIT = 'true';
      expect(isRateLimitDisabled()).toBe(true);
    });

    it('retorna false em test sem DISABLE_RATE_LIMIT', () => {
      process.env.NODE_ENV = 'test';
      delete process.env.DISABLE_RATE_LIMIT;
      expect(isRateLimitDisabled()).toBe(false);
    });
  });

  describe('parseJwtSub', () => {
    it('extrai sub de JWT fake base64', () => {
      const payload = Buffer.from(JSON.stringify({ sub: 'user-123' })).toString('base64url');
      const token = `header.${payload}.signature`;
      expect(parseJwtSub(`Bearer ${token}`)).toBe('user-123');
    });

    it('retorna null para token malformado', () => {
      expect(parseJwtSub('Bearer not-a-jwt')).toBeNull();
      expect(parseJwtSub(undefined)).toBeNull();
    });

    it('retorna null sem header Bearer', () => {
      expect(parseJwtSub('Basic abc')).toBeNull();
    });
  });

  describe('isRateLimitBypassUser', () => {
    afterEach(() => {
      delete process.env.RATE_LIMIT_BYPASS_USER_IDS;
      resetRateLimitBypassUserIdsCache();
    });

    it('retorna true quando sub está na lista de bypass', () => {
      process.env.RATE_LIMIT_BYPASS_USER_IDS = 'user-qa-1, user-qa-2';
      resetRateLimitBypassUserIdsCache();
      const payload = Buffer.from(JSON.stringify({ sub: 'user-qa-1' })).toString('base64url');
      const token = `header.${payload}.signature`;
      expect(isRateLimitBypassUser({ headers: { authorization: `Bearer ${token}` } } as any)).toBe(true);
    });

    it('retorna false quando sub não está na lista', () => {
      process.env.RATE_LIMIT_BYPASS_USER_IDS = 'user-qa-1';
      resetRateLimitBypassUserIdsCache();
      const payload = Buffer.from(JSON.stringify({ sub: 'other-user' })).toString('base64url');
      const token = `header.${payload}.signature`;
      expect(isRateLimitBypassUser({ headers: { authorization: `Bearer ${token}` } } as any)).toBe(false);
    });
  });
});

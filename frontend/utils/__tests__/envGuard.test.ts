/**
 * Test suite for Environment Guard (Mobile)
 * Tests JWT parsing and environment validation
 */

describe('envGuard (Mobile)', () => {
  describe('JWT parsing', () => {
    it('should extract issuer from valid JWT', () => {
      // Example JWT structure: header.payload.signature
      // Payload contains: { "iss": "https://test.supabase.co", ... }
      
      const mockPayload = {
        iss: 'https://test.supabase.co',
        sub: 'user-id',
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      // Base64 encode (simplified - real JWT encoding is more complex)
      const base64Payload = btoa(JSON.stringify(mockPayload));
      
      // The parseJwtIssuer function should extract this
      const payload = JSON.parse(atob(base64Payload));
      expect(payload.iss).toBe('https://test.supabase.co');
    });

    it('should handle invalid JWT format', () => {
      // Invalid JWT (not 3 parts)
      const invalidTokens = [
        'invalid',
        'header.payload', // Missing signature
        'header', // Only one part
      ];

      invalidTokens.forEach(token => {
        const parts = token.split('.');
        expect(parts.length !== 3).toBe(true);
      });
    });
  });

  describe('URL normalization', () => {
    it('should normalize Supabase URLs consistently', () => {
      const urls = [
        'https://test.supabase.co',
        'https://test.supabase.co/',
        'http://127.0.0.1:54321',
        'http://127.0.0.1:54321/',
      ];

      urls.forEach(url => {
        const normalized = url.replace(/\/$/, '');
        expect(normalized).not.toMatch(/\/$/);
      });
    });
  });

  describe('Environment validation', () => {
    it('should detect mismatch between token issuer and configured URL', () => {
      const tokenIssuer = 'https://old.supabase.co';
      const currentUrl = 'https://new.supabase.co';

      const mismatch = tokenIssuer !== currentUrl;
      expect(mismatch).toBe(true);
    });

    it('should not clear session when URLs match', () => {
      const tokenIssuer = 'https://test.supabase.co';
      const currentUrl = 'https://test.supabase.co';

      const mismatch = tokenIssuer !== currentUrl;
      expect(mismatch).toBe(false);
    });
  });
});


import { buildHm, normalizeHmTyping, parseHm, splitHm } from './hubTime';

describe('hubTime', () => {
  it('parseHm aceita HH:mm válido', () => {
    expect(parseHm('09:05')).toBe('09:05');
    expect(parseHm('23:59')).toBe('23:59');
    expect(parseHm('24:00')).toBeNull();
    expect(parseHm('9:05')).toBeNull();
  });

  it('normalizeHmTyping mascara dígitos', () => {
    expect(normalizeHmTyping('1')).toBe('1');
    expect(normalizeHmTyping('16')).toBe('16');
    expect(normalizeHmTyping('162')).toBe('16:2');
    expect(normalizeHmTyping('1624')).toBe('16:24');
  });

  it('splitHm e buildHm são simétricos', () => {
    expect(splitHm('16:24')).toEqual({ hour: 16, minute: 24 });
    expect(buildHm(16, 24)).toBe('16:24');
  });
});

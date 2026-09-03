import { familyShareForPet, splitFamilyPlanAmounts } from '../hubSpecialPrices';

describe('hubSpecialPrices rateio', () => {
  it('divide total em partes iguais em centavos', () => {
    expect(splitFamilyPlanAmounts(150, 6)).toEqual([25, 25, 25, 25, 25, 25]);
  });

  it('distribui resto de centavos nos primeiros pets', () => {
    expect(splitFamilyPlanAmounts(100, 3)).toEqual([33.34, 33.33, 33.33]);
  });

  it('familyShareForPet usa o índice', () => {
    expect(familyShareForPet(100, 3, 0)).toBe(33.34);
    expect(familyShareForPet(100, 3, 2)).toBe(33.33);
  });
});

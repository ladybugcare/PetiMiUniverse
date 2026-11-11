import { comandaOriginSchema } from '../hubComandaSchemas';
import { financeSourceTypeSchema, receivableSourceTypeSchema } from '../hubFinanceSchemas';

describe('hub finance schemas', () => {
  it('comandaOriginSchema aceita boarding_reservation', () => {
    expect(comandaOriginSchema.safeParse('boarding_reservation').success).toBe(true);
  });

  it('financeSourceTypeSchema aceita boarding_reservation', () => {
    expect(financeSourceTypeSchema.safeParse('boarding_reservation').success).toBe(true);
  });

  it('financeSourceTypeSchema aceita hospitalization (preview/unbilled/waive)', () => {
    expect(financeSourceTypeSchema.safeParse('hospitalization').success).toBe(true);
  });

  it('receivableSourceTypeSchema aceita boarding_reservation', () => {
    expect(receivableSourceTypeSchema.safeParse('boarding_reservation').success).toBe(true);
  });

  it('receivableSourceTypeSchema rejeita hospitalization (comanda via encounter/appointment)', () => {
    expect(receivableSourceTypeSchema.safeParse('hospitalization').success).toBe(false);
  });
});

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const hubComandaSchemas_1 = require("../hubComandaSchemas");
const hubFinanceSchemas_1 = require("../hubFinanceSchemas");
describe('hub finance schemas', () => {
    it('comandaOriginSchema aceita boarding_reservation', () => {
        expect(hubComandaSchemas_1.comandaOriginSchema.safeParse('boarding_reservation').success).toBe(true);
    });
    it('financeSourceTypeSchema aceita boarding_reservation', () => {
        expect(hubFinanceSchemas_1.financeSourceTypeSchema.safeParse('boarding_reservation').success).toBe(true);
    });
    it('receivableSourceTypeSchema aceita boarding_reservation', () => {
        expect(hubFinanceSchemas_1.receivableSourceTypeSchema.safeParse('boarding_reservation').success).toBe(true);
    });
});

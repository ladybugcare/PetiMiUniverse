"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.receivableSourceTypeSchema = exports.financeSourceTypeSchema = void 0;
const zod_1 = require("zod");
exports.financeSourceTypeSchema = zod_1.z.enum([
    'grooming_session',
    'encounter',
    'quote',
    'appointment',
    'boarding_reservation',
]);
exports.receivableSourceTypeSchema = zod_1.z.enum([
    'grooming_session',
    'encounter',
    'quote',
    'appointment',
    'boarding_reservation',
    'manual',
]);

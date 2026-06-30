"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.comandaOriginSchema = void 0;
const zod_1 = require("zod");
exports.comandaOriginSchema = zod_1.z.enum([
    'appointment',
    'grooming_session',
    'quote',
    'encounter',
    'manual',
    'boarding_reservation',
]);

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TEST_RESERVATION_ID = exports.TEST_PET_ID = exports.TEST_GUARDIAN_ID = exports.TEST_UNIT_ID = exports.TEST_CLINIC_ID = exports.TEST_USER_ID = void 0;
exports.installAuthMocks = installAuthMocks;
exports.TEST_USER_ID = '11111111-1111-4111-8111-111111111111';
exports.TEST_CLINIC_ID = '22222222-2222-4222-8222-222222222222';
exports.TEST_UNIT_ID = '33333333-3333-4333-8333-333333333333';
exports.TEST_GUARDIAN_ID = '44444444-4444-4444-8444-444444444444';
exports.TEST_PET_ID = '55555555-5555-4555-8555-555555555555';
exports.TEST_RESERVATION_ID = '66666666-6666-4666-8666-666666666666';
function installAuthMocks() {
    jest.mock('../../middleware/authMiddleware', () => ({
        authenticateUser: (req, _res, next) => {
            req.user = { id: exports.TEST_USER_ID, email: 'test@test.com', role: 'CADMIN' };
            next();
        },
        requirePermission: () => (_req, _res, next) => next(),
        requireClinicAccess: (_req, _res, next) => next(),
        checkPermission: async () => true,
        checkClinicAccess: async () => true,
    }));
}

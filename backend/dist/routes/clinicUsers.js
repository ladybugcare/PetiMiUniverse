"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const clinicUsersController_1 = require("../controllers/clinicUsersController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
// Invite user
router.post('/invite', authMiddleware_1.authenticateUser, clinicUsersController_1.inviteUser);
// Accept invitation
router.post('/accept-invitation', authMiddleware_1.authenticateUser, clinicUsersController_1.acceptInvitation);
// Get clinic users
router.get('/', authMiddleware_1.authenticateUser, clinicUsersController_1.getClinicUsers);
// Get user's clinic info
router.get('/me/:clinic_id', authMiddleware_1.authenticateUser, clinicUsersController_1.getUserClinicInfo);
// Update user role
router.patch('/:clinic_user_id/role', authMiddleware_1.authenticateUser, clinicUsersController_1.updateUserRole);
// Remove user
router.delete('/:clinic_user_id', authMiddleware_1.authenticateUser, clinicUsersController_1.removeUser);
// Get pending invitations
router.get('/invitations/pending', authMiddleware_1.authenticateUser, clinicUsersController_1.getPendingInvitations);
// Cancel invitation
router.patch('/invitations/:invitation_id/cancel', authMiddleware_1.authenticateUser, clinicUsersController_1.cancelInvitation);
exports.default = router;

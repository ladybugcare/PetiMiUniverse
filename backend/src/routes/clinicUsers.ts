import express from 'express';
import {
  inviteUser,
  acceptInvitation,
  getClinicUsers,
  getUserClinicInfo,
  updateUserRole,
  removeUser,
  getPendingInvitations,
  cancelInvitation,
} from '../controllers/clinicUsersController';
import { authenticateUser } from '../middleware/authMiddleware';

const router = express.Router();

// Invite user
router.post('/invite', authenticateUser, inviteUser);

// Accept invitation
router.post('/accept-invitation', authenticateUser, acceptInvitation);

// Get clinic users
router.get('/', authenticateUser, getClinicUsers);

// Get user's clinic info
router.get('/me/:clinic_id', authenticateUser, getUserClinicInfo);

// Update user role
router.patch('/:clinic_user_id/role', authenticateUser, updateUserRole);

// Remove user
router.delete('/:clinic_user_id', authenticateUser, removeUser);

// Get pending invitations
router.get('/invitations/pending', authenticateUser, getPendingInvitations);

// Cancel invitation
router.patch('/invitations/:invitation_id/cancel', authenticateUser, cancelInvitation);

export default router;


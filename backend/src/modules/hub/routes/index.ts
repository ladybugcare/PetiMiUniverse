import { Router } from 'express';
import { authenticateUser, requirePermission } from '../../../middleware/authMiddleware';
import {
  listHubGuardians,
  createHubGuardian,
  updateHubGuardian,
  getHubGuardianStats,
  getHubGuardianById,
} from '../guardiansController';
import { listHubPets, createHubPet, updateHubPet } from '../hubPetsController';
import {
  listHubServiceTypes,
  createHubServiceType,
  updateHubServiceType,
  bootstrapHubServiceTypes,
} from '../hubServiceTypesController';
import {
  listHubSuppliers,
  createHubSupplier,
  patchHubSupplier,
  listHubManufacturers,
  createHubManufacturer,
  patchHubManufacturer,
  listHubInventoryItems,
  createHubInventoryItem,
  patchHubInventoryItem,
  listHubStockMovements,
  createHubStockMovement,
  listHubExpiringLots,
  listHubLowStock,
  listHubInventoryLots,
} from '../hubInventoryController';
import { listHubStaff, getHubStaff, createHubStaff, patchHubStaff, inviteHubStaff } from '../hubStaffController';
import { postHubStaffPhoto } from '../hubStaffPhotoController';
import {
  listHubAppointments,
  createHubAppointment,
  patchHubAppointment,
  listHubAgendaCalendarBlocks,
  upsertHubAgendaCalendarBlock,
  deleteHubAgendaCalendarBlock,
} from '../hubAppointmentsController';

/**
 * PetMi Hub API — rotas do sistema operacional do negócio pet.
 * Prefixo montado em app.ts: `/api/hub`.
 */
const router = Router();

router.get('/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    product: 'hub',
    message: 'Hub API module mounted',
  });
});

router.get(
  '/guardians/stats',
  authenticateUser,
  requirePermission('hub.guardians.read'),
  getHubGuardianStats
);

router.get(
  '/guardians/:id',
  authenticateUser,
  requirePermission('hub.guardians.read'),
  getHubGuardianById
);

router.get(
  '/guardians',
  authenticateUser,
  requirePermission('hub.guardians.read'),
  listHubGuardians
);

router.post(
  '/guardians',
  authenticateUser,
  requirePermission('hub.guardians.write'),
  createHubGuardian
);

router.patch(
  '/guardians/:id',
  authenticateUser,
  requirePermission('hub.guardians.write'),
  updateHubGuardian
);

router.get('/pets', authenticateUser, requirePermission('hub.pets.read'), listHubPets);

router.post('/pets', authenticateUser, requirePermission('hub.pets.write'), createHubPet);

router.patch('/pets/:id', authenticateUser, requirePermission('hub.pets.write'), updateHubPet);

router.get(
  '/service-types',
  authenticateUser,
  requirePermission('hub.service_types.read'),
  listHubServiceTypes
);

router.post(
  '/service-types',
  authenticateUser,
  requirePermission('hub.service_types.write'),
  createHubServiceType
);

router.patch(
  '/service-types/:id',
  authenticateUser,
  requirePermission('hub.service_types.write'),
  updateHubServiceType
);

router.post(
  '/service-types/bootstrap',
  authenticateUser,
  requirePermission('hub.service_types.write'),
  bootstrapHubServiceTypes
);

/* --- Inventário / Estoque --- */
router.get('/inventory/suppliers', authenticateUser, requirePermission('hub.inventory.read'), listHubSuppliers);
router.post('/inventory/suppliers', authenticateUser, requirePermission('hub.inventory.write'), createHubSupplier);
router.patch('/inventory/suppliers/:id', authenticateUser, requirePermission('hub.inventory.write'), patchHubSupplier);

router.get('/inventory/manufacturers', authenticateUser, requirePermission('hub.inventory.read'), listHubManufacturers);
router.post('/inventory/manufacturers', authenticateUser, requirePermission('hub.inventory.write'), createHubManufacturer);
router.patch('/inventory/manufacturers/:id', authenticateUser, requirePermission('hub.inventory.write'), patchHubManufacturer);

router.get('/inventory/items', authenticateUser, requirePermission('hub.inventory.read'), listHubInventoryItems);
router.post('/inventory/items', authenticateUser, requirePermission('hub.inventory.write'), createHubInventoryItem);
router.patch('/inventory/items/:id', authenticateUser, requirePermission('hub.inventory.write'), patchHubInventoryItem);

router.get('/inventory/movements', authenticateUser, requirePermission('hub.inventory.read'), listHubStockMovements);
router.post('/inventory/movements', authenticateUser, requirePermission('hub.inventory.write'), createHubStockMovement);

router.get('/inventory/lots', authenticateUser, requirePermission('hub.inventory.read'), listHubInventoryLots);
router.get('/inventory/lots/expiring', authenticateUser, requirePermission('hub.inventory.read'), listHubExpiringLots);
router.get('/inventory/reports/low-stock', authenticateUser, requirePermission('hub.inventory.read'), listHubLowStock);

/* --- Equipe / Staff --- */
router.get('/staff', authenticateUser, requirePermission('hub.staff.read'), listHubStaff);
router.post(
  '/staff/photo',
  authenticateUser,
  requirePermission('hub.staff.write'),
  postHubStaffPhoto
);
router.post('/staff', authenticateUser, requirePermission('hub.staff.write'), createHubStaff);
router.get('/staff/:id', authenticateUser, requirePermission('hub.staff.read'), getHubStaff);
router.patch('/staff/:id', authenticateUser, requirePermission('hub.staff.write'), patchHubStaff);
router.post('/staff/:id/invite', authenticateUser, requirePermission('hub.staff.invite'), inviteHubStaff);

/* --- Agenda / Agendamentos --- */
router.get(
  '/appointments/calendar-blocks',
  authenticateUser,
  requirePermission('hub.appointments.read'),
  listHubAgendaCalendarBlocks
);
router.post(
  '/appointments/calendar-blocks',
  authenticateUser,
  requirePermission('hub.appointments.write'),
  upsertHubAgendaCalendarBlock
);
router.delete(
  '/appointments/calendar-blocks/:id',
  authenticateUser,
  requirePermission('hub.appointments.write'),
  deleteHubAgendaCalendarBlock
);
router.get('/appointments', authenticateUser, requirePermission('hub.appointments.read'), listHubAppointments);
router.post('/appointments', authenticateUser, requirePermission('hub.appointments.write'), createHubAppointment);
router.patch('/appointments/:id', authenticateUser, requirePermission('hub.appointments.write'), patchHubAppointment);

export default router;

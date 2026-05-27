"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../../../middleware/authMiddleware");
const guardiansController_1 = require("../guardiansController");
const hubPetsController_1 = require("../hubPetsController");
const hubServiceTypesController_1 = require("../hubServiceTypesController");
const hubServiceGroupsController_1 = require("../hubServiceGroupsController");
const hubInventoryController_1 = require("../hubInventoryController");
const hubStaffController_1 = require("../hubStaffController");
const hubStaffPhotoController_1 = require("../hubStaffPhotoController");
const hubAppointmentsController_1 = require("../hubAppointmentsController");
const hubClinicSettingsController_1 = require("../hubClinicSettingsController");
const hubProspectsController_1 = require("../hubProspectsController");
const hubQuotesController_1 = require("../hubQuotesController");
/**
 * PetMi Hub API — rotas do sistema operacional do negócio pet.
 * Prefixo montado em app.ts: `/api/hub`.
 */
const router = (0, express_1.Router)();
router.get('/health', (_req, res) => {
    res.status(200).json({
        ok: true,
        product: 'hub',
        message: 'Hub API module mounted',
    });
});
router.get('/guardians/stats', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.guardians.read'), guardiansController_1.getHubGuardianStats);
router.get('/guardians/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.guardians.read'), guardiansController_1.getHubGuardianById);
router.get('/guardians', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.guardians.read'), guardiansController_1.listHubGuardians);
router.post('/guardians', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.guardians.write'), guardiansController_1.createHubGuardian);
router.patch('/guardians/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.guardians.write'), guardiansController_1.updateHubGuardian);
router.get('/clinic-settings', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.appointments.read'), hubClinicSettingsController_1.getHubClinicSettings);
router.patch('/clinic-settings', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.appointments.write'), hubClinicSettingsController_1.patchHubClinicSettings);
router.get('/pets', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.pets.read'), hubPetsController_1.listHubPets);
router.post('/pets', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.pets.write'), hubPetsController_1.createHubPet);
router.patch('/pets/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.pets.write'), hubPetsController_1.updateHubPet);
router.get('/service-types', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.service_types.read'), hubServiceTypesController_1.listHubServiceTypes);
router.post('/service-types', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.service_types.write'), hubServiceTypesController_1.createHubServiceType);
router.patch('/service-types/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.service_types.write'), hubServiceTypesController_1.updateHubServiceType);
router.post('/service-types/bootstrap', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.service_types.write'), hubServiceTypesController_1.bootstrapHubServiceTypes);
router.get('/service-groups', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.service_types.read'), hubServiceGroupsController_1.listHubServiceGroups);
router.post('/service-groups', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.service_types.write'), hubServiceGroupsController_1.createHubServiceGroup);
router.patch('/service-groups/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.service_types.write'), hubServiceGroupsController_1.patchHubServiceGroup);
router.delete('/service-groups/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.service_types.write'), hubServiceGroupsController_1.deleteHubServiceGroup);
/* --- Inventário / Estoque --- */
router.get('/inventory/suppliers', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.inventory.read'), hubInventoryController_1.listHubSuppliers);
router.post('/inventory/suppliers', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.inventory.write'), hubInventoryController_1.createHubSupplier);
router.patch('/inventory/suppliers/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.inventory.write'), hubInventoryController_1.patchHubSupplier);
router.get('/inventory/manufacturers', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.inventory.read'), hubInventoryController_1.listHubManufacturers);
router.post('/inventory/manufacturers', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.inventory.write'), hubInventoryController_1.createHubManufacturer);
router.patch('/inventory/manufacturers/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.inventory.write'), hubInventoryController_1.patchHubManufacturer);
router.get('/inventory/items', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.inventory.read'), hubInventoryController_1.listHubInventoryItems);
router.post('/inventory/items', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.inventory.write'), hubInventoryController_1.createHubInventoryItem);
router.patch('/inventory/items/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.inventory.write'), hubInventoryController_1.patchHubInventoryItem);
router.get('/inventory/movements', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.inventory.read'), hubInventoryController_1.listHubStockMovements);
router.post('/inventory/movements', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.inventory.write'), hubInventoryController_1.createHubStockMovement);
router.get('/inventory/lots', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.inventory.read'), hubInventoryController_1.listHubInventoryLots);
router.get('/inventory/lots/expiring', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.inventory.read'), hubInventoryController_1.listHubExpiringLots);
router.get('/inventory/reports/low-stock', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.inventory.read'), hubInventoryController_1.listHubLowStock);
/* --- Equipe / Staff --- */
router.get('/staff', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.staff.read'), hubStaffController_1.listHubStaff);
router.post('/staff/photo', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.staff.write'), hubStaffPhotoController_1.postHubStaffPhoto);
router.post('/staff', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.staff.write'), hubStaffController_1.createHubStaff);
router.get('/staff/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.staff.read'), hubStaffController_1.getHubStaff);
router.patch('/staff/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.staff.write'), hubStaffController_1.patchHubStaff);
router.post('/staff/:id/invite', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.staff.invite'), hubStaffController_1.inviteHubStaff);
/* --- Agenda / Agendamentos --- */
router.get('/appointments/calendar-blocks', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.appointments.read'), hubAppointmentsController_1.listHubAgendaCalendarBlocks);
router.post('/appointments/calendar-blocks', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.appointments.write'), hubAppointmentsController_1.upsertHubAgendaCalendarBlock);
router.delete('/appointments/calendar-blocks/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.appointments.write'), hubAppointmentsController_1.deleteHubAgendaCalendarBlock);
router.get('/appointments', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.appointments.read'), hubAppointmentsController_1.listHubAppointments);
router.post('/appointments', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.appointments.write'), hubAppointmentsController_1.createHubAppointment);
router.patch('/appointments/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.appointments.write'), hubAppointmentsController_1.patchHubAppointment);
/* --- Orçamentos / prospects --- */
router.get('/prospects', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.prospects.read'), hubProspectsController_1.listHubProspects);
router.get('/prospects/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.prospects.read'), hubProspectsController_1.getHubProspect);
router.post('/prospects', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.prospects.write'), hubProspectsController_1.createHubProspect);
router.patch('/prospects/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.prospects.write'), hubProspectsController_1.patchHubProspect);
router.get('/quotes', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.quotes.read'), hubQuotesController_1.listHubQuotes);
/** Rotas estáticas antes de `:id` (senão `suggest-price` é capturado como UUID). */
router.post('/quotes/suggest-price', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.quotes.write'), hubQuotesController_1.suggestQuotePrice);
router.post('/quotes', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.quotes.write'), hubQuotesController_1.createHubQuote);
router.get('/quotes/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.quotes.read'), hubQuotesController_1.getHubQuote);
router.get('/quotes/:id/pdf', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.quotes.read'), hubQuotesController_1.getHubQuotePdf);
router.patch('/quotes/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.quotes.write'), hubQuotesController_1.patchHubQuote);
router.delete('/quotes/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.quotes.write'), hubQuotesController_1.deleteHubQuote);
router.post('/quotes/:id/send', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.quotes.write'), hubQuotesController_1.sendHubQuote);
router.post('/quotes/:id/awaiting-return', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.quotes.write'), hubQuotesController_1.awaitingReturnHubQuote);
router.post('/quotes/:id/cancel', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.quotes.write'), hubQuotesController_1.cancelHubQuote);
router.post('/quotes/:id/finalize-manual-conversion', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.quotes.write'), hubQuotesController_1.finalizeManualConversionHubQuote);
router.post('/quotes/:id/convert', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.quotes.write'), hubQuotesController_1.convertHubQuote);
router.post('/quotes/:id/duplicate', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.quotes.write'), hubQuotesController_1.duplicateHubQuote);
router.post('/quotes/:id/reopen-draft', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.quotes.write'), hubQuotesController_1.reopenHubQuoteAsDraft);
router.post('/quotes/:id/public-token', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.quotes.write'), hubQuotesController_1.ensurePublicToken);
exports.default = router;

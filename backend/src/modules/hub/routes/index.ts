import { Router } from 'express';
import { authenticateUser, requirePermission } from '../../../middleware/authMiddleware';
import { authLimiter, hubApiLimiter } from '../../../middleware/rateLimiter.js';
import { postHubSignup, postHubOnboardingClinic } from '../hubSignupController.js';
import {
  previewHubInvitation,
  signupFromHubInvitation,
  checkHubInviteEmail,
  acceptHubInvitation,
} from '../hubInvitationsController.js';
import { postHubMessageLog } from '../hubMessageLogsController';
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
  listHubServiceGroups,
  createHubServiceGroup,
  patchHubServiceGroup,
  patchHubServiceGroupJobFunctions,
  getHubServiceGroupJobMappings,
  deleteHubServiceGroup,
} from '../hubServiceGroupsController';
import {
  listHubServiceGroupChecklists,
  getHubServiceGroupChecklist,
  putHubServiceGroupChecklist,
  deleteHubServiceGroupChecklist,
} from '../hubServiceGroupChecklistController';
import {
  getHubServiceGroupAddons,
  putHubServiceGroupAddons,
  getHubServiceTypeAddonAvailability,
  putHubServiceTypeAddonAvailability,
  getHubServiceTypeAvailableAddons,
  getHubAddonDeployments,
  putHubAddonDeployments,
} from '../hubServiceAddonsController';
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
import { listHubStaff, getHubStaff, createHubStaff, patchHubStaff, inviteHubStaff, linkHubStaffAccount, getHubStaffPendingInvite } from '../hubStaffController';
import { postHubStaffPhoto } from '../hubStaffPhotoController';
import { postHubClinicProfilePhoto, postHubUserProfilePhoto } from '../hubProfilePhotoController.js';
import { patchHubClinicProfile, patchHubUnitProfile } from '../hubClinicProfileController.js';
import { getHubSessionContext } from '../hubSessionController.js';
import { getHubSubscriptionPlans } from '../hubSubscriptionController.js';
import {
  listHubAppointments,
  getHubAppointmentsStatsByServiceGroup,
  createHubAppointment,
  createHubAppointmentBatch,
  patchHubAppointment,
  listHubAgendaCalendarBlocks,
  upsertHubAgendaCalendarBlock,
  deleteHubAgendaCalendarBlock,
} from '../hubAppointmentsController';
import { getHubClinicSettings, patchHubClinicSettings } from '../hubClinicSettingsController';
import {
  listHubProspects,
  getHubProspect,
  createHubProspect,
  patchHubProspect,
} from '../hubProspectsController';
import {
  getHubEncountersDayBoard,
  listHubEncounters,
  getHubEncounter,
  createHubEncounter,
  openHubEncounterFromAppointment,
  patchHubEncounter,
  completeHubEncounter,
  amendHubEncounter,
  getHubEncounterVersions,
} from '../hubEncountersController';
import {
  getHubGroomingDayBoard,
  openHubGroomingSessionFromAppointment,
  createHubGroomingSession,
  patchHubGroomingSession,
  advanceHubGroomingSession,
  listHubGroomingSessionEvents,
  postHubGroomingSessionEvent,
} from '../hubGroomingController';
import {
  getHubPickupDayBoard,
  createHubPickupRoute,
  listHubPickupRoutes,
  addHubPickupStops,
  patchHubPickupRoute,
  getHubPickupRoute,
  patchHubPickupStop,
  createOrUpdateLooseStop,
  getMyPickupRoute,
  getMyPickupRoutes,
  splitHubPickupRoute,
  addClinicReturnStop,
  getHubPickupDriverDay,
  suggestHubPickupBatches,
} from '../hubPickupController';
import {
  listPickupVehicles,
  createPickupVehicle,
  patchPickupVehicle,
  createTransportCage,
  patchTransportCage,
  deleteTransportCage,
} from '../hubPickupVehiclesController';
import {
  getHubGroomingSessionDrawer,
  postHubGroomingSessionExtra,
  patchHubGroomingAppointmentServiceLine,
} from '../hubGroomingDrawerController';
import {
  listHubClinicalCases,
  getHubClinicalCase,
  createHubClinicalCase,
  patchHubClinicalCase,
  deleteHubClinicalCase,
} from '../hubClinicalCasesController';
import {
  listHubClinicalTimeline,
  createHubClinicalTimelineNote,
} from '../hubClinicalTimelineController';
import {
  listHubClinicalExams,
  getHubClinicalExam,
  createHubClinicalExam,
  patchHubClinicalExam,
  deleteHubClinicalExam,
} from '../hubClinicalExamsController';
import {
  issueExamOrderDocumentHandler,
  listExamOrderDocuments,
  listExamOrderDocumentsByEncounter,
  revokeExamOrderDocument,
  getHubExamOrderPdf,
} from '../hubExamOrderDocumentsController';
import {
  listHubSpecialistReferrals,
  createHubSpecialistReferral,
  patchHubSpecialistReferral,
  deleteHubSpecialistReferral,
  issueSpecialistReferralDocumentHandler,
  issueSpecialistReferralBundleHandler,
  listSpecialistReferralDocumentsByEncounter,
  revokeSpecialistReferralDocument,
  getHubSpecialistReferralPdf,
} from '../hubSpecialistReferralsController';
import {
  listHubPetClinicalFlags,
  upsertHubPetClinicalFlag,
  listHubEncounterEvents,
  createHubEncounterEvent,
  listHubPrescriptions,
  createHubPrescription,
  patchHubPrescription,
  issuePrescriptionDocument,
  listPrescriptionDocuments,
  revokePrescriptionDocument,
  getHubPrescriptionPdf,
  listHubVaccinations,
  createHubVaccination,
  listHubClinicalAttachments,
  createHubClinicalAttachment,
  uploadHubClinicalAttachment,
  listHubHospitalBeds,
  createHubHospitalBed,
  listHubHospitalizations,
  createHubHospitalization,
  patchHubHospitalization,
  addHubHospitalizationDailyNote,
  listHubHospitalizationEvents,
  createHubHospitalizationEvent,
  listHubSurgeries,
  createHubSurgery,
  patchHubSurgery,
  getHubClinicalAlerts,
} from '../hubClinicalModulesController';
import { getHubVetCockpitPatientContext } from '../hubVetCockpitController.js';
import {
  listHubQuotes,
  getHubQuote,
  createHubQuote,
  patchHubQuote,
  deleteHubQuote,
  sendHubQuote,
  awaitingReturnHubQuote,
  cancelHubQuote,
  convertHubQuote,
  finalizeManualConversionHubQuote,
  duplicateHubQuote,
  reopenHubQuoteAsDraft,
  ensurePublicToken,
  getHubQuotePdf,
  suggestQuotePrice,
} from '../hubQuotesController';
import {
  getHubFinancePreview,
  postHubFinanceReceivable,
  postHubFinanceWaiveBilling,
  postHubFinanceReceivablePayment,
  listHubFinanceReceivables,
  getHubFinanceReceivableDetail,
  getHubFinancePaymentReceipt,
  postHubFinanceCashSessionOpen,
  postHubFinanceCashSessionClose,
  getHubFinanceCashSessionOpen,
  getHubFinanceCashSessionStatus,
  listHubFinanceCashSessionsClosed,
  getHubFinanceCashSessionSummary,
  getHubFinanceUnbilledCompleted,
  getHubFinancePendingBillingCount,
  getHubFinanceDashboardSummary,
  getHubFinanceCashFlow,
  getHubFinanceRevenueReport,
  getHubFinanceRevenueSeries,
  getHubFinanceTicketAverageReport,
  getHubFinanceTopServicesReport,
  getHubFinanceAgingReport,
  listHubFinanceExpenses,
  postHubFinanceExpense,
  postHubFinanceCashMovement,
  postHubFinanceReceivableProductLine,
  deleteHubFinanceReceivableProductLine,
  postHubFinancePaymentReverse,
  postHubFinanceReceivableCancel,
  getHubFinanceDayBoard,
  getHubFinancePaymentMethodSettings,
  patchHubFinancePaymentMethodSettings,
} from '../hubFinancialController';
import {
  postHubComandaOpen,
  getHubComandaDetail,
  getHubComandaByOrigin,
  postHubComandaCheckout,
  postHubComandaAddItems,
  patchHubComandaItem,
  patchHubComanda,
  deleteHubComandaItem,
  postHubComandaSuggestItemPrice,
  postHubComandaCheckoutBulk,
  postHubComandaSyncFromOrigin,
  postHubComandaApplyPackage,
  listHubComandas,
  getHubComandaCancellationPendingCount,
  postHubComandaResolveCancellation,
  getHubComandaPdf,
  ensureComandaPublicToken,
  getPublicComanda,
} from '../hubComandasController';
import { postHubCustomerCreditMovement, getHubCustomerCreditBalance } from '../hubCustomerCreditController';
import {
  listHubPackages,
  getHubPackage,
  postHubPackage,
  patchHubPackage,
  postHubPackageSuggestPrice,
  getHubGuardianPackageBalances,
  getHubPetPackageBalances,
} from '../hubPackagesController';
import {
  listHubCommissionRules,
  postHubCommissionRule,
  patchHubCommissionRule,
  deleteHubCommissionRule,
  getHubCommissionPreview,
} from '../hubCommissionRulesController';
import {
  getHubBoardingDayBoard,
  openHubBoardingReservationFromAppointment,
  createHubBoardingReservation,
  patchHubBoardingReservation,
  getHubBoardingUnitSettings,
  patchHubBoardingUnitSettings,
  getHubBoardingOccupancy,
  getHubBoardingCalendar,
} from '../hubBoardingController';
import {
  getHubBoardingReservationDrawer,
  postHubBoardingDailyLog,
} from '../hubBoardingDrawerController';

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

/** Cadastro Hub (público) e onboarding clínica+unidade */
router.post('/signup', authLimiter, postHubSignup);

/** Convites Hub (público) */
router.get('/invitations/preview', authLimiter, previewHubInvitation);
router.post('/invitations/signup', authLimiter, signupFromHubInvitation);

/** Limite dedicado ao Hub autenticado (polling, modais com vários GETs). */
router.use(hubApiLimiter);

router.get(
  '/invitations/check-email',
  authenticateUser,
  requirePermission('hub.staff.invite'),
  checkHubInviteEmail,
);
router.post('/invitations/accept', authenticateUser, acceptHubInvitation);

router.post('/onboarding/clinic', authenticateUser, postHubOnboardingClinic);
router.get('/session/context', authenticateUser, getHubSessionContext);
router.get('/subscription/plans', authenticateUser, getHubSubscriptionPlans);

router.post('/profile/me/photo', authenticateUser, postHubUserProfilePhoto);
router.post('/clinic/profile/photo', authenticateUser, postHubClinicProfilePhoto);
router.patch('/clinic/profile', authenticateUser, patchHubClinicProfile);
router.patch('/units/:unitId', authenticateUser, patchHubUnitProfile);

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

router.get(
  '/clinic-settings',
  authenticateUser,
  requirePermission('hub.appointments.read'),
  getHubClinicSettings
);
router.patch(
  '/clinic-settings',
  authenticateUser,
  requirePermission('hub.appointments.write'),
  patchHubClinicSettings
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

router.get(
  '/service-types/:id/available-addons',
  authenticateUser,
  requirePermission('hub.appointments.read'),
  getHubServiceTypeAvailableAddons
);
router.get(
  '/service-types/:id/addon-availability',
  authenticateUser,
  requirePermission('hub.service_types.read'),
  getHubServiceTypeAddonAvailability
);
router.put(
  '/service-types/:id/addon-availability',
  authenticateUser,
  requirePermission('hub.service_types.write'),
  putHubServiceTypeAddonAvailability
);
router.get(
  '/service-types/:id/addon-deployments',
  authenticateUser,
  requirePermission('hub.service_types.read'),
  getHubAddonDeployments
);
router.put(
  '/service-types/:id/addon-deployments',
  authenticateUser,
  requirePermission('hub.service_types.write'),
  putHubAddonDeployments
);

router.get(
  '/service-groups/checklists',
  authenticateUser,
  requirePermission('hub.service_types.read'),
  listHubServiceGroupChecklists
);
router.get(
  '/service-groups/checklists/:slug',
  authenticateUser,
  requirePermission('hub.service_types.read'),
  getHubServiceGroupChecklist
);
router.put(
  '/service-groups/checklists/:slug',
  authenticateUser,
  requirePermission('hub.service_types.write'),
  putHubServiceGroupChecklist
);
router.delete(
  '/service-groups/checklists/:slug',
  authenticateUser,
  requirePermission('hub.service_types.write'),
  deleteHubServiceGroupChecklist
);

router.get(
  '/service-groups/:id/addons',
  authenticateUser,
  requirePermission('hub.service_types.read'),
  getHubServiceGroupAddons
);
router.put(
  '/service-groups/:id/addons',
  authenticateUser,
  requirePermission('hub.service_types.write'),
  putHubServiceGroupAddons
);

router.get(
  '/service-groups/job-mappings',
  authenticateUser,
  requirePermission('hub.appointments.read'),
  getHubServiceGroupJobMappings
);
router.get(
  '/service-groups',
  authenticateUser,
  requirePermission('hub.service_types.read'),
  listHubServiceGroups
);
router.post(
  '/service-groups',
  authenticateUser,
  requirePermission('hub.service_types.write'),
  createHubServiceGroup
);
router.patch(
  '/service-groups/:id',
  authenticateUser,
  requirePermission('hub.service_types.write'),
  patchHubServiceGroup
);
router.patch(
  '/service-groups/:id/job-functions',
  authenticateUser,
  requirePermission('hub.service_types.write'),
  patchHubServiceGroupJobFunctions
);
router.delete(
  '/service-groups/:id',
  authenticateUser,
  requirePermission('hub.service_types.write'),
  deleteHubServiceGroup
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
router.post('/staff/:id/link-account', authenticateUser, requirePermission('hub.staff.write'), linkHubStaffAccount);
router.get('/staff/:id/pending-invite', authenticateUser, requirePermission('hub.staff.invite'), getHubStaffPendingInvite);
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
router.get(
  '/appointments/stats/by-service-group',
  authenticateUser,
  requirePermission('hub.appointments.read'),
  getHubAppointmentsStatsByServiceGroup
);
router.get('/appointments', authenticateUser, requirePermission('hub.appointments.read'), listHubAppointments);
router.post('/appointments', authenticateUser, requirePermission('hub.appointments.write'), createHubAppointment);
router.post('/appointments/batch', authenticateUser, requirePermission('hub.appointments.write'), createHubAppointmentBatch);
router.patch('/appointments/:id', authenticateUser, requirePermission('hub.appointments.write'), patchHubAppointment);

/* --- Orçamentos / prospects --- */
router.get('/prospects', authenticateUser, requirePermission('hub.prospects.read'), listHubProspects);
router.get('/prospects/:id', authenticateUser, requirePermission('hub.prospects.read'), getHubProspect);
router.post('/prospects', authenticateUser, requirePermission('hub.prospects.write'), createHubProspect);
router.patch('/prospects/:id', authenticateUser, requirePermission('hub.prospects.write'), patchHubProspect);

router.get('/quotes', authenticateUser, requirePermission('hub.quotes.read'), listHubQuotes);
/** Rotas estáticas antes de `:id` (senão `suggest-price` é capturado como UUID). */
router.post('/quotes/suggest-price', authenticateUser, requirePermission('hub.quotes.write'), suggestQuotePrice);
router.post('/quotes', authenticateUser, requirePermission('hub.quotes.write'), createHubQuote);
router.get('/quotes/:id', authenticateUser, requirePermission('hub.quotes.read'), getHubQuote);
router.get('/quotes/:id/pdf', authenticateUser, requirePermission('hub.quotes.read'), getHubQuotePdf);
router.patch('/quotes/:id', authenticateUser, requirePermission('hub.quotes.write'), patchHubQuote);
router.delete('/quotes/:id', authenticateUser, requirePermission('hub.quotes.write'), deleteHubQuote);
router.post('/quotes/:id/send', authenticateUser, requirePermission('hub.quotes.write'), sendHubQuote);
router.post('/quotes/:id/awaiting-return', authenticateUser, requirePermission('hub.quotes.write'), awaitingReturnHubQuote);
router.post('/quotes/:id/cancel', authenticateUser, requirePermission('hub.quotes.write'), cancelHubQuote);
router.post(
  '/quotes/:id/finalize-manual-conversion',
  authenticateUser,
  requirePermission('hub.quotes.write'),
  finalizeManualConversionHubQuote
);
router.post('/quotes/:id/convert', authenticateUser, requirePermission('hub.quotes.write'), convertHubQuote);
router.post('/quotes/:id/duplicate', authenticateUser, requirePermission('hub.quotes.write'), duplicateHubQuote);
router.post(
  '/quotes/:id/reopen-draft',
  authenticateUser,
  requirePermission('hub.quotes.write'),
  reopenHubQuoteAsDraft
);
router.post('/quotes/:id/public-token', authenticateUser, requirePermission('hub.quotes.write'), ensurePublicToken);

/* --- Clínica / Atendimentos --- */
router.get(
  '/encounters/day-board',
  authenticateUser,
  requirePermission('hub.clinic.read'),
  getHubEncountersDayBoard
);
router.get('/encounters', authenticateUser, requirePermission('hub.clinic.read'), listHubEncounters);
router.get('/encounters/:id', authenticateUser, requirePermission('hub.clinic.read'), getHubEncounter);
router.post('/encounters', authenticateUser, requirePermission('hub.clinic.write'), createHubEncounter);
router.post(
  '/encounters/open-from-appointment',
  authenticateUser,
  requirePermission('hub.clinic.write'),
  openHubEncounterFromAppointment
);
router.patch('/encounters/:id', authenticateUser, requirePermission('hub.clinic.write'), patchHubEncounter);
router.patch('/encounters/:id/amend', authenticateUser, requirePermission('hub.clinic.write'), amendHubEncounter);
router.get('/encounters/:id/versions', authenticateUser, requirePermission('hub.clinic.read'), getHubEncounterVersions);
router.post(
  '/encounters/:id/complete',
  authenticateUser,
  requirePermission('hub.clinic.write'),
  completeHubEncounter
);

/* --- Leva e Traz (paradas operacionais) --- */
router.get(
  '/pickup/day-board',
  authenticateUser,
  requirePermission('pickup.routes.read'),
  getHubPickupDayBoard,
);
router.get(
  '/pickup/driver-day',
  authenticateUser,
  requirePermission('pickup.routes.read'),
  getHubPickupDriverDay,
);
router.post(
  '/pickup/routes/suggest-batches',
  authenticateUser,
  requirePermission('pickup.routes.manage'),
  suggestHubPickupBatches,
);
router.get(
  '/pickup/routes',
  authenticateUser,
  requirePermission('pickup.routes.read'),
  listHubPickupRoutes,
);
router.post(
  '/pickup/routes',
  authenticateUser,
  requirePermission('pickup.routes.manage'),
  createHubPickupRoute,
);
router.get(
  '/pickup/routes/:id',
  authenticateUser,
  requirePermission('pickup.routes.read'),
  getHubPickupRoute,
);
router.patch(
  '/pickup/routes/:id',
  authenticateUser,
  requirePermission('pickup.routes.manage'),
  patchHubPickupRoute,
);
router.post(
  '/pickup/routes/:id/stops',
  authenticateUser,
  requirePermission('pickup.routes.manage'),
  addHubPickupStops,
);
router.post(
  '/pickup/routes/:id/split',
  authenticateUser,
  requirePermission('pickup.routes.manage'),
  splitHubPickupRoute,
);
router.post(
  '/pickup/routes/:id/clinic-return',
  authenticateUser,
  requirePermission('pickup.routes.manage'),
  addClinicReturnStop,
);
router.patch(
  '/pickup/stops/:id',
  authenticateUser,
  requirePermission('pickup.stops.update'),
  patchHubPickupStop,
);
router.post(
  '/pickup/stops',
  authenticateUser,
  requirePermission('pickup.stops.update'),
  createOrUpdateLooseStop,
);
router.get(
  '/pickup/my-route',
  authenticateUser,
  requirePermission('pickup.routes.read'),
  getMyPickupRoute,
);
router.get(
  '/pickup/my-routes',
  authenticateUser,
  requirePermission('pickup.routes.read'),
  getMyPickupRoutes,
);

/* --- Leva e Traz — Veículos e caixas de transporte --- */
router.get(
  '/pickup/vehicles',
  authenticateUser,
  requirePermission('pickup.routes.read'),
  listPickupVehicles,
);
router.post(
  '/pickup/vehicles',
  authenticateUser,
  requirePermission('pickup.routes.manage'),
  createPickupVehicle,
);
router.patch(
  '/pickup/vehicles/:id',
  authenticateUser,
  requirePermission('pickup.routes.manage'),
  patchPickupVehicle,
);
router.post(
  '/pickup/vehicles/:vehicleId/cages',
  authenticateUser,
  requirePermission('pickup.routes.manage'),
  createTransportCage,
);
router.patch(
  '/pickup/cages/:id',
  authenticateUser,
  requirePermission('pickup.routes.manage'),
  patchTransportCage,
);
router.delete(
  '/pickup/cages/:id',
  authenticateUser,
  requirePermission('pickup.routes.manage'),
  deleteTransportCage,
);

/* --- Banho & Tosa (fila operacional) --- */
router.get(
  '/grooming/day-board',
  authenticateUser,
  requirePermission('grooming.queue.read'),
  getHubGroomingDayBoard
);
router.post(
  '/grooming/sessions/open-from-appointment',
  authenticateUser,
  requirePermission('grooming.queue.manage'),
  openHubGroomingSessionFromAppointment
);
router.post(
  '/grooming/sessions',
  authenticateUser,
  requirePermission('grooming.queue.manage'),
  createHubGroomingSession
);
router.patch(
  '/grooming/sessions/:id',
  authenticateUser,
  requirePermission('grooming.queue.manage'),
  patchHubGroomingSession
);
router.post(
  '/grooming/sessions/:id/advance',
  authenticateUser,
  requirePermission('grooming.queue.manage'),
  advanceHubGroomingSession
);
router.get(
  '/grooming/sessions/:id/events',
  authenticateUser,
  requirePermission('grooming.queue.read'),
  listHubGroomingSessionEvents
);
router.post(
  '/grooming/sessions/:id/events',
  authenticateUser,
  requirePermission('grooming.queue.manage'),
  postHubGroomingSessionEvent
);
router.get(
  '/grooming/sessions/:id/drawer',
  authenticateUser,
  requirePermission('grooming.queue.read'),
  getHubGroomingSessionDrawer
);
router.post(
  '/grooming/sessions/:id/extras',
  authenticateUser,
  requirePermission('grooming.queue.manage'),
  postHubGroomingSessionExtra
);
router.patch(
  '/grooming/appointment-service-lines/:lineId',
  authenticateUser,
  requirePermission('grooming.queue.manage'),
  patchHubGroomingAppointmentServiceLine
);

/* --- Casos clínicos --- */
router.get('/clinical/timeline', authenticateUser, requirePermission('hub.clinic.read'), listHubClinicalTimeline);
router.post('/clinical/timeline/notes', authenticateUser, requirePermission('hub.clinic.write'), createHubClinicalTimelineNote);

/* --- Exames clínicos --- */
router.get('/clinical/exams', authenticateUser, requirePermission('hub.clinic.read'), listHubClinicalExams);
router.get('/clinical/exams/:id', authenticateUser, requirePermission('hub.clinic.read'), getHubClinicalExam);
router.post('/clinical/exams', authenticateUser, requirePermission('hub.clinic.write'), createHubClinicalExam);
router.patch('/clinical/exams/:id', authenticateUser, requirePermission('hub.clinic.write'), patchHubClinicalExam);
router.delete('/clinical/exams/:id', authenticateUser, requirePermission('hub.clinic.write'), deleteHubClinicalExam);
router.post('/clinical/exams/orders/issue', authenticateUser, requirePermission('hub.clinic.write'), issueExamOrderDocumentHandler);
router.get('/clinical/exams/encounter/:encounterId/order-documents', authenticateUser, requirePermission('hub.clinic.read'), listExamOrderDocumentsByEncounter);
router.get('/clinical/exams/:id/order-documents', authenticateUser, requirePermission('hub.clinic.read'), listExamOrderDocuments);
router.post('/clinical/exams/order-documents/:docId/revoke', authenticateUser, requirePermission('hub.clinic.write'), revokeExamOrderDocument);
router.get('/clinical/exams/:id/pdf', authenticateUser, requirePermission('hub.clinic.read'), getHubExamOrderPdf);

router.get('/clinical/specialist-referrals', authenticateUser, requirePermission('hub.clinic.read'), listHubSpecialistReferrals);
router.post('/clinical/specialist-referrals', authenticateUser, requirePermission('hub.clinic.write'), createHubSpecialistReferral);
router.patch('/clinical/specialist-referrals/:id', authenticateUser, requirePermission('hub.clinic.write'), patchHubSpecialistReferral);
router.delete('/clinical/specialist-referrals/:id', authenticateUser, requirePermission('hub.clinic.write'), deleteHubSpecialistReferral);
router.post('/clinical/specialist-referrals/orders/issue', authenticateUser, requirePermission('hub.clinic.write'), issueSpecialistReferralBundleHandler);
router.get('/clinical/specialist-referrals/encounter/:encounterId/documents', authenticateUser, requirePermission('hub.clinic.read'), listSpecialistReferralDocumentsByEncounter);
router.post('/clinical/specialist-referrals/:id/documents', authenticateUser, requirePermission('hub.clinic.write'), issueSpecialistReferralDocumentHandler);
router.post('/clinical/specialist-referrals/:id/documents/:docId/revoke', authenticateUser, requirePermission('hub.clinic.write'), revokeSpecialistReferralDocument);
router.get('/clinical/specialist-referrals/:id/pdf', authenticateUser, requirePermission('hub.clinic.read'), getHubSpecialistReferralPdf);

router.get('/clinical/cases', authenticateUser, requirePermission('hub.clinic.read'), listHubClinicalCases);
router.get('/clinical/cases/:id', authenticateUser, requirePermission('hub.clinic.read'), getHubClinicalCase);
router.post('/clinical/cases', authenticateUser, requirePermission('hub.clinic.write'), createHubClinicalCase);
router.patch('/clinical/cases/:id', authenticateUser, requirePermission('hub.clinic.write'), patchHubClinicalCase);
router.delete('/clinical/cases/:id', authenticateUser, requirePermission('hub.clinic.write'), deleteHubClinicalCase);

router.get(
  '/clinical/cockpit/patient-context',
  authenticateUser,
  requirePermission('hub.clinic.read'),
  getHubVetCockpitPatientContext,
);

router.get(
  '/clinical/pet-flags',
  authenticateUser,
  requirePermission('hub.clinic.read'),
  listHubPetClinicalFlags
);
router.post(
  '/clinical/pet-flags',
  authenticateUser,
  requirePermission('hub.clinic.write'),
  upsertHubPetClinicalFlag
);
router.get(
  '/clinical/encounter-events',
  authenticateUser,
  requirePermission('hub.clinic.read'),
  listHubEncounterEvents
);
router.post(
  '/clinical/encounter-events',
  authenticateUser,
  requirePermission('hub.clinic.write'),
  createHubEncounterEvent
);
router.get(
  '/clinical/alerts',
  authenticateUser,
  requirePermission('hub.clinic.read'),
  getHubClinicalAlerts
);

router.get(
  '/clinical/prescriptions',
  authenticateUser,
  requirePermission('hub.clinic.read'),
  listHubPrescriptions
);
router.get(
  '/clinical/prescriptions/:id/pdf',
  authenticateUser,
  requirePermission('hub.clinic.read'),
  getHubPrescriptionPdf
);
router.get(
  '/clinical/prescriptions/:id/documents',
  authenticateUser,
  requirePermission('hub.clinic.read'),
  listPrescriptionDocuments
);
router.post(
  '/clinical/prescriptions/:id/documents',
  authenticateUser,
  requirePermission('hub.clinic.write'),
  issuePrescriptionDocument
);
router.post(
  '/clinical/prescriptions/:id/documents/:docId/revoke',
  authenticateUser,
  requirePermission('hub.clinic.write'),
  revokePrescriptionDocument
);
router.post(
  '/clinical/prescriptions',
  authenticateUser,
  requirePermission('hub.clinic.write'),
  createHubPrescription
);
router.patch(
  '/clinical/prescriptions/:id',
  authenticateUser,
  requirePermission('hub.clinic.write'),
  patchHubPrescription
);
router.get(
  '/clinical/vaccinations',
  authenticateUser,
  requirePermission('hub.clinic.read'),
  listHubVaccinations
);
router.post(
  '/clinical/vaccinations',
  authenticateUser,
  requirePermission('hub.clinic.write'),
  createHubVaccination
);
router.get(
  '/clinical/attachments',
  authenticateUser,
  requirePermission('hub.clinic.read'),
  listHubClinicalAttachments
);
router.post(
  '/clinical/attachments',
  authenticateUser,
  requirePermission('hub.clinic.write'),
  createHubClinicalAttachment
);
router.post(
  '/clinical/attachments/upload',
  authenticateUser,
  requirePermission('hub.clinic.write'),
  uploadHubClinicalAttachment
);

router.get(
  '/clinical/hospital-beds',
  authenticateUser,
  requirePermission('hub.clinic.read'),
  listHubHospitalBeds
);
router.post(
  '/clinical/hospital-beds',
  authenticateUser,
  requirePermission('hub.clinic.write'),
  createHubHospitalBed
);
router.get(
  '/clinical/hospitalizations',
  authenticateUser,
  requirePermission('hub.clinic.read'),
  listHubHospitalizations
);
router.post(
  '/clinical/hospitalizations',
  authenticateUser,
  requirePermission('hub.clinic.write'),
  createHubHospitalization
);
router.patch(
  '/clinical/hospitalizations/:id',
  authenticateUser,
  requirePermission('hub.clinic.write'),
  patchHubHospitalization
);
router.post(
  '/clinical/hospitalizations/:id/daily-notes',
  authenticateUser,
  requirePermission('hub.clinic.write'),
  addHubHospitalizationDailyNote
);
router.get(
  '/clinical/hospitalizations/:id/events',
  authenticateUser,
  requirePermission('hub.clinic.read'),
  listHubHospitalizationEvents
);
router.post(
  '/clinical/hospitalizations/:id/events',
  authenticateUser,
  requirePermission('hub.clinic.write'),
  createHubHospitalizationEvent
);

router.get('/clinical/surgeries', authenticateUser, requirePermission('hub.clinic.read'), listHubSurgeries);
router.post('/clinical/surgeries', authenticateUser, requirePermission('hub.clinic.write'), createHubSurgery);
router.patch('/clinical/surgeries/:id', authenticateUser, requirePermission('hub.clinic.write'), patchHubSurgery);

/** Comandas / checkout operacional */
router.get(
  '/comandas',
  authenticateUser,
  requirePermission('hub.financial.read'),
  listHubComandas
);
router.get(
  '/comandas/cancellation-pending-count',
  authenticateUser,
  requirePermission('hub.financial.read'),
  getHubComandaCancellationPendingCount
);
router.get(
  '/comandas/by-origin',
  authenticateUser,
  requirePermission('hub.financial.read'),
  getHubComandaByOrigin
);
router.post(
  '/comandas/open',
  authenticateUser,
  requirePermission('hub.receivables.create'),
  postHubComandaOpen
);
router.get(
  '/comandas/:id/pdf',
  authenticateUser,
  requirePermission('hub.financial.read'),
  getHubComandaPdf
);
router.post(
  '/comandas/:id/public-token',
  authenticateUser,
  requirePermission('hub.receivables.create'),
  ensureComandaPublicToken
);
router.get(
  '/comandas/:id',
  authenticateUser,
  requirePermission('hub.financial.read'),
  getHubComandaDetail
);
router.post(
  '/comandas/:id/sync-from-origin',
  authenticateUser,
  requirePermission('hub.receivables.create'),
  postHubComandaSyncFromOrigin
);
router.post(
  '/comandas/:id/apply-package',
  authenticateUser,
  requirePermission('hub.receivables.create'),
  postHubComandaApplyPackage
);
router.post(
  '/comandas/:id/checkout',
  authenticateUser,
  requirePermission('hub.receivables.create'),
  postHubComandaCheckout
);
router.post(
  '/comandas/:id/resolve-cancellation',
  authenticateUser,
  requirePermission('hub.financial.write'),
  postHubComandaResolveCancellation
);
router.post(
  '/comandas/suggest-item-price',
  authenticateUser,
  requirePermission('hub.receivables.create'),
  postHubComandaSuggestItemPrice
);
router.post(
  '/comandas/checkout-bulk',
  authenticateUser,
  requirePermission('hub.receivables.create'),
  postHubComandaCheckoutBulk
);
router.post(
  '/comandas/:id/items',
  authenticateUser,
  requirePermission('hub.receivables.create'),
  postHubComandaAddItems
);
router.patch(
  '/comandas/:id/items/:itemId',
  authenticateUser,
  requirePermission('hub.receivables.create'),
  patchHubComandaItem
);
router.delete(
  '/comandas/:id/items/:itemId',
  authenticateUser,
  requirePermission('hub.receivables.create'),
  deleteHubComandaItem
);
router.patch(
  '/comandas/:id',
  authenticateUser,
  requirePermission('hub.receivables.create'),
  patchHubComanda
);

/** Financeiro — Day board (Caixa: todos os atendimentos do dia) */
router.get(
  '/finance/payment-method-settings',
  authenticateUser,
  requirePermission('hub.financial.read'),
  getHubFinancePaymentMethodSettings
);
router.patch(
  '/finance/payment-method-settings',
  authenticateUser,
  requirePermission('hub.financial.write'),
  patchHubFinancePaymentMethodSettings
);
router.get(
  '/finance/day-board',
  authenticateUser,
  requirePermission('hub.financial.read'),
  getHubFinanceDayBoard
);

/** Financeiro — Fase 1 (recebíveis, sem cobrança, caixa básico) */
router.get(
  '/finance/preview',
  authenticateUser,
  requirePermission('hub.financial.read'),
  getHubFinancePreview
);
router.get(
  '/finance/unbilled-completed',
  authenticateUser,
  requirePermission('hub.financial.read'),
  getHubFinanceUnbilledCompleted
);
router.get(
  '/finance/pending-billing-count',
  authenticateUser,
  requirePermission('hub.financial.read'),
  getHubFinancePendingBillingCount
);
router.get(
  '/finance/receivables',
  authenticateUser,
  requirePermission('hub.financial.read'),
  listHubFinanceReceivables
);
router.get(
  '/finance/receivables/:id',
  authenticateUser,
  requirePermission('hub.financial.read'),
  getHubFinanceReceivableDetail
);
router.post(
  '/finance/receivables',
  authenticateUser,
  requirePermission('hub.receivables.create'),
  postHubFinanceReceivable
);
router.post(
  '/finance/receivables/:id/product-lines',
  authenticateUser,
  requirePermission('hub.inventory.write'),
  postHubFinanceReceivableProductLine
);
router.delete(
  '/finance/receivables/:id/product-lines/:lineId',
  authenticateUser,
  requirePermission('hub.inventory.write'),
  deleteHubFinanceReceivableProductLine
);
router.post(
  '/finance/receivables/:id/cancel',
  authenticateUser,
  requirePermission('hub.financial.write'),
  postHubFinanceReceivableCancel
);
router.post(
  '/finance/waive-billing',
  authenticateUser,
  requirePermission('hub.financial.write'),
  postHubFinanceWaiveBilling
);
router.post(
  '/finance/receivables/:id/payments',
  authenticateUser,
  requirePermission('hub.cash.receive'),
  postHubFinanceReceivablePayment
);
router.post(
  '/finance/payments/:id/reverse',
  authenticateUser,
  requirePermission('hub.cash.receive'),
  postHubFinancePaymentReverse
);
router.get(
  '/finance/payments/:id/receipt',
  authenticateUser,
  requirePermission('hub.financial.read'),
  getHubFinancePaymentReceipt
);
router.get(
  '/finance/cash-sessions/closed',
  authenticateUser,
  requirePermission('hub.financial.read'),
  listHubFinanceCashSessionsClosed
);
router.get(
  '/finance/cash-sessions/open',
  authenticateUser,
  requirePermission('hub.financial.read'),
  getHubFinanceCashSessionOpen
);
router.get(
  '/finance/cash-sessions/status',
  authenticateUser,
  requirePermission('hub.financial.read'),
  getHubFinanceCashSessionStatus
);
router.post(
  '/finance/cash-sessions/open',
  authenticateUser,
  requirePermission('hub.cash.session'),
  postHubFinanceCashSessionOpen
);
router.post(
  '/finance/cash-sessions/:id/close',
  authenticateUser,
  requirePermission('hub.cash.session'),
  postHubFinanceCashSessionClose
);
router.get(
  '/finance/cash-sessions/:id/summary',
  authenticateUser,
  requirePermission('hub.financial.read'),
  getHubFinanceCashSessionSummary
);
router.get(
  '/finance/dashboard-summary',
  authenticateUser,
  requirePermission('hub.financial.read'),
  getHubFinanceDashboardSummary
);
router.get(
  '/finance/cash-flow',
  authenticateUser,
  requirePermission('hub.financial.read'),
  getHubFinanceCashFlow
);
router.get(
  '/finance/reports/revenue-series',
  authenticateUser,
  requirePermission('hub.financial.read'),
  getHubFinanceRevenueSeries
);
router.get(
  '/finance/reports/revenue',
  authenticateUser,
  requirePermission('hub.financial.read'),
  getHubFinanceRevenueReport
);
router.get(
  '/finance/reports/ticket-average',
  authenticateUser,
  requirePermission('hub.financial.read'),
  getHubFinanceTicketAverageReport
);
router.get(
  '/finance/reports/top-services',
  authenticateUser,
  requirePermission('hub.financial.read'),
  getHubFinanceTopServicesReport
);
router.get(
  '/finance/reports/aging',
  authenticateUser,
  requirePermission('hub.financial.read'),
  getHubFinanceAgingReport
);
router.get(
  '/finance/expenses',
  authenticateUser,
  requirePermission('hub.financial.read'),
  listHubFinanceExpenses
);
router.post(
  '/finance/expenses',
  authenticateUser,
  requirePermission('hub.financial.write'),
  postHubFinanceExpense
);
router.post(
  '/finance/cash-sessions/:id/movements',
  authenticateUser,
  requirePermission('hub.cash.session'),
  postHubFinanceCashMovement
);
router.post(
  '/finance/credit-movements',
  authenticateUser,
  requirePermission('hub.financial.write'),
  postHubCustomerCreditMovement
);
router.get(
  '/finance/credit-balance',
  authenticateUser,
  requirePermission('hub.financial.read'),
  getHubCustomerCreditBalance
);
router.get(
  '/finance/packages',
  authenticateUser,
  requirePermission('hub.financial.read'),
  listHubPackages
);
router.post(
  '/finance/packages/suggest-price',
  authenticateUser,
  requirePermission('hub.financial.read'),
  postHubPackageSuggestPrice
);
router.get(
  '/finance/packages/:id',
  authenticateUser,
  requirePermission('hub.financial.read'),
  getHubPackage
);
router.post(
  '/finance/packages',
  authenticateUser,
  requirePermission('hub.financial.write'),
  postHubPackage
);
router.patch(
  '/finance/packages/:id',
  authenticateUser,
  requirePermission('hub.financial.write'),
  patchHubPackage
);
router.get(
  '/guardians/:guardianId/package-balances',
  authenticateUser,
  requirePermission('hub.financial.read'),
  getHubGuardianPackageBalances
);
router.get(
  '/pets/:petId/package-balances',
  authenticateUser,
  requirePermission('hub.financial.read'),
  getHubPetPackageBalances
);

router.get(
  '/finance/commission-preview',
  authenticateUser,
  requirePermission('hub.financial.read'),
  getHubCommissionPreview
);
router.get(
  '/finance/commission-rules',
  authenticateUser,
  requirePermission('hub.financial.read'),
  listHubCommissionRules
);
router.post(
  '/finance/commission-rules',
  authenticateUser,
  requirePermission('hub.financial.write'),
  postHubCommissionRule
);
router.patch(
  '/finance/commission-rules/:id',
  authenticateUser,
  requirePermission('hub.financial.write'),
  patchHubCommissionRule
);
router.delete(
  '/finance/commission-rules/:id',
  authenticateUser,
  requirePermission('hub.financial.write'),
  deleteHubCommissionRule
);

/* --- Hotel & Creche (boarding operacional) --- */
router.get(
  '/boarding/day-board',
  authenticateUser,
  requirePermission('boarding.reservations.read'),
  getHubBoardingDayBoard
);
router.post(
  '/boarding/reservations/open-from-appointment',
  authenticateUser,
  requirePermission('boarding.reservations.manage'),
  openHubBoardingReservationFromAppointment
);
router.post(
  '/boarding/reservations',
  authenticateUser,
  requirePermission('boarding.reservations.manage'),
  createHubBoardingReservation
);
router.patch(
  '/boarding/reservations/:id',
  authenticateUser,
  requirePermission('boarding.reservations.manage'),
  patchHubBoardingReservation
);
router.get(
  '/boarding/reservations/:id/drawer',
  authenticateUser,
  requirePermission('boarding.reservations.read'),
  getHubBoardingReservationDrawer
);
router.post(
  '/boarding/reservations/:id/daily-logs',
  authenticateUser,
  requirePermission('boarding.daily_report.write'),
  postHubBoardingDailyLog
);
router.get(
  '/boarding/unit-settings',
  authenticateUser,
  requirePermission('boarding.reservations.read'),
  getHubBoardingUnitSettings
);
router.patch(
  '/boarding/unit-settings',
  authenticateUser,
  requirePermission('boarding.reservations.manage'),
  patchHubBoardingUnitSettings
);
router.get(
  '/boarding/occupancy',
  authenticateUser,
  requirePermission('boarding.reservations.read'),
  getHubBoardingOccupancy
);
router.get(
  '/boarding/calendar',
  authenticateUser,
  requirePermission('boarding.reservations.read'),
  getHubBoardingCalendar
);

// ─── Comunicação — log de tentativas (click-to-chat / in-app) ──────────────
router.post('/message-logs', authenticateUser, postHubMessageLog);

export default router;

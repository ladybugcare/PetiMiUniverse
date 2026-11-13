import { Router } from 'express';
import { authenticateUser, requirePermission } from '../../../middleware/authMiddleware';
import { authLimiter, hubApiLimiter } from '../../../middleware/rateLimiter.js';
import { requireHubEntitlement } from '../hubEntitlements.js';
import { postHubSignup, postHubOnboardingClinic } from '../hubSignupController.js';

const requireClinicModule = requireHubEntitlement({ module: 'clinic' });
const requireGroomingModule = requireHubEntitlement({ module: 'grooming' });
const requireBoardingModule = requireHubEntitlement({ module: 'boarding' });
const requirePickupArea = requireHubEntitlement({ planArea: 'leva_traz' });
const requireReceptionArea = requireHubEntitlement({ planArea: 'recepcao' });
/** Ops do dia: permitidas em soft_lock; bloqueadas em read_history. */
const requireGroomingWrite = requireHubEntitlement({
  module: 'grooming',
  mutating: true,
  allowSoftLockWrite: true,
});
const requireBoardingWrite = requireHubEntitlement({
  module: 'boarding',
  mutating: true,
  allowSoftLockWrite: true,
});
const requirePickupWrite = requireHubEntitlement({
  planArea: 'leva_traz',
  mutating: true,
  allowSoftLockWrite: true,
});
const requireReceptionWrite = requireHubEntitlement({
  planArea: 'recepcao',
  mutating: true,
  allowSoftLockWrite: true,
});
const requireClinicWrite = requireHubEntitlement({
  module: 'clinic',
  mutating: true,
  allowSoftLockWrite: true,
});
/** Catálogo admin (estoque itens/fornecedores, service-types): bloqueado em soft_lock e read_history. */
const requireCoreCatalogWrite = requireHubEntitlement({ module: 'hub_core', mutating: true });
/** Ops core (agenda, tutores, pets, movimentos de estoque, financeiro do dia). */
const requireCoreOpsWrite = requireHubEntitlement({
  module: 'hub_core',
  mutating: true,
  allowSoftLockWrite: true,
});
import { getHubDayOpsSummary } from '../hubDayOpsSummaryController';
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
import { listHubPets, createHubPet, updateHubPet, listHubPetProfileChanges } from '../hubPetsController';
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
  listHubNearlyEmptyLots,
  listHubInventoryLots,
  getHubInventoryMovementsReport,
  getHubInventoryAbcReport,
  getHubInventoryTurnoverReport,
} from '../hubInventoryController';
import { getHubAbsentClientsReport, getHubNoShowsReport, getHubBoardingOccupancySeriesReport, getHubClientCohortsReport, getHubBirthdaysReport, getHubGroomingProductivityReport, getHubVaccinesDueReport } from '../hubReportsController';
import { postHubReportExportPdf } from '../hubReportExportPdf';
import {
  listHubReportEmailSchedules,
  createHubReportEmailSchedule,
  patchHubReportEmailSchedule,
  deleteHubReportEmailSchedule,
  runHubReportEmailSchedule,
} from '../hubReportEmailSchedulesController';
import { listHubStaff, getHubStaff, createHubStaff, patchHubStaff, inviteHubStaff, linkHubStaffAccount, getHubStaffPendingInvite } from '../hubStaffController';
import { postHubStaffPhoto } from '../hubStaffPhotoController';
import { postHubClinicProfilePhoto, postHubUserProfilePhoto } from '../hubProfilePhotoController.js';
import { patchHubClinicProfile, patchHubUnitProfile, postHubUnit } from '../hubClinicProfileController.js';
import { getHubSessionContext } from '../hubSessionController.js';
import {
  getHubSubscriptionMe,
  getHubSubscriptionPlans,
  postHubSubscriptionCheckout,
  postHubSubscriptionSync,
} from '../hubSubscriptionController.js';
import {
  listHubAppointments,
  getHubAppointmentsStatsByServiceGroup,
  listHubSeriesEndingSoon,
  createHubAppointment,
  createHubAppointmentBatch,
  patchHubAppointment,
  listHubAgendaCalendarBlocks,
  upsertHubAgendaCalendarBlock,
  deleteHubAgendaCalendarBlock,
} from '../hubAppointmentsController';
import { getHubClinicSettings, patchHubClinicSettings } from '../hubClinicSettingsController';
import {
  listHubSpecialPrices,
  resolveHubSpecialPrice,
  createHubSpecialPrice,
  patchHubSpecialPrice,
  approveHubSpecialPrice,
} from '../hubSpecialPricesController';
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
  checkInHubClinicalWalkIn,
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
  getHubReceptionBoard,
  getHubReceptionHandoffDetail,
  postHubReceptionResolve,
} from '../hubReceptionController';
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
  claimHubPickupRoute,
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
  listHubResourceKinds,
  createHubResourceKind,
  patchHubResourceKind,
  deleteHubResourceKind,
  putHubResourceGroupSetting,
  listHubResources,
  createHubResource,
  patchHubResource,
  deleteHubResource,
  getHubResourceAvailability,
  getHubServiceTypeResourceKinds,
  putHubServiceTypeResourceKinds,
} from '../hubResourcesController';
import {
  listHubPartnerClinics,
  createHubPartnerClinic,
  patchHubPartnerClinic,
  deleteHubPartnerClinic,
} from '../hubPartnerClinicsController';
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
  exportHubClinicalExamsCsv,
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
  listHubMedicationAdministrations,
  createHubMedicationAdministration,
  listHubClinicalAttachments,
  createHubClinicalAttachment,
  uploadHubClinicalAttachment,
  listHubHospitalBeds,
  createHubHospitalBed,
  listHubHospitalizations,
  getHubHospitalization,
  createHubHospitalization,
  patchHubHospitalization,
  addHubHospitalizationDailyNote,
  listHubHospitalizationEvents,
  createHubHospitalizationEvent,
  listHubSurgeries,
  getHubSurgery,
  createHubSurgery,
  patchHubSurgery,
  getHubClinicalAlerts,
} from '../hubClinicalModulesController';
import {
  listHubSurgeryServices,
  createHubSurgeryService,
  patchHubSurgeryService,
  deleteHubSurgeryService,
  approveHubSurgeryServicePrice,
  listHubHospitalizationCharges,
  createHubHospitalizationCharge,
  patchHubHospitalizationCharge,
  deleteHubHospitalizationCharge,
  approveHubHospitalizationChargePrice,
} from '../hubClinicalBillableServicesController';
import {
  listHubHospitalizationMedOrders,
  createHubHospitalizationMedOrder,
  createHubHospitalizationMedOrderVersion,
  suspendHubHospitalizationMedOrder,
  resumeHubHospitalizationMedOrder,
  listHubHospitalizationMedDoses,
  completeHubHospitalizationMedDose,
  getHubHospitalizationMedPrintModel,
} from '../hubHospitalizationMedPlanController';
import {
  listHubPrescriptionLookups,
  createHubPrescriptionLookup,
} from '../hubPrescriptionLookupsController';
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
  listHubFinancePayments,
  listHubFinanceReceivables,
  getHubFinanceReceivableDetail,
  getHubFinancePaymentReceipt,
  postHubFinanceCashSessionOpen,
  postHubFinanceCashSessionClose,
  postHubFinanceHandoffPending,
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
  getHubFinanceSalesAdjustmentsReport,
  getHubFinanceCommissionsReport,
  getHubFinanceTopClientsReport,
  getHubFinancePackagesReport,
  listHubFinanceExpenses,
  postHubFinanceExpense,
  patchHubFinanceExpense,
  deleteHubFinanceExpense,
  listHubFinancePayables,
  postHubFinancePayable,
  patchHubFinancePayable,
  postHubFinancePayablePay,
  postHubFinancePayableCancel,
  listHubFinancePayableSchedules,
  postHubFinancePayableSchedule,
  patchHubFinancePayableSchedule,
  postHubFinancePayableScheduleEnd,
  postHubFinanceCashMovement,
  postHubFinanceReceivableProductLine,
  deleteHubFinanceReceivableProductLine,
  postHubFinancePaymentReverse,
  postHubFinanceReceivableHistoricalCash,
  postHubFinanceReceivableCancel,
  getHubFinanceDayBoard,
  getHubFinancePaymentMethodSettings,
  patchHubFinancePaymentMethodSettings,
} from '../hubFinancialController';
import {
  postHubChargeBundle,
  listHubChargeBundles,
  getHubChargeBundle,
  patchHubChargeBundleMarkSent,
  getHubChargeBundlePdf,
} from '../hubChargeBundlesController';
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
  postHubPackageBalanceCancel,
  getHubPackageBalanceRefundPreview,
  postHubPackageBalanceRefund,
} from '../hubPackagesController';
import {
  postHubSeriesInvoiceIssue,
  postHubSeriesInvoiceRunJob,
} from '../hubSeriesBillingController';
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
  postHubBoardingStartCheckoutPrep,
  postHubBoardingReleaseForHandoff,
  postHubBoardingRevertHandoffReady,
  getHubBoardingUnitSettings,
  patchHubBoardingUnitSettings,
  getHubBoardingOccupancy,
  getHubBoardingCalendar,
} from '../hubBoardingController';
import {
  getHubBoardingReservationDrawer,
  getHubBoardingReservationTimeline,
  postHubBoardingDailyLog,
} from '../hubBoardingDrawerController';
import {
  getHubBoardingCarePlan,
  getHubPetCareProfile,
  postHubBoardingCareTutorLink,
  putHubBoardingCarePlan,
  putHubPetCareProfile,
} from '../hubBoardingCareController';
import {
  getHubBoardingTasks,
  postHubBoardingBatchActivity,
  postHubBoardingTask,
  postHubBoardingTaskExecute,
} from '../hubBoardingTasksController';
import {
  deleteHubBoardingBelonging,
  deleteHubBoardingExtra,
  deleteHubBoardingMedia,
  getHubBoardingBelongings,
  getHubBoardingExtras,
  getHubBoardingIncidents,
  getHubBoardingMedia,
  patchHubBoardingBelonging,
  patchHubBoardingIncident,
  postHubBoardingBelonging,
  postHubBoardingExtra,
  postHubBoardingIncident,
  uploadHubBoardingMedia,
} from '../hubBoardingRecordsController';
import {
  deleteHubBoardingSpace,
  getHubBoardingHandoffs,
  getHubBoardingOpsBoard,
  getHubBoardingSpaces,
  getHubBoardingTutorReport,
  patchHubBoardingSpace,
  postHubBoardingHandoff,
  postHubBoardingHandoffAcknowledge,
  postHubBoardingSpace,
  postHubBoardingTutorReport,
} from '../hubBoardingOpsController';

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
router.get('/subscription', authenticateUser, getHubSubscriptionMe);
router.post('/subscription/checkout', authenticateUser, postHubSubscriptionCheckout);
router.post('/subscription/sync', authenticateUser, postHubSubscriptionSync);

router.get(
  '/day-ops-summary',
  authenticateUser,
  requirePermission([
    'hub.appointments.read',
    'hub.clinic.read',
    'grooming.queue.read',
    'boarding.reservations.read',
    'pickup.routes.read',
    'hub.financial.read',
    'hub.inventory.read',
  ]),
  getHubDayOpsSummary,
);

router.post('/profile/me/photo', authenticateUser, postHubUserProfilePhoto);
router.post('/clinic/profile/photo', authenticateUser, postHubClinicProfilePhoto);
router.patch('/clinic/profile', authenticateUser, patchHubClinicProfile);
router.post('/units', authenticateUser, postHubUnit);
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
  requirePermission('hub.guardians.write'), requireCoreOpsWrite,
  createHubGuardian
);

router.patch(
  '/guardians/:id',
  authenticateUser,
  requirePermission('hub.guardians.write'), requireCoreOpsWrite,
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
  requirePermission('hub.appointments.write'), requireCoreOpsWrite,
  patchHubClinicSettings
);

/* --- Preços especiais (pet / tutor / plano família) --- */
router.get(
  '/special-prices',
  authenticateUser,
  requirePermission(['hub.appointments.read', 'hub.financial.read', 'hub.pets.read']),
  listHubSpecialPrices
);
router.get(
  '/special-prices/resolve',
  authenticateUser,
  requirePermission(['hub.appointments.read', 'hub.financial.read', 'hub.pets.read']),
  resolveHubSpecialPrice
);
router.post(
  '/special-prices',
  authenticateUser,
  requirePermission(['hub.appointments.write', 'hub.financial.write', 'hub.pets.write']), requireCoreOpsWrite,
  createHubSpecialPrice
);
router.patch(
  '/special-prices/:id',
  authenticateUser,
  requirePermission(['hub.appointments.write', 'hub.financial.write', 'hub.pets.write']), requireCoreOpsWrite,
  patchHubSpecialPrice
);
router.post(
  '/special-prices/:id/approve',
  authenticateUser,
  requirePermission('hub.financial.write'), requireCoreOpsWrite,
  approveHubSpecialPrice
);

/* --- Clínicas parceiras (local de atendimento) --- */
router.get(
  '/partner-clinics',
  authenticateUser,
  requirePermission('hub.clinic.read'), requireClinicModule,
  listHubPartnerClinics,
);
router.post(
  '/partner-clinics',
  authenticateUser,
  requirePermission('hub.clinic.write'), requireClinicWrite,
  createHubPartnerClinic,
);
router.patch(
  '/partner-clinics/:id',
  authenticateUser,
  requirePermission('hub.clinic.write'), requireClinicWrite,
  patchHubPartnerClinic,
);
router.delete(
  '/partner-clinics/:id',
  authenticateUser,
  requirePermission('hub.clinic.write'), requireClinicWrite,
  deleteHubPartnerClinic,
);

router.get('/pets', authenticateUser, requirePermission('hub.pets.read'), listHubPets);

router.post('/pets', authenticateUser, requirePermission('hub.pets.write'), requireCoreOpsWrite, createHubPet);

router.get(
  '/pets/:id/profile-changes',
  authenticateUser,
  requirePermission(['hub.pets.read', 'hub.clinic.read']),
  listHubPetProfileChanges,
);

router.patch(
  '/pets/:id',
  authenticateUser,
  requirePermission(['hub.pets.write', 'hub.clinic.write']), requireCoreOpsWrite,
  updateHubPet,
);

router.get(
  '/service-types',
  authenticateUser,
  requirePermission('hub.service_types.read'),
  listHubServiceTypes
);

router.post(
  '/service-types',
  authenticateUser,
  requirePermission('hub.service_types.write'), requireCoreCatalogWrite,
  createHubServiceType
);

router.patch(
  '/service-types/:id',
  authenticateUser,
  requirePermission('hub.service_types.write'), requireCoreCatalogWrite,
  updateHubServiceType
);

router.post(
  '/service-types/bootstrap',
  authenticateUser,
  requirePermission('hub.service_types.write'), requireCoreCatalogWrite,
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
  requirePermission('hub.service_types.write'), requireCoreCatalogWrite,
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
  requirePermission('hub.service_types.write'), requireCoreCatalogWrite,
  putHubAddonDeployments
);

const resourceRead = ['hub.appointments.read', 'grooming.queue.read', 'hub.service_types.read'] as const;

router.get('/resource-kinds', authenticateUser, requirePermission([...resourceRead]), listHubResourceKinds);
router.post('/resource-kinds', authenticateUser, requirePermission('hub.service_types.write'), requireCoreCatalogWrite, createHubResourceKind);
router.patch('/resource-kinds/:id', authenticateUser, requirePermission('hub.service_types.write'), requireCoreCatalogWrite, patchHubResourceKind);
router.delete('/resource-kinds/:id', authenticateUser, requirePermission('hub.service_types.write'), requireCoreCatalogWrite, deleteHubResourceKind);
router.put(
  '/resource-group-settings',
  authenticateUser,
  requirePermission('hub.service_types.write'), requireCoreCatalogWrite,
  putHubResourceGroupSetting,
);
router.get('/resources', authenticateUser, requirePermission([...resourceRead]), listHubResources);
router.post('/resources', authenticateUser, requirePermission('hub.service_types.write'), requireCoreCatalogWrite, createHubResource);
router.patch('/resources/:id', authenticateUser, requirePermission('hub.service_types.write'), requireCoreCatalogWrite, patchHubResource);
router.delete('/resources/:id', authenticateUser, requirePermission('hub.service_types.write'), requireCoreCatalogWrite, deleteHubResource);
router.get(
  '/resources/availability',
  authenticateUser,
  requirePermission([...resourceRead]),
  getHubResourceAvailability,
);
router.get(
  '/service-types/:id/resource-kinds',
  authenticateUser,
  requirePermission([...resourceRead]),
  getHubServiceTypeResourceKinds,
);
router.put(
  '/service-types/:id/resource-kinds',
  authenticateUser,
  requirePermission('hub.service_types.write'), requireCoreCatalogWrite,
  putHubServiceTypeResourceKinds,
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
  requirePermission('hub.service_types.write'), requireCoreCatalogWrite,
  putHubServiceGroupChecklist
);
router.delete(
  '/service-groups/checklists/:slug',
  authenticateUser,
  requirePermission('hub.service_types.write'), requireCoreCatalogWrite,
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
  requirePermission('hub.service_types.write'), requireCoreCatalogWrite,
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
  requirePermission('hub.service_types.write'), requireCoreCatalogWrite,
  createHubServiceGroup
);
router.patch(
  '/service-groups/:id',
  authenticateUser,
  requirePermission('hub.service_types.write'), requireCoreCatalogWrite,
  patchHubServiceGroup
);
router.patch(
  '/service-groups/:id/job-functions',
  authenticateUser,
  requirePermission('hub.service_types.write'), requireCoreCatalogWrite,
  patchHubServiceGroupJobFunctions
);
router.delete(
  '/service-groups/:id',
  authenticateUser,
  requirePermission('hub.service_types.write'), requireCoreCatalogWrite,
  deleteHubServiceGroup
);

/* --- Inventário / Estoque --- */
router.get('/inventory/suppliers', authenticateUser, requirePermission(['hub.inventory.read', 'hub.financial.read']), listHubSuppliers);
router.post('/inventory/suppliers', authenticateUser, requirePermission(['hub.inventory.write', 'hub.financial.write']), requireCoreCatalogWrite, createHubSupplier);
router.patch('/inventory/suppliers/:id', authenticateUser, requirePermission('hub.inventory.write'), requireCoreCatalogWrite, patchHubSupplier);

router.get('/inventory/manufacturers', authenticateUser, requirePermission('hub.inventory.read'), listHubManufacturers);
router.post('/inventory/manufacturers', authenticateUser, requirePermission('hub.inventory.write'), requireCoreCatalogWrite, createHubManufacturer);
router.patch('/inventory/manufacturers/:id', authenticateUser, requirePermission('hub.inventory.write'), requireCoreCatalogWrite, patchHubManufacturer);

router.get('/inventory/items', authenticateUser, requirePermission('hub.inventory.read'), listHubInventoryItems);
router.post('/inventory/items', authenticateUser, requirePermission('hub.inventory.write'), requireCoreCatalogWrite, createHubInventoryItem);
router.patch('/inventory/items/:id', authenticateUser, requirePermission('hub.inventory.write'), requireCoreCatalogWrite, patchHubInventoryItem);

router.get('/inventory/movements', authenticateUser, requirePermission('hub.inventory.read'), listHubStockMovements);
router.post('/inventory/movements', authenticateUser, requirePermission('hub.inventory.write'), requireCoreOpsWrite, createHubStockMovement);

router.get('/inventory/lots', authenticateUser, requirePermission('hub.inventory.read'), listHubInventoryLots);
router.get('/inventory/lots/expiring', authenticateUser, requirePermission('hub.inventory.read'), listHubExpiringLots);
router.get('/inventory/reports/low-stock', authenticateUser, requirePermission('hub.inventory.read'), listHubLowStock);
router.get(
  '/inventory/reports/nearly-empty-lots',
  authenticateUser,
  requirePermission('hub.inventory.read'),
  listHubNearlyEmptyLots,
);
router.get(
  '/inventory/reports/movements',
  authenticateUser,
  requirePermission('hub.inventory.read'),
  getHubInventoryMovementsReport
);
router.get(
  '/inventory/reports/abc',
  authenticateUser,
  requirePermission('hub.inventory.read'),
  getHubInventoryAbcReport
);
router.get(
  '/inventory/reports/turnover',
  authenticateUser,
  requirePermission('hub.inventory.read'),
  getHubInventoryTurnoverReport
);

router.get(
  '/reports/absent-clients',
  authenticateUser,
  requirePermission('hub.guardians.read'),
  getHubAbsentClientsReport
);
router.get(
  '/reports/no-shows',
  authenticateUser,
  requirePermission('hub.appointments.read'),
  getHubNoShowsReport
);
router.get(
  '/reports/boarding-occupancy',
  authenticateUser,
  requirePermission('boarding.reservations.read'), requireBoardingModule,
  getHubBoardingOccupancySeriesReport
);
router.get(
  '/reports/client-cohorts',
  authenticateUser,
  requirePermission('hub.guardians.read'),
  getHubClientCohortsReport
);
router.get(
  '/reports/birthdays',
  authenticateUser,
  requirePermission('hub.guardians.read'),
  getHubBirthdaysReport
);
router.get(
  '/reports/grooming-productivity',
  authenticateUser,
  requirePermission('grooming.queue.read'), requireGroomingModule,
  getHubGroomingProductivityReport
);
router.get(
  '/reports/vaccines-due',
  authenticateUser,
  requirePermission('hub.clinic.read'), requireClinicModule,
  getHubVaccinesDueReport
);
router.post(
  '/reports/export-pdf',
  authenticateUser,
  requirePermission(['hub.reports.read', 'hub.financial.read', 'hub.inventory.read', 'hub.guardians.read']),
  postHubReportExportPdf
);
router.get(
  '/reports/email-schedules',
  authenticateUser,
  requirePermission(['hub.reports.read', 'hub.financial.read']),
  listHubReportEmailSchedules
);
router.post(
  '/reports/email-schedules',
  authenticateUser,
  requirePermission(['hub.reports.read', 'hub.financial.read']),
  createHubReportEmailSchedule
);
router.patch(
  '/reports/email-schedules/:id',
  authenticateUser,
  requirePermission(['hub.reports.read', 'hub.financial.read']),
  patchHubReportEmailSchedule
);
router.delete(
  '/reports/email-schedules/:id',
  authenticateUser,
  requirePermission(['hub.reports.read', 'hub.financial.read']),
  deleteHubReportEmailSchedule
);
router.post(
  '/reports/email-schedules/:id/run',
  authenticateUser,
  requirePermission(['hub.reports.read', 'hub.financial.read']),
  runHubReportEmailSchedule
);

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
  requirePermission('hub.appointments.write'), requireCoreOpsWrite,
  upsertHubAgendaCalendarBlock
);
router.delete(
  '/appointments/calendar-blocks/:id',
  authenticateUser,
  requirePermission('hub.appointments.write'), requireCoreOpsWrite,
  deleteHubAgendaCalendarBlock
);
router.get(
  '/appointments/stats/by-service-group',
  authenticateUser,
  requirePermission('hub.appointments.read'),
  getHubAppointmentsStatsByServiceGroup
);
router.get(
  '/appointments/series-ending-soon',
  authenticateUser,
  requirePermission('hub.appointments.read'),
  listHubSeriesEndingSoon
);
router.get('/appointments', authenticateUser, requirePermission('hub.appointments.read'), listHubAppointments);
router.post('/appointments', authenticateUser, requirePermission('hub.appointments.write'), requireCoreOpsWrite, createHubAppointment);
router.post('/appointments/batch', authenticateUser, requirePermission('hub.appointments.write'), requireCoreOpsWrite, createHubAppointmentBatch);
router.patch('/appointments/:id', authenticateUser, requirePermission('hub.appointments.write'), requireCoreOpsWrite, patchHubAppointment);

/* --- Orçamentos / prospects --- */
router.get('/prospects', authenticateUser, requirePermission('hub.prospects.read'), listHubProspects);
router.get('/prospects/:id', authenticateUser, requirePermission('hub.prospects.read'), getHubProspect);
router.post('/prospects', authenticateUser, requirePermission('hub.prospects.write'), requireCoreOpsWrite, createHubProspect);
router.patch('/prospects/:id', authenticateUser, requirePermission('hub.prospects.write'), requireCoreOpsWrite, patchHubProspect);

router.get('/quotes', authenticateUser, requirePermission('hub.quotes.read'), listHubQuotes);
/** Rotas estáticas antes de `:id` (senão `suggest-price` é capturado como UUID). */
router.post('/quotes/suggest-price', authenticateUser, requirePermission('hub.quotes.write'), requireCoreOpsWrite, suggestQuotePrice);
router.post('/quotes', authenticateUser, requirePermission('hub.quotes.write'), requireCoreOpsWrite, createHubQuote);
router.get('/quotes/:id', authenticateUser, requirePermission('hub.quotes.read'), getHubQuote);
router.get('/quotes/:id/pdf', authenticateUser, requirePermission('hub.quotes.read'), getHubQuotePdf);
router.patch('/quotes/:id', authenticateUser, requirePermission('hub.quotes.write'), requireCoreOpsWrite, patchHubQuote);
router.delete('/quotes/:id', authenticateUser, requirePermission('hub.quotes.write'), requireCoreOpsWrite, deleteHubQuote);
router.post('/quotes/:id/send', authenticateUser, requirePermission('hub.quotes.write'), requireCoreOpsWrite, sendHubQuote);
router.post('/quotes/:id/awaiting-return', authenticateUser, requirePermission('hub.quotes.write'), requireCoreOpsWrite, awaitingReturnHubQuote);
router.post('/quotes/:id/cancel', authenticateUser, requirePermission('hub.quotes.write'), requireCoreOpsWrite, cancelHubQuote);
router.post(
  '/quotes/:id/finalize-manual-conversion',
  authenticateUser,
  requirePermission('hub.quotes.write'), requireCoreOpsWrite,
  finalizeManualConversionHubQuote
);
router.post('/quotes/:id/convert', authenticateUser, requirePermission('hub.quotes.write'), requireCoreOpsWrite, convertHubQuote);
router.post('/quotes/:id/duplicate', authenticateUser, requirePermission('hub.quotes.write'), requireCoreOpsWrite, duplicateHubQuote);
router.post(
  '/quotes/:id/reopen-draft',
  authenticateUser,
  requirePermission('hub.quotes.write'), requireCoreOpsWrite,
  reopenHubQuoteAsDraft
);
router.post('/quotes/:id/public-token', authenticateUser, requirePermission('hub.quotes.write'), requireCoreOpsWrite, ensurePublicToken);

/* --- Clínica / Atendimentos --- */
router.get(
  '/encounters/day-board',
  authenticateUser,
  requirePermission('hub.clinic.read'), requireClinicModule,
  getHubEncountersDayBoard
);
router.get('/encounters', authenticateUser, requirePermission('hub.clinic.read'), requireClinicModule, listHubEncounters);
router.get('/encounters/:id', authenticateUser, requirePermission('hub.clinic.read'), requireClinicModule, getHubEncounter);
router.post(
  '/encounters/check-in',
  authenticateUser,
  requirePermission('hub.clinic.write'), requireClinicWrite,
  checkInHubClinicalWalkIn
);
router.post('/encounters', authenticateUser, requirePermission('hub.clinic.write'), requireClinicWrite, createHubEncounter);
router.post(
  '/encounters/open-from-appointment',
  authenticateUser,
  requirePermission('hub.clinic.write'), requireClinicWrite,
  openHubEncounterFromAppointment
);
router.patch('/encounters/:id', authenticateUser, requirePermission('hub.clinic.write'), requireClinicWrite, patchHubEncounter);
router.patch('/encounters/:id/amend', authenticateUser, requirePermission('hub.clinic.write'), requireClinicWrite, amendHubEncounter);
router.get('/encounters/:id/versions', authenticateUser, requirePermission('hub.clinic.read'), requireClinicModule, getHubEncounterVersions);
router.post(
  '/encounters/:id/complete',
  authenticateUser,
  requirePermission('hub.clinic.write'), requireClinicWrite,
  completeHubEncounter
);

/* --- Leva e Traz (paradas operacionais) --- */
router.get(
  '/pickup/day-board',
  authenticateUser,
  requirePermission('pickup.routes.read'), requirePickupArea,
  getHubPickupDayBoard,
);
router.get(
  '/pickup/driver-day',
  authenticateUser,
  requirePermission('pickup.routes.read'), requirePickupArea,
  getHubPickupDriverDay,
);
router.post(
  '/pickup/routes/suggest-batches',
  authenticateUser,
  requirePermission('pickup.routes.manage'), requirePickupWrite,
  suggestHubPickupBatches,
);
router.get(
  '/pickup/routes',
  authenticateUser,
  requirePermission('pickup.routes.read'), requirePickupArea,
  listHubPickupRoutes,
);
router.post(
  '/pickup/routes',
  authenticateUser,
  requirePermission('pickup.routes.manage'), requirePickupWrite,
  createHubPickupRoute,
);
router.get(
  '/pickup/routes/:id',
  authenticateUser,
  requirePermission('pickup.routes.read'), requirePickupArea,
  getHubPickupRoute,
);
router.patch(
  '/pickup/routes/:id',
  authenticateUser,
  requirePermission('pickup.routes.manage'), requirePickupWrite,
  patchHubPickupRoute,
);
router.post(
  '/pickup/routes/:id/stops',
  authenticateUser,
  requirePermission('pickup.routes.manage'), requirePickupWrite,
  addHubPickupStops,
);
router.post(
  '/pickup/routes/:id/split',
  authenticateUser,
  requirePermission('pickup.routes.manage'), requirePickupWrite,
  splitHubPickupRoute,
);
router.post(
  '/pickup/routes/:id/clinic-return',
  authenticateUser,
  requirePermission('pickup.routes.manage'), requirePickupWrite,
  addClinicReturnStop,
);
router.patch(
  '/pickup/stops/:id',
  authenticateUser,
  requirePermission('pickup.stops.update'), requirePickupWrite,
  patchHubPickupStop,
);
router.post(
  '/pickup/stops',
  authenticateUser,
  requirePermission('pickup.stops.update'), requirePickupWrite,
  createOrUpdateLooseStop,
);
router.get(
  '/pickup/my-route',
  authenticateUser,
  requirePermission('pickup.routes.read'), requirePickupArea,
  getMyPickupRoute,
);
router.get(
  '/pickup/my-routes',
  authenticateUser,
  requirePermission('pickup.routes.read'), requirePickupArea,
  getMyPickupRoutes,
);
router.post(
  '/pickup/routes/:id/claim',
  authenticateUser,
  requirePermission('pickup.routes.read'), requirePickupArea,
  claimHubPickupRoute,
);

/* --- Leva e Traz — Veículos e caixas de transporte --- */
router.get(
  '/pickup/vehicles',
  authenticateUser,
  requirePermission('pickup.routes.read'), requirePickupArea,
  listPickupVehicles,
);
router.post(
  '/pickup/vehicles',
  authenticateUser,
  requirePermission('pickup.routes.manage'), requirePickupWrite,
  createPickupVehicle,
);
router.patch(
  '/pickup/vehicles/:id',
  authenticateUser,
  requirePermission('pickup.routes.manage'), requirePickupWrite,
  patchPickupVehicle,
);
router.post(
  '/pickup/vehicles/:vehicleId/cages',
  authenticateUser,
  requirePermission('pickup.routes.manage'), requirePickupWrite,
  createTransportCage,
);
router.patch(
  '/pickup/cages/:id',
  authenticateUser,
  requirePermission('pickup.routes.manage'), requirePickupWrite,
  patchTransportCage,
);
router.delete(
  '/pickup/cages/:id',
  authenticateUser,
  requirePermission('pickup.routes.manage'), requirePickupWrite,
  deleteTransportCage,
);

/* --- Banho & Tosa (fila operacional) --- */
router.get(
  '/grooming/day-board',
  authenticateUser,
  requirePermission('grooming.queue.read'), requireGroomingModule,
  getHubGroomingDayBoard
);
router.post(
  '/grooming/sessions/open-from-appointment',
  authenticateUser,
  requirePermission('grooming.queue.manage'), requireGroomingWrite,
  openHubGroomingSessionFromAppointment
);
router.post(
  '/grooming/sessions',
  authenticateUser,
  requirePermission('grooming.queue.manage'), requireGroomingWrite,
  createHubGroomingSession
);
router.patch(
  '/grooming/sessions/:id',
  authenticateUser,
  requirePermission('grooming.queue.manage'), requireGroomingWrite,
  patchHubGroomingSession
);
router.post(
  '/grooming/sessions/:id/advance',
  authenticateUser,
  requirePermission('grooming.queue.manage'), requireGroomingWrite,
  advanceHubGroomingSession
);
router.get(
  '/grooming/sessions/:id/events',
  authenticateUser,
  requirePermission('grooming.queue.read'), requireGroomingModule,
  listHubGroomingSessionEvents
);
router.post(
  '/grooming/sessions/:id/events',
  authenticateUser,
  requirePermission('grooming.queue.manage'), requireGroomingWrite,
  postHubGroomingSessionEvent
);
router.get(
  '/grooming/sessions/:id/drawer',
  authenticateUser,
  requirePermission('grooming.queue.read'), requireGroomingModule,
  getHubGroomingSessionDrawer
);
router.post(
  '/grooming/sessions/:id/extras',
  authenticateUser,
  requirePermission('grooming.queue.manage'), requireGroomingWrite,
  postHubGroomingSessionExtra
);
router.patch(
  '/grooming/appointment-service-lines/:lineId',
  authenticateUser,
  requirePermission('grooming.queue.manage'), requireGroomingWrite,
  patchHubGroomingAppointmentServiceLine
);

/* --- Operação da Recepção (custódia) --- */
router.get(
  '/reception/board',
  authenticateUser,
  requirePermission('reception.ops.read'), requireReceptionArea,
  getHubReceptionBoard,
);
router.get(
  '/reception/handoffs/:id',
  authenticateUser,
  requirePermission('reception.ops.read'), requireReceptionArea,
  getHubReceptionHandoffDetail,
);
router.post(
  '/reception/handoffs/:id/resolve',
  authenticateUser,
  requirePermission('reception.ops.manage'), requireReceptionWrite,
  postHubReceptionResolve,
);

/* --- Casos clínicos --- */
router.get('/clinical/timeline', authenticateUser, requirePermission('hub.clinic.read'), requireClinicModule, listHubClinicalTimeline);
router.post('/clinical/timeline/notes', authenticateUser, requirePermission('hub.clinic.write'), requireClinicWrite, createHubClinicalTimelineNote);

/* --- Exames clínicos --- */
router.get('/clinical/exams', authenticateUser, requirePermission('hub.clinic.read'), requireClinicModule, listHubClinicalExams);
router.get(
  '/clinical/exams/export.csv',
  authenticateUser,
  requirePermission('hub.clinic.read'), requireClinicModule,
  exportHubClinicalExamsCsv,
);
router.get('/clinical/exams/:id', authenticateUser, requirePermission('hub.clinic.read'), requireClinicModule, getHubClinicalExam);
router.post('/clinical/exams', authenticateUser, requirePermission('hub.clinic.write'), requireClinicWrite, createHubClinicalExam);
router.patch('/clinical/exams/:id', authenticateUser, requirePermission('hub.clinic.write'), requireClinicWrite, patchHubClinicalExam);
router.delete('/clinical/exams/:id', authenticateUser, requirePermission('hub.clinic.write'), requireClinicWrite, deleteHubClinicalExam);
router.post('/clinical/exams/orders/issue', authenticateUser, requirePermission('hub.clinic.write'), requireClinicWrite, issueExamOrderDocumentHandler);
router.get('/clinical/exams/encounter/:encounterId/order-documents', authenticateUser, requirePermission('hub.clinic.read'), requireClinicModule, listExamOrderDocumentsByEncounter);
router.get('/clinical/exams/:id/order-documents', authenticateUser, requirePermission('hub.clinic.read'), requireClinicModule, listExamOrderDocuments);
router.post('/clinical/exams/order-documents/:docId/revoke', authenticateUser, requirePermission('hub.clinic.write'), requireClinicWrite, revokeExamOrderDocument);
router.get('/clinical/exams/:id/pdf', authenticateUser, requirePermission('hub.clinic.read'), requireClinicModule, getHubExamOrderPdf);

router.get('/clinical/specialist-referrals', authenticateUser, requirePermission('hub.clinic.read'), requireClinicModule, listHubSpecialistReferrals);
router.post('/clinical/specialist-referrals', authenticateUser, requirePermission('hub.clinic.write'), requireClinicWrite, createHubSpecialistReferral);
router.patch('/clinical/specialist-referrals/:id', authenticateUser, requirePermission('hub.clinic.write'), requireClinicWrite, patchHubSpecialistReferral);
router.delete('/clinical/specialist-referrals/:id', authenticateUser, requirePermission('hub.clinic.write'), requireClinicWrite, deleteHubSpecialistReferral);
router.post('/clinical/specialist-referrals/orders/issue', authenticateUser, requirePermission('hub.clinic.write'), requireClinicWrite, issueSpecialistReferralBundleHandler);
router.get('/clinical/specialist-referrals/encounter/:encounterId/documents', authenticateUser, requirePermission('hub.clinic.read'), requireClinicModule, listSpecialistReferralDocumentsByEncounter);
router.post('/clinical/specialist-referrals/:id/documents', authenticateUser, requirePermission('hub.clinic.write'), requireClinicWrite, issueSpecialistReferralDocumentHandler);
router.post('/clinical/specialist-referrals/:id/documents/:docId/revoke', authenticateUser, requirePermission('hub.clinic.write'), requireClinicWrite, revokeSpecialistReferralDocument);
router.get('/clinical/specialist-referrals/:id/pdf', authenticateUser, requirePermission('hub.clinic.read'), requireClinicModule, getHubSpecialistReferralPdf);

router.get('/clinical/cases', authenticateUser, requirePermission('hub.clinic.read'), requireClinicModule, listHubClinicalCases);
router.get('/clinical/cases/:id', authenticateUser, requirePermission('hub.clinic.read'), requireClinicModule, getHubClinicalCase);
router.post('/clinical/cases', authenticateUser, requirePermission('hub.clinic.write'), requireClinicWrite, createHubClinicalCase);
router.patch('/clinical/cases/:id', authenticateUser, requirePermission('hub.clinic.write'), requireClinicWrite, patchHubClinicalCase);
router.delete('/clinical/cases/:id', authenticateUser, requirePermission('hub.clinic.write'), requireClinicWrite, deleteHubClinicalCase);

router.get(
  '/clinical/cockpit/patient-context',
  authenticateUser,
  requirePermission('hub.clinic.read'), requireClinicModule,
  getHubVetCockpitPatientContext,
);

router.get(
  '/clinical/pet-flags',
  authenticateUser,
  requirePermission(['hub.clinic.read', 'hub.pets.read']),
  listHubPetClinicalFlags
);
router.post(
  '/clinical/pet-flags',
  authenticateUser,
  requirePermission([
    'hub.clinic.write',
    'hub.pets.write',
    'grooming.queue.manage',
    'boarding.reservations.manage',
  ]),
  upsertHubPetClinicalFlag
);
router.get(
  '/clinical/encounter-events',
  authenticateUser,
  requirePermission('hub.clinic.read'), requireClinicModule,
  listHubEncounterEvents
);
router.post(
  '/clinical/encounter-events',
  authenticateUser,
  requirePermission('hub.clinic.write'), requireClinicWrite,
  createHubEncounterEvent
);
router.get(
  '/clinical/alerts',
  authenticateUser,
  requirePermission('hub.clinic.read'), requireClinicModule,
  getHubClinicalAlerts
);

router.get(
  '/clinical/prescriptions',
  authenticateUser,
  requirePermission('hub.clinic.read'), requireClinicModule,
  listHubPrescriptions
);
router.get(
  '/clinical/prescription-lookups',
  authenticateUser,
  requirePermission('hub.clinic.read'), requireClinicModule,
  listHubPrescriptionLookups
);
router.post(
  '/clinical/prescription-lookups',
  authenticateUser,
  requirePermission('hub.clinic.write'), requireClinicWrite,
  createHubPrescriptionLookup
);
router.get(
  '/clinical/prescriptions/:id/pdf',
  authenticateUser,
  requirePermission('hub.clinic.read'), requireClinicModule,
  getHubPrescriptionPdf
);
router.get(
  '/clinical/prescriptions/:id/documents',
  authenticateUser,
  requirePermission('hub.clinic.read'), requireClinicModule,
  listPrescriptionDocuments
);
router.post(
  '/clinical/prescriptions/:id/documents',
  authenticateUser,
  requirePermission('hub.clinic.write'), requireClinicWrite,
  issuePrescriptionDocument
);
router.post(
  '/clinical/prescriptions/:id/documents/:docId/revoke',
  authenticateUser,
  requirePermission('hub.clinic.write'), requireClinicWrite,
  revokePrescriptionDocument
);
router.post(
  '/clinical/prescriptions',
  authenticateUser,
  requirePermission('hub.clinic.write'), requireClinicWrite,
  createHubPrescription
);
router.patch(
  '/clinical/prescriptions/:id',
  authenticateUser,
  requirePermission('hub.clinic.write'), requireClinicWrite,
  patchHubPrescription
);
router.get(
  '/clinical/vaccinations',
  authenticateUser,
  requirePermission('hub.clinic.read'), requireClinicModule,
  listHubVaccinations
);
router.post(
  '/clinical/vaccinations',
  authenticateUser,
  requirePermission('hub.clinic.write'), requireClinicWrite,
  createHubVaccination
);
router.get(
  '/clinical/medication-administrations',
  authenticateUser,
  requirePermission('hub.clinic.read'), requireClinicModule,
  listHubMedicationAdministrations
);
router.post(
  '/clinical/medication-administrations',
  authenticateUser,
  requirePermission('hub.clinic.write'), requireClinicWrite,
  createHubMedicationAdministration
);
router.get(
  '/clinical/attachments',
  authenticateUser,
  requirePermission('hub.clinic.read'), requireClinicModule,
  listHubClinicalAttachments
);
router.post(
  '/clinical/attachments',
  authenticateUser,
  requirePermission('hub.clinic.write'), requireClinicWrite,
  createHubClinicalAttachment
);
router.post(
  '/clinical/attachments/upload',
  authenticateUser,
  requirePermission('hub.clinic.write'), requireClinicWrite,
  uploadHubClinicalAttachment
);

router.get(
  '/clinical/hospital-beds',
  authenticateUser,
  requirePermission('hub.clinic.read'), requireClinicModule,
  listHubHospitalBeds
);
router.post(
  '/clinical/hospital-beds',
  authenticateUser,
  requirePermission('hub.clinic.write'), requireClinicWrite,
  createHubHospitalBed
);
router.get(
  '/clinical/hospitalizations',
  authenticateUser,
  requirePermission('hub.clinic.read'), requireClinicModule,
  listHubHospitalizations
);
router.post(
  '/clinical/hospitalizations',
  authenticateUser,
  requirePermission('hub.clinic.write'), requireClinicWrite,
  createHubHospitalization
);
router.get(
  '/clinical/hospitalizations/:id',
  authenticateUser,
  requirePermission('hub.clinic.read'), requireClinicModule,
  getHubHospitalization
);
router.patch(
  '/clinical/hospitalizations/:id',
  authenticateUser,
  requirePermission('hub.clinic.write'), requireClinicWrite,
  patchHubHospitalization
);
router.post(
  '/clinical/hospitalizations/:id/daily-notes',
  authenticateUser,
  requirePermission('hub.clinic.write'), requireClinicWrite,
  addHubHospitalizationDailyNote
);
router.get(
  '/clinical/hospitalizations/:id/events',
  authenticateUser,
  requirePermission('hub.clinic.read'), requireClinicModule,
  listHubHospitalizationEvents
);
router.post(
  '/clinical/hospitalizations/:id/events',
  authenticateUser,
  requirePermission('hub.clinic.write'), requireClinicWrite,
  createHubHospitalizationEvent
);
router.get(
  '/clinical/hospitalizations/:id/charges',
  authenticateUser,
  requirePermission('hub.clinic.read'), requireClinicModule,
  listHubHospitalizationCharges
);
router.post(
  '/clinical/hospitalizations/:id/charges',
  authenticateUser,
  requirePermission('hub.clinic.write'), requireClinicWrite,
  createHubHospitalizationCharge
);
router.patch(
  '/clinical/hospitalizations/:id/charges/:chargeId',
  authenticateUser,
  requirePermission('hub.clinic.write'), requireClinicWrite,
  patchHubHospitalizationCharge
);
router.delete(
  '/clinical/hospitalizations/:id/charges/:chargeId',
  authenticateUser,
  requirePermission('hub.clinic.write'), requireClinicWrite,
  deleteHubHospitalizationCharge
);
router.post(
  '/clinical/hospitalizations/:id/charges/:chargeId/approve-price',
  authenticateUser,
  requirePermission('hub.financial.write'), requireCoreOpsWrite,
  approveHubHospitalizationChargePrice
);

router.get(
  '/clinical/hospitalizations/:id/medication-orders',
  authenticateUser,
  requirePermission('hub.clinic.read'),
  requireClinicModule,
  listHubHospitalizationMedOrders,
);
router.post(
  '/clinical/hospitalizations/:id/medication-orders',
  authenticateUser,
  requirePermission(['hub.clinic.med_orders.manage', 'hub.clinic.write']),
  requireClinicWrite,
  createHubHospitalizationMedOrder,
);
router.post(
  '/clinical/hospitalizations/:id/medication-orders/:orderId/versions',
  authenticateUser,
  requirePermission(['hub.clinic.med_orders.manage', 'hub.clinic.write']),
  requireClinicWrite,
  createHubHospitalizationMedOrderVersion,
);
router.post(
  '/clinical/hospitalizations/:id/medication-orders/:orderId/suspend',
  authenticateUser,
  requirePermission(['hub.clinic.med_orders.manage', 'hub.clinic.write']),
  requireClinicWrite,
  suspendHubHospitalizationMedOrder,
);
router.post(
  '/clinical/hospitalizations/:id/medication-orders/:orderId/resume',
  authenticateUser,
  requirePermission(['hub.clinic.med_orders.manage', 'hub.clinic.write']),
  requireClinicWrite,
  resumeHubHospitalizationMedOrder,
);
router.get(
  '/clinical/hospitalizations/:id/medication-doses',
  authenticateUser,
  requirePermission('hub.clinic.read'),
  requireClinicModule,
  listHubHospitalizationMedDoses,
);
router.post(
  '/clinical/hospitalizations/:id/medication-doses/:doseId/complete',
  authenticateUser,
  requirePermission(['hub.clinic.med_admin.write', 'hub.clinic.write']),
  requireClinicWrite,
  completeHubHospitalizationMedDose,
);
router.get(
  '/clinical/hospitalizations/:id/medication-plan/print-model',
  authenticateUser,
  requirePermission('hub.clinic.read'),
  requireClinicModule,
  getHubHospitalizationMedPrintModel,
);

router.get('/clinical/surgeries', authenticateUser, requirePermission('hub.clinic.read'), requireClinicModule, listHubSurgeries);
router.post('/clinical/surgeries', authenticateUser, requirePermission('hub.clinic.write'), requireClinicWrite, createHubSurgery);
router.get('/clinical/surgeries/:id', authenticateUser, requirePermission('hub.clinic.read'), requireClinicModule, getHubSurgery);
router.patch('/clinical/surgeries/:id', authenticateUser, requirePermission('hub.clinic.write'), requireClinicWrite, patchHubSurgery);
router.get(
  '/clinical/surgeries/:id/services',
  authenticateUser,
  requirePermission('hub.clinic.read'), requireClinicModule,
  listHubSurgeryServices
);
router.post(
  '/clinical/surgeries/:id/services',
  authenticateUser,
  requirePermission('hub.clinic.write'), requireClinicWrite,
  createHubSurgeryService
);
router.patch(
  '/clinical/surgeries/:id/services/:serviceId',
  authenticateUser,
  requirePermission('hub.clinic.write'), requireClinicWrite,
  patchHubSurgeryService
);
router.delete(
  '/clinical/surgeries/:id/services/:serviceId',
  authenticateUser,
  requirePermission('hub.clinic.write'), requireClinicWrite,
  deleteHubSurgeryService
);
router.post(
  '/clinical/surgeries/:id/services/:serviceId/approve-price',
  authenticateUser,
  requirePermission('hub.financial.write'), requireCoreOpsWrite,
  approveHubSurgeryServicePrice
);

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
  requirePermission('hub.receivables.create'), requireCoreOpsWrite,
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
  requirePermission('hub.receivables.create'), requireCoreOpsWrite,
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
  requirePermission('hub.receivables.create'), requireCoreOpsWrite,
  postHubComandaSyncFromOrigin
);
router.post(
  '/comandas/:id/apply-package',
  authenticateUser,
  requirePermission('hub.receivables.create'), requireCoreOpsWrite,
  postHubComandaApplyPackage
);
router.post(
  '/comandas/:id/checkout',
  authenticateUser,
  requirePermission('hub.receivables.create'), requireCoreOpsWrite,
  postHubComandaCheckout
);
router.post(
  '/comandas/:id/resolve-cancellation',
  authenticateUser,
  requirePermission('hub.financial.write'), requireCoreOpsWrite,
  postHubComandaResolveCancellation
);
router.post(
  '/comandas/suggest-item-price',
  authenticateUser,
  requirePermission('hub.receivables.create'), requireCoreOpsWrite,
  postHubComandaSuggestItemPrice
);
router.post(
  '/comandas/checkout-bulk',
  authenticateUser,
  requirePermission('hub.receivables.create'), requireCoreOpsWrite,
  postHubComandaCheckoutBulk
);
router.post(
  '/comandas/:id/items',
  authenticateUser,
  requirePermission('hub.receivables.create'), requireCoreOpsWrite,
  postHubComandaAddItems
);
router.patch(
  '/comandas/:id/items/:itemId',
  authenticateUser,
  requirePermission('hub.receivables.create'), requireCoreOpsWrite,
  patchHubComandaItem
);
router.delete(
  '/comandas/:id/items/:itemId',
  authenticateUser,
  requirePermission('hub.receivables.create'), requireCoreOpsWrite,
  deleteHubComandaItem
);
router.patch(
  '/comandas/:id',
  authenticateUser,
  requirePermission('hub.receivables.create'), requireCoreOpsWrite,
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
  requirePermission('hub.financial.write'), requireCoreOpsWrite,
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
  requirePermission('hub.receivables.create'), requireCoreOpsWrite,
  postHubFinanceReceivable
);
router.post(
  '/finance/receivables/:id/product-lines',
  authenticateUser,
  requirePermission('hub.inventory.write'), requireCoreCatalogWrite,
  postHubFinanceReceivableProductLine
);
router.delete(
  '/finance/receivables/:id/product-lines/:lineId',
  authenticateUser,
  requirePermission('hub.inventory.write'), requireCoreCatalogWrite,
  deleteHubFinanceReceivableProductLine
);
router.post(
  '/finance/receivables/:id/cancel',
  authenticateUser,
  requirePermission('hub.financial.write'), requireCoreOpsWrite,
  postHubFinanceReceivableCancel
);
router.post(
  '/finance/waive-billing',
  authenticateUser,
  requirePermission('hub.financial.write'), requireCoreOpsWrite,
  postHubFinanceWaiveBilling
);
router.post(
  '/finance/receivables/:id/payments',
  authenticateUser,
  requirePermission('hub.cash.receive'), requireCoreOpsWrite,
  postHubFinanceReceivablePayment
);
router.post(
  '/finance/receivables/:id/payments/historical-cash',
  authenticateUser,
  requirePermission('hub.financial.adjust'), requireCoreOpsWrite,
  postHubFinanceReceivableHistoricalCash
);
router.post(
  '/finance/charge-bundles',
  authenticateUser,
  requirePermission('hub.receivables.create'), requireCoreOpsWrite,
  postHubChargeBundle
);
router.get(
  '/finance/charge-bundles',
  authenticateUser,
  requirePermission('hub.financial.read'),
  listHubChargeBundles
);
router.get(
  '/finance/charge-bundles/:id',
  authenticateUser,
  requirePermission('hub.financial.read'),
  getHubChargeBundle
);
router.patch(
  '/finance/charge-bundles/:id/mark-sent',
  authenticateUser,
  requirePermission('hub.receivables.create'), requireCoreOpsWrite,
  patchHubChargeBundleMarkSent
);
router.get(
  '/finance/charge-bundles/:id/pdf',
  authenticateUser,
  requirePermission('hub.financial.read'),
  getHubChargeBundlePdf
);
router.get(
  '/finance/payments',
  authenticateUser,
  requirePermission('hub.financial.read'),
  listHubFinancePayments
);
router.post(
  '/finance/payments/:id/reverse',
  authenticateUser,
  requirePermission('hub.payments.reverse'),
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
  requirePermission('hub.cash.session'), requireCoreOpsWrite,
  postHubFinanceCashSessionOpen
);
router.post(
  '/finance/cash-sessions/:id/close',
  authenticateUser,
  requirePermission('hub.cash.session'), requireCoreOpsWrite,
  postHubFinanceCashSessionClose
);
router.post(
  '/finance/handoff-pending',
  authenticateUser,
  requirePermission('hub.cash.session'), requireCoreOpsWrite,
  postHubFinanceHandoffPending
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
  '/finance/reports/sales-adjustments',
  authenticateUser,
  requirePermission('hub.financial.read'),
  getHubFinanceSalesAdjustmentsReport
);
router.get(
  '/finance/reports/commissions',
  authenticateUser,
  requirePermission('hub.financial.read'),
  getHubFinanceCommissionsReport
);
router.get(
  '/finance/reports/top-clients',
  authenticateUser,
  requirePermission('hub.financial.read'),
  getHubFinanceTopClientsReport
);
router.get(
  '/finance/reports/packages',
  authenticateUser,
  requirePermission('hub.financial.read'),
  getHubFinancePackagesReport
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
  requirePermission('hub.financial.write'), requireCoreOpsWrite,
  postHubFinanceExpense
);
router.patch(
  '/finance/expenses/:id',
  authenticateUser,
  requirePermission('hub.financial.write'), requireCoreOpsWrite,
  patchHubFinanceExpense
);
router.delete(
  '/finance/expenses/:id',
  authenticateUser,
  requirePermission('hub.financial.write'), requireCoreOpsWrite,
  deleteHubFinanceExpense
);
router.get(
  '/finance/payables',
  authenticateUser,
  requirePermission('hub.financial.read'),
  listHubFinancePayables
);
router.post(
  '/finance/payables',
  authenticateUser,
  requirePermission('hub.financial.write'), requireCoreOpsWrite,
  postHubFinancePayable
);
router.patch(
  '/finance/payables/:id',
  authenticateUser,
  requirePermission('hub.financial.write'), requireCoreOpsWrite,
  patchHubFinancePayable
);
router.post(
  '/finance/payables/:id/pay',
  authenticateUser,
  requirePermission('hub.financial.write'), requireCoreOpsWrite,
  postHubFinancePayablePay
);
router.post(
  '/finance/payables/:id/cancel',
  authenticateUser,
  requirePermission('hub.financial.write'), requireCoreOpsWrite,
  postHubFinancePayableCancel
);
router.get(
  '/finance/payable-schedules',
  authenticateUser,
  requirePermission('hub.financial.read'),
  listHubFinancePayableSchedules
);
router.post(
  '/finance/payable-schedules',
  authenticateUser,
  requirePermission('hub.financial.write'), requireCoreOpsWrite,
  postHubFinancePayableSchedule
);
router.patch(
  '/finance/payable-schedules/:id',
  authenticateUser,
  requirePermission('hub.financial.write'), requireCoreOpsWrite,
  patchHubFinancePayableSchedule
);
router.post(
  '/finance/payable-schedules/:id/end',
  authenticateUser,
  requirePermission('hub.financial.write'), requireCoreOpsWrite,
  postHubFinancePayableScheduleEnd
);
router.post(
  '/finance/cash-sessions/:id/movements',
  authenticateUser,
  requirePermission('hub.cash.session'), requireCoreOpsWrite,
  postHubFinanceCashMovement
);
router.post(
  '/finance/credit-movements',
  authenticateUser,
  requirePermission('hub.financial.write'), requireCoreOpsWrite,
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
  requireCoreCatalogWrite,
  postHubPackage
);
router.patch(
  '/finance/packages/:id',
  authenticateUser,
  requirePermission('hub.financial.write'),
  requireCoreCatalogWrite,
  patchHubPackage
);
router.post(
  '/finance/series-invoices/issue',
  authenticateUser,
  requirePermission('hub.financial.write'), requireCoreOpsWrite,
  postHubSeriesInvoiceIssue
);
router.post(
  '/finance/series-invoices/run-job',
  authenticateUser,
  requirePermission('hub.financial.write'), requireCoreOpsWrite,
  postHubSeriesInvoiceRunJob
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
router.post(
  '/finance/package-balances/:id/cancel',
  authenticateUser,
  requirePermission('hub.financial.write'),
  requireCoreOpsWrite,
  postHubPackageBalanceCancel
);
router.get(
  '/finance/package-balances/:id/refund-preview',
  authenticateUser,
  requirePermission('hub.financial.read'),
  getHubPackageBalanceRefundPreview
);
router.post(
  '/finance/package-balances/:id/refund',
  authenticateUser,
  requirePermission('hub.financial.write'),
  requireCoreOpsWrite,
  postHubPackageBalanceRefund
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
  requireCoreCatalogWrite,
  postHubCommissionRule
);
router.patch(
  '/finance/commission-rules/:id',
  authenticateUser,
  requirePermission('hub.financial.write'),
  requireCoreCatalogWrite,
  patchHubCommissionRule
);
router.delete(
  '/finance/commission-rules/:id',
  authenticateUser,
  requirePermission('hub.financial.write'),
  requireCoreCatalogWrite,
  deleteHubCommissionRule
);

/* --- Hotel & Creche (boarding operacional) --- */
router.get(
  '/boarding/day-board',
  authenticateUser,
  requirePermission('boarding.reservations.read'), requireBoardingModule,
  getHubBoardingDayBoard
);
router.post(
  '/boarding/reservations/open-from-appointment',
  authenticateUser,
  requirePermission('boarding.reservations.manage'), requireBoardingWrite,
  openHubBoardingReservationFromAppointment
);
router.post(
  '/boarding/reservations',
  authenticateUser,
  requirePermission('boarding.reservations.manage'), requireBoardingWrite,
  createHubBoardingReservation
);
router.patch(
  '/boarding/reservations/:id',
  authenticateUser,
  requirePermission('boarding.reservations.manage'), requireBoardingWrite,
  patchHubBoardingReservation
);
router.post(
  '/boarding/reservations/:id/start-checkout-prep',
  authenticateUser,
  requirePermission('boarding.reservations.manage'), requireBoardingWrite,
  postHubBoardingStartCheckoutPrep
);
router.post(
  '/boarding/reservations/:id/release-for-handoff',
  authenticateUser,
  requirePermission('boarding.reservations.manage'), requireBoardingWrite,
  postHubBoardingReleaseForHandoff
);
router.post(
  '/boarding/reservations/:id/revert-handoff-ready',
  authenticateUser,
  requirePermission('boarding.reservations.manage'), requireBoardingWrite,
  postHubBoardingRevertHandoffReady
);
router.get(
  '/boarding/reservations/:id/drawer',
  authenticateUser,
  requirePermission('boarding.reservations.read'), requireBoardingModule,
  getHubBoardingReservationDrawer
);
router.post(
  '/boarding/reservations/:id/daily-logs',
  authenticateUser,
  requirePermission('boarding.daily_report.write'), requireBoardingWrite,
  postHubBoardingDailyLog
);
router.get(
  '/boarding/unit-settings',
  authenticateUser,
  requirePermission('boarding.reservations.read'), requireBoardingModule,
  getHubBoardingUnitSettings
);
router.patch(
  '/boarding/unit-settings',
  authenticateUser,
  requirePermission('boarding.reservations.manage'), requireBoardingWrite,
  patchHubBoardingUnitSettings
);
router.get(
  '/boarding/occupancy',
  authenticateUser,
  requirePermission('boarding.reservations.read'), requireBoardingModule,
  getHubBoardingOccupancy
);
router.get(
  '/boarding/calendar',
  authenticateUser,
  requirePermission('boarding.reservations.read'), requireBoardingModule,
  getHubBoardingCalendar
);
router.get(
  '/boarding/ops-board',
  authenticateUser,
  requirePermission('boarding.reservations.read'), requireBoardingModule,
  getHubBoardingOpsBoard
);
router.get(
  '/boarding/reservations/:id/timeline',
  authenticateUser,
  requirePermission('boarding.reservations.read'), requireBoardingModule,
  getHubBoardingReservationTimeline
);
router.get(
  '/boarding/pets/:petId/care-profile',
  authenticateUser,
  requirePermission('boarding.reservations.read'), requireBoardingModule,
  getHubPetCareProfile
);
router.put(
  '/boarding/pets/:petId/care-profile',
  authenticateUser,
  requirePermission('boarding.reservations.manage'), requireBoardingWrite,
  putHubPetCareProfile
);
router.get(
  '/boarding/reservations/:id/care-plan',
  authenticateUser,
  requirePermission('boarding.reservations.read'), requireBoardingModule,
  getHubBoardingCarePlan
);
router.put(
  '/boarding/reservations/:id/care-plan',
  authenticateUser,
  requirePermission('boarding.reservations.manage'), requireBoardingWrite,
  putHubBoardingCarePlan
);
router.post(
  '/boarding/reservations/:id/care-plan/tutor-link',
  authenticateUser,
  requirePermission('boarding.reservations.manage'), requireBoardingWrite,
  postHubBoardingCareTutorLink
);
router.get(
  '/boarding/tasks',
  authenticateUser,
  requirePermission('boarding.reservations.read'), requireBoardingModule,
  getHubBoardingTasks
);
router.post(
  '/boarding/tasks/batch-activity',
  authenticateUser,
  requirePermission('boarding.daily_report.write'), requireBoardingWrite,
  postHubBoardingBatchActivity
);
router.post(
  '/boarding/tasks/:id/execute',
  authenticateUser,
  requirePermission('boarding.daily_report.write'), requireBoardingWrite,
  postHubBoardingTaskExecute
);
router.post(
  '/boarding/reservations/:id/tasks',
  authenticateUser,
  requirePermission('boarding.daily_report.write'), requireBoardingWrite,
  postHubBoardingTask
);
router.get(
  '/boarding/reservations/:id/incidents',
  authenticateUser,
  requirePermission('boarding.reservations.read'), requireBoardingModule,
  getHubBoardingIncidents
);
router.post(
  '/boarding/reservations/:id/incidents',
  authenticateUser,
  requirePermission('boarding.daily_report.write'), requireBoardingWrite,
  postHubBoardingIncident
);
router.patch(
  '/boarding/incidents/:id',
  authenticateUser,
  requirePermission('boarding.daily_report.write'), requireBoardingWrite,
  patchHubBoardingIncident
);
router.get(
  '/boarding/reservations/:id/belongings',
  authenticateUser,
  requirePermission('boarding.reservations.read'), requireBoardingModule,
  getHubBoardingBelongings
);
router.post(
  '/boarding/reservations/:id/belongings',
  authenticateUser,
  requirePermission('boarding.reservations.manage'), requireBoardingWrite,
  postHubBoardingBelonging
);
router.patch(
  '/boarding/belongings/:id',
  authenticateUser,
  requirePermission('boarding.reservations.manage'), requireBoardingWrite,
  patchHubBoardingBelonging
);
router.delete(
  '/boarding/belongings/:id',
  authenticateUser,
  requirePermission('boarding.reservations.manage'), requireBoardingWrite,
  deleteHubBoardingBelonging
);
router.get(
  '/boarding/reservations/:id/extras',
  authenticateUser,
  requirePermission('boarding.reservations.read'), requireBoardingModule,
  getHubBoardingExtras
);
router.post(
  '/boarding/reservations/:id/extras',
  authenticateUser,
  requirePermission('boarding.reservations.manage'), requireBoardingWrite,
  postHubBoardingExtra
);
router.delete(
  '/boarding/extras/:id',
  authenticateUser,
  requirePermission('boarding.reservations.manage'), requireBoardingWrite,
  deleteHubBoardingExtra
);
router.get(
  '/boarding/reservations/:id/media',
  authenticateUser,
  requirePermission('boarding.reservations.read'), requireBoardingModule,
  getHubBoardingMedia
);
router.post(
  '/boarding/reservations/:id/media',
  authenticateUser,
  requirePermission('boarding.daily_report.write'), requireBoardingWrite,
  uploadHubBoardingMedia
);
router.delete(
  '/boarding/media/:id',
  authenticateUser,
  requirePermission('boarding.daily_report.write'), requireBoardingWrite,
  deleteHubBoardingMedia
);
router.get(
  '/boarding/spaces',
  authenticateUser,
  requirePermission('boarding.reservations.read'), requireBoardingModule,
  getHubBoardingSpaces
);
router.post(
  '/boarding/spaces',
  authenticateUser,
  requirePermission('boarding.reservations.manage'), requireBoardingWrite,
  postHubBoardingSpace
);
router.patch(
  '/boarding/spaces/:id',
  authenticateUser,
  requirePermission('boarding.reservations.manage'), requireBoardingWrite,
  patchHubBoardingSpace
);
router.delete(
  '/boarding/spaces/:id',
  authenticateUser,
  requirePermission('boarding.reservations.manage'), requireBoardingWrite,
  deleteHubBoardingSpace
);
router.get(
  '/boarding/handoffs',
  authenticateUser,
  requirePermission('boarding.reservations.read'), requireBoardingModule,
  getHubBoardingHandoffs
);
router.post(
  '/boarding/handoffs',
  authenticateUser,
  requirePermission('boarding.daily_report.write'), requireBoardingWrite,
  postHubBoardingHandoff
);
router.post(
  '/boarding/handoffs/:id/acknowledge',
  authenticateUser,
  requirePermission('boarding.daily_report.write'), requireBoardingWrite,
  postHubBoardingHandoffAcknowledge
);
router.get(
  '/boarding/reservations/:id/tutor-report',
  authenticateUser,
  requirePermission('boarding.reservations.read'), requireBoardingModule,
  getHubBoardingTutorReport
);
router.post(
  '/boarding/reservations/:id/tutor-reports',
  authenticateUser,
  requirePermission('boarding.reservations.read'), requireBoardingModule,
  postHubBoardingTutorReport
);

// ─── Comunicação — log de tentativas (click-to-chat / in-app) ──────────────
router.post('/message-logs', authenticateUser, postHubMessageLog);

export default router;

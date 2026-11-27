"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../../../middleware/authMiddleware");
const rateLimiter_js_1 = require("../../../middleware/rateLimiter.js");
const hubEntitlements_js_1 = require("../hubEntitlements.js");
const hubSignupController_js_1 = require("../hubSignupController.js");
const requireClinicModule = (0, hubEntitlements_js_1.requireHubEntitlement)({ module: 'clinic' });
const requireGroomingModule = (0, hubEntitlements_js_1.requireHubEntitlement)({ module: 'grooming' });
const requireBoardingModule = (0, hubEntitlements_js_1.requireHubEntitlement)({ module: 'boarding' });
const requirePickupArea = (0, hubEntitlements_js_1.requireHubEntitlement)({ planArea: 'leva_traz' });
const requireReceptionArea = (0, hubEntitlements_js_1.requireHubEntitlement)({ planArea: 'recepcao' });
/** Ops do dia: permitidas em soft_lock; bloqueadas em read_history. */
const requireGroomingWrite = (0, hubEntitlements_js_1.requireHubEntitlement)({
    module: 'grooming',
    mutating: true,
    allowSoftLockWrite: true,
});
const requireBoardingWrite = (0, hubEntitlements_js_1.requireHubEntitlement)({
    module: 'boarding',
    mutating: true,
    allowSoftLockWrite: true,
});
const requirePickupWrite = (0, hubEntitlements_js_1.requireHubEntitlement)({
    planArea: 'leva_traz',
    mutating: true,
    allowSoftLockWrite: true,
});
const requireReceptionWrite = (0, hubEntitlements_js_1.requireHubEntitlement)({
    planArea: 'recepcao',
    mutating: true,
    allowSoftLockWrite: true,
});
const requireClinicWrite = (0, hubEntitlements_js_1.requireHubEntitlement)({
    module: 'clinic',
    mutating: true,
    allowSoftLockWrite: true,
});
/** Catálogo admin (estoque itens/fornecedores, service-types): bloqueado em soft_lock e read_history. */
const requireCoreCatalogWrite = (0, hubEntitlements_js_1.requireHubEntitlement)({ module: 'hub_core', mutating: true });
/** Ops core (agenda, tutores, pets, movimentos de estoque, financeiro do dia). */
const requireCoreOpsWrite = (0, hubEntitlements_js_1.requireHubEntitlement)({
    module: 'hub_core',
    mutating: true,
    allowSoftLockWrite: true,
});
/** Capacidade de unidade: bloqueado em soft_lock/read_history (+ limite do plano). */
const requireUnitCapacityWrite = (0, hubEntitlements_js_1.requireHubEntitlement)({
    module: 'hub_core',
    mutating: true,
    capacity: 'unit',
});
/** Capacidade de usuário/convite: bloqueado em soft_lock/read_history (+ limite do plano). */
const requireUserCapacityWrite = (0, hubEntitlements_js_1.requireHubEntitlement)({
    module: 'hub_core',
    mutating: true,
    capacity: 'user',
});
const hubDayOpsSummaryController_1 = require("../hubDayOpsSummaryController");
const hubInvitationsController_js_1 = require("../hubInvitationsController.js");
const hubMessageLogsController_1 = require("../hubMessageLogsController");
const guardiansController_1 = require("../guardiansController");
const hubPetsController_1 = require("../hubPetsController");
const hubServiceTypesController_1 = require("../hubServiceTypesController");
const hubServiceGroupsController_1 = require("../hubServiceGroupsController");
const hubServiceGroupChecklistController_1 = require("../hubServiceGroupChecklistController");
const hubServiceAddonsController_1 = require("../hubServiceAddonsController");
const hubInventoryController_1 = require("../hubInventoryController");
const hubReportsController_1 = require("../hubReportsController");
const hubReportExportPdf_1 = require("../hubReportExportPdf");
const hubReportEmailSchedulesController_1 = require("../hubReportEmailSchedulesController");
const hubStaffController_1 = require("../hubStaffController");
const hubStaffPhotoController_1 = require("../hubStaffPhotoController");
const hubStaffSignatureController_1 = require("../hubStaffSignatureController");
const hubProfilePhotoController_js_1 = require("../hubProfilePhotoController.js");
const hubClinicProfileController_js_1 = require("../hubClinicProfileController.js");
const hubClinicPublicProfileController_js_1 = require("../hubClinicPublicProfileController.js");
const hubSessionController_js_1 = require("../hubSessionController.js");
const hubSubscriptionController_js_1 = require("../hubSubscriptionController.js");
const hubAppointmentsController_1 = require("../hubAppointmentsController");
const hubClinicSettingsController_1 = require("../hubClinicSettingsController");
const hubSpecialPricesController_1 = require("../hubSpecialPricesController");
const hubProspectsController_1 = require("../hubProspectsController");
const hubEncountersController_1 = require("../hubEncountersController");
const hubGroomingController_1 = require("../hubGroomingController");
const hubReceptionController_1 = require("../hubReceptionController");
const hubPickupController_1 = require("../hubPickupController");
const hubPickupVehiclesController_1 = require("../hubPickupVehiclesController");
const hubResourcesController_1 = require("../hubResourcesController");
const hubPartnerClinicsController_1 = require("../hubPartnerClinicsController");
const hubClinicalTermTemplatesController_1 = require("../hubClinicalTermTemplatesController");
const hubGroomingDrawerController_1 = require("../hubGroomingDrawerController");
const hubClinicalCasesController_1 = require("../hubClinicalCasesController");
const hubClinicalTimelineController_1 = require("../hubClinicalTimelineController");
const hubClinicalExamsController_1 = require("../hubClinicalExamsController");
const hubExamOrderDocumentsController_1 = require("../hubExamOrderDocumentsController");
const hubSpecialistReferralsController_1 = require("../hubSpecialistReferralsController");
const hubClinicalModulesController_1 = require("../hubClinicalModulesController");
const hubClinicalBillableServicesController_1 = require("../hubClinicalBillableServicesController");
const hubHospitalizationMedPlanController_1 = require("../hubHospitalizationMedPlanController");
const hubPrescriptionLookupsController_1 = require("../hubPrescriptionLookupsController");
const hubVetCockpitController_js_1 = require("../hubVetCockpitController.js");
const hubQuotesController_1 = require("../hubQuotesController");
const hubFinancialController_1 = require("../hubFinancialController");
const hubChargeBundlesController_1 = require("../hubChargeBundlesController");
const hubComandasController_1 = require("../hubComandasController");
const hubCustomerCreditController_1 = require("../hubCustomerCreditController");
const hubPackagesController_1 = require("../hubPackagesController");
const hubSeriesBillingController_1 = require("../hubSeriesBillingController");
const hubCommissionRulesController_1 = require("../hubCommissionRulesController");
const hubBoardingController_1 = require("../hubBoardingController");
const hubBoardingDrawerController_1 = require("../hubBoardingDrawerController");
const hubBoardingCareController_1 = require("../hubBoardingCareController");
const hubBoardingTasksController_1 = require("../hubBoardingTasksController");
const hubBoardingRecordsController_1 = require("../hubBoardingRecordsController");
const hubBoardingOpsController_1 = require("../hubBoardingOpsController");
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
/** Cadastro Hub (público) e onboarding clínica+unidade */
router.post('/signup', rateLimiter_js_1.authLimiter, hubSignupController_js_1.postHubSignup);
/** Convites Hub (público) */
router.get('/invitations/preview', rateLimiter_js_1.authLimiter, hubInvitationsController_js_1.previewHubInvitation);
router.post('/invitations/signup', rateLimiter_js_1.authLimiter, hubInvitationsController_js_1.signupFromHubInvitation);
/** Limite dedicado ao Hub autenticado (polling, modais com vários GETs). */
router.use(rateLimiter_js_1.hubApiLimiter);
router.get('/invitations/check-email', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.staff.invite'), hubInvitationsController_js_1.checkHubInviteEmail);
router.post('/invitations/accept', authMiddleware_1.authenticateUser, hubInvitationsController_js_1.acceptHubInvitation);
router.post('/onboarding/clinic', authMiddleware_1.authenticateUser, hubSignupController_js_1.postHubOnboardingClinic);
router.get('/session/context', authMiddleware_1.authenticateUser, hubSessionController_js_1.getHubSessionContext);
router.get('/subscription/plans', authMiddleware_1.authenticateUser, hubSubscriptionController_js_1.getHubSubscriptionPlans);
router.get('/subscription', authMiddleware_1.authenticateUser, hubSubscriptionController_js_1.getHubSubscriptionMe);
router.post('/subscription/checkout', authMiddleware_1.authenticateUser, hubSubscriptionController_js_1.postHubSubscriptionCheckout);
router.post('/subscription/sync', authMiddleware_1.authenticateUser, hubSubscriptionController_js_1.postHubSubscriptionSync);
router.get('/day-ops-summary', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)([
    'hub.appointments.read',
    'hub.clinic.read',
    'grooming.queue.read',
    'boarding.reservations.read',
    'pickup.routes.read',
    'hub.financial.read',
    'hub.inventory.read',
]), hubDayOpsSummaryController_1.getHubDayOpsSummary);
/** Foto do usuário autenticado: disponível em qualquer access_mode (sem entitlement). */
router.post('/profile/me/photo', authMiddleware_1.authenticateUser, hubProfilePhotoController_js_1.postHubUserProfilePhoto);
/** Perfil/logo da clínica: catálogo admin — bloqueado em soft_lock e read_history. */
router.post('/clinic/profile/photo', authMiddleware_1.authenticateUser, requireCoreCatalogWrite, hubProfilePhotoController_js_1.postHubClinicProfilePhoto);
router.patch('/clinic/profile', authMiddleware_1.authenticateUser, requireCoreCatalogWrite, hubClinicProfileController_js_1.patchHubClinicProfile);
/** Landing pública da clínica (opt-in / slug / hero / serviços / equipe). */
router.get('/clinic/public-profile', authMiddleware_1.authenticateUser, authMiddleware_1.requireClinicAccess, hubClinicPublicProfileController_js_1.getHubClinicPublicProfile);
router.patch('/clinic/public-profile', authMiddleware_1.authenticateUser, requireCoreCatalogWrite, hubClinicPublicProfileController_js_1.patchHubClinicPublicProfile);
router.post('/clinic/public-profile/cover', authMiddleware_1.authenticateUser, requireCoreCatalogWrite, hubClinicPublicProfileController_js_1.postHubClinicPublicProfileCover);
router.post('/clinic/public-profile/logo', authMiddleware_1.authenticateUser, requireCoreCatalogWrite, hubClinicPublicProfileController_js_1.postHubClinicPublicProfileLogo);
/** Unidades: catálogo/capacidade — controller mantém assertCanCreateUnit. */
router.post('/units', authMiddleware_1.authenticateUser, requireUnitCapacityWrite, hubClinicProfileController_js_1.postHubUnit);
router.patch('/units/:unitId', authMiddleware_1.authenticateUser, requireCoreCatalogWrite, hubClinicProfileController_js_1.patchHubUnitProfile);
router.get('/guardians/stats', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.guardians.read'), guardiansController_1.getHubGuardianStats);
router.get('/guardians/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.guardians.read'), guardiansController_1.getHubGuardianById);
router.get('/guardians', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.guardians.read'), guardiansController_1.listHubGuardians);
router.post('/guardians', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.guardians.write'), requireCoreOpsWrite, guardiansController_1.createHubGuardian);
router.patch('/guardians/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.guardians.write'), requireCoreOpsWrite, guardiansController_1.updateHubGuardian);
router.get('/clinic-settings', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.appointments.read'), hubClinicSettingsController_1.getHubClinicSettings);
router.patch('/clinic-settings', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.appointments.write'), requireCoreOpsWrite, hubClinicSettingsController_1.patchHubClinicSettings);
/* --- Preços especiais (pet / tutor / plano família) --- */
router.get('/special-prices', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)(['hub.appointments.read', 'hub.financial.read', 'hub.pets.read']), hubSpecialPricesController_1.listHubSpecialPrices);
router.get('/special-prices/resolve', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)(['hub.appointments.read', 'hub.financial.read', 'hub.pets.read']), hubSpecialPricesController_1.resolveHubSpecialPrice);
router.post('/special-prices', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)(['hub.appointments.write', 'hub.financial.write', 'hub.pets.write']), requireCoreOpsWrite, hubSpecialPricesController_1.createHubSpecialPrice);
router.patch('/special-prices/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)(['hub.appointments.write', 'hub.financial.write', 'hub.pets.write']), requireCoreOpsWrite, hubSpecialPricesController_1.patchHubSpecialPrice);
router.post('/special-prices/:id/approve', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.write'), requireCoreOpsWrite, hubSpecialPricesController_1.approveHubSpecialPrice);
/* --- Clínicas parceiras (local de atendimento) --- */
router.get('/partner-clinics', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.read'), requireClinicModule, hubPartnerClinicsController_1.listHubPartnerClinics);
router.post('/partner-clinics', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubPartnerClinicsController_1.createHubPartnerClinic);
router.patch('/partner-clinics/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubPartnerClinicsController_1.patchHubPartnerClinic);
router.delete('/partner-clinics/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubPartnerClinicsController_1.deleteHubPartnerClinic);
router.get('/pets', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.pets.read'), hubPetsController_1.listHubPets);
router.post('/pets', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.pets.write'), requireCoreOpsWrite, hubPetsController_1.createHubPet);
router.get('/pets/:id/profile-changes', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)(['hub.pets.read', 'hub.clinic.read']), hubPetsController_1.listHubPetProfileChanges);
router.patch('/pets/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)(['hub.pets.write', 'hub.clinic.write']), requireCoreOpsWrite, hubPetsController_1.updateHubPet);
router.post('/pets/:id/death', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)(['hub.pets.write', 'hub.clinic.write']), requireCoreOpsWrite, hubPetsController_1.registerHubPetDeath);
router.patch('/pets/:id/death', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)(['hub.pets.write', 'hub.clinic.write']), requireCoreOpsWrite, hubPetsController_1.correctHubPetDeath);
router.post('/pets/:id/death/invalidate', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.pets.death.invalidate'), requireCoreOpsWrite, hubPetsController_1.invalidateHubPetDeath);
router.get('/service-types', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.service_types.read'), hubServiceTypesController_1.listHubServiceTypes);
router.post('/service-types', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.service_types.write'), requireCoreCatalogWrite, hubServiceTypesController_1.createHubServiceType);
router.patch('/service-types/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.service_types.write'), requireCoreCatalogWrite, hubServiceTypesController_1.updateHubServiceType);
router.post('/service-types/bootstrap', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.service_types.write'), requireCoreCatalogWrite, hubServiceTypesController_1.bootstrapHubServiceTypes);
router.get('/service-types/:id/available-addons', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.appointments.read'), hubServiceAddonsController_1.getHubServiceTypeAvailableAddons);
router.get('/service-types/:id/addon-availability', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.service_types.read'), hubServiceAddonsController_1.getHubServiceTypeAddonAvailability);
router.put('/service-types/:id/addon-availability', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.service_types.write'), requireCoreCatalogWrite, hubServiceAddonsController_1.putHubServiceTypeAddonAvailability);
router.get('/service-types/:id/addon-deployments', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.service_types.read'), hubServiceAddonsController_1.getHubAddonDeployments);
router.put('/service-types/:id/addon-deployments', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.service_types.write'), requireCoreCatalogWrite, hubServiceAddonsController_1.putHubAddonDeployments);
const resourceRead = ['hub.appointments.read', 'grooming.queue.read', 'hub.service_types.read'];
router.get('/resource-kinds', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)([...resourceRead]), hubResourcesController_1.listHubResourceKinds);
router.post('/resource-kinds', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.service_types.write'), requireCoreCatalogWrite, hubResourcesController_1.createHubResourceKind);
router.patch('/resource-kinds/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.service_types.write'), requireCoreCatalogWrite, hubResourcesController_1.patchHubResourceKind);
router.delete('/resource-kinds/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.service_types.write'), requireCoreCatalogWrite, hubResourcesController_1.deleteHubResourceKind);
router.put('/resource-group-settings', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.service_types.write'), requireCoreCatalogWrite, hubResourcesController_1.putHubResourceGroupSetting);
router.get('/resources', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)([...resourceRead]), hubResourcesController_1.listHubResources);
router.post('/resources', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.service_types.write'), requireCoreCatalogWrite, hubResourcesController_1.createHubResource);
router.patch('/resources/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.service_types.write'), requireCoreCatalogWrite, hubResourcesController_1.patchHubResource);
router.delete('/resources/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.service_types.write'), requireCoreCatalogWrite, hubResourcesController_1.deleteHubResource);
router.get('/resources/availability', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)([...resourceRead]), hubResourcesController_1.getHubResourceAvailability);
router.get('/service-types/:id/resource-kinds', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)([...resourceRead]), hubResourcesController_1.getHubServiceTypeResourceKinds);
router.put('/service-types/:id/resource-kinds', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.service_types.write'), requireCoreCatalogWrite, hubResourcesController_1.putHubServiceTypeResourceKinds);
router.get('/service-groups/checklists', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.service_types.read'), hubServiceGroupChecklistController_1.listHubServiceGroupChecklists);
router.get('/service-groups/checklists/:slug', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.service_types.read'), hubServiceGroupChecklistController_1.getHubServiceGroupChecklist);
router.put('/service-groups/checklists/:slug', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.service_types.write'), requireCoreCatalogWrite, hubServiceGroupChecklistController_1.putHubServiceGroupChecklist);
router.delete('/service-groups/checklists/:slug', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.service_types.write'), requireCoreCatalogWrite, hubServiceGroupChecklistController_1.deleteHubServiceGroupChecklist);
router.get('/service-groups/:id/addons', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.service_types.read'), hubServiceAddonsController_1.getHubServiceGroupAddons);
router.put('/service-groups/:id/addons', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.service_types.write'), requireCoreCatalogWrite, hubServiceAddonsController_1.putHubServiceGroupAddons);
router.get('/service-groups/job-mappings', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.appointments.read'), hubServiceGroupsController_1.getHubServiceGroupJobMappings);
router.get('/service-groups', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.service_types.read'), hubServiceGroupsController_1.listHubServiceGroups);
router.post('/service-groups', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.service_types.write'), requireCoreCatalogWrite, hubServiceGroupsController_1.createHubServiceGroup);
router.patch('/service-groups/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.service_types.write'), requireCoreCatalogWrite, hubServiceGroupsController_1.patchHubServiceGroup);
router.patch('/service-groups/:id/job-functions', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.service_types.write'), requireCoreCatalogWrite, hubServiceGroupsController_1.patchHubServiceGroupJobFunctions);
router.delete('/service-groups/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.service_types.write'), requireCoreCatalogWrite, hubServiceGroupsController_1.deleteHubServiceGroup);
/* --- Inventário / Estoque --- */
router.get('/inventory/suppliers', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)(['hub.inventory.read', 'hub.financial.read']), hubInventoryController_1.listHubSuppliers);
router.post('/inventory/suppliers', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)(['hub.inventory.write', 'hub.financial.write']), requireCoreCatalogWrite, hubInventoryController_1.createHubSupplier);
router.patch('/inventory/suppliers/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.inventory.write'), requireCoreCatalogWrite, hubInventoryController_1.patchHubSupplier);
router.get('/inventory/manufacturers', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.inventory.read'), hubInventoryController_1.listHubManufacturers);
router.post('/inventory/manufacturers', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.inventory.write'), requireCoreCatalogWrite, hubInventoryController_1.createHubManufacturer);
router.patch('/inventory/manufacturers/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.inventory.write'), requireCoreCatalogWrite, hubInventoryController_1.patchHubManufacturer);
router.get('/inventory/items', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.inventory.read'), hubInventoryController_1.listHubInventoryItems);
router.post('/inventory/items', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.inventory.write'), requireCoreCatalogWrite, hubInventoryController_1.createHubInventoryItem);
router.get('/inventory/items/:id/changes', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.inventory.read'), hubInventoryController_1.listHubInventoryItemChanges);
router.patch('/inventory/items/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.inventory.write'), requireCoreCatalogWrite, hubInventoryController_1.patchHubInventoryItem);
router.get('/inventory/movements', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.inventory.read'), hubInventoryController_1.listHubStockMovements);
router.post('/inventory/movements', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.inventory.write'), requireCoreOpsWrite, hubInventoryController_1.createHubStockMovement);
router.get('/inventory/lots', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.inventory.read'), hubInventoryController_1.listHubInventoryLots);
router.get('/inventory/lots/expiring', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.inventory.read'), hubInventoryController_1.listHubExpiringLots);
router.get('/inventory/reports/low-stock', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.inventory.read'), hubInventoryController_1.listHubLowStock);
router.get('/inventory/reports/nearly-empty-lots', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.inventory.read'), hubInventoryController_1.listHubNearlyEmptyLots);
router.get('/inventory/reports/movements', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.inventory.read'), hubInventoryController_1.getHubInventoryMovementsReport);
router.get('/inventory/reports/abc', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.inventory.read'), hubInventoryController_1.getHubInventoryAbcReport);
router.get('/inventory/reports/turnover', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.inventory.read'), hubInventoryController_1.getHubInventoryTurnoverReport);
router.get('/inventory/reports/valuation', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.inventory.read'), hubInventoryController_1.getHubInventoryValuationReport);
router.get('/reports/absent-clients', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.guardians.read'), hubReportsController_1.getHubAbsentClientsReport);
router.get('/reports/no-shows', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.appointments.read'), hubReportsController_1.getHubNoShowsReport);
router.get('/reports/my-attendances', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)(['hub.clinic.read', 'hub.appointments.read']), hubReportsController_1.getHubMyAttendancesReport);
router.get('/reports/my-no-shows', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.appointments.read'), hubReportsController_1.getHubMyNoShowsReport);
router.get('/reports/boarding-occupancy', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.reservations.read'), requireBoardingModule, hubReportsController_1.getHubBoardingOccupancySeriesReport);
router.get('/reports/client-cohorts', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.guardians.read'), hubReportsController_1.getHubClientCohortsReport);
router.get('/reports/birthdays', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.guardians.read'), hubReportsController_1.getHubBirthdaysReport);
router.get('/reports/grooming-productivity', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('grooming.queue.read'), requireGroomingModule, hubReportsController_1.getHubGroomingProductivityReport);
router.get('/reports/vaccines-due', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.read'), requireClinicModule, hubReportsController_1.getHubVaccinesDueReport);
router.post('/reports/export-pdf', authMiddleware_1.authenticateUser, 
// Gate amplo: authorizeHubReport no handler valida domínio/unidade/self por report_id.
// hub.reports.read NÃO autoriza PDF sozinho.
(0, authMiddleware_1.requirePermission)([
    'hub.financial.read',
    'hub.inventory.read',
    'hub.guardians.read',
    'hub.appointments.read',
    'hub.clinic.read',
    'hub.commissions.read_own',
    'grooming.queue.read',
    'boarding.reservations.read',
]), hubReportExportPdf_1.postHubReportExportPdf);
router.get('/reports/email-schedules', authMiddleware_1.authenticateUser, 
// hub.reports.read NÃO autoriza agendamento; domínio validado no controller por report_id.
(0, authMiddleware_1.requirePermission)(['hub.financial.read', 'hub.guardians.read', 'hub.inventory.read']), hubReportEmailSchedulesController_1.listHubReportEmailSchedules);
router.post('/reports/email-schedules', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)(['hub.financial.read', 'hub.guardians.read', 'hub.inventory.read']), requireCoreCatalogWrite, hubReportEmailSchedulesController_1.createHubReportEmailSchedule);
router.patch('/reports/email-schedules/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)(['hub.financial.read', 'hub.guardians.read', 'hub.inventory.read']), requireCoreCatalogWrite, hubReportEmailSchedulesController_1.patchHubReportEmailSchedule);
router.delete('/reports/email-schedules/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)(['hub.financial.read', 'hub.guardians.read', 'hub.inventory.read']), requireCoreCatalogWrite, hubReportEmailSchedulesController_1.deleteHubReportEmailSchedule);
router.post('/reports/email-schedules/:id/run', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)(['hub.financial.read', 'hub.guardians.read', 'hub.inventory.read']), requireCoreCatalogWrite, hubReportEmailSchedulesController_1.runHubReportEmailSchedule);
/* --- Equipe / Staff --- */
router.get('/staff', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.staff.read'), hubStaffController_1.listHubStaff);
router.get('/staff/me', authMiddleware_1.authenticateUser, hubStaffSignatureController_1.getHubStaffMe);
router.patch('/staff/me', authMiddleware_1.authenticateUser, hubStaffSignatureController_1.patchHubStaffMe);
router.post('/staff/me/signature', authMiddleware_1.authenticateUser, (0, hubStaffSignatureController_1.postHubStaffMeStampImage)('signature'));
router.post('/staff/me/stamp', authMiddleware_1.authenticateUser, (0, hubStaffSignatureController_1.postHubStaffMeStampImage)('stamp'));
router.post('/staff/photo', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.staff.write'), requireCoreOpsWrite, hubStaffPhotoController_1.postHubStaffPhoto);
router.post('/staff/signature', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.staff.write'), requireCoreOpsWrite, (0, hubStaffSignatureController_1.postHubStaffStampImage)('signature'));
router.post('/staff/stamp', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.staff.write'), requireCoreOpsWrite, (0, hubStaffSignatureController_1.postHubStaffStampImage)('stamp'));
router.post('/staff', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.staff.write'), requireCoreCatalogWrite, hubStaffController_1.createHubStaff);
router.get('/staff/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.staff.read'), hubStaffController_1.getHubStaff);
/**
 * PATCH /staff/:id — soft-lock por campos no controller (ops vs catálogo/capacidade).
 * Ver hubStaffPatchAccess.ts.
 */
router.patch('/staff/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.staff.write'), hubStaffController_1.patchHubStaff);
router.post('/staff/:id/link-account', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.staff.write'), requireUserCapacityWrite, hubStaffController_1.linkHubStaffAccount);
router.get('/staff/:id/pending-invite', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.staff.invite'), hubStaffController_1.getHubStaffPendingInvite);
router.post('/staff/:id/invite', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.staff.invite'), requireUserCapacityWrite, hubStaffController_1.inviteHubStaff);
/* --- Agenda / Agendamentos --- */
router.get('/appointments/calendar-blocks', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.appointments.read'), hubAppointmentsController_1.listHubAgendaCalendarBlocks);
router.post('/appointments/calendar-blocks', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.appointments.write'), requireCoreOpsWrite, hubAppointmentsController_1.upsertHubAgendaCalendarBlock);
router.delete('/appointments/calendar-blocks/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.appointments.write'), requireCoreOpsWrite, hubAppointmentsController_1.deleteHubAgendaCalendarBlock);
router.get('/appointments/stats/by-service-group', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.appointments.read'), hubAppointmentsController_1.getHubAppointmentsStatsByServiceGroup);
router.get('/appointments/series-ending-soon', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.appointments.read'), hubAppointmentsController_1.listHubSeriesEndingSoon);
router.get('/appointments', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.appointments.read'), hubAppointmentsController_1.listHubAppointments);
router.post('/appointments', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.appointments.write'), requireCoreOpsWrite, hubAppointmentsController_1.createHubAppointment);
router.post('/appointments/batch', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.appointments.write'), requireCoreOpsWrite, hubAppointmentsController_1.createHubAppointmentBatch);
router.patch('/appointments/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.appointments.write'), requireCoreOpsWrite, hubAppointmentsController_1.patchHubAppointment);
/* --- Orçamentos / prospects --- */
router.get('/prospects', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.prospects.read'), hubProspectsController_1.listHubProspects);
router.get('/prospects/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.prospects.read'), hubProspectsController_1.getHubProspect);
router.post('/prospects', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.prospects.write'), requireCoreOpsWrite, hubProspectsController_1.createHubProspect);
router.patch('/prospects/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.prospects.write'), requireCoreOpsWrite, hubProspectsController_1.patchHubProspect);
router.get('/quotes', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.quotes.read'), hubQuotesController_1.listHubQuotes);
/** Rotas estáticas antes de `:id` (senão `suggest-price` é capturado como UUID). */
router.post('/quotes/suggest-price', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.quotes.write'), requireCoreOpsWrite, hubQuotesController_1.suggestQuotePrice);
router.post('/quotes', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.quotes.write'), requireCoreOpsWrite, hubQuotesController_1.createHubQuote);
router.get('/quotes/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.quotes.read'), hubQuotesController_1.getHubQuote);
router.get('/quotes/:id/pdf', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.quotes.read'), hubQuotesController_1.getHubQuotePdf);
router.patch('/quotes/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.quotes.write'), requireCoreOpsWrite, hubQuotesController_1.patchHubQuote);
router.delete('/quotes/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.quotes.write'), requireCoreOpsWrite, hubQuotesController_1.deleteHubQuote);
router.post('/quotes/:id/send', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.quotes.write'), requireCoreOpsWrite, hubQuotesController_1.sendHubQuote);
router.post('/quotes/:id/awaiting-return', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.quotes.write'), requireCoreOpsWrite, hubQuotesController_1.awaitingReturnHubQuote);
router.post('/quotes/:id/cancel', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.quotes.write'), requireCoreOpsWrite, hubQuotesController_1.cancelHubQuote);
router.post('/quotes/:id/finalize-manual-conversion', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.quotes.write'), requireCoreOpsWrite, hubQuotesController_1.finalizeManualConversionHubQuote);
router.post('/quotes/:id/convert', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.quotes.write'), requireCoreOpsWrite, hubQuotesController_1.convertHubQuote);
router.post('/quotes/:id/duplicate', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.quotes.write'), requireCoreOpsWrite, hubQuotesController_1.duplicateHubQuote);
router.post('/quotes/:id/reopen-draft', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.quotes.write'), requireCoreOpsWrite, hubQuotesController_1.reopenHubQuoteAsDraft);
router.post('/quotes/:id/public-token', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.quotes.write'), requireCoreOpsWrite, hubQuotesController_1.ensurePublicToken);
/* --- Clínica / Atendimentos --- */
router.get('/encounters/day-board', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.read'), requireClinicModule, hubEncountersController_1.getHubEncountersDayBoard);
router.get('/encounters', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.read'), requireClinicModule, hubEncountersController_1.listHubEncounters);
router.get('/encounters/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.read'), requireClinicModule, hubEncountersController_1.getHubEncounter);
router.post('/encounters/check-in', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubEncountersController_1.checkInHubClinicalWalkIn);
router.post('/encounters', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubEncountersController_1.createHubEncounter);
router.post('/encounters/open-from-appointment', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubEncountersController_1.openHubEncounterFromAppointment);
router.patch('/encounters/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubEncountersController_1.patchHubEncounter);
router.patch('/encounters/:id/amend', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubEncountersController_1.amendHubEncounter);
router.get('/encounters/:id/versions', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.read'), requireClinicModule, hubEncountersController_1.getHubEncounterVersions);
router.post('/encounters/:id/complete', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubEncountersController_1.completeHubEncounter);
/* --- Leva e Traz (paradas operacionais) --- */
router.get('/pickup/day-board', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('pickup.routes.read'), requirePickupArea, hubPickupController_1.getHubPickupDayBoard);
router.get('/pickup/driver-day', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('pickup.routes.read'), requirePickupArea, hubPickupController_1.getHubPickupDriverDay);
router.post('/pickup/routes/suggest-batches', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('pickup.routes.manage'), requirePickupWrite, hubPickupController_1.suggestHubPickupBatches);
router.get('/pickup/routes', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('pickup.routes.read'), requirePickupArea, hubPickupController_1.listHubPickupRoutes);
router.post('/pickup/routes', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('pickup.routes.manage'), requirePickupWrite, hubPickupController_1.createHubPickupRoute);
router.get('/pickup/routes/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('pickup.routes.read'), requirePickupArea, hubPickupController_1.getHubPickupRoute);
router.patch('/pickup/routes/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('pickup.routes.manage'), requirePickupWrite, hubPickupController_1.patchHubPickupRoute);
router.post('/pickup/routes/:id/stops', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('pickup.routes.manage'), requirePickupWrite, hubPickupController_1.addHubPickupStops);
router.post('/pickup/routes/:id/split', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('pickup.routes.manage'), requirePickupWrite, hubPickupController_1.splitHubPickupRoute);
router.post('/pickup/routes/:id/clinic-return', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('pickup.routes.manage'), requirePickupWrite, hubPickupController_1.addClinicReturnStop);
router.patch('/pickup/stops/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('pickup.stops.update'), requirePickupWrite, hubPickupController_1.patchHubPickupStop);
router.post('/pickup/stops', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('pickup.stops.update'), requirePickupWrite, hubPickupController_1.createOrUpdateLooseStop);
router.get('/pickup/my-route', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('pickup.routes.read'), requirePickupArea, hubPickupController_1.getMyPickupRoute);
router.get('/pickup/my-routes', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('pickup.routes.read'), requirePickupArea, hubPickupController_1.getMyPickupRoutes);
router.post('/pickup/routes/:id/claim', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('pickup.routes.read'), requirePickupArea, hubPickupController_1.claimHubPickupRoute);
/* --- Leva e Traz — Veículos e caixas de transporte --- */
router.get('/pickup/vehicles', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('pickup.routes.read'), requirePickupArea, hubPickupVehiclesController_1.listPickupVehicles);
router.post('/pickup/vehicles', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('pickup.routes.manage'), requirePickupWrite, hubPickupVehiclesController_1.createPickupVehicle);
router.patch('/pickup/vehicles/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('pickup.routes.manage'), requirePickupWrite, hubPickupVehiclesController_1.patchPickupVehicle);
router.post('/pickup/vehicles/:vehicleId/cages', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('pickup.routes.manage'), requirePickupWrite, hubPickupVehiclesController_1.createTransportCage);
router.patch('/pickup/cages/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('pickup.routes.manage'), requirePickupWrite, hubPickupVehiclesController_1.patchTransportCage);
router.delete('/pickup/cages/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('pickup.routes.manage'), requirePickupWrite, hubPickupVehiclesController_1.deleteTransportCage);
/* --- Banho & Tosa (fila operacional) --- */
router.get('/grooming/day-board', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('grooming.queue.read'), requireGroomingModule, hubGroomingController_1.getHubGroomingDayBoard);
router.post('/grooming/sessions/open-from-appointment', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('grooming.queue.manage'), requireGroomingWrite, hubGroomingController_1.openHubGroomingSessionFromAppointment);
router.post('/grooming/sessions', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('grooming.queue.manage'), requireGroomingWrite, hubGroomingController_1.createHubGroomingSession);
router.patch('/grooming/sessions/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('grooming.queue.manage'), requireGroomingWrite, hubGroomingController_1.patchHubGroomingSession);
router.post('/grooming/sessions/:id/advance', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('grooming.queue.manage'), requireGroomingWrite, hubGroomingController_1.advanceHubGroomingSession);
router.get('/grooming/sessions/:id/events', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('grooming.queue.read'), requireGroomingModule, hubGroomingController_1.listHubGroomingSessionEvents);
router.post('/grooming/sessions/:id/events', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('grooming.queue.manage'), requireGroomingWrite, hubGroomingController_1.postHubGroomingSessionEvent);
router.get('/grooming/sessions/:id/drawer', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('grooming.queue.read'), requireGroomingModule, hubGroomingDrawerController_1.getHubGroomingSessionDrawer);
router.post('/grooming/sessions/:id/extras', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('grooming.queue.manage'), requireGroomingWrite, hubGroomingDrawerController_1.postHubGroomingSessionExtra);
router.patch('/grooming/appointment-service-lines/:lineId', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('grooming.queue.manage'), requireGroomingWrite, hubGroomingDrawerController_1.patchHubGroomingAppointmentServiceLine);
/* --- Operação da Recepção (custódia) --- */
router.get('/reception/board', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('reception.ops.read'), requireReceptionArea, hubReceptionController_1.getHubReceptionBoard);
router.get('/reception/handoffs/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('reception.ops.read'), requireReceptionArea, hubReceptionController_1.getHubReceptionHandoffDetail);
router.post('/reception/handoffs/:id/resolve', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('reception.ops.manage'), requireReceptionWrite, hubReceptionController_1.postHubReceptionResolve);
/* --- Casos clínicos --- */
router.get('/clinical/timeline', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.read'), requireClinicModule, hubClinicalTimelineController_1.listHubClinicalTimeline);
router.post('/clinical/timeline/notes', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubClinicalTimelineController_1.createHubClinicalTimelineNote);
/* --- Exames clínicos --- */
router.get('/clinical/exams', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.read'), requireClinicModule, hubClinicalExamsController_1.listHubClinicalExams);
router.get('/clinical/exams/export.csv', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.read'), requireClinicModule, hubClinicalExamsController_1.exportHubClinicalExamsCsv);
router.get('/clinical/exams/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.read'), requireClinicModule, hubClinicalExamsController_1.getHubClinicalExam);
router.post('/clinical/exams', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubClinicalExamsController_1.createHubClinicalExam);
router.patch('/clinical/exams/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubClinicalExamsController_1.patchHubClinicalExam);
router.delete('/clinical/exams/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubClinicalExamsController_1.deleteHubClinicalExam);
router.post('/clinical/exams/orders/issue', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubExamOrderDocumentsController_1.issueExamOrderDocumentHandler);
router.get('/clinical/exams/encounter/:encounterId/order-documents', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.read'), requireClinicModule, hubExamOrderDocumentsController_1.listExamOrderDocumentsByEncounter);
router.get('/clinical/exams/:id/order-documents', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.read'), requireClinicModule, hubExamOrderDocumentsController_1.listExamOrderDocuments);
router.post('/clinical/exams/order-documents/:docId/revoke', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubExamOrderDocumentsController_1.revokeExamOrderDocument);
router.get('/clinical/exams/:id/pdf', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.read'), requireClinicModule, hubExamOrderDocumentsController_1.getHubExamOrderPdf);
router.get('/clinical/specialist-referrals', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.read'), requireClinicModule, hubSpecialistReferralsController_1.listHubSpecialistReferrals);
router.post('/clinical/specialist-referrals', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubSpecialistReferralsController_1.createHubSpecialistReferral);
router.patch('/clinical/specialist-referrals/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubSpecialistReferralsController_1.patchHubSpecialistReferral);
router.delete('/clinical/specialist-referrals/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubSpecialistReferralsController_1.deleteHubSpecialistReferral);
router.post('/clinical/specialist-referrals/orders/issue', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubSpecialistReferralsController_1.issueSpecialistReferralBundleHandler);
router.get('/clinical/specialist-referrals/encounter/:encounterId/documents', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.read'), requireClinicModule, hubSpecialistReferralsController_1.listSpecialistReferralDocumentsByEncounter);
router.post('/clinical/specialist-referrals/:id/documents', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubSpecialistReferralsController_1.issueSpecialistReferralDocumentHandler);
router.post('/clinical/specialist-referrals/:id/documents/:docId/revoke', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubSpecialistReferralsController_1.revokeSpecialistReferralDocument);
router.get('/clinical/specialist-referrals/:id/pdf', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.read'), requireClinicModule, hubSpecialistReferralsController_1.getHubSpecialistReferralPdf);
router.get('/clinical/cases', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.read'), requireClinicModule, hubClinicalCasesController_1.listHubClinicalCases);
router.get('/clinical/cases/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.read'), requireClinicModule, hubClinicalCasesController_1.getHubClinicalCase);
router.post('/clinical/cases', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubClinicalCasesController_1.createHubClinicalCase);
router.patch('/clinical/cases/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubClinicalCasesController_1.patchHubClinicalCase);
router.delete('/clinical/cases/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubClinicalCasesController_1.deleteHubClinicalCase);
router.get('/clinical/cockpit/patient-context', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.read'), requireClinicModule, hubVetCockpitController_js_1.getHubVetCockpitPatientContext);
router.get('/clinical/pet-flags', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)(['hub.clinic.read', 'hub.pets.read']), hubClinicalModulesController_1.listHubPetClinicalFlags);
router.post('/clinical/pet-flags', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)([
    'hub.clinic.write',
    'hub.pets.write',
    'grooming.queue.manage',
    'boarding.reservations.manage',
]), requireClinicWrite, hubClinicalModulesController_1.upsertHubPetClinicalFlag);
router.get('/clinical/encounter-events', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.read'), requireClinicModule, hubClinicalModulesController_1.listHubEncounterEvents);
router.post('/clinical/encounter-events', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubClinicalModulesController_1.createHubEncounterEvent);
router.get('/clinical/alerts', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.read'), requireClinicModule, hubClinicalModulesController_1.getHubClinicalAlerts);
router.get('/clinical/prescriptions', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.read'), requireClinicModule, hubClinicalModulesController_1.listHubPrescriptions);
router.get('/clinical/prescription-lookups', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.read'), requireClinicModule, hubPrescriptionLookupsController_1.listHubPrescriptionLookups);
router.post('/clinical/prescription-lookups', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubPrescriptionLookupsController_1.createHubPrescriptionLookup);
router.get('/clinical/prescriptions/:id/pdf', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.read'), requireClinicModule, hubClinicalModulesController_1.getHubPrescriptionPdf);
router.get('/clinical/prescriptions/:id/documents', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.read'), requireClinicModule, hubClinicalModulesController_1.listPrescriptionDocuments);
router.post('/clinical/prescriptions/:id/documents', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubClinicalModulesController_1.issuePrescriptionDocument);
router.post('/clinical/prescriptions/:id/documents/:docId/revoke', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubClinicalModulesController_1.revokePrescriptionDocument);
router.post('/clinical/prescriptions', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubClinicalModulesController_1.createHubPrescription);
router.patch('/clinical/prescriptions/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubClinicalModulesController_1.patchHubPrescription);
router.get('/clinical/vaccinations', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.read'), requireClinicModule, hubClinicalModulesController_1.listHubVaccinations);
router.post('/clinical/vaccinations', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubClinicalModulesController_1.createHubVaccination);
router.get('/clinical/medication-administrations', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.read'), requireClinicModule, hubClinicalModulesController_1.listHubMedicationAdministrations);
router.post('/clinical/medication-administrations', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubClinicalModulesController_1.createHubMedicationAdministration);
router.get('/clinical/attachments', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.read'), requireClinicModule, hubClinicalModulesController_1.listHubClinicalAttachments);
router.post('/clinical/attachments', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubClinicalModulesController_1.createHubClinicalAttachment);
router.post('/clinical/attachments/upload', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubClinicalModulesController_1.uploadHubClinicalAttachment);
router.get('/clinical/term-templates', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.read'), requireClinicModule, hubClinicalTermTemplatesController_1.listHubClinicalTermTemplates);
router.post('/clinical/term-templates/upload', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubClinicalTermTemplatesController_1.uploadHubClinicalTermTemplate);
router.patch('/clinical/term-templates/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubClinicalTermTemplatesController_1.patchHubClinicalTermTemplate);
router.delete('/clinical/term-templates/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubClinicalTermTemplatesController_1.deleteHubClinicalTermTemplate);
router.get('/clinical/hospital-beds', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.read'), requireClinicModule, hubClinicalModulesController_1.listHubHospitalBeds);
router.post('/clinical/hospital-beds', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubClinicalModulesController_1.createHubHospitalBed);
router.get('/clinical/hospitalizations', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.read'), requireClinicModule, hubClinicalModulesController_1.listHubHospitalizations);
router.post('/clinical/hospitalizations', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubClinicalModulesController_1.createHubHospitalization);
router.get('/clinical/hospitalizations/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.read'), requireClinicModule, hubClinicalModulesController_1.getHubHospitalization);
router.patch('/clinical/hospitalizations/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubClinicalModulesController_1.patchHubHospitalization);
router.post('/clinical/hospitalizations/:id/daily-notes', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubClinicalModulesController_1.addHubHospitalizationDailyNote);
router.get('/clinical/hospitalizations/:id/events', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.read'), requireClinicModule, hubClinicalModulesController_1.listHubHospitalizationEvents);
router.post('/clinical/hospitalizations/:id/events', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubClinicalModulesController_1.createHubHospitalizationEvent);
router.get('/clinical/hospitalizations/:id/charges', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.read'), requireClinicModule, hubClinicalBillableServicesController_1.listHubHospitalizationCharges);
router.post('/clinical/hospitalizations/:id/charges', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubClinicalBillableServicesController_1.createHubHospitalizationCharge);
router.patch('/clinical/hospitalizations/:id/charges/:chargeId', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubClinicalBillableServicesController_1.patchHubHospitalizationCharge);
router.delete('/clinical/hospitalizations/:id/charges/:chargeId', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubClinicalBillableServicesController_1.deleteHubHospitalizationCharge);
router.post('/clinical/hospitalizations/:id/charges/:chargeId/approve-price', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.write'), requireCoreOpsWrite, hubClinicalBillableServicesController_1.approveHubHospitalizationChargePrice);
router.get('/clinical/hospitalizations/:id/medication-orders', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.read'), requireClinicModule, hubHospitalizationMedPlanController_1.listHubHospitalizationMedOrders);
router.post('/clinical/hospitalizations/:id/medication-orders', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)(['hub.clinic.med_orders.manage', 'hub.clinic.write']), requireClinicWrite, hubHospitalizationMedPlanController_1.createHubHospitalizationMedOrder);
router.post('/clinical/hospitalizations/:id/medication-orders/:orderId/versions', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)(['hub.clinic.med_orders.manage', 'hub.clinic.write']), requireClinicWrite, hubHospitalizationMedPlanController_1.createHubHospitalizationMedOrderVersion);
router.post('/clinical/hospitalizations/:id/medication-orders/:orderId/suspend', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)(['hub.clinic.med_orders.manage', 'hub.clinic.write']), requireClinicWrite, hubHospitalizationMedPlanController_1.suspendHubHospitalizationMedOrder);
router.post('/clinical/hospitalizations/:id/medication-orders/:orderId/resume', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)(['hub.clinic.med_orders.manage', 'hub.clinic.write']), requireClinicWrite, hubHospitalizationMedPlanController_1.resumeHubHospitalizationMedOrder);
router.get('/clinical/hospitalizations/:id/medication-doses', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.read'), requireClinicModule, hubHospitalizationMedPlanController_1.listHubHospitalizationMedDoses);
router.post('/clinical/hospitalizations/:id/medication-doses/:doseId/complete', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)(['hub.clinic.med_admin.write', 'hub.clinic.write']), requireClinicWrite, hubHospitalizationMedPlanController_1.completeHubHospitalizationMedDose);
router.get('/clinical/hospitalizations/:id/medication-plan/print-model', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.read'), requireClinicModule, hubHospitalizationMedPlanController_1.getHubHospitalizationMedPrintModel);
router.get('/clinical/surgeries', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.read'), requireClinicModule, hubClinicalModulesController_1.listHubSurgeries);
router.post('/clinical/surgeries', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubClinicalModulesController_1.createHubSurgery);
router.get('/clinical/surgeries/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.read'), requireClinicModule, hubClinicalModulesController_1.getHubSurgery);
router.patch('/clinical/surgeries/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubClinicalModulesController_1.patchHubSurgery);
router.get('/clinical/surgeries/:id/services', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.read'), requireClinicModule, hubClinicalBillableServicesController_1.listHubSurgeryServices);
router.post('/clinical/surgeries/:id/services', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubClinicalBillableServicesController_1.createHubSurgeryService);
router.patch('/clinical/surgeries/:id/services/:serviceId', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubClinicalBillableServicesController_1.patchHubSurgeryService);
router.delete('/clinical/surgeries/:id/services/:serviceId', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubClinicalBillableServicesController_1.deleteHubSurgeryService);
router.post('/clinical/surgeries/:id/services/:serviceId/approve-price', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.write'), requireCoreOpsWrite, hubClinicalBillableServicesController_1.approveHubSurgeryServicePrice);
router.get('/clinical/encounters/:id/services', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.read'), requireClinicModule, hubClinicalBillableServicesController_1.listHubEncounterServices);
router.post('/clinical/encounters/:id/services', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubClinicalBillableServicesController_1.createHubEncounterService);
router.patch('/clinical/encounters/:id/services/:serviceId', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubClinicalBillableServicesController_1.patchHubEncounterService);
router.delete('/clinical/encounters/:id/services/:serviceId', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.clinic.write'), requireClinicWrite, hubClinicalBillableServicesController_1.deleteHubEncounterService);
router.post('/clinical/encounters/:id/services/:serviceId/approve-price', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.write'), requireCoreOpsWrite, hubClinicalBillableServicesController_1.approveHubEncounterServicePrice);
/** Comandas / checkout operacional */
router.get('/comandas', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubComandasController_1.listHubComandas);
router.get('/comandas/cancellation-pending-count', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubComandasController_1.getHubComandaCancellationPendingCount);
router.get('/comandas/by-origin', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubComandasController_1.getHubComandaByOrigin);
router.post('/comandas/open', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.receivables.create'), requireCoreOpsWrite, hubComandasController_1.postHubComandaOpen);
router.get('/comandas/:id/pdf', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubComandasController_1.getHubComandaPdf);
router.get('/comandas/:id/cupom.pdf', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubComandasController_1.getHubComandaCupomPdf);
router.post('/comandas/:id/public-token', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.receivables.create'), requireCoreOpsWrite, hubComandasController_1.ensureComandaPublicToken);
router.get('/comandas/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubComandasController_1.getHubComandaDetail);
router.post('/comandas/:id/sync-from-origin', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.receivables.create'), requireCoreOpsWrite, hubComandasController_1.postHubComandaSyncFromOrigin);
router.post('/comandas/:id/apply-package', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.receivables.create'), requireCoreOpsWrite, hubComandasController_1.postHubComandaApplyPackage);
router.post('/comandas/:id/checkout', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.receivables.create'), requireCoreOpsWrite, hubComandasController_1.postHubComandaCheckout);
router.post('/comandas/:id/resolve-cancellation', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.write'), requireCoreOpsWrite, hubComandasController_1.postHubComandaResolveCancellation);
router.post('/comandas/suggest-item-price', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.receivables.create'), requireCoreOpsWrite, hubComandasController_1.postHubComandaSuggestItemPrice);
router.post('/comandas/checkout-bulk', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.receivables.create'), requireCoreOpsWrite, hubComandasController_1.postHubComandaCheckoutBulk);
router.post('/comandas/:id/items', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.receivables.create'), requireCoreOpsWrite, hubComandasController_1.postHubComandaAddItems);
router.patch('/comandas/:id/items/:itemId', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.receivables.create'), requireCoreOpsWrite, hubComandasController_1.patchHubComandaItem);
router.delete('/comandas/:id/items/:itemId', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.receivables.create'), requireCoreOpsWrite, hubComandasController_1.deleteHubComandaItem);
router.patch('/comandas/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.receivables.create'), requireCoreOpsWrite, hubComandasController_1.patchHubComanda);
/** Financeiro — Day board (Caixa: todos os atendimentos do dia) */
router.get('/finance/payment-method-settings', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubFinancialController_1.getHubFinancePaymentMethodSettings);
router.patch('/finance/payment-method-settings', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.write'), requireCoreOpsWrite, hubFinancialController_1.patchHubFinancePaymentMethodSettings);
router.get('/finance/day-board', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubFinancialController_1.getHubFinanceDayBoard);
/** Financeiro — Fase 1 (recebíveis, sem cobrança, caixa básico) */
router.get('/finance/preview', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubFinancialController_1.getHubFinancePreview);
router.get('/finance/unbilled-completed', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubFinancialController_1.getHubFinanceUnbilledCompleted);
router.get('/finance/pending-billing-count', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubFinancialController_1.getHubFinancePendingBillingCount);
router.get('/finance/receivables', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubFinancialController_1.listHubFinanceReceivables);
router.get('/finance/receivables/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubFinancialController_1.getHubFinanceReceivableDetail);
router.post('/finance/receivables', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.receivables.create'), requireCoreOpsWrite, hubFinancialController_1.postHubFinanceReceivable);
router.post('/finance/receivables/:id/product-lines', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.inventory.write'), requireCoreCatalogWrite, hubFinancialController_1.postHubFinanceReceivableProductLine);
router.delete('/finance/receivables/:id/product-lines/:lineId', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.inventory.write'), requireCoreCatalogWrite, hubFinancialController_1.deleteHubFinanceReceivableProductLine);
router.post('/finance/receivables/:id/cancel', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.write'), requireCoreOpsWrite, hubFinancialController_1.postHubFinanceReceivableCancel);
router.post('/finance/receivables/:id/product-returns', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.write'), requireCoreOpsWrite, hubFinancialController_1.postHubFinanceReceivableProductReturn);
router.post('/finance/waive-billing', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.write'), requireCoreOpsWrite, hubFinancialController_1.postHubFinanceWaiveBilling);
router.post('/finance/receivables/:id/payments', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.cash.receive'), requireCoreOpsWrite, hubFinancialController_1.postHubFinanceReceivablePayment);
router.post('/finance/receivables/:id/payments/historical-cash', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.adjust'), requireCoreOpsWrite, hubFinancialController_1.postHubFinanceReceivableHistoricalCash);
router.post('/finance/charge-bundles', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.receivables.create'), requireCoreOpsWrite, hubChargeBundlesController_1.postHubChargeBundle);
router.get('/finance/charge-bundles', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubChargeBundlesController_1.listHubChargeBundles);
router.get('/finance/charge-bundles/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubChargeBundlesController_1.getHubChargeBundle);
router.patch('/finance/charge-bundles/:id/mark-sent', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.receivables.create'), requireCoreOpsWrite, hubChargeBundlesController_1.patchHubChargeBundleMarkSent);
router.get('/finance/charge-bundles/:id/pdf', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubChargeBundlesController_1.getHubChargeBundlePdf);
router.get('/finance/payments', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubFinancialController_1.listHubFinancePayments);
router.get('/finance/payments/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)(['hub.financial.read', 'hub.payments.reverse']), hubFinancialController_1.getHubFinancePayment);
/**
 * Estorno financeiro — exceção de produto:
 * permitido em full, soft_lock e read_history (correção de ops preexistentes).
 * NÃO usar requireCoreOpsWrite. Garantias atuais: RBAC hub.payments.reverse,
 * reason obrigatória, soft-reverse auditável, payment.clinic_id === clinic_id.
 */
router.post('/finance/payments/:id/reverse', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.payments.reverse'), hubFinancialController_1.postHubFinancePaymentReverse);
router.get('/finance/payments/:id/receipt', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubFinancialController_1.getHubFinancePaymentReceipt);
router.get('/finance/cash-sessions/closed', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubFinancialController_1.listHubFinanceCashSessionsClosed);
router.get('/finance/cash-sessions/open', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubFinancialController_1.getHubFinanceCashSessionOpen);
router.get('/finance/cash-sessions/status', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubFinancialController_1.getHubFinanceCashSessionStatus);
router.post('/finance/cash-sessions/open', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.cash.session'), requireCoreOpsWrite, hubFinancialController_1.postHubFinanceCashSessionOpen);
/** Job cron (meia-noite SP): auth via CRON_SECRET, sem sessão de usuário. */
router.post('/finance/cash-sessions/auto-close-overdue', hubFinancialController_1.postHubFinanceCashSessionsAutoCloseOverdue);
router.post('/finance/cash-sessions/:id/close', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.cash.session'), requireCoreOpsWrite, hubFinancialController_1.postHubFinanceCashSessionClose);
router.post('/finance/handoff-pending', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.cash.session'), requireCoreOpsWrite, hubFinancialController_1.postHubFinanceHandoffPending);
router.get('/finance/cash-sessions/:id/summary', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubFinancialController_1.getHubFinanceCashSessionSummary);
router.get('/finance/dashboard-summary', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubFinancialController_1.getHubFinanceDashboardSummary);
router.get('/finance/cash-flow', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubFinancialController_1.getHubFinanceCashFlow);
router.get('/finance/reports/revenue-series', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubFinancialController_1.getHubFinanceRevenueSeries);
router.get('/finance/reports/revenue', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubFinancialController_1.getHubFinanceRevenueReport);
router.get('/finance/reports/ticket-average', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubFinancialController_1.getHubFinanceTicketAverageReport);
router.get('/finance/reports/top-services', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubFinancialController_1.getHubFinanceTopServicesReport);
router.get('/finance/reports/product-sales', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubFinancialController_1.getHubFinanceProductSalesReport);
router.get('/finance/reports/movement-by-sector', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubFinancialController_1.getHubFinanceMovementBySectorReport);
router.get('/finance/reports/aging', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubFinancialController_1.getHubFinanceAgingReport);
router.get('/finance/reports/sales-adjustments', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubFinancialController_1.getHubFinanceSalesAdjustmentsReport);
router.get('/finance/reports/commissions', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubFinancialController_1.getHubFinanceCommissionsReport);
router.get('/finance/reports/my-commissions', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.commissions.read_own'), hubFinancialController_1.getHubFinanceMyCommissionsReport);
router.get('/finance/reports/top-clients', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubFinancialController_1.getHubFinanceTopClientsReport);
router.get('/finance/reports/packages', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubFinancialController_1.getHubFinancePackagesReport);
router.get('/finance/expenses', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubFinancialController_1.listHubFinanceExpenses);
router.post('/finance/expenses', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.write'), requireCoreOpsWrite, hubFinancialController_1.postHubFinanceExpense);
router.patch('/finance/expenses/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.write'), requireCoreOpsWrite, hubFinancialController_1.patchHubFinanceExpense);
router.delete('/finance/expenses/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.write'), requireCoreOpsWrite, hubFinancialController_1.deleteHubFinanceExpense);
router.get('/finance/payables', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubFinancialController_1.listHubFinancePayables);
router.post('/finance/payables', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.write'), requireCoreOpsWrite, hubFinancialController_1.postHubFinancePayable);
router.patch('/finance/payables/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.write'), requireCoreOpsWrite, hubFinancialController_1.patchHubFinancePayable);
router.post('/finance/payables/:id/pay', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.write'), requireCoreOpsWrite, hubFinancialController_1.postHubFinancePayablePay);
router.post('/finance/payables/:id/cancel', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.write'), requireCoreOpsWrite, hubFinancialController_1.postHubFinancePayableCancel);
router.get('/finance/payable-schedules', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubFinancialController_1.listHubFinancePayableSchedules);
router.post('/finance/payable-schedules', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.write'), requireCoreOpsWrite, hubFinancialController_1.postHubFinancePayableSchedule);
router.patch('/finance/payable-schedules/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.write'), requireCoreOpsWrite, hubFinancialController_1.patchHubFinancePayableSchedule);
router.post('/finance/payable-schedules/:id/end', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.write'), requireCoreOpsWrite, hubFinancialController_1.postHubFinancePayableScheduleEnd);
router.post('/finance/cash-sessions/:id/movements', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.cash.session'), requireCoreOpsWrite, hubFinancialController_1.postHubFinanceCashMovement);
router.post('/finance/credit-movements', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.write'), requireCoreOpsWrite, hubCustomerCreditController_1.postHubCustomerCreditMovement);
router.get('/finance/credit-balance', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubCustomerCreditController_1.getHubCustomerCreditBalance);
router.get('/finance/packages', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubPackagesController_1.listHubPackages);
router.post('/finance/packages/suggest-price', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubPackagesController_1.postHubPackageSuggestPrice);
router.get('/finance/packages/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubPackagesController_1.getHubPackage);
router.post('/finance/packages', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.write'), requireCoreCatalogWrite, hubPackagesController_1.postHubPackage);
router.patch('/finance/packages/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.write'), requireCoreCatalogWrite, hubPackagesController_1.patchHubPackage);
router.post('/finance/series-invoices/issue', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.write'), requireCoreOpsWrite, hubSeriesBillingController_1.postHubSeriesInvoiceIssue);
router.post('/finance/series-invoices/run-job', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.write'), requireCoreOpsWrite, hubSeriesBillingController_1.postHubSeriesInvoiceRunJob);
router.get('/guardians/:guardianId/package-balances', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubPackagesController_1.getHubGuardianPackageBalances);
router.get('/pets/:petId/package-balances', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubPackagesController_1.getHubPetPackageBalances);
router.post('/finance/package-balances/:id/cancel', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.write'), requireCoreOpsWrite, hubPackagesController_1.postHubPackageBalanceCancel);
router.get('/finance/package-balances/:id/refund-preview', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubPackagesController_1.getHubPackageBalanceRefundPreview);
router.post('/finance/package-balances/:id/refund', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.write'), requireCoreOpsWrite, hubPackagesController_1.postHubPackageBalanceRefund);
router.get('/finance/commission-preview', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubCommissionRulesController_1.getHubCommissionPreview);
router.get('/finance/commission-rules', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.read'), hubCommissionRulesController_1.listHubCommissionRules);
router.post('/finance/commission-rules', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.write'), requireCoreCatalogWrite, hubCommissionRulesController_1.postHubCommissionRule);
router.patch('/finance/commission-rules/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.write'), requireCoreCatalogWrite, hubCommissionRulesController_1.patchHubCommissionRule);
router.delete('/finance/commission-rules/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('hub.financial.write'), requireCoreCatalogWrite, hubCommissionRulesController_1.deleteHubCommissionRule);
/* --- Hotel & Creche (boarding operacional) --- */
router.get('/boarding/day-board', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.reservations.read'), requireBoardingModule, hubBoardingController_1.getHubBoardingDayBoard);
router.post('/boarding/reservations/open-from-appointment', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.reservations.manage'), requireBoardingWrite, hubBoardingController_1.openHubBoardingReservationFromAppointment);
router.post('/boarding/reservations', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.reservations.manage'), requireBoardingWrite, hubBoardingController_1.createHubBoardingReservation);
router.patch('/boarding/reservations/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.reservations.manage'), requireBoardingWrite, hubBoardingController_1.patchHubBoardingReservation);
router.post('/boarding/reservations/:id/start-checkout-prep', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.reservations.manage'), requireBoardingWrite, hubBoardingController_1.postHubBoardingStartCheckoutPrep);
router.post('/boarding/reservations/:id/release-for-handoff', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.reservations.manage'), requireBoardingWrite, hubBoardingController_1.postHubBoardingReleaseForHandoff);
router.post('/boarding/reservations/:id/revert-handoff-ready', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.reservations.manage'), requireBoardingWrite, hubBoardingController_1.postHubBoardingRevertHandoffReady);
router.get('/boarding/reservations/:id/drawer', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.reservations.read'), requireBoardingModule, hubBoardingDrawerController_1.getHubBoardingReservationDrawer);
router.post('/boarding/reservations/:id/daily-logs', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.daily_report.write'), requireBoardingWrite, hubBoardingDrawerController_1.postHubBoardingDailyLog);
router.get('/boarding/unit-settings', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.reservations.read'), requireBoardingModule, hubBoardingController_1.getHubBoardingUnitSettings);
router.patch('/boarding/unit-settings', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.reservations.manage'), requireBoardingWrite, hubBoardingController_1.patchHubBoardingUnitSettings);
router.get('/boarding/occupancy', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.reservations.read'), requireBoardingModule, hubBoardingController_1.getHubBoardingOccupancy);
router.get('/boarding/calendar', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.reservations.read'), requireBoardingModule, hubBoardingController_1.getHubBoardingCalendar);
router.get('/boarding/ops-board', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.reservations.read'), requireBoardingModule, hubBoardingOpsController_1.getHubBoardingOpsBoard);
router.get('/boarding/reservations/:id/timeline', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.reservations.read'), requireBoardingModule, hubBoardingDrawerController_1.getHubBoardingReservationTimeline);
router.get('/boarding/pets/:petId/care-profile', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.reservations.read'), requireBoardingModule, hubBoardingCareController_1.getHubPetCareProfile);
router.put('/boarding/pets/:petId/care-profile', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.reservations.manage'), requireBoardingWrite, hubBoardingCareController_1.putHubPetCareProfile);
router.get('/boarding/reservations/:id/care-plan', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.reservations.read'), requireBoardingModule, hubBoardingCareController_1.getHubBoardingCarePlan);
router.put('/boarding/reservations/:id/care-plan', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.reservations.manage'), requireBoardingWrite, hubBoardingCareController_1.putHubBoardingCarePlan);
router.post('/boarding/reservations/:id/care-plan/tutor-link', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.reservations.manage'), requireBoardingWrite, hubBoardingCareController_1.postHubBoardingCareTutorLink);
router.get('/boarding/tasks', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.reservations.read'), requireBoardingModule, hubBoardingTasksController_1.getHubBoardingTasks);
router.post('/boarding/tasks/batch-activity', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.daily_report.write'), requireBoardingWrite, hubBoardingTasksController_1.postHubBoardingBatchActivity);
router.post('/boarding/tasks/:id/execute', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.daily_report.write'), requireBoardingWrite, hubBoardingTasksController_1.postHubBoardingTaskExecute);
router.post('/boarding/reservations/:id/tasks', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.daily_report.write'), requireBoardingWrite, hubBoardingTasksController_1.postHubBoardingTask);
router.get('/boarding/reservations/:id/incidents', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.reservations.read'), requireBoardingModule, hubBoardingRecordsController_1.getHubBoardingIncidents);
router.post('/boarding/reservations/:id/incidents', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.daily_report.write'), requireBoardingWrite, hubBoardingRecordsController_1.postHubBoardingIncident);
router.patch('/boarding/incidents/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.daily_report.write'), requireBoardingWrite, hubBoardingRecordsController_1.patchHubBoardingIncident);
router.get('/boarding/reservations/:id/belongings', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.reservations.read'), requireBoardingModule, hubBoardingRecordsController_1.getHubBoardingBelongings);
router.post('/boarding/reservations/:id/belongings', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.reservations.manage'), requireBoardingWrite, hubBoardingRecordsController_1.postHubBoardingBelonging);
router.patch('/boarding/belongings/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.reservations.manage'), requireBoardingWrite, hubBoardingRecordsController_1.patchHubBoardingBelonging);
router.delete('/boarding/belongings/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.reservations.manage'), requireBoardingWrite, hubBoardingRecordsController_1.deleteHubBoardingBelonging);
router.get('/boarding/reservations/:id/extras', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.reservations.read'), requireBoardingModule, hubBoardingRecordsController_1.getHubBoardingExtras);
router.post('/boarding/reservations/:id/extras', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.reservations.manage'), requireBoardingWrite, hubBoardingRecordsController_1.postHubBoardingExtra);
router.delete('/boarding/extras/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.reservations.manage'), requireBoardingWrite, hubBoardingRecordsController_1.deleteHubBoardingExtra);
router.get('/boarding/reservations/:id/media', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.reservations.read'), requireBoardingModule, hubBoardingRecordsController_1.getHubBoardingMedia);
router.post('/boarding/reservations/:id/media', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.daily_report.write'), requireBoardingWrite, hubBoardingRecordsController_1.uploadHubBoardingMedia);
router.delete('/boarding/media/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.daily_report.write'), requireBoardingWrite, hubBoardingRecordsController_1.deleteHubBoardingMedia);
router.get('/boarding/spaces', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.reservations.read'), requireBoardingModule, hubBoardingOpsController_1.getHubBoardingSpaces);
router.post('/boarding/spaces', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.reservations.manage'), requireBoardingWrite, hubBoardingOpsController_1.postHubBoardingSpace);
router.patch('/boarding/spaces/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.reservations.manage'), requireBoardingWrite, hubBoardingOpsController_1.patchHubBoardingSpace);
router.delete('/boarding/spaces/:id', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.reservations.manage'), requireBoardingWrite, hubBoardingOpsController_1.deleteHubBoardingSpace);
router.get('/boarding/handoffs', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.reservations.read'), requireBoardingModule, hubBoardingOpsController_1.getHubBoardingHandoffs);
router.post('/boarding/handoffs', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.daily_report.write'), requireBoardingWrite, hubBoardingOpsController_1.postHubBoardingHandoff);
router.post('/boarding/handoffs/:id/acknowledge', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.daily_report.write'), requireBoardingWrite, hubBoardingOpsController_1.postHubBoardingHandoffAcknowledge);
router.get('/boarding/reservations/:id/tutor-report', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.reservations.read'), requireBoardingModule, hubBoardingOpsController_1.getHubBoardingTutorReport);
router.post('/boarding/reservations/:id/tutor-reports', authMiddleware_1.authenticateUser, (0, authMiddleware_1.requirePermission)('boarding.reservations.read'), requireBoardingModule, hubBoardingOpsController_1.postHubBoardingTutorReport);
// ─── Comunicação — log de tentativas (click-to-chat / in-app) ──────────────
/**
 * Telemetria de comunicação: sem soft-lock (cat. 2), mas exige membro da clínica.
 * Schema restrito (não é escrita arbitrária).
 */
router.post('/message-logs', authMiddleware_1.authenticateUser, authMiddleware_1.requireClinicAccess, hubMessageLogsController_1.postHubMessageLog);
exports.default = router;

export { default as hubTheme, hubPrimaryHover } from './theme/hubTheme';
export type { HubTheme } from './theme/hubTheme';
export { default as HubLayout } from './components/HubLayout';
export { default as HubChrome } from './components/HubChrome';
export { AlertProvider, useAlert } from './components/AlertProvider';
export type { ShowSuccessToastOptions } from './components/AlertProvider';
export { HubToastRegion, HubToast } from './components/HubToast';
export type { HubToastItemData, HubToastRegionProps } from './components/HubToast';
export { HubCancelButton } from './components/HubCancelButton';
export type { HubCancelButtonProps } from './components/HubCancelButton';
export { HubLoading } from './components/HubLoading';
export type { HubLoadingProps, HubLoadingVariant, HubLoadingSize } from './components/HubLoading';
export { HubCheckbox } from './components/HubCheckbox';
export type { HubCheckboxProps } from './components/HubCheckbox';
export { HubTabs } from './components/HubTabs';
export type { HubTabsProps, HubTabItem, HubTabNavItem, HubTabButtonItem } from './components/HubTabs';
export { HubSearchableCombobox } from './components/HubSearchableCombobox';
export type { HubComboboxOption } from './components/HubSearchableCombobox';
export { HubDateField } from './components/HubDateField';
export type { HubDateFieldProps } from './components/HubDateField';
export { HubBrDateInput } from './components/HubBrDateInput';
export type { HubBrDateInputProps } from './components/HubBrDateInput';
export { HubDesignSystemShowcase } from './design-system/HubDesignSystemShowcase';
export { HubModal } from './components/HubModal';
export type { HubModalProps, HubModalSize } from './components/HubModal';
export { HubSidePanel } from './components/HubSidePanel';
export type { HubSidePanelProps } from './components/HubSidePanel';
export { setHubUiConfig, getVetWebUrl } from './config';
export { hubAgendaApi } from './api/hubAgendaApi';
export { hubAppointmentsApi } from './api/hubAppointmentsApi';
export type { HubAppointmentsServiceGroupStat } from './api/hubAppointmentsApi';
export type {
  HubAppointment,
  HubAgendaCalendarBlock,
  HubAppointmentServiceLine,
  HubAppointmentRecurrenceRule,
  CreateHubAppointmentPayload,
  PatchHubAppointmentPayload,
  CreatePickupRouteBlock,
  CreateExtraBlock,
} from './api/hubAgendaApi';
export { hubGuardiansApi } from './api/hubGuardiansApi';
export type {
  HubGuardian,
  HubGuardianPet,
  HubGuardianStats,
  HubClientKind,
  HubClientStatus,
  HubGuardianCreatePayload,
  HubGuardianUpdatePayload,
} from './api/hubGuardiansApi';
export { hubPetsApi } from './api/hubPetsApi';
export type { HubPet, HubPetGuardianRef } from './api/hubPetsApi';
export { hubClinicSettingsApi } from './api/hubClinicSettingsApi';
export type { HubClinicSettings, PatchHubClinicSettingsPayload } from './api/hubClinicSettingsApi';
export { hubServiceGroupsApi } from './api/hubServiceGroupsApi';
export type { HubServiceGroupRow } from './api/hubServiceGroupsApi';
export { hubStaffApi } from './api/hubStaffApi';
export type { HubStaffMember, HubProfessionalKind, HubStaffAccessRole } from './api/hubStaffApi';
export { hubServiceTypesApi } from './api/hubServiceTypesApi';
export type { HubServiceType, HubServiceGroup } from './api/hubServiceTypesApi';
export { default as HubGuardiansPage } from './pages/HubGuardiansPage';
export { default as HubGuardianDetailPage } from './pages/HubGuardianDetailPage';
export { default as HubPetsPage } from './pages/HubPetsPage';
export { default as HubPetDetailPage } from './pages/HubPetDetailPage';
export { default as HubPetWizardPage } from './pages/HubPetWizardPage';
export { default as HubServicosRoutes } from './pages/servicos/HubServicosRoutes';
export { default as HubSystemSettingsRoutes } from './pages/configuracoes/HubSystemSettingsRoutes';
export { default as HubServiceTypesPage } from './pages/HubServiceTypesPage';
export { default as HubEstoqueRoutes } from './pages/estoque/HubEstoqueRoutes';
export { default as HubStaffPage } from './pages/equipe/HubStaffPage';
export { default as HubAgendaPage } from './pages/agenda/HubAgendaPage';
export { default as HubClinicRoutes } from './pages/clinica/HubClinicRoutes';
export { default as HubGroomingQueuePage } from './pages/grooming/HubGroomingQueuePage';
export { hubGroomingApi } from './api/hubGroomingApi';
export type { GroomingDayBoardItem, GroomingDayBoardResponse } from './api/hubGroomingApi';
export { default as HubPickupPage } from './pages/pickup/HubPickupPage';
export { hubPickupApi } from './api/hubPickupApi';
export type {
  PickupDayBoardItem,
  PickupDayBoardResponse,
  PickupDirection,
  PickupRoute,
  PickupRouteStatus,
  PickupStop,
  PickupStopStatus,
  PickupRoutesResponse,
  PickupRouteDetailResponse,
  PickupGuardian,
} from './api/hubPickupApi';
export { default as PickupStopDrawer } from './pages/pickup/PickupStopDrawer';
export type { PickupStopDrawerProps } from './pages/pickup/PickupStopDrawer';
export { default as PickupDriverView } from './pages/pickup/PickupDriverView';
export { default as HubBoardingPage } from './pages/boarding/HubBoardingPage';
export { hubBoardingApi } from './api/hubBoardingApi';
export type {
  BoardingDayBoardItem,
  BoardingDayBoardResponse,
  BoardingReservation,
  BoardingUnitSettings,
  BoardingOccupancyResponse,
  BoardingCalendarEvent,
  BoardingCalendarResponse,
} from './api/hubBoardingApi';
export { hubEncountersApi, hubClinicalApi } from './api/hubClinicalApi';
export type { HubEncounter, HubEncounterStatus, DayBoardItem } from './api/hubClinicalApi';
export { default as HubOrcamentosRoutes } from './pages/orcamentos/HubOrcamentosRoutes';
export { default as HubQuotePublicView } from './pages/orcamentos/HubQuotePublicView';
export { hubProspectsApi } from './api/hubProspectsApi';
export type { HubProspect } from './api/hubProspectsApi';
export { hubQuotesApi, openHubQuotePdf, downloadHubQuotePdf } from './api/hubQuotesApi';
export type {
  HubQuote,
  HubQuoteStatus,
  HubQuoteBillingState,
  HubQuotePetInput,
  HubQuoteLine,
} from './api/hubQuotesApi';
export type { HubComandaOriginType, HubComandaItem, HubComandaDetailResponse, HubComandaOpenBody, HubComandaManualLine, HubPublicComandaResponse, HubPublicComandaPet, HubComandaAllowedGuardian, HubComandaGuardianEmbed, HubComandaEditContext, HubComandaEditScopes } from './api/hubComandaApi';
export { hubComandaApi, openHubComandaPdf, downloadHubComandaPdf } from './api/hubComandaApi';
export { ComandaCheckoutDrawer } from './pages/finance/ComandaCheckoutDrawer';
export type { ComandaCheckoutDrawerProps } from './pages/finance/ComandaCheckoutDrawer';
export { hubFinancialApi } from './api/hubFinancialApi';
export type {
  HubFinanceUnbilledItem,
  HubFinanceUnbilledSourceType,
  HubFinanceReceivable,
  HubFinanceDashboardSummary,
  HubFinanceCashFlowDay,
  HubFinanceExpense,
  HubFinanceExpenseCategory,
  HubPaymentMethod,
  HubCashSession,
  HubCommissionBasis,
  HubCommissionRule,
  HubCommissionPreviewLine,
  HubCommissionPreviewResponse,
  HubFinanceRevenueReport,
  HubFinanceRevenueSeriesReport,
  HubFinanceTicketAverageReport,
  HubFinanceTopServicesReport,
  HubFinanceAgingReport,
} from './api/hubFinancialApi';
export { default as HubCaixaPage } from './pages/finance/HubCaixaPage';
export { default as HubComandaPage } from './pages/finance/HubComandaPage';
export { default as HubComandaFinancePage } from './pages/finance/HubComandaFinancePage';
export { default as HubComandaReadyToSendPage } from './pages/finance/HubComandaReadyToSendPage';
export { HubComandaPublicView } from './pages/finance/HubComandaPublicView';
export { default as HubFinanceiroPage } from './pages/finance/HubFinanceiroPage';
export { default as HubDashboardPage } from './pages/finance/HubDashboardPage';
export { default as HubRelatoriosPage } from './pages/finance/HubRelatoriosPage';
export { maskTaxIdForList } from './utils/maskTaxId';
export { buildWhatsappLink, normalizeBrPhone } from './utils/whatsappLink';
export { renderTemplate, DEFAULT_TEMPLATES, TEMPLATE_LABELS, TEMPLATE_PLACEHOLDER_HINTS } from './utils/hubMessageTemplates';
export type { MessageTemplateKey } from './utils/hubMessageTemplates';
export { useMessageTemplates } from './utils/useMessageTemplates';
export { logMessageAttempt } from './api/hubMessageLogsApi';
export type { MessageLogChannel, CreateMessageLogPayload } from './api/hubMessageLogsApi';

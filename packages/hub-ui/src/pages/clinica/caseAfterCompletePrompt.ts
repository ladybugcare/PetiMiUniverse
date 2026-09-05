import { hubClinicalCasesApi, type HubClinicalCaseStatus } from '../../api/hubClinicalApi';
import { clinicalCaseDisplayTitle } from './clinicalCaseTitle';

export type CaseAfterCompleteChoice = 'keep_open' | 'monitoring' | 'resolved';

export type CaseAfterCompletePrompt = {
  caseId: string;
  title: string;
  status: 'active' | 'monitoring';
  pendingExamsCount: number;
};

export function shouldPromptCaseAfterComplete(opts: {
  caseId?: string | null;
  status?: string | null;
  hasOpenHospitalization?: boolean;
}): boolean {
  if (!opts.caseId) return false;
  if (opts.status !== 'active' && opts.status !== 'monitoring') return false;
  if (opts.hasOpenHospitalization) return false;
  return true;
}

export function buildCaseAfterCompletePrompt(input: {
  caseId?: string | null;
  status?: string | null;
  title?: string | null;
  chiefComplaint?: string | null;
  hasOpenHospitalization?: boolean;
  pendingExamsCount?: number;
}): CaseAfterCompletePrompt | null {
  if (!shouldPromptCaseAfterComplete(input)) return null;
  return {
    caseId: input.caseId as string,
    title: clinicalCaseDisplayTitle(input.title, [input.chiefComplaint]),
    status: input.status as 'active' | 'monitoring',
    pendingExamsCount: input.pendingExamsCount ?? 0,
  };
}

export async function applyCaseAfterCompleteChoice(
  clinicId: string,
  caseId: string,
  choice: CaseAfterCompleteChoice,
): Promise<Exclude<CaseAfterCompleteChoice, 'keep_open'> | 'unchanged'> {
  if (choice === 'keep_open') return 'unchanged';
  const status: HubClinicalCaseStatus = choice;
  await hubClinicalCasesApi.patch(caseId, { clinic_id: clinicId, status });
  return choice;
}

export function caseAfterCompleteSuccessMessage(
  result: Exclude<CaseAfterCompleteChoice, 'keep_open'> | 'unchanged',
): string | null {
  if (result === 'resolved') return 'Caso marcado como resolvido';
  if (result === 'monitoring') return 'Caso em monitoramento';
  return null;
}

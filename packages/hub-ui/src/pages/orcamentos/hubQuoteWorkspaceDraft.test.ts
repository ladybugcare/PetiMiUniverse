import { describe, expect, it } from 'vitest';
import { validateWorkspaceDraft } from './hubQuoteWorkspaceDraft';

const SERVICE_ID = '4609ee2e-20de-48fe-9b45-fb8652b71246';

describe('validateWorkspaceDraft — vínculo imediato de serviço', () => {
  it('aceita linha com hub_service_type_id já gravado antes do suggest-price terminar', () => {
    // Regressão: applyLineServiceChange precisa commitar o id de forma síncrona;
    // se o id só chegasse após await suggestPrice, o 1º «Salvar rascunho» falhava
    // com "Adicione pelo menos uma linha de serviço…".
    const err = validateWorkspaceDraft({
      createContext: {
        kind: 'inline_prospect',
        prospect: {
          full_name: 'Tutor QA',
          phone: '11999999999',
          tax_id: '11144477735',
        },
      },
      persistedQuoteId: null,
      pets: [{ species: 'cao' }],
      lines: [{ hub_service_type_id: SERVICE_ID }],
      subtotal: 80,
    });
    expect(err).toBeNull();
  });

  it('rejeita linha ainda sem tipo de serviço (suggest em voo / não selecionado)', () => {
    const err = validateWorkspaceDraft({
      createContext: {
        kind: 'inline_prospect',
        prospect: {
          full_name: 'Tutor QA',
          phone: '11999999999',
          tax_id: '11144477735',
        },
      },
      persistedQuoteId: null,
      pets: [{ species: 'cao' }],
      lines: [{ hub_service_type_id: '' }],
      subtotal: 80,
    });
    expect(err).toMatch(/tipo de serviço/i);
  });
});

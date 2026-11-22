export type HubQuoteCreateContext =
  | { kind: 'prospect_id'; prospect_id: string }
  | {
      kind: 'inline_prospect';
      prospect: { full_name: string; tax_id: string; phone: string; email?: string | null };
    };

function taxDigitsOk(s: string): boolean {
  const d = s.replace(/\D/g, '');
  return d.length === 11 || d.length === 14;
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s.trim());
}

/** Valida rascunho antes de POST/PATCH (alinha com regras do backend). */
export function validateWorkspaceDraft(opts: {
  createContext: HubQuoteCreateContext | null;
  persistedQuoteId: string | null;
  pets: Array<{ species?: string | null }>;
  lines: Array<{ hub_service_type_id: string }>;
  subtotal: number;
}): string | null {
  const { createContext, persistedQuoteId, pets, lines, subtotal } = opts;
  const editing = Boolean(persistedQuoteId);

  if (!editing) {
    if (!createContext) {
      return 'Preencha nome, telefone e CPF/CNPJ (11 ou 14 dígitos) do contato antes de salvar o rascunho.';
    }
    if (createContext.kind === 'inline_prospect') {
      const pr = createContext.prospect;
      if (!pr.full_name.trim()) return 'Informe o nome do contato.';
      if (!pr.phone.trim()) return 'Informe o telefone do contato.';
      if (!taxDigitsOk(pr.tax_id ?? '')) {
        return 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido para o contato.';
      }
    }
  }

  if (pets.length < 1) return 'Inclua pelo menos um pet no orçamento.';
  for (let i = 0; i < pets.length; i++) {
    if (!pets[i]?.species?.trim()) return `Pet ${i + 1}: selecione a espécie.`;
  }

  const hasService = lines.some((l) => {
    const id = l.hub_service_type_id.trim();
    return id.length > 0 && isUuid(id);
  });
  if (!hasService) return 'Adicione pelo menos uma linha de serviço e escolha o tipo de serviço.';

  if (subtotal <= 0) return 'Informe valores (R$) superiores a zero para os serviços por pet.';

  return null;
}

# Cadastro no Hub — pessoa (admin) + primeira unidade (backlog)

**Estado:** proposta documentada para implementação futura — **não** está em desenvolvimento ativo neste momento.

## Contexto — PetMi Vet hoje

No fluxo atual de **cadastro público de clínica** no PetMi Vet, o formulário recolhe sobretudo:

- Dados da **empresa** / clínica (razão social, CNPJ, endereço, etc.).
- **E-mail e senha** para criar a conta de autenticação (Supabase Auth).

O usuário que passa a ser o **administrador principal** da clínica (`CADMIN` / equivalente operacional) fica assim **sem um bloco explícito de “dados da pessoa”** (nome a exibir, telefone pessoal, preferências de perfil) separados dos dados institucionais. Na prática, a identidade percebida é “a clínica”, não “a pessoa + a clínica”.

Isso é aceitável para o produto Vet/Match focado em staffing, mas limita:

- **Meu perfil** e comunicação humana (quem é o contato).
- Evolução para **multi-unidade** com clareza de quem é dono/operador vs. qual unidade.
- Alinhamento com **PetMi Hub** como “SO do negócio pet”, onde staff e unidades são entidades de primeira classe.

## Proposta — quando formos implementar no Hub

Tratar o **onboarding de uma nova organização no PetMi Hub** como um fluxo **em duas etapas obrigatórias e sequenciais** (wizard ou steps claros):

1. **Cadastro da pessoa como administrador**
   - Dados mínimos da **pessoa** (nome completo ou nome a exibir, e-mail, telefone opcional, senha / magic link — a definir com segurança).
   - Atribuição explícita de papel **admin da organização** (`CADMIN` ou nome futuro equivalente).
   - Garantir que existe registo de **perfil humano** utilizável em “Meu perfil”, notificações e auditoria (“quem fez”).

2. **Cadastro da primeira unidade** (na sequência, antes de “entrar” no produto)
   - Dados da **unidade** operacional (nome fantasia da loja, endereço, timezone, identificadores fiscais se forem por unidade, etc.).
   - Esta unidade torna-se o **contexto operacional padrão** pós-login até o usuário mudar de unidade (quando multi-unidade existir).

**Ordem fixa:** pessoa (admin) → primeira unidade → dashboard / home Hub.

### Objetivos de produto

- Separar claramente **identidade humana** (platform/auth + perfil staff) de **entidade operacional** (organização + unidade).
- Evitar o anti-padrão “só existe a empresa” no usuário que gere o dia a dia no Hub.
- Facilitar **segunda unidade** e convites a outros staff sem reescrever o modelo mental.

## Decisões ainda em aberto (para o time alinhar na hora H)

- **Onde vive o signup:** apenas app Hub (`hub-web`), ou também migração do fluxo Vet para o mesmo backend/endpoint com flags?
- **Organização vs. `clinics`:** criar org + primeira `unit` numa transação; mapear para tabelas atuais (`clinics`, `units`) ou esperar refactor de nomenclatura.
- **Contas já criadas pelo Vet:** migração suave (pedir “completar perfil” + “confirmar primeira unidade”) vs. apenas novas contas.
- **Confirmação de e-mail:** manter confirmação Supabase; impacto no wizard (bloquear passo 2 até confirmar ou permitir rascunho).
- **Dados fiscais:** o que fica na **organização** vs. na **primeira unidade** (Brasil: CNPJ matriz/filial).

## Critérios de aceite sugeridos (rascunho)

Quando este épic for priorizado:

- [ ] Novo usuário consegue concluir signup **sem** saltar o passo “primeira unidade” (ou com abandono explícito documentado e recuperável).
- [ ] Após conclusão, `Meu perfil` mostra dados da **pessoa**; dados da unidade aparecem no contexto clínica/unidade, não misturados sem regra.
- [ ] Role admin está consistente com matriz de permissões ([PERMISSIONS_ROADMAP.md](./PERMISSIONS_ROADMAP.md)).
- [ ] Documentação de API e RLS atualizada para criação atómica org + unit + `clinic_user` (ou equivalente).

## Relação com outros documentos

- Épicos e ordem geral: [HUB_MVP_EPICS.md](./HUB_MVP_EPICS.md) (seção *Pós-MVP / backlog cadastro*).
- Fronteiras Hub vs. platform: [PRODUCT_BOUNDARIES.md](./PRODUCT_BOUNDARIES.md).

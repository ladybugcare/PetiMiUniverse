# Checklist E2E — Receita Digital Validável (PetMi Hub)

Checklist manual de aceite para validar o fluxo ponta a ponta após deploy ou antes de release.

## Pré-requisitos

- Migrations 58–62 aplicadas no ambiente.
- Backend e `hub-web` rodando com clínica de teste configurada.
- Usuário com permissões `hub.clinic.read` e `hub.clinic.write`.
- Atendimento clínico aberto com pet, tutor e veterinário responsável.

## Fluxo principal

1. **Criar prescrição no atendimento**
   - [ ] Abrir `/hub/clinica/atendimentos/:encounterId`.
   - [ ] Adicionar ao menos um medicamento com campos MVP (nome, posologia, etc.).
   - [ ] Confirmar que pet, tutor e vet aparecem automaticamente.

2. **Emitir receita validável**
   - [ ] Clicar em **Emitir receita validável**.
   - [ ] Modal exibe código `RX-XXXX-XXXX`, link `/receita/:token`, QR e hash truncado.
   - [ ] Disclaimers legais visíveis no modal.
   - [ ] Prescrição fica bloqueada para edição (status emitida).

3. **PDF autenticado (workspace)**
   - [ ] Baixar PDF pelo botão do modal ou histórico.
   - [ ] PDF contém medicamentos, código, QR, hash truncado e avisos legais.

4. **Página pública por link**
   - [ ] Abrir link `/receita/:token` em aba anônima (sem login).
   - [ ] Status **Válida**, medicamentos do snapshot, hash truncado e disclaimers.
   - [ ] Botão **Baixar PDF** funciona.
   - [ ] QR escaneável no mobile abre a mesma página.

5. **Validação por código**
   - [ ] Abrir `/validar-receita`.
   - [ ] Informar código `RX-XXXX-XXXX` (testar também `?code=` na URL).
   - [ ] Mesma receita exibida com status correto.

6. **Histórico clínico**
   - [ ] Em prontuário (`/hub/clinica/prontuarios?tab=prescricoes`) ou caso clínico, aba Prescrições.
   - [ ] Versão emitida com badge, PDF, link público e ações disponíveis.

7. **Revogação**
   - [ ] Revogar receita informando motivo (≥ 10 caracteres).
   - [ ] Badge muda para **Revogada** no workspace e histórico.
   - [ ] Página pública e `/validar-receita` mostram status **Revogada** imediatamente.
   - [ ] Banner de aviso visível na consulta pública.

8. **Reemissão (opcional)**
   - [ ] Reemitir nova versão a partir do atendimento.
   - [ ] Histórico lista v1 e v2; códigos distintos.

## Segurança e hardening

- [ ] Resposta pública não exige autenticação e retorna `Cache-Control: no-store`.
- [ ] Token inválido ou inexistente → mensagem neutra “Receita não encontrada”.
- [ ] Código malformado em `/validar-receita` → erro de validação claro.
- [ ] Resposta pública não expõe telefone/e-mail do tutor nem token completo.

## Mobile

- [ ] Layout da página pública legível em viewport estreita (320px+).
- [ ] QR no PDF e no modal escaneável com câmera do celular.

## Regressão rápida

- [ ] Orçamento público (`/orcamento/:token`) e comanda pública (`/comanda/:token`) continuam funcionando.
- [ ] Suite backend: `cd backend && npx jest --config jest.config.ts`.
- [ ] Testes hub-ui: `cd packages/hub-ui && npm test`.

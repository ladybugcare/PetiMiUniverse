# 🚀 Quick Start - Histórico de Conversação

## 📋 Passos para Executar

### 1. Executar Migração do Banco de Dados

Acesse o **Supabase SQL Editor** e execute o arquivo:
```
backend/database_migrations/petimi_vet/add_conversation_and_evaluation.sql
```

O script irá:
- ✅ Criar tabela `ticket_messages`
- ✅ Criar tabela `ticket_evaluations`
- ✅ Migrar dados existentes automaticamente
- ✅ Adicionar colunas `last_message_at` e `last_message_by` em `support_tickets`
- ✅ Criar índices para performance

**⚠️ Nota:** O script mantém os dados antigos por compatibilidade, mas eles serão zerados (marcados como NULL).

### 2. Verificar Backend

O backend já está atualizado com as novas funções. Apenas reinicie se necessário:

```bash
cd backend
npm run dev
```

**Novas rotas disponíveis:**
- `POST /support/tickets/:id/messages` - Adicionar mensagem
- `GET /support/tickets/:id/messages` - Buscar mensagens
- `PATCH /support/tickets/:id/messages/read` - Marcar como lidas
- `POST /support/tickets/:id/evaluate` - Avaliar ticket

### 3. Verificar Frontend

O frontend já está atualizado. Se já estiver rodando, pode ser necessário recarregar:

```bash
cd frontend
npm start
```

**Páginas atualizadas:**
- `/my-support-tickets` - Thread de conversação para usuários
- `/admin/support-tickets` - Thread de conversação para admins

## 🧪 Como Testar

### Teste 1: Criar Ticket e Conversar

1. **Como Usuário (Clinic/Vet):**
   - Faça login como clínica ou veterinário
   - Clique no botão de "Suporte" no header (ícone de ajuda)
   - Digite uma mensagem e envie
   - Vá para "Meus Tickets" no menu lateral

2. **Como Admin:**
   - Faça login como admin
   - Vá para "Tickets de Suporte"
   - Clique no ticket criado
   - Digite uma resposta e envie

3. **Volte para o Usuário:**
   - Veja que aparece um badge de mensagem não lida
   - Clique no ticket
   - Continue a conversa enviando mais mensagens

### Teste 2: Avaliar Ticket

1. **Como Usuário:**
   - Abra um ticket com conversação
   - Clique em "Marcar como Resolvido"
   - Selecione as estrelas (obrigatório)
   - Adicione um comentário opcional
   - Clique em "Avaliar e Fechar"

2. **Verificar:**
   - ✅ Input de mensagem fica desabilitado
   - ✅ Aparece banner de "Ticket resolvido e avaliado"
   - ✅ Status mudou para "Resolvido"
   - ✅ Não é mais possível enviar mensagens

3. **Como Admin:**
   - Abra o mesmo ticket
   - Veja a avaliação no topo
   - ✅ Não é possível responder mais

### Teste 3: Badge de Não Lidos

1. **Como Admin:**
   - Responda a um ticket

2. **Como Usuário:**
   - Veja que aparece badge vermelho no botão de suporte
   - Clique no botão → vai direto para "Meus Tickets"
   - Badge de "X novas" aparece no card do ticket
   - Ao abrir o ticket, badge desaparece (mensagens marcadas como lidas)

## 🎨 Recursos Visuais

### Thread de Conversação
- Mensagens do usuário: **roxo à direita**
- Mensagens do admin: **branco à esquerda**
- Hora de envio em cada mensagem
- Auto-scroll para última mensagem

### Modal de Avaliação
- 5 estrelas clicáveis com hover effect
- Campo de comentário opcional
- Aviso sobre fechamento
- Design moderno e responsivo

### Badges e Indicadores
- Badge vermelho no header: "X novas mensagens"
- Badge nos tickets: "X nova(s)"
- Status coloridos: Aberto (vermelho), Em Análise (amarelo), Resolvido (verde)
- Estrelas de avaliação nos tickets resolvidos

## ⚙️ Configurações e Limites

### Mensagens:
- **Mínimo:** 5 caracteres
- **Máximo:** 1000 caracteres
- **Bloqueio:** Não pode enviar se ticket foi avaliado

### Avaliação:
- **Rating:** 1-5 estrelas (obrigatório)
- **Comentário:** 0-500 caracteres (opcional)
- **Restrição:** Só pode avaliar uma vez por ticket
- **Efeito:** Marca ticket como resolvido automaticamente

### Contadores:
- Badge de não lidos atualiza a cada 30 segundos
- Contagem de mensagens (não tickets)
- Apenas mensagens de admin não lidas contam

## 🐛 Troubleshooting

### Erro: "null value in column message violates not-null constraint"
**Causa:** A coluna `message` ainda tem constraint NOT NULL
**Solução:** Execute o script de correção:
```sql
-- No Supabase SQL Editor
backend/database_migrations/petimi_vet/fix_message_constraint.sql
```
Ou execute diretamente:
```sql
ALTER TABLE support_tickets ALTER COLUMN message DROP NOT NULL;
ALTER TABLE support_tickets ALTER COLUMN user_read DROP NOT NULL;
```

### Erro: "column ticket_messages does not exist"
**Solução:** Execute a migração SQL completa no Supabase

### Erro: "rating deve ser um número entre 1 e 5"
**Solução:** Certifique-se de selecionar estrelas antes de enviar avaliação

### Badge não atualiza
**Solução:** Aguarde 30 segundos ou recarregue a página

### Mensagens não aparecem
**Solução:** 
1. Verifique se a migração foi executada
2. Verifique console do navegador para erros
3. Verifique logs do backend

### Não consigo enviar mensagem
**Verificar:**
- Ticket já foi avaliado? (se sim, é esperado)
- Mensagem tem pelo menos 5 caracteres?
- Você está logado?

## 📚 Documentação Completa

Para detalhes completos da implementação, veja:
- `HISTORICO_CONVERSACAO_IMPLEMENTADO.md` - Documentação técnica completa
- `PLANO_HISTORICO_CONVERSACAO.md` - Plano original da implementação

## ✅ Checklist Pós-Migração

Após executar a migração, verifique:

- [ ] Tabela `ticket_messages` existe no Supabase
- [ ] Tabela `ticket_evaluations` existe no Supabase
- [ ] Dados antigos foram migrados (se havia tickets existentes)
- [ ] Backend inicia sem erros
- [ ] Frontend inicia sem erros
- [ ] Consegue criar novo ticket
- [ ] Consegue enviar mensagens
- [ ] Badge de não lido aparece
- [ ] Consegue avaliar ticket
- [ ] Input desabilita após avaliação
- [ ] Admin vê avaliação

## 🎉 Pronto!

O sistema de histórico de conversação e avaliação está funcionando! 

**Principais benefícios:**
- ✅ Conversação ilimitada (não mais limitado a 1 mensagem + 1 resposta)
- ✅ Feedback de qualidade através de avaliações
- ✅ Fechamento automático após resolução
- ✅ UX moderna estilo WhatsApp
- ✅ Performance otimizada

---

**Dúvidas?** Consulte a documentação completa em `HISTORICO_CONVERSACAO_IMPLEMENTADO.md`


# ✅ Checklist: Correção de Erros do Banco de Dados

Use este checklist para acompanhar o processo de correção dos erros do banco de dados.

---

## 📋 PASSO A PASSO

### 1️⃣ Preparação

- [ ] Li o arquivo `FIX_DATABASE_ERRORS.md`
- [ ] Tenho acesso ao Supabase Dashboard
- [ ] Identifiquei meu projeto no Supabase (PetMi Vet)
- [ ] Tenho permissão de administrador no projeto

---

### 2️⃣ Diagnóstico (Opcional, mas Recomendado)

- [ ] Abri Supabase Dashboard → SQL Editor
- [ ] Executei o arquivo `backend/database_migrations/petimi_vet/00_DIAGNOSE_DATABASE.sql`
- [ ] Li os resultados do diagnóstico
- [ ] Identifiquei os problemas:
  - [ ] Falta coluna `end_time` na tabela `demands`
  - [ ] Tabela `position_applications` tem tipos `bigint` ao invés de `uuid`

---

### 3️⃣ Execução da Migration

- [ ] Abri o arquivo `backend/database_migrations/petimi_vet/01_FIX_ALL_ERRORS.sql`
- [ ] Copiei TODO o conteúdo do arquivo (Ctrl/Cmd + A, depois Ctrl/Cmd + C)
- [ ] Colei no SQL Editor do Supabase (Ctrl/Cmd + V)
- [ ] Cliquei em "Run" (ou pressionei Ctrl/Cmd + Enter)
- [ ] Aguardei a execução completa
- [ ] Vi a mensagem: ✅ "MIGRATION CONCLUÍDA COM SUCESSO!"

---

### 4️⃣ Verificação

- [ ] Executei novamente o diagnóstico (`00_DIAGNOSE_DATABASE.sql`)
- [ ] Resultado mostra: ✅ "BANCO DE DADOS OK!"
- [ ] Tabela `demands` agora tem coluna `end_time`
- [ ] Tabela `position_applications` tem tipos corretos (uuid)

---

### 5️⃣ Testes Funcionais

#### Teste 1: Criar Demanda
- [ ] Acessei a página "Criar Nova Demanda" no sistema
- [ ] Preenchi todos os campos obrigatórios:
  - [ ] Título da demanda
  - [ ] Descrição
  - [ ] Data da demanda
  - [ ] Horário inicial
  - [ ] Horário final
  - [ ] Posições profissionais (especialidades, vagas, pagamento)
- [ ] Cliquei em "Criar Demanda"
- [ ] ✅ Demanda criada com sucesso (sem erros)
- [ ] Demanda aparece na lista de demandas

#### Teste 2: Candidatar-se a Vaga
- [ ] Fiz login como veterinário no sistema
- [ ] Acessei o Marketplace de Vagas (ou página de posições)
- [ ] Encontrei uma vaga aberta
- [ ] Cliquei em "Candidatar-se"
- [ ] Preenchi mensagem (se aplicável)
- [ ] Enviei a candidatura
- [ ] ✅ Candidatura enviada com sucesso (sem erros)
- [ ] Candidatura aparece na lista "Minhas Candidaturas"

---

### 6️⃣ Validações Adicionais (Opcional)

#### Sistema de Posições
- [ ] Criei uma demanda com múltiplas posições
- [ ] Cada posição tem especialidades diferentes
- [ ] Sistema permite candidaturas independentes para cada posição

#### Conflitos de Horário
- [ ] Veterinário se candidatou a duas vagas no mesmo horário
- [ ] Ao aceitar uma, a outra foi inativada automaticamente
- [ ] Status mostrado: "inactive_time_conflict"

#### Auto-inativação
- [ ] Veterinário teve candidatura aceita em uma posição
- [ ] Outras candidaturas para a mesma demanda foram inativadas
- [ ] Status mostrado: "inactive_accepted_other_position"

---

## 🎉 CONCLUSÃO

- [ ] ✅ Ambos os erros foram corrigidos
- [ ] ✅ Sistema de criar demandas funcionando
- [ ] ✅ Sistema de candidaturas funcionando
- [ ] ✅ Testes realizados com sucesso
- [ ] ✅ Banco de dados atualizado e funcional

---

## 📝 NOTAS E OBSERVAÇÕES

Use este espaço para anotar qualquer problema ou observação durante o processo:

```
[Suas notas aqui]







```

---

## 🆘 PROBLEMAS ENCONTRADOS?

Se você marcou algum item mas encontrou problemas:

1. **Migration falhou:**
   - Verifique se copiou TODO o conteúdo do arquivo
   - Leia a mensagem de erro completa
   - Consulte a seção "Troubleshooting" em `FIX_DATABASE_ERRORS.md`

2. **Testes falharam:**
   - Execute novamente o diagnóstico (`00_DIAGNOSE_DATABASE.sql`)
   - Verifique se a migration foi concluída com sucesso
   - Confira se o schema está correto

3. **Ainda com dúvidas:**
   - Consulte `backend/database_migrations/EXECUTE_MIGRATIONS_GUIDE.md`
   - Consulte `backend/database_migrations/README.md`

---

**Data de execução:** ________________

**Executado por:** ________________

**Status final:** ⬜ Sucesso  ⬜ Pendente  ⬜ Com problemas

---

**Última atualização deste checklist:** 2025-10-29


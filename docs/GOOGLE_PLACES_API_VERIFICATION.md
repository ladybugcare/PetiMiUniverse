# 🔍 Verificação do Projeto Google Cloud para Places API

## Como a API Key Identifica o Projeto

**Sim, apenas a chave é suficiente!** A API key do Google Cloud identifica automaticamente o projeto. Cada API key está vinculada a um projeto específico no Google Cloud Console.

## Como Verificar Qual Projeto Está Sendo Usado

### 1. Através do Console do Navegador

Quando você carregar a página, o console mostrará logs como:

```
[Google Places] API Key em uso: AIzaSyDQ12...cMqWvw
[Google Places] Verificando projeto...
[Google Places] Script carregado com sucesso
[Google Places] Places API disponível: true
[Google Places] Projeto identificado pela API key: AIzaSyDQ12...cMqWvw
[Google Places] ✅ API key válida e conectada ao projeto correto
```

### 2. Através do Google Cloud Console

1. Acesse: https://console.cloud.google.com/apis/credentials
2. Procure pela sua API key (`AIzaSyDQ12HBkNWs0hCjJovBPS45XVQZYcMqWvw`)
3. Clique na chave para ver os detalhes
4. Na seção "Mais informações", você verá:
   - **Nome do projeto**: O projeto ao qual a chave pertence
   - **Data da criação**: Quando a chave foi criada

### 3. Verificar APIs Ativadas no Projeto

1. No Google Cloud Console, vá em **APIs e serviços** → **APIs e serviços ativados**
2. Verifique se estas APIs estão na lista:
   - ✅ **Places API** (ou Places API (New))
   - ✅ **Maps JavaScript API**

### 4. Verificar Restrições da API Key

1. No Google Cloud Console, vá em **APIs e serviços** → **Credenciais**
2. Clique na sua API key
3. Verifique:
   - **Restrições do aplicativo**: Se estiver como "Nenhum", está OK. Se tiver restrições de HTTP referrer, adicione `http://localhost:3002/*`
   - **Restrições da API**: Certifique-se de que **Places API** e **Maps JavaScript API** estão na lista de APIs permitidas

## Resolução de Problemas

### Erro: `ApiNotActivatedMapError`

**Causa**: A Places API não está ativada no projeto associado à API key.

**Solução**:
1. Acesse: https://console.cloud.google.com/apis/library/places-backend.googleapis.com
2. Certifique-se de que está no projeto correto (verifique no seletor de projetos no topo)
3. Clique em **Ativar**

### Erro: `RefererNotAllowedMapError`

**Causa**: A API key tem restrições de HTTP referrer que bloqueiam `localhost`.

**Solução**:
1. Acesse: https://console.cloud.google.com/apis/credentials
2. Clique na sua API key
3. Em **Restrições do aplicativo**, selecione **Sites**
4. Adicione:
   - `http://localhost:3002/*`
   - `http://127.0.0.1:3002/*`
5. Salve as alterações

### Verificar se a API Key Está Correta

1. Abra o console do navegador (F12)
2. Procure pelos logs `[Google Places]`
3. Compare a API key mostrada com a que você configurou no `.env.local`
4. Se forem diferentes, verifique o arquivo `.env.local` em `frontend/.env.local`

## Checklist de Verificação

- [ ] API key configurada em `frontend/.env.local` como `REACT_APP_GOOGLE_PLACES_API_KEY`
- [ ] API key corresponde ao projeto correto no Google Cloud Console
- [ ] Places API está ativada no projeto
- [ ] Maps JavaScript API está ativada no projeto
- [ ] API key tem Places API e Maps JavaScript API nas restrições (se aplicável)
- [ ] Não há restrições de HTTP referrer bloqueando localhost (ou localhost está na lista permitida)
- [ ] Console do navegador mostra logs `[Google Places]` sem erros

## Nota Importante

A API key **identifica automaticamente o projeto**. Você não precisa especificar o projeto separadamente - a chave já está vinculada ao projeto no Google Cloud Console.


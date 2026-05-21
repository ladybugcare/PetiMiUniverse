
## 📋 **PETIVET - KNOWLEDGE BASE - REGRAS DE NEGÓCIO**

```markdown
# PetMi Vet - Knowledge Base & Business Rules

## 📌 **VISÃO GERAL DO PROJETO**

### **Descrição**
PetMi Vet é uma plataforma que conecta clínicas veterinárias a profissionais veterinários qualificados, facilitando a contratação temporária e matching de demandas.

### **Propósito**
Revolucionar o atendimento veterinário ao facilitar a conexão entre clínicas que precisam de profissionais e veterinários em busca de oportunidades.

### **Stack Tecnológica**
- **Backend**: Node.js + Express.js + TypeScript
- **Frontend**: React + TypeScript (Web App responsivo)
- **Database**: Supabase (PostgreSQL)
- **Autenticação**: Supabase Auth
- **API**: REST API
- **Estilo**: CSS customizado + Design System (Poppins + Inter)

---

## 🎯 **ENTIDADES PRINCIPAIS**

### **1. Clínicas Veterinárias (Clinics)**
Estabelecimentos que buscam profissionais veterinários.

**Campos:**
- `id`: UUID (gerado automaticamente)
- `name`: String (nome da clínica)
- `cnpj`: String (identificador único)
- `address`: String (endereço completo)
- `email`: String (email de contato)
- `password`: String (senha criptografada)
- `created_at`: Timestamp

**Regras:**
- CNPJ deve ser único
- Email deve ser único
- Clínica pode criar múltiplas demandas
- Clínica pode visualizar candidatos às suas demandas

---

### **2. Veterinários (Vets)**
Profissionais que buscam oportunidades de trabalho.

**Campos:**
- `id`: UUID (gerado automaticamente)
- `name`: String (nome completo)
- `crmv`: String (número do CRMV + UF)
- `specialties`: Array de Strings (especialidades)
- `experience`: String (anos de experiência)
- `email`: String (email de contato)
- `password`: String (senha criptografada)
- `created_at`: Timestamp

**Regras:**
- CRMV deve ser único
- Email deve ser único
- Veterinário pode se candidatar a múltiplas demandas
- Especialidades são separadas por vírgula no cadastro
- Veterinário pode visualizar todas as demandas abertas

---

### **3. Demandas (Demands)**
Oportunidades de trabalho criadas pelas clínicas.

**Campos:**
- `id`: UUID (gerado automaticamente)
- `clinic_id`: UUID (referência à clínica)
- `title`: String (título da vaga)
- `description`: String (descrição detalhada)
- `status`: Enum ('open', 'in_progress', 'closed')
- `payment`: Number (valor opcional)
- `created_at`: Timestamp
- `updated_at`: Timestamp

**Regras:**
- Apenas clínicas autenticadas podem criar demandas
- Status inicial: 'open'
- Demandas abertas são visíveis para todos os veterinários
- Clínica pode atualizar status da demanda

---

### **4. Candidaturas (Applications)**
Candidaturas de veterinários às demandas.

**Campos:**
- `id`: UUID (gerado automaticamente)
- `demand_id`: UUID (referência à demanda)
- `vet_id`: UUID (referência ao veterinário)
- `status`: Enum ('pending', 'accepted', 'rejected')
- `created_at`: Timestamp

**Regras:**
- Veterinário não pode se candidatar duas vezes à mesma demanda
- Status inicial: 'pending'
- Clínica pode aceitar ou rejeitar candidaturas
- Ao aceitar uma candidatura, a demanda muda para 'in_progress'

---

## 🔄 **FLUXO DE NEGÓCIO**

### **Fluxo Principal:**

```
1. CADASTRO
   ├─ Clínica cadastra conta (nome, CNPJ, endereço, email, senha)
   └─ Veterinário cadastra conta (nome, CRMV, especialidades, experiência, email, senha)

2. CRIAÇÃO DE DEMANDA
   ├─ Clínica faz login
   ├─ Clínica cria demanda (título, descrição, pagamento opcional)
   └─ Demanda fica com status 'open'

3. VISUALIZAÇÃO DE DEMANDAS
   ├─ Veterinário faz login
   ├─ Veterinário vê todas as demandas abertas
   └─ Demandas exibem: título, descrição, clínica, pagamento, data

4. CANDIDATURA
   ├─ Veterinário se candidata à demanda
   ├─ Application criada com status 'pending'
   └─ Clínica é notificada (futuramente)

5. SELEÇÃO
   ├─ Clínica visualiza candidatos
   ├─ Clínica aceita ou rejeita candidaturas
   └─ Demanda muda para 'in_progress' ao aceitar candidato

6. CONCLUSÃO
   └─ Clínica fecha demanda (status 'closed')
```

---

## 🔐 **AUTENTICAÇÃO E AUTORIZAÇÃO**

### **Autenticação:**
- Sistema usa Supabase Auth
- Login via email + senha
- Backend valida credenciais via API
- Token JWT para sessões (futuro)

### **Permissões:**

**Clínica pode:**
- ✅ Criar demandas
- ✅ Visualizar suas demandas
- ✅ Ver candidatos às suas demandas
- ✅ Aceitar/rejeitar candidaturas
- ✅ Atualizar status de demandas
- ❌ Se candidatar a demandas

**Veterinário pode:**
- ✅ Visualizar demandas abertas
- ✅ Se candidatar a demandas
- ✅ Ver suas candidaturas
- ❌ Criar demandas
- ❌ Ver candidatos de outras pessoas

**Público (não autenticado) pode:**
- ✅ Visualizar página inicial
- ✅ Se cadastrar (clínica ou veterinário)
- ❌ Ver demandas
- ❌ Criar demandas
- ❌ Se candidatar

---

## 🗄️ **ESTRUTURA DO BANCO DE DADOS**

### **Tabelas:**

```sql
-- Clínicas
clinics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  cnpj VARCHAR(18) UNIQUE NOT NULL,
  address TEXT NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
)

-- Veterinários
vets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  crmv VARCHAR(20) UNIQUE NOT NULL,
  specialties TEXT[] NOT NULL,
  experience VARCHAR(50) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
)

-- Demandas
demands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'open',
  payment DECIMAL(10,2),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
)

-- Candidaturas
applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  demand_id UUID REFERENCES demands(id) ON DELETE CASCADE,
  vet_id UUID REFERENCES vets(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(demand_id, vet_id)
)
```

### **Row Level Security (RLS):**
- ✅ Habilitado em todas as tabelas
- Políticas para leitura/escrita baseadas em autenticação
- Clínicas só veem suas próprias demandas (privadas)
- Demandas abertas são públicas para veterinários

---

## 🎨 **DESIGN SYSTEM**

### **Tipografia:**
- **Títulos**: Poppins (Bold/Semibold) - Moderna e profissional
- **Corpo**: Inter (Regular) - Excelente legibilidade
- **Aplicação**: `.text-display` usa Poppins, textos usam Inter

### **Paleta de Cores:**

**Primária (Blue):**
- `#0ea5e9` (primary-500) - Azul principal
- `#0284c7` (primary-600) - Azul hover

**Secundária (Orange/Terracota):**
- `#f2941b` (secondary-500) - Laranja principal
- `#d17a0f` (secondary-600) - Laranja hover

**Accent (Green):**
- `#22c55e` (accent-500) - Verde principal
- `#16a34a` (accent-600) - Verde hover

**Hero (Purple):**
- `#a855f7` - Roxo lavanda (gradiente hero)
- `#9333ea` - Roxo intenso (gradiente hero)

**Neutros:**
- `#fafafa` a `#171717` (50 a 900)

### **Componentes:**
- **Cards**: `.modern-card`, `.icon-card`
- **Botões**: `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-accent`, `.btn-outline`, `.btn-white`
- **Inputs**: `.input`
- **Hero**: `.hero-purple`
- **Timeline**: `.timeline-container`, `.timeline-step`
- **Badges**: `.badge`, `.badge-success`, `.badge-warning`

### **Responsividade:**
- Mobile: < 768px (1 coluna)
- Tablet: 768px - 1199px (2 colunas)
- Desktop: ≥ 1200px (4 colunas)

---

## 📡 **API ENDPOINTS**

### **Clínicas:**
- `POST /clinics/register` - Cadastrar clínica
- `GET /clinics` - Listar clínicas
- `GET /clinics/:id` - Detalhes da clínica

### **Veterinários:**
- `POST /vets/register` - Cadastrar veterinário
- `GET /vets` - Listar veterinários
- `GET /vets/:id` - Detalhes do veterinário

### **Demandas:**
- `POST /demands/create` - Criar demanda (requer autenticação)
- `GET /demands` - Listar todas as demandas
- `GET /demands/open` - Listar demandas abertas
- `GET /demands/:id` - Detalhes da demanda
- `PUT /demands/:id` - Atualizar demanda

### **Candidaturas:**
- `POST /applications/apply` - Candidatar-se a demanda
- `GET /applications/demand/:demandId` - Candidatos de uma demanda
- `GET /applications/vet/:vetId` - Candidaturas de um veterinário
- `PUT /applications/:id` - Atualizar status da candidatura

---

## ⚠️ **VALIDAÇÕES E REGRAS**

### **Cadastro de Clínica:**
- ✅ Nome: obrigatório, mín 3 caracteres
- ✅ CNPJ: obrigatório, formato XX.XXX.XXX/XXXX-XX, único
- ✅ Endereço: obrigatório
- ✅ Email: obrigatório, formato válido, único
- ✅ Senha: obrigatório, mín 6 caracteres

### **Cadastro de Veterinário:**
- ✅ Nome: obrigatório, mín 3 caracteres
- ✅ CRMV: obrigatório, formato XXXXX-UF, único
- ✅ Especialidades: obrigatório, array com ao menos 1 item
- ✅ Experiência: obrigatório
- ✅ Email: obrigatório, formato válido, único
- ✅ Senha: obrigatório, mín 6 caracteres

### **Criação de Demanda:**
- ✅ Título: obrigatório, mín 5 caracteres
- ✅ Descrição: obrigatório, mín 20 caracteres
- ✅ Pagamento: opcional, valor numérico positivo
- ✅ Clinic_id: obrigatório, deve existir

### **Candidatura:**
- ✅ Demand_id: obrigatório, demanda deve estar 'open'
- ✅ Vet_id: obrigatório, deve existir
- ✅ Não pode haver duplicata (demand_id + vet_id)

---

## 🚀 **FEATURES FUTURAS (Backlog)**

### **Fase 2:**
- [ ] Sistema de notificações (email/push)
- [ ] Chat entre clínica e veterinário
- [ ] Avaliações e reviews
- [ ] Dashboard com métricas
- [ ] Filtros avançados de demandas (localização, especialidade)
- [ ] Sistema de favoritos

### **Fase 3:**
- [ ] Pagamento integrado (Stripe/MercadoPago)
- [ ] Calendário de disponibilidade
- [ ] Histórico de trabalhos
- [ ] Certificados digitais
- [ ] App mobile nativo (iOS/Android)

---

## 📱 **PÁGINAS DO APLICATIVO**

### **Páginas Públicas:**
1. **HomePage** (`/`)
   - Hero section com título e CTAs
   - Cards: Cadastrar Clínica, Cadastrar Veterinário, Ver Demandas, Login
   - Seção "Como funciona?" com timeline
   - Footer com links e contato

2. **LoginPage** (`/login`)
   - Formulário: Email + Senha
   - Botão "Entrar"
   - Link para voltar ao início

3. **ClinicSignUpPage** (`/clinic-signup`)
   - Formulário: Nome, CNPJ, Endereço, Email, Senha
   - Layout 2 colunas em desktop
   - Botão "Criar conta da clínica"

4. **VetSignUpPage** (`/vet-signup`)
   - Formulário: Nome, CRMV, Especialidades, Experiência, Email, Senha
   - Layout 2 colunas em desktop
   - Botão "Criar conta de veterinário"

### **Páginas Autenticadas:**
5. **DemandsPage** (`/demands`)
   - Lista de demandas abertas
   - Cards com: título, descrição, clínica, pagamento, data
   - Badge de status
   - Botão "Ver detalhes" / "Candidatar-se"

---

## 🔧 **CONFIGURAÇÃO E AMBIENTE**

### **Backend:**
- Porta: 3000
- URL base: `http://localhost:3000`
- Estrutura:
  ```
  backend/
  ├── src/
  │   ├── controllers/
  │   ├── routes/
  │   ├── config/
  │   └── index.ts
  ```

### **Frontend:**
- Porta: 3001
- URL base: `http://localhost:3001`
- Estrutura:
  ```
  frontend/
  ├── src/
  │   ├── pages/
  │   ├── services/
  │   ├── styles/
  │   ├── App.tsx
  │   └── App.css
  ```

### **Variáveis de Ambiente:**
```env
# Backend
PORT=3000
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key

# Frontend
REACT_APP_API_URL=http://localhost:3000
```

---

## 📝 **CONVENÇÕES DE CÓDIGO**

### **Nomenclatura:**
- **Componentes**: PascalCase (ex: `HomePage`, `LoginPage`)
- **Funções**: camelCase (ex: `handleLogin`, `createDemand`)
- **Variáveis**: camelCase (ex: `userData`, `demandList`)
- **Constantes**: UPPER_SNAKE_CASE (ex: `API_BASE_URL`)
- **CSS Classes**: kebab-case ou BEM (ex: `.modern-card`, `.btn-primary`)

### **Organização de Arquivos:**
- Controllers: `nameController.ts`
- Routes: `name.ts` (plural quando possível)
- Pages: `NamePage.tsx`
- Services: `nameApi.ts`

### **Commits:**
- Usar mensagens descritivas em português
- Formato: "feat: adiciona autenticação de usuário"
- Tipos: feat, fix, docs, style, refactor, test, chore

---

## 🎓 **GLOSSÁRIO**

- **Clínica**: Estabelecimento veterinário que busca profissionais
- **Veterinário**: Profissional de medicina veterinária
- **Demanda**: Oportunidade de trabalho temporário/freelance
- **Candidatura**: Application de um veterinário a uma demanda
- **CRMV**: Conselho Regional de Medicina Veterinária (registro profissional)
- **CNPJ**: Cadastro Nacional de Pessoa Jurídica (registro da empresa)
- **RLS**: Row Level Security (segurança em nível de linha no Supabase)
- **UUID**: Universal Unique Identifier (identificador único)

---

**Última atualização**: 2025-01-23
**Versão**: 1.0.0
**Status**: Em Desenvolvimento 🚧
```

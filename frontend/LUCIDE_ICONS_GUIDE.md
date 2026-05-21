# Guia de Uso - Lucide Icons

A biblioteca Lucide React foi integrada ao projeto PetMi Vet para fornecer ícones modernos e consistentes.

## 📦 Instalação

✅ Já instalado via: `npm install lucide-react --legacy-peer-deps`

## 🎨 Como Usar

### Importação Básica

```tsx
import { Icon1, Icon2, Icon3 } from 'lucide-react';
```

### Exemplos de Ícones Comuns

```tsx
import { 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  User, 
  Phone, 
  MapPin, 
  Building,
  Calendar,
  Clock,
  Search,
  Filter,
  Plus,
  Edit,
  Trash2,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Menu,
  Settings,
  LogOut,
  Home,
  FileText,
  Briefcase,
  Heart,
  Star,
  AlertCircle,
  Info,
  CheckCircle,
  XCircle
} from 'lucide-react';
```

### Uso em Componentes

```tsx
import { Mail, Lock } from 'lucide-react';

function LoginForm() {
  return (
    <div>
      <label>
        <Mail size={18} className="inline-block mr-2" />
        Email
      </label>
      
      <label>
        <Lock size={18} className="inline-block mr-2" />
        Senha
      </label>
    </div>
  );
}
```

### Personalização

#### Tamanho
```tsx
<Mail size={16} />  {/* Pequeno */}
<Mail size={24} />  {/* Médio */}
<Mail size={32} />  {/* Grande */}
```

#### Cor
```tsx
<Mail color="#7c3aed" />
<Mail style={{ color: '#7c3aed' }} />
<Mail className="text-primary-600" />
```

#### Stroke Width (Espessura)
```tsx
<Mail strokeWidth={1.5} />  {/* Fino */}
<Mail strokeWidth={2} />    {/* Normal (padrão) */}
<Mail strokeWidth={2.5} />  {/* Grosso */}
```

## 🎯 Ícones Recomendados para PetMi Vet

### Autenticação
- `Mail` - Email
- `Lock` - Senha
- `Eye` / `EyeOff` - Toggle senha
- `User` - Perfil de usuário
- `LogIn` / `LogOut` - Login/Logout

### Navegação
- `Home` - Página inicial
- `Menu` - Menu hamburger
- `ChevronLeft/Right/Up/Down` - Setas de navegação
- `ArrowLeft` - Voltar

### Ações
- `Plus` - Adicionar
- `Edit` / `Edit3` - Editar
- `Trash2` - Deletar
- `Save` - Salvar
- `X` - Fechar
- `Check` - Confirmar
- `Search` - Buscar
- `Filter` - Filtrar

### Status
- `CheckCircle` - Sucesso
- `XCircle` - Erro
- `AlertCircle` - Aviso
- `Info` - Informação
- `Clock` - Pendente

### Veterinária/Pets
- `Heart` - Favoritos/Curtir
- `Star` - Avaliação
- `MapPin` - Localização
- `Building` / `Building2` - Clínica
- `Briefcase` - Trabalho/Demanda
- `Calendar` - Agendamento
- `FileText` - Documentos

### Comunicação
- `MessageSquare` - Mensagens
- `Bell` - Notificações
- `Phone` - Telefone
- `Mail` - Email

## 📝 Exemplo Real - LoginPage

```tsx
import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';

const LoginPage = () => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form>
      {/* Campo de Email com Ícone */}
      <div>
        <label className="flex items-center gap-2">
          <Mail size={18} className="text-primary-600" />
          Email
        </label>
        <input type="email" />
      </div>

      {/* Campo de Senha com Toggle */}
      <div>
        <label className="flex items-center gap-2">
          <Lock size={18} className="text-primary-600" />
          Senha
        </label>
        <div className="relative">
          <input 
            type={showPassword ? "text" : "password"} 
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2"
          >
            {showPassword ? (
              <EyeOff size={20} className="text-neutral-500" />
            ) : (
              <Eye size={20} className="text-neutral-500" />
            )}
          </button>
        </div>
      </div>
    </form>
  );
};
```

## 🔗 Links Úteis

- [Documentação Oficial](https://lucide.dev/)
- [Galeria de Ícones](https://lucide.dev/icons/)
- [GitHub](https://github.com/lucide-icons/lucide)

## 💡 Dicas

1. **Consistência**: Use o mesmo tamanho de ícone para elementos similares
2. **Acessibilidade**: Adicione `aria-label` quando o ícone for o único conteúdo
3. **Performance**: Importe apenas os ícones que você usa
4. **Cores**: Use as cores do design system PetMi Vet para manter consistência


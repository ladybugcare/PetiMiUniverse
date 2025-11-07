import React from 'react';
import {
  // Autenticação & Usuário
  Mail, Lock, Eye, EyeOff, User, LogIn, LogOut, UserPlus,
  
  // Navegação
  Home, Menu, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  ArrowLeft, ArrowRight, MoreVertical, MoreHorizontal,
  
  // Ações
  Plus, Edit, Edit3, Trash2, Save, X, Check, Search, Filter,
  Download, Upload, Copy, Share2, ExternalLink,
  
  // Status & Feedback
  CheckCircle, XCircle, AlertCircle, Info, AlertTriangle,
  Clock, Loader, RefreshCw,
  
  // Veterinária & Pets
  Heart, Star, MapPin, Building, Building2, Briefcase,
  Calendar, FileText, Clipboard, ClipboardList, File,
  
  // Comunicação
  MessageSquare, Bell, Phone, Send, MessageCircle,
  
  // Configurações & Sistema
  Settings, Sliders, Wrench, Database, Server,
  
  // Mídia
  Image, Camera, Video, Paperclip, FileImage,
  
  // Outros úteis
  DollarSign, CreditCard, TrendingUp, BarChart2, PieChart,
  Users, UserCheck, Shield, Award, Target,
} from 'lucide-react';
import colors from '../styles/colors';

/**
 * Página de exemplo mostrando todos os ícones Lucide disponíveis
 * e como usá-los no projeto PetiVet
 */
const LucideIconsExample: React.FC = () => {
  const iconStyle = {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '8px',
    padding: '16px',
    backgroundColor: colors.surface,
    borderRadius: '8px',
    border: `1px solid ${colors.border}`,
    minWidth: '120px',
  };

  const sectionStyle = {
    marginBottom: '40px',
  };

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
    gap: '16px',
    marginTop: '16px',
  };

  const IconCard = ({ icon: Icon, name }: { icon: any; name: string }) => (
    <div style={iconStyle}>
<<<<<<< HEAD
      <Icon size={24} color={colors.primary} />
=======
            <Icon size={24} color={colors.primary} />
>>>>>>> c05ee3cbec49f0605ebe1b5c5ff44929457fde77
      <span style={{ fontSize: '12px', color: colors.textSecondary, textAlign: 'center' }}>
        {name}
      </span>
    </div>
  );

  return (
    <div style={{ padding: '40px', backgroundColor: colors.background, minHeight: '100vh' }}>
      <h1 style={{ fontSize: '32px', fontWeight: '700', marginBottom: '16px', color: colors.text }}>
        Lucide Icons - PetiVet
      </h1>
      <p style={{ color: colors.textSecondary, marginBottom: '40px' }}>
        Biblioteca de ícones integrada ao projeto. Clique nos ícones abaixo para ver o código de importação.
      </p>

      {/* Autenticação & Usuário */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '16px', color: colors.text }}>
          Autenticação & Usuário
        </h2>
        <div style={gridStyle}>
          <IconCard icon={Mail} name="Mail" />
          <IconCard icon={Lock} name="Lock" />
          <IconCard icon={Eye} name="Eye" />
          <IconCard icon={EyeOff} name="EyeOff" />
          <IconCard icon={User} name="User" />
          <IconCard icon={LogIn} name="LogIn" />
          <IconCard icon={LogOut} name="LogOut" />
          <IconCard icon={UserPlus} name="UserPlus" />
        </div>
      </div>

      {/* Navegação */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '16px', color: colors.text }}>
          Navegação
        </h2>
        <div style={gridStyle}>
          <IconCard icon={Home} name="Home" />
          <IconCard icon={Menu} name="Menu" />
          <IconCard icon={ChevronLeft} name="ChevronLeft" />
          <IconCard icon={ChevronRight} name="ChevronRight" />
          <IconCard icon={ChevronDown} name="ChevronDown" />
          <IconCard icon={ChevronUp} name="ChevronUp" />
          <IconCard icon={ArrowLeft} name="ArrowLeft" />
          <IconCard icon={ArrowRight} name="ArrowRight" />
          <IconCard icon={MoreVertical} name="MoreVertical" />
          <IconCard icon={MoreHorizontal} name="MoreHorizontal" />
        </div>
      </div>

      {/* Ações */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '16px', color: colors.text }}>
          Ações
        </h2>
        <div style={gridStyle}>
          <IconCard icon={Plus} name="Plus" />
          <IconCard icon={Edit} name="Edit" />
          <IconCard icon={Edit3} name="Edit3" />
          <IconCard icon={Trash2} name="Trash2" />
          <IconCard icon={Save} name="Save" />
          <IconCard icon={X} name="X" />
          <IconCard icon={Check} name="Check" />
          <IconCard icon={Search} name="Search" />
          <IconCard icon={Filter} name="Filter" />
          <IconCard icon={Download} name="Download" />
          <IconCard icon={Upload} name="Upload" />
          <IconCard icon={Copy} name="Copy" />
          <IconCard icon={Share2} name="Share2" />
          <IconCard icon={ExternalLink} name="ExternalLink" />
        </div>
      </div>

      {/* Status & Feedback */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '16px', color: colors.text }}>
          Status & Feedback
        </h2>
        <div style={gridStyle}>
          <IconCard icon={CheckCircle} name="CheckCircle" />
          <IconCard icon={XCircle} name="XCircle" />
          <IconCard icon={AlertCircle} name="AlertCircle" />
          <IconCard icon={Info} name="Info" />
          <IconCard icon={AlertTriangle} name="AlertTriangle" />
          <IconCard icon={Clock} name="Clock" />
          <IconCard icon={Loader} name="Loader" />
          <IconCard icon={RefreshCw} name="RefreshCw" />
        </div>
      </div>

      {/* Veterinária & Pets */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '16px', color: colors.text }}>
          Veterinária & Pets
        </h2>
        <div style={gridStyle}>
          <IconCard icon={Heart} name="Heart" />
          <IconCard icon={Star} name="Star" />
          <IconCard icon={MapPin} name="MapPin" />
          <IconCard icon={Building} name="Building" />
          <IconCard icon={Building2} name="Building2" />
          <IconCard icon={Briefcase} name="Briefcase" />
          <IconCard icon={Calendar} name="Calendar" />
          <IconCard icon={FileText} name="FileText" />
          <IconCard icon={Clipboard} name="Clipboard" />
          <IconCard icon={ClipboardList} name="ClipboardList" />
          <IconCard icon={File} name="File" />
        </div>
      </div>

      {/* Comunicação */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '16px', color: colors.text }}>
          Comunicação
        </h2>
        <div style={gridStyle}>
          <IconCard icon={MessageSquare} name="MessageSquare" />
          <IconCard icon={Bell} name="Bell" />
          <IconCard icon={Phone} name="Phone" />
          <IconCard icon={Send} name="Send" />
          <IconCard icon={MessageCircle} name="MessageCircle" />
        </div>
      </div>

      {/* Configurações & Sistema */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '16px', color: colors.text }}>
          Configurações & Sistema
        </h2>
        <div style={gridStyle}>
          <IconCard icon={Settings} name="Settings" />
          <IconCard icon={Sliders} name="Sliders" />
          <IconCard icon={Wrench} name="Wrench" />
          <IconCard icon={Database} name="Database" />
          <IconCard icon={Server} name="Server" />
        </div>
      </div>

      {/* Business & Dados */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '16px', color: colors.text }}>
          Business & Dados
        </h2>
        <div style={gridStyle}>
          <IconCard icon={DollarSign} name="DollarSign" />
          <IconCard icon={CreditCard} name="CreditCard" />
          <IconCard icon={TrendingUp} name="TrendingUp" />
          <IconCard icon={BarChart2} name="BarChart2" />
          <IconCard icon={PieChart} name="PieChart" />
          <IconCard icon={Users} name="Users" />
          <IconCard icon={UserCheck} name="UserCheck" />
          <IconCard icon={Shield} name="Shield" />
          <IconCard icon={Award} name="Award" />
          <IconCard icon={Target} name="Target" />
        </div>
      </div>

      {/* Exemplo de Código */}
      <div style={{
        backgroundColor: colors.neutral[900],
        color: colors.surface,
        padding: '24px',
        borderRadius: '8px',
        marginTop: '40px',
      }}>
        <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>
          💻 Exemplo de Código
        </h3>
        <pre style={{ overflow: 'auto', fontSize: '14px', lineHeight: '1.6' }}>
{`import { Mail, Lock, Eye, Plus } from 'lucide-react';

// Uso básico
<Mail size={24} color="#7c3aed" />

// Com estilo inline
<Lock size={20} style={{ color: '#7c3aed' }} />

// Com className (Tailwind)
<Eye size={18} className="text-primary-600" />

// Em botões
<button>
<<<<<<< HEAD
  <Plus size={18} />
=======
    <Plus size={18} />
>>>>>>> c05ee3cbec49f0605ebe1b5c5ff44929457fde77
  Adicionar
</button>`}
        </pre>
      </div>
    </div>
  );
};

export default LucideIconsExample;


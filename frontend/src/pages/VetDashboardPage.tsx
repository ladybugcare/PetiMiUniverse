import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import LoadingOverlay from '../components/LoadingOverlay';
import FloatingActionButton from '../components/FloatingActionButton';
import {
  ClipboardList,
  FileText,
  MessageSquare,
  Star,
  ShoppingCart,
  Clock,
  CheckCircle,
  Bell,
  Lock,
  Smartphone,
  Globe,
  AlertCircle,
  ChevronRight,
  CalendarDays,
  MapPin,
  Users,
  DollarSign,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import IconWrapper from '../components/IconWrapper';
import { useAuth } from '../AuthContext';
import { getUserRole, getDashboardPathForRole } from '../utils/authHelpers';
import colors from '../styles/colors';
import { useSidebarMenu } from '../hooks/useSidebarMenu';
import type { VetStats } from '../services/statisticsApi';
import type { Notification } from '../services/notificationsApi';

function getTimeOfDayGreeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Bom dia';
  if (h >= 12 && h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function isSameLocalCalendarDay(iso: string, ref: Date = new Date()): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

function formatRelativeActivityTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startThat = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startToday.getTime() - startThat.getTime()) / (24 * 60 * 60 * 1000));
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 0) return `Hoje, ${time}`;
  if (diffDays === 1) return `Ontem, ${time}`;
  return d.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const VetDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [activeSection, setActiveSection] = useState('resumo');
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [vetStatus, setVetStatus] = useState<{
    needsOnboarding?: boolean;
    isApproved?: boolean;
    approvalStatus?: string;
  } | null>(null);

  // Check authentication and vet status
  useEffect(() => {
    // Aguardar carregamento da autenticação
    if (authLoading) return;
    
    // Se não há usuário, redirecionar para login
    if (!user) {
      navigate('/login', { replace: true });
      setCheckingAuth(false);
      return;
    }
    
    // Usar getUserRole() para detecção robusta da role
    const userRole = getUserRole(user);
    
    // Se não for VET, redirecionar para dashboard apropriado
    if (userRole !== 'VET') {
      const dashboardPath = getDashboardPathForRole(userRole);
      console.log('[VetDashboardPage] Usuário não é VET, redirecionando para:', dashboardPath);
      navigate(dashboardPath, { replace: true });
      setCheckingAuth(false);
      return;
    }

    // Verificar status do vet do localStorage (vem do login)
    const vetOnboardingStr = localStorage.getItem('vetOnboarding');
    if (vetOnboardingStr && vetOnboardingStr.trim() !== '') {
      try {
        const vetOnboarding = JSON.parse(vetOnboardingStr);
        
        // REGRA CRÍTICA: Se onboarding já foi completado, NUNCA redirecionar para onboarding
        if (vetOnboarding.onboardingCompleted === true) {
          setVetStatus({
            needsOnboarding: false, // Forçar false se já completou
            isApproved: vetOnboarding.isApproved ?? false,
            approvalStatus: vetOnboarding.approvalStatus ?? 'pending',
          });
          // Não redirecionar, permitir acesso ao dashboard
        } else {
          setVetStatus({
            needsOnboarding: vetOnboarding.needsOnboarding ?? true,
            isApproved: vetOnboarding.isApproved ?? false,
            approvalStatus: vetOnboarding.approvalStatus ?? 'pending',
          });

          // Se precisa completar onboarding, redirecionar
          if (vetOnboarding.needsOnboarding !== false) {
            navigate('/vet-onboarding', { replace: true });
            return;
          }
        }
      } catch (e) {
        console.error('Erro ao parsear vetOnboarding:', e);
        // Se der erro, verificar no backend antes de redirecionar
        // Por enquanto, assumir que precisa fazer onboarding
        navigate('/vet-onboarding', { replace: true });
        return;
      }
    } else {
      // Se não tem dados no localStorage, verificar no backend antes de redirecionar
      // Por enquanto, redirecionar para onboarding
      navigate('/vet-onboarding', { replace: true });
      return;
    }
    
    setCheckingAuth(false);
  }, [navigate, user, authLoading]);

  // Verificar se está aprovado
  const isApproved = vetStatus?.isApproved ?? false;

  // Floating Action Button options
  const fabOptions = [
    {
      id: 'view-demands',
      label: 'Ver Demandas',
      icon: <IconWrapper icon={ClipboardList} size={20} color="#ffffff" />,
      path: isApproved ? '/demands' : undefined,
      color: colors.brand.primary[500],
      disabled: !isApproved,
    },
    {
      id: 'create-listing',
      label: 'Criar Anúncio',
      icon: <IconWrapper icon={ShoppingCart} size={20} color="#ffffff" />,
      path: '/marketplace/create',
      color: '#10b981',
    },
  ];

  // Get menu items using hook
  const userRole = getUserRole(user);
  const { menuItems: baseMenuItems } = useSidebarMenu(userRole);
  
  // Filtrar itens desabilitados baseado em aprovação
  const menuItems = baseMenuItems.map((item) => {
    if (item.id === 'demands' && !isApproved && item.subItems?.length) {
      const pendingTooltip =
        'Disponível após aprovação do seu cadastro pela equipe PetMi.';
      return {
        ...item,
        subItems: item.subItems.map((subItem) => {
          if (subItem.id === 'demands-available' || subItem.id === 'demands-applications') {
            return { ...subItem, disabled: true, tooltip: pendingTooltip };
          }
          return subItem;
        }),
      };
    }
    return item;
  });

  const renderContent = () => {
    switch (activeSection) {
      case 'resumo':
        return <ResumoSection isApproved={isApproved} />;
      case 'mensagens':
        return <MensagensSection />;
      case 'avaliacoes':
        return <AvaliacoesSection />;
      case 'configuracoes':
        return <ConfiguracoesSection />;
      default:
        return <ResumoSection isApproved={isApproved} />;
    }
  };

  // Mostrar aviso se não estiver aprovado
  const renderApprovalWarning = () => {
    if (isApproved || checkingAuth) return null;

    const approvalStatus = vetStatus?.approvalStatus;
    let message = '';
    let title = '';

    if (approvalStatus === 'pending_approval') {
      title = 'Cadastro em Análise';
      message = 'Seu cadastro está em análise pela nossa equipe. Você receberá um e-mail assim que for aprovado. Enquanto isso, você pode explorar o marketplace.';
    } else if (approvalStatus === 'rejected') {
      title = 'Cadastro Rejeitado';
      message = 'Seu cadastro foi rejeitado. Verifique seu e-mail para mais informações ou entre em contato com o suporte.';
    } else {
      title = 'Aguardando Aprovação';
      message = 'Seu cadastro precisa ser aprovado antes de você poder ver e se candidatar às demandas.';
    }

    return (
      <div style={styles.warningBanner}>
        <div style={styles.warningContent}>
          <AlertCircle size={24} style={styles.warningIcon} />
          <div style={styles.warningText}>
            <strong style={styles.warningTitle}>{title}</strong>
            <p style={styles.warningMessage}>{message}</p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <DashboardLayout
        pageName="Dashboard do Veterinário"
        menuItems={menuItems}
        activeSection={activeSection}
        onSectionChange={setActiveSection}
      >
        <div style={styles.container}>
          {renderApprovalWarning()}
          {renderContent()}
        </div>
      </DashboardLayout>
      <FloatingActionButton options={fabOptions} />
      <LoadingOverlay visible={checkingAuth} />
    </>
  );
};

function unwrapSingle<T>(rel: T | T[] | null | undefined): T | undefined {
  if (rel == null) return undefined;
  return Array.isArray(rel) ? rel[0] : rel;
}

// Section Components
type ClinicInfo = { name: string; address: string };

type VetPositionApplicationRow = {
  id: string;
  status: string;
  created_at: string;
  demand_positions?: {
    specialty?: string;
    total_slots?: number;
    filled_slots?: number;
    demands?: {
      id: string;
      title: string;
      demand_date: string;
      start_time: string;
      clinic_id: string;
    };
  };
};

function activityVisualForNotification(n: Notification): {
  Icon: LucideIcon;
  bg: string;
  fg: string;
} {
  switch (n.type) {
    case 'application_accepted':
      return { Icon: CheckCircle, bg: '#dcfce7', fg: '#15803d' };
    case 'application_rejected':
      return { Icon: ClipboardList, bg: '#fee2e2', fg: '#b91c1c' };
    case 'demand_status_changed':
      return { Icon: CalendarDays, bg: '#dbeafe', fg: '#1d4ed8' };
    case 'marketplace_message':
      return { Icon: MessageSquare, bg: '#f3e8ff', fg: '#7e22ce' };
    case 'new_demand_created':
      return { Icon: DollarSign, bg: '#ffedd5', fg: '#c2410c' };
    default:
      return { Icon: Bell, bg: '#e4e4e7', fg: '#52525b' };
  }
}

interface ResumoSectionProps {
  isApproved: boolean;
}

const ResumoSection = ({ isApproved }: ResumoSectionProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = React.useState<VetStats>({
    totalApplications: 0,
    activeJobs: 0,
    pendingApplications: 0,
    availableOpportunities: 0,
    completedJobs: 0,
    averageRating: 0,
  });
  const [vetApplications, setVetApplications] = React.useState<VetPositionApplicationRow[]>([]);
  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [clinics, setClinics] = React.useState<Map<string, ClinicInfo>>(new Map());
  const [loading, setLoading] = React.useState(true);

  const vetDisplayName =
    user?.user_metadata?.name ||
    user?.user_metadata?.full_name ||
    user?.email?.split('@')[0] ||
    'Veterinário';

  const { applicationsToday, acceptedDemandDatesToday } = useMemo(() => {
    let appToday = 0;
    let acceptedToday = 0;
    const today = new Date();
    for (const row of vetApplications) {
      if (row.created_at && isSameLocalCalendarDay(row.created_at, today)) {
        appToday += 1;
      }
      const pos = unwrapSingle(row.demand_positions as VetPositionApplicationRow['demand_positions'] | undefined);
      const demand = unwrapSingle(pos?.demands);
      if (
        row.status === 'accepted' &&
        demand?.demand_date &&
        isSameLocalCalendarDay(demand.demand_date, today)
      ) {
        acceptedToday += 1;
      }
    }
    return { applicationsToday: appToday, acceptedDemandDatesToday: acceptedToday };
  }, [vetApplications]);

  const upcomingDemands = useMemo(() => {
    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);
    const rows: Array<{
      id: string;
      applicationId: string;
      status: string;
      demandId: string;
      demandDate: string;
      startTime: string;
      clinicName: string;
      specialty: string;
      location: string;
      vacancies: number;
    }> = [];

    for (const row of vetApplications) {
      if (row.status !== 'accepted' && row.status !== 'pending') continue;
      const pos = unwrapSingle(row.demand_positions as VetPositionApplicationRow['demand_positions'] | undefined);
      const d = unwrapSingle(pos?.demands);
      if (!d?.demand_date || !d.id) continue;
      const demandDay = new Date(d.demand_date);
      demandDay.setHours(0, 0, 0, 0);
      if (demandDay.getTime() < startToday.getTime()) continue;

      const clinic = clinics.get(d.clinic_id);
      const slots = pos?.total_slots ?? 0;
      const filled = pos?.filled_slots ?? 0;
      const vacancies = Math.max(0, slots - filled);

      rows.push({
        id: `${row.id}-${d.id}`,
        applicationId: row.id,
        status: row.status,
        demandId: d.id,
        demandDate: d.demand_date,
        startTime: d.start_time || '',
        clinicName: clinic?.name || 'Clínica',
        specialty: pos?.specialty || d.title,
        location: clinic?.address || 'Local a combinar',
        vacancies: vacancies || slots || 1,
      });
    }

    rows.sort((a, b) => new Date(a.demandDate).getTime() - new Date(b.demandDate).getTime());
    return rows.slice(0, 4);
  }, [vetApplications, clinics]);

  React.useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const stored = JSON.parse(localStorage.getItem('user') || '{}');
        const vetId = stored.id;
        if (!vetId) return;

        const { statisticsApi } = await import('../services/statisticsApi');
        const { clinicsApi } = await import('../services/clinicsApi');
        const { demandPositionsApi } = await import('../services/demandPositionsApi');
        const { notificationsApi } = await import('../services/notificationsApi');

        const [vetStatsResult, clinicsResult, appsResult, notifResult] = await Promise.all([
          statisticsApi.getVetStats(vetId),
          clinicsApi.getAll().catch(() => ({ clinics: [] as { id: string; name: string; address?: string }[] })),
          demandPositionsApi.getVetApplications(vetId).catch(() => ({ applications: [] as VetPositionApplicationRow[] })),
          notificationsApi.getNotifications(vetId, 1, 8).catch(() => ({ notifications: [] as Notification[] })),
        ]);

        setStats(vetStatsResult.stats);
        setVetApplications(appsResult.applications || []);
        setNotifications(notifResult.notifications || []);

        const clinicsMap = new Map<string, ClinicInfo>();
        (clinicsResult.clinics || []).forEach((c: { id: string; name: string; address?: string }) => {
          clinicsMap.set(c.id, { name: c.name, address: c.address || '' });
        });
        setClinics(clinicsMap);
      } catch (error) {
        console.error('Error loading vet data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const greeting = getTimeOfDayGreeting();
  const primaryRed = colors.brand.primary[500];
  const accentBlue = '#2563eb';
  const accentGreen = '#16a34a';
  const accentOrange = '#ea580c';
  const accentPurple = '#9333ea';

  return (
    <div style={styles.vetResumoPage}>
      <section style={styles.vetHero} aria-labelledby="vet-dashboard-greeting">
        <div style={styles.vetHeroPaws} aria-hidden>
          {['12%', '28%', '48%', '68%', '82%'].map((left, i) => (
            <span key={i} style={{ ...styles.vetHeroPaw, left, top: `${18 + (i % 3) * 22}%` }}>
              🐾
            </span>
          ))}
        </div>
        <div style={styles.vetHeroInner}>
          <div>
            <h1 id="vet-dashboard-greeting" style={styles.vetHeroTitle}>
              {greeting}, Dr. {vetDisplayName}! 👋
            </h1>
            <p style={styles.vetHeroSubtitle}>Confira suas oportunidades e acompanhe seus trabalhos.</p>
          </div>
          {isApproved ? (
            <Link to="/demands" style={styles.vetHeroCta}>
              Ver oportunidades
            </Link>
          ) : (
            <span style={{ ...styles.vetHeroCta, opacity: 0.55, cursor: 'not-allowed' }} title="Disponível após aprovação do cadastro">
              Ver oportunidades
            </span>
          )}
        </div>
      </section>

      <div style={styles.vetResumoInner}>
        <div style={styles.vetStatRow}>
          <article style={styles.vetStatMini}>
            <div style={{ ...styles.vetStatIconCircle, backgroundColor: '#fee2e2' }}>
              <FileText size={22} color={primaryRed} strokeWidth={2} aria-hidden />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={styles.vetStatMiniLabel}>Candidaturas ativas</p>
              <p style={styles.vetStatMiniValue} aria-label={`Candidaturas ativas: ${stats.totalApplications}`}>
                {stats.totalApplications}
              </p>
              <p style={{ ...styles.vetStatMiniFooter, color: primaryRed }}>
                <TrendingUp size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} aria-hidden />
                {applicationsToday > 0 ? `${applicationsToday} novas hoje` : 'Nenhuma nova hoje'}
              </p>
            </div>
          </article>

          <article style={styles.vetStatMini}>
            <div style={{ ...styles.vetStatIconCircle, backgroundColor: '#dbeafe' }}>
              <Clock size={22} color={accentBlue} strokeWidth={2} aria-hidden />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={styles.vetStatMiniLabel}>Trabalhos em andamento</p>
              <p style={styles.vetStatMiniValue} aria-label={`Trabalhos em andamento: ${stats.activeJobs}`}>
                {stats.activeJobs}
              </p>
              <p style={{ ...styles.vetStatMiniFooter, color: accentBlue }}>
                <TrendingUp size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} aria-hidden />
                {acceptedDemandDatesToday > 0
                  ? `${acceptedDemandDatesToday} com data hoje`
                  : 'Nenhum agendado para hoje'}
              </p>
            </div>
          </article>

          <article style={styles.vetStatMini}>
            <div style={{ ...styles.vetStatIconCircle, backgroundColor: '#dcfce7' }}>
              <CheckCircle size={22} color={accentGreen} strokeWidth={2} aria-hidden />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={styles.vetStatMiniLabel}>Trabalhos concluídos</p>
              <p style={styles.vetStatMiniValue} aria-label={`Trabalhos concluídos: ${stats.completedJobs}`}>
                {stats.completedJobs}
              </p>
              <p style={{ ...styles.vetStatMiniFooter, color: accentGreen }}>
                <TrendingUp size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} aria-hidden />
                Total no histórico
              </p>
            </div>
          </article>

          <article style={styles.vetStatMini}>
            <div style={{ ...styles.vetStatIconCircle, backgroundColor: '#ffedd5' }}>
              <Star size={22} color={accentOrange} strokeWidth={2} aria-hidden />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={styles.vetStatMiniLabel}>Avaliação média</p>
              <p style={styles.vetStatMiniValue} aria-label={`Avaliação média: ${stats.averageRating.toFixed(1)}`}>
                {stats.averageRating > 0 ? stats.averageRating.toFixed(1) : '—'}
              </p>
              <p style={{ ...styles.vetStatMiniFooter, color: accentOrange }}>
                Baseado em dados consolidados
              </p>
            </div>
          </article>
        </div>

        <div style={styles.vetTwoCol}>
          <section style={styles.vetCard} aria-labelledby="upcoming-demands-heading">
            <div style={styles.vetCardHeader}>
              <h2 id="upcoming-demands-heading" style={styles.vetCardTitle}>
                Próximas demandas confirmadas
              </h2>
              <Link to="/my-applications" style={styles.vetCardLink}>
                Ver todas
              </Link>
            </div>
            {loading ? (
              <p style={styles.vetMuted}>Carregando…</p>
            ) : upcomingDemands.length === 0 ? (
              <p style={styles.vetMuted}>Nenhuma demanda futura com candidatura pendente ou aceita.</p>
            ) : (
              <ul style={styles.vetDemandList}>
                {upcomingDemands.map((row) => {
                  const d = new Date(row.demandDate);
                  const day = d.getDate().toString().padStart(2, '0');
                  const month = d
                    .toLocaleDateString('pt-BR', { month: 'short' })
                    .replace('.', '')
                    .toUpperCase();
                  const time = row.startTime ? row.startTime.substring(0, 5) : '—';
                  const confirmed = row.status === 'accepted';
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        style={styles.vetDemandRow}
                        onClick={() => navigate(`/demands/${row.demandId}`)}
                      >
                        <div style={styles.vetDemandDateBlock}>
                          <span style={styles.vetDemandDateDay}>{day}</span>
                          <span style={styles.vetDemandDateMonth}>{month}</span>
                        </div>
                        <div style={styles.vetDemandMain}>
                          <span style={styles.vetDemandTime}>{time}</span>
                          <p style={styles.vetDemandClinic}>{row.clinicName}</p>
                          <p style={styles.vetDemandSpec}>{row.specialty}</p>
                          <div style={styles.vetDemandMeta}>
                            <span style={styles.vetDemandMetaItem}>
                              <MapPin size={14} aria-hidden /> {row.location}
                            </span>
                            <span style={styles.vetDemandMetaItem}>
                              <Users size={14} aria-hidden /> {row.vacancies}{' '}
                              {row.vacancies === 1 ? 'vaga' : 'vagas'}
                            </span>
                          </div>
                        </div>
                        <div style={styles.vetDemandRight}>
                          <span
                            style={{
                              ...styles.vetStatusPill,
                              ...(confirmed ? styles.vetStatusConfirmado : styles.vetStatusPendente),
                            }}
                          >
                            {confirmed ? 'Confirmado' : 'Pendente'}
                          </span>
                          <ChevronRight size={20} color="#a3a3a3" aria-hidden />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div style={styles.vetCardFooterCenter}>
              <Link to="/my-applications" style={styles.vetFooterLink}>
                Ver todas as demandas &gt;
              </Link>
            </div>
          </section>

          <section style={styles.vetCard} aria-labelledby="recent-activity-heading">
            <div style={styles.vetCardHeader}>
              <h2 id="recent-activity-heading" style={styles.vetCardTitle}>
                Atividades recentes
              </h2>
              <Link to="/notifications" style={styles.vetCardLink}>
                Ver todas
              </Link>
            </div>
            {loading ? (
              <p style={styles.vetMuted}>Carregando…</p>
            ) : notifications.length === 0 ? (
              <p style={styles.vetMuted}>Sem notificações recentes.</p>
            ) : (
              <ul style={styles.vetActivityList}>
                {notifications.map((n) => {
                  const { Icon, bg, fg } = activityVisualForNotification(n);
                  return (
                    <li key={n.id} style={styles.vetActivityRow}>
                      <div style={{ ...styles.vetActivityIcon, backgroundColor: bg }}>
                        <Icon size={18} color={fg} strokeWidth={2} aria-hidden />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={styles.vetActivityTitle}>{n.title}</p>
                        <p style={styles.vetActivitySub}>{n.message}</p>
                      </div>
                      <time dateTime={n.created_at} style={styles.vetActivityTime}>
                        {formatRelativeActivityTime(n.created_at)}
                      </time>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <section style={styles.vetQuickSection} aria-labelledby="quick-access-heading">
          <h2 id="quick-access-heading" style={styles.vetQuickHeading}>
            Acesso rápido
          </h2>
          <div style={styles.vetQuickRow}>
            <Link to="/my-applications" style={{ ...styles.vetQuickCard, backgroundColor: '#fff1f2' }}>
              <div style={{ ...styles.vetQuickIconWrap, backgroundColor: '#ffe4e6' }}>
                <ClipboardList size={24} color={primaryRed} aria-hidden />
              </div>
              <div>
                <p style={styles.vetQuickTitle}>Minhas demandas</p>
                <p style={styles.vetQuickDesc}>Acompanhe todas as suas demandas</p>
              </div>
            </Link>
            <Link to="/my-applications" style={{ ...styles.vetQuickCard, backgroundColor: '#eff6ff' }}>
              <div style={{ ...styles.vetQuickIconWrap, backgroundColor: '#dbeafe' }}>
                <CalendarDays size={24} color={accentBlue} aria-hidden />
              </div>
              <div>
                <p style={styles.vetQuickTitle}>Minha agenda</p>
                <p style={styles.vetQuickDesc}>Veja seus próximos compromissos</p>
              </div>
            </Link>
            <Link to="/my-applications" style={{ ...styles.vetQuickCard, backgroundColor: '#f0fdf4' }}>
              <div style={{ ...styles.vetQuickIconWrap, backgroundColor: '#dcfce7' }}>
                <DollarSign size={24} color={accentGreen} aria-hidden />
              </div>
              <div>
                <p style={styles.vetQuickTitle}>Financeiro</p>
                <p style={styles.vetQuickDesc}>Visualize seus ganhos e pagamentos</p>
              </div>
            </Link>
            <Link to="/messages" style={{ ...styles.vetQuickCard, backgroundColor: '#faf5ff' }}>
              <div style={{ ...styles.vetQuickIconWrap, backgroundColor: '#f3e8ff' }}>
                <MessageSquare size={24} color={accentPurple} aria-hidden />
              </div>
              <div>
                <p style={styles.vetQuickTitle}>Mensagens</p>
                <p style={styles.vetQuickDesc}>Fale com as clínicas e suporte</p>
              </div>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
};

const MensagensSection: React.FC = () => (
  <div style={styles.section}>
    <h2 style={styles.sectionTitle}>Mensagens</h2>
    <div style={styles.messagesList}>
      <MessageCard
        sender="Clínica Vida Animal"
        message="Olá Dr(a)! Gostaríamos de discutir mais detalhes sobre a cirurgia agendada."
        time="Há 15 minutos"
        unread={true}
      />
      <MessageCard
        sender="Clínica Pet Care"
        message="Sua candidatura foi aprovada! Por favor, confirme sua disponibilidade."
        time="Há 1 hora"
        unread={true}
      />
      <MessageCard
        sender="Clínica São Francisco"
        message="Obrigado pelo excelente trabalho realizado!"
        time="Há 2 dias"
        unread={false}
      />
    </div>
  </div>
);

const AvaliacoesSection: React.FC = () => (
  <div style={styles.section}>
    <h2 style={styles.sectionTitle}>Minhas Avaliações</h2>
    <div style={styles.statsRow}>
      <div style={styles.statCard}>
        <span style={styles.statValue}>4.8</span>
        <span style={styles.statLabel}>Média Geral</span>
        <div style={styles.stars}>
          {[...Array(5)].map((_, i) => (
            <Star key={i} size={20} fill="#f59e0b" color="#f59e0b" />
          ))}
        </div>
      </div>
      <div style={styles.statCard}>
        <span style={styles.statValue}>42</span>
        <span style={styles.statLabel}>Total de Avaliações</span>
      </div>
      <div style={styles.statCard}>
        <span style={styles.statValue}>98%</span>
        <span style={styles.statLabel}>Recomendações</span>
      </div>
    </div>
    
    <div style={styles.reviewsList}>
      <ReviewCard
        reviewer="Clínica Vida Animal"
        rating={5}
        comment="Excelente profissional! Demonstrou grande conhecimento técnico e cuidado com os animais."
        date="20/10/2025"
      />
      <ReviewCard
        reviewer="Clínica Pet Care"
        rating={5}
        comment="Muito atencioso e competente. Recomendamos fortemente!"
        date="15/10/2025"
      />
      <ReviewCard
        reviewer="Clínica São Francisco"
        rating={4}
        comment="Bom profissional, pontual e dedicado ao trabalho."
        date="10/10/2025"
      />
    </div>
  </div>
);

const ConfiguracoesSection: React.FC = () => (
  <div style={styles.section}>
    <h2 style={styles.sectionTitle}>Configurações</h2>
    <div style={styles.settingsGrid}>
      <SettingCard
        icon={<IconWrapper icon={Bell} size={28} color={colors.brand.primary[500]} />}
        title="Notificações"
        description="Gerencie suas preferências de notificação"
      />
      <SettingCard
        icon={<IconWrapper icon={Lock} size={28} color={colors.brand.primary[500]} />}
        title="Privacidade"
        description="Controle quem pode ver seu perfil"
      />
      <SettingCard
        icon={<IconWrapper icon={Smartphone} size={28} color={colors.brand.primary[500]} />}
        title="Preferências"
        description="Personalize sua experiência"
      />
      <SettingCard
        icon={<IconWrapper icon={Globe} size={28} color={colors.brand.primary[500]} />}
        title="Idioma"
        description="Português (Brasil)"
      />
    </div>
  </div>
);

interface MessageCardProps {
  sender: string;
  message: string;
  time: string;
  unread: boolean;
}

const MessageCard: React.FC<MessageCardProps> = ({ sender, message, time, unread }) => (
  <div style={{ ...styles.messageCard, backgroundColor: unread ? '#f0f9ff' : '#ffffff' }}>
    <div style={styles.messageHeader}>
      <h4 style={styles.messageSender}>{sender}</h4>
      <span style={styles.messageTime}>{time}</span>
    </div>
    <p style={styles.messageText}>{message}</p>
    {unread && <span style={styles.unreadBadge}>Nova</span>}
  </div>
);

interface ReviewCardProps {
  reviewer: string;
  rating: number;
  comment: string;
  date: string;
}

const ReviewCard: React.FC<ReviewCardProps> = ({ reviewer, rating, comment, date }) => (
  <div style={styles.reviewCard}>
    <div style={styles.reviewHeader}>
      <h4 style={styles.reviewerName}>{reviewer}</h4>
      <div style={styles.rating}>
        {[...Array(rating)].map((_, i) => (
          <Star key={i} size={16} fill="#f59e0b" color="#f59e0b" />
        ))}
      </div>
    </div>
    <p style={styles.reviewComment}>{comment}</p>
    <span style={styles.reviewDate}>{date}</span>
  </div>
);

interface SettingCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const SettingCard: React.FC<SettingCardProps> = ({ icon, title, description }) => (
  <div style={styles.settingCard}>
    <div style={styles.settingIcon}>{icon}</div>
    <h4 style={styles.settingTitle}>{title}</h4>
    <p style={styles.settingDescription}>{description}</p>
  </div>
);

// Styles
const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '0',
    maxWidth: '1200px',
    margin: '0 auto',
    backgroundColor: '#f4f4f5',
    minHeight: '100%',
  },
  vetResumoPage: {
    fontFamily: 'Inter, system-ui, sans-serif',
    color: '#262626',
  },
  vetResumoInner: {
    padding: '24px 20px 40px',
  },
  vetHero: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#fce7f3',
    borderRadius: '16px',
    marginBottom: '24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  vetHeroPaws: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none' as const,
  },
  vetHeroPaw: {
    position: 'absolute',
    fontSize: '22px',
    opacity: 0.12,
    transform: 'rotate(-18deg)',
  },
  vetHeroInner: {
    position: 'relative',
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '20px',
    padding: '28px 28px',
  },
  vetHeroTitle: {
    fontFamily: 'Poppins, system-ui, sans-serif',
    fontSize: 'clamp(1.35rem, 2.5vw, 1.85rem)',
    fontWeight: 700,
    margin: 0,
    color: '#1f2937',
    lineHeight: 1.25,
  },
  vetHeroSubtitle: {
    margin: '10px 0 0',
    fontSize: '15px',
    color: '#52525b',
    maxWidth: '520px',
    lineHeight: 1.45,
  },
  vetHeroCta: {
    display: 'inline-block',
    padding: '12px 22px',
    borderRadius: '12px',
    backgroundColor: colors.brand.primary[500],
    color: '#ffffff',
    fontWeight: 600,
    fontSize: '15px',
    textDecoration: 'none',
    boxShadow: '0 2px 8px rgba(196, 108, 106, 0.35)',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'center' as const,
  },
  vetStatRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '24px',
  },
  vetStatMini: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '14px',
    backgroundColor: '#ffffff',
    borderRadius: '14px',
    padding: '18px 16px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    border: '1px solid #f4f4f5',
  },
  vetStatIconCircle: {
    width: '48px',
    height: '48px',
    borderRadius: '999px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  vetStatMiniLabel: {
    margin: 0,
    fontSize: '13px',
    color: '#737373',
    fontWeight: 500,
  },
  vetStatMiniValue: {
    margin: '6px 0 4px',
    fontSize: '28px',
    fontWeight: 700,
    fontFamily: 'Poppins, system-ui, sans-serif',
    color: '#171717',
    lineHeight: 1,
  },
  vetStatMiniFooter: {
    margin: 0,
    fontSize: '12px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
  },
  vetTwoCol: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '20px',
    marginBottom: '28px',
    alignItems: 'start',
  },
  vetCard: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '20px 20px 16px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    border: '1px solid #f4f4f5',
  },
  vetCardHeader: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '12px',
    marginBottom: '16px',
  },
  vetCardTitle: {
    margin: 0,
    fontSize: '17px',
    fontWeight: 700,
    fontFamily: 'Poppins, system-ui, sans-serif',
    color: '#262626',
  },
  vetCardLink: {
    fontSize: '13px',
    fontWeight: 600,
    color: colors.brand.primary[500],
    textDecoration: 'none',
    whiteSpace: 'nowrap' as const,
  },
  vetMuted: {
    color: '#737373',
    fontSize: '14px',
    margin: '8px 0',
  },
  vetDemandList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  vetDemandRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    width: '100%',
    textAlign: 'left' as const,
    padding: '12px 10px',
    borderRadius: '12px',
    border: '1px solid #f4f4f5',
    backgroundColor: '#fafafa',
    cursor: 'pointer',
    font: 'inherit',
    color: 'inherit',
  },
  vetDemandDateBlock: {
    flexShrink: 0,
    width: '52px',
    borderRadius: '10px',
    backgroundColor: '#fff1f2',
    color: colors.brand.primary[600],
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px 4px',
  },
  vetDemandDateDay: {
    fontSize: '20px',
    fontWeight: 800,
    lineHeight: 1,
  },
  vetDemandDateMonth: {
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.04em',
    marginTop: '4px',
  },
  vetDemandMain: {
    flex: 1,
    minWidth: 0,
  },
  vetDemandTime: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#52525b',
  },
  vetDemandClinic: {
    margin: '4px 0 0',
    fontSize: '15px',
    fontWeight: 700,
    color: '#171717',
  },
  vetDemandSpec: {
    margin: '2px 0 6px',
    fontSize: '13px',
    color: '#737373',
  },
  vetDemandMeta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    fontSize: '12px',
    color: '#737373',
  },
  vetDemandMetaItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
  },
  vetDemandRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexShrink: 0,
  },
  vetStatusPill: {
    fontSize: '11px',
    fontWeight: 700,
    padding: '5px 10px',
    borderRadius: '999px',
    whiteSpace: 'nowrap' as const,
  },
  vetStatusConfirmado: {
    backgroundColor: '#dcfce7',
    color: '#166534',
  },
  vetStatusPendente: {
    backgroundColor: '#e0f2fe',
    color: '#0369a1',
  },
  vetCardFooterCenter: {
    textAlign: 'center' as const,
    paddingTop: '14px',
    marginTop: '8px',
    borderTop: '1px solid #f4f4f5',
  },
  vetFooterLink: {
    fontSize: '14px',
    fontWeight: 700,
    color: colors.brand.primary[500],
    textDecoration: 'none',
  },
  vetActivityList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  vetActivityRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '10px 4px',
    borderBottom: '1px solid #f4f4f5',
  },
  vetActivityIcon: {
    width: '40px',
    height: '40px',
    borderRadius: '999px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  vetActivityTitle: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 700,
    color: '#171717',
  },
  vetActivitySub: {
    margin: '4px 0 0',
    fontSize: '12px',
    color: '#737373',
    lineHeight: 1.35,
  },
  vetActivityTime: {
    fontSize: '12px',
    color: '#a3a3a3',
    flexShrink: 0,
    whiteSpace: 'nowrap' as const,
  },
  vetQuickSection: {
    marginTop: '8px',
  },
  vetQuickHeading: {
    fontSize: '17px',
    fontWeight: 700,
    fontFamily: 'Poppins, system-ui, sans-serif',
    margin: '0 0 14px',
    color: '#262626',
  },
  vetQuickRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '14px',
  },
  vetQuickCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '14px',
    padding: '16px 16px',
    borderRadius: '14px',
    textDecoration: 'none',
    color: 'inherit',
    border: '1px solid rgba(0,0,0,0.04)',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
  },
  vetQuickIconWrap: {
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  vetQuickTitle: {
    margin: 0,
    fontSize: '15px',
    fontWeight: 700,
    color: '#171717',
  },
  vetQuickDesc: {
    margin: '6px 0 0',
    fontSize: '12px',
    color: '#52525b',
    lineHeight: 1.4,
  },
  section: {
    marginBottom: '40px',
  },
  sectionTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '28px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '24px',
  },
  subsectionTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '20px',
    fontWeight: '600',
    color: '#404040',
    marginBottom: '16px',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '24px',
    marginBottom: '40px',
  },
  statCard: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e5e5',
    borderLeft: '4px solid',
    borderRadius: '12px',
    padding: '24px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    cursor: 'pointer',
  },
  statIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statContent: {
    flex: 1,
  },
  statValue: {
    fontSize: '32px',
    fontWeight: '700',
    fontFamily: 'Poppins, sans-serif',
    color: '#262626',
    margin: 0,
  },
  statLabel: {
    fontSize: '14px',
    color: '#737373',
    margin: 0,
    marginTop: '4px',
  },
  recentActivity: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
  },
  activityList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  opportunityItem: {
    display: 'flex',
    gap: '16px',
    padding: '16px',
    backgroundColor: '#fafafa',
    borderRadius: '12px',
    alignItems: 'center',
  },
  opportunityIcon: {
    fontSize: '32px',
    minWidth: '48px',
    height: '48px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: '8px',
  },
  opportunityContent: {
    flex: 1,
  },
  opportunityHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '4px',
  },
  opportunityTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '16px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
  },
  urgentBadge: {
    padding: '2px 8px',
    backgroundColor: '#ef4444',
    color: '#ffffff',
    fontSize: '10px',
    fontWeight: '600',
    borderRadius: '12px',
  },
  opportunityClinic: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#525252',
    margin: '8px 0 4px 0',
    display: 'flex',
    alignItems: 'center',
  },
  specialtiesContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    margin: '8px 0',
  },
  specialtyBadge: {
    padding: '4px 10px',
    backgroundColor: '#ede9fe',
    color: colors.brand.primary[500],
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '500',
    fontFamily: 'Inter, sans-serif',
  },
  dateTimeContainer: {
    display: 'flex',
    gap: '12px',
    margin: '8px 0',
    flexWrap: 'wrap',
  },
  dateTimeItem: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '13px',
    color: '#737373',
    display: 'flex',
    alignItems: 'center',
  },
  opportunityPayment: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: colors.brand.primary[500],
    fontWeight: '600',
    margin: '8px 0 0 0',
  },
  applyButton: {
    padding: '8px 16px',
    backgroundColor: colors.brand.primary[500],
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease',
  },
  messagesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  messageCard: {
    position: 'relative',
    padding: '20px',
    borderRadius: '12px',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
  },
  messageHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  messageSender: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '16px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
  },
  messageTime: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    color: '#737373',
  },
  messageText: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#525252',
    margin: 0,
  },
  unreadBadge: {
    position: 'absolute',
    top: '12px',
    right: '12px',
    padding: '4px 8px',
    backgroundColor: colors.brand.primary[500],
    color: '#ffffff',
    fontSize: '10px',
    fontWeight: '600',
    borderRadius: '12px',
  },
  statusBadge: {
    padding: '6px 12px',
    borderRadius: '20px',
    color: '#ffffff',
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    fontWeight: '600',
  },
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '20px',
    marginBottom: '32px',
  },
  stars: {
    display: 'flex',
    gap: '4px',
  },
  reviewsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  reviewCard: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
  },
  reviewHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  reviewerName: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '16px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
  },
  rating: {
    display: 'flex',
    gap: '2px',
  },
  reviewComment: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#525252',
    margin: '0 0 8px 0',
    lineHeight: '1.6',
  },
  reviewDate: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    color: '#737373',
  },
  settingsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '20px',
  },
  settingCard: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
  },
  settingIcon: {
    fontSize: '48px',
    marginBottom: '16px',
  },
  settingTitle: {
    fontFamily: 'Poppins, sans-serif',
    fontSize: '18px',
    fontWeight: '600',
    color: '#262626',
    margin: '0 0 8px 0',
  },
  settingDescription: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#737373',
    margin: 0,
  },
  warningBanner: {
    backgroundColor: colors.warning[100],
    border: `1px solid ${colors.warning[500]}`,
    borderRadius: '12px',
    padding: '16px 20px',
    marginBottom: '24px',
  },
  warningContent: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
  },
  warningIcon: {
    color: colors.warning[500],
    flexShrink: 0,
    marginTop: '2px',
  },
  warningText: {
    flex: 1,
  },
  warningTitle: {
    display: 'block',
    fontSize: '16px',
    fontWeight: '600',
    color: colors.text,
    marginBottom: '4px',
  },
  warningMessage: {
    fontSize: '14px',
    color: colors.textSecondary,
    margin: 0,
    lineHeight: '1.5',
  },
};

export default VetDashboardPage;


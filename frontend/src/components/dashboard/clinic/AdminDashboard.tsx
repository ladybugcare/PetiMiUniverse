import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUnit } from '../../../contexts/UnitContext';
import { useAuth } from '../../../AuthContext';
import { useAlert } from '../../../hooks/useAlert';
import { statisticsApi } from '../../../services/statisticsApi';
import { clinicUsersApi } from '../../../services/clinicUsersApi';
import { unitsApi } from '../../../services/unitsApi';
import { demandsApi, Demand } from '../../../services/demandsApi';
import { applicationsApi } from '../../../services/applicationsApi';
import { marketplaceApi, MarketplaceItem } from '../../../services/marketplaceApi';
import {
  Building2,
  Users,
  ClipboardList,
  UserPlus,
  MapPin,
  Star,
  ShoppingCart,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  PlusCircle,
  Calendar,
  ArrowUpRight,
  Eye,
  Tag,
} from 'lucide-react';
import { Role, Unit } from '../../../types/units';
import colors from '../../../styles/colors';
import { getStoredClinicId } from '../../../utils/authHelpers';

// ─── helpers ──────────────────────────────────────────────────────────────────

const BRAND = colors.brand.primary;

function greet(name: string) {
  const h = new Date().getHours();
  if (h < 12) return `Bom dia, ${name}! 👋`;
  if (h < 18) return `Boa tarde, ${name}! 👋`;
  return `Boa noite, ${name}! 👋`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `Há ${mins || 1}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Há ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Ontem';
  return `Há ${days} dias`;
}

function fmtPrice(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

// Simple SVG sparkline
const Sparkline: React.FC<{ data: number[]; color: string; height?: number }> = ({
  data,
  color,
  height = 40,
}) => {
  if (!data.length) return null;
  const W = 120;
  const H = height;
  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = H - ((v - min) / range) * (H - 6) - 3;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
};

// ─── types ────────────────────────────────────────────────────────────────────

interface Stats {
  totalUnits: number;
  totalUsers: number;
  openDemands: number;
  activeMarketplaceListings: number;
  pendingApplications: number;
}

interface ActivityItem {
  id: string;
  icon: React.ReactNode;
  title: string;
  sub: string;
  time: string;
  dot: string;
}

interface AdminDashboardProps {
  activeSection: string;
}

// ─── component ────────────────────────────────────────────────────────────────

const AdminDashboard: React.FC<AdminDashboardProps> = ({ activeSection }) => {
  const { units } = useUnit();
  const { user } = useAuth();

  const [stats, setStats] = useState<Stats>({
    totalUnits: 0,
    totalUsers: 0,
    openDemands: 0,
    activeMarketplaceListings: 0,
    pendingApplications: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        setLoading(true);
        const clinicId = getStoredClinicId();
        if (!clinicId) return;

        const [{ units: all }, { stats: cs }, { clinic_users }] = await Promise.all([
          unitsApi.getByClinic(clinicId),
          statisticsApi.getClinicStats(clinicId),
          clinicUsersApi.getClinicUsers(clinicId),
        ]);

        if (!alive) return;
        setStats({
          totalUnits: all.filter((u) => u.status === 'active' || u.status === 'approved').length,
          totalUsers: clinic_users?.length || 0,
          openDemands: cs.openDemands ?? 0,
          activeMarketplaceListings: cs.activeMarketplaceListings ?? 0,
          pendingApplications: cs.pendingApplications ?? 0,
        });
      } catch {
        // silence expected 403/404
      } finally {
        if (alive) setLoading(false);
      }
    };
    run();
    return () => { alive = false; };
  }, []);

  const welcomeName =
    user?.user_metadata?.name ||
    (typeof user?.email === 'string' ? user.email.split('@')[0] : null) ||
    'Clínica';

  if (activeSection === 'audit') return <AuditSection />;

  return (
    <DashboardContent
      stats={stats}
      statsLoading={loading}
      welcomeName={welcomeName}
      units={units}
    />
  );
};

// ─── Main content ─────────────────────────────────────────────────────────────

const DashboardContent: React.FC<{
  stats: Stats;
  statsLoading: boolean;
  welcomeName: string;
  units: Unit[];
}> = ({ stats, statsLoading, welcomeName, units }) => {
  const navigate = useNavigate();
  const { showSuccess, showError, showWarning } = useAlert();
  const { units: ctxUnits, selectedUnit } = useUnit();

  const allUnits = ctxUnits.length > 0 ? ctxUnits : units.filter((u) =>
    u.status === 'active' || u.status === 'approved'
  );

  // invite modal
  const [showInvite, setShowInvite] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', unit_id: '', role: 'CASSISTANT' as Role });

  // activity
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  // marketplace listings
  const [listings, setListings] = useState<MarketplaceItem[]>([]);
  // upcoming demands
  const [upcoming, setUpcoming] = useState<Demand[]>([]);
  // unit carousel
  const [unitIdx, setUnitIdx] = useState(0);
  // demand sparkline data (mock 7d)
  const [sparkDemands] = useState([2, 4, 3, 6, 5, 7, stats.openDemands || 3]);

  const clinicId = getStoredClinicId();

  // Load secondary data
  useEffect(() => {
    if (!clinicId) return;
    let alive = true;

    const loadAll = async () => {
      try {
        const [demandsRes, applicationsRes, listingsRes] = await Promise.allSettled([
          demandsApi.getByClinic(clinicId),
          applicationsApi.getByClinic(clinicId),
          marketplaceApi.getMyListings(clinicId),
        ]);

        if (!alive) return;

        const actItems: ActivityItem[] = [];

        if (demandsRes.status === 'fulfilled') {
          const demands = demandsRes.value.demands || [];
          // upcoming: future date or open demands
          const today = new Date().toISOString().split('T')[0];
          const up = demands
            .filter((d) => d.demand_date >= today && (d.status === 'open' || d.status === 'with_applicants'))
            .sort((a, b) => a.demand_date.localeCompare(b.demand_date))
            .slice(0, 3);
          if (alive) setUpcoming(up);

          // activity from recent demands
          demands.slice(0, 3).forEach((d) => {
            actItems.push({
              id: d.id,
              icon: <ClipboardList size={18} color={BRAND[500]} />,
              title: d.title,
              sub: `Nova demanda criada · ${d.category}`,
              time: timeAgo(d.created_at),
              dot: BRAND[500],
            });
          });
        }

        if (applicationsRes.status === 'fulfilled') {
          const apps: any[] = applicationsRes.value.applications || [];
          apps.slice(0, 2).forEach((a) => {
            const prof = a.vets?.name || a.freelancers?.name || 'Profissional';
            actItems.push({
              id: a.id,
              icon: <Users size={18} color="#3b82f6" />,
              title: `${prof} candidatou-se`,
              sub: 'Nova candidatura recebida',
              time: timeAgo(a.applied_at || a.created_at || new Date().toISOString()),
              dot: '#3b82f6',
            });
          });
        }

        actItems.sort(() => Math.random() - 0.5); // mix types
        if (alive) setActivity(actItems.slice(0, 5));

        if (listingsRes.status === 'fulfilled') {
          if (alive) setListings(listingsRes.value.items?.slice(0, 4) || []);
        }
      } catch {
        // silence
      }
    };

    loadAll();
    return () => { alive = false; };
  }, [clinicId]);

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteForm.email || !inviteForm.unit_id || !inviteForm.role) {
      showError('Preencha todos os campos');
      return;
    }
    if (!clinicId) { showError('Erro ao identificar a clínica'); return; }
    try {
      setInviteLoading(true);
      await clinicUsersApi.invite({ email: inviteForm.email, clinic_id: clinicId, unit_id: inviteForm.unit_id, role: inviteForm.role });
      showSuccess('Convite enviado!');
      setShowInvite(false);
    } catch (err: any) {
      showError('Erro: ' + (err.message || ''));
    } finally {
      setInviteLoading(false);
    }
  };

  const handleNewUnit = () => {
    const avail = ctxUnits.length > 0 ? ctxUnits : units;
    navigate(avail.length === 0 ? '/units/create-first' : '/units/create');
  };

  const handleInviteUser = () => {
    const avail = ctxUnits.length > 0 ? ctxUnits : units;
    if (avail.length === 0) { showWarning('Cadastre uma unidade primeiro.'); return; }
    setInviteForm({ email: '', unit_id: selectedUnit?.id || avail[0]?.id || '', role: 'CASSISTANT' });
    setShowInvite(true);
  };

  const currentUnit = allUnits[unitIdx];

  return (
    <div style={s.root}>

      {/* ── Hero Banner ────────────────────────────────────────────────── */}
      <div style={s.hero}>
        {/* decorative soft radial */}
        <div style={s.heroDecorSoft} aria-hidden />

        {/* text column */}
        <div style={s.heroText}>
          <p style={s.heroEyebrow}>Painel da clínica</p>
          <h1 style={s.heroTitle}>{greet(welcomeName)}</h1>
          <p style={s.heroSub}>Aqui está o resumo do que acontece na sua clínica hoje.</p>
        </div>

        {/* CTA column */}
        <div style={s.heroCtaWrap}>
          <button style={s.heroCta} onClick={() => navigate('/create-demand')}>
            <PlusCircle size={16} />
            Nova demanda
          </button>
        </div>
      </div>

      {/* ── Stat cards ─────────────────────────────────────────────────── */}
      <div style={s.statsRow}>
        <StatCard
          icon={<ClipboardList size={22} color={BRAND[500]} />}
          label="Demandas abertas"
          value={statsLoading ? '—' : String(stats.openDemands)}
          trend="hoje"
          accentColor={BRAND[500]}
          onClick={() => navigate('/demands?status=open')}
        />
        <StatCard
          icon={<Users size={22} color="#6366f1" />}
          label="Candidaturas pendentes"
          value={statsLoading ? '—' : String(stats.pendingApplications)}
          trend="aguardando revisão"
          accentColor="#6366f1"
          onClick={() => navigate('/clinic-applications?status=pending')}
        />
        <StatCard
          icon={<Users size={22} color="#10b981" />}
          label="Usuários da clínica"
          value={statsLoading ? '—' : String(stats.totalUsers)}
          trend="cadastrados"
          accentColor="#10b981"
          onClick={() => navigate('/users')}
        />
        <StatCard
          icon={<ShoppingCart size={22} color="#f59e0b" />}
          label="Anúncios no Marketplace"
          value={statsLoading ? '—' : String(stats.activeMarketplaceListings)}
          trend="ativos"
          accentColor="#f59e0b"
          onClick={() => navigate('/marketplace/my-listings')}
        />
      </div>

      {/* ── Pending applications hint ───────────────────────────────────── */}
      {!statsLoading && stats.pendingApplications > 0 && (
        <button style={s.hint} onClick={() => navigate('/clinic-applications?status=pending')}>
          <AlertCircle size={16} color={colors.warning[700]} />
          <span>
            {stats.pendingApplications} candidatura{stats.pendingApplications !== 1 ? 's' : ''} pendente{stats.pendingApplications !== 1 ? 's' : ''} — clique para rever
          </span>
        </button>
      )}

      {/* ── Middle two-column ───────────────────────────────────────────── */}
      <div style={s.twoCol}>

        {/* Activity */}
        <div style={s.card}>
          <div style={s.cardHeader}>
            <span style={s.cardTitle}>Atividade recente</span>
            <button style={s.cardLink} onClick={() => navigate('/demands')}>Ver todas</button>
          </div>
          <div style={s.activityList}>
            {activity.length === 0 ? (
              <p style={s.empty}>Nenhuma atividade recente.</p>
            ) : activity.map((a) => (
              <div key={a.id} style={s.actRow}>
                <div style={s.actIconWrap}>{a.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={s.actTitle}>{a.title}</p>
                  <p style={s.actSub}>{a.sub}</p>
                </div>
                <div style={s.actRight}>
                  <span style={s.actTime}>{a.time}</span>
                  <span style={{ ...s.actDot, backgroundColor: a.dot }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Marketplace */}
        <div style={s.card}>
          <div style={s.cardHeader}>
            <span style={s.cardTitle}>Marketplace</span>
            <button style={s.cardLink} onClick={() => navigate('/marketplace')}>Ver todos</button>
          </div>
          <div style={s.mkpMiniStats}>
            <MkpMini label="Ativos" value={stats.activeMarketplaceListings} color={BRAND[500]} />
            <MkpMini label="Para venda" value={listings.filter(l => l.listing_type === 'sale').length} color="#10b981" />
            <MkpMini label="Procurados" value={listings.filter(l => l.listing_type === 'wanted').length} color="#6366f1" />
            <MkpMini label="Vendidos" value={listings.filter(l => l.status === 'sold').length} color="#f59e0b" />
          </div>
          <div style={s.mkpList}>
            {listings.length === 0 ? (
              <div style={s.mkpEmpty}>
                <ShoppingCart size={32} color={BRAND[200]} />
                <p style={{ margin: '10px 0 4px', color: '#525252', fontWeight: 600 }}>Sem anúncios ainda</p>
                <p style={{ margin: 0, color: '#737373', fontSize: '13px' }}>Crie o seu primeiro anúncio no marketplace</p>
                <button style={s.mkpCta} onClick={() => navigate('/marketplace/create')}>
                  <PlusCircle size={14} /> Criar anúncio
                </button>
              </div>
            ) : listings.map((item) => (
              <div
                key={item.id}
                style={s.mkpItem}
                onClick={() => navigate(`/marketplace/${item.id}`)}
              >
                <div style={s.mkpItemIcon}>
                  {item.listing_type === 'wanted' ? <Eye size={16} color="#6366f1" /> : <Tag size={16} color={BRAND[500]} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={s.mkpItemTitle}>{item.title}</p>
                  <p style={s.mkpItemSub}>{item.category} · {item.condition === 'new' ? 'Novo' : item.condition === 'used' ? 'Usado' : 'Recondicionado'}</p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {item.price ? <p style={s.mkpPrice}>{fmtPrice(item.price)}</p> : <p style={s.mkpPrice}>A combinar</p>}
                  <span style={{ ...s.mkpBadge, backgroundColor: item.status === 'active' ? '#dcfce7' : '#fef9c3', color: item.status === 'active' ? '#15803d' : '#92400e' }}>
                    {item.status === 'active' ? 'Ativo' : item.status === 'sold' ? 'Vendido' : 'Inativo'}
                  </span>
                </div>
              </div>
            ))}
            {listings.length > 0 && (
              <button style={s.mkpFooter} onClick={() => navigate('/marketplace/create')}>
                <PlusCircle size={14} /> Novo anúncio
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Bottom two-column ───────────────────────────────────────────── */}
      <div style={s.twoCol}>

        {/* Suas unidades */}
        <div style={s.card}>
          <div style={s.cardHeader}>
            <span style={s.cardTitle}>Suas unidades</span>
            <button style={s.cardLink} onClick={() => navigate('/units')}>Ver todas</button>
          </div>
          {allUnits.length === 0 ? (
            <div style={s.emptyUnits}>
              <p style={{ margin: '0 0 12px', color: '#525252' }}>Nenhuma unidade cadastrada.</p>
              <button style={s.ctaBtn} onClick={handleNewUnit}>Cadastrar primeira unidade</button>
            </div>
          ) : (
            <div>
              <UnitSlide unit={currentUnit} />
              {allUnits.length > 1 && (
                <div style={s.carousel}>
                  <button style={s.carBtn} onClick={() => setUnitIdx((i) => (i - 1 + allUnits.length) % allUnits.length)}>
                    <ChevronLeft size={18} />
                  </button>
                  <div style={s.carDots}>
                    {allUnits.map((_, i) => (
                      <button
                        key={i}
                        style={{ ...s.dot, backgroundColor: i === unitIdx ? BRAND[500] : '#e5e7eb' }}
                        onClick={() => setUnitIdx(i)}
                      />
                    ))}
                  </div>
                  <button style={s.carBtn} onClick={() => setUnitIdx((i) => (i + 1) % allUnits.length)}>
                    <ChevronRight size={18} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Desempenho */}
        <div style={s.card}>
          <div style={s.cardHeader}>
            <span style={s.cardTitle}>Desempenho da clínica</span>
            <button style={s.cardLink} onClick={() => navigate('/clinic-reports')}>Últimos 30 dias</button>
          </div>
          <div style={s.perfGrid}>
            <div style={s.perfChart}>
              <p style={s.perfChartLabel}>Demandas</p>
              <Sparkline data={sparkDemands} color={BRAND[500]} height={56} />
              <div style={s.perfLegend}>
                <span style={{ ...s.legendDot, background: BRAND[500] }} /> <span style={s.legendLabel}>Abertas</span>
              </div>
            </div>
            <div style={s.perfChart}>
              <p style={s.perfChartLabel}>Candidaturas</p>
              <Sparkline data={[1, 3, 2, 5, 4, 6, stats.pendingApplications || 4]} color="#6366f1" height={56} />
              <div style={s.perfLegend}>
                <span style={{ ...s.legendDot, background: '#6366f1' }} /> <span style={s.legendLabel}>Candidaturas</span>
              </div>
            </div>
          </div>
          <div style={s.perfActions}>
            <button style={s.perfAction} onClick={handleNewUnit}>
              <Building2 size={15} /> Nova unidade
            </button>
            <button style={s.perfAction} onClick={handleInviteUser}>
              <UserPlus size={15} /> Convidar usuário
            </button>
            <button style={{ ...s.perfAction, backgroundColor: BRAND[500], color: '#fff', borderColor: BRAND[500] }} onClick={() => navigate('/create-demand')}>
              <ClipboardList size={15} /> Nova demanda
            </button>
          </div>
        </div>
      </div>

      {/* ── Upcoming demands strip ──────────────────────────────────────── */}
      <div style={s.upcomingStrip}>
        <div style={s.upcomingLeft}>
          <Calendar size={28} color={BRAND[500]} />
          <div>
            <p style={s.upcomingHead}>Próximas demandas</p>
            <p style={s.upcomingSub}>
              {upcoming.length === 0
                ? 'Sem demandas agendadas nos próximos dias.'
                : `Você tem ${upcoming.length} demanda${upcoming.length !== 1 ? 's' : ''} agendada${upcoming.length !== 1 ? 's' : ''} nos próximos dias.`}
            </p>
          </div>
        </div>
        {upcoming.length > 0 && (
          <div style={s.upcomingItems}>
            {upcoming.slice(0, 2).map((d) => {
              const dt = new Date(d.demand_date + 'T00:00:00');
              const today = new Date(); today.setHours(0,0,0,0);
              const diff = Math.round((dt.getTime() - today.getTime()) / 86400000);
              const label = diff === 0 ? 'Hoje' : diff === 1 ? 'Amanhã' : dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
              return (
                <div key={d.id} style={s.upItem}>
                  <Calendar size={14} color={BRAND[500]} />
                  <div>
                    <p style={s.upItemLabel}>{label} · {d.start_time?.slice(0,5) || ''}</p>
                    <p style={s.upItemTitle}>{d.title}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <button style={s.upcomingBtn} onClick={() => navigate('/demands')}>
          Ver todas <ChevronRight size={16} />
        </button>
      </div>

      {/* ── Invite modal ────────────────────────────────────────────────── */}
      {showInvite && (
        <div style={s.overlay} onClick={() => setShowInvite(false)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={s.modalTitle}>Convidar Usuário</h2>
            <form onSubmit={handleInviteSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <label style={s.lbl}>
                Email *
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  style={s.inp}
                  required
                />
              </label>
              <label style={s.lbl}>
                Unidade *
                <select
                  value={inviteForm.unit_id}
                  onChange={(e) => setInviteForm({ ...inviteForm, unit_id: e.target.value })}
                  style={s.inp}
                  required
                >
                  <option value="">Selecione</option>
                  {(ctxUnits.length > 0 ? ctxUnits : units).map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </label>
              <label style={s.lbl}>
                Perfil *
                <select
                  value={inviteForm.role}
                  onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value as Role })}
                  style={s.inp}
                  required
                >
                  <option value="CADMIN">Administrador</option>
                  <option value="CMANAGER">Gestor de Unidade</option>
                  <option value="CASSISTANT">Assistente</option>
                  <option value="CVET_INTERNAL">Veterinário Interno</option>
                </select>
              </label>
              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowInvite(false)}
                  style={{ ...s.btnSecondary, flex: 1 }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={inviteLoading}
                  style={{ ...s.btnPrimary, flex: 1, opacity: inviteLoading ? 0.6 : 1 }}
                >
                  {inviteLoading ? 'Enviando…' : 'Enviar convite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── sub-components ───────────────────────────────────────────────────────────

const StatCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  trend: string;
  accentColor: string;
  onClick: () => void;
}> = ({ icon, label, value, trend, accentColor, onClick }) => (
  <button style={{ ...s.statCard, borderLeftColor: accentColor }} onClick={onClick}>
    <div style={{ ...s.statIconWrap, backgroundColor: `${accentColor}18` }}>{icon}</div>
    <div style={{ flex: 1, textAlign: 'left' }}>
      <p style={s.statLabel}>{label}</p>
      <p style={s.statValue}>{value}</p>
      <p style={{ ...s.statTrend, color: accentColor }}>
        <ArrowUpRight size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> {trend}
      </p>
    </div>
  </button>
);

const MkpMini: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
  <div style={{ textAlign: 'center' }}>
    <p style={{ margin: '0 0 2px', fontSize: '22px', fontWeight: 700, color }}>{value}</p>
    <p style={{ margin: 0, fontSize: '11px', color: '#737373' }}>{label}</p>
  </div>
);

const UnitSlide: React.FC<{ unit: Unit }> = ({ unit }) => {
  const navigate = useNavigate();
  const statusMap: Record<string, { label: string; color: string; bg: string }> = {
    approved: { label: 'Aprovada', color: '#15803d', bg: '#dcfce7' },
    active: { label: 'Operacional', color: '#15803d', bg: '#dcfce7' },
    pending_review: { label: 'Pendente', color: '#92400e', bg: '#fef3c7' },
    rejected: { label: 'Rejeitada', color: '#991b1b', bg: '#fee2e2' },
    inactive: { label: 'Inativa', color: '#525252', bg: '#f5f5f5' },
  };
  const st = statusMap[unit.status] || { label: unit.status, color: '#525252', bg: '#f5f5f5' };

  return (
    <div style={s.unitSlide}>
      <div style={s.unitImgBox}>
        <Building2 size={36} color={BRAND[400]} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <h4 style={s.unitName}>{unit.name}</h4>
          {unit.is_main && (
            <span style={s.mainBadge}><Star size={10} fill="currentColor" /> Principal</span>
          )}
        </div>
        <p style={{ margin: '0 0 6px', fontSize: '13px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <MapPin size={13} /> {unit.city}, {unit.state}
        </p>
        <span style={{ ...s.statusBadge, backgroundColor: st.bg, color: st.color }}>
          ● {st.label}
        </span>
        <button style={s.unitLink} onClick={() => navigate(`/units/${unit.id}`)}>
          Ver unidade <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
};

const AuditSection: React.FC = () => (
  <div style={{ padding: '40px 0' }}>
    <h2 style={{ fontFamily: 'Poppins, sans-serif', fontSize: '24px', fontWeight: 700, color: '#262626', marginBottom: '16px' }}>
      Logs de Auditoria
    </h2>
    <div style={{ background: '#fafafa', border: '2px dashed #e5e5e5', borderRadius: '12px', padding: '48px', textAlign: 'center' }}>
      <p style={{ fontSize: '16px', color: '#525252' }}>🔍 Visualização de logs em desenvolvimento</p>
    </div>
  </div>
);

// ─── styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  root: {
    fontFamily: 'Inter, sans-serif',
    maxWidth: '100%',
    paddingBottom: '48px',
  },

  /* Hero */
  hero: {
    position: 'relative',
    borderRadius: '16px',
    background: `linear-gradient(105deg, ${colors.brand.primary[50]} 0%, #fff8f7 55%, ${colors.brand.secondary[100]} 100%)`,
    border: `1px solid ${colors.brand.primary[200]}`,
    overflow: 'hidden',
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: '0',
    marginTop: '20px',
    marginBottom: '24px',
    minHeight: '160px',
    padding: '32px 36px 0 40px',
    boxShadow: '0 2px 14px rgba(15,23,42,0.06)',
  },
  heroDecorSoft: {
    position: 'absolute',
    inset: 0,
    background: 'radial-gradient(ellipse 70% 55% at 100% 100%, rgba(255,255,255,0.65) 0%, transparent 55%)',
    pointerEvents: 'none',
  },
  heroText: {
    flex: '1 1 280px',
    minWidth: 0,
    paddingBottom: '32px',
    maxWidth: '520px',
    position: 'relative',
    zIndex: 1,
  },
  heroEyebrow: {
    margin: '0 0 8px',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.18em',
    textTransform: 'uppercase' as const,
    color: BRAND[600],
  },
  heroTitle: {
    margin: '0 0 8px',
    fontFamily: 'Poppins, sans-serif',
    fontSize: 'clamp(1.4rem, 2.5vw, 1.85rem)',
    fontWeight: 700,
    color: '#1c1917',
    lineHeight: 1.25,
  },
  heroSub: { margin: 0, fontSize: '15px', color: '#57534e', lineHeight: 1.6, maxWidth: '460px' },
  heroCtaWrap: {
    display: 'flex',
    alignItems: 'center',
    paddingBottom: '32px',
    marginLeft: 'auto',
    position: 'relative',
    zIndex: 1,
  },
  heroCta: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '10px 20px',
    backgroundColor: BRAND[500],
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: `0 4px 14px ${BRAND[500]}55`,
    whiteSpace: 'nowrap' as const,
  },

  /* Stats row */
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '20px',
  },
  statCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '18px 16px',
    backgroundColor: '#fff',
    border: '1px solid #f0f0f0',
    borderLeft: '4px solid',
    borderRadius: '12px',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'box-shadow 0.2s',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  statIconWrap: {
    width: '44px',
    height: '44px',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  statLabel: { margin: '0 0 2px', fontSize: '12px', color: '#737373', fontWeight: 500 },
  statValue: { margin: '0 0 2px', fontSize: '28px', fontWeight: 700, color: '#1a1a1a', lineHeight: 1.1 },
  statTrend: { margin: 0, fontSize: '11px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '2px' },

  /* hint */
  hint: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    marginBottom: '20px',
    padding: '10px 14px',
    backgroundColor: colors.warning[100],
    border: `1px solid ${colors.warning[500]}`,
    borderRadius: '10px',
    cursor: 'pointer',
    fontSize: '13px',
    color: '#262626',
    fontFamily: 'Inter, sans-serif',
    textAlign: 'left',
  },

  /* two col */
  twoCol: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '16px',
    marginBottom: '16px',
  },

  /* card */
  card: {
    backgroundColor: '#fff',
    border: '1px solid #f0f0f0',
    borderRadius: '14px',
    padding: '20px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  cardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' },
  cardTitle: { fontFamily: 'Poppins, sans-serif', fontSize: '16px', fontWeight: 600, color: '#1a1a1a' },
  cardLink: { fontSize: '13px', color: BRAND[500], background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 },

  /* activity */
  activityList: { display: 'flex', flexDirection: 'column', gap: '12px' },
  actRow: { display: 'flex', alignItems: 'flex-start', gap: '10px' },
  actIconWrap: { width: '34px', height: '34px', borderRadius: '8px', backgroundColor: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  actTitle: { margin: '0 0 2px', fontSize: '13px', fontWeight: 500, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  actSub: { margin: 0, fontSize: '12px', color: '#737373' },
  actRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', flexShrink: 0 },
  actTime: { fontSize: '11px', color: '#9ca3af', whiteSpace: 'nowrap' },
  actDot: { width: '8px', height: '8px', borderRadius: '50%' },
  empty: { color: '#9ca3af', fontSize: '13px', textAlign: 'center', padding: '24px 0' },

  /* marketplace */
  mkpMiniStats: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', padding: '12px 0', borderBottom: '1px solid #f0f0f0', marginBottom: '14px' },
  mkpList: { display: 'flex', flexDirection: 'column', gap: '8px' },
  mkpEmpty: { textAlign: 'center', padding: '24px 0' },
  mkpCta: { marginTop: '10px', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', backgroundColor: BRAND[500], color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' },
  mkpItem: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '10px', border: '1px solid #f0f0f0', cursor: 'pointer', transition: 'background 0.15s' },
  mkpItemIcon: { width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  mkpItemTitle: { margin: '0 0 2px', fontSize: '13px', fontWeight: 500, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  mkpItemSub: { margin: 0, fontSize: '11px', color: '#9ca3af', textTransform: 'capitalize' },
  mkpPrice: { margin: '0 0 4px', fontSize: '13px', fontWeight: 600, color: '#1a1a1a' },
  mkpBadge: { fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', display: 'inline-block' },
  mkpFooter: { display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center', padding: '10px', background: 'none', border: `1px dashed ${BRAND[300]}`, borderRadius: '10px', color: BRAND[500], fontSize: '13px', fontWeight: 600, cursor: 'pointer', marginTop: '4px' },

  /* units */
  emptyUnits: { textAlign: 'center', padding: '24px 0' },
  ctaBtn: { padding: '10px 20px', backgroundColor: BRAND[500], color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' },
  unitSlide: { display: 'flex', gap: '14px', alignItems: 'flex-start' },
  unitImgBox: { width: '80px', height: '80px', borderRadius: '10px', backgroundColor: colors.brand.primary[50], display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1px solid ${BRAND[200]}` },
  unitName: { margin: 0, fontSize: '15px', fontWeight: 600, color: '#1a1a1a' },
  mainBadge: { display: 'inline-flex', alignItems: 'center', gap: '3px', backgroundColor: '#fef3c7', color: '#92400e', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 },
  statusBadge: { display: 'inline-block', padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 600, marginBottom: '10px' },
  unitLink: { display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: BRAND[500], fontSize: '13px', fontWeight: 600, cursor: 'pointer', padding: 0 },
  carousel: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginTop: '16px' },
  carBtn: { background: 'none', border: '1px solid #e5e5e5', borderRadius: '8px', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#525252' },
  carDots: { display: 'flex', gap: '6px' },
  dot: { width: '8px', height: '8px', borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0 },

  /* performance */
  perfGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' },
  perfChart: { padding: '12px', background: '#fafafa', borderRadius: '10px' },
  perfChartLabel: { margin: '0 0 8px', fontSize: '12px', fontWeight: 600, color: '#525252' },
  perfLegend: { display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' },
  legendDot: { width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block' },
  legendLabel: { fontSize: '11px', color: '#737373' },
  perfActions: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  perfAction: { display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', backgroundColor: '#f5f5f5', border: '1px solid #e5e5e5', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', color: '#404040' },

  /* upcoming strip */
  upcomingStrip: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '20px 24px',
    backgroundColor: '#fff',
    border: '1px solid #f0f0f0',
    borderRadius: '14px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    marginTop: '16px',
    flexWrap: 'wrap',
  },
  upcomingLeft: { display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: '200px' },
  upcomingHead: { margin: '0 0 3px', fontWeight: 600, fontSize: '15px', color: '#1a1a1a', fontFamily: 'Poppins, sans-serif' },
  upcomingSub: { margin: 0, fontSize: '13px', color: '#737373' },
  upcomingItems: { display: 'flex', gap: '16px', flex: 2, flexWrap: 'wrap' },
  upItem: { display: 'flex', alignItems: 'flex-start', gap: '8px' },
  upItemLabel: { margin: '0 0 2px', fontSize: '11px', color: BRAND[500], fontWeight: 600 },
  upItemTitle: { margin: 0, fontSize: '13px', color: '#1a1a1a', fontWeight: 500 },
  upcomingBtn: { display: 'flex', alignItems: 'center', gap: '4px', padding: '10px 18px', backgroundColor: BRAND[50], border: `1px solid ${BRAND[200]}`, borderRadius: '10px', color: BRAND[600], fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },

  /* modal */
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { backgroundColor: '#fff', borderRadius: '16px', padding: '28px', maxWidth: '460px', width: '90%', boxShadow: '0 20px 40px rgba(0,0,0,0.15)' },
  modalTitle: { margin: '0 0 20px', fontFamily: 'Poppins, sans-serif', fontSize: '20px', fontWeight: 700, color: '#1a1a1a' },
  lbl: { display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', fontWeight: 500, color: '#525252' },
  inp: { padding: '10px 12px', border: '1px solid #e5e5e5', borderRadius: '8px', fontSize: '14px', fontFamily: 'Inter, sans-serif', color: '#1a1a1a', outline: 'none' },
  btnPrimary: { padding: '11px', backgroundColor: BRAND[500], color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' },
  btnSecondary: { padding: '11px', backgroundColor: '#f5f5f5', color: '#525252', border: '1px solid #e5e5e5', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' },
};

export default AdminDashboard;

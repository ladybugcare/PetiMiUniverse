import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAlert } from '@petimi/hub-ui';
import '@petimi/hub-ui/pages/clientes/clientes.css';
import './hub-onboarding-page.css';
import {
  formatPlanPrice,
  hubSubscriptionApi,
  type HubPaidPlan,
  type HubSubscriptionMe,
} from '../services/hubSubscriptionApi';
import {
  HUB_PLAN_HIGHLIGHT,
  hubPlanPeopleLine,
  hubPlanUnitLine,
  mergeLaunchPaidPlans,
} from '../constants/hubLaunchPlans';
import HubPlanCompareTable from '../components/HubPlanCompareTable';

const HubAssinaturaPage: React.FC = () => {
  const { showError } = useAlert();
  const [params, setParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [data, setData] = useState<HubSubscriptionMe | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const paidPlans = useMemo(
    () => mergeLaunchPaidPlans(data?.paid_plans ?? []),
    [data?.paid_plans],
  );

  const load = async () => {
    const me = await hubSubscriptionApi.me();
    setData(me);
    const catalog = mergeLaunchPaidPlans(me.paid_plans ?? []);
    setSelected((current) => {
      if (current && catalog.some((p) => p.slug === current)) return current;
      const currentSlug = me.subscription?.base_plan_slug;
      if (currentSlug && catalog.some((p) => p.slug === currentSlug)) return currentSlug;
      return null;
    });
    return me;
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        if (params.get('retorno') === '1') {
          await hubSubscriptionApi.sync();
          params.delete('retorno');
          setParams(params, { replace: true });
        }
        if (!cancelled) await load();
      } catch (e: unknown) {
        if (!cancelled) showError((e as Error)?.message || 'Erro ao carregar o plano');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
    // só na entrada e na volta do Mercado Pago
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pay = async () => {
    if (!selected) return;
    setPaying(true);
    try {
      const res = await hubSubscriptionApi.checkout(selected);
      window.location.assign(res.init_point);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Não foi possível abrir o Mercado Pago');
      setPaying(false);
    }
  };

  const sub = data?.subscription;
  const onBeta = Boolean(sub && (sub.is_beta || sub.status === 'beta' || sub.base_plan_slug === 'beta'));
  const checkoutOpen = Boolean(data?.mercado_pago_configured);
  const preview = Boolean(data && (onBeta || !checkoutOpen));
  const selectedPlan = paidPlans.find((plan) => plan.slug === selected) ?? null;
  const selectedIsCurrent = Boolean(selected && selected === sub?.base_plan_slug && sub?.status === 'active');
  const notice = preview ? null : subscriptionNotice(sub);

  return (
    <div className="hub-clientes hub-assinatura">
      <header className="hub-assinatura__head">
        <h1 className="hub-clientes__title">Plano do PetMi Hub</h1>
        {!loading ? (
          <p className="hub-clientes__subtitle">
            Vet Solo cobre clínica. Essencial, Expansão e Rede incluem a operação pet completa. O que muda
            entre eles é o porte: unidades e pessoas na equipe.
          </p>
        ) : null}
      </header>

      {loading ? <p>Carregando planos…</p> : null}

      {!loading && notice ? <p className="hub-assinatura__notice">{notice}</p> : null}

      {!loading && data ? (
        <div className="hub-assinatura__catalog">
          {preview && onBeta ? <BetaHighlight /> : null}
          {preview ? (
            <div className="hub-assinatura__later-block">
              <p className="hub-assinatura__later">Valores públicos previstos para o lançamento</p>
              {onBeta ? (
                <p className="hub-assinatura__later-note">
                  Como Parceiro Fundador, você receberá sua condição exclusiva antes do início das
                  cobranças.
                </p>
              ) : null}
            </div>
          ) : null}
          <div
            className={[
              'hub-assinatura__plans',
              'hub-assinatura__plans--four',
              !preview && onBeta ? 'hub-assinatura__plans--with-beta' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {!preview && onBeta ? (
              <article className="hub-plan-offer hub-plan-offer--current" aria-current="true">
                <span className="hub-plan-offer__badge">Plano atual</span>
                <span className="hub-plan-offer__name">Programa Beta</span>
                <span className="hub-plan-offer__price">Grátis</span>
                <ul className="hub-plan-offer__limits">
                  <li>Sem cartão</li>
                  <li>Sem mensalidade</li>
                </ul>
              </article>
            ) : null}
            <div
              className="hub-assinatura__choices"
              role={preview ? undefined : 'radiogroup'}
              aria-label="Planos pagos"
            >
              {paidPlans.map((plan) => (
                <PaidPlanCard
                  key={plan.slug}
                  plan={plan}
                  selected={!preview && selected === plan.slug}
                  current={!preview && plan.slug === sub?.base_plan_slug && sub?.status === 'active'}
                  locked={preview}
                  disabled={preview || paying || !data.can_checkout}
                  onSelect={setSelected}
                />
              ))}
            </div>
          </div>

          {preview ? null : (
            <div className="hub-assinatura__actions">
              {!data.can_checkout ? (
                <p className="hub-assinatura__note">Só o administrador da clínica pode assinar.</p>
              ) : (
                <button
                  type="button"
                  className="pet-wizard__btn pet-wizard__btn--primary hub-assinatura__pay"
                  disabled={
                    paying || !selectedPlan || selectedIsCurrent || !data.mercado_pago_configured
                  }
                  onClick={() => {
                    void pay().catch(() => showError('Não foi possível abrir o Mercado Pago'));
                  }}
                >
                  {paying
                    ? 'Abrindo Mercado Pago…'
                    : selectedIsCurrent
                      ? 'Este já é o plano da clínica'
                      : selectedPlan
                        ? `Assinar ${selectedPlan.name}`
                        : 'Escolha um plano pago'}
                </button>
              )}
              {data.can_checkout && selectedPlan && sub?.status === 'active' && !selectedIsCurrent ? (
                <p className="hub-assinatura__note">
                  O plano atual continua até o Mercado Pago autorizar esta troca.
                </p>
              ) : null}
            </div>
          )}

          <HubPlanCompareTable
            className="hub-assinatura__compare"
            title="Comparativo de funcionalidades"
          />
        </div>
      ) : null}
    </div>
  );
};

function subscriptionNotice(sub: HubSubscriptionMe['subscription']): string | null {
  if (!sub || sub.status === 'beta' || sub.is_beta) return null;
  if (sub.status === 'pending_payment') return 'Pagamento pendente no Mercado Pago.';
  if (sub.status === 'past_due') return 'Pagamento em atraso.';
  if (sub.status === 'canceled') return 'Assinatura cancelada. Escolha um plano para voltar.';
  if (sub.status === 'trialing') return 'Período de teste.';
  if (sub.status === 'active' && sub.current_period_end) {
    return `Próxima cobrança em ${new Date(sub.current_period_end).toLocaleDateString('pt-BR')}.`;
  }
  return null;
}

function BetaHighlight() {
  return (
    <section className="hub-assinatura__founder" aria-current="true">
      <p className="hub-assinatura__founder-seal">
        Programa Fundador ativo · condições especiais no lançamento
      </p>
      <article className="hub-assinatura__beta">
        <div className="hub-assinatura__beta-status">
          <span className="hub-assinatura__beta-kicker">Parceiro fundador</span>
          <h2 className="hub-assinatura__beta-title">Você faz parte do Programa Fundador</h2>
          <p className="hub-assinatura__beta-lead">Acesso completo e gratuito até o lançamento oficial.</p>
        </div>
        <div className="hub-assinatura__beta-benefit">
          <p className="hub-assinatura__beta-copy">
            Por entrar antes da abertura do PetMi Hub, você terá uma condição especial de lançamento,
            com valor diferenciado em relação aos planos públicos.
          </p>
          <p className="hub-assinatura__beta-copy">
            Antes de qualquer cobrança, enviaremos sua proposta com antecedência. Você poderá escolher
            seu plano e só seguirá se fizer sentido para sua operação.
          </p>
        </div>
      </article>
    </section>
  );
}

function PaidPlanCard({
  plan,
  selected,
  current,
  locked,
  disabled,
  onSelect,
}: {
  plan: HubPaidPlan;
  selected: boolean;
  current: boolean;
  locked?: boolean;
  disabled: boolean;
  onSelect: (slug: string) => void;
}) {
  const badge = current ? 'Plano atual' : selected ? 'Selecionado' : '\u00a0';
  const highlight = HUB_PLAN_HIGHLIGHT[plan.slug];
  const className = [
    'hub-plan-offer',
    locked ? 'hub-plan-offer--quiet' : '',
    selected ? 'hub-plan-offer--selected' : '',
    plan.slug === 'growth' ? 'hub-plan-offer--emphasis' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const content = (
    <>
      {locked ? null : (
        <span
          className={[
            'hub-plan-offer__badge',
            !current && !selected ? 'hub-plan-offer__badge--empty' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {badge}
        </span>
      )}
      {highlight ? <span className="hub-plan-offer__kicker">{highlight}</span> : null}
      <span className="hub-plan-offer__name">{plan.name}</span>
      <span className="hub-plan-offer__price">
        {formatPlanPrice(plan.monthly_price_cents)}
        <span className="hub-plan-offer__period">/mês</span>
      </span>
      <ul className="hub-plan-offer__limits">
        <li>{hubPlanUnitLine(plan)}</li>
        <li>{hubPlanPeopleLine(plan)}</li>
      </ul>
      {locked ? <span className="hub-plan-offer__public">Valor público previsto</span> : null}
      <span
        className="hub-plan-offer__compare-link"
        role="link"
        tabIndex={0}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          document.getElementById('comparativo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          e.stopPropagation();
          document.getElementById('comparativo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
      >
        Ver comparativo
      </span>
    </>
  );

  if (locked) {
    return (
      <article className={className} aria-disabled="true">
        {content}
      </article>
    );
  }

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      className={className}
      onClick={() => onSelect(plan.slug)}
    >
      {content}
    </button>
  );
}

export default HubAssinaturaPage;

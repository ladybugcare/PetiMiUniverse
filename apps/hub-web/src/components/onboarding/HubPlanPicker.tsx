import React from 'react';
import { formatPlanPrice, type HubPaidPlan } from '../../services/hubSubscriptionApi';
import {
  hubPlanPeopleLine,
  hubPlanUnitLine,
  mergeLaunchPaidPlans,
} from '../../constants/hubLaunchPlans';

type Props = {
  plans: HubPaidPlan[];
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  disabled?: boolean;
};

const HubPlanPicker: React.FC<Props> = ({ plans, selectedSlug, onSelect, disabled }) => {
  const catalog = mergeLaunchPaidPlans(plans);
  return (
    <div className="hub-plan-picker" role="radiogroup" aria-label="Planos do PetMi Hub">
      {catalog.map((plan) => {
        const selected = selectedSlug === plan.slug;
        const limits = [hubPlanUnitLine(plan), hubPlanPeopleLine(plan)];
        return (
          <button
            key={plan.slug}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            className={['hub-plan-card', selected ? 'hub-plan-card--selected' : ''].filter(Boolean).join(' ')}
            onClick={() => onSelect(plan.slug)}
          >
            <span className="hub-plan-card__name">{plan.name}</span>
            <span className="hub-plan-card__price">
              {formatPlanPrice(plan.monthly_price_cents)}
              <span className="hub-plan-card__period">/mês</span>
            </span>
            <ul className="hub-plan-card__limits">
              {limits.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {plan.description ? <span className="hub-plan-card__desc">{plan.description}</span> : null}
          </button>
        );
      })}
    </div>
  );
};

export default HubPlanPicker;

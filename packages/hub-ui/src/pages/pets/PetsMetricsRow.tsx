import React, { useMemo } from 'react';
import { Heart, Users, Layers, PlusCircle } from 'lucide-react';
import type { HubPet } from '../../api/hubPetsApi';

interface PetsMetricsRowProps {
  pets: HubPet[];
  loading: boolean;
}

export const PetsMetricsRow: React.FC<PetsMetricsRowProps> = ({ pets, loading }) => {
  const derived = useMemo(() => {
    const total = pets.length;
    const withSecondary = pets.filter((p) => p.secondary_guardian?.guardian_id).length;
    const speciesSet = new Set(pets.map((p) => p.species.trim().toLowerCase()).filter(Boolean));
    const speciesCount = speciesSet.size;
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const createdThisMonth = pets.filter((p) => {
      const d = new Date(p.created_at);
      return !Number.isNaN(d.getTime()) && d >= monthStart;
    }).length;
    const pctSecondary = total > 0 ? Math.round((withSecondary / total) * 100) : 0;
    return { total, withSecondary, speciesCount, createdThisMonth, pctSecondary };
  }, [pets]);

  if (loading) {
    return (
      <div className="hub-clientes__metrics">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="hub-clientes__metric-card">
            <div className="hub-pets-metric-card__top">
              <div className="hub-clientes__metric-label">…</div>
              <div className="hub-pets-metric-card__icon hub-pets-metric-card__icon--brand" />
            </div>
            <div className="hub-clientes__metric-value">—</div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="hub-clientes__metrics">
      <div className="hub-clientes__metric-card">
        <div className="hub-pets-metric-card__top">
          <div>
            <div className="hub-clientes__metric-label">Total de pets</div>
            <div className="hub-clientes__metric-value">{derived.total.toLocaleString('pt-BR')}</div>
          </div>
          <div className="hub-pets-metric-card__icon hub-pets-metric-card__icon--brand" aria-hidden>
            <Heart size={20} strokeWidth={1.75} />
          </div>
        </div>
        {derived.createdThisMonth > 0 ? (
          <div className="hub-pets-metric-trend">+{derived.createdThisMonth} este mês</div>
        ) : (
          <div className="hub-clientes__metric-sub">Animais registados na clínica</div>
        )}
      </div>
      <div className="hub-clientes__metric-card">
        <div className="hub-pets-metric-card__top">
          <div>
            <div className="hub-clientes__metric-label">Com co-tutor</div>
            <div className="hub-clientes__metric-value">{derived.withSecondary.toLocaleString('pt-BR')}</div>
          </div>
          <div className="hub-pets-metric-card__icon hub-pets-metric-card__icon--green" aria-hidden>
            <Users size={20} strokeWidth={1.75} />
          </div>
        </div>
        <div className="hub-clientes__metric-sub">{derived.pctSecondary}% do total</div>
      </div>
      <div className="hub-clientes__metric-card">
        <div className="hub-pets-metric-card__top">
          <div>
            <div className="hub-clientes__metric-label">Espécies distintas</div>
            <div className="hub-clientes__metric-value">{derived.speciesCount.toLocaleString('pt-BR')}</div>
          </div>
          <div className="hub-pets-metric-card__icon hub-pets-metric-card__icon--brand" aria-hidden>
            <Layers size={20} strokeWidth={1.75} />
          </div>
        </div>
        <div className="hub-clientes__metric-sub">Valores únicos na clínica</div>
      </div>
      <div className="hub-clientes__metric-card">
        <div className="hub-pets-metric-card__top">
          <div>
            <div className="hub-clientes__metric-label">Novos este mês</div>
            <div className="hub-clientes__metric-value">{derived.createdThisMonth.toLocaleString('pt-BR')}</div>
          </div>
          <div className="hub-pets-metric-card__icon hub-pets-metric-card__icon--green" aria-hidden>
            <PlusCircle size={20} strokeWidth={1.75} />
          </div>
        </div>
        <div className="hub-clientes__metric-sub">Criados desde o dia 1 (UTC)</div>
      </div>
    </div>
  );
};

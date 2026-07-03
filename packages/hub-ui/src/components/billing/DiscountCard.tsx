import React from 'react';
import { Percent } from 'lucide-react';
import { DiscountControl, type DiscountControlProps } from './DiscountControl';

export interface DiscountCardProps extends DiscountControlProps {
  title?: string;
  subtitle?: string;
}

/**
 * Card lateral de desconto — mesmo padrão visual do resumo financeiro da comanda/orçamento.
 */
export const DiscountCard: React.FC<DiscountCardProps> = ({
  title = 'Descontos',
  subtitle = 'Defina o tipo e o valor do desconto nesta cobrança.',
  ...discountProps
}) => {
  return (
    <section className="hub-quote-detail__card">
      <div className="hub-quote-detail__card-head hub-quote-detail__card-head--with-sub">
        <Percent size={20} strokeWidth={1.75} className="hub-quote-detail__card-ic" aria-hidden />
        <div>
          <h2 className="hub-quote-detail__card-title">{title}</h2>
          {subtitle ? <p className="hub-quote-detail__card-sub">{subtitle}</p> : null}
        </div>
      </div>
      <DiscountControl {...discountProps} />
    </section>
  );
};

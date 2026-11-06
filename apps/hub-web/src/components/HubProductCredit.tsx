import React from 'react';

type HubProductCreditProps = {
  className?: string;
};

/** Crédito discreto: o PetMi é um produto da Ladybug Labs. */
const HubProductCredit: React.FC<HubProductCreditProps> = ({ className }) => (
  <p className={['hub-product-credit', className].filter(Boolean).join(' ')}>
    Um produto da <span className="hub-product-credit__company">Ladybug Labs</span>
  </p>
);

export default HubProductCredit;

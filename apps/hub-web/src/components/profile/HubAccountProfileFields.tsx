import React, { type ReactNode } from 'react';

export type HubAccountProfileField = {
  label: string;
  value: ReactNode;
  block?: boolean;
};

type Props = {
  fields: HubAccountProfileField[];
};

const HubAccountProfileFields: React.FC<Props> = ({ fields }) => (
  <dl className="hub-ap__fields">
    {fields.map((field) => (
      <div key={field.label} className={`hub-ap__field${field.block ? ' hub-ap__field--block' : ''}`}>
        <dt className="hub-ap__field-label">{field.label}</dt>
        <dd className="hub-ap__field-value">{field.value}</dd>
      </div>
    ))}
  </dl>
);

export default HubAccountProfileFields;

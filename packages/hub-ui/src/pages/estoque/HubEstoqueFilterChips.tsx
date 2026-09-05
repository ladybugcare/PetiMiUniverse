export type HubEstoqueFilterChip<T extends string> = {
  id: T;
  label: string;
};

export type HubEstoqueFilterChipsProps<T extends string> = {
  ariaLabel: string;
  value: T;
  options: ReadonlyArray<HubEstoqueFilterChip<T>>;
  onChange: (id: T) => void;
};

function HubEstoqueFilterChips<T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
}: HubEstoqueFilterChipsProps<T>) {
  return (
    <div className="hub-estoque__filters" role="group" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          className={`hub-estoque__filter-chip${value === opt.id ? ' hub-estoque__filter-chip--active' : ''}`}
          aria-pressed={value === opt.id}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default HubEstoqueFilterChips;

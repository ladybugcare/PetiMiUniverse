import React from 'react';

export type HubCwsRegistryRow = {
  id: string;
  category: string;
  title: string;
  meta?: string;
  when?: string;
};

export function HubCwsGroupedRegistry({
  title,
  emptyLabel,
  rows,
}: {
  title: string;
  emptyLabel: string;
  rows: HubCwsRegistryRow[];
}) {
  return (
    <div className="hub-cws-registry">
      <h3 className="hub-cws-registry__title">{title}</h3>
      {rows.length === 0 ? (
        <p className="hub-clientes__muted hub-cws-registry__empty">{emptyLabel}</p>
      ) : (
        <ul className="hub-cws-registry__list">
          {rows.map((row) => (
            <li key={row.id} className="hub-cws-registry__item">
              <span className="hub-cws-registry__cat">{row.category}</span>
              <div className="hub-cws-registry__body">
                <div className="hub-cws-registry__name">{row.title}</div>
                {row.meta ? <div className="hub-cws-registry__meta">{row.meta}</div> : null}
              </div>
              {row.when ? <time className="hub-cws-registry__when">{row.when}</time> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

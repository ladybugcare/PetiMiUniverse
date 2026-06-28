import React, { useCallback, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import type { HubComandaDetailResponse } from '../../api/hubComandaApi';
import HubComandaPage from './HubComandaPage';
import HubComandaReceivablePanel from './HubComandaReceivablePanel';

export default function HubComandaFinancePage() {
  const { id: comandaId } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [detail, setDetail] = useState<HubComandaDetailResponse | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const selectedReceivableId = searchParams.get('receivable_id') ?? '';
  const receivableIds = detail?.active_receivable_ids ?? [];

  const onSelectReceivable = useCallback(
    (id: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('receivable_id', id);
        return next;
      });
    },
    [setSearchParams],
  );

  const onDetailLoaded = useCallback(
    (loaded: HubComandaDetailResponse) => {
      setDetail(loaded);
      const ids = loaded.active_receivable_ids ?? [];
      if (ids.length && !searchParams.get('receivable_id')) {
        onSelectReceivable(ids[0]!);
      }
    },
    [onSelectReceivable, searchParams],
  );

  const onRefreshComanda = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  if (!comandaId) {
    return null;
  }

  return (
    <HubComandaPage
      mode="financeiro"
      refreshKey={refreshKey}
      financePanel={
        <HubComandaReceivablePanel
          comandaId={comandaId}
          receivableIds={receivableIds}
          selectedReceivableId={selectedReceivableId}
          onSelectReceivable={onSelectReceivable}
          onRefreshComanda={onRefreshComanda}
        />
      }
      onDetailLoaded={onDetailLoaded}
    />
  );
}

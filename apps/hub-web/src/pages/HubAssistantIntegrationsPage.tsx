import React, { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '@petimi/web-core';

type Connection = {
  id: string;
  clinic_id: string;
  unit_id: string;
  provider: string;
  scopes: string[];
  status: string;
  created_at: string;
  revoked_at: string | null;
};

const HubAssistantIntegrationsPage: React.FC = () => {
  const [rows, setRows] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = (await apiRequest('/oauth/connections')) as { connections: Connection[] };
      setRows(res.connections || []);
    } catch (e: unknown) {
      setError((e as Error).message || 'Falha ao listar conexões');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = async (id: string) => {
    setBusyId(id);
    try {
      await apiRequest(`/oauth/connections/${id}/revoke`, { method: 'POST', body: '{}' });
      await load();
    } catch (e: unknown) {
      setError((e as Error).message || 'Falha ao revogar');
    } finally {
      setBusyId(null);
    }
  };

  const changeUnit = async (id: string) => {
    const unitId = window.prompt('Informe o UUID da nova unidade (mesma clínica):');
    if (!unitId?.trim()) return;
    setBusyId(id);
    try {
      await apiRequest(`/oauth/connections/${id}/unit`, {
        method: 'PATCH',
        body: JSON.stringify({ unit_id: unitId.trim() }),
      });
      await load();
    } catch (e: unknown) {
      setError((e as Error).message || 'Falha ao trocar unidade');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <h1>Integrações de assistentes</h1>
      <p>Gerencie conexões ChatGPT (MCP) vinculadas à sua conta PetMi.</p>
      {error && <p style={{ color: '#b00020' }}>{error}</p>}
      {loading ? (
        <p>Carregando…</p>
      ) : rows.length === 0 ? (
        <p>Nenhuma conexão encontrada.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th align="left">Provedor</th>
              <th align="left">Status</th>
              <th align="left">Unidade</th>
              <th align="left">Criada em</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.provider}</td>
                <td>{r.status}</td>
                <td style={{ fontSize: 12 }}>{r.unit_id}</td>
                <td>{new Date(r.created_at).toLocaleString('pt-BR')}</td>
                <td style={{ display: 'flex', gap: 8 }}>
                  {r.status === 'active' ? (
                    <>
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => void changeUnit(r.id)}
                      >
                        Trocar unidade
                      </button>
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => void revoke(r.id)}
                      >
                        Revogar
                      </button>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default HubAssistantIntegrationsPage;

import type { Request, Response } from 'express';
import { supabase } from '../../config/supabase';

interface CompletedDemand {
  id: string;
  clinicName: string;
  title: string;
  specialty?: string;
  completedAt: string;
}

export const getVetCompletedDemands = async (
  req: Request<{ id: string }, {}, {}, { clinic_id?: string }>,
  res: Response
) => {
  const { id: vetId } = req.params;
  const { clinic_id } = req.query;

  try {
    // Buscar aplicações aceitas do vet
    let applicationsQuery = supabase
      .from('position_applications')
      .select(
        `
        id,
        status,
        demand_positions!inner(
          id,
          specialty,
          master_demand_id,
          demands!inner(
            id,
            title,
            status,
            clinic_id,
            updated_at
          )
        )
      `
      )
      .eq('vet_id', vetId)
      .eq('status', 'accepted');

    const { data: applications, error: appsError } = await applicationsQuery;

    if (appsError) throw appsError;

    // Filtrar apenas demandas concluídas (status = 'closed')
    const completedDemands: CompletedDemand[] = [];
    const clinicIds = new Set<string>();

    if (applications) {
      for (const app of applications) {
        const demand = (app as any).demand_positions?.demands;
        if (!demand || demand.status !== 'closed') continue;

        // Filtrar por clinic_id se fornecido
        if (clinic_id && demand.clinic_id !== clinic_id) continue;

        if (demand.clinic_id) {
          clinicIds.add(demand.clinic_id);
        }
      }
    }

    // Buscar nomes das clínicas
    const clinicNamesMap = new Map<string, string>();
    if (clinicIds.size > 0) {
      const { data: clinics, error: clinicsError } = await supabase
        .from('clinics')
        .select('id, name')
        .in('id', Array.from(clinicIds));

      if (!clinicsError && clinics) {
        clinics.forEach((clinic: any) => {
          clinicNamesMap.set(clinic.id, clinic.name);
        });
      }
    }

    // Construir lista de demandas concluídas
    if (applications) {
      for (const app of applications) {
        const demand = (app as any).demand_positions?.demands;
        if (!demand || demand.status !== 'closed') continue;

        // Filtrar por clinic_id se fornecido
        if (clinic_id && demand.clinic_id !== clinic_id) continue;

        const clinicName = demand.clinic_id 
          ? (clinicNamesMap.get(demand.clinic_id) || 'Clínica desconhecida')
          : 'Clínica desconhecida';

        completedDemands.push({
          id: demand.id,
          clinicName,
          title: demand.title || 'Sem título',
          specialty: (app as any).demand_positions?.specialty,
          completedAt: demand.updated_at || new Date().toISOString(),
        });
      }
    }

    // Ordenar por data de conclusão (mais recente primeiro)
    completedDemands.sort((a, b) => {
      return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
    });

    res.json({ completedDemands });
  } catch (error: any) {
    console.error('Error getting vet completed demands:', error);
    res.status(500).json({ error: error.message || 'Failed to get completed demands' });
  }
};


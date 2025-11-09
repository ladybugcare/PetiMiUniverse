import type { Request, Response } from 'express';
import { supabase } from '../config/supabase';

interface ServiceHealth {
  status: 'healthy' | 'unhealthy' | 'degraded';
  message: string;
  latency?: number;
}

interface SystemHealth {
  api: ServiceHealth;
  database: ServiceHealth;
  storage: ServiceHealth;
  email: ServiceHealth;
  overall: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
}

export const getSystemHealth = async (req: Request, res: Response) => {
  try {
    // Verificar se é admin
    const user = req.user;
    const userRole = (user as any)?.user_metadata?.role || (user as any)?.role;

    if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado. Apenas administradores podem acessar esta rota.' });
    }

    const startTime = Date.now();
    const health: SystemHealth = {
      api: {
        status: 'healthy',
        message: 'API operacional',
        latency: 0,
      },
      database: {
        status: 'unhealthy',
        message: 'Verificando...',
      },
      storage: {
        status: 'unhealthy',
        message: 'Verificando...',
      },
      email: {
        status: 'healthy',
        message: 'Serviço de email configurado',
      },
      overall: 'healthy',
      timestamp: new Date().toISOString(),
    };

    // Verificar Database
    try {
      const dbStartTime = Date.now();
      const { error: dbError } = await supabase.from('clinics').select('id').limit(1);
      const dbLatency = Date.now() - dbStartTime;

      if (dbError) {
        health.database = {
          status: 'unhealthy',
          message: `Erro: ${dbError.message}`,
          latency: dbLatency,
        };
        health.overall = 'degraded';
      } else {
        health.database = {
          status: 'healthy',
          message: 'Conexão ativa',
          latency: dbLatency,
        };
      }
    } catch (error: any) {
      health.database = {
        status: 'unhealthy',
        message: `Erro ao conectar: ${error.message}`,
      };
      health.overall = 'degraded';
    }

    // Verificar Storage (Supabase Storage)
    try {
      const storageStartTime = Date.now();
      // Tentar listar buckets para verificar se o storage está acessível
      const { data: buckets, error: storageError } = await supabase.storage.listBuckets();
      const storageLatency = Date.now() - storageStartTime;

      if (storageError) {
        health.storage = {
          status: 'unhealthy',
          message: `Erro: ${storageError.message}`,
          latency: storageLatency,
        };
        if (health.overall === 'healthy') {
          health.overall = 'degraded';
        }
      } else {
        health.storage = {
          status: 'healthy',
          message: `${buckets?.length || 0} buckets disponíveis`,
          latency: storageLatency,
        };
      }
    } catch (error: any) {
      health.storage = {
        status: 'unhealthy',
        message: `Erro ao acessar: ${error.message}`,
      };
      if (health.overall === 'healthy') {
        health.overall = 'degraded';
      }
    }

    // Verificar Email Service (verificar se variáveis de ambiente estão configuradas)
    const emailConfigured = !!(
      process.env.SMTP_HOST ||
      process.env.RESEND_API_KEY ||
      process.env.SENDGRID_API_KEY
    );

    if (!emailConfigured) {
      health.email = {
        status: 'degraded',
        message: 'Configuração de email não encontrada',
      };
      if (health.overall === 'healthy') {
        health.overall = 'degraded';
      }
    }

    // Calcular latência total da API
    health.api.latency = Date.now() - startTime;

    // Determinar status geral
    const unhealthyCount = [
      health.database,
      health.storage,
      health.email,
    ].filter((s) => s.status === 'unhealthy').length;

    if (unhealthyCount > 0) {
      health.overall = 'unhealthy';
    } else if (
      health.database.status === 'degraded' ||
      health.storage.status === 'degraded' ||
      health.email.status === 'degraded'
    ) {
      health.overall = 'degraded';
    }

    const statusCode =
      health.overall === 'healthy' ? 200 : health.overall === 'degraded' ? 200 : 503;

    res.status(statusCode).json(health);
  } catch (error: any) {
    res.status(503).json({
      api: {
        status: 'unhealthy',
        message: 'Erro ao verificar saúde do sistema',
      },
      database: {
        status: 'unknown',
        message: 'Não verificado',
      },
      storage: {
        status: 'unknown',
        message: 'Não verificado',
      },
      email: {
        status: 'unknown',
        message: 'Não verificado',
      },
      overall: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
};


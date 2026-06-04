import { apiRequest } from './api';

export interface ServiceHealth {
  status: 'healthy' | 'unhealthy' | 'degraded' | 'unknown';
  message: string;
  latency?: number;
}

export interface SystemHealth {
  api: ServiceHealth;
  database: ServiceHealth;
  storage: ServiceHealth;
  email: ServiceHealth;
  overall: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
}

export const healthApi = {
  getSystemHealth: async (): Promise<SystemHealth> => {
    return apiRequest('/health/system', {
      method: 'GET',
    });
  },
};


import { supabase } from '../config/supabase';
import type { Request } from 'express';

interface AuditLogParams {
  user_id: string;
  clinic_id?: string;
  unit_id?: string;
  action: string;
  entity_type?: string;
  entity_id?: string;
  old_values?: any;
  new_values?: any;
  ip_address?: string;
  user_agent?: string;
}

export const createAuditLog = async (params: AuditLogParams) => {
  try {
    const { data, error } = await supabase.from('audit_logs').insert([
      {
        user_id: params.user_id,
        clinic_id: params.clinic_id,
        unit_id: params.unit_id,
        action: params.action,
        entity_type: params.entity_type,
        entity_id: params.entity_id,
        old_values: params.old_values,
        new_values: params.new_values,
        ip_address: params.ip_address,
        user_agent: params.user_agent,
      },
    ]);

    if (error) {
      console.error('Error creating audit log:', error);
    }

    return data;
  } catch (error) {
    console.error('Unexpected error in createAuditLog:', error);
    return null;
  }
};

// Helper function to extract IP and user agent from request
export const extractRequestMetadata = (req: Request) => {
  const ip_address =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
    req.socket.remoteAddress ||
    '';
  const user_agent = req.headers['user-agent'] || '';

  return { ip_address, user_agent };
};


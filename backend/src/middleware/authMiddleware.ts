import type { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { PERMISSIONS, Role } from '../utils/permissions';

// Extend Express Request to include user info
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email?: string;
        role?: string;
      };
    }
  }
}

// Authenticate user from session token
export const authenticateUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token de autenticação não fornecido' });
    }

    const token = authHeader.split(' ')[1];

    // Verify token with Supabase
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Token inválido ou expirado' });
    }

    // Attach user to request
    // O role pode estar em user_metadata ou raw_user_meta_data
    const role = user.user_metadata?.role || (user as any).raw_user_meta_data?.role;
    
    // Debug: log role para verificar
    if (!role) {
      console.warn('Warning: User role not found for user:', user.id, 'email:', user.email);
    }
    
    req.user = {
      id: user.id,
      email: user.email,
      role: role,
    };

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({ error: 'Erro na autenticação' });
  }
};

// Check if user has permission
export const checkPermission = async (
  user_id: string,
  clinic_id: string,
  permission: string
): Promise<boolean> => {
  try {
    // Buscar role do usuário na clínica
    const { data: clinicUser, error } = await supabase
      .from('clinic_users')
      .select('role')
      .eq('user_id', user_id)
      .eq('clinic_id', clinic_id)
      .eq('status', 'active')
      .single();

    if (error || !clinicUser) {
      return false;
    }

    // Verificar se role tem a permissão
    const userPermissions = PERMISSIONS[clinicUser.role as Role];
    return userPermissions ? userPermissions.includes(permission) : false;
  } catch (error) {
    console.error('Error checking permission:', error);
    return false;
  }
};

// Check if user has access to clinic
export const checkClinicAccess = async (
  user_id: string,
  clinic_id: string
): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('clinic_users')
      .select('id')
      .eq('user_id', user_id)
      .eq('clinic_id', clinic_id)
      .eq('status', 'active')
      .single();

    return !error && !!data;
  } catch (error) {
    console.error('Error checking clinic access:', error);
    return false;
  }
};

// Middleware to require specific permission
export const requirePermission = (permission: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user_id = req.user?.id;

      if (!user_id) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
      }

      // Extract clinic_id from various sources
      const clinic_id =
        req.body.clinic_id || req.params.clinic_id || req.query.clinic_id;

      if (!clinic_id) {
        return res.status(400).json({ error: 'clinic_id não fornecido' });
      }

      const hasPermission = await checkPermission(user_id, clinic_id as string, permission);

      if (!hasPermission) {
        return res.status(403).json({ error: 'Permissão negada' });
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({ error: 'Erro ao verificar permissões' });
    }
  };
};

// Middleware to require clinic access
export const requireClinicAccess = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user_id = req.user?.id;

    if (!user_id) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    const clinic_id =
      req.body.clinic_id || req.params.clinic_id || req.query.clinic_id;

    if (!clinic_id) {
      return res.status(400).json({ error: 'clinic_id não fornecido' });
    }

    const hasAccess = await checkClinicAccess(user_id, clinic_id as string);

    if (!hasAccess) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    next();
  } catch (error) {
    console.error('Clinic access check error:', error);
    return res.status(500).json({ error: 'Erro ao verificar acesso' });
  }
};


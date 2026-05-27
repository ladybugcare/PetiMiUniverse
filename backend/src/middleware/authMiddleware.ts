import type { Request, Response, NextFunction } from 'express';
import { supabase, supabaseAdmin } from '../config/supabase';
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
      // Log detalhado para debug (apenas em desenvolvimento)
      if (process.env.NODE_ENV === 'development') {
        console.error('Token validation error:', {
          error: error?.message,
          errorCode: error?.status,
          supabaseUrl: process.env.SUPABASE_URL?.substring(0, 30) + '...',
          tokenPreview: token.substring(0, 20) + '...',
        });
      }
      
      // Mensagem mais detalhada se for erro de configuração
      if (error?.message?.includes('Invalid API key') || error?.message?.includes('JWT')) {
        return res.status(401).json({ 
          error: 'Token inválido. Verifique se frontend e backend usam o mesmo projeto Supabase.',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
      }
      
      return res.status(401).json({ error: 'Token inválido ou expirado' });
    }

    // Attach user to request
    // O role está em user_metadata
    const role = user.user_metadata?.role;
    
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
  } catch (error: any) {
    console.error('Authentication error:', error);
    
    // Detectar problemas de configuração do Supabase
    if (error?.message?.includes('Invalid API key') || error?.message?.includes('SUPABASE')) {
      return res.status(500).json({ 
        error: 'Erro de configuração do Supabase. Verifique se SUPABASE_URL e SUPABASE_KEY estão corretos.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
    
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
    // Usar service role: estas verificações rodam após JWT válido; o client anon não tem
    // sessão RLS do usuário e devolve vazio → falsos negativos e 403 em /units/clinic/:id.
    const { data: clinicUser, error } = await supabaseAdmin
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
    // First check if user is the clinic owner (clinic.id === user_id)
    if (user_id === clinic_id) {
      // Verify clinic exists
      const { data: clinic, error: clinicError } = await supabaseAdmin
        .from('clinics')
        .select('id')
        .eq('id', clinic_id)
        .single();

      if (!clinicError && clinic) {
        return true;
      }
    }

    // Also check if user has a clinic_users entry
    const { data, error } = await supabaseAdmin
      .from('clinic_users')
      .select('id')
      .eq('user_id', user_id)
      .eq('clinic_id', clinic_id)
      .eq('status', 'active')
      .maybeSingle();

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


// ✅ Middleware para garantir que o usuário logado é um admin
export const verifyAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const user = req.user;

  if (!user) {
    return res.status(401).json({ error: 'Usuário não autenticado' });
  }

  const userRole = user.role?.toLowerCase();

  if (userRole !== 'admin') {
    return res
      .status(403)
      .json({ error: 'Acesso negado. Somente administradores podem executar esta ação.' });
  }

  next();
};

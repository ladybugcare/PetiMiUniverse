import type { Request, Response } from 'express'
import { supabase } from '../config/supabase'



interface ClinicBody {
  name: string
  cnpj: string
  address: string
  email: string
  password: string
}

export const createClinic = async (req: Request<{}, {}, ClinicBody>, res: Response) => {
  const { name, cnpj, address, email, password } = req.body

  try {
    console.log('Creating clinic with email:', email);

    // 1. Create user in Supabase Auth first
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          role: 'clinic'
        }
      }
    });

    if (authError) {
      console.error('Auth error:', authError);
      return res.status(400).json({ error: authError.message });
    }

    if (!authData.user) {
      console.error('No user data returned from signup');
      return res.status(400).json({ error: 'Failed to create user' });
    }

    console.log('Auth user created:', authData.user.id);

    // 2. Then create the clinic profile (linked to auth user, without password)
    const { data, error } = await supabase
      .from('clinics')
      .insert([{ 
        id: authData.user.id,  // Link to auth user
        name, 
        cnpj, 
        address, 
        email
        // NO PASSWORD HERE - it's stored securely in auth.users
      }])
      .select()

    if (error) {
      console.error('Profile creation error:', error);
      // If profile creation fails, ideally we'd delete the auth user
      // but for now, just return the error
      return res.status(400).json({ error: error.message || JSON.stringify(error) });
    }

    console.log('Clinic profile created successfully');

    res.status(201).json({ 
      clinic: data[0],
      user: authData.user,
      session: authData.session
    });
  } catch (error: any) {
    console.error('Unexpected error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

export const getClinics = async (_req: Request, res: Response) => {
  const { data, error } = await supabase.from('clinics').select('*')
  if (error) return res.status(400).json({ error })
  res.json({ clinics: data })
}

// Check if CNPJ already exists
export const checkCNPJ = async (req: Request, res: Response) => {
  const { cnpj } = req.params
  
  try {
    const { data, error } = await supabase
      .from('clinics')
      .select('cnpj')
      .eq('cnpj', cnpj)
      .limit(1)
    
    if (error) {
      return res.status(400).json({ error: error.message })
    }
    
    res.json({ exists: data && data.length > 0 })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

// Check if email already exists
export const checkEmail = async (req: Request, res: Response) => {
  const { email } = req.params
  
  try {
    const { data, error } = await supabase
      .from('clinics')
      .select('email')
      .eq('email', email)
      .limit(1)
    
    if (error) {
      return res.status(400).json({ error: error.message })
    }
    
    res.json({ exists: data && data.length > 0 })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

// Get clinic by ID
export const getClinicById = async (req: Request, res: Response) => {
  const { id } = req.params
  
  try {
    const { data, error } = await supabase
      .from('clinics')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) {
      return res.status(400).json({ error: error.message })
    }
    
    res.json({ clinic: data })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

// Update clinic
export const updateClinic = async (req: Request, res: Response) => {
  const { id } = req.params
  const updates = req.body
  
  try {
    // Remove fields that shouldn't be updated
    delete updates.id
    delete updates.created_at
    
    const { data, error } = await supabase
      .from('clinics')
      .update(updates)
      .eq('id', id)
      .select()
    
    if (error) {
      return res.status(400).json({ error: error.message })
    }
    
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Clinic not found' })
    }
    
    res.json({ clinic: data[0] })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

// Delete clinic (soft delete)
export const deleteClinic = async (req: Request, res: Response) => {
  const { id } = req.params
  
  try {
    // Soft delete by updating a deleted flag or setting inactive status
    const { data, error } = await supabase
      .from('clinics')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .select()
    
    if (error) {
      return res.status(400).json({ error: error.message })
    }
    
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Clinic not found' })
    }
    
    res.json({ message: 'Clinic deleted successfully', clinic: data[0] })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}
import type { Request, Response } from 'express'
import { supabase } from '../config/supabase'

interface VetBody {
  name: string
  crmv: string
  specialties: string[]
  certificates: string[]
  experience: string
  email: string
  password: string
}

export const createVet = async (req: Request<{}, {}, VetBody>, res: Response) => {
  const { name, crmv, specialties, certificates, experience, email, password } = req.body

  try {
    console.log('Creating vet with email:', email);

    // 1. Create user in Supabase Auth first
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          role: 'vet'
        },
        emailRedirectTo: `${process.env.FRONTEND_URL || 'http://localhost:3002'}/email-confirmed`
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

    // 2. Then create the vet profile (linked to auth user, without password)
    const { data, error } = await supabase
      .from('vets')
      .insert([{ 
        id: authData.user.id,  // Link to auth user
        name, 
        crmv, 
        specialties, 
        certificates: certificates || [], 
        experience, 
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

    console.log('Vet profile created successfully');

    res.status(201).json({ 
      vet: data[0],
      user: authData.user,
      session: authData.session
    });
  } catch (error: any) {
    console.error('Unexpected error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

export const getVets = async (_req: Request, res: Response) => {
  const { data, error } = await supabase.from('vets').select('*')
  if (error) return res.status(400).json({ error })
  res.json({ vets: data })
}

// Check if email already exists
export const checkEmail = async (req: Request, res: Response) => {
  const { email } = req.params
  
  try {
    const { data, error } = await supabase
      .from('vets')
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

// Get vet by ID
export const getVetById = async (req: Request, res: Response) => {
  const { id } = req.params
  
  try {
    const { data, error } = await supabase
      .from('vets')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) {
      return res.status(400).json({ error: error.message })
    }
    
    res.json({ vet: data })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

// Update vet
export const updateVet = async (req: Request, res: Response) => {
  const { id } = req.params
  const updates = req.body
  
  try {
    // Remove fields that shouldn't be updated
    delete updates.id
    delete updates.created_at
    
    const { data, error } = await supabase
      .from('vets')
      .update(updates)
      .eq('id', id)
      .select()
    
    if (error) {
      return res.status(400).json({ error: error.message })
    }
    
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Vet not found' })
    }
    
    res.json({ vet: data[0] })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

// Update vet photo
export const updateVetPhoto = async (req: Request, res: Response) => {
  const { id } = req.params
  const { photo_url } = req.body
  
  try {
    if (!photo_url) {
      return res.status(400).json({ error: 'photo_url is required' })
    }
    
    const { data, error } = await supabase
      .from('vets')
      .update({ photo_url })
      .eq('id', id)
      .select()
    
    if (error) {
      return res.status(400).json({ error: error.message })
    }
    
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Vet not found' })
    }
    
    res.json({ vet: data[0] })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

// Update vet status
export const updateVetStatus = async (req: Request, res: Response) => {
  const { id } = req.params
  const { status } = req.body
  
  try {
    if (!['active', 'pending', 'inactive'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' })
    }
    
    const { data, error } = await supabase
      .from('vets')
      .update({ status })
      .eq('id', id)
      .select()
    
    if (error) {
      return res.status(400).json({ error: error.message })
    }
    
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Vet not found' })
    }
    
    res.json({ vet: data[0] })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

// Delete vet (soft delete)
export const deleteVet = async (req: Request, res: Response) => {
  const { id } = req.params
  
  try {
    // Soft delete by updating a deleted flag
    const { data, error } = await supabase
      .from('vets')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .select()
    
    if (error) {
      return res.status(400).json({ error: error.message })
    }
    
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Vet not found' })
    }
    
    res.json({ message: 'Vet deleted successfully', vet: data[0] })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

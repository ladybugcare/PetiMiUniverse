import type { Request, Response } from 'express'
import { supabase } from '../config/supabase'

interface PetBody {
  name: string
  species: string
  breed: string
  age: number
  owner_id: string
}

export const createPet = async (req: Request<{}, {}, PetBody>, res: Response) => {
  const { name, species, breed, age, owner_id } = req.body

  const { data, error } = await supabase
    .from('pets')
    .insert([{ name, species, breed, age, owner_id }])
    .select()

  if (error) return res.status(400).json({ error })
  res.status(201).json({ pet: data[0] })
}

export const getPets = async (_req: Request, res: Response) => {
  const { data, error } = await supabase.from('pets').select('*')
  if (error) return res.status(400).json({ error })
  res.json({ pets: data })
}
import express from 'express';
import { supabase } from '../config/supabase';

const router = express.Router();

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return res.status(401).json({ error: error.message });
    }

    res.json({ 
      user: data.user,
      session: data.session 
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Signup
router.post('/signup', async (req, res) => {
  try {
    const { email, password, name, role } = req.body;
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          role,
        }
      }
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ 
      user: data.user,
      session: data.session 
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
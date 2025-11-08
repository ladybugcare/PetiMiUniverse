// backend/controllers/vets/checkVetDocument.ts
import type { Request, Response } from 'express';
import { supabase } from '../../config/supabase';

// Helper function to normalize document number (remove formatting)
const normalizeDocument = (doc: string): string => {
  return doc.replace(/[^\d]/g, '');
};

export const checkVetDocument = async (req: Request, res: Response) => {
  const { document_number } = req.params;
  
  try {
    // Normalizar o documento (remover formatação)
    const normalizedDocument = normalizeDocument(document_number);
    
    if (!normalizedDocument || (normalizedDocument.length !== 11 && normalizedDocument.length !== 14)) {
      return res.status(400).json({ 
        exists: false,
        error: 'Documento inválido' 
      });
    }

    // Verificar se a coluna existe antes de fazer a query
    // Se não existir, retorna false (documento não existe)
    const { data, error } = await supabase
      .from('vets')
      .select('id')
      .eq('document_number', normalizedDocument)
      .maybeSingle();

    if (error) {
      // Se o erro for porque a coluna não existe, retorna false
      if (error.message?.includes('column') || error.message?.includes('does not exist')) {
        return res.json({ exists: false });
      }
      throw error;
    }
    
    return res.json({ exists: !!data });
  } catch (error: any) {
    console.error('Erro ao verificar documento:', error);
    return res.status(500).json({ 
      exists: false,
      error: 'Erro ao verificar documento' 
    });
  }
};


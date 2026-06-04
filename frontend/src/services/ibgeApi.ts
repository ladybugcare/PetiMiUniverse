// Serviço para buscar dados de estados e cidades do IBGE
// API pública: https://servicodados.ibge.gov.br/api/v1/localidades

export interface IBGEState {
  id: number;
  sigla: string;
  nome: string;
}

export interface IBGECity {
  id: number;
  nome: string;
  microrregiao: {
    id: number;
    nome: string;
    mesorregiao: {
      id: number;
      nome: string;
      UF: {
        id: number;
        sigla: string;
        nome: string;
      };
    };
  };
}

// Cache para evitar múltiplas requisições
let statesCache: IBGEState[] | null = null;
const citiesCache: Record<string, IBGECity[]> = {};

export const ibgeApi = {
  /**
   * Busca todos os estados do Brasil
   */
  getStates: async (): Promise<IBGEState[]> => {
    // Se já temos no cache, retornar
    if (statesCache) {
      return statesCache;
    }

    try {
      const response = await fetch(
        'https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome'
      );
      
      if (!response.ok) {
        throw new Error('Erro ao buscar estados do IBGE');
      }

      const data: IBGEState[] = await response.json();
      // Salvar no cache
      statesCache = data;
      return data;
    } catch (error) {
      console.error('Erro ao buscar estados do IBGE:', error);
      throw error;
    }
  },

  /**
   * Busca todas as cidades de um estado específico
   * @param stateSigla - Sigla do estado (ex: 'SP', 'RJ')
   */
  getCitiesByState: async (stateSigla: string): Promise<IBGECity[]> => {
    // Se já temos no cache, retornar
    if (citiesCache[stateSigla]) {
      return citiesCache[stateSigla];
    }

    try {
      const response = await fetch(
        `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${stateSigla}/municipios?orderBy=nome`
      );
      
      if (!response.ok) {
        throw new Error(`Erro ao buscar cidades do estado ${stateSigla}`);
      }

      const data: IBGECity[] = await response.json();
      // Salvar no cache
      citiesCache[stateSigla] = data;
      return data;
    } catch (error) {
      console.error(`Erro ao buscar cidades do estado ${stateSigla}:`, error);
      throw error;
    }
  },

  /**
   * Busca estados que correspondem a um termo de busca
   * @param searchTerm - Termo para buscar (pode ser sigla ou nome)
   */
  searchStates: async (searchTerm: string): Promise<IBGEState[]> => {
    const states = await ibgeApi.getStates();
    const term = searchTerm.toLowerCase().trim();
    
    if (!term) {
      return states;
    }

    return states.filter(
      (state) =>
        state.sigla.toLowerCase().includes(term) ||
        state.nome.toLowerCase().includes(term)
    );
  },

  /**
   * Busca cidades de um estado que correspondem a um termo de busca
   * @param stateSigla - Sigla do estado
   * @param searchTerm - Termo para buscar
   */
  searchCities: async (stateSigla: string, searchTerm: string): Promise<IBGECity[]> => {
    const cities = await ibgeApi.getCitiesByState(stateSigla);
    const term = searchTerm.toLowerCase().trim();
    
    if (!term) {
      return cities;
    }

    return cities.filter((city) =>
      city.nome.toLowerCase().includes(term)
    );
  },
};


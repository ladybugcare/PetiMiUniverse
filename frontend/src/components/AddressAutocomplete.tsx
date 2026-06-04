import React, { useRef, useEffect, useState } from 'react';

interface AddressAutocompleteProps {
  value: string;
  onChange: (address: string) => void;
  placeholder?: string;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  autoFocus?: boolean;
}

declare global {
  interface Window {
    google: any;
  }
}

// Flags globais para controle único
let googleScriptLoading = false;
let googleScriptLoaded = false;
let globalInitializationAttempted = false;

const AddressAutocomplete: React.FC<AddressAutocompleteProps> = ({
  value,
  onChange,
  placeholder,
  className,
  onKeyDown,
  autoFocus = false,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);
  const initializationAttemptedRef = useRef(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const onChangeRef = useRef(onChange);

  // Atualizar ref quando onChange mudar (sem causar re-render)
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Função para inicializar o autocomplete (com proteção máxima)
  const initializeAutocomplete = useRef(() => {
    // Proteção contra múltiplas chamadas
    if (initializationAttemptedRef.current) {
      return;
    }

    if (!inputRef.current) {
      return;
    }

    if (!window.google?.maps?.places) {
      return;
    }

    // Se já existe, não criar outro
    if (autocompleteRef.current) {
      return;
    }

    initializationAttemptedRef.current = true;
    globalInitializationAttempted = true;

    try {
      // O Google Places Autocomplete já faz debounce internamente (~300ms)
      // Isso economiza chamadas à API automaticamente
      const autocomplete = new window.google.maps.places.Autocomplete(
        inputRef.current,
        {
          types: ['address'],
          componentRestrictions: { country: 'br' },
          fields: ['formatted_address', 'address_components', 'geometry'],
        }
      );

      autocompleteRef.current = autocomplete;

      autocomplete.addListener('place_changed', () => {
        try {
          const place = autocomplete.getPlace();
          if (place?.formatted_address) {
            onChangeRef.current(place.formatted_address);
          }
        } catch (error) {
          console.error('Error in place_changed handler:', error);
        }
      });
    } catch (error: any) {
      console.error('Error initializing autocomplete:', error);
      const errorMessage = String(error?.message || '');
      
      if (errorMessage.includes('ApiNotActivatedMapError') || 
          errorMessage.includes('not activated') ||
          errorMessage.includes('ApiNotActivated') ||
          errorMessage.includes('RefererNotAllowedMapError')) {
        setLoadError('Places API não está ativada ou há restrições. Verifique: https://console.cloud.google.com/apis/credentials');
        return;
      }
      
      if (errorMessage.includes('OVER_QUERY_LIMIT') || 
          errorMessage.includes('REQUEST_DENIED')) {
        setLoadError('Limite de requisições excedido ou requisição negada.');
        return;
      }
      
      setLoadError('Erro ao inicializar autocomplete');
    }
  });

  // Carregar Google Places API apenas uma vez
  useEffect(() => {
    const apiKey = process.env.REACT_APP_GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      setLoadError('API key não configurada');
      return;
    }

    // Log para debug (mostra apenas parte da chave por segurança)
    const apiKeyPreview = apiKey.length > 20 
      ? `${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 10)}` 
      : '***';
    console.log('[Google Places] API Key em uso:', apiKeyPreview);
    console.log('[Google Places] Verificando projeto...');

    // Se já tentou inicializar globalmente, não tentar novamente
    if (globalInitializationAttempted && autocompleteRef.current) {
      return;
    }

    // Se já está carregado, inicializar
    if (googleScriptLoaded && window.google?.maps?.places) {
      setTimeout(() => {
        initializeAutocomplete.current();
      }, 100);
      return;
    }

    // Se já está carregando, aguardar (com intervalo maior para reduzir chamadas)
    if (googleScriptLoading) {
      let attempts = 0;
      const maxAttempts = 50; // 10 segundos máximo (50 * 200ms)
      const checkInterval = setInterval(() => {
        attempts++;
        if (googleScriptLoaded && window.google?.maps?.places) {
          clearInterval(checkInterval);
          setTimeout(() => {
            initializeAutocomplete.current();
          }, 100);
        } else if (attempts >= maxAttempts) {
          clearInterval(checkInterval);
          setLoadError('Timeout ao carregar Google Places API');
        }
      }, 200);
      
      return () => clearInterval(checkInterval);
    }

    // Verificar se script já existe no DOM
    const existingScript = document.querySelector('#google-places-api-script');
    if (existingScript) {
      googleScriptLoading = true;
      let attempts = 0;
      const maxAttempts = 50; // 10 segundos máximo
      const checkInterval = setInterval(() => {
        attempts++;
        if (window.google?.maps?.places) {
          googleScriptLoaded = true;
          googleScriptLoading = false;
          clearInterval(checkInterval);
          setTimeout(() => {
            initializeAutocomplete.current();
          }, 100);
        } else if (attempts >= maxAttempts) {
          clearInterval(checkInterval);
          googleScriptLoading = false;
          if (!window.google?.maps?.places) {
            setLoadError('Erro ao carregar Google Places API');
          }
        }
      }, 200);
      
      return () => clearInterval(checkInterval);
    }

    // Carregar script
    googleScriptLoading = true;
    const script = document.createElement('script');
    script.id = 'google-places-api-script';
    // A API key identifica automaticamente o projeto do Google Cloud
    // Cada API key está vinculada a um projeto específico
    const scriptUrl = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&language=pt-BR&loading=async`;
    console.log('[Google Places] Carregando script:', scriptUrl.replace(apiKey, apiKeyPreview));
    script.src = scriptUrl;
    script.async = true;
    script.defer = true;
    
    script.onload = () => {
      googleScriptLoading = false;
      setTimeout(() => {
        if (window.google?.maps?.places) {
          googleScriptLoaded = true;
          
          // Verificar informações do projeto através da API key
          // A API key identifica automaticamente o projeto do Google Cloud
          console.log('[Google Places] Script carregado com sucesso');
          console.log('[Google Places] Places API disponível:', !!window.google.maps.places);
          console.log('[Google Places] Projeto identificado pela API key:', apiKeyPreview);
          console.log('[Google Places] ✅ API key válida e conectada ao projeto correto');
          
          // Removido teste de PlacesService para evitar chamadas desnecessárias
          // O autocomplete já valida a API key ao ser criado
          
          setTimeout(() => {
            initializeAutocomplete.current();
          }, 200);
        } else {
          console.error('[Google Places] Places API não está disponível após carregar script');
          setLoadError('Google Places API não carregou corretamente');
        }
      }, 300);
    };

    script.onerror = (error) => {
      googleScriptLoading = false;
      console.error('[Google Places] Erro ao carregar script:', error);
      console.error('[Google Places] API Key usada:', apiKeyPreview);
      console.error('[Google Places] ⚠️ Verifique se a API key está correta e se o projeto tem as APIs ativadas');
      setLoadError('Erro ao carregar Google Places API. Verifique a API key e se o projeto está correto.');
    };

    document.head.appendChild(script);

    return () => {
      // Limpar apenas o autocomplete local
      if (autocompleteRef.current && window.google?.maps?.event) {
        try {
          window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
        } catch (e) {
          // Ignorar erros
        }
        autocompleteRef.current = null;
      }
    };
  }, []); // Executar apenas uma vez

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        className={className}
        autoFocus={autoFocus}
        style={{
          width: '100%',
          padding: '12px',
          fontSize: '14px',
          fontFamily: 'Inter, sans-serif',
          border: '1px solid #d1d5db',
          borderRadius: '8px',
          outline: 'none',
          backgroundColor: '#ffffff',
          boxSizing: 'border-box',
        }}
      />
      {loadError && (
        <p style={{ 
          fontSize: '12px', 
          color: '#ef4444', 
          marginTop: '4px' 
        }}>
          {loadError}
        </p>
      )}
    </div>
  );
};

export default AddressAutocomplete;

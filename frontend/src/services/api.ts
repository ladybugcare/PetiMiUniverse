const API_BASE_URL = 'http://localhost:3000';

// Tipos base
interface SignUpData {
  role: 'vet' | 'clinic';
  name: string;
  email: string;
  password: string;
}

interface LoginData {
  email: string;
  password: string;
}

// Função base para requests
const apiRequest = async (endpoint: string, options: RequestInit = {}) => {
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
};

// Auth services
export const signUp = async (data: SignUpData) => {
  return apiRequest('/auth/signup', {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

export const login = async (data: LoginData) => {
  return apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

// Export da função base para outros services
export { apiRequest, API_BASE_URL };
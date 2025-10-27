import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { login } from '../services/api';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      alert('Por favor, preencha todos os campos.');
      return;
    }

    try {
      setLoading(true);
      const result = await login({ email, password });
      alert('Login realizado com sucesso!');
      console.log('Login result:', result);
    } catch (error: any) {
      alert('Erro no login: ' + (error.message || 'Tente novamente.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{background: 'linear-gradient(135deg, var(--primary-50) 0%, var(--accent-50) 100%)'}}>
      <div className="w-full max-w-md">
        <div className="modern-card p-8 animate-fade-in-up">
          <div className="text-center mb-8">
            <h1 className="text-display text-4xl font-bold mb-2 text-neutral-800">
              Bem-vindo de volta
            </h1>
            <p className="text-neutral-600">Faça login na sua conta PetiVet</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Email
              </label>
              <input
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Senha
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`btn btn-primary w-full text-lg relative ${
                loading ? 'loading' : ''
              }`}
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <div className="mt-8 text-center">
            <Link 
              to="/" 
              className="btn btn-outline w-full"
            >
              ← Voltar ao início
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;

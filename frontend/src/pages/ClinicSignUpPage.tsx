import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { clinicsApi } from '../services/clinicsApi';

const ClinicSignUpPage: React.FC = () => {
  const [name, setName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name || !cnpj || !address || !email || !password) {
      alert('Por favor, preencha todos os campos.');
      return;
    }

    try {
      setLoading(true);

      const result = await clinicsApi.create({
        name,
        cnpj,
        address,
        email,
        password,
      });

      alert('Clínica cadastrada com sucesso!');
      console.log('Clínica criada:', result.clinic);
      
      // Limpar campos
      setName('');
      setCnpj('');
      setAddress('');
      setEmail('');
      setPassword('');
    } catch (err: any) {
      alert('Erro ao cadastrar: ' + (err.message || 'Tente novamente.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen py-16 px-4" style={{background: 'linear-gradient(135deg, var(--secondary-50) 0%, var(--primary-50) 100%)'}}>
      <div className="container max-w-2xl">
        <div className="text-center mb-12">
          <h1 className="text-display text-5xl font-bold mb-4 text-neutral-800">
            Cadastre sua Clínica 🏥
          </h1>
          <p className="text-xl text-neutral-600">Junte-se à nossa rede de clínicas veterinárias</p>
        </div>

        <div className="modern-card p-8 animate-fade-in-up">
          <form onSubmit={handleSignUp} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Nome da Clínica
                </label>
                <input
                  type="text"
                  placeholder="Ex: Clínica Veterinária PetCare"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  CNPJ
                </label>
                <input
                  type="text"
                  placeholder="00.000.000/0000-00"
                  value={cnpj}
                  onChange={(e) => setCnpj(e.target.value)}
                  className="input"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Endereço Completo
              </label>
              <input
                type="text"
                placeholder="Rua, número, bairro, cidade - UF"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="input"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  placeholder="contato@clinica.com"
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
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`btn btn-secondary w-full text-lg relative ${
                loading ? 'loading' : ''
              }`}
            >
              {loading ? 'Cadastrando...' : 'Criar conta da clínica'}
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

export default ClinicSignUpPage;

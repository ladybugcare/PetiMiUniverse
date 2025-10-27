import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { vetsApi } from '../services/vetsApi';

const VetSignUpPage: React.FC = () => {
  const [name, setName] = useState('');
  const [crmv, setCrmv] = useState('');
  const [specialties, setSpecialties] = useState('');
  const [experience, setExperience] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name || !crmv || !specialties || !experience || !email || !password) {
      alert('Por favor, preencha todos os campos.');
      return;
    }

    try {
      setLoading(true);

      const result = await vetsApi.create({
        name,
        crmv,
        specialties: specialties.split(',').map(s => s.trim()),
        experience,
        email,
        password,
      });

      alert('Veterinário cadastrado com sucesso!');
      console.log('Veterinário criado:', result.vet);
      
      // Limpar campos
      setName('');
      setCrmv('');
      setSpecialties('');
      setExperience('');
      setEmail('');
      setPassword('');
    } catch (err: any) {
      alert('Erro ao cadastrar: ' + (err.message || 'Tente novamente.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen py-16 px-4" style={{background: 'linear-gradient(135deg, var(--accent-50) 0%, var(--primary-50) 100%)'}}>
      <div className="container max-w-2xl">
        <div className="text-center mb-12">
          <h1 className="text-display text-5xl font-bold mb-4 text-neutral-800">
            Cadastre-se como Veterinário 🩺
          </h1>
          <p className="text-xl text-neutral-600">Junte-se à nossa rede de profissionais veterinários</p>
        </div>

        <div className="modern-card p-8 animate-fade-in-up">
          <form onSubmit={handleSignUp} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Nome Completo
              </label>
              <input
                type="text"
                placeholder="Dr. João Silva"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  CRMV
                </label>
                <input
                  type="text"
                  placeholder="12345-SP"
                  value={crmv}
                  onChange={(e) => setCrmv(e.target.value)}
                  className="input"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Anos de Experiência
                </label>
                <input
                  type="text"
                  placeholder="Ex: 5 anos"
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                  className="input"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Especialidades
              </label>
              <input
                type="text"
                placeholder="Cirurgia, Clínica Geral, Cardiologia (separadas por vírgula)"
                value={specialties}
                onChange={(e) => setSpecialties(e.target.value)}
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
                  placeholder="dr.joao@email.com"
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
              className={`btn btn-accent w-full text-lg relative ${
                loading ? 'loading' : ''
              }`}
            >
              {loading ? 'Cadastrando...' : 'Criar conta de veterinário'}
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

export default VetSignUpPage;

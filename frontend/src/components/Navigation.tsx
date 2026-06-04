import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ClipboardList, FileText, Heart, Plus } from 'lucide-react';

interface NavigationProps {
  user?: any;
  onLogout?: () => void;
}

const Navigation: React.FC<NavigationProps> = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('session');
    if (onLogout) onLogout();
    navigate('/login');
  };

  const isActive = (path: string) => location.pathname === path;

  // Get user role from localStorage if not provided
  const userData = user || JSON.parse(localStorage.getItem('user') || '');
  const userRole = userData?.user_metadata?.role || userData?.role;

  return (
    <>
      {/* Top Navigation Bar */}
      <nav className="bg-white shadow-md fixed top-0 left-0 right-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/demands" className="flex items-center space-x-2">
              <Heart className="w-7 h-7 shrink-0" style={{ color: '#A36B6B' }} aria-hidden strokeWidth={2} />
              <span className="text-xl font-bold" style={{ color: '#A36B6B' }}>PetMi Vet</span>
            </Link>

            {/* Desktop Menu */}
            <div className="hidden md:flex items-center space-x-6">
              <Link
                to="/demands"
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive('/demands')
                    ? 'bg-primary-100 text-primary-700'
                    : 'text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                Demandas
              </Link>

              {userRole === 'clinic' && (
                <Link
                  to="/create-demand"
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive('/create-demand')
                      ? 'bg-primary-100 text-primary-700'
                      : 'text-neutral-700 hover:bg-neutral-100'
                  }`}
                >
                  Nova Demanda
                </Link>
              )}

              {userRole === 'vet' && (
                <Link
                  to="/my-applications"
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive('/my-applications')
                      ? 'bg-primary-100 text-primary-700'
                      : 'text-neutral-700 hover:bg-neutral-100'
                  }`}
                >
                  Minhas Candidaturas
                </Link>
              )}

              <div className="flex items-center space-x-3">
                <span className="text-sm text-neutral-600">
                  {userData?.email || userData?.user_metadata?.name}
                </span>
              </div>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="md:hidden p-2 rounded-md text-neutral-600 hover:bg-neutral-100"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                {isSidebarOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                )}
              </svg>
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Sidebar */}
      {isSidebarOpen && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />

          {/* Sidebar */}
          <div className="fixed top-0 right-0 h-full w-64 bg-white shadow-lg z-50 md:hidden transform transition-transform">
            <div className="p-6">
              <div className="flex items-center justify-between mb-8">
                <span className="text-xl font-bold text-primary-600">Menu</span>
                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className="p-2 rounded-md hover:bg-neutral-100"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <Link
                  to="/demands"
                  onClick={() => setIsSidebarOpen(false)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive('/demands')
                      ? 'bg-primary-100 text-primary-700'
                      : 'text-neutral-700 hover:bg-neutral-100'
                  }`}
                >
                  <ClipboardList className="w-4 h-4 shrink-0" aria-hidden />
                  Demandas
                </Link>

                {userRole === 'clinic' && (
                  <Link
                    to="/create-demand"
                    onClick={() => setIsSidebarOpen(false)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive('/create-demand')
                        ? 'bg-primary-100 text-primary-700'
                        : 'text-neutral-700 hover:bg-neutral-100'
                    }`}
                  >
                    <Plus className="w-4 h-4 shrink-0" aria-hidden />
                    Nova Demanda
                  </Link>
                )}

                {userRole === 'vet' && (
                  <Link
                    to="/my-applications"
                    onClick={() => setIsSidebarOpen(false)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive('/my-applications')
                        ? 'bg-primary-100 text-primary-700'
                        : 'text-neutral-700 hover:bg-neutral-100'
                    }`}
                  >
                    <FileText className="w-4 h-4 shrink-0" aria-hidden />
                    Minhas Candidaturas
                  </Link>
                )}

                <div className="pt-4 border-t border-neutral-200">
                  <div className="px-4 py-2 text-sm text-neutral-600">
                    {userData?.email || userData?.user_metadata?.name}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Spacer to prevent content from going under fixed navbar */}
      <div className="h-16" />
    </>
  );
};

export default Navigation;


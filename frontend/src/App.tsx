import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import ClinicSignUpPage from './pages/ClinicSignUpPage';
import VetSignUpPage from './pages/VetSignUpPage';
import DemandsPage from './pages/DemandsPage';
import './App.css';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/clinic-signup" element={<ClinicSignUpPage />} />
          <Route path="/vet-signup" element={<VetSignUpPage />} />
          <Route path="/demands" element={<DemandsPage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;

import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { BrowserRouter } from 'react-router-dom';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

// Nota: React.StrictMode em desenvolvimento causa double render dos useEffect,
// o que pode duplicar requisições. Isso é esperado e ajuda a detectar problemas.
// O rate limiter no backend foi ajustado para suportar isso em desenvolvimento.
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

reportWebVitals();

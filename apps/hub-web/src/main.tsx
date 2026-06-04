import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { setHubUiConfig } from '@petimi/hub-ui';
import App from './App';
import './index.css';

setHubUiConfig({
  vetWebUrl: import.meta.env.VITE_VET_WEB_URL || '',
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

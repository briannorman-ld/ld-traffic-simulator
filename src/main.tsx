import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { installNetworkLog } from './sim/networkLog';

// Install before anything can call fetch, so every SDK and API request is logged.
installNetworkLog();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

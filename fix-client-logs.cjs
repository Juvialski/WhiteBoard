const fs = require('fs');
let code = fs.readFileSync('src/main.tsx', 'utf8');

const replacement = `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Global error logger
window.addEventListener('error', (event) => {
  try {
    fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        level: 'error',
        message: \`Uncaught error: \${event.message}\`,
        data: { filename: event.filename, lineno: event.lineno, colno: event.colno }
      })
    });
  } catch (e) {
    // Ignore fetch errors to avoid loops
  }
});

window.addEventListener('unhandledrejection', (event) => {
  try {
    fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        level: 'error',
        message: \`Unhandled promise rejection: \${event.reason}\`
      })
    });
  } catch (e) {
    // Ignore
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`;

fs.writeFileSync('src/main.tsx', replacement);

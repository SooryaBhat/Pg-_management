import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

const hasApiKey = !!import.meta.env.VITE_GEMINI_API_KEY;
console.log(hasApiKey ? 'API key found' : 'API key missing');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

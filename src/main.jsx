import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Auto-seed Gemini API key from environment into localStorage
// so the AI client can pick it up immediately without any user action
const envGeminiKey = import.meta.env.VITE_GEMINI_API_KEY;
if (envGeminiKey && !localStorage.getItem('xecute_gemini_key')) {
  localStorage.setItem('xecute_gemini_key', envGeminiKey);
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

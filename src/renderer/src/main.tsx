import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router';
import { App } from './app';
import './styles.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><HashRouter><App /></HashRouter></React.StrictMode>);

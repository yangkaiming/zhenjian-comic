import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';
import './styles/reader.css';
import './styles/feedback-override.css';

const el = document.getElementById('root');
if (el) createRoot(el).render(<App />);

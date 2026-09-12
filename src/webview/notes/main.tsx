import { createRoot } from 'react-dom/client';
import '../ui/tokens.css';
import './notes.css';
import { App } from './App';

const container = document.getElementById('root');
if (!container) throw new Error('PaperDesk: the webview shell is missing its #root element.');

createRoot(container).render(<App />);

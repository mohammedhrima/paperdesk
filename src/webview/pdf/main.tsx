import { createRoot } from 'react-dom/client';
import '../ui/tokens.css';
import './pdf.css';
import { Viewer } from './Viewer';

const container = document.getElementById('root');
if (!container) throw new Error('PaperDesk: the webview shell is missing its #root element.');

createRoot(container).render(<Viewer />);

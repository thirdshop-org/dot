import { AuthProvider } from './context/AuthContext';
import Index from './app/index.jsx';

export default function App() {
  return (
    <AuthProvider>
      <Index />
    </AuthProvider>
  );
}
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import Dashboard from '@/pages/Dashboard';
import Institutions from '@/pages/Institutions';
import Institution from '@/pages/Institution';
import Compare from '@/pages/Compare';
import Queries from '@/pages/Queries';
import Explore from '@/pages/Explore';
import Programs from '@/pages/Programs';
import Historic from '@/pages/Historic';
import Dictionary from '@/pages/Dictionary';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

const navLinks = [
  { path: '/', label: 'Dashboard' },
  { path: '/explore', label: 'Explore' },
  { path: '/programs', label: 'Programs' },
  { path: '/institutions', label: 'Institutions' },
  { path: '/historic', label: 'Historic' },
  { path: '/compare', label: 'Compare' },
  { path: '/queries', label: 'Queries' },
  { path: '/dictionary', label: 'Dictionary' },
];

function Navigation() {
  const location = useLocation();
  const { user, logout, isAuthenticated } = useAuth();

  return (
    <nav className="border-b bg-background">
      <div className="container mx-auto px-4">
        <div className="flex h-14 items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/" className="font-semibold text-lg">IPEDS Explorer</Link>
            <div className="flex gap-4">
              {navLinks.map(({ path, label }) => (
                <Link
                  key={path}
                  to={path}
                  className={cn(
                    "text-sm transition-colors hover:text-foreground",
                    location.pathname === path ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            {isAuthenticated ? (
              <>
                <span className="text-sm text-muted-foreground">
                  {user?.username}
                </span>
                <button
                  onClick={() => logout()}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link
                to="/login"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

function AppContent() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/institutions" element={<Institutions />} />
          <Route path="/institutions/:unitid" element={<Institution />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/queries" element={
            <ProtectedRoute>
              <Queries />
            </ProtectedRoute>
          } />
          <Route path="/explore" element={<Explore />} />
          <Route path="/programs" element={<Programs />} />
          <Route path="/programs/:code" element={<Programs />} />
          <Route path="/programs/:code/institutions" element={<Programs />} />
          <Route path="/historic" element={<Historic />} />
          <Route path="/dictionary" element={<Dictionary />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;

import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import Dashboard from '@/pages/Dashboard';
import Institutions from '@/pages/Institutions';
import Institution from '@/pages/Institution';
import Compare from '@/pages/Compare';
import Queries from '@/pages/Queries';
import Explore from '@/pages/Explore';
import Programs from '@/pages/Programs';

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
  { path: '/compare', label: 'Compare' },
  { path: '/queries', label: 'Queries' },
];

function Navigation() {
  const location = useLocation();

  return (
    <nav className="border-b bg-background">
      <div className="container mx-auto px-4">
        <div className="flex h-14 items-center gap-6">
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
      </div>
    </nav>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen bg-background">
          <Navigation />
          <main className="container mx-auto px-4 py-6">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/institutions" element={<Institutions />} />
              <Route path="/institutions/:unitid" element={<Institution />} />
              <Route path="/compare" element={<Compare />} />
              <Route path="/queries" element={<Queries />} />
              <Route path="/explore" element={<Explore />} />
              <Route path="/programs" element={<Programs />} />
              <Route path="/programs/:code" element={<Programs />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;

import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { Zap, BarChart3, Map, Database } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import PowerPlants from './pages/PowerPlants'
import PowerPlantDetail from './pages/PowerPlantDetail'

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b bg-card">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <Link to="/" className="flex items-center gap-2">
                <Zap className="h-8 w-8 text-primary" />
                <span className="text-2xl font-bold">Datagoose</span>
              </Link>
              <nav className="flex items-center gap-6">
                <Link
                  to="/"
                  className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <BarChart3 className="h-4 w-4" />
                  Dashboard
                </Link>
                <Link
                  to="/power-plants"
                  className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Database className="h-4 w-4" />
                  Power Plants
                </Link>
                <a
                  href="http://localhost:3000/api/docs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Map className="h-4 w-4" />
                  API Docs
                </a>
              </nav>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="container mx-auto px-4 py-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/power-plants" element={<PowerPlants />} />
            <Route path="/power-plants/:id" element={<PowerPlantDetail />} />
          </Routes>
        </main>

        {/* Footer */}
        <footer className="border-t bg-card mt-auto">
          <div className="container mx-auto px-4 py-4 text-center text-sm text-muted-foreground">
            Global Power Plant Database - 34,936 power plants worldwide
          </div>
        </footer>
      </div>
    </BrowserRouter>
  )
}

export default App

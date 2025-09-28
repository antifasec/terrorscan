import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom'
import HomePage from './pages/HomePage'
import GraphPage from './pages/GraphPage'
import './App.css'

function AppContent() {
  const location = useLocation()

  // Determine if we're in home mode for styling
  const isHomeMode = location.pathname === '/' || location.pathname === '/terrorscan' || location.pathname === '/terrorscan/'

  return (
    <div className={`app ${isHomeMode ? 'home-mode' : ''}`}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/graph" element={<GraphPage />} />
        <Route path="/graph/*" element={<GraphPage />} />
        <Route path="*" element={<HomePage />} />
      </Routes>
    </div>
  )
}

function App() {
  return (
    <Router basename="/terrorscan">
      <AppContent />
    </Router>
  )
}

export default App

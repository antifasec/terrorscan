import { useState } from 'react'
import FileUpload from './components/FileUpload'
import FileExplorer from './components/FileExplorer'
import NetworkGraph3D from './components/NetworkGraph3D'
import './App.css'

function App() {
  const [graphData, setGraphData] = useState(null)
  const [fileName, setFileName] = useState('')
  const [currentView, setCurrentView] = useState('home') // 'home', 'graph'

  const handleDataLoaded = (data, name) => {
    setGraphData(data)
    setFileName(name)
    setCurrentView('graph')
  }

  const handleReset = () => {
    setGraphData(null)
    setFileName('')
    setCurrentView('home')
  }

  return (
    <div className={`app ${currentView === 'home' ? 'home-mode' : ''}`}>
      {currentView === 'home' ? (
        <div className="home-view">
          <div className="main-content">
            <div className="section">
              <h2>📁 Browse Scan Data</h2>
              <FileExplorer onFileSelected={handleDataLoaded} />
            </div>

            <div className="section">
              <h2>📤 Upload Custom File</h2>
              <FileUpload onDataLoaded={handleDataLoaded} />
            </div>
          </div>
        </div>
      ) : (
        <NetworkGraph3D data={graphData} onReset={handleReset} fileName={fileName} />
      )}
    </div>
  )
}

export default App

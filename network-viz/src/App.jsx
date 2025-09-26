import { useState } from 'react'
import FileUpload from './components/FileUpload'
import NetworkGraph3D from './components/NetworkGraph3D'
import './App.css'

function App() {
  const [graphData, setGraphData] = useState(null)
  const [fileName, setFileName] = useState('')

  const handleDataLoaded = (data, name) => {
    setGraphData(data)
    setFileName(name)
  }

  const handleReset = () => {
    setGraphData(null)
    setFileName('')
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Network Visualization 3D</h1>
        {graphData && (
          <div className="current-file">
            <span>Loaded: {fileName}</span>
            <button onClick={handleReset} className="reset-btn">
              Load New File
            </button>
          </div>
        )}
      </header>

      {!graphData ? (
        <FileUpload onDataLoaded={handleDataLoaded} />
      ) : (
        <NetworkGraph3D data={graphData} />
      )}
    </div>
  )
}

export default App

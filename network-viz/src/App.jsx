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
      {!graphData ? (
        <FileUpload onDataLoaded={handleDataLoaded} />
      ) : (
        <NetworkGraph3D data={graphData} onReset={handleReset} fileName={fileName} />
      )}
    </div>
  )
}

export default App

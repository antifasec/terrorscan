import { BrowserRouter as Router, useSearchParams } from 'react-router-dom'
import { useState, useEffect } from 'react'
import NetworkGraph3D from './components/NetworkGraph3D'
import './App.css'

function AppContent() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedDatasets, setSelectedDatasets] = useState(new Set())

  // Parse datasets from URL query params on load
  useEffect(() => {
    const datasetsParam = searchParams.get('datasets')
    if (datasetsParam) {
      const datasetIds = datasetsParam.split(',').filter(id => id.trim())
      setSelectedDatasets(new Set(datasetIds))
    }
  }, [searchParams])

  // Update URL when selected datasets change
  const updateURL = (newDatasets) => {
    if (newDatasets.size > 0) {
      setSearchParams({ datasets: Array.from(newDatasets).join(',') })
    } else {
      setSearchParams({})
    }
  }

  // Handle dataset selection changes from the NetworkGraph3D component
  const handleDatasetSelectionChange = (newDatasets) => {
    setSelectedDatasets(newDatasets)
    updateURL(newDatasets)
  }

  return (
    <div className="app">
      <NetworkGraph3D
        selectedDatasets={selectedDatasets}
        onDatasetSelectionChange={handleDatasetSelectionChange}
      />
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

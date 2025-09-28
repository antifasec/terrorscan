import { useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import NetworkGraph3D from '../components/NetworkGraph3D'

function GraphPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [graphData, setGraphData] = useState(null)
  const [fileName, setFileName] = useState('')

  useEffect(() => {
    if (location.state?.graphData) {
      setGraphData(location.state.graphData)
      setFileName(location.state.fileName || 'Network Data')
    } else {
      // If no data is provided, redirect to home
      navigate('/', { replace: true })
    }
  }, [location.state, navigate])

  const handleReset = () => {
    navigate('/')
  }

  if (!graphData) {
    return (
      <div className="loading-container">
        <div>Loading graph data...</div>
      </div>
    )
  }

  return <NetworkGraph3D data={graphData} onReset={handleReset} fileName={fileName} />
}

export default GraphPage
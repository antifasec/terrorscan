import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import NetworkGraph3D from '../components/NetworkGraph3D'

function GraphPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const params = useParams()
  const [graphData, setGraphData] = useState(null)
  const [fileName, setFileName] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (location.state?.graphData) {
      // Data provided via navigation state - this is the preferred method
      setGraphData(location.state.graphData)
      setFileName(location.state.fileName || 'Network Data')
    } else {
      // Check if we have a file path in the URL to load
      const filePath = params['*'] // This captures the wildcard part
      if (filePath) {
        loadFileFromPath(filePath)
      } else {
        // If no data and no path, redirect to home
        navigate('/', { replace: true })
      }
    }
  }, [location.state, navigate, params])

  const loadFileFromPath = async (filePath) => {
    setLoading(true)
    try {
      // Reconstruct the file URL from the path with /terrorscan base
      // If filePath already includes path info, use it directly, otherwise construct it
      const fileUrl = filePath.startsWith('/') ? `/terrorscan${filePath}` : `/terrorscan/public/data/${filePath}`

      const response = await fetch(fileUrl)
      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.status}`)
      }

      const data = await response.json()
      const fileName = filePath.split('/').pop() || 'Network Data'

      setGraphData(data)
      setFileName(fileName)
    } catch (err) {
      console.error('Error loading file from path:', err)
      // Redirect to home if file can't be loaded
      navigate('/', { replace: true })
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    navigate('/')
  }

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <div>Loading graph data...</div>
      </div>
    )
  }

  if (!graphData) {
    return (
      <div className="loading-container">
        <div>No graph data available</div>
        <button onClick={() => navigate('/')}>Return to Home</button>
      </div>
    )
  }

  return <NetworkGraph3D data={graphData} onReset={handleReset} fileName={fileName} />
}

export default GraphPage
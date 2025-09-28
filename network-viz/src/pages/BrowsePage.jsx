import { useNavigate } from 'react-router-dom'
import FileExplorer from '../components/FileExplorer'

function BrowsePage() {
  const navigate = useNavigate()

  const handleFileSelected = (data, name, filePath) => {
    // Navigate to graph view with data - include file path in URL if available
    if (filePath) {
      navigate(`/graph/${filePath}`, {
        state: {
          graphData: data,
          fileName: name,
          filePath: filePath
        }
      })
    } else {
      navigate('/graph', {
        state: {
          graphData: data,
          fileName: name
        }
      })
    }
  }

  const handleGoHome = () => {
    navigate('/')
  }

  return (
    <div className="browse-page">
      <div className="page-header">
        <button onClick={handleGoHome} className="back-button">
          ← Back to Home
        </button>
        <h1>📁 Browse Scan Data</h1>
        <p>Explore all available network scan results</p>
      </div>

      <div className="browse-content">
        <FileExplorer onFileSelected={handleFileSelected} />
      </div>
    </div>
  )
}

export default BrowsePage
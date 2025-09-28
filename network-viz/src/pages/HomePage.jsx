import { useNavigate } from 'react-router-dom'
import FileUpload from '../components/FileUpload'
import FileExplorer from '../components/FileExplorer'

function HomePage() {
  const navigate = useNavigate()

  const handleDataLoaded = (data, name, filePath) => {
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

  return (
    <div className="home-view">
      <div className="main-content">
        <div className="browse-header">
          <h2>📁 Browse Scan Data</h2>
        </div>

        <FileExplorer onFileSelected={handleDataLoaded} showUpload={true} />
      </div>
    </div>
  )
}

export default HomePage
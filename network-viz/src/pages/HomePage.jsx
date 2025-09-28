import { useNavigate } from 'react-router-dom'
import FileUpload from '../components/FileUpload'
import FileExplorer from '../components/FileExplorer'

function HomePage() {
  const navigate = useNavigate()

  const handleDataLoaded = (data, name) => {
    // Navigate to graph view with data
    navigate('/graph', {
      state: {
        graphData: data,
        fileName: name
      }
    })
  }

  const handleBrowseAll = () => {
    navigate('/browse')
  }

  return (
    <div className="home-view">
      <div className="main-content">
        <div className="upload-browse-container">
          <div className="unified-section">
            <div className="section-header">
              <span className="section-icon">⬆️</span>
              <div>
                <h2 className="section-title">Upload Network File</h2>
                <p className="section-subtitle">Drop your network data files or click to browse</p>
              </div>
            </div>
            <FileUpload onDataLoaded={handleDataLoaded} />
          </div>

          <div className="section-divider">
            <span>or</span>
          </div>

          <div className="unified-section">
            <div className="section-header">
              <span className="section-icon">📁</span>
              <div>
                <h2 className="section-title">Browse Scan Data</h2>
                <p className="section-subtitle">Explore network scans from public datasets</p>
              </div>
              <button onClick={handleBrowseAll} className="browse-all-btn">
                View All →
              </button>
            </div>
            <FileExplorer onFileSelected={handleDataLoaded} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default HomePage
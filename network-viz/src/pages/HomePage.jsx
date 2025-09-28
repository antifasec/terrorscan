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
        <div className="browse-header">
          <h2>📁 Browse Scan Data</h2>
          <button onClick={handleBrowseAll} className="browse-all-btn">
            View All →
          </button>
        </div>

        <FileExplorer onFileSelected={handleDataLoaded} showUpload={true} />
      </div>
    </div>
  )
}

export default HomePage
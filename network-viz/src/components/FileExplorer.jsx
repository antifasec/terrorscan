import { useState, useEffect } from 'react'
import './FileExplorer.css'

function FileExplorer({ onFileSelected }) {
  const [manifest, setManifest] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Column view navigation state
  const [columns, setColumns] = useState([])
  const [selectedPath, setSelectedPath] = useState([])
  const [previewData, setPreviewData] = useState(null)

  // Mobile navigation state
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640)
  const [currentColumnIndex, setCurrentColumnIndex] = useState(0)

  useEffect(() => {
    fetchManifest()

    // Listen for resize events to update mobile state
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const fetchManifest = async () => {
    try {
      setLoading(true)
      setError(null)

      // Try to fetch manifest from the correct base URL
      const baseUrl = import.meta.env.BASE_URL || '/'
      const manifestUrl = `${baseUrl}public/data/manifest.json`

      console.log('Fetching manifest from:', manifestUrl)
      const response = await fetch(manifestUrl)
      if (!response.ok) {
        throw new Error(`Failed to fetch manifest: ${response.status}`)
      }

      const data = await response.json()
      setManifest(data)
      initializeColumns(data)
    } catch (err) {
      console.error('Error fetching manifest:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const initializeColumns = (manifestData) => {
    if (!manifestData?.channels) return

    // First column: Channels
    const channelItems = Object.keys(manifestData.channels).map(channelName => ({
      id: channelName,
      name: channelName,
      type: 'channel',
      icon: '📺',
      scanCount: manifestData.channels[channelName].scans.length
    }))

    setColumns([
      {
        id: 'channels',
        title: 'Channels',
        items: channelItems
      }
    ])
  }

  const handleItemClick = async (item, columnIndex) => {
    const newSelectedPath = selectedPath.slice(0, columnIndex + 1)
    newSelectedPath[columnIndex] = item.id
    setSelectedPath(newSelectedPath)

    // Clear columns after the current one
    const newColumns = columns.slice(0, columnIndex + 1)

    if (item.type === 'channel') {
      // Show years for this channel
      const channel = manifest.channels[item.id]
      const yearItems = getYearsFromScans(channel.scans)

      newColumns.push({
        id: 'years',
        title: 'Years',
        items: yearItems
      })
    } else if (item.type === 'year') {
      // Show months for this year
      const channel = manifest.channels[selectedPath[0]]
      const monthItems = getMonthsFromScans(channel.scans, item.id)

      newColumns.push({
        id: 'months',
        title: 'Months',
        items: monthItems
      })
    } else if (item.type === 'month') {
      // Show days for this month
      const channel = manifest.channels[selectedPath[0]]
      const year = selectedPath[1]
      const dayItems = getDaysFromScans(channel.scans, year, item.id)

      newColumns.push({
        id: 'days',
        title: 'Days',
        items: dayItems
      })
    } else if (item.type === 'day') {
      // Show scans for this day
      const channel = manifest.channels[selectedPath[0]]
      const year = selectedPath[1]
      const month = selectedPath[2]
      const scanItems = getScansForDay(channel.scans, year, month, item.id)

      newColumns.push({
        id: 'scans',
        title: 'Scans',
        items: scanItems
      })
    } else if (item.type === 'scan') {
      // Show files for this scan
      const fileItems = item.files?.map(file => {
        const isNetworkFile = (file.name.includes('network') || file.name.includes('3d')) && file.type === 'json'
        return {
          id: file.name,
          name: file.name,
          type: 'file',
          subtype: file.type,
          icon: getFileIcon(file.type, isNetworkFile),
          size: file.size,
          url: file.url,
          fileData: file,
          isRenderable: isNetworkFile
        }
      }) || []

      newColumns.push({
        id: 'files',
        title: 'Files',
        items: fileItems
      })
    } else if (item.type === 'file') {
      // Handle file clicks based on type
      if (item.subtype === 'json') {
        // Check if it's a renderable network file
        if (item.name.includes('network') || item.name.includes('3d')) {
          try {
            const response = await fetch(item.url)
            const data = await response.json()
            onFileSelected(data, item.name)
          } catch (err) {
            console.error('Error loading network file:', err)
            // Fallback to direct download
            window.open(item.url, '_blank')
          }
        } else {
          // Preview other JSON files
          try {
            const response = await fetch(item.url)
            const data = await response.json()
            setPreviewData({ name: item.name, data })
          } catch (err) {
            console.error('Error loading JSON file:', err)
            // Fallback to direct download
            window.open(item.url, '_blank')
          }
        }
      } else {
        // For all other file types (CSV, TXT, MD, etc.), direct download
        console.log('Opening file for download:', item.url)
        window.open(item.url, '_blank')
      }
    }

    setColumns(newColumns)
    setSelectedPath(newSelectedPath)

    // On mobile, navigate to the next column
    if (isMobile && newColumns.length > 1) {
      setCurrentColumnIndex(newColumns.length - 1)
    }
  }

  const getYearsFromScans = (scans) => {
    const years = new Set()
    scans.forEach(scan => {
      const year = scan.timestamp.split('-')[0]
      years.add(year)
    })

    return Array.from(years).sort().reverse().map(year => ({
      id: year,
      name: year,
      type: 'year',
      icon: '📅'
    }))
  }

  const getMonthsFromScans = (scans, year) => {
    const months = new Set()
    scans.forEach(scan => {
      if (scan.timestamp.startsWith(year)) {
        const month = scan.timestamp.split('-')[1]
        months.add(month)
      }
    })

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

    return Array.from(months).sort().reverse().map(month => ({
      id: month,
      name: `${monthNames[parseInt(month) - 1]} ${year}`,
      type: 'month',
      icon: '📅'
    }))
  }

  const getDaysFromScans = (scans, year, month) => {
    const days = new Set()
    scans.forEach(scan => {
      if (scan.timestamp.startsWith(`${year}-${month}`)) {
        const day = scan.timestamp.split('-')[2].split('T')[0]
        days.add(day)
      }
    })

    return Array.from(days).sort().reverse().map(day => ({
      id: day,
      name: `${day}`,
      type: 'day',
      icon: '📅'
    }))
  }

  const getScansForDay = (scans, year, month, day) => {
    return scans
      .filter(scan => scan.timestamp.startsWith(`${year}-${month}-${day}`))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .map(scan => ({
        id: scan.timestamp,
        name: formatTime(scan.timestamp),
        type: 'scan',
        icon: '⏰',
        files: scan.files,
        fileCount: scan.fileCount,
        ...scan
      }))
  }

  const formatTime = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const getFileIcon = (fileType, isRenderable = false) => {
    if (isRenderable) {
      return '🎯' // Special icon for renderable network files
    }

    switch (fileType) {
      case 'json': return '📄'
      case 'csv': return '📊'
      case 'txt': return '📝'
      case 'md': return '📋'
      case 'html': return '🌐'
      case 'png': case 'jpg': case 'jpeg': case 'gif': return '🖼️'
      default: return '📄'
    }
  }

  if (loading) {
    return <div className="file-explorer loading">Loading scan data...</div>
  }

  if (error) {
    return (
      <div className="file-explorer error">
        <h3>Error loading scan data</h3>
        <p>{error}</p>
        <button onClick={fetchManifest}>Retry</button>
      </div>
    )
  }

  if (!manifest || !manifest.channels || Object.keys(manifest.channels).length === 0) {
    return (
      <div className="file-explorer empty">
        <h3>No scan data available</h3>
        <p>No scans have been completed yet.</p>
      </div>
    )
  }

  const navigateToColumn = (columnIndex) => {
    setCurrentColumnIndex(columnIndex)
  }

  const canGoBack = () => {
    return isMobile && currentColumnIndex > 0
  }

  const canGoForward = () => {
    return isMobile && currentColumnIndex < columns.length - 1
  }

  const goBack = () => {
    if (canGoBack()) {
      setCurrentColumnIndex(currentColumnIndex - 1)
    }
  }

  const goForward = () => {
    if (canGoForward()) {
      setCurrentColumnIndex(currentColumnIndex + 1)
    }
  }

  return (
    <div className={`file-explorer column-view ${isMobile ? 'mobile' : ''}`}>
      <div className="explorer-header">
        {isMobile && canGoBack() && (
          <button onClick={goBack} className="nav-btn back-btn">
            ‹ Back
          </button>
        )}

        <div className="breadcrumb">
          <span className="breadcrumb-item root">📁 Scan Data</span>
          {selectedPath.map((pathItem, index) => (
            <span key={index} className="breadcrumb-item">
              <span className="breadcrumb-separator">›</span>
              {pathItem}
            </span>
          ))}
        </div>

        <button onClick={fetchManifest} className="refresh-btn">
          🔄
        </button>
      </div>

      <div className="columns-container" style={{
        transform: isMobile ? `translateX(-${currentColumnIndex * 140}px)` : 'none',
        transition: isMobile ? 'transform 0.3s ease' : 'none'
      }}>
        {columns.map((column, columnIndex) => (
          <div key={column.id} className="column">
            <div className="column-header">
              <h3>{column.title}</h3>
              <span className="item-count">{column.items.length}</span>
            </div>
            <div className="column-content">
              {column.items.length === 0 ? (
                <div className="empty-column">No items</div>
              ) : (
                column.items.map((item, itemIndex) => (
                  <div
                    key={item.id}
                    className={`column-item ${selectedPath[columnIndex] === item.id ? 'selected' : ''} ${item.type}`}
                    onClick={() => handleItemClick(item, columnIndex)}
                  >
                    <span className="item-icon">{item.icon}</span>
                    <span className="item-name">{item.name}</span>
                    {item.scanCount && (
                      <span className="item-detail">{item.scanCount} scans</span>
                    )}
                    {item.fileCount && (
                      <span className="item-detail">{item.fileCount} files</span>
                    )}
                    {item.size && (
                      <span className="item-detail">{(item.size / 1024).toFixed(1)} KB</span>
                    )}
                    {item.type === 'file' && !item.isRenderable && (
                      <span className="download-indicator">⬇</span>
                    )}
                    {item.type !== 'file' && <span className="chevron">›</span>}
                  </div>
                ))
              )}
            </div>
          </div>
        ))}

        {previewData && (
          <div className="column preview-column">
            <div className="column-header">
              <h3>Preview</h3>
            </div>
            <div className="column-content">
              <div className="preview-content">
                <h4>{previewData.name}</h4>
                <div className="json-preview">
                  <pre>{JSON.stringify(previewData.data, null, 2).slice(0, 1000)}...</pre>
                </div>
                <button
                  className="load-file-btn"
                  onClick={() => onFileSelected(previewData.data, previewData.name)}
                >
                  Load in Visualizer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="manifest-info">
        <small>
          Last updated: {manifest.lastUpdated ? new Date(manifest.lastUpdated).toLocaleString() : 'Unknown'}
          {' • '}
          Total channels: {Object.keys(manifest.channels).length}
        </small>
      </div>
    </div>
  )
}

export default FileExplorer
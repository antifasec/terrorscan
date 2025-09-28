import { useState, useEffect } from 'react'
import FileUpload from './FileUpload'
import './FileExplorer.css'

function FileExplorer({ onFileSelected, showUpload = false }) {
  const [manifest, setManifest] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Tree view navigation state
  const [treeData, setTreeData] = useState(null)
  const [expandedNodes, setExpandedNodes] = useState(new Set())
  const [selectedNode, setSelectedNode] = useState(null)
  const [previewData, setPreviewData] = useState(null)

  useEffect(() => {
    fetchManifest()
  }, [])

  const fetchManifest = async () => {
    try {
      setLoading(true)
      setError(null)

      // Try to fetch manifest from the correct base URL with /terrorscan
      const manifestUrl = `/terrorscan/public/data/manifest.json`

      console.log('Fetching manifest from:', manifestUrl)
      const response = await fetch(manifestUrl)
      if (!response.ok) {
        throw new Error(`Failed to fetch manifest: ${response.status}`)
      }

      const data = await response.json()
      setManifest(data)
      initializeTreeData(data)
    } catch (err) {
      console.error('Error fetching manifest:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const initializeTreeData = (manifestData) => {
    if (!manifestData?.channels) return

    const rootNode = {
      id: 'root',
      name: 'Scan Data',
      type: 'root',
      icon: '📁',
      children: [],
      path: []
    }

    // Build channel nodes
    Object.keys(manifestData.channels).forEach(channelName => {
      const channelScans = manifestData.channels[channelName].scans
      const channelNode = {
        id: `channel_${channelName}`,
        name: channelName,
        type: 'channel',
        icon: '📺',
        scanCount: channelScans.length,
        children: [],
        path: [channelName],
        parent: rootNode
      }

      // Group scans by year/month/day structure
      const yearNodes = new Map()

      channelScans.forEach(scan => {
        const date = new Date(scan.timestamp)
        const year = date.getFullYear().toString()
        const month = (date.getMonth() + 1).toString().padStart(2, '0')
        const day = date.getDate().toString().padStart(2, '0')

        // Get or create year node
        if (!yearNodes.has(year)) {
          yearNodes.set(year, {
            id: `year_${channelName}_${year}`,
            name: year,
            type: 'year',
            icon: '📅',
            children: [],
            path: [channelName, year],
            parent: channelNode,
            months: new Map()
          })
        }

        const yearNode = yearNodes.get(year)

        // Get or create month node
        if (!yearNode.months.has(month)) {
          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                             'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
          yearNode.months.set(month, {
            id: `month_${channelName}_${year}_${month}`,
            name: `${monthNames[parseInt(month) - 1]} ${year}`,
            type: 'month',
            icon: '📅',
            children: [],
            path: [channelName, year, month],
            parent: yearNode,
            days: new Map()
          })
        }

        const monthNode = yearNode.months.get(month)

        // Get or create day node
        if (!monthNode.days.has(day)) {
          monthNode.days.set(day, {
            id: `day_${channelName}_${year}_${month}_${day}`,
            name: `${day}`,
            type: 'day',
            icon: '📅',
            children: [],
            path: [channelName, year, month, day],
            parent: monthNode
          })
        }

        const dayNode = monthNode.days.get(day)

        // Create scan node
        const scanNode = {
          id: `scan_${scan.timestamp}`,
          name: formatTime(scan.timestamp),
          type: 'scan',
          icon: '⏰',
          children: [],
          path: [channelName, year, month, day, scan.timestamp],
          parent: dayNode,
          scanData: scan
        }

        // Add file nodes
        scan.files?.forEach(file => {
          const isNetworkFile = (file.name.includes('network') || file.name.includes('3d')) && file.type === 'json'
          const fileNode = {
            id: `file_${scan.timestamp}_${file.name}`,
            name: file.name,
            type: 'file',
            subtype: file.type,
            icon: getFileIcon(file.type, isNetworkFile),
            size: file.size,
            url: file.path || file.url,
            path: [channelName, year, month, day, scan.timestamp, file.name],
            parent: scanNode,
            fileData: file,
            isRenderable: isNetworkFile
          }
          scanNode.children.push(fileNode)
        })

        dayNode.children.push(scanNode)
      })

      // Convert maps to arrays and sort
      yearNodes.forEach(yearNode => {
        yearNode.months.forEach(monthNode => {
          monthNode.children = Array.from(monthNode.days.values())
            .sort((a, b) => b.name.localeCompare(a.name)) // Newest first
          delete monthNode.days
        })
        yearNode.children = Array.from(yearNode.months.values())
          .sort((a, b) => b.name.localeCompare(a.name)) // Newest first
        delete yearNode.months
      })

      channelNode.children = Array.from(yearNodes.values())
        .sort((a, b) => b.name.localeCompare(a.name)) // Newest first

      rootNode.children.push(channelNode)
    })

    // Apply compact folder logic
    const compactTree = applyCompactFolders(rootNode)

    setTreeData(compactTree)
    // Auto-expand root level
    setExpandedNodes(new Set(['root']))
  }

  const applyCompactFolders = (node) => {
    // Don't compact files, scans, or nodes without children
    if (!node.children || node.children.length === 0 || node.type === 'file' || node.type === 'scan') {
      return node
    }

    // Don't compact root or channel nodes - they should always be visible
    if (node.type === 'root' || node.type === 'channel') {
      // Still recursively process children
      node.children = node.children.map(child => applyCompactFolders(child))
      return node
    }

    // If this node has exactly one child and both are folder-like nodes, compact them
    if (node.children.length === 1) {
      const child = node.children[0]

      // Only compact folder-like nodes (year, month, day) - not scans or files
      if ((node.type === 'year' || node.type === 'month' || node.type === 'day') &&
          (child.type === 'year' || child.type === 'month' || child.type === 'day')) {

        // Create a compacted node that combines the current node with its single child
        const compactedNode = {
          ...child, // Use child as base to preserve deeper properties
          id: `${node.id}_compact_${child.id}`,
          name: `${node.name}/${child.name}`,
          originalName: node.name, // Store original for potential use
          compactedPath: true,
          compactedFrom: node.type, // Remember what we compacted from
          parent: node.parent // Maintain parent relationship
        }

        // Recursively apply compacting - the compacted node might need further compacting
        return applyCompactFolders(compactedNode)
      }
    }

    // For non-compactable nodes, still recursively process children
    if (node.children) {
      node.children = node.children.map(child => applyCompactFolders(child))
    }

    return node
  }

  const toggleNode = (nodeId) => {
    const newExpanded = new Set(expandedNodes)
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId)
    } else {
      newExpanded.add(nodeId)
    }
    setExpandedNodes(newExpanded)
  }

  const handleNodeClick = async (node, event) => {
    event.stopPropagation()

    setSelectedNode(node.id)

    if (node.type === 'file') {
      // Handle file clicks based on type
      if (node.subtype === 'json') {
        // Check if it's a renderable network file
        if (node.name.includes('network') || node.name.includes('3d')) {
          try {
            const fetchUrl = node.url.startsWith('/') ? `/terrorscan${node.url}` : node.url
            const response = await fetch(fetchUrl)
            const data = await response.json()
            // Create URL path from file path for navigation
            const urlPath = node.path.join('/')
            onFileSelected(data, node.name, urlPath)
          } catch (err) {
            console.error('Error loading network file:', err)
            // Fallback to direct download
            window.open(node.url, '_blank')
          }
        } else {
          // Preview other JSON files
          try {
            const fetchUrl = node.url.startsWith('/') ? `/terrorscan${node.url}` : node.url
            const response = await fetch(fetchUrl)
            const data = await response.json()
            setPreviewData({ name: node.name, data })
          } catch (err) {
            console.error('Error loading JSON file:', err)
            // Fallback to direct download
            window.open(node.url, '_blank')
          }
        }
      } else {
        // For all other file types (CSV, TXT, MD, etc.), direct download
        console.log('Opening file for download:', node.url)
        window.open(node.url, '_blank')
      }
    } else if (node.children && node.children.length > 0) {
      // Toggle expand/collapse for nodes with children
      toggleNode(node.id)
    }
  }

  const renderTreeNode = (node, depth = 0) => {
    const isExpanded = expandedNodes.has(node.id)
    const isSelected = selectedNode === node.id
    const hasChildren = node.children && node.children.length > 0
    const indentStyle = { paddingLeft: `${depth * 20 + 12}px` }

    return (
      <div key={node.id} className="tree-node">
        <div
          className={`tree-item ${isSelected ? 'selected' : ''} ${node.type}`}
          onClick={(e) => handleNodeClick(node, e)}
          style={indentStyle}
        >
          {hasChildren && (
            <span
              className={`expand-icon ${isExpanded ? 'expanded' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                toggleNode(node.id)
              }}
            >
              ▶
            </span>
          )}
          {!hasChildren && <span className="expand-spacer"></span>}

          <span className="node-icon">{node.icon}</span>
          <span className={`node-name ${node.compactedPath ? 'compacted' : ''}`}>
            {node.compactedPath ? (
              <>
                <span className="compact-path">{node.name}</span>
              </>
            ) : (
              node.name
            )}
          </span>

          {node.scanCount && (
            <span className="node-detail">{node.scanCount} scans</span>
          )}
          {node.fileData?.size && (
            <span className="node-detail">{(node.fileData.size / 1024).toFixed(1)} KB</span>
          )}
          {node.type === 'file' && !node.isRenderable && (
            <span className="download-indicator">⬇</span>
          )}
        </div>

        {hasChildren && isExpanded && (
          <div className="tree-children">
            {node.children.map(child => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
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

  if (!treeData) {
    return (
      <div className="file-explorer empty">
        <h3>No scan data available</h3>
        <p>No scans have been completed yet.</p>
      </div>
    )
  }

  const getBreadcrumb = () => {
    if (!selectedNode || !treeData) return []

    const findNode = (node, targetId, path = []) => {
      if (node.id === targetId) {
        return [...path, node]
      }
      if (node.children) {
        for (const child of node.children) {
          const result = findNode(child, targetId, [...path, node])
          if (result) return result
        }
      }
      return null
    }

    return findNode(treeData, selectedNode) || []
  }

  const expandAll = () => {
    const collectAllIds = (node, ids = new Set()) => {
      ids.add(node.id)
      if (node.children) {
        node.children.forEach(child => collectAllIds(child, ids))
      }
      return ids
    }
    setExpandedNodes(collectAllIds(treeData))
  }

  const collapseAll = () => {
    setExpandedNodes(new Set(['root']))
  }

  const breadcrumb = getBreadcrumb()

  return (
    <div className="file-explorer tree-view">
      <div className="explorer-header">
        <div className="breadcrumb">
          {breadcrumb.length > 0 ? (
            breadcrumb.map((node, index) => (
              <span key={node.id}>
                {index > 0 && <span className="breadcrumb-separator">›</span>}
                <span className="breadcrumb-item">
                  {node.icon} {node.name}
                </span>
              </span>
            ))
          ) : (
            <span className="breadcrumb-item root">📁 Scan Data</span>
          )}
        </div>

        <div className="header-actions">
          <button onClick={expandAll} className="action-btn" title="Expand All">
            ⊞
          </button>
          <button onClick={collapseAll} className="action-btn" title="Collapse All">
            ⊟
          </button>
          <button onClick={fetchManifest} className="refresh-btn" title="Refresh">
            🔄
          </button>
        </div>
      </div>

      <div className="tree-container">
        <div className="tree-content">
          {renderTreeNode(treeData)}

          {showUpload && (
            <div className="integrated-upload">
              <div className="upload-divider">
                <span>Or upload your own file</span>
              </div>
              <FileUpload onDataLoaded={onFileSelected} />
            </div>
          )}
        </div>

        {previewData && (
          <div className="preview-panel">
            <div className="preview-header">
              <h3>Preview: {previewData.name}</h3>
              <button
                className="close-preview"
                onClick={() => setPreviewData(null)}
                title="Close Preview"
              >
                ×
              </button>
            </div>
            <div className="preview-content">
              <div className="json-preview">
                <pre>{JSON.stringify(previewData.data, null, 2).slice(0, 1000)}...</pre>
              </div>
              <div className="preview-actions">
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
          Last updated: {manifest?.lastUpdated ? new Date(manifest.lastUpdated).toLocaleString() : 'Unknown'}
          {' • '}
          Total channels: {manifest ? Object.keys(manifest.channels).length : 0}
        </small>
      </div>
    </div>
  )
}

export default FileExplorer
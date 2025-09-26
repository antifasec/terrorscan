import { useState, useRef } from 'react'
import Papa from 'papaparse'

function FileUpload({ onDataLoaded }) {
  const [dragOver, setDragOver] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState(null)
  const fileInputRef = useRef()

  const supportedFormats = ['json', 'gexf', 'graphml', 'csv', 'html']

  const handleDragOver = (e) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setDragOver(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      processFile(files[0])
    }
  }

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files)
    if (files.length > 0) {
      processFile(files[0])
    }
  }

  const processFile = async (file) => {
    setProcessing(true)
    setError(null)

    try {
      const extension = file.name.split('.').pop().toLowerCase()
      const content = await readFile(file)

      let networkData = null

      switch (extension) {
        case 'json':
          networkData = parseJSON(content, file.name)
          break
        case 'gexf':
          networkData = parseGEXF(content)
          break
        case 'graphml':
          networkData = parseGraphML(content)
          break
        case 'csv':
          networkData = parseCSV(content)
          break
        case 'html':
          networkData = parseHTML(content)
          break
        default:
          throw new Error(`Unsupported file format: ${extension}`)
      }

      if (networkData && networkData.nodes && networkData.links) {
        onDataLoaded(networkData, file.name)
      } else {
        throw new Error('Could not extract valid network data from file')
      }
    } catch (err) {
      setError(err.message)
      console.error('File processing error:', err)
    } finally {
      setProcessing(false)
    }
  }

  const readFile = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target.result)
      reader.onerror = (e) => reject(new Error('Failed to read file'))
      reader.readAsText(file)
    })
  }

  const parseJSON = (content, fileName) => {
    const data = JSON.parse(content)

    // Check if it's already in network format
    if (data.nodes && data.links) {
      return data
    }

    // Check if it's channel data format
    if (typeof data === 'object' && !Array.isArray(data)) {
      const channelIds = Object.keys(data)
      if (channelIds.length > 0 && data[channelIds[0]].title !== undefined) {
        return convertChannelDataToNetwork(data)
      }
    }

    // If it's network_3d format, use it directly
    if (fileName.includes('network_3d') && data.nodes && data.links) {
      return data
    }

    throw new Error('JSON format not recognized')
  }

  const convertChannelDataToNetwork = (channelData) => {
    const nodes = []
    const links = []
    const channelIds = Object.keys(channelData)

    channelIds.forEach((channelId) => {
      const channel = channelData[channelId]
      const participantCount = channel.participants_count || 0
      const messageCount = channel.messages?.length || 0

      const baseLabel = channel.title || channel.username || channelId
      const labelWithCount = participantCount > 0
        ? `${baseLabel} (${participantCount.toLocaleString()})`
        : baseLabel

      nodes.push({
        id: channelId,
        label: labelWithCount,
        baseLabel: baseLabel,
        group: channel.depth || 0,
        size: participantCount > 0 ? Math.pow(Math.log(participantCount + 1), 2) : Math.max(1, messageCount * 0.05),
        messageCount: messageCount,
        participantsCount: participantCount,
        depth: channel.depth || 0
      })

      if (channel.linked_channels) {
        channel.linked_channels.forEach(linkedChannel => {
          if (channelData[linkedChannel]) {
            links.push({
              source: channelId,
              target: linkedChannel,
              value: 1
            })
          }
        })
      }
    })

    return { nodes, links }
  }

  const parseGEXF = (content) => {
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(content, 'text/xml')

    const nodes = []
    const links = []

    // Parse nodes
    const nodeElements = xmlDoc.querySelectorAll('node')
    nodeElements.forEach(node => {
      const id = node.getAttribute('id')
      const label = node.getAttribute('label') || id

      nodes.push({
        id: id,
        label: label,
        group: 0,
        size: 10
      })
    })

    // Parse edges
    const edgeElements = xmlDoc.querySelectorAll('edge')
    edgeElements.forEach(edge => {
      const source = edge.getAttribute('source')
      const target = edge.getAttribute('target')

      links.push({
        source: source,
        target: target,
        value: 1
      })
    })

    return { nodes, links }
  }

  const parseGraphML = (content) => {
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(content, 'text/xml')

    const nodes = []
    const links = []

    // Parse nodes
    const nodeElements = xmlDoc.querySelectorAll('node')
    nodeElements.forEach(node => {
      const id = node.getAttribute('id')

      nodes.push({
        id: id,
        label: id,
        group: 0,
        size: 10
      })
    })

    // Parse edges
    const edgeElements = xmlDoc.querySelectorAll('edge')
    edgeElements.forEach(edge => {
      const source = edge.getAttribute('source')
      const target = edge.getAttribute('target')

      links.push({
        source: source,
        target: target,
        value: 1
      })
    })

    return { nodes, links }
  }

  const parseCSV = (content) => {
    const result = Papa.parse(content, { header: true })
    const data = result.data

    // Try to detect if it's node data or edge data
    const firstRow = data[0]
    if (!firstRow) throw new Error('Empty CSV file')

    const nodes = []
    const links = []

    // If it has source/target columns, treat as edge list
    if (firstRow.source && firstRow.target) {
      const nodeSet = new Set()

      data.forEach(row => {
        if (row.source && row.target) {
          nodeSet.add(row.source)
          nodeSet.add(row.target)
          links.push({
            source: row.source,
            target: row.target,
            value: parseFloat(row.weight || row.value || 1)
          })
        }
      })

      nodeSet.forEach(nodeId => {
        nodes.push({
          id: nodeId,
          label: nodeId,
          group: 0,
          size: 10
        })
      })
    } else {
      // Treat as node list
      data.forEach(row => {
        const id = row.id || row.name || row.label
        if (id) {
          nodes.push({
            id: id,
            label: row.label || row.name || id,
            group: parseInt(row.group || 0),
            size: parseFloat(row.size || 10)
          })
        }
      })
    }

    return { nodes, links }
  }

  const parseHTML = (content) => {
    // Simple extraction from HTML files - look for JSON data in script tags
    const jsonMatch = content.match(/(?:var\s+\w+\s*=\s*|"nodes":\s*\[)/g)
    if (jsonMatch) {
      // Try to extract JSON from common patterns in HTML files
      const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/gi)
      if (scriptMatch) {
        for (const script of scriptMatch) {
          try {
            const jsonStr = script.replace(/<script[^>]*>|<\/script>/gi, '')
            const dataMatch = jsonStr.match(/({[\s\S]*"nodes"[\s\S]*})/g)
            if (dataMatch) {
              const data = JSON.parse(dataMatch[0])
              if (data.nodes && data.links) {
                return data
              }
            }
          } catch (e) {
            continue
          }
        }
      }
    }

    throw new Error('Could not extract network data from HTML file')
  }

  if (processing) {
    return (
      <div className="file-upload">
        <div className="processing">
          <div className="spinner"></div>
          <div>Processing file...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="file-upload">
      <div
        className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="drop-icon">📁</div>
        <div className="drop-text">Drop your network file here</div>
        <div className="drop-subtext">or click to browse</div>
        <button className="upload-btn">Choose File</button>

        <input
          ref={fileInputRef}
          type="file"
          className="file-input"
          accept=".json,.gexf,.graphml,.csv,.html"
          onChange={handleFileSelect}
        />
      </div>

      <div className="supported-formats">
        <div>Supported formats:</div>
        <div className="format-list">
          {supportedFormats.map(format => (
            <div key={format} className="format-item">
              {format}
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div style={{
          marginTop: '1rem',
          padding: '1rem',
          background: '#2a1a1a',
          border: '1px solid #ff6b6b',
          borderRadius: '8px',
          color: '#ff6b6b',
          textAlign: 'center'
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}
    </div>
  )
}

export default FileUpload
import { useRef, useMemo, useState, useEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { forceSimulation, forceLink, forceManyBody, forceCenter } from 'd3-force-3d'

// Import 3D components
import DatasetBackground from './3d/DatasetBackground'
import Node from './3d/Node'
import Link from './3d/Link'
import MeshController from './3d/MeshController'

// Import constants and utilities
import { DEFAULT_FORCE_PARAMS, CAMERA_DEFAULT_DISTANCE, CAMERA_FOV, CAMERA_FAR } from './3d/constants'
import { getDatasetInfo, isNodeConnectedToSelected } from './3d/utils'

function ForceGraph3D({ selectedDatasets, onDatasetSelectionChange }) {
  const [selectedNode, setSelectedNode] = useState(null)
  const [simulationAlpha, setSimulationAlpha] = useState(0)
  const [showControls, setShowControls] = useState(false)
  const [firstPersonTarget, setFirstPersonTarget] = useState(null)
  const [currentMode, setCurrentMode] = useState('mesh')
  const [datasetScreenPositions, setDatasetScreenPositions] = useState({})
  const [forceParams, setForceParams] = useState(DEFAULT_FORCE_PARAMS)

  // Multi-dataset management
  const [availableDatasets, setAvailableDatasets] = useState([])
  const [activeDatasets, setActiveDatasets] = useState(selectedDatasets)
  const [combinedData, setCombinedData] = useState({ nodes: [], links: [] })
  const [showDatasetSelector, setShowDatasetSelector] = useState(false)
  const [manifest, setManifest] = useState(null)
  const [hasAutoSelected, setHasAutoSelected] = useState(false)

  const simulationRef = useRef(null)
  const nodesRef = useRef([])
  const linksRef = useRef([])
  const meshGroupRef = useRef()

  // Drag tracking refs
  const mouseDownPos = useRef({ x: 0, y: 0 })
  const isDragging = useRef(false)

  // Update screen positions for 2D labels
  const updateDatasetScreenPosition = (datasetId, position) => {
    setDatasetScreenPositions(prev => ({
      ...prev,
      [datasetId]: position
    }))
  }

  // Sync selected datasets from parent
  useEffect(() => {
    setActiveDatasets(selectedDatasets)
  }, [selectedDatasets])

  // Fetch manifest and available 3D datasets
  useEffect(() => {
    const fetchManifest = async () => {
      try {
        const response = await fetch('/terrorscan/public/data/manifest.json')
        if (!response.ok) return

        const manifestData = await response.json()
        setManifest(manifestData)

        // Extract all 3D JSON files from the manifest
        const datasets = []
        const channelLatestScans = new Map()

        Object.keys(manifestData.channels || {}).forEach(channelName => {
          const channel = manifestData.channels[channelName]

          channel.scans?.forEach(scan => {
            scan.files?.forEach(file => {
              if (file.type === 'json' && (file.name.includes('network_3d') || file.name.includes('3d'))) {
                const dataset = {
                  id: `${channelName}_${scan.timestamp}_${file.name}`,
                  name: `${channelName} - ${new Date(scan.timestamp).toLocaleDateString()}`,
                  filename: file.name,
                  url: file.path ? `/terrorscan${file.path}` : file.url,
                  channel: channelName,
                  timestamp: scan.timestamp
                }
                datasets.push(dataset)

                if (!channelLatestScans.has(channelName) ||
                    new Date(scan.timestamp) > new Date(channelLatestScans.get(channelName).timestamp)) {
                  channelLatestScans.set(channelName, dataset)
                }
              }
            })
          })
        })

        datasets.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        setAvailableDatasets(datasets)

        if (!hasAutoSelected && selectedDatasets.size === 0) {
          const autoSelectedDatasets = Array.from(channelLatestScans.values()).map(d => d.id)
          const autoSelectedSet = new Set(autoSelectedDatasets)

          setActiveDatasets(autoSelectedSet)
          onDatasetSelectionChange(autoSelectedSet)
          setHasAutoSelected(true)
        }
      } catch (err) {
        console.error('Error fetching manifest:', err)
      }
    }

    fetchManifest()
  }, [selectedDatasets.size, hasAutoSelected, onDatasetSelectionChange])

  // Load and combine datasets
  const loadDataset = async (datasetId) => {
    const dataset = availableDatasets.find(d => d.id === datasetId)
    if (!dataset) return null

    try {
      const response = await fetch(dataset.url)
      if (!response.ok) throw new Error(`Failed to fetch ${dataset.name}`)

      const data = await response.json()
      return { ...data, _datasetId: datasetId, _datasetName: dataset.name }
    } catch (err) {
      console.error(`Error loading dataset ${dataset.name}:`, err)
      return null
    }
  }

  // Handle dataset toggle
  const toggleDataset = async (datasetId) => {
    const newActiveDatasets = new Set(activeDatasets)

    if (newActiveDatasets.has(datasetId)) {
      newActiveDatasets.delete(datasetId)
    } else {
      newActiveDatasets.add(datasetId)
    }

    setActiveDatasets(newActiveDatasets)
    onDatasetSelectionChange(newActiveDatasets)
  }

  // Combine data from active datasets
  useEffect(() => {
    const combineDatasets = async () => {
      if (activeDatasets.size === 0) {
        setCombinedData({ nodes: [], links: [] })
        return
      }

      const loadPromises = Array.from(activeDatasets).map(loadDataset)
      const loadedDatasets = await Promise.all(loadPromises)
      const validDatasets = loadedDatasets.filter(d => d && d.nodes && d.links)

      if (validDatasets.length === 0) {
        setCombinedData({ nodes: [], links: [] })
        return
      }

      let combinedNodes = []
      let combinedLinks = []
      const nodeIdMap = new Map()

      validDatasets.forEach((dataset, datasetIndex) => {
        const datasetPrefix = `ds${datasetIndex}_`
        const datasetColor = ['#9d4edd', '#ff0080', '#00ff41', '#00ffff', '#ffff00'][datasetIndex % 5]

        dataset.nodes.forEach(node => {
          const prefixedId = `${datasetPrefix}${node.id}`
          if (!nodeIdMap.has(prefixedId)) {
            nodeIdMap.set(prefixedId, {
              ...node,
              id: prefixedId,
              originalId: node.id,
              _datasetId: dataset._datasetId,
              _datasetName: dataset._datasetName,
              _datasetColor: datasetColor
            })
          }
        })

        dataset.links.forEach(link => {
          const sourceId = `${datasetPrefix}${link.source.id || link.source}`
          const targetId = `${datasetPrefix}${link.target.id || link.target}`

          combinedLinks.push({
            ...link,
            source: sourceId,
            target: targetId,
            _datasetId: dataset._datasetId,
            _datasetName: dataset._datasetName
          })
        })
      })

      combinedNodes = Array.from(nodeIdMap.values())
      setCombinedData({ nodes: combinedNodes, links: combinedLinks })
    }

    combineDatasets()
  }, [activeDatasets, availableDatasets])

  // Handle background click and ESC key to deselect
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (currentMode === 'firstperson') {
          setCurrentMode('camera')
        } else if (selectedNode) {
          setSelectedNode(null)
        }
      }
    }

    const handleMouseDown = (event) => {
      mouseDownPos.current = { x: event.clientX, y: event.clientY }
      isDragging.current = false
    }

    const handleMouseMove = (event) => {
      if (mouseDownPos.current.x !== 0 || mouseDownPos.current.y !== 0) {
        const deltaX = Math.abs(event.clientX - mouseDownPos.current.x)
        const deltaY = Math.abs(event.clientY - mouseDownPos.current.y)
        if (deltaX > 5 || deltaY > 5) {
          isDragging.current = true
        }
      }
    }

    const handleCanvasClick = (event) => {
      if (event.nodeClicked || isDragging.current) return

      if (event.target.tagName === 'CANVAS' && selectedNode) {
        setSelectedNode(null)
      }

      mouseDownPos.current = { x: 0, y: 0 }
      isDragging.current = false
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('click', handleCanvasClick)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('click', handleCanvasClick)
    }
  }, [selectedNode, currentMode])

  const { nodes, links } = useMemo(() => {
    if (!combinedData || !combinedData.nodes || !combinedData.links) return { nodes: [], links: [] }

    const newNodeIds = new Set(combinedData.nodes.map(n => n.id))
    const existingNodeIds = new Set(nodesRef.current.map(n => n.id))

    const hasRemovedNodes = nodesRef.current.some(node => !newNodeIds.has(node.id))
    const isFirstLoad = nodesRef.current.length === 0

    if (isFirstLoad) {
      const nodes = combinedData.nodes.map(node => ({
        ...node,
        x: (Math.random() - 0.5) * 50,
        y: (Math.random() - 0.5) * 50,
        z: (Math.random() - 0.5) * 50,
        vx: 0, vy: 0, vz: 0,
        fx: null, fy: null, fz: null
      }))
      nodesRef.current = nodes
    } else if (hasRemovedNodes) {
      const preservedNodes = nodesRef.current.filter(node => newNodeIds.has(node.id))
      const newNodes = combinedData.nodes
        .filter(node => !existingNodeIds.has(node.id))
        .map(node => ({
          ...node,
          x: (Math.random() - 0.5) * 50,
          y: (Math.random() - 0.5) * 50,
          z: (Math.random() - 0.5) * 50,
          vx: 0, vy: 0, vz: 0,
          fx: null, fy: null, fz: null
        }))

      const updatedNodes = preservedNodes.map(existingNode => {
        const newNodeData = combinedData.nodes.find(n => n.id === existingNode.id)
        return newNodeData ? {
          ...existingNode,
          ...newNodeData,
          x: existingNode.x, y: existingNode.y, z: existingNode.z,
          vx: existingNode.vx, vy: existingNode.vy, vz: existingNode.vz
        } : existingNode
      })

      nodesRef.current = [...updatedNodes, ...newNodes]
    } else {
      const updatedNodes = combinedData.nodes.map(newNode => {
        const existingNode = nodesRef.current.find(n => n.id === newNode.id)
        if (existingNode) {
          return {
            ...existingNode,
            ...newNode,
            x: existingNode.x, y: existingNode.y, z: existingNode.z,
            vx: existingNode.vx, vy: existingNode.vy, vz: existingNode.vz
          }
        } else {
          return {
            ...newNode,
            x: (Math.random() - 0.5) * 50,
            y: (Math.random() - 0.5) * 50,
            z: (Math.random() - 0.5) * 50,
            vx: 0, vy: 0, vz: 0,
            fx: null, fy: null, fz: null
          }
        }
      })
      nodesRef.current = updatedNodes
    }

    const links = combinedData.links.map(link => ({ ...link }))
    linksRef.current = links

    return { nodes: nodesRef.current, links }
  }, [combinedData])

  // Debounced effect for updating simulation forces with restart
  useEffect(() => {
    if (!simulationRef.current || !nodesRef.current.length) return

    const timeoutId = setTimeout(() => {
      const sim = simulationRef.current

      sim.force('link')
        ?.distance(forceParams.linkDistance)
        .strength(forceParams.linkStrength)

      sim.force('charge')
        ?.strength(forceParams.chargeStrength)

      sim.force('repel')
        ?.strength(forceParams.repelStrength)

      sim.force('center')
        ?.strength(forceParams.centerStrength)

      sim.alpha(0.2).restart()
    }, 100)

    return () => clearTimeout(timeoutId)
  }, [forceParams])

  // Initialize simulation - recreate when nodes/links change significantly
  useEffect(() => {
    if (!nodes.length) {
      if (simulationRef.current) {
        simulationRef.current.stop()
        simulationRef.current = null
      }
      return
    }

    if (simulationRef.current) {
      simulationRef.current.stop()
    }

    const sim = forceSimulation(nodes, 3)
      .force('link', forceLink(links)
        .id(d => d.id)
        .distance(forceParams.linkDistance)
        .strength(forceParams.linkStrength)
        .iterations(2)
      )
      .force('charge', forceManyBody()
        .strength(forceParams.chargeStrength)
        .theta(0.8)
        .distanceMin(5)
        .distanceMax(200)
      )
      .force('repel', forceManyBody()
        .strength(forceParams.repelStrength)
        .distanceMax(30)
      )
      .force('center', forceCenter(0, 0, 0).strength(forceParams.centerStrength))
      .alphaDecay(0.01)
      .velocityDecay(0.4)
      .alpha(1)
      .alphaMin(0.001)
      .on('tick', () => {
        setSimulationAlpha(sim.alpha())
        if (sim.alpha() < 0.002) {
          sim.alpha(0.005)
        }
      })

    simulationRef.current = sim

    return () => {
      if (simulationRef.current) {
        simulationRef.current.stop()
      }
    }
  }, [nodes, links, forceParams.linkDistance, forceParams.linkStrength, forceParams.chargeStrength, forceParams.repelStrength, forceParams.centerStrength])

  useEffect(() => {
    return () => {
      if (simulationRef.current) {
        simulationRef.current.stop()
      }
    }
  }, [])

  return (
    <div className="graph-container">
      {/* Dataset Selector Dropdown */}
      <div className="dataset-selector-overlay">
        <div className="dataset-selector">
          <button
            className="dataset-toggle-btn"
            onClick={() => setShowDatasetSelector(!showDatasetSelector)}
          >
            📊 Datasets ({activeDatasets.size}) ▼
          </button>

          {showDatasetSelector && (
            <div className="dataset-dropdown">
              <div className="dataset-header">
                <span>Select datasets to combine:</span>
                <button
                  className="close-dropdown"
                  onClick={() => setShowDatasetSelector(false)}
                >
                  ×
                </button>
              </div>

              <div className="dataset-list">
                {availableDatasets.map(dataset => (
                  <label key={dataset.id} className="dataset-item">
                    <input
                      type="checkbox"
                      checked={activeDatasets.has(dataset.id)}
                      onChange={() => toggleDataset(dataset.id)}
                    />
                    <span className="dataset-name">{dataset.name}</span>
                    <small className="dataset-filename">{dataset.filename}</small>
                  </label>
                ))}
              </div>

              {availableDatasets.length === 0 && (
                <div className="dataset-empty">No 3D datasets available</div>
              )}
            </div>
          )}
        </div>
      </div>

      <Canvas camera={{ position: [0, 0, CAMERA_DEFAULT_DISTANCE], fov: CAMERA_FOV, far: CAMERA_FAR }}>
        <ambientLight intensity={0.1} />
        <pointLight position={[10, 10, 10]} intensity={0.3} />
        <pointLight position={[-10, -10, -10]} intensity={0.2} />

        <MeshController
          nodes={nodes}
          selectedNode={selectedNode}
          firstPersonTarget={firstPersonTarget}
          setFirstPersonTarget={setFirstPersonTarget}
          setCurrentMode={setCurrentMode}
          meshRef={meshGroupRef}
        />

        <group ref={meshGroupRef}>
          {/* Dataset backgrounds */}
          {(() => {
            const datasetsInView = getDatasetInfo(nodes)
            return Array.from(datasetsInView.values()).map(dataset => (
              <DatasetBackground
                key={dataset.id}
                nodes={nodes}
                datasetId={dataset.id}
                datasetColor={dataset.color}
                onUpdateScreenPosition={updateDatasetScreenPosition}
              />
            ))
          })()}

          {/* Nodes */}
          {nodes.map((node) => {
            const isConnected = selectedNode ? links.some(link =>
              isNodeConnectedToSelected(link, selectedNode.id)
            ) : false

            return (
              <Node
                key={node.id}
                node={node}
                selected={selectedNode?.id === node.id}
                isConnected={isConnected}
                selectedNode={selectedNode}
                onClick={setSelectedNode}
              />
            )
          })}

          {/* Links */}
          {links.map((link, index) => (
            <Link
              key={`${link.source.id || link.source}-${link.target.id || link.target}-${index}`}
              link={link}
              nodes={nodes}
              selectedNode={selectedNode}
              currentMode={currentMode}
            />
          ))}
        </group>
      </Canvas>

      {/* 2D Dataset Labels Overlay */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 1000
      }}>
        {Object.entries(datasetScreenPositions).map(([datasetId, position]) => {
          if (!position.visible) return null

          const datasetsInView = getDatasetInfo(nodes)
          const dataset = datasetsInView.get(datasetId)
          if (!dataset) return null

          return (
            <div
              key={datasetId}
              style={{
                position: 'absolute',
                left: position.x,
                top: position.y,
                transform: 'translate(-50%, -100%)',
                color: dataset.color,
                fontSize: '12px',
                fontWeight: 'bold',
                textAlign: 'center',
                textShadow: '1px 1px 3px rgba(0, 0, 0, 0.8)',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                userSelect: 'none',
                opacity: 0.9,
                background: 'rgba(0, 0, 0, 0.4)',
                padding: '2px 8px',
                borderRadius: '12px',
                border: `1px solid ${dataset.color}50`,
                zIndex: 1001
              }}
            >
              {dataset.name}
            </div>
          )
        })}
      </div>

      {/* Cyberpunk legend overlay - bottom left of screen */}
      <div className="screen-legend-overlay">
        <div className="legend-items">
          <div className="legend-item">
            <div className="legend-dot" style={{ backgroundColor: '#9d4edd', boxShadow: '0 0 8px #9d4edd' }}></div>
            <span>Depth 0</span>
          </div>
          <div className="legend-item">
            <div className="legend-dot" style={{ backgroundColor: '#00ffff', boxShadow: '0 0 8px #00ffff' }}></div>
            <span>Depth 1</span>
          </div>
          <div className="legend-item">
            <div className="legend-dot" style={{ backgroundColor: '#ff0080', boxShadow: '0 0 8px #ff0080' }}></div>
            <span>Depth 2</span>
          </div>
          <div className="legend-item">
            <div className="legend-dot" style={{ backgroundColor: '#00ff41', boxShadow: '0 0 8px #00ff41' }}></div>
            <span>Depth 3</span>
          </div>
          <div className="legend-item">
            <div className="legend-dot" style={{ backgroundColor: '#888888', boxShadow: '0 0 4px #888888' }}></div>
            <span>Depth 4+</span>
          </div>
        </div>
      </div>

      {/* Network stats overlay - bottom right of screen */}
      <div className="screen-stats-overlay">
        <div className="stat-line">Nodes: {combinedData.nodes?.length || 0}</div>
        <div className="stat-line">Links: {combinedData.links?.length || 0}</div>
        <div className="stat-line">Active datasets: {activeDatasets.size}</div>
        <div className="stat-line">
          Simulation: {simulationAlpha > 0.01 ? 'Running' : 'Stable'} ({simulationAlpha.toFixed(3)})
        </div>
      </div>

      {/* Floating node details card - outside canvas, in top left */}
      {selectedNode && (
        <div className="node-details-overlay">
          <div className="node-details-card">
            <div className="card-header">
              <div className="card-title">
                <div
                  className="depth-indicator"
                  style={{
                    backgroundColor: (() => {
                      const depth = selectedNode.depth || 0
                      const depthColors = [
                        '#ff4757', '#ff6b35', '#f39c12', '#f1c40f',
                        '#2ecc71', '#3498db', '#9b59b6', '#e67e22', '#95a5a6'
                      ]
                      return depthColors[Math.min(depth, depthColors.length - 1)]
                    })()
                  }}
                ></div>
                <span>{selectedNode.baseLabel || selectedNode.label || selectedNode.id}</span>
              </div>
              <button
                className="close-btn"
                onClick={() => setSelectedNode(null)}
              >
                ×
              </button>
            </div>

            <div className="card-content">
              <div className="detail-row">
                <span className="label">ID:</span>
                <span className="value">{selectedNode.originalId || selectedNode.id}</span>
              </div>

              {selectedNode._datasetName && (
                <div className="detail-row">
                  <span className="label">📊 Dataset:</span>
                  <span className="value" style={{ color: selectedNode._datasetColor }}>
                    {selectedNode._datasetName}
                  </span>
                </div>
              )}

              {selectedNode.depth !== undefined && (
                <div className="detail-row">
                  <span className="label">🔗 Depth:</span>
                  <span className="value">
                    {selectedNode.depth} {selectedNode.depth === 0 ? '(Seed)' : ''}
                  </span>
                </div>
              )}

              {selectedNode.participantsCount !== undefined && selectedNode.participantsCount > 0 && (
                <div className="detail-row">
                  <span className="label">👥 Participants:</span>
                  <span className="value highlight">{selectedNode.participantsCount.toLocaleString()}</span>
                </div>
              )}

              {selectedNode.messageCount !== undefined && (
                <div className="detail-row">
                  <span className="label">💬 Messages:</span>
                  <span className="value">{selectedNode.messageCount.toLocaleString()}</span>
                </div>
              )}

              <div className="detail-row">
                <span className="label">📏 Size:</span>
                <span className="value">{selectedNode.size?.toFixed(2) || 'N/A'}</span>
              </div>

              <button
                onClick={() => setFirstPersonTarget(selectedNode)}
                style={{
                  marginTop: '1rem',
                  padding: '0.5rem 1rem',
                  background: '#646cff',
                  border: 'none',
                  borderRadius: '6px',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  width: '100%'
                }}
              >
                🎮 First Person View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Simplified gear control panel */}
      <div className={`graph-controls ${showControls ? 'expanded' : 'collapsed'}`}>
        <button
          className="gear-toggle"
          onClick={() => setShowControls(!showControls)}
        >
          ⚙️
        </button>

        {showControls && (
          <>
            <div className="control-group">
              <strong>Force Controls:</strong>
              <button
                onClick={() => {
                  if (simulationRef.current) {
                    simulationRef.current.alpha(0.3).restart()
                  }
                }}
                style={{
                  marginBottom: '0.5rem',
                  padding: '0.25rem 0.5rem',
                  background: '#646cff',
                  border: 'none',
                  borderRadius: '4px',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  width: '100%'
                }}
              >
                Restart Simulation
              </button>
              <div>
                <label>Link Distance: {forceParams.linkDistance}</label>
                <input
                  type="range"
                  min="5"
                  max="30"
                  step="1"
                  value={forceParams.linkDistance}
                  onChange={(e) => setForceParams(prev => ({ ...prev, linkDistance: parseFloat(e.target.value) }))}
                />
              </div>
              <div>
                <label>Charge (Repulsion): {forceParams.chargeStrength}</label>
                <input
                  type="range"
                  min="-500"
                  max="-50"
                  step="25"
                  value={forceParams.chargeStrength}
                  onChange={(e) => setForceParams(prev => ({ ...prev, chargeStrength: parseFloat(e.target.value) }))}
                />
              </div>
              <div>
                <label>Link Strength: {forceParams.linkStrength}</label>
                <input
                  type="range"
                  min="0.1"
                  max="2"
                  step="0.1"
                  value={forceParams.linkStrength}
                  onChange={(e) => setForceParams(prev => ({ ...prev, linkStrength: parseFloat(e.target.value) }))}
                />
              </div>
              <div>
                <label>Spread Force: {forceParams.repelStrength}</label>
                <input
                  type="range"
                  min="-150"
                  max="0"
                  step="10"
                  value={forceParams.repelStrength}
                  onChange={(e) => setForceParams(prev => ({ ...prev, repelStrength: parseFloat(e.target.value) }))}
                />
              </div>
              <div>
                <label>Center Pull: {forceParams.centerStrength}</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={forceParams.centerStrength}
                  onChange={(e) => setForceParams(prev => ({ ...prev, centerStrength: parseFloat(e.target.value) }))}
                />
              </div>
            </div>

            <div className="control-group">
              <small style={{ color: '#888' }}>
                <strong>Desktop:</strong><br/>
                Click nodes to select<br/>
                Drag to rotate<br/>
                Scroll to zoom<br/>
                Right-click + drag to pan<br/>
                <br/>
                <strong>Mobile:</strong><br/>
                Touch to rotate<br/>
                Pinch to zoom<br/>
                Two-finger drag to pan
              </small>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function NetworkGraph3D({ selectedDatasets, onDatasetSelectionChange }) {
  return <ForceGraph3D selectedDatasets={selectedDatasets} onDatasetSelectionChange={onDatasetSelectionChange} />
}

export default NetworkGraph3D
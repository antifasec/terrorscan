import React, { useState, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import NetworkGraph3D from './components/NetworkGraph3D'
import ControlPanel from './components/ControlPanel'
import FileUploader from './components/FileUploader'
import { parseNetworkData } from './utils/dataParser'
import { LAYOUT_ALGORITHMS } from './utils/layoutAlgorithms'
import './App.css'

function App() {
  const [networkData, setNetworkData] = useState(null)
  const [selectedAlgorithm, setSelectedAlgorithm] = useState('3d-force-directed')
  const [algorithmSettings, setAlgorithmSettings] = useState(() => {
    // Initialize with default settings for 3d-force-directed
    const defaultAlgorithm = LAYOUT_ALGORITHMS['3d-force-directed'];
    const settings = {};
    Object.entries(defaultAlgorithm.settings).forEach(([key, config]) => {
      settings[key] = config.default;
    });
    return settings;
  })
  const [isSimulationRunning, setIsSimulationRunning] = useState(true)
  const [equilibriumStatus, setEquilibriumStatus] = useState({ isAtEquilibrium: false, algorithm: null })
  const [perturbationCycle, setPerturbationCycle] = useState(0)
  const [selectedNode, setSelectedNode] = useState(null)

  // Rendering controls (Gephi-style)
  const [renderingSettings, setRenderingSettings] = useState({
    // Node settings
    nodeSize: 8,
    nodeSizeRange: { min: 4, max: 20 },
    nodeOpacity: 0.8,
    nodeColorMode: 'type', // 'type', 'degree', 'cluster', 'uniform'
    nodeUniformColor: '#4ecdc4',
    nodeBorders: true,
    nodeBorderWidth: 0.1,

    // Edge settings
    edgeThickness: 1,
    edgeOpacity: 0.6,
    edgeVisibility: true,
    edgeCurved: false,
    edgeColorMode: 'uniform', // 'uniform', 'source', 'target', 'gradient'
    edgeUniformColor: '#888888',

    // Label settings
    showLabels: 'hover', // 'always', 'hover', 'never'
    labelSize: 12,
    labelColor: '#ffffff',
    labelBackground: true,
    labelDistance: 30,

    // Quality settings
    antiAliasing: true,
    levelOfDetail: false, // Disable by default to prevent disappearing nodes
    distanceCulling: false, // Disable by default
    cullingDistance: 5000, // Much higher default

    // Visual effects
    showCoordinateAxes: true,
    showBackground: true,
    fogEnabled: true,
    glowEffect: false
  })

  const handleFileUpload = async (file) => {
    try {
      const text = await file.text()
      const parsedData = parseNetworkData(text, file.name)
      setNetworkData(parsedData)
    } catch (error) {
      console.error('Error parsing file:', error)
      alert('Error parsing file. Please check the file format.')
    }
  }

  const handleAlgorithmChange = (algorithmKey) => {
    setSelectedAlgorithm(algorithmKey)
    // Reset settings to algorithm defaults
    const algorithm = LAYOUT_ALGORITHMS[algorithmKey];
    const settings = {};
    Object.entries(algorithm.settings).forEach(([key, config]) => {
      settings[key] = config.default;
    });
    setAlgorithmSettings(settings);
    // Restart simulation with new algorithm
    handleRestart();
  }

  const handleAlgorithmSettingsChange = (newSettings) => {
    setAlgorithmSettings(prev => ({ ...prev, ...newSettings }))
  }

  const handleSimulationToggle = () => {
    setIsSimulationRunning(prev => !prev)
  }

  const handleRestart = () => {
    setIsSimulationRunning(false)
    setTimeout(() => setIsSimulationRunning(true), 100)
  }

  const handleFitToView = () => {
    // Call the globally exposed fit function
    if (window.fitCameraToNodes) {
      window.fitCameraToNodes();
    }
  }

  const handleEquilibriumChange = (isAtEquilibrium, algorithm) => {
    setEquilibriumStatus({ isAtEquilibrium, algorithm });
  }

  const handlePerturbationUpdate = (cycle) => {
    setPerturbationCycle(cycle);
  }

  const handleRenderingSettingsChange = (newSettings) => {
    setRenderingSettings(prev => ({ ...prev, ...newSettings }))
  }

  const handleNodeSelect = (node) => {
    setSelectedNode(node)
  }

  // Auto-load the crawl network data on component mount
  useEffect(() => {
    const loadCrawlNetwork = async () => {
      try {
        const response = await fetch('/crawl-network.json')
        if (response.ok) {
          const text = await response.text()
          const parsedData = parseNetworkData(text, 'crawl-network.json')
          console.log('Auto-loaded crawl network with', parsedData.nodes.length, 'nodes and', parsedData.links.length, 'links')
          setNetworkData(parsedData)
        }
      } catch (error) {
        console.log('Could not auto-load crawl network:', error.message)
      }
    }

    // Only auto-load if no data is already loaded
    if (!networkData) {
      loadCrawlNetwork()
    }
  }, [networkData])

  return (
    <div className="app">
      <div className="app-header">
        <h1>3D Network Explorer</h1>
        <FileUploader onFileUpload={handleFileUpload} />
      </div>

      <div className="app-main">
        <div className="canvas-container">
          <Canvas
            camera={{
              position: [600, 600, 600],
              fov: 60,
              near: 1,
              far: 10000
            }}
            style={{ background: '#0a0a0a' }}
            gl={{
              antialias: true,
              alpha: false,
              depth: true,
              stencil: false,
              powerPreference: "high-performance"
            }}
          >
            <ambientLight intensity={0.4} />
            <directionalLight position={[100, 100, 100]} intensity={0.6} />
            {networkData && (
              <NetworkGraph3D
                data={networkData}
                selectedAlgorithm={selectedAlgorithm}
                algorithmSettings={algorithmSettings}
                isSimulationRunning={isSimulationRunning}
                onRestart={handleRestart}
                onEquilibriumChange={handleEquilibriumChange}
                onPerturbationUpdate={handlePerturbationUpdate}
                renderingSettings={renderingSettings}
                selectedNode={selectedNode}
                onNodeSelect={handleNodeSelect}
              />
            )}
          </Canvas>

          {!networkData && (
            <div className="placeholder">
              <div className="placeholder-content">
                <h2>Upload a network file to begin</h2>
                <p>Supported formats: JSON, CSV</p>
              </div>
            </div>
          )}
        </div>

        {selectedNode && (
          <div className="details-panel">
            <div className="details-panel-content">
              <button
                className="close-button"
                onClick={() => setSelectedNode(null)}
                aria-label="Close details panel"
              >
                ×
              </button>
              <h3>Node Details</h3>
              <div className="details-grid">
                <div className="detail-item">
                  <strong>ID:</strong> {selectedNode.id}
                </div>
                {selectedNode.label && (
                  <div className="detail-item">
                    <strong>Label:</strong> {selectedNode.label}
                  </div>
                )}
                {selectedNode.name && (
                  <div className="detail-item">
                    <strong>Name:</strong> {selectedNode.name}
                  </div>
                )}
                {selectedNode.type && (
                  <div className="detail-item">
                    <strong>Type:</strong> {selectedNode.type}
                  </div>
                )}
                {selectedNode.accessibility && (
                  <div className="detail-item">
                    <strong>Accessibility:</strong> {selectedNode.accessibility}
                  </div>
                )}
                {selectedNode.accessible !== undefined && (
                  <div className="detail-item">
                    <strong>Accessible:</strong> {selectedNode.accessible ? 'Yes' : 'No'}
                  </div>
                )}
                <div className="detail-item">
                  <strong>Position:</strong>
                  <div className="position-coords">
                    X: {selectedNode.x?.toFixed(2) || 0},
                    Y: {selectedNode.y?.toFixed(2) || 0},
                    Z: {selectedNode.z?.toFixed(2) || 0}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <ControlPanel
          selectedAlgorithm={selectedAlgorithm}
          algorithmSettings={algorithmSettings}
          onAlgorithmChange={handleAlgorithmChange}
          onAlgorithmSettingsChange={handleAlgorithmSettingsChange}
          onSimulationToggle={handleSimulationToggle}
          onRestart={handleRestart}
          onFitToView={handleFitToView}
          isSimulationRunning={isSimulationRunning}
          networkData={networkData}
          equilibriumStatus={equilibriumStatus}
          perturbationCycle={perturbationCycle}
          renderingSettings={renderingSettings}
          onRenderingSettingsChange={handleRenderingSettingsChange}
        />
      </div>
    </div>
  )
}

export default App

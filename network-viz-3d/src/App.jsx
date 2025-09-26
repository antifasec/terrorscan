import React, { useState, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import NetworkGraph3D from './components/NetworkGraph3D'
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
  const [isDragOver, setIsDragOver] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [flyToNodeFn, setFlyToNodeFn] = useState(null)

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
    showCoordinateAxes: false,
    showBackground: true,
    fogEnabled: false,
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

  // File drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragOver(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      handleFileUpload(files[0])
    }
  }

  const handleFileInput = (e) => {
    const files = Array.from(e.target.files)
    if (files.length > 0) {
      handleFileUpload(files[0])
    }
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
    <div
      className={`app ${isDragOver ? 'drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Canvas
        camera={{
          position: [600, 600, 600],
          fov: 60,
          near: 1,
          far: 10000
        }}
        style={{ width: '100vw', height: '100vh', background: '#0a0a0a' }}
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
            onFlyToNode={setFlyToNodeFn}
          />
        )}
      </Canvas>

      {/* Floating Controls */}
      <div className="floating-controls">
        <button
          className="control-button"
          onClick={() => setShowSettings(!showSettings)}
          title="Settings"
        >
          ⚙️
        </button>
        <button
          className="control-button"
          onClick={handleFitToView}
          title="Fit to View"
        >
          🎯
        </button>
        <button
          className="control-button"
          onClick={handleSimulationToggle}
          title={isSimulationRunning ? 'Pause Simulation' : 'Resume Simulation'}
        >
          {isSimulationRunning ? '⏸️' : '▶️'}
        </button>
        <button
          className="control-button"
          onClick={handleRestart}
          title="Restart Simulation"
        >
          🔄
        </button>
        {selectedNode && (
          <button
            className="control-button"
            onClick={() => setSelectedNode(null)}
            title="Deselect Node"
          >
            ❌
          </button>
        )}
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="settings-panel">
          <div className="settings-header">
            <h3>Settings</h3>
            <button
              className="close-button"
              onClick={() => setShowSettings(false)}
            >
              ×
            </button>
          </div>
          <div className="settings-content">
            {/* Layout Algorithm */}
            <div className="setting-group">
              <label className="setting-label">Layout Algorithm</label>
              <select
                className="setting-select"
                value={selectedAlgorithm}
                onChange={(e) => handleAlgorithmChange(e.target.value)}
              >
                {Object.entries(LAYOUT_ALGORITHMS).map(([key, algorithm]) => (
                  <option key={key} value={key}>
                    {algorithm.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Algorithm Settings */}
            {LAYOUT_ALGORITHMS[selectedAlgorithm] && (
              <div className="setting-group">
                <label className="setting-label">Algorithm Parameters</label>
                {Object.entries(LAYOUT_ALGORITHMS[selectedAlgorithm].settings).map(([key, config]) => (
                  <div key={key} className="setting-item">
                    <label className="setting-sublabel">{config.label || key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}</label>
                    <input
                      type="range"
                      className="setting-slider"
                      min={config.min}
                      max={config.max}
                      step={config.step}
                      value={algorithmSettings[key] || config.default}
                      onChange={(e) => handleAlgorithmSettingsChange({
                        [key]: parseFloat(e.target.value)
                      })}
                    />
                    <span className="setting-value">{algorithmSettings[key] || config.default}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Rendering Settings */}
            <div className="setting-group">
              <label className="setting-label">Visual Settings</label>

              <div className="setting-item">
                <label className="setting-sublabel">Node Size</label>
                <input
                  type="range"
                  className="setting-slider"
                  min="2"
                  max="20"
                  step="1"
                  value={renderingSettings.nodeSize}
                  onChange={(e) => handleRenderingSettingsChange({
                    nodeSize: parseInt(e.target.value)
                  })}
                />
                <span className="setting-value">{renderingSettings.nodeSize}</span>
              </div>

              <div className="setting-item">
                <label className="setting-sublabel">Node Opacity</label>
                <input
                  type="range"
                  className="setting-slider"
                  min="0.1"
                  max="1"
                  step="0.1"
                  value={renderingSettings.nodeOpacity}
                  onChange={(e) => handleRenderingSettingsChange({
                    nodeOpacity: parseFloat(e.target.value)
                  })}
                />
                <span className="setting-value">{renderingSettings.nodeOpacity}</span>
              </div>

              <div className="setting-item">
                <label className="setting-sublabel">Edge Thickness</label>
                <input
                  type="range"
                  className="setting-slider"
                  min="0.5"
                  max="10"
                  step="0.5"
                  value={renderingSettings.edgeThickness}
                  onChange={(e) => handleRenderingSettingsChange({
                    edgeThickness: parseFloat(e.target.value)
                  })}
                />
                <span className="setting-value">{renderingSettings.edgeThickness}</span>
              </div>

              <div className="setting-item">
                <label className="setting-sublabel">Edge Opacity</label>
                <input
                  type="range"
                  className="setting-slider"
                  min="0.1"
                  max="1"
                  step="0.1"
                  value={renderingSettings.edgeOpacity}
                  onChange={(e) => handleRenderingSettingsChange({
                    edgeOpacity: parseFloat(e.target.value)
                  })}
                />
                <span className="setting-value">{renderingSettings.edgeOpacity}</span>
              </div>
            </div>

            {/* Display Options */}
            <div className="setting-group">
              <label className="setting-label">Display Options</label>

              <div className="setting-checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={renderingSettings.edgeVisibility}
                    onChange={(e) => handleRenderingSettingsChange({
                      edgeVisibility: e.target.checked
                    })}
                  />
                  Show Edges
                </label>
              </div>

              <div className="setting-checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={renderingSettings.showCoordinateAxes}
                    onChange={(e) => handleRenderingSettingsChange({
                      showCoordinateAxes: e.target.checked
                    })}
                  />
                  Show Coordinate Axes
                </label>
              </div>

              <div className="setting-checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={renderingSettings.fogEnabled}
                    onChange={(e) => handleRenderingSettingsChange({
                      fogEnabled: e.target.checked
                    })}
                  />
                  Enable Fog
                </label>
              </div>

              <div className="setting-item">
                <label className="setting-sublabel">Label Display</label>
                <select
                  className="setting-select"
                  value={renderingSettings.showLabels}
                  onChange={(e) => handleRenderingSettingsChange({
                    showLabels: e.target.value
                  })}
                >
                  <option value="never">Never</option>
                  <option value="hover">On Hover</option>
                  <option value="always">Always</option>
                </select>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Node Details Overlay */}
      {selectedNode && (
        <div className="node-details-overlay">
          <div className="node-details-header">
            <h3>{selectedNode.label || selectedNode.name || selectedNode.id}</h3>
            <button
              className="close-button"
              onClick={() => setSelectedNode(null)}
            >
              ×
            </button>
          </div>
          <div className="node-details-content">
            <div><strong>ID:</strong> {selectedNode.id}</div>
            {selectedNode.type && <div><strong>Type:</strong> {selectedNode.type}</div>}
            {selectedNode.accessibility && <div><strong>Status:</strong> {selectedNode.accessibility}</div>}
            <div><strong>Connections:</strong> {/* Calculate connections */}</div>

            <button
              className="fly-to-node-button"
              onClick={() => flyToNodeFn && flyToNodeFn(selectedNode)}
              disabled={!flyToNodeFn}
            >
              🚀 Fly Into Node
            </button>
          </div>
        </div>
      )}

      {/* Network Statistics Card */}
      {networkData && (
        <div className="stats-card">
          <div className="stats-content">
            <div className="stat-row">
              <span className="stat-label">Nodes</span>
              <span className="stat-value">{networkData.nodes.length}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Links</span>
              <span className="stat-value">{networkData.links.length}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Algorithm</span>
              <span className="stat-value">{LAYOUT_ALGORITHMS[selectedAlgorithm].name}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Status</span>
              <span className={`stat-value ${isSimulationRunning ? 'running' : 'paused'}`}>
                {isSimulationRunning ? 'Running' : 'Paused'}
              </span>
            </div>
            {equilibriumStatus.isAtEquilibrium && (
              <div className="stat-row">
                <span className="stat-label">State</span>
                <span className="stat-value equilibrium">Equilibrium</span>
              </div>
            )}
          </div>
        </div>
      )}

      {!networkData && (
        <div className="loading-overlay">
          <div className="loading-content">
            <h2>3D Network Explorer</h2>
            <p>Drop a network file here or click to browse</p>
            <div className="file-input-wrapper">
              <input
                type="file"
                id="file-input"
                accept=".json,.csv"
                onChange={handleFileInput}
                style={{ display: 'none' }}
              />
              <button
                className="browse-button"
                onClick={() => document.getElementById('file-input').click()}
              >
                📁 Browse Files
              </button>
            </div>
            <div className="supported-formats">
              <small>Supported formats: JSON, CSV</small>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App

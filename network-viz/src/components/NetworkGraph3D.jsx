import { useRef, useMemo, useState, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Text, Html } from '@react-three/drei'
import * as THREE from 'three'
import { forceSimulation, forceLink, forceManyBody, forceCenter } from 'd3-force-3d'

function CameraController({ nodes, selectedNode }) {
  const { camera } = useThree()
  const controlsRef = useRef()
  const lastCenter = useRef(new THREE.Vector3(0, 0, 0))
  const targetCenter = useRef(new THREE.Vector3(0, 0, 0))
  const isInitialized = useRef(false)
  const isTransitioning = useRef(false)
  const transitionStart = useRef(new THREE.Vector3())
  const transitionTarget = useRef(new THREE.Vector3())
  const transitionProgress = useRef(0)
  const lastSelectedNodeId = useRef(null)

  useFrame((state, delta) => {
    if (nodes.length === 0 || !controlsRef.current) return

    let newTargetCenter

    if (selectedNode) {
      // Lock onto selected node as center of universe
      newTargetCenter = new THREE.Vector3(
        selectedNode.x || 0,
        selectedNode.y || 0,
        selectedNode.z || 0
      )
    } else {
      // Default to network centroid
      let centerX = 0, centerY = 0, centerZ = 0
      let validNodes = 0

      nodes.forEach(node => {
        if (node.x !== undefined && node.y !== undefined && node.z !== undefined) {
          centerX += node.x
          centerY += node.y
          centerZ += node.z
          validNodes++
        }
      })

      if (validNodes > 0) {
        newTargetCenter = new THREE.Vector3(
          centerX / validNodes,
          centerY / validNodes,
          centerZ / validNodes
        )
      } else {
        newTargetCenter = new THREE.Vector3(0, 0, 0)
      }
    }

    // Check if we need to start a transition
    const currentSelectedId = selectedNode?.id || null
    if (currentSelectedId !== lastSelectedNodeId.current) {
      // Start transition animation
      isTransitioning.current = true
      transitionProgress.current = 0
      transitionStart.current.copy(lastCenter.current)
      transitionTarget.current.copy(newTargetCenter)
      lastSelectedNodeId.current = currentSelectedId
    }

    if (isTransitioning.current) {
      // Animate transition over 1 second
      transitionProgress.current += delta * 2 // 2 = speed (1/0.5 seconds)

      if (transitionProgress.current >= 1) {
        // Transition complete
        isTransitioning.current = false
        transitionProgress.current = 1
      }

      // Smooth easing function (ease-out)
      const easeOut = 1 - Math.pow(1 - transitionProgress.current, 3)

      // Interpolate between start and target
      const currentCenter = transitionStart.current.clone().lerp(transitionTarget.current, easeOut)

      // Calculate movement delta from last frame
      const movementDelta = currentCenter.clone().sub(lastCenter.current)

      // Move camera and target
      camera.position.add(movementDelta)
      controlsRef.current.target.add(movementDelta)

      lastCenter.current.copy(currentCenter)
      targetCenter.current.copy(currentCenter)
    } else {
      // Normal tracking (for continuous movement during simulation)
      const movementDelta = newTargetCenter.clone().sub(lastCenter.current)

      if (movementDelta.length() > 0.01) { // Only move if significant change
        camera.position.add(movementDelta)
        controlsRef.current.target.add(movementDelta)
        lastCenter.current.copy(newTargetCenter)
      }
    }

    if (!isInitialized.current) {
      // First time initialization
      controlsRef.current.target.copy(newTargetCenter)
      lastCenter.current.copy(newTargetCenter)
      isInitialized.current = true
    }

    controlsRef.current.update()
  })

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={false}
      enableZoom={true}
      enableRotate={true}
      enableDamping={false}
      rotateSpeed={0.5}
      zoomSpeed={0.8}
      target={[0, 0, 0]}
    />
  )
}

function Node({ node, onClick, selected, isConnected, selectedNode }) {
  const meshRef = useRef()
  const [hovered, setHovered] = useState(false)
  const targetPosition = useRef({ x: 0, y: 0, z: 0 })

  useFrame((state, delta) => {
    if (meshRef.current && node) {
      // Much smoother interpolation with frame-rate independent damping
      const dampingFactor = 1 - Math.pow(0.02, delta) // Frame-rate independent
      const targetX = node.x || 0
      const targetY = node.y || 0
      const targetZ = node.z || 0

      meshRef.current.position.x += (targetX - meshRef.current.position.x) * dampingFactor
      meshRef.current.position.y += (targetY - meshRef.current.position.y) * dampingFactor
      meshRef.current.position.z += (targetZ - meshRef.current.position.z) * dampingFactor
    }
  })

  const getNodeColor = () => {
    if (selected) return '#ffffff' // Bright white for center of universe
    if (hovered) return '#4ecdc4'
    if (selectedNode && isConnected) return '#ffff00' // Bright yellow for connected nodes

    // Color by depth - cooler colors for deeper levels
    const depth = node.depth || 0
    const depthColors = [
      '#ff4757', // Depth 0: Bright red (seed nodes)
      '#ff6b35', // Depth 1: Orange-red
      '#f39c12', // Depth 2: Orange
      '#f1c40f', // Depth 3: Yellow
      '#2ecc71', // Depth 4: Green
      '#3498db', // Depth 5: Blue
      '#9b59b6', // Depth 6: Purple
      '#e67e22', // Depth 7: Dark orange
      '#95a5a6', // Depth 8+: Gray
    ]

    return depthColors[Math.min(depth, depthColors.length - 1)]
  }

  const getNodeOpacity = () => {
    if (selected || hovered) return 1.0
    if (selectedNode && isConnected) return 0.9 // Highlighted connected nodes
    if (selectedNode && !isConnected) return 0.3 // Dimmed non-connected nodes
    return 0.7 // Default opacity
  }

  const getEmissiveIntensity = () => {
    if (selected) return 0.4 // Strong glow for center of universe
    if (selectedNode && isConnected) return 0.2 // Subtle glow for connected nodes
    return 0
  }

  const nodeSize = Math.max(0.5, Math.min(8, (node.size || 5) * 0.4))

  return (
    <mesh
      ref={meshRef}
      onClick={() => onClick && onClick(node)}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <sphereGeometry args={[nodeSize, 16, 16]} />
      <meshStandardMaterial
        color={getNodeColor()}
        transparent
        opacity={getNodeOpacity()}
        emissive={getNodeColor()}
        emissiveIntensity={getEmissiveIntensity()}
      />
      {/* Always show participant count for nodes with participants */}
      {node.participantsCount > 0 && (
        <Html position={[0, nodeSize + 0.3, 0]} center>
          <div style={{
            background: 'rgba(0, 0, 0, 0.7)',
            color: 'white',
            padding: '2px 6px',
            borderRadius: '3px',
            fontSize: '10px',
            fontWeight: 'bold',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            border: '1px solid rgba(255, 255, 255, 0.3)'
          }}>
            {node.participantsCount.toLocaleString()}
          </div>
        </Html>
      )}

      {/* Detailed tooltip on hover/select - positioned to the side */}
      {(hovered || selected) && (
        <Html position={[nodeSize + 1.5, nodeSize * 0.5, 0]} transform={false} occlude={false}>
          <div style={{
            background: 'rgba(0, 0, 0, 0.9)',
            color: 'white',
            padding: '6px 10px',
            borderRadius: '6px',
            fontSize: '12px',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
            transform: 'translateX(0)' // Ensure it doesn't move with camera
          }}>
            <div><strong>{node.baseLabel || node.label || node.id}</strong></div>
            {node.depth !== undefined && (
              <div style={{
                color: getNodeColor(),
                fontWeight: 'bold',
                borderLeft: `3px solid ${getNodeColor()}`,
                paddingLeft: '6px',
                marginBottom: '4px'
              }}>
                🔗 Depth {node.depth} {node.depth === 0 ? '(Seed)' : ''}
              </div>
            )}
            {node.participantsCount !== undefined && node.participantsCount > 0 && (
              <div>👥 {node.participantsCount.toLocaleString()} participants</div>
            )}
            {node.messageCount !== undefined && (
              <div>💬 {node.messageCount.toLocaleString()} messages</div>
            )}
          </div>
        </Html>
      )}
    </mesh>
  )
}

function Link({ link, nodes, selectedNode }) {
  const lineRef = useRef()
  const currentPositions = useRef(new Float32Array(6))

  const isConnectedToSelected = selectedNode ? (() => {
    const sourceId = link.source.id || link.source
    const targetId = link.target.id || link.target
    return sourceId === selectedNode.id || targetId === selectedNode.id
  })() : false

  useFrame(() => {
    if (lineRef.current && nodes) {
      const sourceNode = nodes.find(n => n.id === link.source.id || n.id === link.source)
      const targetNode = nodes.find(n => n.id === link.target.id || n.id === link.target)

      if (sourceNode && targetNode) {
        const lerpFactor = 0.05 // Match node interpolation speed
        const targetPositions = new Float32Array([
          sourceNode.x || 0, sourceNode.y || 0, sourceNode.z || 0,
          targetNode.x || 0, targetNode.y || 0, targetNode.z || 0
        ])

        // Smooth interpolation for links
        for (let i = 0; i < 6; i++) {
          currentPositions.current[i] += (targetPositions[i] - currentPositions.current[i]) * lerpFactor
        }

        lineRef.current.geometry.attributes.position.array.set(currentPositions.current)
        lineRef.current.geometry.attributes.position.needsUpdate = true
      }
    }
  })

  return (
    <line ref={lineRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={2}
          array={new Float32Array(6)}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial
        color={isConnectedToSelected ? "#ffff00" : "#888888"}
        transparent
        opacity={isConnectedToSelected ? 0.9 : (selectedNode ? 0.2 : 0.6)}
        linewidth={isConnectedToSelected ? 3 : 2}
      />
    </line>
  )
}

function ForceGraph3D({ data }) {
  const [selectedNode, setSelectedNode] = useState(null)
  const [simulationAlpha, setSimulationAlpha] = useState(0)
  const [showControls, setShowControls] = useState(false)
  const [forceParams, setForceParams] = useState({
    linkDistance: 15,
    chargeStrength: -300,
    linkStrength: 0.8,
    repelStrength: -50,
    centerStrength: 0.02
  })

  const simulationRef = useRef(null)
  const nodesRef = useRef([])
  const linksRef = useRef([])

  const { nodes, links } = useMemo(() => {
    if (!data || !data.nodes || !data.links) return { nodes: [], links: [] }

    // Only initialize nodes once with positions, preserve existing positions on updates
    if (nodesRef.current.length === 0) {
      const nodes = data.nodes.map(node => ({
        ...node,
        x: (Math.random() - 0.5) * 50,
        y: (Math.random() - 0.5) * 50,
        z: (Math.random() - 0.5) * 50,
        vx: 0,
        vy: 0,
        vz: 0,
        fx: null,
        fy: null,
        fz: null
      }))
      nodesRef.current = nodes
    } else {
      // Update existing nodes with new data but preserve positions
      nodesRef.current = nodesRef.current.map(existingNode => {
        const newNodeData = data.nodes.find(n => n.id === existingNode.id)
        if (newNodeData) {
          return {
            ...existingNode, // Keep existing position and velocity
            ...newNodeData, // Update other properties
            x: existingNode.x, // Preserve position
            y: existingNode.y,
            z: existingNode.z,
            vx: existingNode.vx, // Preserve velocity
            vy: existingNode.vy,
            vz: existingNode.vz
          }
        }
        return existingNode
      })
    }

    const links = data.links.map(link => ({ ...link }))
    linksRef.current = links

    return { nodes: nodesRef.current, links }
  }, [data])

  // Debounced effect for updating simulation forces with restart
  useEffect(() => {
    if (!simulationRef.current || !nodesRef.current.length) return

    // Debounce force updates to prevent jitter during slider dragging
    const timeoutId = setTimeout(() => {
      const sim = simulationRef.current

      // Update existing forces with new parameters
      sim.force('link')
        ?.distance(forceParams.linkDistance)
        .strength(forceParams.linkStrength)

      sim.force('charge')
        ?.strength(forceParams.chargeStrength)

      sim.force('repel')
        ?.strength(forceParams.repelStrength)

      sim.force('center')
        ?.strength(forceParams.centerStrength)

      // Restart simulation with moderate energy to apply new forces
      sim.alpha(0.2).restart()
    }, 100) // Slightly longer debounce for restart

    return () => clearTimeout(timeoutId)
  }, [forceParams])

  // Initialize simulation only once
  useEffect(() => {
    if (!nodes.length || !links.length) return

    // Stop previous simulation
    if (simulationRef.current) {
      simulationRef.current.stop()
    }

    // Create natural 3D force-directed simulation
    const sim = forceSimulation(nodes, 3) // 3 dimensions
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
      .velocityDecay(0.3)
      .alpha(1)
      .alphaMin(0.005)
      .on('tick', () => {
        setSimulationAlpha(sim.alpha())
      })

    simulationRef.current = sim

    return () => {
      if (simulationRef.current) {
        simulationRef.current.stop()
      }
    }
  }, [nodes, links])

  useEffect(() => {
    return () => {
      if (simulationRef.current) {
        simulationRef.current.stop()
      }
    }
  }, [])

  if (!data || !data.nodes || !data.links) {
    return <div>No data to display</div>
  }

  return (
    <div className="graph-container">
      <Canvas camera={{ position: [10, 10, 10], fov: 50 }}>
        <ambientLight intensity={0.4} />
        <pointLight position={[10, 10, 10]} intensity={0.8} />
        <pointLight position={[-10, -10, -10]} intensity={0.4} />

        <CameraController nodes={nodes} selectedNode={selectedNode} />

        {nodes.map((node) => {
          // Check if this node is connected to the selected node
          const isConnected = selectedNode ? links.some(link => {
            const sourceId = link.source.id || link.source
            const targetId = link.target.id || link.target
            return (sourceId === selectedNode.id && targetId === node.id) ||
                   (targetId === selectedNode.id && sourceId === node.id)
          }) : false

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

        {links.map((link, index) => (
          <Link
            key={`${link.source.id || link.source}-${link.target.id || link.target}-${index}`}
            link={link}
            nodes={nodes}
            selectedNode={selectedNode}
          />
        ))}

      </Canvas>

      {/* Network stats and legend overlay - bottom left of screen */}
      <div className="screen-stats-overlay">
        <div className="stat-line">Nodes: {data.nodes.length}</div>
        <div className="stat-line">Links: {data.links.length}</div>
        <div className="stat-line">
          Simulation: {simulationAlpha > 0.01 ? 'Running' : 'Stable'} ({simulationAlpha.toFixed(3)})
        </div>

        <div className="legend-items">
          <div className="legend-item">
            <div className="legend-dot" style={{ backgroundColor: '#ff4757' }}></div>
            <span>Depth 0 (Seeds)</span>
          </div>
          <div className="legend-item">
            <div className="legend-dot" style={{ backgroundColor: '#ff6b35' }}></div>
            <span>Depth 1</span>
          </div>
          <div className="legend-item">
            <div className="legend-dot" style={{ backgroundColor: '#f39c12' }}></div>
            <span>Depth 2</span>
          </div>
          <div className="legend-item">
            <div className="legend-dot" style={{ backgroundColor: '#f1c40f' }}></div>
            <span>Depth 3</span>
          </div>
          <div className="legend-item">
            <div className="legend-dot" style={{ backgroundColor: '#2ecc71' }}></div>
            <span>Depth 4+</span>
          </div>
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
                <span className="value">{selectedNode.id}</span>
              </div>

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
            </div>
          </div>
        </div>
      )}

      {/* Collapsible control panel */}
      <div className={`graph-controls ${showControls ? 'expanded' : 'collapsed'}`}>
        <button
          className="controls-toggle"
          onClick={() => setShowControls(!showControls)}
        >
          {showControls ? '◀' : '▶'} Controls
        </button>

        {showControls && (
          <>
            <div className="control-group">
          <strong>Force Controls:</strong>
          <button
            onClick={() => {
              if (simulationRef.current) {
                // Gentle restart without position reset
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
            Click nodes to select<br/>
            Drag to rotate<br/>
            Scroll to zoom<br/>
            Right-click + drag to pan
          </small>
        </div>
          </>
        )}
      </div>
    </div>
  )
}

function NetworkGraph3D({ data }) {
  if (!data) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>No data available</h2>
        <p>Please select a file to visualize.</p>
      </div>
    )
  }

  return <ForceGraph3D data={data} />
}

export default NetworkGraph3D
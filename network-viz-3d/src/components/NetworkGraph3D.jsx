import React, { useRef, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { LAYOUT_ALGORITHMS } from '../utils/layoutAlgorithms';

const NetworkGraph3D = ({ data, selectedAlgorithm, algorithmSettings, isSimulationRunning, onRestart, onEquilibriumChange, onPerturbationUpdate, renderingSettings, selectedNode, onNodeSelect }) => {

  // Default rendering settings if not provided
  const defaultRenderingSettings = {
    nodeSize: 8,
    nodeOpacity: 0.8,
    nodeColorMode: 'type',
    nodeUniformColor: '#4ecdc4',
    nodeBorders: true,
    nodeBorderWidth: 0.1,
    edgeVisibility: true,
    edgeThickness: 1,
    edgeOpacity: 0.6,
    edgeUniformColor: '#888888',
    showLabels: 'hover',
    labelSize: 12,
    labelColor: '#ffffff',
    labelBackground: true,
    labelDistance: 30,
    levelOfDetail: true,
    distanceCulling: true,
    cullingDistance: 2000,
    showCoordinateAxes: true,
    showBackground: true,
    fogEnabled: true,
    glowEffect: false
  };

  const settings = renderingSettings || defaultRenderingSettings;
  const groupRef = useRef();
  const simulationRef = useRef();
  const nodesRef = useRef([]);
  const linksRef = useRef([]);
  const controlsRef = useRef();
  const [hoveredNode, setHoveredNode] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [highlightedNodes, setHighlightedNodes] = useState(new Set());
  const [isLockedToNode, setIsLockedToNode] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isMouseDown, setIsMouseDown] = useState(false);
  const lockedNodePositionRef = useRef(new THREE.Vector3());
  const cameraRotationRef = useRef(new THREE.Euler());
  const [isAtEquilibrium, setIsAtEquilibrium] = useState(false);
  const [perturbationCycle, setPerturbationCycle] = useState(0);
  const [baseSettings, setBaseSettings] = useState(null);
  const { camera, gl } = useThree();

  // Color palette for different groups and node types
  const colorPalette = [
    '#ff6b6b', '#4ecdc4', '#45b7d1', '#feca57',  // 0-3: Main groups
    '#ee5a52', '#5f27cd', '#00d2d3', '#ff9ff3',  // 4-7: Additional groups
    '#a55eea', '#26de81', '#fd79a8', '#fdcb6e'   // 8-11: Extended palette
  ];

  // Dynamic node color based on rendering settings
  const getNodeColor = (node, nodeIndex = 0) => {
    if (settings.nodeColorMode === 'uniform') {
      return settings.nodeUniformColor;
    }

    if (settings.nodeColorMode === 'degree') {
      // Color by node degree (number of connections)
      const degree = linksRef.current.filter(link =>
        (typeof link.source === 'object' ? link.source.id : link.source) === node.id ||
        (typeof link.target === 'object' ? link.target.id : link.target) === node.id
      ).length;
      const maxDegree = Math.max(...nodesRef.current.map(n =>
        linksRef.current.filter(link =>
          (typeof link.source === 'object' ? link.source.id : link.source) === n.id ||
          (typeof link.target === 'object' ? link.target.id : link.target) === n.id
        ).length
      ));
      const intensity = maxDegree > 0 ? degree / maxDegree : 0;
      return `hsl(${240 - intensity * 180}, 70%, ${50 + intensity * 30}%)`;
    }

    if (settings.nodeColorMode === 'cluster') {
      // Color by cluster/community (simple hash-based)
      const hash = node.id.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0);
      const hue = Math.abs(hash) % 360;
      return `hsl(${hue}, 60%, 60%)`;
    }

    // Default: color by type (original logic)
    const accessibility = node.accessibility || (node.accessible !== false ? 'accessible' : 'referenced');
    switch (accessibility) {
      case 'accessible':
        return '#4ecdc4';
      case 'failed':
        return '#888888';
      case 'referenced':
        return '#888888';
      default:
        if (node.accessible === false || node.type === 'mentioned') {
          return '#666666';
        }
        if (node.type === 'inferred') {
          return '#555555';
        }
        return '#4ecdc4';
    }
  };

  // Initialize simulation
  useEffect(() => {
    if (!data || !data.nodes || !data.links) return;

    // Create fresh copies of nodes and links
    const nodes = data.nodes.map(node => ({ ...node }));
    const links = data.links.map(link => ({ ...link }));

    // Get the selected algorithm
    const algorithm = LAYOUT_ALGORITHMS[selectedAlgorithm];

    if (!algorithm) {
      console.error(`Algorithm ${selectedAlgorithm} not found`);
      return;
    }

    // Create layout with current settings
    const layout = algorithm.create(nodes, links, algorithmSettings);

    simulationRef.current = layout;
    nodesRef.current = nodes;
    linksRef.current = links;

    // Reset equilibrium state when starting new simulation
    setIsAtEquilibrium(false);
    setPerturbationCycle(0);
    if (onEquilibriumChange) {
      onEquilibriumChange(false, selectedAlgorithm);
    }

    // Set controls target to origin immediately
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }

    // Auto-fit camera when new data is loaded
    setTimeout(() => {
      recenterGraph();
      fitCameraToNodes();
    }, 500);

  }, [data, selectedAlgorithm]);

  // Update algorithm settings
  useEffect(() => {
    if (!simulationRef.current || !data) return;

    // Reset equilibrium state when settings change
    setIsAtEquilibrium(false);

    // For D3 force algorithm, update the simulation forces
    if (selectedAlgorithm === 'd3-force' && simulationRef.current.simulation) {
      const sim = simulationRef.current.simulation;

      sim.force("charge").strength(algorithmSettings.chargeStrength);
      sim.force("link").distance(algorithmSettings.linkDistance);
      sim.force("x").strength(algorithmSettings.centerStrength);
      sim.force("y").strength(algorithmSettings.centerStrength);
      sim.force("z").strength(algorithmSettings.centerStrength);
      sim.alphaDecay(algorithmSettings.alphaDecay);
      sim.velocityDecay(algorithmSettings.velocityDecay);
      sim.alpha(0.3).restart();
    } else {
      // For other algorithms, recreate the layout with new settings
      const nodes = nodesRef.current;
      const links = linksRef.current;
      const algorithm = LAYOUT_ALGORITHMS[selectedAlgorithm];

      if (algorithm && nodes && links) {
        const layout = algorithm.create(nodes, links, algorithmSettings);
        simulationRef.current = layout;
      }
    }

    // Apply bounds checking after settings change
    setTimeout(() => {
      constrainNodesToBounds();
      recenterGraph();
    }, 100);
  }, [algorithmSettings, selectedAlgorithm]);

  // Control simulation state
  useEffect(() => {
    if (!simulationRef.current) return;

    if (selectedAlgorithm === 'd3-force' && simulationRef.current.simulation) {
      if (isSimulationRunning) {
        simulationRef.current.restart();
      } else {
        simulationRef.current.stop();
      }
    }
    // Other algorithms don't have explicit start/stop controls
  }, [isSimulationRunning, selectedAlgorithm]);

  // Animation loop
  useFrame((state, delta) => {
    if (!simulationRef.current || !groupRef.current) return;

    // Run one step of the layout algorithm
    if (simulationRef.current.step && isSimulationRunning) {
      const shouldContinue = simulationRef.current.step();

      // Check if algorithm has reached equilibrium
      if (!shouldContinue && !isAtEquilibrium) {
        console.log(`${selectedAlgorithm} algorithm reached equilibrium`);
        setIsAtEquilibrium(true);
        if (onEquilibriumChange) {
          onEquilibriumChange(true, selectedAlgorithm);
        }
      }
    }

    // Update node positions
    groupRef.current.children.forEach((child, index) => {
      if (child.userData && child.userData.type === 'node') {
        const node = nodesRef.current[child.userData.index];
        if (node) {
          child.position.set(node.x, node.y, node.z);
        }
      }
    });

    // Update camera position if locked to selected node
    if (isLockedToNode && selectedNode) {
      const currentSelectedNode = nodesRef.current.find(n => n.id === selectedNode.id);
      if (currentSelectedNode) {
        const nodePosition = new THREE.Vector3(
          currentSelectedNode.x || 0,
          currentSelectedNode.y || 0,
          currentSelectedNode.z || 0
        );

        // Store the current rotation before updating position
        const currentRotation = camera.quaternion.clone();

        // Update position to follow the node
        camera.position.copy(nodePosition);

        // Restore the rotation after position update
        camera.quaternion.copy(currentRotation);

        // Update the stored position reference
        lockedNodePositionRef.current.copy(nodePosition);
      }
    }

    // Update link positions
    groupRef.current.children.forEach((child) => {
      if (child.userData && child.userData.type === 'link') {
        const link = linksRef.current[child.userData.index];
        const sourceNode = typeof link.source === 'object' ? link.source :
                          nodesRef.current.find(n => n.id === link.source);
        const targetNode = typeof link.target === 'object' ? link.target :
                          nodesRef.current.find(n => n.id === link.target);

        if (sourceNode && targetNode && child.geometry) {
          const positions = child.geometry.attributes.position.array;
          positions[0] = sourceNode.x;
          positions[1] = sourceNode.y;
          positions[2] = sourceNode.z;
          positions[3] = targetNode.x;
          positions[4] = targetNode.y;
          positions[5] = targetNode.z;
          child.geometry.attributes.position.needsUpdate = true;
        }
      }
    });
  });

  const handleNodeClick = (node, event) => {
    if (!isDragging) {
      console.log('Node clicked:', node.id, node.label || node.name, new Date().toLocaleTimeString());
      onNodeSelect(node);

      // Check if it's a double-click for locking to node position
      if (event && event.detail === 2) {
        positionCameraOnNodeSurface(node);
        setIsLockedToNode(true);
      } else {
        focusCameraOnNode(node);
        setIsLockedToNode(false);
      }

      highlightConnectedNodes(node);
    }
  };

  const handleNodeHover = (node, isHovering) => {
    if (!isDragging) {
      setHoveredNode(isHovering ? node : null);
    }
  };

  // Helper function to constrain nodes to reasonable bounds
  const constrainNodesToBounds = () => {
    const maxBound = 2000;
    const minBound = -2000;

    nodesRef.current.forEach(node => {
      if (node.x > maxBound) node.x = maxBound;
      if (node.x < minBound) node.x = minBound;
      if (node.y > maxBound) node.y = maxBound;
      if (node.y < minBound) node.y = minBound;
      if (node.z > maxBound) node.z = maxBound;
      if (node.z < minBound) node.z = minBound;
    });
  };

  // Helper function to recenter the graph
  const recenterGraph = () => {
    if (!nodesRef.current || nodesRef.current.length === 0) return;

    // Calculate center of mass
    let centerX = 0, centerY = 0, centerZ = 0;
    nodesRef.current.forEach(node => {
      centerX += node.x;
      centerY += node.y;
      centerZ += node.z;
    });

    centerX /= nodesRef.current.length;
    centerY /= nodesRef.current.length;
    centerZ /= nodesRef.current.length;

    // Translate all nodes to center the graph
    nodesRef.current.forEach(node => {
      node.x -= centerX;
      node.y -= centerY;
      node.z -= centerZ;
    });
  };

  // Helper function to fit camera to show all nodes
  const fitCameraToNodes = () => {
    if (!nodesRef.current || nodesRef.current.length === 0 || !camera) return;

    // First recenter the nodes to origin
    recenterGraph();

    // After recentering, all nodes should be around (0,0,0)
    // Calculate bounding box of all nodes
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    nodesRef.current.forEach(node => {
      minX = Math.min(minX, node.x);
      maxX = Math.max(maxX, node.x);
      minY = Math.min(minY, node.y);
      maxY = Math.max(maxY, node.y);
      minZ = Math.min(minZ, node.z);
      maxZ = Math.max(maxZ, node.z);
    });

    const sizeX = maxX - minX;
    const sizeY = maxY - minY;
    const sizeZ = maxZ - minZ;
    const maxSize = Math.max(sizeX, sizeY, sizeZ, 200); // Minimum size

    // Position camera to see all nodes, centered on origin
    const distance = Math.max(maxSize * 1.8, 800); // Increased minimum distance for better view
    camera.position.set(
      distance * 0.577, // ~1/√3 for equal angles
      distance * 0.577,
      distance * 0.577
    );

    // Update controls target first, then update camera
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
      // Force immediate update
      controlsRef.current.object.updateMatrixWorld();
    }

    // Force camera to look at the center after controls update
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    console.log('Camera fitted to nodes:', {
      position: camera.position,
      target: [0, 0, 0],
      distance,
      maxSize,
      boundingBox: { minX, maxX, minY, maxY, minZ, maxZ }
    });
  };

  // Function to focus camera on a specific node (single click)
  const focusCameraOnNode = (node) => {
    if (!camera || !controlsRef.current) return;

    // Calculate optimal camera distance based on node connections
    const nodeConnections = linksRef.current.filter(link =>
      (typeof link.source === 'object' ? link.source.id : link.source) === node.id ||
      (typeof link.target === 'object' ? link.target.id : link.target) === node.id
    );

    // Base distance, increased for nodes with more connections
    const baseDistance = 300;
    const connectionBonus = Math.min(nodeConnections.length * 20, 200);
    const targetDistance = baseDistance + connectionBonus;

    // Calculate camera position around the node
    const nodePosition = new THREE.Vector3(node.x || 0, node.y || 0, node.z || 0);
    const direction = camera.position.clone().sub(nodePosition).normalize();
    const newCameraPosition = nodePosition.clone().add(direction.multiplyScalar(targetDistance));

    // Smoothly move camera to new position
    const startPosition = camera.position.clone();
    const startTarget = controlsRef.current.target.clone();
    const duration = 1000; // 1 second animation
    const startTime = Date.now();

    const animateCamera = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Smooth easing function
      const easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
      const easedProgress = easeInOutCubic(progress);

      // Interpolate camera position
      camera.position.lerpVectors(startPosition, newCameraPosition, easedProgress);

      // Interpolate controls target
      controlsRef.current.target.lerpVectors(startTarget, nodePosition, easedProgress);
      controlsRef.current.update();

      if (progress < 1) {
        requestAnimationFrame(animateCamera);
      }
    };

    animateCamera();
    console.log('Camera focused on node:', node.id, 'at distance:', targetDistance);
  };

  // Function to position camera at node position (double-click) - become the node
  const positionCameraOnNodeSurface = (node) => {
    if (!camera || !controlsRef.current) return;

    const nodePosition = new THREE.Vector3(node.x || 0, node.y || 0, node.z || 0);

    // Position camera exactly at the node position - we become the node
    const newCameraPosition = nodePosition.clone();

    // Calculate a good target to look towards (center of connected nodes)
    const connectedNodes = [];
    linksRef.current.forEach(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;

      if (sourceId === node.id) {
        const targetNode = typeof link.target === 'object' ? link.target :
                          nodesRef.current.find(n => n.id === targetId);
        if (targetNode) connectedNodes.push(targetNode);
      } else if (targetId === node.id) {
        const sourceNode = typeof link.source === 'object' ? link.source :
                          nodesRef.current.find(n => n.id === sourceId);
        if (sourceNode) connectedNodes.push(sourceNode);
      }
    });

    // Calculate center of connected nodes as look target
    let lookTarget = nodePosition.clone();
    if (connectedNodes.length > 0) {
      lookTarget.set(0, 0, 0);
      connectedNodes.forEach(connectedNode => {
        lookTarget.add(new THREE.Vector3(connectedNode.x || 0, connectedNode.y || 0, connectedNode.z || 0));
      });
      lookTarget.divideScalar(connectedNodes.length);
    } else {
      // If no connections, look towards the origin
      lookTarget = new THREE.Vector3(0, 0, 0);
    }

    // Smoothly move camera to node position
    const startPosition = camera.position.clone();
    const startTarget = controlsRef.current.target.clone();
    const duration = 1500; // 1.5 second animation for dramatic effect
    const startTime = Date.now();

    const animateCamera = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Smooth easing function with slow start and end
      const easeInOutQuart = (t) => t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t;
      const easedProgress = easeInOutQuart(progress);

      // Interpolate camera position
      camera.position.lerpVectors(startPosition, newCameraPosition, easedProgress);

      // Interpolate controls target
      controlsRef.current.target.lerpVectors(startTarget, lookTarget, easedProgress);
      controlsRef.current.update();

      if (progress < 1) {
        requestAnimationFrame(animateCamera);
      }
    };

    animateCamera();
    console.log('Camera positioned at node:', node.id, 'becoming the node, looking at', connectedNodes.length, 'connected nodes');
  };

  // Function to highlight nodes connected to the selected node
  const highlightConnectedNodes = (node) => {
    const connectedNodeIds = new Set();

    linksRef.current.forEach(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;

      if (sourceId === node.id) {
        connectedNodeIds.add(targetId);
      } else if (targetId === node.id) {
        connectedNodeIds.add(sourceId);
      }
    });

    // Include the selected node itself
    connectedNodeIds.add(node.id);

    setHighlightedNodes(connectedNodeIds);
    console.log('Highlighted', connectedNodeIds.size - 1, 'connected nodes for:', node.id);
  };

  // Clear highlights and unlock camera when no node is selected
  React.useEffect(() => {
    if (!selectedNode) {
      setHighlightedNodes(new Set());
      setIsLockedToNode(false);
    }
  }, [selectedNode]);

  // Expose fit function globally for button access
  React.useEffect(() => {
    window.fitCameraToNodes = fitCameraToNodes;
  }, []);

  // Set up OrbitControls event listeners
  React.useEffect(() => {
    if (!controlsRef.current) return;

    const controls = controlsRef.current;

    const handleControlStart = () => {
      setIsDragging(true);
    };

    const handleControlEnd = () => {
      setTimeout(() => setIsDragging(false), 100); // Small delay to prevent conflict
    };

    controls.addEventListener('start', handleControlStart);
    controls.addEventListener('end', handleControlEnd);

    return () => {
      controls.removeEventListener('start', handleControlStart);
      controls.removeEventListener('end', handleControlEnd);
    };
  }, [controlsRef.current]);

  if (!data || !data.nodes || !data.links) {
    return null;
  }

  // Handle background click to deselect node
  const handleBackgroundClick = () => {
    if (selectedNode && !isDragging) {
      console.log('Background clicked - deselecting node');
      onNodeSelect(null);
      setIsLockedToNode(false);
    }
  };


  // Set up mouse event listeners for first-person controls
  React.useEffect(() => {
    if (isLockedToNode) {
      // Initialize rotation reference when locking
      cameraRotationRef.current.setFromQuaternion(camera.quaternion, 'YXZ');
      console.log('Setting up locked node mouse controls');

      const canvas = gl.domElement;

      const onMouseMove = (event) => {
        if (!isMouseDown) return;

        const rect = canvas.getBoundingClientRect();
        const currentMouseX = event.clientX - rect.left;
        const currentMouseY = event.clientY - rect.top;

        const deltaX = currentMouseX - mousePosition.x;
        const deltaY = currentMouseY - mousePosition.y;

        // Get current rotation from stored reference
        const euler = cameraRotationRef.current;

        // Apply rotation based on mouse drag delta
        euler.y -= deltaX * 0.005; // Horizontal rotation
        euler.x -= deltaY * 0.005; // Vertical rotation

        // Limit vertical rotation
        euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));

        // Apply rotation to camera
        camera.quaternion.setFromEuler(euler);

        // Update stored rotation and mouse position
        cameraRotationRef.current.copy(euler);
        setMousePosition({ x: currentMouseX, y: currentMouseY });
      };

      const onMouseDown = (event) => {
        console.log('Mouse down on locked node');
        const rect = canvas.getBoundingClientRect();
        setMousePosition({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top
        });
        setIsMouseDown(true);
        canvas.style.cursor = 'grabbing';
      };

      const onMouseUp = () => {
        console.log('Mouse up on locked node');
        setIsMouseDown(false);
        canvas.style.cursor = 'grab';
      };

      canvas.addEventListener('mousemove', onMouseMove);
      canvas.addEventListener('mousedown', onMouseDown);
      canvas.addEventListener('mouseup', onMouseUp);
      canvas.style.cursor = 'grab';

      return () => {
        canvas.removeEventListener('mousemove', onMouseMove);
        canvas.removeEventListener('mousedown', onMouseDown);
        canvas.removeEventListener('mouseup', onMouseUp);
        canvas.style.cursor = 'default';
      };
    }
  }, [isLockedToNode, isMouseDown, mousePosition]);

  return (
    <>
      <OrbitControls
        ref={controlsRef}
        enableDamping={true}
        dampingFactor={0.05}
        minDistance={isLockedToNode ? 0 : 50}
        maxDistance={isLockedToNode ? 0 : 5000}
        target={[0, 0, 0]}
        enablePan={!isLockedToNode}
        enableZoom={!isLockedToNode}
        enableRotate={!isLockedToNode}
        enabled={!isLockedToNode}
        makeDefault={!isLockedToNode}
        mouseButtons={{
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN
        }}
        touches={{
          ONE: THREE.TOUCH.ROTATE,
          TWO: THREE.TOUCH.DOLLY_PAN
        }}
      />

      {/* Add fog for depth perception */}
      {settings.fogEnabled && (
        <fog attach="fog" args={['#0a0a0a', 1000, 4000]} />
      )}

      {/* Add additional lighting */}
      <pointLight position={[500, 500, 500]} intensity={0.3} />
      <pointLight position={[-500, -500, -500]} intensity={0.3} />
      <pointLight position={[0, 1000, 0]} intensity={0.2} color="#4ecdc4" />

      {/* Add coordinate system axes for reference */}
      {settings.showCoordinateAxes && <CoordinateSystem />}

      {/* Add background gradient sphere */}
      {settings.showBackground && <BackgroundSphere />}

      {/* Add origin marker for debugging */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[5, 8, 8]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.5} />
      </mesh>

      {/* Background mesh for click detection */}
      <mesh
        onClick={handleBackgroundClick}
        visible={false}
        position={[0, 0, 0]}
      >
        <boxGeometry args={[10000, 10000, 10000]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      <group ref={groupRef}>
        {/* Render nodes */}
        {nodesRef.current.map((node, index) => {
          const isSelected = selectedNode && selectedNode.id === node.id;
          const isConnected = highlightedNodes.has(node.id);
          const isDimmed = selectedNode && !isConnected;

          // Hide the selected node when we've "become" it
          if (isSelected) return null;

          return (
            <Node
              key={node.id}
              node={node}
              index={index}
              color={getNodeColor(node, index)}
              onClick={handleNodeClick}
              onHover={handleNodeHover}
              isHovered={hoveredNode && hoveredNode.id === node.id}
              isSelected={false} // Never show as selected since we hide selected nodes
              isConnected={isConnected}
              isDimmed={isDimmed}
              isDragging={isDragging}
              renderingSettings={settings}
            />
          );
        })}

        {/* Render links */}
        {settings.edgeVisibility && linksRef.current.map((link, index) => {
          const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
          const targetId = typeof link.target === 'object' ? link.target.id : link.target;
          const isHighlighted = selectedNode && (sourceId === selectedNode.id || targetId === selectedNode.id);
          const isDimmed = selectedNode && !isHighlighted;

          return (
            <Link
              key={`${link.source}-${link.target}-${index}`}
              link={link}
              index={index}
              nodes={nodesRef.current}
              isHighlighted={isHighlighted}
              isDimmed={isDimmed}
              renderingSettings={settings}
            />
          );
        })}

        {/* Render labels */}
        {settings.showLabels === 'always' && nodesRef.current.map((node, index) => (
          <Billboard
            key={`label-${node.id}`}
            position={[node.x, node.y + settings.labelDistance, node.z]}
            follow={true}
            lockX={false}
            lockY={false}
            lockZ={false}
            renderOrder={10000}
          >
            <Text
              color={settings.labelColor}
              fontSize={settings.labelSize}
              anchorX="center"
              anchorY="middle"
              maxWidth={200}
              outlineWidth={settings.labelBackground ? 2 : 0}
              outlineColor="#000000"
              material-depthTest={false}
              material-renderOrder={9999}
            >
              {node.label || node.name || node.id}
            </Text>
          </Billboard>
        ))}

        {/* Render labels for hovered nodes */}
        {settings.showLabels === 'hover' && hoveredNode && !selectedNode && (
          <DistanceScaledLabel
            key={`hover-label-${hoveredNode.id}`}
            node={hoveredNode}
            isSelected={false}
            labelColor={settings.labelColor}
            settings={settings}
            camera={camera}
          />
        )}

        {/* Render labels for connected nodes only (hide selected node label) */}
        {selectedNode && nodesRef.current.map((node) => {
          const shouldShowLabel = highlightedNodes.has(node.id);
          const isTheSelectedNode = selectedNode.id === node.id;

          // Don't show label for the selected node since we've "become" it
          if (!shouldShowLabel || isTheSelectedNode) return null;

          const labelColor = '#4ecdc4';

          return (
            <DistanceScaledLabel
              key={`connected-label-${node.id}`}
              node={node}
              isSelected={false}
              labelColor={labelColor}
              settings={settings}
              camera={camera}
            />
          );
        })}
      </group>
    </>
  );
};

// Node component
const Node = ({ node, index, color, onClick, onHover, isHovered, isSelected, isConnected, isDimmed, isDragging, renderingSettings }) => {
  const meshRef = useRef();
  const { camera } = useThree();

  // Calculate distance-based opacity and scale
  const [distanceOpacity, setDistanceOpacity] = useState(1);
  const [distanceScale, setDistanceScale] = useState(1);
  const [shouldRender, setShouldRender] = useState(true);

  useFrame(() => {
    if (meshRef.current && camera && renderingSettings) {
      const distance = camera.position.distanceTo(meshRef.current.position);

      // Distance culling - only cull at very far distances
      if (renderingSettings.distanceCulling && distance > renderingSettings.cullingDistance * 2) {
        setShouldRender(false);
        return;
      } else {
        setShouldRender(true);
      }

      // Level of Detail - adjust opacity and scale based on distance
      if (renderingSettings.levelOfDetail) {
        // More conservative LOD scaling
        const opacity = Math.max(0.6, Math.min(1, 5000 / Math.max(distance, 50)));
        setDistanceOpacity(opacity);

        const scale = Math.max(0.8, Math.min(1.5, 2000 / Math.max(distance, 100)));
        setDistanceScale(scale);
      } else {
        setDistanceOpacity(1);
        setDistanceScale(1);
      }
    }
  });

  if (!shouldRender) return null;

  const handleClick = (e) => {
    e.stopPropagation();
    // Only handle click if it wasn't a drag operation and not currently dragging
    if (!isDragging && e.delta <= 2) {
      onClick(node, e.nativeEvent);
    }
  };

  const handlePointerEnter = (e) => {
    e.stopPropagation();
    if (!isDragging) {
      document.body.style.cursor = 'pointer';
      onHover(node, true);
    }
  };

  const handlePointerLeave = (e) => {
    e.stopPropagation();
    if (!isDragging) {
      document.body.style.cursor = 'default';
      onHover(node, false);
    }
  };

  const handlePointerDown = (e) => {
    e.stopPropagation();
  };

  const handlePointerUp = (e) => {
    e.stopPropagation();
  };

  return (
    <mesh
      ref={meshRef}
      position={[node.x || 0, node.y || 0, node.z || 0]}
      onClick={handleClick}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      userData={{ type: 'node', index, node }}
      scale={isSelected ? distanceScale * 2.0 : (isHovered ? distanceScale * 1.5 : distanceScale)}
    >
      <sphereGeometry args={[renderingSettings?.nodeSize || 8, 16, 16]} />
      <meshLambertMaterial
        color={color}
        transparent={true}
        opacity={
          isDimmed ? 0.2 :
          isSelected ? 1.0 :
          isHovered ? Math.min(1, (distanceOpacity * (renderingSettings?.nodeOpacity || 0.8)) * 1.2) :
          isConnected ? Math.min(1, (distanceOpacity * (renderingSettings?.nodeOpacity || 0.8)) * 1.1) :
          Math.max(0.4, distanceOpacity * (renderingSettings?.nodeOpacity || 0.8))
        }
        depthWrite={true}
        depthTest={true}
      />

      {/* Add node borders/glow effect */}
      {(renderingSettings?.nodeBorders || renderingSettings?.glowEffect || isSelected || isConnected) && (
        <mesh scale={isSelected ? 1.3 : (isConnected ? 1.2 : 1.1)}>
          <sphereGeometry args={[renderingSettings?.nodeSize || 8, 16, 16]} />
          <meshBasicMaterial
            color={isSelected ? '#ffff00' : (isConnected ? '#4ecdc4' : (renderingSettings?.glowEffect ? color : '#ffffff'))}
            transparent={true}
            opacity={
              isDimmed ? 0.1 :
              isSelected ? 0.6 :
              isConnected ? 0.4 :
              renderingSettings?.glowEffect ? (isHovered ? 0.4 : 0.2) :
              (renderingSettings?.nodeBorders ? (renderingSettings?.nodeBorderWidth || 0.1) : 0)
            }
            depthWrite={false}
            side={THREE.BackSide}
          />
        </mesh>
      )}
    </mesh>
  );
};

// Link component
const Link = ({ link, index, nodes, isHighlighted, isDimmed, renderingSettings }) => {
  const lineRef = useRef();
  const { camera } = useThree();
  const [linkOpacity, setLinkOpacity] = useState(0.6);

  const sourceNode = typeof link.source === 'object' ? link.source :
                    nodes.find(n => n.id === link.source);
  const targetNode = typeof link.target === 'object' ? link.target :
                    nodes.find(n => n.id === link.target);

  if (!sourceNode || !targetNode) return null;

  const positions = new Float32Array([
    sourceNode.x || 0, sourceNode.y || 0, sourceNode.z || 0,
    targetNode.x || 0, targetNode.y || 0, targetNode.z || 0
  ]);

  // Calculate midpoint for distance-based opacity
  const midpoint = new THREE.Vector3(
    (sourceNode.x + targetNode.x) / 2,
    (sourceNode.y + targetNode.y) / 2,
    (sourceNode.z + targetNode.z) / 2
  );

  useFrame(() => {
    if (camera && renderingSettings?.levelOfDetail) {
      const distance = camera.position.distanceTo(midpoint);
      // More conservative link opacity scaling
      const distanceOpacity = Math.max(0.4, Math.min(1, 3000 / Math.max(distance, 100)));
      setLinkOpacity(distanceOpacity * (renderingSettings?.edgeOpacity || 0.6));
    } else {
      setLinkOpacity(renderingSettings?.edgeOpacity || 0.6);
    }
  });

  return (
    <line ref={lineRef} userData={{ type: 'link', index }}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          array={positions}
          count={2}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial
        color={isHighlighted ? '#4ecdc4' : (renderingSettings?.edgeUniformColor || '#888888')}
        transparent={true}
        opacity={isDimmed ? linkOpacity * 0.2 : (isHighlighted ? linkOpacity * 1.5 : linkOpacity)}
        linewidth={(renderingSettings?.edgeThickness || 1) * (link.value || 1) * (isHighlighted ? 2 : 1)}
        depthTest={true}
        depthWrite={false}
      />
    </line>
  );
};


// Coordinate system helper
const CoordinateSystem = () => {
  return (
    <group>
      {/* X-axis - Red */}
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            array={new Float32Array([-200, 0, 0, 200, 0, 0])}
            count={2}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#ff6b6b" opacity={0.3} transparent />
      </line>

      {/* Y-axis - Green */}
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            array={new Float32Array([0, -200, 0, 0, 200, 0])}
            count={2}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#26de81" opacity={0.3} transparent />
      </line>

      {/* Z-axis - Blue */}
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            array={new Float32Array([0, 0, -200, 0, 0, 200])}
            count={2}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#45b7d1" opacity={0.3} transparent />
      </line>
    </group>
  );
};

// Background sphere for depth reference
const BackgroundSphere = () => {
  return (
    <mesh>
      <sphereGeometry args={[3000, 32, 32]} />
      <meshBasicMaterial
        color="#0a0a0a"
        transparent
        opacity={0.1}
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  );
};

// Distance-scaled label component for consistent screen size
const DistanceScaledLabel = ({ node, isSelected, labelColor, settings, camera }) => {
  const [scale, setScale] = useState(1);
  const billboardRef = useRef();

  useFrame(() => {
    if (!billboardRef.current || !camera) return;

    const nodePosition = new THREE.Vector3(node.x || 0, node.y || 0, node.z || 0);
    const distance = camera.position.distanceTo(nodePosition);

    // Calculate scale to maintain consistent screen size
    // Base scale at distance 500, adjust proportionally
    const baseDistance = 500;
    const targetScreenSize = isSelected ? 1.3 : 1.0;
    const calculatedScale = Math.max(0.3, Math.min(3.0, (distance / baseDistance) * targetScreenSize));

    setScale(calculatedScale);
  });

  const baseFontSize = settings.labelSize || 12;
  const fontSize = baseFontSize;
  const labelDistance = isSelected ? settings.labelDistance * 1.2 : settings.labelDistance;
  const outlineWidth = isSelected ? 2 : (settings.labelBackground ? 2 : 0);

  return (
    <Billboard
      ref={billboardRef}
      position={[node.x, node.y + (labelDistance * scale), node.z]}
      follow={true}
      lockX={false}
      lockY={false}
      lockZ={false}
      renderOrder={10000}
      scale={scale}
    >
      <Text
        color={labelColor}
        fontSize={fontSize}
        anchorX="center"
        anchorY="middle"
        maxWidth={200}
        outlineWidth={outlineWidth}
        outlineColor="#000000"
        material-depthTest={false}
        material-renderOrder={9999}
      >
        {node.label || node.name || node.id}
        {isSelected && ' [SELECTED]'}
        {node.accessible === false && (
          "\n(Referenced - No Direct Access)"
        )}
        {node.type && node.type !== 'channel' && node.type !== 'node' && (
          `\n[${node.type}]`
        )}
      </Text>
    </Billboard>
  );
};

export default NetworkGraph3D;
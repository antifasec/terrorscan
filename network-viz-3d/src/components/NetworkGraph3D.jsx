import React, { useRef, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { LAYOUT_ALGORITHMS } from '../utils/layoutAlgorithms';

const NetworkGraph3D = ({ data, selectedAlgorithm, algorithmSettings, isSimulationRunning, onEquilibriumChange, renderingSettings, selectedNode, onNodeSelect, onFlyToNode }) => {

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
  const [isFlying, setIsFlying] = useState(false);
  const lockedNodePositionRef = useRef(new THREE.Vector3());
  const cameraRotationRef = useRef(new THREE.Euler());
  const [isAtEquilibrium, setIsAtEquilibrium] = useState(false);
  const [perturbationCycle, setPerturbationCycle] = useState(0);
  const { camera, gl } = useThree();

  // Calculate dynamic node size based on user count or degree
  const getNodeSize = (node) => {
    const baseSize = settings.nodeSize || 8;

    // Check for user count properties (common in channel/server data)
    const userCount = node.user_count || node.users || node.members || node.member_count || node.size;

    if (userCount && typeof userCount === 'number') {
      // Scale based on user count (logarithmic scaling for better visual distribution)
      const minSize = baseSize * 0.5;
      const maxSize = baseSize * 3;
      const scaleFactor = Math.log10(Math.max(userCount, 1)) / Math.log10(1000); // Scale to max at 1000 users
      return Math.max(minSize, Math.min(maxSize, baseSize + (scaleFactor * (maxSize - baseSize))));
    }

    // Fallback to degree-based sizing if no user count
    const degree = linksRef.current.filter(link =>
      (typeof link.source === 'object' ? link.source.id : link.source) === node.id ||
      (typeof link.target === 'object' ? link.target.id : link.target) === node.id
    ).length;

    if (degree > 0) {
      const maxDegree = Math.max(...nodesRef.current.map(n =>
        linksRef.current.filter(link =>
          (typeof link.source === 'object' ? link.source.id : link.source) === n.id ||
          (typeof link.target === 'object' ? link.target.id : link.target) === n.id
        ).length
      ));
      const degreeScale = maxDegree > 0 ? degree / maxDegree : 0;
      return baseSize + (degreeScale * baseSize * 0.5); // Scale up to 1.5x base size
    }

    return baseSize;
  };

  // Dynamic node color based on rendering settings
  const getNodeColor = (node) => {
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

    // Shift universe so selected node appears at center if not in first-person mode and not flying
    if (selectedNode && !isLockedToNode && !isFlying) {
      const currentSelectedNode = nodesRef.current.find(n => n.id === selectedNode.id);
      if (currentSelectedNode) {
        // Calculate how much to shift the universe
        const offsetX = currentSelectedNode.x || 0;
        const offsetY = currentSelectedNode.y || 0;
        const offsetZ = currentSelectedNode.z || 0;

        // Only apply offset if the selected node has moved significantly
        if (Math.abs(offsetX) > 0.1 || Math.abs(offsetY) > 0.1 || Math.abs(offsetZ) > 0.1) {
          // Shift all nodes so the selected node appears at origin
          nodesRef.current.forEach(node => {
            node.x = (node.x || 0) - offsetX;
            node.y = (node.y || 0) - offsetY;
            node.z = (node.z || 0) - offsetZ;
          });
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
    console.log('🎯 handleNodeClick called:', node.id, node.label || node.name, new Date().toLocaleTimeString());
    console.log('isLockedToNode:', isLockedToNode);

    // Single click behavior depends on current mode
    if (isLockedToNode) {
      console.log('⭐ In first-person mode - flying to star');
      // In first-person mode: fly to the clicked star
      flyToStar(node);
    } else {
      console.log('🎯 Normal mode - selecting and centering node');
      // Normal mode: select node, center it, show connections
      onNodeSelect(node);
      centerNodeAtOrigin(node);
      highlightConnectedNodes(node);
      setIsLockedToNode(false);
    }
  };

  const handleNodeHover = (node, isHovering) => {
    if (isDragging) return
    setHoveredNode(isHovering ? node : null);
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

    // Base distance, increased for nodes with more connections - farther for edge view
    const baseDistance = 500; // Increased for better edge visibility
    const connectionBonus = Math.min(nodeConnections.length * 30, 300);
    const targetDistance = baseDistance + connectionBonus;

    // Calculate camera position around the node
    const nodePosition = new THREE.Vector3(node.x || 0, node.y || 0, node.z || 0);
    const direction = camera.position.clone().sub(nodePosition).normalize();
    const newCameraPosition = nodePosition.clone().add(direction.multiplyScalar(targetDistance));

    // Push other nodes farther away from the focused node
    const pushDistance = 300; // Increased push distance for better edge visibility
    const connectedNodeIds = new Set();

    // Get connected node IDs
    nodeConnections.forEach(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      if (sourceId !== node.id) connectedNodeIds.add(sourceId);
      if (targetId !== node.id) connectedNodeIds.add(targetId);
    });

    // Store original positions for restoration
    const originalPositions = nodesRef.current.map(n => ({
      id: n.id,
      x: n.x,
      y: n.y,
      z: n.z
    }));

    // Push non-connected nodes away
    nodesRef.current.forEach(otherNode => {
      if (otherNode.id === node.id) return; // Skip the focused node

      const isConnected = connectedNodeIds.has(otherNode.id);
      if (!isConnected) {
        // Calculate direction from focused node to this node
        const otherPosition = new THREE.Vector3(otherNode.x || 0, otherNode.y || 0, otherNode.z || 0);
        const pushDirection = otherPosition.clone().sub(nodePosition);

        // If nodes are too close, use a random direction
        if (pushDirection.length() < 10) {
          pushDirection.set(
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2
          );
        }

        pushDirection.normalize().multiplyScalar(pushDistance);

        // Apply the push
        otherNode.x += pushDirection.x;
        otherNode.y += pushDirection.y;
        otherNode.z += pushDirection.z;
      }
    });

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
    console.log('Camera focused on node:', node.id, 'at distance:', targetDistance, '- pushed', nodesRef.current.length - connectedNodeIds.size - 1, 'nodes away');
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

  // Function to set up universe centering on a node
  const centerNodeAtOrigin = (targetNode) => {
    console.log('Setting up universe centering on node:', targetNode.id);
    // No need to do anything here - the centering happens in the animation loop
  };

  // Function to fly into a node for first-person view
  const flyIntoNode = (node) => {
    if (!camera || !controlsRef.current) return;

    console.log('🚀 Starting flight to node:', node.id);

    // Set flying state to prevent universe centering interference
    setIsFlying(true);

    // Get current positions
    const startPosition = camera.position.clone();
    const startTarget = controlsRef.current.target.clone();
    const targetPosition = new THREE.Vector3(0, 0, 0); // Node is at origin

    console.log('📍 Start position:', startPosition);
    console.log('🎯 Target position:', targetPosition);
    console.log('📏 Flight distance:', startPosition.distanceTo(targetPosition));

    // Disable OrbitControls during flight
    controlsRef.current.enabled = false;

    // Check if we're already very close to the target
    const flightDistance = startPosition.distanceTo(targetPosition);
    if (flightDistance < 100) {
      console.log('⚡ Already close to target, extending camera back for dramatic flight');
      // Move camera further back along current direction for a more dramatic flight
      const direction = startPosition.clone().sub(targetPosition).normalize();
      if (direction.length() === 0) {
        // If no direction, use a default one
        direction.set(1, 1, 1).normalize();
      }
      startPosition.copy(targetPosition.clone().add(direction.multiplyScalar(1000)));
      camera.position.copy(startPosition);
      controlsRef.current.update();
      console.log('📍 New start position:', startPosition);
    }

    const duration = 3000; // 3 second flight for very visible animation
    const startTime = Date.now();

    const animateCamera = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Smooth easing function with slow start and end
      const easeInOutQuart = (t) => t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t;
      const easedProgress = easeInOutQuart(progress);

      // Log progress every 500ms
      if (Math.floor(elapsed / 500) !== Math.floor((elapsed - 16) / 500)) {
        console.log(`✈️ Flight progress: ${Math.round(progress * 100)}%`);
      }

      // Interpolate camera position to center
      const currentPos = startPosition.clone().lerp(targetPosition, easedProgress);
      camera.position.copy(currentPos);

      // Look ahead in the direction we were originally facing
      const lookDirection = startTarget.clone().sub(startPosition).normalize();
      const lookTarget = targetPosition.clone().add(lookDirection.multiplyScalar(100));
      const currentTarget = startTarget.clone().lerp(lookTarget, easedProgress);
      controlsRef.current.target.copy(currentTarget);
      controlsRef.current.update();

      if (progress < 1) {
        requestAnimationFrame(animateCamera);
      } else {
        console.log('🎉 Flight completed!');
        setIsFlying(false); // Re-enable universe centering
        // Controls will be handled by the locking mechanism
      }
    };

    requestAnimationFrame(animateCamera);
  };

  // Function to fly to another node while in first-person mode (star teleportation)
  const flyToStar = (targetNode) => {
    if (!camera || !controlsRef.current) return;

    // Get the target node's current position in the mesh
    const targetPosition = new THREE.Vector3(targetNode.x || 0, targetNode.y || 0, targetNode.z || 0);

    // Smooth flight to the target star's position
    const startPosition = camera.position.clone();
    const startTarget = controlsRef.current.target.clone();
    const duration = 1000; // 1 second flight between stars
    const startTime = Date.now();

    const animateCamera = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Smooth easing function
      const easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
      const easedProgress = easeInOutCubic(progress);

      // Get current target node position (it may have moved during flight)
      const currentTargetPosition = new THREE.Vector3(targetNode.x || 0, targetNode.y || 0, targetNode.z || 0);

      // Interpolate camera position to target star's current position
      camera.position.lerpVectors(startPosition, currentTargetPosition, easedProgress);

      // Maintain look direction relative to new position
      const lookDirection = startTarget.clone().sub(startPosition).normalize();
      const newTarget = currentTargetPosition.clone().add(lookDirection.multiplyScalar(100));
      controlsRef.current.target.lerpVectors(startTarget, newTarget, easedProgress);
      controlsRef.current.update();

      if (progress < 1) {
        requestAnimationFrame(animateCamera);
      }
    };

    // Update selected node and highlight connections
    onNodeSelect(targetNode);
    highlightConnectedNodes(targetNode);

    animateCamera();
    console.log('Flying to star:', targetNode.id, 'at position:', targetPosition);
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

  // Expose flyIntoNode function to parent component
  React.useEffect(() => {
    if (onFlyToNode) {
      onFlyToNode(() => (node) => {
        setIsLockedToNode(true);
        flyIntoNode(node);
      });
    }
  }, [onFlyToNode]);

  // Set up mouse-based drag detection instead of OrbitControls events
  React.useEffect(() => {
    if (!gl.domElement) return;

    const canvas = gl.domElement;
    let mouseDownTime = 0;
    let mouseDownPosition = { x: 0, y: 0 };
    let dragTimeout = null;

    const handleMouseDown = (event) => {
      mouseDownTime = Date.now();
      mouseDownPosition = { x: event.clientX, y: event.clientY };

      // Set dragging to true after 100ms or if mouse moves significantly
      dragTimeout = setTimeout(() => {
        setIsDragging(true);
      }, 100);
    };

    const handleMouseMove = (event) => {
      if (mouseDownTime > 0) {
        const deltaX = Math.abs(event.clientX - mouseDownPosition.x);
        const deltaY = Math.abs(event.clientY - mouseDownPosition.y);

        // If mouse moved more than 5 pixels, it's a drag
        if (deltaX > 5 || deltaY > 5) {
          if (dragTimeout) {
            clearTimeout(dragTimeout);
            dragTimeout = null;
          }
          setIsDragging(true);
        }
      }
    };

    const handleMouseUp = () => {
      if (dragTimeout) {
        clearTimeout(dragTimeout);
        dragTimeout = null;
      }
      mouseDownTime = 0;
      setIsDragging(false);
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseUp); // Handle mouse leaving canvas

    return () => {
      if (dragTimeout) clearTimeout(dragTimeout);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseUp);
    };
  }, [gl.domElement]);

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


      {/* Background mesh for click detection */}
      {/*
      <mesh
        onClick={handleBackgroundClick}
        visible={false}
        position={[0, 0, 0]}
      >
        <boxGeometry args={[10000, 10000, 10000]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
      */}

      <group ref={groupRef}>
        {/* Render nodes */}
        {React.useMemo(() => nodesRef.current.map((node, index) => {
          const isSelected = selectedNode && selectedNode.id === node.id;
          const isConnected = highlightedNodes.has(node.id);
          const isDimmed = selectedNode && !isConnected;

          // Hide the selected node only when in first-person mode (locked to node)
          if (isSelected && isLockedToNode) return null;

          return (
            <Node
              key={node.id}
              node={node}
              index={index}
              color={getNodeColor(node, index)}
              size={getNodeSize(node)}
              onClick={handleNodeClick}
              onHover={handleNodeHover}
              isHovered={hoveredNode?.id === node.id}
              isSelected={false} // Never show as selected since we hide selected nodes
              isConnected={isConnected}
              isDimmed={isDimmed}
              isDragging={isDragging}
              renderingSettings={settings}
            />
          );
        }), [selectedNode, highlightedNodes, hoveredNode, isDragging, settings, isLockedToNode])}

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
          <DistanceScaledLabel
            key={`always-label-${node.id}`}
            node={node}
            isSelected={selectedNode && selectedNode.id === node.id}
            labelColor={settings.labelColor}
            settings={settings}
            camera={camera}
          />
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

        {/* Render labels for connected nodes and selected node */}
        {selectedNode && nodesRef.current.map((node) => {
          const shouldShowLabel = highlightedNodes.has(node.id);
          const isTheSelectedNode = selectedNode.id === node.id;

          // Show label for connected nodes and the selected node (unless in first-person mode)
          if (!shouldShowLabel) return null;
          if (isTheSelectedNode && isLockedToNode) return null; // Hide only in first-person mode

          const labelColor = isTheSelectedNode ? '#ffff00' : '#4ecdc4'; // Yellow for selected, cyan for connected

          return (
            <DistanceScaledLabel
              key={`connected-label-${node.id}`}
              node={node}
              isSelected={isTheSelectedNode}
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

// Node component (with proper memo comparison)
const Node = React.memo(({ node, index, color, size, onClick, onHover, isHovered, isSelected, isConnected, isDimmed, isDragging, renderingSettings }) => {
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
    console.log('Node click detected:', node.id, 'isDragging:', isDragging, 'delta:', e.delta);
    // Only handle click if it wasn't a drag operation and not currently dragging
    if (!isDragging && e.delta <= 2) {
      console.log('Calling onClick for node:', node.id);
      onClick(node, e.nativeEvent);
    } else {
      console.log('Click blocked - isDragging:', isDragging, 'delta:', e.delta);
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
      <sphereGeometry args={[size || renderingSettings?.nodeSize || 8, 16, 16]} />
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
          <sphereGeometry args={[size || renderingSettings?.nodeSize || 8, 16, 16]} />
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
}, (prevProps, nextProps) => {
  // Custom comparison function - only re-render if visual props change
  return (
    prevProps.node.id === nextProps.node.id &&
    prevProps.isHovered === nextProps.isHovered &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isConnected === nextProps.isConnected &&
    prevProps.isDimmed === nextProps.isDimmed &&
    prevProps.isDragging === nextProps.isDragging &&
    prevProps.color === nextProps.color &&
    prevProps.size === nextProps.size
    // Don't compare onClick/onHover functions as they may change references
  );
});

// Simple cylinder connecting two nodes with correct geometry usage
const Link = ({ link, index, nodes, isHighlighted, isDimmed, renderingSettings }) => {
  const lineRef = useRef();
  const { camera } = useThree();

  // Get source and target nodes
  const sourceNode = typeof link.source === 'object' ? link.source :
                     nodes.find(n => n.id === link.source);
  const targetNode = typeof link.target === 'object' ? link.target :
                     nodes.find(n => n.id === link.target);

  // Don't render if nodes aren't found
  if (!sourceNode || !targetNode) return null;

  // Calculate distance-based opacity for performance
  const [distanceOpacity, setDistanceOpacity] = useState(1);
  const [shouldRender, setShouldRender] = useState(true);

  useFrame(() => {
    if (lineRef.current && camera && renderingSettings) {
      // Calculate midpoint of the link for distance calculation
      const midX = (sourceNode.x + targetNode.x) / 2;
      const midY = (sourceNode.y + targetNode.y) / 2;
      const midZ = (sourceNode.z + targetNode.z) / 2;
      const midpoint = new THREE.Vector3(midX, midY, midZ);

      const distance = camera.position.distanceTo(midpoint);

      // Distance culling - hide very distant links
      if (renderingSettings.distanceCulling && distance > renderingSettings.cullingDistance) {
        setShouldRender(false);
        return;
      } else {
        setShouldRender(true);
      }

      // Level of Detail - adjust opacity based on distance
      if (renderingSettings.levelOfDetail) {
        const opacity = Math.max(0.1, Math.min(1, 3000 / Math.max(distance, 50)));
        setDistanceOpacity(opacity);
      } else {
        setDistanceOpacity(1);
      }
    }
  });

  if (!shouldRender) return null;

  // Create line geometry between the two points
  const positions = new Float32Array([
    sourceNode.x || 0, sourceNode.y || 0, sourceNode.z || 0,
    targetNode.x || 0, targetNode.y || 0, targetNode.z || 0
  ]);

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
        color={renderingSettings.edgeUniformColor || '#888888'}
        transparent={true}
        opacity={
          isDimmed ? 0.1 :
          isHighlighted ? Math.min(1, distanceOpacity * 0.8) :
          Math.max(0.1, distanceOpacity * (renderingSettings.edgeOpacity || 0.6))
        }
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
    // Use camera's projection to get true screen-space scaling
    const baseDistance = 500;
    const targetScreenSize = isSelected ? 1.3 : 1.0;

    // More consistent scaling based on camera distance
    const scaleRatio = distance / baseDistance;
    const calculatedScale = Math.max(0.5, Math.min(5.0, scaleRatio * targetScreenSize));

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
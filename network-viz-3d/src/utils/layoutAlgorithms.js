import * as d3 from 'd3';

// Extended D3 force for Z-axis
function forceZ(z) {
  let nodes,
      strength = 0.1,
      strengths,
      zz;

  if (z == null) z = 0;

  function force() {
    for (let i = 0, n = nodes.length, node; i < n; ++i) {
      node = nodes[i];
      if (node.z == null) node.z = 0;
      node.vz = node.vz || 0;
      node.vz += (zz - node.z) * strengths[i];
    }
  }

  function initialize() {
    if (!nodes) return;
    let i, n = nodes.length;
    strengths = new Array(n);
    for (i = 0; i < n; ++i) {
      strengths[i] = isNaN(zz = +z) ? 0 : strength;
    }
  }

  force.initialize = function(_nodes) {
    nodes = _nodes;
    initialize();
  };

  force.strength = function(_) {
    return arguments.length ? (strength = +_, initialize(), force) : strength;
  };

  force.z = function(_) {
    return arguments.length ? (z = typeof _ === "function" ? _ : +_, initialize(), force) : z;
  };

  return force;
}

// 3D Force-Directed Layout (Baseline)
export function create3DForceDirectedLayout(nodes, links, settings) {
  const {
    repulsiveStrength = 20,
    attractiveStrength = 0.01,
    linkDistance = 0.01,
    dampingFactor = 0.9,
    centeringStrength = 0.001,
    maxVelocity = 10
  } = settings;

  // Initialize positions and velocities
  nodes.forEach(node => {
    if (node.x === undefined) node.x = (Math.random() - 0.5) * 400;
    if (node.y === undefined) node.y = (Math.random() - 0.5) * 400;
    if (node.z === undefined) node.z = (Math.random() - 0.5) * 400;
    node.vx = node.vx || 0;
    node.vy = node.vy || 0;
    node.vz = node.vz || 0;
  });

  function step() {
    // Reset forces
    nodes.forEach(node => {
      node.fx = 0;
      node.fy = 0;
      node.fz = 0;
    });

    // Repulsive forces (all nodes repel each other)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const nodeA = nodes[i];
        const nodeB = nodes[j];

        const dx = nodeA.x - nodeB.x;
        const dy = nodeA.y - nodeB.y;
        const dz = nodeA.z - nodeB.z;
        const distanceSquared = dx * dx + dy * dy + dz * dz + 1; // Add 1 to prevent division by zero
        const distance = Math.sqrt(distanceSquared);

        const force = repulsiveStrength / distanceSquared;
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;
        const fz = (dz / distance) * force;

        nodeA.fx += fx;
        nodeA.fy += fy;
        nodeA.fz += fz;
        nodeB.fx -= fx;
        nodeB.fy -= fy;
        nodeB.fz -= fz;
      }
    }

    // Attractive forces (connected nodes attract)
    links.forEach(link => {
      const source = typeof link.source === 'object' ? link.source :
                    nodes.find(n => n.id === link.source);
      const target = typeof link.target === 'object' ? link.target :
                    nodes.find(n => n.id === link.target);

      if (!source || !target) return;

      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dz = target.z - source.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (distance > 0) {
        const force = attractiveStrength * (distance - linkDistance);
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;
        const fz = (dz / distance) * force;

        source.fx += fx;
        source.fy += fy;
        source.fz += fz;
        target.fx -= fx;
        target.fy -= fy;
        target.fz -= fz;
      }
    });

    // Apply centering force
    nodes.forEach(node => {
      node.fx -= node.x * centeringStrength;
      node.fy -= node.y * centeringStrength;
      node.fz -= node.z * centeringStrength;
    });

    // Update velocities and positions with damping
    let maxDisplacement = 0;
    nodes.forEach(node => {
      node.vx = (node.vx + node.fx * 0.1) * dampingFactor;
      node.vy = (node.vy + node.fy * 0.1) * dampingFactor;
      node.vz = (node.vz + node.fz * 0.1) * dampingFactor;

      // Limit maximum velocity
      const velocity = Math.sqrt(node.vx * node.vx + node.vy * node.vy + node.vz * node.vz);
      if (velocity > maxVelocity) {
        const scale = maxVelocity / velocity;
        node.vx *= scale;
        node.vy *= scale;
        node.vz *= scale;
      }

      node.x += node.vx;
      node.y += node.vy;
      node.z += node.vz;

      // Constrain to bounds
      const maxBound = 1000;
      node.x = Math.max(-maxBound, Math.min(maxBound, node.x));
      node.y = Math.max(-maxBound, Math.min(maxBound, node.y));
      node.z = Math.max(-maxBound, Math.min(maxBound, node.z));

      maxDisplacement = Math.max(maxDisplacement, velocity);
    });

    return maxDisplacement > 0.1; // Continue if nodes are still moving
  }

  return { step, nodes, links };
}

// Improved 3D Fruchterman-Reingold Algorithm
export function createFruchtermanReingold3DLayout(nodes, links, settings) {
  const {
    volume = 1000000, // 3D space volume
    iterations = 100,
    coolingRate = 0.95,
    initialTemperature = null, // Auto-calculated
    gravitationalConstant = 0.01
  } = settings;

  const optimalDistance = Math.cbrt(volume / nodes.length);
  let temperature = initialTemperature || Math.cbrt(volume) / 10;
  let currentIteration = 0;

  // Initialize positions in 3D sphere
  nodes.forEach((node, index) => {
    if (node.x === undefined || node.y === undefined || node.z === undefined) {
      const radius = Math.cbrt(Math.random()) * 200; // Uniform distribution in sphere
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      node.x = radius * Math.sin(phi) * Math.cos(theta);
      node.y = radius * Math.sin(phi) * Math.sin(theta);
      node.z = radius * Math.cos(phi);
    }
  });

  function calculateRepulsiveForce(distance, optimalDist) {
    return (optimalDist * optimalDist) / Math.max(distance, 1);
  }

  function calculateAttractiveForce(distance, optimalDist) {
    return (distance * distance) / optimalDist;
  }

  function step() {
    if (currentIteration >= iterations || temperature < 0.01) return false;

    // Reset forces
    nodes.forEach(node => {
      node.fx = 0;
      node.fy = 0;
      node.fz = 0;
    });

    // Repulsive forces between all node pairs
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const nodeA = nodes[i];
        const nodeB = nodes[j];

        const dx = nodeA.x - nodeB.x;
        const dy = nodeA.y - nodeB.y;
        const dz = nodeA.z - nodeB.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (distance > 0) {
          const repulsiveForce = calculateRepulsiveForce(distance, optimalDistance);
          const fx = (dx / distance) * repulsiveForce;
          const fy = (dy / distance) * repulsiveForce;
          const fz = (dz / distance) * repulsiveForce;

          nodeA.fx += fx;
          nodeA.fy += fy;
          nodeA.fz += fz;
          nodeB.fx -= fx;
          nodeB.fy -= fy;
          nodeB.fz -= fz;
        }
      }
    }

    // Attractive forces for connected nodes
    links.forEach(link => {
      const source = typeof link.source === 'object' ? link.source :
                    nodes.find(n => n.id === link.source);
      const target = typeof link.target === 'object' ? link.target :
                    nodes.find(n => n.id === link.target);

      if (!source || !target) return;

      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dz = target.z - source.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (distance > 0) {
        const attractiveForce = calculateAttractiveForce(distance, optimalDistance);
        const fx = (dx / distance) * attractiveForce;
        const fy = (dy / distance) * attractiveForce;
        const fz = (dz / distance) * attractiveForce;

        source.fx += fx;
        source.fy += fy;
        source.fz += fz;
        target.fx -= fx;
        target.fy -= fy;
        target.fz -= fz;
      }
    });

    // Add mild gravitational pull to center
    nodes.forEach(node => {
      const distanceFromCenter = Math.sqrt(node.x * node.x + node.y * node.y + node.z * node.z);
      if (distanceFromCenter > 0) {
        const gravitationalForce = gravitationalConstant * distanceFromCenter;
        node.fx -= (node.x / distanceFromCenter) * gravitationalForce;
        node.fy -= (node.y / distanceFromCenter) * gravitationalForce;
        node.fz -= (node.z / distanceFromCenter) * gravitationalForce;
      }
    });

    // Apply forces with temperature constraint
    nodes.forEach(node => {
      const forceLength = Math.sqrt(node.fx * node.fx + node.fy * node.fy + node.fz * node.fz);

      if (forceLength > 0) {
        const displacement = Math.min(temperature, forceLength);
        const ratio = displacement / forceLength;

        node.x += node.fx * ratio;
        node.y += node.fy * ratio;
        node.z += node.fz * ratio;

        // Soft bounds to keep visualization reasonable
        const maxBound = Math.cbrt(volume) / 2;
        const boundingForce = 0.1;

        if (Math.abs(node.x) > maxBound) {
          node.x *= (1 - boundingForce);
        }
        if (Math.abs(node.y) > maxBound) {
          node.y *= (1 - boundingForce);
        }
        if (Math.abs(node.z) > maxBound) {
          node.z *= (1 - boundingForce);
        }
      }
    });

    temperature *= coolingRate;
    currentIteration++;

    return currentIteration < iterations && temperature > 0.01;
  }

  return { step, nodes, links };
}

// 3D Spring-Embedder Algorithm
export function createSpringEmbedderLayout(nodes, links, settings) {
  const {
    springLength = 100,
    springStrength = 0.1,
    repulsion = 1000,
    damping = 0.9,
    maxIterations = 1000
  } = settings;

  let iteration = 0;

  // Initialize positions and velocities
  nodes.forEach(node => {
    if (node.x === undefined) node.x = (Math.random() - 0.5) * 400;
    if (node.y === undefined) node.y = (Math.random() - 0.5) * 400;
    if (node.z === undefined) node.z = (Math.random() - 0.5) * 400;
    node.vx = 0;
    node.vy = 0;
    node.vz = 0;
  });

  function step() {
    if (iteration >= maxIterations) return false;

    // Reset forces
    nodes.forEach(node => {
      node.fx = node.fy = node.fz = 0;
    });

    // Spring forces (attractive)
    links.forEach(link => {
      const source = typeof link.source === 'object' ? link.source :
                    nodes.find(n => n.id === link.source);
      const target = typeof link.target === 'object' ? link.target :
                    nodes.find(n => n.id === link.target);

      if (!source || !target) return;

      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dz = target.z - source.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (distance > 0) {
        const force = springStrength * (distance - springLength);
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;
        const fz = (dz / distance) * force;

        source.fx += fx;
        source.fy += fy;
        source.fz += fz;
        target.fx -= fx;
        target.fy -= fy;
        target.fz -= fz;
      }
    });

    // Repulsive forces
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const u = nodes[i];
        const v = nodes[j];

        const dx = u.x - v.x;
        const dy = u.y - v.y;
        const dz = u.z - v.z;
        const distanceSquared = dx * dx + dy * dy + dz * dz;

        if (distanceSquared > 0) {
          const distance = Math.sqrt(distanceSquared);
          const force = repulsion / distanceSquared;
          const fx = (dx / distance) * force;
          const fy = (dy / distance) * force;
          const fz = (dz / distance) * force;

          u.fx += fx;
          u.fy += fy;
          u.fz += fz;
          v.fx -= fx;
          v.fy -= fy;
          v.fz -= fz;
        }
      }
    }

    // Update positions using Verlet integration
    let maxDisplacement = 0;
    nodes.forEach(node => {
      // Add mild centering force
      const centeringStrength = 0.0005;
      node.fx -= node.x * centeringStrength;
      node.fy -= node.y * centeringStrength;
      node.fz -= node.z * centeringStrength;

      // Update velocity
      node.vx = (node.vx + node.fx * 0.01) * damping;
      node.vy = (node.vy + node.fy * 0.01) * damping;
      node.vz = (node.vz + node.fz * 0.01) * damping;

      // Update position
      node.x += node.vx;
      node.y += node.vy;
      node.z += node.vz;

      // Constrain to bounds
      const maxBound = 1200;
      node.x = Math.max(-maxBound, Math.min(maxBound, node.x));
      node.y = Math.max(-maxBound, Math.min(maxBound, node.y));
      node.z = Math.max(-maxBound, Math.min(maxBound, node.z));

      const displacement = Math.sqrt(node.vx * node.vx + node.vy * node.vy + node.vz * node.vz);
      maxDisplacement = Math.max(maxDisplacement, displacement);
    });

    iteration++;
    return maxDisplacement > 0.1;
  }

  return { step, nodes, links };
}

// Standard D3 Force Layout (extended to 3D)
export function createD3ForceLayout(nodes, links, settings) {
  // Debug logging
  console.log('D3 Force Layout - Nodes:', nodes.length, 'Links:', links.length);

  // Ensure all nodes have proper IDs
  const nodeIds = new Set(nodes.map(n => n.id));
  console.log('Node IDs available:', Array.from(nodeIds).slice(0, 10)); // Show first 10

  // Check for problematic links
  const problematicLinks = links.filter(link =>
    !nodeIds.has(link.source) || !nodeIds.has(link.target)
  );

  if (problematicLinks.length > 0) {
    console.error('D3 Force: Found problematic links:', problematicLinks.slice(0, 5));
    console.error('Sample source IDs in links:', links.slice(0, 5).map(l => l.source));
    console.error('Sample node IDs:', nodes.slice(0, 5).map(n => n.id));
  }

  // Filter out problematic links before passing to D3
  const validLinks = links.filter(link =>
    nodeIds.has(link.source) && nodeIds.has(link.target)
  );

  console.log('D3 Force: Using', validLinks.length, 'valid links out of', links.length, 'total');

  const simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(validLinks).id(d => d.id).distance(settings.linkDistance || 100))
    .force("charge", d3.forceManyBody().strength(settings.chargeStrength || -300))
    .force("center", d3.forceCenter(0, 0, 0))
    .force("x", d3.forceX(0).strength(settings.centerStrength || 0.1))
    .force("y", d3.forceY(0).strength(settings.centerStrength || 0.1))
    .force("z", forceZ(0).strength(settings.centerStrength || 0.1))
    .alphaDecay(settings.alphaDecay || 0.02)
    .velocityDecay(settings.velocityDecay || 0.4);

  return {
    step: () => {
      simulation.tick();
      return simulation.alpha() > simulation.alphaMin();
    },
    simulation,
    nodes,
    links: validLinks, // Use the filtered links
    restart: () => simulation.restart(),
    stop: () => simulation.stop()
  };
}

// 3D Enhanced D3 Force Layout
export function create3DD3ForceLayout(nodes, links, settings) {
  const {
    chargeStrength = 0,
    linkDistance = 0,
    centerStrength = 0,
    collisionRadius = 20,
    zStrength = 0.1,
    alphaDecay = 0.02,
    velocityDecay = 0.4
  } = settings;

  // Initialize positions in 3D space
  nodes.forEach(node => {
    if (node.x === undefined) node.x = (Math.random() - 0.5) * 600;
    if (node.y === undefined) node.y = (Math.random() - 0.5) * 600;
    if (node.z === undefined) node.z = (Math.random() - 0.5) * 600;
  });

  // Create D3 simulation with 3D forces
  const simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(linkDistance))
    .force('charge', d3.forceManyBody().strength(chargeStrength))
    .force('center', d3.forceCenter(0, 0).strength(centerStrength))
    .force('collision', d3.forceCollide().radius(collisionRadius))
    .force('z', forceZ(0).strength(zStrength))
    .alphaDecay(alphaDecay)
    .velocityDecay(velocityDecay);

  function step() {
    simulation.tick();

    // Add 3D positioning logic with improved damping
    nodes.forEach(node => {
      // Ensure Z velocity exists
      if (!node.vz) node.vz = 0;

      // Apply gentle centering force in Z direction with better damping
      const zCenteringForce = (0 - node.z) * zStrength * 0.02; // Reduced from 0.1
      node.vz += zCenteringForce;

      // Apply strong velocity damping to prevent oscillation
      node.vz *= 0.85; // Stronger damping than the main velocityDecay

      // Update Z position with damped velocity
      node.z += node.vz;

      // Smooth bounds constraint to prevent bouncing
      const maxBound = 1000;
      const boundDamping = 0.2;

      if (node.x > maxBound) {
        node.x = maxBound;
        node.vx = node.vx ? node.vx * -boundDamping : 0;
      } else if (node.x < -maxBound) {
        node.x = -maxBound;
        node.vx = node.vx ? node.vx * -boundDamping : 0;
      }

      if (node.y > maxBound) {
        node.y = maxBound;
        node.vy = node.vy ? node.vy * -boundDamping : 0;
      } else if (node.y < -maxBound) {
        node.y = -maxBound;
        node.vy = node.vy ? node.vy * -boundDamping : 0;
      }

      if (node.z > maxBound) {
        node.z = maxBound;
        node.vz *= -boundDamping;
      } else if (node.z < -maxBound) {
        node.z = -maxBound;
        node.vz *= -boundDamping;
      }
    });

    return simulation.alpha() > simulation.alphaMin();
  }

  return { step, nodes, links };
}

// 3D Twopi (Radial) Layout
export function create3DTwopiLayout(nodes, links, settings) {
  const {
    radius = 300,
    layers = 5,
    layerHeight = 100,
    centerNodeId = null,
    angleSpread = Math.PI * 2,
    radialForce = 0.02,
    angularDamping = 0.95
  } = settings;

  let centerNode = centerNodeId ? nodes.find(n => n.id === centerNodeId) : null;
  if (!centerNode && nodes.length > 0) {
    // Find most connected node as center
    const degrees = new Map();
    nodes.forEach(node => degrees.set(node.id, 0));
    links.forEach(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      degrees.set(sourceId, degrees.get(sourceId) + 1);
      degrees.set(targetId, degrees.get(targetId) + 1);
    });
    centerNode = nodes.reduce((max, node) =>
      degrees.get(node.id) > degrees.get(max.id) ? node : max);
  }

  // Build adjacency for BFS layering
  const adjacency = new Map();
  nodes.forEach(node => adjacency.set(node.id, []));
  links.forEach(link => {
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
    const targetId = typeof link.target === 'object' ? link.target.id : link.target;
    adjacency.get(sourceId).push(targetId);
    adjacency.get(targetId).push(sourceId);
  });

  // BFS to assign layers
  const visited = new Set();
  const nodeLayer = new Map();
  const queue = [{ id: centerNode.id, layer: 0 }];
  visited.add(centerNode.id);
  nodeLayer.set(centerNode.id, 0);

  while (queue.length > 0) {
    const { id, layer } = queue.shift();
    adjacency.get(id).forEach(neighborId => {
      if (!visited.has(neighborId)) {
        visited.add(neighborId);
        const newLayer = Math.min(layer + 1, layers - 1);
        nodeLayer.set(neighborId, newLayer);
        queue.push({ id: neighborId, layer: newLayer });
      }
    });
  }

  // Position nodes in layers
  const layerNodes = Array(layers).fill(null).map(() => []);
  nodes.forEach(node => {
    const layer = nodeLayer.get(node.id) || layers - 1;
    layerNodes[layer].push(node);
  });

  // Initialize positions
  layerNodes.forEach((layerNodeList, layer) => {
    const layerRadius = radius * (layer === 0 ? 0 : (layer + 1) / layers);
    const nodesInLayer = layerNodeList.length;

    layerNodeList.forEach((node, index) => {
      const angle = (index / nodesInLayer) * angleSpread;
      node.x = layerRadius * Math.cos(angle);
      node.y = layerRadius * Math.sin(angle);
      node.z = (layer - layers / 2) * layerHeight;
      node.targetX = node.x;
      node.targetY = node.y;
      node.targetZ = node.z;
      node.vx = 0;
      node.vy = 0;
      node.vz = 0;
    });
  });

  function step() {
    nodes.forEach(node => {
      // Apply radial forces toward target positions
      const dx = node.targetX - node.x;
      const dy = node.targetY - node.y;
      const dz = node.targetZ - node.z;

      node.vx += dx * radialForce;
      node.vy += dy * radialForce;
      node.vz += dz * radialForce;

      node.vx *= angularDamping;
      node.vy *= angularDamping;
      node.vz *= angularDamping;

      node.x += node.vx;
      node.y += node.vy;
      node.z += node.vz;
    });

    return true; // Always continue
  }

  return { step, nodes, links };
}

// 3D Circo (Circular) Layout
export function create3DCircoLayout(nodes, links, settings) {
  const {
    radius = 400,
    spiralTightness = 0.5,
    heightVariation = 200,
    rotationSpeed = 0.01,
    clusterForce = 0.05,
    separationForce = 50
  } = settings;

  let time = 0;

  // Create clusters based on connectivity
  const clusters = new Map();
  const nodeCluster = new Map();

  // Simple clustering by connected components
  const visited = new Set();
  let clusterId = 0;

  nodes.forEach(node => {
    if (!visited.has(node.id)) {
      const cluster = [];
      const queue = [node.id];
      visited.add(node.id);

      while (queue.length > 0) {
        const currentId = queue.shift();
        cluster.push(nodes.find(n => n.id === currentId));
        nodeCluster.set(currentId, clusterId);

        links.forEach(link => {
          const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
          const targetId = typeof link.target === 'object' ? link.target.id : link.target;

          if (sourceId === currentId && !visited.has(targetId)) {
            visited.add(targetId);
            queue.push(targetId);
          } else if (targetId === currentId && !visited.has(sourceId)) {
            visited.add(sourceId);
            queue.push(sourceId);
          }
        });
      }

      clusters.set(clusterId, cluster);
      clusterId++;
    }
  });

  // Initialize positions in circular/spiral pattern
  nodes.forEach((node, index) => {
    const cluster = nodeCluster.get(node.id) || 0;
    const clusterOffset = (cluster / clusters.size) * Math.PI * 2;
    const spiralAngle = (index / nodes.length) * Math.PI * 8 * spiralTightness + clusterOffset;
    const spiralRadius = radius * (0.3 + (index / nodes.length) * 0.7);

    node.x = spiralRadius * Math.cos(spiralAngle);
    node.y = spiralRadius * Math.sin(spiralAngle);
    node.z = (Math.sin(spiralAngle * 0.5) * heightVariation) + (cluster * 50);

    node.vx = 0;
    node.vy = 0;
    node.vz = 0;
    node.cluster = cluster;
  });

  function step() {
    time += rotationSpeed;

    nodes.forEach((node, index) => {
      // Gentle rotation
      const currentRadius = Math.sqrt(node.x * node.x + node.y * node.y);
      const currentAngle = Math.atan2(node.y, node.x) + rotationSpeed;

      const targetX = currentRadius * Math.cos(currentAngle);
      const targetY = currentRadius * Math.sin(currentAngle);
      const targetZ = node.z + Math.sin(time + index * 0.1) * 5;

      // Apply cluster forces
      clusters.get(node.cluster).forEach(otherNode => {
        if (otherNode.id !== node.id) {
          const dx = otherNode.x - node.x;
          const dy = otherNode.y - node.y;
          const dz = otherNode.z - node.z;
          const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

          if (distance > 0) {
            const force = clusterForce / (distance * distance);
            node.vx += dx * force;
            node.vy += dy * force;
            node.vz += dz * force;
          }
        }
      });

      // Apply separation forces between different clusters
      nodes.forEach(otherNode => {
        if (otherNode.id !== node.id && otherNode.cluster !== node.cluster) {
          const dx = node.x - otherNode.x;
          const dy = node.y - otherNode.y;
          const dz = node.z - otherNode.z;
          const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

          if (distance > 0 && distance < separationForce * 2) {
            const force = separationForce / (distance * distance);
            node.vx += dx * force;
            node.vy += dy * force;
            node.vz += dz * force;
          }
        }
      });

      // Move toward targets with damping
      node.vx += (targetX - node.x) * 0.02;
      node.vy += (targetY - node.y) * 0.02;
      node.vz += (targetZ - node.z) * 0.02;

      node.vx *= 0.85;
      node.vy *= 0.85;
      node.vz *= 0.85;

      node.x += node.vx;
      node.y += node.vy;
      node.z += node.vz;

      // Constrain bounds
      const maxBound = 800;
      node.x = Math.max(-maxBound, Math.min(maxBound, node.x));
      node.y = Math.max(-maxBound, Math.min(maxBound, node.y));
      node.z = Math.max(-maxBound, Math.min(maxBound, node.z));
    });

    return true; // Always continue
  }

  return { step, nodes, links };
}

// 3D Spherical Layout
export function createSphericalLayout(nodes, links, settings) {
  const {
    radius = 400,
    layerCount = 5,
    densityAdjustment = 1.2,
    rotationSpeed = 0.005,
    levelSeparation = 0.8
  } = settings;

  // Calculate graph distances for layering (BFS)
  function calculateDistances(startNode) {
    const distances = new Map();
    const queue = [{ node: startNode, distance: 0 }];
    const visited = new Set();

    distances.set(startNode.id, 0);
    visited.add(startNode.id);

    while (queue.length > 0) {
      const { node: currentNode, distance } = queue.shift();

      links.forEach(link => {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;

        let neighborId = null;
        if (sourceId === currentNode.id && !visited.has(targetId)) {
          neighborId = targetId;
        } else if (targetId === currentNode.id && !visited.has(sourceId)) {
          neighborId = sourceId;
        }

        if (neighborId && !visited.has(neighborId)) {
          visited.add(neighborId);
          distances.set(neighborId, distance + 1);
          const neighborNode = nodes.find(n => n.id === neighborId);
          if (neighborNode) {
            queue.push({ node: neighborNode, distance: distance + 1 });
          }
        }
      });
    }

    return distances;
  }

  // Find most connected node as center
  const nodeDegrees = new Map();
  nodes.forEach(node => nodeDegrees.set(node.id, 0));
  links.forEach(link => {
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
    const targetId = typeof link.target === 'object' ? link.target.id : link.target;
    nodeDegrees.set(sourceId, (nodeDegrees.get(sourceId) || 0) + 1);
    nodeDegrees.set(targetId, (nodeDegrees.get(targetId) || 0) + 1);
  });

  const centerNode = nodes.reduce((max, node) =>
    nodeDegrees.get(node.id) > nodeDegrees.get(max.id) ? node : max
  );

  // Calculate distances from center
  const distances = calculateDistances(centerNode);

  // Group nodes by distance (layer)
  const layers = Array(layerCount).fill(null).map(() => []);
  nodes.forEach(node => {
    const distance = distances.get(node.id) || layerCount - 1;
    const layerIndex = Math.min(distance, layerCount - 1);
    layers[layerIndex].push(node);
  });

  // Position nodes on spherical layers
  layers.forEach((layerNodes, layerIndex) => {
    const layerRadius = layerIndex === 0 ? 0 : (layerIndex / layerCount) * radius * densityAdjustment;
    const nodesCount = layerNodes.length;

    if (layerIndex === 0 && nodesCount === 1) {
      // Center node at origin
      const node = layerNodes[0];
      node.x = 0;
      node.y = 0;
      node.z = 0;
      node.targetX = 0;
      node.targetY = 0;
      node.targetZ = 0;
      node.vx = node.vx || 0;
      node.vy = node.vy || 0;
      node.vz = node.vz || 0;
      node.layer = layerIndex;
    } else {
      // Use golden angle for even distribution on sphere surface
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));

      layerNodes.forEach((node, nodeIndex) => {
        if (nodesCount === 1) {
          // Single node in layer - place on positive X axis
          node.x = layerRadius;
          node.y = 0;
          node.z = 0;
        } else {
          // Fibonacci sphere distribution for even spacing
          const i = nodeIndex / Math.max(nodesCount - 1, 1);
          const y = 1 - (i * 2); // Range [-1, 1]
          const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
          const theta = goldenAngle * nodeIndex;

          node.x = layerRadius * radiusAtY * Math.cos(theta);
          node.y = layerRadius * y * levelSeparation;
          node.z = layerRadius * radiusAtY * Math.sin(theta);
        }

        // Store initial target positions for animation
        node.targetX = node.x;
        node.targetY = node.y;
        node.targetZ = node.z;
        node.vx = node.vx || 0;
        node.vy = node.vy || 0;
        node.vz = node.vz || 0;
        node.layer = layerIndex;
      });
    }
  });

  let time = 0;

  function step() {
    time += rotationSpeed;
    let hasMovement = false;

    nodes.forEach(node => {
      // Gentle rotation around Y-axis for each layer
      const layerRotation = time * (1 + node.layer * 0.2);
      const currentRadius = Math.sqrt(node.targetX * node.targetX + node.targetZ * node.targetZ);

      if (currentRadius > 0) {
        const newTargetX = currentRadius * Math.cos(layerRotation);
        const newTargetZ = currentRadius * Math.sin(layerRotation);

        // Smooth movement toward new target
        const springForce = 0.02;
        const damping = 0.9;

        node.vx += (newTargetX - node.x) * springForce;
        node.vz += (newTargetZ - node.z) * springForce;

        node.vx *= damping;
        node.vz *= damping;

        node.x += node.vx;
        node.z += node.vz;

        if (Math.abs(node.vx) > 0.01 || Math.abs(node.vz) > 0.01) {
          hasMovement = true;
        }
      }
    });

    return true; // Always continue for animation
  }

  return { step, nodes, links };
}

// 3D Layered (Sugiyama-style) Layout
export function createLayeredLayout(nodes, links, settings) {
  const {
    layerHeight = 200,
    nodeSpacing = 100,
    layerSpacing = 300,
    crossingReduction = true,
    maxIterations = 50
  } = settings;

  // Build adjacency lists
  const adjacency = new Map();
  nodes.forEach(node => adjacency.set(node.id, { incoming: [], outgoing: [] }));

  links.forEach(link => {
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
    const targetId = typeof link.target === 'object' ? link.target.id : link.target;

    if (adjacency.has(sourceId) && adjacency.has(targetId)) {
      adjacency.get(sourceId).outgoing.push(targetId);
      adjacency.get(targetId).incoming.push(sourceId);
    }
  });

  // Assign layers using longest path algorithm (topological sort)
  function assignLayers() {
    const inDegree = new Map();
    const layers = new Map();

    // Calculate in-degrees
    nodes.forEach(node => inDegree.set(node.id, adjacency.get(node.id).incoming.length));

    // Find nodes with no incoming edges (roots)
    const queue = nodes.filter(node => inDegree.get(node.id) === 0);
    queue.forEach(node => layers.set(node.id, 0));

    let processedCount = 0;
    let currentLayerNodes = [...queue];
    let currentLayer = 0;

    while (currentLayerNodes.length > 0) {
      const nextLayerNodes = [];

      currentLayerNodes.forEach(node => {
        const nodeId = node.id;

        adjacency.get(nodeId).outgoing.forEach(neighborId => {
          const newInDegree = inDegree.get(neighborId) - 1;
          inDegree.set(neighborId, newInDegree);

          if (newInDegree === 0) {
            const neighborNode = nodes.find(n => n.id === neighborId);
            if (neighborNode) {
              layers.set(neighborId, currentLayer + 1);
              nextLayerNodes.push(neighborNode);
            }
          }
        });

        processedCount++;
      });

      currentLayerNodes = nextLayerNodes;
      currentLayer++;
    }

    // Handle cycles by assigning remaining nodes to appropriate layers
    nodes.forEach(node => {
      if (!layers.has(node.id)) {
        layers.set(node.id, currentLayer);
      }
    });

    return layers;
  }

  const nodeLayers = assignLayers();
  const maxLayer = Math.max(...Array.from(nodeLayers.values()));

  // Group nodes by layer
  const layerGroups = Array(maxLayer + 1).fill(null).map(() => []);
  nodes.forEach(node => {
    const layer = nodeLayers.get(node.id);
    layerGroups[layer].push(node);
  });

  // Position nodes
  function positionNodes() {
    layerGroups.forEach((layerNodes, layerIndex) => {
      const y = (layerIndex - maxLayer / 2) * layerSpacing;
      const nodesInLayer = layerNodes.length;

      if (nodesInLayer === 0) return;

      if (nodesInLayer === 1) {
        // Single node - place at center of layer
        const node = layerNodes[0];
        node.x = 0;
        node.y = y;
        node.z = 0;
        node.vx = node.vx || 0;
        node.vy = node.vy || 0;
        node.vz = node.vz || 0;
        node.layer = layerIndex;
      } else {
        // Multiple nodes - arrange in a circle within each layer
        const radius = Math.max(nodeSpacing, nodesInLayer * nodeSpacing / (2 * Math.PI));

        layerNodes.forEach((node, nodeIndex) => {
          const angle = (nodeIndex / nodesInLayer) * Math.PI * 2;

          node.x = radius * Math.cos(angle);
          node.y = y;
          node.z = radius * Math.sin(angle);

          node.vx = node.vx || 0;
          node.vy = node.vy || 0;
          node.vz = node.vz || 0;
          node.layer = layerIndex;
        });
      }
    });
  }

  // Initial positioning
  positionNodes();

  // Crossing reduction using barycenter method
  function reduceCrossings() {
    if (!crossingReduction) return;

    for (let iter = 0; iter < maxIterations; iter++) {
      let hasChanges = false;

      // Process each layer
      for (let layerIndex = 1; layerIndex <= maxLayer; layerIndex++) {
        const currentLayer = layerGroups[layerIndex];
        const previousLayer = layerGroups[layerIndex - 1];

        // Calculate barycenters
        const barycenters = currentLayer.map(node => {
          const connectedNodes = adjacency.get(node.id).incoming
            .map(id => previousLayer.find(n => n.id === id))
            .filter(Boolean);

          if (connectedNodes.length === 0) return { node, barycenter: 0 };

          const avgAngle = connectedNodes.reduce((sum, connectedNode) => {
            return sum + Math.atan2(connectedNode.z, connectedNode.x);
          }, 0) / connectedNodes.length;

          return { node, barycenter: avgAngle };
        });

        // Sort by barycenter and reposition
        barycenters.sort((a, b) => a.barycenter - b.barycenter);

        barycenters.forEach(({ node }, index) => {
          const newAngle = (index / currentLayer.length) * Math.PI * 2;
          const radius = Math.max(nodeSpacing, currentLayer.length * nodeSpacing / (2 * Math.PI));

          const newX = radius * Math.cos(newAngle);
          const newZ = radius * Math.sin(newAngle);

          if (Math.abs(node.x - newX) > 1 || Math.abs(node.z - newZ) > 1) {
            hasChanges = true;
            node.x = newX;
            node.z = newZ;
          }
        });
      }

      if (!hasChanges) break;
    }
  }

  reduceCrossings();

  function step() {
    // Minimal animation - just return true to keep it stable
    // Optionally add subtle breathing effect
    const time = Date.now() * 0.0005;

    nodes.forEach((node, index) => {
      // Very subtle breathing effect
      const breathe = Math.sin(time + index * 0.05) * 2;
      const originalRadius = Math.sqrt(node.x * node.x + node.z * node.z);

      if (originalRadius > 0) {
        const scale = (originalRadius + breathe) / originalRadius;
        node.x = node.x * (0.95 + scale * 0.05); // Very subtle
        node.z = node.z * (0.95 + scale * 0.05);
      }
    });

    return true; // Always continue for animation
  }

  return { step, nodes, links };
}

// Layout algorithm registry
export const LAYOUT_ALGORITHMS = {
  '3d-force-directed': {
    name: '3D Force-Directed (Baseline)',
    description: 'Improved 3D force-directed layout with node repulsion in all dimensions',
    create: create3DForceDirectedLayout,
    settings: {
      repulsiveStrength: { min: 200, max: 2000, default: 800, step: 50, label: 'Repulsion Force' },
      attractiveStrength: { min: 0.01, max: 0.5, default: 0.1, step: 0.01, label: 'Attraction Force' },
      linkDistance: { min: 50, max: 400, default: 150, step: 10, label: 'Link Distance' },
      dampingFactor: { min: 0.8, max: 0.99, default: 0.9, step: 0.01, label: 'Damping' },
      centeringStrength: { min: 0.001, max: 0.1, default: 0.02, step: 0.001, label: 'Centering Force' },
      maxVelocity: { min: 1, max: 50, default: 10, step: 1 }
    }
  },
  'fruchterman-reingold-3d': {
    name: 'Fruchterman-Reingold 3D',
    description: 'Enhanced FR algorithm with uniform 3D distribution and gravitational centering',
    create: createFruchtermanReingold3DLayout,
    settings: {
      volume: { min: 200000, max: 5000000, default: 1000000, step: 100000 },
      iterations: { min: 20, max: 200, default: 100, step: 10 },
      coolingRate: { min: 0.9, max: 0.99, default: 0.95, step: 0.01 },
      gravitationalConstant: { min: 0.001, max: 0.05, default: 0.01, step: 0.001 }
    }
  },
  'spherical': {
    name: 'Spherical Layout',
    description: 'Arranges nodes on spherical layers based on graph distance for radial clarity',
    create: createSphericalLayout,
    settings: {
      radius: { min: 200, max: 800, default: 400, step: 25 },
      layerCount: { min: 3, max: 10, default: 5, step: 1 },
      densityAdjustment: { min: 0.5, max: 2.0, default: 1.2, step: 0.1 },
      rotationSpeed: { min: 0.001, max: 0.02, default: 0.005, step: 0.001 },
      levelSeparation: { min: 0.3, max: 1.5, default: 0.8, step: 0.1 }
    }
  },
  'layered': {
    name: 'Layered (Sugiyama-style)',
    description: 'Hierarchical layout with nodes stacked in Z-axis layers for tree-like structures',
    create: createLayeredLayout,
    settings: {
      layerHeight: { min: 100, max: 500, default: 200, step: 25 },
      nodeSpacing: { min: 50, max: 200, default: 100, step: 10 },
      layerSpacing: { min: 100, max: 500, default: 300, step: 25 },
      maxIterations: { min: 10, max: 100, default: 50, step: 5 }
    }
  }
  // Note: Removed less effective algorithms (spring-embedder, 3d-twopi, 3d-circo)
  // These provided limited clarity improvements over the new optimized layouts
};
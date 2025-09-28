import * as THREE from 'three'
import { DEPTH_COLORS, NODE_SIZE_MULTIPLIER, MIN_NODE_SIZE, MAX_NODE_SIZE } from './constants'

export const getNodeColor = (node, selected, hovered, selectedNode, isConnected) => {
  if (selected) return '#ffffff' // Bright white for center of universe
  if (hovered) return '#4ecdc4'
  if (selectedNode && isConnected) return '#ffff00' // Bright yellow for connected nodes

  // Use dataset color if available
  if (node._datasetColor) {
    return node._datasetColor
  }

  // Fallback to cyberpunk neon color scheme by depth
  const depth = node.depth || 0
  return DEPTH_COLORS[Math.min(depth, DEPTH_COLORS.length - 1)]
}

export const getNodeOpacity = (selected, hovered, selectedNode, isConnected) => {
  if (selected || hovered) return 1.0
  if (selectedNode && isConnected) return 0.9 // Highlighted connected nodes
  if (selectedNode && !isConnected) return 0.3 // Dimmed non-connected nodes
  return 0.7 // Default opacity
}

export const getNodeSize = (node) => {
  return Math.max(MIN_NODE_SIZE, Math.min(MAX_NODE_SIZE, (node.size || 5) * NODE_SIZE_MULTIPLIER))
}

export const calculateNetworkCentroid = (nodes) => {
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

  return validNodes > 0 ?
    new THREE.Vector3(centerX / validNodes, centerY / validNodes, centerZ / validNodes) :
    new THREE.Vector3(0, 0, 0)
}

export const calculateBoundingBox = (nodes) => {
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  let minZ = Infinity, maxZ = -Infinity

  nodes.forEach(node => {
    if (node.x !== undefined && node.y !== undefined && node.z !== undefined) {
      minX = Math.min(minX, node.x)
      maxX = Math.max(maxX, node.x)
      minY = Math.min(minY, node.y)
      maxY = Math.max(maxY, node.y)
      minZ = Math.min(minZ, node.z)
      maxZ = Math.max(maxZ, node.z)
    }
  })

  const width = maxX - minX
  const height = maxY - minY
  const depth = maxZ - minZ
  const maxDimension = Math.max(width, height, depth)

  return { width, height, depth, maxDimension, minX, maxX, minY, maxY, minZ, maxZ }
}

export const calculateOptimalCameraDistance = (maxDimension, fov = 50) => {
  const fovRadians = fov * (Math.PI / 180)
  return (maxDimension / 2) / Math.tan(fovRadians / 2) * 1.2 // 20% padding
}

export const isNodeConnectedToSelected = (link, selectedNodeId) => {
  if (!selectedNodeId) return false
  const sourceId = link.source.id || link.source
  const targetId = link.target.id || link.target
  return sourceId === selectedNodeId || targetId === selectedNodeId
}

export const findNodeById = (nodes, nodeId) => {
  return nodes.find(n => n.id === nodeId)
}

export const getDatasetInfo = (nodes) => {
  const datasetsInView = new Map()
  nodes.forEach(node => {
    if (node._datasetId && node._datasetName && node._datasetColor) {
      datasetsInView.set(node._datasetId, {
        id: node._datasetId,
        name: node._datasetName,
        color: node._datasetColor
      })
    }
  })
  return datasetsInView
}
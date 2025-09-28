import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import DirectionalCone from './DirectionalCone'

function Link({ link, nodes, selectedNode, currentMode }) {
  const cylinderRef = useRef()

  const isConnectedToSelected = selectedNode ? (() => {
    const sourceId = link.source.id || link.source
    const targetId = link.target.id || link.target
    return sourceId === selectedNode.id || targetId === selectedNode.id
  })() : false

  // Get source and target nodes for positioning
  const sourceNode = nodes.find(n => n.id === (link.source.id || link.source))
  const targetNode = nodes.find(n => n.id === (link.target.id || link.target))

  useFrame(() => {
    if (cylinderRef.current && sourceNode && targetNode) {
      const sourcePos = new THREE.Vector3(sourceNode.x || 0, sourceNode.y || 0, sourceNode.z || 0)
      const targetPos = new THREE.Vector3(targetNode.x || 0, targetNode.y || 0, targetNode.z || 0)

      // Calculate midpoint
      const midpoint = sourcePos.clone().add(targetPos).multiplyScalar(0.5)

      // Calculate distance for cylinder height
      const distance = sourcePos.distanceTo(targetPos)

      // Position cylinder at midpoint
      cylinderRef.current.position.copy(midpoint)

      // Set cylinder height to match distance (reset scale first)
      cylinderRef.current.scale.set(1, 1, 1)
      cylinderRef.current.scale.y = distance

      // Create rotation matrix to align cylinder with connection
      const matrix = new THREE.Matrix4()
      matrix.lookAt(sourcePos, targetPos, new THREE.Vector3(0, 0, 1))
      cylinderRef.current.setRotationFromMatrix(matrix)

      // Rotate so cylinder aligns with its Y-axis pointing along the connection
      cylinderRef.current.rotateX(Math.PI / 2)
    }
  })

  // Make cylinders smaller in first-person mode for connected edges
  const getRadiusForMode = () => {
    if (currentMode === 'firstperson' && isConnectedToSelected) {
      return 0.1 // Much smaller for first-person view
    }
    return isConnectedToSelected ? 0.8 : 0.4
  }

  const cylinderRadius = getRadiusForMode()

  return (
    <group>
      <mesh ref={cylinderRef} renderOrder={1}>
        <cylinderGeometry args={[cylinderRadius, cylinderRadius, 1, 8]} />
        <meshStandardMaterial
          color={isConnectedToSelected ? "#ffff00" : "#ffffff"}
          transparent
          opacity={isConnectedToSelected ? 0.95 : (selectedNode ? 0.4 : 0.8)}
          emissive={isConnectedToSelected ? "#ffff00" : "#ffffff"}
          emissiveIntensity={isConnectedToSelected ? 0.3 : 0.2}
          depthTest={true}
          depthWrite={false}
        />
      </mesh>

      {/* Directional cone */}
      {sourceNode && targetNode && (
        <DirectionalCone
          sourceNode={sourceNode}
          targetNode={targetNode}
          isHighlighted={isConnectedToSelected}
          currentMode={currentMode}
        />
      )}
    </group>
  )
}

export default Link
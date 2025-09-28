import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

function DirectionalCone({ sourceNode, targetNode, isHighlighted, currentMode }) {
  const coneRef = useRef()

  useFrame(() => {
    if (coneRef.current && sourceNode && targetNode) {
      const sourcePos = new THREE.Vector3(sourceNode.x || 0, sourceNode.y || 0, sourceNode.z || 0)
      const targetPos = new THREE.Vector3(targetNode.x || 0, targetNode.y || 0, targetNode.z || 0)

      // Position cone at the center of the edge
      const arrowPos = sourcePos.clone().lerp(targetPos, 0.5)
      coneRef.current.position.copy(arrowPos)

      // Create a matrix to align cone with direction
      const matrix = new THREE.Matrix4()
      matrix.lookAt(arrowPos, targetPos, new THREE.Vector3(0, 1, 0))
      coneRef.current.setRotationFromMatrix(matrix)

      // Rotate cone to point forward (cone geometry points up by default)
      coneRef.current.rotateX(-Math.PI / 2)
    }
  })

  const cylinderColor = isHighlighted ? "#ffff00" : "#ffffff"

  // Make cones smaller in first-person mode
  const getConeSize = () => {
    if (currentMode === 'firstperson' && isHighlighted) {
      return [0.5, 1, 8] // Much smaller for first-person view
    }
    return [2, 4, 8] // Normal size
  }

  return (
    <mesh ref={coneRef} renderOrder={2}>
      <coneGeometry args={getConeSize()} />
      <meshStandardMaterial
        color={cylinderColor}
        transparent
        opacity={isHighlighted ? 0.9 : 0.8}
        emissive={isHighlighted ? cylinderColor : cylinderColor}
        emissiveIntensity={isHighlighted ? 0.3 : 0.1}
        depthTest={true}
        depthWrite={false}
      />
    </mesh>
  )
}

export default DirectionalCone
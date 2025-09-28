import { useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

function DatasetBackground({ nodes, datasetId, datasetColor, onUpdateScreenPosition }) {
  const meshRef = useRef()
  const [setBoundingCircle] = useState({ center: { x: 0, y: 0, z: 0 }, radius: 10 })
  const { camera, size } = useThree()

  // Calculate bounding circle for dataset nodes
  useFrame(() => {
    const datasetNodes = nodes.filter(node => node._datasetId === datasetId)
    if (datasetNodes.length === 0) return

    // Calculate center of mass
    let centerX = 0, centerY = 0, centerZ = 0
    datasetNodes.forEach(node => {
      centerX += node.x || 0
      centerY += node.y || 0
      centerZ += node.z || 0
    })
    centerX /= datasetNodes.length
    centerY /= datasetNodes.length
    centerZ /= datasetNodes.length

    // Calculate radius (distance to furthest node + padding)
    let maxDistance = 0
    datasetNodes.forEach(node => {
      const distance = Math.sqrt(
        Math.pow((node.x || 0) - centerX, 2) +
        Math.pow((node.y || 0) - centerY, 2) +
        Math.pow((node.z || 0) - centerZ, 2)
      )
      maxDistance = Math.max(maxDistance, distance)
    })

    const newRadius = Math.max(8, maxDistance + 5) // Minimum radius + more padding for breathing room
    const newCenter = { x: centerX, y: centerY, z: centerZ }

    // Update position and scale
    if (meshRef.current) {
      meshRef.current.position.set(centerX, centerY, centerZ)
      meshRef.current.scale.setScalar(newRadius)
    }

    setBoundingCircle({ center: newCenter, radius: newRadius })

    // Calculate screen position for 2D overlay
    if (onUpdateScreenPosition && datasetNodes.length > 0) {
      const sphereCenter = new THREE.Vector3(centerX, centerY, centerZ)
      const screenPosition = sphereCenter.clone().project(camera)

      // Convert to pixel coordinates
      const x = (screenPosition.x * 0.5 + 0.5) * size.width
      const y = (screenPosition.y * -0.5 + 0.5) * size.height - (newRadius * 20) // Offset above sphere

      onUpdateScreenPosition(datasetId, { x, y, visible: screenPosition.z < 1 })
    }
  })

  if (nodes.filter(node => node._datasetId === datasetId).length === 0) {
    return null
  }

  return (
    <group>
      {/* Main spherical background */}
      <mesh ref={meshRef} renderOrder={-1}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial
          color={datasetColor}
          transparent
          opacity={0.08}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

export default DatasetBackground
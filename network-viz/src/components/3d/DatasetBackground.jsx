import { useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

function DatasetBackground({ nodes, datasetId, datasetColor, onUpdateScreenPosition }) {
  const meshRef = useRef()
  const [boundingCircle, setBoundingCircle] = useState({ center: { x: 0, y: 0, z: 0 }, radius: 10 })
  const [sphereOpacity, setSphereOpacity] = useState(0.08)
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

    const newRadius = Math.max(12, maxDistance + 15) // Minimum radius + more padding for breathing room
    const newCenter = { x: centerX, y: centerY, z: centerZ }

    // Update position and scale
    if (meshRef.current) {
      meshRef.current.position.set(centerX, centerY, centerZ)
      meshRef.current.scale.setScalar(newRadius)
    }

    setBoundingCircle({ center: newCenter, radius: newRadius })

    // Calculate screen position for 2D overlay
    if (onUpdateScreenPosition && datasetNodes.length > 0 && meshRef.current) {
      // Get world position of the sphere by applying mesh transformations
      const sphereCenter = new THREE.Vector3(centerX, centerY, centerZ)

      // Apply the parent mesh group transformations to get world position
      const worldPosition = sphereCenter.clone()
      meshRef.current.parent?.localToWorld(worldPosition)

      const screenPosition = worldPosition.project(camera)

      // Calculate screen-space radius using camera distance and field of view
      // This method is more robust across all rotation angles
      const cameraToSphere = camera.position.distanceTo(worldPosition)
      const fov = camera.fov * Math.PI / 180 // Convert to radians
      const screenRadius = (newRadius / cameraToSphere) * (size.height / (2 * Math.tan(fov / 2)))

      // Convert to pixel coordinates
      const centerScreenX = (screenPosition.x * 0.5 + 0.5) * size.width
      const centerScreenY = (screenPosition.y * -0.5 + 0.5) * size.height

      const x = centerScreenX
      const y = centerScreenY + screenRadius + 20

      // More comprehensive visibility check
      const isVisible = screenPosition.z < 1 &&
                       x >= -100 && x <= size.width + 100 &&
                       y >= -100 && y <= size.height + 100

      // Debug logging
      console.log(`Dataset ${datasetId}: sphere center (${centerX.toFixed(1)}, ${centerY.toFixed(1)}, ${centerZ.toFixed(1)}), world radius: ${newRadius.toFixed(1)}, camera distance: ${cameraToSphere.toFixed(1)}, screen radius: ${screenRadius.toFixed(1)}, label pos (${x}, ${y}), visible: ${isVisible}`)

      onUpdateScreenPosition(datasetId, { x, y, visible: isVisible })
    }

    // Calculate opacity based on camera distance to sphere
    if (meshRef.current) {
      const sphereWorldPosition = new THREE.Vector3(centerX, centerY, centerZ)
      meshRef.current.parent?.localToWorld(sphereWorldPosition)

      const cameraDistance = camera.position.distanceTo(sphereWorldPosition)
      const sphereRadius = newRadius

      // Fade out when camera is close to the sphere
      // Start fading when camera is within 3x the sphere radius
      // Completely invisible when camera is within 1x the sphere radius
      const fadeStartDistance = sphereRadius * 3
      const fadeEndDistance = sphereRadius * 1

      let newOpacity
      if (cameraDistance <= fadeEndDistance) {
        newOpacity = 0 // Completely transparent when very close
      } else if (cameraDistance <= fadeStartDistance) {
        // Linear fade between fadeEndDistance and fadeStartDistance
        const fadeProgress = (cameraDistance - fadeEndDistance) / (fadeStartDistance - fadeEndDistance)
        newOpacity = 0.08 * fadeProgress // Fade from 0 to 0.08
      } else {
        newOpacity = 0.08 // Normal opacity when far away
      }

      setSphereOpacity(newOpacity)

      // Debug proximity
      console.log(`Dataset ${datasetId}: camera distance=${cameraDistance.toFixed(1)}, sphere radius=${sphereRadius.toFixed(1)}, opacity=${newOpacity.toFixed(3)}`)
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
          opacity={sphereOpacity}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

export default DatasetBackground
import { useRef, useMemo, useState, useEffect, forwardRef, useImperativeHandle } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { forceSimulation, forceLink, forceManyBody, forceCenter } from 'd3-force-3d'

const MeshController = forwardRef(({ nodes, selectedNode, firstPersonTarget, setFirstPersonTarget, setCurrentMode, meshRef }, ref) => {
  const { gl, camera } = useThree()
  const isInitialized = useRef(false)
  const isTransitioning = useRef(false)
  const transitionStart = useRef(new THREE.Vector3())
  const transitionTarget = useRef(new THREE.Vector3())
  const transitionProgress = useRef(0)
  const lastSelectedNodeId = useRef(null)

  // Camera transition state
  const cameraTransition = useRef({
    isTransitioning: false,
    startPosition: new THREE.Vector3(),
    targetPosition: new THREE.Vector3(),
    startLookAt: new THREE.Vector3(),
    targetLookAt: new THREE.Vector3(),
    progress: 0,
    stabilizingFrames: 0
  })

  // Two modes: mesh rotation (no selection) vs camera orbit (node selected)
  const isMouseDown = useRef({ left: false, right: false })
  const lastMousePos = useRef({ x: 0, y: 0 })
  const meshRotation = useRef({ x: 0, y: 0 })
  const meshPosition = useRef(new THREE.Vector3(0, 0, 0))
  const panOffset = useRef(new THREE.Vector3(0, 0, 0))
  const userHasPanned = useRef(false)

  // First person look direction
  const firstPersonLookDirection = useRef(new THREE.Vector3(0, 0, -1))

  // Camera orbit mode (when node selected)
  const cameraSpherical = useRef({ radius: 20, phi: Math.PI / 2, theta: 0 })
  const targetCameraSpherical = useRef({ radius: 20, phi: Math.PI / 2, theta: 0 })
  const cameraTarget = useRef(new THREE.Vector3(0, 0, 0))

  // Current mode state
  const currentMode = useRef('mesh') // 'mesh' or 'camera'

  // Handle first person mode trigger
  useEffect(() => {
    if (firstPersonTarget) {
      const nodePos = new THREE.Vector3(firstPersonTarget.x || 0, firstPersonTarget.y || 0, firstPersonTarget.z || 0)

      cameraTransition.current.isTransitioning = true
      cameraTransition.current.progress = 0
      cameraTransition.current.startPosition.copy(camera.position)
      cameraTransition.current.targetPosition.copy(nodePos)
      cameraTransition.current.startLookAt.copy(new THREE.Vector3(0, 0, 0))
      cameraTransition.current.targetLookAt.copy(nodePos.clone().add(new THREE.Vector3(0, 0, -10)))

      currentMode.current = 'firstperson'
      setCurrentMode('firstperson') // Sync with React state
      setFirstPersonTarget(null) // Clear the trigger
    }
  }, [firstPersonTarget, setFirstPersonTarget])

  // Touch tracking refs
  const touchState = useRef({
    isTouch: false,
    lastTouch: { x: 0, y: 0 },
    touchCount: 0,
    lastTouchDistance: 0,
    hasMoved: false,
    startTime: 0
  })

  // Mouse and touch event handlers
  useEffect(() => {
    const handleMouseDown = (event) => {
      event.preventDefault()
      if (event.button === 0) { // Left click
        isMouseDown.current.left = true
        lastMousePos.current = { x: event.clientX, y: event.clientY }
      } else if (event.button === 2) { // Right click
        isMouseDown.current.right = true
        lastMousePos.current = { x: event.clientX, y: event.clientY }
      }
    }

    const handleTouchStart = (event) => {
      touchState.current.isTouch = true
      touchState.current.touchCount = event.touches.length
      touchState.current.hasMoved = false
      touchState.current.startTime = Date.now()

      if (event.touches.length === 1) {
        // Single touch - don't prevent default immediately to allow node taps
        touchState.current.lastTouch = {
          x: event.touches[0].clientX,
          y: event.touches[0].clientY
        }
        lastMousePos.current = {
          x: event.touches[0].clientX,
          y: event.touches[0].clientY
        }

        // Delay setting mouse state to allow click events to fire first
        setTimeout(() => {
          if (touchState.current.isTouch && !touchState.current.hasMoved) {
            isMouseDown.current.left = true
          }
        }, 50)
      } else if (event.touches.length === 2) {
        // Two finger touch - prevent default and set up panning
        event.preventDefault()
        isMouseDown.current.left = false
        isMouseDown.current.right = true
        const touch1 = event.touches[0]
        const touch2 = event.touches[1]
        const centerX = (touch1.clientX + touch2.clientX) / 2
        const centerY = (touch1.clientY + touch2.clientY) / 2
        touchState.current.lastTouch = { x: centerX, y: centerY }
        lastMousePos.current = { x: centerX, y: centerY }

        // Store initial distance for pinch-to-zoom
        const dx = touch2.clientX - touch1.clientX
        const dy = touch2.clientY - touch1.clientY
        touchState.current.lastTouchDistance = Math.sqrt(dx * dx + dy * dy)
      }
    }

    const handleMouseMove = (event) => {
      if (!isMouseDown.current.left && !isMouseDown.current.right) return

      const deltaX = event.clientX - lastMousePos.current.x
      const deltaY = event.clientY - lastMousePos.current.y

      if (isMouseDown.current.left) {
        // Left drag - rotation
        const rotateSpeed = 0.005

        if (currentMode.current === 'camera') {
          // Camera orbit mode - orbit around selected node
          targetCameraSpherical.current.theta -= deltaX * rotateSpeed
          targetCameraSpherical.current.phi += deltaY * rotateSpeed
          // No clamping - infinite rotation
        } else if (currentMode.current === 'firstperson') {
          // First person mode - rotate look direction (inverted X for natural feel)
          const rotationY = new THREE.Matrix4().makeRotationY(deltaX * rotateSpeed)
          const rotationX = new THREE.Matrix4().makeRotationX(-deltaY * rotateSpeed)

          firstPersonLookDirection.current.applyMatrix4(rotationY)
          firstPersonLookDirection.current.applyMatrix4(rotationX)
          firstPersonLookDirection.current.normalize()
        } else {
          // Mesh rotation mode - rotate entire mesh
          meshRotation.current.y += deltaX * rotateSpeed
          meshRotation.current.x += deltaY * rotateSpeed
        }
      } else if (isMouseDown.current.right) {
        // Right drag - panning with zoom-relative speed
        if (currentMode.current === 'camera') {
          // Camera orbit mode - pan by moving the orbit center
          const panSpeed = cameraSpherical.current.radius * 0.001 // Scale with orbit radius
          const right = new THREE.Vector3(1, 0, 0)
          const up = new THREE.Vector3(0, 1, 0)
          panOffset.current.add(right.multiplyScalar(-deltaX * panSpeed))
          panOffset.current.add(up.multiplyScalar(deltaY * panSpeed))
        } else {
          // Mesh rotation mode - pan by moving the mesh
          const panSpeed = camera.position.z * 0.001 // Scale with camera distance
          meshPosition.current.x += deltaX * panSpeed
          meshPosition.current.y -= deltaY * panSpeed
          userHasPanned.current = true
        }
      }

      lastMousePos.current = { x: event.clientX, y: event.clientY }
    }

    const handleTouchMove = (event) => {
      if (event.touches.length === 1) {
        const touch = event.touches[0]
        const deltaX = touch.clientX - touchState.current.lastTouch.x
        const deltaY = touch.clientY - touchState.current.lastTouch.y
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)

        // Check if this is significant movement (not just finger settling)
        if (distance > 5) {
          touchState.current.hasMoved = true
          // Now prevent default to stop scrolling
          event.preventDefault()

          // Set mouse state if not already set
          if (!isMouseDown.current.left) {
            isMouseDown.current.left = true
          }

          if (isMouseDown.current.left) {
            const rotateSpeed = 0.005

            if (currentMode.current === 'camera') {
              // Camera orbit mode - orbit around selected node
              targetCameraSpherical.current.theta -= deltaX * rotateSpeed
              targetCameraSpherical.current.phi += deltaY * rotateSpeed
            } else if (currentMode.current === 'firstperson') {
              // First person mode - rotate look direction
              const rotationY = new THREE.Matrix4().makeRotationY(deltaX * rotateSpeed)
              const rotationX = new THREE.Matrix4().makeRotationX(-deltaY * rotateSpeed)

              firstPersonLookDirection.current.applyMatrix4(rotationY)
              firstPersonLookDirection.current.applyMatrix4(rotationX)
              firstPersonLookDirection.current.normalize()
            } else {
              // Mesh rotation mode - rotate entire mesh
              meshRotation.current.y += deltaX * rotateSpeed
              meshRotation.current.x += deltaY * rotateSpeed
            }

            touchState.current.lastTouch = { x: touch.clientX, y: touch.clientY }
            lastMousePos.current = { x: touch.clientX, y: touch.clientY }
          }
        }
      } else if (event.touches.length === 2) {
        // Always prevent default for multi-touch
        event.preventDefault()
        // Two finger touch - panning and pinch-to-zoom
        const touch1 = event.touches[0]
        const touch2 = event.touches[1]
        const centerX = (touch1.clientX + touch2.clientX) / 2
        const centerY = (touch1.clientY + touch2.clientY) / 2

        // Handle pinch-to-zoom
        const dx = touch2.clientX - touch1.clientX
        const dy = touch2.clientY - touch1.clientY
        const currentDistance = Math.sqrt(dx * dx + dy * dy)
        const distanceDelta = currentDistance - touchState.current.lastTouchDistance

        if (Math.abs(distanceDelta) > 2) { // Threshold to prevent jitter
          const zoomSpeed = 0.5
          const zoomDelta = -distanceDelta * zoomSpeed // Negative for natural pinch behavior

          if (currentMode.current === 'camera') {
            targetCameraSpherical.current.radius = Math.max(1, targetCameraSpherical.current.radius + zoomDelta * 0.5)
          } else {
            const newZ = Math.max(1, camera.position.z + zoomDelta)
            camera.position.setZ(newZ)
          }

          touchState.current.lastTouchDistance = currentDistance
        }

        // Handle two-finger panning
        if (isMouseDown.current.right) {
          const deltaX = centerX - touchState.current.lastTouch.x
          const deltaY = centerY - touchState.current.lastTouch.y

          if (currentMode.current === 'camera') {
            // Camera orbit mode - pan by moving the orbit center
            const panSpeed = cameraSpherical.current.radius * 0.001
            const right = new THREE.Vector3(1, 0, 0)
            const up = new THREE.Vector3(0, 1, 0)
            panOffset.current.add(right.multiplyScalar(-deltaX * panSpeed))
            panOffset.current.add(up.multiplyScalar(deltaY * panSpeed))
          } else {
            // Mesh rotation mode - pan by moving the mesh
            const panSpeed = camera.position.z * 0.001
            meshPosition.current.x += deltaX * panSpeed
            meshPosition.current.y -= deltaY * panSpeed
            userHasPanned.current = true
          }
        }

        touchState.current.lastTouch = { x: centerX, y: centerY }
        lastMousePos.current = { x: centerX, y: centerY }
      }
    }

    const handleMouseUp = () => {
      isMouseDown.current.left = false
      isMouseDown.current.right = false
      touchState.current.isTouch = false
    }

    const handleTouchEnd = (event) => {
      // Only prevent default if we had movement or multiple touches
      if (touchState.current.hasMoved || event.touches.length > 0) {
        event.preventDefault()
      }

      if (event.touches.length === 0) {
        // No more touches - release all
        isMouseDown.current.left = false
        isMouseDown.current.right = false
        touchState.current.isTouch = false
        touchState.current.touchCount = 0
        touchState.current.hasMoved = false
      } else if (event.touches.length === 1) {
        // Down to one touch - switch to rotation mode
        isMouseDown.current.left = touchState.current.hasMoved
        isMouseDown.current.right = false
        const touch = event.touches[0]
        touchState.current.lastTouch = { x: touch.clientX, y: touch.clientY }
        lastMousePos.current = { x: touch.clientX, y: touch.clientY }
        touchState.current.touchCount = 1
      } else {
        // Multiple touches remain - update state
        touchState.current.touchCount = event.touches.length
      }
    }

    const handleContextMenu = (event) => {
      event.preventDefault() // Prevent right-click menu
    }

    const handleWheel = (event) => {
      event.preventDefault()
      const zoomSpeed = 1
      const zoomDelta = event.deltaY * zoomSpeed

      if (currentMode.current === 'camera') {
        // Camera orbit mode - infinite zoom in both directions
        targetCameraSpherical.current.radius = Math.max(1, targetCameraSpherical.current.radius + zoomDelta * 0.5)
      } else {
        // Mesh mode - infinite zoom in both directions
        const newZ = Math.max(1, camera.position.z + zoomDelta)
        camera.position.setZ(newZ)
      }
    }

    gl.domElement.addEventListener('mousedown', handleMouseDown)
    gl.domElement.addEventListener('mousemove', handleMouseMove)
    gl.domElement.addEventListener('mouseup', handleMouseUp)
    gl.domElement.addEventListener('wheel', handleWheel)
    gl.domElement.addEventListener('contextmenu', handleContextMenu)

    // Touch event listeners - use passive mode when possible to allow native behavior
    gl.domElement.addEventListener('touchstart', handleTouchStart, { passive: true })
    gl.domElement.addEventListener('touchmove', handleTouchMove, { passive: false })
    gl.domElement.addEventListener('touchend', handleTouchEnd, { passive: false })

    return () => {
      gl.domElement.removeEventListener('mousedown', handleMouseDown)
      gl.domElement.removeEventListener('mousemove', handleMouseMove)
      gl.domElement.removeEventListener('mouseup', handleMouseUp)
      gl.domElement.removeEventListener('wheel', handleWheel)
      gl.domElement.removeEventListener('contextmenu', handleContextMenu)

      // Remove touch event listeners
      gl.domElement.removeEventListener('touchstart', handleTouchStart)
      gl.domElement.removeEventListener('touchmove', handleTouchMove)
      gl.domElement.removeEventListener('touchend', handleTouchEnd)
    }
  }, [gl, camera])

  useFrame((state, delta) => {
    if (nodes.length === 0 || !meshRef.current) return

    const currentSelectedId = selectedNode?.id || null

    // Handle camera transitions first
    if (cameraTransition.current.isTransitioning) {
      // Animate camera transition (for first-person or node selection)
      cameraTransition.current.progress += delta * 1.0

      if (cameraTransition.current.progress >= 1) {
        cameraTransition.current.isTransitioning = false
        console.log('Camera transition complete, final mode:', currentMode.current)
      }

      // Smooth camera animation
      const t = Math.min(1, cameraTransition.current.progress)
      const smoothProgress = t * t * (3 - 2 * t)

      const currentPos = cameraTransition.current.startPosition.clone().lerp(
        cameraTransition.current.targetPosition, smoothProgress
      )
      const currentLookAt = cameraTransition.current.startLookAt.clone().lerp(
        cameraTransition.current.targetLookAt, smoothProgress
      )

      camera.position.copy(currentPos)
      camera.lookAt(currentLookAt)

      meshRef.current.position.set(0, 0, 0)
    } else if (selectedNode) {
      // CAMERA FLIGHT MODE - Selected node becomes center of universe
      if (currentMode.current !== 'firstperson') {
        currentMode.current = 'camera'
      }
      const nodeWorldPos = new THREE.Vector3(
        selectedNode.x || 0,
        selectedNode.y || 0,
        selectedNode.z || 0
      )

      // Check if we need to start a transition to camera mode
      if (currentSelectedId !== lastSelectedNodeId.current) {
        // Preserve first-person mode if already in it, otherwise use camera mode
        if (currentMode.current === 'firstperson') {
          // In first-person mode - fly to new node in first-person
          cameraTransition.current.isTransitioning = true
          cameraTransition.current.progress = 0
          cameraTransition.current.startPosition.copy(camera.position)
          cameraTransition.current.targetPosition.copy(nodeWorldPos.clone().add(new THREE.Vector3(0, 1, 0)))
          cameraTransition.current.startLookAt.copy(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(10).add(camera.position))
          cameraTransition.current.targetLookAt.copy(nodeWorldPos.clone().add(firstPersonLookDirection.current.clone().multiplyScalar(20)))
        } else {
          // Switching to camera flight mode
          isTransitioning.current = true
          transitionProgress.current = 0

          // Treat selected node as new centroid - move mesh to center it at origin
          const meshOffset = nodeWorldPos.clone().negate()

          // Setup smooth mesh transition to center the selected node
          transitionStart.current.copy(meshPosition.current)
          transitionTarget.current.copy(meshOffset)

          // Keep camera in current position but look at origin where node will be
          camera.lookAt(0, 0, 0)

          // Set spherical coordinates for orbit around origin (where node will be centered)
          const currentDistance = camera.position.length()
          targetCameraSpherical.current.radius = Math.max(10, currentDistance)
          targetCameraSpherical.current.phi = Math.PI / 2
          targetCameraSpherical.current.theta = 0

          cameraSpherical.current.radius = targetCameraSpherical.current.radius
          cameraSpherical.current.phi = targetCameraSpherical.current.phi
          cameraSpherical.current.theta = targetCameraSpherical.current.theta
        }

        lastSelectedNodeId.current = currentSelectedId
      }

      if (isTransitioning.current) {
        // Transition mesh position (for both selection and deselection)
        transitionProgress.current += delta * 2 // Smooth mesh transition

        if (transitionProgress.current >= 1) {
          isTransitioning.current = false
          transitionProgress.current = 1
        }

        const easeOut = 1 - Math.pow(1 - transitionProgress.current, 3)
        meshPosition.current.copy(transitionStart.current.clone().lerp(transitionTarget.current, easeOut))
        meshRef.current.position.copy(meshPosition.current)
      } else {
        // Camera orbit mode - reset mesh transform once
        if (meshRef.current.position.x !== 0 || meshRef.current.position.y !== 0 || meshRef.current.position.z !== 0) {
          meshRef.current.position.set(0, 0, 0)
          meshRef.current.rotation.set(0, 0, 0)
        }

        // Keep mesh rotation but reset position for orbit mode
        meshRef.current.position.set(0, 0, 0)
        // Don't reset rotation - preserve current mesh orientation

        // Don't interpolate at all - use target values directly after transition
        cameraSpherical.current.radius = targetCameraSpherical.current.radius
        cameraSpherical.current.phi = targetCameraSpherical.current.phi
        cameraSpherical.current.theta = targetCameraSpherical.current.theta

        // Skip all spherical positioning during transition to avoid conflicts
        if (!cameraTransition.current.isTransitioning) {
          // Calculate camera position using spherical coordinates
          const sphericalPos = new THREE.Vector3()
          sphericalPos.setFromSphericalCoords(
            cameraSpherical.current.radius,
            cameraSpherical.current.phi,
            cameraSpherical.current.theta
          )

          if (currentMode.current === 'firstperson') {
            // First person mode - camera slightly above the node to avoid being inside it
            const nodeWorldPosition = new THREE.Vector3(selectedNode.x || 0, selectedNode.y || 0, selectedNode.z || 0)
            const cameraOffset = new THREE.Vector3(0, 1, 0) // Slightly above the node
            camera.position.copy(nodeWorldPosition.clone().add(cameraOffset))

            // Look in the direction the user is pointing (controlled by mouse)
            const lookTarget = nodeWorldPosition.clone().add(firstPersonLookDirection.current.clone().multiplyScalar(20))
            camera.lookAt(lookTarget)
          } else {
            // Normal orbit mode - positioning relative to node world position
            const nodeWorldPosition = new THREE.Vector3(selectedNode.x || 0, selectedNode.y || 0, selectedNode.z || 0)
            const finalPosition = nodeWorldPosition.clone().add(sphericalPos).add(panOffset.current)

            camera.position.copy(finalPosition)
            camera.lookAt(nodeWorldPosition.clone().add(panOffset.current))
          }
        }
      }
    } else {
      // MESH ROTATION MODE - No node selected
      currentMode.current = 'mesh'
      if (currentSelectedId !== lastSelectedNodeId.current) {
        // Switching back to mesh mode - preserve camera position
        isTransitioning.current = true
        transitionProgress.current = 0

        // Calculate what mesh position would center the network under current camera
        const currentCameraPos = camera.position.clone()

        // Calculate network centroid
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

        const networkCentroid = validNodes > 0 ?
          new THREE.Vector3(centerX / validNodes, centerY / validNodes, centerZ / validNodes) :
          new THREE.Vector3(0, 0, 0)

        // Return mesh to center of frame when deselecting
        const meshOffset = networkCentroid.clone().negate()

        transitionStart.current.copy(meshPosition.current)
        transitionTarget.current.copy(meshOffset)

        // Reset all state to pre-selection behavior
        userHasPanned.current = false
        panOffset.current.set(0, 0, 0) // Clear any camera orbit panning
        currentMode.current = 'mesh' // Ensure mode is properly set

        // Reset camera to proper mesh-viewing position
        const currentDistance = camera.position.length()
        camera.position.set(0, 0, Math.max(20, currentDistance))
        camera.lookAt(0, 0, 0)

        lastSelectedNodeId.current = currentSelectedId
      }

      if (isTransitioning.current) {
        // Transition to mesh mode
        transitionProgress.current += delta * 3

        if (transitionProgress.current >= 1) {
          isTransitioning.current = false
          transitionProgress.current = 1
        }

        const easeOut = 1 - Math.pow(1 - transitionProgress.current, 3)
        meshPosition.current.copy(transitionStart.current.clone().lerp(transitionTarget.current, easeOut))
      }

      // Apply mesh rotation and position with auto-centering
      meshRef.current.rotation.x = meshRotation.current.x
      meshRef.current.rotation.y = meshRotation.current.y

      // Auto-center mesh if user hasn't manually panned AND not in first-person mode
      if (!userHasPanned.current && currentMode.current !== 'firstperson') {
        // Calculate network centroid
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
          const autoCenterPos = new THREE.Vector3(
            -centerX / validNodes,
            -centerY / validNodes,
            -centerZ / validNodes
          )

          // More responsive centering to keep centroid at origin
          meshPosition.current.lerp(autoCenterPos, 0.1)
        }
      }

      meshRef.current.position.copy(meshPosition.current)

      // Always look at mesh center (origin) when in mesh mode
      camera.lookAt(0, 0, 0)
    }

    if (!isInitialized.current) {
      // Initial load - fit mesh to screen
      if (nodes.length > 0) {
        // Calculate bounding box of all nodes
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

        // Calculate bounding box dimensions
        const width = maxX - minX
        const height = maxY - minY
        const depth = maxZ - minZ
        const maxDimension = Math.max(width, height, depth)

        // Position camera to fit entire network with some padding
        const fov = 50 * (Math.PI / 180) // Convert to radians
        const distance = (maxDimension / 2) / Math.tan(fov / 2) * 1.2 // 20% padding

        camera.position.set(0, 0, Math.max(20, distance))
        camera.lookAt(0, 0, 0)
      }

      isInitialized.current = true
    }
  })

  return null
})

function Node({ node, onClick, selected, isConnected, selectedNode }) {
  const meshRef = useRef()
  const [hovered, setHovered] = useState(false)

  useFrame(() => {
    if (meshRef.current && node) {
      // Direct position update - no interpolation to keep nodes and links connected
      meshRef.current.position.x = node.x || 0
      meshRef.current.position.y = node.y || 0
      meshRef.current.position.z = node.z || 0
    }
  })

  const getNodeColor = () => {
    if (selected) return '#ffffff' // Bright white for center of universe
    if (hovered) return '#4ecdc4'
    if (selectedNode && isConnected) return '#ffff00' // Bright yellow for connected nodes

    // Cyberpunk neon color scheme by depth
    const depth = node.depth || 0
    const depthColors = [
      '#9d4edd', // Depth 0: Neon purple
      '#ff0080', // Depth 2: Neon pink
      '#00ff41', // Depth 3: Neon green
      '#00ffff', // Depth 1: Neon cyan
      '#888888', // Depth 4+: Gray
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
    if (selected) return 1.0 // Maximum glow for center of universe
    if (selectedNode && isConnected) return 0.8 // Very bright glow for connected nodes
    return 0.6 // Strong glow for all nodes in cyberpunk style
  }

  const nodeSize = Math.max(0.5, Math.min(8, (node.size || 5) * 0.4))

  return (
    <mesh
      ref={meshRef}
      onClick={(event) => {
        event.stopPropagation()
        event.nativeEvent.nodeClicked = true
        onClick && onClick(node)
      }}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      renderOrder={100}
    >
      {/* Colored glow halo renders first */}
      <mesh renderOrder={98}>
        <sphereGeometry args={[nodeSize * 2, 16, 16]} />
        <meshBasicMaterial
          color={getNodeColor()}
          transparent
          opacity={0.4}
          side={THREE.FrontSide}
          blending={THREE.AdditiveBlending}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>

      {/* White node core renders on top */}
      <mesh renderOrder={101}>
        <sphereGeometry args={[nodeSize, 16, 16]} />
        <meshPhongMaterial
          color="#ffffff"
          transparent
          opacity={getNodeOpacity()}
          emissive="#ffffff"
          emissiveIntensity={0.2}
          shininess={100}
          depthTest={true}
          depthWrite={true}
        />
      </mesh>
      {/* Show label on hover, when selected, or when connected to selected node */}
      {(hovered || selected || (selectedNode && isConnected)) && (
        <Html
          position={[0, nodeSize + 0.5, 0]}
          center
          transform={false}
          occlude={false}
          style={{
            pointerEvents: 'none',
            zIndex: 2000
          }}
        >
          <div style={{
            color: 'white',
            fontSize: '12px',
            fontWeight: 'bold',
            textAlign: 'center',
            textShadow: '1px 1px 2px rgba(0, 0, 0, 0.8)',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            userSelect: 'none',
            opacity: selected ? 1.0 : (isConnected ? 0.9 : 0.8)
          }}>
            {node.baseLabel || node.id}
            {node.participantsCount > 0 && (
              <div style={{
                fontSize: '10px',
                color: '#ccc',
                marginTop: '2px'
              }}>
                {node.participantsCount.toLocaleString()}
              </div>
            )}
          </div>
        </Html>
      )}
    </mesh>
  )
}

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

function Link({ link, nodes, selectedNode, allLinks, currentMode }) {
  const cylinderRef = useRef()

  const isConnectedToSelected = selectedNode ? (() => {
    const sourceId = link.source.id || link.source
    const targetId = link.target.id || link.target
    return sourceId === selectedNode.id || targetId === selectedNode.id
  })() : false

  // Don't hide edges in first-person, but make them smaller
  const shouldHideInFirstPerson = false

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

      // Calculate direction vector for rotation
      const direction = targetPos.clone().sub(sourcePos)

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

  // Don't render if should be hidden in first-person mode
  if (shouldHideInFirstPerson) {
    return null
  }

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

      {/* Directional cone - always show unless hidden in first-person */}
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

function ForceGraph3D({ data, onReset, fileName }) {
  const [selectedNode, setSelectedNode] = useState(null)
  const [simulationAlpha, setSimulationAlpha] = useState(0)
  const [showControls, setShowControls] = useState(false)
  const [firstPersonTarget, setFirstPersonTarget] = useState(null)
  const [currentMode, setCurrentMode] = useState('mesh')
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
  const meshGroupRef = useRef()
  const meshControllerRef = useRef()

  // Drag tracking refs
  const mouseDownPos = useRef({ x: 0, y: 0 })
  const isDragging = useRef(false)

  // Handle background click and ESC key to deselect
  useEffect(() => {

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (currentMode.current === 'firstperson') {
          // Exit first person mode, return to orbit
          currentMode.current = 'camera'
          setCurrentMode('camera')
        } else if (selectedNode) {
          setSelectedNode(null)
        }
      }
    }

    const handleMouseDown = (event) => {
      mouseDownPos.current = { x: event.clientX, y: event.clientY }
      isDragging.current = false
    }

    const handleMouseMove = (event) => {
      if (mouseDownPos.current.x !== 0 || mouseDownPos.current.y !== 0) {
        const deltaX = Math.abs(event.clientX - mouseDownPos.current.x)
        const deltaY = Math.abs(event.clientY - mouseDownPos.current.y)
        if (deltaX > 5 || deltaY > 5) {
          isDragging.current = true
        }
      }
    }

    const handleCanvasClick = (event) => {
      // Don't deselect if this was a node click or a drag operation
      if (event.nodeClicked || isDragging.current) return

      // Only deselect if clicking on canvas background without dragging
      if (event.target.tagName === 'CANVAS' && selectedNode) {
        setSelectedNode(null)
      }

      // Reset drag tracking
      mouseDownPos.current = { x: 0, y: 0 }
      isDragging.current = false
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('click', handleCanvasClick)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('click', handleCanvasClick)
    }
  }, [selectedNode])

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
      .alphaDecay(0.01) // Normal decay
      .velocityDecay(0.4) // Higher damping for stability
      .alpha(1)
      .alphaMin(0.001)
      .on('tick', () => {
        setSimulationAlpha(sim.alpha())
        // Very gentle reheating only when completely stopped
        if (sim.alpha() < 0.002) {
          sim.alpha(0.005) // Tiny amount of energy for subtle movement
        }
      })

    simulationRef.current = sim

    return () => {
      if (simulationRef.current) {
        simulationRef.current.stop()
      }
    }
  }, [nodes, links, forceParams.linkDistance, forceParams.linkStrength, forceParams.chargeStrength, forceParams.repelStrength, forceParams.centerStrength])

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
      <Canvas camera={{ position: [0, 0, 20], fov: 50, far: 10000 }}>
        <ambientLight intensity={0.1} />
        <pointLight position={[10, 10, 10]} intensity={0.3} />
        <pointLight position={[-10, -10, -10]} intensity={0.2} />

        <MeshController
          nodes={nodes}
          selectedNode={selectedNode}
          firstPersonTarget={firstPersonTarget}
          setFirstPersonTarget={setFirstPersonTarget}
          setCurrentMode={setCurrentMode}
          meshRef={meshGroupRef}
        />

        <group ref={meshGroupRef}>
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
              allLinks={links}
              currentMode={currentMode}
            />
          ))}
        </group>

      </Canvas>

      {/* Back to browser button - top left of screen */}
      <div className="back-nav-overlay">
        <button
          className="back-nav-btn"
          onClick={onReset}
          title="Back to File Browser"
        >
          ← Back
        </button>
      </div>

      {/* Cyberpunk legend overlay - bottom left of screen */}
      <div className="screen-legend-overlay">
        <div className="legend-items">
          <div className="legend-item">
            <div className="legend-dot" style={{ backgroundColor: '#9d4edd', boxShadow: '0 0 8px #9d4edd' }}></div>
            <span>Depth 0</span>
          </div>
          <div className="legend-item">
            <div className="legend-dot" style={{ backgroundColor: '#00ffff', boxShadow: '0 0 8px #00ffff' }}></div>
            <span>Depth 1</span>
          </div>
          <div className="legend-item">
            <div className="legend-dot" style={{ backgroundColor: '#ff0080', boxShadow: '0 0 8px #ff0080' }}></div>
            <span>Depth 2</span>
          </div>
          <div className="legend-item">
            <div className="legend-dot" style={{ backgroundColor: '#00ff41', boxShadow: '0 0 8px #00ff41' }}></div>
            <span>Depth 3</span>
          </div>
          <div className="legend-item">
            <div className="legend-dot" style={{ backgroundColor: '#888888', boxShadow: '0 0 4px #888888' }}></div>
            <span>Depth 4+</span>
          </div>
        </div>
      </div>

      {/* Network stats overlay - bottom right of screen */}
      <div className="screen-stats-overlay">
        <div className="stat-line">Nodes: {data.nodes.length}</div>
        <div className="stat-line">Links: {data.links.length}</div>
        <div className="stat-line">
          Simulation: {simulationAlpha > 0.01 ? 'Running' : 'Stable'} ({simulationAlpha.toFixed(3)})
        </div>
      </div>

      {/* Filename overlay - bottom center of screen */}
      <div className="screen-filename-overlay">
        {fileName}
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

              <button
                onClick={() => {
                  setFirstPersonTarget(selectedNode)
                }}
                style={{
                  marginTop: '1rem',
                  padding: '0.5rem 1rem',
                  background: '#646cff',
                  border: 'none',
                  borderRadius: '6px',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  width: '100%'
                }}
              >
                🎮 First Person View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Simplified gear control panel */}
      <div className={`graph-controls ${showControls ? 'expanded' : 'collapsed'}`}>
        <button
          className="gear-toggle"
          onClick={() => setShowControls(!showControls)}
        >
          ⚙️
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
            <strong>Desktop:</strong><br/>
            Click nodes to select<br/>
            Drag to rotate<br/>
            Scroll to zoom<br/>
            Right-click + drag to pan<br/>
            <br/>
            <strong>Mobile:</strong><br/>
            Touch to rotate<br/>
            Pinch to zoom<br/>
            Two-finger drag to pan
          </small>
        </div>
          </>
        )}
      </div>
    </div>
  )
}

function NetworkGraph3D({ data, onReset, fileName }) {
  if (!data) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>No data available</h2>
        <p>Please select a file to visualize.</p>
      </div>
    )
  }

  return <ForceGraph3D data={data} onReset={onReset} fileName={fileName} />
}

export default NetworkGraph3D
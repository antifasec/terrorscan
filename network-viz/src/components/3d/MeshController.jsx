import { useRef, useEffect, forwardRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

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
      setCurrentMode('firstperson')
      setFirstPersonTarget(null)
    }
  }, [camera.position, firstPersonTarget, setCurrentMode, setFirstPersonTarget])

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
      if (event.button === 0) {
        isMouseDown.current.left = true
        lastMousePos.current = { x: event.clientX, y: event.clientY }
      } else if (event.button === 2) {
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
        touchState.current.lastTouch = {
          x: event.touches[0].clientX,
          y: event.touches[0].clientY
        }
        lastMousePos.current = {
          x: event.touches[0].clientX,
          y: event.touches[0].clientY
        }

        setTimeout(() => {
          if (touchState.current.isTouch && !touchState.current.hasMoved) {
            isMouseDown.current.left = true
          }
        }, 50)
      } else if (event.touches.length === 2) {
        event.preventDefault()
        isMouseDown.current.left = false
        isMouseDown.current.right = true
        const touch1 = event.touches[0]
        const touch2 = event.touches[1]
        const centerX = (touch1.clientX + touch2.clientX) / 2
        const centerY = (touch1.clientY + touch2.clientY) / 2
        touchState.current.lastTouch = { x: centerX, y: centerY }
        lastMousePos.current = { x: centerX, y: centerY }

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
        const rotateSpeed = 0.005

        if (currentMode.current === 'camera') {
          targetCameraSpherical.current.theta -= deltaX * rotateSpeed
          targetCameraSpherical.current.phi += deltaY * rotateSpeed
        } else if (currentMode.current === 'firstperson') {
          const rotationY = new THREE.Matrix4().makeRotationY(deltaX * rotateSpeed)
          const rotationX = new THREE.Matrix4().makeRotationX(-deltaY * rotateSpeed)

          firstPersonLookDirection.current.applyMatrix4(rotationY)
          firstPersonLookDirection.current.applyMatrix4(rotationX)
          firstPersonLookDirection.current.normalize()
        } else {
          meshRotation.current.y += deltaX * rotateSpeed
          meshRotation.current.x += deltaY * rotateSpeed
        }
      } else if (isMouseDown.current.right) {
        if (currentMode.current === 'camera') {
          const panSpeed = cameraSpherical.current.radius * 0.001
          const right = new THREE.Vector3(1, 0, 0)
          const up = new THREE.Vector3(0, 1, 0)
          panOffset.current.add(right.multiplyScalar(-deltaX * panSpeed))
          panOffset.current.add(up.multiplyScalar(deltaY * panSpeed))
        } else {
          const panSpeed = camera.position.z * 0.001
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

        if (distance > 5) {
          touchState.current.hasMoved = true
          event.preventDefault()

          if (!isMouseDown.current.left) {
            isMouseDown.current.left = true
          }

          if (isMouseDown.current.left) {
            const rotateSpeed = 0.005

            if (currentMode.current === 'camera') {
              targetCameraSpherical.current.theta -= deltaX * rotateSpeed
              targetCameraSpherical.current.phi += deltaY * rotateSpeed
            } else if (currentMode.current === 'firstperson') {
              const rotationY = new THREE.Matrix4().makeRotationY(deltaX * rotateSpeed)
              const rotationX = new THREE.Matrix4().makeRotationX(-deltaY * rotateSpeed)

              firstPersonLookDirection.current.applyMatrix4(rotationY)
              firstPersonLookDirection.current.applyMatrix4(rotationX)
              firstPersonLookDirection.current.normalize()
            } else {
              meshRotation.current.y += deltaX * rotateSpeed
              meshRotation.current.x += deltaY * rotateSpeed
            }

            touchState.current.lastTouch = { x: touch.clientX, y: touch.clientY }
            lastMousePos.current = { x: touch.clientX, y: touch.clientY }
          }
        }
      } else if (event.touches.length === 2) {
        event.preventDefault()
        const touch1 = event.touches[0]
        const touch2 = event.touches[1]
        const centerX = (touch1.clientX + touch2.clientX) / 2
        const centerY = (touch1.clientY + touch2.clientY) / 2

        const dx = touch2.clientX - touch1.clientX
        const dy = touch2.clientY - touch1.clientY
        const currentDistance = Math.sqrt(dx * dx + dy * dy)
        const distanceDelta = currentDistance - touchState.current.lastTouchDistance

        if (Math.abs(distanceDelta) > 2) {
          const zoomSpeed = 0.5
          const zoomDelta = -distanceDelta * zoomSpeed

          if (currentMode.current === 'camera') {
            targetCameraSpherical.current.radius = Math.max(1, targetCameraSpherical.current.radius + zoomDelta * 0.5)
          } else {
            const newZ = Math.max(1, camera.position.z + zoomDelta)
            camera.position.setZ(newZ)
          }

          touchState.current.lastTouchDistance = currentDistance
        }

        if (isMouseDown.current.right) {
          const deltaX = centerX - touchState.current.lastTouch.x
          const deltaY = centerY - touchState.current.lastTouch.y

          if (currentMode.current === 'camera') {
            const panSpeed = cameraSpherical.current.radius * 0.001
            const right = new THREE.Vector3(1, 0, 0)
            const up = new THREE.Vector3(0, 1, 0)
            panOffset.current.add(right.multiplyScalar(-deltaX * panSpeed))
            panOffset.current.add(up.multiplyScalar(deltaY * panSpeed))
          } else {
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
      if (touchState.current.hasMoved || event.touches.length > 0) {
        event.preventDefault()
      }

      if (event.touches.length === 0) {
        isMouseDown.current.left = false
        isMouseDown.current.right = false
        touchState.current.isTouch = false
        touchState.current.touchCount = 0
        touchState.current.hasMoved = false
      } else if (event.touches.length === 1) {
        isMouseDown.current.left = touchState.current.hasMoved
        isMouseDown.current.right = false
        const touch = event.touches[0]
        touchState.current.lastTouch = { x: touch.clientX, y: touch.clientY }
        lastMousePos.current = { x: touch.clientX, y: touch.clientY }
        touchState.current.touchCount = 1
      } else {
        touchState.current.touchCount = event.touches.length
      }
    }

    const handleContextMenu = (event) => {
      event.preventDefault()
    }

    const handleWheel = (event) => {
      event.preventDefault()
      const zoomSpeed = 1
      const zoomDelta = event.deltaY * zoomSpeed

      if (currentMode.current === 'camera') {
        targetCameraSpherical.current.radius = Math.max(1, targetCameraSpherical.current.radius + zoomDelta * 0.5)
      } else {
        const newZ = Math.max(1, camera.position.z + zoomDelta)
        camera.position.setZ(newZ)
      }
    }

    gl.domElement.addEventListener('mousedown', handleMouseDown)
    gl.domElement.addEventListener('mousemove', handleMouseMove)
    gl.domElement.addEventListener('mouseup', handleMouseUp)
    gl.domElement.addEventListener('wheel', handleWheel)
    gl.domElement.addEventListener('contextmenu', handleContextMenu)
    gl.domElement.addEventListener('touchstart', handleTouchStart, { passive: true })
    gl.domElement.addEventListener('touchmove', handleTouchMove, { passive: false })
    gl.domElement.addEventListener('touchend', handleTouchEnd, { passive: false })

    return () => {
      gl.domElement.removeEventListener('mousedown', handleMouseDown)
      gl.domElement.removeEventListener('mousemove', handleMouseMove)
      gl.domElement.removeEventListener('mouseup', handleMouseUp)
      gl.domElement.removeEventListener('wheel', handleWheel)
      gl.domElement.removeEventListener('contextmenu', handleContextMenu)
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
      cameraTransition.current.progress += delta * 1.0

      if (cameraTransition.current.progress >= 1) {
        cameraTransition.current.isTransitioning = false
      }

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
        if (currentMode.current === 'firstperson') {
          cameraTransition.current.isTransitioning = true
          cameraTransition.current.progress = 0
          cameraTransition.current.startPosition.copy(camera.position)
          cameraTransition.current.targetPosition.copy(nodeWorldPos.clone().add(new THREE.Vector3(0, 1, 0)))
          cameraTransition.current.startLookAt.copy(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(10).add(camera.position))
          cameraTransition.current.targetLookAt.copy(nodeWorldPos.clone().add(firstPersonLookDirection.current.clone().multiplyScalar(20)))
        } else {
          isTransitioning.current = true
          transitionProgress.current = 0

          const meshOffset = nodeWorldPos.clone().negate()
          transitionStart.current.copy(meshPosition.current)
          transitionTarget.current.copy(meshOffset)

          camera.lookAt(0, 0, 0)

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
        transitionProgress.current += delta * 2

        if (transitionProgress.current >= 1) {
          isTransitioning.current = false
          transitionProgress.current = 1
        }

        const easeOut = 1 - Math.pow(1 - transitionProgress.current, 3)
        meshPosition.current.copy(transitionStart.current.clone().lerp(transitionTarget.current, easeOut))
        meshRef.current.position.copy(meshPosition.current)
      } else {
        if (meshRef.current.position.x !== 0 || meshRef.current.position.y !== 0 || meshRef.current.position.z !== 0) {
          meshRef.current.position.set(0, 0, 0)
          meshRef.current.rotation.set(0, 0, 0)
        }

        meshRef.current.position.set(0, 0, 0)

        cameraSpherical.current.radius = targetCameraSpherical.current.radius
        cameraSpherical.current.phi = targetCameraSpherical.current.phi
        cameraSpherical.current.theta = targetCameraSpherical.current.theta

        if (!cameraTransition.current.isTransitioning) {
          const sphericalPos = new THREE.Vector3()
          sphericalPos.setFromSphericalCoords(
            cameraSpherical.current.radius,
            cameraSpherical.current.phi,
            cameraSpherical.current.theta
          )

          if (currentMode.current === 'firstperson') {
            const nodeWorldPosition = new THREE.Vector3(selectedNode.x || 0, selectedNode.y || 0, selectedNode.z || 0)
            const cameraOffset = new THREE.Vector3(0, 1, 0)
            camera.position.copy(nodeWorldPosition.clone().add(cameraOffset))

            const lookTarget = nodeWorldPosition.clone().add(firstPersonLookDirection.current.clone().multiplyScalar(20))
            camera.lookAt(lookTarget)
          } else {
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
        isTransitioning.current = true
        transitionProgress.current = 0

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

        const meshOffset = networkCentroid.clone().negate()

        transitionStart.current.copy(meshPosition.current)
        transitionTarget.current.copy(meshOffset)

        userHasPanned.current = false
        panOffset.current.set(0, 0, 0)
        currentMode.current = 'mesh'

        const currentDistance = camera.position.length()
        camera.position.set(0, 0, Math.max(20, currentDistance))
        camera.lookAt(0, 0, 0)

        lastSelectedNodeId.current = currentSelectedId
      }

      if (isTransitioning.current) {
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

      if (!userHasPanned.current && currentMode.current !== 'firstperson') {
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

          meshPosition.current.lerp(autoCenterPos, 0.1)
        }
      }

      meshRef.current.position.copy(meshPosition.current)
      camera.lookAt(0, 0, 0)
    }

    if (!isInitialized.current) {
      if (nodes.length > 0) {
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

        const fov = 50 * (Math.PI / 180)
        const distance = (maxDimension / 2) / Math.tan(fov / 2) * 1.2

        camera.position.set(0, 0, Math.max(20, distance))
        camera.lookAt(0, 0, 0)
      }

      isInitialized.current = true
    }
  })

  return null
})

export default MeshController
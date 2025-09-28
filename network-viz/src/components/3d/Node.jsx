import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { getNodeColor, getNodeOpacity, getNodeSize } from './utils'

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

  const nodeColor = getNodeColor(node, selected, hovered, selectedNode, isConnected)
  const nodeOpacity = getNodeOpacity(selected, hovered, selectedNode, isConnected)
  const nodeSize = getNodeSize(node)

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
          color={nodeColor}
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
          opacity={nodeOpacity}
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

export default Node
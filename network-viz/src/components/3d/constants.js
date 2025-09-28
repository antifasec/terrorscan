// Color schemes
export const DEPTH_COLORS = [
  '#9d4edd', // Depth 0: Neon purple
  '#ff0080', // Depth 2: Neon pink
  '#00ff41', // Depth 3: Neon green
  '#00ffff', // Depth 1: Neon cyan
  '#888888', // Depth 4+: Gray
]

export const DATASET_COLORS = [
  '#9d4edd',
  '#ff0080',
  '#00ff41',
  '#00ffff',
  '#ffff00'
]

// Force simulation parameters
export const DEFAULT_FORCE_PARAMS = {
  linkDistance: 15,
  chargeStrength: -300,
  linkStrength: 0.8,
  repelStrength: -50,
  centerStrength: 0.02
}

// Node and geometry constants
export const NODE_SIZE_MULTIPLIER = 0.4
export const MIN_NODE_SIZE = 0.5
export const MAX_NODE_SIZE = 8

export const DATASET_MIN_RADIUS = 8
export const DATASET_PADDING = 5

// Camera and interaction constants
export const CAMERA_DEFAULT_DISTANCE = 20
export const CAMERA_MIN_DISTANCE = 1
export const CAMERA_FOV = 50
export const CAMERA_FAR = 10000

export const ROTATION_SPEED = 0.005
export const ZOOM_SPEED = 1
export const TOUCH_ZOOM_SPEED = 0.5

// Transition and animation constants
export const TRANSITION_SPEED = 2
export const MESH_TRANSITION_SPEED = 3
export const CAMERA_TRANSITION_SPEED = 1.0
export const AUTO_CENTER_LERP = 0.1
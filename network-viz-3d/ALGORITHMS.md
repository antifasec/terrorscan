# 3D Layout Algorithms

This application now supports multiple 3D force-directed and layout algorithms for network visualization.

## Available Algorithms

### 1. **D3 Force** (Default)
- **Description**: Standard D3.js force-directed layout extended to 3D
- **Best for**: General-purpose network layouts, real-time interaction
- **Settings**:
  - **Charge Strength**: Repulsion between nodes (-2000 to 0)
  - **Link Distance**: Ideal distance between connected nodes (20-500)
  - **Center Strength**: Attraction to origin (0-1)
  - **Alpha Decay**: Simulation cooling rate (0.001-0.1)
  - **Velocity Decay**: Movement friction (0.1-1)

### 2. **Yifan-Hu** ⭐ NEW!
- **Description**: 3D implementation of the Yifan-Hu multilevel algorithm
- **Best for**: Large networks, hierarchical structures, achieving uniform node distribution
- **Features**:
  - Barnes-Hut approximation for performance
  - Adaptive cooling system
  - Optimal distance calculations
- **Settings**:
  - **Repulsive Strength**: Node repulsion force (100-5000)
  - **Attractive Strength**: Edge attraction force (0.001-0.1)
  - **Optimal Distance**: Target node separation (50-300)
  - **Step Ratio**: Cooling step multiplier (0.8-0.99)
  - **Adaptive Cooling**: Energy reduction factor (0.5-0.99)
  - **Quad Tree Theta**: Barnes-Hut approximation threshold (0.5-2.0)

### 3. **Fruchterman-Reingold**
- **Description**: 3D implementation of the classic FR algorithm
- **Best for**: Aesthetic layouts, bounded spaces, traditional graph drawing
- **Features**:
  - Temperature-based cooling
  - Boundary constraints
  - Balanced attraction/repulsion
- **Settings**:
  - **Width/Height/Depth**: 3D bounding box dimensions (500-2000)
  - **Iterations**: Number of layout steps (10-200)

### 4. **Spring Embedder**
- **Description**: Classic spring-embedder algorithm in 3D
- **Best for**: Physics-based layouts, stable configurations
- **Features**:
  - Verlet integration
  - Velocity-based movement
  - Configurable damping
- **Settings**:
  - **Spring Length**: Rest length of edges (50-300)
  - **Spring Strength**: Edge stiffness (0.01-0.5)
  - **Repulsion**: Node repulsion force (100-5000)
  - **Damping**: Velocity decay factor (0.5-0.99)

## Algorithm Comparison

| Algorithm | Speed | Quality | Large Networks | Real-time |
|-----------|-------|---------|----------------|-----------|
| D3 Force | ⚡⚡⚡ | ⭐⭐⭐ | ⭐⭐ | ⚡⚡⚡ |
| Yifan-Hu | ⚡⚡ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⚡⚡ |
| Fruchterman-Reingold | ⚡⚡ | ⭐⭐⭐⭐ | ⭐⭐ | ⚡ |
| Spring Embedder | ⚡⚡⚡ | ⭐⭐⭐ | ⭐⭐ | ⚡⚡ |

## Usage Tips

### For Large Networks (>100 nodes):
- Use **Yifan-Hu** with higher repulsive strength
- Increase quad tree theta for faster computation
- Use adaptive cooling for better convergence

### For Dense Networks:
- Use **Fruchterman-Reingold** with larger bounding box
- Adjust **D3 Force** with higher charge strength (more negative)

### For Hierarchical Data:
- **Yifan-Hu** works best for revealing hierarchy
- **Spring Embedder** with low damping creates stable clusters

### For Interactive Exploration:
- **D3 Force** provides the smoothest real-time interaction
- Other algorithms are better for static or batch layouts

## Real-time Controls

All algorithms support real-time parameter adjustment:
- Drag sliders to see immediate effects
- Use Play/Pause to control animation
- Restart to apply new settings from random positions
- Reset button restores algorithm defaults

## Performance Notes

- **Yifan-Hu**: O(n log n) per iteration with Barnes-Hut
- **Fruchterman-Reingold**: O(n²) per iteration
- **Spring Embedder**: O(n²) per iteration
- **D3 Force**: O(n log n) per iteration with quad tree

For networks with >500 nodes, Yifan-Hu typically provides the best performance/quality trade-off.
# Network Visualization 3D

A React application for visualizing network data as interactive 3D force-directed graphs using Three.js and React Three Fiber.

## Features

- **3D Force-Directed Graph Visualization**: Interactive 3D graphs with physics simulation
- **Multiple Data Format Support**:
  - Network JSON files with nodes and links
  - Channel data JSON files (automatically converted to network format)
- **Interactive Navigation**:
  - Rotate: Left-click and drag
  - Zoom: Mouse wheel
  - Pan: Right-click and drag
- **Node Selection**: Click nodes to view detailed information
- **Responsive Design**: Works on desktop and mobile devices

## Data Formats Supported

### Network JSON Format
```json
{
  "nodes": [
    {
      "id": "unique_id",
      "label": "Display Name",
      "group": 0,
      "size": 15,
      "messageCount": 9
    }
  ],
  "links": [
    {
      "source": "source_id",
      "target": "target_id",
      "value": 1
    }
  ]
}
```

### Channel Data JSON Format
The app can automatically convert channel data with the following structure:
```json
{
  "channel_id": {
    "title": "Channel Title",
    "username": "channel_username",
    "messages": [...],
    "linked_channels": ["other_channel_id"],
    "depth": 0
  }
}
```

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) to view the application.

## Usage

1. **Upload File**: Drag and drop any supported file or click to browse
2. **View Graph**: The file will be automatically processed and rendered as a 3D force-directed graph
3. **Interact**:
   - Navigate around the 3D space using mouse controls
   - Click nodes to view detailed information
   - Use the control panel to see network statistics
4. **Load New File**: Click "Load New File" to upload a different dataset

## Graph Controls

- **Orbit Controls**: Built-in Three.js orbit controls for smooth 3D navigation
- **Node Colors**: Different groups are represented by different colors
- **Node Sizes**: Size represents the relative importance (message count, etc.)
- **Link Visualization**: Connections between nodes are shown as lines

## File Structure

```
src/
├── components/
│   ├── FileSelector.jsx    # File selection interface
│   └── NetworkGraph3D.jsx  # 3D graph visualization component
├── App.jsx                 # Main application with routing
└── App.css                # Styling

public/
└── results/               # Data files directory
```

## Dependencies

- **React 18**: UI framework
- **React Router**: Client-side routing
- **Three.js**: 3D graphics library
- **@react-three/fiber**: React renderer for Three.js
- **@react-three/drei**: Useful helpers for React Three Fiber
- **d3-force**: Force simulation for node positioning
- **Vite**: Build tool and development server

## Performance Notes

- Large datasets (>1000 nodes) may impact performance
- Force simulation is throttled to improve rendering performance
- 3D positioning includes small random Z-axis movement for depth perception

## Browser Support

Modern browsers with WebGL support are required for 3D rendering.

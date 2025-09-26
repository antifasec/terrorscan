import React, { useState } from 'react';
import { LAYOUT_ALGORITHMS } from '../utils/layoutAlgorithms';
import './ControlPanel.css';

const ControlPanel = ({
  selectedAlgorithm,
  algorithmSettings,
  onAlgorithmChange,
  onAlgorithmSettingsChange,
  onSimulationToggle,
  onRestart,
  onFitToView,
  isSimulationRunning,
  networkData,
  equilibriumStatus,
  perturbationCycle,
  renderingSettings,
  onRenderingSettingsChange
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleSliderChange = (setting, value) => {
    onAlgorithmSettingsChange({ [setting]: parseFloat(value) });
  };

  const handleRenderingSliderChange = (setting, value) => {
    onRenderingSettingsChange({ [setting]: parseFloat(value) });
  };

  const handleRenderingSelectChange = (setting, value) => {
    onRenderingSettingsChange({ [setting]: value });
  };

  const handleRenderingCheckboxChange = (setting, checked) => {
    onRenderingSettingsChange({ [setting]: checked });
  };

  const handleRandomizeLayout = () => {
    // This will be handled by the parent component
    onRestart();
  };

  const resetToDefaults = () => {
    const algorithm = LAYOUT_ALGORITHMS[selectedAlgorithm];
    const defaultSettings = {};
    Object.entries(algorithm.settings).forEach(([key, config]) => {
      defaultSettings[key] = config.default;
    });
    onAlgorithmSettingsChange(defaultSettings);
  };

  const currentAlgorithm = LAYOUT_ALGORITHMS[selectedAlgorithm];

  return (
    <div className={`control-panel ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="control-header">
        <h3>Force Controls</h3>
        <button
          className="collapse-button"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          {isCollapsed ? '▶' : '◀'}
        </button>
      </div>

      {!isCollapsed && (
        <div className="control-content">
          {/* Network Stats */}
          {networkData && (
            <div className="stats-section">
              <h4>Network Stats</h4>
              <div className="stats-grid">
                <div className="stat-item">
                  <span className="stat-label">Nodes:</span>
                  <span className="stat-value">{networkData.nodes?.length || 0}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Links:</span>
                  <span className="stat-value">{networkData.links?.length || 0}</span>
                </div>
              </div>
            </div>
          )}

          {/* Algorithm Selection */}
          <div className="algorithm-section">
            <h4>Layout Algorithm</h4>

            <div className="control-group">
              <label>Algorithm:</label>
              <select
                value={selectedAlgorithm}
                onChange={(e) => onAlgorithmChange(e.target.value)}
                className="algorithm-select"
              >
                {Object.entries(LAYOUT_ALGORITHMS).map(([key, algorithm]) => (
                  <option key={key} value={key}>
                    {algorithm.name}
                  </option>
                ))}
              </select>
              <small>{currentAlgorithm.description}</small>
            </div>
          </div>

          {/* Algorithm Status */}
          <div className="status-section">
            <h4>Algorithm Status</h4>
            <div className="stat-item">
              <span className="stat-label">Status:</span>
              <span className={`stat-value ${equilibriumStatus?.isAtEquilibrium ? 'equilibrium' : 'running'}`}>
                {equilibriumStatus?.isAtEquilibrium ? '✅ Stable' : '⚡ Computing...'}
              </span>
            </div>
            {equilibriumStatus?.isAtEquilibrium && (
              <small style={{ color: '#4ecdc4', fontStyle: 'italic' }}>
                Layout has converged to a stable configuration.
              </small>
            )}
          </div>

          {/* Algorithm Settings */}
          <div className="controls-section">
            <h4>{currentAlgorithm.name} Settings</h4>

            {Object.entries(currentAlgorithm.settings).map(([settingKey, config]) => (
              <div key={settingKey} className="control-group">
                <label>
                  {settingKey.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:
                  <span className="value">
                    {typeof algorithmSettings[settingKey] === 'number'
                      ? algorithmSettings[settingKey].toFixed(config.step < 1 ? 3 : 0)
                      : algorithmSettings[settingKey]
                    }
                  </span>
                </label>
                <input
                  type="range"
                  min={config.min}
                  max={config.max}
                  step={config.step}
                  value={algorithmSettings[settingKey] || config.default}
                  onChange={(e) => handleSliderChange(settingKey, e.target.value)}
                  className="slider"
                />
              </div>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="actions-section">
            <h4>Actions</h4>

            <div className="button-group">
              <button
                className={`action-button ${isSimulationRunning ? 'pause' : 'play'}`}
                onClick={onSimulationToggle}
              >
                {isSimulationRunning ? '⏸️ Pause' : '▶️ Play'}
              </button>

              <button
                className="action-button restart"
                onClick={onRestart}
              >
                🔄 Restart
              </button>
            </div>

            <div className="button-group">
              <button
                className="action-button randomize"
                onClick={handleRandomizeLayout}
              >
                🎲 Randomize
              </button>

              <button
                className="action-button reset"
                onClick={resetToDefaults}
              >
                ↩️ Reset
              </button>
            </div>

            <div className="button-group">
              <button
                className="action-button recenter"
                onClick={() => {
                  // This will trigger a graph recenter
                  console.log('Recenter requested');
                  onRestart();
                }}
              >
                🎯 Recenter
              </button>

              <button
                className="action-button fit-view"
                onClick={onFitToView}
              >
                📐 Fit View
              </button>
            </div>
          </div>


          {/* Node Legend */}
          <div className="legend-section">
            <h4>Node Types</h4>
            <div className="legend-items">
              <div className="legend-item">
                <div className="legend-color" style={{ backgroundColor: '#4ecdc4' }}></div>
                <span>Accessible Channels</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ backgroundColor: '#888888' }}></div>
                <span>Referenced (No Access)</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ backgroundColor: '#666666' }}></div>
                <span>Mentioned in Text</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ backgroundColor: '#555555' }}></div>
                <span>Inferred from Links</span>
              </div>
            </div>
          </div>

          {/* Node Rendering */}
          <div className="rendering-section">
            <h4>Node Rendering</h4>

            <div className="control-group">
              <label>
                Node Size:
                <span className="value">{renderingSettings.nodeSize.toFixed(1)}</span>
              </label>
              <input
                type="range"
                min="2"
                max="30"
                step="0.5"
                value={renderingSettings.nodeSize}
                onChange={(e) => handleRenderingSliderChange('nodeSize', e.target.value)}
                className="slider"
              />
            </div>

            <div className="control-group">
              <label>
                Node Opacity:
                <span className="value">{(renderingSettings.nodeOpacity * 100).toFixed(0)}%</span>
              </label>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={renderingSettings.nodeOpacity}
                onChange={(e) => handleRenderingSliderChange('nodeOpacity', e.target.value)}
                className="slider"
              />
            </div>

            <div className="control-group">
              <label>Color Mode:</label>
              <select
                value={renderingSettings.nodeColorMode}
                onChange={(e) => handleRenderingSelectChange('nodeColorMode', e.target.value)}
                className="algorithm-select"
              >
                <option value="type">By Type</option>
                <option value="degree">By Degree</option>
                <option value="cluster">By Cluster</option>
                <option value="uniform">Uniform Color</option>
              </select>
            </div>

            {renderingSettings.nodeColorMode === 'uniform' && (
              <div className="control-group">
                <label>Uniform Color:</label>
                <input
                  type="color"
                  value={renderingSettings.nodeUniformColor}
                  onChange={(e) => handleRenderingSelectChange('nodeUniformColor', e.target.value)}
                />
              </div>
            )}

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={renderingSettings.nodeBorders}
                onChange={(e) => handleRenderingCheckboxChange('nodeBorders', e.target.checked)}
              />
              Show node borders
            </label>
          </div>

          {/* Edge Rendering */}
          <div className="rendering-section">
            <h4>Edge Rendering</h4>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={renderingSettings.edgeVisibility}
                onChange={(e) => handleRenderingCheckboxChange('edgeVisibility', e.target.checked)}
              />
              Show edges
            </label>

            {renderingSettings.edgeVisibility && (
              <>
                <div className="control-group">
                  <label>
                    Edge Thickness:
                    <span className="value">{renderingSettings.edgeThickness.toFixed(1)}</span>
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="5"
                    step="0.1"
                    value={renderingSettings.edgeThickness}
                    onChange={(e) => handleRenderingSliderChange('edgeThickness', e.target.value)}
                    className="slider"
                  />
                </div>

                <div className="control-group">
                  <label>
                    Edge Opacity:
                    <span className="value">{(renderingSettings.edgeOpacity * 100).toFixed(0)}%</span>
                  </label>
                  <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.05"
                    value={renderingSettings.edgeOpacity}
                    onChange={(e) => handleRenderingSliderChange('edgeOpacity', e.target.value)}
                    className="slider"
                  />
                </div>

                <div className="control-group">
                  <label>Edge Color:</label>
                  <input
                    type="color"
                    value={renderingSettings.edgeUniformColor}
                    onChange={(e) => handleRenderingSelectChange('edgeUniformColor', e.target.value)}
                  />
                </div>
              </>
            )}
          </div>

          {/* Labels */}
          <div className="rendering-section">
            <h4>Labels</h4>

            <div className="control-group">
              <label>Show Labels:</label>
              <select
                value={renderingSettings.showLabels}
                onChange={(e) => handleRenderingSelectChange('showLabels', e.target.value)}
                className="algorithm-select"
              >
                <option value="never">Never</option>
                <option value="hover">On Hover</option>
                <option value="always">Always</option>
              </select>
            </div>

            {renderingSettings.showLabels !== 'never' && (
              <>
                <div className="control-group">
                  <label>
                    Label Size:
                    <span className="value">{renderingSettings.labelSize.toFixed(0)}px</span>
                  </label>
                  <input
                    type="range"
                    min="8"
                    max="24"
                    step="1"
                    value={renderingSettings.labelSize}
                    onChange={(e) => handleRenderingSliderChange('labelSize', e.target.value)}
                    className="slider"
                  />
                </div>

                <div className="control-group">
                  <label>Label Color:</label>
                  <input
                    type="color"
                    value={renderingSettings.labelColor}
                    onChange={(e) => handleRenderingSelectChange('labelColor', e.target.value)}
                  />
                </div>

                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={renderingSettings.labelBackground}
                    onChange={(e) => handleRenderingCheckboxChange('labelBackground', e.target.checked)}
                  />
                  Label background
                </label>
              </>
            )}
          </div>

          {/* Visual Quality */}
          <div className="rendering-section">
            <h4>Visual Quality</h4>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={renderingSettings.levelOfDetail}
                onChange={(e) => handleRenderingCheckboxChange('levelOfDetail', e.target.checked)}
              />
              Level of Detail (LOD)
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={renderingSettings.distanceCulling}
                onChange={(e) => handleRenderingCheckboxChange('distanceCulling', e.target.checked)}
              />
              Distance culling
            </label>

            {renderingSettings.distanceCulling && (
              <div className="control-group">
                <label>
                  Culling Distance:
                  <span className="value">{renderingSettings.cullingDistance.toFixed(0)}</span>
                </label>
                <input
                  type="range"
                  min="500"
                  max="5000"
                  step="100"
                  value={renderingSettings.cullingDistance}
                  onChange={(e) => handleRenderingSliderChange('cullingDistance', e.target.value)}
                  className="slider"
                />
              </div>
            )}

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={renderingSettings.showCoordinateAxes}
                onChange={(e) => handleRenderingCheckboxChange('showCoordinateAxes', e.target.checked)}
              />
              Show coordinate axes
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={renderingSettings.fogEnabled}
                onChange={(e) => handleRenderingCheckboxChange('fogEnabled', e.target.checked)}
              />
              Fog effect
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={renderingSettings.glowEffect}
                onChange={(e) => handleRenderingCheckboxChange('glowEffect', e.target.checked)}
              />
              Node glow effect
            </label>
          </div>

          {/* Navigation Help */}
          <div className="help-section">
            <h4>Navigation</h4>
            <div className="help-text">
              <div>🖱️ <strong>Rotate:</strong> Left click + drag</div>
              <div>🔍 <strong>Zoom:</strong> Mouse wheel</div>
              <div>✋ <strong>Pan:</strong> Right click + drag</div>
              <div>👆 <strong>Select:</strong> Click on nodes</div>
              <div>📍 <strong>Axes:</strong> Red=X, Green=Y, Blue=Z</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ControlPanel;
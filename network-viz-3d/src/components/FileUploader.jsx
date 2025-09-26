import React, { useRef } from 'react';
import './FileUploader.css';

const FileUploader = ({ onFileUpload }) => {
  const fileInputRef = useRef();

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      onFileUpload(file);
      // Reset the input so the same file can be selected again
      event.target.value = '';
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) {
      onFileUpload(file);
    }
  };

  const handleDragOver = (event) => {
    event.preventDefault();
  };

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="file-uploader">
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.csv"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      <div
        className="upload-area"
        onClick={openFileDialog}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <div className="upload-icon">📁</div>
        <div className="upload-text">
          <span>Click to upload or drag & drop</span>
          <small>JSON, CSV files supported</small>
        </div>
      </div>

      <button
        className="upload-button"
        onClick={openFileDialog}
      >
        Choose File
      </button>
    </div>
  );
};

export default FileUploader;
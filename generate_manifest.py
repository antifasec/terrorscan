#!/usr/bin/env python3
"""
Generate manifest.json from organized scan data.

This script scans the site_build/public/data directory structure and creates
a manifest.json file with metadata about all available channel scans.

Directory structure expected:
site_build/public/data/{channel}/{year}/{month}/{day}/{time}/
                                                            ├── scan_metadata.json
                                                            ├── network_3d_*.json
                                                            ├── *.graphml
                                                            └── other scan files...
"""

import json
import os
import sys
from datetime import datetime
from pathlib import Path


def scan_data_directory(base_path):
    """
    Scan the data directory and generate manifest data.

    Args:
        base_path (str): Base path containing public/data directory

    Returns:
        dict: Manifest data structure
    """
    manifest = {
        "channels": {},
        "lastUpdated": datetime.now().isoformat() + "Z",
        "totalChannels": 0,
        "totalScans": 0
    }

    data_path = Path(base_path) / "public" / "data"
    print(f"Looking for data directory at: {data_path}")

    if not data_path.exists():
        print(f"No data directory found at {data_path}")
        return manifest

    print(f"Data directory exists. Contents: {list(data_path.iterdir())}")

    for channel_dir in data_path.iterdir():
        if not channel_dir.is_dir():
            continue

        channel_name = channel_dir.name
        print(f"Processing channel: {channel_name}")

        channel_data = {
            "name": channel_name,
            "scans": [],
            "totalScans": 0,
            "latestScan": None
        }

        # Walk through year/month/day/time structure
        for year_dir in channel_dir.iterdir():
            if not year_dir.is_dir():
                continue
            year = year_dir.name

            for month_dir in year_dir.iterdir():
                if not month_dir.is_dir():
                    continue
                month = month_dir.name

                for day_dir in month_dir.iterdir():
                    if not day_dir.is_dir():
                        continue
                    day = day_dir.name

                    for time_dir in day_dir.iterdir():
                        if not time_dir.is_dir():
                            continue
                        time = time_dir.name

                        # Check for scan_metadata.json
                        metadata_file = time_dir / "scan_metadata.json"
                        if metadata_file.exists():
                            try:
                                with metadata_file.open('r') as f:
                                    metadata = json.load(f)

                                # List available files in this scan directory
                                scan_files = []
                                for file_path in time_dir.iterdir():
                                    if file_path.is_file():
                                        # Create the relative path from the base directory
                                        relative_path = f"public/data/{channel_name}/{year}/{month}/{day}/{time}/{file_path.name}"
                                        scan_files.append({
                                            "name": file_path.name,
                                            "size": file_path.stat().st_size,
                                            "type": get_file_type(file_path.name),
                                            "path": relative_path,
                                            "url": f"/{relative_path}"
                                        })

                                scan_entry = {
                                    "date": f"{year}-{month}-{day}",
                                    "time": time,
                                    "timestamp": metadata.get("timestamp"),
                                    "path": f"public/data/{channel_name}/{year}/{month}/{day}/{time}",
                                    "runNumber": metadata.get("run_number"),
                                    "channel": metadata.get("channel", channel_name),
                                    "files": scan_files,
                                    "fileCount": len(scan_files)
                                }

                                channel_data["scans"].append(scan_entry)
                                channel_data["totalScans"] += 1

                                # Update latest scan
                                if (channel_data["latestScan"] is None or
                                    (scan_entry.get("timestamp") and
                                     channel_data["latestScan"].get("timestamp") and
                                     scan_entry["timestamp"] > channel_data["latestScan"]["timestamp"])):
                                    channel_data["latestScan"] = scan_entry

                                print(f"  Found scan: {year}-{month}-{day} {time} ({len(scan_files)} files)")

                            except json.JSONDecodeError as e:
                                print(f"  Error reading metadata in {metadata_file}: {e}")
                            except Exception as e:
                                print(f"  Error processing {time_dir}: {e}")

        if channel_data["totalScans"] > 0:
            # Sort scans by timestamp (newest first) - handle None timestamps
            channel_data["scans"].sort(
                key=lambda x: x.get("timestamp", ""),
                reverse=True
            )
            manifest["channels"][channel_name] = channel_data
            manifest["totalChannels"] += 1
            manifest["totalScans"] += channel_data["totalScans"]

            print(f"  Channel {channel_name}: {channel_data['totalScans']} scans")
        else:
            print(f"  Channel {channel_name}: No valid scans found")

    return manifest


def get_file_type(filename):
    """
    Determine file type based on extension.

    Args:
        filename (str): Name of the file

    Returns:
        str: File type category
    """
    ext = Path(filename).suffix.lower()

    if ext == '.json':
        if '3d' in filename.lower():
            return '3d_network'
        elif 'channels' in filename.lower():
            return 'channels_data'
        elif 'metadata' in filename.lower():
            return 'metadata'
        else:
            return 'json_data'
    elif ext == '.graphml':
        return 'network_graph'
    elif ext == '.gexf':
        return 'network_graph'
    elif ext == '.csv':
        return 'summary_data'
    elif ext == '.html':
        return 'interactive_viz'
    else:
        return 'other'


def main():
    """Main function to generate manifest.json."""
    if len(sys.argv) > 1:
        base_path = sys.argv[1]
    else:
        base_path = "site_build"

    print(f"Starting manifest generation for: {base_path}")
    print("=" * 50)

    # Generate the manifest
    manifest = scan_data_directory(base_path)

    # Save manifest.json
    manifest_path = Path(base_path) / "public" / "data" / "manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)

    with manifest_path.open('w') as f:
        json.dump(manifest, f, indent=2)

    print("=" * 50)
    print(f"Generated manifest.json with:")
    print(f"  - {manifest['totalChannels']} channels")
    print(f"  - {manifest['totalScans']} total scans")
    print(f"  - Saved to: {manifest_path}")

    # List channels for verification
    if manifest['totalChannels'] > 0:
        print("\nChannels found:")
        for channel_name, channel_data in manifest['channels'].items():
            latest = channel_data.get('latestScan', {})
            latest_date = latest.get('date', 'Unknown') if latest else 'No scans'
            print(f"  - {channel_name}: {channel_data['totalScans']} scans (latest: {latest_date})")

    return 0 if manifest['totalChannels'] > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
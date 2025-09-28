#!/usr/bin/env python3
import argparse
import json
import os
import sys
from datetime import datetime

def main():
    parser = argparse.ArgumentParser(description='Update scan manifest with new scan data')
    parser.add_argument('--data-dir', required=True, help='Data directory name (e.g., nickjfuentes)')
    parser.add_argument('--channel', required=True, help='Channel name (e.g., nickjfuentes)')
    parser.add_argument('--year', required=True, help='Year (YYYY)')
    parser.add_argument('--month', required=True, help='Month (MM)')
    parser.add_argument('--day', required=True, help='Day (DD)')
    parser.add_argument('--timestamp', required=True, help='Timestamp (HHMMSS)')
    parser.add_argument('--repo-owner', required=True, help='GitHub repository owner')
    parser.add_argument('--repo-name', required=True, help='GitHub repository name')

    args = parser.parse_args()

    data_dir = args.data_dir
    channel = args.channel
    year = args.year
    month = args.month
    day = args.day
    timestamp = args.timestamp
    repo_owner = args.repo_owner
    repo_name = args.repo_name

    # Load existing manifest
    try:
        with open('existing_manifest.json', 'r') as f:
            manifest = json.load(f)
    except:
        manifest = {'channels': {}, 'lastUpdated': None}

    # Initialize channel if not exists
    if data_dir not in manifest['channels']:
        manifest['channels'][data_dir] = {'scans': []}

    # Get file list and sizes for this scan
    scan_files = []
    timestamped_dir = f'pages_output/public/data/{data_dir}/{year}/{month}/{day}/{timestamp}'

    if os.path.exists(timestamped_dir):
        for root, dirs, files in os.walk(timestamped_dir):
            for file in files:
                filepath = os.path.join(root, file)
                rel_path = os.path.relpath(filepath, 'pages_output')
                size = os.path.getsize(filepath)
                scan_files.append({
                    'name': file,
                    'path': '/' + rel_path,
                    'size': size,
                    'type': file.split('.')[-1] if '.' in file else 'unknown'
                })

        # Add this scan to manifest
        scan_entry = {
            'timestamp': f'{year}-{month}-{day}T{timestamp[:2]}:{timestamp[2:4]}:{timestamp[4:6]}Z',
            'channel': channel,
            'path': f'public/data/{data_dir}/{year}/{month}/{day}/{timestamp}',
            'files': scan_files,
            'fileCount': len(scan_files)
        }

        manifest['channels'][data_dir]['scans'].append(scan_entry)
        manifest['lastUpdated'] = datetime.now().isoformat() + 'Z'

        # Sort scans by timestamp (most recent first)
        manifest['channels'][data_dir]['scans'].sort(key=lambda x: x['timestamp'], reverse=True)

        print(f'Added scan with {len(scan_files)} files to manifest')
    else:
        print('No scan directory found, skipping manifest update')

    # Save updated manifest
    os.makedirs('pages_output/public/data', exist_ok=True)
    with open('pages_output/public/data/manifest.json', 'w') as f:
        json.dump(manifest, f, indent=2)

    print('Manifest updated')

if __name__ == '__main__':
    main()
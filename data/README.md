# Scan Data Directory

This directory contains the results from automated channel scans organized by date.

## Structure

```
data/
├── nickjfuentes/
│   ├── latest.json                    # Most recent scan (for easy access)
│   ├── 2025/
│   │   ├── 09/
│   │   │   ├── 26/
│   │   │   │   ├── network_3d_000015.json  # Scan at 00:00:15
│   │   │   │   └── network_3d_120030.json  # Scan at 12:00:30
│   │   │   └── 27/
│   │   │       └── network_3d_000015.json
│   │   └── 10/
│   │       └── 01/
│   │           └── network_3d_000015.json
│   └── README.md
└── charliekirk/
    ├── latest.json                    # Most recent scan (for easy access)
    ├── 2025/
    │   └── 09/
    │       └── 26/
    │           └── network_3d_010015.json  # Scan at 01:00:15
    └── README.md
```

## Usage

The visualization automatically uses these files:
- **Latest data**: `/data/nickjfuentes.json` and `/data/charliekirk.json` (copied from `latest.json`)
- **Combined dataset**: `/crawl-network.json` (defaults to nickjfuentes)
- **Historical browsing**: Full date structure available at `/data/channelname/YYYY/MM/DD/`

## File Naming

- `latest.json` - Always points to the most recent scan
- `network_3d_HHMMSS.json` - Timestamped scans (24-hour format)
- Files are organized by: `channel/year/month/day/filename.json`
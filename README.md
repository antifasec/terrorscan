# TerrorScan

A Python CLI tool for defensive security analysis of Telegram channel networks. This tool helps security researchers map and analyze the structure of Telegram channel networks by following links between channels and building a comprehensive graph database.

## Features

- 🔍 **Channel Scanning**: Recursively scan Telegram channels and extract messages
- 🔗 **Link Discovery**: Automatically discover linked channels from messages
- 📊 **Network Analysis**: Build graph databases for network analysis and clustering
- 📈 **Export Options**: Export data in JSON, CSV, and GEXF formats
- ⚡ **Rate Limiting**: Built-in rate limiting to avoid API restrictions
- 📋 **Progress Tracking**: Visual progress bars and detailed logging

## Setup

1. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Get Telegram API credentials:**
   - Go to https://my.telegram.org/apps
   - Create a new application
   - Note your `api_id` and `api_hash`

3. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

4. **Make executable:**
   ```bash
   chmod +x terrorscan.py
   ```

## Usage

### Basic Channel Scan

Scan a channel with default settings:
```bash
python terrorscan.py scan -c channelname
```

### Advanced Scanning

Scan with custom depth and message limits:
```bash
python terrorscan.py scan -c channelname -d 3 -m 2000 -o my_analysis
```

### Parameters

- `-c, --channel`: Starting channel username (without @)
- `-d, --depth`: How many levels deep to follow links (default: 2)
- `-m, --max-messages`: Maximum messages to scan per channel (default: 1000)
- `-o, --output`: Output directory name (default: terrorscan_output)

### Analyze Results

View network analysis of collected data:
```bash
python terrorscan.py analyze -d terrorscan_output
```

## Output Files

The tool generates several output files:

- `channels_TIMESTAMP.json`: Raw channel data and messages
- `network_TIMESTAMP.gexf`: Graph file for Gephi/NetworkX analysis
- `summary_TIMESTAMP.csv`: Summary statistics in CSV format
- `terrorscan.log`: Detailed operation logs

## Network Analysis

The generated GEXF files can be imported into:
- **Gephi**: For advanced network visualization
- **NetworkX**: For programmatic analysis
- **Cytoscape**: For biological network analysis approaches

## Security Considerations

⚠️ **Important**: This tool is designed for defensive security research only:

- Use only for legitimate security research
- Respect Telegram's Terms of Service
- Be mindful of rate limits and API usage
- Store collected data securely
- Consider privacy implications of data collection

## Legal Notice

This tool is intended for:
- Security research and threat intelligence
- Academic research on information networks
- Defensive cybersecurity analysis

Users are responsible for ensuring their usage complies with applicable laws and regulations.

## Example Analysis Workflow

1. **Initial Scan**:
   ```bash
   python terrorscan.py scan -c suspiciouschannelname -d 2 -m 1000
   ```

2. **Analysis**:
   ```bash
   python terrorscan.py analyze -d terrorscan_output
   ```

3. **Further Analysis**:
   - Import GEXF file into Gephi for visualization
   - Use NetworkX for clustering analysis
   - Apply community detection algorithms

## Requirements

- Python 3.7+
- Valid Telegram account and API credentials
- Sufficient storage space for large datasets

## Troubleshooting

**Authentication Issues**: Make sure your `.env` file contains valid credentials and your phone number is registered with Telegram.

**Rate Limiting**: If you hit rate limits, increase the delay or reduce the scanning depth.

**Memory Usage**: For large networks, consider reducing `max-messages` parameter or scanning in smaller batches.
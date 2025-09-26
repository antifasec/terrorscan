# GitHub Pages Deployment Setup

This repository is now configured to automatically deploy the 3D network explorer to GitHub Pages whenever you push to the `main` branch.

## Required Setup Steps

### 1. Configure GitHub Secrets
You need to add the following secrets to your GitHub repository:

1. Go to your repository on GitHub
2. Click on **Settings** → **Secrets and variables** → **Actions**
3. Add these repository secrets:

- `TELEGRAM_API_ID` - Your Telegram API ID
- `TELEGRAM_API_HASH` - Your Telegram API hash
- `TELEGRAM_PHONE` - Your Telegram phone number (with country code, e.g., +1234567890)

### 2. Enable GitHub Pages
1. Go to **Settings** → **Pages**
2. Under **Source**, select **GitHub Actions**
3. The deployment workflow will handle the rest automatically

### 3. Workflow Details
The workflow does the following:
1. **Runs the terrorscan**: Executes `python terrorscan.py deep-scan -c nickjfuentes,CharlieKirk -d 9 -m 99 -mc 999 -o results`
2. **Builds the 3D visualization**: Uses the latest scan results or falls back to existing data
3. **Deploys to GitHub Pages**: Makes the 3D network explorer available at `https://[username].github.io/[repository-name]`

### 4. Manual Deployment
You can also trigger deployment manually:
1. Go to **Actions** tab
2. Select "Deploy 3D Network Explorer to GitHub Pages"
3. Click "Run workflow"

## What Gets Deployed
- The interactive 3D network visualization
- Latest scan results automatically incorporated
- Accessible at your GitHub Pages URL

The deployment will continue even if the terrorscan partially fails, ensuring the 3D visualization is always available with the latest successful scan data.
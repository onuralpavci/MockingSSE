# Release Guide

## Creating a Release

### Option 1: Automatic Release via GitHub Actions

1. Create and push a version tag:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

2. GitHub Actions will automatically:
   - Build executables for all platforms (macOS ARM64, macOS x64, Linux, Windows)
   - Create release archives (tar.gz for Unix, zip for Windows)
   - Create a GitHub Release with all artifacts

### Option 2: Manual Release

1. Build executables locally:
   ```bash
   npm run build:all
   ```

2. Create archives:
   ```bash
   # macOS ARM64
   cd bin
   tar -czf mockingsse-macos-arm64.tar.gz mockingsse
   
   # macOS x64
   tar -czf mockingsse-macos-x64.tar.gz mockingsse
   
   # Linux
   tar -czf mockingsse-linux-x64.tar.gz mockingsse
   
   # Windows
   zip mockingsse-windows-x64.zip mockingsse.exe
   ```

3. Create a GitHub Release manually and upload the archives

## Using the Release

After the release is created, users can:

1. Download the archive for their platform from GitHub Releases
2. Extract and use:
   ```bash
   # macOS/Linux
   tar -xzf mockingsse-macos-arm64.tar.gz
   chmod +x mockingsse
   ./mockingsse --mockPath /path/to/mocks
   
   # Or move to PATH
   sudo mv mockingsse /usr/local/bin/
   mockingsse --mockPath /path/to/mocks
   ```


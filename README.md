# MockingSSE

A standalone SSE (Server-Sent Events) mock server with a web-based UI for managing mocks, responses, and timelines.

## Features

- **SSE Server**: Handles SSE connections on port 8009
- **Web UI**: Modern web interface for managing mocks (port 8010)
- **Mock Management**: Create, edit, and delete SSE mocks
- **Timeline Configuration**: Schedule responses at specific times
- **Active Connections**: View and manage active SSE connections
- **Auto-start Mocks**: Automatically start mocks when connections match URLs

## Installation

### Option 1: Install from Source

```bash
cd ~/Documents/Github/MockingSSE
npm install
```

### Option 2: Use Pre-built Executable

Download the pre-built executable for your platform from the releases page.

## Usage

### Start the Server

#### Using Node.js (Development)

```bash
# Set mock folder path (optional, defaults to ./mocks)
export MOCKINGSTAR_FOLDER="/path/to/your/mocks"

# Start the server
npm start
```

Or directly:

```bash
MOCKINGSTAR_FOLDER="/path/to/your/mocks" node server.js
```

#### Using Executable (Production)

```bash
# Option 1: Use --mockPath CLI parameter
./bin/mockingsse --mockPath /path/to/your/mocks

# Option 2: Use environment variable
export MOCKINGSTAR_FOLDER="/path/to/your/mocks"
./bin/mockingsse

# Option 3: If installed globally
mockingsse --mockPath /path/to/your/mocks
```

**CLI Parameters:**
- `--mockPath <path>`: Set the mock folder path (overrides environment variable)

**Default Behavior:**
- If `--mockPath` is provided, uses that path
- If `MOCKINGSTAR_FOLDER` environment variable is set, uses that path
- If running as executable, uses `~/.mockingsse/mocks` or executable directory
- Otherwise, uses `./mocks` in the project directory

The server will start:
- **SSE Server**: `http://localhost:8009`
- **Web UI**: `http://localhost:8010`

### Access the Web UI

Open your browser and navigate to:
```
http://localhost:8010
```

## Mock File Structure

Mocks are stored in `Domains/{domain}/SSE/` directories. Each mock file is a JSON file with the following structure:

```json
{
  "url": "https://example.com/sse/stream",
  "responses": [
    {
      "time": 1000,
      "response": 0
    },
    {
      "time": 2000,
      "response": 1
    }
  ],
  "data": [
    {
      "key": "value1"
    },
    {
      "key": "value2"
    }
  ]
}
```

- `url`: The SSE URL to match
- `responses`: Array of timeline events with `time` (milliseconds) and `response` (index into `data` array)
- `data`: Array of response data objects

## API Endpoints

### SSE Endpoints (Port 8009)

- `GET /sse` - Open SSE connection (requires `X-SSE-URL` header)
- `POST /sse/event` - Send event to connections
- `GET /sse/event` - List active connections
- `POST /sse/mock` - Start mock manually

### Web API Endpoints (Port 8010)

- `GET /api/mocks` - Get all mocks
- `GET /api/mocks/:id` - Get single mock
- `POST /api/mocks` - Create new mock
- `PUT /api/mocks/:id` - Update mock
- `DELETE /api/mocks/:id` - Delete mock
- `GET /api/connections` - Get active connections
- `POST /api/mocks/:id/start` - Start mock for connection(s)

## Example: Creating a Mock via Web UI

1. Open `http://localhost:8010`
2. Click "New Mock"
3. Enter the SSE URL
4. Add responses (JSON objects)
5. Configure timeline (when each response should be sent)
6. Save the mock

## Example: Testing SSE Connection

```bash
curl -N -H "Accept: text/event-stream" \
  -H "X-SSE-URL: https://example.com/sse/stream" \
  "http://localhost:8009/sse"
```

## Building Executable

To build a standalone executable that doesn't require Node.js to be installed:

### Prerequisites

```bash
npm install
```

### Build for macOS

```bash
# Build for Intel Macs (x64)
npm run build:mac

# Build for Apple Silicon Macs (ARM64)
npm run build:mac-arm

# Build for both architectures
npm run build
```

### Build for All Platforms

```bash
npm run build:all
```

The executables will be created in the `bin/` directory:
- `bin/mockingsse-macos-x64` - macOS Intel
- `bin/mockingsse-macos-arm64` - macOS Apple Silicon
- `bin/mockingsse-linux-x64` - Linux
- `bin/mockingsse-win-x64.exe` - Windows

### Using the Executable

1. Download or build the executable for your platform
2. Make it executable (macOS/Linux):
   ```bash
   chmod +x bin/mockingsse-macos-arm64
   ```
3. Move it to a location in your PATH (optional):
   ```bash
   sudo mv bin/mockingsse-macos-arm64 /usr/local/bin/mockingsse
   ```
4. Run it:
   ```bash
   mockingsse
   ```
   
Or run directly from bin directory:
```bash
./bin/mockingsse-macos-arm64
```

The executable is completely standalone and doesn't require Node.js or npm to be installed.

## Distribution

### GitHub Releases

Executables are automatically built and released when you push a version tag:

```bash
# Create and push a version tag
git tag v1.0.0
git push origin v1.0.0
```

This will trigger GitHub Actions to build executables for all platforms and create a release with downloadable archives:
- `mockingsse-macos-arm64.tar.gz` - macOS Apple Silicon
- `mockingsse-macos-x64.tar.gz` - macOS Intel
- `mockingsse-linux-x64.tar.gz` - Linux
- `mockingsse-windows-x64.zip` - Windows

### Installing from GitHub Release

1. Go to the [Releases](https://github.com/onuralp.avci/MockingSSE/releases) page
2. Download the archive for your platform
3. Extract the archive:
   ```bash
   # macOS/Linux
   tar -xzf mockingsse-macos-arm64.tar.gz
   chmod +x mockingsse
   
   # Windows
   unzip mockingsse-windows-x64.zip
   ```
4. **macOS Gatekeeper Warning**: If you see "Apple could not verify" warning on macOS:
   - **Option 1** (Recommended): Remove quarantine flag:
     ```bash
     xattr -d com.apple.quarantine mockingsse
     ```
   - **Option 2**: Go to System Preferences → Security & Privacy → Click "Open Anyway"
   - **Option 3**: Right-click the executable → Open → Click "Open" in the dialog
5. Move to a location in your PATH (optional):
   ```bash
   sudo mv mockingsse /usr/local/bin/
   ```
6. Run it:
   ```bash
   mockingsse --mockPath /path/to/your/mocks
   ```

## Future Enhancements

- URL matching configuration (path-only, query parameters, headers)
- Mock templates
- Export/import mocks
- Connection statistics
- Real-time event monitoring

## License

MIT


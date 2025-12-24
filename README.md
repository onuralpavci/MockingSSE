# MockingSSE

A standalone SSE (Server-Sent Events) mock server with a web-based UI. Perfect for testing SSE integrations without a real backend.

## Quick Start

### 1. Download

Download the latest release for your platform from [Releases](https://github.com/onuralpavci/MockingSSE/releases):

| Platform | File |
|----------|------|
| macOS (Apple Silicon) | `mockingsse-macos-arm64.tar.gz` |
| macOS (Intel) | `mockingsse-macos-x64.tar.gz` |
| Linux | `mockingsse-linux-x64.tar.gz` |
| Windows | `mockingsse-windows-x64.zip` |

### 2. Extract & Run

```bash
# macOS/Linux
tar -xzf mockingsse-macos-arm64.tar.gz
chmod +x mockingsse

# Run with your mock folder
./mockingsse -mp /path/to/your/mocks
```

```powershell
# Windows
unzip mockingsse-windows-x64.zip
mockingsse.exe -mp C:\path\to\your\mocks
```

### 3. Open Web UI

Navigate to **http://localhost:8010** in your browser.

---

## Features

- **🎯 Mock SSE Responses** - Create mock responses with custom timelines
- **🖥️ Web UI** - Modern interface to manage mocks and view connections
- **📡 Real SSE Logging** - Capture and view real server responses (SSE Logs page)
- **⚡ Auto-start Mocks** - Automatically start mocks when URLs match
- **🎭 Scenario Support** - Create different mocks for the same URL with scenarios
- **📊 Status Codes** - Configure custom HTTP status codes for each response

## CLI Usage

```bash
# Start with mock folder path
mockingsse -mp /path/to/mocks
mockingsse --mockPath /path/to/mocks

# Show help
mockingsse -h
mockingsse --help
```

**Ports:**
- `8009` - SSE Server (for client connections)
- `8010` - Web UI & API

## Web UI

### Mocks Tab
Create and manage your SSE mocks:
- Define SSE URLs to intercept
- Add multiple response payloads
- Configure timeline (when each response is sent)
- Set HTTP status codes per response
- Use scenarios for different test cases

### Active Connections Tab
View all active SSE connections and:
- See connected URLs
- Manually trigger mocks
- Create new mocks from active connections

### SSE Logs Page
View real responses from actual SSE servers:
- Automatically captures responses when proxying
- Copy responses with one click
- Use for debugging and creating accurate mocks

## How It Works

1. Your app connects to MockingSSE instead of the real SSE server
2. MockingSSE reads the `X-SSE-URL` header to know the original target
3. If a mock exists for that URL, it sends mock responses on schedule
4. Optionally, MockingSSE also connects to the real server and logs responses

### Example Client Request

```bash
curl -N -H "Accept: text/event-stream" \
  -H "X-SSE-URL: https://api.example.com/events/stream" \
  "http://localhost:8009/sse"
```

## Mock File Structure

Mocks are stored as JSON files in `{mockPath}/Domains/{domain}/SSE/`:

```json
{
  "url": "https://api.example.com/events/stream",
  "scenario": "success-case",
  "responses": [
    { "time": 0, "response": 0, "statusCode": 200 },
    { "time": 1000, "response": 1, "statusCode": 200 }
  ],
  "data": [
    { "event": "connected", "status": "ok" },
    { "event": "update", "value": 42 }
  ]
}
```

## macOS Gatekeeper Warning

If you see "Apple could not verify" warning:

```bash
# Remove quarantine flag
xattr -d com.apple.quarantine mockingsse
```

Or: System Preferences → Security & Privacy → Click "Open Anyway"

## Development

```bash
# Clone and install
git clone https://github.com/onuralpavci/MockingSSE.git
cd MockingSSE
npm install

# Run with Node.js
node server.js

# Or with environment variable for mock path
MOCKINGSSE_FOLDER=/path/to/mocks node server.js
```

### Building Executables

```bash
npm run build        # Build for current platform
npm run build:all    # Build for all platforms
```

## API Reference

### SSE Server (Port 8009)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/sse` | GET | Open SSE connection (requires `X-SSE-URL` header) |
| `/sse/event` | POST | Send event to connections |
| `/sse/event` | GET | List active connections |

### Web API (Port 8010)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/mocks` | GET | List all mocks |
| `/api/mocks/:id` | GET | Get single mock |
| `/api/mocks` | POST | Create mock |
| `/api/mocks/:id` | PUT | Update mock |
| `/api/mocks/:id` | DELETE | Delete mock |
| `/api/connections` | GET | Get active connections |
| `/api/logs` | GET | Get SSE response logs |
| `/api/logs` | DELETE | Clear logs |

## License

MIT

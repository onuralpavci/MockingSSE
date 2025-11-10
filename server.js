/**
 * MockingSSE Server
 * Combined SSE server and API server for web UI
 */

const http = require('http');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const SSE_PORT = 8009;
const API_PORT = 8010;

// Import SSE server functionality
const { 
    createSSEServer, 
    getConnections, 
    sendEventToConnection, 
    sendEventToURL, 
    sendEventToAll,
    findMockFile,
    startMock,
    matchUrlWithConfig
} = require('./sse-server-core');

// Express app for API
const app = express();
app.use(cors());
app.use(express.json());
// Handle static files for executable (pkg)
// In pkg, assets are extracted to a temporary directory at runtime
let publicPath;
if (process.pkg) {
    // pkg extracts assets to a temp directory, accessible via __dirname
    // The public folder should be in the same directory as the executable
    const execDir = path.dirname(process.execPath);
    const publicInExecDir = path.join(execDir, 'public');
    
    // Check if public exists in exec dir, otherwise try __dirname (pkg temp dir)
    if (fs.existsSync(publicInExecDir)) {
        publicPath = publicInExecDir;
    } else {
        // pkg extracts assets to a temp directory
        publicPath = path.join(__dirname, 'public');
    }
} else {
    publicPath = path.join(__dirname, 'public');
}

console.log(`[Server] Serving static files from: ${publicPath}`);
app.use(express.static(publicPath));

// Serve index.html for root route
app.get('/', (req, res) => {
    const indexPath = path.join(publicPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('index.html not found');
    }
});

// Get mock folder path
function getMockFolderPath() {
    // Priority 1: MOCKINGSTAR_FOLDER environment variable (set by CLI or user)
    if (process.env.MOCKINGSTAR_FOLDER) {
        return process.env.MOCKINGSTAR_FOLDER;
    }
    
    // Priority 2: If running as executable (pkg), use executable directory or home directory
    if (process.pkg) {
        // Try to use executable directory first
        const execDir = path.dirname(process.execPath);
        const mocksInExecDir = path.join(execDir, 'mocks');
        // If we can't write to exec dir, use home directory
        try {
            // Test if we can write to exec dir
            if (!fs.existsSync(mocksInExecDir)) {
                fs.mkdirSync(mocksInExecDir, { recursive: true });
            }
            return mocksInExecDir;
        } catch (error) {
            // Fallback to home directory
            const homeDir = require('os').homedir();
            return path.join(homeDir, '.mockingsse', 'mocks');
        }
    }
    
    // Priority 3: Normal Node.js execution - use project directory
    return path.join(__dirname, 'mocks');
}

// Ensure mocks directory exists (only if not in snapshot)
function ensureMocksDirectory() {
    const mocksDir = getMockFolderPath();
    if (!fs.existsSync(mocksDir)) {
        try {
            fs.mkdirSync(mocksDir, { recursive: true });
            fs.mkdirSync(path.join(mocksDir, 'Domains'), { recursive: true });
            fs.mkdirSync(path.join(mocksDir, 'Domains', 'Dev'), { recursive: true });
            fs.mkdirSync(path.join(mocksDir, 'Domains', 'Dev', 'SSE'), { recursive: true });
        } catch (error) {
            console.error(`[Error] Cannot create mocks directory at ${mocksDir}:`, error.message);
            console.error(`[Info] Please create the directory manually or set MOCKINGSTAR_FOLDER environment variable`);
        }
    }
}

// Initialize mocks directory (defer until after server starts)
ensureMocksDirectory();

// API Routes

// Get all mock files
app.get('/api/mocks', (req, res) => {
    const mocksDir = getMockFolderPath();
    const domainsPath = path.join(mocksDir, 'Domains');
    
    if (!fs.existsSync(domainsPath)) {
        return res.json([]);
    }

    const domains = fs.readdirSync(domainsPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

    const mocks = [];
    
    for (const domain of domains) {
        const sseFolder = path.join(domainsPath, domain, 'SSE');
        if (!fs.existsSync(sseFolder)) continue;

        const files = fs.readdirSync(sseFolder).filter(file => file.endsWith('.json'));
        
        for (const file of files) {
            const filePath = path.join(sseFolder, file);
            try {
                const mockData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                mocks.push({
                    id: path.basename(file, '.json'),
                    domain,
                    filePath: filePath,
                    fileName: file,
                    url: mockData.url,
                    scenario: mockData.scenario || null,
                    matching: mockData.matching || null,
                    responses: mockData.responses || [],
                    data: mockData.data || []
                });
            } catch (error) {
                console.error(`Error reading mock file ${file}:`, error);
            }
        }
    }
    
    res.json(mocks);
});

// Get single mock file
app.get('/api/mocks/:id', (req, res) => {
    const mocksDir = getMockFolderPath();
    const domainsPath = path.join(mocksDir, 'Domains');
    
    const domains = fs.readdirSync(domainsPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

    for (const domain of domains) {
        const sseFolder = path.join(domainsPath, domain, 'SSE');
        if (!fs.existsSync(sseFolder)) continue;

        const files = fs.readdirSync(sseFolder).filter(file => file.endsWith('.json'));
        
        for (const file of files) {
            if (path.basename(file, '.json') === req.params.id) {
                const filePath = path.join(sseFolder, file);
                try {
                    const mockData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    return res.json({
                        id: path.basename(file, '.json'),
                        domain,
                        filePath: filePath,
                        fileName: file,
                        ...mockData
                    });
                } catch (error) {
                    return res.status(500).json({ error: error.message });
                }
            }
        }
    }
    
    res.status(404).json({ error: 'Mock not found' });
});

// Create or update mock file
app.post('/api/mocks', (req, res) => {
    const { url, responses, data, domain = 'Dev', matching, scenario } = req.body;
    
    if (!url || !responses || !data) {
        return res.status(400).json({ error: 'Missing required fields: url, responses, data' });
    }

    const mocksDir = getMockFolderPath();
    const domainPath = path.join(mocksDir, 'Domains', domain);
    const sseFolder = path.join(domainPath, 'SSE');
    
    // Ensure directories exist
    if (!fs.existsSync(domainPath)) {
        fs.mkdirSync(domainPath, { recursive: true });
    }
    if (!fs.existsSync(sseFolder)) {
        fs.mkdirSync(sseFolder, { recursive: true });
    }

    // Generate filename from URL and scenario (if provided)
    // This ensures different scenarios for the same URL create different files
    const urlHash = Buffer.from(url).toString('base64').replace(/[/+=]/g, '').substring(0, 20);
    const scenarioHash = scenario ? Buffer.from(scenario).toString('base64').replace(/[/+=]/g, '').substring(0, 10) : '';
    const fileName = scenarioHash ? `${urlHash}_${scenarioHash}.json` : `${urlHash}.json`;
    const filePath = path.join(sseFolder, fileName);

    const mockData = {
        url,
        matching: matching || null,
        scenario: scenario || null,
        responses,
        data
    };

    try {
        // Check if file already exists (for scenario-based mocks, we want to allow overwriting only if same scenario)
        // But for different scenarios, we want to create new files
        const fileId = scenarioHash ? `${urlHash}_${scenarioHash}` : urlHash;
        
        fs.writeFileSync(filePath, JSON.stringify(mockData, null, 2));
        res.json({
            id: fileId,
            domain,
            filePath: filePath,
            fileName: fileName,
            ...mockData
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update mock file
app.put('/api/mocks/:id', (req, res) => {
    const { url, responses, data, domain = 'Dev', matching, scenario } = req.body;
    
    const mocksDir = getMockFolderPath();
    const sseFolder = path.join(mocksDir, 'Domains', domain, 'SSE');
    
    if (!fs.existsSync(sseFolder)) {
        return res.status(404).json({ error: 'Domain not found' });
    }

    const fileName = `${req.params.id}.json`;
    const filePath = path.join(sseFolder, fileName);
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Mock not found' });
    }

    const existingMock = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const mockData = {
        url: url || existingMock.url,
        matching: matching !== undefined ? matching : (existingMock.matching || null),
        scenario: scenario !== undefined ? scenario : (existingMock.scenario || null),
        responses: responses || [],
        data: data || []
    };

    try {
        fs.writeFileSync(filePath, JSON.stringify(mockData, null, 2));
        res.json({
            id: req.params.id,
            domain,
            filePath: filePath,
            fileName: fileName,
            ...mockData
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete mock file
app.delete('/api/mocks/:id', (req, res) => {
    const { domain = 'Dev' } = req.query;
    const mocksDir = getMockFolderPath();
    const sseFolder = path.join(mocksDir, 'Domains', domain, 'SSE');
    const filePath = path.join(sseFolder, `${req.params.id}.json`);
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Mock not found' });
    }

    try {
        fs.unlinkSync(filePath);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get active SSE connections
app.get('/api/connections', (req, res) => {
    const connections = getConnections();
    res.json(connections);
});

// Start mock for connection(s)
app.post('/api/mocks/:id/start', (req, res) => {
    const { connectionId, url } = req.body;
    const mocksDir = getMockFolderPath();
    const domainsPath = path.join(mocksDir, 'Domains');
    
    // Find mock file
    const domains = fs.readdirSync(domainsPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

    for (const domain of domains) {
        const sseFolder = path.join(domainsPath, domain, 'SSE');
        if (!fs.existsSync(sseFolder)) continue;

        const filePath = path.join(sseFolder, `${req.params.id}.json`);
        if (fs.existsSync(filePath)) {
            try {
                const mockData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                
                if (connectionId) {
                    startMock(connectionId, mockData);
                    return res.json({ success: true, message: 'Mock started for connection' });
                } else if (url) {
                    // Find all connections matching URL and scenario, then start mock
                    // Use mock's matching configuration to find connections
                    const connections = getConnections();
                    const matchingConfig = mockData.matching || null;
                    const mockScenario = mockData.scenario || null;
                    let startedCount = 0;
                    connections.forEach(conn => {
                        const urlMatches = matchUrlWithConfig(url, conn.url, matchingConfig);
                        const scenarioMatches = !mockScenario || !conn.scenario || String(mockScenario) === String(conn.scenario);
                        
                        if (urlMatches && scenarioMatches) {
                            startMock(conn.id, mockData);
                            startedCount++;
                        }
                    });
                    if (startedCount === 0) {
                        return res.status(404).json({ error: 'No matching connections found' });
                    }
                    return res.json({ success: true, message: `Mock started for ${startedCount} connection(s)` });
                } else {
                    return res.status(400).json({ error: 'Missing connectionId or url parameter' });
                }
            } catch (error) {
                return res.status(500).json({ error: error.message });
            }
        }
    }
    
    res.status(404).json({ error: 'Mock not found' });
});

// Note: matchUrlWithConfig is imported from sse-server-core

// Start API server
app.listen(API_PORT, () => {
    console.log(`[API Server] Started on port ${API_PORT}`);
    console.log(`[API Server] Web UI: http://localhost:${API_PORT}`);
});

// Start SSE server
const sseServer = createSSEServer(SSE_PORT, getMockFolderPath());
console.log(`[SSE Server] Started on port ${SSE_PORT}`);


#!/usr/bin/env node

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
    startMock
} = require('./sse-server-core');

// Express app for API
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Get mock folder path
function getMockFolderPath() {
    if (process.env.MOCKINGSSE_FOLDER) {
        return process.env.MOCKINGSSE_FOLDER;
    }
    // Use home directory for default mock folder (works with pkg binary)
    const homeDir = process.env.HOME || process.env.USERPROFILE || '/tmp';
    return path.join(homeDir, '.mockingsse', 'mocks');
}

// Ensure mocks directory exists
const mocksDir = getMockFolderPath();
if (!fs.existsSync(mocksDir)) {
    fs.mkdirSync(mocksDir, { recursive: true });
    fs.mkdirSync(path.join(mocksDir, 'Domains'), { recursive: true });
    fs.mkdirSync(path.join(mocksDir, 'Domains', 'Dev'), { recursive: true });
    fs.mkdirSync(path.join(mocksDir, 'Domains', 'Dev', 'SSE'), { recursive: true });
}

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
    const { url, responses, data, domain = 'Dev', matching } = req.body;
    
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

    // Generate filename from URL
    const urlHash = Buffer.from(url).toString('base64').replace(/[/+=]/g, '').substring(0, 20);
    const fileName = `${urlHash}.json`;
    const filePath = path.join(sseFolder, fileName);

    const mockData = {
        url,
        matching: matching || null,
        responses,
        data
    };

    try {
        fs.writeFileSync(filePath, JSON.stringify(mockData, null, 2));
        res.json({
            id: urlHash,
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
    const { url, responses, data, domain = 'Dev', matching } = req.body;
    
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
                    // Find all connections matching URL and start mock
                    const connections = getConnections();
                    let startedCount = 0;
                    connections.forEach(conn => {
                        if (conn.url === url || matchUrlByBase(conn.url, url)) {
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

// Helper function for URL matching
function matchUrlByBase(mockUrl, targetUrl) {
    function normalizeUrl(urlString) {
        try {
            const url = new URL(urlString);
            return `${url.protocol}//${url.host}${url.pathname}`;
        } catch (error) {
            const queryIndex = urlString.indexOf('?');
            if (queryIndex !== -1) {
                return urlString.substring(0, queryIndex);
            }
            return urlString;
        }
    }
    const mockBase = normalizeUrl(mockUrl);
    const targetBase = normalizeUrl(targetUrl);
    return mockBase === targetBase;
}

// Start API server
app.listen(API_PORT, () => {
    console.log(`[API Server] Started on port ${API_PORT}`);
    console.log(`[API Server] Web UI: http://localhost:${API_PORT}`);
});

// Start SSE server
const sseServer = createSSEServer(SSE_PORT, getMockFolderPath());
console.log(`[SSE Server] Started on port ${SSE_PORT}`);


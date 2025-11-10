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

const app = express();
app.use(cors());
app.use(express.json());
let publicPath;
if (process.pkg) {
    const execDir = path.dirname(process.execPath);
    const publicInExecDir = path.join(execDir, 'public');
    
    if (fs.existsSync(publicInExecDir)) {
        publicPath = publicInExecDir;
    } else {
        publicPath = path.join(__dirname, 'public');
    }
} else {
    publicPath = path.join(__dirname, 'public');
}

console.log(`[Server] Serving static files from: ${publicPath}`);
app.use(express.static(publicPath));

app.get('/', (req, res) => {
    const indexPath = path.join(publicPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('index.html not found');
    }
});

function getMockFolderPath() {
    if (process.env.MOCKINGSSE_FOLDER) {
        return process.env.MOCKINGSSE_FOLDER;
    }
    
    if (process.pkg) {
        const execDir = path.dirname(process.execPath);
        const mocksInExecDir = path.join(execDir, 'mocks');
        try {
            if (!fs.existsSync(mocksInExecDir)) {
                fs.mkdirSync(mocksInExecDir, { recursive: true });
            }
            return mocksInExecDir;
        } catch (error) {
            const homeDir = require('os').homedir();
            return path.join(homeDir, '.mockingsse', 'mocks');
        }
    }
    
    return path.join(__dirname, 'mocks');
}

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
            console.error(`[Info] Please create the directory manually or set MOCKINGSSE_FOLDER environment variable`);
        }
    }
}

ensureMocksDirectory();

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

app.post('/api/mocks', (req, res) => {
    const { url, responses, data, domain = 'Dev', matching, scenario } = req.body;
    
    if (!url || !responses || !data) {
        return res.status(400).json({ error: 'Missing required fields: url, responses, data' });
    }

    const mocksDir = getMockFolderPath();
    const domainPath = path.join(mocksDir, 'Domains', domain);
    const sseFolder = path.join(domainPath, 'SSE');
    
    if (!fs.existsSync(domainPath)) {
        fs.mkdirSync(domainPath, { recursive: true });
    }
    if (!fs.existsSync(sseFolder)) {
        fs.mkdirSync(sseFolder, { recursive: true });
    }

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

app.get('/api/connections', (req, res) => {
    const connections = getConnections();
    res.json(connections);
});

app.post('/api/mocks/:id/start', (req, res) => {
    const { connectionId, url } = req.body;
    const mocksDir = getMockFolderPath();
    const domainsPath = path.join(mocksDir, 'Domains');
    
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

app.listen(API_PORT, () => {
    console.log(`[API Server] Started on port ${API_PORT}`);
    console.log(`[API Server] Web UI: http://localhost:${API_PORT}`);
});

const sseServer = createSSEServer(SSE_PORT, getMockFolderPath());
console.log(`[SSE Server] Started on port ${SSE_PORT}`);


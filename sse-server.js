#!/usr/bin/env node

/**
 * SSE Server for MockingStar
 * This server handles Server-Sent Events (SSE) with real-time streaming
 * It runs on a separate port (8009) from the main MockingStar server (8008)
 */

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

const SSE_PORT = 8009;
const MAIN_SERVER_PORT = 8008;

// Store active SSE connections
const connections = new Map(); // Map<connectionId, { url: string, scenario?: string, response: ServerResponse, createdAt: Date, mockTimer?: NodeJS.Timeout }>

// Store active mock timers
const mockTimers = new Map(); // Map<connectionId, NodeJS.Timeout[]>

const server = http.createServer((req, res) => {
    const path = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Cache-Control, X-SSE-URL, url, sse-url, scenario, x-scenario');

    if (path === '/sse' && req.method === 'GET') {
        handleSSEConnection(req, res);
    } else if (path === '/sse/event' && req.method === 'POST') {
        handleSSEEvent(req, res);
    } else if (path === '/sse/event' && req.method === 'GET') {
        handleListConnections(res);
    } else if (path === '/sse/mock' && req.method === 'POST') {
        handleSSEMock(req, res);
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

function handleSSEConnection(req, res) {
    // Get URL from header (X-SSE-URL or url header)
    const urlParam = req.headers['x-sse-url'] || req.headers['url'] || req.headers['sse-url'];
    
    if (!urlParam) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing url header (X-SSE-URL, url, or sse-url)');
        return;
    }

    const connectionId = generateConnectionId();
    
    // Store URL as string (can be any string, not necessarily a valid URL)
    const targetUrl = String(urlParam);
    const scenario = req.headers['scenario'] || req.headers['x-scenario'] || null;

    // SSE headers
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Send initial keep-alive comment
    res.write(': keep-alive\n\n');

    // Store connection
    const connectionData = {
        url: targetUrl,
        response: res,
        createdAt: new Date()
    };
    
    if (scenario) {
        connectionData.scenario = String(scenario);
    }
    
    connections.set(connectionId, connectionData);

    console.log(`[SSE] Connection opened: ${connectionId} for URL: ${urlParam}${scenario ? ` with scenario: ${scenario}` : ''}`);

    // Check for mock file and start mock if found
    checkAndStartMock(connectionId, targetUrl, scenario);

    // Handle client disconnect
    req.on('close', () => {
        // Clear mock timers
        clearMockTimers(connectionId);
        connections.delete(connectionId);
        console.log(`[SSE] Connection closed: ${connectionId}`);
    });
}

function handleSSEEvent(req, res) {
    let body = '';

    req.on('data', chunk => {
        body += chunk.toString();
    });

    req.on('end', () => {
        try {
            const eventData = JSON.parse(body);
            const { connectionId, url: targetUrl, data } = eventData;

            if (connectionId) {
                // Send to specific connection
                sendEventToConnection(connectionId, data);
            } else if (targetUrl) {
                // Send to all connections matching URL
                sendEventToURL(targetUrl, data);
            } else {
                // Send to all connections
                sendEventToAll(data);
            }

            res.writeHead(202, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        } catch (error) {
            console.error('[SSE] Error handling event:', error);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
        }
    });
}

function handleListConnections(res) {
    const connectionsList = Array.from(connections.entries()).map(([id, conn]) => ({
        id,
        url: String(conn.url),
        scenario: conn.scenario || null,
        createdAt: conn.createdAt.toISOString()
    }));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(connectionsList));
}

function sendEventToConnection(connectionId, data) {
    const connection = connections.get(connectionId);
    if (connection && connection.response) {
        const sseData = `data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`;
        connection.response.write(sseData);
        console.log(`[SSE] Event sent to connection: ${connectionId}`);
    } else {
        console.warn(`[SSE] Connection not found: ${connectionId}`);
    }
}

function sendEventToURL(targetUrl, data) {
    // URL is stored as string, so compare directly
    const targetUrlString = String(targetUrl);
    let sentCount = 0;

    connections.forEach((conn, id) => {
        try {
            // Compare URL strings directly
            if (String(conn.url) === targetUrlString && conn.response) {
                const sseData = `data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`;
                conn.response.write(sseData);
                sentCount++;
            }
        } catch (error) {
            console.error(`[SSE] Error sending event to connection ${id}:`, error);
        }
    });

    console.log(`[SSE] Event sent to ${sentCount} connection(s) for URL: ${targetUrl}`);
}

function sendEventToAll(data) {
    let sentCount = 0;

    connections.forEach((conn, id) => {
        if (conn.response) {
            const sseData = `data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`;
            conn.response.write(sseData);
            sentCount++;
        }
    });

    console.log(`[SSE] Event sent to all ${sentCount} connection(s)`);
}

function generateConnectionId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Get mock folder path from environment or default
function getMockFolderPath() {
    // MockingStar passes the folder path via environment variable
    // This is the root folder containing "Domains" directory
    const rootPath = process.env.MOCKINGSTAR_FOLDER || './';
    console.log(`[SSE] Mock folder path: ${rootPath}`);
    return rootPath;
}

// Find mock file for a given URL and scenario
// Searches in Domains/{domain}/SSE/ folders
function findMockFile(targetUrl, scenario) {
    const rootPath = getMockFolderPath();
    const domainsPath = path.join(rootPath, 'Domains');
    
    console.log(`[SSE] Searching for mock file for URL: ${targetUrl}${scenario ? ` with scenario: ${scenario}` : ''}`);
    console.log(`[SSE] Root path: ${rootPath}`);
    console.log(`[SSE] Domains path: ${domainsPath}`);
    
    if (!fs.existsSync(domainsPath)) {
        console.log(`[SSE] Domains folder not found at: ${domainsPath}`);
        return null;
    }

    // List all domain folders
    const domains = fs.readdirSync(domainsPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

    console.log(`[SSE] Found domains: ${domains.join(', ')}`);

    const matchingMocks = [];

    // Search in each domain's SSE folder
    for (const domain of domains) {
        const sseFolder = path.join(domainsPath, domain, 'SSE');
        
        if (!fs.existsSync(sseFolder)) {
            console.log(`[SSE] SSE folder not found for domain ${domain}: ${sseFolder}`);
            continue;
        }

        console.log(`[SSE] Checking SSE folder: ${sseFolder}`);

        // List all JSON files in SSE folder
        const files = fs.readdirSync(sseFolder).filter(file => file.endsWith('.json'));
        console.log(`[SSE] Found ${files.length} JSON file(s) in ${sseFolder}`);
        
        for (const file of files) {
            const filePath = path.join(sseFolder, file);
            try {
                const mockData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                console.log(`[SSE] Checking mock file ${file}: mock URL = "${mockData.url}", target URL = "${targetUrl}"`);
                
                // Check URL match first
                let urlMatches = false;
                
                // Check if URL matches (exact match, base URL match, or pattern match)
                if (mockData.url === targetUrl) {
                    console.log(`[SSE] Exact match found!`);
                    urlMatches = true;
                } else if (matchUrlByBase(mockData.url, targetUrl)) {
                    console.log(`[SSE] Base URL match found! (ignoring query parameters)`);
                    urlMatches = true;
                } else if (matchUrlPattern(mockData.url, targetUrl)) {
                    console.log(`[SSE] Pattern match found!`);
                    urlMatches = true;
                }
                
                if (urlMatches) {
                    // Check scenario match
                    const mockScenario = mockData.scenario || null;
                    
                    // If scenario is provided in connection, only match mocks with matching scenario
                    if (scenario) {
                        if (mockScenario && String(mockScenario) === String(scenario)) {
                            console.log(`[SSE] Scenario match found!`);
                            matchingMocks.push({ filePath, mockData, hasScenario: true });
                        }
                    } else {
                        // If no scenario in connection, prefer mocks without scenario
                        if (!mockScenario) {
                            matchingMocks.unshift({ filePath, mockData, hasScenario: false });
                        } else {
                            matchingMocks.push({ filePath, mockData, hasScenario: true });
                        }
                    }
                } else {
                    console.log(`[SSE] No match for ${file}`);
                }
            } catch (error) {
                console.error(`[SSE] Error reading mock file ${file}:`, error);
            }
        }
    }
    
    // Return the best match:
    // 1. If scenario provided: return mock with matching scenario
    // 2. If no scenario: return mock without scenario (first in list)
    if (matchingMocks.length > 0) {
        if (scenario) {
            // Find mock with matching scenario
            const scenarioMatch = matchingMocks.find(m => m.hasScenario);
            if (scenarioMatch) {
                console.log(`[SSE] Mock file found with scenario match!`);
                return { filePath: scenarioMatch.filePath, mockData: scenarioMatch.mockData };
            }
        } else {
            // Return first mock without scenario
            const noScenarioMatch = matchingMocks.find(m => !m.hasScenario);
            if (noScenarioMatch) {
                console.log(`[SSE] Mock file found without scenario!`);
                return { filePath: noScenarioMatch.filePath, mockData: noScenarioMatch.mockData };
            }
        }
    }
    
    console.log(`[SSE] No mock file found for URL: ${targetUrl}${scenario ? ` with scenario: ${scenario}` : ''}`);
    return null;
}

// Normalize URL by removing query parameters for comparison
function normalizeUrl(urlString) {
    try {
        const url = new URL(urlString);
        // Return base URL without query parameters
        return `${url.protocol}//${url.host}${url.pathname}`;
    } catch (error) {
        // If not a valid URL, try to extract base URL manually
        const queryIndex = urlString.indexOf('?');
        if (queryIndex !== -1) {
            return urlString.substring(0, queryIndex);
        }
        return urlString;
    }
}

// Simple URL pattern matching (supports wildcards)
function matchUrlPattern(pattern, url) {
    // Convert pattern to regex (simple wildcard support)
    const regexPattern = pattern
        .replace(/\*/g, '.*')
        .replace(/\?/g, '\\?');
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(url);
}

// Match URLs by comparing base URLs (ignoring query parameters)
function matchUrlByBase(mockUrl, targetUrl) {
    const mockBase = normalizeUrl(mockUrl);
    const targetBase = normalizeUrl(targetUrl);
    return mockBase === targetBase;
}

// Check for mock and start it if found
function checkAndStartMock(connectionId, targetUrl, scenario) {
    const mockFile = findMockFile(targetUrl, scenario);
    
    if (mockFile) {
        console.log(`[SSE] Mock found for URL: ${targetUrl}${scenario ? ` with scenario: ${scenario}` : ''}, starting mock...`);
        startMock(connectionId, mockFile.mockData);
    } else {
        console.log(`[SSE] No mock found for URL: ${targetUrl}${scenario ? ` with scenario: ${scenario}` : ''}`);
    }
}

// Start mock with timed responses
function startMock(connectionId, mockData) {
    // Clear existing timers if any
    clearMockTimers(connectionId);
    
    const { url: mockUrl, responses, data } = mockData;
    
    if (!responses || !Array.isArray(responses) || !data || !Array.isArray(data)) {
        console.error(`[SSE] Invalid mock data format for connection: ${connectionId}`);
        return;
    }

    const timers = [];
    
    responses.forEach((response, index) => {
        const { time, response: responseIndex } = response;
        
        if (typeof time !== 'number' || typeof responseIndex !== 'number') {
            console.error(`[SSE] Invalid response format at index ${index}`);
            return;
        }
        
        if (responseIndex < 0 || responseIndex >= data.length) {
            console.error(`[SSE] Response index ${responseIndex} out of bounds`);
            return;
        }
        
        const timer = setTimeout(() => {
            const responseData = data[responseIndex];
            sendEventToConnection(connectionId, JSON.stringify(responseData));
            console.log(`[SSE] Mock event sent to connection ${connectionId} at ${time}ms (response index: ${responseIndex})`);
        }, time);
        
        timers.push(timer);
    });
    
    mockTimers.set(connectionId, timers);
    console.log(`[SSE] Mock started for connection ${connectionId} with ${responses.length} scheduled events`);
}

// Clear mock timers for a connection
function clearMockTimers(connectionId) {
    const timers = mockTimers.get(connectionId);
    if (timers) {
        timers.forEach(timer => clearTimeout(timer));
        mockTimers.delete(connectionId);
        console.log(`[SSE] Mock timers cleared for connection: ${connectionId}`);
    }
}

// Handle POST /sse/mock - manually start a mock
function handleSSEMock(req, res) {
    let body = '';

    req.on('data', chunk => {
        body += chunk.toString();
    });

    req.on('end', () => {
        try {
            const requestData = JSON.parse(body);
            const { connectionId, url: targetUrl, mockFile } = requestData;

            console.log(`[SSE] Manual mock request received:`, { connectionId, targetUrl, mockFile });

            if (mockFile) {
                // Use provided mock file path
                console.log(`[SSE] Using provided mock file: ${mockFile}`);
                const mockData = JSON.parse(fs.readFileSync(mockFile, 'utf8'));
                let startedCount = 0;
                
                if (connectionId) {
                    console.log(`[SSE] Starting mock for specific connection: ${connectionId}`);
                    if (connections.has(connectionId)) {
                        startMock(connectionId, mockData);
                        startedCount = 1;
                        console.log(`[SSE] Mock started for connection: ${connectionId}`);
                    } else {
                        console.warn(`[SSE] Connection not found: ${connectionId}`);
                    }
                } else if (targetUrl) {
                    // Find all connections for this URL and start mock
                    console.log(`[SSE] Searching for connections matching URL: ${targetUrl}`);
                    connections.forEach((conn, id) => {
                        console.log(`[SSE] Checking connection ${id}: URL = "${conn.url}"`);
                        if (String(conn.url) === String(targetUrl) || matchUrlByBase(String(conn.url), targetUrl)) {
                            console.log(`[SSE] Match found! Starting mock for connection: ${id}`);
                            startMock(id, mockData);
                            startedCount++;
                        }
                    });
                    console.log(`[SSE] Found ${startedCount} matching connection(s) for URL: ${targetUrl}`);
                } else {
                    console.error(`[SSE] Missing connectionId or targetUrl for mockFile request`);
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Missing connectionId or url parameter when using mockFile' }));
                    return;
                }
                
                if (startedCount > 0) {
                    res.writeHead(202, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, message: `Mock started for ${startedCount} connection(s)` }));
                } else {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'No matching connections found' }));
                }
            } else if (targetUrl) {
                // Get scenario from request if provided
                const requestScenario = requestData.scenario || null;
                // Find mock file for URL and scenario, then start it
                console.log(`[SSE] Searching for mock file for URL: ${targetUrl}${requestScenario ? ` with scenario: ${requestScenario}` : ''}`);
                const mockFile = findMockFile(targetUrl, requestScenario);
                if (mockFile) {
                    console.log(`[SSE] Mock file found: ${mockFile.filePath}`);
                    let startedCount = 0;
                    const mockScenario = mockFile.mockData.scenario || null;
                    
                    if (connectionId) {
                        console.log(`[SSE] Starting mock for specific connection: ${connectionId}`);
                        if (connections.has(connectionId)) {
                            startMock(connectionId, mockFile.mockData);
                            startedCount = 1;
                            console.log(`[SSE] Mock started for connection: ${connectionId}`);
                        } else {
                            console.warn(`[SSE] Connection not found: ${connectionId}`);
                            res.writeHead(404, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: `Connection not found: ${connectionId}` }));
                            return;
                        }
                    } else {
                        // Start mock for all connections matching URL and scenario (by base URL)
                        console.log(`[SSE] Searching for connections matching URL: ${targetUrl}${mockScenario ? ` with scenario: ${mockScenario}` : ''}`);
                        console.log(`[SSE] Total active connections: ${connections.size}`);
                        connections.forEach((conn, id) => {
                            console.log(`[SSE] Checking connection ${id}: URL = "${conn.url}"${conn.scenario ? `, scenario = "${conn.scenario}"` : ''}`);
                            const urlMatches = matchUrlByBase(String(conn.url), targetUrl);
                            const scenarioMatches = !mockScenario || !conn.scenario || String(mockScenario) === String(conn.scenario);
                            
                            if (urlMatches && scenarioMatches) {
                                console.log(`[SSE] Match found! Starting mock for connection: ${id}`);
                                startMock(id, mockFile.mockData);
                                startedCount++;
                            }
                        });
                        console.log(`[SSE] Found ${startedCount} matching connection(s) for URL: ${targetUrl}`);
                    }
                    
                    if (startedCount > 0) {
                        res.writeHead(202, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, message: `Mock started for ${startedCount} connection(s)` }));
                    } else {
                        // Mock file found but no matching connections
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ 
                            error: 'No matching connections found for URL',
                            message: 'Mock file exists but no active connections match this URL',
                            mockFile: mockFile.filePath
                        }));
                    }
                } else {
                    console.log(`[SSE] Mock file not found for URL: ${targetUrl}`);
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Mock file not found for URL' }));
                }
            } else {
                console.error(`[SSE] Missing url or mockFile parameter`);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing url or mockFile parameter' }));
            }
        } catch (error) {
            console.error('[SSE] Error handling mock request:', error);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
        }
    });
}

server.listen(SSE_PORT, () => {
    console.log(`[SSE Server] Started on port ${SSE_PORT}`);
    console.log(`[SSE Server] Mock folder: ${getMockFolderPath()}`);
    console.log(`[SSE Server] Endpoints:`);
    console.log(`  GET  /sse?url=<url> - Open SSE connection (auto-checks for mock)`);
    console.log(`  POST /sse/event - Send event to connections`);
    console.log(`  GET  /sse/event - List active connections`);
    console.log(`  POST /sse/mock - Start mock manually`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n[SSE Server] Shutting down...');
    connections.forEach((conn, id) => {
        if (conn.response) {
            conn.response.end();
        }
    });
    server.close(() => {
        console.log('[SSE Server] Closed');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\n[SSE Server] Shutting down...');
    connections.forEach((conn, id) => {
        if (conn.response) {
            conn.response.end();
        }
    });
    server.close(() => {
        console.log('[SSE Server] Closed');
        process.exit(0);
    });
});


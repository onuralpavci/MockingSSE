#!/usr/bin/env node

/**
 * SSE Server Core Module
 * Handles Server-Sent Events (SSE) with real-time streaming
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// Store active SSE connections
const connections = new Map(); // Map<connectionId, { url: string, response: ServerResponse, createdAt: Date }>

// Store active mock timers
const mockTimers = new Map(); // Map<connectionId, NodeJS.Timeout[]>

function generateConnectionId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Get mock folder path from environment or default
function getMockFolderPath(mockFolderPath) {
    if (mockFolderPath) {
        return mockFolderPath;
    }
    // Check environment variable (both names for compatibility)
    if (process.env.MOCKINGSSE_FOLDER) {
        return process.env.MOCKINGSSE_FOLDER;
    }
    if (process.env.MOCKINGSTAR_FOLDER) {
        return process.env.MOCKINGSTAR_FOLDER;
    }
    
    // If running as pkg executable, use home directory
    if (process.pkg) {
        const os = require('os');
        return path.join(os.homedir(), '.mockingsse', 'mocks');
    }
    
    // Default for development: use project directory
    return path.join(__dirname, 'mocks');
}

// Normalize URL by removing query parameters for comparison
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

// Parse query parameters from URL
function parseQueryParams(urlString) {
    try {
        const url = new URL(urlString);
        const params = {};
        url.searchParams.forEach((value, key) => {
            if (params[key]) {
                // Multiple values for same key - convert to array
                if (Array.isArray(params[key])) {
                    params[key].push(value);
                } else {
                    params[key] = [params[key], value];
                }
            } else {
                params[key] = value;
            }
        });
        return params;
    } catch (error) {
        // If not a valid URL, try manual parsing
        const queryIndex = urlString.indexOf('?');
        if (queryIndex === -1) {
            return {};
        }
        const queryString = urlString.substring(queryIndex + 1);
        const params = {};
        queryString.split('&').forEach(param => {
            const [key, value] = param.split('=');
            if (key) {
                const decodedKey = decodeURIComponent(key);
                const decodedValue = value ? decodeURIComponent(value) : '';
                if (params[decodedKey]) {
                    if (Array.isArray(params[decodedKey])) {
                        params[decodedKey].push(decodedValue);
                    } else {
                        params[decodedKey] = [params[decodedKey], decodedValue];
                    }
                } else {
                    params[decodedKey] = decodedValue;
                }
            }
        });
        return params;
    }
}

// Compare query parameters
function compareQueryParams(mockParams, targetParams, matchAllQueries, matchQueries) {
    if (matchAllQueries) {
        // All query parameters must match exactly
        const mockKeys = Object.keys(mockParams).sort();
        const targetKeys = Object.keys(targetParams).sort();
        
        // Both must have the same number of query parameters
        if (mockKeys.length !== targetKeys.length) {
            return false;
        }
        
        // All keys must match
        for (let i = 0; i < mockKeys.length; i++) {
            if (mockKeys[i] !== targetKeys[i]) {
                return false;
            }
        }
        
        // All values must match
        for (const key of mockKeys) {
            if (JSON.stringify(mockParams[key]) !== JSON.stringify(targetParams[key])) {
                return false;
            }
        }
        return true;
    } else if (matchQueries && matchQueries.length > 0) {
        // Only specified query parameters must match
        for (const key of matchQueries) {
            // Both mock and target must have this parameter
            if (!(key in mockParams) || !(key in targetParams)) {
                return false;
            }
            
            // Values must match
            if (JSON.stringify(mockParams[key]) !== JSON.stringify(targetParams[key])) {
                return false;
            }
        }
        return true;
    }
    
    // No query matching required
    return true;
}

// Match URLs by comparing base URLs (ignoring query parameters)
function matchUrlByBase(mockUrl, targetUrl) {
    const mockBase = normalizeUrl(mockUrl);
    const targetBase = normalizeUrl(targetUrl);
    return mockBase === targetBase;
}

// Match URLs with query parameter configuration
function matchUrlWithConfig(mockUrl, targetUrl, matchingConfig) {
    // First check base URL match
    if (!matchUrlByBase(mockUrl, targetUrl)) {
        return false;
    }
    
    // If no matching config, use default behavior (ignore queries)
    if (!matchingConfig) {
        return true;
    }
    
    const { matchAllQueries, matchQueries } = matchingConfig;
    
    // If no query matching is required, base URL match is enough
    if (!matchAllQueries && (!matchQueries || matchQueries.length === 0)) {
        return true;
    }
    
    // Parse query parameters
    const mockParams = parseQueryParams(mockUrl);
    const targetParams = parseQueryParams(targetUrl);
    
    // Compare query parameters based on config
    return compareQueryParams(mockParams, targetParams, matchAllQueries, matchQueries);
}

// Simple URL pattern matching (supports wildcards)
function matchUrlPattern(pattern, url) {
    const regexPattern = pattern
        .replace(/\*/g, '.*')
        .replace(/\?/g, '\\?');
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(url);
}

// Find mock file for a given URL
function findMockFile(targetUrl, mockFolderPath) {
    const rootPath = getMockFolderPath(mockFolderPath);
    const domainsPath = path.join(rootPath, 'Domains');
    
    if (!fs.existsSync(domainsPath)) {
        return null;
    }

    const domains = fs.readdirSync(domainsPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

    for (const domain of domains) {
        const sseFolder = path.join(domainsPath, domain, 'SSE');
        
        if (!fs.existsSync(sseFolder)) {
            continue;
        }

        const files = fs.readdirSync(sseFolder).filter(file => file.endsWith('.json'));
        
        for (const file of files) {
            const filePath = path.join(sseFolder, file);
            try {
                const mockData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                
                // Check exact match first
                if (mockData.url === targetUrl) {
                    return { filePath, mockData };
                }
                
                // Check with matching configuration
                const matchingConfig = mockData.matching || null;
                if (matchUrlWithConfig(mockData.url, targetUrl, matchingConfig)) {
                    return { filePath, mockData };
                }
            } catch (error) {
                console.error(`[SSE] Error reading mock file ${file}:`, error);
            }
        }
    }
    
    return null;
}

// Start mock with timed responses
function startMock(connectionId, mockData) {
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

// Check for mock and start it if found
function checkAndStartMock(connectionId, targetUrl, mockFolderPath) {
    const mockFile = findMockFile(targetUrl, mockFolderPath);
    
    if (mockFile) {
        console.log(`[SSE] Mock found for URL: ${targetUrl}, starting mock...`);
        startMock(connectionId, mockFile.mockData);
    } else {
        console.log(`[SSE] No mock found for URL: ${targetUrl}`);
    }
}

// Send event to connection
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

// Send event to URL
function sendEventToURL(targetUrl, data) {
    const targetUrlString = String(targetUrl);
    let sentCount = 0;

    connections.forEach((conn, id) => {
        try {
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

// Send event to all connections
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

// Get all connections
function getConnections() {
    return Array.from(connections.entries()).map(([id, conn]) => ({
        id,
        url: String(conn.url),
        createdAt: conn.createdAt.toISOString()
    }));
}

// Create SSE server
function createSSEServer(port, mockFolderPath) {
    const server = http.createServer((req, res) => {
        const pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;

        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', 'Cache-Control, X-SSE-URL, url, sse-url');

        if (pathname === '/sse' && req.method === 'GET') {
            handleSSEConnection(req, res, mockFolderPath);
        } else if (pathname === '/sse/event' && req.method === 'POST') {
            handleSSEEvent(req, res);
        } else if (pathname === '/sse/event' && req.method === 'GET') {
            handleListConnections(res);
        } else if (pathname === '/sse/mock' && req.method === 'POST') {
            handleSSEMock(req, res, mockFolderPath);
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
        }
    });

    function handleSSEConnection(req, res, mockFolderPath) {
        const urlParam = req.headers['x-sse-url'] || req.headers['url'] || req.headers['sse-url'];
        
        if (!urlParam) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Missing url header (X-SSE-URL, url, or sse-url)');
            return;
        }

        const connectionId = generateConnectionId();
        const targetUrl = String(urlParam);

        // Check for mock file to get status code
        const mockFile = findMockFile(targetUrl, mockFolderPath);
        let statusCode = 200; // Default status code
        
        if (mockFile && mockFile.mockData) {
            // Use statusCode from mock file if available
            if (typeof mockFile.mockData.statusCode === 'number') {
                statusCode = mockFile.mockData.statusCode;
            }
        }

        res.writeHead(statusCode, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Cache-Control'
        });

        res.write(': keep-alive\n\n');

        connections.set(connectionId, {
            url: targetUrl,
            response: res,
            createdAt: new Date()
        });

        console.log(`[SSE] Connection opened: ${connectionId} for URL: ${urlParam} with status code: ${statusCode}`);

        checkAndStartMock(connectionId, targetUrl, mockFolderPath);

        req.on('close', () => {
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
                    sendEventToConnection(connectionId, data);
                } else if (targetUrl) {
                    sendEventToURL(targetUrl, data);
                } else {
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
        const connectionsList = getConnections();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(connectionsList));
    }

    function handleSSEMock(req, res, mockFolderPath) {
        let body = '';

        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', () => {
            try {
                const requestData = JSON.parse(body);
                const { connectionId, url: targetUrl, mockFile } = requestData;

                if (mockFile) {
                    const mockData = JSON.parse(fs.readFileSync(mockFile, 'utf8'));
                    let startedCount = 0;
                    
                    if (connectionId) {
                        if (connections.has(connectionId)) {
                            startMock(connectionId, mockData);
                            startedCount = 1;
                        }
                    } else if (targetUrl) {
                        connections.forEach((conn, id) => {
                            if (String(conn.url) === String(targetUrl) || matchUrlByBase(String(conn.url), targetUrl)) {
                                startMock(id, mockData);
                                startedCount++;
                            }
                        });
                    }
                    
                    if (startedCount > 0) {
                        res.writeHead(202, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, message: `Mock started for ${startedCount} connection(s)` }));
                    } else {
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'No matching connections found' }));
                    }
                } else if (targetUrl) {
                    const mockFile = findMockFile(targetUrl, mockFolderPath);
                    if (mockFile) {
                        let startedCount = 0;
                        
                        if (connectionId) {
                            if (connections.has(connectionId)) {
                                startMock(connectionId, mockFile.mockData);
                                startedCount = 1;
                            }
                        } else {
                            connections.forEach((conn, id) => {
                                if (matchUrlByBase(String(conn.url), targetUrl)) {
                                    startMock(id, mockFile.mockData);
                                    startedCount++;
                                }
                            });
                        }
                        
                        if (startedCount > 0) {
                            res.writeHead(202, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: true, message: `Mock started for ${startedCount} connection(s)` }));
                        } else {
                            res.writeHead(404, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'No matching connections found for URL' }));
                        }
                    } else {
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Mock file not found for URL' }));
                    }
                } else {
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

    server.listen(port, () => {
        console.log(`[SSE Server] Started on port ${port}`);
        console.log(`[SSE Server] Mock folder: ${getMockFolderPath(mockFolderPath)}`);
    });

    server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            console.error(`[SSE Server] Error: Port ${port} is already in use.`);
            console.error(`[SSE Server] Please stop the process using this port or use a different port.`);
            console.error(`[SSE Server] To find the process: lsof -ti:${port}`);
        } else {
            console.error(`[SSE Server] Error:`, error);
        }
        process.exit(1);
    });

    return server;
}

module.exports = {
    createSSEServer,
    getConnections,
    sendEventToConnection,
    sendEventToURL,
    sendEventToAll,
    findMockFile,
    startMock
};


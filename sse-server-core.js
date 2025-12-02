#!/usr/bin/env node

/**
 * SSE Server Core Module
 * Handles Server-Sent Events (SSE) with real-time streaming
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const connections = new Map();
const mockTimers = new Map();

function generateConnectionId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function getMockFolderPath(mockFolderPath) {
    return mockFolderPath || process.env.MOCKINGSSE_FOLDER || path.join(__dirname, 'mocks');
}

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

function parseQueryParams(urlString) {
    try {
        const url = new URL(urlString);
        const params = {};
        url.searchParams.forEach((value, key) => {
            if (params[key]) {
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

function compareQueryParams(mockParams, targetParams, matchAllQueries, matchQueries) {
    if (matchAllQueries) {
        const mockKeys = Object.keys(mockParams).sort();
        const targetKeys = Object.keys(targetParams).sort();
        
        if (mockKeys.length !== targetKeys.length) {
            return false;
        }
        
        for (let i = 0; i < mockKeys.length; i++) {
            if (mockKeys[i] !== targetKeys[i]) {
                return false;
            }
        }
        
        for (const key of mockKeys) {
            if (JSON.stringify(mockParams[key]) !== JSON.stringify(targetParams[key])) {
                return false;
            }
        }
        return true;
    } else if (matchQueries && matchQueries.length > 0) {
        for (const key of matchQueries) {
            if (!(key in mockParams) || !(key in targetParams)) {
                return false;
            }
            
            if (JSON.stringify(mockParams[key]) !== JSON.stringify(targetParams[key])) {
                return false;
            }
        }
        return true;
    }
    
    return true;
}

function matchUrlByBase(mockUrl, targetUrl) {
    const mockBase = normalizeUrl(mockUrl);
    const targetBase = normalizeUrl(targetUrl);
    return mockBase === targetBase;
}

function matchUrlWithConfig(mockUrl, targetUrl, matchingConfig) {
    if (!matchUrlByBase(mockUrl, targetUrl)) {
        return false;
    }
    
    if (!matchingConfig) {
        return true;
    }
    
    const { matchAllQueries, matchQueries } = matchingConfig;
    
    if (!matchAllQueries && (!matchQueries || matchQueries.length === 0)) {
        return true;
    }
    
    const mockParams = parseQueryParams(mockUrl);
    const targetParams = parseQueryParams(targetUrl);
    
    return compareQueryParams(mockParams, targetParams, matchAllQueries, matchQueries);
}

function matchUrlPattern(pattern, url) {
    const regexPattern = pattern
        .replace(/\*/g, '.*')
        .replace(/\?/g, '\\?');
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(url);
}

function findMockFile(targetUrl, scenario, mockFolderPath) {
    const rootPath = getMockFolderPath(mockFolderPath);
    const domainsPath = path.join(rootPath, 'Domains');
    
    if (!fs.existsSync(domainsPath)) {
        return null;
    }

    const domains = fs.readdirSync(domainsPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

    const matchingMocks = [];

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
                
                let urlMatches = false;
                
                if (mockData.url === targetUrl) {
                    urlMatches = true;
                } else {
                    const matchingConfig = mockData.matching || null;
                    if (matchUrlWithConfig(mockData.url, targetUrl, matchingConfig)) {
                        urlMatches = true;
                    }
                }
                
                if (urlMatches) {
                    const mockScenario = mockData.scenario || null;
                    
                    if (scenario) {
                        if (mockScenario && String(mockScenario) === String(scenario)) {
                            matchingMocks.push({ filePath, mockData, hasScenario: true });
                        }
                    } else {
                        if (!mockScenario) {
                            matchingMocks.unshift({ filePath, mockData, hasScenario: false });
                        } else {
                            matchingMocks.push({ filePath, mockData, hasScenario: true });
                        }
                    }
                }
            } catch (error) {
                console.error(`[SSE] Error reading mock file ${file}:`, error);
            }
        }
    }
    
    if (matchingMocks.length > 0) {
        if (scenario) {
            const scenarioMatch = matchingMocks.find(m => m.hasScenario);
            if (scenarioMatch) {
                return { filePath: scenarioMatch.filePath, mockData: scenarioMatch.mockData };
            }
        } else {
            const noScenarioMatch = matchingMocks.find(m => !m.hasScenario);
            if (noScenarioMatch) {
                return { filePath: noScenarioMatch.filePath, mockData: noScenarioMatch.mockData };
            }
        }
    }
    
    return null;
}

function startMock(connectionId, mockData) {
    clearMockTimers(connectionId);
    
    const { url: mockUrl, responses, data } = mockData;
    
    if (!responses || !Array.isArray(responses) || !data || !Array.isArray(data)) {
        console.error(`[SSE] Invalid mock data format for connection: ${connectionId}`);
        return;
    }

    const timers = [];
    
    responses.forEach((response, index) => {
        const { time, response: responseIndex, statusCode = 200 } = response;
        
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
            sendEventToConnection(connectionId, JSON.stringify(responseData), statusCode);
            console.log(`[SSE] Mock event sent to connection ${connectionId} at ${time}ms (response index: ${responseIndex}, statusCode: ${statusCode})`);
        }, time);
        
        timers.push(timer);
    });
    
    mockTimers.set(connectionId, timers);
    console.log(`[SSE] Mock started for connection ${connectionId} with ${responses.length} scheduled events`);
}

function clearMockTimers(connectionId) {
    const timers = mockTimers.get(connectionId);
    if (timers) {
        timers.forEach(timer => clearTimeout(timer));
        mockTimers.delete(connectionId);
        console.log(`[SSE] Mock timers cleared for connection: ${connectionId}`);
    }
}

function checkAndStartMock(connectionId, targetUrl, scenario, mockFolderPath) {
    const mockFile = findMockFile(targetUrl, scenario, mockFolderPath);
    
    if (mockFile) {
        console.log(`[SSE] Mock found for URL: ${targetUrl}${scenario ? ` with scenario: ${scenario}` : ''}, starting mock...`);
        startMock(connectionId, mockFile.mockData);
    } else {
        console.log(`[SSE] No mock found for URL: ${targetUrl}${scenario ? ` with scenario: ${scenario}` : ''}`);
    }
}

function sendEventToConnection(connectionId, data, statusCode = 200) {
    const connection = connections.get(connectionId);
    if (connection && connection.response) {
        // Include statusCode in the SSE event
        const eventData = typeof data === 'string' ? data : JSON.stringify(data);
        const sseEvent = `event: response\ndata: {"statusCode": ${statusCode}, "body": ${eventData}}\n\n`;
        connection.response.write(sseEvent);
        console.log(`[SSE] Event sent to connection: ${connectionId} (statusCode: ${statusCode})`);
    } else {
        console.warn(`[SSE] Connection not found: ${connectionId}`);
    }
}

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

function getConnections() {
    return Array.from(connections.entries()).map(([id, conn]) => ({
        id,
        url: String(conn.url),
        scenario: conn.scenario || null,
        createdAt: conn.createdAt.toISOString()
    }));
}

function createSSEServer(port, mockFolderPath) {
    const server = http.createServer((req, res) => {
        const pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', 'Cache-Control, X-SSE-URL, url, sse-url, scenario, x-scenario');

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
        const scenario = req.headers['scenario'] || req.headers['x-scenario'] || null;

        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Cache-Control'
        });

        res.write(': keep-alive\n\n');

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

        checkAndStartMock(connectionId, targetUrl, scenario, mockFolderPath);

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
                        // Use mock's matching configuration to find connections
                        const matchingConfig = mockData.matching || null;
                        connections.forEach((conn, id) => {
                            if (matchUrlWithConfig(targetUrl, String(conn.url), matchingConfig)) {
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
                    const requestScenario = requestData.scenario || null;
                    const mockFile = findMockFile(targetUrl, requestScenario, mockFolderPath);
                    if (mockFile) {
                        let startedCount = 0;
                        
                        if (connectionId) {
                            if (connections.has(connectionId)) {
                                startMock(connectionId, mockFile.mockData);
                                startedCount = 1;
                            }
                        } else {
                            const matchingConfig = mockFile.mockData.matching || null;
                            const mockScenario = mockFile.mockData.scenario || null;
                            connections.forEach((conn, id) => {
                                const urlMatches = matchUrlWithConfig(targetUrl, String(conn.url), matchingConfig);
                                const scenarioMatches = !mockScenario || !conn.scenario || String(mockScenario) === String(conn.scenario);
                                
                                if (urlMatches && scenarioMatches) {
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

    return server;
}

module.exports = {
    createSSEServer,
    getConnections,
    sendEventToConnection,
    sendEventToURL,
    sendEventToAll,
    findMockFile,
    startMock,
    matchUrlWithConfig
};


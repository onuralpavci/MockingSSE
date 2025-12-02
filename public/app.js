const API_BASE = 'http://localhost:8010/api';

let currentMock = null;
let autoRefreshInterval = null;

// Toast notification system
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const messageEl = document.createElement('div');
    messageEl.className = 'toast-message';
    messageEl.textContent = message;
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = () => removeToast(toast);
    
    toast.appendChild(messageEl);
    toast.appendChild(closeBtn);
    container.appendChild(toast);
    
    // Auto remove after duration
    if (duration > 0) {
        setTimeout(() => {
            removeToast(toast);
        }, duration);
    }
}

function removeToast(toast) {
    toast.classList.add('fade-out');
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 300);
}

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`${tab}Tab`).classList.add('active');
        
        if (tab === 'connections') {
            loadConnections();
            startAutoRefresh();
        } else {
            stopAutoRefresh();
        }
    });
});

// Load mocks
async function loadMocks() {
    try {
        const response = await fetch(`${API_BASE}/mocks`);
        const mocks = await response.json();
        renderMocksList(mocks);
        
        // Highlight active mock if editing
        if (currentMock && currentMock.id) {
            setTimeout(() => {
                const activeItem = document.querySelector(`.mock-item[data-id="${currentMock.id}"]`);
                if (activeItem) {
                    activeItem.classList.add('active');
                }
            }, 100);
        }
    } catch (error) {
        console.error('Error loading mocks:', error);
    }
}

function renderMocksList(mocks) {
    const container = document.getElementById('mocksList');
    if (mocks.length === 0) {
        container.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">No mocks found. Create a new one!</p>';
        return;
    }
    
    container.innerHTML = mocks.map(mock => `
        <div class="mock-item" data-id="${mock.id}">
            <div class="mock-item-content">
                <div class="mock-item-url">${truncateUrl(mock.url)}</div>
                <div class="mock-item-info">
                    ${mock.responses.length} timeline event(s) • ${mock.data.length} response(s)
                    ${mock.scenario ? ` • Scenario: <strong>${mock.scenario}</strong>` : ''}
                </div>
            </div>
        </div>
    `).join('');
    
    document.querySelectorAll('.mock-item').forEach(item => {
        item.addEventListener('click', (e) => {
            document.querySelectorAll('.mock-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            loadMock(item.dataset.id);
        });
    });
    
    // Highlight active mock if editing
    if (currentMock && currentMock.id) {
        const activeItem = document.querySelector(`.mock-item[data-id="${currentMock.id}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
        }
    }
}

function truncateUrl(url) {
    if (url.length > 50) {
        return url.substring(0, 47) + '...';
    }
    return url;
}

async function loadMock(id) {
    try {
        const response = await fetch(`${API_BASE}/mocks/${id}`);
        const mock = await response.json();
        currentMock = mock;
        
        // Update mock list to highlight active mock
        const mocksResponse = await fetch(`${API_BASE}/mocks`);
        const mocks = await mocksResponse.json();
        renderMocksList(mocks);
        
        openMockEditor(mock);
    } catch (error) {
        console.error('Error loading mock:', error);
        showToast('Error loading mock: ' + error.message, 'error');
    }
}

function openMockEditor(mock = null) {
    const editorPlaceholder = document.querySelector('.editor-placeholder');
    const editorContent = document.getElementById('mockEditorContent');
    const form = document.getElementById('mockForm');
    const title = document.getElementById('editorTitle');
    
    if (mock) {
        title.textContent = 'Edit Mock';
        document.getElementById('mockUrl').value = mock.url;
        document.getElementById('mockDomain').value = mock.domain || 'Dev';
        document.getElementById('mockScenario').value = mock.scenario || '';
        
        // Load matching configuration
        if (mock.matching) {
            document.getElementById('matchAllQueries').checked = mock.matching.matchAllQueries || false;
            document.getElementById('matchQueries').value = (mock.matching.matchQueries || []).join(', ');
        } else {
            document.getElementById('matchAllQueries').checked = false;
            document.getElementById('matchQueries').value = '';
        }
        
        // Load responses
        const responsesContainer = document.getElementById('responsesContainer');
        responsesContainer.innerHTML = '';
        mock.data.forEach((data, index) => {
            addResponseItem(JSON.stringify(data, null, 2), index);
        });
        
        // Load timeline
        const timelineContainer = document.getElementById('timelineContainer');
        timelineContainer.innerHTML = '';
        mock.responses.forEach((response, index) => {
            addTimelineItem(response.time, response.response, mock.data.length, index, response.statusCode || 200);
        });
        
        // Show delete and duplicate buttons
        document.getElementById('deleteMockBtn').style.display = 'inline-block';
        document.getElementById('duplicateMockBtn').style.display = 'inline-block';
    } else {
        title.textContent = 'New Mock';
        form.reset();
        document.getElementById('matchAllQueries').checked = false;
        document.getElementById('matchQueries').value = '';
        document.getElementById('mockScenario').value = '';
        document.getElementById('responsesContainer').innerHTML = `
            <div class="response-item">
                <div class="response-header">
                    <span class="response-index">Response 1</span>
                    <button type="button" class="btn-remove-response">Remove</button>
                </div>
                <textarea class="response-data" placeholder='{"key": "value"}' rows="4"></textarea>
            </div>
        `;
        document.getElementById('timelineContainer').innerHTML = `
            <div class="timeline-item">
                <div class="timeline-time">
                    <label>Time (ms)</label>
                    <input type="number" class="timeline-time-input" value="0" min="0" step="100">
                </div>
                <div class="timeline-response">
                    <label>Response</label>
                    <select class="timeline-response-select">
                        <option value="0">Response 1</option>
                    </select>
                </div>
                <div class="timeline-status">
                    <label>Status Code</label>
                    <select class="timeline-status-select">
                        <option value="200">200 OK</option>
                        <option value="201">201 Created</option>
                        <option value="400">400 Bad Request</option>
                        <option value="401">401 Unauthorized</option>
                        <option value="403">403 Forbidden</option>
                        <option value="404">404 Not Found</option>
                        <option value="500">500 Internal Server Error</option>
                        <option value="502">502 Bad Gateway</option>
                        <option value="503">503 Service Unavailable</option>
                    </select>
                </div>
                <button type="button" class="btn-remove-timeline">Remove</button>
            </div>
        `;
        
        // Hide delete and duplicate buttons for new mock
        document.getElementById('deleteMockBtn').style.display = 'none';
        document.getElementById('duplicateMockBtn').style.display = 'none';
    }
    
    attachEditorListeners();
    
    // Show editor content, hide placeholder
    editorPlaceholder.style.display = 'none';
    editorContent.style.display = 'block';
}

function attachEditorListeners() {
    // Add response button
    document.getElementById('addResponseBtn').onclick = () => {
        const container = document.getElementById('responsesContainer');
        const index = container.children.length + 1;
        addResponseItem('', index - 1);
        updateTimelineResponseOptions();
    };
    
    // Remove response buttons
    document.querySelectorAll('.btn-remove-response').forEach(btn => {
        btn.onclick = (e) => {
            e.target.closest('.response-item').remove();
            updateTimelineResponseOptions();
        };
    });
    
    // Add timeline button
    document.getElementById('addTimelineBtn').onclick = () => {
        const container = document.getElementById('timelineContainer');
        const responseCount = document.getElementById('responsesContainer').children.length;
        addTimelineItem(0, 0, responseCount, container.children.length, 200);
    };
    
    // Remove timeline buttons
    document.querySelectorAll('.btn-remove-timeline').forEach(btn => {
        btn.onclick = (e) => {
            e.target.closest('.timeline-item').remove();
        };
    });
}

function addResponseItem(data, index) {
    const container = document.getElementById('responsesContainer');
    const item = document.createElement('div');
    item.className = 'response-item';
    item.innerHTML = `
        <div class="response-header">
            <span class="response-index">Response ${index + 1}</span>
            <button type="button" class="btn-remove-response">Remove</button>
        </div>
        <textarea class="response-data" placeholder='{"key": "value"}' rows="4">${data}</textarea>
    `;
    container.appendChild(item);
    
    // Reattach listeners
    item.querySelector('.btn-remove-response').onclick = (e) => {
        e.target.closest('.response-item').remove();
        updateResponseIndices();
        updateTimelineResponseOptions();
    };
}

function addTimelineItem(time, responseIndex, responseCount, index, statusCode = 200) {
    const container = document.getElementById('timelineContainer');
    const item = document.createElement('div');
    item.className = 'timeline-item';
    
    const options = Array.from({ length: responseCount }, (_, i) => 
        `<option value="${i}" ${i === responseIndex ? 'selected' : ''}>Response ${i + 1}</option>`
    ).join('');
    
    const statusOptions = [
        { value: 200, label: '200 OK' },
        { value: 201, label: '201 Created' },
        { value: 400, label: '400 Bad Request' },
        { value: 401, label: '401 Unauthorized' },
        { value: 403, label: '403 Forbidden' },
        { value: 404, label: '404 Not Found' },
        { value: 500, label: '500 Internal Server Error' },
        { value: 502, label: '502 Bad Gateway' },
        { value: 503, label: '503 Service Unavailable' }
    ].map(opt => `<option value="${opt.value}" ${opt.value == statusCode ? 'selected' : ''}>${opt.label}</option>`).join('');
    
    item.innerHTML = `
        <div class="timeline-time">
            <label>Time (ms)</label>
            <input type="number" class="timeline-time-input" value="${time}" min="0" step="100">
        </div>
        <div class="timeline-response">
            <label>Response</label>
            <select class="timeline-response-select">
                ${options}
            </select>
        </div>
        <div class="timeline-status">
            <label>Status Code</label>
            <select class="timeline-status-select">
                ${statusOptions}
            </select>
        </div>
        <button type="button" class="btn-remove-timeline">Remove</button>
    `;
    container.appendChild(item);
    
    item.querySelector('.btn-remove-timeline').onclick = (e) => {
        e.target.closest('.timeline-item').remove();
    };
}

function updateResponseIndices() {
    document.querySelectorAll('.response-item').forEach((item, index) => {
        item.querySelector('.response-index').textContent = `Response ${index + 1}`;
    });
}

function updateTimelineResponseOptions() {
    const responseCount = document.getElementById('responsesContainer').children.length;
    document.querySelectorAll('.timeline-response-select').forEach(select => {
        const currentValue = select.value;
        select.innerHTML = Array.from({ length: responseCount }, (_, i) => 
            `<option value="${i}" ${i == currentValue ? 'selected' : ''}>Response ${i + 1}</option>`
        ).join('');
    });
}

// Form submission
document.getElementById('mockForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const url = document.getElementById('mockUrl').value;
    const domain = document.getElementById('mockDomain').value;
    const scenario = document.getElementById('mockScenario').value.trim() || null;
    
    // Collect matching configuration
    const matchAllQueries = document.getElementById('matchAllQueries').checked;
    const matchQueriesInput = document.getElementById('matchQueries').value.trim();
    const matchQueries = matchQueriesInput ? matchQueriesInput.split(',').map(q => q.trim()).filter(q => q) : [];
    
    const matching = (matchAllQueries || matchQueries.length > 0) ? {
        matchAllQueries: matchAllQueries,
        matchQueries: matchQueries
    } : null;
    
    // Collect responses
    const responses = [];
    document.querySelectorAll('.response-item').forEach((item, index) => {
        const data = item.querySelector('.response-data').value.trim();
        if (data) {
            try {
                JSON.parse(data); // Validate JSON
                responses.push(data);
            } catch (error) {
                showToast(`Invalid JSON in Response ${index + 1}`, 'error');
                throw error;
            }
        }
    });
    
    if (responses.length === 0) {
        showToast('At least one response is required', 'error');
        return;
    }
    
    // Collect timeline
    const timeline = [];
    document.querySelectorAll('.timeline-item').forEach(item => {
        const time = parseInt(item.querySelector('.timeline-time-input').value);
        const responseIndex = parseInt(item.querySelector('.timeline-response-select').value);
        const statusCode = parseInt(item.querySelector('.timeline-status-select').value);
        timeline.push({ time, response: responseIndex, statusCode });
    });
    
    if (timeline.length === 0) {
        showToast('At least one timeline event is required', 'error');
        return;
    }
    
    // Parse responses to JSON
    const parsedResponses = responses.map(r => JSON.parse(r));
    
    const mockData = {
        url,
        domain,
        scenario: scenario,
        matching: matching,
        responses: timeline,
        data: parsedResponses
    };
    
    try {
        let response;
        if (currentMock && currentMock.id) {
            response = await fetch(`${API_BASE}/mocks/${currentMock.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(mockData)
            });
        } else {
            response = await fetch(`${API_BASE}/mocks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(mockData)
            });
        }
        
        if (response.ok) {
            const savedMock = await response.json();
            currentMock = savedMock;
            await loadMocks();
            showToast('Mock saved successfully!', 'success');
        } else {
            const error = await response.json();
            showToast('Error saving mock: ' + (error.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        console.error('Error saving mock:', error);
        showToast('Error saving mock: ' + error.message, 'error');
    }
});

// Editor controls
document.getElementById('newMockBtn').addEventListener('click', () => {
    currentMock = null;
    openMockEditor();
});

document.getElementById('cancelBtn').addEventListener('click', () => {
    const editorPlaceholder = document.querySelector('.editor-placeholder');
    const editorContent = document.getElementById('mockEditorContent');
    editorPlaceholder.style.display = 'block';
    editorContent.style.display = 'none';
    currentMock = null;
});

// Delete mock button
document.getElementById('deleteMockBtn').addEventListener('click', () => {
    if (currentMock && currentMock.id) {
        deleteMock(currentMock.id, currentMock.domain || 'Dev');
    }
});

// Duplicate mock button
document.getElementById('duplicateMockBtn').addEventListener('click', () => {
    if (currentMock && currentMock.id) {
        openScenarioModal();
    }
});

// Scenario modal controls
document.getElementById('closeScenarioModal').addEventListener('click', closeScenarioModal);
document.getElementById('cancelScenarioBtn').addEventListener('click', closeScenarioModal);
document.getElementById('saveScenarioBtn').addEventListener('click', async () => {
    const newScenario = document.getElementById('newScenarioInput').value.trim();
    if (!newScenario) {
        showToast('Please enter a scenario name', 'error');
        return;
    }
    
    if (currentMock && currentMock.id) {
        await duplicateMockByScenario(currentMock, newScenario);
    }
});

// Close scenario modal on outside click
document.getElementById('scenarioModal').addEventListener('click', (e) => {
    if (e.target.id === 'scenarioModal') {
        closeScenarioModal();
    }
});

function openScenarioModal() {
    document.getElementById('scenarioModal').classList.add('active');
    document.getElementById('newScenarioInput').value = '';
    document.getElementById('newScenarioInput').focus();
}

function closeScenarioModal() {
    document.getElementById('scenarioModal').classList.remove('active');
    document.getElementById('newScenarioInput').value = '';
}

// Load connections
async function loadConnections() {
    try {
        const [connectionsResponse, mocksResponse] = await Promise.all([
            fetch(`${API_BASE}/connections`),
            fetch(`${API_BASE}/mocks`)
        ]);
        const connections = await connectionsResponse.json();
        const mocks = await mocksResponse.json();
        renderConnections(connections, mocks);
    } catch (error) {
        console.error('Error loading connections:', error);
    }
}

function renderConnections(connections, mocks) {
    const container = document.getElementById('connectionsList');
    if (connections.length === 0) {
        container.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">No active connections</p>';
        return;
    }
    
    container.innerHTML = connections.map(conn => {
        const createdAt = new Date(conn.createdAt);
        
        // Find matching mock for this connection URL and scenario
        const matchingMock = findMatchingMock(conn.url, conn.scenario, mocks);
        
        // Check if scenario matches (if both connection and mock have scenarios)
        const scenarioMatches = !conn.scenario || !matchingMock || !matchingMock.scenario || 
                                String(conn.scenario) === String(matchingMock.scenario);
        
        let actionButtons = '';
        if (matchingMock && scenarioMatches) {
            // Mock exists and scenario matches - show Edit Mock and Start Mock buttons
            actionButtons = `
                <button class="btn btn-primary" onclick="editMockForConnection('${matchingMock.id}')">Edit Mock</button>
                <button class="btn btn-success" onclick="startMockForConnection('${conn.id}', '${conn.url}')">Start Mock</button>
            `;
        } else if (!matchingMock) {
            // No mock - show Add Mock button
            actionButtons = `
                <button class="btn btn-primary" onclick="addMockForConnection('${conn.url}', '${conn.scenario || ''}')">Add Mock</button>
            `;
        }
        // If matchingMock exists but scenario doesn't match, don't show any buttons
        
        return `
            <div class="connection-item">
                <div class="connection-info">
                    <div class="connection-id">ID: ${conn.id}</div>
                    <div class="connection-url">${conn.url}</div>
                    ${conn.scenario ? `<div class="connection-scenario">Scenario: <strong>${conn.scenario}</strong></div>` : ''}
                    <div class="connection-time">Connected: ${createdAt.toLocaleString()}</div>
                </div>
                <div class="connection-actions">
                    ${actionButtons}
                </div>
            </div>
        `;
    }).join('');
}

function findMatchingMock(url, scenario, mocks) {
    for (const mock of mocks) {
        // Check URL match first
        let urlMatches = false;
        
        // Check exact match first
        if (mock.url === url) {
            urlMatches = true;
        } else {
            // Check with matching configuration
            const matchingConfig = mock.matching || null;
            if (matchUrlWithConfig(mock.url, url, matchingConfig)) {
                urlMatches = true;
            }
        }
        
        if (urlMatches) {
            // Check scenario match
            const mockScenario = mock.scenario || null;
            
            // If scenario is provided in connection, only match mocks with matching scenario
            if (scenario) {
                if (mockScenario && String(mockScenario) === String(scenario)) {
                    return mock;
                }
            } else {
                // If no scenario in connection, prefer mocks without scenario
                if (!mockScenario) {
                    return mock;
                }
            }
        }
    }
    return null;
}

async function startMockForConnection(connectionId, url) {
    try {
        // Get connection details to find scenario
        const connectionsResponse = await fetch(`${API_BASE}/connections`);
        const connections = await connectionsResponse.json();
        const connection = connections.find(c => c.id === connectionId);
        const scenario = connection ? connection.scenario : null;
        
        // Find mock for this URL and scenario using matching configuration
        const mocksResponse = await fetch(`${API_BASE}/mocks`);
        const mocks = await mocksResponse.json();
        const mock = findMatchingMock(url, scenario, mocks);
        
        if (!mock) {
            showToast('No mock found for this URL' + (scenario ? ` with scenario: ${scenario}` : ''), 'error');
            return;
        }
        
        const response = await fetch(`${API_BASE}/mocks/${mock.id}/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connectionId, url })
        });
        
        if (response.ok) {
            showToast('Mock started successfully!', 'success');
        } else {
            const error = await response.json();
            showToast('Error starting mock: ' + (error.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        console.error('Error starting mock:', error);
        showToast('Error starting mock: ' + error.message, 'error');
    }
}

function editMockForConnection(mockId) {
    // Switch to Mocks tab
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn.dataset.tab === 'mocks') {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        if (content.id === 'mocksTab') {
            content.classList.add('active');
        } else {
            content.classList.remove('active');
        }
    });
    
    // Load and open the mock in editor
    loadMock(mockId);
}

function addMockForConnection(url, scenario = '') {
    // Switch to Mocks tab
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn.dataset.tab === 'mocks') {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        if (content.id === 'mocksTab') {
            content.classList.add('active');
        } else {
            content.classList.remove('active');
        }
    });
    
    // Open new mock editor with URL and scenario pre-filled
    currentMock = null;
    openMockEditor();
    
    // Set the URL and scenario fields (scenario is default from connection)
    setTimeout(() => {
        document.getElementById('mockUrl').value = url;
        document.getElementById('mockScenario').value = scenario || '';
    }, 100);
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

function matchUrlByBase(mockUrl, targetUrl) {
    const mockBase = normalizeUrl(mockUrl);
    const targetBase = normalizeUrl(targetUrl);
    return mockBase === targetBase;
}

// Parse query parameters from URL
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

// Compare query parameters
function compareQueryParams(mockParams, targetParams, matchAllQueries, matchQueries) {
    if (matchAllQueries) {
        // All query parameters must match exactly
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
        // Only specified query parameters must match
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
    
    // No query matching required
    return true;
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

// Auto-refresh connections
function startAutoRefresh() {
    stopAutoRefresh();
    autoRefreshInterval = setInterval(loadConnections, 2000); // Refresh every 2 seconds
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
}

// Delete mock
async function deleteMock(mockId, domain = 'Dev') {
    if (!confirm('Are you sure you want to delete this mock?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/mocks/${mockId}?domain=${domain}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            // Clear current mock if it was deleted
            if (currentMock && currentMock.id === mockId) {
                currentMock = null;
                const editorPlaceholder = document.querySelector('.editor-placeholder');
                const editorContent = document.getElementById('mockEditorContent');
                editorPlaceholder.style.display = 'block';
                editorContent.style.display = 'none';
            }
            await loadMocks();
            showToast('Mock deleted successfully!', 'success');
        } else {
            const error = await response.json();
            showToast('Error deleting mock: ' + (error.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        console.error('Error deleting mock:', error);
        showToast('Error deleting mock: ' + error.message, 'error');
    }
}

// Duplicate mock by scenario
async function duplicateMockByScenario(mock, newScenario) {
    try {
        const url = mock.url;
        const domain = mock.domain || 'Dev';
        const scenario = newScenario;
        const matching = mock.matching || null;
        const responses = mock.responses || [];
        const data = mock.data || [];
        
        const mockData = {
            url,
            domain,
            scenario: scenario,
            matching: matching,
            responses: responses,
            data: data
        };
        
        const response = await fetch(`${API_BASE}/mocks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mockData)
        });
        
        if (response.ok) {
            const savedMock = await response.json();
            closeScenarioModal();
            await loadMocks();
            // Open the newly created mock in editor
            currentMock = null;
            await loadMock(savedMock.id);
            showToast('Mock duplicated successfully with new scenario!', 'success');
        } else {
            const error = await response.json();
            showToast('Error duplicating mock: ' + (error.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        console.error('Error duplicating mock:', error);
        showToast('Error duplicating mock: ' + error.message, 'error');
    }
}

// Refresh buttons
document.getElementById('refreshMocks').addEventListener('click', loadMocks);
document.getElementById('refreshConnections').addEventListener('click', loadConnections);

// Initial load
loadMocks();


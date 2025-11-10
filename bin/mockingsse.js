#!/usr/bin/env node

const os = require('os');
const path = require('path');

function expandPath(inputPath) {
    if (!inputPath) return inputPath;
    if (inputPath.startsWith('~/') || inputPath === '~') {
        return path.join(os.homedir(), inputPath.slice(1));
    }
    return inputPath;
}

function showHelp() {
    console.log(`
MockingSSE - SSE Mock Server with Web UI

Usage:
  mockingsse [options]

Options:
  -mp, --mockPath <path>   Set the mock folder path
  -h, --help              Show this help message

Examples:
  mockingsse
  mockingsse -mp ~/Documents/mocks
  mockingsse --mockPath /path/to/mocks

Default Behavior:
  - If -mp/--mockPath is provided, uses that path
  - If running as executable, uses ~/.mockingsse/mocks or executable directory
  - Otherwise, uses ./mocks in the project directory

The server will start:
  - SSE Server: http://localhost:8009
  - Web UI: http://localhost:8010
`);
    process.exit(0);
}

const args = process.argv.slice(2);
let mockPath = null;

for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '-h' || arg === '--help') {
        showHelp();
    } else if (arg === '-mp' || arg === '--mockPath') {
        if (i + 1 < args.length) {
            mockPath = args[i + 1];
            break;
        } else {
            console.error('Error: -mp/--mockPath requires a path argument');
            process.exit(1);
        }
    } else if (arg.startsWith('--mockPath=')) {
        mockPath = arg.split('=')[1];
        break;
    } else if (arg.startsWith('-mp=')) {
        mockPath = arg.split('=')[1];
        break;
    } else if (arg.startsWith('-')) {
        console.error(`Error: Unknown option: ${arg}`);
        console.error('Use -h or --help for usage information');
        process.exit(1);
    }
}

if (mockPath) {
    mockPath = expandPath(mockPath);
    process.env.MOCKINGSSE_FOLDER = mockPath;
}

require('../server.js');

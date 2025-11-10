#!/usr/bin/env node

/**
 * MockingSSE CLI Entry Point
 * This file is used as the entry point for the executable
 */

// Parse CLI arguments
const args = process.argv.slice(2);
let mockPath = null;

// Parse --mockPath argument
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--mockPath' && i + 1 < args.length) {
        mockPath = args[i + 1];
        break;
    } else if (args[i].startsWith('--mockPath=')) {
        mockPath = args[i].split('=')[1];
        break;
    }
}

// Set MOCKINGSTAR_FOLDER environment variable if --mockPath is provided
if (mockPath) {
    process.env.MOCKINGSTAR_FOLDER = mockPath;
}

// Always require server.js - pkg will resolve it correctly
require('../server.js');

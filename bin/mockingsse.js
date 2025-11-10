#!/usr/bin/env node

const args = process.argv.slice(2);
let mockPath = null;

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--mockPath' && i + 1 < args.length) {
        mockPath = args[i + 1];
        break;
    } else if (args[i].startsWith('--mockPath=')) {
        mockPath = args[i].split('=')[1];
        break;
    }
}

if (mockPath) {
    process.env.MOCKINGSSE_FOLDER = mockPath;
}

require('../server.js');

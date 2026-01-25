const fs = require('fs');
const path = require('path');

const DEV_FILE = 'Fitgirl_Repacks_Steam_Integration.dev.js';
const USER_FILE = 'Fitgirl_Repacks_Steam_Integration.user.js';

if (!fs.existsSync(DEV_FILE)) {
    console.error(`Error: ${DEV_FILE} not found.`);
    process.exit(1);
}

const content = fs.readFileSync(DEV_FILE, 'utf8');
const lines = content.split('\n');

let inMetadata = false;
let outputLines = [];

for (const line of lines) {
    const trimmed = line.trim();

    // Preserve Metadata Block
    if (trimmed.startsWith('// ==UserScript==')) {
        inMetadata = true;
        outputLines.push(line);
        continue;
    }
    if (trimmed.startsWith('// ==/UserScript==')) {
        // Inject extra metadata for the user/release version
        outputLines.push('// @downloadURL https://update.greasyfork.org/scripts/563941/Fitgirl%20Repacks%20-%20Steam%20Integration.user.js');
        outputLines.push('// @updateURL https://update.greasyfork.org/scripts/563941/Fitgirl%20Repacks%20-%20Steam%20Integration.meta.js');

        inMetadata = false;
        outputLines.push(line);
        continue;
    }

    if (inMetadata) {
        outputLines.push(line);
        continue;
    }

    // Logic for code body

    // 1. Remove console.log and custom 'log' calls
    if (trimmed.startsWith('console.log(') || trimmed.match(/console\.log\(.*\);?/)) {
        continue;
    }

    // Specific for this project: remove 'log(...)' calls and definition
    if (trimmed.startsWith('log(') || trimmed.match(/^log\(.*\);?$/)) {
        continue;
    }
    if (trimmed.startsWith('const log = (msg, ...args) =>')) {
        continue;
    }

    // Replace inline console.log if any
    let processedLine = line.replace(/console\.log\((?:[^)(]+|\((?:[^)(]+|\([^)(]*\))*\))*\);?/g, '');

    // 2. Remove comments 
    // Remove line comments //
    const commentRegex = /^\s*\/\//;
    if (commentRegex.test(processedLine)) {
        continue;
    }

    // Remove CSS comments /* ... */ and HTML comments <!-- ... -->
    processedLine = processedLine.replace(/\/\*.*?\*\//g, '');
    processedLine = processedLine.replace(/<!--.*?-->/g, '');

    if (processedLine.trim() === '') {
        continue;
    }

    outputLines.push(processedLine);
}

fs.writeFileSync(USER_FILE, outputLines.join('\n'));
console.log(`Successfully generated ${USER_FILE}`);

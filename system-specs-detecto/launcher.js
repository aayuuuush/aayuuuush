const { exec } = require('child_process');
const path = require('path');
const { Service } = require('node-windows');

const serviceName = 'Comsy System Specs Monitor';

function runAsApplication() {
    console.log('Running as standalone application...');
    require('./main.js');
}

function installAndStartService() {
    console.log('Attempting to install service...');
    
    // Get the correct path to main.js - works for both packaged and unpackaged
    const scriptPath = process.pkg ? 
        path.join(path.dirname(process.execPath), 'main.js') : 
        path.join(__dirname, 'main.js');

    const svc = new Service({
        name: serviceName,
        description: 'Monitors and reports system specifications for Comsy',
        script: scriptPath,
        nodeOptions: [
            '--max_old_space_size=4096',
            '--unhandled-rejections=strict'
        ]
    });

    svc.on('install', () => {
        console.log('Service installed successfully! Starting service...');
        svc.start();
    });

    svc.on('alreadyinstalled', () => {
        console.log('Service is already installed.');
        svc.start();
    });

    svc.on('start', () => {
        console.log('Service started successfully!');
        process.exit(0);
    });

    svc.on('error', (err) => {
        console.error('Service error:', err);
        runAsApplication();
    });

    svc.install();
}

// Main execution flow
function main() {
    // Check if running as administrator
    exec('net session', (adminError) => {
        if (adminError) {
            console.log('Not running as administrator - starting as application');
            runAsApplication();
            return;
        }

        console.log('Running with administrator privileges');
        
        // Check if we're running from a packaged EXE
        if (process.pkg) {
            console.log('Packaged executable detected - installing service');
            installAndStartService();
        } else {
            console.log('Running from source - starting as application');
            runAsApplication();
        }
    });
}

// Start the application
main();
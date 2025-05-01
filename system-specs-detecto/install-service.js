// install-service.js (unchanged)
const { Service } = require('node-windows');
const path = require('path');
const { exec } = require('child_process');

// Configure the service
const svc = new Service({
  name: 'Comsy System Specs Monitor',
  description: 'Background service to update computer specs in Comsy on port 4000',
  script: path.join(__dirname, 'main.js'),
  nodeOptions: [
    '--max_old_space_size=4096',
    '--unhandled-rejections=strict'
  ]
});

// Check if we're running from an EXE
const isPackaged = process.argv.some(arg => arg.includes('.exe'));

if (isPackaged) {
  // When running from EXE, install and start the service
  installAndStartService();
} else {
  // When running from command line, just install
  setupServiceEvents();
  svc.install();
}

function installAndStartService() {
  svc.on('install', () => {
    console.log('Service installed successfully! Starting service...');
    svc.start();
  });

  svc.on('alreadyinstalled', () => {
    console.log('Service is already installed. Starting service...');
    svc.start();
  });

  svc.on('start', () => {
    console.log('Service started successfully!');
    process.exit(0);
  });

  svc.on('error', (err) => {
    console.error('Service error:', err);
    process.exit(1);
  });

  svc.install();
}

function setupServiceEvents() {
  svc.on('install', () => {
    console.log('Service installed successfully!');
    svc.start();
  });

  svc.on('alreadyinstalled', () => {
    console.log('Service is already installed.');
  });

  svc.on('start', () => {
    console.log('Service started successfully!');
  });
}
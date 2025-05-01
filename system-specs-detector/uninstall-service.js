// uninstall-service.js
const { Service } = require('node-windows');
const path = require('path');

const svc = new Service({
  name: 'Comsy System Specs Monitor',
  script: path.join(__dirname, 'main.js')
});

svc.on('uninstall', () => {
  console.log('Service uninstalled successfully!');
  setTimeout(() => process.exit(), 1000);
});

svc.on('error', (err) => {
  console.error('Error uninstalling service:', err);
});

svc.on('alreadyuninstalled', () => {
  console.log('Service is already uninstalled.');
});

svc.uninstall();
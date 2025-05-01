const si = require('systeminformation');
const express = require('express');
const mongoose = require('mongoose');
const ping = require('ping');

// Configuration
const MONGO_URI = 'mongodb+srv://techspace:9011232879@cluster0.31ygm.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const BYTELAB_API = 'http://127.0.0.1:5000/api/computers';
const UPDATE_INTERVAL = 20 * 1000; // 20 seconds
const PING_TARGET = '8.8.8.8'; // Google DNS for ping testing

// Track USB devices for change detection
let lastUSBDevices = [];

async function detectConnectedDevices() {
    try {
        const usbDevices = await si.usb();
        // Add monitor detection for Windows
        let monitorConnected = true; // Default to true if detection fails
        
        if (process.platform === 'win32') {
            try {
                const monitors = await si.graphics();
                monitorConnected = monitors.displays.length > 0;
            } catch (error) {
                console.error('Monitor detection failed, defaulting to true:', error);
            }
        }

        // Update lastUSBDevices
        lastUSBDevices = usbDevices;

        return {
            keyboard: usbDevices.some(d => 
                d.name.toLowerCase().includes('keyboard') ||
                d.name.toLowerCase().includes('enhanced (101- or 102-key)') ||
                (d.type && d.type.toLowerCase() === 'keyboard')
            ),
            mouse: usbDevices.some(d => 
                d.name.toLowerCase().includes('mouse') ||
                d.name.toLowerCase().includes('input device') ||
                (d.type && d.type.toLowerCase() === 'mouse')
            ),
            monitor: monitorConnected, // Now dynamically detected on Windows
            headphone: usbDevices.some(d => 
                d.name.toLowerCase().includes('audio') ||
                d.name.toLowerCase().includes('headphone') ||
                d.name.toLowerCase().includes('headset')
            ),
            microphone: usbDevices.some(d => 
                d.name.toLowerCase().includes('microphone')
            ),
            pendrive: usbDevices.some(d => 
                d.name.toLowerCase().includes('flash') ||
                d.name.toLowerCase().includes('mass storage') ||
                (d.type && d.type.toLowerCase() === 'storage')
            )
        };
    } catch (error) {
        console.error('Device detection failed:', error);
        return {
            keyboard: false,
            mouse: false,
            monitor: true, // Fallback to true if detection fails
            headphone: false,
            microphone: false,
            pendrive: false
        };
    }
}

// Measure ping latency
async function measurePing() {
    try {
        const res = await ping.promise.probe(PING_TARGET, {
            timeout: 10,
            min_reply: 1,  // Wait for at least 1 reply
            extra: ['-n', '4'],  // Send 4 packets (like command line ping)
        });
        
        if (res.alive) {
            console.log('Ping results:', {
                avg: res.avg,
                min: res.min,
                max: res.max,
                packetLoss: res.packetLoss
            });
            return Math.round(res.avg);
        } else {
            console.log('Ping failed - target not reachable');
            return 0;
        }
    } catch (error) {
        console.error('Ping measurement failed:', error);
        return 0;
    }
}

// Express API
const registrationApi = express();
registrationApi.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});
registrationApi.use(express.json());

registrationApi.get('/api/specs', async (req, res) => {
    try {
        const [cpu, mem, os, network, disks, networkStats, pingResult] = await Promise.all([
            si.cpu(),
            si.mem(),
            si.osInfo(),
            si.networkInterfaces(),
            si.diskLayout(),
            si.networkStats(),
            measurePing()
        ]);

        const activeInterface = network.find(intf => intf.ip4 && !intf.internal) || network[0];
        const hardwareConnected = await detectConnectedDevices();

        res.json({
            cpu: `${cpu.manufacturer} ${cpu.brand} ${cpu.speed}GHz`,
            ram: `${(mem.total / 1024 ** 3).toFixed(1)}GB`,
            storage: disks.map(d => `${d.name} (${(d.size / 1024 ** 3).toFixed(1)}GB)`).join(', '),
            os: `${os.distro} ${os.release}`,
            network: activeInterface.iface,
            ipAddress: activeInterface.ip4,
            macAddress: activeInterface.mac,
            hardwareConnected,
            networkSpeed: {
                download: (networkStats[0]?.rx_sec || 0) / (1024 * 1024) * 8,
                upload: (networkStats[0]?.tx_sec || 0) / (1024 * 1024) * 8,
                ping: pingResult
            }
        });

    } catch (error) {
        console.error('Specs detection failed:', error);
        res.status(500).json({ error: 'Specs detection failed' });
    }
});

registrationApi.listen(4000, () => console.log('Registration API running on port 4000'));

// Background updater
async function updateSpecs() {
    try {
        console.log('Starting specs update...');
        
        const [network, cpu, mem, os, disks, networkStats, pingResult] = await Promise.all([
            si.networkInterfaces(),
            si.cpu(),
            si.mem(),
            si.osInfo(),
            si.diskLayout(),
            si.networkStats(),
            measurePing()
        ]);

        const activeInterface = network.find(intf => intf.ip4 && !intf.internal) || network[0];
        const currentMac = activeInterface.mac;
        const currentIp = activeInterface.ip4;
        const hardwareConnected = await detectConnectedDevices();

        console.log(`Current MAC: ${currentMac}, IP: ${currentIp}`);

        const updateData = {
            ipAddress: currentIp,
            specs: {
                cpu: `${cpu.manufacturer} ${cpu.brand} ${cpu.speed}GHz`,
                ram: `${(mem.total / 1024 ** 3).toFixed(1)}GB`,
                storage: disks.map(d => `${d.name} (${(d.size / 1024 ** 3).toFixed(1)}GB)`).join(', '),
                os: `${os.distro} ${os.release}`,
                network: activeInterface.iface,
                hardwareConnected
            },
            networkSpeed: {
                download: (networkStats[0]?.rx_sec || 0) / (1024 * 1024) * 8,
                upload: (networkStats[0]?.tx_sec || 0) / (1024 * 1024) * 8,
                ping: pingResult
            },
            lastUpdated: new Date()
        };

        const existingComputer = await mongoose.connection.db.collection('computers')
            .findOne({ macAddress: currentMac });

        if (existingComputer) {
            console.log(`Found existing computer: ${existingComputer.name || 'Unnamed'} (${existingComputer._id})`);
            
            const result = await mongoose.connection.db.collection('computers')
                .updateOne(
                    { _id: existingComputer._id },
                    { $set: updateData }
                );
            
            console.log(`Updated existing computer: ${result.modifiedCount} documents modified`);
        } else {
            console.log('No matching computer found in database. Will retry in 30 seconds.');
            return false;
        }

        return true;

    } catch (error) {
        console.error('Error during specs update:', error);
        return false;
    }
}

// Background updater with retry logic
async function startBackgroundUpdater() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('Successfully connected to MongoDB');

        async function updateWithRetry() {
            const updateSuccess = await updateSpecs();
            
            if (!updateSuccess) {
                console.log('Retrying update in 30 seconds...');
                setTimeout(updateWithRetry, 30 * 1000);
            } else {
                setTimeout(updateWithRetry, UPDATE_INTERVAL);
            }
        }

        // Initial update
        updateWithRetry();

    } catch (error) {
        console.error('Failed to start background updater:', error);
    }
}

// Start the application
startBackgroundUpdater();
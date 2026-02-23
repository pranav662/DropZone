const os = require('os');
function getNetworkIp() {
    const interfaces = os.networkInterfaces();
    let bestMatch = 'localhost';

    for (const name of Object.keys(interfaces)) {
        if (name.toLowerCase().includes('vmware') ||
            name.toLowerCase().includes('virtual') ||
            name.toLowerCase().includes('vbox') ||
            name.toLowerCase().includes('pseudo')) {
            continue;
        }

        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                if (name.toLowerCase().includes('wi-fi') || name.toLowerCase().includes('wifi') || name.toLowerCase().includes('wlan')) {
                    return iface.address;
                }
                bestMatch = iface.address;
            }
        }
    }
    return bestMatch;
}
console.log('Fixed Logic selects:', getNetworkIp());


const { exec } = require('child_process');

exec('netstat -ano | findstr :3000', (err, stdout, stderr) => {
    if (err) {
        console.log('No process found on port 3000 (or netstat error)');
        return;
    }
    const lines = stdout.trim().split('\n');
    const pids = new Set();
    lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid) && pid !== '0') {
            pids.add(pid);
        }
    });

    if (pids.size === 0) {
        console.log('No PIDs found on port 3000');
        return;
    }

    pids.forEach(pid => {
        console.log(`Killing PID: ${pid}`);
        exec(`taskkill /PID ${pid} /F`, (kErr, kOut, kErrOut) => {
            if (kErr) console.error(`Failed to kill ${pid}:`, kErr.message);
            else console.log(`Killed ${pid}`);
        });
    });
});

const { spawn } = require('child_process');
const concurrently = require('concurrently');
const fs = require('fs');
const path = require('path');

// Read .env.e2e file and set environment variables
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`Env file not found: ${filePath}`);
    return;
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    const equalIndex = trimmed.indexOf('=');
    if (equalIndex === -1) continue;
    
    const key = trimmed.substring(0, equalIndex).trim();
    let value = trimmed.substring(equalIndex + 1).trim();
    
    // Remove surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || 
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.substring(1, value.length - 1);
    }
    
    process.env[key] = value;
  }
}

// Load E2E environment variables
const envPath = path.join(__dirname, '../packages/server/.env.e2e');
loadEnvFile(envPath);

// Kill any existing processes on the ports before starting
function killPort(port) {
  try {
    const { execSync } = require('child_process');
    const pid = execSync(`lsof -t -i:${port} 2>/dev/null`, { encoding: 'utf8' }).trim();
    if (pid) {
      console.log(`Killing process ${pid} on port ${port}`);
      try { process.kill(Number(pid), 'SIGKILL'); } catch {}
    }
  } catch {}
}

killPort(3001);
killPort(5173);

const { result } = concurrently(
  [
    { name: 'server', command: 'npm run dev -w packages/server' },
    { name: 'client', command: 'npm run dev -w packages/client' },
  ],
  {
    prefix: 'none',
    killOthers: ['failure', 'success'],
  }
);

result.then(
  () => process.exit(0),
  () => process.exit(1)
);

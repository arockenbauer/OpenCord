import { spawn } from 'child_process';
import concurrently from 'concurrently';

// Kill any existing processes on the ports before starting
try {
  const { execSync } = require('child_process');
  try {
    const pid3001 = execSync('lsof -t -i:3001 2>/dev/null', { encoding: 'utf8' }).trim();
    if (pid3001) {
      console.log(`Killing process ${pid3001} on port 3001`);
      process.kill(Number(pid3001), 'SIGKILL');
    }
  } catch {}
  try {
    const pid5173 = execSync('lsof -t -i:5173 2>/dev/null', { encoding: 'utf8' }).trim();
    if (pid5173) {
      console.log(`Killing process ${pid5173} on port 5173`);
      process.kill(Number(pid5173), 'SIGKILL');
    }
  } catch {}
} catch {}

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

import { spawn } from 'child_process';
import concurrently from 'concurrently';

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

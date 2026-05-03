import { execSync } from 'child_process';

console.log('Installing dependencies for all packages...');
execSync('npm install', { stdio: 'inherit' });
console.log('Installation complete!');

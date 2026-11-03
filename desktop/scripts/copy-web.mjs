// Собирает веб-клиент и копирует его в desktop/app — оттуда его грузит Electron.
// Адрес сетевого сервера для релиза: VITE_SERVER_URL=wss://game.example.com npm run pack
import { execSync } from 'node:child_process';
import { cpSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const app = fileURLToPath(new URL('../app/', import.meta.url));
execSync('npm run build --workspace client', { cwd: root, stdio: 'inherit', env: { ...process.env, VITE_DESKTOP: '1' } });
if (existsSync(app)) rmSync(app, { recursive: true });
cpSync(`${root}client/dist`, app, { recursive: true });
console.log('Веб-клиент скопирован в desktop/app');

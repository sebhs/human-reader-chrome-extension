import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.mp3':'audio/mpeg','.svg':'image/svg+xml'};
http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url,'http://localhost');
    const relative = url.pathname === '/' ? 'popup.html' : decodeURIComponent(url.pathname.slice(1));
    const file = path.resolve(root, relative);
    if (!file.startsWith(root) || relative.includes('.git')) throw new Error('Not found');
    let content = await readFile(file);
    if (relative === 'popup.html') content = content.toString().replace('<script type="module" src="popup.js">','<script src="tests/browser-stub.js"></script><script type="module" src="popup.js">');
    response.writeHead(200, {'content-type':types[path.extname(file)] || 'application/octet-stream','cache-control':'no-store'});
    response.end(content);
  } catch {
    response.writeHead(404);response.end('Not found');
  }
}).listen(8766,'127.0.0.1',()=>console.log('Fixture preview at http://127.0.0.1:8766. No real credentials or paid API calls.'));

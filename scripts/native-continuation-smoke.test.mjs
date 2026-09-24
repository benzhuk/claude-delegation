import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createConnection } from 'node:net';
import test from 'node:test';
import { assertScenario, closeOwnedServer, runChild } from './native-continuation-smoke.mjs';

test('accounted scenario rejects quiet but inactive or unaccounted state', () => {
  assert.throws(() => assertScenario('accounted', { code: 0, signal: null }, {
    hooks: { PostToolUse: 1, Stop: 1 }, blocks: 0, requests: 1, accountRevision: null,
    finalPhase: 'unbound', bindingPresent: false, attempted: false, stateAccountedRevision: null,
  }), /successful visible account/);
});

test('timeout terminates the exact owned descendant tree', { skip: process.platform !== 'win32' }, async () => {
  let pid;
  const source = `const{spawn}=require('node:child_process');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});console.log(c.pid);setInterval(()=>{},1000);`;
  try {
    await assert.rejects(runChild(process.execPath, ['-e', source], {
      env: process.env, stdio: ['ignore', 'pipe', 'pipe'], onStdout(chunk) { pid = Number(String(chunk).trim()); },
    }, 300), /timeout/);
    assert.ok(pid);
    let alive = false; try { process.kill(pid, 0); alive = true; } catch {}
    assert.equal(alive, false);
  } finally { if (pid) try { process.kill(pid); } catch {} }
});

test('server shutdown deadline destroys only accepted owned sockets', async () => {
  const sockets = new Set(); const server = createServer(() => {});
  server.on('connection', (socket) => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const client = createConnection(server.address().port, '127.0.0.1');
  await new Promise((resolve, reject) => { client.once('connect', resolve); client.once('error', reject); });
  client.write('POST / HTTP/1.1\r\nHost: localhost\r\nContent-Length: 999999\r\n\r\n');
  const started = Date.now(); await closeOwnedServer(server, sockets, 100);
  await Promise.race([new Promise((resolve) => client.once('close', resolve)), new Promise((resolve) => setTimeout(resolve, 300))]);
  assert.ok(Date.now() - started < 1000); assert.equal(server.listening, false); assert.equal(client.destroyed, true);
});

const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { AIService, registerAIService, validateGlb, renderTemplate, MAX_MODEL_BYTES } = require('./ai-service.cjs');

function triangleGlb(extra = {}) {
  const document = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: 36 }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }], ...extra
  };
  const json = Buffer.from(JSON.stringify(document));
  const padding = (4 - json.length % 4) % 4;
  const jsonChunk = Buffer.concat([json, Buffer.alloc(padding, 32)]);
  const binary = Buffer.alloc(36);
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((value, index) => binary.writeFloatLE(value, index * 4));
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + jsonChunk.length + binary.length, 8);
  header.writeUInt32LE(jsonChunk.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binary.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonChunk, binHeader, binary]);
}

function secureStorageFixture() {
  const key = crypto.randomBytes(32);
  return {
    isEncryptionAvailable: () => true,
    encryptString(value) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const bytes = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), bytes]);
    },
    decryptString(value) {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, value.subarray(0, 12));
      decipher.setAuthTag(value.subarray(12, 28));
      return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString('utf8');
    }
  };
}

async function listen(server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

async function close(server) {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}

async function main() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'optical-ai-fixture-'));
  const model = triangleGlb();
  const malformed = Buffer.from(model);
  malformed.writeUInt32LE(model.length + 4, 8);
  const received = [];
  let polls = 0;
  let retryDownloads = 0;
  let throttlePolls = 0;
  let externalAuthorization;
  const external = http.createServer((request, response) => {
    externalAuthorization = request.headers.authorization;
    response.end(model);
  });
  const externalUrl = await listen(external);
  const fixture = http.createServer(async (request, response) => {
    let text = '';
    for await (const part of request) text += part;
    received.push({ path: request.url, auth: request.headers.authorization, body: text });
    const json = value => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(value)); };
    if (request.url === '/generate') return json({ task_id: 'task-1', status: 'queued' });
    if (request.url === '/tasks/task-1') {
      polls += 1;
      return json(polls === 1 ? { status: 'running', progress: 40 } : { status: 'completed', progress: 100, model_url: '/models/good.glb' });
    }
    if (request.url === '/sync') { response.setHeader('Content-Type', 'application/octet-stream'); return response.end(model); }
    if (request.url === '/sync-url') return json({ model_url: '/models/retry.glb' });
    if (request.url === '/models/retry.glb' && retryDownloads++ === 0) { response.statusCode = 503; return response.end(); }
    if (request.url === '/models/good.glb' || request.url === '/models/retry.glb') return response.end(model);
    if (request.url === '/failure') return json({ task_id: 'bad-1', status: 'failed', error: 'fixture-secret-old' });
    if (request.url === '/malformed') return json({ model_url: '/models/bad.glb' });
    if (request.url === '/models/bad.glb') return response.end(malformed);
    if (request.url === '/external') return json({ model_url: `${externalUrl}/model.glb` });
    if (request.url === '/redirect') return json({ model_url: '/models/redirect.glb' });
    if (request.url === '/models/redirect.glb') { response.statusCode = 302; response.setHeader('Location', `${externalUrl}/model.glb`); return response.end(); }
    if (request.url === '/oversize') { response.setHeader('Content-Length', MAX_MODEL_BYTES + 1); return response.end(); }
    if (request.url === '/disconnect') return request.socket.destroy();
    if (request.url === '/secret-echo') return json({ task_id: 'fixture-secret-old', status: 'queued' });
    if (request.url === '/throttle') return json({ task_id: 'slow-1', status: 'queued' });
    if (request.url === '/tasks/slow-1') {
      throttlePolls += 1;
      if (throttlePolls === 1) { response.statusCode = 429; response.setHeader('Retry-After', '1'); return response.end(); }
      return json({ status: 'completed', model_url: '/models/good.glb' });
    }
    if (request.url === '/cancel/task-1') return json({ status: 'cancelled' });
    response.statusCode = 404;
    response.end();
  });
  const baseUrl = await listen(fixture);
  const safeStorage = secureStorageFixture();
  try {
    const service = new AIService({ userDataPath: temporary, safeStorage });
    const defaults = await service.getConfig();
    assert.equal(defaults.baseUrl, '');
    assert.equal(received.length, 0, 'Reading configuration must not make a request.');
    await assert.rejects(service.createJob({ prompt: 'fixture triangle' }), error => error.code === 'SERVICE_NOT_CONFIGURED');
    await service.saveConfig({ baseUrl, token: 'fixture-secret-old', cancelPath: '/cancel/{id}' });
    assert.equal(received.length, 0, 'Saving configuration must not contact the service.');
    const config = await service.getConfig();
    assert.equal(config.hasToken, true);
    assert.equal(config.token, undefined);
    const job = await service.createJob({ prompt: 'fixture "triangle"\n{{other}}' });
    assert.equal(job.status, 'queued');
    assert.equal(received.at(-1).auth, 'Bearer fixture-secret-old');
    assert.equal(JSON.parse(received.at(-1).body).prompt, 'fixture "triangle"\n{{other}}');
    const concurrentPolls = await Promise.all([service.pollJob(job.id), service.pollJob(job.id)]);
    assert.equal(concurrentPolls[0].progress, 40);
    assert.equal(polls, 1, 'Concurrent polling must share one request.');

    await service.saveConfig({ ...config, token: 'fixture-secret-new' });
    const resumed = new AIService({ userDataPath: temporary, safeStorage });
    const ready = await resumed.pollJob(job.id);
    assert.equal(ready.status, 'ready');
    assert.equal(received.at(-1).auth, 'Bearer fixture-secret-old', 'Resumed jobs must use their original encrypted credential.');
    const downloaded = await resumed.getModel(job.id);
    assert.deepEqual(Buffer.from(downloaded.base64, 'base64'), model);
    assert.equal(downloaded.mimeType, 'model/gltf-binary');
    const afterReady = received.length;
    await resumed.pollJob(job.id);
    assert.equal(received.length, afterReady);

    async function createAt(route) {
      await resumed.saveConfig({ baseUrl, createPath: route, token: 'fixture-secret-old', cancelPath: '/cancel/{id}' });
      return resumed.createJob({ prompt: 'local HTTP fixture triangle' });
    }
    assert.equal((await createAt('/sync')).status, 'ready', 'Synchronous binary GLB must import.');
    const retry = await createAt('/sync-url');
    assert.equal(retry.status, 'failed');
    assert.equal(retry.error.retryable, true);
    assert.equal((await resumed.pollJob(retry.id)).status, 'ready', 'Download retry must reuse the saved URL.');
    assert.equal(received.filter(value => value.path === '/sync-url').length, 1);
    const failure = await createAt('/failure');
    assert.equal(failure.status, 'failed');
    assert.equal(failure.error.code, 'PROVIDER_TASK_FAILED');
    assert.equal(JSON.stringify(failure).includes('fixture-secret-old'), false);
    assert.equal((await createAt('/malformed')).error.code, 'INVALID_GLB');
    assert.equal((await createAt('/external')).status, 'ready');
    assert.equal(externalAuthorization, undefined, 'Credentials must not be sent to a different download origin.');
    assert.equal((await createAt('/redirect')).status, 'ready');
    assert.equal(externalAuthorization, undefined, 'Redirects must not forward a provider credential to another origin.');
    assert.equal((await createAt('/oversize')).error.code, 'RESPONSE_TOO_LARGE');
    const unknown = await createAt('/disconnect');
    assert.equal(unknown.status, 'submission_unknown');
    await resumed.pollJob(unknown.id);
    assert.equal(received.filter(value => value.path === '/disconnect').length, 1, 'Ambiguous create must never retry automatically.');
    assert.equal((await createAt('/secret-echo')).error.code, 'RESPONSE_SECRET_ECHO');
    const throttled = await createAt('/throttle');
    const waiting = await resumed.pollJob(throttled.id);
    assert.equal(waiting.error.code, 'HTTP_429');
    assert.ok(waiting.nextPollAt);
    await resumed.pollJob(throttled.id);
    assert.equal(throttlePolls, 1, 'Retry-After must suppress premature polling.');
    await new Promise(resolve => setTimeout(resolve, 1050));
    assert.equal((await resumed.pollJob(throttled.id)).status, 'ready');
    const cancel = await createAt('/generate');
    assert.equal((await resumed.cancelJob(cancel.id)).status, 'cancelled');

    validateGlb(model);
    assert.equal(MAX_MODEL_BYTES, 30_000_000);
    assert.throws(() => validateGlb(Buffer.alloc(MAX_MODEL_BYTES + 1)), error => error.code === 'INVALID_GLB');
    assert.throws(() => validateGlb(malformed), error => error.code === 'INVALID_GLB');
    assert.throws(() => validateGlb(triangleGlb({ images: [{ uri: 'https://example.invalid/texture.png' }] })), error => error.code === 'INVALID_GLB');
    const outOfRange = triangleGlb({ bufferViews: [{ buffer: 0, byteOffset: 32, byteLength: 36 }] });
    assert.throws(() => validateGlb(outOfRange), error => error.code === 'INVALID_GLB');
    assert.throws(() => validateGlb(triangleGlb({ buffers: [null] })), error => error.code === 'INVALID_GLB');
    assert.throws(() => validateGlb(triangleGlb({ meshes: [{ primitives: [] }] })), error => error.code === 'INVALID_GLB');
    assert.deepEqual(renderTemplate({ nested: ['{{prompt}}', '{{imageBase64}}'], bool: true }, { prompt: 'a"b', imageBase64: 'abc', imageDataUrl: '' }), { nested: ['a"b', 'abc'], bool: true });
    const state = await fs.readFile(path.join(temporary, 'ai-model-service', 'state.json'), 'utf8');
    assert.equal(state.includes('fixture-secret-old'), false);
    assert.equal(state.includes('fixture-secret-new'), false);
    assert.equal(JSON.stringify(await resumed.listJobs()).includes('encryptedCredential'), false);

    const handlers = new Map();
    registerAIService({ handle: (name, callback) => handlers.set(name, callback) }, { userDataPath: path.join(temporary, 'ipc'), safeStorage }, event => event.allowed);
    const denied = await handlers.get('optical-ai:getConfig')({ allowed: false });
    assert.equal(denied.error.code, 'SENDER_DENIED');
    const allowed = await handlers.get('optical-ai:getConfig')({ allowed: true });
    assert.equal(allowed.ok, true);
    assert.equal(allowed.data.hasToken, false);
    console.log('PASS local HTTP fixture: config, async create/poll/download, synchronous GLB, download retry, resume, failure, malformed/external-resource GLB, cross-origin credential isolation, secret redaction, ambiguous create, Retry-After, cancel and IPC access.');
  } finally {
    await close(fixture);
    await close(external);
    assert.equal(path.dirname(path.resolve(temporary)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temporary).startsWith('optical-ai-fixture-'));
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

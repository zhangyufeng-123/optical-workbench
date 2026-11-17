const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_MODEL_BYTES = 30_000_000;
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const DEFAULT_CONFIG = {
  baseUrl: '',
  createPath: '/generate',
  statusPath: '/tasks/{id}',
  cancelPath: '',
  tokenHeader: 'Authorization',
  tokenPrefix: 'Bearer ',
  requestTemplate: { prompt: '{{prompt}}', output_format: 'glb' },
  fieldPaths: { taskId: 'task_id', status: 'status', progress: 'progress', modelUrl: 'model_url', error: 'error' },
  successStatuses: ['succeeded', 'success', 'completed', 'done'],
  failedStatuses: ['failed', 'error', 'cancelled', 'canceled'],
  requestTimeoutMs: 60000
};

class AIServiceError extends Error {
  constructor(code, message, retryable = false) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

function fieldValue(object, fieldPath) {
  if (!fieldPath) return undefined;
  const parts = fieldPath.replace(/^\$\.?/, '').replace(/\[(\d+)\]/g, '.$1').split('.');
  let value = object;
  for (const part of parts) {
    if (!part || ['__proto__', 'constructor', 'prototype'].includes(part)) return undefined;
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, part)) return undefined;
    value = value[part];
  }
  return value;
}

function renderTemplate(value, variables) {
  if (typeof value === 'string') {
    return value.replace(/\{\{(prompt|imageDataUrl|imageBase64)\}\}/g, (_match, name) => variables[name]);
  }
  if (Array.isArray(value)) return value.map(item => renderTemplate(item, variables));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, renderTemplate(item, variables)]));
  }
  return value;
}

function containsCredential(value, token) {
  return Boolean(token && typeof value === 'string' && (value.includes(token) || value.includes(encodeURIComponent(token))));
}

function normalizeConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new AIServiceError('CONFIG_INVALID', '服务配置需要为 JSON 对象。');
  }
  const config = { ...DEFAULT_CONFIG };
  for (const key of ['baseUrl', 'createPath', 'statusPath', 'cancelPath', 'tokenHeader', 'tokenPrefix']) {
    if (input[key] !== undefined) {
      if (typeof input[key] !== 'string') throw new AIServiceError('CONFIG_INVALID', `配置 ${key} 需要为文本。`);
      config[key] = input[key];
    }
  }
  config.baseUrl = config.baseUrl.trim().replace(/\/+$/, '');
  if (config.baseUrl) {
    let url;
    try { url = new URL(config.baseUrl); } catch { throw new AIServiceError('CONFIG_INVALID', '服务地址格式无效。'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new AIServiceError('CONFIG_INVALID', '服务地址需要为 HTTP 或 HTTPS 地址，认证信息请填写到密钥栏。');
    }
  }
  for (const key of ['createPath', 'statusPath', 'cancelPath']) {
    if (config[key] && (/^[a-z][a-z\d+.-]*:/i.test(config[key]) || config[key].startsWith('//') || config[key].includes('\\'))) {
      throw new AIServiceError('CONFIG_INVALID', `${key} 需要填写服务地址下的相对路径。`);
    }
  }
  if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(config.tokenHeader) || /[\r\n]/.test(config.tokenPrefix)) {
    throw new AIServiceError('CONFIG_INVALID', '认证头名称或前缀格式无效。');
  }
  const template = input.requestTemplate === undefined ? DEFAULT_CONFIG.requestTemplate : input.requestTemplate;
  if (!template || typeof template !== 'object' || Array.isArray(template)) {
    throw new AIServiceError('CONFIG_INVALID', '请求模板需要为 JSON 对象。');
  }
  let templateText;
  try { templateText = JSON.stringify(template); } catch { throw new AIServiceError('CONFIG_INVALID', '请求模板无法保存。'); }
  if (templateText.length > 100000) throw new AIServiceError('CONFIG_INVALID', '请求模板超过 100000 字符。');
  config.requestTemplate = JSON.parse(templateText);
  config.fieldPaths = { ...DEFAULT_CONFIG.fieldPaths };
  if (input.fieldPaths !== undefined && (!input.fieldPaths || typeof input.fieldPaths !== 'object' || Array.isArray(input.fieldPaths))) {
    throw new AIServiceError('CONFIG_INVALID', '响应字段映射需要为 JSON 对象。');
  }
  for (const key of Object.keys(config.fieldPaths)) {
    if (input.fieldPaths?.[key] !== undefined) {
      if (typeof input.fieldPaths[key] !== 'string') throw new AIServiceError('CONFIG_INVALID', '响应字段路径需要为文本。');
      config.fieldPaths[key] = input.fieldPaths[key];
    }
  }
  for (const key of ['successStatuses', 'failedStatuses']) {
    const statuses = input[key] === undefined ? DEFAULT_CONFIG[key] : input[key];
    if (!Array.isArray(statuses) || statuses.some(value => typeof value !== 'string')) {
      throw new AIServiceError('CONFIG_INVALID', `${key} 需要为文本数组。`);
    }
    config[key] = statuses.map(value => value.toLowerCase());
  }
  const timeout = input.requestTimeoutMs ?? DEFAULT_CONFIG.requestTimeoutMs;
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 600000) {
    throw new AIServiceError('CONFIG_INVALID', '请求超时需要为 1000 至 600000 毫秒。');
  }
  config.requestTimeoutMs = timeout;
  return config;
}

function validateGlb(buffer) {
  const invalid = message => { throw new AIServiceError('INVALID_GLB', message); };
  if (!Buffer.isBuffer(buffer) || buffer.length < 20 || buffer.length > MAX_MODEL_BYTES) invalid('GLB 文件大小无效，最大支持 30 MB。');
  if (buffer.readUInt32LE(0) !== 0x46546c67 || buffer.readUInt32LE(4) !== 2) invalid('文件需要为 glTF 2.0 二进制 GLB。');
  if (buffer.readUInt32LE(8) !== buffer.length) invalid('GLB 声明长度与实际文件长度不一致。');
  let offset = 12;
  let document;
  let binLength = null;
  let chunkIndex = 0;
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) invalid('GLB 分块头不完整。');
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    offset += 8;
    if (length % 4 !== 0 || offset + length > buffer.length) invalid('GLB 分块长度无效。');
    if (chunkIndex === 0 && type !== 0x4e4f534a) invalid('GLB 首个分块需要为 JSON。');
    if (type === 0x4e4f534a) {
      if (document || chunkIndex !== 0) invalid('GLB 包含重复的 JSON 分块。');
      try { document = JSON.parse(buffer.toString('utf8', offset, offset + length)); } catch { invalid('GLB JSON 无法解析。'); }
    } else if (type === 0x004e4942) {
      if (binLength !== null) invalid('GLB 包含重复的 BIN 分块。');
      binLength = length;
    }
    offset += length;
    chunkIndex += 1;
  }
  if (!document || document.asset?.version !== '2.0' || !Array.isArray(document.meshes) || !document.meshes.length) {
    invalid('GLB 需要包含 glTF 2.0 网格数据。');
  }
  for (const mesh of document.meshes) {
    if (!mesh || !Array.isArray(mesh.primitives) || !mesh.primitives.length) invalid('GLB 网格缺少图元。');
    for (const primitive of mesh.primitives) {
      const positionIndex = primitive?.attributes?.POSITION;
      const accessor = Number.isSafeInteger(positionIndex) && document.accessors?.[positionIndex];
      if (!accessor || accessor.type !== 'VEC3' || !Number.isSafeInteger(accessor.count) || accessor.count < 1) {
        invalid('GLB 网格缺少有效的顶点位置。');
      }
    }
  }
  const pending = [document];
  while (pending.length) {
    const value = pending.pop();
    for (const [key, item] of Object.entries(value)) {
      if (key === 'uri' && (typeof item !== 'string' || !item.startsWith('data:'))) {
        invalid('GLB 引用了外部资源，请使用包含全部几何和纹理的自包含 GLB。');
      }
      if (item && typeof item === 'object') pending.push(item);
    }
  }
  const buffers = document.buffers || [];
  if (!Array.isArray(buffers)) invalid('GLB buffers 字段无效。');
  for (let index = 0; index < buffers.length; index += 1) {
    const item = buffers[index];
    if (!item || !Number.isSafeInteger(item.byteLength) || item.byteLength < 0) invalid('GLB 缓冲区长度无效。');
    if (!item.uri && (index !== 0 || binLength === null || item.byteLength > binLength || binLength - item.byteLength > 3)) {
      invalid('GLB BIN 数据与缓冲区声明不一致。');
    }
  }
  if (document.bufferViews !== undefined && !Array.isArray(document.bufferViews)) invalid('GLB bufferViews 字段无效。');
  for (const view of document.bufferViews || []) {
    if (!view || !Number.isSafeInteger(view.buffer)) invalid('GLB 缓冲区视图无效。');
    const bufferInfo = buffers[view.buffer];
    const start = view.byteOffset ?? 0;
    if (!bufferInfo || !Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(view.byteLength) || view.byteLength < 0 || start + view.byteLength > bufferInfo.byteLength) {
      invalid('GLB 缓冲区视图超出了数据范围。');
    }
  }
  return document;
}

async function atomicWrite(fileName, contents) {
  const temporary = `${fileName}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, contents, { mode: 0o600 });
    await fs.rename(temporary, fileName);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

class AIService {
  constructor({ userDataPath, safeStorage, fetchImpl = globalThis.fetch }) {
    this.directory = path.join(userDataPath, 'ai-model-service');
    this.modelDirectory = path.join(this.directory, 'models');
    this.stateFile = path.join(this.directory, 'state.json');
    this.safeStorage = safeStorage;
    this.fetch = fetchImpl;
    this.config = normalizeConfig(DEFAULT_CONFIG);
    this.encryptedCredential = null;
    this.jobs = new Map();
    this.activeJobs = new Map();
    this.saveChain = Promise.resolve();
    this.ready = this.load();
    this.ready.catch(() => {});
  }

  async load() {
    await fs.mkdir(this.modelDirectory, { recursive: true });
    let state;
    try { state = JSON.parse(await fs.readFile(this.stateFile, 'utf8')); } catch (error) {
      if (error.code === 'ENOENT') return;
      throw new AIServiceError('STORAGE_READ_FAILED', 'AI 服务配置文件读取失败，请检查本机用户数据目录。');
    }
    this.config = normalizeConfig(state.config);
    this.encryptedCredential = state.encryptedCredential || null;
    for (const job of state.jobs || []) {
      if (!job || typeof job.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(job.id)) continue;
      if (job.status === 'submitting') {
        job.status = 'submission_unknown';
        job.error = { code: 'SUBMISSION_UNKNOWN', message: '程序关闭时尚未收到任务编号，请到服务端核查后再创建任务。', retryable: false };
      }
      if (job.status === 'downloading') job.status = 'running';
      this.jobs.set(job.id, job);
    }
  }

  persist() {
    const contents = JSON.stringify({ version: 1, config: this.config, encryptedCredential: this.encryptedCredential, jobs: [...this.jobs.values()] });
    const save = this.saveChain.catch(() => {}).then(() => atomicWrite(this.stateFile, contents));
    this.saveChain = save;
    return save;
  }

  decrypt(credential) {
    if (!credential) return '';
    try {
      if (!this.safeStorage?.isEncryptionAvailable()) throw new Error();
      return this.safeStorage.decryptString(Buffer.from(credential, 'base64'));
    } catch {
      throw new AIServiceError('CREDENTIAL_UNAVAILABLE', '本机无法解密此任务的服务密钥，请在原系统账户中使用或重新配置服务。');
    }
  }

  publicJob(job) {
    return structuredClone({
      id: job.id, prompt: job.prompt, providerTaskId: job.providerTaskId, status: job.status,
      providerStatus: job.providerStatus, progress: job.progress, createdAt: job.createdAt,
      updatedAt: job.updatedAt, error: job.error, model: job.model,
      cancellationRequested: Boolean(job.cancellationRequested), canCancel: Boolean(job.config.cancelPath && job.providerTaskId),
      nextPollAt: job.nextPollAt || null
    });
  }

  jobById(id) {
    const job = this.jobs.get(id);
    if (!job) throw new AIServiceError('JOB_NOT_FOUND', '找不到这个 AI 建模任务。');
    return job;
  }

  async getConfig() {
    await this.ready;
    return structuredClone({ ...this.config, hasToken: Boolean(this.encryptedCredential) });
  }

  async saveConfig(input) {
    await this.ready;
    const config = normalizeConfig(input);
    let credential = this.encryptedCredential;
    if (input.clearToken) credential = null;
    if (input.token !== undefined && typeof input.token !== 'string') throw new AIServiceError('CONFIG_INVALID', '密钥需要为文本。');
    if (input.token) {
      if (!this.safeStorage?.isEncryptionAvailable()) throw new AIServiceError('ENCRYPTION_UNAVAILABLE', '系统安全存储当前不可用，服务密钥尚未保存。');
      credential = this.safeStorage.encryptString(input.token).toString('base64');
    }
    this.config = config;
    this.encryptedCredential = credential;
    await this.persist();
    return this.getConfig();
  }

  async listJobs() { await this.ready; return [...this.jobs.values()].reverse().map(job => this.publicJob(job)); }
  async getJob(id) { await this.ready; return this.publicJob(this.jobById(id)); }

  serviceUrl(config, route, taskId = '') {
    if (!config.baseUrl) throw new AIServiceError('SERVICE_NOT_CONFIGURED', '请先填写 AI 服务地址和 API 配置。');
    const suffix = route.replaceAll('{id}', encodeURIComponent(taskId));
    const url = new URL(`${config.baseUrl}/${suffix.replace(/^\/+/, '')}`);
    if (url.origin !== new URL(config.baseUrl).origin) throw new AIServiceError('CONFIG_INVALID', '服务接口路径超出了配置的地址。');
    return url;
  }

  async request(url, { config, credential, method = 'GET', body, allowRedirects = true, limit = MAX_MODEL_BYTES }) {
    const token = this.decrypt(credential);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
    const providerOrigin = new URL(config.baseUrl).origin;
    let target = new URL(url);
    try {
      for (let redirects = 0; redirects <= 5; redirects += 1) {
        if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) throw new AIServiceError('MODEL_URL_INVALID', '服务返回的下载地址格式无效。');
        if (target.origin !== providerOrigin && containsCredential(target.href, token)) throw new AIServiceError('RESPONSE_SECRET_ECHO', '下载重定向包含服务认证信息，已停止该下载。');
        const headers = { Accept: 'application/json, model/gltf-binary, application/octet-stream' };
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        if (token && target.origin === providerOrigin) headers[config.tokenHeader] = `${config.tokenPrefix}${token}`;
        const response = await this.fetch(target, { method, body, headers, signal: controller.signal, redirect: 'manual' });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          await response.body?.cancel();
          if (!allowRedirects) throw new AIServiceError('CREATE_REDIRECT', '创建接口返回重定向，请核对接口地址后再操作。');
          const location = response.headers.get('location');
          if (!location || redirects === 5) throw new AIServiceError('REDIRECT_FAILED', '模型下载重定向次数过多或缺少目标地址。', true);
          target = new URL(location, target);
          continue;
        }
        if (!response.ok) {
          await response.body?.cancel();
          const error = new AIServiceError(`HTTP_${response.status}`, `AI 服务返回 HTTP ${response.status}。${response.status === 429 ? '请按服务限流要求稍后重试。' : ''}`, response.status === 429 || response.status >= 500);
          const retryAfter = response.headers.get('retry-after');
          if (retryAfter) {
            const milliseconds = /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now();
            if (Number.isFinite(milliseconds) && milliseconds > 0) error.retryAfterMs = milliseconds;
          }
          throw error;
        }
        const declaredLength = Number(response.headers.get('content-length'));
        if (declaredLength > limit) { await response.body?.cancel(); throw new AIServiceError('RESPONSE_TOO_LARGE', '服务返回的文件超过 30 MB 导入上限。'); }
        const chunks = [];
        let size = 0;
        if (response.body) {
          for await (const chunk of response.body) {
            size += chunk.length;
            if (size > limit) { controller.abort(); throw new AIServiceError('RESPONSE_TOO_LARGE', '服务返回的文件超过 30 MB 导入上限。'); }
            chunks.push(Buffer.from(chunk));
          }
        }
        return { bytes: Buffer.concat(chunks, size), contentType: response.headers.get('content-type') || '', status: response.status };
      }
    } catch (error) {
      if (error instanceof AIServiceError) throw error;
      if (controller.signal.aborted) throw new AIServiceError('REQUEST_TIMEOUT', 'AI 服务请求超时，已有任务编号已保留，可继续查询。', true);
      throw new AIServiceError('NETWORK_ERROR', '无法连接 AI 服务，已有任务编号已保留，可稍后继续查询。', true);
    } finally {
      clearTimeout(timer);
    }
  }

  recordError(job, error, submission = false) {
    const known = error instanceof AIServiceError ? error : new AIServiceError('SERVICE_ERROR', 'AI 建模操作失败，请重试或检查服务配置。', true);
    job.status = submission && ['REQUEST_TIMEOUT', 'NETWORK_ERROR', 'CREATE_REDIRECT'].includes(known.code) ? 'submission_unknown' : 'failed';
    job.error = { code: known.code, message: known.message, retryable: job.status !== 'submission_unknown' && known.retryable };
    job.nextPollAt = known.retryAfterMs ? new Date(Date.now() + known.retryAfterMs).toISOString() : null;
    job.updatedAt = new Date().toISOString();
  }

  async createJob(input) {
    await this.ready;
    if (!input || typeof input.prompt !== 'string' || !input.prompt.trim()) throw new AIServiceError('PROMPT_REQUIRED', '请填写器件描述。');
    if (input.prompt.length > 100000) throw new AIServiceError('PROMPT_TOO_LONG', '器件描述过长。');
    const image = input.imageDataUrl || '';
    if (typeof image !== 'string' || image.length > 28 * 1024 * 1024 || (image && !/^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\r\n]+$/i.test(image))) {
      throw new AIServiceError('IMAGE_INVALID', '参考图需要为有效的 base64 图片，最大支持约 20 MB。');
    }
    const config = structuredClone(this.config);
    const url = this.serviceUrl(config, config.createPath);
    const now = new Date().toISOString();
    const job = {
      id: crypto.randomUUID(), prompt: input.prompt.trim(), providerTaskId: null, status: 'submitting',
      providerStatus: null, progress: null, createdAt: now, updatedAt: now, error: null, model: null,
      config, encryptedCredential: this.encryptedCredential
    };
    this.jobs.set(job.id, job);
    await this.persist();
    try {
      const body = JSON.stringify(renderTemplate(config.requestTemplate, { prompt: job.prompt, imageDataUrl: image, imageBase64: image.slice(image.indexOf(',') + 1) }));
      const response = await this.request(url, { config, credential: job.encryptedCredential, method: 'POST', body, allowRedirects: false });
      await this.applyResponse(job, response);
    } catch (error) { this.recordError(job, error, !job.providerTaskId && !job.resultUrl); }
    await this.persist();
    return this.publicJob(job);
  }

  async saveModel(job, bytes) {
    validateGlb(bytes);
    const fileName = `${job.id}.glb`;
    await atomicWrite(path.join(this.modelDirectory, fileName), bytes);
    job.model = { fileName, byteLength: bytes.length };
    job.status = 'ready';
    job.progress = 100;
    job.error = null;
  }

  async downloadModel(job, value) {
    if (typeof value !== 'string' || !value) throw new AIServiceError('MODEL_URL_MISSING', '任务已完成，但响应中缺少模型下载地址，请核对字段映射。', true);
    let url;
    try { url = new URL(value, `${job.config.baseUrl}/`); } catch { throw new AIServiceError('MODEL_URL_INVALID', '服务返回的模型地址无效。'); }
    job.resultUrl = url.href;
    job.status = 'downloading';
    await this.persist();
    const response = await this.request(url, { config: job.config, credential: job.encryptedCredential });
    await this.saveModel(job, response.bytes);
  }

  async applyResponse(job, response) {
    job.updatedAt = new Date().toISOString();
    if (response.bytes.length >= 4 && response.bytes.readUInt32LE(0) === 0x46546c67) {
      await this.saveModel(job, response.bytes);
      return;
    }
    if (response.bytes.length > MAX_JSON_BYTES) throw new AIServiceError('INVALID_RESPONSE', '服务返回的 JSON 响应过大，请检查接口输出格式。');
    let data;
    try { data = JSON.parse(response.bytes.toString('utf8')); } catch { throw new AIServiceError('INVALID_RESPONSE', '服务响应需要为 JSON 或 GLB 文件。'); }
    const fields = job.config.fieldPaths;
    const taskId = fieldValue(data, fields.taskId);
    const state = fieldValue(data, fields.status);
    const modelUrl = fieldValue(data, fields.modelUrl);
    const token = this.decrypt(job.encryptedCredential);
    if ([taskId, state, modelUrl].some(value => containsCredential(value, token))) {
      throw new AIServiceError('RESPONSE_SECRET_ECHO', '服务响应包含认证信息，已停止保存该响应，请核对响应字段映射。');
    }
    if (typeof taskId === 'string' || typeof taskId === 'number') job.providerTaskId = String(taskId);
    job.providerStatus = state === undefined || state === null ? null : String(state).slice(0, 200);
    const normalized = (job.providerStatus || '').toLowerCase();
    const progress = fieldValue(data, fields.progress);
    job.progress = typeof progress === 'number' && Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : null;
    job.error = null;
    job.nextPollAt = null;
    if (job.config.failedStatuses.includes(normalized)) {
      job.status = ['cancelled', 'canceled'].includes(normalized) ? 'cancelled' : 'failed';
      job.error = { code: 'PROVIDER_TASK_FAILED', message: 'AI 服务报告任务失败，请在服务端查看详情或检查输入。', retryable: false };
      return;
    }
    if (job.config.successStatuses.includes(normalized) || (!job.providerTaskId && typeof modelUrl === 'string')) {
      await this.downloadModel(job, modelUrl);
      return;
    }
    if (!job.providerTaskId) throw new AIServiceError('TASK_ID_MISSING', '创建响应缺少任务编号和模型地址，请核对服务端记录及字段映射后再创建任务。');
    job.status = ['queued', 'pending', 'waiting'].includes(normalized) || !normalized ? 'queued' : 'running';
  }

  async pollJob(id) {
    await this.ready;
    if (this.activeJobs.has(id)) return this.activeJobs.get(id);
    const operation = this.pollJobOnce(id);
    this.activeJobs.set(id, operation);
    try { return await operation; } finally { this.activeJobs.delete(id); }
  }

  async pollJobOnce(id) {
    const job = this.jobById(id);
    if (['ready', 'cancelled', 'submission_unknown', 'submitting'].includes(job.status) || (job.status === 'failed' && !job.error?.retryable)) return this.publicJob(job);
    if (job.nextPollAt && Date.parse(job.nextPollAt) > Date.now()) return this.publicJob(job);
    try {
      if (job.resultUrl) {
        await this.downloadModel(job, job.resultUrl);
      } else {
        if (!job.providerTaskId) throw new AIServiceError('TASK_ID_MISSING', '此任务没有服务端编号，请到服务端核查。');
        const url = this.serviceUrl(job.config, job.config.statusPath, job.providerTaskId);
        const response = await this.request(url, { config: job.config, credential: job.encryptedCredential });
        await this.applyResponse(job, response);
      }
    } catch (error) { this.recordError(job, error); }
    await this.persist();
    return this.publicJob(job);
  }

  async getModel(id) {
    await this.ready;
    const job = this.jobById(id);
    if (job.status !== 'ready' || !job.model) throw new AIServiceError('MODEL_NOT_READY', '这个任务的模型尚未就绪。');
    let bytes;
    try { bytes = await fs.readFile(path.join(this.modelDirectory, `${job.id}.glb`)); } catch { throw new AIServiceError('MODEL_FILE_MISSING', '本地模型文件不存在，请检查模型缓存。'); }
    validateGlb(bytes);
    return { base64: bytes.toString('base64'), fileName: job.model.fileName, mimeType: 'model/gltf-binary', byteLength: bytes.length };
  }

  async cancelJob(id) {
    await this.ready;
    if (this.activeJobs.has(id)) await this.activeJobs.get(id);
    const operation = this.cancelJobOnce(id);
    this.activeJobs.set(id, operation);
    try { return await operation; } finally { this.activeJobs.delete(id); }
  }

  async cancelJobOnce(id) {
    const job = this.jobById(id);
    if (['ready', 'failed', 'cancelled'].includes(job.status)) return this.publicJob(job);
    if (!job.config.cancelPath || !job.providerTaskId) throw new AIServiceError('CANCEL_UNSUPPORTED', '当前服务尚未配置取消接口，任务编号会保留以便继续查询。');
    try {
      const response = await this.request(this.serviceUrl(job.config, job.config.cancelPath, job.providerTaskId), { config: job.config, credential: job.encryptedCredential, method: 'POST', allowRedirects: false });
      job.cancellationRequested = true;
      job.updatedAt = new Date().toISOString();
      if (response.bytes.length) await this.applyResponse(job, response);
    } catch (error) {
      this.recordError(job, error);
    }
    await this.persist();
    return this.publicJob(job);
  }
}

function registerAIService(ipcMain, options, isAllowedSender) {
  const service = new AIService(options);
  const methods = ['getConfig', 'saveConfig', 'listJobs', 'createJob', 'getJob', 'pollJob', 'getModel', 'cancelJob'];
  for (const method of methods) {
    ipcMain.handle(`optical-ai:${method}`, async (event, argument) => {
      if (!isAllowedSender(event)) return { ok: false, error: { code: 'SENDER_DENIED', message: '此页面无法访问 AI 建模服务。', retryable: false } };
      try { return { ok: true, data: await service[method](argument) }; } catch (error) {
        const known = error instanceof AIServiceError ? error : new AIServiceError('SERVICE_ERROR', 'AI 服务操作失败，请检查本机配置或稍后重试。', true);
        return { ok: false, error: { code: known.code, message: known.message, retryable: known.retryable } };
      }
    });
  }
  return service;
}

module.exports = { AIService, AIServiceError, registerAIService, validateGlb, normalizeConfig, renderTemplate, DEFAULT_CONFIG, MAX_MODEL_BYTES };

import {createAIModelPreview} from './ai-model-preview.js';

const DEFAULT_CONFIG={baseUrl:'',createPath:'/generate',statusPath:'/tasks/{id}',cancelPath:'',tokenHeader:'Authorization',tokenPrefix:'Bearer ',requestTemplate:{prompt:'{{prompt}}',output_format:'glb'},fieldPaths:{taskId:'task_id',status:'status',progress:'progress',modelUrl:'model_url',error:'error'},successStatuses:['succeeded','success','completed','done'],failedStatuses:['failed','error','cancelled','canceled'],requestTimeoutMs:60000,hasToken:false};
const ADVANCED_FIELDS=['tokenHeader','tokenPrefix','requestTemplate','fieldPaths','successStatuses','failedStatuses','requestTimeoutMs'];
const STATUS_LABELS={submitting:'正在提交',queued:'排队中',running:'生成中',downloading:'下载模型中',ready:'模型已就绪',failed:'任务失败',cancelled:'已取消',submission_unknown:'提交结果待核查'};
const ACTIVE=new Set(['submitting','queued','running','downloading']);
const formatBytes=bytes=>bytes>=1024*1024?(bytes/1024/1024).toFixed(1)+' MB':Math.ceil(bytes/1024)+' KB';
const formatLength=value=>value.toLocaleString('zh-CN',{maximumSignificantDigits:8,useGrouping:false});
const formatDate=value=>{const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'';};

export function installAIStudio(api={}){
  if(!api.mount?.append)throw new Error('AI 建模缺少右侧挂载面板');
  const bridge=api.bridge||window.opticalAI,panel=document.createElement('section');panel.className='ai-studio';panel.setAttribute('aria-label','AI建模');
  panel.innerHTML=`<div class="ai-studio-heading"><h3>AI建模</h3><button type="button" data-ai="settings">服务设置</button></div>
  <p class="ai-service-status" data-ai="service-status" role="status">正在读取服务配置…</p>
  <label class="ai-field">器件描述<textarea data-ai-field="prompt" rows="5" maxlength="100000" placeholder="描述器件外形、部件、材质与朝向"></textarea></label>
  <div class="ai-reference-row"><label class="ai-file-button">添加参考图片<input data-ai-field="image" type="file" accept="image/png,image/jpeg,image/webp"></label><button type="button" data-ai="clear-image" hidden>移除图片</button></div>
  <div class="ai-reference" data-ai="reference" hidden><img data-ai="reference-image" alt="待提交的参考图片"><span data-ai="reference-name"></span></div>
  <div class="ai-submit-row"><button type="button" class="primary" data-ai="create">生成 GLB</button><button type="button" data-ai="pause">暂停自动查询</button></div>
  <p class="ai-message" data-ai="message" role="status" aria-live="polite"></p>
  <div class="ai-history-heading"><h4>任务记录</h4><button type="button" data-ai="refresh">刷新</button></div>
  <select class="ai-history" data-ai-field="jobs" aria-label="选择建模任务"><option value="">暂无任务</option></select>
  <section class="ai-job" data-ai="job" hidden><div class="ai-job-status"><strong data-ai="job-status"></strong><span data-ai="progress-text"></span></div><progress data-ai="progress" max="100" hidden></progress><p class="ai-job-provider" data-ai="provider"></p><p class="ai-job-error" data-ai="job-error" hidden></p><div class="ai-job-actions"><button type="button" data-ai="query">查询此任务</button><button type="button" data-ai="cancel" hidden>取消任务</button></div></section>
  <section class="ai-result" data-ai="result" hidden><div class="ai-preview" data-ai="preview"><p data-ai="preview-note">正在读取 GLB…</p></div><div class="ai-model-info"><span data-ai="model-info"></span><button type="button" data-ai="refit">复位预览</button></div><p class="ai-preview-error" data-ai="preview-error" hidden></p><button type="button" data-ai="retry-preview" hidden>重新加载预览</button><label class="ai-field">器件名称<input data-ai-field="name" type="text" maxlength="100"></label><div class="ai-calibration"><label class="ai-field">最长边 / mm<input data-ai-field="longest" type="number" min="8" max="1600" step="any" value="160"></label><label class="ai-field">正面旋转 / °<input data-ai-field="rotation" type="number" min="-360" max="360" step="1" value="0"></label></div><p class="ai-calibration-note" data-ai="size-range">最长边支持 8–1600 mm。加入后可在器件属性中设置光纤端口。</p><div class="ai-result-actions"><button type="button" data-ai="save-model">保存 GLB</button><button type="button" class="primary" data-ai="add">加入实验台</button></div></section>`;
  api.mount.append(panel);
  const dialog=document.createElement('dialog');dialog.className='ai-settings-dialog';dialog.setAttribute('aria-label','AI 建模服务设置');
  dialog.innerHTML=`<form method="dialog"><header class="ai-settings-heading"><div><h2>AI 建模服务</h2><p>按现有服务的 API 文档填写。</p></div><button type="button" data-ai-config="close" aria-label="关闭服务设置">关闭</button></header><div class="ai-settings-body"><label class="ai-field">服务地址<input data-ai-config="baseUrl" type="url" placeholder="https://your-service.example/api" autocomplete="url"></label><div class="ai-settings-grid"><label class="ai-field">创建任务路径<input data-ai-config="createPath" type="text"></label><label class="ai-field">查询任务路径<input data-ai-config="statusPath" type="text"></label></div><label class="ai-field">取消任务路径（可留空）<input data-ai-config="cancelPath" type="text"></label><label class="ai-field">API 密钥<input data-ai-config="token" type="password" autocomplete="new-password"></label><label class="ai-clear-token"><input data-ai-config="clearToken" type="checkbox">清除已保存的密钥</label><details class="ai-advanced"><summary>请求正文、响应字段与高级设置</summary><p>正文支持 {{prompt}}、{{imageDataUrl}} 和 {{imageBase64}}。响应字段使用点路径，任务路径使用 {id}。</p><textarea data-ai-config="advanced" rows="17" spellcheck="false" aria-label="高级服务配置 JSON"></textarea></details><p class="ai-settings-status" data-ai-config="status" role="status" aria-live="polite"></p></div><footer class="ai-settings-footer"><button type="button" data-ai-config="save" class="primary">保存设置</button></footer></form>`;
  document.body.append(dialog);
  const q=name=>panel.querySelector(`[data-ai="${name}"]`),field=name=>panel.querySelector(`[data-ai-field="${name}"]`),configField=name=>dialog.querySelector(`[data-ai-config="${name}"]`);
  let config=structuredClone(DEFAULT_CONFIG),jobs=[],selectedId='',destroyed=false,paused=false,polling=false,timer=null,creating=false,savingConfig=false,modelBusy=false,adding=false,querying=false;
  let imageDataUrl='',imageReadVersion=0,imageReading=false,preview=null,modelFile=null,modelMetrics=null,modelJobId='',previewAttemptId='',selectionVersion=0;
  let sizeLimits={min:8,max:1600,base:160};
  const current=()=>jobs.find(job=>job.id===selectedId)||null;
  // A synchronous result URL is retained privately by the desktop backend.
  // Manual retry always reuses pollJob and never resubmits generation.
  const canQuery=job=>!!job&&!['ready','cancelled','submission_unknown','submitting'].includes(job.status)&&(job.status==='failed'?job.error?.retryable===true:!!job.providerTaskId);
  function message(text,error=false){q('message').textContent=text;q('message').classList.toggle('is-error',error);}
  async function call(method,...args){
    if(!bridge||typeof bridge[method]!=='function')throw new Error('当前页面缺少桌面 AI 服务桥，请从桌面版打开 AI 建模。');
    const result=await bridge[method](...args);
    if(!result?.ok){const error=new Error(result?.error?.message||'AI 服务未返回有效结果');Object.assign(error,result?.error||{});throw error;}
    return result.data;
  }
  function upsert(job){
    if(!job?.id)return;const index=jobs.findIndex(entry=>entry.id===job.id);
    if(index<0)jobs.unshift(job);else if(Date.parse(job.updatedAt)>=Date.parse(jobs[index].updatedAt))jobs[index]=job;
  }
  function controls(){
    const job=current(),configured=!!config.baseUrl.trim();
    q('create').disabled=!bridge||!configured||creating||imageReading||!field('prompt').value.trim();q('create').textContent=creating?'正在提交…':'生成 GLB';
    q('settings').disabled=creating;q('refresh').disabled=!bridge||querying;q('pause').disabled=!bridge;q('pause').textContent=paused?'继续自动查询':'暂停自动查询';q('pause').setAttribute('aria-pressed',String(paused));
    q('query').disabled=!canQuery(job)||querying||polling;q('cancel').hidden=!job?.canCancel||!ACTIVE.has(job?.status)||job?.cancellationRequested===true;q('cancel').disabled=querying||polling;
    q('add').disabled=!modelFile||modelBusy||adding||typeof api.importModel!=='function';q('add').textContent=adding?'正在加入…':'加入实验台';q('save-model').disabled=!modelFile||modelBusy;q('refit').disabled=!modelMetrics;
    field('jobs').disabled=creating||!jobs.length;
  }
  function renderService(){
    q('service-status').textContent=!bridge?'当前为浏览器页面。请从桌面版使用 AI 建模。':config.baseUrl?`已配置 ${config.baseUrl} · ${config.hasToken?'已保存密钥':'未设置密钥'}`:'尚未配置生成服务，请先打开服务设置。';
    q('service-status').classList.toggle('is-configured',!!bridge&&!!config.baseUrl);controls();
  }
  function renderJobs(){
    const select=field('jobs');select.replaceChildren();
    for(const job of jobs){const option=document.createElement('option');option.value=job.id;option.textContent=`${formatDate(job.createdAt)} · ${STATUS_LABELS[job.status]||job.status} · ${(job.prompt||job.id).slice(0,38)}`;select.append(option);}
    if(!jobs.length){const option=document.createElement('option');option.value='';option.textContent='暂无任务';select.append(option);}
    select.value=selectedId;renderCurrent();
  }
  function renderCurrent(){
    const job=current();q('job').hidden=!job;q('result').hidden=job?.status!=='ready';
    if(job){
      q('job-status').textContent=STATUS_LABELS[job.status]||job.status;
      const progress=Number.isFinite(job.progress)?Math.max(0,Math.min(100,job.progress)):null;
      q('progress').hidden=progress===null;q('progress-text').textContent=progress===null?'':Math.round(progress)+'%';if(progress!==null)q('progress').value=progress;
      q('provider').textContent=[job.providerTaskId?'服务任务 '+job.providerTaskId:'',job.providerStatus?'服务状态 '+job.providerStatus:'',job.cancellationRequested?'已请求服务端取消':''].filter(Boolean).join(' · ');
      q('job-error').hidden=!job.error;q('job-error').textContent=job.error?.message||'';
      if(job.status==='ready'&&previewAttemptId!==job.id)void loadSelectedModel();
    }
    controls();
  }
  function releaseModel(){
    selectionVersion++;previewAttemptId='';modelFile=null;modelMetrics=null;modelJobId='';modelBusy=false;preview?.clear();q('preview-note').hidden=false;q('preview-note').textContent='正在读取 GLB…';q('preview-error').hidden=true;q('retry-preview').hidden=true;q('model-info').textContent='';
    setSizeLimits(160);
  }
  function setSizeLimits(base){
    sizeLimits={min:base*.05,max:base*10,base};field('longest').min=String(sizeLimits.min);field('longest').max=String(sizeLimits.max);
    q('size-range').textContent=`最长边支持 ${formatLength(sizeLimits.min)}–${formatLength(sizeLimits.max)} mm。加入后可在器件属性中设置光纤端口。`;
  }
  function selectJob(id){
    if(selectedId===id){renderCurrent();return;}
    selectedId=id;releaseModel();field('longest').value='160';field('rotation').value='0';field('name').value=(current()?.prompt||'AI 生成器件').split('\n')[0].slice(0,100);field('jobs').value=id;renderCurrent();
  }
  function calibration(requireName=true){
    const longestMM=Number(field('longest').value),rotation=Number(field('rotation').value),label=field('name').value.trim();
    if(requireName&&!label)throw new Error('请填写器件名称');
    if(!Number.isFinite(longestMM)||longestMM<sizeLimits.min||longestMM>sizeLimits.max)throw new Error(`最长边需要在 ${formatLength(sizeLimits.min)}–${formatLength(sizeLimits.max)} mm 之间`);
    if(!Number.isFinite(rotation)||rotation< -360||rotation>360)throw new Error('正面旋转需要在 -360° 到 360° 之间');
    return {label,longestMM,rotation};
  }
  async function loadSelectedModel(force=false){
    const job=current();if(!job||job.status!=='ready'||modelBusy||(!force&&previewAttemptId===job.id))return;
    const version=selectionVersion,id=job.id;previewAttemptId=id;modelBusy=true;q('preview-note').hidden=false;q('preview-note').textContent='正在读取 GLB…';q('preview-error').hidden=true;q('retry-preview').hidden=true;controls();
    try{
      const payload=await call('getModel',id);if(destroyed||version!==selectionVersion)return;
      const raw=atob(payload.base64),bytes=new Uint8Array(raw.length);for(let index=0;index<raw.length;index++)bytes[index]=raw.charCodeAt(index);
      modelFile=new File([bytes],payload.fileName||'AI生成器件.glb',{type:payload.mimeType||'model/gltf-binary'});modelJobId=id;q('model-info').textContent=formatBytes(modelFile.size);
      if(!preview)preview=createAIModelPreview(q('preview'));
      const nextMetrics=await preview.load(bytes.buffer);if(destroyed||version!==selectionVersion)return;
      setSizeLimits(Number.isFinite(nextMetrics.importLongestMM)&&nextMetrics.importLongestMM>0?nextMetrics.importLongestMM:160);
      const chosenLength=Number(field('longest').value);if(!Number.isFinite(chosenLength)||chosenLength<sizeLimits.min||chosenLength>sizeLimits.max)field('longest').value=String(sizeLimits.base);
      preview.calibrate(calibration(false),true);modelMetrics=nextMetrics;q('preview-note').hidden=true;q('model-info').textContent=`${formatBytes(modelFile.size)} · ${nextMetrics.triangles.toLocaleString()} 三角面 · ${nextMetrics.textures} 贴图`;
    }catch(error){
      if(!destroyed&&version===selectionVersion){q('preview-note').hidden=true;q('preview-error').hidden=false;q('preview-error').textContent='三维预览未完成：'+error.message;q('retry-preview').hidden=false;}
    }finally{if(!destroyed&&version===selectionVersion){modelBusy=false;controls();}}
  }
  async function refresh(){
    if(destroyed||!bridge)return [];
    const version=selectedId;
    try{
      const next=await call('listJobs');if(destroyed)return [];
      for(const job of Array.isArray(next)?next:[])upsert(job);
      jobs.sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
      if(!jobs.some(job=>job.id===selectedId))selectJob(jobs[0]?.id||'');
      else if(!version&&jobs.length)selectJob(jobs[0].id);
      renderJobs();schedule();return jobs;
    }catch(error){if(!destroyed)message(error.message,true);return [];}
  }
  function schedule(){
    if(timer!==null)clearTimeout(timer);timer=null;
    if(destroyed||paused||polling||!bridge||!jobs.some(job=>ACTIVE.has(job.status)&&canQuery(job)))return;
    timer=setTimeout(()=>{timer=null;void pollActive();},4000);
  }
  async function pollActive(){
    if(destroyed||paused||polling)return;polling=true;controls();
    try{
      const pending=jobs.filter(job=>ACTIVE.has(job.status)&&canQuery(job));
      for(const job of pending){
        if(destroyed||paused)break;
        try{const next=await call('pollJob',job.id);if(destroyed)break;upsert(next);renderJobs();}
        catch(error){if(!destroyed)message(error.message,true);}
      }
    }finally{polling=false;if(!destroyed){controls();schedule();}}
  }
  async function querySelected(cancel=false){
    if(querying||destroyed)return;const job=current();if(!job)return;querying=true;controls();
    try{const next=await call(cancel?'cancelJob':'pollJob',job.id);if(destroyed)return;upsert(next);renderJobs();message(cancel?(next.status==='cancelled'?'服务端已确认取消。':'取消请求已提交，任务状态将继续查询。'):'任务状态已更新。');}
    catch(error){if(!destroyed)message(error.message,true);}
    finally{querying=false;if(!destroyed){controls();schedule();}}
  }
  function pause(){paused=true;if(timer!==null)clearTimeout(timer);timer=null;controls();message('自动查询已暂停，任务记录已保留。');}
  function resume(){paused=false;controls();message('已继续自动查询。');schedule();}
  async function create(){
    if(creating||destroyed||imageReading)return null;
    if(!config.baseUrl){message('请先填写生成服务地址。',true);openSettings();return null;}
    const prompt=field('prompt').value.trim();if(!prompt){message('请填写器件描述。',true);return null;}
    if(imageDataUrl&&!/\{\{image(?:DataUrl|Base64)\}\}/.test(JSON.stringify(config.requestTemplate))){message('当前请求正文尚未包含参考图片字段。请在高级设置中按服务文档加入 {{imageDataUrl}} 或 {{imageBase64}}。',true);openSettings();return null;}
    creating=true;controls();message('正在向已配置服务提交器件描述'+(imageDataUrl?'和参考图片':'')+'…');
    try{
      const job=await call('createJob',{prompt,...(imageDataUrl?{imageDataUrl}:{})});if(destroyed)return null;
      upsert(job);selectJob(job.id);renderJobs();message(job.error?.message||'任务已记录。',!!job.error);schedule();return job;
    }catch(error){if(!destroyed){message(error.message,true);await refresh();}return null;}
    finally{creating=false;if(!destroyed)controls();}
  }
  function writeConfig(){
    for(const name of ['baseUrl','createPath','statusPath','cancelPath'])configField(name).value=config[name]||'';
    configField('token').value='';configField('token').placeholder=config.hasToken?'已保存密钥，留空保留':'按服务要求填写';configField('clearToken').checked=false;configField('clearToken').disabled=!config.hasToken;
    configField('advanced').value=JSON.stringify(Object.fromEntries(ADVANCED_FIELDS.map(name=>[name,config[name]])),null,2);configField('status').textContent=!bridge?'当前页面缺少桌面 AI 服务桥。':'';configField('save').disabled=!bridge;
  }
  function openSettings(){writeConfig();if(!dialog.open)dialog.showModal();}
  async function saveConfig(){
    if(savingConfig)return;savingConfig=true;configField('save').disabled=true;
    try{
      const advanced=JSON.parse(configField('advanced').value);
      if(!advanced||typeof advanced!=='object'||Array.isArray(advanced)||Object.keys(advanced).some(name=>!ADVANCED_FIELDS.includes(name)))throw new Error('高级配置需要为有效 JSON 对象，并使用列出的配置字段');
      const input={...Object.fromEntries(['baseUrl','createPath','statusPath','cancelPath'].map(name=>[name,configField(name).value.trim()])),...advanced};
      const token=configField('token').value;if(token)input.token=token;if(configField('clearToken').checked)input.clearToken=true;
      const next=await call('saveConfig',input);if(destroyed)return;config={...structuredClone(DEFAULT_CONFIG),...next};configField('token').value='';writeConfig();renderService();message('服务配置已保存。');dialog.close();schedule();
    }catch(error){if(!destroyed)configField('status').textContent=error.message;}
    finally{savingConfig=false;if(!destroyed)configField('save').disabled=!bridge;}
  }
  async function addToBench(){
    if(!modelFile||adding||modelBusy||typeof api.importModel!=='function')return null;
    const job=current();if(!job||job.id!==modelJobId)return null;
    let options;try{options=calibration();}catch(error){message(error.message,true);return null;}
    adding=true;controls();
    try{
      const id=await api.importModel(modelFile,{...options,aiSource:{jobId:job.id,providerTaskId:job.providerTaskId,prompt:job.prompt,createdAt:job.createdAt}});
      if(!destroyed){message(id?'器件已加入实验台，可在属性中设置光纤端口。':'模型尚未加入实验台。',!id);if(id)api.toast?.('AI 器件已加入实验台');}return id;
    }catch(error){if(!destroyed)message('加入实验台失败：'+error.message,true);return null;}
    finally{adding=false;if(!destroyed)controls();}
  }
  function saveModel(){if(!modelFile||modelBusy)return;try{api.download?.(modelFile,(field('name').value.trim()||'AI生成器件').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')+'.glb','model/gltf-binary');}catch(error){message('保存 GLB 失败：'+error.message,true);}}
  function clearImage(){imageReadVersion++;imageReading=false;imageDataUrl='';field('image').value='';q('reference').hidden=true;q('reference-image').removeAttribute('src');q('reference-name').textContent='';q('clear-image').hidden=true;controls();}
  async function readImage(){
    const file=field('image').files?.[0],version=++imageReadVersion;if(!file){clearImage();return;}imageDataUrl='';imageReading=true;q('reference').hidden=true;q('clear-image').hidden=true;controls();message('正在读取参考图片…');
    try{
      if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('参考图支持 PNG、JPEG 和 WebP');if(file.size>20*1024*1024)throw new Error('参考图片超过 20 MB');
      const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('图片读取失败'));reader.readAsDataURL(file);});
      if(destroyed||version!==imageReadVersion)return;imageDataUrl=data;q('reference-image').src=data;q('reference-name').textContent=file.name+' · '+formatBytes(file.size);q('reference').hidden=false;q('clear-image').hidden=false;message('参考图片已选，将随下次生成请求提交。');
    }catch(error){if(!destroyed&&version===imageReadVersion){clearImage();message(error.message,true);}}
    finally{if(!destroyed&&version===imageReadVersion){imageReading=false;controls();}}
  }
  q('settings').onclick=openSettings;q('create').onclick=()=>void create();q('pause').onclick=()=>paused?resume():pause();q('refresh').onclick=()=>void refresh();q('query').onclick=()=>void querySelected();q('cancel').onclick=()=>void querySelected(true);
  q('clear-image').onclick=clearImage;field('image').onchange=()=>void readImage();field('jobs').onchange=()=>selectJob(field('jobs').value);field('prompt').oninput=controls;q('save-model').onclick=saveModel;q('add').onclick=()=>void addToBench();q('refit').onclick=()=>preview?.fit();q('retry-preview').onclick=()=>void loadSelectedModel(true);
  for(const name of ['longest','rotation'])field(name).addEventListener('change',()=>{if(!modelMetrics)return;try{preview?.calibrate(calibration(false),true);message('预览尺寸和朝向已更新。');}catch(error){message(error.message,true);}});
  configField('close').onclick=()=>{if(!savingConfig){configField('token').value='';dialog.close();}};configField('save').onclick=()=>void saveConfig();dialog.addEventListener('cancel',event=>{if(savingConfig)event.preventDefault();else configField('token').value='';});dialog.addEventListener('close',()=>{configField('token').value='';});dialog.addEventListener('keydown',event=>event.stopPropagation());dialog.querySelector('form').addEventListener('submit',event=>event.preventDefault());panel.addEventListener('keydown',event=>event.stopPropagation());
  const ready=(async()=>{
    renderService();if(!bridge)return;
    try{const next=await call('getConfig');if(destroyed)return;config={...structuredClone(DEFAULT_CONFIG),...next};renderService();await refresh();}catch(error){if(!destroyed)message(error.message,true);}
  })();
  function open(){if(destroyed)return;api.showPanel?.();preview?.resize();void ready.then(()=>refresh());}
  return {open,refresh,setPrompt(text){if(typeof text!=='string')throw new Error('器件描述需要为文本');field('prompt').value=text.slice(0,100000);controls();open();field('prompt').focus();},openSettings,getCurrentJob:()=>current()?structuredClone(current()):null,getState:()=>({configured:!!config.baseUrl,hasToken:config.hasToken,jobs:structuredClone(jobs),selectedId,paused,creating,modelLoaded:!!modelFile,previewReady:!!modelMetrics}),ready,destroy(){
    if(destroyed)return;destroyed=true;selectionVersion++;imageReadVersion++;if(timer!==null)clearTimeout(timer);preview?.destroy();preview=null;modelFile=null;imageDataUrl='';configField('token').value='';dialog.remove();panel.remove();
  }};
}

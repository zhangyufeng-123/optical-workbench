import {searchScore} from './device-search.js';
const ACTIONS = [
  ['save','保存工程','文件','保存 备份 json save','Ctrl+S'],
  ['load','打开工程','文件','读取 导入 json open'],
  ['undo','撤销','编辑','后退 undo','Ctrl+Z'],
  ['redo','重做','编辑','前进 redo','Ctrl+Y'],
  ['openPaletteStudio','一键配色','绘图','颜色 色板 光束 主题 palette'],
  ['autoLayout','一键排版','布局','自动 连接关系 拓扑 主链 分支 走线 自动排版 auto layout'],
  ['connectionLogic','输入连接关系','布局','文字 链路 生成 器件 端口 分支 连接逻辑 topology'],
  ['openComposition','展示构图','视图','推荐 最佳 角度 主视 俯视 侧视 居中 摆放 composition camera'],
  ['typographyStudio','字体与字号','绘图','中文 英文 宋体 黑体 楷体 字体 字号 标注 font typography'],
  ['qualityStudio','材质与光照','绘图','质感 玻璃 通透 金属 磨砂 光束 柔光 曝光 quality material'],
  ['renderNow','论文渲染','出图','图片 高清 自动画面 render nature'],
  ['precisionTools','精确变换与阵列','绘图','整组 平移 旋转 复制 阵列 精确 transform array'],
  ['sceneTools','对象与选择集','选择','场景 搜索 筛选 锁定 隐藏 选择集 链路'],
  ['drawingTools','样式与子装配','绘图','复制样式 粘贴样式 编号 子装配 复用'],
  ['editBoardSize','调整台面尺寸','视图','桌子 实验台 大小 宽度 深度 长宽 缩小 放大 table board size'],
  ['resetAppearance','恢复实验台','视图','白底 返回 灰色 桌子 背景 恢复'],
  ['benchMode','实验搭建视图','视图','实验桌 桌面 灰色'],
  ['studioMode','白底预览','视图','白背景 论文 白底刊图'],
  ['journalMode','论文排图','出图','面板 拼图 标注 origin svg 字体'],
  ['image','快速 PNG','出图','截图 图片 导出 png'],
  ['export','导出三维模型','出图','glb blender 模型 三维'],
  ['bomExport','导出器件清单','出图','csv bom 清单 物料'],
  ['layoutCheck','检查光路布局','绘图','光轴 对准 重叠 台面 检查'],
  ['selectAll','选择全部可见器件','选择','全选 all'],
  ['move','选择与移动','绘图','拖动 移动 选择'],
  ['cancelConnection','取消本次连接','绘图','取消 退出 连线 escape cancel'],
  ['assemblyTools','组合器件与立杆','绘图','组合 支撑 立杆 抬高 自定义 高度 assembly post'],
  ['expandBoard','扩展实验台','视图','台面 尺寸 扩大 加宽 加长 扩展 board'],
  ['connect','连接光路','绘图','光束 光纤 端口 连线 connect'],
  ['alignX','按 X 中心对齐','布局','对齐 x align'],
  ['alignZ','按 Z 中心对齐','布局','对齐 z align'],
  ['distributeX','沿 X 等距分布','布局','横向 分布 间距 distribute'],
  ['distributeZ','沿 Z 等距分布','布局','纵向 分布 间距 distribute'],
  ['top','俯视','视图','顶视 top'],
  ['view3d','三维视角','视图','透视 立体 perspective'],
  ['fit','显示完整实验台','视图','复位 视角 fit'],
  ['renameScene','重命名工程','文件','标题 名称 rename'],
  ['import','导入自有模型','器件','glb 自定义 模型 import'],
  ['symbols','浏览光纤符号库','器件','二维 符号 svg'],
  ['help','使用说明','帮助','快捷键 教程 help']
];
const normalized=value=>String(value??'').toLocaleLowerCase().normalize('NFKC').trim();

export function filterCommands(entries,query='',limit=30){
  const terms=normalized(query).split(/\s+/).filter(Boolean);
  return entries.map((entry,index)=>{
    const label=normalized(entry.label),haystack=normalized([entry.label,entry.group,entry.keywords,entry.shortcut].join(' '));
    if(searchScore(haystack,query)<0)return null;
    const score=terms.length?(label===normalized(query)?100:label.startsWith(normalized(query))?60:terms.every(term=>label.includes(term))?30:10):0;
    return {entry,index,score};
  }).filter(Boolean).sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,limit).map(({entry})=>entry);
}

export function commandEntries(api,query=''){
  const state=api.getState(),selection=new Set(api.getSelection()),movable=state.items.filter(item=>selection.has(item.id)&&!item.locked).length;
  const entries=ACTIONS.map(([id,label,group,keywords,shortcut])=>{
    const button=api.getButton(id),minimum=id.startsWith('distribute')?3:id.startsWith('align')?2:0;
    const reason=!button?'此功能尚未就绪':minimum&&movable<minimum?`需选择至少 ${minimum} 个未锁定器件`:button.disabled?'当前没有可执行的操作':'';
    return {id,label,group,keywords,shortcut,disabled:!!reason,reason,run:()=>button.click()};
  });
  entries.splice(18,0,
    {id:'focusSelection',label:'聚焦所选器件',group:'视图',keywords:'放大 focus',shortcut:'F',disabled:!selection.size,reason:'请先选择器件',run:api.focusSelected},
    {id:'selectConnected',label:'选择相连链路',group:'选择',keywords:'连接 链路 拓扑 connected',disabled:!selection.size&&!api.getSelectedEdge(),reason:'请先选择器件或连接',run:()=>api.getSceneTools().selectConnected()},
    {id:'focusCanvas',label:'切换专注画布',group:'视图',keywords:'隐藏侧栏 最大画布 恢复侧栏 focus',run:()=>api.getShell().setFocusMode()},
    {id:'openSettings',label:'台面、模板与视角设置',group:'视图',keywords:'尺寸 孔距 模板 视角 设置 settings',run:()=>api.getShell().showInspector('settings')}
  );
  if(normalized(query))for(const definition of api.getCatalog())entries.push({id:'add:'+definition.id,label:'添加 '+definition.name,group:'器件',keywords:[definition.name,definition.id,definition.code,definition.category,definition.aliases||''].join(' '),disabled:state.items.length>=250,reason:'已达到 250 个器件的上限',run:()=>api.add(definition.id)});
  return entries;
}

export function installCommandPalette(api){
  const dialog=document.createElement('dialog');dialog.id='commandDialog';dialog.className='command-dialog';dialog.setAttribute('aria-label','搜索命令与器件');
  dialog.innerHTML='<div class="command-search-row"><input id="commandSearch" type="search" placeholder="搜索工具、器件或操作…" aria-label="搜索工具、器件或操作" autocomplete="off" role="combobox" aria-controls="commandResults" aria-expanded="true" aria-autocomplete="list"><button type="button" data-command-close aria-label="关闭命令搜索" title="关闭 · Esc">Esc</button></div><div id="commandResults" class="command-results" role="listbox" aria-label="命令结果"></div><footer><span data-command-status role="status" aria-live="polite"></span><span>↑ ↓ 选择　Enter 执行</span></footer>';
  document.body.append(dialog);
  const input=dialog.querySelector('#commandSearch'),list=dialog.querySelector('#commandResults'),status=dialog.querySelector('[data-command-status]');
  let matches=[],active=0,previousFocus=null;
  const context={...api,getButton:id=>document.getElementById(id)};
  function highlight(){
    for(const [index,button] of [...list.children].entries()){button.classList.toggle('command-current',index===active);button.setAttribute('aria-selected',String(index===active));}
    if(matches.length){input.setAttribute('aria-activedescendant','command-result-'+active);list.children[active]?.scrollIntoView?.({block:'nearest'});}else input.removeAttribute('aria-activedescendant');
  }
  function render(){
    matches=filterCommands(commandEntries(context,input.value),input.value);active=0;list.replaceChildren();
    for(const [index,entry] of matches.entries()){
      const button=document.createElement('button');button.type='button';button.id='command-result-'+index;button.className='command-result';button.tabIndex=-1;button.setAttribute('role','option');button.setAttribute('aria-disabled',String(!!entry.disabled));
      const group=document.createElement('span');group.className='command-group';group.textContent=entry.group;
      const label=document.createElement('span');label.className='command-label';label.textContent=entry.label;
      const detail=document.createElement('span');detail.className='command-shortcut';detail.textContent=entry.disabled?entry.reason:entry.shortcut||'';
      button.append(group,label,detail);button.onclick=()=>execute(index);list.append(button);
    }
    status.textContent=matches.length?`${matches.length} 项结果`:'没有匹配项，试试“透镜”“配色”或“阵列”。';highlight();
  }
  function close(){dialog.close();previousFocus?.focus?.();}
  async function execute(index=active){
    const entry=matches[index];if(!entry)return;
    if(entry.disabled){status.textContent=entry.reason;return;}
    close();try{await entry.run();}catch(error){api.toast('操作未完成：'+error.message);}
  }
  function open(query=''){if(document.querySelector('dialog[open]')&&!dialog.open)return;previousFocus=document.activeElement;input.value=query;render();if(!dialog.open)dialog.showModal();input.focus();input.select();}
  input.addEventListener('input',render);dialog.querySelector('[data-command-close]').onclick=close;
  dialog.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();active=matches.length?(active+(event.key==='ArrowDown'?1:-1)+matches.length)%matches.length:0;highlight();}else if(event.key==='Enter'){event.preventDefault();execute();}else if(event.key==='Escape'){event.preventDefault();close();}});
  const shortcut=event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'&&!event.altKey){if(document.querySelector('dialog[open]')&&!dialog.open)return;event.preventDefault();dialog.open?close():open();}};
  document.addEventListener('keydown',shortcut);
  return {open,close,refresh:()=>{if(dialog.open)render();},execute,getResults:()=>matches.map(({run,...entry})=>entry),destroy:()=>{document.removeEventListener('keydown',shortcut);dialog.remove();}};
}

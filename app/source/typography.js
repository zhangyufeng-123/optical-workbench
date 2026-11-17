// System-font choices only: no network downloads or embedded font licenses.
const choices=entries=>Object.freeze(entries.map(([id,label])=>Object.freeze({id,label})));
export const CHINESE_FONTS=choices([
  ['SimSun','宋体'],['NSimSun','新宋体'],['SimHei','黑体'],
  ['Microsoft YaHei','微软雅黑'],['Microsoft YaHei UI','微软雅黑 UI'],
  ['KaiTi','楷体'],['FangSong','仿宋'],['DengXian','等线'],
  ['STSong','华文宋体'],['STKaiti','华文楷体'],['STFangsong','华文仿宋'],
  ['STXihei','华文细黑'],['STZhongsong','华文中宋'],
  ['STXingkai','华文行楷'],['LiSu','隶书'],['YouYuan','幼圆'],
  ['FZYaoti','方正姚体'],['FZShuTi','方正舒体'],
  ['Noto Serif SC','思源宋体 / Noto Serif SC'],['Noto Sans SC','思源黑体 / Noto Sans SC'],
  ['Source Han Serif SC','思源宋体 / Source Han Serif SC'],['Source Han Sans SC','思源黑体 / Source Han Sans SC'],
  ['PingFang SC','苹方'],['Songti SC','宋体（macOS）'],['Heiti SC','黑体（macOS）']
]);
export const LATIN_FONTS=choices([
  ['Times New Roman','Times New Roman'],['Arial','Arial'],
  ['Calibri','Calibri'],['Cambria','Cambria'],['Aptos','Aptos'],['Aptos Display','Aptos Display'],['Georgia','Georgia'],
  ['Verdana','Verdana'],['Tahoma','Tahoma'],['Segoe UI','Segoe UI'],
  ['Trebuchet MS','Trebuchet MS'],['Palatino Linotype','Palatino Linotype'],
  ['Book Antiqua','Book Antiqua'],['Garamond','Garamond'],
  ['Courier New','Courier New'],['Consolas','Consolas'],
  ['Century Schoolbook','Century Schoolbook'],['Arial Narrow','Arial Narrow'],
  ['Franklin Gothic Book','Franklin Gothic Book'],['Gill Sans MT','Gill Sans MT'],
  ['Arial Black','Arial Black'],['Arial Rounded MT Bold','Arial Rounded MT Bold'],
  ['Bahnschrift','Bahnschrift'],['Helvetica','Helvetica'],['Helvetica Neue','Helvetica Neue'],
  ['Inter','Inter'],['Roboto','Roboto'],['Noto Sans','Noto Sans'],['Noto Serif','Noto Serif']
]);
export const DEFAULT_TYPOGRAPHY=Object.freeze({chinese:'SimSun',latin:'Times New Roman',screenPx:14,fontPt:8,bold:false});
const chineseIds=new Set(CHINESE_FONTS.map(font=>font.id)),latinIds=new Set(LATIN_FONTS.map(font=>font.id));
const fields=new Set(Object.keys(DEFAULT_TYPOGRAPHY));
export function normalizeTypography(value={}){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('字体设置须为对象');
  for(const key of Object.keys(value))if(!fields.has(key))throw new Error('未知字体设置：'+key);
  const result={...DEFAULT_TYPOGRAPHY,...value};
  if(!chineseIds.has(result.chinese))throw new Error('中文字体不在可选列表中');
  if(!latinIds.has(result.latin))throw new Error('英文字体不在可选列表中');
  if(!Number.isFinite(result.screenPx)||result.screenPx<10||result.screenPx>32)throw new Error('画布字号须为 10–32 px');
  if(!Number.isFinite(result.fontPt)||result.fontPt<5||result.fontPt>20)throw new Error('论文字号须为 5–20 pt');
  if(typeof result.bold!=='boolean')throw new Error('字体粗细设置须为布尔值');
  return result;
}
export function fontFamily(value={}){
  const type=normalizeTypography(value);
  const families=[...new Set([type.latin,type.chinese,'Times New Roman','SimSun'])];
  return families.map(family=>'"'+family+'"').join(', ')+', serif';
}
export function canvasFont(value={},px){
  const type=normalizeTypography(value),size=px===undefined?type.screenPx:px;
  if(!Number.isFinite(size)||size<=0||size>20000)throw new Error('绘图字号无效');
  return `${type.bold?'700':'400'} ${size}px ${fontFamily(type)}`;
}
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const availability=new Map();
export function fontAvailable(id){
  if(!chineseIds.has(id)&&!latinIds.has(id))throw new Error('字体不在可选列表中');
  if(availability.has(id))return availability.get(id);
  if(typeof document==='undefined')return null;
  const context=document.createElement('canvas').getContext('2d');
  if(!context)return null;
  // FontFaceSet.check can report true for an absent system font. Compare actual
  // metrics with several fallback families so a missing font is visible in UI.
  const sample='mmmmWWlli0123456789 光纤偏振测试',families=['monospace','serif','sans-serif'];
  const found=families.some(fallback=>{
    context.font=`48px ${fallback}`;
    const baseline=context.measureText(sample).width;
    context.font=`48px "${id}", ${fallback}`;
    return Math.abs(context.measureText(sample).width-baseline)>.01;
  });
  availability.set(id,found);
  return found;
}
export function fontAvailabilityMessage(value={}){
  const type=normalizeTypography(value),missing=[type.chinese,type.latin].filter(id=>fontAvailable(id)===false);
  return missing.length?'本机未检测到 '+missing.join('、')+'，当前会使用备用字体。':'当前选择的字体可在本机预览和导出。';
}
export function fontOptions(kind,selected){
  if(!['chinese','latin'].includes(kind))throw new Error('未知字体分组');
  const fonts=kind==='chinese'?CHINESE_FONTS:LATIN_FONTS,value=selected??DEFAULT_TYPOGRAPHY[kind];
  if(!fonts.some(font=>font.id===value))throw new Error('字体不在可选列表中');
  return fonts.map(font=>`<option value="${escape(font.id)}"${font.id===value?' selected':''}>${escape(font.label)}${fontAvailable(font.id)===false?'（未检测到）':''}</option>`).join('');
}

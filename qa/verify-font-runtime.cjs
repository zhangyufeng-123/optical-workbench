const {app, BrowserWindow} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const output = path.join(__dirname, 'font-runtime');
fs.mkdirSync(output, {recursive:true});
app.commandLine.appendSwitch('user-data-dir', path.join(output, 'profile-' + Date.now()));
const source = path.resolve(__dirname, '../../../论文仿真/output/光纤实验搭建平台_论文出图增强版_20261113/source/typography.js');
const report = {checkedAt:new Date().toISOString(), allPassed:false};
app.whenReady().then(async () => {
  try {
    const window = new BrowserWindow({show:false, webPreferences:{contextIsolation:true, sandbox:true}});
    await window.loadURL('data:text/html;charset=utf-8,<html><body></body></html>');
    const code = fs.readFileSync(source, 'utf8').replace(/^export /gm, '');
    const actual = await window.webContents.executeJavaScript(`(async()=>{${code}
      await document.fonts.ready;
      const samples=[['simsun',{chinese:'SimSun',latin:'Times New Roman'}],['simhei',{chinese:'SimHei',latin:'Times New Roman'}],['yahei',{chinese:'Microsoft YaHei',latin:'Times New Roman'}],['arial',{chinese:'SimSun',latin:'Arial'}]];
      const raster=samples.map(([name,typography])=>{const canvas=document.createElement('canvas');canvas.width=1400;canvas.height=170;const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.font=canvasFont(typography,42);context.fillStyle='#263743';context.fillText('光纤偏振分析仪 Fiber polarimeter 1310 nm',28,90);return {name,font:context.font,width:context.measureText('光纤偏振分析仪 Fiber polarimeter 1310 nm').width,png:canvas.toDataURL('image/png')};});
      return {chineseCount:CHINESE_FONTS.length,latinCount:LATIN_FONTS.length,availability:[...CHINESE_FONTS,...LATIN_FONTS].map(font=>({...font,available:fontAvailable(font.id)})),raster,options:fontOptions('latin','Arial')};
    })()`);
    const samples = actual.raster.map(sample => {
      const bytes = Buffer.from(sample.png.split(',')[1], 'base64');
      fs.writeFileSync(path.join(output, sample.name + '.png'), bytes);
      return {name:sample.name, font:sample.font, width:sample.width, sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
    });
    assert.equal(new Set(samples.map(sample=>sample.sha256)).size, samples.length);
    for (const name of ['SimSun','SimHei','KaiTi','FangSong','Microsoft YaHei','DengXian','Arial','Times New Roman','Calibri','Cambria']) assert.equal(actual.availability.find(font=>font.id===name).available, true, name + ' available');
    assert.ok(actual.options.includes('（未检测到）'));
    Object.assign(report, {allPassed:true, chineseCount:actual.chineseCount, latinCount:actual.latinCount, availability:actual.availability, samples, checks:['10 common Windows fonts detected','Changing Chinese and Latin families changes real Canvas pixels','Unavailable font options carry an explicit status']});
    window.destroy();
  } catch (error) {
    report.error=error.stack;
    console.error(error);
  } finally {
    fs.writeFileSync(path.join(output,'font-runtime-checks.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({allPassed:report.allPassed,chineseCount:report.chineseCount,latinCount:report.latinCount}));
    app.exit(report.allPassed?0:1);
  }
});

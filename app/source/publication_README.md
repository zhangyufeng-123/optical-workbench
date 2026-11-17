# 论文图版模块

`createJournalStudio(api, host=document.body)` 在指定容器中挂载独立原生 dialog，默认隐藏。`await studio.open()` 显示工作区并在没有画面时捕获当前场景；`open({captureIfEmpty:false})` 仅打开。

父应用接口：

```js
const studio=createJournalStudio({
  capture: async ({width,height,transparent,hideBoard,projection,preset}) => ({
    dataUrl: 'data:image/png;base64,...', width, height,
    labels: [{id:'source-1',text:'光纤光源',x:450,y:240}]
  }),
  getState: ()=>({title:'全光纤波片测试'}),
  download: (blob,name)=>{ /* optional, built-in browser download used if omitted */ }
});
```

捕获请求为2200×1100像素、透明背景、隐藏面包板、正交视图。父应用应按实际渲染返回width/height，标签x/y为输出图像中的像素坐标。请把文字独立返回，不先画进图像，以便矢量标注编辑。parent API可忽略preset='journal'，但应保证真实模型和相同光纤连接，不生成假实验数据。

模块可加入最多6幅画面，支持a–f编号。支持当前三维快照、PNG/JPG/WebP和自包含SVG导入；SVG作为内嵌图像保留源数据，进一步编辑Origin图中曲线请在原Origin工程完成后重导。

输出：89/183mm/自定义宽度，150/300/600dpi。PNG为计算得到的像素尺寸，并写入pHYs真实分辨率；SVG使用mm画布、内嵌图像、原生文字/箭头/引线/框/面板编号。3D图层仍为栅格，不声称三维几何在SVG内可编辑。

API返回：`capturePanel({replace:false})`, `importImage(file)`, `exportSVG({download:false}) -> string`, `exportPNG({download:false}) -> Blob`, `getState()`, `load(data)`, `selectPanel(id)`, `addAnnotation(panelId, data)`, `setSettings(values)`, `undo()`, `redo()`, `close()`, `destroy()`。独立导出函数另有`publicationLayout`, `publicationSVG`, `addPNGResolution`, `validateComposition`。

排版JSON格式为`fiber-workbench-publication` version1，图片内嵌，独立于三维工程JSON。标注坐标按每个图像宽高归一化存储；字号为pt。文字使用Times New Roman和宋体。SVG图例中没有模拟实验数据；图像来源写入SVG metadata和排版工程。

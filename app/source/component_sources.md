# 三维器件库扩展说明

本版保留原26类器件及其ID，新增34类，共60类。全部模型由 `models.js` 中的几何函数生成，独立网格、材质和端口可导出。新增模型没有复制厂商品牌或声称来自厂商STEP。机箱尺寸、器件包装、紧固件和接口位置为视觉布局尺寸，不是制造或采购图纸。

原有 GitHub Photonics Component Library 的489个SVG是另一个二维功能符号库；这些三维外形为本项目补建，不将二维符号或本次新增几何写成原厂CAD。

新增项目：

| 类别 | ID | 器件 |
|---|---|---|
| 光源 | tunable, ase, pump | 可调谐光纤激光器、ASE宽带光源、蝶形封装泵浦激光器 |
| 偏振与样品 | pbs, pbc, squeezer, depolarizer | 光纤PBS/PBC、挤压式偏振控制器、全光纤消偏器 |
| 无源器件 | split4, split8, switch4, fixedatten, circulator4, cwdm4, delayline, fibermirror, fbgfilter | 1×4/1×8分路器、1×4开关、固定衰减器、四端口环形器、四通道WDM、延迟线、反射端镜、FBG滤波器 |
| 有源器件 | phasemod, stretcher, soa, raman | 相位调制器、压电光纤拉伸器、SOA模块、拉曼光纤放大器 |
| 测量 | balanced, otdr, wavemeter, interrogator | 平衡探测器、OTDR、波长计、FBG解调仪 |
| 光纤传感 | fbgsensor, temperature, pressure, sensingcoil | 应变传感器、温度探头、压力探头、传感线圈 |
| 连接与机械 | splice, patchpanel, rotary, oven, vblock, rail | 熔接保护点、八口配线面板、旋转接头、温控炉、V槽支架、导轨夹持组件 |

新增光源不预设可用波长；不能因为能在台面连线就认为器件波段兼容。EDFA、SOA、Raman等放大器的名称不会自动提供增益或噪声参数。PBS/PBC的 H/V 为功能标识，不代表已标定的保偏轴角度。所有仪器屏幕只标识功能，不生成测量数据。FBG表面的色段和线圈可见绕线是结构示意，不应读取为实测栅格、精确圈数或有效长度。

端口定义仅包含光学端口；泵浦二极管电引脚、射频SMA/BNC和控制接口只作外形展示。`splice` 的端口类型为“尾纤熔接”，其模型绘制连续尾纤与热缩保护套，不能与FC接口直接视为同一连接类型。配线面板不预设任何背面跳接关系。机械V槽、导轨和原有位移台没有光学端口。

数据兼容：保留 `CATALOG`、`categories`、`getDef`、`buildModel`、`buildBoard`、`T` 导出；沿用 `id/name/category/shape/size/ports/code/note/source/color`。新增 `aliases` 为中英文检索关键词，`representation = generic_visualization`、`sizeBasis = 示意尺寸 / mm` 说明模型属性。所有ID只使用英文字母、数字、下划线或连字符。

全局材质池 `M` 标有 `userData.shared = true`，逐器件外壳和文字贴图材质为各次构建独立对象。释放场景时可以销毁独立材质与贴图，但不要销毁共享池材质。

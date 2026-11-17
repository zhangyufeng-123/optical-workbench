# 新增 40 类空间光器件：几何、端口及来源

更新日期：2026-11-13。原 60 类光纤器件 ID 与几何保留；此次增加 40 类，合计 100 类。新增网格均由本项目 `models.js` 参数化构建，可在三维编辑器中替换、旋转、连接，也可导出 GLB 并在 Blender 内编辑组成网格。

这些模型是**通用科研示意，不是厂商 CAD、制造图或实测设备复刻**。外壳、支架、曲面、刻度和接口用于辨认器件与组织光路。没有从下列网站下载、复制或重新授权厂商 CAD、照片、商标和纹理。类别与功能参考来自公开的厂商资料；具体尺寸及造型是本项目自行设置。

## 覆盖范围

| 类别 | 新增 ID |
|---|---|
| 空间光源（6 类） | `fs_cwlaser`、`fs_fslaser`、`fs_diode`、`fs_collimator`、`fs_fiber_collimator`、`fs_thz_emitter` |
| 空间光学（24 类） | `fs_mirror`、`fs_turnmirror`、`fs_lens_convex`、`fs_lens_concave`、`fs_achromat`、`fs_cyl_lens`、`fs_objective`、`fs_pbs`、`fs_bs_cube`、`fs_bs_plate`、`fs_qwp`、`fs_hwp`、`fs_polarizer`、`fs_iris`、`fs_pinhole`、`fs_nd`、`fs_filterwheel`、`fs_grating`、`fs_prism`、`fs_expander`、`fs_delayline`、`fs_dump`、`fs_oap`、`fs_dichroic` |
| 空间调制（5 类） | `fs_aom`、`fs_eom`、`fs_slm`、`fs_dmd`、`fs_shutter` |
| 空间探测（5 类） | `fs_cmos`、`fs_ccd`、`fs_spd`、`fs_balanced`、`fs_thz_detector` |

## 端口与连接约定

- 单位为模型局部坐标中的 mm，Y 轴朝上；新增器件的光学端口统一位于 `y=80`，便于排布。**80 mm 是平台约定，不代表上述厂商的实际光轴高度。**
- 空间端口：`kind='free-space'`、`connector='Free space'`，不生成 FC 接头。
- 普通透射件沿 X 轴：输入端口的外向方向是 `[-1,0,0]`，输出端口是 `[1,0,0]`。这里的 `dir` 表示**器件端口外向方向**，输入光的实际传播方向与输入端口 `dir` 相反。
- `fs_fiber_collimator` 为混合接口：`in` 是 FC/PC 光纤端口 `[-63,80,0]`，`out` 是自由空间端口 `[59,80,0]`。两侧应连接相应类型的线。
- `fs_turnmirror`：`in`、`out` 共点 `[0,80,0]`，方向分别为 `−X`、`+Z`。镜面法向为 `(1,0,−1)/√2`。对入射传播方向 `k=(1,0,0)`，镜面反射关系 `k−2(k·n)n=(0,0,1)` 给出 +Z 折转，几何镜面方向与端口一致。
- PBS、立方 BS：入射 `[-18,80,0]`，透射 `[18,80,0]`，反射 `[0,80,18]`；透射与反射分支分别沿 +X、+Z。薄片 BS 与二向色镜三端口在光轴中心分支。
- 法向平面镜的入射与返回端口共点，均朝 −X；空间延迟台的两端口为相隔 50 mm 的平行回返通道。不同反射件不能都按直通元件使用。
- AOM 的小角度分支、光栅的示意出射、SLM/DMD 的斜入射与反射、OAP 的折转端口用于布局表达，不是由波长、声频、像素状态或焦距计算出的光学结果。
- THz 发射头的 `pump` 与 `out`、探测头的 `in` 与 `gate` 属于不同物理功能及波段。绘图软件不会自动模拟光电导转换、同步或 THz 传播。

完整的 40 类端口 `id / pos / dir / role / kind / connector` 清单由 `export_space_models.cjs` 导出至 [free_space_ports.json](free_space_ports.json)，与应用实际载入的 `CATALOG` 同源。全部 100 类目录为 [catalog.json](catalog.json)。

## 几何实现

凸、凹透镜使用不同旋转曲面；柱面镜使用一维曲率拉伸面；双胶合镜有两片独立玻璃。PBS/BS 有玻璃立方体和内部倾斜分光界面；波片、偏振片、光阑、针孔分别具有旋转刻度、轴标记、叶片与孔板。滤轮包含六个实际通孔和独立滤片。准直器、扩束镜和物镜的镜筒是空心网格；AOM/EOM 端架留有通光孔。

镜架、调节螺杆、电光电极、声光换能头、像素显示面、散热结构、延迟导轨和 OAP 曲面由独立子网格构成。像素网格、光栅刻纹、机械刻度只是功能标识，不能读取为真实像素间距、线密度或标定角度。激光器、相机、单光子和平衡探测器外壳保持可辨识的不同结构；屏幕与传感面不显示虚构实验数据。

## 参考资料与核验范围

以下链接于 2026-11-13 检索。来源用于核实器件类别及工作结构，不用于声称模型与某一商品尺寸一致。

| 官方资料 | 用于核实 | 本次访问状态 |
|---|---|---|
| [Thorlabs Optics Selection Guide](https://www.thorlabs.com/images/Catalog/V19_08_Optics.pdf) | 单透镜、消色差、柱面镜、反射镜、棱镜、光栅、偏振与分光器件分类 | 官方检索摘要可读；直接打开返回无可提取正文 |
| [Thorlabs Optical Beamsplitters](https://www.thorlabs.us/navigation.cfm?guide_id=18) | 薄片与立方分束器形态 | 官方检索摘要可读 |
| [Thorlabs OAP Mirrors](https://www.thorlabs.us/newgrouppage9.cfm?objectgroup_id=12395) | OAP 为母抛物面的偏轴部分；常用于准直/聚焦 | 官方检索摘要可读；本模型仅表达曲面和布局 |
| [Coherent Ultrafast Lasers](https://www.coherent.com/lasers/ultrafast-laser) | 飞秒等超快激光系统类别 | 正文可读；未沿用产品功率、脉宽和重复频率 |
| [Hamamatsu LCOS-SLM](https://www.hamamatsu.com/us/en/product/optical-components/lcos-slm/wide_wavelength_bandwidth_type/X15213-08.html) | 反射式 LCOS 相位调制面 | 正文可读；未复制像素规格或驱动响应 |
| [Texas Instruments DLP](https://www.ti.com/en-us/product-category/dlp-products) | 数字微镜阵列反射与调制光 | 正文可读；DMD 端口方向是示意，不代替厂商 ON/OFF 光学设计 |
| [Newport Electro-Optic Modulator FAQs](https://www.newport.com/n/electro-optic-modulator-faqs/p/5511) | 电光晶体与外加电场调制 | 官方检索摘要可读；直接打开无可提取正文 |
| [Hamamatsu Sensor Technologies](https://camera.hamamatsu.com/jp/en/learn/technical_information/sensor_technologies.html) | 科学相机中的 CMOS、CCD 与制冷结构类别 | 正文可读；不沿用读出噪声、量子效率等参数 |
| [TYDEX THz Photoconductive Antennas](https://www.tydexoptics.com/products/thz_assemblies/780-nm/) | 光学泵浦/门控、THz 光电导发射与探测及硅半球透镜组件 | 正文可读；其具体波长、功率、时域曲线不作为用户实验条件 |

## 导出与可编辑性

- 新增独立 GLB 使用序号 `61_` 至 `100_`；旧 `01_` 至 `60_` 保留。
- `100类器件陈列台.glb` 与对应 JSON 用于整体浏览；每个器件仍有独立层级。
- `光学器件库_100类独立集合.blend` 将每一类设为独立 Collection Asset；可从 Asset Browser 拖入，也可 Append 对应集合，再移动该器件的 `MOVE_THIS` 父级。
- Blender 内部单位为 m，显示单位为 mm；GLB 已导出米制，不再额外缩放 0.001。材质纹理打包进 `.blend`。
- 绘图平台与这些资产不计算衍射、光线追迹、偏振传输、脉冲时延、损伤阈值或探测噪声；具体性能需使用真实参数和合适的光学模型单独验证。

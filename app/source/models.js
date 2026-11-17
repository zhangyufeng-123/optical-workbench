import * as T from '../vendor/package/build/three.module.js';
import {RoundedBoxGeometry} from '../vendor/package/examples/jsm/geometries/RoundedBoxGeometry.js';
import {qualityMaterials} from './surface-quality.js';
import {buildProductModel} from './product-models.js';
import {PRODUCT_DEFINITIONS} from './product-definitions.js';
import {createFCAdapter} from './fiber-routing.js';
export const categories=['全部','光源','偏振与样品','无源器件','有源器件','测量','光纤传感','连接与机械','空间光源','空间光学','空间调制','空间探测'];
const port=(id,label,pos,dir,role='io',connector='FC/PC')=>({id,label,pos,dir,role,connector,kind:'optical'});
const lr=(w,y=22,z=0)=>[port('in','输入',[-w/2-8,y,z],[-1,0,0],'in'),port('out','输出',[w/2+8,y,z],[1,0,0],'out')];
const front=(id,label,x,y,z,role)=>port(id,label,[x,y,z],[0,0,1],role);
const branchPorts=(n,w,y,spacing=17)=>[port('in','公共端',[-w/2-8,y,0],[-1,0,0],'in'),...Array.from({length:n},(_,i)=>port('p'+(i+1),'通道 '+(i+1),[w/2+8,y,(i-(n-1)/2)*spacing],[1,0,0],'out'))];
const def=(id,name,category,shape,size,ports,code,note='')=>({id,name,category,shape,size,ports,code,note,source:'本项目参数化三维示意；非厂商 CAD',color:'#34434b'});
const freePort=(id,label,pos,dir,role='io')=>({id,label,pos,dir,role,connector:'Free space',kind:'free-space'});
const freeLR=(half=6)=>[freePort('in','空间光输入',[-half,80,0],[-1,0,0],'in'),freePort('out','空间光输出',[half,80,0],[1,0,0],'out')];
const freeTurn=()=>[freePort('in','入射',[0,80,0],[-1,0,0],'in'),freePort('out','90° 折转',[0,80,0],[0,0,1],'out')];
const freeSplit=(half=18)=>[freePort('in','入射',[-half,80,0],[-1,0,0],'in'),freePort('out','透射',[half,80,0],[1,0,0],'out'),freePort('ref','反射',[0,80,half],[0,0,1],'out')];
export const CATALOG=[
def('laser','窄线宽光纤光源','光源','instrument',[215,85,160],[front('out','光纤输出',65,29,89,'out')],'LASER SOURCE','波长、线宽和功率需按实际光源填写。'),
def('sld','SLD 宽带光源','光源','instrument',[215,85,160],[front('out','光纤输出',65,29,89,'out')],'SLD SOURCE','宽带光源不能直接当作单色测量条件。'),
def('polarizer','在线光纤起偏器','偏振与样品','inline',[90,34,38],lr(90),'POLARIZER','两端光纤接口；不含外部空间光路。'),
def('paddle','三环偏振控制器','偏振与样品','paddle',[245,105,100],lr(245,32),'3-PADDLE FPC','绕圈仅表达结构，不代表指定波长的已标定设置。'),
def('epc','电动偏振控制器','偏振与样品','module',[150,52,105],lr(150,28),'POL. CONTROLLER','电动全光纤控制器示意；控制响应需由真实器件确定。'),
def('qwp','螺旋光纤波片 QWP','偏振与样品','helix',[170,60,75],lr(170,38),'SHB / QWP','参考论文几何：R≈10.45 mm、外绕螺距≈42.2 mm、弧长≈137 mm。不是实测结果。'),
def('hwp','螺旋光纤波片 HWP','偏振与样品','helix',[245,60,75],lr(245,38),'SHB / HWP','参考论文几何：R≈10.45 mm、外绕螺距≈42.2 mm、弧长≈274 mm。'),
def('sample','自制光纤样品夹具','偏振与样品','sample',[200,48,80],lr(200,32),'FIBER UNDER TEST','用于自制样品。内自旋节距与外部绕制螺距是不同参数。'),
def('splitter','1×2 光纤耦合器','无源器件','passive',[100,25,65],[port('in','输入',[-58,18,0],[-1,0,0],'in'),port('a','输出 A',[58,18,-18],[1,0,0],'out'),port('b','输出 B',[58,18,18],[1,0,0],'out')],'1 × 2 COUPLER','分光比可在备注填写。'),
def('coupler22','2×2 光纤耦合器','无源器件','passive',[110,25,65],[port('a','端口 1',[-63,18,-18],[-1,0,0]),port('b','端口 2',[-63,18,18],[-1,0,0]),port('c','端口 3',[63,18,-18],[1,0,0]),port('d','端口 4',[63,18,18],[1,0,0])],'2 × 2 COUPLER'),
def('isolator','光纤隔离器','无源器件','inline',[95,34,38],lr(95),'ISOLATOR','方向：输入到输出。'),
def('circulator','三端口环形器','无源器件','passive',[100,28,65],[port('p1','端口 1',[-58,19,0],[-1,0,0]),port('p2','端口 2',[58,19,-18],[1,0,0]),port('p3','端口 3',[58,19,18],[1,0,0])],'CIRCULATOR','常见环行顺序 1→2→3；本工具不计算传播。'),
def('wdm','波分复用器 WDM','无源器件','passive',[105,28,65],[port('com','公共端',[-60.5,19,0],[-1,0,0]),port('a','波段 A',[60.5,19,-18],[1,0,0]),port('b','波段 B',[60.5,19,18],[1,0,0])],'WDM','波段需按实际器件选择，未设定具体波长。'),
def('attenuator','可调光衰减器','无源器件','attenuator',[105,60,80],lr(105,24),'VARIABLE ATTEN.','可调旋钮为外观示意。'),
def('switch','1×2 光纤开关','无源器件','module',[120,42,85],[port('in','公共端',[-68,25,0],[-1,0,0]),port('a','通道 A',[68,25,-20],[1,0,0]),port('b','通道 B',[68,25,20],[1,0,0])],'OPTICAL SWITCH'),
def('filter','在线光纤滤波器','无源器件','inline',[100,34,38],lr(100),'BANDPASS FILTER'),
def('eom','光纤电光调制器','有源器件','eom',[150,38,75],lr(150,24),'FIBER EOM','金色射频接头只作外观展示，光纤连线不能接电端口。'),
def('edfa','掺铒光纤放大器','有源器件','instrument',[230,85,170],[front('in','输入',36,29,94,'in'),front('out','输出',79,29,94,'out')],'EDFA','通常面向 1.5 µm 波段，不能直接代替 1310 nm 放大器。'),
def('polarimeter','光纤输入偏振分析仪','测量','analyzer',[155,80,130],[front('in','光纤输入',0,42,74,'in')],'POLARIMETER','测量头式外观，软件读出；内部结构需按型号核实。'),
def('powermeter','光功率计','测量','meter',[125,60,110],[front('in','光纤输入',35,24,64,'in')],'POWER METER','显示屏仅标识功能，不生成测量数值。'),
def('photodiode','光纤光电探测器','测量','detector',[90,65,80],[front('in','光纤输入',0,38,49,'in')],'PHOTODETECTOR','BNC 输出为电端口，仅展示，不可接光纤。'),
def('osa','光谱分析仪','测量','instrument',[265,120,185],[front('in','光纤输入',100,33,101.5,'in')],'OPTICAL SPECTRUM','屏幕为功能示意，无测量曲线。'),
def('adapter','FC 光纤转接座','连接与机械','adapter',[65,35,45],[port('a','A 端',[-39,24,0],[-1,0,0]),port('b','B 端',[39,24,0],[1,0,0])],'FC ADAPTER'),
def('spool','光纤盘纤架','连接与机械','spool',[140,44,140],[port('a','尾纤 A',[-78,18,0],[-1,0,0]),port('b','尾纤 B',[78,18,0],[1,0,0])],'FIBER SPOOL','盘纤几何用于布局，不代表已验证最小弯曲半径。'),
def('clamp','光纤夹持座','连接与机械','clamp',[65,36,60],[],'FIBER CLAMP','机械件，无光学端口。'),
def('stage','位移台与光纤夹具','连接与机械','stage',[125,65,115],[],'TRANSLATION STAGE','机械件；位移机构为示意。'),
def('tunable','可调谐光纤激光器','光源','tunable',[245,100,175],[front('out','光纤输出',83,31,96.5,'out')],'TUNABLE LASER','调谐范围、步进与线宽需按实际器件填写；屏幕不显示虚构测量值。'),
def('ase','ASE 宽带光源','光源','instrument',[220,90,155],[front('out','光纤输出',70,29,86.5,'out')],'ASE SOURCE','光谱范围与功率依真实光源；不是所有 ASE 光源均适用 1310 nm。'),
def('pump','蝶形封装泵浦激光器','光源','butterfly',[100,38,70],[port('out','尾纤输出',[58,24,0],[1,0,0],'out')],'PUMP DIODE','展示通用蝶形封装与电引脚。工作波长、TEC 和驱动器须另外匹配。'),
def('pbs','光纤偏振分束器 PBS','偏振与样品','pbs',[110,31,74],[port('com','公共端',[-63,21,0],[-1,0,0],'in'),port('h','H 输出',[63,21,-21],[1,0,0],'out'),port('v','V 输出',[63,21,21],[1,0,0],'out')],'FIBER PBS','功能端口 H/V 为示意标识；保偏慢轴对准需按实物确定。'),
def('pbc','光纤偏振合束器 PBC','偏振与样品','pbs',[110,31,74],[port('h','H 输入',[-63,21,-21],[-1,0,0],'in'),port('v','V 输入',[-63,21,21],[-1,0,0],'in'),port('com','公共输出',[63,21,0],[1,0,0],'out')],'FIBER PBC','合束端口关系用于布局，不计算两路光的相干叠加。'),
def('squeezer','挤压式偏振控制器','偏振与样品','squeezer',[185,65,80],lr(185,26),'FIBER SQUEEZER','用挤压单元表示应力双折射控制。旋钮角度不等于已标定偏振角。'),
def('depolarizer','全光纤消偏器','偏振与样品','depolarizer',[130,33,80],lr(130,22),'DEPOLARIZER','消偏效果依光谱、相干性和器件设计；不保证任意输入均完全消偏。'),
def('split4','1×4 光纤分路器','无源器件','multiport',[130,31,95],branchPorts(4,130,21,20),'1 × 4 SPLITTER','四通道外观示意；分光比和各端口插损请写入备注。'),
def('split8','1×8 光纤分路器','无源器件','multiport',[145,31,165],branchPorts(8,145,21,19),'1 × 8 SPLITTER','八通道端口均可独立连线。没有假定等分或实测损耗。'),
def('switch4','1×4 光纤开关','无源器件','switchbank',[145,53,105],branchPorts(4,145,29,23),'1 × 4 SWITCH','只有光学端口可连纤。当前通道状态需在实际控制器设置。'),
def('fixedatten','固定光衰减器','无源器件','fixedatten',[70,28,38],lr(70,20),'FIXED ATTENUATOR','通用封装，不预设衰减量、端面形式或工作波段。'),
def('circulator4','四端口光纤环形器','无源器件','circulator4',[115,32,82],[port('p1','端口 1',[-65.5,22,-22],[-1,0,0]),port('p2','端口 2',[65.5,22,-22],[1,0,0]),port('p3','端口 3',[65.5,22,22],[1,0,0]),port('p4','端口 4',[-65.5,22,22],[-1,0,0])],'4-PORT CIRCULATOR','常见顺序 1→2→3→4；实际隔离方向与参数以型号为准。'),
def('cwdm4','四通道波分模块','无源器件','multiport',[155,36,110],branchPorts(4,155,25,24).map(p=>({...p,role:'io'})),'4-CHANNEL WDM','通道波长未预设。复用与解复用方向依实际器件选定。'),
def('delayline','可调光纤延迟线','无源器件','delayline',[210,70,110],lr(210,30),'OPTICAL DELAY','旋转微分头与平移机构为外形示意；不能从几何位置读取真实群延迟。'),
def('fibermirror','光纤反射端镜','无源器件','fibermirror',[90,30,45],[port('io','入射 / 返回',[-53,22,0],[-1,0,0])],'FIBER MIRROR','反射式单端器件；光纤端口为双向，不添加外部空间光束。'),
def('fbgfilter','光纤布拉格光栅滤波器','无源器件','fbgfilter',[160,32,55],lr(160,23),'FBG FILTER','色段仅标识光栅区域，非真实可见栅格；中心波长和带宽待填写。'),
def('phasemod','光纤相位调制器','有源器件','phasebox',[160,43,80],lr(160,27),'PHASE MODULATOR','金色接头是 RF 电端口。Vπ 与调制带宽未预设。'),
def('stretcher','压电光纤拉伸器','有源器件','stretcher',[155,72,135],lr(155,25),'FIBER STRETCHER','用压电筒与盘绕纤维表达结构；驱动电压与相位响应未仿真。'),
def('soa','半导体光放大器 SOA','有源器件','soa',[145,52,95],lr(145,30),'SOA MODULE','光放大模块外形示意；增益、波段、偏振依赖与噪声需由真实器件给出。'),
def('raman','拉曼光纤放大器','有源器件','amplifier',[245,100,180],[front('in','信号输入',50,31,99,'in'),front('out','信号输出',93,31,99,'out')],'RAMAN AMPLIFIER','内部泵浦结构未展开；不是通用全波段放大器。'),
def('balanced','平衡光电探测器','测量','balanced',[135,76,100],[front('a','光学输入 +',-30,40,59,'in'),front('b','光学输入 −',30,40,59,'in')],'BALANCED RECEIVER','两路光纤输入；差分电输出仅展示，不作为光学端口。'),
def('otdr','光时域反射仪 OTDR','测量','portable',[165,115,85],[port('io','测试端口',[45,89,-50.5],[0,0,-1])],'OTDR','脉冲反射测试端口为双向；显示屏仅标识仪器，无虚构轨迹。'),
def('wavemeter','光波长计','测量','instrument',[220,90,155],[front('in','光纤输入',70,29,86.5,'in')],'WAVELENGTH METER','分辨率与工作波段需按具体型号选择。'),
def('interrogator','FBG 解调仪','测量','rackunit',[280,90,170],Array.from({length:4},(_,i)=>front('ch'+(i+1),'通道 '+(i+1),-72+i*48,31,94,'io')),'FBG INTERROGATOR','四个光学读出通道；无温度、应变或波长实测数据。'),
def('fbgsensor','FBG 应变传感器','光纤传感','fbgsensor',[165,30,55],[port('io','传感尾纤',[-90.5,22,0],[-1,0,0])],'FBG STRAIN SENSOR','反射式传感封装示意；标距、灵敏度与温度补偿待实测。'),
def('temperature','光纤温度探头','光纤传感','temperature',[150,37,50],[port('io','传感尾纤',[-83,26,0],[-1,0,0])],'TEMPERATURE PROBE','金属探头与尾纤仅表达结构；实际测温机制与范围由型号确定。'),
def('pressure','光纤压力探头','光纤传感','pressure',[115,65,80],[port('io','传感尾纤',[-65.5,37,0],[-1,0,0])],'PRESSURE PROBE','密封膜片外形为通用示意；不提供压力响应或机械耐压依据。'),
def('sensingcoil','光纤传感线圈','光纤传感','sensingcoil',[185,50,185],[port('a','线圈端 A',[-100.5,22,-20],[-1,0,0]),port('b','线圈端 B',[-100.5,22,20],[-1,0,0])],'SENSING COIL','用于传感环路布置；圈数和长度为展示值，不是 FOCT 灵敏度计算输入。'),
def('splice','光纤熔接保护点','连接与机械','splice',[115,27,45],[port('a','尾纤 A',[-65.5,20,0],[-1,0,0],'io','尾纤熔接'),port('b','尾纤 B',[65.5,20,0],[1,0,0],'io','尾纤熔接')],'FUSION SPLICE','热缩保护套与尾纤；没有 FC 接头。保偏熔接轴向精度需实测。'),
def('patchpanel','八口光纤配线面板','连接与机械','patchpanel',[235,65,80],Array.from({length:8},(_,i)=>front('p'+(i+1),'端口 '+(i+1),-91+i*26,33,49,'io')),'FIBER PATCH PANEL','面板背部连接关系未预设；这些端口分别作为可接线接口。'),
def('rotary','光纤旋转接头','连接与机械','rotary',[130,68,75],lr(130,38),'FIBER ROTARY JOINT','表示同轴机械旋转接口；旋转损耗与偏振特性未计算。'),
def('oven','光纤样品温控炉','连接与机械','oven',[200,105,140],lr(200,60),'FIBER SAMPLE OVEN','温控炉与穿纤口示意；温度值、均匀性与热历史需记录真实条件。'),
def('vblock','V 槽光纤支架','连接与机械','vblock',[95,48,70],[],'V-GROOVE HOLDER','无光学端口的机械支撑；槽角、夹紧力和高度为布局示意。'),
def('rail','可调导轨夹持组件','连接与机械','rail',[245,58,85],[],'FIBER ALIGNMENT RAIL','机械导轨、滑块和压紧夹具；不计算位移行程与机械公差。'),
def('fs_cwlaser','连续波空间光激光头','空间光源','fs_cwlaser',[220,105,105],[freePort('out','激光输出',[116,80,0],[1,0,0],'out')],'CW LASER','通用连续波激光头；波长、功率及激光等级未预设。'),
def('fs_fslaser','飞秒激光系统','空间光源','fs_fslaser',[300,125,175],[freePort('out','脉冲光输出',[158,80,0],[1,0,0],'out')],'FEMTOSECOND LASER','通用封闭脉冲激光外形；不假定脉宽、重复频率或峰值功率。'),
def('fs_diode','半导体空间激光模块','空间光源','fs_diode',[120,108,90],[freePort('out','自由空间输出',[66,80,0],[1,0,0],'out')],'DIODE LASER','散热激光二极管模块示意；驱动、TEC及波长须按实物填写。'),
def('fs_collimator','空间光准直透镜筒','空间光源','fs_collimator',[125,112,75],freeLR(59),'COLLIMATOR','两侧自由空间光学接口；准直状态由实际焦距与入射光确定。'),
def('fs_fiber_collimator','光纤准直器 / 混合接口','空间光源','fs_fiber_collimator',[125,112,75],[port('in','光纤输入',[-63,80,0],[-1,0,0],'in'),freePort('out','准直空间输出',[59,80,0],[1,0,0],'out')],'FIBER COLLIMATOR','左端 FC/PC 光纤，右端自由空间；双向耦合时需校准焦点和模式匹配。'),
def('fs_mirror','平面反射镜','空间光学','fs_mirror',[72,116,82],[freePort('in','入射',[0,80,0],[-1,0,0],'in'),freePort('out','原路返回',[0,80,0],[-1,0,0],'out')],'PLANE MIRROR','面向 −X 的法向入射反射镜；输入与返回光路共线。'),
def('fs_turnmirror','45° 转向反射镜','空间光学','fs_turnmirror',[88,116,88],freeTurn(),'TURNING MIRROR','镜面法向 (1,0,−1)/√2；沿 +X 入射后沿 +Z 传播，输入/输出共点。'),
def('fs_lens_convex','双凸透镜与镜架','空间光学','fs_lens_convex',[65,116,75],freeLR(8),'CONVEX LENS','双凸曲面几何示意；无预设焦距、材料折射率或色差计算。'),
def('fs_lens_concave','双凹透镜与镜架','空间光学','fs_lens_concave',[65,116,75],freeLR(8),'CONCAVE LENS','双凹曲面几何示意；发散能力未进行光线追迹。'),
def('fs_achromat','消色差双胶合透镜','空间光学','fs_achromat',[65,116,75],freeLR(9),'ACHROMATIC DOUBLET','用两片不同色调的曲面玻璃表达胶合双透镜；不虚构材料牌号。'),
def('fs_cyl_lens','柱面透镜','空间光学','fs_cyl_lens',[65,116,82],freeLR(8),'CYLINDRICAL LENS','一维柱面曲率与矩形通光口；未计算线焦斑。'),
def('fs_objective','显微物镜','空间光学','fs_objective',[125,116,80],freeLR(56),'MICROSCOPE OBJECTIVE','多级物镜筒与前端透镜；倍率、NA、工作距离须另填。'),
def('fs_pbs','空间偏振分光棱镜 PBS','空间光学','fs_pbs',[80,116,80],freeSplit(18),'PBS CUBE','透射与反射分支分别沿 +X / +Z；偏振轴与消光比未标定。'),
def('fs_bs_cube','非偏振立方分束器','空间光学','fs_bs_cube',[80,116,80],freeSplit(18),'BEAMSPLITTER CUBE','立方体内部斜膜；不默认 50:50 分光比或全波段无偏振依赖。'),
def('fs_bs_plate','薄片分束器','空间光学','fs_bs_plate',[88,116,88],freeSplit(0),'PLATE BEAMSPLITTER','倾斜薄片，直通 +X 与反射 +Z 在光轴中心分支；不模拟鬼像。'),
def('fs_qwp','空间四分之一波片','空间光学','fs_qwp',[72,122,85],freeLR(5),'QUARTER-WAVE PLATE','刻度旋转架与波片；λ/4仅标识功能，设计波长和快轴须校准。'),
def('fs_hwp','空间二分之一波片','空间光学','fs_hwp',[72,122,85],freeLR(5),'HALF-WAVE PLATE','刻度旋转架与波片；λ/2仅标识功能，不代入未确认的延迟量。'),
def('fs_polarizer','空间线偏振片','空间光学','fs_polarizer',[72,122,85],freeLR(5),'LINEAR POLARIZER','旋转偏振片与透射轴标记；不预设消光比或损伤阈值。'),
def('fs_iris','可调光阑','空间光学','fs_iris',[72,120,85],freeLR(5),'ADJUSTABLE IRIS','叶片式可调光阑外观；孔径仅为建模示意。'),
def('fs_pinhole','针孔空间滤波器','空间光学','fs_pinhole',[80,118,85],freeLR(4),'PINHOLE','薄孔板与 XY 调节架；孔径与衍射响应未标定。'),
def('fs_nd','中性密度滤光片','空间光学','fs_nd',[72,116,75],freeLR(4),'ND FILTER','灰色吸收片；未假定 OD 或透过率。'),
def('fs_filterwheel','六位滤光片轮','空间光学','fs_filterwheel',[85,154,155],freeLR(7),'FILTER WHEEL','六个滤片位示意；当前通光位在 y=80 mm，滤片参数待填写。'),
def('fs_grating','反射式衍射光栅','空间光学','fs_grating',[85,120,90],freeTurn(),'REFLECTION GRATING','细纹仅表达刻槽方向；出射方向是布局示意，不由光栅方程求解。'),
def('fs_prism','直角转向棱镜','空间光学','fs_prism',[80,116,80],[freePort('in','入射',[-18,80,0],[-1,0,0],'in'),freePort('out','折转',[0,80,18],[0,0,1],'out')],'RIGHT-ANGLE PRISM','直角棱镜内斜面把 +X 方向转向 +Z；未判断具体材料/波段的全反射条件。'),
def('fs_aom','空间声光调制器 AOM','空间调制','fs_aom',[130,108,85],[...freeLR(56),freePort('diffracted','衍射支路',[56,80,4],[0.998027,0,0.062791],'out')],'ACOUSTO-OPTIC MOD.','主通道与小角度衍射端口为示意；偏转角不是声频或波长计算结果。'),
def('fs_eom','空间电光晶体调制器','空间调制','fs_eom',[130,110,85],freeLR(56),'ELECTRO-OPTIC CRYSTAL','晶体与电极外形；不预设 Vπ、频率带宽或调制深度。'),
def('fs_slm','反射式空间光调制器 SLM','空间调制','fs_slm',[115,135,140],[freePort('in','斜入射',[-30,80,0],[-0.965926,0,-0.258819],'in'),freePort('out','反射调制',[-30,80,0],[-0.965926,0,0.258819],'out')],'SPATIAL LIGHT MOD.','反射显示面与控制接口；不加载相位图或计算衍射场。'),
def('fs_dmd','数字微镜调制器 DMD','空间调制','fs_dmd',[125,135,145],[freePort('in','斜入射',[-35,80,0],[-0.939693,0,-0.342020],'in'),freePort('out','选通反射',[-35,80,0],[-0.939693,0,0.342020],'out')],'DIGITAL MICROMIRROR','倾斜微镜阵列用网格纹理标示；端口方向为布局，不替代厂商 ON/OFF 光路。'),
def('fs_expander','可调激光扩束镜','空间光学','fs_expander',[190,118,85],freeLR(91),'BEAM EXPANDER','多级伸缩镜筒与双口径玻璃；倍率与准直未计算。'),
def('fs_delayline','回返式空间光延迟台','空间光学','fs_delayline',[240,115,140],[freePort('in','入射',[-100,80,-25],[-1,0,0],'in'),freePort('out','平行返回',[-100,80,25],[-1,0,0],'out')],'FREE-SPACE DELAY','导轨和回返反射组件；进出光反向平行，实际光程随位移改变但本工具不计算时延。'),
def('fs_dump','空间光束吸收器','空间光学','fs_dump',[100,115,85],[freePort('in','光束终端',[-43,80,0],[-1,0,0],'in')],'BEAM DUMP','开口黑腔与散热鳍；不是已认证的功率或安全等级选型。'),
def('fs_shutter','电动光束快门','空间调制','fs_shutter',[100,120,100],freeLR(7),'BEAM SHUTTER','机械挡片示意为打开状态；开闭时序和联锁未实现。'),
def('fs_cmos','CMOS 面阵相机','空间探测','fs_cmos',[115,124,100],[freePort('in','成像入射',[-59,80,0],[-1,0,0],'in')],'CMOS CAMERA','像面探测器与镜头接口；无假造图像、分辨率或噪声参数。'),
def('fs_ccd','制冷 CCD 相机','空间探测','fs_ccd',[150,125,120],[freePort('in','成像入射',[-77,80,0],[-1,0,0],'in')],'COOLED CCD','散热制冷相机外形；不生成读出图像或暗噪声数据。'),
def('fs_spd','空间光单光子探测器','空间探测','fs_spd',[145,120,110],[freePort('in','空间光输入',[-76,80,0],[-1,0,0],'in')],'SINGLE-PHOTON DET.','小通光窗与电子读出外形；量子效率和暗计数须来自真实器件。'),
def('fs_balanced','空间光平衡探测器','空间探测','fs_balanced',[145,125,150],[freePort('a','输入 +',[-76,80,-32],[-1,0,0],'in'),freePort('b','输入 −',[-76,80,32],[-1,0,0],'in')],'BALANCED DETECTOR','两个空间入射窗口；差分电输出不作为光学端口。'),
def('fs_oap','离轴抛物面反射镜','空间光学','fs_oap',[95,120,95],freeTurn(),'OFF-AXIS PARABOLA','偏轴曲面镜局部几何；端口表示折转，不计算焦点、像差或准直。'),
def('fs_thz_emitter','太赫兹光电导发射头','空间光源','fs_thz_emitter',[120,120,110],[freePort('pump','光学泵浦',[-59,80,0],[-1,0,0],'in'),freePort('out','THz 输出',[59,80,0],[1,0,0],'out')],'THz EMITTER','泵浦入口与 THz 半球透镜；泵浦/THz 是不同波段，不能视为普通激光器直通。'),
def('fs_thz_detector','太赫兹光电导探测头','空间探测','fs_thz_detector',[120,120,110],[freePort('in','THz 入射',[-59,80,0],[-1,0,0],'in'),freePort('gate','光学门控',[0,80,59],[0,0,1],'in')],'THz DETECTOR','THz 接收窗及正交门控入口；同步、频响及检出机制未仿真。'),
def('fs_dichroic','二向色分束镜','空间光学','fs_dichroic',[88,116,88],freeSplit(0),'DICHROIC MIRROR','透射与反射支路明确；实际截止波长、入射角响应与镀膜需按型号填写。')
];
// Search helpers are descriptive only: no specification is inferred from these aliases.
const aliases={tunable:'可调谐 TLS laser',ase:'自发辐射 broadband',pump:'蝶形 butterfly diode TEC',pbs:'偏振分束 polarization splitter',pbc:'偏振合束 polarization combiner',squeezer:'挤压 应力 polarization',depolarizer:'消偏 depolarizer',split4:'一分四 splitter PLC',split8:'一分八 splitter PLC',switch4:'四通道 switch',fixedatten:'衰减 attenuator',circulator4:'四端口 circulator',cwdm4:'CWDM DWDM mux demux',delayline:'延时 delay',fibermirror:'反射 mirror',fbgfilter:'布拉格 grating filter',phasemod:'相位 phase EOM',stretcher:'压电 PZT stretcher',soa:'半导体 amplifier',raman:'拉曼 amplifier',balanced:'平衡 balanced detector',otdr:'反射仪 reflectometer',wavemeter:'波长 wavelength',interrogator:'解调仪 FBG',fbgsensor:'应变 strain FBG',temperature:'温度 temperature sensor',pressure:'压力 pressure sensor',sensingcoil:'FOCT FOG 线圈 coil',splice:'熔接 fusion splice PM',patchpanel:'配线 patch panel',rotary:'旋转 rotary joint',oven:'热台 炉 oven temperature',vblock:'V槽 holder mount',rail:'导轨 rail stage'};
for(const d of CATALOG){d.aliases=aliases[d.id]||d.code;d.representation='generic_visualization';d.sizeBasis='示意尺寸 / mm';}
for(const entry of CATALOG)if(PRODUCT_DEFINITIONS[entry.id])Object.assign(entry,PRODUCT_DEFINITIONS[entry.id]);
export const getDef=id=>CATALOG.find(d=>d.id===id);
const colors={black:0x252b31,dark:0x41505a,steel:0xb4bec6,alum:0xcbd1d5,rubber:0x171b20,gold:0xc9a75d,blue:0x2c80b1,green:0x477b4b,orange:0xd89935};
const mat=(c,metal=0,rough=.45)=>new T.MeshStandardMaterial({color:c,metalness:metal,roughness:rough});
const M={black:mat(colors.black,.45,.36),dark:mat(colors.dark,.55,.38),steel:mat(colors.steel,.85,.25),alum:mat(colors.alum,.72,.36),rubber:mat(colors.rubber,0,.8),gold:mat(colors.gold,.75,.27),blue:mat(colors.blue,.1,.42),green:mat(colors.green,.05,.55),orange:mat(colors.orange,.05,.5),white:mat(0xe9edf0,.1,.5)};
M.glass=new T.MeshPhysicalMaterial({color:0xa1d5e1,roughness:.09,metalness:0,transparent:true,opacity:.52,transmission:.12,thickness:4,ior:1.46,depthWrite:false,side:T.DoubleSide});
M.violetGlass=new T.MeshPhysicalMaterial({color:0xb9a3d8,roughness:.12,transparent:true,opacity:.58,depthWrite:false,side:T.DoubleSide});
M.mirror=new T.MeshStandardMaterial({color:0xb9d6e1,metalness:.96,roughness:.13,side:T.DoubleSide});
M.filterGlass=new T.MeshPhysicalMaterial({color:0x4c6371,roughness:.16,transparent:true,opacity:.76,depthWrite:false,side:T.DoubleSide});
// These pooled materials outlive individual meshes. Instance-specific housing and label materials do not.
Object.entries(M).forEach(([key,m])=>{m.userData.shared=true;m.userData.surfaceRole=({black:'anodized',dark:'anodized',steel:'metal',alum:'metal',gold:'metal',rubber:'rubber',glass:'glass',violetGlass:'coatedGlass',filterGlass:'filterGlass',mirror:'mirror'})[key]||'paint';m.name=key;});
function mesh(g,geo,ma,pos,name){const m=new T.Mesh(geo,ma);m.position.set(...pos);m.name=name||'part';m.castShadow=true;m.receiveShadow=true;g.add(m);return m;}
function box(g,s,p,m=M.black,r=1.5,name='housing'){return mesh(g,new RoundedBoxGeometry(...s,2,r),m,p,name);}
function cyl(g,r,h,p,m=M.steel,axis='y',n=32,name='cylinder'){const o=mesh(g,new T.CylinderGeometry(r,r,h,n),m,p,name);if(axis==='x')o.rotation.z=Math.PI/2;if(axis==='z')o.rotation.x=Math.PI/2;return o;}
function torus(g,r,t,p,m=M.black,rot=[0,0,0],name='ring'){const o=mesh(g,new T.TorusGeometry(r,t,8,48),m,p,name);o.rotation.set(...rot);return o;}
function screw(g,x,y,z,axis='y'){cyl(g,2.4,1.4,[x,y,z],M.steel,axis,16,'socket_screw');const m=cyl(g,1.05,1.6,[x,y+(axis==='y'?.4:0),z+(axis==='z'?.4:0)],M.rubber,axis,6,'hex_socket');return m;}
function line(g,points,r,ma,name){return mesh(g,new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),Math.max(16,points.length*3),r,7,false),ma,[0,0,0],name);}
function plaque(g,txt,w,h,pos,normal=[0,0,1],bg='#e5e9eb',fg='#23313a',fontsize=32){const c=document.createElement('canvas');c.width=512;c.height=Math.round(512*h/w);const x=c.getContext('2d');x.fillStyle=bg;x.fillRect(0,0,c.width,c.height);x.fillStyle=fg;x.textAlign='center';x.textBaseline='middle';x.font=`${fontsize}px Times New Roman`;x.fillText(txt,c.width/2,c.height/2,c.width-25);const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=4;const o=mesh(g,new T.PlaneGeometry(w,h),new T.MeshStandardMaterial({map:tex,roughness:.55}),pos,'panel_label_'+txt);o.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),new T.Vector3(...normal));return o;}
function feet(g,w,d){for(const x of [-w/2+14,w/2-14])for(const z of [-d/2+14,d/2-14])cyl(g,6,6,[x,3,z],M.rubber);}
function plate(g,w,d,y=4){box(g,[w,8,d],[0,y,0],M.black,2,'mounting_base');for(const x of [-w/2+9,w/2-9])for(const z of [-d/2+9,d/2-9])screw(g,x,y+4,z);}
function fc(group,port){const adapter=createFCAdapter(T,port);if(adapter)group.add(adapter);}
function instrument(g,d,body){const [w,h,z]=d.size;feet(g,w,z);box(g,[w,h-8,z],[0,h/2+4,0],body,4);box(g,[w-7,h-16,2],[0,h/2+4,z/2+.8],M.alum,1,'front_panel');box(g,[w-4,2,z-6],[0,h,0],M.steel,1,'top_cover');for(const x of [-w/2+10,w/2-10])for(const yy of [17,h-10])screw(g,x,yy,z/2+2,'z');for(let i=0;i<9;i++){box(g,[2,h*.43,2],[-w/2-.5,h*.56,-z/2+25+i*7],M.rubber,.4,'vent');box(g,[w*.35,1,2],[-w*.22,h+1,-z*.23+i*5],M.rubber,.3,'top_vent');}
const sw=w*.48,sh=h*.39;box(g,[sw+5,sh+5,2],[-w*.18,h*.55,z/2+2.4],M.rubber,2,'display_bezel');plaque(g,d.shape==='meter'?'OPTICAL POWER':d.id==='osa'?'SPECTRUM':['edfa','raman'].includes(d.id)?'OPTICAL AMPLIFIER':d.id==='wavemeter'?'WAVELENGTH':d.shape==='tunable'?'TUNABLE SOURCE':'OPTICAL SOURCE',sw,sh,[-w*.18,h*.55,z/2+3.6],[0,0,1],'#243a43','#afc7c7',22);
plaque(g,d.code,w*.73,7,[-w*.05,h-10,z/2+3],[0,0,1],'#cbd1d5','#313b42',26);cyl(g,5,4,[-w*.38,18,z/2+4],M.rubber,'z');cyl(g,1.4,1,[-w*.29,18,z/2+4],M.green,'z');for(let i=0;i<3;i++)box(g,[9,4,2],[w*.1+i*14,h*.57,z/2+3],M.dark,.8,'button');
}
export function buildModel(d,options={}){if(d.product){const model=buildProductModel(d,options);model.userData.definition=d.id;return qualityMaterials(model,options.surfaceQuality);}const g=new T.Group();g.name=d.name;const body=mat(options.color||d.color,.58,.4);body.name='editable_housing';const [w,h,z]=d.size;if(d.shape.startsWith('fs_'))buildFreeSpace(g,d,body);else switch(d.shape){
case 'instrument':case 'meter':instrument(g,d,body);break;
case 'tunable':case 'amplifier':instrument(g,d,body);cyl(g,11,9,[w*.35,h*.66,z/2+5],M.black,'z');cyl(g,8,1,[w*.35,h*.66,z/2+10],M.steel,'z');for(let i=0;i<12;i++){const a=i*Math.PI/6;box(g,[1.5,3,.8],[w*.35+8*Math.cos(a),h*.66+8*Math.sin(a),z/2+11],M.dark,.25,'knob_mark');}if(d.shape==='amplifier')for(const xx of [-w/2+5,w/2-5]){box(g,[9,42,8],[xx,49,z/2+8],M.black,3,'rack_handle');}break;
case 'butterfly':{
plate(g,w,z);box(g,[66,13,36],[0,16,0],M.gold,1.5,'butterfly_flange');box(g,[54,16,28],[0,29,0],body,2,'hermetic_case');box(g,[48,1.5,22],[0,37.5,0],M.steel,.6,'hermetic_lid');for(let i=0;i<7;i++){const x=-23+i*7.5;for(const side of [-1,1]){box(g,[2.1,2,15],[x,20,side*24],M.gold,.4,'electrical_pin');box(g,[2.1,12,2],[x,15,side*31],M.gold,.4,'electrical_pin_bend');}}cyl(g,4.2,22,[38,24,0],M.steel,'x');line(g,[[47,24,0],[58,24,0]],.9,M.orange,'diode_pigtail');plaque(g,'PUMP / TEC',40,9,[0,38.5,0],[0,1,0],'#b9c2c7','#22323d',36);break;}
case 'pbs':case 'multiport':case 'circulator4':case 'switchbank':{
plate(g,w+14,z+12);box(g,[w,h-8,z],[0,h/2+4,0],body,2,'multiport_module');box(g,[w-6,1.5,z-6],[0,h+.4,0],M.alum,.7,'cover');for(const x of [-w/2+7,w/2-7])for(const zz of [-z/2+7,z/2-7])screw(g,x,h+1.5,zz);plaque(g,d.code,w*.65,13,[0,h+1.3,0],[0,1,0],'#d2dadd','#273c48',34);
for(let i=0;i<d.ports.length;i++){const p=d.ports[i];const x=p.pos[0]>0?w/2-14:-w/2+14;plaque(g,p.id==='in'?'IN':p.label.replace('通道 ','').replace('端口 ',''),16,6,[x,h+1.4,p.pos[2]],[0,1,0],'#d2dadd','#263845',38);}
if(d.shape==='switchbank'){for(let i=0;i<4;i++){cyl(g,1.7,.8,[-28+i*18,34,z/2+.8],i===0?M.green:M.black,'z',12,'channel_LED');}box(g,[19,5,2],[w*.3,18,z/2+1],M.rubber,.5,'control_port');}
if(d.shape==='circulator4')torus(g,15,.6,[0,h+1.5,0],M.blue,[Math.PI/2,0,0],'circulation_symbol');break;}
case 'squeezer':{
plate(g,w,z);box(g,[w-16,9,z-20],[0,13,0],body,2);for(const xx of [-55,0,55]){box(g,[25,21,36],[xx,27,0],M.black,2,'squeezer_frame');box(g,[16,7,24],[xx,42,0],M.steel,1,'pressure_jaw');cyl(g,4,16,[xx,51,0],M.steel);cyl(g,9,7,[xx,62,0],body);for(let k=0;k<12;k++){const a=k*Math.PI/6;cyl(g,.6,5,[xx+8.8*Math.cos(a),62,8.8*Math.sin(a)],M.dark,'y',8,'knurl');}}
line(g,[[-w/2-8,26,0],[w/2+8,26,0]],.8,M.orange,'fiber_through_squeezers');plaque(g,d.code,w*.75,8,[0,15,z/2+1],[0,0,1],'#34434b','#d8e2e8',30);break;}
case 'depolarizer':{
plate(g,w,z);box(g,[w-8,17,z-8],[0,17,0],body,2);for(const xx of [-31,31]){cyl(g,19,4,[xx,29,0],M.steel);torus(g,15,.9,[xx,32,0],M.blue,[Math.PI/2,0,0],'PM_fiber_section');}line(g,[[-w/2-8,22,0],[-46,32,0],[-30,33,15],[0,32,0],[31,33,-15],[46,32,0],[w/2+8,22,0]],.65,M.blue,'depolarizer_fiber');plaque(g,'PM FIBER SECTIONS',90,7,[0,26,z/2-10],[0,1,0],'#34434b','#d9e0e5',28);break;}
case 'fixedatten':{
plate(g,w,z);cyl(g,8.2,w-12,[0,20,0],M.steel,'x');cyl(g,9.2,25,[0,20,0],body,'x',32,'attenuator_sleeve');for(const x of [-9,-5,5,9])torus(g,9.2,.4,[x,20,0],M.dark,[0,Math.PI/2,0],'grip_ring');plaque(g,'ATT',22,6,[0,29.5,0],[0,1,0],'#34434b','#e2e9ec',40);break;}
case 'delayline':{
plate(g,w,z);box(g,[w-16,13,z-16],[0,16,0],body,2);for(const zz of [-30,30])cyl(g,3,w-38,[0,29,zz],M.steel,'x',20,'linear_guide');box(g,[50,13,80],[20,35,0],M.alum,2,'translation_carriage');for(const xx of [-58,25]){cyl(g,20,5,[xx,45,0],M.black);torus(g,16,1,[xx,48,0],M.orange,[Math.PI/2,0,0],'fiber_guide');}
line(g,[[-w/2-8,30,0],[-76,39,0],[-58,48,16],[-35,48,0],[25,48,-16],[45,45,0],[w/2+8,30,0]],.9,M.orange,'delay_fiber');cyl(g,4,53,[w/2-22,30,-38],M.steel,'x');cyl(g,10,18,[w/2+10,30,-38],M.black,'x');plaque(g,'OPTICAL DELAY',120,9,[-20,24,z/2-9],[0,1,0]);break;}
case 'fibermirror':{
plate(g,w,z);cyl(g,11,64,[0,22,0],body,'x');cyl(g,11.5,4,[34,22,0],M.steel,'x');cyl(g,5.2,22,[-39,22,0],M.steel,'x');plaque(g,'REFLECT',45,7,[0,34,0],[0,1,0],'#34434b','#dce5ea',34);break;}
case 'fbgfilter':case 'fbgsensor':{
plate(g,w,z);for(const xx of [-w/2+21,w/2-21]){box(g,[17,16,27],[xx,17,0],body,1.5);screw(g,xx,26,8);}cyl(g,4.3,w-35,[0,22,0],M.steel,'x');cyl(g,4.6,38,[0,22,0],M.blue,'x',24,'grating_region_annotation');for(let i=-3;i<=3;i++)torus(g,4.7,.3,[i*4,22,0],M.white,[0,Math.PI/2,0],'grating_region_mark');for(const p of d.ports)line(g,[p.pos,[Math.sign(p.pos[0])*(w/2-22),22,0]],.8,M.orange,'FBG_pigtail');if(d.shape==='fbgsensor')cyl(g,5,5,[w/2-12,22,0],M.black,'x');plaque(g,d.code,w*.72,8,[0,9,z/2-10],[0,1,0]);break;}
case 'phasebox':case 'soa':{
plate(g,w+12,z+10);box(g,[w,h-8,z],[0,h/2+4,0],body,2);for(let i=0;i<8;i++)box(g,[w-22,4,2],[0,h+1,-z/2+13+i*8],M.dark,.4,'heatsink_fin');box(g,[w*.58,1,18],[0,h+4,0],M.steel,.5,'identification_plate');plaque(g,d.code,w*.53,11,[0,h+4.6,0],[0,1,0],'#c6cfd5','#23333e',30);for(const x of [-w/2+8,w/2-8])for(const zz of [-z/2+7,z/2-7])screw(g,x,h+1,zz);
if(d.shape==='phasebox'){cyl(g,4.5,11,[0,25,-z/2-5],M.gold,'z',6,'RF_SMA');plaque(g,'RF',20,6,[0,h+3,-z/2+7],[0,1,0]);}else{box(g,[32,10,6],[0,25,-z/2-3],M.rubber,1,'electrical_control');for(let i=0;i<6;i++)cyl(g,.6,3,[-12+i*4.8,25,-z/2-7],M.gold,'z',8,'electrical_pin');}break;}
case 'stretcher':{
plate(g,w,z);cyl(g,39,48,[0,35,0],M.steel,'y',64,'piezo_cylinder');cyl(g,45,5,[0,12,0],M.black);cyl(g,45,5,[0,60,0],M.black);const pts=[[-w/2-8,25,0],[-45,20,0]];for(let i=0;i<=240;i++){const a=Math.PI+i/240*9*Math.PI;pts.push([40.2*Math.cos(a),18+i/240*36,40.2*Math.sin(a)]);}pts.push([65,31,0],[w/2+8,25,0]);line(g,pts,.85,M.orange,'fiber_around_piezo');cyl(g,4,12,[20,25,-z/2-3],M.gold,'z',6,'drive_connector');plaque(g,'PZT',32,12,[0,63,0],[0,1,0],'#252b31','#d9e2e8',32);break;}
case 'balanced':{
plate(g,w+12,z+8);box(g,[w,h-8,z],[0,h/2+4,0],body,3);for(const xx of [-30,30]){cyl(g,13,5,[xx,40,z/2+2],M.steel,'z');plaque(g,xx<0?'IN +':'IN −',27,7,[xx,59,z/2+1],[0,0,1],'#34434b','#dce7ee',34);}plaque(g,'BALANCED RECEIVER',w*.8,8,[0,h-5,z/2+1],[0,0,1],'#34434b','#dce7ee',28);for(const xx of [-w/2+9,w/2-9])screw(g,xx,14,z/2+1,'z');cyl(g,5.5,14,[w/2+5,30,0],M.steel,'x',24,'RF_difference_output');plaque(g,'RF OUT',48,7,[30,h+1,0],[0,1,0]);break;}
case 'portable':{
feet(g,w,z);box(g,[w,h-7,z],[0,h/2+3,0],body,6,'portable_housing');box(g,[w-12,h-18,5],[0,h/2+3,z/2],M.black,4,'shock_bumper');box(g,[w*.7,h*.46,3],[-w*.06,h*.61,z/2+4],M.rubber,3,'screen_bezel');plaque(g,'OTDR / FIBER TEST',w*.67,h*.42,[-w*.06,h*.61,z/2+6],[0,0,1],'#2b3e48','#c8dce2',26);for(let i=0;i<5;i++)box(g,[10,7,3],[-w*.31+i*22,20,z/2+5],M.dark,1,'keypad');for(const x of [-w/2+8,w/2-8])box(g,[8,h*.62,9],[x,h*.5,z/2+3],M.rubber,3,'handgrip');plaque(g,'OPTICAL TEST',100,8,[0,h-9,z/2+4],[0,0,1],'#252b31','#cddae2',29);break;}
case 'rackunit':case 'patchpanel':{
feet(g,w,z);box(g,[w,h-8,z],[0,h/2+4,0],body,3,'rack_body');box(g,[w+22,h-9,3],[0,h/2+4,z/2+1],M.alum,1,'rack_panel');for(const xx of [-w/2-6,w/2+6])for(const yy of [17,h-10])screw(g,xx,yy,z/2+3,'z');for(const p of d.ports){plaque(g,p.id.toUpperCase(),18,6,[p.pos[0],p.pos[1]-12,z/2+3],[0,0,1],'#cbd1d5','#34434b',34);}plaque(g,d.code,w*.78,9,[0,h-10,z/2+3],[0,0,1],'#cbd1d5','#273945',28);
if(d.shape==='rackunit'){box(g,[70,16,2],[0,58,z/2+3],M.rubber,1,'readout_bezel');plaque(g,'OPTICAL INTERROGATOR',66,13,[0,58,z/2+4.2],[0,0,1],'#233d45','#c1d8df',23);for(const xx of [-w/2+16,w/2-16])box(g,[8,42,13],[xx,48,z/2+9],M.black,3,'rack_handle');}break;}
case 'temperature':{
plate(g,w,z);for(const xx of [-35,48]){box(g,[15,18,27],[xx,17,0],M.black,1);screw(g,xx,27,8);}cyl(g,4,98,[16,26,0],M.steel,'x',32,'metal_sensor_probe');cyl(g,9,29,[-42,26,0],M.steel,'x',6,'hex_probe_fitting');cyl(g,3,22,[-65,26,0],M.rubber,'x');cyl(g,4.5,3,[66,26,0],M.alum,'x',24,'probe_tip');plaque(g,'TEMPERATURE',95,7,[0,9,15],[0,1,0]);break;}
case 'pressure':{
plate(g,w,z);box(g,[36,16,48],[17,15,0],body,2);cyl(g,22,55,[17,37,0],M.steel,'x',48,'pressure_body');cyl(g,24,6,[47,37,0],M.black,'x',48,'diaphragm_flange');cyl(g,18,.7,[50.5,37,0],M.alum,'x',48,'pressure_diaphragm');torus(g,19,.8,[51,37,0],M.steel,[0,Math.PI/2,0],'seal_ring');for(let k=0;k<6;k++){const a=k*Math.PI/3;cyl(g,2,2,[51,37+21*Math.cos(a),21*Math.sin(a)],M.steel,'x',12,'flange_screw');}cyl(g,7,26,[-29,37,0],M.steel,'x',6,'fiber_feedthrough');cyl(g,2.5,19,[-51,37,0],M.rubber,'x');break;}
case 'sensingcoil':{
plate(g,w,z);for(const xx of [-62,62])for(const zz of [-62,62])box(g,[10,14,10],[xx,14,zz],M.black,1,'spool_support');torus(g,63,7,[0,16,0],M.black,[Math.PI/2,0,0],'lower_ring');torus(g,63,5,[0,40,0],body,[Math.PI/2,0,0],'upper_ring');const points=[[-100.5,22,-20],[-72,17,-18]];for(let i=0;i<=288;i++){const a=Math.PI+i/288*8*Math.PI;points.push([66*Math.cos(a),19+i/288*16,66*Math.sin(a)]);}points.push([-72,29,18],[-100.5,22,20]);line(g,points,1,M.orange,'continuous_sensing_fiber');plaque(g,'FIBER SENSING COIL',130,10,[0,9,76],[0,1,0]);break;}
case 'splice':{
plate(g,w,z);for(const x of [-37,37]){box(g,[14,13,24],[x,14,0],M.black,1);box(g,[10,3,20],[x,22,0],M.steel,.5);}cyl(g,3.2,60,[0,20,0],M.white,'x',20,'heatshrink_splice_sleeve');cyl(g,1.2,130,[0,20,0],M.orange,'x',12,'fiber_pigtails');plaque(g,'SPLICE',43,7,[0,9,14],[0,1,0]);break;}
case 'rotary':{
plate(g,w,z);for(const xx of [-38,38]){box(g,[18,26,45],[xx,22,0],body,2,'bearing_pillow_block');cyl(g,20,20,[xx,38,0],M.black,'x');screw(g,xx,15,28);}cyl(g,17,78,[0,38,0],M.steel,'x',48,'rotary_barrel');for(const xx of [-18,18])cyl(g,18.5,8,[xx,38,0],M.dark,'x',32,'rotary_collar');cyl(g,5,130,[0,38,0],M.steel,'x');plaque(g,'ROTARY JOINT',85,8,[0,9,z/2-10],[0,1,0]);break;}
case 'oven':{
feet(g,w,z);box(g,[w,h-9,z],[0,h/2+4,0],body,4,'insulated_oven');box(g,[w-10,9,z-10],[0,h-2,0],M.alum,2,'oven_lid');box(g,[70,10,11],[0,h+8,0],M.black,3,'lid_handle');for(const xx of [-w/2+12,w/2-12])for(const zz of [-z/2+12,z/2-12])screw(g,xx,h+3,zz);box(g,[72,27,3],[-35,35,z/2+2],M.rubber,2,'temperature_controller');plaque(g,'TEMPERATURE CONTROL',67,22,[-35,35,z/2+4],[0,0,1],'#253b44','#b9d2db',24);cyl(g,9,7,[57,33,z/2+5],M.black,'z');plaque(g,'SAMPLE OVEN',110,10,[0,77,z/2+1],[0,0,1],'#34434b','#dee6eb',30);cyl(g,7,w+2,[0,60,0],M.steel,'x',32,'fiber_feedthrough_tube');break;}
case 'vblock':{
plate(g,w,z);box(g,[70,18,48],[0,18,0],body,2);const a=box(g,[52,9,17],[0,34,-10],M.steel,1,'V_groove_flank_A');a.rotation.x=-Math.PI/5;const b=box(g,[52,9,17],[0,34,10],M.steel,1,'V_groove_flank_B');b.rotation.x=Math.PI/5;for(const xx of [-33,33]){cyl(g,3,28,[xx,29,0],M.steel);cyl(g,5,5,[xx,45,0],M.black);}box(g,[75,5,8],[0,43,0],M.black,1,'clamp_bridge');break;}
case 'rail':{
plate(g,w,z);box(g,[w-14,12,55],[0,17,0],body,2,'rail_body');for(const zz of [-19,19])cyl(g,3.3,w-27,[0,28,zz],M.steel,'x',24,'precision_rod');for(const xx of [-66,62]){box(g,[42,12,68],[xx,33,0],M.alum,2,'sliding_carriage');box(g,[29,16,31],[xx,47,0],M.black,1.5,'fiber_clamp');cyl(g,4,11,[xx,58,0],M.steel);cyl(g,7,5,[xx,65,0],M.black);screw(g,xx-12,41,24);screw(g,xx+12,41,-24);}plaque(g,'ALIGNMENT RAIL',120,8,[0,15,z/2+1],[0,0,1],'#34434b','#dbe5ec',29);break;}
case 'module':case 'passive':case 'eom':case 'attenuator':
plate(g,w+14,z+12,4);box(g,[w,h-8,z],[0,h/2+4,0],body,2);for(const x of [-w/2+7,w/2-7])for(const zz of [-z/2+7,z/2-7])screw(g,x,h+.5,zz);plaque(g,d.code,w*.78,12,[0,h+1,0],[0,1,0],'#d7dde0','#263744',29);
if(d.shape==='attenuator'){cyl(g,17,20,[0,h+10,-16],M.black);for(let i=0;i<20;i++){let a=i*Math.PI/10;cyl(g,1,17,[17*Math.cos(a),h+10,-16+17*Math.sin(a)],M.dark);}plaque(g,'ATTENUATION',70,7,[0,h*.55,z/2+1]);}
if(d.shape==='eom'){for(const x of [-30,30]){cyl(g,4,12,[x,h/2,-z/2-4],M.gold,'z',6,'RF_SMA');cyl(g,1,2,[x,h/2,-z/2-11],M.gold,'z');}plaque(g,'RF',13,5,[-30,h+1,-z/2+10],[0,1,0]);}break;
case 'inline':plate(g,w+10,z,4);cyl(g,8,w-10,[0,22,0],M.steel,'x');for(const x of [-w*.32,w*.32]){box(g,[12,20,25],[x,18,0],body,1);screw(g,x,29,8);}plaque(g,d.code,w*.8,8,[0,31,0],[0,1,0],'#cbd1d5','#263744',30);break;
case 'paddle':{
plate(g,245,90,4);box(g,[215,12,64],[0,14,0],body,2);let fiber=[[-130,32,0],[-110,42,0]];
for(let i=0;i<3;i++){const xx=(i-1)*67;const paddle=new T.Group();paddle.position.set(xx,43,0);paddle.rotation.x=[-.22,.2,-.15][i];g.add(paddle);box(paddle,[10,22,36],[0,-15,0],M.black,2);cyl(paddle,8,18,[0,-8,0],M.steel,'x');torus(paddle,28,5,[0,23,0],M.black,[0,Math.PI/2,0],'paddle_frame');box(paddle,[10,27,12],[0,57,0],body,2,'paddle_handle');cyl(paddle,9,10,[14,-5,0],M.black,'x');
for(let j=0;j<=72;j++){const a=-Math.PI/2+j/72*Math.PI*2;const v=new T.Vector3(6,23+28*Math.sin(a),28*Math.cos(a));v.applyEuler(paddle.rotation).add(paddle.position);fiber.push(v.toArray());}}
fiber.push([110,42,0],[130,32,0]);line(g,fiber,.8,M.orange,'continuous_controller_fiber');plaque(g,d.code,140,8,[0,21,40],[0,0,1],'#252b31','#d8dee0',28);break;}
case 'helix':{plate(g,w,z,4);const span=d.id==='qwp'?74:148.2;for(const xx of [-span/2-12,span/2+12]){box(g,[16,28,35],[xx,20,0],body,2);cyl(g,13,18,[xx,38,0],M.black,'x');screw(g,xx,35,15);}cyl(g,10,span+35,[0,38,0],M.alum,'x');let points=[[-w/2-8,38,0],[-span/2-9,38,10.45]];const n=span/42.2;for(let i=0;i<=150;i++){let t=i/150;points.push([-span/2+span*t,38+10.45*Math.sin(t*n*2*Math.PI),10.45*Math.cos(t*n*2*Math.PI)]);}points.push([span/2+12,38,0],[w/2+8,38,0]);line(g,points,.45,mat(0x934c88,.15,.4),'SHB_helical_fiber');plaque(g,d.code,90,10,[0,9,z/2-12],[0,1,0]);break;}
case 'sample':plate(g,w,z,4);for(const x of [-65,65]){box(g,[34,20,36],[x,18,0],body,2);box(g,[25,7,24],[x,31,0],M.alum,1);screw(g,x-7,36,7);screw(g,x+7,36,-7);}line(g,[[-108,32,0],[108,32,0]],.65,mat(0x986b9e),'self_made_fiber');plaque(g,d.code,110,10,[0,9,24],[0,1,0]);break;
case 'analyzer':feet(g,w,z);box(g,[w,h-8,z],[0,h/2+4,0],body,4);box(g,[w-4,h-13,2],[0,h/2+4,z/2+1],M.black,1);for(const x of [-w/2+12,w/2-12])for(const yy of [20,h-12])screw(g,x,yy,z/2+3,'z');plaque(g,d.code,105,10,[0,67,z/2+2.2],[0,0,1],'#252b31','#dde3e6',30);cyl(g,12,9,[0,42,z/2+3],M.steel,'z');cyl(g,8,11,[0,42,z/2+4],M.black,'z');cyl(g,1.8,1,[50,22,z/2+3],M.green,'z');for(let i=0;i<9;i++)box(g,[2,30,2],[-w/2-.4,42,-40+i*7],M.rubber,.4);break;
case 'detector':plate(g,w+8,z+5);box(g,[w,h-8,z],[0,h/2+4,0],body,3);cyl(g,15,7,[0,38,z/2+2],M.steel,'z');plaque(g,'FIBER DETECTOR',72,8,[0,57,z/2+1.5],[0,0,1],'#34434b','#e0e6e9',29);cyl(g,5,16,[w/2+6,28,0],M.steel,'x',24,'BNC_electrical');cyl(g,2,1,[w/2+15,28,0],M.rubber,'x');break;
case 'adapter':plate(g,65,45);box(g,[18,22,25],[0,18,0],body,1);cyl(g,6,65,[0,24,0],M.steel,'x');for(let xx of [-12,12])cyl(g,7,3,[xx,24,0],M.steel,'x',6);break;
case 'spool':cyl(g,65,7,[0,4,0],M.black);cyl(g,35,28,[0,22,0],body);cyl(g,65,6,[0,38,0],M.black);for(const x of [-46,46])screw(g,x,42,0);{let p=[[-78,18,0],[-58,15,0]];for(let i=0;i<240;i++){let a=i/239*8*Math.PI;p.push([48*Math.cos(a),12+i/239*20,48*Math.sin(a)]);}p.push([78,18,0]);line(g,p,1.05,M.orange,'coiled_fiber');}plaque(g,'FIBER STORAGE',70,12,[0,41.3,0],[0,1,0],'#252b31','#dce2e6',28);break;
case 'clamp':plate(g,w,z);box(g,[46,19,35],[0,17,0],body,2);box(g,[40,9,28],[0,31,0],M.alum,1);for(const x of [-12,12])screw(g,x,36,7);break;
case 'stage':plate(g,w,z);box(g,[w-10,10,z-10],[0,17,0],body,2);box(g,[w-24,10,z-24],[0,30,0],M.steel,2);box(g,[w-30,8,z-28],[0,41,0],M.black,1);for(const x of [-28,0,28])for(const zz of [-22,22])cyl(g,2,1,[x,46,zz],M.rubber);box(g,[35,16,32],[0,53,0],M.dark,2);cyl(g,5,42,[w/2+5,22,0],M.steel,'x');cyl(g,8,18,[w/2+30,22,0],M.black,'x');break;
default:box(g,[w,h,z],[0,h/2,0],body);break;
}for(const p of d.ports)fc(g,p);g.userData.definition=d.id;return qualityMaterials(g,options.surfaceQuality);}
export function buildBoard(width,depth,quality){const g=new T.Group();g.name='optical_breadboard_25mm';const s=mat(0xaeb6bd,.65,.47);box(g,[width,40,depth],[0,-20,0],s,4,'breadboard_body');box(g,[width+1,3,depth+1],[0,-2,0],M.steel,1,'steel_top');
// Printed recess texture: economical at overview scale, not a manufactured tapped-hole model.
const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='#bfc5ca';ctx.fillRect(0,0,128,128);ctx.fillStyle='#666e73';ctx.beginPath();ctx.arc(64,64,14,0,Math.PI*2);ctx.fill();ctx.fillStyle='#303940';ctx.beginPath();ctx.arc(64,64,10,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#d9dfe2';ctx.lineWidth=2;ctx.beginPath();ctx.arc(64,64,14,Math.PI*.1,Math.PI*.9);ctx.stroke();const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(width/25,depth/25);t.colorSpace=T.SRGBColorSpace;t.anisotropy=8;const top=mesh(g,new T.PlaneGeometry(width-2,depth-2),new T.MeshStandardMaterial({map:t,metalness:.45,roughness:.57}),[0,1,0],'25mm_hole_pattern');top.rotation.x=-Math.PI/2;
for(const x of [-width/2+65,width/2-65])for(const z of [-depth/2+65,depth/2-65])cyl(g,32,25,[x,-52,z],M.rubber, 'y',24,'isolation_foot');plaque(g,`OPTICAL BREADBOARD   |   25 mm GRID`,300,12,[0,-21,depth/2+1],[0,0,1],'#aeb6bd','#34434b',25);return qualityMaterials(g,quality);}
// Free-space components use a common 80 mm layout axis. These are editable,
// purpose-built generic meshes, not vendor CAD or an optical propagation model.
function fsSupport(g,d,body,width=66,depth=70,stemTop=56){
plate(g,width,depth);cyl(g,10,27,[0,21.5,0],M.black);cyl(g,6,stemTop-28,[0,(stemTop+28)/2,0],M.steel);
cyl(g,11,5,[0,33,0],body);cyl(g,4,15,[0,25,14],M.black,'z');cyl(g,5,5,[0,25,23],M.steel,'z');
plaque(g,d.code,width-12,6,[0,8.7,depth/2-10],[0,1,0],'#252b31','#d1dce1',24);
}
function fsRing(g,body,r=28,x=0){
torus(g,r,4,[x,80,0],body,[0,Math.PI/2,0],'optical_mount_ring');
torus(g,r-3.8,.9,[x-4.1,80,0],M.steel,[0,Math.PI/2,0],'retaining_ring');
box(g,[12,15,15],[x,48,0],body,1,'post_adapter');
}
function fsLens(g,r=24,kind='convex',x=0,material=M.glass){
const profile=[],steps=24;
for(let i=0;i<=steps;i++){const t=i/steps;profile.push(new T.Vector2(r*t,kind==='concave'?-1.2-3*t*t:-4+3*t*t));}
for(let i=steps;i>=0;i--){const t=i/steps;profile.push(new T.Vector2(r*t,kind==='concave'?1.2+3*t*t:4-3*t*t));}
const optic=mesh(g,new T.LatheGeometry(profile,64),material,[x,80,0],kind+'_optical_surface');optic.rotation.z=-Math.PI/2;return optic;
}
function fsAperture(g,x,r=16,material=M.black,y=80,z=0){
torus(g,r,3,[x,y,z],material,[0,Math.PI/2,0],'aperture_rim');
torus(g,r-2,.65,[x-.4,y,z],M.steel,[0,Math.PI/2,0],'aperture_inner_rim');
}
function fsTube(g,outer,inner,length,x,material=M.black){
const profile=[new T.Vector2(outer,-length/2),new T.Vector2(outer,length/2),new T.Vector2(inner,length/2),new T.Vector2(inner,-length/2),new T.Vector2(outer,-length/2)];
const tube=mesh(g,new T.LatheGeometry(profile,64),material,[x,80,0],'hollow_optical_barrel');tube.rotation.z=-Math.PI/2;return tube;
}
function fsMirrorHead(g,body,turn=false,grating=false){
const head=new T.Group();head.position.y=80;head.rotation.y=turn?Math.PI/4:0;g.add(head);
for(const y of [-26,26])box(head,[8,6,58],[7,y,0],body,1,'kinematic_frame');
for(const z of [-26,26])box(head,[8,47,6],[7,0,z],body,1,'kinematic_frame');
if(grating){box(head,[2,41,41],[1,0,0],M.mirror,.5,'ruled_grating_substrate');for(let j=-17;j<=17;j++)box(head,[.25,37,.22],[-.15,0,j],M.dark,.05,'schematic_grating_groove');}
else{cyl(head,24,2,[1,0,0],M.steel,'x',64,'mirror_substrate');cyl(head,23.5,.35,[-.18,0,0],M.mirror,'x',64,'reflective_surface');}
for(const [y,z]of [[23,23],[-23,23]]){cyl(head,3.5,17,[17,y,z],M.steel,'x');cyl(head,6,7,[26,y,z],M.black,'x');for(let k=0;k<8;k++){const a=k*Math.PI/4;cyl(head,.45,5,[26,y+5.8*Math.cos(a),z+5.8*Math.sin(a)],M.steel,'x',6,'adjuster_knurl');}}
box(g,[17,14,18],[0,49,0],body,1,'mirror_post_adapter');
return head;
}
function fsWireCube(g,size,center){
const [x,y,z]=center,r=size/2;
for(const a of [-r,r])for(const b of [-r,r]){box(g,[size,.55,.55],[x,y+a,z+b],M.steel,.1,'glass_edge');box(g,[.55,size,.55],[x+a,y,z+b],M.steel,.1,'glass_edge');box(g,[.55,.55,size],[x+a,y+b,z],M.steel,.1,'glass_edge');}
}
function fsElectrical(g,x,y,z,axis='z',name='electrical_output'){
cyl(g,4.5,10,[x,y,z],M.gold,axis,6,name);cyl(g,2,12,[x,y,z],M.rubber,axis,12,name+'_socket');
}
function fsPixelWindow(g,x,y,z,width,height,kind){
const c=document.createElement('canvas');c.width=384;c.height=256;const ctx=c.getContext('2d');ctx.fillStyle=kind==='dmd'?'#80938c':'#39435c';ctx.fillRect(0,0,c.width,c.height);ctx.strokeStyle=kind==='dmd'?'#c2d7cd':'#79758d';ctx.lineWidth=1;
const step=kind==='dmd'?12:8;for(let i=0;i<c.width;i+=step){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,c.height);ctx.stroke();}for(let i=0;i<c.height;i+=step){ctx.beginPath();ctx.moveTo(0,i);ctx.lineTo(c.width,i);ctx.stroke();}
const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;const pane=mesh(g,new T.PlaneGeometry(width,height),new T.MeshStandardMaterial({map:tex,metalness:.45,roughness:.22,side:T.DoubleSide}),[x,y,z],kind+'_schematic_pixel_array');pane.rotation.y=-Math.PI/2;
}
function buildFreeSpace(g,d,body){
const [w,h,depth]=d.size;
switch(d.shape){
case 'fs_cwlaser':case 'fs_fslaser':case 'fs_diode':{
plate(g,w+8,depth+8);box(g,[w-12,10,depth-6],[0,16,0],M.alum,2,'laser_baseplate');
const isPulse=d.shape==='fs_fslaser',isDiode=d.shape==='fs_diode';
if(isDiode){box(g,[96,45,76],[-5,53,0],body,2,'diode_heatsink');for(let i=0;i<11;i++)box(g,[88,4,76],[-5,33+i*6,0],M.dark,.5,'cooling_fin');cyl(g,20,64,[17,80,0],M.steel,'x');cyl(g,17,7,[52,80,0],M.black,'x');fsAperture(g,65,9);cyl(g,6,.6,[66,80,0],M.glass,'x',40,'laser_output_window');fsElectrical(g,-49,57,42,'z','diode_drive');}
else{
box(g,[w-8,isPulse?94:75,depth-10],[0,isPulse?71:62.5,0],body,4,'sealed_laser_head');
box(g,[w-15,3,depth-18],[0,isPulse?120:101,0],M.alum,1,'laser_top_cover');
for(const x of [-w/2+13,w/2-13])for(const z of [-depth/2+13,depth/2-13])screw(g,x,isPulse?122:103,z);
for(let i=0;i<(isPulse?17:12);i++)box(g,[2,isPulse?50:36,2],[-w/2+20+i*12,65,depth/2-4],M.rubber,.3,'laser_cooling_slot');
const outlet=d.ports[0].pos[0];cyl(g,14,14,[outlet-8,80,0],M.black,'x');fsAperture(g,outlet,10);cyl(g,7,.6,[outlet+.5,80,0],M.glass,'x',48,'laser_output_window');
plaque(g,d.code,w*.7,17,[0,isPulse?122:103,0],[0,1,0],'#cbd1d5','#263c49',31);
cyl(g,2,1,[-w*.32,43,depth/2-3],M.green,'z',16,'status_indicator');
if(isPulse){for(const x of [-w/2+18,w/2-18]){box(g,[7,17,7],[x,128,-40],M.black,1,'cover_handle_foot');box(g,[7,17,7],[x,128,40],M.black,1,'cover_handle_foot');box(g,[8,8,87],[x,137,0],M.black,2,'cover_handle');}fsElectrical(g,-w/2+38,40,-depth/2-2,'z','synchronization_connector');}
}
break;}
case 'fs_collimator':case 'fs_fiber_collimator':case 'fs_objective':case 'fs_expander':{
fsSupport(g,d,body,w-12,72,58);const isExpand=d.shape==='fs_expander',isObj=d.shape==='fs_objective',isFiber=d.shape==='fs_fiber_collimator';
if(isExpand){
fsTube(g,16,10,57,-58,M.black);fsTube(g,20,14,66,-3,body);fsTube(g,27,21,56,58,M.black);
for(const x of [-32,25]){fsTube(g,22,14,9,x,M.steel);for(let j=0;j<24;j++){const a=j*Math.PI/12;cyl(g,.6,8,[x,80+22*Math.cos(a),22*Math.sin(a)],M.dark,'x',6,'focus_ring_knurl');}}
fsAperture(g,-91,11);fsAperture(g,91,23);cyl(g,20,.7,[91,80,0],M.glass,'x',64,'output_optic');cyl(g,9,.7,[-91,80,0],M.glass,'x',48,'input_optic');
}else if(isObj){
fsTube(g,24,18,43,-30,M.black);fsTube(g,20,12,29,6,M.steel);fsTube(g,15,8,25,33,M.alum);fsTube(g,10,7,7,50,M.black);
for(const x of [-47,-41,-35])torus(g,24,.5,[x,80,0],M.dark,[0,Math.PI/2,0],'objective_grip');torus(g,20.4,1.3,[0,80,0],M.blue,[0,Math.PI/2,0],'objective_identification_band');
cyl(g,7,.7,[56,80,0],M.glass,'x',48,'objective_front_lens');cyl(g,17,.7,[-56,80,0],M.glass,'x',48,'objective_rear_lens');
}else{
fsTube(g,19,16,98,4,body);fsTube(g,23,16,11,43,M.black);fsTube(g,22,14,12,-36,M.steel);
for(const x of [-41,-37,-33])torus(g,22,.45,[x,80,0],M.dark,[0,Math.PI/2,0],'focusing_threads');
fsAperture(g,59,18);cyl(g,16,.6,[59,80,0],M.glass,'x',64,'collimating_lens');
if(isFiber){fsTube(g,9,2,15,-53,M.black);fsTube(g,5,1.3,9,-59,M.steel);}else{fsAperture(g,-59,14);cyl(g,12,.6,[-59,80,0],M.glass,'x',48,'entrance_lens');}
}
for(const x of isExpand?[-50,48]:[-25,25])box(g,[12,22,17],[x,52,0],body,1,'barrel_support');break;}
case 'fs_mirror':case 'fs_turnmirror':case 'fs_grating':{
fsSupport(g,d,body,72,76,56);fsMirrorHead(g,body,d.shape!=='fs_mirror',d.shape==='fs_grating');break;}
case 'fs_lens_convex':case 'fs_lens_concave':case 'fs_achromat':case 'fs_cyl_lens':{
fsSupport(g,d,body);if(d.shape==='fs_cyl_lens'){
for(const z of [-27,27])box(g,[12,54,7],[0,80,z],body,1,'cylindrical_lens_holder');for(const y of [53,107])box(g,[12,7,54],[0,y,0],body,1,'cylindrical_lens_holder');
const profile=new T.Shape();profile.moveTo(-23,-1);for(let i=0;i<=32;i++){const s=-23+i/32*46;profile.lineTo(s,4.6-3.6*(s/23)**2);}profile.lineTo(23,-1);profile.closePath();
const shape=new T.ExtrudeGeometry(profile,{depth:40,bevelEnabled:false,steps:1});shape.translate(0,0,-20);const optic=mesh(g,shape,M.glass,[0,80,0],'cylindrical_curved_glass');optic.quaternion.setFromAxisAngle(new T.Vector3(1,1,1).normalize(),-2*Math.PI/3);
}else{fsRing(g,body);if(d.shape==='fs_achromat'){const a=fsLens(g,24,'convex',-2,M.glass);a.scale.y=.65;const b=fsLens(g,24,'concave',2.4,M.violetGlass);b.scale.y=.65;torus(g,24.1,.5,[0,80,0],M.steel,[0,Math.PI/2,0],'cemented_doublet_edge');}else fsLens(g,24,d.shape==='fs_lens_concave'?'concave':'convex');}break;}
case 'fs_pbs':case 'fs_bs_cube':{
fsSupport(g,d,body,72,72,52);box(g,[44,10,44],[0,57,0],body,1,'cube_pedestal');box(g,[36,36,36],[0,80,0],M.glass,.1,'glass_cube');fsWireCube(g,36,[0,80,0]);
const surface=box(g,[.35,35,50],[0,80,0],d.shape==='fs_pbs'?M.violetGlass:M.filterGlass,.05,'diagonal_splitting_interface');surface.rotation.y=Math.PI/4;
for(const z of [-22,22])box(g,[44,4,5],[0,62,z],M.steel,.5,'cube_retaining_lip');
plaque(g,d.shape==='fs_pbs'?'P B S':'B S',31,8,[0,99,0],[0,1,0],'#dee7eb','#3d5272',34);break;}
case 'fs_bs_plate':case 'fs_dichroic':{
fsSupport(g,d,body,74,76);const head=new T.Group();head.position.y=80;head.rotation.y=Math.PI/4;g.add(head);
torus(head,28,4,[0,0,0],body,[0,Math.PI/2,0],'plate_mount');cyl(head,24,1.5,[0,0,0],d.shape==='fs_dichroic'?M.violetGlass:M.glass,'x',64,'thin_coated_plate');
torus(head,24.5,.6,[-1,0,0],M.steel,[0,Math.PI/2,0],'plate_retainer');box(g,[14,16,14],[0,48,0],body,1,'plate_post_adapter');break;}
case 'fs_qwp':case 'fs_hwp':case 'fs_polarizer':case 'fs_nd':{
fsSupport(g,d,body);fsRing(g,body,d.shape==='fs_nd'?28:32);
const isND=d.shape==='fs_nd',isPolarizer=d.shape==='fs_polarizer';
cyl(g,isND?24:27,2.2,[0,80,0],isND?M.filterGlass:isPolarizer?M.violetGlass:M.glass,'x',64,'optical_plate');
if(!isND){
for(let i=0;i<36;i++){const a=i*Math.PI/18;const tick=box(g,[.7,i%3===0?4:2,.6],[-4.5,80+33*Math.cos(a),33*Math.sin(a)],M.white,.1,'rotation_scale_tick');tick.rotation.x=a;}
const axis=box(g,[.4,42,.5],[-1.5,80,0],M.gold,.1,'fast_or_transmission_axis_mark');axis.rotation.x=d.shape==='fs_hwp'?Math.PI/4:0;
cyl(g,3,17,[0,83,42],M.steel,'z');cyl(g,6,7,[0,83,52],M.black,'z');
if(isPolarizer)for(let z=-20;z<=20;z+=5){const len=2*Math.sqrt(24**2-z**2);box(g,[.15,len,.2],[-1.25,80,z],M.dark,.03,'schematic_polarizer_axis_lines');}
}break;}
case 'fs_iris':case 'fs_pinhole':{
fsSupport(g,d,body,72,76);fsRing(g,body,30);
if(d.shape==='fs_iris'){
for(let blade=0;blade<8;blade++){
const shape=new T.Shape();for(let j=0;j<=12;j++){const a=blade*Math.PI/4+j/12*Math.PI*.72;const r=j<4?8+((j/3)*15):25;const y=Math.cos(a)*r,z=Math.sin(a)*r;j===0?shape.moveTo(y,z):shape.lineTo(y,z);}shape.closePath();
const leaf=mesh(g,new T.ShapeGeometry(shape),blade%2?M.dark:M.black,[blade*.08-1,80,0],'iris_blade');leaf.rotation.y=Math.PI/2;
}
torus(g,8,.5,[-1.3,80,0],M.steel,[0,Math.PI/2,0],'iris_aperture_edge');cyl(g,2,20,[0,93,32],M.steel,'z');cyl(g,4,5,[0,93,44],M.black,'z');
}else{
const washer=new T.Shape();washer.absarc(0,0,25,0,Math.PI*2);const hole=new T.Path();hole.absarc(0,0,1.6,0,Math.PI*2,true);washer.holes.push(hole);
const pin=mesh(g,new T.ShapeGeometry(washer,64),M.steel,[0,80,0],'pinhole_plate');pin.rotation.y=Math.PI/2;
for(const [y,z]of [[80,37],[117,0]]){cyl(g,4,14,[0,y,z],M.steel,'x');cyl(g,6,8,[10,y,z],M.black,'x');}
}break;}
case 'fs_filterwheel':{
fsSupport(g,d,body,78,115,45);const wheelY=80,wheelZ=34;
const wheelProfile=new T.Shape();wheelProfile.absarc(0,0,53,0,Math.PI*2);for(let i=0;i<6;i++){const a=Math.PI+i*Math.PI/3,hole=new T.Path();hole.absarc(-34*Math.cos(a),34*Math.sin(a),12,0,Math.PI*2,true);wheelProfile.holes.push(hole);}const wheelGeo=new T.ExtrudeGeometry(wheelProfile,{depth:7,bevelEnabled:false,curveSegments:48});wheelGeo.rotateY(Math.PI/2);mesh(g,wheelGeo,body,[-3.5,wheelY,wheelZ],'filter_wheel_with_through_apertures');cyl(g,10,12,[0,wheelY,wheelZ],M.steel,'x');cyl(g,6,5,[-9,wheelY,wheelZ],M.black,'x');
for(let i=0;i<6;i++){const a=Math.PI+i*Math.PI/3,yy=wheelY+34*Math.sin(a),zz=wheelZ+34*Math.cos(a);torus(g,13,1.5,[-.2,yy,zz],M.rubber,[0,Math.PI/2,0],'filter_cell');cyl(g,11,2,[-3,yy,zz],i===3?M.glass:i%2?M.violetGlass:M.filterGlass,'x',48,'filter_disk');torus(g,12,.8,[-4.8,yy,zz],M.steel,[0,Math.PI/2,0],'filter_retainer');}
box(g,[27,38,29],[20,52,38],M.black,2,'filter_wheel_motor');cyl(g,3,11,[36,56,40],M.gold,'x',6,'motor_control');break;}
case 'fs_prism':{
fsSupport(g,d,body,70,70,50);box(g,[46,12,46],[0,56,0],body,1,'prism_cradle');
const triangle=new T.Shape();triangle.moveTo(-18,-18);triangle.lineTo(-18,18);triangle.lineTo(18,18);triangle.closePath();
const geo=new T.ExtrudeGeometry(triangle,{depth:36,bevelEnabled:false});geo.rotateX(Math.PI/2);geo.translate(0,98,0);mesh(g,geo,M.glass,[0,0,0],'right_angle_prism');
for(const y of [62,98])line(g,[[-18,y,-18],[-18,y,18],[18,y,18],[-18,y,-18]],.45,M.steel,'prism_edges');
break;}
case 'fs_aom':case 'fs_eom':{
fsSupport(g,d,body,118,80,48);box(g,[98,15,61],[0,55,0],M.alum,2,'crystal_module_base');
for(const x of [-42,42]){for(const yy of [59,101])box(g,[12,7,50],[x,yy,0],body,1,'open_crystal_end_mount');for(const zz of [-22,22])box(g,[12,38,6],[x,80,zz],body,1,'open_crystal_end_mount');fsAperture(g,x,14,body);}
box(g,[70,20,24],[0,80,0],d.shape==='fs_aom'?M.glass:M.violetGlass,1,'active_optical_crystal');
if(d.shape==='fs_aom'){box(g,[45,18,8],[0,80,-18],M.gold,1,'piezoelectric_transducer');fsElectrical(g,5,80,-33,'z','RF_input');box(g,[40,3,22],[0,68,0],M.steel,.5,'acoustic_absorber_support');}
else{for(const y of [66,94])box(g,[66,5,30],[0,y,0],M.gold,.6,'electro_optic_electrode');for(const z of [-26,26])fsElectrical(g,10,101,z,'y','voltage_electrode');}
for(const x of [-56,56])cyl(g,10,.5,[x,80,0],M.glass,'x',48,'AR_window');break;}
case 'fs_slm':case 'fs_dmd':{
fsSupport(g,d,body,100,120,45);const isDmd=d.shape==='fs_dmd',frontX=isDmd?-35:-30;
box(g,[68,85,116],[frontX+35,85,0],body,4,'spatial_modulator_housing');box(g,[4,66,96],[frontX+1,80,0],M.alum,1,'display_faceplate');
box(g,[3,48,68],[frontX-.8,80,0],M.rubber,1,'pixel_array_bezel');fsPixelWindow(g,frontX-2.5,80,0,62,42,isDmd?'dmd':'slm');
for(const y of [54,106])for(const z of [-39,39])cyl(g,2,1.6,[frontX-2,y,z],M.steel,'x',16,'panel_screw');
for(let i=0;i<10;i++)box(g,[20,3,100],[frontX+69,49+i*7,0],M.dark,.4,'modulator_heatsink_fin');
box(g,[7,16,35],[frontX+74,70,-32],M.rubber,1,'control_socket');plaque(g,isDmd?'DMD':'SLM',54,13,[frontX+31,129,0],[0,1,0],'#cbd1d5','#334853',40);break;}
case 'fs_delayline':{
plate(g,240,130);box(g,[220,12,100],[0,18,0],body,2,'delay_rail');for(const z of [-43,43])cyl(g,4,212,[0,32,z],M.steel,'x',24,'linear_guide_rod');
box(g,[83,15,104],[43,42,0],M.alum,2,'moving_carriage');for(const z of [-45,45])for(const x of [14,72])screw(g,x,50,z);
for(const z of [-25,25]){cyl(g,5,28,[43,61,z],M.steel);const mirror=cyl(g,19,2,[43,80,z],M.mirror,'x',48,'return_mirror');mirror.rotation.y=z<0?Math.PI/4:-Math.PI/4;torus(g,20,2,[43,80,z],M.black,[0,Math.PI/2+(z<0?Math.PI/4:-Math.PI/4),0],'return_mirror_retainer');}
for(const z of [-25,25]){cyl(g,4,39,[-100,57,z],M.steel);fsAperture(g,-100,14,body,80,z);}
cyl(g,4,197,[0,31,0],M.steel,'x',24,'lead_screw');cyl(g,11,20,[123,31,0],M.black,'x');plaque(g,'TRANSLATION / OPTICAL DELAY',170,9,[-5,25,52],[0,1,0],'#34434b','#e0e7eb',26);break;}
case 'fs_dump':{
fsSupport(g,d,body,88,80,50);cyl(g,27,74,[-2,80,0],M.black,'x',64,'beam_dump_body');
for(let x=-25;x<=30;x+=9)torus(g,28,2,[x,80,0],M.dark,[0,Math.PI/2,0],'dump_cooling_fin');
cyl(g,23,.6,[-43,80,0],M.rubber,'x',64,'black_absorbing_cavity');torus(g,24,3,[-44,80,0],M.black,[0,Math.PI/2,0],'dump_entrance');
const cone=mesh(g,new T.ConeGeometry(18,25,48),M.rubber,[-25,80,0],'internal_absorbing_cone');cone.rotation.z=Math.PI/2;break;}
case 'fs_shutter':{
fsSupport(g,d,body,88,90);fsRing(g,body,28);box(g,[30,45,35],[22,70,32],M.black,2,'shutter_solenoid');
cyl(g,5,13,[5,92,29],M.steel,'x');const blade=box(g,[1.5,34,33],[0,111,29],M.dark,.8,'open_shutter_blade');blade.rotation.x=-.45;
fsElectrical(g,32,65,53,'z','shutter_drive');break;}
case 'fs_cmos':case 'fs_ccd':case 'fs_spd':case 'fs_balanced':{
fsSupport(g,d,body,w-14,depth-8,43);const ccd=d.shape==='fs_ccd',balanced=d.shape==='fs_balanced',spd=d.shape==='fs_spd';
box(g,[w-28,67,depth-14],[8,80,0],body,3,ccd?'cooled_camera_body':balanced?'dual_detector_body':spd?'single_photon_detector_body':'camera_body');
box(g,[4,61,depth-21],[-w/2+19,80,0],M.alum,1,'detector_faceplate');
for(const p of d.ports){const x=p.pos[0],zz=p.pos[2];cyl(g,balanced?19:spd?16:25,19,[x+10,80,zz],M.black,'x');fsAperture(g,x,balanced?14:spd?10:20,body,80,zz);cyl(g,balanced?11:spd?7:16,.6,[x+.3,80,zz],spd?M.violetGlass:M.filterGlass,'x',48,'detector_entrance_window');if(!spd)fsPixelWindow(g,x+.7,80,zz,balanced?11:22,balanced?11:18,ccd?'ccd':'cmos');}
if(ccd){for(let i=0;i<10;i++)box(g,[23,3,depth-10],[w/2-8,48+i*7,0],M.dark,.4,'cooling_fin');cyl(g,24,6,[w/2+7,80,0],M.black,'x',48,'camera_cooling_fan');for(let i=0;i<6;i++){const a=i*Math.PI/3;const b=box(g,[2,19,7],[w/2+11,80+10*Math.cos(a),10*Math.sin(a)],M.dark,.5,'fan_blade');b.rotation.x=a+.45;}}
else fsElectrical(g,w/2-5,72,depth/2,'z',balanced?'difference_RF_output':spd?'photon_pulse_output':'camera_trigger');
plaque(g,balanced?'BALANCED':spd?'SINGLE PHOTON':ccd?'COOLED CCD':'CMOS',w-34,10,[8,115,0],[0,1,0],'#cbd1d5','#2c4350',29);break;}
case 'fs_oap':{
fsSupport(g,d,body,78,80,52);box(g,[20,14,24],[0,51,0],body,1,'OAP_mount');
const vertices=[],indices=[],segments=40,r=24,focalScale=40;
for(let row=0;row<=segments;row++){const theta=row/segments*Math.PI*2;for(let col=0;col<=16;col++){const rr=col/16*r,u=rr*Math.cos(theta),v=rr*Math.sin(theta);vertices.push(u,v,(u*u+v*v)/(4*focalScale)+u*.3);}}
for(let row=0;row<segments;row++)for(let col=0;col<16;col++){const a=row*17+col,b=a+17;indices.push(a,b,a+1,b,b+1,a+1);}
const surface=new T.BufferGeometry();surface.setAttribute('position',new T.Float32BufferAttribute(vertices,3));surface.setIndex(indices);surface.computeVertexNormals();
const oapAngle=-Math.PI/4+Math.atan(.3);const optic=mesh(g,surface,M.mirror,[0,80,0],'off_axis_parabolic_surface');optic.rotation.y=oapAngle;
const support=cyl(g,25,8,[4,80,-4],M.alum,'z',64,'OAP_backing');support.rotation.y=oapAngle;torus(g,26,2,[0,80,0],body,[0,oapAngle,0],'OAP_retaining_ring');break;}
case 'fs_thz_emitter':case 'fs_thz_detector':{
fsSupport(g,d,body,108,100,43);box(g,[92,64,87],[0,80,0],body,3,'THz_head_housing');box(g,[4,57,80],[-48,80,0],M.alum,1,'THz_front_flange');
if(d.shape==='fs_thz_emitter'){
fsAperture(g,-59,12);cyl(g,9,.7,[-59,80,0],M.glass,'x',48,'pump_input_window');
const dome=mesh(g,new T.SphereGeometry(22,48,24,0,Math.PI*2,0,Math.PI/2),M.filterGlass,[46,80,0],'silicon_hemispherical_lens');dome.rotation.z=-Math.PI/2;torus(g,22,3,[46,80,0],M.black,[0,Math.PI/2,0],'THz_lens_holder');
}else{
const dome=mesh(g,new T.SphereGeometry(22,48,24,0,Math.PI*2,0,Math.PI/2),M.filterGlass,[-46,80,0],'THz_receiving_lens');dome.rotation.z=Math.PI/2;torus(g,22,3,[-46,80,0],M.black,[0,Math.PI/2,0],'THz_lens_holder');
cyl(g,13,20,[0,80,48],M.black,'z');cyl(g,10,.8,[0,80,59],M.glass,'z',48,'optical_gate_window');
}
fsElectrical(g,22,98,-47,'z','photoconductive_bias_or_readout');plaque(g,d.shape==='fs_thz_emitter'?'THz EMITTER':'THz DETECTOR',76,10,[0,113,0],[0,1,0],'#cbd1d5','#344853',30);break;}
default:throw new Error('Unknown free-space component geometry: '+d.shape);
}
g.userData.opticalAxisHeight=80;g.userData.geometryProvenance='Generic parametric illustration; not manufacturer CAD';
}
export {T};

# 口袋中有线耳机缠结项目修订方案（中文版）

本中文文档严格对应英文主稿 [earphone_tangling_project_plan_en.md](./earphone_tangling_project_plan_en.md)，并以英文版为准。

相关工程文档：

- [earphone_tangling_engineering_plan_zh.md](./earphone_tangling_engineering_plan_zh.md)
- [earphone_tangling_engineering_plan_en.md](./earphone_tangling_engineering_plan_en.md)

## 1. 研究定位

### 1.1 核心问题

我们不再把对象简单看成一根理想的开放细线，而是将其建模为一个**具有刚性端部和刚性 Y 形分线器的 Y 字形分支半柔性线缆**，并研究它在口袋约束环境中的运动与缠结。核心科学问题是：

耳机的几何结构、柔性/刚性分布、硬质部件以及口袋中的扰动方式，将如何影响缠结的形成、持续和严重程度？

### 1.2 为什么必须这样改写

真实有线耳机不是单一线性链：

- 它有一个**分支点**；
- 从几何图的角度看有三条臂；
- 插头外壳、耳塞外壳和 Y 形分线器都具有明显的**刚性与尺寸效应**。

因此，这个问题更适合描述为**受限空间中分支线缆的动力学与缠结问题**，而不是经典意义下单根开放链的打结问题。这个区分很重要，因为严格的 knot invariant 通常天然对应闭链；而耳机是开放且分支的对象。因此，本项目的一阶观测量应优先定义为**穿环、套环捕获和缠结严重度**，而不应只追求严格拓扑结 [1,2,7-9]。

## 2. 物理对象定义

### 2.1 耳机几何结构

将耳机表示为一个带有一个分线节点和三条臂的图结构：

- `trunk arm`：插头到 Y 分线器，弧长 `L_0`
- `left arm`：Y 分线器到左耳塞，弧长 `L_1`
- `right arm`：Y 分线器到右耳塞，弧长 `L_2`

本项目默认采用左右对称情形：

```text
L_1 = L_2
```

并在全文中采用如下记号约定：

```text
L_total = L_0 + L_1
```

这里的 `L_total` 指的是**从插头到任一耳塞的单侧路径长度**。对应的真实线材总长度为

```text
L_mat = L_0 + L_1 + L_2 = L_0 + 2L_1
```

这种写法符合日常对耳机长度的直觉表达，同时又保留了科学表述所需的严格性。

例如：

- 若下端长度为 `L_0 = 0.7 m`，且单侧总长度为 `L_total = 1.0 m`，则 `L_1 = L_2 = 0.3 m`
- 此时真实线材总长度为 `L_mat = 1.3 m`

如果后续需要做不对称耳机的扩展，也仍然可以放开对称条件，允许 `L_1 != L_2`。

### 2.2 刚性部件

以下部分视为刚体或近似刚体：

- 插头外壳
- 左耳塞外壳
- 右耳塞外壳
- Y 分线器

这些部件在模型中应体现为：

- 比柔性线缆更大的等效半径
- 更强的排斥体积
- 在连接处更大的局部抗弯能力

这样做的物理依据是：真实耳机之所以难解，经常不是“软线本身打出一个数学结”，而是某个**硬质部件穿过了环并被套住**。

## 3. 粗粒化模型

### 3.1 推荐表示方式

建议采用**分支离散 worm-like chain 模型 + 排斥体积**：

- 用 beads 和 bonds 离散表示线缆，键长尺度为 `b`；
- 三条臂共享一个 junction bead，或一个很短的刚性分线单元；
- 柔性线段使用普通 beads；
- 插头和耳塞可用更大半径的端点 bead，或几个 bead 组成的短刚体单元表示。

这个表示结合了三类经典思想：

- **worm-like chain / persistence length**：表征半柔性 [3,4]
- **self-avoidance / excluded volume**：防止自穿透 [5]
- **branched / star polymer 粗粒化**：处理 Y 字形结构 [6]

### 3.2 面向初学者的直观解释

如果用最直白的话来理解，这个模型可以这样看：

- 把耳机线切成很多很短的小段
- 每一小段用一个小珠子表示
- 相邻小珠子之间保持连接，所以线不会断
- 整条线可以弯曲，但急转弯会受到惩罚
- 线的不同部分不能互相穿过去
- 插头、耳塞和分线器用更大、更硬的珠子表示

所以，用最通俗的话说，这就是一个**Y 字形线缆的珠子链模型**。它和高分子物理中的珠簧模型有亲缘关系，但不是最简单的随机行走链。最简单的 random walk 允许任意转向、允许自交，也不包含刚性和硬件部件；而我们的模型额外包含：

- 自排斥
- 弯曲刚度
- 分支结构
- 硬质部件
- 口袋约束

因此，更准确的初学者表述是：

**一个受限空间中自回避半柔性 Y 字线缆的粗粒化珠子链模型**

### 3.3 能量项

总势能可以写成

```text
U = U_bond + U_bend + U_excl + U_wall + U_hardware
```

其中：

- `U_bond`：约束相邻 beads 的距离
- `U_bend`：惩罚过大弯折，决定持续长度或等效弯曲刚度
- `U_excl`：防止 bead 之间重叠与自穿透
- `U_wall`：口袋边界约束
- `U_hardware`：体现硬质部件几何尺寸和局部刚性

实际实现上可选：

- `U_bond`：谐振子键或近似不可伸长约束
- `U_bend`：离散 WLC 弯曲项，例如与 `1 - cos(theta)` 成正比
- `U_excl`：短程排斥势或硬核拒绝
- `U_wall`：排斥壁势或反射边界

### 3.4 为什么这个模型合适

这不是原子级化学模拟，而是一个**软物质/聚合物风格的粗粒化模型**。对于课程项目，这个层级非常合适，因为你们最关心的量主要由以下因素决定：

- 线缆轮廓几何
- 弯曲刚度
- 自排斥
- 受限空间
- 非平衡扰动

而不是电子结构或原子尺度化学反应。

## 4. 动力学与口袋环境

### 4.1 推荐动力学框架

本项目的主线建议采用**过阻尼 Langevin 动力学**，而不是仅用 Monte Carlo 重排：

```text
gamma * d r_i / dt = -grad_i(U) + xi_i(t) + f_i^agitation(t)
```

其中：

- `gamma` 是等效摩擦
- `-grad_i(U)` 是模型势能对应的确定性力
- `xi_i(t)` 是随机噪声
- `f_i^agitation(t)` 是口袋环境带来的外部驱动力

### 4.2 为什么不建议把 Monte Carlo 作为主框架

Monte Carlo 的 pivot 或 crankshaft move 很适合做构型采样，但不天然对应一个直观的连续运动轨迹。由于本项目明确提出要：

- 模拟缠结**过程**
- 做时间相关的**可视化**
- 讨论外部**环境**

所以更适合作为主线的是 Langevin 式动力学。Monte Carlo 仍然可以保留为对照模型或简化基线模型。

### 4.3 口袋环境建模

将口袋建模为一个受限空间，可选带内部障碍物。

最小环境模型：

- 一个长方体口袋盒子，尺寸为 `W`、`H`、`T`
- 反射边界或排斥边界
- 各向同性随机扰动

更真实的环境模型：

- 用 colored noise 代替理想白噪声
- 加入某一方向上的周期性压缩
- 加入剪切式或突发式扰动
- 让重力方向或主驱动方向随时间变化，近似人体走动

可选扩展：

- 在口袋中加入手机形状障碍物
- 加入钥匙等障碍物

### 4.4 主要可调参数

几何参数：

- `L_0`、`L_1`、`L_2`
- 线缆直径 `d_cable`
- 硬件半径 `r_plug`、`r_earbud`、`r_junction`
- 离散长度 `b`

力学参数：

- 弯曲刚度 `k_bend` 或持续长度 `l_p`
- 硬件附近的局部刚度
- 等效摩擦 `gamma`

环境参数：

- 口袋尺寸 `W`、`H`、`T`
- 扰动幅值 `A`
- 扰动相关时间 `tau_a`
- 压缩幅值和频率
- 障碍物是否存在及其尺寸

初始条件：

- 初始折叠方式
- 初始朝向
- 左右耳塞初始时是否彼此接近

## 5. 如何定义并量化缠结

### 5.1 概念立场

对这个 Y 字形开放分支体系而言，**严格 knot type 不是最佳的一阶指标**。从实际使用出发，更重要的问题是：

- 某个硬质部件是否被环套住
- 是否形成了多少个非局域接触
- 这些接触持续多久
- 结构是否难以解开

因此，我们建议建立一个分层的观测量体系。

### 5.2 一阶指标：threading 或 loop-capture 事件

最贴近真实耳机使用问题的一阶指标是**穿环/套环捕获**：

- 线缆先形成一个足够大的环；
- 某个刚性质点或另一条臂穿过该环；
- 该结构持续超过最小时间阈值。

一个可操作的定义流程是：

1. 通过非局域近闭合检测候选环；
2. 判断某个硬质部件或另一条臂是否穿过该环面；
3. 要求该事件持续时间大于 `t_min`。

由此得到：

```text
N_thread = 当前活跃的穿环/捕获事件数
```

### 5.3 二阶指标：非局域接触数

定义 `N_contact` 为满足下列条件的 bead 对或 segment 对数量：

- 空间距离小于阈值 `r_c`
- 轮廓距离大于阈值 `s_c`

它反映的是几何拥挤和局域缠绕密度，优点是计算简单、图像表达直观。

### 5.4 二阶指标：接触持续性

短暂擦碰和稳定缠结不能等价对待，因此定义：

- `T_persist`：非局域接触或穿环事件的累计持续时间

这样可以把瞬时碰撞和真正稳定的纠缠区分开。

### 5.5 二阶指标：解缠代价

定义一个更接近日常体验的“解开难度”指标：

- 从某个缠结构型出发；
- 关闭主动扰动；
- 在弱偏置解缠动力学或受控拉伸下让体系松弛；
- 测量恢复到低缠结状态所需的时间或步数。

得到：

- `C_untangle`：解缠代价

### 5.6 综合缠结评分

项目层面可定义一个标量综合指标：

```text
S_tangle = w1 * N_thread + w2 * N_contact + w3 * T_persist + w4 * C_untangle
```

其中 `w1-w4` 为正权重。

它不是基本拓扑不变量，而是一个**具有物理解释性的工程化缠结严重度指标**。

### 5.7 高级拓扑分析作为扩展

如果后续希望更学术化地讨论拓扑，可增加两类扩展：

- 对开放链子链使用 **stochastic closure / open-chain closure** [7]
- 对开放曲线使用 **knotoid** 方法 [8]

对于带分支或带内部连接的信息结构，还可以进一步联系 **bonded knotoids** 和 **theta-curve topology** [8,9]。这些内容在科学上很有意思，但建议作为扩展，而不是本课程项目的主交付物。

## 6. 可视化方案

项目应同时包含过程级和统计级可视化。

### 6.1 过程可视化

- 口袋中的 3D 动画
- trunk arm、left arm、right arm 使用不同颜色
- 插头、耳塞、分线器用更大球体或胶囊体渲染
- 高亮显示接触区域和检测到的穿环事件

### 6.2 诊断型可视化

- `N_thread`、`N_contact` 和 `S_tangle` 的时间序列
- 轮廓索引之间的 contact map
- 关键时刻快照：成环前、穿环时、捕获后、解缠后

### 6.3 统计图表

- `S_tangle` 关于刚度和扰动强度的热图
- 穿环概率关于 `L_0/L_total` 的折线图
- 不同口袋几何条件下的条形图比较
- 相图式示意：loose、contact-rich、threaded 等状态区

## 7. 课程项目的最小可交付版本

为了保证项目可完成，第一版完整交付建议至少包括：

1. 一个 3D 粗粒化 Y 字耳机模型
2. 一个长方体口袋中的过阻尼 Langevin 动力学
3. 插头、耳塞、分线器的刚性 bead 表示
4. 自动检测 threading 候选事件和非局域接触
5. 一段动画和一个小规模参数扫描

推荐第一轮扫描参数：

- `L_0 / L_total`
- 弯曲刚度 `k_bend` 或持续长度 `l_p`
- 扰动幅值 `A`
- 口袋厚度 `T`

做到这一步，就已经可以组成一套科学上自洽、展示效果良好的课程汇报。

## 8. 风险点、边界与报告写法

报告中应主动说明以下边界：

- 模型是**粗粒化**的，不是原子级模拟；
- 主要指标是**缠结严重度/穿环事件**，不是严格经典 knot invariant；
- 外部扰动是对口袋环境的**有效非平衡建模**，不是对人体步态的精细力学重建；
- 项目当前目标不是对某一副真实耳机做高精度定量拟合，而是识别**趋势和参数依赖关系**。

这些声明不会削弱项目，反而会让整个方案更诚实、更稳健，也更容易经得住提问。

## 9. 参考文献

[1] Raymer, D. M.; Smith, D. E. Spontaneous Knotting of an Agitated String. *Proc. Natl. Acad. Sci. U.S.A.* **2007**, *104* (42), 16432-16437. https://doi.org/10.1073/pnas.0611320104

[2] Gendron, I.; Savard, K.; Capaldi, X.; Liu, Z.; Zeng, L.; Reisner, W.; Capaldi, L. Time-Dependent Knotting of Agitated Chains. *Phys. Rev. E* **2021**, *103*, 032501. https://doi.org/10.1103/PhysRevE.103.032501

[3] Kratky, O.; Porod, G. Rontgenuntersuchung geloster Fadenmolekule. *Recueil des Travaux Chimiques des Pays-Bas* **1949**, *68* (12), 1106-1122. https://doi.org/10.1002/recl.19490681203

[4] Baschnagel, J.; Meyer, H.; Wittmer, J.; Kulic, I.; Mohrbach, H.; Ziebert, F.; Nam, G.-M.; Lee, N.-K.; Johner, A. Semiflexible Chains at Surfaces: Worm-Like Chains and beyond. *Polymers* **2016**, *8* (8), 286. https://doi.org/10.3390/polym8080286

[5] Madras, N.; Slade, G. *The Self-Avoiding Walk*; Modern Birkhauser Classics; Springer: New York, 2013. https://doi.org/10.1007/978-1-4614-6025-1

[6] Halun, J.; Karbowniczek, P.; Kuterba, P.; Danel, Z. Investigation of Ring and Star Polymers in Confined Geometries: Theory and Simulations. *Entropy* **2021**, *23* (2), 242. https://doi.org/10.3390/e23020242

[7] Virnau, P.; Mirny, L. A.; Kardar, M. Intricate Knots in Proteins: Function and Evolution. *PLoS Comput. Biol.* **2006**, *2* (9), e122. https://doi.org/10.1371/journal.pcbi.0020122

[8] Goundaroulis, D.; Gugumcu, N.; Lambropoulou, S.; Dorier, J.; Stasiak, A.; Kauffman, L. H. Topological Models for Open-Knotted Protein Chains Using the Concepts of Knotoids and Bonded Knotoids. *Polymers* **2017**, *9* (9), 444. https://doi.org/10.3390/polym9090444

[9] Dabrowski-Tumanski, P.; Goundaroulis, D.; Stasiak, A.; Rawdon, E. J.; Sulkowska, J. I. Theta-Curves in Proteins. *Protein Sci.* **2024**, *33* (9), e5133. https://doi.org/10.1002/pro.5133

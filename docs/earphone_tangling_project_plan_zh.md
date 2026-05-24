# 口袋中耳机线打结问题：修订版项目方案（中文对照版）

本文档是英文理论文档 `earphone_tangling_project_plan_en.md` 的中文对照版。项目中以英文版为权威版本，中文版用于课堂展示、讨论和汇报准备。

相关工程文档：

- [earphone_tangling_engineering_plan_zh.md](./earphone_tangling_engineering_plan_zh.md)
- [earphone_tangling_engineering_plan_en.md](./earphone_tangling_engineering_plan_en.md)

## 1. 研究定位

### 1.1 核心问题

我们不再把系统建模为一根理想的单开链绳子，而是把它看作一个**带有刚性端部和刚性 Y 结的 Y 字形半柔性分支线缆**，在口袋这类受限环境中运动。核心科学问题是：

几何结构、弯曲刚度、刚性硬件和口袋扰动，如何共同影响耳机线缠结的形成、持续和严重程度？

### 1.2 为什么要这样重新表述

有线耳机并不是一条简单的线性链：

- 它有一个分叉点。
- 从图结构上看，它有三个开放端。
- 插头、两个耳机头以及 Y 结分线器都带有明显的机械刚性。

因此，这个问题更适合描述为**受限空间中分支线缆的动力学与缠结问题**，而不是传统意义上的单开链打结问题。严格的结拓扑不变量更适用于闭环曲线，而耳机线是一个开放且分支的对象。所以本项目更合适的主要观测量不是“经典拓扑结类型”，而是：

- 穿线或套环事件
- 非局部接触
- 缠结严重程度

## 2. 物理系统定义

### 2.1 耳机线的几何结构

我们把耳机线表示成一个带一个结点、三条臂的图结构：

- `trunk arm`：从插头到 Y 结，轮廓长度记作 `L_0`
- `left arm`：从 Y 结到左耳机头，轮廓长度记作 `L_1`
- `right arm`：从 Y 结到右耳机头，轮廓长度记作 `L_2`

在本项目采用的对称情形中：

```text
L_1 = L_2
```

本项目统一采用如下记号：

```text
L_total = L_0 + L_1
```

这里的 `L_total` 表示“从插头到任一侧耳机头的单侧路径长度”。因此真实的线材总长度是：

```text
L_mat = L_0 + L_1 + L_2 = L_0 + 2L_1
```

示例：

- 若下端长度 `L_0 = 0.7 m`
- 单侧总长度 `L_total = 1.0 m`
- 则有 `L_1 = L_2 = 0.3 m`
- 对应真实线材总长度为 `L_mat = 1.3 m`

后续如果需要，也可以放松对称假设，允许 `L_1 != L_2`。

### 2.2 刚性部件

下列部件在模型中视为刚性或准刚性体：

- 插头外壳
- 左耳机头外壳
- 右耳机头外壳
- Y 结分线器

这些部分应具有：

- 比柔性线缆更大的有效半径
- 更强的空间排斥
- 更高的局部抗弯能力

这是因为现实中的“难解缠结”往往就出现在刚性部件穿过某个环并被卡住的时候。

## 3. 粗粒化模型

### 3.1 推荐建模方式

我们推荐使用**带排斥体积的分支离散 worm-like chain 模型**：

- 把线缆离散成许多 bead
- bead 之间由 bond 相连，平衡键长为 `b`
- 三条臂共享一个 junction bead
- 柔性线段用普通 bead 表示
- 插头和耳机头用更大半径的端部 bead 表示

这个模型结合了三类经典思想：

- `worm-like chain / persistence length`
- `excluded volume / self-avoidance`
- `branched / star-polymer style coarse graining`

### 3.2 面向初学者的解释

如果用最直白的话来讲，这个模型就是：

- 把耳机线切成很多小段
- 每一小段用一个小珠子表示
- 相邻珠子必须连着，所以线不会断
- 线可以弯，但急弯会受到惩罚
- 线的不同部分不能随便互相穿过去
- 插头、耳机头和 Y 结用更大更硬的珠子来表示

所以，从“小白也能懂”的角度说，它是一个：

**受限空间中的、自避免的、半柔性的、Y 字形珠链模型**

它和高分子物理中的 bead-spring / bead-chain 模型有联系，但不是最简单的随机行走链，因为这里还包含：

- 自避免
- 抗弯刚度
- 分支结构
- 刚性硬件
- 口袋约束

## 4. 动力学与口袋环境

### 4.1 推荐动力学模型

本项目建议采用**过阻尼 Langevin 风格动力学**：

```text
gamma * d r_i / dt = -grad_i(U) + xi_i(t) + f_i^agitation(t)
```

当前演示程序中的实现是一个**基于力的过阻尼更新近似**，包含：

- 软 bond 回复力
- bending / smoothing 力
- 非局部 bead 之间的排斥力
- 口袋边界的软反弹力
- 有相关性的外部扰动
- 额外随机扰动

它应被解释为一个介观 Langevin proxy，而不是严格分子动力学积分器。

### 4.2 为什么不把 Monte Carlo 作为主模型

Monte Carlo 适合做平衡态构型采样，但不擅长给出一个“像真实过程”的连续动画。由于本项目需要展示缠结过程、进行时间相关可视化，并讨论环境参数影响，所以 Langevin 风格动力学更适合作为主框架。

### 4.3 口袋环境模型

最简单的环境模型包括：

- 一个尺寸为 `W`、`H`、`T` 的长方体口袋
- 反射或软排斥边界
- 随机扰动

更真实的扩展版本可以加入：

- 有色噪声
- 周期性压缩
- 间歇性剪切驱动
- 模拟步行或身体运动的方向变化

## 5. 如何定义和量化缠结

### 5.1 总体思路

对一个开放、分支的 Y 字系统来说，严格的 knot type 并不是最适合的主要观测量。更贴近真实问题的是：

- 是否有刚性部件被一个环套住
- 是否出现较多非局部接触
- 这些接触是否持续
- 结构是否难以解开

### 5.2 一级观测量：穿线或套环事件

当前最关键的一级观测量是 **threading / loop-capture event**。

当前演示程序中的检测器不是严格拓扑判定，而是一个**持续套环代理判定器**：

1. 在同一条 arm 上寻找非局部近闭合
2. 用小三角面片近似局部环区域
3. 判断刚性端部是否进入该区域
4. 只有连续持续至少两个采样帧，才算有效事件

因此在汇报时应明确说明：这是一个**proxy（代理指标）**，而不是严格的结拓扑分类器。

### 5.3 二级观测量：非局部接触数

定义 `N_contact` 为满足以下条件的 bead 对数量：

- 空间距离小于阈值
- 图结构上的间隔足够远

### 5.4 二级观测量：接触持续性

当前演示程序中的持续性项更准确地说是一个**接触持续性代理量**：

- 跟踪同一对非局部接触是否连续出现
- 若同一接触对连续维持至少两个采样帧，则对持续性指标产生贡献
- 因此这里的 `contact_persistence_mean` 更接近“持续非局部接触的平均强度”，而不是完整的接触加穿线寿命积分

### 5.5 解缠成本

理论上还可以定义：

- `C_untangle`：从某个缠结状态重新回到低缠结状态所需的时间或步数

这个量目前尚未在演示程序中实现，可视为扩展工作。

### 5.6 组合缠结评分

项目层面的一个标量指标可以写成：

```text
S_tangle = w1 * N_thread + w2 * N_contact + w3 * T_persist + w4 * C_untangle
```

在当前程序中，`S_tangle` 采用的是一个简化工程版本，基于：

- 持续的穿线代理事件
- 非局部接触数
- 非局部接触持续性贡献

## 6. 可视化方案

### 6.1 过程可视化

应包括：

- 口袋中的 3D 耳机线动画
- trunk、left、right 三条 arm 的颜色区分
- 插头、耳机头、Y 结的更大刚性球体
- 非局部接触高亮
- 穿线代理事件高亮

### 6.2 诊断图

- `N_thread` 随时间变化
- `N_contact` 随时间变化
- `S_tangle` 随时间变化
- 关键时刻截图

### 6.3 统计图

- 参数扫描趋势图
- 不同参数下的平均缠结评分
- 不同参数下的平均穿线概率

## 7. 最小可交付内容

第一版完整课程项目应至少包含：

1. 一个 3D 粗粒化 Y 字耳机模型
2. 一个长方体口袋中的过阻尼动力学
3. 插头、耳机头和 Y 结的刚性 bead 表示
4. 非局部接触与持续穿线代理事件检测
5. 一段动画和一组参数扫描结果

推荐的首轮扫描参数：

- `L_0 / L_total`
- `k_bend`
- 扰动幅度
- 口袋厚度 `T`

## 8. 项目边界与风险说明

在汇报中需要明确说明：

- 这是粗粒化模型，不是原子级模拟
- 当前的主要观测量是缠结严重程度和穿线代理事件，而不是严格拓扑结
- 口袋扰动是有效非平衡模型，不是人体运动的精确复现
- 目标是得到定性趋势和参数依赖，而不是精确复现某一副真实耳机

## 9. References

[1] Raymer, D. M.; Smith, D. E. Spontaneous Knotting of an Agitated String. *Proc. Natl. Acad. Sci. U.S.A.* **2007**, *104* (42), 16432-16437. https://doi.org/10.1073/pnas.0611320104

[2] Gendron, I.; Savard, K.; Capaldi, X.; Liu, Z.; Zeng, L.; Reisner, W.; Capaldi, L. Time-Dependent Knotting of Agitated Chains. *Phys. Rev. E* **2021**, *103*, 032501. https://doi.org/10.1103/PhysRevE.103.032501

[3] Kratky, O.; Porod, G. Rontgenuntersuchung geloster Fadenmolekule. *Recueil des Travaux Chimiques des Pays-Bas* **1949**, *68* (12), 1106-1122. https://doi.org/10.1002/recl.19490681203

[4] Baschnagel, J.; Meyer, H.; Wittmer, J.; Kulic, I.; Mohrbach, H.; Ziebert, F.; Nam, G.-M.; Lee, N.-K.; Johner, A. Semiflexible Chains at Surfaces: Worm-Like Chains and beyond. *Polymers* **2016**, *8* (8), 286. https://doi.org/10.3390/polym8080286

[5] Madras, N.; Slade, G. *The Self-Avoiding Walk*; Modern Birkhauser Classics; Springer: New York, 2013. https://doi.org/10.1007/978-1-4614-6025-1

[6] Halun, J.; Karbowniczek, P.; Kuterba, P.; Danel, Z. Investigation of Ring and Star Polymers in Confined Geometries: Theory and Simulations. *Entropy* **2021**, *23* (2), 242. https://doi.org/10.3390/e23020242

[7] Virnau, P.; Mirny, L. A.; Kardar, M. Intricate Knots in Proteins: Function and Evolution. *PLoS Comput. Biol.* **2006**, *2* (9), e122. https://doi.org/10.1371/journal.pcbi.0020122

[8] Goundaroulis, D.; Gugumcu, N.; Lambropoulou, S.; Dorier, J.; Stasiak, A.; Kauffman, L. H. Topological Models for Open-Knotted Protein Chains Using the Concepts of Knotoids and Bonded Knotoids. *Polymers* **2017**, *9* (9), 444. https://doi.org/10.3390/polym9090444

[9] Dabrowski-Tumanski, P.; Goundaroulis, D.; Stasiak, A.; Rawdon, E. J.; Sulkowska, J. I. Theta-Curves in Proteins. *Protein Sci.* **2024**, *33* (9), e5133. https://doi.org/10.1002/pro.5133

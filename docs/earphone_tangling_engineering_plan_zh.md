# 口袋中有线耳机缠结：工程实现方案（中文版）

本中文文档是工程文档的对应版本，并以英文主稿为准。

相关理论文档：

- [earphone_tangling_project_plan_zh.md](./earphone_tangling_project_plan_zh.md)
- [earphone_tangling_engineering_plan_en.md](./earphone_tangling_engineering_plan_en.md)

## 1. 工程目标

理论文档回答“研究什么”，工程文档回答“怎么做出来”。本项目最终应交付：

- 一个能够解释和展示模型的前端
- 一个负责管理仿真任务与结果的后端
- 一个真正执行耳机线模拟和缠结判定的算法引擎
- 一条从参数输入到动画、图表和统计结论的可复现流程

一句话概括：

**我们要做的是一个“Y 字耳机在口袋中缠结”的仿真与可视化平台。**

## 2. 系统总览

整个项目建议拆成三大部分：

1. 前端展示应用
2. 后端服务层
3. 算法与仿真引擎

推荐工作流：

1. 用户在前端选择模型参数和环境参数
2. 前端向后端发送仿真请求
3. 后端创建任务并调用算法引擎
4. 算法引擎产出轨迹数据、指标数据和汇总结果
5. 后端保存并对外提供这些结果
6. 前端读取结果并完成 3D 动画、缠结事件和统计图表展示

## 3. 前端方案

### 3.1 前端职责

前端不只是“做个界面”，它是整个课程展示最直接的承载体。它需要让观众快速看懂：

- 耳机模型长什么样
- 口袋环境是什么样
- 线缆如何运动
- 缠结在什么时候发生
- 参数变化如何影响指标

### 3.2 推荐前端技术栈

推荐技术栈：

- `React` + `TypeScript`
- `Vite`
- `Three.js`
- `ECharts` 或 `Plotly`
- `Tailwind CSS` 或简单模块化 CSS

原因：

- React 适合快速做演示型页面
- TypeScript 有助于约束前后端数据格式
- Three.js 很适合做线缆和口袋的 3D 动画
- ECharts/Plotly 足够画热图、折线图和时间序列

### 3.3 推荐前端页面或面板

前端可以做成单页面演示系统，由多个功能面板组成。

建议布局：

- `Model Overview` 面板
- `Parameter Control` 面板
- `3D Simulation Viewer` 面板
- `Metric Dashboard` 面板
- `Run History / Comparison` 面板
- `Summary / Trend Analysis` 面板

### 3.4 各面板内容

`Model Overview`

- 简短介绍 Y 字珠子链模型
- 展示 `L_0`、`L_1`、`L_total`、`L_mat` 的示意图
- 标出插头、耳塞、分线器等刚性部件

`Parameter Control`

- 几何参数
- 刚度参数
- 环境参数
- 仿真步数与采样参数
- 开始按钮与重置按钮

`3D Simulation Viewer`

- 口袋盒子中的 3D 耳机动画
- 主干、左支、右支使用不同颜色
- 插头、耳塞和分线器用更大、更硬的显示单元
- 可选播放控制：播放、暂停、逐帧、倍速
- 可选事件高亮：成环、穿环、捕获

`Metric Dashboard`

- `N_thread` 随时间变化曲线
- `N_contact` 随时间变化曲线
- `S_tangle` 随时间变化曲线
- 关键统计值卡片

`Run History / Comparison`

- 比较多组参数下的结果
- 绘制穿环概率关于 `L_0 / L_total` 的变化图
- 绘制 `S_tangle` 热图

`Summary / Trend Analysis`

- 展示多组运行的聚合结果
- 展示“单个参数变化如何影响单个指标”的趋势图
- 用总结卡片概括主要影响
- 用简单规则生成文字总结，例如：
  - 增大 `k_bend` 会降低穿环概率
  - 增大口袋厚度会降低接触密度
  - 改变 `L_0 / L_total` 会改变主干主导和支链主导的捕获模式

### 3.5 前端交互要求

前端至少应支持：

- 在仿真前修改参数
- 选择历史运行结果重放
- 在动画视图和统计视图之间切换
- 在单次运行视图和批量汇总视图之间切换
- 导出演示所需截图

### 3.6 前端最小交付物

第一版前端至少应包含：

- 固定口袋盒子的 3D 场景
- Y 字耳机轨迹回放
- 一个控制表单
- 一个指标展示面板
- 一张参数比较图
- 一个带趋势图的汇总页或汇总面板

### 3.7 3D 模拟动画的具体实施方案

3D 查看器建议采用稳定、容易落地的渲染策略。

场景对象：

- 一个半透明线框口袋盒子
- 一条或多条表示耳机中心线的折线几何
- 主干、左支、右支三种颜色
- 插头、耳塞、分线器对应的大球或胶囊体
- 可选的接触点和穿环事件高亮标记

第一版推荐渲染方式：

- 用 `BufferGeometry` 画线缆中心线
- 播放时只更新顶点坐标
- 刚性部件用球体显示
- 避免每一帧都重建整条几何体

推荐前端播放数据格式：

- 一个轨迹文件保存所有采样帧
- 每一帧保存 bead 的三维坐标
- 一个元数据对象保存 bead 类型、分支标签和刚性部件索引

建议帧结构：

```text
frame = {
  time: 0.120,
  positions: [[x1, y1, z1], [x2, y2, z2], ...],
  events: {
    contacts: [[i, j], ...],
    threading: [event_id_1, event_id_2, ...]
  }
}
```

建议播放流程：

1. 读取轨迹元数据
2. 创建线缆和刚性部件几何对象
3. 每次播放时取当前采样帧
4. 覆盖线缆顶点坐标
5. 覆盖刚性部件位置
6. 更新事件高亮
7. 渲染当前场景

这一方案足够适合课程项目，也和预计算轨迹天然兼容。

### 3.8 汇总页的具体实施方案

汇总页不应只是“放几张图”，而应明确回答一个问题：

参数变化如何影响缠结行为？

第一版建议图表集合：

- 趋势图：平均穿环概率关于 `L_0 / L_total`
- 趋势图：平均 `S_tangle` 关于 `k_bend`
- 趋势图：平均 `N_contact` 关于口袋厚度
- 热图：`S_tangle` 关于两个参数的变化
- 条形图：比较若干代表性参数组

第一版文字总结规则：

- 若某指标随参数单调增加，则总结为 increasing trend
- 若某指标随参数单调减少，则总结为 decreasing trend
- 若斜率出现变号，则总结为 non-monotonic trend
- 若误差带大量重叠，则总结为 weak or inconclusive trend

这样汇总页的结论既直观，又容易解释。

## 4. 后端方案

### 4.1 后端职责

后端主要负责：

- 接收仿真请求
- 校验参数
- 启动并追踪仿真任务
- 保存输出结果
- 向前端提供结果数据

### 4.2 推荐后端技术栈

推荐技术栈：

- `Python`
- `FastAPI`
- `Pydantic`
- 本地文件存储

原因：

- 算法引擎本身就推荐用 Python
- FastAPI 写接口简单清晰
- Pydantic 非常适合做请求参数和返回数据的校验

### 4.3 后端架构

建议后端分为以下模块：

- `api/`
- `services/`
- `schemas/`
- `storage/`
- `tasks/`

各模块职责：

- `api/`：HTTP 接口
- `schemas/`：请求和返回的数据结构
- `services/`：业务流程编排
- `tasks/`：仿真任务执行与状态管理
- `storage/`：结果存取

### 4.4 建议接口

最小接口集合：

- `POST /api/simulations`
- `GET /api/simulations/{run_id}`
- `GET /api/simulations/{run_id}/trajectory`
- `GET /api/simulations/{run_id}/metrics`
- `GET /api/simulations/{run_id}/summary`
- `GET /api/simulations`
- `POST /api/batches`
- `GET /api/batches/{batch_id}`
- `GET /api/batches/{batch_id}/summary`
- `GET /api/analysis/trends`

作用分别为：

- `POST /api/simulations`：创建新的仿真任务
- `GET /api/simulations/{run_id}`：查询任务状态和元数据
- `GET /api/simulations/{run_id}/trajectory`：返回轨迹帧数据
- `GET /api/simulations/{run_id}/metrics`：返回时间序列指标
- `GET /api/simulations/{run_id}/summary`：返回最终统计结果
- `GET /api/simulations`：列出历史运行
- `POST /api/batches`：创建参数扫描批任务
- `GET /api/batches/{batch_id}`：查询批任务状态和元数据
- `GET /api/batches/{batch_id}/summary`：返回批任务聚合结果
- `GET /api/analysis/trends`：返回汇总页可直接使用的趋势数据

### 4.5 请求参数结构

每次仿真请求建议包含：

- geometry:
  - `L_0`
  - `L_1`
  - `d_cable`
  - 刚性部件半径
- mechanics:
  - `k_bend`
  - `gamma`
- environment:
  - `W`, `H`, `T`
  - 扰动幅值
  - 扰动相关时间
- simulation control:
  - 总步数
  - 时间步长
  - 采样间隔
  - 随机种子

### 4.6 输出文件

建议每次运行输出以下文件：

- `config.json`
- `trajectory.json` 或 `trajectory.npz`
- `metrics.csv`
- `summary.json`
- 可选 `preview.gif` 或 `preview.mp4`

这套输出既方便调试，也方便后续演示复用。

对每个批量扫描任务，后端还应额外保存：

- `batch_config.json`
- `batch_summary.csv`
- `trend_data.json`
- `heatmap_data.json`
- 可选 `insights.txt`

### 4.7 后端执行流程的具体实施方案

后端建议把每个仿真任务都管理成带状态的任务对象：

- `created`
- `queued`
- `running`
- `finished`
- `failed`

建议的单次运行流程：

1. 接收请求
2. 校验字段
3. 生成 `run_id`
4. 保存 `config.json`
5. 标记任务为 `queued`
6. 启动仿真引擎
7. 持续写出结果
8. 任务结束后标记为 `finished` 或 `failed`

建议的批量运行流程：

1. 接收批量扫描定义
2. 展开参数网格
3. 生成重复子任务
4. 顺序或并行执行所有子任务
5. 全部结束后做聚合分析
6. 导出趋势数据和热图数据

第一版后端不需要复杂的分布式任务系统，本地任务执行器就足够。

## 5. 算法与仿真引擎

### 5.1 算法职责

算法引擎是整个项目的科学核心，它需要：

- 构建 Y 字耳机模型
- 模拟耳机在线袋中的运动
- 检测缠结相关事件
- 计算指标和汇总结果

### 5.2 推荐算法技术栈

推荐技术栈：

- `Python`
- `NumPy`
- 可选 `SciPy`
- 若后期需要加速，可再考虑 `Numba`

第一版用 NumPy 就够了。

### 5.3 建议内部模块

推荐拆分为：

- `geometry.py`
- `model.py`
- `dynamics.py`
- `events.py`
- `metrics.py`
- `runner.py`
- `export.py`

职责建议：

- `geometry.py`：构建 beads、bonds 和 Y 字分支连接关系
- `model.py`：定义势能项和力计算
- `dynamics.py`：实现 Langevin 更新循环
- `events.py`：实现成环和穿环检测
- `metrics.py`：计算 `N_thread`、`N_contact`、`T_persist`、`S_tangle`
- `runner.py`：负责一次完整仿真的组织
- `export.py`：导出前端需要的输出格式

### 5.4 耳机数据结构

耳机对象建议用以下数据表示：

- `positions`：每个 bead 的空间坐标
- `bonds`：bead 连接关系
- `bead_types`：柔性 bead、插头、耳塞、分线器
- `arm_labels`：主干、左支、右支
- `radii`：每个 bead 的半径

这套结构简单、清楚，也方便扩展。

### 5.5 单次仿真流程

一次完整仿真建议按以下顺序执行：

1. 构建 Y 字耳机几何
2. 赋予 bead 类型和半径
3. 在口袋中生成初始构型
4. 执行过阻尼 Langevin 更新
5. 保存采样轨迹帧
6. 检测成环和穿环事件
7. 计算时间序列指标
8. 导出汇总结果

### 5.6 几何构建的具体实施方案

几何构建模块需要把物理长度转成 bead 数量。

建议步骤：

1. 选定离散长度 `b`
2. 计算：
   - `n0 = round(L_0 / b)`
   - `n1 = round(L_1 / b)`
3. 构建一条有 `n0 + 1` 个 bead 的主干
4. 构建两条共享分线 bead 的支链
5. 明确以下索引：
   - 插头
   - 分线器
   - 左耳塞
   - 右耳塞
6. 给每个 bead 赋予类型和半径

建议初始几何：

- 主干沿某个坐标轴放置
- 左右支链相对于分线方向对称分开
- 初始分支夹角取一个中等值，例如 30-60 度

这样初始构型稳定，也方便调试。

### 5.7 动力学更新的具体实施方案

仿真引擎建议采用过阻尼 Langevin 动力学，并用 Euler-Maruyama 风格更新。

每一步更新执行：

1. 计算键长力
2. 计算弯曲力
3. 计算排斥力
4. 计算壁面力
5. 计算外部扰动力
6. 计算随机噪声项
7. 更新 bead 坐标
8. 做必要的后处理修正

建议伪代码：

```text
for step in range(num_steps):
    F_bond = compute_bond_forces(positions)
    F_bend = compute_bend_forces(positions)
    F_excl = compute_excluded_volume_forces(positions)
    F_wall = compute_wall_forces(positions, box)
    F_agit = compute_agitation_forces(step, positions, params)
    F_rand = sample_noise(seed, step, shape=positions.shape)

    F_total = F_bond + F_bend + F_excl + F_wall + F_agit + F_rand
    positions = positions + dt * F_total / gamma

    if step % sample_interval == 0:
        save_frame(...)
```

这一版已经足够做出第一套可运行结果。

### 5.8 力模型的具体实施方案

第一版建议使用以下力模型：

- bond force:
  - 以 `b` 为平衡长度的谐振子力
- bend force:
  - 对相邻线段之间的大转角施加惩罚
- excluded-volume force:
  - 对非成键 bead 施加短程排斥
- wall force:
  - 在盒子边界附近施加软排斥
- agitation force:
  - 采用白噪声式小踢动，或低频方向性扰动

第一版工程上最推荐的选择：

- 尽量使用软势，而不是硬约束
- 这样更容易实现，也更稳定

### 5.9 成环和穿环检测的具体实施方案

第一版事件检测应尽量显式、可调试。

非局域接触检测：

1. 遍历 bead 对或线段对
2. 排除轮廓上相邻的近邻对
3. 若欧式距离低于阈值，则记为接触

候选环检测：

1. 找到轮廓上相距较远但空间上接近的两个位置
2. 取它们之间对应的链段
3. 把该链段视为候选环区域

穿环检测：

1. 计算候选环的局部平面或局部包围区域
2. 判断某个刚性 bead 或另一条支链是否穿过该区域
3. 要求该事件持续若干采样帧

持续性逻辑：

- 为事件分配 ID
- 记录开始帧、结束帧和持续时间
- 只有持续超过 `t_min` 的事件才算有效

这种设计虽然不是严格的数学拓扑判定，但非常适合课程项目工程实现。

### 5.10 指标计算的具体实施方案

最小时间序列指标：

- `N_thread(t)`
- `N_contact(t)`
- `S_tangle(t)`

最小汇总指标：

- 总穿环事件数
- 最大接触数
- 最终缠结分数
- 是否曾进入 threaded 状态

此外建议增加：

- `threading_ever`
- `threading_count_total`
- `contact_count_mean`
- `tangle_score_mean`

这些输出足够支持趋势图和最终总结。

### 5.11 动画输出的具体实施方案

算法引擎输出的数据格式应直接服务于 Three.js。

推荐输出：

- `trajectory.json`：便于调试和前端直接读取
- `trajectory.npz`：若数据变大，可用于更高效加载
- `summary.json`：用于卡片和文字总结
- `metrics.csv`：用于图表和离线分析

建议采样策略：

- 不保存每一步
- 每 `sample_interval` 步保存一帧
- 如有需要，可单独设置 `render_interval`

这样可以明显减小文件体积，也能提升前端播放性能。

为了展示用途，还建议：

- 可选导出短 GIF 或 MP4
- 保存少量关键快照
- 保存事件发生的时间戳，便于前端一键跳转

### 5.12 参数扫描引擎

除了单次动画，还需要支持批量实验来产出演示图表。

建议扫描：

- `L_0 / L_total`
- `k_bend`
- 扰动幅值
- 口袋厚度

每组参数需要多次重复，并输出：

- 平均穿环概率
- 平均缠结评分
- 标准差或标准误

这一点对汇总页是关键。如果没有重复批量结果，前端可以展示单次动画，但不能可靠地总结参数趋势。

### 5.13 汇总页可行性评估

这个汇总与分析页面是可行的，但前提是把问题拆成三层：

第一层：算法层

- 对每组参数做重复仿真
- 计算聚合统计量

第二层：后端层

- 以稳定格式保存聚合输出
- 通过专门接口把结果提供给前端

第三层：前端层

- 绘制趋势图、热图和汇总卡片

为什么它可行：

- 图表本身并不难
- 真正的关键是提前把聚合数据准备好
- 一旦批量输出格式确定，汇总页实现起来会比较直接

第一版汇总页不应该做的事：

- 不要试图用复杂 AI 推理自动生成“严格科学结论”
- 不要依赖浏览器里实时重跑大量高成本仿真

第一版汇总页应该做的事：

- 展示预先计算好的聚合结果
- 高亮单调趋势和组间比较
- 给出基于简单规则的文本总结

## 6. 数据流

完整数据流建议为：

1. 前端构造仿真请求
2. 后端校验并保存配置
3. 后端启动算法引擎
4. 算法引擎写出结果文件
5. 后端通过接口提供这些结果
6. 前端读取轨迹和指标并完成展示

对于批量汇总分析，数据流进一步变成：

1. 前端提交批量扫描定义
2. 后端启动重复仿真任务
3. 算法引擎输出聚合结果表
4. 后端提供趋势分析接口
5. 前端渲染汇总页

这种拆分的好处是：

- 算法部分更容易独立测试
- 前端不需要直接依赖仿真内部实现
- 相同配置更容易复现和重跑

## 7. 推荐项目目录结构

建议仓库结构如下：

```text
project/
  frontend/
    src/
      components/
      pages/
      hooks/
      services/
      types/
  backend/
    app/
      api/
      schemas/
      services/
      storage/
      tasks/
  algorithm/
    geometry.py
    model.py
    dynamics.py
    events.py
    metrics.py
    runner.py
    export.py
  data/
    runs/
  docs/
```

## 8. 里程碑建议

推荐里程碑如下：

### Milestone 1：模型和轨迹原型

- 构建固定参数的 Y 字耳机
- 能展示口袋中的运动
- 确认没有明显自穿透 bug

### Milestone 2：事件和指标原型

- 实现非局域接触检测
- 实现简单穿环候选检测
- 能画出 `N_thread` 和 `N_contact`

### Milestone 3：前后端联调

- 前端提交参数
- 后端返回一次完整运行结果
- 浏览器中可回放轨迹

### Milestone 4：批量实验与展示图表

- 完成重复扫描
- 生成热图和比较图
- 准备截图和短视频

### Milestone 5：汇总页

- 前端接入批量聚合接口
- 展示趋势图和热图
- 展示汇总卡片和简短文字结论

## 9. 最小可行演示版本

如果时间很紧，最小可行演示仍建议包含：

- 一个可配置的 Y 字耳机模型
- 一个口袋盒子环境
- 一次 3D 动画仿真
- 一个缠结或穿环指标
- 一张参数比较图
- 一个基于预计算批量结果的简单汇总页

这已经足够支撑一次较强的课程展示。

## 10. 工程风险

主要工程风险：

- 事件检测可能比动力学本身更难
- 如果轨迹存得太密，3D 可视化可能变慢
- 参数扫描可能比较耗时
- 前端和算法输出格式可能逐渐不一致
- 如果重复次数太少，汇总页的趋势总结可能会误导

降低风险的方法：

- 第一版先用简单稳定的判定器
- 轨迹按采样帧存储，不要保存每一步
- 尽早约定 JSON 数据结构
- 维护一个共享的测试配置用于联调
- 汇总页中的趋势判断必须建立在重复实验结果之上

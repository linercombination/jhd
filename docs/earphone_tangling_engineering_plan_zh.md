# 口袋中耳机线打结问题：工程实现方案（中文对照版）

本文档是英文工程文档 `earphone_tangling_engineering_plan_en.md` 的中文对照版。项目中以英文版为权威版本，中文版用于开发沟通和课程展示准备。

相关理论文档：

- [earphone_tangling_project_plan_zh.md](./earphone_tangling_project_plan_zh.md)
- [earphone_tangling_project_plan_en.md](./earphone_tangling_project_plan_en.md)

## 1. 工程目标

理论文档回答“研究什么”，工程文档回答“程序怎么落地”。

本项目最终需要交付：

- 一个能展示和解释模型的前端页面
- 一个负责接收请求和返回结果的后端服务
- 一个负责模拟和计算指标的算法引擎
- 一条从参数输入到动画、图表和总结的完整工作流

一句话概括：

**我们要做的是一个 Y 字耳机线在口袋中缠结的模拟与可视化平台。**

## 2. 系统总览

项目分为三层：

1. 前端演示层
2. 后端服务层
3. 算法与模拟层

推荐工作流：

1. 用户在前端设置几何、力学和环境参数
2. 前端向后端提交模拟请求
3. 后端调用算法引擎生成结果
4. 算法层返回轨迹、指标和摘要
5. 后端保存并暴露这些结果
6. 前端负责 3D 动画、指标曲线和参数趋势展示

## 3. 前端方案

### 3.1 前端职责

前端是课堂汇报的核心展示工具。它需要让观众快速理解：

- 模型长什么样
- 口袋环境是什么
- 线是如何运动的
- 缠结在什么时候发生
- 参数变化怎样影响结果

### 3.2 推荐技术栈

- `React` + `TypeScript`
- `Vite`
- `Three.js`
- `ECharts`
- 简洁 CSS 布局

### 3.3 推荐页面结构

建议作为一个单页应用，包含：

- `模型与参数区`
- `三维模拟视图区`
- `结果摘要区`
- `指标说明区`
- `时间序列图区`
- `参数趋势分析区`

### 3.4 当前前端实现的关键对齐点

当前实现中，前端需要与后端保持以下对齐：

- 口袋盒子尺寸必须使用当前模拟真实的 `W/H/T`
- 橙色接触线必须来自后端返回的 `events.contacts`
- 刚性端放大高亮必须只作用于当前帧真正参与事件的刚性端
- 指标说明必须与后端真正计算的含义一致

### 3.5 3D 视图的具体实现方案

版本 1 采用如下渲染策略：

- 用一个透明线框盒子表示口袋
- 用三条 `BufferGeometry` 线对象表示 trunk、left、right
- 用球体表示插头、耳机头和 Y 结
- 用额外的线段对象表示接触高亮

轨迹数据格式：

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

播放时：

1. 更新三条 arm 的折线顶点
2. 更新刚性 bead 位置
3. 重新绘制接触线
4. 根据 `threading` 事件 ID 高亮具体刚性端

## 4. 后端方案

### 4.1 后端职责

后端负责：

- 接收模拟请求
- 校验参数
- 调用算法引擎
- 保存输出文件
- 向前端提供轨迹、指标和摘要

### 4.2 当前 API

- `POST /api/simulations`
- `GET /api/simulations`
- `GET /api/simulations/{run_id}`
- `GET /api/simulations/{run_id}/trajectory`
- `GET /api/simulations/{run_id}/metrics`
- `GET /api/simulations/{run_id}/summary`
- `POST /api/batches`
- `GET /api/batches/{batch_id}`
- `GET /api/batches/{batch_id}/summary`
- `GET /api/analysis/trends`

### 4.3 输出文件

单次模拟保存：

- `config.json`
- `trajectory.json`
- `metrics.json`
- `summary.json`

批量扫描保存：

- `batch_config.json`
- `summary.json`

## 5. 算法与模拟层

### 5.1 核心职责

算法层负责：

- 构建 Y 字耳机几何
- 在口袋中进行动力学模拟
- 检测接触和穿线代理事件
- 计算指标与摘要

### 5.2 几何构建

几何构建器负责：

1. 根据 `L_0`、`L_1` 和 `b` 计算 bead 数量
2. 生成 trunk
3. 生成左右两条 branch
4. 记录 bond 关系
5. 记录 bead 类型、半径和图距离

### 5.3 动力学实现

当前程序采用的是**基于力的过阻尼更新**。每一步包含：

1. 计算 bond 回复力
2. 计算 bending 力
3. 计算非局部排斥力
4. 计算边界排斥力
5. 计算外部扰动力
6. 叠加随机力
7. 更新 bead 位置
8. 把 bead 限制在口袋盒子内部

这部分在汇报时应被解释为“Langevin 风格的粗粒化近似”。

### 5.4 事件检测实现

当前版本的事件检测分为两部分：

`非局部接触检测`

- 忽略图结构上过近的 bead 对
- 若空间距离足够近，则记为接触

`穿线代理事件检测`

1. 在同一条 arm 上寻找非局部近闭合
2. 用该局部链段构造一个三角近似环区域
3. 判断插头或耳机头是否进入这个区域
4. 只有连续持续至少两个采样帧才视为有效事件

这一版本不是严格拓扑 threading 判定，但对课程展示来说是可解释、可实现且可视化友好的工程方案。

### 5.5 指标计算实现

当前版本每个采样帧计算：

- `N_thread(t)`：当前活跃的持续穿线代理事件数
- `N_contact(t)`：当前活跃的非局部接触数
- `S_tangle(t)`：加权组合评分

当前摘要字段建议解释为：

- `threading_ever`
- `threading_event_count`
- `threading_active_frame_count`
- `contact_count_max`
- `contact_count_mean`
- `contact_persistence_mean`
- `tangle_score_final`
- `tangle_score_mean`

其中：

- `threading_event_count` 表示不同事件 ID 的数量
- `threading_active_frame_count` 表示至少有一个事件活跃的采样帧数
- `contact_persistence_mean` 表示持续非局部接触的平均强度

### 5.6 参数扫描方案

参数扫描引擎需要支持：

- `L_0 / L_total`
- `k_bend`
- 扰动幅度
- 口袋厚度

每个参数值应重复多次，输出：

- 平均穿线概率
- 平均缠结评分
- 标准差

## 6. 数据流

完整数据流如下：

1. 前端构造参数请求
2. 后端校验并保存配置
3. 后端调用算法层运行模拟
4. 算法层输出轨迹、指标和摘要
5. 后端通过 API 暴露数据
6. 前端读取并可视化这些结果

批量扫描流程：

1. 前端提交参数扫描定义
2. 后端重复运行多组模拟
3. 后端聚合结果
4. 前端读取最新扫描结果
5. 前端绘制趋势图

## 7. 当前工程风险

当前最值得关注的风险包括：

- threading proxy 仍然只是几何代理，不是严格拓扑判定
- 接触持续性指标是工程定义，不应误说成完整拓扑寿命
- 若参数扫描重复次数太少，趋势结论可能不稳
- 若文档与页面文案不一致，会直接影响课堂展示可信度

## 8. 最小可行演示

如果时间紧张，最小可行版本应至少包含：

- 一个可调参数的 Y 字耳机模型
- 一个口袋盒子环境
- 一段 3D 动画
- 一组接触 / 穿线 / 缠结指标
- 一个参数趋势图
- 一段清楚的指标解释

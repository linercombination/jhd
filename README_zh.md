# 耳机线打结演示项目

这是“口袋中耳机线打结”课程项目的可运行演示仓库。

项目中文档采用“英文权威版 + 中文对照版”的组织方式：

- 英文理论文档和英文工程文档是最终权威版本
- 中文文档用于课堂展示、组内讨论和汇报准备

## 仓库结构

```text
docs/       理论文档、工程文档与总览文档
algorithm/  模拟与分析引擎
backend/    FastAPI 后端服务
frontend/   React + Three.js + ECharts 前端演示
data/runs/  运行结果输出目录
```

## 当前项目范围

- 模拟一个 Y 字形有线耳机在线袋中的受限运动
- 使用粗粒化、基于力的过阻尼动力学近似
- 检测非局部接触与持续穿线代理事件
- 支持单次轨迹回放与批量参数趋势分析
- 前端使用中文界面，适合面对中国学生展示

## 演示流程

1. 在前端调整几何、力学、环境和数值控制参数。
2. 运行单次模拟，查看 3D 轨迹和时间序列指标。
3. 选择一个参数进行批量扫描。
4. 比较不同参数对接触数、穿线代理概率和缠结评分的影响。

## 前端主要区域

- `可控参数设置`
- `三维模拟视图`
- `结果摘要`
- `指标说明`
- `指标变化曲线`
- `参数趋势分析`

## 核心指标

- `接触数 Contact count`：非局部 bead 对之间足够靠近时记作接触
- `穿线代理事件 Threading proxy events`：刚性端进入局部闭环区域并持续若干采样帧
- `接触持续性 Contact persistence`：重复非局部接触在采样帧之间的持续强度
- `缠结评分 Tangle score`：把穿线代理事件、接触数和接触持续性组合成的工程指标

## 快速启动

### 后端

```text
cd backend
python -m venv .venv
.venv\\Scripts\\python -m pip install -r requirements.txt
.venv\\Scripts\\python -m uvicorn app.main:app --reload --port 8000
```

### 前端

```text
cd frontend
npm.cmd install
npm.cmd run dev -- --host 127.0.0.1 --port 5173
```

默认地址：

- 前端：[http://localhost:5173](http://localhost:5173)
- 后端：[http://localhost:8000](http://localhost:8000)

## API

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

## 文档入口

- 理论英文权威版：[earphone_tangling_project_plan_en.md](/E:/openSourceProject/jhd/docs/earphone_tangling_project_plan_en.md)
- 工程英文权威版：[earphone_tangling_engineering_plan_en.md](/E:/openSourceProject/jhd/docs/earphone_tangling_engineering_plan_en.md)
- 中文项目总览：[耳机线打结-项目执行方案.md](</E:/openSourceProject/jhd/docs/耳机线打结-项目执行方案.md>)

## 说明

- 这是一个面向课程展示的粗粒化演示程序，不是严格的科研级生产模拟器。
- 前端中的口袋几何与后端使用的 `W/H/T` 一致。
- 当前 threading 检测是几何代理，不是严格的拓扑结分类器。

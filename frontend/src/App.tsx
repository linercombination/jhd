import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import * as THREE from "three";

type RunResult = {
  run_id: string;
  status: string;
};

type Frame = {
  time: number;
  positions: number[][];
  events: { contacts: number[][]; threading: string[] };
};

type MetricRow = {
  time: number;
  N_contact: number;
  N_thread: number;
  S_tangle: number;
};

type Summary = {
  threading_ever: boolean;
  threading_event_count?: number;
  threading_count_total: number;
  threading_active_frame_count?: number;
  contact_count_max: number;
  contact_count_mean: number;
  contact_persistence_mean?: number;
  tangle_score_final: number;
  tangle_score_mean: number;
  bead_metadata: {
    arm_labels: string[];
    bead_types: string[];
    radii: number[];
    indices: Record<string, number>;
    arm_segments: Record<string, number[]>;
  };
};

type SimulationConfig = {
  geometry: {
    L_0: number;
    L_1: number;
    d_cable: number;
    r_plug: number;
    r_earbud: number;
    r_junction: number;
    b: number;
  };
  mechanics: {
    k_bend: number;
    gamma: number;
  };
  environment: {
    W: number;
    H: number;
    T: number;
    agitation_amplitude: number;
    tau_a: number;
  };
  control: {
    num_steps: number;
    dt: number;
    sample_interval: number;
    seed: number;
  };
};

type SimulationConfigForm = {
  geometry: Record<keyof SimulationConfig["geometry"], string>;
  mechanics: Record<keyof SimulationConfig["mechanics"], string>;
  environment: Record<keyof SimulationConfig["environment"], string>;
  control: Record<keyof SimulationConfig["control"], string>;
};

type BatchParameter =
  | "k_bend"
  | "gamma"
  | "agitation_amplitude"
  | "tau_a"
  | "L_0"
  | "L_1"
  | "d_cable"
  | "r_plug"
  | "r_earbud"
  | "r_junction"
  | "L_ratio";

type TrendResult = {
  parameter: string;
  value: number;
  mean_tangle_score: number;
  std_tangle_score: number;
  mean_threading_probability: number;
  std_threading_probability: number;
  repeats: number;
};

const API_BASE = "http://localhost:8000";

const DEFAULT_CONFIG: SimulationConfig = {
  geometry: {
    L_0: 0.7,
    L_1: 0.3,
    d_cable: 0.02,
    r_plug: 0.04,
    r_earbud: 0.03,
    r_junction: 0.035,
    b: 0.05,
  },
  mechanics: {
    k_bend: 0.7,
    gamma: 1.0,
  },
  environment: {
    W: 0.8,
    H: 0.8,
    T: 0.18,
    agitation_amplitude: 0.02,
    tau_a: 10.0,
  },
  control: {
    num_steps: 800,
    dt: 0.02,
    sample_interval: 10,
    seed: 42,
  },
};

const PARAMETER_LABELS: Record<BatchParameter, string> = {
  k_bend: "弯曲刚度 k_bend",
  gamma: "阻尼系数 gamma",
  agitation_amplitude: "扰动幅度",
  tau_a: "扰动相关时间 tau_a",
  L_0: "下端长度 L0",
  L_1: "单侧上支长度 L1",
  d_cable: "线缆直径",
  r_plug: "插头半径",
  r_earbud: "耳机头半径",
  r_junction: "Y 结半径",
  L_ratio: "长度比例 L0 / (L0 + L1)",
};

function toFormState(config: SimulationConfig): SimulationConfigForm {
  return {
    geometry: Object.fromEntries(
      Object.entries(config.geometry).map(([key, value]) => [key, String(value)]),
    ) as SimulationConfigForm["geometry"],
    mechanics: Object.fromEntries(
      Object.entries(config.mechanics).map(([key, value]) => [key, String(value)]),
    ) as SimulationConfigForm["mechanics"],
    environment: Object.fromEntries(
      Object.entries(config.environment).map(([key, value]) => [key, String(value)]),
    ) as SimulationConfigForm["environment"],
    control: Object.fromEntries(
      Object.entries(config.control).map(([key, value]) => [key, String(value)]),
    ) as SimulationConfigForm["control"],
  };
}

function parseRequiredNumber(value: string, label: string): number {
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new Error(`${label} 不能为空。`);
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} 必须是有效数字。`);
  }
  return parsed;
}

function parsePositiveNumber(value: string, label: string): number {
  const parsed = parseRequiredNumber(value, label);
  if (parsed <= 0) {
    throw new Error(`${label} 必须大于 0。`);
  }
  return parsed;
}

function parseNonNegativeNumber(value: string, label: string): number {
  const parsed = parseRequiredNumber(value, label);
  if (parsed < 0) {
    throw new Error(`${label} 不能小于 0。`);
  }
  return parsed;
}

function parsePositiveInteger(value: string, label: string): number {
  const parsed = parseRequiredNumber(value, label);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} 必须是正整数。`);
  }
  return parsed;
}

function parseInteger(value: string, label: string): number {
  const parsed = parseRequiredNumber(value, label);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${label} 必须是整数。`);
  }
  return parsed;
}

function buildConfigFromForm(form: SimulationConfigForm): SimulationConfig {
  return {
    geometry: {
      L_0: parsePositiveNumber(form.geometry.L_0, "下端长度 L0"),
      L_1: parsePositiveNumber(form.geometry.L_1, "单侧上支长度 L1"),
      d_cable: parsePositiveNumber(form.geometry.d_cable, "线缆直径"),
      r_plug: parsePositiveNumber(form.geometry.r_plug, "插头半径"),
      r_earbud: parsePositiveNumber(form.geometry.r_earbud, "耳机头半径"),
      r_junction: parsePositiveNumber(form.geometry.r_junction, "Y 结半径"),
      b: parsePositiveNumber(form.geometry.b, "离散步长 b"),
    },
    mechanics: {
      k_bend: parseNonNegativeNumber(form.mechanics.k_bend, "弯曲刚度 k_bend"),
      gamma: parsePositiveNumber(form.mechanics.gamma, "阻尼系数 gamma"),
    },
    environment: {
      W: parsePositiveNumber(form.environment.W, "口袋宽度 W"),
      H: parsePositiveNumber(form.environment.H, "口袋高度 H"),
      T: parsePositiveNumber(form.environment.T, "口袋厚度 T"),
      agitation_amplitude: parseNonNegativeNumber(form.environment.agitation_amplitude, "扰动幅度"),
      tau_a: parsePositiveNumber(form.environment.tau_a, "扰动相关时间 tau_a"),
    },
    control: {
      num_steps: parsePositiveInteger(form.control.num_steps, "总步数"),
      dt: parsePositiveNumber(form.control.dt, "时间步长 dt"),
      sample_interval: parsePositiveInteger(form.control.sample_interval, "采样间隔"),
      seed: parseInteger(form.control.seed, "随机种子"),
    },
  };
}

function parseBatchValues(text: string): number[] {
  const tokens = text.replaceAll("，", ",").split(",");
  if (tokens.length === 0) {
    throw new Error("请至少输入一个批量扫描参数值。");
  }
  const values = tokens.map((raw, index) => {
    const token = raw.trim();
    if (token === "") {
      throw new Error(`第 ${index + 1} 个参数值为空。`);
    }
    const parsed = Number(token);
    if (!Number.isFinite(parsed)) {
      throw new Error(`第 ${index + 1} 个参数值不是有效数字：${token}`);
    }
    return parsed;
  });
  return values;
}

function validateBatchValues(parameter: BatchParameter, values: number[]): void {
  values.forEach((value, index) => {
    const label = `第 ${index + 1} 个参数值`;
    if (parameter === "L_ratio") {
      if (!(value > 0 && value < 1)) {
        throw new Error(`${label} 对于 L_ratio 必须位于 0 到 1 之间。`);
      }
      return;
    }
    if (parameter === "k_bend" || parameter === "agitation_amplitude") {
      if (value < 0) {
        throw new Error(`${label} 不能小于 0。`);
      }
      return;
    }
    if (value <= 0) {
      throw new Error(`${label} 必须大于 0。`);
    }
  });
}

function extractHighlightedRigidBeads(eventIds: string[], summary: Summary | null): Set<number> {
  const highlighted = new Set<number>();
  if (!summary) return highlighted;

  const nameToIndex: Record<string, number | undefined> = {
    plug: summary.bead_metadata.indices.plug,
    left_earbud: summary.bead_metadata.indices.left_earbud,
    right_earbud: summary.bead_metadata.indices.right_earbud,
  };

  eventIds.forEach((eventId) => {
    const matched = eventId.match(/^(plug|left_earbud|right_earbud)_captured_by_/);
    if (!matched) return;
    const index = nameToIndex[matched[1]];
    if (typeof index === "number") {
      highlighted.add(index);
    }
  });
  return highlighted;
}

function formatNumber(value: number | undefined, digits = 2): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "0.00";
  return value.toFixed(digits);
}

export function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const trendRef = useRef<HTMLDivElement | null>(null);
  const cableGeometryRefs = useRef<Record<string, THREE.BufferGeometry>>({});
  const rigidMeshesRef = useRef<Record<number, THREE.Mesh>>({});
  const contactLineRefs = useRef<THREE.Line[]>([]);
  const pocketFrameRef = useRef<THREE.LineSegments | null>(null);
  const rigidGroupRef = useRef<THREE.Group | null>(null);
  const contactGroupRef = useRef<THREE.Group | null>(null);

  const [runId, setRunId] = useState("");
  const [frames, setFrames] = useState<Frame[]>([]);
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [activeConfig, setActiveConfig] = useState<SimulationConfig>(DEFAULT_CONFIG);
  const [playing, setPlaying] = useState(true);
  const [frameIndex, setFrameIndex] = useState(0);
  const [loadingRun, setLoadingRun] = useState(false);
  const [loadingBatch, setLoadingBatch] = useState(false);
  const [trendReloadToken, setTrendReloadToken] = useState(0);
  const [trendError, setTrendError] = useState("");
  const [configForm, setConfigForm] = useState<SimulationConfigForm>(toFormState(DEFAULT_CONFIG));
  const [batchParameter, setBatchParameter] = useState<BatchParameter>("k_bend");
  const [batchValuesText, setBatchValuesText] = useState("0.1, 0.3, 0.6, 0.9");
  const [batchRepeatsText, setBatchRepeatsText] = useState("3");

  const updateSection = <T extends keyof SimulationConfigForm, K extends keyof SimulationConfigForm[T]>(
    section: T,
    key: K,
    value: string,
  ) => {
    setConfigForm((current) => ({
      ...current,
      [section]: {
        ...current[section],
        [key]: value,
      },
    }));
  };

  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f4f1e8");

    const camera = new THREE.PerspectiveCamera(50, 720 / 440, 0.1, 100);
    camera.position.set(1.2, 1.05, 1.45);
    camera.lookAt(0.4, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(720, 440);
    mountRef.current.innerHTML = "";
    mountRef.current.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 1.12));
    const light = new THREE.DirectionalLight(0xffffff, 1.25);
    light.position.set(1, 2, 1);
    scene.add(light);

    const pocketWire = new THREE.WireframeGeometry(new THREE.BoxGeometry(1, 1, 1));
    const pocketMaterial = new THREE.LineBasicMaterial({ color: 0x6d5f4b });
    const pocketFrame = new THREE.LineSegments(pocketWire, pocketMaterial);
    pocketFrameRef.current = pocketFrame;
    scene.add(pocketFrame);

    const armColors: Record<string, number> = {
      trunk: 0xd65a31,
      left: 0x1f6feb,
      right: 0x2ea043,
    };
    const cableMaterials: THREE.LineBasicMaterial[] = [];
    ["trunk", "left", "right"].forEach((armName) => {
      const material = new THREE.LineBasicMaterial({ color: armColors[armName] });
      const geometry = new THREE.BufferGeometry();
      cableMaterials.push(material);
      cableGeometryRefs.current[armName] = geometry;
      scene.add(new THREE.Line(geometry, material));
    });

    const rigidGroup = new THREE.Group();
    rigidGroupRef.current = rigidGroup;
    scene.add(rigidGroup);

    const contactGroup = new THREE.Group();
    contactGroupRef.current = contactGroup;
    scene.add(contactGroup);

    let raf = 0;
    const renderLoop = () => {
      renderer.render(scene, camera);
      raf = requestAnimationFrame(renderLoop);
    };
    renderLoop();

    return () => {
      cancelAnimationFrame(raf);
      Object.values(cableGeometryRefs.current).forEach((geometry) => geometry.dispose());
      cableGeometryRefs.current = {};
      Object.values(rigidMeshesRef.current).forEach((mesh) => {
        mesh.geometry.dispose();
        if (mesh.material instanceof THREE.Material) mesh.material.dispose();
      });
      rigidMeshesRef.current = {};
      contactLineRefs.current.forEach((lineObject) => {
        lineObject.geometry.dispose();
        if (lineObject.material instanceof THREE.Material) lineObject.material.dispose();
      });
      contactLineRefs.current = [];
      pocketWire.dispose();
      pocketMaterial.dispose();
      cableMaterials.forEach((material) => material.dispose());
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    const pocketFrame = pocketFrameRef.current;
    if (!pocketFrame) return;
    pocketFrame.scale.set(
      activeConfig.environment.W,
      activeConfig.environment.H,
      activeConfig.environment.T,
    );
    pocketFrame.position.set(activeConfig.environment.W / 2, 0, 0);
  }, [activeConfig]);

  useEffect(() => {
    const rigidGroup = rigidGroupRef.current;
    if (!rigidGroup || !summary) return;

    Object.values(rigidMeshesRef.current).forEach((mesh) => {
      rigidGroup.remove(mesh);
      mesh.geometry.dispose();
      if (mesh.material instanceof THREE.Material) mesh.material.dispose();
    });
    rigidMeshesRef.current = {};

    summary.bead_metadata.bead_types.forEach((type, idx) => {
      if (type === "flex") return;
      const radius = summary.bead_metadata.radii[idx] ?? (type === "junction" ? 0.035 : 0.03);
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(radius, 0.02), 18, 18),
        new THREE.MeshStandardMaterial({
          color: type === "plug" ? 0x1f6feb : type === "junction" ? 0x2ea043 : 0xc73e1d,
        }),
      );
      rigidMeshesRef.current[idx] = mesh;
      rigidGroup.add(mesh);
    });
  }, [summary]);

  useEffect(() => {
    const frame = frames[frameIndex];
    const contactGroup = contactGroupRef.current;
    if (!frame || !contactGroup || !summary) return;

    Object.entries(summary.bead_metadata.arm_segments).forEach(([armName, indices]) => {
      const geometry = cableGeometryRefs.current[armName];
      if (!geometry) return;
      const coords = new Float32Array(indices.flatMap((idx) => frame.positions[idx]));
      geometry.setAttribute("position", new THREE.BufferAttribute(coords, 3));
      geometry.computeBoundingSphere();
    });

    Object.entries(rigidMeshesRef.current).forEach(([idxText, mesh]) => {
      const idx = Number(idxText);
      const [x, y, z] = frame.positions[idx];
      mesh.position.set(x, y, z);
      mesh.scale.set(1, 1, 1);
    });

    contactLineRefs.current.forEach((lineObject) => {
      contactGroup.remove(lineObject);
      lineObject.geometry.dispose();
      if (lineObject.material instanceof THREE.Material) lineObject.material.dispose();
    });
    contactLineRefs.current = [];

    frame.events.contacts.forEach(([i, j]) => {
      const coords = new Float32Array([...frame.positions[i], ...frame.positions[j]]);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(coords, 3));
      const material = new THREE.LineBasicMaterial({
        color: 0xf5a623,
        transparent: true,
        opacity: 0.9,
      });
      const lineObject = new THREE.Line(geometry, material);
      contactLineRefs.current.push(lineObject);
      contactGroup.add(lineObject);
    });

    const highlightedRigidBeads = extractHighlightedRigidBeads(frame.events.threading, summary);
    highlightedRigidBeads.forEach((idx) => {
      const mesh = rigidMeshesRef.current[idx];
      if (mesh) {
        mesh.scale.set(1.2, 1.2, 1.2);
      }
    });
  }, [frames, frameIndex, summary]);

  useEffect(() => {
    if (!playing || frames.length === 0) return;
    const id = window.setInterval(() => {
      setFrameIndex((value) => (value + 1) % frames.length);
    }, 100);
    return () => window.clearInterval(id);
  }, [playing, frames.length]);

  useEffect(() => {
    if (!chartRef.current || metrics.length === 0) return;
    const chart = echarts.init(chartRef.current);
    chart.setOption({
      tooltip: { trigger: "axis" },
      legend: { data: ["穿线代理事件数", "非局部接触数", "缠结评分"] },
      xAxis: {
        type: "category",
        name: "时间 (s)",
        data: metrics.map((m) => m.time.toFixed(2)),
      },
      yAxis: { type: "value", name: "指标值" },
      series: [
        { name: "穿线代理事件数", type: "line", data: metrics.map((m) => m.N_thread), smooth: true },
        { name: "非局部接触数", type: "line", data: metrics.map((m) => m.N_contact), smooth: true },
        { name: "缠结评分", type: "line", data: metrics.map((m) => m.S_tangle), smooth: true },
      ],
    });
    return () => chart.dispose();
  }, [metrics]);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    let chart: echarts.ECharts | undefined;

    const run = async () => {
      setTrendError("");
      const response = await fetch(`${API_BASE}/api/analysis/trends`, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Trend request failed with status ${response.status}`);
      }
      const trendPayload = await response.json();
      if (disposed || !trendRef.current) return;
      if (!Array.isArray(trendPayload) || trendPayload.length === 0) {
        setTrendError("还没有批量扫描结果，请先运行一次参数扫描。");
        return;
      }

      const latest = trendPayload[trendPayload.length - 1];
      const results = latest?.summary?.results as TrendResult[] | undefined;
      const parameter = latest?.summary?.parameter as BatchParameter | undefined;
      if (!Array.isArray(results) || results.length === 0) {
        setTrendError("最近一次批量扫描没有可展示的结果。");
        return;
      }

      chart = echarts.init(trendRef.current);
      chart.setOption({
        tooltip: { trigger: "axis" },
        title: { text: `参数趋势：${parameter ? PARAMETER_LABELS[parameter] : "最近一次扫描"}` },
        legend: { data: ["平均穿线概率", "平均缠结评分"] },
        xAxis: {
          type: "category",
          name: "参数值",
          data: results.map((row) => String(row.value)),
        },
        yAxis: [
          { type: "value", name: "平均穿线概率" },
          { type: "value", name: "平均缠结评分" },
        ],
        series: [
          {
            type: "line",
            name: "平均穿线概率",
            data: results.map((row) => row.mean_threading_probability),
            smooth: true,
          },
          {
            type: "line",
            name: "平均缠结评分",
            yAxisIndex: 1,
            data: results.map((row) => row.mean_tangle_score),
            smooth: true,
          },
        ],
      });
    };

    run().catch((error: unknown) => {
      if (disposed || (error instanceof DOMException && error.name === "AbortError")) return;
      console.error(error);
      setTrendError("参数趋势图加载失败，请确认后端服务仍在运行。");
    });

    return () => {
      disposed = true;
      controller.abort();
      chart?.dispose();
    };
  }, [trendReloadToken]);

  const summaryText = useMemo(() => {
    if (!summary) {
      return "先运行一次模拟，再查看缠结摘要与指标变化。";
    }
    if (summary.threading_ever) {
      return "本次轨迹中出现了持续的“穿线代理事件”，说明某个刚性端进入了局部闭环区域，并且停留了不止一个采样帧。";
    }
    return "本次轨迹中没有检测到持续的“穿线代理事件”，但这并不代表完全不缠结，仍可能存在较多非局部接触。";
  }, [summary]);

  const createRun = async () => {
    setLoadingRun(true);
    try {
      const payload = buildConfigFromForm(configForm);
      const response = await fetch(`${API_BASE}/api/simulations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.detail ?? `Simulation creation failed with status ${response.status}`);
      }

      const result: RunResult = await response.json();
      if (!result.run_id) {
        throw new Error("后端返回中缺少 run_id。");
      }

      setRunId(result.run_id);
      setActiveConfig(payload);

      const [trajectoryRes, metricsRes, summaryRes] = await Promise.all([
        fetch(`${API_BASE}/api/simulations/${result.run_id}/trajectory`),
        fetch(`${API_BASE}/api/simulations/${result.run_id}/metrics`),
        fetch(`${API_BASE}/api/simulations/${result.run_id}/summary`),
      ]);

      if (!trajectoryRes.ok || !metricsRes.ok || !summaryRes.ok) {
        throw new Error("模拟结果读取失败，请检查后端输出。");
      }

      const [trajectory, metricsPayload, summaryPayload] = await Promise.all([
        trajectoryRes.json(),
        metricsRes.json(),
        summaryRes.json(),
      ]);

      setFrames(trajectory);
      setMetrics(metricsPayload);
      setSummary(summaryPayload);
      setFrameIndex(0);
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "模拟运行失败。");
    } finally {
      setLoadingRun(false);
    }
  };

  const createBatch = async () => {
    setLoadingBatch(true);
    try {
      const baseConfig = buildConfigFromForm(configForm);
      const values = parseBatchValues(batchValuesText);
      validateBatchValues(batchParameter, values);
      const repeats = parsePositiveInteger(batchRepeatsText, "重复次数");
      const payload = {
        parameter: batchParameter,
        values,
        repeats,
        base_config: baseConfig,
      };

      const response = await fetch(`${API_BASE}/api/batches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.detail ?? `Batch request failed with status ${response.status}`);
      }

      setTrendReloadToken((value) => value + 1);
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "批量扫描失败。");
    } finally {
      setLoadingBatch(false);
    }
  };

  const controlsBusy = loadingRun || loadingBatch;
  const currentFrame = frames[frameIndex];
  const currentThreadingEvents = currentFrame?.events.threading ?? [];

  return (
    <div className="page">
      <div className="hero">
        <div>
          <h1>耳机线打结模拟演示</h1>
          <p>
            这个页面展示的是一个面向课堂汇报的粗粒化模型：我们把 Y
            字耳机线离散成珠链，在口袋环境中做受限运动，并追踪非局部接触、穿线代理事件和缠结评分。
          </p>
        </div>
        <div className="actions">
          <button onClick={() => void createRun()} disabled={controlsBusy}>
            {loadingRun ? "正在运行模拟..." : "运行单次模拟"}
          </button>
          <button onClick={() => void createBatch()} disabled={controlsBusy}>
            {loadingBatch ? "正在批量扫描..." : "运行参数扫描"}
          </button>
          <button onClick={() => setPlaying((value) => !value)} disabled={frames.length === 0}>
            {playing ? "暂停播放" : "继续播放"}
          </button>
        </div>
      </div>

      <div className="grid">
        <section className="card wide">
          <h2>可控参数设置</h2>
          <p className="meta">
            所有长度单位均为 m，时间单位为 s。前端中显示的口袋盒子尺寸会和后端实际模拟使用的 W/H/T 保持一致。
          </p>
          <div className="control-grid">
            <div className="control-group">
              <h3>几何参数</h3>
              <label>
                下端长度 L0 (m)
                <input type="number" step="0.01" value={configForm.geometry.L_0} onChange={(e) => updateSection("geometry", "L_0", e.target.value)} />
              </label>
              <label>
                单侧上支长度 L1 (m)
                <input type="number" step="0.01" value={configForm.geometry.L_1} onChange={(e) => updateSection("geometry", "L_1", e.target.value)} />
              </label>
              <label>
                线缆直径 (m)
                <input type="number" step="0.005" value={configForm.geometry.d_cable} onChange={(e) => updateSection("geometry", "d_cable", e.target.value)} />
              </label>
              <label>
                插头半径 (m)
                <input type="number" step="0.005" value={configForm.geometry.r_plug} onChange={(e) => updateSection("geometry", "r_plug", e.target.value)} />
              </label>
              <label>
                耳机头半径 (m)
                <input type="number" step="0.005" value={configForm.geometry.r_earbud} onChange={(e) => updateSection("geometry", "r_earbud", e.target.value)} />
              </label>
              <label>
                Y 结半径 (m)
                <input type="number" step="0.005" value={configForm.geometry.r_junction} onChange={(e) => updateSection("geometry", "r_junction", e.target.value)} />
              </label>
              <label>
                离散步长 b (m)
                <input type="number" step="0.005" value={configForm.geometry.b} onChange={(e) => updateSection("geometry", "b", e.target.value)} />
              </label>
            </div>

            <div className="control-group">
              <h3>力学与环境参数</h3>
              <label>
                弯曲刚度 k_bend
                <input type="number" step="0.1" value={configForm.mechanics.k_bend} onChange={(e) => updateSection("mechanics", "k_bend", e.target.value)} />
              </label>
              <label>
                阻尼系数 gamma
                <input type="number" step="0.1" value={configForm.mechanics.gamma} onChange={(e) => updateSection("mechanics", "gamma", e.target.value)} />
              </label>
              <label>
                扰动幅度 (m)
                <input type="number" step="0.005" value={configForm.environment.agitation_amplitude} onChange={(e) => updateSection("environment", "agitation_amplitude", e.target.value)} />
              </label>
              <label>
                扰动相关时间 tau_a (s)
                <input type="number" step="0.5" value={configForm.environment.tau_a} onChange={(e) => updateSection("environment", "tau_a", e.target.value)} />
              </label>
              <label>
                口袋宽度 W (m)
                <input type="number" step="0.05" value={configForm.environment.W} onChange={(e) => updateSection("environment", "W", e.target.value)} />
              </label>
              <label>
                口袋高度 H (m)
                <input type="number" step="0.05" value={configForm.environment.H} onChange={(e) => updateSection("environment", "H", e.target.value)} />
              </label>
              <label>
                口袋厚度 T (m)
                <input type="number" step="0.01" value={configForm.environment.T} onChange={(e) => updateSection("environment", "T", e.target.value)} />
              </label>
            </div>

            <div className="control-group">
              <h3>数值控制</h3>
              <label>
                总步数
                <input type="number" step="1" value={configForm.control.num_steps} onChange={(e) => updateSection("control", "num_steps", e.target.value)} />
              </label>
              <label>
                时间步长 dt (s)
                <input type="number" step="0.01" value={configForm.control.dt} onChange={(e) => updateSection("control", "dt", e.target.value)} />
              </label>
              <label>
                采样间隔
                <input type="number" step="1" value={configForm.control.sample_interval} onChange={(e) => updateSection("control", "sample_interval", e.target.value)} />
              </label>
              <label>
                随机种子
                <input type="number" step="1" value={configForm.control.seed} onChange={(e) => updateSection("control", "seed", e.target.value)} />
              </label>
            </div>

            <div className="control-group">
              <h3>参数扫描</h3>
              <label>
                扫描参数
                <select value={batchParameter} onChange={(e) => setBatchParameter(e.target.value as BatchParameter)}>
                  <option value="k_bend">弯曲刚度 k_bend</option>
                  <option value="gamma">阻尼系数 gamma</option>
                  <option value="agitation_amplitude">扰动幅度 (m)</option>
                  <option value="tau_a">扰动相关时间 tau_a (s)</option>
                  <option value="L_0">下端长度 L0 (m)</option>
                  <option value="L_1">单侧上支长度 L1 (m)</option>
                  <option value="d_cable">线缆直径 (m)</option>
                  <option value="r_plug">插头半径 (m)</option>
                  <option value="r_earbud">耳机头半径 (m)</option>
                  <option value="r_junction">Y 结半径 (m)</option>
                  <option value="L_ratio">长度比例 L0 / (L0 + L1)</option>
                </select>
              </label>
              <label>
                参数值列表
                <input type="text" value={batchValuesText} onChange={(e) => setBatchValuesText(e.target.value)} placeholder="例如 0.1, 0.3, 0.6, 0.9" />
              </label>
              <label>
                每组重复次数
                <input type="number" step="1" value={batchRepeatsText} onChange={(e) => setBatchRepeatsText(e.target.value)} />
              </label>
              <p className="meta">
                批量扫描会固定其它参数，只改变一个参数，并对每个参数值重复多次，最后汇总平均穿线概率和平均缠结评分。
              </p>
            </div>
          </div>
        </section>

        <section className="card wide">
          <h2>三维模拟视图</h2>
          <div ref={mountRef} className="viewer" />
          <p className="meta">当前运行 ID：{runId || "尚未运行"}</p>
          <p className="meta">
            橙色线段表示非局部接触；被放大的刚性端表示它参与了当前帧的穿线代理事件。口袋边框尺寸与当前模拟参数一致。
          </p>
        </section>

        <section className="card">
          <h2>结果摘要</h2>
          <p>{summaryText}</p>
          <ul className="stats">
            <li>不同穿线代理事件数：{summary?.threading_event_count ?? 0}</li>
            <li>发生穿线的采样帧数：{summary?.threading_active_frame_count ?? 0}</li>
            <li>最大非局部接触数：{summary?.contact_count_max ?? 0}</li>
            <li>平均非局部接触数：{formatNumber(summary?.contact_count_mean)}</li>
            <li>平均接触持续性：{formatNumber(summary?.contact_persistence_mean)}</li>
            <li>最终缠结评分：{formatNumber(summary?.tangle_score_final)}</li>
            <li>平均缠结评分：{formatNumber(summary?.tangle_score_mean)}</li>
          </ul>
        </section>

        <section className="card">
          <h2>指标说明</h2>
          <div className="metric-help">
            <p>
              <strong>非局部接触数 N_contact：</strong>
              指两段在拓扑上相隔较远、但空间上靠得很近的线段对数。它反映的是“缠在一起的拥挤程度”。
            </p>
            <p>
              <strong>穿线代理事件数 N_thread：</strong>
              当前版本不是严格的拓扑打结判定，而是一个“套环/穿线代理指标”：当某个刚性端进入局部闭环区域并持续至少两个采样帧时，就记为一次有效事件。
            </p>
            <p>
              <strong>接触持续性：</strong>
              不是看某一瞬间碰到了几次，而是看同一组非局部接触是否连续维持。这个量越大，说明结构越不容易自行散开。
            </p>
            <p>
              <strong>缠结评分 S_tangle：</strong>
              是把持续穿线代理事件、非局部接触数和接触持续性加权组合后的工程指标。它便于做参数比较，但不是严格的数学结不变量。
            </p>
          </div>
        </section>

        <section className="card wide">
          <h2>指标变化曲线</h2>
          <div ref={chartRef} className="chart" />
          <p className="meta">
            这张图按时间展示当前轨迹的三个核心指标。若某段时间同时出现较多非局部接触和持续的穿线代理事件，缠结评分通常也会升高。
          </p>
        </section>

        <section className="card wide">
          <h2>参数趋势分析</h2>
          <div ref={trendRef} className="chart" />
          <p className="meta">
            这张图读取最近一次批量扫描结果，用于总结“改变某个参数后，平均穿线概率和平均缠结评分如何变化”。
          </p>
          {trendError ? <p className="meta">{trendError}</p> : null}
        </section>

        <section className="card wide">
          <h2>当前帧事件说明</h2>
          <p className="meta">
            当前时间：{currentFrame ? `${currentFrame.time.toFixed(2)} s` : "尚无轨迹数据"}
          </p>
          <p className="meta">
            当前帧非局部接触数：{currentFrame?.events.contacts.length ?? 0}
          </p>
          <p className="meta">
            当前帧穿线代理事件：
            {currentThreadingEvents.length > 0 ? currentThreadingEvents.join("；") : "无"}
          </p>
        </section>
      </div>
    </div>
  );
}

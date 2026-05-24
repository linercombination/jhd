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
  threading_count_total: number;
  contact_count_max: number;
  contact_count_mean: number;
  tangle_score_final: number;
  tangle_score_mean: number;
  bead_metadata: {
    arm_labels: string[];
    bead_types: string[];
    radii: number[];
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
  geometry: {
    L_0: string;
    L_1: string;
    d_cable: string;
    r_plug: string;
    r_earbud: string;
    r_junction: string;
    b: string;
  };
  mechanics: {
    k_bend: string;
    gamma: string;
  };
  environment: {
    W: string;
    H: string;
    T: string;
    agitation_amplitude: string;
    tau_a: string;
  };
  control: {
    num_steps: string;
    dt: string;
    sample_interval: string;
    seed: string;
  };
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

function toFormState(config: SimulationConfig): SimulationConfigForm {
  return {
    geometry: {
      L_0: String(config.geometry.L_0),
      L_1: String(config.geometry.L_1),
      d_cable: String(config.geometry.d_cable),
      r_plug: String(config.geometry.r_plug),
      r_earbud: String(config.geometry.r_earbud),
      r_junction: String(config.geometry.r_junction),
      b: String(config.geometry.b),
    },
    mechanics: {
      k_bend: String(config.mechanics.k_bend),
      gamma: String(config.mechanics.gamma),
    },
    environment: {
      W: String(config.environment.W),
      H: String(config.environment.H),
      T: String(config.environment.T),
      agitation_amplitude: String(config.environment.agitation_amplitude),
      tau_a: String(config.environment.tau_a),
    },
    control: {
      num_steps: String(config.control.num_steps),
      dt: String(config.control.dt),
      sample_interval: String(config.control.sample_interval),
      seed: String(config.control.seed),
    },
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
      L_0: parsePositiveNumber(form.geometry.L_0, "主干长度 L0"),
      L_1: parsePositiveNumber(form.geometry.L_1, "支链长度 L1"),
      d_cable: parsePositiveNumber(form.geometry.d_cable, "线材直径"),
      r_plug: parsePositiveNumber(form.geometry.r_plug, "插头半径"),
      r_earbud: parsePositiveNumber(form.geometry.r_earbud, "耳机头半径"),
      r_junction: parsePositiveNumber(form.geometry.r_junction, "分叉点半径"),
      b: parsePositiveNumber(form.geometry.b, "珠子间距 b"),
    },
    mechanics: {
      k_bend: parseNonNegativeNumber(form.mechanics.k_bend, "弯曲刚性 k_bend"),
      gamma: parsePositiveNumber(form.mechanics.gamma, "阻尼系数 gamma"),
    },
    environment: {
      W: parsePositiveNumber(form.environment.W, "口袋宽度 W"),
      H: parsePositiveNumber(form.environment.H, "口袋高度 H"),
      T: parsePositiveNumber(form.environment.T, "口袋厚度 T"),
      agitation_amplitude: parseNonNegativeNumber(form.environment.agitation_amplitude, "扰动强度"),
      tau_a: parsePositiveNumber(form.environment.tau_a, "扰动相关时间 tau_a"),
    },
    control: {
      num_steps: parsePositiveInteger(form.control.num_steps, "模拟步数"),
      dt: parsePositiveNumber(form.control.dt, "时间步长 dt"),
      sample_interval: parsePositiveInteger(form.control.sample_interval, "采样间隔"),
      seed: parseInteger(form.control.seed, "随机种子"),
    },
  };
}

function parseBatchValues(text: string): number[] {
  const normalized = text.replaceAll("，", ",");
  const tokens = normalized.split(",");
  if (tokens.length === 0) {
    throw new Error("请至少填写一个批量参数取值。");
  }

  const values = tokens.map((raw, index) => {
    const token = raw.trim();
    if (token === "") {
      throw new Error(`第 ${index + 1} 个批量参数取值为空，请检查是否有多余逗号。`);
    }
    const parsed = Number(token);
    if (!Number.isFinite(parsed)) {
      throw new Error(`第 ${index + 1} 个批量参数取值不是有效数字：${token}`);
    }
    return parsed;
  });

  if (values.length === 0) {
    throw new Error("请至少填写一个有效的批量参数取值。");
  }
  return values;
}

function validateBatchValues(parameter: BatchParameter, values: number[]): void {
  values.forEach((value, index) => {
    const label = `第 ${index + 1} 个批量参数取值`;
    if (parameter === "L_ratio") {
      if (!(value > 0 && value < 1)) {
        throw new Error(`${label} 对于 L_ratio 必须在 0 和 1 之间。`);
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

export function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const trendRef = useRef<HTMLDivElement | null>(null);
  const cableGeometryRefs = useRef<Record<string, THREE.BufferGeometry>>({});
  const rigidGroupRef = useRef<THREE.Group | null>(null);
  const rigidMeshesRef = useRef<Record<number, THREE.Mesh>>({});
  const [runId, setRunId] = useState<string>("");
  const [frames, setFrames] = useState<Frame[]>([]);
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
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
    const camera = new THREE.PerspectiveCamera(50, 1.6, 0.1, 100);
    camera.position.set(1.2, 1.1, 1.4);
    camera.lookAt(0.4, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(720, 440);
    mountRef.current.innerHTML = "";
    mountRef.current.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambient);
    const light = new THREE.DirectionalLight(0xffffff, 1.2);
    light.position.set(1, 2, 1);
    scene.add(light);

    const box = new THREE.BoxGeometry(0.8, 0.8, 0.18);
    const wire = new THREE.WireframeGeometry(box);
    const frameMaterial = new THREE.LineBasicMaterial({ color: 0x6d5f4b });
    const pocketFrame = new THREE.LineSegments(wire, frameMaterial);
    pocketFrame.position.set(0.4, 0, 0);
    scene.add(pocketFrame);

    const armColors: Record<string, number> = {
      trunk: 0xd65a31,
      left: 0x1f6feb,
      right: 0x2ea043,
    };
    const cableMaterials: THREE.LineBasicMaterial[] = [];
    ["trunk", "left", "right"].forEach((armName) => {
      const cableMaterial = new THREE.LineBasicMaterial({ color: armColors[armName] });
      cableMaterials.push(cableMaterial);
      const cableGeometry = new THREE.BufferGeometry();
      cableGeometryRefs.current[armName] = cableGeometry;
      const cableLine = new THREE.Line(cableGeometry, cableMaterial);
      scene.add(cableLine);
    });

    const rigidGroup = new THREE.Group();
    rigidGroupRef.current = rigidGroup;
    scene.add(rigidGroup);

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
        const material = mesh.material;
        if (material instanceof THREE.Material) {
          material.dispose();
        }
      });
      rigidMeshesRef.current = {};
      wire.dispose();
      box.dispose();
      frameMaterial.dispose();
      cableMaterials.forEach((material) => material.dispose());
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    const rigidGroup = rigidGroupRef.current;
    if (!rigidGroup || !summary) return;

    Object.values(rigidMeshesRef.current).forEach((mesh) => {
      rigidGroup.remove(mesh);
      mesh.geometry.dispose();
      const material = mesh.material;
      if (material instanceof THREE.Material) {
        material.dispose();
      }
    });
    rigidMeshesRef.current = {};

    summary.bead_metadata.bead_types.forEach((type, idx) => {
      if (type === "flex") return;
      const radius = summary.bead_metadata.radii[idx] ?? (type === "junction" ? 0.035 : 0.03);
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(radius, 0.02), 16, 16),
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
    const rigidGroup = rigidGroupRef.current;
    if (!frame || !rigidGroup || !summary) return;

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
      legend: { data: ["穿线事件数", "接触数", "缠结评分"] },
      xAxis: {
        type: "category",
        name: "时间",
        data: metrics.map((m) => m.time.toFixed(2)),
      },
      yAxis: { type: "value", name: "指标值" },
      series: [
        { name: "穿线事件数", type: "line", data: metrics.map((m) => m.N_thread) },
        { name: "接触数", type: "line", data: metrics.map((m) => m.N_contact) },
        { name: "缠结评分", type: "line", data: metrics.map((m) => m.S_tangle) },
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
      const response = await fetch(`${API_BASE}/api/analysis/trends`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Trend request failed with status ${response.status}`);
      }

      const trend = await response.json();
      if (disposed || !trendRef.current) return;

      if (!Array.isArray(trend) || trend.length === 0) {
        setTrendError("当前还没有批量分析结果，请先运行批量扫描。");
        return;
      }

      const latest = trend[trend.length - 1];
      const results = latest?.summary?.results;
      if (!Array.isArray(results) || results.length === 0) {
        setTrendError("最新批量分析结果为空。");
        return;
      }

      chart = echarts.init(trendRef.current);
      chart.setOption({
        tooltip: { trigger: "axis" },
        title: { text: "参数趋势汇总" },
        xAxis: {
          type: "category",
          name: "参数取值",
          data: results.map((r: { value: number }) => String(r.value)),
        },
        yAxis: [
          { type: "value", name: "穿线概率" },
          { type: "value", name: "缠结评分" },
        ],
        series: [
          {
            type: "line",
            name: "平均穿线概率",
            data: results.map((r: { mean_threading_probability: number }) => r.mean_threading_probability),
          },
          {
            type: "line",
            name: "平均缠结评分",
            yAxisIndex: 1,
            data: results.map((r: { mean_tangle_score: number }) => r.mean_tangle_score),
          },
        ],
      });
    };

    run().catch((error: unknown) => {
      if (disposed || (error instanceof DOMException && error.name === "AbortError")) {
        return;
      }
      console.error(error);
      setTrendError("趋势分析加载失败。");
    });

    return () => {
      disposed = true;
      controller.abort();
      chart?.dispose();
    };
  }, [trendReloadToken]);

  const summaryText = useMemo(() => {
    if (!summary) return "当前还没有加载模拟结果。";
    return summary.threading_ever
      ? "本次模拟中出现了穿线式缠结事件。"
      : "本次模拟中没有检测到持续性的穿线式缠结事件。";
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
        throw new Error(`Simulation creation failed with status ${response.status}`);
      }

      const result: RunResult = await response.json();
      if (!result.run_id) {
        throw new Error("Simulation response did not include a run_id");
      }

      setRunId(result.run_id);
      const [trajectoryRes, metricsRes, summaryRes] = await Promise.all([
        fetch(`${API_BASE}/api/simulations/${result.run_id}/trajectory`),
        fetch(`${API_BASE}/api/simulations/${result.run_id}/metrics`),
        fetch(`${API_BASE}/api/simulations/${result.run_id}/summary`),
      ]);
      if (!trajectoryRes.ok || !metricsRes.ok || !summaryRes.ok) {
        throw new Error("One or more simulation result endpoints failed");
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
      window.alert(error instanceof Error ? error.message : "模拟运行失败，请检查后端服务和请求参数。");
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
      const repeats = parsePositiveInteger(batchRepeatsText, "每组重复次数");

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
        const detail = errorBody?.detail ?? `Batch request failed with status ${response.status}`;
        throw new Error(detail);
      }
      setTrendReloadToken((value) => value + 1);
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "批量分析失败，请检查后端日志和请求参数。");
    } finally {
      setLoadingBatch(false);
    }
  };

  const controlsBusy = loadingRun || loadingBatch;

  return (
    <div className="page">
      <div className="hero">
        <div>
          <h1>耳机线打结演示程序</h1>
          <p>基于 Three.js 与 FastAPI 的 Y 型有线耳机口袋缠结模拟演示。</p>
        </div>
        <div className="actions">
          <button onClick={() => void createRun()} disabled={controlsBusy}>
            {loadingRun ? "模拟运行中..." : "运行单次模拟"}
          </button>
          <button onClick={() => void createBatch()} disabled={controlsBusy}>
            {loadingBatch ? "批量分析中..." : "运行批量分析"}
          </button>
          <button onClick={() => setPlaying((value) => !value)} disabled={frames.length === 0}>
            {playing ? "暂停" : "播放"}
          </button>
        </div>
      </div>

      <div className="grid">
        <section className="card wide">
          <h2>可控参数设置</h2>
          <p className="meta">先调整参数，再运行单次模拟或批量分析。建议课堂展示时优先调节线材刚性、扰动强度和主干长度。</p>
          <div className="control-grid">
            <div className="control-group">
              <h3>几何参数</h3>
              <label>
                主干长度 L0
                <input type="number" step="0.01" value={configForm.geometry.L_0} onChange={(e) => updateSection("geometry", "L_0", e.target.value)} />
              </label>
              <label>
                支链长度 L1
                <input type="number" step="0.01" value={configForm.geometry.L_1} onChange={(e) => updateSection("geometry", "L_1", e.target.value)} />
              </label>
              <label>
                线材直径
                <input type="number" step="0.005" value={configForm.geometry.d_cable} onChange={(e) => updateSection("geometry", "d_cable", e.target.value)} />
              </label>
              <label>
                插头半径
                <input type="number" step="0.005" value={configForm.geometry.r_plug} onChange={(e) => updateSection("geometry", "r_plug", e.target.value)} />
              </label>
              <label>
                耳机头半径
                <input type="number" step="0.005" value={configForm.geometry.r_earbud} onChange={(e) => updateSection("geometry", "r_earbud", e.target.value)} />
              </label>
              <label>
                分叉点半径
                <input type="number" step="0.005" value={configForm.geometry.r_junction} onChange={(e) => updateSection("geometry", "r_junction", e.target.value)} />
              </label>
              <label>
                珠子间距 b
                <input type="number" step="0.005" value={configForm.geometry.b} onChange={(e) => updateSection("geometry", "b", e.target.value)} />
              </label>
            </div>

            <div className="control-group">
              <h3>动力学参数</h3>
              <label>
                弯曲刚性 k_bend
                <input type="number" step="0.1" value={configForm.mechanics.k_bend} onChange={(e) => updateSection("mechanics", "k_bend", e.target.value)} />
              </label>
              <label>
                阻尼系数 gamma
                <input type="number" step="0.1" value={configForm.mechanics.gamma} onChange={(e) => updateSection("mechanics", "gamma", e.target.value)} />
              </label>
              <label>
                扰动强度
                <input type="number" step="0.005" value={configForm.environment.agitation_amplitude} onChange={(e) => updateSection("environment", "agitation_amplitude", e.target.value)} />
              </label>
              <label>
                扰动相关时间 tau_a
                <input type="number" step="0.5" value={configForm.environment.tau_a} onChange={(e) => updateSection("environment", "tau_a", e.target.value)} />
              </label>
              <label>
                口袋宽度 W
                <input type="number" step="0.05" value={configForm.environment.W} onChange={(e) => updateSection("environment", "W", e.target.value)} />
              </label>
              <label>
                口袋高度 H
                <input type="number" step="0.05" value={configForm.environment.H} onChange={(e) => updateSection("environment", "H", e.target.value)} />
              </label>
              <label>
                口袋厚度 T
                <input type="number" step="0.01" value={configForm.environment.T} onChange={(e) => updateSection("environment", "T", e.target.value)} />
              </label>
            </div>

            <div className="control-group">
              <h3>数值控制</h3>
              <label>
                模拟步数
                <input type="number" step="1" value={configForm.control.num_steps} onChange={(e) => updateSection("control", "num_steps", e.target.value)} />
              </label>
              <label>
                时间步长 dt
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
              <h3>批量分析参数</h3>
              <label>
                扫描参数
                <select value={batchParameter} onChange={(e) => setBatchParameter(e.target.value as BatchParameter)}>
                  <option value="k_bend">弯曲刚性 k_bend</option>
                  <option value="gamma">阻尼系数 gamma</option>
                  <option value="agitation_amplitude">扰动强度</option>
                  <option value="tau_a">扰动相关时间 tau_a</option>
                  <option value="L_0">主干长度 L0</option>
                  <option value="L_1">支链长度 L1</option>
                  <option value="d_cable">线材直径</option>
                  <option value="r_plug">插头半径</option>
                  <option value="r_earbud">耳机头半径</option>
                  <option value="r_junction">分叉点半径</option>
                  <option value="L_ratio">主干长度占比 L0 / (L0 + L1)</option>
                </select>
              </label>
              <label>
                参数取值列表
                <input type="text" value={batchValuesText} onChange={(e) => setBatchValuesText(e.target.value)} placeholder="例如 0.1, 0.3, 0.6, 0.9" />
              </label>
              <label>
                每组重复次数
                <input type="number" step="1" value={batchRepeatsText} onChange={(e) => setBatchRepeatsText(e.target.value)} />
              </label>
              <p className="meta">批量分析会固定其余参数，只扫描这里选中的一个参数，用来生成趋势图。</p>
            </div>
          </div>
        </section>

        <section className="card wide">
          <h2>三维模拟视图</h2>
          <div ref={mountRef} className="viewer" />
          <p className="meta">当前运行: {runId || "暂无"}</p>
        </section>

        <section className="card">
          <h2>结果摘要</h2>
          <p>{summaryText}</p>
          <ul className="stats">
            <li>总穿线事件数: {summary?.threading_count_total ?? 0}</li>
            <li>最大接触数: {summary?.contact_count_max ?? 0}</li>
            <li>平均缠结评分: {summary?.tangle_score_mean?.toFixed(2) ?? "0.00"}</li>
          </ul>
        </section>

        <section className="card">
          <h2>指标说明</h2>
          <div className="metric-help">
            <p><strong>接触数</strong>：同一时刻耳机线上彼此靠得很近、可能互相碰到的点对数量。数值越大，说明线越容易挤在一起。</p>
            <p><strong>穿线事件数</strong>：耳机头或插头靠近 Y 字分叉位置的次数，可把它理解为“更像真正打结”的危险信号。</p>
            <p><strong>缠结评分</strong>：把接触和穿线综合成一个总分。分数越高，表示这次模拟里的打结趋势越明显。</p>
          </div>
        </section>

        <section className="card wide">
          <h2>指标变化图</h2>
          <div ref={chartRef} className="chart" />
          <p className="meta">横轴是时间，纵轴是指标值，用来观察耳机在运动过程中何时开始变得更容易缠结。</p>
        </section>

        <section className="card wide">
          <h2>参数趋势分析</h2>
          <div ref={trendRef} className="chart" />
          <p className="meta">这里展示的是批量扫描后的平均结果，用来比较不同参数取值对缠结概率和缠结强度的影响。</p>
          {trendError ? <p className="meta">{trendError}</p> : null}
        </section>
      </div>
    </div>
  );
}

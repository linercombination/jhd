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

type BatchSummary = {
  parameter: string;
  results: TrendResult[];
  repeats?: number;
};

type SimulationSnapshot = {
  config: SimulationConfig;
  trajectory: Frame[];
  metrics: MetricRow[];
  summary: Summary;
};

type BatchResponse = {
  batch_id: string;
  status: string;
  summary?: BatchSummary;
  representative_run?: SimulationSnapshot | null;
};

type BatchProgress = {
  batch_id: string;
  status: "queued" | "running" | "loading_result" | "finished" | "failed";
  parameter: string;
  values: number[];
  repeats: number;
  total_jobs: number;
  completed_jobs: number;
  progress: number;
  current_value: number | null;
  current_repeat: number | null;
  started_at: string;
  finished_at: string | null;
  error: string | null;
};

type RunProgress = {
  run_id: string;
  task_id: string;
  kind: "single";
  status: "queued" | "running" | "loading_result" | "finished" | "failed" | "cancelled";
  progress: number;
  started_at: string;
  finished_at: string | null;
  error: string | null;
  phase: string | null;
  current_step: number;
  total_steps: number;
};

const RUN_STATUS_LABELS: Record<RunProgress["status"], string> = {
  queued: "单次模拟排队中",
  running: "单次模拟进行中",
  loading_result: "正在加载最终结果",
  finished: "单次模拟已完成",
  failed: "单次模拟失败",
  cancelled: "单次模拟已中断",
};

const RUN_PHASE_LABELS: Record<string, string> = {
  queued: "等待后端开始处理",
  init: "正在初始化几何与参数",
  simulate: "正在推进仿真步进",
  postprocess: "正在整理指标与事件",
  loading_result: "正在加载最终结果",
  finished: "结果已准备完成",
  failed: "任务执行失败",
  cancelled: "任务已被中断",
};

const API_BASE = "http://localhost:8000";
const VIEWPORT_SCALE_MIN = 0.7;
const VIEWPORT_SCALE_MAX = 4.0;
const VIEWPORT_FILL_TARGET = 0.6;
const CAMERA_OFFSET = { x: 0.8, y: 1.05, z: 1.45 };
const VIEW_ROTATE_SPEED = 0.0075;
const VIEW_ELEVATION_LIMIT = Math.PI * 0.42;

const DEFAULT_CONFIG: SimulationConfig = {
  geometry: {
    L_0: 0.8,
    L_1: 0.2,
    d_cable: 0.0025,
    r_plug: 0.007,
    r_earbud: 0.0075,
    r_junction: 0.0065,
    b: 0.02,
  },
  mechanics: {
    k_bend: 0.7,
    gamma: 1.0,
  },
  environment: {
    W: 0.252,
    H: 0.177,
    T: 0.056,
    agitation_amplitude: 0.01,
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

function isBatchParameter(value: string): value is BatchParameter {
  return Object.prototype.hasOwnProperty.call(PARAMETER_LABELS, value);
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

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes} 分 ${seconds} 秒` : `${seconds} 秒`;
}

export function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const trendRef = useRef<HTMLDivElement | null>(null);
  const cableGeometryRefs = useRef<Record<string, THREE.BufferGeometry>>({});
  const rigidMeshesRef = useRef<Record<number, THREE.Mesh>>({});
  const contactLineRefs = useRef<THREE.Line[]>([]);
  const pocketFrameRef = useRef<THREE.LineSegments | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rigidGroupRef = useRef<THREE.Group | null>(null);
  const contactGroupRef = useRef<THREE.Group | null>(null);
  const viewZoomScaleRef = useRef(1);
  const userAdjustedZoomRef = useRef(false);
  const viewBaseZoomRef = useRef(1);
  const viewTargetOffsetRef = useRef(new THREE.Vector3(0, 0, 0));
  const viewOrbitRef = useRef({
    azimuth: Math.atan2(CAMERA_OFFSET.x, CAMERA_OFFSET.z),
    elevation: Math.atan2(
      CAMERA_OFFSET.y,
      Math.sqrt(CAMERA_OFFSET.x * CAMERA_OFFSET.x + CAMERA_OFFSET.z * CAMERA_OFFSET.z),
    ),
    distance: Math.sqrt(
      CAMERA_OFFSET.x * CAMERA_OFFSET.x +
        CAMERA_OFFSET.y * CAMERA_OFFSET.y +
        CAMERA_OFFSET.z * CAMERA_OFFSET.z,
    ),
  });
  const pointerInteractionRef = useRef<{
    pointerId: number;
    mode: "rotate" | "pan";
    startX: number;
    startY: number;
    startAzimuth: number;
    startElevation: number;
    startOffset: THREE.Vector3;
  } | null>(null);

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
  const [trendData, setTrendData] = useState<BatchSummary | null>(null);
  const [trendError, setTrendError] = useState("");
  const [configForm, setConfigForm] = useState<SimulationConfigForm>(toFormState(DEFAULT_CONFIG));
  const [batchParameter, setBatchParameter] = useState<BatchParameter>("k_bend");
  const [batchValuesText, setBatchValuesText] = useState("0.1, 0.3, 0.6, 0.9");
  const [batchRepeatsText, setBatchRepeatsText] = useState("3");
  const [activeRunId, setActiveRunId] = useState("");
  const [runProgress, setRunProgress] = useState<RunProgress | null>(null);
  const [runElapsedSeconds, setRunElapsedSeconds] = useState(0);
  const [activeBatchId, setActiveBatchId] = useState("");
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [batchElapsedSeconds, setBatchElapsedSeconds] = useState(0);
  const [viewZoomScale, setViewZoomScale] = useState(1);
  const [viewerSize, setViewerSize] = useState({ width: 720, height: 560 });
  const [viewerInteractionMode, setViewerInteractionMode] = useState<"idle" | "rotate" | "pan">("idle");

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

  const applySimulationSnapshot = (snapshot: SimulationSnapshot, nextRunId: string) => {
    setRunId(nextRunId);
    setActiveConfig(snapshot.config);
    setConfigForm(toFormState(snapshot.config));
    setFrames(snapshot.trajectory);
    setMetrics(snapshot.metrics);
    setSummary(snapshot.summary);
    setFrameIndex(0);
    setPlaying(true);
  };

  const applyAdaptiveView = (nextScale = viewZoomScaleRef.current, markAsManual = false) => {
    const camera = cameraRef.current;
    if (!camera) return;

    const aspect = viewerSize.width / Math.max(viewerSize.height, 1);
    const target = new THREE.Vector3(
      activeConfig.environment.W / 2,
      0,
      0,
    ).add(viewTargetOffsetRef.current);
    const orbit = viewOrbitRef.current;
    const planarDistance = orbit.distance * Math.cos(orbit.elevation);
    const cameraPosition = new THREE.Vector3(
      target.x + planarDistance * Math.sin(orbit.azimuth),
      target.y + orbit.distance * Math.sin(orbit.elevation),
      target.z + planarDistance * Math.cos(orbit.azimuth),
    );
    const distance = cameraPosition.distanceTo(target);
    const visibleHeightAtZoom1 = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const visibleWidthAtZoom1 = visibleHeightAtZoom1 * Math.max(aspect, 0.1);
    const zoomForHeight = (visibleHeightAtZoom1 * VIEWPORT_FILL_TARGET) / Math.max(activeConfig.environment.H, 1e-6);
    const zoomForWidth = (visibleWidthAtZoom1 * VIEWPORT_FILL_TARGET) / Math.max(activeConfig.environment.W, 1e-6);
    const baseZoom = Math.max(0.1, Math.min(zoomForHeight, zoomForWidth));
    const clampedScale = Math.min(VIEWPORT_SCALE_MAX, Math.max(VIEWPORT_SCALE_MIN, nextScale));

    camera.position.copy(cameraPosition);
    camera.lookAt(target);
    camera.zoom = baseZoom * clampedScale;
    camera.updateProjectionMatrix();

    viewBaseZoomRef.current = baseZoom;
    viewZoomScaleRef.current = clampedScale;
    if (markAsManual) {
      userAdjustedZoomRef.current = true;
    }
    if (viewZoomScale !== clampedScale) {
      setViewZoomScale(clampedScale);
    }
  };

  const resetViewportPose = () => {
    viewTargetOffsetRef.current.set(0, 0, 0);
    viewOrbitRef.current = {
      azimuth: Math.atan2(CAMERA_OFFSET.x, CAMERA_OFFSET.z),
      elevation: Math.atan2(
        CAMERA_OFFSET.y,
        Math.sqrt(CAMERA_OFFSET.x * CAMERA_OFFSET.x + CAMERA_OFFSET.z * CAMERA_OFFSET.z),
      ),
      distance: Math.sqrt(
        CAMERA_OFFSET.x * CAMERA_OFFSET.x +
          CAMERA_OFFSET.y * CAMERA_OFFSET.y +
          CAMERA_OFFSET.z * CAMERA_OFFSET.z,
      ),
    };
  };

  const resetViewportZoom = () => {
    userAdjustedZoomRef.current = false;
    applyAdaptiveView(1, false);
  };

  const fitViewportView = () => {
    userAdjustedZoomRef.current = false;
    resetViewportPose();
    applyAdaptiveView(1, false);
  };

  const loadBatchResult = async (batchId: string) => {
    const response = await fetch(`${API_BASE}/api/batches/${batchId}`);
    if (!response.ok) {
      throw new Error(`Batch result request failed with status ${response.status}`);
    }

    const batchResult: BatchResponse = await response.json();
    if (batchResult.summary) {
      setTrendError("");
      setTrendData(batchResult.summary);
    } else {
      setTrendReloadToken((value) => value + 1);
    }

    if (batchResult.representative_run) {
      applySimulationSnapshot(batchResult.representative_run, `${batchResult.batch_id} / sample`);
    }
  };

  const loadRunResult = async (nextRunId: string) => {
    const response = await fetch(`${API_BASE}/api/simulations/${nextRunId}`);
    if (!response.ok) {
      throw new Error(`Simulation result request failed with status ${response.status}`);
    }
    const payload = await response.json();
    if (!payload?.config || !payload?.trajectory || !payload?.metrics || !payload?.summary) {
      throw new Error("最终模拟结果不完整，请稍后重试。");
    }
    applySimulationSnapshot(
      {
        config: payload.config,
        trajectory: payload.trajectory,
        metrics: payload.metrics,
        summary: payload.summary,
      },
      nextRunId,
    );
  };

  const loadRunProgress = async (nextRunId: string) => {
    const response = await fetch(`${API_BASE}/api/simulations/${nextRunId}/progress`);
    if (!response.ok) {
      throw new Error(`Simulation progress request failed with status ${response.status}`);
    }
    return (await response.json()) as RunProgress;
  };

  useEffect(() => {
    const mountElement = mountRef.current;
    if (!mountElement) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f4f1e8");

    const camera = new THREE.PerspectiveCamera(50, 720 / 440, 0.1, 100);
    camera.position.set(1.2, 1.05, 1.45);
    camera.lookAt(0.4, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    mountElement.innerHTML = "";
    mountElement.appendChild(renderer.domElement);

    const resizeRenderer = () => {
      const width = mountElement.clientWidth || 720;
      const height = mountElement.clientHeight || 440;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      setViewerSize({ width, height });
    };
    resizeRenderer();

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

    const resizeObserver = new ResizeObserver(() => {
      resizeRenderer();
    });
    resizeObserver.observe(mountElement);

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const directionScale = Math.exp(-event.deltaY * 0.0015);
      const nextScale = Math.min(
        VIEWPORT_SCALE_MAX,
        Math.max(VIEWPORT_SCALE_MIN, viewZoomScaleRef.current * directionScale),
      );
      applyAdaptiveView(nextScale, true);
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.button !== 2) return;
      const mode = event.button === 2 || event.shiftKey ? "pan" : "rotate";
      pointerInteractionRef.current = {
        pointerId: event.pointerId,
        mode,
        startX: event.clientX,
        startY: event.clientY,
        startAzimuth: viewOrbitRef.current.azimuth,
        startElevation: viewOrbitRef.current.elevation,
        startOffset: viewTargetOffsetRef.current.clone(),
      };
      userAdjustedZoomRef.current = true;
      setViewerInteractionMode(mode);
      mountElement.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const interaction = pointerInteractionRef.current;
      if (!interaction || interaction.pointerId !== event.pointerId) return;

      const dx = event.clientX - interaction.startX;
      const dy = event.clientY - interaction.startY;

      if (interaction.mode === "rotate") {
        viewOrbitRef.current.azimuth = interaction.startAzimuth - dx * VIEW_ROTATE_SPEED;
        viewOrbitRef.current.elevation = Math.max(
          -VIEW_ELEVATION_LIMIT,
          Math.min(VIEW_ELEVATION_LIMIT, interaction.startElevation - dy * VIEW_ROTATE_SPEED),
        );
      } else {
        const target = new THREE.Vector3(
          activeConfig.environment.W / 2,
          0,
          0,
        ).add(interaction.startOffset);
        const orbit = viewOrbitRef.current;
        const planarDistance = orbit.distance * Math.cos(orbit.elevation);
        const cameraPosition = new THREE.Vector3(
          target.x + planarDistance * Math.sin(orbit.azimuth),
          target.y + orbit.distance * Math.sin(orbit.elevation),
          target.z + planarDistance * Math.cos(orbit.azimuth),
        );
        const forward = new THREE.Vector3().subVectors(target, cameraPosition).normalize();
        const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
        const up = new THREE.Vector3().crossVectors(right, forward).normalize();
        const visibleHeight = (2 * orbit.distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / Math.max(camera.zoom, 1e-6);
        const visibleWidth = visibleHeight * Math.max(camera.aspect, 0.1);
        const worldDelta = right
          .multiplyScalar((-dx * visibleWidth) / Math.max(viewerSize.width, 1))
          .add(up.multiplyScalar((dy * visibleHeight) / Math.max(viewerSize.height, 1)));
        viewTargetOffsetRef.current.copy(interaction.startOffset).add(worldDelta);
      }

      applyAdaptiveView(viewZoomScaleRef.current, true);
    };

    const clearPointerInteraction = (pointerId?: number) => {
      const interaction = pointerInteractionRef.current;
      if (!interaction) return;
      if (typeof pointerId === "number" && interaction.pointerId !== pointerId) return;
      if (typeof pointerId === "number" && mountElement.hasPointerCapture(pointerId)) {
        mountElement.releasePointerCapture(pointerId);
      }
      pointerInteractionRef.current = null;
      setViewerInteractionMode("idle");
    };

    const handlePointerUp = (event: PointerEvent) => {
      clearPointerInteraction(event.pointerId);
    };

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    mountElement.addEventListener("wheel", handleWheel, { passive: false });
    mountElement.addEventListener("pointerdown", handlePointerDown);
    mountElement.addEventListener("pointermove", handlePointerMove);
    mountElement.addEventListener("pointerup", handlePointerUp);
    mountElement.addEventListener("pointercancel", handlePointerUp);
    mountElement.addEventListener("contextmenu", handleContextMenu);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      mountElement.removeEventListener("wheel", handleWheel);
      mountElement.removeEventListener("pointerdown", handlePointerDown);
      mountElement.removeEventListener("pointermove", handlePointerMove);
      mountElement.removeEventListener("pointerup", handlePointerUp);
      mountElement.removeEventListener("pointercancel", handlePointerUp);
      mountElement.removeEventListener("contextmenu", handleContextMenu);
      pointerInteractionRef.current = null;
      setViewerInteractionMode("idle");
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
      cameraRef.current = null;
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
    applyAdaptiveView(viewZoomScaleRef.current, userAdjustedZoomRef.current);
  }, [activeConfig, viewerSize]);

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
      const radius =
        summary.bead_metadata.radii[idx] ??
        (type === "plug"
          ? activeConfig.geometry.r_plug
          : type === "junction"
            ? activeConfig.geometry.r_junction
            : activeConfig.geometry.r_earbud);
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(radius, 0.005), 18, 18),
        new THREE.MeshStandardMaterial({
          color: type === "plug" ? 0x1f6feb : type === "junction" ? 0x2ea043 : 0xc73e1d,
        }),
      );
      rigidMeshesRef.current[idx] = mesh;
      rigidGroup.add(mesh);
    });
  }, [summary, activeConfig]);

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

    const run = async () => {
      setTrendError("");
      const response = await fetch(`${API_BASE}/api/analysis/trends`, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Trend request failed with status ${response.status}`);
      }
      const trendPayload = await response.json();
      if (disposed) return;
      if (!Array.isArray(trendPayload) || trendPayload.length === 0) {
        setTrendData(null);
        setTrendError("还没有批量扫描结果，请先运行一次参数扫描。");
        return;
      }

      const latest = trendPayload[trendPayload.length - 1];
      const latestSummary = latest?.summary as BatchSummary | undefined;
      if (!latestSummary || !Array.isArray(latestSummary.results) || latestSummary.results.length === 0) {
        setTrendData(null);
        setTrendError("最近一次批量扫描没有可展示的结果。");
        return;
      }
      setTrendData(latestSummary);
    };

    run().catch((error: unknown) => {
      if (disposed || (error instanceof DOMException && error.name === "AbortError")) return;
      console.error(error);
      setTrendError("参数趋势图加载失败，请确认后端服务仍在运行。");
    });

    return () => {
      disposed = true;
      controller.abort();
    };
  }, [trendReloadToken]);

  useEffect(() => {
    if (!trendRef.current || !trendData || trendData.results.length === 0) return;

    const chart = echarts.init(trendRef.current);
    const sortedResults = [...trendData.results].sort((left, right) => left.value - right.value);
    const parameterLabel = isBatchParameter(trendData.parameter)
      ? PARAMETER_LABELS[trendData.parameter]
      : trendData.parameter;

    chart.setOption({
      tooltip: { trigger: "axis" },
      title: {
        text: `参数趋势：${parameterLabel}`,
        subtext: `重复次数：${sortedResults[0]?.repeats ?? trendData.repeats ?? 0}`,
      },
      legend: {
        data: [
          "平均穿线概率",
          "穿线概率 +1σ",
          "穿线概率 -1σ",
          "平均缠结评分",
          "缠结评分 +1σ",
          "缠结评分 -1σ",
        ],
      },
      xAxis: {
        type: "value",
        name: "参数值",
      },
      yAxis: [
        { type: "value", name: "平均穿线概率", min: 0 },
        { type: "value", name: "平均缠结评分", min: 0 },
      ],
      series: [
        {
          type: "line",
          name: "平均穿线概率",
          data: sortedResults.map((row) => [row.value, row.mean_threading_probability]),
          smooth: true,
        },
        {
          type: "line",
          name: "穿线概率 +1σ",
          data: sortedResults.map((row) => [row.value, row.mean_threading_probability + row.std_threading_probability]),
          smooth: true,
          showSymbol: false,
          lineStyle: { type: "dashed", opacity: 0.55 },
        },
        {
          type: "line",
          name: "穿线概率 -1σ",
          data: sortedResults.map((row) => [row.value, Math.max(0, row.mean_threading_probability - row.std_threading_probability)]),
          smooth: true,
          showSymbol: false,
          lineStyle: { type: "dashed", opacity: 0.55 },
        },
        {
          type: "line",
          name: "平均缠结评分",
          yAxisIndex: 1,
          data: sortedResults.map((row) => [row.value, row.mean_tangle_score]),
          smooth: true,
        },
        {
          type: "line",
          name: "缠结评分 +1σ",
          yAxisIndex: 1,
          data: sortedResults.map((row) => [row.value, row.mean_tangle_score + row.std_tangle_score]),
          smooth: true,
          showSymbol: false,
          lineStyle: { type: "dashed", opacity: 0.55 },
        },
        {
          type: "line",
          name: "缠结评分 -1σ",
          yAxisIndex: 1,
          data: sortedResults.map((row) => [row.value, Math.max(0, row.mean_tangle_score - row.std_tangle_score)]),
          smooth: true,
          showSymbol: false,
          lineStyle: { type: "dashed", opacity: 0.55 },
        },
      ],
    });

    return () => chart.dispose();
  }, [trendData]);

  useEffect(() => {
    if (!runProgress?.started_at) {
      setRunElapsedSeconds(0);
      return;
    }

    if (!loadingRun) {
      if (runProgress.finished_at) {
        const startedAt = Date.parse(runProgress.started_at);
        const finishedAt = Date.parse(runProgress.finished_at);
        if (!Number.isNaN(startedAt) && !Number.isNaN(finishedAt)) {
          setRunElapsedSeconds(Math.max(0, Math.floor((finishedAt - startedAt) / 1000)));
        }
      }
      return;
    }

    const updateElapsed = () => {
      const startedAt = Date.parse(runProgress.started_at);
      if (Number.isNaN(startedAt)) return;
      setRunElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    };

    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [loadingRun, runProgress?.started_at, runProgress?.finished_at]);

  useEffect(() => {
    if (!activeRunId) return;

    let disposed = false;
    let polling = false;
    let consecutiveFailures = 0;
    const runTaskId = activeRunId;

    const pollProgress = async () => {
      if (polling || disposed) return;
      polling = true;
      try {
        const progressPayload = await loadRunProgress(runTaskId);
        if (disposed) return;
        consecutiveFailures = 0;
        setRunProgress(progressPayload);

        if (progressPayload.status === "finished") {
          disposed = true;
          setRunProgress({
            ...progressPayload,
            status: "loading_result",
            phase: "loading_result",
            error: "正在加载最终结果……",
          });
          try {
            await loadRunResult(runTaskId);
            setRunProgress({
              ...progressPayload,
              error: null,
            });
          } catch (error) {
            console.error(error);
            try {
              const latestProgress = await loadRunProgress(runTaskId);
              if (latestProgress.status === "cancelled") {
                setRunProgress(latestProgress);
              } else {
                const resultMessage =
                  error instanceof Error ? error.message : "加载单次模拟结果失败。";
                setRunProgress({
                  ...latestProgress,
                  status: "failed",
                  phase: "failed",
                  error: resultMessage,
                });
                window.alert(resultMessage);
              }
            } catch (progressError) {
              console.error(progressError);
              const resultMessage =
                error instanceof Error ? error.message : "加载单次模拟结果失败。";
              setRunProgress({
                ...progressPayload,
                status: "failed",
                phase: "failed",
                error: resultMessage,
              });
              window.alert(resultMessage);
            }
          } finally {
            setLoadingRun(false);
            setActiveRunId((current) => (current === runTaskId ? "" : current));
          }
          return;
        }

        if (progressPayload.status === "failed" || progressPayload.status === "cancelled") {
          setLoadingRun(false);
          setActiveRunId((current) => (current === runTaskId ? "" : current));
          if (progressPayload.error) {
            window.alert(progressPayload.error);
          }
        }
      } catch (error) {
        if (disposed) return;
        console.error(error);
        consecutiveFailures += 1;
        const retryMessage =
          error instanceof Error ? error.message : "刷新单次模拟进度失败。";
        setRunProgress((current) =>
          current && current.run_id === runTaskId
            ? {
                ...current,
                error:
                  consecutiveFailures >= 5
                    ? retryMessage
                    : `${retryMessage} 正在重试进度同步（${consecutiveFailures}/5）……`,
              }
            : current,
        );
        if (consecutiveFailures >= 5) {
          setRunProgress((current) =>
            current && current.run_id === runTaskId
              ? {
                  ...current,
                  status: "failed",
                  phase: "failed",
                  error: retryMessage,
                }
              : current,
          );
          setLoadingRun(false);
          setActiveRunId((current) => (current === runTaskId ? "" : current));
          window.alert(retryMessage);
        }
      } finally {
        polling = false;
      }
    };

    void pollProgress();
    const timer = window.setInterval(() => {
      void pollProgress();
    }, 1000);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [activeRunId]);

  useEffect(() => {
    if (!batchProgress?.started_at) {
      setBatchElapsedSeconds(0);
      return;
    }

    if (!loadingBatch) {
      if (batchProgress.finished_at) {
        const startedAt = Date.parse(batchProgress.started_at);
        const finishedAt = Date.parse(batchProgress.finished_at);
        if (!Number.isNaN(startedAt) && !Number.isNaN(finishedAt)) {
          setBatchElapsedSeconds(Math.max(0, Math.floor((finishedAt - startedAt) / 1000)));
        }
      }
      return;
    }

    const updateElapsed = () => {
      const startedAt = Date.parse(batchProgress.started_at);
      if (Number.isNaN(startedAt)) return;
      setBatchElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    };

    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [loadingBatch, batchProgress?.started_at]);

  useEffect(() => {
    if (!activeBatchId) return;

    let disposed = false;
    let polling = false;
    let consecutiveFailures = 0;
    const batchId = activeBatchId;

    const pollProgress = async () => {
      if (polling || disposed) return;
      polling = true;
      try {
        const response = await fetch(`${API_BASE}/api/batches/${batchId}/progress`);
        if (!response.ok) {
          throw new Error(`Batch progress request failed with status ${response.status}`);
        }

        const progressPayload: BatchProgress = await response.json();
        if (disposed) return;
        consecutiveFailures = 0;
        setBatchProgress(progressPayload);

        if (progressPayload.status === "finished") {
          disposed = true;
          setBatchProgress((current) =>
            current && current.batch_id === batchId
              ? {
                  ...progressPayload,
                  error: "正在加载最终结果……",
                }
              : current,
          );
          try {
            await loadBatchResult(batchId);
            setBatchProgress((current) =>
              current && current.batch_id === batchId
                ? {
                    ...progressPayload,
                    error: null,
                  }
                : current,
            );
          } catch (error) {
            console.error(error);
            const resultMessage =
              error instanceof Error ? error.message : "加载批量结果失败。";
            setBatchProgress((current) =>
              current && current.batch_id === batchId
                ? {
                    ...current,
                    status: "failed",
                    error: resultMessage,
                  }
                : current,
            );
            window.alert(resultMessage);
          } finally {
            setLoadingBatch(false);
            setActiveBatchId((current) => (current === batchId ? "" : current));
          }
          return;
        }

        if (progressPayload.status === "failed") {
          setLoadingBatch(false);
          setActiveBatchId((current) => (current === batchId ? "" : current));
          throw new Error(progressPayload.error ?? "批量扫描失败。");
        }
      } catch (error) {
        if (disposed) return;
        console.error(error);
        consecutiveFailures += 1;
        const retryMessage =
          error instanceof Error ? error.message : "刷新批量进度失败。";
        setBatchProgress((current) =>
          current && current.batch_id === batchId
            ? {
                ...current,
                error:
                  consecutiveFailures >= 5
                    ? retryMessage
                    : `${retryMessage} 正在重试进度同步（${consecutiveFailures}/5）……`,
              }
            : current,
        );
        if (consecutiveFailures >= 5) {
          setBatchProgress((current) =>
            current && current.batch_id === batchId
              ? {
                  ...current,
                  status: "failed",
                  error: retryMessage,
                }
              : current,
          );
          setLoadingBatch(false);
          setActiveBatchId((current) => (current === batchId ? "" : current));
          window.alert(retryMessage);
        }
      } finally {
        polling = false;
      }
    };

    void pollProgress();
    const timer = window.setInterval(() => {
      void pollProgress();
    }, 1000);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [activeBatchId]);

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
    let submittedRun = false;
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
        throw new Error("Backend response is missing run_id.");
      }

      setRunId(result.run_id);
      setRunProgress({
        run_id: result.run_id,
        task_id: result.run_id,
        kind: "single",
        status: "queued",
        progress: 0,
        started_at: new Date().toISOString(),
        finished_at: null,
        error: null,
        phase: "queued",
        current_step: 0,
        total_steps: payload.control.num_steps,
      });
      setRunElapsedSeconds(0);
      setActiveRunId(result.run_id);
      submittedRun = true;
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "Single simulation failed.");
    } finally {
      if (!submittedRun) {
        setLoadingRun(false);
      }
    }
  };

  const cancelRun = async () => {
    if (!activeRunId) return;
    try {
      setRunProgress((current) =>
        current && current.run_id === activeRunId
          ? {
              ...current,
              error: "正在请求中断单次模拟……",
            }
          : current,
      );
      const response = await fetch(`${API_BASE}/api/simulations/${activeRunId}/cancel`, {
        method: "POST",
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.detail ?? `Simulation cancel failed with status ${response.status}`);
      }
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "取消单次模拟失败。");
    }
  };

  const createBatch = async () => {
    setLoadingBatch(true);
    let submittedBatch = false;
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

      const batchResult: BatchResponse = await response.json();
      setBatchProgress({
        batch_id: batchResult.batch_id,
        status: "queued",
        parameter: payload.parameter,
        values,
        repeats,
        total_jobs: values.length * repeats,
        completed_jobs: 0,
        progress: 0,
        current_value: null,
        current_repeat: null,
        started_at: new Date().toISOString(),
        finished_at: null,
        error: null,
      });
      setBatchElapsedSeconds(0);
      setActiveBatchId(batchResult.batch_id);
      submittedBatch = true;
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "批量扫描失败。");
    } finally {
      if (!submittedBatch) {
        setLoadingBatch(false);
      }
    }
  };

  const controlsBusy = loadingRun || loadingBatch;
  const currentFrame = frames[frameIndex];
  const currentThreadingEvents = currentFrame?.events.threading ?? [];
  const runProgressPercent = Math.round((runProgress?.progress ?? 0) * 100);
  const batchProgressPercent = Math.round((batchProgress?.progress ?? 0) * 100);
  const batchParameterLabel =
    batchProgress && isBatchParameter(batchProgress.parameter)
      ? PARAMETER_LABELS[batchProgress.parameter]
      : batchProgress?.parameter ?? PARAMETER_LABELS[batchParameter];
  const runStatusLabel = runProgress ? RUN_STATUS_LABELS[runProgress.status] : RUN_STATUS_LABELS.queued;

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
        {runProgress ? (
          <div className={`progress-panel ${runProgress.status === "failed" || runProgress.status === "cancelled" ? "is-error" : ""}`}>
            <div className="progress-heading">
              <strong>{runStatusLabel}</strong>
              <span>
                {runProgress.current_step} / {runProgress.total_steps}
              </span>
            </div>
            <div className="progress-bar" aria-hidden="true">
              <div className="progress-bar-fill" style={{ width: `${runProgressPercent}%` }} />
            </div>
            <p className="meta">当前阶段：{RUN_PHASE_LABELS[runProgress.phase ?? "queued"] ?? runProgress.phase ?? "queued"}</p>
            <p className="meta">当前进度：{runProgressPercent}%</p>
            <p className="meta">当前步数：{runProgress.current_step} / {runProgress.total_steps}</p>
            <p className="meta">已运行：{formatDuration(runElapsedSeconds)}</p>
            {runProgress.error ? <p className="meta">{runProgress.error}</p> : null}
            {(runProgress.status === "running" || runProgress.status === "loading_result") && activeRunId ? (
              <div className="progress-actions">
                <button type="button" onClick={() => void cancelRun()} className="secondary-button">
                  取消单次模拟
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
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
              {batchProgress ? (
                <div className={`progress-panel ${batchProgress.status === "failed" ? "is-error" : ""}`}>
                  <div className="progress-heading">
                    <strong>
                      {batchProgress.status === "finished"
                        ? "批量扫描已完成"
                        : batchProgress.status === "loading_result"
                          ? "正在加载批量结果"
                        : batchProgress.status === "failed"
                          ? "批量扫描失败"
                          : "批量扫描进行中"}
                    </strong>
                    <span>
                      {batchProgress.completed_jobs} / {batchProgress.total_jobs}
                    </span>
                  </div>
                  <div className="progress-bar" aria-hidden="true">
                    <div className="progress-bar-fill" style={{ width: `${batchProgressPercent}%` }} />
                  </div>
                  <p className="meta">扫描参数：{batchParameterLabel}</p>
                  <p className="meta">当前进度：{batchProgressPercent}%</p>
                  <p className="meta">
                    当前任务：
                    {batchProgress.current_value === null || batchProgress.current_repeat === null
                      ? "等待后端开始计算"
                      : `${formatNumber(batchProgress.current_value)}，第 ${batchProgress.current_repeat} / ${batchProgress.repeats} 次重复`}
                  </p>
                  <p className="meta">已运行：{formatDuration(batchElapsedSeconds)}</p>
                  {batchProgress.error ? <p className="meta">{batchProgress.error}</p> : null}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="card wide">
          <h2>三维模拟视图</h2>
          <div className={`viewer-shell ${viewerInteractionMode === "rotate" ? "is-rotating" : ""} ${viewerInteractionMode === "pan" ? "is-panning" : ""}`}>
            <div className="viewer-toolbar">
              <span className="viewer-badge">缩放 {viewZoomScale.toFixed(2)}x</span>
              <button type="button" className="viewer-tool-button" onClick={fitViewportView}>
                适应视图
              </button>
              <button
                type="button"
                className="viewer-tool-button"
                onClick={() => applyAdaptiveView(1, false)}
              >
                重置缩放
              </button>
            </div>
            <div ref={mountRef} className="viewer" />
          </div>
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

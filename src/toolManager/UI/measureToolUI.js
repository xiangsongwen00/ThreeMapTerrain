import * as THREE from 'three';
import { measureToolHTML } from './html/measureToolHTML.js';
import { measureToolStyles } from './style/measureToolStyles.js';
import { MeasureMath } from '../measureMath.js';
import { CustomTerrainSurface } from '../../terrain/CustomTerrainSurface.js';
import { IMG } from '../../assets/img/urls.js';
/**
 * 测量工具UI类
 * 负责测量工具的UI设计与数据更新
 */
export class MeasureToolUI {
    /**
     * 构造函数
     * @param {Object} options - 配置选项
     * @param {THREE.Scene} options.scene - Three.js场景
     * @param {THREE.Camera} options.camera - Three.js相机
     * @param {THREE.WebGLRenderer} options.renderer - Three.js渲染器
     * @param {Object} options.mathProj - 坐标转换工具
     * @param {Object} options.rgbTerrain - RGB地形实例
     * @param {Object} options.controls - 控制器
     * @param {Object} options.markerManager - 标记管理器
     */
    constructor(options) {
        this.options = {
            scene: null,
            camera: null,
            renderer: null,
            mathProj: null,
            rgbTerrain: null,
            controls: null,
            markerManager: null,
            ...options
        };

        this.container = null;
        this.isInitialized = false;

        // 射线拾取相关
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.isPicking = false;
        this.currentMeasureType = null;
        this.pickedPoints = [];
        this.markers = []; // 存储标记点ID
        this.measureLines = []; // 存储测量线段
        this.measureLineGroup = new THREE.Group(); // 线段组
        
        // 双击防抖相关
        this.clickTimeout = null;
        this.isDoubleClick = false;

        // 保存传递的依赖
        this.scene = this.options.scene;
        this.camera = this.options.camera;
        this.renderer = this.options.renderer;
        this.mathProj = this.options.mathProj;
        this.rgbTerrain = this.options.rgbTerrain;
        this.controls = this.options.controls;
        this.markerManager = this.options.markerManager;

        // Use the same draped-surface approach as DrawTool for area/cutFill visualization.
        this._customTerrainSurface = null;
        this._customTerrainSurfaceId = null;
        if (this.rgbTerrain) {
            this._customTerrainSurface = new CustomTerrainSurface(this.rgbTerrain, null, { renderer: this.renderer });
        }

        // 将线段组添加到场景
        if (this.scene) {
            this.scene.add(this.measureLineGroup);
        }
        
        // 创建地面表面组        
        this.groundSurfaceGroup = new THREE.Group();
        if (this.scene) {
            this.scene.add(this.groundSurfaceGroup);
        }

        // ================= 填挖方（cutFill）专用状态（支持多多边形） =================
        this.cutFillPolygons = []; // Array<Array<THREE.Vector3>> (world XZ, y ignored)
        this.cutFillCurrentPoints = []; // Array<THREE.Vector3>
        this.cutFillCurrentMarkerIds = [];
        this.cutFillPolygonMarkerIds = []; // Array<Array<string>>
        this.cutFillTargetElevation = 0;
        this.cutFillSampleStepMeters = 20;

        this.cutFillVisGroup = new THREE.Group();
        this.cutFillVisGroup.name = 'cutFillVisGroup';
        this.scene?.add?.(this.cutFillVisGroup);
        this.cutFillVisMeshes = { ground: null, flat: null, walls: null, cut: null, fill: null };

        // Track whether "执行(整平)" has modified terrain patches so we can restore on explicit clear.
        this._cutFillFlattenExecuted = false;
    }



    /**
     * 渲染UI
     */
    render() {
        this.container.innerHTML = measureToolHTML;

        this.addStyles();
    }

    /**
     * 添加样式
     */
    addStyles() {
        if (document.getElementById('measure-tool-ui-styles')) return;

        const style = document.createElement('style');
        style.id = 'measure-tool-ui-styles';
        style.textContent = measureToolStyles;

        document.head.appendChild(style);
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 测量类型切换 - 为<a>标签绑定事件，阻止默认行为
        document.getElementById('pointMeasureBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.setMeasureType('point');
        });

        document.getElementById('distanceMeasureBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.setMeasureType('distance');
        });

        document.getElementById('multiDistanceBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.setMeasureType('multiDistance');
        });

        document.getElementById('areaMeasureBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.setMeasureType('area');
        });

        document.getElementById('cutFillBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.setMeasureType('cutFill');
        });
        
        document.getElementById('profileAnalysisBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.setMeasureType('profile');
        });

        // 开始测量按钮
        document.getElementById('startMeasureBtn').addEventListener('click', () => {
            this.startMeasurement(this.currentMeasureType || 'point');
        });

        // 结束测量按钮
        document.getElementById('endMeasureBtn').addEventListener('click', () => {
            this.endMeasurement();
        });

        // 撤销按钮
        document.getElementById('undoBtn').addEventListener('click', () => {
            this.undoLastPoint();
        });

        // 清除按钮
        document.getElementById('clearBtn').addEventListener('click', () => {
            this.clearMeasurements();
        });

        // 填挖方子页面按钮/输入（仅在 cutFillResultSection 存在时生效）
        const bindClick = (id, fn) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', fn);
        };
        bindClick('cutfillApplyJsonBtn', () => this._cutFillApplyJson());
        bindClick('cutfillExportJsonBtn', () => this._cutFillExportJson());
        bindClick('cutfillRecomputeBtn', () => this._cutFillRecompute());
        bindClick('cutfillExecuteBtn', () => this._cutFillExecuteFlatten());

        const targetEl = document.getElementById('cutfillTargetElevation');
        if (targetEl) {
            targetEl.addEventListener('change', () => {
                const v = Number(targetEl.value);
                this.cutFillTargetElevation = Number.isFinite(v) ? v : 0;
                this._cutFillRecompute();
            });
        }

        const stepEl = document.getElementById('cutfillSampleStep');
        if (stepEl) {
            stepEl.addEventListener('change', () => {
                const v = Number(stepEl.value);
                this.cutFillSampleStepMeters = Number.isFinite(v) ? Math.max(1, v) : this.cutFillSampleStepMeters;
                this._cutFillRecompute();
            });
        }
    }



    /**
     * 更新点测量结果
     * @param {Object} pointInfo - 点信息对象，包含经纬度、海拔、3857坐标和Three坐标
     */
    updatePointMeasurement(pointInfo) {
        // 重置所有值为默认状态
        document.getElementById('pointLon').textContent = '-';
        document.getElementById('pointLat').textContent = '-';
        document.getElementById('pointAlt').textContent = '-';
        document.getElementById('pointThreeX').textContent = '-';
        document.getElementById('pointThreeY').textContent = '-';
        document.getElementById('pointThreeZ').textContent = '-';
        document.getElementById('point3857X').textContent = '-';
        document.getElementById('point3857Y').textContent = '-';
        document.getElementById('point3857Z').textContent = '-';

        if (pointInfo) {
            const toNum = (v) => {
                const n = Number(v);
                return Number.isFinite(n) ? n : NaN;
            };
            let lon, lat, elevation;
            let mercator = pointInfo.webMercator || pointInfo.mercator || null;

            // 如果只提供了 three 坐标（或经纬度不完整），优先用 three 重新计算（避免缓存/缺失导致 NaN）
            if (pointInfo.three && this.mathProj) {
                try {
                    const three = pointInfo.three;
                    const threeVec = (three?.isVector3 === true)
                        ? three
                        : new THREE.Vector3(Number(three.x) || 0, Number(three.y) || 0, Number(three.z) || 0);
                    const lonLat0 = this.mathProj.threeToLonLat(threeVec);
                    const merc0 = this.mathProj.threeToMercator(threeVec);
                    if (lonLat0) {
                        lon = lon ?? toNum(lonLat0.lon);
                        lat = lat ?? toNum(lonLat0.lat);
                        elevation = elevation ?? toNum(lonLat0.elevation);
                    }
                    if (!mercator && merc0) mercator = merc0;
                } catch (e) {
                    // ignore; keep provided values
                }
            }

            // 检查pointInfo格式并提取经纬度和海拔
            if (pointInfo.lon !== undefined && pointInfo.lat !== undefined && pointInfo.elevation !== undefined) {
                lon = toNum(pointInfo.lon);
                lat = toNum(pointInfo.lat);
                elevation = toNum(pointInfo.elevation);
            } else if (pointInfo.lonLat) {
                // 支持另一种格式：pointInfo包含lonLat对象
                const lonLat = pointInfo.lonLat;
                if (lonLat.lon !== undefined && lonLat.lat !== undefined && lonLat.elevation !== undefined) {
                    lon = toNum(lonLat.lon);
                    lat = toNum(lonLat.lat);
                    elevation = toNum(lonLat.elevation);
                }
            }

            // 更新经纬度和海拔，精度：经纬度7位小数，高度2位小数
            if (Number.isFinite(lon)) document.getElementById('pointLon').textContent = lon.toFixed(7);
            if (Number.isFinite(lat)) document.getElementById('pointLat').textContent = lat.toFixed(7);
            if (Number.isFinite(elevation)) document.getElementById('pointAlt').textContent = elevation.toFixed(2);

            // 检查并更新Three坐标，精度：2位小数
            if (pointInfo.three) {
                document.getElementById('pointThreeX').textContent = toNum(pointInfo.three.x).toFixed(2);
                document.getElementById('pointThreeY').textContent = toNum(pointInfo.three.y).toFixed(2);
                document.getElementById('pointThreeZ').textContent = toNum(pointInfo.three.z).toFixed(2);
            }

            // 检查并更新3857坐标，精度：2位小数
            if (mercator) {
                document.getElementById('point3857X').textContent = toNum(mercator.x).toFixed(2);
                document.getElementById('point3857Y').textContent = toNum(mercator.y).toFixed(2);
                document.getElementById('point3857Z').textContent = toNum(mercator.z).toFixed(2);
            }
        }
    }

    /**
     * 更新多点路程测量结果
     * @param {Object|Array} data - 多点路程信息对象或点列表数组
     */
    updateMultiDistanceMeasurement(data) {
        // 获取DOM元素
        const totalProjectionDistanceEl = document.getElementById('totalProjectionDistance');
        const totalGroundThreeDistanceEl = document.getElementById('totalGroundThreeDistance');
        const totalGroundGeodesicDistanceEl = document.getElementById('totalGroundGeodesicDistance');
        const segmentDistancesDiv = document.getElementById('segmentDistances');
        
        // 确保元素存在
        if (!totalProjectionDistanceEl || !totalGroundThreeDistanceEl || !totalGroundGeodesicDistanceEl || !segmentDistancesDiv) return;
        
        // 情况1：数据是对象，用于初始化或清空
        if (typeof data === 'object' && !Array.isArray(data)) {
            totalProjectionDistanceEl.textContent = '0.00 米';
            totalGroundThreeDistanceEl.textContent = '0.00 米';
            totalGroundGeodesicDistanceEl.textContent = '0.00 米';
            segmentDistancesDiv.innerHTML = '';
            return;
        }
        
        // 情况2：数据是点数组，用于实际测量计算
        const points = data;
        if (!points || points.length < 2) return;

        let totalProjectionDistance = 0;
        let totalGroundThreeDistance = 0;
        let totalGroundGeodesicDistance = 0;
        const segments = [];

        // 计算总路程和分段距离
        for (let i = 0; i < points.length - 1; i++) {
            const point1 = points[i];
            const point2 = points[i + 1];

            // 1. 计算投影距离（水平面投影的距离）
            const point1Proj = new THREE.Vector3(point1.three.x, 0, point1.three.z);
            const point2Proj = new THREE.Vector3(point2.three.x, 0, point2.three.z);
            const projectionDistanceUnits = point1Proj.distanceTo(point2Proj);
            const projectionDistance = this.mathProj?.unitsToMeters ? this.mathProj.unitsToMeters(projectionDistanceUnits) : projectionDistanceUnits;

            // 2. 计算贴地Three距离（Three场景中的贴地距离）
            const groundThreeDistanceUnits = MeasureMath.calculateGroundDistance(point1.three, point2.three, this.rgbTerrain);
            const groundThreeDistance = this.mathProj?.unitsToMeters ? this.mathProj.unitsToMeters(groundThreeDistanceUnits) : groundThreeDistanceUnits;

            // 3. 计算贴地测地距离（测地坐标系中的距离）
            const groundGeodesicDistance = this.mathProj.calculateGeographicDistance(point1.lonLat, point2.lonLat);

            segments.push({
                projection: projectionDistance,
                groundThree: groundThreeDistance,
                groundGeodesic: groundGeodesicDistance
            });

            totalProjectionDistance += projectionDistance;
            totalGroundThreeDistance += groundThreeDistance;
            totalGroundGeodesicDistance += groundGeodesicDistance;
        }

        // 更新UI - 总距离
        totalProjectionDistanceEl.textContent = `${totalProjectionDistance.toFixed(2)} 米`;
        totalGroundThreeDistanceEl.textContent = `${totalGroundThreeDistance.toFixed(2)} 米`;
        totalGroundGeodesicDistanceEl.textContent = `${totalGroundGeodesicDistance.toFixed(2)} 米`;

        // 更新分段距离
        const segmentHtml = segments.map((segment, index) => {
            return `
                <div class="segment-item" style="margin-bottom: 8px; padding: 6px; background-color: #ffffff; border-radius: 3px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                    <div style="font-weight: bold; margin-bottom: 4px; color: #333;">段 ${index + 1}</div>
                    <div style="display: flex; justify-content: space-between; margin: 2px 0; font-size: 11px;">
                        <span style="color: #666;">投影距离：</span>
                        <span style="color: #2196F3; font-weight: bold;">${segment.projection.toFixed(2)} 米</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin: 2px 0; font-size: 11px;">
                        <span style="color: #666;">贴地Three距离：</span>
                        <span style="color: #4CAF50; font-weight: bold;">${segment.groundThree.toFixed(2)} 米</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin: 2px 0; font-size: 11px;">
                        <span style="color: #666;">贴地测地距离：</span>
                        <span style="color: #FF9800; font-weight: bold;">${segment.groundGeodesic.toFixed(2)} 米</span>
                    </div>
                </div>
            `;
        }).join('');
        
        segmentDistancesDiv.innerHTML = segmentHtml;
    }
    


    /**
     * 更新面积测量结果
     * @param {Object|Array} data - 面积信息对象或点列表数组
     */
    updateAreaMeasurement(data) {
        // 获取DOM元素
        // 投影面积元素
        const horizontal3857AreaEl = document.getElementById('horizontal3857Area');
        const horizontalGeodesicAreaEl = document.getElementById('horizontalGeodesicArea');
        
        // 贴地面积元素
        const ground3857AreaEl = document.getElementById('ground3857Area');
        const threeTerrainAreaEl = document.getElementById('threeTerrainArea');
        const groundGeodesicAreaEl = document.getElementById('groundGeodesicArea');
        
        // 周长元素
        const projectionPerimeterEl = document.getElementById('projectionPerimeter');
        const threePerimeterEl = document.getElementById('threePerimeter');
        const geodesicPerimeterEl = document.getElementById('geodesicPerimeter');
        
        // 确保元素存在
        if (!horizontal3857AreaEl || !horizontalGeodesicAreaEl || !ground3857AreaEl || !threeTerrainAreaEl || !groundGeodesicAreaEl || !projectionPerimeterEl || !threePerimeterEl || !geodesicPerimeterEl) return;
        
        // 情况1：数据是对象，用于初始化或清空
        if (typeof data === 'object' && !Array.isArray(data)) {
            // 清空所有面积和周长显示
            horizontal3857AreaEl.textContent = '0.00 平方米';
            horizontalGeodesicAreaEl.textContent = '0.00 平方米';
            ground3857AreaEl.textContent = '0.00 平方米';
            threeTerrainAreaEl.textContent = '0.00 平方米';
            groundGeodesicAreaEl.textContent = '0.00 平方米';
            projectionPerimeterEl.textContent = '0.00 米';
            threePerimeterEl.textContent = '0.00 米';
            geodesicPerimeterEl.textContent = '0.00 米';
            return;
        }
        
        // 情况2：数据是点数组，用于实际测量计算
        const points = data;
        if (!points || points.length < 3) return;

        // 1. 计算投影面积
        // 1.1 水平3857投影面积（基于Three.js水平面投影）
        const horizontal3857Area = MeasureMath.calculatePolygonArea(points.map(p => {
            // 水平面投影（y=0）
            return new THREE.Vector3(p.three.x, 0, p.three.z);
        }));
        
        // 1.2 测地投影面积（基于经纬度计算）
        const horizontalGeodesicArea = MeasureMath.calculateGeographicArea(points.map(p => p.lonLat), this.mathProj);
        
        // 2. 计算贴地面积
        // 2.1 Three贴地面积（考虑地形起伏）
        const threeTerrainArea = MeasureMath.calculateTerrainArea(points, this.rgbTerrain);
        const horizontal3857AreaM2 = this.mathProj?.units2ToMeters2 ? this.mathProj.units2ToMeters2(horizontal3857Area) : horizontal3857Area;
        const threeTerrainAreaM2 = this.mathProj?.units2ToMeters2 ? this.mathProj.units2ToMeters2(threeTerrainArea) : threeTerrainArea;
        
        // 2.2 3857贴地面积（简化处理，使用Three贴地面积）
        const ground3857Area = threeTerrainAreaM2;
        
        // 2.3 测地贴地面积（简化处理，使用测地投影面积）
        const groundGeodesicArea = horizontalGeodesicArea;
        
        // 3. 计算周长
        // 3.1 投影周长（水平面投影）
        let projectionPerimeter = 0;
        // 3.2 Three贴地周长
        let threePerimeter = 0;
        // 3.3 测地周长
        let geodesicPerimeter = 0;
        
        // 遍历所有相邻点对
        for (let i = 0; i < points.length; i++) {
            const j = (i + 1) % points.length;
            const point1 = points[i];
            const point2 = points[j];
            
            // 投影周长（水平面投影距离之和）
            const point1Proj = new THREE.Vector3(point1.three.x, 0, point1.three.z);
            const point2Proj = new THREE.Vector3(point2.three.x, 0, point2.three.z);
            projectionPerimeter += point1Proj.distanceTo(point2Proj);
            
            // Three贴地周长（考虑地形起伏的距离之和）
            threePerimeter += MeasureMath.calculateGroundDistance(point1.three, point2.three, this.rgbTerrain);
            
            // 测地周长（经纬度距离之和）
            geodesicPerimeter += this.mathProj.calculateGeographicDistance(point1.lonLat, point2.lonLat);
        }

        const projectionPerimeterM = this.mathProj?.unitsToMeters ? this.mathProj.unitsToMeters(projectionPerimeter) : projectionPerimeter;
        const threePerimeterM = this.mathProj?.unitsToMeters ? this.mathProj.unitsToMeters(threePerimeter) : threePerimeter;

        // 更新UI
        // 投影面积
        horizontal3857AreaEl.textContent = `${horizontal3857AreaM2.toFixed(2)} 平方米`;
        horizontalGeodesicAreaEl.textContent = `${horizontalGeodesicArea.toFixed(2)} 平方米`;
        
        // 贴地面积
        ground3857AreaEl.textContent = `${ground3857Area.toFixed(2)} 平方米`;
        threeTerrainAreaEl.textContent = `${threeTerrainAreaM2.toFixed(2)} 平方米`;
        groundGeodesicAreaEl.textContent = `${groundGeodesicArea.toFixed(2)} 平方米`;
        
        // 周长
        projectionPerimeterEl.textContent = `${projectionPerimeterM.toFixed(2)} 米`;
        threePerimeterEl.textContent = `${threePerimeterM.toFixed(2)} 米`;
        geodesicPerimeterEl.textContent = `${geodesicPerimeter.toFixed(2)} 米`;
    }

    /**
     * 更新填挖方测量结果（多多边形，支持凹多边形三角化）
     * - 结果使用 three->lon/lat 的测地面积/体积近似
     * - 双击结束当前多边形；可多次开始/结束叠加多个多边形
     */
    updateCutFillMeasurement(data = null) {
        const setText = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        };
        const fmt = (v) => (Number.isFinite(v) ? v.toFixed(2) : '0.00');

        // Reset path
        if (data && typeof data === 'object' && !Array.isArray(data) && ('three' in data || 'geodesic' in data)) {
            const three = Number.isFinite(Number(data.three)) ? Number(data.three) : 0;
            const geodesic = Number.isFinite(Number(data.geodesic)) ? Number(data.geodesic) : 0;
            setText('threeCutFillVolume', `${fmt(three)} 立方米`);
            setText('geodesicCutFillVolume', `${fmt(geodesic)} 立方米`);
            setText('cutfillPolyCount', '0');
            setText('cutfillAreaGeodesic', `0.00 平方米`);
            setText('cutfillFillVolumeGeodesic', `0.00 立方米`);
            setText('cutfillCutVolumeGeodesic', `0.00 立方米`);
            setText('cutfillNetVolumeGeodesic', `0.00 立方米`);
            return;
        }

        const stats = this._cutFillComputeStats(false);
        const net = stats.fillM3 - stats.cutM3;

        // Backward compatible (net)
        setText('threeCutFillVolume', `${fmt(net)} 立方米`);
        setText('geodesicCutFillVolume', `${fmt(net)} 立方米`);

        this._cutFillUpdateUiFromStats(stats);
    }

    // =========================== 填挖方（cutFill）实现 ===========================

    _cutFillHandlePickedPoint(point) {
        if (!point) return;
        const threePoint = (point?.isVector3 === true)
            ? point
            : new THREE.Vector3(Number(point.x) || 0, Number(point.y) || 0, Number(point.z) || 0);

        // Only X/Z are used for polygon; keep y=0 to avoid confusing “target elevation” logic.
        const p = new THREE.Vector3(Number(threePoint.x) || 0, 0, Number(threePoint.z) || 0);
        this.cutFillCurrentPoints.push(p);

        // Marker (reuse markerManager)
        if (this.markerManager) {
            try {
                const markerId = this.markerManager.createMarker({
                    x: p.x,
                    y: threePoint.y,
                    z: p.z,
                    radius: 1,
                    color: 0xff0000,
                    label: `P${this.cutFillCurrentPoints.length}`,
                    img: IMG.point.point
                });
                this.cutFillCurrentMarkerIds.push(markerId);
            } catch {
                // ignore
            }
        }

        // Show current polygon points in the point list (process view)
        this.updatePoints(this.cutFillCurrentPoints);
    }

    _cutFillUpdateUiFromStats(stats) {
        const setText = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        };
        const fmt = (v) => (Number.isFinite(v) ? v.toFixed(2) : '0.00');
        const area = Number(stats?.areaM2) || 0;
        const fill = Number(stats?.fillM3) || 0;
        const cut = Number(stats?.cutM3) || 0;
        const net = fill - cut;

        setText('cutfillPolyCount', String(this.cutFillPolygons.length));
        setText('cutfillAreaGeodesic', `${fmt(area)} 平方米`);
        setText('cutfillFillVolumeGeodesic', `${fmt(fill)} 立方米`);
        setText('cutfillCutVolumeGeodesic', `${fmt(cut)} 立方米`);
        setText('cutfillNetVolumeGeodesic', `${fmt(net)} 立方米`);
    }

    _cutFillFinishCurrentPolygon() {
        if (this.cutFillCurrentPoints.length < 3) {
            // Not enough points; just stop picking.
            this.cutFillCurrentPoints = [];
            this.cutFillCurrentMarkerIds = [];
            this.updatePoints([]);
            this.updateCutFillMeasurement();
            return;
        }

        this.cutFillPolygons.push(this.cutFillCurrentPoints.map(p => p.clone()));
        this.cutFillPolygonMarkerIds.push(this.cutFillCurrentMarkerIds);
        this.cutFillCurrentPoints = [];
        this.cutFillCurrentMarkerIds = [];

        this.updatePoints([]);
        this._cutFillRecompute();
    }

    _cutFillUndoLastPoint() {
        if (this.cutFillCurrentPoints.length === 0) return;
        this.cutFillCurrentPoints.pop();
        const markerId = this.cutFillCurrentMarkerIds.pop();
        if (markerId && this.markerManager) {
            try { this.markerManager.removeMarker(markerId); } catch { /* ignore */ }
        }
        this.updatePoints(this.cutFillCurrentPoints);
    }

    _cutFillClearAll() {
        // Remove markers
        if (this.markerManager) {
            for (const id of this.cutFillCurrentMarkerIds) {
                try { this.markerManager.removeMarker(id); } catch { /* ignore */ }
            }
            for (const polyIds of this.cutFillPolygonMarkerIds) {
                if (!polyIds) continue;
                for (const id of polyIds) {
                    try { this.markerManager.removeMarker(id); } catch { /* ignore */ }
                }
            }
        }

        this.cutFillPolygons = [];
        this.cutFillCurrentPoints = [];
        this.cutFillCurrentMarkerIds = [];
        this.cutFillPolygonMarkerIds = [];

        this._cutFillClearVisualization();
        this.updatePoints([]);
        this.updateCutFillMeasurement({ three: 0, geodesic: 0 });
    }

    _cutFillApplyJson() {
        const el = document.getElementById('cutfillPolygonsJson');
        if (!el) return;
        const raw = String(el.value || '').trim();
        if (!raw) {
            this._cutFillClearAll();
            return;
        }

        let arr;
        try {
            arr = JSON.parse(raw);
        } catch {
            alert('JSON 解析失败：请检查格式。');
            return;
        }
        if (!Array.isArray(arr)) {
            alert('JSON 格式错误：需要多边形数组 [[[lon,lat],...], ...]。');
            return;
        }
        if (!this.mathProj) {
            alert('mathProj 缺失，无法从经纬度转换到场景坐标。');
            return;
        }

        // Clear existing first
        this._cutFillClearAll();

        const polys = [];
        for (const poly of arr) {
            if (!Array.isArray(poly) || poly.length < 3) continue;
            const pts = [];
            for (const ll of poly) {
                if (!Array.isArray(ll) || ll.length < 2) continue;
                const lon = Number(ll[0]);
                const lat = Number(ll[1]);
                if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
                const v = this.mathProj.lonLatToThree(lon, lat, 0);
                pts.push(new THREE.Vector3(Number(v.x) || 0, 0, Number(v.z) || 0));
            }
            if (pts.length >= 3) polys.push(pts);
        }

        this.cutFillPolygons = polys;
        this._cutFillRecompute();
    }

    _cutFillExportJson() {
        const el = document.getElementById('cutfillPolygonsJson');
        if (!el || !this.mathProj) return;
        const out = this.cutFillPolygons.map(poly => poly.map(p => {
            const ll = this.mathProj.threeToLonLat(new THREE.Vector3(p.x, 0, p.z));
            return [Number(ll.lon.toFixed(6)), Number(ll.lat.toFixed(6))];
        }));
        el.value = JSON.stringify(out, null, 2);
    }

    _cutFillExecuteFlatten() {
        if (!this.rgbTerrain || !this.mathProj) return;
        if (!this.cutFillPolygons.length) return;

        const targetElevation = Number.isFinite(Number(this.cutFillTargetElevation)) ? Number(this.cutFillTargetElevation) : 0;
        const list = this.cutFillPolygons.map(poly => ({
            polygon: poly.map(p => {
                const ll = this.mathProj.threeToLonLat(new THREE.Vector3(p.x, 0, p.z));
                return [ll.lon, ll.lat];
            }),
            targetElevation
        }));

        try {
            if (typeof this.rgbTerrain.flattenTerrainMultiple === 'function') {
                this.rgbTerrain.flattenTerrainMultiple(list);
            } else if (typeof this.rgbTerrain.flattenTerrain === 'function' && list.length === 1) {
                this.rgbTerrain.flattenTerrain(list[0].polygon, targetElevation);
            }
            this._cutFillFlattenExecuted = true;
        } catch (e) {
            console.warn('flattenTerrain failed', e);
        }
    }

    _cutFillRestoreTerrainAfterExecute() {
        if (!this._cutFillFlattenExecuted) return;

        // Prefer public API when available (Viewer -> Terrain -> TerrainEditor).
        try { this.rgbTerrain?.clearFlattenTerrain?.(); } catch { /* ignore */ }

        // Fallback: reach into TerrainEditor directly (supports both Viewer and Terrain instances).
        try {
            const terrain = this.rgbTerrain?.terrain || this.rgbTerrain || null;
            const editor = terrain?.editor || null;
            editor?.clearFlattenEdits?.();
            if (editor?._removePatchesByPrefix) {
                editor._removePatchesByPrefix('single:flatten:');
                editor._removePatchesByPrefix('multi:flatten:');
            }
        } catch {
            // ignore
        }

        this._cutFillFlattenExecuted = false;
    }

    _cutFillRecompute() {
        const stats = this._cutFillComputeStats(true);
        // Update UI (avoid double compute)
        this._cutFillUpdateUiFromStats(stats);
        const net = stats.fillM3 - stats.cutM3;
        const fmt = (v) => (Number.isFinite(v) ? v.toFixed(2) : '0.00');
        const setText = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        };
        setText('threeCutFillVolume', `${fmt(net)} 立方米`);
        setText('geodesicCutFillVolume', `${fmt(net)} 立方米`);
        // Update scene visualization
        this._cutFillRebuildVisualization(stats);
    }

    _cutFillComputeStats(needGeometry = false) {
        const out = {
            areaM2: 0,
            fillM3: 0,
            cutM3: 0,
            geometries: needGeometry ? { ground: [], flat: [], cut: [], fill: [], walls: [] } : null
        };
        if (!this.mathProj) return out;
        if (!this.cutFillPolygons.length) return out;

        const targetMeters = Number.isFinite(Number(this.cutFillTargetElevation)) ? Number(this.cutFillTargetElevation) : 0;
        const stepM = Number.isFinite(Number(this.cutFillSampleStepMeters)) ? Math.max(1, Number(this.cutFillSampleStepMeters)) : 20;
        const target = this.mathProj?.metersToUnits ? this.mathProj.metersToUnits(targetMeters) : targetMeters;

        const getTerrainY = (x, z) => {
            try {
                const ey = this.rgbTerrain?.getElevationAtThreePosition?.(x, z);
                return Number.isFinite(Number(ey)) ? Number(ey) : 0;
            } catch {
                return 0;
            }
        };

        // Safety clamp for very large areas (avoid freezing the UI)
        const MAX_SUB_TRIANGLES = 200000;
        let subTriCount = 0;

        for (const poly of this.cutFillPolygons) {
            const contour = poly.map(p => new THREE.Vector2(p.x, p.z));
            if (contour.length < 3) continue;

            const faces = THREE.ShapeUtils?.triangulateShape ? THREE.ShapeUtils.triangulateShape(contour, []) : [];
            for (const f of faces) {
                if (!f || f.length !== 3) continue;
                const v0 = poly[f[0]];
                const v1 = poly[f[1]];
                const v2 = poly[f[2]];
                if (!v0 || !v1 || !v2) continue;

                // Total polygon area (geodesic): sum original triangle areas once.
                const triArea = this._cutFillTriangleGeodesicArea(v0.x, v0.z, v1.x, v1.z, v2.x, v2.z);
                if (Number.isFinite(triArea) && triArea > 0) out.areaM2 += triArea;

                // Subdivide triangles for more accurate volume on complex terrain.
                const subTris = this._cutFillSubdivideTriangleXZ(v0, v1, v2, stepM);
                for (const t of subTris) {
                    if (subTriCount++ > MAX_SUB_TRIANGLES) break;

                    const ax = t.a.x, az = t.a.z;
                    const bx = t.b.x, bz = t.b.z;
                    const cx = t.c.x, cz = t.c.z;

                    const ya = getTerrainY(ax, az);
                    const yb = getTerrainY(bx, bz);
                    const yc = getTerrainY(cx, cz);

                    const da = ya - target;
                    const db = yb - target;
                    const dc = yc - target;

                    if (needGeometry && out.geometries) {
                        out.geometries.ground.push(
                            { x: ax, y: ya, z: az },
                            { x: bx, y: yb, z: bz },
                            { x: cx, y: yc, z: cz }
                        );
                        out.geometries.flat.push(
                            { x: ax, y: target, z: az },
                            { x: bx, y: target, z: bz },
                            { x: cx, y: target, z: cz }
                        );
                    }

                    const parts = this._cutFillSplitTriangleBySign(
                        { x: ax, z: az, d: da },
                        { x: bx, z: bz, d: db },
                        { x: cx, z: cz, d: dc }
                    );

                    for (const part of parts) {
                        if (!part || part.sign === 0) continue;
                        const a = part.pts[0], b = part.pts[1], c = part.pts[2];
                        const area = this._cutFillTriangleGeodesicArea(a.x, a.z, b.x, b.z, c.x, c.z);
                        if (!Number.isFinite(area) || area <= 0) continue;

                        const avgDUnits = (a.d + b.d + c.d) / 3;
                        const avgD = this.mathProj?.unitsToMeters ? this.mathProj.unitsToMeters(avgDUnits) : avgDUnits;
                        if (part.sign > 0) out.cutM3 += area * Math.max(0, avgD);
                        else if (part.sign < 0) out.fillM3 += area * Math.max(0, -avgD);

                        if (needGeometry && out.geometries) {
                            const dst = part.sign > 0 ? out.geometries.cut : out.geometries.fill;
                            dst.push(
                                { x: a.x, y: target, z: a.z },
                                { x: b.x, y: target, z: b.z },
                                { x: c.x, y: target, z: c.z }
                            );
                        }
                    }
                }
                if (subTriCount > MAX_SUB_TRIANGLES) break;
            }

            if (needGeometry && out.geometries) out.geometries.walls.push({ poly, target });
            if (subTriCount > MAX_SUB_TRIANGLES) break;
        }

        return out;
    }

    _cutFillTriangleGeodesicArea(ax, az, bx, bz, cx, cz) {
        if (!this.mathProj) return 0;
        const ll1 = this.mathProj.threeToLonLat(new THREE.Vector3(ax, 0, az));
        const ll2 = this.mathProj.threeToLonLat(new THREE.Vector3(bx, 0, bz));
        const ll3 = this.mathProj.threeToLonLat(new THREE.Vector3(cx, 0, cz));
        const a = this.mathProj.calculateGeographicDistance(ll1, ll2);
        const b = this.mathProj.calculateGeographicDistance(ll2, ll3);
        const c = this.mathProj.calculateGeographicDistance(ll3, ll1);
        const s = (a + b + c) / 2;
        const area = Math.sqrt(Math.max(0, s * (s - a) * (s - b) * (s - c)));
        return Number.isFinite(area) ? area : 0;
    }

    _cutFillSplitTriangleBySign(p0, p1, p2) {
        const eps = 1e-9;
        const sign = (d) => (d > eps ? 1 : (d < -eps ? -1 : 0));
        const s0 = sign(p0.d), s1 = sign(p1.d), s2 = sign(p2.d);

        // all same or zeros
        if ((s0 >= 0 && s1 >= 0 && s2 >= 0) || (s0 <= 0 && s1 <= 0 && s2 <= 0)) {
            const allZero = (s0 === 0 && s1 === 0 && s2 === 0);
            const ss = allZero ? 0 : ((s0 >= 0 && s1 >= 0 && s2 >= 0) ? 1 : -1);
            return [{ sign: ss, pts: [p0, p1, p2] }];
        }

        const pts = [p0, p1, p2];
        const pos = pts.filter(p => sign(p.d) > 0);
        const neg = pts.filter(p => sign(p.d) < 0);

        const lerp = (a, b, t) => ({
            x: a.x + (b.x - a.x) * t,
            z: a.z + (b.z - a.z) * t,
            d: a.d + (b.d - a.d) * t
        });

        const edgeZero = (a, b) => {
            const da = a.d, db = b.d;
            const t = da / (da - db);
            const p = lerp(a, b, t);
            p.d = 0;
            return p;
        };

        if (pos.length === 1 && neg.length === 2) {
            const P = pos[0], N0 = neg[0], N1 = neg[1];
            const I0 = edgeZero(P, N0);
            const I1 = edgeZero(P, N1);
            return [
                { sign: 1, pts: [P, I0, I1] },
                { sign: -1, pts: [N0, N1, I1] },
                { sign: -1, pts: [N0, I1, I0] }
            ];
        }
        if (pos.length === 2 && neg.length === 1) {
            const N = neg[0], P0 = pos[0], P1 = pos[1];
            const I0 = edgeZero(N, P0);
            const I1 = edgeZero(N, P1);
            return [
                { sign: -1, pts: [N, I0, I1] },
                { sign: 1, pts: [P0, P1, I1] },
                { sign: 1, pts: [P0, I1, I0] }
            ];
        }

        // fallback: treat as net-zero (no cut/fill)
        return [{ sign: 0, pts: [p0, p1, p2] }];
    }

    _cutFillSubdivideTriangleXZ(v0, v1, v2, stepMeters) {
        const ax = v0.x, az = v0.z;
        const bx = v1.x, bz = v1.z;
        const cx = v2.x, cz = v2.z;

        const d = (x1, z1, x2, z2) => {
            const dx = x2 - x1, dz = z2 - z1;
            return Math.sqrt(dx * dx + dz * dz);
        };
        const maxLen = Math.max(
            d(ax, az, bx, bz),
            d(bx, bz, cx, cz),
            d(cx, cz, ax, az)
        );
        const stepUnits = this.mathProj?.metersToUnits ? this.mathProj.metersToUnits(stepMeters) : stepMeters;
        const n0 = Math.max(1, Math.ceil(maxLen / Math.max(1, stepUnits)));
        const n = Math.min(48, n0); // safety clamp

        const tris = [];
        const vx1x = bx - ax, vx1z = bz - az;
        const vx2x = cx - ax, vx2z = cz - az;
        const p = (i, j) => ({
            x: ax + vx1x * (i / n) + vx2x * (j / n),
            z: az + vx1z * (i / n) + vx2z * (j / n)
        });

        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n - i; j++) {
                const p00 = p(i, j);
                const p10 = p(i + 1, j);
                const p01 = p(i, j + 1);
                tris.push({ a: p00, b: p10, c: p01 });

                if (j < n - i - 1) {
                    const p11 = p(i + 1, j + 1);
                    tris.push({ a: p10, b: p11, c: p01 });
                }
            }
        }

        return tris;
    }

    _cutFillClearVisualization() {
        const removeMesh = (mesh) => {
            if (!mesh) return;
            try { this.cutFillVisGroup.remove(mesh); } catch { /* ignore */ }
            try { mesh.geometry?.dispose?.(); } catch { /* ignore */ }
            try { mesh.material?.dispose?.(); } catch { /* ignore */ }
        };
        removeMesh(this.cutFillVisMeshes.ground);
        removeMesh(this.cutFillVisMeshes.flat);
        removeMesh(this.cutFillVisMeshes.cut);
        removeMesh(this.cutFillVisMeshes.fill);
        removeMesh(this.cutFillVisMeshes.walls);
        this.cutFillVisMeshes = { ground: null, flat: null, walls: null, cut: null, fill: null };
    }

    _cutFillRebuildVisualization(stats) {
        this._cutFillClearVisualization();
        if (!stats?.geometries) return;

        const buildMesh = (verts, material, yOffset = 0, renderOrder = 10000) => {
            if (!verts || verts.length < 3) return null;
            const pos = new Float32Array(verts.length * 3);
            for (let i = 0; i < verts.length; i++) {
                pos[i * 3 + 0] = verts[i].x;
                pos[i * 3 + 1] = verts[i].y + yOffset;
                pos[i * 3 + 2] = verts[i].z;
            }
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            g.computeVertexNormals();
            const m = new THREE.Mesh(g, material);
            m.renderOrder = renderOrder;
            return m;
        };

        const groundMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthTest: true, depthWrite: false, side: THREE.DoubleSide });
        const flatMat = new THREE.MeshBasicMaterial({ color: 0xfff59d, transparent: true, opacity: 0.22, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
        const cutMat = new THREE.MeshBasicMaterial({ color: 0xff5252, transparent: true, opacity: 0.35, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
        const fillMat = new THREE.MeshBasicMaterial({ color: 0x448aff, transparent: true, opacity: 0.35, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
        const wallMat = new THREE.MeshBasicMaterial({ color: 0x9e9e9e, transparent: true, opacity: 0.35, depthTest: true, depthWrite: false, side: THREE.DoubleSide });

        const ground = buildMesh(stats.geometries.ground, groundMat, 0.03, 9000);
        const flat = buildMesh(stats.geometries.flat, flatMat, 0.05, 9500);
        const cut = buildMesh(stats.geometries.cut, cutMat, 0.06, 9600);
        const fill = buildMesh(stats.geometries.fill, fillMat, 0.06, 9600);

        if (ground) { this.cutFillVisGroup.add(ground); this.cutFillVisMeshes.ground = ground; }
        if (flat) { this.cutFillVisGroup.add(flat); this.cutFillVisMeshes.flat = flat; }
        if (cut) { this.cutFillVisGroup.add(cut); this.cutFillVisMeshes.cut = cut; }
        if (fill) { this.cutFillVisGroup.add(fill); this.cutFillVisMeshes.fill = fill; }

        const wallVerts = this._cutFillBuildWallVertices(stats.geometries.walls);
        const walls = buildMesh(wallVerts, wallMat, 0, 9400);
        if (walls) { this.cutFillVisGroup.add(walls); this.cutFillVisMeshes.walls = walls; }
    }

    _cutFillBuildWallVertices(wallsInput) {
        const verts = [];
        if (!Array.isArray(wallsInput) || wallsInput.length === 0) return verts;

        const getTerrainY = (x, z) => {
            try {
                const ey = this.rgbTerrain?.getElevationAtThreePosition?.(x, z);
                return Number.isFinite(Number(ey)) ? Number(ey) : 0;
            } catch {
                return 0;
            }
        };

        for (const w of wallsInput) {
            const poly = w?.poly;
            const target = Number(w?.target) || 0;
            if (!Array.isArray(poly) || poly.length < 3) continue;

            for (let i = 0; i < poly.length; i++) {
                const a = poly[i];
                const b = poly[(i + 1) % poly.length];
                if (!a || !b) continue;
                const ya = getTerrainY(a.x, a.z);
                const yb = getTerrainY(b.x, b.z);

                // quad -> two triangles (top at target, bottom at terrain)
                const aTop = { x: a.x, y: target, z: a.z };
                const bTop = { x: b.x, y: target, z: b.z };
                const aBot = { x: a.x, y: ya, z: a.z };
                const bBot = { x: b.x, y: yb, z: b.z };

                verts.push(aTop, bTop, bBot);
                verts.push(aTop, bBot, aBot);
            }
        }
        return verts;
    }

    /**
     * 更新剖面分析结果
     * @param {Object|Array} data - 剖面信息对象或点列表数组
     */
    updateProfileMeasurement(data) {
        // 获取DOM元素
        const profileLengthEl = document.getElementById('profileLength');
        const profileMaxElevationEl = document.getElementById('profileMaxElevation');
        const profileMinElevationEl = document.getElementById('profileMinElevation');
        const profileTotalReliefEl = document.getElementById('profileTotalRelief');
        const profileChartEl = document.getElementById('profileChart');
        const profileDataListEl = document.getElementById('profileDataList');
        
        // 确保元素存在
        if (!profileLengthEl || !profileMaxElevationEl || !profileMinElevationEl || !profileTotalReliefEl || !profileChartEl || !profileDataListEl) return;
        
        // 情况1：数据是对象，用于初始化或清空
        if (typeof data === 'object' && !Array.isArray(data)) {
            profileLengthEl.textContent = `${data.length.toFixed(2)} 米`;
            profileMaxElevationEl.textContent = `${data.maxElevation.toFixed(2)} 米`;
            profileMinElevationEl.textContent = `${data.minElevation.toFixed(2)} 米`;
            profileTotalReliefEl.textContent = `${data.totalRelief.toFixed(2)} 米`;
            
            // 清空剖面图
            const ctx = profileChartEl.getContext('2d');
            ctx.clearRect(0, 0, profileChartEl.width, profileChartEl.height);
            
            // 清空数据列表
            profileDataListEl.innerHTML = '';
            return;
        }
        
        // 情况2：数据是点数组，用于实际测量计算
        const points = data;
        if (!points || points.length < 2) return;
        
        // 获取起点和终点
        const startPoint = points[0].three;
        const endPoint = points[1].three;
        
        // 计算剖面长度
        const lengthUnits = startPoint.distanceTo(endPoint);
        const length = this.mathProj?.unitsToMeters ? this.mathProj.unitsToMeters(lengthUnits) : lengthUnits;
        
        // 生成剖面数据（简化实现，实际应根据地形数据生成更密集的剖面点）
        const profileData = MeasureMath.generateProfileData(startPoint, endPoint, 40, this.rgbTerrain, this.mathProj);
        
        // 计算最高点、最低点和总起伏
        const elevations = profileData.map(point => point.elevation);
        const maxElevation = Math.max(...elevations);
        const minElevation = Math.min(...elevations);
        const totalRelief = maxElevation - minElevation;
        
        // 更新基本信息
        profileLengthEl.textContent = `${length.toFixed(2)} 米`;
        profileMaxElevationEl.textContent = `${maxElevation.toFixed(2)} 米`;
        profileMinElevationEl.textContent = `${minElevation.toFixed(2)} 米`;
        profileTotalReliefEl.textContent = `${totalRelief.toFixed(2)} 米`;
        
        // 绘制剖面图
        this.drawProfileChart(profileChartEl, profileData);
        
        // 更新剖面数据列表
        this.updateProfileDataList(profileDataListEl, profileData);
    }
    

    
    /**
     * 绘制剖面图
     * @param {HTMLCanvasElement} canvas - 画布元素
     * @param {Array} profileData - 剖面数据数组
     */
    drawProfileChart(canvas, profileData) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        // 清空画布
        ctx.clearRect(0, 0, width, height);
        
        // 设置样式
        ctx.strokeStyle = '#2196F3';
        ctx.lineWidth = 2;
        ctx.fillStyle = 'rgba(33, 150, 243, 0.1)';
        ctx.font = '10px Arial';
        ctx.fillStyle = '#555';
        
        // 计算最大值和最小值
        const distances = profileData.map(point => point.distance);
        const elevations = profileData.map(point => point.elevation);
        const maxDistance = Math.max(...distances);
        const minElevation = Math.min(...elevations);
        const maxElevation = Math.max(...elevations);
        
        // 计算比例因子
        const xScale = width / maxDistance;
        const yScale = height / (maxElevation - minElevation || 1);
        
        // 绘制基线
        ctx.beginPath();
        ctx.moveTo(0, height);
        ctx.lineTo(width, height);
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // 绘制曲线
        ctx.beginPath();
        ctx.moveTo(0, height - (profileData[0].elevation - minElevation) * yScale);
        
        for (let i = 1; i < profileData.length; i++) {
            const x = profileData[i].distance * xScale;
            const y = height - (profileData[i].elevation - minElevation) * yScale;
            ctx.lineTo(x, y);
        }
        
        ctx.strokeStyle = '#2196F3';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // 填充曲线下方区域
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        ctx.fillStyle = 'rgba(33, 150, 243, 0.1)';
        ctx.fill();
        
        // 绘制坐标轴标签
        ctx.fillStyle = '#555';
        ctx.fillText('距离 (米)', width - 60, height - 5);
        ctx.save();
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('海拔 (米)', -height / 2, 15);
        ctx.restore();
        
        // 绘制刻度
        ctx.beginPath();
        for (let i = 0; i <= 4; i++) {
            const x = (i / 4) * width;
            ctx.moveTo(x, height - 5);
            ctx.lineTo(x, height);
            const distance = ((i / 4) * maxDistance).toFixed(0);
            ctx.fillText(distance, x - 15, height - 10);
        }
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
    
    /**
     * 更新剖面数据列表
     * @param {HTMLElement} container - 容器元素
     * @param {Array} profileData - 剖面数据数组
     */
    updateProfileDataList(container, profileData) {
        if (!profileData || profileData.length === 0) {
            container.innerHTML = '';
            return;
        }
        
        // 生成包含所有剖面点的经纬度和海拔的数组格式
        const html = profileData.map((point, index) => {
            return `
                <div class="profile-data-item">
                    <span class="profile-data-coordinates">[${point.lon.toFixed(7)}, ${point.lat.toFixed(7)}, ${point.elevation.toFixed(2)}]</span>
                </div>
            `;
        }).join('');
        
        container.innerHTML = html;
    }
    
    /**
     * 更新测量点列表
     * @param {Array} points - 测量点数组
     */
    updatePoints(points) {
        const pointList = document.getElementById('pointList');
        
        // 确保pointList元素存在
        if (!pointList) return;

        if (!Array.isArray(points) || points.length === 0) {
            pointList.innerHTML = '<p>点击地图添加测量点</p>';
            return;
        }

        const toVec3 = (p) => {
            if (!p) return null;
            if (p.isVector3 === true) return p;
            if (p.three && p.three.isVector3 === true) return p.three;
            if (p.three) return new THREE.Vector3(Number(p.three.x) || 0, Number(p.three.y) || 0, Number(p.three.z) || 0);
            if ('x' in p && 'z' in p) return new THREE.Vector3(Number(p.x) || 0, Number(p.y) || 0, Number(p.z) || 0);
            return null;
        };

        // 优先用 mathProj 转换（three->lon/lat），否则退化为 Three 坐标
        const html = points.map((p, index) => {
            const v = toVec3(p);
            if (!v) return '';
            if (this.mathProj) {
                const ll = this.mathProj.threeToLonLat(v);
                const lon = Number(ll?.lon).toFixed(7);
                const lat = Number(ll?.lat).toFixed(7);
                const alt = Number(ll?.elevation).toFixed(2);
                return `<div class="point-item">点 ${index + 1}: Lon ${lon}, Lat ${lat}, H ${alt}</div>`;
            }
            return `<div class="point-item">点 ${index + 1}: X ${v.x.toFixed(2)}, Y ${v.y.toFixed(2)}, Z ${v.z.toFixed(2)}</div>`;
        }).join('');

        pointList.innerHTML = html;
    }

    /**
     * 绑定射线拾取事件
     */
    bindPickingEvents() {
        if (!this.renderer) return;

        // 绑定鼠标点击事件
        this.renderer.domElement.addEventListener('click', this.onMouseClick.bind(this));
        
        // 绑定鼠标双击事件，用于结束剖面分析测量
        this.renderer.domElement.addEventListener('dblclick', this.onDoubleClick.bind(this));
    }

    /**
     * 处理鼠标点击事件，实现射线拾取
     * @param {Event} event - 鼠标点击事件
     */
    onMouseClick(event) {
        if (!this.isPicking) return;
        
        // 防止双击时触发两次单击
        if (this.clickTimeout) {
            clearTimeout(this.clickTimeout);
            this.clickTimeout = null;
        }
        
        // 设置双击标志
        this.isDoubleClick = false;

        // 计算鼠标在归一化设备坐标系中的位置
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        // 更新射线投射器
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // 优先使用基于地形高程缓存的射线→地形相交（当地形开启且支持该方法）
        let terrainHit = null;
        try {
            if (this.rgbTerrain && typeof this.rgbTerrain.getRayTerrainIntersection === 'function' && this.rgbTerrain.isRenderingTerrain()) {
                terrainHit = this.rgbTerrain.getRayTerrainIntersection(this.raycaster.ray, { maxDistance: 10000, step: 20, tolerance: 0.1 });
            }
        } catch (e) {
            console.warn('terrain intersection failed', e);
            terrainHit = null;
        }

        // 射线检测场景中的对象（优先选取非地形对象如 marker/line）
        const intersects = this.raycaster.intersectObjects(this.scene.children, true);

        // 找到第一个与场景对象相交的点（非标记、非线、非辅助对象）
        let intersectPoint = null;
        for (const intersect of intersects) {
            if (intersect.object.isMesh &&
                !intersect.object.name.startsWith('marker') &&
                !intersect.object.name.startsWith('line') &&
                !intersect.object.name.startsWith('axis')) {
                // 如果命中的是地形网格（ShaderMaterial + u_rgb），优先使用 terrainHit（以保证与视觉一致）
                const isTerrainMesh = intersect.object.material && intersect.object.material.isShaderMaterial && intersect.object.material.uniforms && typeof intersect.object.material.uniforms.u_rgb !== 'undefined';
                if (isTerrainMesh) {
                    if (terrainHit) {
                        intersectPoint = terrainHit;
                        break;
                    } else {
                        intersectPoint = intersect.point;
                        break;
                    }
                } else {
                    intersectPoint = intersect.point;
                    break;
                }
            }
        }

        // 如果没有命中任何场景对象，使用 terrainHit（如有），否则回退到远平面高度采样
        if (!intersectPoint) {
            if (terrainHit) {
                intersectPoint = terrainHit;
            } else {
                const farPlanePoint = new THREE.Vector3();
                this.raycaster.ray.at(10000, farPlanePoint);
                const elevation = this.rgbTerrain ? this.rgbTerrain.getElevationAtThreePosition(farPlanePoint.x, farPlanePoint.z) : 0;
                intersectPoint = new THREE.Vector3(farPlanePoint.x, elevation, farPlanePoint.z);
            }
        }

        // 设置防抖定时器，只有在单击（300ms内没有双击）时才处理点
        this.clickTimeout = setTimeout(() => {
            if (!this.isDoubleClick) {
                if (this.currentMeasureType === 'cutFill') {
                    this._cutFillHandlePickedPoint(intersectPoint);
                } else {
                    this.handlePickedPoint(intersectPoint);
                }
            }
        }, 300);
    }

    /**
     * 处理鼠标双击事件，用于结束测量
     * @param {Event} event - 鼠标双击事件
     */
    onDoubleClick(event) {
        if (!this.isPicking) return;
        
        // 设置双击标志，防止单击事件处理
        this.isDoubleClick = true;
        
        if (this.clickTimeout) {
            clearTimeout(this.clickTimeout);
            this.clickTimeout = null;
        }

        // 计算鼠标在归一化设备坐标系中的位置
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        // 更新射线投射器
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // 优先使用基于地形高程缓存的射线→地形相交（当地形开启且支持该方法）
        let terrainHit = null;
        try {
            if (this.rgbTerrain && typeof this.rgbTerrain.getRayTerrainIntersection === 'function' && this.rgbTerrain.isRenderingTerrain()) {
                terrainHit = this.rgbTerrain.getRayTerrainIntersection(this.raycaster.ray, { maxDistance: 10000, step: 20, tolerance: 0.1 });
            }
        } catch (e) {
            console.warn('terrain intersection failed', e);
            terrainHit = null;
        }

        // 射线检测场景中的对象（优先选取非地形对象如 marker/line）
        const intersects = this.raycaster.intersectObjects(this.scene.children, true);

        // 找到第一个与场景对象相交的点（非标记、非线、非辅助对象）
        let intersectPoint = null;
        for (const intersect of intersects) {
            if (intersect.object.isMesh &&
                !intersect.object.name.startsWith('marker') &&
                !intersect.object.name.startsWith('line') &&
                !intersect.object.name.startsWith('axis')) {
                // 如果命中的是地形网格（ShaderMaterial + u_rgb），优先使用 terrainHit（以保证与视觉一致）
                const isTerrainMesh = intersect.object.material && intersect.object.material.isShaderMaterial && intersect.object.material.uniforms && typeof intersect.object.material.uniforms.u_rgb !== 'undefined';
                if (isTerrainMesh) {
                    if (terrainHit) {
                        intersectPoint = terrainHit;
                        break;
                    } else {
                        intersectPoint = intersect.point;
                        break;
                    }
                } else {
                    intersectPoint = intersect.point;
                    break;
                }
            }
        }

        // 如果没有命中任何场景对象，使用 terrainHit（如有），否则回退到远平面高度采样
        if (!intersectPoint) {
            if (terrainHit) {
                intersectPoint = terrainHit;
            } else {
                const farPlanePoint = new THREE.Vector3();
                this.raycaster.ray.at(10000, farPlanePoint);
                const elevation = this.rgbTerrain ? this.rgbTerrain.getElevationAtThreePosition(farPlanePoint.x, farPlanePoint.z) : 0;
                intersectPoint = new THREE.Vector3(farPlanePoint.x, elevation, farPlanePoint.z);
            }
        }

        // 处理拾取到的点
        if (intersectPoint) {
            if (this.currentMeasureType === 'cutFill') {
                // 填挖方：双击结束当前多边形（可多次开始/结束叠加多个多边形）
                this._cutFillHandlePickedPoint(intersectPoint);
                this.isPicking = false;
                this._cutFillFinishCurrentPolygon();
                return;
            }

            this.handlePickedPoint(intersectPoint);

            // 结束测量，但保持结果
            this.isPicking = false;

            // 更新测量线段，确保多边形闭合
            this.updateMeasureLines();

            // 如果是面积测量，绘制贴地表面
            if (this.currentMeasureType === 'area') {
                this.drawGroundSurface();
            }
        }
    }

    /**
     * 处理拾取到的点
     * @param {THREE.Vector3} point - 拾取到的Three.js坐标点
     */
    handlePickedPoint(point) {
        if (!point || !this.mathProj) return;

        // 剖面分析最多只需要两个点
        if (this.currentMeasureType === 'profile' && this.pickedPoints.length >= 2) {
            return;
        }

        // 转换坐标
        const threePoint = (point?.isVector3 === true)
            ? point
            : new THREE.Vector3(Number(point.x) || 0, Number(point.y) || 0, Number(point.z) || 0);
        const mercator = this.mathProj.threeToMercator(threePoint);
        const lonLat = this.mathProj.threeToLonLat(threePoint);
        const toFiniteNum = (v) => {
            const n = Number(v);
            return Number.isFinite(n) ? n : NaN;
        };
        const mercatorN = {
            x: toFiniteNum(mercator?.x),
            y: toFiniteNum(mercator?.y),
            z: toFiniteNum(mercator?.z)
        };
        const lonLatN = {
            lon: toFiniteNum(lonLat?.lon),
            lat: toFiniteNum(lonLat?.lat),
            elevation: toFiniteNum(lonLat?.elevation)
        };

        // 添加到拾取点列表
        this.pickedPoints.push({
            three: threePoint.clone(),
            mercator: mercatorN,
            lonLat: lonLatN
        });

        // 创建标记点，添加图片标签
        if (this.markerManager) {
            const markerId = this.markerManager.createMarker({
                x: threePoint.x,
                y: threePoint.y,
                z: threePoint.z,
                radius: 1,
                color: 0xff0000,
                label: `P${this.pickedPoints.length}`,
                img: IMG.point.point // 添加图片标签
            });
            this.markers.push(markerId);
        }

        // 更新测量结果
        this.updateMeasurements();

        // 更新测量线段
        this.updateMeasureLines();
    }

    /**
     * 绘制测量点之间的连线
     * @param {number} startIndex - 起始点索引
     * @param {number} endIndex - 结束点索引
     * @returns {THREE.Line|null} 创建的线段对象
     */
    drawMeasureLine(startIndex, endIndex) {
        if (startIndex < 0 || endIndex >= this.pickedPoints.length) {
            return null;
        }

        const startPoint = this.pickedPoints[startIndex].three;
        const endPoint = this.pickedPoints[endIndex].three;

        // 创建线段几何体
        const points = [startPoint, endPoint];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);

        // 创建线段材质（黄色半透明）
        const material = new THREE.LineBasicMaterial({
            color: 0xFFFF00,
            linewidth: 2,
            transparent: true,
            opacity: 0.8
        });

        // 创建线段
        const line = new THREE.Line(geometry, material);

        // 添加到线段组
        this.measureLineGroup.add(line);
        this.measureLines.push(line);

        return line;
    }
    
    /**
     * 绘制贴地的测量线段
     * @param {number} startIndex - 起始点索引
     * @param {number} endIndex - 结束点索引
     * @returns {THREE.Line|null} 创建的线段对象
     */
    drawGroundMeasureLine(startIndex, endIndex) {
        if (startIndex < 0 || endIndex >= this.pickedPoints.length) {
            return null;
        }

        const startPoint = this.pickedPoints[startIndex].three;
        const endPoint = this.pickedPoints[endIndex].three;
        
        // 生成多个中间点，确保线段贴地
        const segments = 20;
        const groundPoints = [];
        
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            // 线性插值获取中间点
            const x = startPoint.x + (endPoint.x - startPoint.x) * t;
            const z = startPoint.z + (endPoint.z - startPoint.z) * t;
            
            // 获取地形高度
            let y = startPoint.y + (endPoint.y - startPoint.y) * t;
            if (this.rgbTerrain) {
                y = this.rgbTerrain.getElevationAtThreePosition(x, z) || y;
            }
            
            groundPoints.push(new THREE.Vector3(x, y, z));
        }

        // 创建线段几何体
        const geometry = new THREE.BufferGeometry().setFromPoints(groundPoints);

        // 创建线段材质（黄色半透明）
        const material = new THREE.LineBasicMaterial({
            color: 0xFFFF00,
            linewidth: 2,
            transparent: true,
            opacity: 0.8
        });

        // 创建线段
        const line = new THREE.Line(geometry, material);

        // 添加到线段组
        this.measureLineGroup.add(line);
        this.measureLines.push(line);

        return line;
    }

    /**
     * 清除所有测量线段
     */
    clearMeasureLines() {
        // 移除所有线段
        for (const line of this.measureLines) {
            this.measureLineGroup.remove(line);
            line.geometry.dispose();
            line.material.dispose();
        }
        this.measureLines = [];
    }
    
    /**
     * 清除地面表面
     */
    clearGroundSurface() {
        // Remove draped surface overlay (shader-based)
        if (this._customTerrainSurface && this._customTerrainSurfaceId) {
            try { this._customTerrainSurface.removeSurface(this._customTerrainSurfaceId); } catch { /* ignore */ }
            this._customTerrainSurfaceId = null;
        }

        // 移除所有表面
        while (this.groundSurfaceGroup.children.length > 0) {
            const surface = this.groundSurfaceGroup.children[0];
            this.groundSurfaceGroup.remove(surface);
            surface.geometry.dispose();
            surface.material.dispose();
        }
    }
    
    /**
     * 绘制贴地表面
     */
    drawGroundSurface() {
        if (this.pickedPoints.length < 3) return;
        
        // 清除之前的地面表面
        this.clearGroundSurface();
        
        // 获取测量点并生成贴地的点
        const groundPoints = this.pickedPoints.map(p => {
            const x = p.three.x;
            const z = p.three.z;
            
            // 获取地形高度
            let y = p.three.y;
            if (this.rgbTerrain) {
                y = this.rgbTerrain.getElevationAtThreePosition(x, z) || y;
            }
            
            return new THREE.Vector3(x, y, z);
        });

        // Shader-based draped surface (same approach as DrawTool)
        if (this._customTerrainSurface) {
            try { this._customTerrainSurface.setColor(0x8BC34A, 0.5); } catch { /* ignore */ }
            const created = this._customTerrainSurface.createSurface(groundPoints, { color: 0x8BC34A, opacity: 0.5 });
            this._customTerrainSurfaceId = created?.id ?? created ?? null;
            return;
        }
        
        // 使用三角形拆分法绘制表面
        // 以第一个点为顶点，将多边形分解为多个三角形
        for (let i = 1; i < groundPoints.length - 1; i++) {
            const p1 = groundPoints[0];
            const p2 = groundPoints[i];
            const p3 = groundPoints[i + 1];
            
            // 创建三角形几何体
            const geometry = new THREE.BufferGeometry();
            
            // 设置顶点位置
            const vertices = new Float32Array([
                p1.x, p1.y, p1.z,
                p2.x, p2.y, p2.z,
                p3.x, p3.y, p3.z
            ]);
            geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
            
            // 计算法向量
            geometry.computeVertexNormals();
            
            // 创建淡绿色材质
            const material = new THREE.MeshBasicMaterial({
                color: 0x8BC34A, // 淡绿色
                transparent: true,
                opacity: 0.5,
                side: THREE.DoubleSide // 双面渲染，确保无论点顺序如何都能显示
            });
            
            // 创建三角形网格
            const triangle = new THREE.Mesh(geometry, material);
            
            // 添加到地面表面组
            this.groundSurfaceGroup.add(triangle);
        }
    }

    /**
     * 更新测量线段（根据当前测量类型重新绘制）
     */
    updateMeasureLines() {
        // 清除现有线段
        this.clearMeasureLines();

        if (this.pickedPoints.length < 2) {
            return;
        }

        // 根据测量类型绘制线段
        if (this.currentMeasureType === 'distance' || this.currentMeasureType === 'profile') {
            // 距离测量和剖面分析：只连接最新的两个点
            this.drawMeasureLine(this.pickedPoints.length - 2, this.pickedPoints.length - 1);
        } else if (this.currentMeasureType === 'multiDistance' || this.currentMeasureType === 'area' || this.currentMeasureType === 'cutFill') {
            // 多点路程、面积/填挖方测量：贴地绘制
            for (let i = 0; i < this.pickedPoints.length - 1; i++) {
                this.drawGroundMeasureLine(i, i + 1);
            }
            // 闭合多边形（连接最后一个点和第一个点）
            if ((this.currentMeasureType === 'area' || this.currentMeasureType === 'cutFill') && this.pickedPoints.length >= 3) {
                this.drawGroundMeasureLine(this.pickedPoints.length - 1, 0);
            }
        }
    }

    /**
     * 更新测量结果
     */
    updateMeasurements() {
        switch (this.currentMeasureType) {
            case 'point':
                // 点测量：只显示最后一个点
                if (this.pickedPoints.length > 0) {
                    const lastPoint = this.pickedPoints[this.pickedPoints.length - 1];
                    // 传递完整的点对象，包含所有坐标信息
                    this.updatePointMeasurement({
                        lon: lastPoint.lonLat.lon,
                        lat: lastPoint.lonLat.lat,
                        elevation: lastPoint.lonLat.elevation,
                        three: lastPoint.three,
                        webMercator: lastPoint.mercator
                    });
                }
                break;
            case 'distance':
                // 两点距离测量
                if (this.pickedPoints.length >= 2) {
                    this.updateDistanceMeasurement(this.pickedPoints[this.pickedPoints.length - 2], this.pickedPoints[this.pickedPoints.length - 1]);
                }
                break;
            case 'multiDistance':
                // 多点路程测量
                if (this.pickedPoints.length >= 2) {
                    this.updateMultiDistanceMeasurement(this.pickedPoints);
                }
                break;
            case 'area':
                // 面积测量
                if (this.pickedPoints.length >= 3) {
                    this.updateAreaMeasurement(this.pickedPoints);
                }
                break;
            case 'cutFill':
                // 填挖方测量
                this.updateCutFillMeasurement();
                break;
            case 'profile':
                // 剖面分析测量
                if (this.pickedPoints.length >= 2) {
                    this.updateProfileMeasurement(this.pickedPoints);
                }
                break;
            default:
                break;
        }

        // 更新点列表
        this.updatePoints(this.pickedPoints.map(p => p.three));
    }

    /**
     * 更新两点距离测量结果
     * @param {Object} point1 - 第一个点信息
     * @param {Object} point2 - 第二个点信息
     */
    updateDistanceMeasurement(point1, point2) {
        const setTextIfExists = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        };
        const toFiniteNum = (v) => {
            const n = Number(v);
            return Number.isFinite(n) ? n : NaN;
        };

        // 兼容旧调用：updateDistanceMeasurement({ geodesic, three, webMercator })
        if (point2 === undefined && point1 && typeof point1 === 'object' && 'geodesic' in point1 && 'three' in point1) {
            const geodesic = toFiniteNum(point1.geodesic) || 0;
            const three = toFiniteNum(point1.three) || 0;
            const webMercator = toFiniteNum(point1.webMercator) || 0;

            setTextIfExists('geodesicDistance', `${geodesic.toFixed(2)} 米`);
            setTextIfExists('threeDistance', `${three.toFixed(2)} 米`);
            setTextIfExists('webMercatorDistance', `${webMercator.toFixed(2)} 米`);
            setTextIfExists('horizontalAngle', `0.00°`);
            setTextIfExists('frontViewAngle', `0.00°`);
            setTextIfExists('leftViewAngle', `0.00°`);
            setTextIfExists('eastThreeDistance', `0.00 米`);
            setTextIfExists('eastGeodesicDistance', `0.00 米`);
            setTextIfExists('northThreeDistance', `0.00 米`);
            setTextIfExists('northGeodesicDistance', `0.00 米`);
            setTextIfExists('heightDifference', `0.00 米`);
            return;
        }

        if (!point1 || !point2) return;

        // 计算Three.js距离
        const threeDistanceUnits = point1.three.distanceTo(point2.three);
        const threeDistance = this.mathProj?.unitsToMeters ? this.mathProj.unitsToMeters(threeDistanceUnits) : threeDistanceUnits;

        // 计算3857距离
        const mercatorDistance = Math.sqrt(
            Math.pow(point2.mercator.x - point1.mercator.x, 2) +
            Math.pow(point2.mercator.y - point1.mercator.y, 2)
        );

        // 计算测地距离
        const geodesicDistance = this.mathProj.calculateGeographicDistance(point1.lonLat, point2.lonLat);

        // 更新UI - 总距离
        setTextIfExists('geodesicDistance', `${toFiniteNum(geodesicDistance).toFixed(2)} 米`);
        setTextIfExists('threeDistance', `${toFiniteNum(threeDistance).toFixed(2)} 米`);
        setTextIfExists('webMercatorDistance', `${toFiniteNum(mercatorDistance).toFixed(2)} 米`);

        // 重新定义投影角度计算
        // 坐标转换关系：东 → Three X，北 → Three -Z，上 → Three Y
        const p1 = point1.three;
        const p2 = point2.three;

        // 计算差值向量
        const dx = p2.x - p1.x;  // 东方向分量
        const dy = p2.y - p1.y;  // 垂直方向分量（高度差）
        const dz = p2.z - p1.z;  // 北方向分量（注意：Three Z轴负方向为北）

        //  OverlookAngle：线段在【北向量，东向量组成平面的投影向量与东向量夹角】
        // 北向量：(0, 0, -1)，东向量：(1, 0, 0)
        // 投影到水平面的向量：(dx, 0, dz)
        const OverlookAngle = Math.atan2(-dz, dx); // 注意：北方向对应-Z，所以用-dz
        const OverlookAngleDeg = this.mathProj.radiansToDegrees(OverlookAngle);

        // 右视角：线段在上向量与北向量组成平面的投影向量与北向量的夹角
        // 上向量：(0, 1, 0)，北向量：(0, 0, -1)
        // 投影到右视图平面的向量：(0, dy, dz)
        const rightViewAngle = Math.atan2(dy, -dz); // 注意：北方向对应-Z，所以用-dz
        const rightViewAngleDeg = this.mathProj.radiansToDegrees(rightViewAngle);

        // 前视角：线段在上向量与东向量组成平面的投影向量与东向量的夹角
        // 上向量：(0, 1, 0)，东向量：(1, 0, 0)
        // 投影到前视图平面的向量：(dx, dy, 0)
        const frontViewAngle = Math.atan2(dy, dx);
        const frontViewAngleDeg = this.mathProj.radiansToDegrees(frontViewAngle);

        // 更新UI - 投影角度
        setTextIfExists('horizontalAngle', `${toFiniteNum(OverlookAngleDeg).toFixed(2)}°`);
        setTextIfExists('frontViewAngle', `${toFiniteNum(frontViewAngleDeg).toFixed(2)}°`);
        setTextIfExists('leftViewAngle', `${toFiniteNum(rightViewAngleDeg).toFixed(2)}°`);

        // 计算方向距离分量
        const directionDistances = this.mathProj.calculateDirectionDistances(point1.three, point2.three);

        // 更新UI - 东方向分量
        setTextIfExists('eastThreeDistance', `${toFiniteNum(directionDistances?.east?.three).toFixed(2)} 米`);
        setTextIfExists('eastGeodesicDistance', `${toFiniteNum(directionDistances?.east?.geodesicsigned).toFixed(2)} 米`);

        // 更新UI - 北方向分量
        setTextIfExists('northThreeDistance', `${toFiniteNum(directionDistances?.north?.three).toFixed(2)} 米`);
        setTextIfExists('northGeodesicDistance', `${toFiniteNum(directionDistances?.north?.geodesicsigned).toFixed(2)} 米`);

        // 更新UI - 高度分量
        const heightDiffUnits = point2.three.y - point1.three.y;
        const heightDiff = this.mathProj?.unitsToMeters ? this.mathProj.unitsToMeters(heightDiffUnits) : heightDiffUnits;
        setTextIfExists('heightDifference', `${toFiniteNum(heightDiff).toFixed(2)} 米`);
    }

    /**
     * 设置测量类型
     * @param {string} type - 测量类型：point, distance, multiDistance, area, cutFill
     * @param {boolean} isInitialization - 是否是初始化调用
     */
    setMeasureType(type, isInitialization = false) {
        // 用户手动切换tab时，允许切换并自动关闭拾取状态
        if (this.isInitialized && !isInitialization) {
            // 自动关闭拾取状态
            this.isPicking = false;
        }

        // 更新标签状态
        const tabLinks = document.querySelectorAll('.tab-link');
        tabLinks.forEach(link => link.classList.remove('active'));
        document.getElementById(`${type === 'point' ? 'pointMeasure' : type === 'distance' ? 'distanceMeasure' : type === 'multiDistance' ? 'multiDistance' : type === 'area' ? 'areaMeasure' : type === 'cutFill' ? 'cutFill' : 'profileAnalysis'}Btn`).classList.add('active');

        // 隐藏所有结果区域
        const resultSections = document.querySelectorAll('.result-section');
        resultSections.forEach(section => section.style.display = 'none');

        // 显示当前测量类型对应的结果区域
        if (type === 'point') {
            document.getElementById('pointResultSection').style.display = 'block';
        } else if (type === 'distance') {
            document.getElementById('distanceResultSection').style.display = 'block';
        } else if (type === 'multiDistance') {
            document.getElementById('multiDistanceResultSection').style.display = 'block';
        } else if (type === 'area') {
            document.getElementById('areaResultSection').style.display = 'block';
        } else if (type === 'cutFill') {
            document.getElementById('cutFillResultSection').style.display = 'block';
        } else if (type === 'profile') {
            document.getElementById('profileResultSection').style.display = 'block';
        }

        // 更新当前测量类型
        this.currentMeasureType = type;
        
        // 只有初始化时才自动开启拾取状态，用户切换tab时需要手动点击开始测量
        if (isInitialization) {
            this.isPicking = true;
        }

        // 清空之前的拾取点
        this.clearPickedPoints();

        // 初始化/同步填挖方子页面输入与显示
        if (type === 'cutFill') {
            const targetEl = document.getElementById('cutfillTargetElevation');
            if (targetEl) targetEl.value = String(this.cutFillTargetElevation);
            const stepEl = document.getElementById('cutfillSampleStep');
            if (stepEl) stepEl.value = String(this.cutFillSampleStepMeters);
            this.updateCutFillMeasurement();
        }

        // 触发测量类型切换事件
        this.onMeasureTypeChange?.(type);
    }

    /**
     * 撤销最后一个点
     */
    undoLastPoint() {
        if (this.currentMeasureType === 'cutFill') {
            this._cutFillUndoLastPoint();
            return;
        }
        if (this.pickedPoints.length > 0) {
            // 移除最后一个点
            this.pickedPoints.pop();

            // 移除对应的标记点
            if (this.markerManager && this.markers.length > 0) {
                const markerId = this.markers.pop();
                this.markerManager.removeMarker(markerId);
            }

            // 更新UI
            this.updatePoints(this.pickedPoints.map(p => p.three));
            this.updateMeasurements();

            // 更新测量线段
            this.updateMeasureLines();
        }
    }

    /**
     * 清除拾取的点
     */
    clearPickedPoints() {
        // Always clear cutFill overlays/markers so tab switches don’t leave stale visuals.
        this._cutFillClearAll();

        // 移除所有标记点
        if (this.markerManager) {
            this.markers.forEach(markerId => {
                this.markerManager.removeMarker(markerId);
            });
            this.markers = [];
        }

        // 清除所有测量线段
        this.clearMeasureLines();
        
        // 清除地面表面
        this.clearGroundSurface();

        this.pickedPoints = [];
        this.updatePoints([]);

        // 根据当前测量类型清除对应的结果
        switch (this.currentMeasureType) {
            case 'point':
                this.updatePointMeasurement(null);
                break;
            case 'distance':
                this.updateDistanceMeasurement({ geodesic: 0, three: 0, webMercator: 0 });
                break;
            case 'multiDistance':
                this.updateMultiDistanceMeasurement({ total: 0, segments: [] });
                break;
            case 'area':
                this.updateAreaMeasurement({ horizontal: 0, threeTerrain: 0, geodesic: 0 });
                break;
            case 'cutFill':
                this.updateCutFillMeasurement({ three: 0, geodesic: 0 });
                break;
            case 'profile':
                this.updateProfileMeasurement({ length: 0, maxElevation: 0, minElevation: 0, totalRelief: 0, profileData: [] });
                break;
            default:
                break;
        }
    }

    /**
     * 清除测量结果
     */
    clearMeasurements(isTemporary = true) {
        // 清除所有测量结果
        if (isTemporary) {
            // Fill/Cut: explicitly clearing should also restore terrain if user executed flatten.
            if (this.currentMeasureType === 'cutFill') {
                this._cutFillRestoreTerrainAfterExecute();
            }
            this.clearPickedPoints();
        }

        // 取消拾取状态
        this.isPicking = false;

        // 触发清除事件
        this.onClear?.(true);
    }

    /**
     * 开始测量
     */
    startMeasurement() {
        if (this.currentMeasureType === 'cutFill') {
            // Start a new polygon; keep existing polygons until user clears.
            if (!this.isPicking) {
                // Clear unfinished polygon points/markers if any
                for (const id of this.cutFillCurrentMarkerIds) {
                    try { this.markerManager?.removeMarker?.(id); } catch { /* ignore */ }
                }
                this.cutFillCurrentPoints = [];
                this.cutFillCurrentMarkerIds = [];
                this.updatePoints([]);
            }
            this.isPicking = true;
            return;
        }

        // 只有当用户开始新的测量时，才清除之前的结果
        if (!this.isPicking) {
            this.clearPickedPoints();
        }
        // 恢复拾取权限
        this.isPicking = true;
    }

    /**
     * 初始化时调用，设置默认测量类型为点测量
     */
    init(container) {
        this.container = container;
        this.render();
        this.bindEvents();
        this.bindPickingEvents();
        // 默认打开点测量，传递isInitialization=true
        this.setMeasureType('point', true);
        this.isInitialized = true;
    }

    /**
     * 结束测量
     */
    endMeasurement(isTemporary = false) {
        if (this.currentMeasureType === 'cutFill') {
            // End current polygon (if valid)
            this.isPicking = false;
            this._cutFillFinishCurrentPolygon();
            return;
        }

        // 只暂停拾取，不清理数据
        this.isPicking = false;
    }

    /**
     * 销毁UI
     */
    dispose() {
        // 结束测量
        this.endMeasurement(true);

        // 清除所有测量线段
        this.clearMeasureLines();

        // 清除填挖方可视化/标记
        this._cutFillClearAll();
        if (this.scene && this.cutFillVisGroup) {
            try { this.scene.remove(this.cutFillVisGroup); } catch { /* ignore */ }
        }

        // 清除贴地表面（含 shader overlay）
        this.clearGroundSurface();
        if (this._customTerrainSurface) {
            try { this._customTerrainSurface.dispose(); } catch { /* ignore */ }
            this._customTerrainSurface = null;
            this._customTerrainSurfaceId = null;
        }

        // 从场景移除线段组
        if (this.scene && this.measureLineGroup) {
            this.scene.remove(this.measureLineGroup);
        }

        // 从场景移除地面表面组（legacy / fallback）
        if (this.scene && this.groundSurfaceGroup) {
            this.scene.remove(this.groundSurfaceGroup);
        }

        // 移除事件监听器
        if (this.renderer) {
            this.renderer.domElement.removeEventListener('click', this.onMouseClick.bind(this));
            this.renderer.domElement.removeEventListener('dblclick', this.onDoubleClick.bind(this));
        }

        this.isInitialized = false;
    }
}

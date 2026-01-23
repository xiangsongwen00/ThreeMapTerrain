import * as THREE from 'three';
import { measureToolHTML } from './html/measureToolHTML.js';
import { measureToolStyles } from './style/measureToolStyles.js';
import { MeasureMath } from '../measureMath.js';
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

        // 将线段组添加到场景
        if (this.scene) {
            this.scene.add(this.measureLineGroup);
        }
        
        // 创建地面表面组
        this.groundSurfaceGroup = new THREE.Group();
        if (this.scene) {
            this.scene.add(this.groundSurfaceGroup);
        }
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
            let lon, lat, elevation;

            // 检查pointInfo格式并提取经纬度和海拔
            if (pointInfo.lon !== undefined && pointInfo.lat !== undefined && pointInfo.elevation !== undefined) {
                lon = pointInfo.lon;
                lat = pointInfo.lat;
                elevation = pointInfo.elevation;
            } else if (pointInfo.lonLat) {
                // 支持另一种格式：pointInfo包含lonLat对象
                const lonLat = pointInfo.lonLat;
                if (lonLat.lon !== undefined && lonLat.lat !== undefined && lonLat.elevation !== undefined) {
                    lon = lonLat.lon;
                    lat = lonLat.lat;
                    elevation = lonLat.elevation;
                }
            }

            // 更新经纬度和海拔，精度：经纬度7位小数，高度2位小数
            if (lon !== undefined && lat !== undefined && elevation !== undefined) {
                document.getElementById('pointLon').textContent = lon.toFixed(7);
                document.getElementById('pointLat').textContent = lat.toFixed(7);
                document.getElementById('pointAlt').textContent = elevation.toFixed(2);
            }

            // 检查并更新Three坐标，精度：2位小数
            if (pointInfo.three) {
                document.getElementById('pointThreeX').textContent = pointInfo.three.x.toFixed(2);
                document.getElementById('pointThreeY').textContent = pointInfo.three.y.toFixed(2);
                document.getElementById('pointThreeZ').textContent = pointInfo.three.z.toFixed(2);
            }

            // 检查并更新3857坐标，精度：2位小数
            if (pointInfo.webMercator) {
                document.getElementById('point3857X').textContent = pointInfo.webMercator.x.toFixed(2);
                document.getElementById('point3857Y').textContent = pointInfo.webMercator.y.toFixed(2);
                document.getElementById('point3857Z').textContent = pointInfo.webMercator.z.toFixed(2);
            }
        }
    }

    /**
     * 更新两点距离测量结果
     * @param {Object} distanceInfo - 距离信息对象，包含测地距离、Three距离和3857距离
     */
    updateDistanceMeasurement(distanceInfo) {
        document.getElementById('geodesicDistance').textContent = `${distanceInfo.geodesic.toFixed(2)} 米`;
        document.getElementById('threeDistance').textContent = `${distanceInfo.three.toFixed(2)} 米`;
        document.getElementById('webMercatorDistance').textContent = `${distanceInfo.webMercator.toFixed(2)} 米`;
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
            const projectionDistance = point1Proj.distanceTo(point2Proj);

            // 2. 计算贴地Three距离（Three场景中的贴地距离）
            const groundThreeDistance = MeasureMath.calculateGroundDistance(point1.three, point2.three, this.rgbTerrain);

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
        
        // 2.2 3857贴地面积（简化处理，使用Three贴地面积）
        const ground3857Area = threeTerrainArea;
        
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

        // 更新UI
        // 投影面积
        horizontal3857AreaEl.textContent = `${horizontal3857Area.toFixed(2)} 平方米`;
        horizontalGeodesicAreaEl.textContent = `${horizontalGeodesicArea.toFixed(2)} 平方米`;
        
        // 贴地面积
        ground3857AreaEl.textContent = `${ground3857Area.toFixed(2)} 平方米`;
        threeTerrainAreaEl.textContent = `${threeTerrainArea.toFixed(2)} 平方米`;
        groundGeodesicAreaEl.textContent = `${groundGeodesicArea.toFixed(2)} 平方米`;
        
        // 周长
        projectionPerimeterEl.textContent = `${projectionPerimeter.toFixed(2)} 米`;
        threePerimeterEl.textContent = `${threePerimeter.toFixed(2)} 米`;
        geodesicPerimeterEl.textContent = `${geodesicPerimeter.toFixed(2)} 米`;
    }

    /**
     * 更新填挖方测量结果
     * @param {Object|Array} data - 填挖方信息对象或点列表数组
     */
    updateCutFillMeasurement(data) {
        // 获取DOM元素
        const threeCutFillVolumeEl = document.getElementById('threeCutFillVolume');
        const geodesicCutFillVolumeEl = document.getElementById('geodesicCutFillVolume');
        
        // 确保元素存在
        if (!threeCutFillVolumeEl || !geodesicCutFillVolumeEl) return;
        
        // 情况1：数据是对象，用于初始化或清空
        if (typeof data === 'object' && !Array.isArray(data)) {
            threeCutFillVolumeEl.textContent = `${data.three.toFixed(2)} 立方米`;
            geodesicCutFillVolumeEl.textContent = `${data.geodesic.toFixed(2)} 立方米`;
            return;
        }
        
        // 情况2：数据是点数组，用于实际测量计算
        const points = data;
        if (!points || points.length < 3) return;

        // 简单实现，后续可以扩展为更复杂的填挖方计算
        const volume = 0;

        // 更新UI
        threeCutFillVolumeEl.textContent = `${volume.toFixed(2)} 立方米`;
        geodesicCutFillVolumeEl.textContent = `${volume.toFixed(2)} 立方米`;
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
        const length = startPoint.distanceTo(endPoint);
        
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

        if (points.length === 0) {
            pointList.innerHTML = '<p>点击地图添加测量点</p>';
            return;
        }

        // 使用经纬度海拔来展示点信息
        const html = this.pickedPoints.map((pickedPoint, index) => {
            const lon = pickedPoint.lonLat.lon.toFixed(7);
            const lat = pickedPoint.lonLat.lat.toFixed(7);
            const alt = pickedPoint.lonLat.elevation.toFixed(2);
            return `<div class="point-item">点 ${index + 1}: Lon ${lon}, Lat ${lat}, H ${alt}</div>`;
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

        // 射线检测
        const intersects = this.raycaster.intersectObjects(this.scene.children, true);

        // 找到第一个与地面/地形相交的点
        let intersectPoint = null;
        for (const intersect of intersects) {
            // 找到第一个非点标记、非线、非辅助对象的相交点
            if (intersect.object.isMesh &&
                !intersect.object.name.startsWith('marker') &&
                !intersect.object.name.startsWith('line') &&
                !intersect.object.name.startsWith('axis')) {
                intersectPoint = intersect.point;
                break;
            }
        }

        // 如果没有找到相交点，尝试使用地形高度查询
        if (!intersectPoint) {
            // 从相机发射射线到远平面，获取射线方向
            const farPlanePoint = new THREE.Vector3();
            this.raycaster.ray.at(10000, farPlanePoint);

            // 使用地形高度查询
            const elevation = this.rgbTerrain ?
                this.rgbTerrain.getElevationAtThreePosition(farPlanePoint.x, farPlanePoint.z) : 0;

            // 创建一个虚拟的相交点
            intersectPoint = new THREE.Vector3(farPlanePoint.x, elevation, farPlanePoint.z);
        }

        // 设置防抖定时器，只有在单击（300ms内没有双击）时才处理点
        this.clickTimeout = setTimeout(() => {
            if (!this.isDoubleClick) {
                this.handlePickedPoint(intersectPoint);
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

        // 射线检测
        const intersects = this.raycaster.intersectObjects(this.scene.children, true);

        // 找到第一个与地面/地形相交的点
        let intersectPoint = null;
        for (const intersect of intersects) {
            // 找到第一个非点标记、非线、非辅助对象的相交点
            if (intersect.object.isMesh &&
                !intersect.object.name.startsWith('marker') &&
                !intersect.object.name.startsWith('line') &&
                !intersect.object.name.startsWith('axis')) {
                intersectPoint = intersect.point;
                break;
            }
        }

        // 如果没有找到相交点，尝试使用地形高度查询
        if (!intersectPoint) {
            // 从相机发射射线到远平面，获取射线方向
            const farPlanePoint = new THREE.Vector3();
            this.raycaster.ray.at(10000, farPlanePoint);

            // 使用地形高度查询
            const elevation = this.rgbTerrain ?
                this.rgbTerrain.getElevationAtThreePosition(farPlanePoint.x, farPlanePoint.z) : 0;

            // 创建一个虚拟的相交点
            intersectPoint = new THREE.Vector3(farPlanePoint.x, elevation, farPlanePoint.z);
        }

        // 处理拾取到的点
        if (intersectPoint) {
            this.handlePickedPoint(intersectPoint);
            
            // 结束测量，但保持结果
            this.isPicking = false;
            
            // 更新测量线段，确保多边形闭合
            this.updateMeasureLines();
            
            // 如果是面积测量或填挖方测量，绘制贴地表面
            if (this.currentMeasureType === 'area' || this.currentMeasureType === 'cutFill') {
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
        const threePoint = point;
        const mercator = this.mathProj.threeToMercator(threePoint);
        const lonLat = this.mathProj.threeToLonLat(threePoint);

        // 添加到拾取点列表
        this.pickedPoints.push({
            three: threePoint.clone(),
            mercator: { ...mercator },
            lonLat: { ...lonLat }
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
                img: './src/assest/img/pointImg/点.png' // 添加图片标签
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
                if (this.pickedPoints.length >= 3) {
                    this.updateCutFillMeasurement(this.pickedPoints);
                }
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
        if (!point1 || !point2) return;

        // 计算Three.js距离
        const threeDistance = point1.three.distanceTo(point2.three);

        // 计算3857距离
        const mercatorDistance = Math.sqrt(
            Math.pow(point2.mercator.x - point1.mercator.x, 2) +
            Math.pow(point2.mercator.y - point1.mercator.y, 2)
        );

        // 计算测地距离
        const geodesicDistance = this.mathProj.calculateGeographicDistance(point1.lonLat, point2.lonLat);

        // 更新UI - 总距离
        document.getElementById('geodesicDistance').textContent = `${geodesicDistance.toFixed(2)} 米`;
        document.getElementById('threeDistance').textContent = `${threeDistance.toFixed(2)} 米`;

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
        document.getElementById('horizontalAngle').textContent = `${OverlookAngleDeg.toFixed(2)}°`;
        document.getElementById('frontViewAngle').textContent = `${frontViewAngleDeg.toFixed(2)}°`;
        document.getElementById('leftViewAngle').textContent = `${rightViewAngleDeg.toFixed(2)}°`;

        // 计算方向距离分量
        const directionDistances = this.mathProj.calculateDirectionDistances(point1.three, point2.three);

        // 更新UI - 东方向分量
        document.getElementById('eastThreeDistance').textContent = `${directionDistances.east.three.toFixed(2)} 米`;
        document.getElementById('eastGeodesicDistance').textContent = `${directionDistances.east.geodesicsigned.toFixed(2)} 米`;

        // 更新UI - 北方向分量
        document.getElementById('northThreeDistance').textContent = `${directionDistances.north.three.toFixed(2)} 米`;
        document.getElementById('northGeodesicDistance').textContent = `${directionDistances.north.geodesicsigned.toFixed(2)} 米`;

        // 更新UI - 高度分量
        const heightDiff = point2.three.y - point1.three.y;
        document.getElementById('heightDifference').textContent = `${heightDiff.toFixed(2)} 米`;
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

        // 触发测量类型切换事件
        this.onMeasureTypeChange?.(type);
    }

    /**
     * 撤销最后一个点
     */
    undoLastPoint() {
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
        if (isTemporary)
            this.clearPickedPoints();

        // 取消拾取状态
        this.isPicking = false;

        // 触发清除事件
        this.onClear?.(true);
    }

    /**
     * 开始测量
     */
    startMeasurement() {
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

        // 从场景移除线段组
        if (this.scene && this.measureLineGroup) {
            this.scene.remove(this.measureLineGroup);
        }

        // 移除事件监听器
        if (this.renderer) {
            this.renderer.domElement.removeEventListener('click', this.onMouseClick.bind(this));
            this.renderer.domElement.removeEventListener('dblclick', this.onDoubleClick.bind(this));
        }

        this.isInitialized = false;
    }
}
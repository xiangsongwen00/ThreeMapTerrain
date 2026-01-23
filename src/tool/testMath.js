import * as THREE from 'three';
import { getMathProj } from '../Math/mathProj.js';
import { MarkerManager } from '../marker/marker.js';

/**
 * 坐标转换测试工具类
 * 用于验证MathProj的正确性，提供以下功能：
 * 1. 地图坐标拾取（Three.js坐标）
 * 2. 经纬度转Three.js坐标
 * 3. 坐标转换结果显示
 * 4. 标记点管理
 */
export class TestMath {
    /**
     * 构造函数
     * @param {Object} options - 配置选项
     * @param {THREE.Scene} options.scene - Three.js场景
     * @param {THREE.Camera} options.camera - Three.js相机
     * @param {THREE.WebGLRenderer} options.renderer - Three.js渲染器
     * @param {Object} [options.rgbTerrain] - RGB地形实例（可选）
     */
    constructor(options) {
        this.scene = options.scene;
        this.camera = options.camera;
        this.renderer = options.renderer;
        this.rgbTerrain = options.rgbTerrain || null;
        this.mathProj = getMathProj();
        this.markerManager = new MarkerManager(this.scene);
        this.isPickingEnabled = false;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.pickableObjects = [];
        this.pickCallbacks = [];
        
        // 初始化UI
        this.createDebugUI();
        
        // 初始化事件监听
        this.initEventListeners();
        
        console.log('TestMath 初始化完成');
    }
    
    /**
     * 设置可拾取对象
     * @param {THREE.Object3D[]} objects - 可拾取对象数组
     */
    setPickableObjects(objects) {
        this.pickableObjects = objects;
    }
    
    /**
     * 创建调试UI
     */
    createDebugUI() {
        // 创建UI容器
        const uiContainer = document.createElement('div');
        uiContainer.style.position = 'absolute';
        uiContainer.style.top = '10px';
        uiContainer.style.right = '10px';
        uiContainer.style.width = '300px';
        uiContainer.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
        uiContainer.style.border = '1px solid #ccc';
        uiContainer.style.borderRadius = '5px';
        uiContainer.style.padding = '15px';
        uiContainer.style.fontFamily = 'Arial, sans-serif';
        uiContainer.style.fontSize = '12px';
        uiContainer.style.zIndex = '1000';
        uiContainer.innerHTML = `
            <h3 style="margin-top: 0;">坐标转换调试工具</h3>
            
            <!-- 地形渲染控制 -->
            <div style="margin-bottom: 15px;">
                <h4 style="margin: 10px 0;">0. 地形渲染控制</h4>
                <button id="toggle-terrain-render" style="padding: 5px 10px; margin-right: 10px;">关闭地形渲染</button>
                <span id="terrain-render-status" style="color: red;">地形渲染已开启</span>
            </div>
            
            <!-- 拾取控制 -->
            <div style="margin-bottom: 15px;">
                <h4 style="margin: 10px 0;">1. 坐标拾取</h4>
                <button id="toggle-picking" style="padding: 5px 10px; margin-right: 10px;">开启拾取</button>
                <span id="picking-status" style="color: red;">拾取已关闭</span>
            </div>
            
            <!-- 拾取结果显示 -->
            <div style="margin-bottom: 15px;">
                <h4 style="margin: 10px 0;">2. 拾取结果</h4>
                <div id="pick-results" style="background: #f0f0f0; padding: 10px; border-radius: 3px;">
                    <p>点击地图开始拾取...</p>
                </div>
            </div>
            
            <!-- 反向转换 -->
            <div style="margin-bottom: 15px;">
                <h4 style="margin: 10px 0;">3. 反向转换</h4>
                <div style="margin-bottom: 10px;">
                    <label>经度：</label>
                    <input type="number" id="lon-input" step="0.000001" placeholder="输入经度" style="width: 150px; margin-right: 5px;">
                </div>
                <div style="margin-bottom: 10px;">
                    <label>纬度：</label>
                    <input type="number" id="lat-input" step="0.000001" placeholder="输入纬度" style="width: 150px; margin-right: 5px;">
                </div>
                <div style="margin-bottom: 10px;">
                    <label>高程：</label>
                    <input type="number" id="elevation-input" step="0.1" placeholder="输入高程" style="width: 150px; margin-right: 5px;">
                </div>
                <div style="margin-bottom: 10px;">
                    <label>
                        <input type="checkbox" id="snap-to-ground" style="margin-right: 5px;">
                        贴地（覆盖用户高程）
                    </label>
                </div>
                <button id="convert-btn" style="padding: 5px 10px; margin-right: 5px;">转换并标记</button>
                <button id="clear-markers" style="padding: 5px 10px;">清除所有标记</button>
            </div>
            
            <!-- 转换结果显示 -->
            <div style="margin-bottom: 15px;">
                <h4 style="margin: 10px 0;">4. 转换结果</h4>
                <div id="convert-results" style="background: #f0f0f0; padding: 10px; border-radius: 3px;">
                    <p>输入经纬度进行转换...</p>
                </div>
            </div>
            
            <!-- 高程查询 -->
            <div style="margin-bottom: 15px;">
                <h4 style="margin: 10px 0;">5. 高程查询</h4>
                <div style="margin-bottom: 10px;">
                    <label>查询类型：</label>
                    <select id="elevation-query-type" style="margin-right: 10px;">
                        <option value="three">Three.js坐标</option>
                        <option value="lonlat">经纬度</option>
                        <option value="mercator">墨卡托坐标</option>
                    </select>
                </div>
                
                <!-- Three.js坐标输入 -->
                <div id="three-input" style="margin-bottom: 10px;">
                    <label>X：</label>
                    <input type="number" id="three-x" step="0.1" placeholder="输入X坐标" style="width: 100px; margin-right: 5px;">
                    <label>Z：</label>
                    <input type="number" id="three-z" step="0.1" placeholder="输入Z坐标" style="width: 100px; margin-right: 5px;">
                </div>
                
                <!-- 经纬度输入 -->
                <div id="lonlat-input" style="margin-bottom: 10px; display: none;">
                    <label>经度：</label>
                    <input type="number" id="query-lon" step="0.000001" placeholder="输入经度" style="width: 100px; margin-right: 5px;">
                    <label>纬度：</label>
                    <input type="number" id="query-lat" step="0.000001" placeholder="输入纬度" style="width: 100px; margin-right: 5px;">
                </div>
                
                <!-- 墨卡托坐标输入 -->
                <div id="mercator-input" style="margin-bottom: 10px; display: none;">
                    <label>X：</label>
                    <input type="number" id="mercator-x" step="0.1" placeholder="输入墨卡托X" style="width: 100px; margin-right: 5px;">
                    <label>Y：</label>
                    <input type="number" id="mercator-y" step="0.1" placeholder="输入墨卡托Y" style="width: 100px; margin-right: 5px;">
                </div>
                
                <button id="query-elevation" style="padding: 5px 10px; margin-right: 5px;">查询高程</button>
                <div id="elevation-result" style="margin-top: 10px; background: #f0f0f0; padding: 10px; border-radius: 3px;">
                    <p>点击"查询高程"开始查询...</p>
                </div>
            </div>
        `;
        
        document.body.appendChild(uiContainer);
        
        // 绑定事件
        this.bindUIEvents();
    }
    
    /**
     * 绑定UI事件
     */
    bindUIEvents() {
        // 拾取切换按钮
        document.getElementById('toggle-picking').addEventListener('click', () => {
            this.isPickingEnabled = !this.isPickingEnabled;
            const btn = document.getElementById('toggle-picking');
            const status = document.getElementById('picking-status');
            
            if (this.isPickingEnabled) {
                btn.textContent = '关闭拾取';
                status.textContent = '拾取已开启';
                status.style.color = 'green';
            } else {
                btn.textContent = '开启拾取';
                status.textContent = '拾取已关闭';
                status.style.color = 'red';
            }
        });
        
        // 转换按钮
        document.getElementById('convert-btn').addEventListener('click', () => {
            this.convertAndMark();
        });
        
        // 清除标记按钮
        document.getElementById('clear-markers').addEventListener('click', () => {
            this.markerManager.clearAllMarkers();
            this.updateConvertResults('已清除所有标记');
        });
        
        // 回车事件
        document.getElementById('lon-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.convertAndMark();
            }
        });
        
        document.getElementById('lat-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.convertAndMark();
            }
        });
        
        document.getElementById('elevation-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.convertAndMark();
            }
        });
        
        // 高程查询类型切换
        document.getElementById('elevation-query-type').addEventListener('change', (e) => {
            const queryType = e.target.value;
            
            // 隐藏所有输入框
            document.getElementById('three-input').style.display = 'none';
            document.getElementById('lonlat-input').style.display = 'none';
            document.getElementById('mercator-input').style.display = 'none';
            
            // 显示选中的输入框
            if (queryType === 'three') {
                document.getElementById('three-input').style.display = 'block';
            } else if (queryType === 'lonlat') {
                document.getElementById('lonlat-input').style.display = 'block';
            } else if (queryType === 'mercator') {
                document.getElementById('mercator-input').style.display = 'block';
            }
        });
        
        // 高程查询按钮
        document.getElementById('query-elevation').addEventListener('click', () => {
            this.queryElevation();
        });
        
        // 高程查询回车事件
        document.getElementById('three-x').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.queryElevation();
            }
        });
        
        document.getElementById('three-z').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.queryElevation();
            }
        });
        
        document.getElementById('query-lon').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.queryElevation();
            }
        });
        
        document.getElementById('query-lat').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.queryElevation();
            }
        });
        
        document.getElementById('mercator-x').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.queryElevation();
            }
        });
        
        document.getElementById('mercator-y').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.queryElevation();
            }
        });
        
        // 地形渲染开关事件
        document.getElementById('toggle-terrain-render').addEventListener('click', () => {
            if (!this.rgbTerrain) {
                this.updateElevationResult('未找到地形实例');
                return;
            }
            
            // 切换地形渲染状态
            const currentRenderState = this.rgbTerrain.isRenderingTerrain();
            this.rgbTerrain.setRenderTerrain(!currentRenderState);
            
            // 更新UI
            const btn = document.getElementById('toggle-terrain-render');
            const status = document.getElementById('terrain-render-status');
            
            if (!currentRenderState) {
                btn.textContent = '关闭地形渲染';
                status.textContent = '地形渲染已开启';
                status.style.color = 'red';
            } else {
                btn.textContent = '开启地形渲染';
                status.textContent = '地形渲染已关闭';
                status.style.color = 'green';
            }
        });
    }
    
    /**
     * 初始化事件监听器
     */
    initEventListeners() {
        // 鼠标点击事件
        this.renderer.domElement.addEventListener('click', (event) => {
            this.handleMouseClick(event);
        });
        
        // 窗口大小变化事件
        window.addEventListener('resize', () => {
            // 不需要额外处理，因为Three.js渲染器会处理
        });
    }
    
    /**
     * 处理鼠标点击事件
     * @param {MouseEvent} event - 鼠标事件
     */
    handleMouseClick(event) {
        if (!this.isPickingEnabled) return;
        
        // 计算鼠标在标准化设备坐标中的位置
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        // 更新射线
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        // 优先检测地形对象，确保拾取点在地形表面
        let terrainIntersect = null;
        if (this.rgbTerrain) {
            const terrainMeshes = Array.from(this.rgbTerrain.loadedTerrainTiles.values());
            const terrainIntersects = this.raycaster.intersectObjects(terrainMeshes, true);
            if (terrainIntersects.length > 0) {
                terrainIntersect = terrainIntersects[0];
            }
        }
        
        // 如果没有击中地形，再检测其他对象
        const intersect = terrainIntersect || this.raycaster.intersectObjects(this.scene.children, true)[0];
        
        if (intersect) {
            // 直接使用射线检测返回的点，这已经是地形表面的准确位置
            let threePosition = intersect.point;
            
            // 转换坐标
            const mercator = this.mathProj.threeToMercator(threePosition);
            const lonLat = this.mathProj.threeToLonLat(threePosition);
            
            // 创建标记点
            const markerId = this.markerManager.createMarker({
                x: threePosition.x,
                y: threePosition.y,
                z: threePosition.z,
                color: 0x00ff00,
                label: `拾取点 ${this.markerManager.getMarkerCount()}`
            });
            
            // 更新UI显示
            this.updatePickResults({
                three: threePosition,
                mercator: mercator,
                lonLat: lonLat
            });
            
            console.log('拾取结果：', {
                three: threePosition,
                mercator: mercator,
                lonLat: lonLat
            });
            
            // 调用所有拾取回调函数
            this.pickCallbacks.forEach(callback => {
                callback({
                    three: threePosition,
                    mercator: mercator,
                    lonLat: lonLat
                });
            });
        } else {
            console.log('未拾取到任何物体');
        }
    }
    
    /**
     * 转换经纬度并标记
     */
    convertAndMark() {
        // 获取输入值
        const lon = parseFloat(document.getElementById('lon-input').value);
        const lat = parseFloat(document.getElementById('lat-input').value);
        const userElevation = parseFloat(document.getElementById('elevation-input').value);
        const snapToGround = document.getElementById('snap-to-ground').checked;
        
        // 验证输入
        if (isNaN(lon) || isNaN(lat)) {
            this.updateConvertResults('请输入有效的经纬度');
            return;
        }
        
        // 判断是否需要贴地
        // 规则：1. 如果用户勾选了贴地选项，强制贴地；2. 如果用户没有输入高程，强制贴地；否则使用用户输入的高程
        let elevation = userElevation;
        let shouldSnapToGround = snapToGround || isNaN(elevation);
        
        // 转换坐标
        let threePosition = this.mathProj.lonLatToThree(lon, lat, elevation || 0);
        
        // 如果需要贴地，使用真实高程替换标记点的y值
        if (shouldSnapToGround && this.rgbTerrain) {
            const realElevation = this.rgbTerrain.getElevationAtLonLat(lon, lat);
            if (realElevation !== null) {
                elevation = realElevation;
                // 更新Three.js坐标的y值为真实高程
                threePosition = this.mathProj.lonLatToThree(lon, lat, elevation);
            }
        }
        
        const mercator = this.mathProj.lonLatToMercator(lon, lat);
        
        // 创建标记点
        const markerId = this.markerManager.createMarker({
            x: threePosition.x,
            y: threePosition.y,
            z: threePosition.z,
            color: 0xff00ff,
            label: `转换点 ${this.markerManager.getMarkerCount()}`
        });
        
        // 更新UI显示
        this.updateConvertResults({
            three: threePosition,
            mercator: mercator,
            lonLat: { lon, lat, elevation }
        });
        
        console.log('转换结果：', {
            three: threePosition,
            mercator: mercator,
            lonLat: { lon, lat, elevation },
            snapToGround: shouldSnapToGround
        });
    }
    
    /**
     * 更新拾取结果显示
     * @param {Object} results - 拾取结果
     * @param {THREE.Vector3} results.three - Three.js坐标
     * @param {Object} results.mercator - Web墨卡托坐标
     * @param {Object} results.lonLat - 经纬度坐标
     */
    updatePickResults(results) {
        const container = document.getElementById('pick-results');
        container.innerHTML = `
            <div style="margin-bottom: 5px;"><strong>Three.js坐标：</strong></div>
            <div>X: ${results.three.x.toFixed(2)}</div>
            <div>Y: ${results.three.y.toFixed(2)}</div>
            <div>Z: ${results.three.z.toFixed(2)}</div>
            <div style="margin: 10px 0;"><strong>Web墨卡托坐标：</strong></div>
            <div>X: ${results.mercator.x.toFixed(2)}</div>
            <div>Y: ${results.mercator.y.toFixed(2)}</div>
            <div style="margin: 10px 0;"><strong>经纬度：</strong></div>
            <div>经度: ${results.lonLat.lon.toFixed(6)}</div>
            <div>纬度: ${results.lonLat.lat.toFixed(6)}</div>
            <div>高程: ${results.lonLat.elevation.toFixed(2)}</div>
        `;
    }
    
    /**
     * 处理高程查询
     */
    queryElevation() {
        if (!this.rgbTerrain) {
            this.updateElevationResult('未找到地形实例，请确保已加载地形瓦片');
            return;
        }
        
        const queryType = document.getElementById('elevation-query-type').value;
        let elevation = null;
        let queryPoint = null;
        
        try {
            switch (queryType) {
                case 'three':
                    // Three.js坐标查询
                    const threeX = parseFloat(document.getElementById('three-x').value);
                    const threeZ = parseFloat(document.getElementById('three-z').value);
                    if (isNaN(threeX) || isNaN(threeZ)) {
                        throw new Error('请输入有效的Three.js坐标');
                    }
                    elevation = this.rgbTerrain.getElevationAtThreePosition(threeX, threeZ);
                    queryPoint = { type: 'three', x: threeX, z: threeZ };
                    break;
                    
                case 'lonlat':
                    // 经纬度查询
                    const lon = parseFloat(document.getElementById('query-lon').value);
                    const lat = parseFloat(document.getElementById('query-lat').value);
                    if (isNaN(lon) || isNaN(lat)) {
                        throw new Error('请输入有效的经纬度');
                    }
                    elevation = this.rgbTerrain.getElevationAtLonLat(lon, lat);
                    queryPoint = { type: 'lonlat', lon: lon, lat: lat };
                    break;
                    
                case 'mercator':
                    // 墨卡托坐标查询
                    const mercatorX = parseFloat(document.getElementById('mercator-x').value);
                    const mercatorY = parseFloat(document.getElementById('mercator-y').value);
                    if (isNaN(mercatorX) || isNaN(mercatorY)) {
                        throw new Error('请输入有效的墨卡托坐标');
                    }
                    elevation = this.rgbTerrain.getElevationAtMercator(mercatorX, mercatorY);
                    queryPoint = { type: 'mercator', x: mercatorX, y: mercatorY };
                    break;
                    
                default:
                    throw new Error('未知的查询类型');
            }
            
            // 更新查询结果
            this.updateElevationResult(elevation, queryPoint);
            
        } catch (error) {
            this.updateElevationResult(error.message);
        }
    }

    /**
     * 更新转换结果显示
     * @param {Object|string} results - 转换结果或消息
     * @param {THREE.Vector3} [results.three] - Three.js坐标
     * @param {Object} [results.mercator] - Web墨卡托坐标
     * @param {Object} [results.lonLat] - 经纬度坐标
     */
    updateConvertResults(results) {
        const container = document.getElementById('convert-results');
        
        if (typeof results === 'string') {
            container.innerHTML = `<p>${results}</p>`;
            return;
        }
        
        container.innerHTML = `
            <div style="margin-bottom: 5px;"><strong>Three.js坐标：</strong></div>
            <div>X: ${results.three.x.toFixed(2)}</div>
            <div>Y: ${results.three.y.toFixed(2)}</div>
            <div>Z: ${results.three.z.toFixed(2)}</div>
            <div style="margin: 10px 0;"><strong>Web墨卡托坐标：</strong></div>
            <div>X: ${results.mercator.x.toFixed(2)}</div>
            <div>Y: ${results.mercator.y.toFixed(2)}</div>
            <div style="margin: 10px 0;"><strong>经纬度：</strong></div>
            <div>经度: ${results.lonLat.lon.toFixed(6)}</div>
            <div>纬度: ${results.lonLat.lat.toFixed(6)}</div>
            <div>高程: ${results.lonLat.elevation.toFixed(2)}</div>
        `;
    }
    
    /**
     * 更新高程查询结果显示
     * @param {number|null|string} elevation - 高程值，查询失败返回null，错误消息返回字符串
     * @param {Object} [queryPoint] - 查询点信息
     */
    updateElevationResult(elevation, queryPoint = null) {
        const container = document.getElementById('elevation-result');
        
        if (typeof elevation === 'string') {
            // 错误消息
            container.innerHTML = `<p style="color: red;">${elevation}</p>`;
            return;
        }
        
        if (elevation === null) {
            // 查询失败
            container.innerHTML = '<p style="color: red;">未找到该点的高程数据</p>';
            return;
        }
        
        // 查询成功，显示结果
        let queryInfo = '';
        if (queryPoint) {
            if (queryPoint.type === 'three') {
                queryInfo = `查询点：Three.js坐标 (X: ${queryPoint.x.toFixed(2)}, Z: ${queryPoint.z.toFixed(2)})`;
            } else if (queryPoint.type === 'lonlat') {
                queryInfo = `查询点：经纬度 (${queryPoint.lon.toFixed(6)}, ${queryPoint.lat.toFixed(6)})`;
            } else if (queryPoint.type === 'mercator') {
                queryInfo = `查询点：墨卡托坐标 (X: ${queryPoint.x.toFixed(2)}, Y: ${queryPoint.y.toFixed(2)})`;
            }
        }
        
        container.innerHTML = `
            <div style="margin-bottom: 5px;">${queryInfo}</div>
            <div style="margin-bottom: 5px;"><strong>高程：</strong></div>
            <div style="font-size: 18px; font-weight: bold;">${elevation.toFixed(2)} 米</div>
        `;
    }
    
    /**
     * 添加拾取回调函数
     * @param {Function} callback - 回调函数
     */
    addPickCallback(callback) {
        this.pickCallbacks.push(callback);
    }
    
    /**
     * 移除拾取回调函数
     * @param {Function} callback - 回调函数
     */
    removePickCallback(callback) {
        this.pickCallbacks = this.pickCallbacks.filter(cb => cb !== callback);
    }
    
    /**
     * 销毁测试工具
     */
    dispose() {
        // 清除所有标记
        this.markerManager.clearAllMarkers();
        
        // 移除事件监听
        this.renderer.domElement.removeEventListener('click', this.handleMouseClick);
        
        // 移除UI
        const uiContainer = document.querySelector('div[style*="position: absolute"]');
        if (uiContainer) {
            document.body.removeChild(uiContainer);
        }
        
        console.log('TestMath 已销毁');
    }
}
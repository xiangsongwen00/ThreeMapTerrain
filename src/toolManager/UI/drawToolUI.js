import * as THREE from 'three';
import { drawToolHTML } from './html/drawToolHTML.js';
import { drawToolStyles } from './style/drawToolStyles.js';
import { DrawTool } from '../../drawTool/DrawTool.js';

/**
 * 绘制工具UI类
 * 负责绘制工具的UI设计与功能实现
 */
export class DrawToolUI {
    /**
     * 构造函数
     * @param {Object} options - 配置选项
     * @param {THREE.Scene} options.scene - Three.js场景
     * @param {THREE.Camera} options.camera - Three.js相机
     * @param {THREE.WebGLRenderer} options.renderer - Three.js渲染器
     * @param {Object} options.mathProj - 坐标转换工具
     * @param {Object} options.rgbTerrain - RGB地形实例
     */
    constructor(options) {
        this.options = {
            scene: null,
            camera: null,
            renderer: null,
            mathProj: null,
            rgbTerrain: null,
            markerManager: null,
            ...options
        };

        this.container = null;
        this.isInitialized = false;

        // 射线拾取相关
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.isDrawing = false;
        this.currentDrawMode = 'point';
        this.isGroundDrawing = true; // 贴地选项默认勾上
        this.drawColor = '#d59595'; // 默认绘制颜色
        this.drawOpacity = 1; // 默认透明度
        this.pickedPoints = [];
        
        // 历史记录管理
        this.drawingHistory = []; // 存储绘制历史
        this.historyIndex = -1; // 当前历史记录索引
        
        // 防抖相关
        this.clickTimeout = null;
        this.debounceDelay = 200; // 防抖延迟时间，单位毫秒

        // 保存传递的依赖
        this.scene = this.options.scene;
        this.camera = this.options.camera;
        this.renderer = this.options.renderer;
        this.mathProj = this.options.mathProj;
        this.rgbTerrain = this.options.rgbTerrain;
        this.markerManager = this.options.markerManager;

        this.drawTool = new DrawTool({
            scene: this.scene,
            rgbTerrain: this.rgbTerrain,
            markerManager: this.markerManager
        });
        // Ensure a valid marker manager exists for later updates
        this.markerManager = this.drawTool.markerManager;
        
        // 创建固定的事件处理函数引用，确保事件可以被正确移除
        this.onMouseClickHandler = this.onMouseClick.bind(this);
        this.onDoubleClickHandler = this.onDoubleClick.bind(this);
    }

    /**
     * 初始化UI
     * @param {HTMLElement} container - UI容器元素
     */
    init(container) {
        this.container = container;
        this.render();
    }

    /**
     * 渲染UI
     */
    render() {
        if (!this.container) return;
        
        this.container.innerHTML = drawToolHTML;
        this.addStyles();
        this.bindEvents();
        this.updateUI();
    }

    /**
     * 添加样式
     */
    addStyles() {
        if (document.getElementById('draw-tool-ui-styles')) return;

        const style = document.createElement('style');
        style.id = 'draw-tool-ui-styles';
        style.textContent = drawToolStyles;

        document.head.appendChild(style);
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 绘制模式切换
        const drawModeRadios = document.querySelectorAll('input[name="drawMode"]');
        drawModeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                // 切换绘制模式前，先结束当前绘制状态
                this.endDrawing();
                
                // 更新当前绘制模式
                this.currentDrawMode = e.target.value;
                
                // 清除绘制状态
                this.clearDrawing();
                
                // 强行开启新模式的绘制
                this.startDrawing();
            });
        });

        // 贴地绘制选项
        const isGroundDrawingCheckbox = document.getElementById('isGroundDrawing');
        if (isGroundDrawingCheckbox) {
            isGroundDrawingCheckbox.addEventListener('change', (e) => {
                this.isGroundDrawing = e.target.checked;
            });
        }
        
        // 绘制颜色选择器
        const colorPicker = document.getElementById('drawColor');
        const colorTextInput = document.getElementById('drawColorInput');
        
        // 颜色选择器事件
        if (colorPicker) {
            colorPicker.addEventListener('input', (e) => {
                const color = e.target.value;
                this.drawColor = color;
                // 同步到文本输入框
                if (colorTextInput) {
                    colorTextInput.value = color;
                }
            });
        }
        
        // 颜色文本输入事件
        if (colorTextInput) {
            colorTextInput.addEventListener('input', (e) => {
                const colorText = e.target.value;
                // 验证并转换颜色值
                const validColor = this.parseColor(colorText);
                if (validColor) {
                    this.drawColor = validColor;
                    // 同步到颜色选择器
                    if (colorPicker) {
                        colorPicker.value = validColor;
                    }
                }
            });
            
            // 回车确认输入
            colorTextInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const colorText = e.target.value;
                    const validColor = this.parseColor(colorText);
                    if (validColor) {
                        this.drawColor = validColor;
                        // 同步到颜色选择器
                        if (colorPicker) {
                            colorPicker.value = validColor;
                        }
                    } else {
                        // 输入无效，恢复之前的颜色值
                        e.target.value = this.drawColor;
                    }
                }
            });
        }
        
        // 透明度滑块和输入框
        const opacitySlider = document.getElementById('drawOpacitySlider');
        const opacityInput = document.getElementById('drawOpacityInput');
        
        // 透明度滑块事件
        if (opacitySlider) {
            opacitySlider.addEventListener('input', (e) => {
                const opacity = parseFloat(e.target.value);
                this.drawOpacity = opacity;
                // 同步到输入框
                if (opacityInput) {
                    opacityInput.value = opacity;
                }
            });
        }
        
        // 透明度输入框事件
        if (opacityInput) {
            opacityInput.addEventListener('input', (e) => {
                let opacity = parseFloat(e.target.value);
                // 确保透明度在有效范围内
                opacity = Math.max(0, Math.min(1, opacity));
                this.drawOpacity = opacity;
                // 同步到滑块
                if (opacitySlider) {
                    opacitySlider.value = opacity;
                }
            });
        }

        // 开始绘制按钮
        const startDrawBtn = document.getElementById('startDrawBtn');
        if (startDrawBtn) {
            startDrawBtn.addEventListener('click', () => {
                this.startDrawing();
            });
        }
        
        // 结束绘制按钮
        const endDrawBtn = document.getElementById('endDrawBtn');
        if (endDrawBtn) {
            endDrawBtn.addEventListener('click', () => {
                this.endDrawing();
            });
        }
        
        // 撤销按钮
        const undoBtn = document.getElementById('undoBtn');
        if (undoBtn) {
            undoBtn.addEventListener('click', () => {
                this.undoDrawing();
            });
        }
        
        // 清除按钮
        const clearDrawBtn = document.getElementById('clearDrawBtn');
        if (clearDrawBtn) {
            clearDrawBtn.addEventListener('click', () => {
                this.clearDrawing();
            });
        }
    }

    /**
     * 绑定射线拾取事件
     */
    bindPickingEvents() {
        if (!this.renderer) return;

        // 绑定鼠标点击事件
        this.renderer.domElement.addEventListener('click', this.onMouseClickHandler);
        // 绑定鼠标双击事件，用于结束线和面绘制
        this.renderer.domElement.addEventListener('dblclick', this.onDoubleClickHandler);
    }

    /**
     * 解绑射线拾取事件
     */
    unbindPickingEvents() {
        if (!this.renderer) return;

        // 解绑鼠标点击事件
        this.renderer.domElement.removeEventListener('click', this.onMouseClickHandler);
        // 解绑鼠标双击事件
        this.renderer.domElement.removeEventListener('dblclick', this.onDoubleClickHandler);
    }

    /**
     * 开始绘制
     */
    startDrawing() {
        // 重置绘制状态
        this.isDrawing = true;
        
        // 清除之前的所有绘制对象
        this.drawTool.clearAll();
        
        // 重置UI层状态
        this.pickedPoints = [];
        this.drawingHistory = [];
        this.historyIndex = -1;
        
        // 绑定事件
        this.bindPickingEvents();
        
        // 更新UI
        this.updateUI();
    }

    /**
     * 结束绘制
     */
    endDrawing() {
        this.isDrawing = false;
        this.unbindPickingEvents();
        
        // 面绘制：结束时一次性生成最终面
        if (this.currentDrawMode === 'area' && this.pickedPoints.length >= 3) {
            this.drawTool.clearAreas();
            const baseOpts = {
                color: this.hexToThreeColor(this.drawColor),
                transparent: this.drawOpacity < 1,
                opacity: this.drawOpacity,
                side: THREE.DoubleSide
            };
            if (this.isGroundDrawing) {
                this.drawTool.drawGroundArea(this.pickedPoints, {
                    ...baseOpts,
                    updateGroundGeometry: true
                });
            } else {
                this.drawTool.drawArea(this.pickedPoints, baseOpts);
            }
        }
        
        this.updateUI();
    }

    /**
     * 保存当前绘制状态到历史记录
     */
    saveToHistory() {
        // 保存当前拾取点列表的副本
        const currentState = {
            pickedPoints: this.pickedPoints.map(p => p.clone()),
            drawObjects: this.drawTool.getAllObjects()
        };
        
        // 如果当前不是在历史记录的最新位置，删除之后的历史记录
        // 当historyIndex为-1时，表示没有历史记录，直接添加
        if (this.historyIndex >= 0 && this.historyIndex < this.drawingHistory.length - 1) {
            this.drawingHistory = this.drawingHistory.slice(0, this.historyIndex + 1);
        }
        
        // 添加当前状态到历史记录
        this.drawingHistory.push(currentState);
        this.historyIndex = this.drawingHistory.length - 1;
        
        // 限制历史记录长度，最多保存20步
        if (this.drawingHistory.length > 20) {
            this.drawingHistory.shift();
            this.historyIndex--;
        }
    }

    /**
     * 撤销绘制
     */
    undoDrawing() {
        if (this.historyIndex >= 0) {
            // 如果没有历史记录或者已经在最开始的状态，不执行撤销
            if (this.drawingHistory.length === 0) {
                return;
            }
            
            // 回退到上一步
            this.historyIndex--;
            
            // 如果已经回退到最开始，清除所有绘制
            if (this.historyIndex < 0) {
                // 清除所有绘制对象
                this.drawTool.clearAll();
                // 清除拾取点
                this.pickedPoints = [];
            } else {
                // 恢复上一步的状态
                const previousState = this.drawingHistory[this.historyIndex];
                
                // 清除当前绘制
                this.drawTool.clearAll();
                
                // 恢复拾取点
                this.pickedPoints = previousState.pickedPoints.map(p => p.clone());
                
                // 重新绘制所有对象
                this.redrawFromHistory(previousState);
            }
            
            this.updateUI();
        }
    }

    /**
     * 从历史记录重新绘制
     * @param {Object} historyState - 历史记录状态
     */
    redrawFromHistory(historyState) {
        // 这里简化处理，实际应用中可能需要更复杂的恢复逻辑
        // 例如，需要重新绘制所有点、线、面
        // 目前我们只是重新开始绘制流程
        this.pickedPoints = historyState.pickedPoints.map(p => p.clone());
        
        // 根据当前绘制模式重新绘制
        if (this.pickedPoints.length > 0) {
            switch (this.currentDrawMode) {
                case 'point':
                    // 重新绘制所有点
                    this.pickedPoints.forEach((point, index) => {
                        this.drawTool.drawPoint(point, {
                            label: `P${index + 1}`,
                            color: this.hexToThreeColor(this.drawColor)
                        });
                    });
                    break;
                case 'line':
                    // 重新绘制线
                    if (this.pickedPoints.length >= 2) {
                        this.drawLine();
                    }
                    break;
                case 'area':
                    // 重新绘制面
                    if (this.pickedPoints.length >= 3) {
                        this.drawArea();
                    }
                    break;
            }
        }
    }

    /**
     * 清除绘制
     */
    clearDrawing() {
        // 使用drawTool清除所有绘制对象
        this.drawTool.clearAll();
        
        // 清除拾取点
        this.pickedPoints = [];
        
        // 清空历史记录
        this.drawingHistory = [];
        this.historyIndex = -1;
        
        this.updateUI();
    }

    /**
     * 处理鼠标点击事件，实现射线拾取
     * @param {Event} event - 鼠标点击事件
     */
    onMouseClick(event) {
        if (!this.isDrawing) return;
        
        // 防抖处理，避免频繁点击
        if (this.clickTimeout) {
            clearTimeout(this.clickTimeout);
        }
        
        this.clickTimeout = setTimeout(() => {
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

            // 找到第一个与场景对象相交的点（非标记，非辅助对象）
            let intersectPoint = null;
            for (const intersect of intersects) {
                if (intersect.object.isMesh &&
                    !intersect.object.name.startsWith('marker') &&
                    !intersect.object.name.startsWith('line') &&
                    !intersect.object.name.startsWith('axis')) {
                    const isTerrainMesh = intersect.object.material && intersect.object.material.isShaderMaterial && intersect.object.material.uniforms && typeof intersect.object.material.uniforms.u_rgb !== 'undefined';
                    if (isTerrainMesh) {
                        // 如果命中的是地形网格，优先使用 terrainHit
                        intersectPoint = terrainHit || intersect.point;
                    } else {
                        intersectPoint = intersect.point;
                    }
                    break;
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
            this.handlePickedPoint(intersectPoint);
        }, this.debounceDelay);
    }

    /**
     * 处理鼠标双击事件，结束线和面绘制
     * @param {Event} event - 鼠标双击事件
     */
    onDoubleClick(event) {
        if (!this.isDrawing) return;
        
        // 只有在线和面绘制模式下才需要双击结束绘制
        if (this.currentDrawMode === 'line' || this.currentDrawMode === 'area') {
            // 结束绘制
            this.endDrawing();
        }
    }

    /**
     * 处理拾取到的点
     * @param {THREE.Vector3} point - 拾取到的Three.js坐标点
     */
    handlePickedPoint(point) {
        if (!point || !this.mathProj) return;

        // 获取贴地坐标（如果需要）
        let finalPoint = point.clone();
        if (this.isGroundDrawing && this.rgbTerrain) {
            const elevation = this.rgbTerrain.getElevationAtThreePosition(point.x, point.z);
            if (elevation !== undefined) {
                finalPoint.y = elevation;
            }
        }

        // 添加到拾取点列表
        this.pickedPoints.push(finalPoint);

        // 根据绘制模式绘制
        this.drawAccordingToMode();
        
        // 保存当前状态到历史记录
        this.saveToHistory();
        
        this.updateUI();
    }

    /**
     * 根据绘制模式绘制
     * @param {boolean} isUpdate - 是否为更新操作，避免无限循环
     */
    drawAccordingToMode(isUpdate = false) {
        switch (this.currentDrawMode) {
            case 'point':
                this.drawPoint();
                break;
            case 'line':
                if (isUpdate) {
                    // 直接绘制线，不调用drawLine，避免无限循环
                    this._drawLineDirectly();
                } else {
                    this.drawLine();
                }
                break;
            case 'area':
                // 新策略：面绘制过程中只显示点（不做实时面更新），双击/结束绘制后再一次性生成最终面。
                if (this.isDrawing) {
                    if (!isUpdate) this.drawPoint();
                } else {
                    if (isUpdate) {
                        // 直接绘制最终面（用于撤销/重做后恢复）
                        this._drawAreaDirectly();
                    } else {
                        this.drawArea();
                    }
                }
                break;
            default:
                break;
        }
    }
    
    /**
     * 直接绘制线，不更新点标记，避免无限循环
     */
    _drawLineDirectly() {
        if (this.pickedPoints.length < 2) return;
        
        const threeColor = this.hexToThreeColor(this.drawColor);
        
        if (this.isGroundDrawing) {
            this.drawTool.drawGroundLine(this.pickedPoints, {
                color: threeColor,
                linewidth: 2,
                transparent: this.drawOpacity < 1,
                opacity: this.drawOpacity
            });
        } else {
            this.drawTool.drawLine(this.pickedPoints, {
                color: threeColor,
                linewidth: 2,
                transparent: this.drawOpacity < 1,
                opacity: this.drawOpacity
            });
        }
    }
    
    /**
     * 直接绘制面，不更新点标记，避免无限循环
     */
    _drawAreaDirectly() {
        if (this.pickedPoints.length < 3) return;
        
        const threeColor = this.hexToThreeColor(this.drawColor);
        
        if (this.isGroundDrawing) {
            this.drawTool.drawGroundArea(this.pickedPoints, {
                color: threeColor,
                transparent: this.drawOpacity < 1,
                opacity: this.drawOpacity,
                side: THREE.DoubleSide,
                updateGroundGeometry: true
            });
        } else {
            this.drawTool.drawArea(this.pickedPoints, {
                color: threeColor,
                transparent: this.drawOpacity < 1,
                opacity: this.drawOpacity,
                side: THREE.DoubleSide
            });
        }
    }

    /**
     * 解析颜色字符串，转换为标准的十六进制颜色格式
     * 支持：#ff0000, #f00, ff0000, f00, rgb(255,0,0), rgb(100%,0%,0%)
     * @param {string} colorText - 颜色文本
     * @returns {string|null} 标准的十六进制颜色格式，如 #ff0000，无效返回null
     */
    parseColor(colorText) {
        if (!colorText) return null;
        
        // 移除前后空格
        colorText = colorText.trim();
        
        // 处理十六进制颜色
        const hexRegex = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
        const match = colorText.match(hexRegex);
        if (match) {
            let hex = match[1];
            if (hex.length === 3) {
                // 扩展三位颜色 #f00 -> #ff0000
                hex = hex.split('').map(c => c + c).join('');
            }
            return `#${hex}`;
        }
        
        // 处理RGB颜色
        const rgbRegex = /^rgb\(\s*(\d+|\d+\.\d+%)\s*,\s*(\d+|\d+\.\d+%)\s*,\s*(\d+|\d+\.\d+%)\s*\)$/;
        const rgbMatch = colorText.match(rgbRegex);
        if (rgbMatch) {
            const [, r, g, b] = rgbMatch;
            
            // 转换为0-255范围的整数
            const parseValue = (value) => {
                if (value.endsWith('%')) {
                    // 百分比值
                    return Math.round(parseFloat(value) * 2.55);
                } else {
                    // 整数值
                    return Math.round(parseFloat(value));
                }
            };
            
            const red = parseValue(r);
            const green = parseValue(g);
            const blue = parseValue(b);
            
            // 确保值在0-255范围内
            const clamp = (v) => Math.max(0, Math.min(255, v));
            
            // 转换为十六进制
            return `#${((1 << 24) + (clamp(red) << 16) + (clamp(green) << 8) + clamp(blue)).toString(16).slice(1).toLowerCase()}`;
        }
        
        return null;
    }

    /**
     * 将十六进制颜色字符串转换为Three.js颜色值
     * @param {string} hexColor - 十六进制颜色字符串，如 #ff0000
     * @returns {number} Three.js颜色值，如 0xff0000
     */
    hexToThreeColor(hexColor) {
        return parseInt(hexColor.replace('#', ''), 16);
    }

    /**
     * 绘制点
     */
    drawPoint() {
        // 绘制最后一个点
        const point = this.pickedPoints[this.pickedPoints.length - 1];
        const threeColor = this.hexToThreeColor(this.drawColor);
        const totalPoints = this.pickedPoints.length;
        let imgPath = '';
        
        // 根据绘制模式设置不同的图片
        switch (this.currentDrawMode) {
            case 'point':
                // 点模式：所有点采用同一张图片
                imgPath = './src/assest/img/pointImg/点.png';
                break;
            case 'line':
                // 线模式：只关注起点和终点
                if (totalPoints === 1) {
                    // 起点
                    imgPath = './src/assest/img/pointImg/起点.png';
                } else if (this.isDrawing) {
                    // 绘制中，只绘制起点，中间点不标记
                    return; // 中间点不标记，直接返回
                } else {
                    // 绘制结束，标记终点
                    imgPath = './src/assest/img/pointImg/终点.png';
                }
                break;
            case 'area':
                // 面模式：所有顶点保持同一个图标
                imgPath = './src/assest/img/pointImg/点.png';
                break;
            default:
                imgPath = './src/assest/img/pointImg/点.png';
        }
        
        if (this.isGroundDrawing) {
            this.drawTool.drawGroundPoint(point, {
                label: `P${totalPoints}`,
                color: threeColor,
                img: imgPath
            });
        } else {
            this.drawTool.drawPoint(point, {
                label: `P${totalPoints}`,
                color: threeColor,
                img: imgPath
            });
        }
    }

    /**
     * 更新所有点的标记，根据它们的位置（起点、终点或中间点）
     */
    updateAllPointMarkers({ drawFinalGeometry = true } = {}) {
        // 清除所有现有的点标记
        this.drawTool.clearAll();
        
        const threeColor = this.hexToThreeColor(this.drawColor);
        const totalPoints = this.pickedPoints.length;
        
        // 重新绘制所有点
        for (let i = 0; i < totalPoints; i++) {
            const point = this.pickedPoints[i];
            let imgPath = '';
            
            switch (this.currentDrawMode) {
                case 'point':
                    // 点模式：所有点采用同一张图片
                    imgPath = './src/assest/img/pointImg/点.png';
                    break;
                case 'line':
                    // 线模式：只关注起点和终点，中间点不标记
                    if (i === 0) {
                        // 起点
                        imgPath = './src/assest/img/pointImg/起点.png';
                    } else if (i === totalPoints - 1) {
                        // 终点
                        imgPath = './src/assest/img/pointImg/终点.png';
                    } else {
                        // 中间点不标记
                        continue;
                    }
                    break;
                case 'area':
                    // 面模式：所有顶点保持同一个图标
                    imgPath = './src/assest/img/pointImg/点.png';
                    break;
                default:
                    imgPath = './src/assest/img/pointImg/点.png';
            }
            
            if (this.isGroundDrawing) {
                this.drawTool.drawGroundPoint(point, {
                    label: `P${i + 1}`,
                    color: threeColor,
                    img: imgPath
                });
            } else {
                this.drawTool.drawPoint(point, {
                    label: `P${i + 1}`,
                    color: threeColor,
                    img: imgPath
                });
            }
        }
        
        // 重绘最终几何（线/面）。面在绘制过程中不做实时更新。
        if (!drawFinalGeometry) return;
        if (this.currentDrawMode === 'area' && this.isDrawing) return;
        this.drawAccordingToMode(true);
    }

    /**
     * 绘制线
     */
    drawLine() {
        const totalPoints = this.pickedPoints.length;
        
        // 如果只有一个点，只绘制起点标记
        if (totalPoints === 1) {
            // 直接绘制第一个点作为起点
            this.drawPoint();
        } else if (totalPoints >= 2) {
            // 有多个点，绘制线和标记
            this.updateAllPointMarkers();
        }
    }

    /**
     * 绘制面
     */
    drawArea() {
        // 面绘制：过程只显示点；结束后（或撤销/重做）才绘制最终面
        this.updateAllPointMarkers({ drawFinalGeometry: !this.isDrawing });
    }

    /**
     * 更新UI
     */
    updateUI() {
        // 更新点数量
        const pointCountEl = document.getElementById('drawPointCount');
        if (pointCountEl) {
            pointCountEl.textContent = `点数量: ${this.pickedPoints.length}`;
        }
        
        // 更新状态
        const statusEl = document.getElementById('drawStatus');
        if (statusEl) {
            statusEl.textContent = `状态: ${this.isDrawing ? '绘制中' : '未开始'}`;
        }
        
        // 更新按钮状态
        const startDrawBtn = document.getElementById('startDrawBtn');
        const endDrawBtn = document.getElementById('endDrawBtn');
        if (startDrawBtn) {
            startDrawBtn.disabled = this.isDrawing;
        }
        if (endDrawBtn) {
            endDrawBtn.disabled = !this.isDrawing;
        }
        
        // 更新贴地选项的勾选状态
        const isGroundDrawingCheckbox = document.getElementById('isGroundDrawing');
        if (isGroundDrawingCheckbox) {
            isGroundDrawingCheckbox.checked = this.isGroundDrawing;
        }
    }

    /**
     * 销毁UI
     */
    dispose() {
        // 结束绘制
        this.endDrawing();
        
        // 销毁绘制工具
        if (this.drawTool) {
            this.drawTool.dispose();
            this.drawTool = null;
        }
        
        this.isInitialized = false;
    }
}

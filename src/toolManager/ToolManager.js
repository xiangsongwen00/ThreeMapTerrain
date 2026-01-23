import * as THREE from 'three';
// 动态导入addLoadingInfo，避免初始化时执行
let addLoadingInfo;
import('../tool/tool.js').then(({ addLoadingInfo: func }) => {
    addLoadingInfo = func;
});

// 导入坐标转换工具
import { getMathProj } from '../Math/mathProj.js';

// 导入工具UI类
import { MeasureToolUI } from './UI/measureToolUI.js';
import { AnimationControlUI } from './UI/animationControlUI.js';
import { InfoManagerUI } from './UI/infoManagerUI.js';
import { TestToolsUI } from './UI/testToolsUI.js';
import { DrawToolUI } from './UI/drawToolUI.js';

/**
 * 工具管理器，用于管理所有工具的状态、UI和交互
 */
export class ToolManager {
    constructor(options) {
        this.options = {
            scene: null,
            camera: null,
            renderer: null,
            controls: null,
            rgbTerrain: null,
            modelManager: null,
            markerManager: null,
            loadingInfo: null,
            ...options
        };
        
        // 工具状态映射
        this.tools = new Map();
        
        // 当前激活的工具
        this.activeTool = null;
        
        // UI容器
        this.uiContainer = null;
        
        // 加载信息UI
        this.loadingInfo = this.options.loadingInfo || null;
        
        // 初始化UI容器
        this.initUIContainer();
        
        // 初始化工具
        this.initTools();
    }
    
    /**
     * 初始化UI容器
     */
    initUIContainer() {
        // 创建右侧控制面板容器
        this.uiContainer = document.createElement('div');
        this.uiContainer.id = 'toolControlPanel';
        this.uiContainer.style.cssText = `
            position: fixed;
            top: 50px;
            right: 20px;
            width: 300px;
            height: calc(100% - 100px);
            background-color: rgba(255, 255, 255, 0.9);
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            z-index: 1000;
            display: none;
            overflow-y: auto;
        `;
        document.body.appendChild(this.uiContainer);
    }
    
    /**
     * 缩放至指定模型
     * @param {string} modelId - 模型ID
     */
    zoomToModel(modelId) {
        if (!this.options.modelManager || !this.options.camera || !this.options.controls) {
            console.error('缩放至模型失败：缺少必要的依赖');
            return;
        }

        // 获取模型
        const model = this.options.modelManager.getModel(modelId);
        if (!model) {
            console.error(`缩放至模型失败：模型 ${modelId} 不存在`);
            return;
        }

        // 计算相机位置
        const modelPosition = model.position.clone();
        const distance = 100; // 距离模型100米
        const angle = Math.PI / 6; // 30度，转换为弧度

        // 计算相机的X、Y、Z坐标
        // 位于模型南方（Z轴负方向）
        const horizontalDistance = distance * Math.cos(angle); // 水平距离
        const height = distance * Math.sin(angle); // 高度

        // 相机位置：在模型正南方，距离水平距离米，高度为height米
        const cameraPosition = new THREE.Vector3(
            modelPosition.x, // X轴与模型相同
            modelPosition.y + height, // Y轴高度
            modelPosition.z - horizontalDistance // Z轴负方向（南方）
        );

        // 设置相机位置和目标
        this.options.camera.position.copy(cameraPosition);
        this.options.controls.target.copy(modelPosition);
        this.options.controls.update();

        console.log(`已缩放至模型 ${modelId}，相机位置：`, cameraPosition);
    }

    /**
     * 初始化工具
     */
    initTools() {
        // 定义工具配置
        const toolConfigs = [
            {
                id: 'terrainToggle',
                name: '地形开关',
                icon: './src/assest/img/toolLog/地形.png',
                description: '切换地形显示/隐藏',
                hasUI: false
            },
            {
                id: 'axesToggle',
                name: '坐标轴显隐',
                icon: './src/assest/img/toolLog/坐标轴.png',
                description: '切换坐标轴和瓦片网格显示/隐藏',
                hasUI: false
            },
            {
                id: 'drawTool',
                name: '绘制工具',
                icon: './src/assest/img/toolLog/绘制.png',
                description: '场景点线面绘制',
                hasUI: true
            },
            {
                id: 'measureTool',
                name: '测量工具',
                icon: './src/assest/img/toolLog/测量.png',
                description: '测量距离和面积',
                hasUI: true
            },
            {
                id: 'animationControl',
                name: '动画控制',
                icon: './src/assest/img/toolLog/动画.png',
                description: '控制模型动画播放',
                hasUI: true
            },
            {
                id: 'infoManager',
                name: '信息管理',
                icon: './src/assest/img/toolLog/信息.png',
                description: '查看和下载场景信息',
                hasUI: true
            },
            {
                id: 'testTools',
                name: '测试工具',
                icon: './src/assest/img/toolLog/测试.png',
                description: '距离验证、坐标转换调试等测试工具',
                hasUI: true
            }
        ];
        
        // 初始化每个工具
        toolConfigs.forEach(config => {
            this.tools.set(config.id, {
                ...config,
                active: false,
                ui: null
            });
        });
    }
    
    /**
     * 激活工具
     * @param {string} toolId - 工具ID
     */
    activateTool(toolId) {
        const tool = this.tools.get(toolId);
        if (!tool) return;
        
        // 如果当前有激活的工具，先停用
        if (this.activeTool) {
            this.deactivateTool(this.activeTool.id);
        }
        
        // 激活新工具
        this.activeTool = tool;
        tool.active = true;
        
        // 更新按钮状态
        this.updateToolButtonState(toolId, true);
        
        // 特殊处理测试工具：如果是测试工具，执行addLoadingInfo
        if (toolId === 'testTools') {
            // 检查是否已经创建了loadingInfo
            if (!window.loadingInfo && addLoadingInfo) {
                // 获取CONFIG信息
                const CONFIG = {
                    centerLon: this.options.centerLon || 105.29197,
                    centerLat: this.options.centerLat || 28.83638,
                    rangeEastWest: this.options.rangeEastWest || 4000,
                    rangeNorthSouth: this.options.rangeNorthSouth || 4000,
                    zoom: this.options.zoom || 16,
                    terrainZoom: this.options.effectiveTerrainZoom || Math.min(13, 16),
                    desc: `地图${this.options.zoom || 16}级，地形${this.options.effectiveTerrainZoom || Math.min(13, 16)}级`
                };
                
                // 创建加载信息面板
                const loadingInfo = addLoadingInfo(CONFIG);
                window.loadingInfo = loadingInfo;
                console.log('测试工具已激活，创建了加载信息面板');
            }
        }
        
        // 如果工具有UI，渲染UI
        if (tool.hasUI) {
            this.renderToolUI(toolId);
        }
        
        console.log(`工具 ${tool.name} 已激活`);
    }
    
    /**
     * 停用工具
     * @param {string} toolId - 工具ID
     */
    deactivateTool(toolId) {
        const tool = this.tools.get(toolId);
        if (!tool) return;
        
        // 如果工具有UI，销毁UI
        if (tool.hasUI && tool.ui) {
            this.destroyToolUI(toolId);
        }
        
        // 特殊处理测试工具：如果是测试工具，隐藏加载信息面板
        if (toolId === 'testTools' && window.loadingInfo) {
            window.loadingInfo.style.display = 'none';
            console.log('测试工具已停用，隐藏了加载信息面板');
        }
        
        // 停用工具
        tool.active = false;
        
        // 更新按钮状态
        this.updateToolButtonState(toolId, false);
        
        // 如果当前激活的是这个工具，清除激活状态
        if (this.activeTool && this.activeTool.id === toolId) {
            this.activeTool = null;
        }
        
        console.log(`工具 ${tool.name} 已停用`);
    }
    
    /**
     * 更新工具按钮状态
     * @param {string} toolId - 工具ID
     * @param {boolean} active - 是否激活
     */
    updateToolButtonState(toolId, active) {
        const btn = document.getElementById(`${toolId}Btn`);
        if (btn) {
            btn.style.backgroundColor = active ? '#2196F3' : 'white';
            btn.style.color = active ? 'white' : '';
        }
    }
    
    /**
     * 切换工具激活状态
     * @param {string} toolId - 工具ID
     */
    toggleTool(toolId) {
        const tool = this.tools.get(toolId);
        if (!tool) return;
        
        if (tool.active) {
            this.deactivateTool(toolId);
        } else {
            this.activateTool(toolId);
        }
    }
    
    /**
     * 渲染工具UI
     * @param {string} toolId - 工具ID
     */
    renderToolUI(toolId) {
        const tool = this.tools.get(toolId);
        if (!tool || !tool.hasUI) return;
        
        // 显示UI容器
        this.uiContainer.style.display = 'block';
        
        // 清空容器
        this.uiContainer.innerHTML = '';
        
        // 创建工具标题
        const title = document.createElement('div');
        title.style.cssText = `
            padding: 10px;
            background-color: #4CAF50;
            color: white;
            font-size: 16px;
            font-weight: bold;
            border-radius: 5px 5px 0 0;
        `;
        title.textContent = tool.name;
        this.uiContainer.appendChild(title);
        
        // 创建工具内容区域
        const content = document.createElement('div');
        content.style.cssText = `
            padding: 15px;
        `;
        this.uiContainer.appendChild(content);
        
        // 创建并初始化对应的UI实例
        let uiInstance;
        
        switch (toolId) {
            case 'drawTool':
                uiInstance = new DrawToolUI({
                    scene: this.options.scene,
                    camera: this.options.camera,
                    renderer: this.options.renderer,
                    mathProj: getMathProj(),
                    rgbTerrain: this.options.rgbTerrain
                });
                break;
            case 'measureTool':
                uiInstance = new MeasureToolUI({
                    scene: this.options.scene,
                    camera: this.options.camera,
                    renderer: this.options.renderer,
                    mathProj: getMathProj(),
                    rgbTerrain: this.options.rgbTerrain,
                    controls: this.options.controls,
                    markerManager: this.options.markerManager
                });
                break;
            case 'animationControl':
                uiInstance = new AnimationControlUI({
                    modelManager: this.options.modelManager,
                    toolManager: this
                });
                break;
            case 'infoManager':
                uiInstance = new InfoManagerUI({
                    // 传递必要的依赖
                });
                break;
            case 'testTools':
                uiInstance = new TestToolsUI({
                    // 传递必要的依赖
                });
                break;
            default:
                content.textContent = '工具UI开发中...';
                return;
        }
        
        // 初始化UI
        uiInstance.init(content);
        
        // 保存UI引用和实例
        tool.ui = this.uiContainer;
        tool.uiInstance = uiInstance;
    }
    
    /**
     * 销毁工具UI
     * @param {string} toolId - 工具ID
     */
    destroyToolUI(toolId) {
        const tool = this.tools.get(toolId);
        if (!tool || !tool.ui) return;
        
        // 如果有UI实例，调用dispose方法
        if (tool.uiInstance) {
            tool.uiInstance.dispose();
            tool.uiInstance = null;
        }
        
        // 隐藏UI容器
        this.uiContainer.style.display = 'none';
        
        // 清空容器内容
        this.uiContainer.innerHTML = '';
        
        // 清除UI引用
        tool.ui = null;
    }
    
    /**
     * 绑定工具事件
     * @param {string} toolId - 工具ID
     */
    bindToolEvents(toolId) {
        // 根据工具ID绑定不同的事件
        switch (toolId) {
            case 'animationControl':
                // 动画控制事件绑定
                const playBtn = document.getElementById('playAnimationBtn');
                const pauseBtn = document.getElementById('pauseAnimationBtn');
                const stopBtn = document.getElementById('stopAnimationBtn');
                
                if (playBtn) {
                    playBtn.addEventListener('click', () => {
                        this.options.modelManager?.setAnimationPaused(false);
                    });
                }
                
                if (pauseBtn) {
                    pauseBtn.addEventListener('click', () => {
                        this.options.modelManager?.setAnimationPaused(true);
                    });
                }
                
                if (stopBtn) {
                    stopBtn.addEventListener('click', () => {
                        // 停止动画逻辑
                        this.options.modelManager?.setAnimationPaused(true);
                    });
                }
                break;
            case 'infoManager':
                // 信息管理事件绑定
                const downloadBtn = document.getElementById('downloadJsonBtn');
                const printBtn = document.getElementById('printSummaryBtn');
                
                if (downloadBtn) {
                    downloadBtn.addEventListener('click', () => {
                        // 导入infoManager并调用下载方法
                        import('../infoTool/infoManager.js').then(({ infoManager }) => {
                            infoManager.downloadJSON();
                        });
                    });
                }
                
                if (printBtn) {
                    printBtn.addEventListener('click', () => {
                        // 导入infoManager并调用打印方法
                        import('../infoTool/infoManager.js').then(({ infoManager }) => {
                            infoManager.printSummary();
                        });
                    });
                }
                break;
            case 'testTools':
                // 测试工具事件绑定
                
                // 距离验证工具
                const xyTestBtn = document.getElementById('xyTestBtn');
                const accuracyTestBtn = document.getElementById('accuracyTestBtn');
                
                if (xyTestBtn) {
                    xyTestBtn.addEventListener('click', () => {
                        console.log('开启距离验证');
                        // 调用XYtest工具
                        if (window.xyTest) {
                            console.log('XYtest已存在，开启距离验证功能');
                        } else {
                            console.log('XYtest不存在，需要初始化');
                        }
                    });
                }
                
                if (accuracyTestBtn) {
                    accuracyTestBtn.addEventListener('click', () => {
                        console.log('开启精度测试');
                        // 调用AccuracyTest工具
                        if (window.accuracyTest) {
                            console.log('AccuracyTest已存在，开启精度测试功能');
                        } else {
                            console.log('AccuracyTest不存在，需要初始化');
                        }
                    });
                }
                
                // 坐标转换调试
                const testMathBtn = document.getElementById('testMathBtn');
                const coordConversionBtn = document.getElementById('coordConversionBtn');
                
                if (testMathBtn) {
                    testMathBtn.addEventListener('click', () => {
                        console.log('开启坐标转换测试');
                        // 调用TestMath工具
                        if (window.testMath) {
                            console.log('TestMath已存在，开启坐标转换测试');
                        } else {
                            console.log('TestMath不存在，需要初始化');
                        }
                    });
                }
                
                if (coordConversionBtn) {
                    coordConversionBtn.addEventListener('click', () => {
                        console.log('坐标转换调试');
                        // 这里可以添加坐标转换调试逻辑
                    });
                }
                
                // 坐标轴方向验证
                const axisDirectionBtn = document.getElementById('axisDirectionBtn');
                const axisInfo = document.getElementById('axisInfo');
                
                if (axisDirectionBtn) {
                    axisDirectionBtn.addEventListener('click', () => {
                        axisInfo.style.display = axisInfo.style.display === 'none' ? 'block' : 'block';
                        console.log('显示坐标轴方向信息');
                    });
                }
                
                // 加载信息面板控制
                const toggleLoadingInfoBtn = document.getElementById('toggleLoadingInfoBtn');
                const hideLoadingInfoBtn = document.getElementById('hideLoadingInfoBtn');
                const showLoadingInfoBtn = document.getElementById('showLoadingInfoBtn');
                
                // 创建加载信息面板的辅助函数
                const createLoadingInfo = () => {
                    if (!window.loadingInfo && addLoadingInfo) {
                        // 获取CONFIG信息
                        const CONFIG = {
                            centerLon: this.options.centerLon || 105.29197,
                            centerLat: this.options.centerLat || 28.83638,
                            rangeEastWest: this.options.rangeEastWest || 4000,
                            rangeNorthSouth: this.options.rangeNorthSouth || 4000,
                            zoom: this.options.zoom || 16,
                            terrainZoom: this.options.effectiveTerrainZoom || Math.min(13, 16),
                            desc: `地图${this.options.zoom || 16}级，地形${this.options.effectiveTerrainZoom || Math.min(13, 16)}级`
                        };
                        
                        // 创建加载信息面板
                        const newLoadingInfo = addLoadingInfo(CONFIG);
                        window.loadingInfo = newLoadingInfo;
                        console.log('创建了加载信息面板');
                        return newLoadingInfo;
                    }
                    return window.loadingInfo;
                };
                
                // 切换加载信息面板显示/隐藏
                if (toggleLoadingInfoBtn) {
                    toggleLoadingInfoBtn.addEventListener('click', () => {
                        let loadingInfo = window.loadingInfo;
                        // 如果loadingInfo不存在，创建它
                        if (!loadingInfo) {
                            loadingInfo = createLoadingInfo();
                        }
                        
                        if (loadingInfo) {
                            const currentState = loadingInfo.style.display !== 'none';
                            loadingInfo.style.display = currentState ? 'none' : 'block';
                            console.log(`加载信息面板已${currentState ? '隐藏' : '显示'}`);
                        } else {
                            console.log('无法创建加载信息面板');
                        }
                    });
                }
                
                // 隐藏加载信息面板
                if (hideLoadingInfoBtn) {
                    hideLoadingInfoBtn.addEventListener('click', () => {
                        const loadingInfo = window.loadingInfo;
                        if (loadingInfo) {
                            loadingInfo.style.display = 'none';
                            console.log('加载信息面板已隐藏');
                        } else {
                            console.log('加载信息面板不存在');
                        }
                    });
                }
                
                // 显示加载信息面板
                if (showLoadingInfoBtn) {
                    showLoadingInfoBtn.addEventListener('click', () => {
                        let loadingInfo = window.loadingInfo;
                        // 如果loadingInfo不存在，创建它
                        if (!loadingInfo) {
                            loadingInfo = createLoadingInfo();
                        }
                        
                        if (loadingInfo) {
                            loadingInfo.style.display = 'block';
                            console.log('加载信息面板已显示');
                        } else {
                            console.log('无法创建加载信息面板');
                        }
                    });
                }
                
                // 测试工具控制
                const clearAllTestsBtn = document.getElementById('clearAllTestsBtn');
                
                if (clearAllTestsBtn) {
                    clearAllTestsBtn.addEventListener('click', () => {
                        console.log('清除所有测试');
                        // 这里可以添加清除所有测试的逻辑
                    });
                }
                break;
        }
    }
    
    /**
     * 创建工具栏
     */
    createToolbar() {
        // 创建工具栏容器
        const toolbar = document.createElement('div');
        toolbar.id = 'toolbar';
        toolbar.style.cssText = `
            position: fixed;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 1000;
            display: flex;
            gap: 10px;
            background-color: rgba(255, 255, 255, 0.8);
            padding: 10px;
            border-radius: 25px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        `;
        
        // 创建每个工具按钮
        this.tools.forEach(tool => {
            const btn = document.createElement('button');
            btn.id = `${tool.id}Btn`;
            btn.title = tool.description;
            btn.style.cssText = `
                width: 30px;
                height: 30px;
                border: none;
                border-radius: 50%;
                background-color: white;
                cursor: pointer;
                transition: all 0.3s;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
            `;
            
            // 添加图标
            const img = document.createElement('img');
            img.src = tool.icon;
            img.alt = tool.name;
            img.style.cssText = `
                width: 20px;
                height: 20px;
            `;
            btn.appendChild(img);
            
            // 添加悬停效果
            btn.addEventListener('mouseenter', () => {
                btn.style.transform = 'scale(1.1)';
                btn.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
            });
            
            btn.addEventListener('mouseleave', () => {
                btn.style.transform = 'scale(1)';
                btn.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.1)';
            });
            
            // 添加点击事件
            btn.addEventListener('click', () => {
                // 无UI的工具直接执行功能
                if (!tool.hasUI) {
                    this.executeToolFunction(tool.id);
                } else {
                    // 有UI的工具切换激活状态
                    this.toggleTool(tool.id);
                }
            });
            
            toolbar.appendChild(btn);
        });
        
        document.body.appendChild(toolbar);
    }
    
    /**
     * 执行工具功能
     * @param {string} toolId - 工具ID
     */
    executeToolFunction(toolId) {
        switch (toolId) {
            case 'terrainToggle':
                // 地形开关功能
                if (this.options.rgbTerrain) {
                    const currentState = this.options.rgbTerrain.renderTerrain;
                    this.options.rgbTerrain.setRenderTerrain(!currentState);
                    console.log(`地形已${!currentState ? '开启' : '关闭'}`);
                }
                break;
            case 'axesToggle':
                // 坐标轴显隐功能
                if (window.axesHelper && window.tileBoundariesGroup) {
                    const currentState = window.axesHelper.visible;
                    const newState = !currentState;
                    window.axesHelper.visible = newState;
                    window.tileBoundariesGroup.visible = newState;
                    
                    // 同时切换坐标轴标签的显示/隐藏
                    if (window.axisLabelsInfo && window.axisLabelsInfo.labelGroup) {
                        window.axisLabelsInfo.labelGroup.visible = newState;
                    }
                    
                    console.log(`坐标轴和瓦片网格已${newState ? '显示' : '隐藏'}`);
                }
                break;
            case 'loadingInfo':
                // 信息面板显示/隐藏功能
                if (this.loadingInfo) {
                    const currentState = this.loadingInfo.style.display !== 'none';
                    this.loadingInfo.style.display = currentState ? 'none' : 'block';
                    console.log(`信息面板已${currentState ? '隐藏' : '显示'}`);
                } else if (window.loadingInfo) {
                    const currentState = window.loadingInfo.style.display !== 'none';
                    window.loadingInfo.style.display = currentState ? 'none' : 'block';
                    console.log(`信息面板已${currentState ? '隐藏' : '显示'}`);
                } else {
                    console.log('信息面板不存在，需要初始化');
                }
                break;
        }
    }
    
    /**
     * 设置加载信息UI
     * @param {HTMLElement} loadingInfo - 加载信息UI元素
     */
    setLoadingInfo(loadingInfo) {
        this.loadingInfo = loadingInfo;
        // 将加载信息UI暴露给window，便于外部访问
        window.loadingInfo = loadingInfo;
    }
    
    /**
     * 销毁工具管理器
     */
    dispose() {
        // 停用所有工具
        this.tools.forEach(tool => {
            this.deactivateTool(tool.id);
        });
        
        // 移除UI容器
        if (this.uiContainer && this.uiContainer.parentNode) {
            this.uiContainer.parentNode.removeChild(this.uiContainer);
        }
        
        // 移除工具栏
        const toolbar = document.getElementById('toolbar');
        if (toolbar && toolbar.parentNode) {
            toolbar.parentNode.removeChild(toolbar);
        }
    }
}
/**
 * 测试工具UI类
 * 负责测试工具的UI设计与数据更新
 */
export class TestToolsUI {
    /**
     * 构造函数
     * @param {Object} options - 配置选项
     */
    constructor(options) {
        this.options = {
            ...options
        };
        
        this.container = null;
        this.isInitialized = false;
    }
    
    /**
     * 初始化UI
     * @param {HTMLElement} container - UI容器
     */
    init(container) {
        this.container = container;
        this.render();
        this.bindEvents();
        this.isInitialized = true;
    }
    
    /**
     * 渲染UI
     */
    render() {
        this.container.innerHTML = `
            <div class="test-tools-ui">

                <div class="control-section">
                    <h4>测试类型</h4>
                    <div class="tab-section">
                        <button id="distanceTestTab" class="active">距离验证</button>
                        <button id="coordTestTab">坐标转换</button>
                        <button id="axisTestTab">坐标轴验证</button>
                    </div>
                </div>
                
                <!-- 距离验证面板 -->
                <div id="distanceTestPanel" class="test-panel active">
                    <div class="control-section">
                        <h4>距离验证</h4>
                        <div class="test-input-section">
                            <div class="input-group">
                                <label for="testDistance">测试距离（米）：</label>
                                <input type="number" id="testDistance" value="1000" min="1" max="100000">
                            </div>
                            <div class="button-group">
                                <button id="runDistanceTest">运行测试</button>
                            </div>
                        </div>
                        <div class="test-result">
                            <h5>测试结果：</h5>
                            <div id="distanceTestResult">
                                <p>点击运行测试查看结果</p>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- 坐标转换面板 -->
                <div id="coordTestPanel" class="test-panel">
                    <div class="control-section">
                        <h4>坐标转换</h4>
                        <div class="test-input-section">
                            <div class="input-group">
                                <label for="testLon">经度：</label>
                                <input type="number" id="testLon" value="105.29197" step="0.00001">
                            </div>
                            <div class="input-group">
                                <label for="testLat">纬度：</label>
                                <input type="number" id="testLat" value="28.83638" step="0.00001">
                            </div>
                            <div class="button-group">
                                <button id="runCoordTest">转换坐标</button>
                            </div>
                        </div>
                        <div class="test-result">
                            <h5>转换结果：</h5>
                            <div id="coordTestResult">
                                <p>点击转换坐标查看结果</p>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- 坐标轴验证面板 -->
                <div id="axisTestPanel" class="test-panel">
                    <div class="control-section">
                        <h4>坐标轴验证</h4>
                        <div class="test-input-section">
                            <div class="button-group">
                                <button id="runAxisTest">运行验证</button>
                            </div>
                        </div>
                        <div class="test-result">
                            <h5>验证结果：</h5>
                            <div id="axisTestResult">
                                <p>点击运行验证查看结果</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        this.addStyles();
    }
    
    /**
     * 添加样式
     */
    addStyles() {
        if (document.getElementById('test-tools-ui-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'test-tools-ui-styles';
        style.textContent = `
            .test-tools-ui {
                font-family: Arial, sans-serif;
            }
            
            .test-tools-ui h3 {
                margin: 0 0 15px 0;
                color: #333;
                font-size: 16px;
                font-weight: bold;
            }
            
            .test-tools-ui h4 {
                margin: 12px 0 8px 0;
                color: #555;
                font-size: 14px;
                font-weight: bold;
            }
            
            .control-section {
                margin-bottom: 20px;
            }
            
            .tab-section {
                display: flex;
                gap: 5px;
                margin-bottom: 15px;
                border-bottom: 1px solid #e0e0e0;
            }
            
            .tab-section button {
                padding: 8px 16px;
                border: none;
                background-color: #f0f0f0;
                color: #333;
                cursor: pointer;
                font-size: 14px;
                transition: all 0.3s;
                border-radius: 4px 4px 0 0;
                border-bottom: 2px solid transparent;
            }
            
            .tab-section button.active {
                background-color: white;
                color: #2196F3;
                border-bottom-color: #2196F3;
            }
            
            .tab-section button:hover {
                background-color: #e0e0e0;
            }
            
            .tab-section button.active:hover {
                background-color: white;
            }
            
            .test-panel {
                display: none;
            }
            
            .test-panel.active {
                display: block;
            }
            
            .test-input-section {
                background-color: #f9f9f9;
                padding: 12px;
                border-radius: 4px;
                margin-bottom: 15px;
            }
            
            .input-group {
                margin-bottom: 10px;
            }
            
            .input-group label {
                display: inline-block;
                width: 120px;
                font-size: 14px;
                font-weight: bold;
                color: #555;
            }
            
            .input-group input {
                padding: 6px;
                border: 1px solid #ccc;
                border-radius: 4px;
                font-size: 14px;
                width: 150px;
            }
            
            .button-group {
                margin-top: 10px;
            }
            
            .button-group button {
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                background-color: #2196F3;
                color: white;
                cursor: pointer;
                font-size: 14px;
                transition: background-color 0.3s;
            }
            
            .button-group button:hover {
                background-color: #1976D2;
            }
            
            .test-result {
                background-color: #f9f9f9;
                padding: 12px;
                border-radius: 4px;
            }
            
            .test-result h5 {
                margin: 0 0 10px 0;
                color: #333;
                font-size: 14px;
                font-weight: bold;
            }
            
            #distanceTestResult, #coordTestResult, #axisTestResult {
                font-size: 14px;
                color: #666;
                white-space: pre-wrap;
            }
        `;
        
        document.head.appendChild(style);
    }
    
    /**
     * 绑定事件
     */
    bindEvents() {
        // 标签页切换
        document.getElementById('distanceTestTab').addEventListener('click', () => {
            this.switchTab('distanceTest');
        });
        
        document.getElementById('coordTestTab').addEventListener('click', () => {
            this.switchTab('coordTest');
        });
        
        document.getElementById('axisTestTab').addEventListener('click', () => {
            this.switchTab('axisTest');
        });
        
        // 距离测试按钮
        document.getElementById('runDistanceTest').addEventListener('click', () => {
            const testDistance = parseFloat(document.getElementById('testDistance').value);
            this.onRunDistanceTest?.(testDistance);
        });
        
        // 坐标转换按钮
        document.getElementById('runCoordTest').addEventListener('click', () => {
            const lon = parseFloat(document.getElementById('testLon').value);
            const lat = parseFloat(document.getElementById('testLat').value);
            this.onRunCoordTest?.(lon, lat);
        });
        
        // 坐标轴验证按钮
        document.getElementById('runAxisTest').addEventListener('click', () => {
            this.onRunAxisTest?.();
        });
    }
    
    /**
     * 切换标签页
     * @param {string} tabName - 标签页名称
     */
    switchTab(tabName) {
        // 切换标签按钮状态
        const tabs = ['distanceTest', 'coordTest', 'axisTest'];
        tabs.forEach(tab => {
            const tabBtn = document.getElementById(`${tab}Tab`);
            const panel = document.getElementById(`${tab}Panel`);
            
            if (tab === tabName) {
                tabBtn.classList.add('active');
                panel.classList.add('active');
            } else {
                tabBtn.classList.remove('active');
                panel.classList.remove('active');
            }
        });
    }
    
    /**
     * 更新距离测试结果
     * @param {string} result - 测试结果
     */
    updateDistanceTestResult(result) {
        if (!this.isInitialized) return;
        
        const resultElement = document.getElementById('distanceTestResult');
        resultElement.innerHTML = `<pre>${result}</pre>`;
    }
    
    /**
     * 更新坐标转换结果
     * @param {string} result - 转换结果
     */
    updateCoordTestResult(result) {
        if (!this.isInitialized) return;
        
        const resultElement = document.getElementById('coordTestResult');
        resultElement.innerHTML = `<pre>${result}</pre>`;
    }
    
    /**
     * 更新坐标轴验证结果
     * @param {string} result - 验证结果
     */
    updateAxisTestResult(result) {
        if (!this.isInitialized) return;
        
        const resultElement = document.getElementById('axisTestResult');
        resultElement.innerHTML = `<pre>${result}</pre>`;
    }
    
    /**
     * 销毁UI
     */
    dispose() {
        this.isInitialized = false;
    }
}
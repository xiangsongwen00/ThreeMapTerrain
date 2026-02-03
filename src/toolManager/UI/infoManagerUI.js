/**
 * 信息管理UI类
 * 负责场景信息的显示和管理
 */
export class InfoManagerUI {
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
            <div class="info-manager-ui">
 
                <div class="control-section">
                    <h4>场景信息</h4>
                    <div class="info-section">
                        <div class="info-item">
                            <span class="label">中心经度：</span>
                            <span id="centerLon">0.00</span>
                        </div>
                        <div class="info-item">
                            <span class="label">中心纬度：</span>
                            <span id="centerLat">0.00</span>
                        </div>
                        <div class="info-item">
                            <span class="label">东西范围：</span>
                            <span id="rangeEastWest">0</span> 米
                        </div>
                        <div class="info-item">
                            <span class="label">南北范围：</span>
                            <span id="rangeNorthSouth">0</span> 米
                        </div>
                        <div class="info-item">
                            <span class="label">地图层级：</span>
                            <span id="maxMapZoom">0</span>
                        </div>
                        <div class="info-item">
                            <span class="label">地形层级：</span>
                            <span id="terrainZoom">0</span>
                        </div>
                    </div>
                </div>
                
                <div class="control-section">
                    <h4>瓦片统计</h4>
                    <div class="info-section">
                        <div class="info-item">
                            <span class="label">地图瓦片：</span>
                            <span id="mapTilesCount">0</span> 个
                        </div>
                        <div class="info-item">
                            <span class="label">地形瓦片：</span>
                            <span id="terrainTilesCount">0</span> 个
                        </div>
                    </div>
                </div>
                
                <div class="control-section">
                    <h4>操作</h4>
                    <div class="button-group">
                        <button id="printInfoBtn">打印信息</button>
                        <button id="downloadJsonBtn">下载JSON</button>
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
        if (document.getElementById('info-manager-ui-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'info-manager-ui-styles';
        style.textContent = `
            .info-manager-ui {
                font-family: Arial, sans-serif;
            }
            
            .info-manager-ui h3 {
                margin: 0 0 15px 0;
                color: #333;
                font-size: 16px;
                font-weight: bold;
            }
            
            .info-manager-ui h4 {
                margin: 12px 0 8px 0;
                color: #555;
                font-size: 14px;
                font-weight: bold;
            }
            
            .control-section {
                margin-bottom: 20px;
            }
            
            .info-section {
                background-color: #f9f9f9;
                padding: 12px;
                border-radius: 4px;
                margin-bottom: 10px;
            }
            
            .info-item {
                margin-bottom: 8px;
                font-size: 14px;
            }
            
            .info-item:last-child {
                margin-bottom: 0;
            }
            
            .info-item .label {
                font-weight: bold;
                color: #555;
                display: inline-block;
                width: 100px;
            }
            
            .button-group {
                display: flex;
                gap: 10px;
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
        `;
        
        document.head.appendChild(style);
    }
    
    /**
     * 绑定事件
     */
    bindEvents() {
        // 打印信息按钮
        document.getElementById('printInfoBtn').addEventListener('click', () => {
            this.onPrintInfo?.();
        });
        
        // 下载JSON按钮
        document.getElementById('downloadJsonBtn').addEventListener('click', () => {
            this.onDownloadJson?.();
        });
    }
    
    /**
     * 更新场景信息
     * @param {Object} info - 场景信息
     */
    updateSceneInfo(info) {
        if (!this.isInitialized) return;
        
        document.getElementById('centerLon').textContent = info.centerLon?.toFixed(6) || '0.00';
        document.getElementById('centerLat').textContent = info.centerLat?.toFixed(6) || '0.00';
        document.getElementById('rangeEastWest').textContent = info.rangeEastWest || '0';
        document.getElementById('rangeNorthSouth').textContent = info.rangeNorthSouth || '0';
        document.getElementById('maxMapZoom').textContent = info.maxMapZoom ?? info.mapZoom ?? '0';
        document.getElementById('terrainZoom').textContent = info.terrainZoom || '0';
    }
    
    /**
     * 更新瓦片统计信息
     * @param {Object} stats - 瓦片统计信息
     */
    updateTilesStats(stats) {
        if (!this.isInitialized) return;
        
        document.getElementById('mapTilesCount').textContent = stats.mapTiles || '0';
        document.getElementById('terrainTilesCount').textContent = stats.terrainTiles || '0';
    }
    
    /**
     * 销毁UI
     */
    dispose() {
        this.isInitialized = false;
    }
}

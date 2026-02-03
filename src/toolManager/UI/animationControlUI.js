/**
 * 动画控制UI类
 * 负责动画控制工具的UI设计与数据更新
 */
export class AnimationControlUI {
    /**
     * 构造函数
     * @param {Object} options - 配置选项
     * @param {ModelManager} options.modelManager - 模型管理器实例
     * @param {ToolManager} options.toolManager - 工具管理器实例
     */
    constructor(options) {
        this.options = {
            modelManager: null,
            toolManager: null,
            ...options
        };
        
        this.modelManager = this.options.modelManager;
        this.toolManager = this.options.toolManager;
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
            <div class="animation-control-ui">
                <!-- 模型选择 -->
                <div class="control-section">
                    <h4>模型选择</h4>
                    <div class="select-group">
                        <div class="select-item">
                            <label for="modelType">模型类型：</label>
                            <select id="modelType">
                                <option value="all">全部</option>
                                <option value="excavator">挖掘机</option>
                                <option value="bulldozer">推土机</option>
                                <option value="roller">压土机</option>
                                <option value="other">其他</option>
                            </select>
                        </div>
                        <div class="select-item">
                            <label for="modelSelect">选择模型：</label>
                            <select id="modelSelect">
                                <option value="">请选择模型</option>
                                <!-- 动态填充模型列表 -->
                            </select>
                        </div>
                    </div>
                </div>
                
                <!-- 挖掘机动作控制 -->
                <div id="excavatorActions" class="control-section model-actions excavator">
                    <h4>挖掘机动作</h4>
                    <div class="button-grid">
                        <button id="turnLeftBtn" class="action-btn">左转</button>
                        <button id="turnRightBtn" class="action-btn">右转</button>
                        <button id="liftArmBtn" class="action-btn">抬臂</button>
                        <button id="lowerArmBtn" class="action-btn">下挖</button>
                        <button id="digBtn" class="action-btn">取土</button>
                        <button id="dumpBtn" class="action-btn">抛土</button>
                    </div>
                </div>
                
                <!-- 推土机动作控制 -->
                <div id="bulldozerActions" class="control-section model-actions bulldozer" style="display: none;">
                    <h4>推土机动作</h4>
                    <div class="button-grid">
                        <button id="bulldozerForwardBtn" class="action-btn">前进</button>
                        <button id="bulldozerBackwardBtn" class="action-btn">后退</button>
                        <button id="liftBladeBtn" class="action-btn">抬铲</button>
                        <button id="lowerBladeBtn" class="action-btn">降铲</button>
                    </div>
                </div>
                
                <!-- 压土机动作控制 -->
                <div id="rollerActions" class="control-section model-actions roller" style="display: none;">
                    <h4>压土机动作</h4>
                    <div class="button-grid">
                        <button id="rollerForwardBtn" class="action-btn">前进</button>
                        <button id="rollerBackwardBtn" class="action-btn">后退</button>
                    </div>
                </div>
            </div>
        `;
        
        // 添加样式
        this.addStyles();
    }
    
    /**
     * 添加样式
     */
    addStyles() {
        // 检查样式是否已存在
        if (document.getElementById('animation-control-ui-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'animation-control-ui-styles';
        style.textContent = `
            .animation-control-ui {
                font-family: Arial, sans-serif;
            }
            
            .animation-control-ui h3 {
                margin: 0 0 15px 0;
                color: #333;
                font-size: 16px;
                font-weight: bold;
            }
            
            .animation-control-ui h4 {
                margin: 12px 0 8px 0;
                color: #555;
                font-size: 14px;
                font-weight: bold;
            }
            
            .control-section {
                margin-bottom: 20px;
            }
            
            /* 模型选择样式 */
            .select-group {
                background-color: #f9f9f9;
                padding: 12px;
                border-radius: 4px;
            }
            
            .select-item {
                margin-bottom: 10px;
                display: flex;
                align-items: center;
            }
            
            .select-item:last-child {
                margin-bottom: 0;
            }
            
            .select-item label {
                display: inline-block;
                width: 80px;
                font-size: 14px;
                font-weight: bold;
                color: #555;
            }
            
            .select-item select {
                padding: 6px;
                border: 1px solid #ccc;
                border-radius: 4px;
                font-size: 14px;
                width: 180px;
                background-color: white;
            }
            
            /* 按钮组样式 */
            .button-group {
                display: flex;
                gap: 10px;
                flex-wrap: wrap;
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
            
            /* 按钮网格样式 */
            .button-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
                gap: 8px;
                background-color: #f9f9f9;
                padding: 12px;
                border-radius: 4px;
            }
            
            .action-btn {
                padding: 8px 12px;
                border: none;
                border-radius: 4px;
                background-color: #4CAF50;
                color: white;
                cursor: pointer;
                font-size: 14px;
                transition: background-color 0.3s;
            }
            
            .action-btn:hover {
                background-color: #45a049;
            }
            
            /* 滑块样式 */
            .slider-group {
                display: flex;
                align-items: center;
                gap: 10px;
                background-color: #f9f9f9;
                padding: 12px;
                border-radius: 4px;
            }
            
            .slider-group input[type="range"] {
                flex: 1;
            }
            
            .slider-group span {
                min-width: 40px;
                text-align: right;
                font-size: 14px;
                font-weight: bold;
                color: #2196F3;
            }
            
            /* 帧信息样式 */
            .frame-info {
                font-size: 14px;
                color: #555;
                background-color: #f9f9f9;
                padding: 12px;
                border-radius: 4px;
                font-weight: bold;
            }
            
            /* 复选框样式 */
            .checkbox-group {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 14px;
                background-color: #f9f9f9;
                padding: 12px;
                border-radius: 4px;
            }
            
            /* 模型动作控制区域 */
            .model-actions {
                margin-top: 15px;
            }
        `;
        
        document.head.appendChild(style);
    }
    
    /**
     * 绑定事件
     */
    bindEvents() {
        // 模型类型选择事件
        const modelTypeSelect = document.getElementById('modelType');
        modelTypeSelect.addEventListener('change', (e) => {
            this.onModelTypeChange(e.target.value);
        });
        
        // 模型选择事件
        const modelSelect = document.getElementById('modelSelect');
        modelSelect.addEventListener('change', (e) => {
            this.onModelSelect(e.target.value);
        });
        
        // 挖掘机动作按钮事件
        document.getElementById('turnLeftBtn').addEventListener('click', () => {
            this.executeModelAction('turnLeft');
        });
        
        document.getElementById('turnRightBtn').addEventListener('click', () => {
            this.executeModelAction('turnRight');
        });
        
        document.getElementById('liftArmBtn').addEventListener('click', () => {
            this.executeModelAction('liftArm');
        });
        
        document.getElementById('lowerArmBtn').addEventListener('click', () => {
            this.executeModelAction('lowerArm');
        });
        
        document.getElementById('digBtn').addEventListener('click', () => {
            this.executeModelAction('dig');
        });
        
        document.getElementById('dumpBtn').addEventListener('click', () => {
            this.executeModelAction('dump');
        });
        
        // 推土机动作按钮事件
        document.getElementById('bulldozerForwardBtn').addEventListener('click', () => {
            this.executeModelAction('forward');
        });
        
        document.getElementById('bulldozerBackwardBtn').addEventListener('click', () => {
            this.executeModelAction('backward');
        });
        
        document.getElementById('liftBladeBtn').addEventListener('click', () => {
            this.executeModelAction('liftBlade');
        });
        
        document.getElementById('lowerBladeBtn').addEventListener('click', () => {
            this.executeModelAction('lowerBlade');
        });
        
        // 压土机动作按钮事件
        document.getElementById('rollerForwardBtn').addEventListener('click', () => {
            this.executeModelAction('forward');
        });
        
        document.getElementById('rollerBackwardBtn').addEventListener('click', () => {
            this.executeModelAction('backward');
        });
        
        // 初始化模型列表
        this.initModelList();
    }
    
    /**
     * 初始化模型列表
     */
    initModelList() {
        // 假设modelManager有获取模型列表的方法
        if (this.modelManager && typeof this.modelManager.getModels === 'function') {
            const models = this.modelManager.getModels();
            const modelSelect = document.getElementById('modelSelect');
            
            // 清空现有选项
            modelSelect.innerHTML = '<option value="">请选择模型</option>';
            
            // 添加模型选项，使用模型ID作为显示文本
            models.forEach(model => {
                const option = document.createElement('option');
                option.value = model.id;
                // 使用模型ID作为显示文本，符合要求
                option.textContent = model.id;
                // 将模型类型转换为小写，以匹配UI中定义的类型
                let modelType = model.type || 'other';
                modelType = modelType.toLowerCase();
                // 转换特定类型的名称
                if (modelType === 'excavator') modelType = 'excavator';
                if (modelType === 'bulldozer') modelType = 'bulldozer';
                if (modelType === 'soilcompactor') modelType = 'roller';
                option.dataset.type = modelType;
                modelSelect.appendChild(option);
            });
        }
    }
    
    /**
     * 模型类型改变事件处理
     * @param {string} type - 模型类型
     */
    onModelTypeChange(type) {
        // 隐藏所有动作面板
        const actionPanels = document.querySelectorAll('.model-actions');
        actionPanels.forEach(panel => {
            panel.style.display = 'none';
        });
        
        // 显示对应的动作面板
        if (type !== 'all') {
            const actionPanel = document.getElementById(`${type}Actions`);
            if (actionPanel) {
                actionPanel.style.display = 'block';
            }
        } else {
            // 如果选择"全部"，根据当前选中的模型类型显示对应的动作面板
            const selectedModel = document.getElementById('modelSelect').value;
            if (selectedModel) {
                const modelOption = document.querySelector(`#modelSelect option[value="${selectedModel}"]`);
                const modelType = modelOption.dataset.type;
                const actionPanel = document.getElementById(`${modelType}Actions`);
                if (actionPanel) {
                    actionPanel.style.display = 'block';
                }
            } else {
                // 默认显示挖掘机动作面板
                const excavatorPanel = document.getElementById('excavatorActions');
                excavatorPanel.style.display = 'block';
            }
        }
        
        // 根据模型类型过滤模型列表
        this.filterModelsByType(type);
    }
    
    /**
     * 模型选择事件处理
     * @param {string} modelId - 选中的模型ID
     */
    onModelSelect(modelId) {
        if (!modelId) return;
        
        // 获取选中模型的类型
        const modelOption = document.querySelector(`#modelSelect option[value="${modelId}"]`);
        const modelType = modelOption.dataset.type;
        
        // 隐藏所有动作面板
        const actionPanels = document.querySelectorAll('.model-actions');
        actionPanels.forEach(panel => {
            panel.style.display = 'none';
        });
        
        // 显示对应的动作面板
        const actionPanel = document.getElementById(`${modelType}Actions`);
        if (actionPanel) {
            actionPanel.style.display = 'block';
        }
        
        // 更新当前选择的模型
        this.currentModel = modelId;
        
        // 缩放至选中的模型
        if (this.toolManager && typeof this.toolManager.zoomToModel === 'function') {
            this.toolManager.zoomToModel(modelId);
        }
    }
    
    /**
     * 根据模型类型过滤模型列表
     * @param {string} type - 模型类型
     */
    filterModelsByType(type) {
        const modelSelect = document.getElementById('modelSelect');
        const options = modelSelect.querySelectorAll('option:not([value=""]');
        
        options.forEach(option => {
            if (type === 'all' || option.dataset.type === type) {
                option.style.display = 'block';
            } else {
                option.style.display = 'none';
            }
        });
        
        // 如果当前选中的模型不在过滤后的列表中，重置选择
        const selectedModel = modelSelect.value;
        if (selectedModel) {
            const selectedOption = modelSelect.querySelector(`option[value="${selectedModel}"]`);
            if (selectedOption && selectedOption.style.display === 'none') {
                modelSelect.value = '';
                this.onModelSelect('');
            }
        }
    }
    
    /**
     * 执行模型动作
     * @param {string} action - 动作名称
     */
    executeModelAction(action) {
        if (!this.modelManager) return;
        
        const selectedModel = document.getElementById('modelSelect').value;
        if (selectedModel) {
            // 调用模型管理器的执行动作方法
            if (typeof this.modelManager.executeModelAction === 'function') {
                this.modelManager.executeModelAction(selectedModel, action);
            } else {
                console.log(`执行模型动作: ${action}，模型: ${selectedModel}`);
            }
        } else {
            console.log(`请先选择一个模型执行动作: ${action}`);
        }
    }
    
    /**
     * 更新UI数据
     */
    update() {
        // 简化更新逻辑，移除对已不存在元素的访问
        if (!this.isInitialized || !this.modelManager) return;
    }
    
    /**
     * 销毁UI
     */
    dispose() {
        this.isInitialized = false;
    }
}
/*
 * @Description: 辅助工具HTML结构
 */
export const auxiliaryToolsHTML = `
<div class="auxiliary-tools-ui">
    <div class="auxiliary-tools-header">
        <h3>辅助工具控制</h3>
    </div>
    
    <div class="auxiliary-tools-content">
        <!-- 网格控制 -->
        <div class="control-section">
            <h4>网格控制</h4>
            <div class="control-item">
                <label class="checkbox-item">
                    <input type="checkbox" id="grid-visible" checked>
                    <span>显示网格</span>
                </label>
            </div>
        </div>
        
        <!-- 坐标轴控制 -->
        <div class="control-section">
            <h4>坐标轴控制</h4>
            <div class="control-item">
                <label class="checkbox-item">
                    <input type="checkbox" id="axes-visible" checked>
                    <span>显示坐标轴</span>
                </label>
            </div>
        </div>
        
        <!-- 地形线框模式 -->
        <div class="control-section">
            <h4>地形显示</h4>
            <div class="control-item">
                <label class="checkbox-item">
                    <input type="checkbox" id="wireframe-mode">
                    <span>线框模式</span>
                </label>
            </div>
        </div>
        
        <!-- 地形控制 -->
        <div class="control-section">
            <h4>地形控制</h4>
            <div class="control-item">
                <label class="checkbox-item">
                    <input type="checkbox" id="terrain-visible" checked>
                    <span>地形开关(高程)</span>
                </label>
            </div>
        </div>
    </div>
</div>
`;

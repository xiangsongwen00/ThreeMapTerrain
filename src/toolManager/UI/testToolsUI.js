/**
 * 测试工具 UI
 * - 渲染测试面板
 * - 通过回调把 UI 事件交给 ToolManager/Viewer
 *
 * 注意：地形编辑相关 UI 已迁移到正式工具“地形修整”，此处仅保留调试查询/拾取。
 */
export class TestToolsUI {
    /**
     * @param {Object} options
     */
    constructor(options) {
        this.options = { ...options };
        this.container = null;
        this.isInitialized = false;
    }

    /**
     * @param {HTMLElement} container
     */
    init(container) {
        this.container = container;
        this.render();
        this.bindEvents();
        this.isInitialized = true;
    }

    render() {
        this.container.innerHTML = `
            <div class="test-tools-ui">
                <div class="control-section">
                    <h4>测试工具</h4>

                    <div class="control-group">
                        <h5>高程拾取</h5>
                        <div class="checkbox-group">
                            <label>
                                <input type="checkbox" id="elevation-pick-enabled"> 启用高程拾取
                            </label>
                        </div>
                        <div id="elevation-info" style="margin-top: 10px; padding: 8px; background: #f0f0f0; border-radius: 4px;">
                            点击地形获取高程
                        </div>
                        <div id="pick-result" style="margin-top: 10px; padding: 8px; background: #e3f2fd; border-radius: 4px; border-left: 4px solid #2196F3;">
                            点击结果：等待拾取...
                        </div>
                    </div>

                    <div class="control-group">
                        <h5>经纬度查询</h5>
                        <div class="input-row">
                            <label>经度</label>
                            <input type="number" id="query-lon" value="105.29197" step="0.00001" style="width: 120px;">
                        </div>
                        <div class="input-row">
                            <label>纬度</label>
                            <input type="number" id="query-lat" value="28.83638" step="0.00001" style="width: 120px;">
                        </div>
                        <button id="query-by-lonlat" style="margin-top: 5px;">查询</button>
                    </div>

                    <div class="control-group">
                        <h5>Three.js 坐标查询</h5>
                        <div class="input-row">
                            <label>X</label>
                            <input type="number" id="query-three-x" value="0" step="1" style="width: 120px;">
                        </div>
                        <div class="input-row">
                            <label>Z</label>
                            <input type="number" id="query-three-z" value="0" step="1" style="width: 120px;">
                        </div>
                        <button id="query-by-three" style="margin-top: 5px;">查询</button>
                    </div>

                    <div id="query-result" style="margin-top: 10px; padding: 8px; background: #f0f0f0; border-radius: 4px;">
                        查询结果将显示在这里
                    </div>

                    <div class="control-group">
                        <h5>相机控制</h5>
                        <button id="reset-camera" style="margin-top: 5px;">重置相机</button>
                    </div>
                </div>
            </div>
        `;

        this.addStyles();
    }

    addStyles() {
        if (document.getElementById('test-tools-ui-styles')) return;

        const style = document.createElement('style');
        style.id = 'test-tools-ui-styles';
        style.textContent = `
            .test-tools-ui { font-family: Arial, sans-serif; }
            .test-tools-ui h4 { margin: 12px 0 8px 0; color: #555; font-size: 14px; font-weight: bold; }
            .test-tools-ui h5 { margin: 10px 0 6px 0; color: #666; font-size: 13px; font-weight: bold; }
            .control-section { margin-bottom: 20px; }
            .control-group { margin-bottom: 15px; padding: 10px; background: #f9f9f9; border-radius: 4px; }
            .input-row { margin-bottom: 8px; display: flex; align-items: center; }
            .input-row label { width: 80px; font-size: 13px; font-weight: bold; color: #555; }
            .checkbox-group label { display: flex; align-items: center; font-size: 13px; color: #555; cursor: pointer; }
            .checkbox-group input[type="checkbox"] { margin-right: 6px; }
        `;

        document.head.appendChild(style);
    }

    bindEvents() {
        const qs = (sel) => this.container?.querySelector(sel);

        qs('#elevation-pick-enabled')?.addEventListener('change', (e) => {
            this.onElevationPickEnabled?.(e.target.checked);
        });

        qs('#query-by-lonlat')?.addEventListener('click', () => {
            const lon = parseFloat(qs('#query-lon')?.value);
            const lat = parseFloat(qs('#query-lat')?.value);
            const elevation = this.onQueryByLonLat?.(lon, lat) ?? 0;

            const queryResult = qs('#query-result');
            if (queryResult) {
                queryResult.innerHTML = `
                    查询结果：成功<br>
                    高程：${Number(elevation).toFixed(2)} m<br>
                    经纬度：(${lon.toFixed(5)}, ${lat.toFixed(5)})
                `;
            }
        });

        qs('#query-by-three')?.addEventListener('click', () => {
            const x = parseFloat(qs('#query-three-x')?.value);
            const z = parseFloat(qs('#query-three-z')?.value);
            const elevation = this.onQueryByThree?.(x, z) ?? 0;

            const queryResult = qs('#query-result');
            if (queryResult) {
                queryResult.innerHTML = `
                    查询结果：成功<br>
                    高程：${Number(elevation).toFixed(2)} m<br>
                    Three.js：(${x.toFixed(2)}, ${Number(elevation).toFixed(2)}, ${z.toFixed(2)})
                `;
            }
        });

        qs('#reset-camera')?.addEventListener('click', () => {
            this.onResetCamera?.();
        });
    }

    updateElevationPickResult(result) {
        const pickResultElement = this.container?.querySelector('#pick-result');
        if (!pickResultElement || !result) return;

        pickResultElement.innerHTML = `
            点击结果：成功<br>
            Three.js：(${result.x.toFixed(2)}, ${result.y.toFixed(2)}, ${result.z.toFixed(2)})<br>
            高程：${result.elevation.toFixed(2)} m
        `;
    }

    dispose() {
        this.isInitialized = false;
    }
}


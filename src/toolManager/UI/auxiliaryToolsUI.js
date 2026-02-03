import * as THREE from 'three';
import { auxiliaryToolsHTML } from './html/auxiliaryToolsHTML.js';
import { auxiliaryToolsStyles } from './style/auxiliaryToolsStyles.js';

/**
 * 辅助工具UI类
 * 负责辅助工具的UI设计与功能实现
 */
export class AuxiliaryToolsUI {
    /**
     * 构造函数
     * @param {Object} options - 配置选项
     * @param {THREE.Scene} options.scene - Three.js场景
     * @param {Object} options.rgbTerrain - RGB地形实例
     */
    constructor(options) {
        this.options = {
            scene: null,
            rgbTerrain: null,
            ...options
        };

        this.container = null;
        this.isInitialized = false;
    }

    /**
     * 初始化UI
     * @param {HTMLElement} container - UI容器元素
     */
    init(container) {
        this.container = container;
        this.render();
        this.addStyles();
        this.bindEvents();
        this.isInitialized = true;
    }

    /**
     * 渲染UI
     */
    render() {
        if (!this.container) return;
        
        this.container.innerHTML = auxiliaryToolsHTML;
    }

    /**
     * 添加样式
     */
    addStyles() {
        if (document.getElementById('auxiliary-tools-ui-styles')) return;

        const style = document.createElement('style');
        style.id = 'auxiliary-tools-ui-styles';
        style.textContent = auxiliaryToolsStyles;

        document.head.appendChild(style);
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 网格可见性控制
        const gridVisibleCheckbox = this.container.querySelector('#grid-visible');
        if (gridVisibleCheckbox) {
            gridVisibleCheckbox.addEventListener('change', (e) => {
                this.onGridVisibilityChange?.(e.target.checked);
            });
        }

        // 坐标轴可见性控制
        const axesVisibleCheckbox = this.container.querySelector('#axes-visible');
        if (axesVisibleCheckbox) {
            axesVisibleCheckbox.addEventListener('change', (e) => {
                this.onAxesVisibilityChange?.(e.target.checked);
            });
        }

        // 线框模式控制
        const wireframeModeCheckbox = this.container.querySelector('#wireframe-mode');
        if (wireframeModeCheckbox) {
            wireframeModeCheckbox.addEventListener('change', (e) => {
                this.onWireframeModeChange?.(e.target.checked);
            });
        }

        // 地形可见性控制
        const terrainVisibleCheckbox = this.container.querySelector('#terrain-visible');
        if (terrainVisibleCheckbox) {
            terrainVisibleCheckbox.addEventListener('change', (e) => {
                this.onTerrainVisibilityChange?.(e.target.checked);
            });
        }
    }

    /**
     * 更新UI状态
     * @param {Object} status - 当前状态
     */
    updateUI(status) {
        if (!this.isInitialized) return;

        // 更新网格可见性
        const gridVisibleCheckbox = this.container.querySelector('#grid-visible');
        if (gridVisibleCheckbox && status.gridVisible !== undefined) {
            gridVisibleCheckbox.checked = status.gridVisible;
        }

        // 更新坐标轴可见性
        const axesVisibleCheckbox = this.container.querySelector('#axes-visible');
        if (axesVisibleCheckbox && status.axesVisible !== undefined) {
            axesVisibleCheckbox.checked = status.axesVisible;
        }

        // 更新线框模式
        const wireframeModeCheckbox = this.container.querySelector('#wireframe-mode');
        if (wireframeModeCheckbox && status.wireframeMode !== undefined) {
            wireframeModeCheckbox.checked = status.wireframeMode;
        }

        // 更新地形可见性
        const terrainVisibleCheckbox = this.container.querySelector('#terrain-visible');
        if (terrainVisibleCheckbox && status.terrainVisible !== undefined) {
            terrainVisibleCheckbox.checked = status.terrainVisible;
        }
    }

    /**
     * 销毁UI
     */
    dispose() {
        this.isInitialized = false;
        this.container = null;
    }
}
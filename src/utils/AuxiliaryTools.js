import * as THREE from 'three';

/**
 * 辅助工具类
 * 管理网格和坐标轴信息，能跟随地形开关调整高度
 */
export class AuxiliaryTools {
    /**
     * 构造函数
     * @param {THREE.Scene} scene - Three.js场景对象
     * @param {Object} config - 配置参数
     */
    constructor(scene, config = {}) {
        this.scene = scene;
        this.config = config;
        
        // 初始化辅助对象
        this.auxiliaryGroup = new THREE.Group();
        this.scene.add(this.auxiliaryGroup);
        
        // 辅助对象状态
        this.visible = true;
        this.currentHeight = 0;
        
        // 初始化网格和坐标轴
        this.initGrid();
        this.initAxes();
    }
    
    /**
     * 初始化网格
     */
    initGrid() {
        // 默认配置
        const gridConfig = {
            size: this.config.gridSize || 40000,
            divisions: this.config.gridDivisions || 40,
            colorCenterLine: 0x444444,
            colorGrid: 0x888888
        };
        
        // 创建网格辅助线
        this.gridHelper = new THREE.GridHelper(
            gridConfig.size,
            gridConfig.divisions,
            gridConfig.colorCenterLine,
            gridConfig.colorGrid
        );
        
        // 设置网格位置
        this.gridHelper.position.y = this.currentHeight;
        
        // 添加到辅助组
        this.auxiliaryGroup.add(this.gridHelper);
        
        console.log('Grid initialized with size:', gridConfig.size, 'divisions:', gridConfig.divisions);
    }
    
    /**
     * 初始化坐标轴
     */
    initAxes() {
        // 默认配置
        const axesConfig = {
            size: this.config.axesSize || 5000,
            colorX: 0xff0000,
            colorY: 0x00ff00,
            colorZ: 0x0000ff
        };
        
        // 创建坐标轴辅助线
        this.axesHelper = new THREE.AxesHelper(axesConfig.size);
        
        // 设置坐标轴位置
        this.axesHelper.position.y = this.currentHeight;
        
        // 添加到辅助组
        this.auxiliaryGroup.add(this.axesHelper);
        
        console.log('Axes initialized with size:', axesConfig.size);
    }
    
    /**
     * 设置辅助工具的高度
     * @param {number} height - 高度值
     */
    setHeight(height) {
        this.currentHeight = height;
        
        // 更新网格和坐标轴的位置
        if (this.gridHelper) {
            this.gridHelper.position.y = height;
        }
        
        if (this.axesHelper) {
            this.axesHelper.position.y = height;
        }
        
        console.log('Auxiliary tools height updated to:', height);
    }
    
    /**
     * 切换辅助工具的可见性
     */
    toggleVisibility() {
        this.visible = !this.visible;
        this.auxiliaryGroup.visible = this.visible;
    }
    
    /**
     * 设置辅助工具的可见性
     * @param {boolean} visible - 是否可见
     */
    setVisibility(visible) {
        this.visible = visible;
        this.auxiliaryGroup.visible = this.visible;
    }
    
    /**
     * 跟随地形开关调整高度
     * @param {boolean} terrainVisible - 地形是否可见
     * @param {number} height - 地形高程
     */
    followTerrain(terrainVisible, height = 0) {
        if (terrainVisible) {
            // 地形可见时，辅助工具高度设置为地形高程
            this.setHeight(height);
        } else {
            // 地形不可见时，辅助工具高度设置为平坦地面高度
            this.setHeight(0);
        }
    }
    
    /**
     * 更新高度
     * @param {number} height - 新的高度值
     */
    updateHeight(height) {
        this.setHeight(height);
    }
    
    /**
     * 更新网格大小
     * @param {number} size - 网格大小
     * @param {number} divisions - 网格细分数量
     */
    updateGrid(size, divisions) {
        if (this.gridHelper) {
            // 移除旧网格
            this.auxiliaryGroup.remove(this.gridHelper);
            
            // 创建新网格
            this.gridHelper = new THREE.GridHelper(
                size,
                divisions,
                this.gridHelper.material.color1,
                this.gridHelper.material.color2
            );
            
            // 设置位置
            this.gridHelper.position.y = this.currentHeight;
            
            // 添加到辅助组
            this.auxiliaryGroup.add(this.gridHelper);
            
            console.log('Grid updated with size:', size, 'divisions:', divisions);
        }
    }
    
    /**
     * 更新坐标轴大小
     * @param {number} size - 坐标轴大小
     */
    updateAxes(size) {
        if (this.axesHelper) {
            // 移除旧坐标轴
            this.auxiliaryGroup.remove(this.axesHelper);
            
            // 创建新坐标轴
            this.axesHelper = new THREE.AxesHelper(size);
            
            // 设置位置
            this.axesHelper.position.y = this.currentHeight;
            
            // 添加到辅助组
            this.auxiliaryGroup.add(this.axesHelper);
            
            console.log('Axes updated with size:', size);
        }
    }
    
    /**
     * 获取辅助工具组
     * @returns {THREE.Group} 辅助工具组对象
     */
    getAuxiliaryGroup() {
        return this.auxiliaryGroup;
    }
    
    /**
     * 获取网格辅助线
     * @returns {THREE.GridHelper} 网格辅助线对象
     */
    getGridHelper() {
        return this.gridHelper;
    }
    
    /**
     * 获取坐标轴辅助线
     * @returns {THREE.AxesHelper} 坐标轴辅助线对象
     */
    getAxesHelper() {
        return this.axesHelper;
    }
    
    /**
     * 销毁辅助工具
     */
    dispose() {
        // 移除辅助组
        this.scene.remove(this.auxiliaryGroup);
        
        // 清空引用
        this.gridHelper = null;
        this.axesHelper = null;
        this.auxiliaryGroup = null;
        
        console.log('Auxiliary tools disposed');
    }
}
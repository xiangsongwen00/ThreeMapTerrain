import * as THREE from 'three';

/**
 * 相机工具类，用于禁止相机进入地下
 * 禁止相机进入地下（分为无地形和有地形两个状态）
 */
export class CameraTool {
    /**
     * 构造函数
     * @param {Object} options - 配置选项
     * @param {THREE.PerspectiveCamera} options.camera - Three.js相机实例
     * @param {RGBTerrain} options.rgbTerrain - RGBTerrain实例，用于获取地形信息（可选）
     */
    constructor(options) {
        this.options = {
            camera: null,
            rgbTerrain: null,
            ...options
        };

        this.camera = this.options.camera;
        this.rgbTerrain = this.options.rgbTerrain;

        // 地下限制相关
        this.groundLevel = 0; // 默认地面高度
        this.hasTerrain = false; // 默认无地形
    }

    /**
     * 设置是否有地形
     * @param {boolean} hasTerrain - 是否有地形
     */
    setHasTerrain(hasTerrain) {
        this.hasTerrain = hasTerrain;
    }

    /**
     * 更新相机位置，禁止相机进入地下
     */
    updateCameraPosition() {
        if (!this.camera) return;

        // 保存当前相机位置
        const currentPos = this.camera.position.clone();

        // 禁止相机进入地下
        this.restrictCameraFromUnderground();

        // 如果相机位置发生变化，更新相机位置
        if (!this.camera.position.equals(currentPos)) {
            this.camera.position.copy(this.camera.position);
        }
    }

    /**
     * 禁止相机进入地下
     */
    restrictCameraFromUnderground() {
        if (!this.camera) return;

        // 获取相机位置
        const cameraY = this.camera.position.y;

        // 计算最小Y值
        let minY = this.groundLevel;

        if (this.hasTerrain && this.rgbTerrain) {
            // 有地形状态：获取相机下方的地形高度
            const terrainHeight = this.getTerrainHeightAtCamera();
            minY = terrainHeight + 10; // 相机距离地形至少10米
        } else {
            // 无地形状态：禁止相机低于地面
            minY = this.groundLevel + 10; // 相机距离地面至少10米
        }

        // 限制相机Y坐标
        if (cameraY < minY) {
            this.camera.position.y = minY;
        }
    }

    /**
     * 获取相机下方的地形高度
     * @returns {number} 地形高度
     */
    getTerrainHeightAtCamera() {
        if (!this.rgbTerrain) return this.groundLevel;

        // 获取相机下方的地形高度
        const cameraX = this.camera.position.x;
        const cameraZ = this.camera.position.z;
        
        // 使用rgbTerrain的getTerrainHeight方法获取地形高度
        const terrainHeight = this.rgbTerrain.getTerrainHeight(cameraX, cameraZ);
        
        return terrainHeight || this.groundLevel;
    }
}

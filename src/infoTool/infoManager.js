import * as THREE from 'three';

/**
 * 信息记录管理类
 * 自动记录用户配置、地图瓦片请求、地形瓦片请求和相机限制范围等信息
 * 并提供下载成json的方法
 */
export class InfoManager {
    /**
     * 构造函数
     */
    constructor() {
        // 初始化信息对象
        this.info = {
            // 用户配置
            userConfig: {
                centerLon: 0,
                centerLat: 0,
                rangeEastWest: 0,
                rangeNorthSouth: 0,
                mapZoom: 0,
                terrainZoom: 0,
                timestamp: new Date().toISOString()
            },
            
            // 地图瓦片信息
            mapTiles: {
                requested: new Set(),  // 请求的瓦片索引集合
                loaded: new Set(),     // 加载成功的瓦片索引集合
                failed: new Set(),      // 加载失败的瓦片索引集合
                bounds: null,           // 瓦片范围
                totalCount: 0           // 总瓦片数
            },
            
            // 地形瓦片信息
            terrainTiles: {
                requested: new Set(),  // 请求的瓦片索引集合
                loaded: new Set(),     // 加载成功的瓦片索引集合
                failed: new Set(),      // 加载失败的瓦片索引集合
                bounds: null,           // 瓦片范围
                totalCount: 0           // 总瓦片数
            },
            
            // 相机信息
            cameraInfo: {
                position: null,         // 相机位置
                target: null,           // 相机目标
                bounds: null,           // 相机限制范围
                hasTerrain: false       // 是否有地形
            },
            
            // 场景信息
            sceneInfo: {
                initialized: false,     // 场景是否初始化
                hasMap: false,          // 是否加载了地图
                hasTerrain: false,      // 是否加载了地形
                mapLoaded: false,       // 地图是否加载完成
                terrainLoaded: false,   // 地形是否加载完成
                timestamp: new Date().toISOString()
            }
        };
    }
    
    /**
     * 更新用户配置
     * @param {Object} config - 用户配置对象
     */
    updateUserConfig(config) {
        this.info.userConfig = {
            ...this.info.userConfig,
            ...config,
            timestamp: new Date().toISOString()
        };
     
    }
    
    /**
     * 更新地图瓦片范围
     * @param {Object} bounds - 瓦片范围对象 {minX, maxX, minY, maxY}
     */
    updateMapTileBounds(bounds) {
        this.info.mapTiles.bounds = bounds;
        this.info.mapTiles.totalCount = (bounds.maxX - bounds.minX + 1) * (bounds.maxY - bounds.minY + 1);
   
    }
    
    /**
     * 更新地形瓦片范围
     * @param {Object} bounds - 瓦片范围对象 {minX, maxX, minY, maxY}
     */
    updateTerrainTileBounds(bounds) {
        this.info.terrainTiles.bounds = bounds;
        this.info.terrainTiles.totalCount = (bounds.maxX - bounds.minX + 1) * (bounds.maxY - bounds.minY + 1);
  
    }
    
    /**
     * 添加请求的地图瓦片
     * @param {string} tileKey - 瓦片索引键
     */
    addRequestedMapTile(tileKey) {
        this.info.mapTiles.requested.add(tileKey);
    }
    
    /**
     * 添加请求的地形瓦片
     * @param {string} tileKey - 瓦片索引键
     */
    addRequestedTerrainTile(tileKey) {
        this.info.terrainTiles.requested.add(tileKey);
    }
    
    /**
     * 添加加载成功的地图瓦片
     * @param {string} tileKey - 瓦片索引键
     */
    addLoadedMapTile(tileKey) {
        this.info.mapTiles.loaded.add(tileKey);
    }
    
    /**
     * 添加加载成功的地形瓦片
     * @param {string} tileKey - 瓦片索引键
     */
    addLoadedTerrainTile(tileKey) {
        this.info.terrainTiles.loaded.add(tileKey);
    }
    
    /**
     * 添加加载失败的地图瓦片
     * @param {string} tileKey - 瓦片索引键
     */
    addFailedMapTile(tileKey) {
        this.info.mapTiles.failed.add(tileKey);
    }
    
    /**
     * 添加加载失败的地形瓦片
     * @param {string} tileKey - 瓦片索引键
     */
    addFailedTerrainTile(tileKey) {
        this.info.terrainTiles.failed.add(tileKey);
    }
    
    /**
     * 更新相机信息
     * @param {THREE.Vector3} position - 相机位置
     * @param {THREE.Vector3} target - 相机目标
     * @param {Object} bounds - 相机限制范围
     */
    updateCameraInfo(position, target, bounds) {
        this.info.cameraInfo = {
            position: position ? {
                x: position.x,
                y: position.y,
                z: position.z
            } : null,
            target: target ? {
                x: target.x,
                y: target.y,
                z: target.z
            } : null,
            bounds: bounds,
            hasTerrain: this.info.sceneInfo.hasTerrain
        };
    }
    
    /**
     * 设置是否有地形
     * @param {boolean} hasTerrain - 是否有地形
     */
    setHasTerrain(hasTerrain) {
        this.info.cameraInfo.hasTerrain = hasTerrain;
        this.info.sceneInfo.hasTerrain = hasTerrain;
    }
    
    /**
     * 设置地图加载状态
     * @param {boolean} loaded - 地图是否加载完成
     */
    setMapLoaded(loaded) {
        this.info.sceneInfo.mapLoaded = loaded;
        this.info.sceneInfo.hasMap = loaded;
    }
    
    /**
     * 设置地形加载状态
     * @param {boolean} loaded - 地形是否加载完成
     */
    setTerrainLoaded(loaded) {
        this.info.sceneInfo.terrainLoaded = loaded;
        this.info.sceneInfo.hasTerrain = loaded;
    }
    
    /**
     * 设置场景初始化状态
     * @param {boolean} initialized - 场景是否初始化
     */
    setSceneInitialized(initialized) {
        this.info.sceneInfo.initialized = initialized;
        if (initialized) {
            this.info.sceneInfo.timestamp = new Date().toISOString();
        }
    }
    
    /**
     * 获取信息对象的JSON表示
     * @returns {string} JSON字符串
     */
    toJSON() {
        // 转换Set为Array，因为Set不能直接序列化
        const infoForJSON = {
            ...this.info,
            mapTiles: {
                ...this.info.mapTiles,
                requested: Array.from(this.info.mapTiles.requested),
                loaded: Array.from(this.info.mapTiles.loaded),
                failed: Array.from(this.info.mapTiles.failed)
            },
            terrainTiles: {
                ...this.info.terrainTiles,
                requested: Array.from(this.info.terrainTiles.requested),
                loaded: Array.from(this.info.terrainTiles.loaded),
                failed: Array.from(this.info.terrainTiles.failed)
            }
        };
        
        return JSON.stringify(infoForJSON, null, 2);
    }
    
    /**
     * 下载信息为JSON文件
     * @param {string} [filename] - 文件名，默认为当前时间戳
     */
    downloadJSON(filename) {
        const jsonStr = this.toJSON();
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || `scene_info_${new Date().getTime()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
     
    }
    
    /**
     * 重置信息对象
     */
    reset() {
        this.info = {
            userConfig: {
                centerLon: 0,
                centerLat: 0,
                rangeEastWest: 0,
                rangeNorthSouth: 0,
                mapZoom: 0,
                terrainZoom: 0,
                timestamp: new Date().toISOString()
            },
            mapTiles: {
                requested: new Set(),
                loaded: new Set(),
                failed: new Set(),
                bounds: null,
                totalCount: 0
            },
            terrainTiles: {
                requested: new Set(),
                loaded: new Set(),
                failed: new Set(),
                bounds: null,
                totalCount: 0
            },
            cameraInfo: {
                position: null,
                target: null,
                bounds: null,
                hasTerrain: false
            },
            sceneInfo: {
                initialized: false,
                hasMap: false,
                hasTerrain: false,
                mapLoaded: false,
                terrainLoaded: false,
                timestamp: new Date().toISOString()
            }
        };
        console.log('场景信息已重置');
    }
    
    /**
     * 打印信息摘要
     */
    printSummary() {
        console.log('====================================');
        console.log('场景信息摘要：');
        console.log('====================================');
        console.log('用户配置：');
        console.log('  中心经度：', this.info.userConfig.centerLon);
        console.log('  中心纬度：', this.info.userConfig.centerLat);
        console.log('  东西范围：', this.info.userConfig.rangeEastWest);
        console.log('  南北范围：', this.info.userConfig.rangeNorthSouth);
        console.log('  地图层级：', this.info.userConfig.mapZoom);
        console.log('  地形层级：', this.info.userConfig.terrainZoom);

        
        console.log('====================================');
    }
}

// 创建全局实例
export const infoManager = new InfoManager();

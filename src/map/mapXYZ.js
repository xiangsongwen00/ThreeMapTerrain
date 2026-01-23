import * as THREE from 'three';
import { getMathProj } from '../Math/mathProj.js';
import { infoManager } from '../infoTool/infoManager.js';

/**
 * XYZ瓦片地图加载器类
 * 用于加载谷歌、天地图等XYZ格式的瓦片地图
 * 支持Web墨卡托投影，适配Three.js场景
 * 新增：支持通过Shader拉伸地图瓦片的高程
 */
export class MapXYZ {
    /**
     * 构造函数
     * @param {Object} options - 配置选项
     * @param {THREE.Scene} options.scene - Three.js场景
     * @param {number} options.centerLon - 中心经度
     * @param {number} options.centerLat - 中心纬度
     * @param {number} options.rangeEastWest - 东西范围（米）
     * @param {number} options.rangeNorthSouth - 南北范围（米）
     * @param {number} options.zoom - 瓦片缩放级别
     * @param {string} options.tileUrl - 瓦片URL模板，支持{x}, {y}, {z}占位符
     * @param {boolean} options.flipY - 是否翻转Y轴
     */
    /**
     * 构造函数
     * @param {Object} options - 配置选项
     * @param {THREE.Scene} options.scene - Three.js场景
     * @param {number} options.centerLon - 中心经度
     * @param {number} options.centerLat - 中心纬度
     * @param {number} options.rangeEastWest - 东西范围（米）
     * @param {number} options.rangeNorthSouth - 南北范围（米）
     * @param {number} options.zoom - 瓦片缩放级别
     * @param {number} [options.terrainZoom] - 地形瓦片缩放级别（可选）
     * @param {string} options.tileUrl - 瓦片URL模板，支持{x}, {y}, {z}占位符
     * @param {boolean} options.flipY - 是否翻转Y轴（可选，默认自动检测）
     */
    constructor(options) {
        // 预定义瓦片服务的flipY设置
        const TILE_SERVICE_CONFIG = {
            'google.com': { flipY: true },           // Google Maps使用XYZ格式
            'openstreetmap.org': { flipY: true },    // OpenStreetMap使用XYZ格式
            'geovisearth.com': { flipY: false },    // 地形RGB瓦片通常使用TMS格式
            'tms': { flipY: false },                 // URL中包含tms关键词的瓦片服务
        };
        
        // 自动检测flipY设置
        const autoFlipY = (() => {
            if (options.flipY !== undefined) {
                return options.flipY; // 如果用户显式设置，使用用户设置的值
            }
            
            // 根据瓦片URL自动检测
            const url = options.tileUrl.toLowerCase();
            for (const [keyword, config] of Object.entries(TILE_SERVICE_CONFIG)) {
                if (url.includes(keyword)) {
                    return config.flipY;
                }
            }
            
            // 默认值
            return true; // 默认使用XYZ格式
        })();

        this.options = {
            centerLon: 0,
            centerLat: 0,
            rangeEastWest: 3000,
            rangeNorthSouth: 2500,
            zoom: 17,
            terrainZoom: undefined, // 地形瓦片缩放级别
            tileUrl: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
            flipY: autoFlipY, // 使用自动检测或用户设置的值
            ...options
        };

        this.scene = this.options.scene;
        this.mathProj = getMathProj();
        this.loadedTextures = new Map();
        
        // 计算场景范围和瓦片范围
        this.initBounds();
    }

    /**
     * 初始化场景范围和瓦片范围
     */
    initBounds() {

        
        // 中心墨卡托坐标
        this.centerMercator = this.mathProj.lonLatToMercator(this.options.centerLon, this.options.centerLat);
        console.log('场景中心墨卡托坐标（东/北）：', this.centerMercator);

        // 墨卡托边界
        this.mercatorBounds = {
            west: this.centerMercator.x - this.options.rangeEastWest,
            east: this.centerMercator.x + this.options.rangeEastWest,
            south: this.centerMercator.y - this.options.rangeNorthSouth,
            north: this.centerMercator.y + this.options.rangeNorthSouth
        };
        console.log('墨卡托边界：', this.mercatorBounds);
        
        // 计算四个角落的墨卡托坐标
        const topLeftMercator = { x: this.mercatorBounds.west, y: this.mercatorBounds.north };
        const topRightMercator = { x: this.mercatorBounds.east, y: this.mercatorBounds.north };
        const bottomLeftMercator = { x: this.mercatorBounds.west, y: this.mercatorBounds.south };
        const bottomRightMercator = { x: this.mercatorBounds.east, y: this.mercatorBounds.south };
        
        // 转换为经纬度
        const topLeftLonLat = this.mathProj.mercatorToLonLat(topLeftMercator.x, topLeftMercator.y);
        const topRightLonLat = this.mathProj.mercatorToLonLat(topRightMercator.x, topRightMercator.y);
        const bottomLeftLonLat = this.mathProj.mercatorToLonLat(bottomLeftMercator.x, bottomLeftMercator.y);
        const bottomRightLonLat = this.mathProj.mercatorToLonLat(bottomRightMercator.x, bottomRightMercator.y);
        
        // 地理边界（取极值）
        this.geoBounds = {
            west: Math.min(topLeftLonLat.lon, topRightLonLat.lon, bottomLeftLonLat.lon, bottomRightLonLat.lon),
            east: Math.max(topLeftLonLat.lon, topRightLonLat.lon, bottomLeftLonLat.lon, bottomRightLonLat.lon),
            south: Math.min(topLeftLonLat.lat, topRightLonLat.lat, bottomLeftLonLat.lat, bottomRightLonLat.lat),
            north: Math.max(topLeftLonLat.lat, topRightLonLat.lat, bottomLeftLonLat.lat, bottomRightLonLat.lat)
        };

        
        // 计算基础瓦片范围
        const topLeftTile = this.mathProj.lonLatToTile(this.geoBounds.west, this.geoBounds.north, this.options.zoom);
        const bottomRightTile = this.mathProj.lonLatToTile(this.geoBounds.east, this.geoBounds.south, this.options.zoom);
        const centerTile = this.mathProj.lonLatToTile(this.options.centerLon, this.options.centerLat, this.options.zoom);
        

        
        // 如果提供了地形缩放级别，需要考虑地形瓦片对应的卫星瓦片范围
        if (this.options.terrainZoom !== undefined) {

            // 计算地形瓦片在当前地图级别下的对应范围
            const zoomDiff = this.options.zoom - this.options.terrainZoom;
            
            if (zoomDiff > 0) {
                // 地图级别高于地形级别，一个地形瓦片对应多个卫星瓦片
                // 计算地形瓦片的数量（基于场景范围）
                // 1. 先计算地形级别的瓦片范围
                const terrainTopLeftTile = this.mathProj.lonLatToTile(this.geoBounds.west, this.geoBounds.north, this.options.terrainZoom);
                const terrainBottomRightTile = this.mathProj.lonLatToTile(this.geoBounds.east, this.geoBounds.south, this.options.terrainZoom);
 
                
                // 2. 每个地形瓦片对应2^zoomDiff × 2^zoomDiff个卫星瓦片
                const tilesPerTerrain = Math.pow(2, zoomDiff);
                
                // 3. 计算卫星瓦片的实际需要范围
                // 从地形瓦片范围转换为卫星瓦片范围
                const satMinX = terrainTopLeftTile.x * tilesPerTerrain;
                const satMaxX = (terrainBottomRightTile.x + 1) * tilesPerTerrain - 1;
                const satMinY = terrainTopLeftTile.y * tilesPerTerrain;
                const satMaxY = (terrainBottomRightTile.y + 1) * tilesPerTerrain - 1;
                

                
                // 4. 合并原始卫星瓦片范围和地形转换后的范围
                const minX = Math.min(topLeftTile.x, satMinX);
                const maxX = Math.max(bottomRightTile.x, satMaxX);
                const minY = Math.min(topLeftTile.y, satMinY);
                const maxY = Math.max(bottomRightTile.y, satMaxY);
                
                this.tileRange = {
                    minX: minX,
                    maxX: maxX,
                    minY: minY,
                    maxY: maxY
                };
            } else {
                // 地图级别等于或低于地形级别，使用原始瓦片范围
                this.tileRange = {
                    minX: Math.min(topLeftTile.x, bottomRightTile.x, centerTile.x),
                    maxX: Math.max(topLeftTile.x, bottomRightTile.x, centerTile.x),
                    minY: Math.min(topLeftTile.y, bottomRightTile.y, centerTile.y),
                    maxY: Math.max(topLeftTile.y, bottomRightTile.y, centerTile.y)
                };
            }
        } else {
            // 没有提供地形缩放级别，使用原始瓦片范围
            this.tileRange = {
                minX: Math.min(topLeftTile.x, bottomRightTile.x, centerTile.x),
                maxX: Math.max(topLeftTile.x, bottomRightTile.x, centerTile.x),
                minY: Math.min(topLeftTile.y, bottomRightTile.y, centerTile.y),
                maxY: Math.max(topLeftTile.y, bottomRightTile.y, centerTile.y)
            };
        }
        
        // 如果范围无效（可能是小范围场景），确保至少包含中心瓦片
        if (this.tileRange.minX > this.tileRange.maxX || this.tileRange.minY > this.tileRange.maxY) {
            this.tileRange = {
                minX: centerTile.x,
                maxX: centerTile.x,
                minY: centerTile.y,
                maxY: centerTile.y
            };
        }
        
        // 统计总瓦片数
        const totalTiles = (this.tileRange.maxX - this.tileRange.minX + 1) * (this.tileRange.maxY - this.tileRange.minY + 1);

        
        // 输出每个瓦片的详细信息（限制输出数量）

        let count = 0;
        for (let x = this.tileRange.minX; x <= this.tileRange.maxX && count < 5; x++) {
            for (let y = this.tileRange.minY; y <= this.tileRange.maxY && count < 5; y++) {
                const tileBounds = this.mathProj.tileToMercatorBounds(x, y, this.options.zoom);
                console.log(`  瓦片[${x},${y}] 墨卡托范围：`, tileBounds);
                count++;
            }
        }
        if (totalTiles > 5) {
            console.log(`  ... 还有 ${totalTiles - 5} 个瓦片未显示`);
        }
        

    }

    /**
     * 墨卡托转Three.js局部坐标
     * 与mathProj.mercatorToThree保持一致
     * @param {number} mercatorX - 墨卡托X坐标
     * @param {number} mercatorY - 墨卡托Y坐标
     * @returns {Object} Three.js局部坐标
     */
    mercatorToThreeLocal(mercatorX, mercatorY) {
        const threeX = mercatorX - this.centerMercator.x; // 东 -> X
        const threeZ = -(mercatorY - this.centerMercator.y); // 北 -> -Z
        return { x: threeX, z: threeZ };
    }

    /**
     * 新增：创建瓦片网格（抽离原load方法中的网格创建逻辑，替换为Shader材质）
     * @param {THREE.Texture} texture - 地图瓦片纹理
     * @param {number} tileWidth - 瓦片宽度（米）
     * @param {number} tileHeight - 瓦片高度（米）
     * @param {Object} tileLocalPos - 瓦片的Three.js局部坐标 {x, z}
     * @returns {THREE.Mesh} 瓦片网格
     */
    createTileMesh(texture, tileWidth, tileHeight, tileLocalPos) {
        const geometry = new THREE.PlaneGeometry(tileWidth, tileHeight);
        
        // 使用基础材质
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.DoubleSide,
            transparent: true
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2; // 旋转到X-Z平面
        mesh.position.set(tileLocalPos.x, 0, tileLocalPos.z);
        
        return mesh;
    }

    /**
     * 加载卫星影像瓦片（仅加载纹理，不创建网格）
     * @returns {Promise} 加载完成的Promise
     */
    load() {
        return new Promise((resolve, reject) => {
            const textureLoader = new THREE.TextureLoader();
            let loadedCount = 0;
            let totalTiles = 0;

            // 计算总瓦片数
            for (let x = this.tileRange.minX; x <= this.tileRange.maxX; x++) {
                for (let y = this.tileRange.minY; y <= this.tileRange.maxY; y++) {
                    totalTiles++;
                }
            }

            if (totalTiles === 0) {
                resolve();
                return;
            }

            // 遍历加载瓦片
            for (let tileX = this.tileRange.minX; tileX <= this.tileRange.maxX; tileX++) {
                for (let tileY = this.tileRange.minY; tileY <= this.tileRange.maxY; tileY++) {
                    // 严格遵循：局部坐标（东，北，天）对应three的（X, Y, -Z）
                    // 墨卡托（东，北，天）对应three的（X, Y, -Z）
                    
                    // 计算瓦片Y坐标：根据flipY设置决定是否需要转换为TMS坐标
                    let urlTileY = tileY;
                    if (!this.options.flipY) {
                        // 如果是TMS格式，需要将XYZ坐标转换为TMS坐标
                        // TMS格式中，瓦片Y坐标从下往上计数，与XYZ格式相反
                        urlTileY = Math.pow(2, this.options.zoom) - 1 - tileY;
                    }
                    
                    // 构建瓦片URL
                    const tileUrl = this.options.tileUrl
                        .replace('{x}', tileX)
                        .replace('{y}', urlTileY)
                        .replace('{z}', this.options.zoom);
                    
                    // 存储时使用原始瓦片坐标
            const tileKey = `${tileX}_${tileY}_${this.options.zoom}`;
            
            // 检查瓦片是否已加载
            if (this.loadedTextures.has(tileKey)) {
                infoManager.addRequestedMapTile(tileKey);
                infoManager.addLoadedMapTile(tileKey);
                loadedCount++;
                if (loadedCount === totalTiles) {
                    resolve();
                }
                continue;
            }

            // 添加请求的瓦片
            infoManager.addRequestedMapTile(tileKey);

            textureLoader.load(
                tileUrl,
                (texture) => {
                    // 设置纹理的flipY属性，与瓦片服务的flipY设置保持一致
                    // 这样可以确保纹理的Y轴方向与Three.js坐标系一致
                    texture.flipY = this.options.flipY;
                    
                    // 只存储纹理，不创建网格
                    this.loadedTextures.set(tileKey, texture);
                    
                    // 添加成功加载的瓦片
                    infoManager.addLoadedMapTile(tileKey);
                    
                    loadedCount++;
                    if (loadedCount === totalTiles) {
                        resolve();
                    }
                },
                undefined,
                (error) => {
                    console.error(`卫星瓦片加载失败 [${tileX}, ${urlTileY}, ${this.options.zoom}]:`, error);
                    
                    // 添加失败加载的瓦片
                    infoManager.addFailedMapTile(tileKey);
                    
                    loadedCount++;
                    if (loadedCount === totalTiles) {
                        resolve();
                    }
                }
            );
                }
            }
        });
    }

    /**
     * 获取所有加载的卫星纹理
     * @returns {Map} 加载的卫星纹理映射
     */
    getLoadedTextures() {
        return this.loadedTextures;
    }

    /**
     * 绘制卫星瓦片边界（亮绿色）
     * @param {THREE.Group} group - 边界容器组
     * @param {number} [offsetY=0] - Y轴偏移量，默认200米
     */
    drawTileBoundaries(group, offsetY = 200) {
        // 使用鲜艳的亮绿色，确保可见性
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00 });
        
        console.log(`开始绘制卫星瓦片边界，范围：[${this.tileRange.minX},${this.tileRange.maxX}]x[${this.tileRange.minY},${this.tileRange.maxY}]`);
        
        // 遍历所有瓦片
        for (let x = this.tileRange.minX; x <= this.tileRange.maxX; x++) {
            for (let y = this.tileRange.minY; y <= this.tileRange.maxY; y++) {
                const tileBounds = this.mathProj.tileToMercatorBounds(x, y, this.options.zoom);
                
                // 计算瓦片四个角的Three.js坐标
                const topLeft = this.mathProj.mercatorToThree(tileBounds.min.x, tileBounds.max.y);
                const topRight = this.mathProj.mercatorToThree(tileBounds.max.x, tileBounds.max.y);
                const bottomRight = this.mathProj.mercatorToThree(tileBounds.max.x, tileBounds.min.y);
                const bottomLeft = this.mathProj.mercatorToThree(tileBounds.min.x, tileBounds.min.y);
                
                // 将所有点的Y坐标设置为offsetY，确保在地形上方
                topLeft.y = offsetY;
                topRight.y = offsetY;
                bottomRight.y = offsetY;
                bottomLeft.y = offsetY;
                
                // 创建边界几何体
                const points = [
                    topLeft, topRight, bottomRight, bottomLeft, topLeft
                ];
                
                const geometry = new THREE.BufferGeometry().setFromPoints(points);
                const line = new THREE.LineLoop(geometry, lineMaterial);
                group.add(line);
                
                // 测试：添加一个红色标记点在瓦片中心，用于调试
                // const centerX = (topLeft.x + bottomRight.x) / 2;
                // const centerZ = (topLeft.z + bottomRight.z) / 2;
                // const markerGeometry = new THREE.SphereGeometry(2, 8, 8);
                // const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
                // const marker = new THREE.Mesh(markerGeometry, markerMaterial);
                // marker.position.set(centerX, offsetY, centerZ);
                // group.add(marker);
            }
        }
        
        const totalTiles = (this.tileRange.maxX - this.tileRange.minX + 1) * (this.tileRange.maxY - this.tileRange.minY + 1);
        console.log(`已绘制卫星瓦片边界：${totalTiles}个瓦片，Y轴偏移：${offsetY}米`);
    }

    /**
     * 清理资源
     */
    dispose() {
        // 释放所有加载的纹理
        for (const [key, texture] of this.loadedTextures) {
            texture.dispose();
        }
        this.loadedTextures.clear();
    }
}
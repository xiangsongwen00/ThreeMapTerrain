import * as THREE from 'three';
import { getMathProj } from '../Math/mathProj.js';
import { infoManager } from '../infoTool/infoManager.js';

/**
 * RGB地形加载器类（适配Mapbox RGB Terrain格式）
 * 临时：以RGB原色显示瓦片，添加中心标记验证拼接
 */
export class RGBTerrain {
    constructor(options) {
        this.options = {
            centerLon: 0,
            centerLat: 0,
            rangeEastWest: 3000,
            rangeNorthSouth: 2500,
            zoom: 13, 
            tileUrl: 'https://tiles1.geovisearth.com/base/v1/terrain-rgb/{z}/{x}/{y}?format=png&tmsIds=w&token=a1b140c94dba53eef3541ed85e72e2df16bfa63d8065f0d8a6e16604a035cbe0',
            tileSize: 256,
            segments: 64,
            renderTerrain: true, // 控制是否渲染地形
            satelliteTextures: new Map(), // 新增：卫星影像纹理映射
            ...options
        };

        this.scene = this.options.scene;
        this.mathProj = getMathProj();
        this.renderTerrain = this.options.renderTerrain; // 存储地形渲染状态
        this.satelliteTextures = this.options.satelliteTextures; // 存储卫星影像纹理
        this.loadedTerrainTiles = new Map(); // 存储地形瓦片
        this.loadedMarkers = new Map();      // 存储瓦片中心标记
        this.terrainGroup = new THREE.Group(); // 地形分组
        this.markerGroup = new THREE.Group();  // 标记分组
        this.scene.add(this.terrainGroup);
        this.scene.add(this.markerGroup);

        this.initBounds();
    }

    /**
     * 初始化地形范围（和MapXYZ坐标逻辑完全一致）
     */
    initBounds() {
        console.log('====================================');


        // 中心墨卡托坐标
        this.centerMercator = this.mathProj.lonLatToMercator(this.options.centerLon, this.options.centerLat);
        console.log('地形中心墨卡托坐标（东/北）：', this.centerMercator);

        // 墨卡托边界
        this.mercatorBounds = {
            west: this.centerMercator.x - this.options.rangeEastWest,
            east: this.centerMercator.x + this.options.rangeEastWest,
            south: this.centerMercator.y - this.options.rangeNorthSouth,
            north: this.centerMercator.y + this.options.rangeNorthSouth
        };
        
        // 计算墨卡托边界的经纬度
        const westLat = this.mathProj.mercatorToLonLat(this.mercatorBounds.west, this.centerMercator.y).lat;
        const eastLat = this.mathProj.mercatorToLonLat(this.mercatorBounds.east, this.centerMercator.y).lat;
        const southLon = this.mathProj.mercatorToLonLat(this.centerMercator.x, this.mercatorBounds.south).lon;
        const northLon = this.mathProj.mercatorToLonLat(this.centerMercator.x, this.mercatorBounds.north).lon;
 

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


        // 地形瓦片范围
        const topLeftTile = this.mathProj.lonLatToTile(this.geoBounds.west, this.geoBounds.north, this.options.zoom);
        const bottomRightTile = this.mathProj.lonLatToTile(this.geoBounds.east, this.geoBounds.south, this.options.zoom);

        
        // 计算中心瓦片
        const centerTile = this.mathProj.lonLatToTile(this.options.centerLon, this.options.centerLat, this.options.zoom);


        // 计算边界瓦片
        const westTile = this.mathProj.lonLatToTile(this.geoBounds.west, this.options.centerLat, this.options.zoom);
        const eastTile = this.mathProj.lonLatToTile(this.geoBounds.east, this.options.centerLat, this.options.zoom);
        const southTile = this.mathProj.lonLatToTile(this.options.centerLon, this.geoBounds.south, this.options.zoom);
        const northTile = this.mathProj.lonLatToTile(this.options.centerLon, this.geoBounds.north, this.options.zoom);

        
        // 确保瓦片范围有效，至少包含一个瓦片
        let minX = Math.min(topLeftTile.x, bottomRightTile.x, westTile.x, eastTile.x, centerTile.x);
        let maxX = Math.max(topLeftTile.x, bottomRightTile.x, westTile.x, eastTile.x, centerTile.x);
        let minY = Math.min(topLeftTile.y, bottomRightTile.y, southTile.y, northTile.y, centerTile.y);
        let maxY = Math.max(topLeftTile.y, bottomRightTile.y, southTile.y, northTile.y, centerTile.y);
        
        // 如果范围无效（可能是小范围场景），确保至少包含中心瓦片
        if (minX > maxX || minY > maxY) {
            minX = centerTile.x;
            maxX = centerTile.x;
            minY = centerTile.y;
            maxY = centerTile.y;
        }
        
        this.tileRange = {
            minX: minX,
            maxX: maxX,
            minY: minY,
            maxY: maxY
        };
        
        // 统计总瓦片数
        const totalTiles = (this.tileRange.maxX - this.tileRange.minX + 1) * (this.tileRange.maxY - this.tileRange.minY + 1);
        console.log(`最终地形瓦片范围（${this.options.zoom}级）：`, this.tileRange);
        console.log('总瓦片数：', totalTiles);
        
        // 输出每个瓦片的详细信息
        console.log('瓦片详情：');
        for (let x = this.tileRange.minX; x <= this.tileRange.maxX; x++) {
            for (let y = this.tileRange.minY; y <= this.tileRange.maxY; y++) {
                const tileBounds = this.mathProj.tileToMercatorBounds(x, y, this.options.zoom);

                
                // 计算瓦片中心点的Three.js坐标
                const tileCenterMercator = {
                    x: (tileBounds.min.x + tileBounds.max.x) / 2,
                    y: (tileBounds.min.y + tileBounds.max.y) / 2
                };
                const tileCenterThree = this.mathProj.mercatorToThree(tileCenterMercator.x, tileCenterMercator.y);

            }
        }
    }

    /**
     * 墨卡托转Three.js局部坐标
     * 与mathProj.mercatorToThree保持一致
     */
    mercatorToThreeLocal(mercatorX, mercatorY) {
        const threeX = mercatorX - this.centerMercator.x; // 东 -> X
        const threeZ = -(mercatorY - this.centerMercator.y); // 北 -> -Z
        return { x: threeX, z: threeZ };
    }

    /**
     * 解析RGB纹理为高程数据
     */
    parseRGBToElevation(texture) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = this.options.tileSize;
        canvas.height = this.options.tileSize;
        ctx.drawImage(texture.image, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;
        
        const elevationData = [];
        const tileSize = this.options.tileSize;
        for (let row = 0; row < tileSize; row++) {
            elevationData[row] = [];
            for (let col = 0; col < tileSize; col++) {
                const idx = (row * tileSize + col) * 4;
                const r = pixels[idx];
                const g = pixels[idx + 1];
                const b = pixels[idx + 2];
                // Mapbox RGB Terrain 格式：-10000 + ((R * 256 * 256 + G * 256 + B) * 0.1)
                const elevation = -10000 + ((r * 256 * 256 + g * 256 + b) * 0.1);
                elevationData[row][col] = elevation;
            }
        }
        return elevationData;
    }
    
    /**
     * 从高程数据创建高精度灰度纹理
     */
    createGrayTextureFromElevation(elevationData) {
        const tileSize = this.options.tileSize;
        
        // 计算高程范围
        let minElevation = Infinity;
        let maxElevation = -Infinity;
        for (let row = 0; row < tileSize; row++) {
            for (let col = 0; col < tileSize; col++) {
                const elevation = elevationData[row][col];
                minElevation = Math.min(minElevation, elevation);
                maxElevation = Math.max(maxElevation, elevation);
            }
        }
        
        // 创建Float32Array存储归一化的高程数据
        // 注意：WebGL纹理的(0,0)在左下角，而高程数据是从上到下存储的
        // 所以需要反转行顺序，确保纹理采样时得到正确的高程
        const floatData = new Float32Array(tileSize * tileSize);
        const elevationRange = maxElevation - minElevation;
        
        for (let row = 0; row < tileSize; row++) {
            for (let col = 0; col < tileSize; col++) {
                // 反转行顺序：将第row行存储到纹理的第(tileSize-1-row)行
                const textureRow = tileSize - 1 - row;
                const elevation = elevationData[row][col];
                // 归一化到0-1范围
                const normalized = (elevation - minElevation) / (elevationRange || 1);
                // 存储归一化的浮点值
                floatData[textureRow * tileSize + col] = normalized;
            }
        }
        
        // 使用Float32Array创建高精度纹理
        const texture = new THREE.DataTexture(
            floatData,
            tileSize,
            tileSize,
            THREE.RedFormat,
            THREE.FloatType
        );
        
        texture.needsUpdate = true;
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearFilter;
        texture.maxElevation = maxElevation;
        texture.minElevation = minElevation;
        
        return texture;
    }

    /**
     * 创建地形网格（根据RGB纹理生成真实高程，沿Y轴拉伸）
     * @param {Array} elevationData - 高程数据
     * @param {number} tileWidth - 瓦片宽度（米）
     * @param {number} tileHeight - 瓦片高度（米）
     * @param {THREE.Texture} texture - 原始RGB纹理
     * @param {THREE.Texture} satelliteTexture - 卫星影像纹理
     */
    createTerrainMesh(elevationData, tileWidth, tileHeight, texture, satelliteTexture = null) {
        const segments = this.options.segments;
        
        // 1. 创建平面几何体 - 默认在XY平面
        const geometry = new THREE.PlaneGeometry(tileWidth, tileHeight, segments, segments);
        
        // 2. 保存原始平面顶点位置（无高程）
        const originalPositions = [...geometry.attributes.position.array];
        
        // 3. 根据渲染状态决定是否应用高程
        const positions = geometry.attributes.position.array;
        const tileSize = this.options.tileSize;
        
        if (this.renderTerrain) {
            // 开启地形：应用高程数据
            for (let i = 0; i < positions.length; i += 3) {
                // 获取当前顶点的X和Y坐标（在平面中的位置）
                const x = positions[i];     // 平面X坐标
                const y = positions[i + 1];   // 平面Y坐标
                
                // 将平面坐标转换为高程数据索引（0-1范围）
                const u = (x + tileWidth / 2) / tileWidth;  // 转换为0-1范围
                const v = (y + tileHeight / 2) / tileHeight; // 转换为0-1范围
                
                // 使用双线性插值获取更精确的高程值，减少缝隙
                const elevation = this.bilinearInterpolateElevation(elevationData, u, v);
                
                // 修改Z坐标为高程值（此时Z是垂直于XY平面的方向）
                positions[i + 2] = elevation;
            }
        }
        
        // 4. 更新几何体
        geometry.attributes.position.needsUpdate = true;
        geometry.computeVertexNormals();
        
        // 5. 从高程数据创建灰度纹理（关键：在处理瓦片边缘后生成）
        const grayTexture = this.createGrayTextureFromElevation(elevationData);
        
        // 6. 创建材质，优先使用卫星纹理
        const material = new THREE.MeshStandardMaterial({
            map: satelliteTexture || grayTexture,    // 优先使用卫星纹理，否则使用灰度纹理
            side: THREE.DoubleSide,
            wireframe: false,    // 可改为true查看网格
            roughness: 0.8,      // 增加粗糙度
            metalness: 0.2       // 减少金属度
        });
        
        // 7. 创建网格并旋转
        const mesh = new THREE.Mesh(geometry, material);
        
        // 旋转-90度，使平面从XY平面变为XZ平面（Y轴向上）
        mesh.rotation.x = -Math.PI / 2;
        
        // 8. 保存高程数据、原始位置、纹理和瓦片信息
        mesh.userData = {
            elevationData: elevationData,
            originalPositions: originalPositions,
            grayTexture: grayTexture,
            satelliteTexture: satelliteTexture, // 保存卫星纹理
            tileWidth: tileWidth,
            tileHeight: tileHeight,
            tileSize: this.options.tileSize,
            segments: segments
        };
        
        return mesh;
    }
    
    /**
     * 使用双线性插值获取精确的高程值
     * @param {Array} elevationData - 高程数据数组
     * @param {number} u - 水平方向插值系数（0-1）
     * @param {number} v - 垂直方向插值系数（0-1）
     * @returns {number} 插值后的高程值
     */
    bilinearInterpolateElevation(elevationData, u, v) {
        const tileSize = this.options.tileSize;
        
        // 转换为高程数据索引范围（0到tileSize-1）
        const x = u * (tileSize - 1);
        const y = (1 - v) * (tileSize - 1); // 高程数据是从上到下存储的
        
        // 获取四个相邻点的坐标
        const x0 = Math.floor(x);
        const x1 = Math.min(x0 + 1, tileSize - 1);
        const y0 = Math.floor(y);
        const y1 = Math.min(y0 + 1, tileSize - 1);
        
        // 确保索引在有效范围内
        if (x0 < 0 || x1 >= tileSize || y0 < 0 || y1 >= tileSize) {
            return 0;
        }
        
        // 获取四个相邻点的高程值
        const z00 = elevationData[y0][x0];
        const z10 = elevationData[y0][x1];
        const z01 = elevationData[y1][x0];
        const z11 = elevationData[y1][x1];
        
        // 计算插值权重
        const tx = x - x0;
        const ty = y - y0;
        
        // 双线性插值计算
        const z0 = z00 * (1 - tx) + z10 * tx;
        const z1 = z01 * (1 - tx) + z11 * tx;
        const z = z0 * (1 - ty) + z1 * ty;
        
        return z;
    }

    /**
     * 创建瓦片中心标记（红色球体+编号标签）
     */
    createTileMarker(position, tileX, tileY) {
        // 1. 红色球体标记（中心点）
        const markerGeometry = new THREE.SphereGeometry(8, 16, 16);
        const markerMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xff0000, 
            transparent: true, 
            opacity: 0.9 
        });
        const marker = new THREE.Mesh(markerGeometry, markerMaterial);
        marker.position.set(position.x, 0.5, position.z); // 略微抬高，避免遮挡

        // 2. 瓦片编号标签
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(0, 0, 128, 64);
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ff0000';
        ctx.fillText(`[${tileX},${tileY}]`, 64, 32);

        const labelTexture = new THREE.CanvasTexture(canvas);
        const labelMaterial = new THREE.SpriteMaterial({ map: labelTexture });
        const label = new THREE.Sprite(labelMaterial);
        label.position.set(position.x, 20, position.z); // 标签在球体上方
        label.scale.set(50, 25, 1);

        // 组合标记和标签
        const markerGroup = new THREE.Group();
        markerGroup.add(marker);
        markerGroup.add(label);

        return markerGroup;
    }

    /**
     * 加载地形瓦片（核心方法）
     * @param {Map} satelliteTextures - 卫星影像纹理映射
     */
    load(satelliteTextures = new Map()) {
        return new Promise((resolve, reject) => {
            const textureLoader = new THREE.TextureLoader();
            let loadedCount = 0;
            let totalTiles = 0;
            const tileDataMap = new Map(); // 临时存储所有瓦片数据

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

            // 第一步：加载所有瓦片数据
            for (let tileX = this.tileRange.minX; tileX <= this.tileRange.maxX; tileX++) {
                for (let tileY = this.tileRange.minY; tileY <= this.tileRange.maxY; tileY++) {
                    const tileKey = `${tileX}_${tileY}_${this.options.zoom}`;
            
            if (this.loadedTerrainTiles.has(tileKey)) {
                infoManager.addRequestedTerrainTile(tileKey);
                infoManager.addLoadedTerrainTile(tileKey);
                loadedCount++;
                if (loadedCount === totalTiles) {
                    this.processTileEdges(tileDataMap);
                    this.renderAllTiles(tileDataMap, satelliteTextures);
                    resolve();
                }
                continue;
            }

            // 添加请求的瓦片
            infoManager.addRequestedTerrainTile(tileKey);
            
            // 构建瓦片URL
            const tileUrl = this.options.tileUrl
                .replace('{z}', this.options.zoom)
                .replace('{x}', tileX)
                .replace('{y}', tileY);

            textureLoader.load(
                tileUrl,
                (texture) => {
                    try {
                        // 1. 计算瓦片墨卡托范围和尺寸
                        const tileTopLeftLonLat = this.mathProj.tileToLonLat(tileX, tileY, this.options.zoom);
                        const tileBottomRightLonLat = this.mathProj.tileToLonLat(tileX + 1, tileY + 1, this.options.zoom);
                        const tileTopLeftMercator = this.mathProj.lonLatToMercator(tileTopLeftLonLat.lon, tileTopLeftLonLat.lat);
                        const tileBottomRightMercator = this.mathProj.lonLatToMercator(tileBottomRightLonLat.lon, tileBottomRightLonLat.lat);
                        const tileWidth = tileBottomRightMercator.x - tileTopLeftMercator.x;
                        const tileHeight = tileTopLeftMercator.y - tileBottomRightMercator.y;
                        
                        // 2. 计算瓦片中心Three.js坐标
                        const tileCenterMercator = {
                            x: tileTopLeftMercator.x + tileWidth / 2,
                            y: tileBottomRightMercator.y + tileHeight / 2
                        };
                        const tileLocalPos = this.mercatorToThreeLocal(tileCenterMercator.x, tileCenterMercator.y);
                        
                        // 3. 解析高程
                        const elevationData = this.parseRGBToElevation(texture);
                        
                        // 4. 存储瓦片数据
                        tileDataMap.set(tileKey, {
                            tileX: tileX,
                            tileY: tileY,
                            tileWidth: tileWidth,
                            tileHeight: tileHeight,
                            tileLocalPos: tileLocalPos,
                            elevationData: elevationData,
                            texture: texture
                        });


                    } catch (error) {
                        console.error(`地形瓦片解析失败 [${tileX}, ${tileY}, ${this.options.zoom}]:`, error);
                    }

                    // 添加成功加载的瓦片
                    infoManager.addLoadedTerrainTile(tileKey);
                    
                    loadedCount++;
                    if (loadedCount === totalTiles) {
                        // 所有瓦片数据加载完成后，处理瓦片边缘
                        this.processTileEdges(tileDataMap);
                        // 然后渲染所有瓦片，传递卫星纹理
                        this.renderAllTiles(tileDataMap, satelliteTextures);
                        resolve();
                    }
                },
                undefined,
                (error) => {
                    console.error(`地形瓦片加载失败 [${tileX}, ${tileY}, ${this.options.zoom}]:`, error);
                    
                    // 添加失败加载的瓦片
                    infoManager.addFailedTerrainTile(tileKey);
                    
                    loadedCount++;
                    if (loadedCount === totalTiles) {
                        this.processTileEdges(tileDataMap);
                        this.renderAllTiles(tileDataMap, satelliteTextures);
                        resolve();
                    }
                }
            );
                }
            }
        });
    }
    
    /**
     * 处理瓦片边缘数据，确保相邻瓦片共享相同的边缘高程
     */
    processTileEdges(tileDataMap) {
        // 遍历所有瓦片，处理边缘数据
        for (const [tileKey, tileData] of tileDataMap) {
            const { tileX, tileY, elevationData } = tileData;
            
            // 检查右侧瓦片
            const rightTileKey = `${tileX + 1}_${tileY}_${this.options.zoom}`;
            if (tileDataMap.has(rightTileKey)) {
                const rightTileData = tileDataMap.get(rightTileKey);
                // 共享右侧边缘数据
                this.shareRightEdge(elevationData, rightTileData.elevationData);
            }
            
            // 检查下方瓦片
            const bottomTileKey = `${tileX}_${tileY + 1}_${this.options.zoom}`;
            if (tileDataMap.has(bottomTileKey)) {
                const bottomTileData = tileDataMap.get(bottomTileKey);
                // 共享下方边缘数据
                this.shareBottomEdge(elevationData, bottomTileData.elevationData);
            }
            
            // 检查右下角瓦片（处理对角线缝隙）
            const bottomRightTileKey = `${tileX + 1}_${tileY + 1}_${this.options.zoom}`;
            if (tileDataMap.has(bottomRightTileKey)) {
                const bottomRightTileData = tileDataMap.get(bottomRightTileKey);
                // 共享右下角边缘数据
                this.shareBottomRightCorner(elevationData, bottomRightTileData.elevationData);
            }
        }
    }
    
    /**
     * 共享右侧边缘数据
     */
    shareRightEdge(leftElevationData, rightElevationData) {
        const tileSize = this.options.tileSize;
        // 遍历右侧边缘的每一行
        for (let row = 0; row < tileSize; row++) {
            // 使用左侧瓦片的右侧边缘数据更新右侧瓦片的左侧边缘数据
            rightElevationData[row][0] = leftElevationData[row][tileSize - 1];
        }
    }
    
    /**
     * 共享下方边缘数据
     */
    shareBottomEdge(topElevationData, bottomElevationData) {
        const tileSize = this.options.tileSize;
        // 遍历下方边缘的每一列
        for (let col = 0; col < tileSize; col++) {
            // 使用上方瓦片的下方边缘数据更新下方瓦片的上方边缘数据
            bottomElevationData[0][col] = topElevationData[tileSize - 1][col];
        }
    }
    
    /**
     * 共享右下角边缘数据
     */
    shareBottomRightCorner(topLeftElevationData, bottomRightElevationData) {
        const tileSize = this.options.tileSize;
        // 共享右下角点
        bottomRightElevationData[0][0] = topLeftElevationData[tileSize - 1][tileSize - 1];
    }
    
    /**
     * 拼接多个卫星纹理成一个完整的纹理
     * @param {Map} satelliteTextures - 卫星影像纹理映射
     * @param {number} startX - 起始卫星瓦片X坐标
     * @param {number} startY - 起始卫星瓦片Y坐标
     * @param {number} count - 瓦片数量（2^zoomDiff）
     * @param {number} satelliteZoom - 卫星瓦片缩放级别
     * @returns {THREE.Texture|null} 拼接后的纹理
     */
    mergeSatelliteTextures(satelliteTextures, startX, startY, count, satelliteZoom) {
        // 检查是否有足够的卫星纹理
        let allTexturesAvailable = true;
        const texturesToMerge = [];
        
        for (let y = 0; y < count; y++) {
            const rowTextures = [];
            for (let x = 0; x < count; x++) {
                const satelliteTileKey = `${startX + x}_${startY + y}_${satelliteZoom}`;
                const texture = satelliteTextures.get(satelliteTileKey);
                if (texture) {
                    rowTextures.push(texture);
                } else {
                    allTexturesAvailable = false;
                    break;
                }
            }
            if (!allTexturesAvailable) {
                break;
            }
            texturesToMerge.push(rowTextures);
        }
        
        if (!allTexturesAvailable) {
            return null;
        }
        
        // 创建画布用于拼接纹理
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // 每个卫星瓦片的尺寸（假设都是256x256）
        const tileSize = 256;
        canvas.width = tileSize * count;
        canvas.height = tileSize * count;
        
        // 拼接纹理
        for (let y = 0; y < count; y++) {
            for (let x = 0; x < count; x++) {
                const texture = texturesToMerge[y][x];
                ctx.drawImage(texture.image, x * tileSize, y * tileSize, tileSize, tileSize);
            }
        }
        
        // 创建Three.js纹理
        const mergedTexture = new THREE.CanvasTexture(canvas);
        mergedTexture.needsUpdate = true;
        
        return mergedTexture;
    }
    
    /**
     * 渲染所有瓦片
     * @param {Map} tileDataMap - 瓦片数据映射
     * @param {Map} satelliteTextures - 卫星影像纹理映射
     */
    renderAllTiles(tileDataMap, satelliteTextures = new Map()) {
        for (const [tileKey, tileData] of tileDataMap) {
            const { tileX, tileY, tileWidth, tileHeight, tileLocalPos, elevationData, texture } = tileData;
            
            // 获取对应的卫星影像纹理
            let satelliteTexture = null;
            
            if (satelliteTextures.size > 0) {
                // 计算地形瓦片在卫星地图缩放级别的对应位置
                // 1. 获取卫星地图的缩放级别（从第一个纹理的key中提取）
                const firstSatelliteKey = [...satelliteTextures.keys()][0];
                const satelliteZoom = parseInt(firstSatelliteKey.split('_')[2]);
                
                // 2. 计算缩放级别差异
                const zoomDiff = satelliteZoom - this.options.zoom;
                
                if (zoomDiff >= 0) {
                    // 卫星影像层级大于等于地形瓦片层级
                    // 计算地形瓦片在卫星地图缩放级别的对应瓦片范围
                    const satelliteTileStartX = tileX * Math.pow(2, zoomDiff);
                    const satelliteTileStartY = tileY * Math.pow(2, zoomDiff);
                    
                    // 计算一个地形瓦片对应多少个卫星瓦片（2^zoomDiff × 2^zoomDiff）
                    const tilesPerTerrain = Math.pow(2, zoomDiff);
                    
                    // 拼接多个卫星纹理成一个完整的地形瓦片纹理
                    satelliteTexture = this.mergeSatelliteTextures(
                        satelliteTextures, 
                        satelliteTileStartX, 
                        satelliteTileStartY, 
                        tilesPerTerrain, 
                        satelliteZoom
                    );
                } else {
                    // 卫星影像层级小于地形瓦片层级
                    // 计算卫星瓦片在地形瓦片缩放级别的对应位置
                    const satelliteTileX = Math.floor(tileX / Math.pow(2, -zoomDiff));
                    const satelliteTileY = Math.floor(tileY / Math.pow(2, -zoomDiff));
                    
                    const satelliteTileKey = `${satelliteTileX}_${satelliteTileY}_${satelliteZoom}`;
                    satelliteTexture = satelliteTextures.get(satelliteTileKey) || null;
                }
            }
            
            // 创建地形网格，传递卫星影像纹理
            const terrainMesh = this.createTerrainMesh(elevationData, tileWidth, tileHeight, texture, satelliteTexture);
            
            // 设置位置
            terrainMesh.position.set(tileLocalPos.x, 0, tileLocalPos.z);
            
            // 创建并添加瓦片中心标记
            // const marker = this.createTileMarker(tileLocalPos, tileX, tileY);
            // this.loadedMarkers.set(tileKey, marker);
            // this.markerGroup.add(marker);
            
            // 存储并添加地形瓦片
            this.loadedTerrainTiles.set(tileKey, terrainMesh);
            this.terrainGroup.add(terrainMesh);

            console.log(`地形瓦片渲染完成 [${tileX}, ${tileY}, ${this.options.zoom}]`, 
                `中心坐标：(${tileLocalPos.x.toFixed(1)}, 0, ${tileLocalPos.z.toFixed(1)})`,
                `尺寸：${tileWidth.toFixed(1)}×${tileHeight.toFixed(1)}米`,
                satelliteTexture ? '已应用卫星影像' : '未应用卫星影像');
        }
    }

    /**
     * 从渲染的地形网格中获取高程（通过射线检测）
     * @param {number} x - Three.js X坐标
     * @param {number} z - Three.js Z坐标
     * @returns {number|null} 高程值，查询失败返回null
     */
    getElevationFromRenderedTerrain(x, z) {
        // 创建射线投射器
        const raycaster = new THREE.Raycaster();
        
        // 设置射线起点（高于地形足够的位置）
        const startPoint = new THREE.Vector3(x, 3000, z);
        // 设置射线方向（向下）
        const direction = new THREE.Vector3(0, -1, 0);
        
        // 设置射线
        raycaster.set(startPoint, direction);
        
        // 获取所有地形瓦片
        const terrainMeshes = Array.from(this.loadedTerrainTiles.values());
        
        // 执行射线检测
        const intersects = raycaster.intersectObjects(terrainMeshes);
        
        // 如果有交点，返回Y坐标（高程）
        if (intersects.length > 0) {
            return intersects[0].point.y;
        }
        
        return null;
    }

    /**
     * 根据Three.js坐标(x, z)查询高程(y值)
     * 基础工具函数，其他查询函数都调用此函数
     * @param {number} x - Three.js X坐标
     * @param {number} z - Three.js Z坐标
     * @returns {number|null} 高程值，查询失败返回null，非地形状态返回0
     */
    getElevationAtThreePosition(x, z) {
        // 非地形状态：直接返回0
        if (!this.renderTerrain) {
            return 0;
        }
        
        // 当地形渲染开启时，优先使用射线检测获取准确的地形表面高程
        const elevationFromRendered = this.getElevationFromRenderedTerrain(x, z);
        if (elevationFromRendered !== null) {
            return elevationFromRendered;
        }
        
        // 射线检测失败时，使用高程数据计算
        for (const [tileKey, mesh] of this.loadedTerrainTiles) {
            // 获取瓦片的用户数据
            const { elevationData, tileWidth, tileHeight } = mesh.userData;
            
            // 计算瓦片的边界范围（不使用boundingBox，避免受地形高度影响）
            const tileMinX = mesh.position.x - tileWidth / 2;
            const tileMaxX = mesh.position.x + tileWidth / 2;
            const tileMinZ = mesh.position.z - tileHeight / 2;
            const tileMaxZ = mesh.position.z + tileHeight / 2;
            
            // 检查查询点是否在瓦片范围内（只检查X和Z坐标）
            if (x >= tileMinX && x <= tileMaxX && z >= tileMinZ && z <= tileMaxZ) {
                // 计算查询点在瓦片内的相对位置（0-1范围）
                const u = (x - tileMinX) / tileWidth;
                const v = (z - tileMinZ) / tileHeight;
                
                // 使用与createTerrainMesh相同的双线性插值获取更精确的高程值
                const elevation = this.bilinearInterpolateElevation(elevationData, u, v);
                
                return elevation;
            }
        }
        
        // 未找到对应的瓦片或索引超出范围
        return null;
    }
    
    /**
     * 获取指定位置的地形高度（对外暴露的统一接口）
     * @param {number} x - Three.js X坐标
     * @param {number} z - Three.js Z坐标
     * @returns {number} 地形高度
     */
    getTerrainHeight(x, z) {
        return this.getElevationAtThreePosition(x, z) || 0;
    }

    /**
     * 设置是否渲染地形
     * @param {boolean} render - 是否渲染地形
     */
    setRenderTerrain(render) {
        this.renderTerrain = render;
        
        // 如果是开启地形，先重新处理瓦片边缘，确保相邻瓦片共享相同的边缘高程
        if (render) {
            this.reprocessTileEdges();
        }
        
        // 遍历所有地形瓦片，根据渲染状态切换高程和材质
        for (const [tileKey, mesh] of this.loadedTerrainTiles) {
            const geometry = mesh.geometry;
            const positions = geometry.attributes.position.array;
            const userData = mesh.userData;
            
            if (render) {
                // 开启地形：应用高程数据，使用与createTerrainMesh相同的双线性插值
                const elevationData = userData.elevationData;
                const tileWidth = userData.tileWidth;
                const tileHeight = userData.tileHeight;
                
                for (let i = 0; i < positions.length; i += 3) {
                    // 获取当前顶点的X和Y坐标（在平面中的位置）
                    const x = positions[i];     // 平面X坐标
                    const y = positions[i + 1];   // 平面Y坐标
                    
                    // 将平面坐标转换为高程数据索引（0-1范围）
                    const u = (x + tileWidth / 2) / tileWidth;  // 转换为0-1范围
                    const v = (y + tileHeight / 2) / tileHeight; // 转换为0-1范围
                    
                    // 使用双线性插值获取更精确的高程值，与创建地形时保持一致
                    const elevation = this.bilinearInterpolateElevation(elevationData, u, v);
                    
                    // 修改Z坐标为高程值（此时Z是垂直于XY平面的方向）
                    positions[i + 2] = elevation;
                }
                
                // 开启地形：使用MeshStandardMaterial
                if (!(mesh.material instanceof THREE.MeshStandardMaterial)) {
                    mesh.material.dispose();
                    mesh.material = new THREE.MeshStandardMaterial({
                        map: userData.satelliteTexture || userData.grayTexture,    // 优先使用卫星纹理，否则使用灰度纹理
                        side: THREE.DoubleSide,
                        wireframe: false,
                        roughness: 0.8,      // 增加粗糙度
                        metalness: 0.2       // 减少金属度
                    });
                }
            } else {
                // 关闭地形：恢复为平面（使用原始位置）
                for (let i = 0; i < positions.length; i += 3) {
                    positions[i + 2] = userData.originalPositions[i + 2];
                }
                
                // 关闭地形：使用MeshBasicMaterial，确保瓦片始终可见
                if (!(mesh.material instanceof THREE.MeshBasicMaterial)) {
                    mesh.material.dispose();
                    mesh.material = new THREE.MeshBasicMaterial({
                        map: userData.satelliteTexture || userData.grayTexture,    // 优先使用卫星纹理，否则使用灰度纹理
                        side: THREE.DoubleSide,
                        wireframe: false
                    });
                }
            }
            
            // 更新几何体
            geometry.attributes.position.needsUpdate = true;
            geometry.computeVertexNormals();
        }
        
        console.log(`地形渲染已${render ? '开启' : '关闭'}`);
    }
    
    /**
     * 获取当前地形渲染状态
     * @returns {boolean} 当前地形渲染状态
     */
    isRenderingTerrain() {
        return this.renderTerrain;
    }
    
    /**
     * 获取与多边形相交的地形瓦片
     * @param {Array} polygon - Three.js坐标数组 [{x, z}, ...]
     * @returns {Array} 相交的地形瓦片信息数组
     */
    getTilesIntersectingPolygon(polygon) {
        const intersectingTiles = [];
        
        // 遍历所有加载的地形瓦片
        for (const [tileKey, mesh] of this.loadedTerrainTiles) {
            // 获取瓦片的用户数据
            const userData = mesh.userData;
            const tileWidth = userData.tileWidth;
            const tileHeight = userData.tileHeight;
            
            // 计算瓦片的边界范围
            const tileMinX = mesh.position.x - tileWidth / 2;
            const tileMaxX = mesh.position.x + tileWidth / 2;
            const tileMinZ = mesh.position.z - tileHeight / 2;
            const tileMaxZ = mesh.position.z + tileHeight / 2;
            
            // 检查瓦片是否与多边形相交
            if (this.isTileIntersectingPolygon(tileMinX, tileMaxX, tileMinZ, tileMaxZ, polygon)) {
                // 获取瓦片的高程纹理
                const heightTexture = userData.grayTexture; // 使用灰度纹理作为高程纹理
                
                // 添加到相交瓦片数组
                intersectingTiles.push({
                    heightTexture: heightTexture,
                    minElevation: heightTexture.minElevation,
                    maxElevation: heightTexture.maxElevation,
                    minX: tileMinX,
                    maxX: tileMaxX,
                    minZ: tileMinZ,
                    maxZ: tileMaxZ,
                    elevationData: userData.elevationData, // 传递原始高程数据
                    tileX: mesh.position.x, // 瓦片中心X坐标
                    tileZ: mesh.position.z, // 瓦片中心Z坐标
                    tileWidth: tileWidth,
                    tileHeight: tileHeight
                });
            }
        }
        
        // 限制瓦片数量在9-16之间
        return intersectingTiles.slice(0, 16);
    }
    
    /**
     * 检查瓦片是否与多边形相交
     * @param {number} tileMinX - 瓦片最小X坐标
     * @param {number} tileMaxX - 瓦片最大X坐标
     * @param {number} tileMinZ - 瓦片最小Z坐标
     * @param {number} tileMaxZ - 瓦片最大Z坐标
     * @param {Array} polygon - Three.js坐标数组 [{x, z}, ...]
     * @returns {boolean} 是否相交
     */
    isTileIntersectingPolygon(tileMinX, tileMaxX, tileMinZ, tileMaxZ, polygon) {
        // 简单的边界框检查
        // 1. 检查多边形的任意顶点是否在瓦片内
        for (const point of polygon) {
            if (point.x >= tileMinX && point.x <= tileMaxX && 
                point.z >= tileMinZ && point.z <= tileMaxZ) {
                return true;
            }
        }
        
        // 2. 检查瓦片的任意顶点是否在多边形内
        const tilePoints = [
            { x: tileMinX, z: tileMinZ },
            { x: tileMaxX, z: tileMinZ },
            { x: tileMaxX, z: tileMaxZ },
            { x: tileMinX, z: tileMaxZ }
        ];
        
        for (const tilePoint of tilePoints) {
            if (this.isPointInPolygon(tilePoint, polygon)) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * 检查点是否在多边形内（射线法）
     * @param {Object} point - 点坐标 {x, z}
     * @param {Array} polygon - 多边形坐标数组 [{x, z}, ...]
     * @returns {boolean} 点是否在多边形内
     */
    isPointInPolygon(point, polygon) {
        let inside = false;
        
        // 射线法判断点是否在多边形内
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x;
            const zi = polygon[i].z;
            const xj = polygon[j].x;
            const zj = polygon[j].z;
            
            const intersect = ((zi > point.z) !== (zj > point.z)) && 
                (point.x < (xj - xi) * (point.z - zi) / (zj - zi) + xi);
            
            if (intersect) {
                inside = !inside;
            }
        }
        
        return inside;
    }
    
    /**
     * 重新处理已加载瓦片的边缘，确保相邻瓦片共享相同的边缘高程
     * 用于解决关闭地形后二次开启时出现的缝隙问题
     */
    reprocessTileEdges() {
        // 遍历所有已加载的地形瓦片
        for (const [tileKey, mesh] of this.loadedTerrainTiles) {
            // 从瓦片键中获取瓦片坐标和缩放级别
            const [tileX, tileY, zoom] = tileKey.split('_').map(Number);
            const elevationData = mesh.userData.elevationData;
            
            // 检查右侧瓦片
            const rightTileKey = `${tileX + 1}_${tileY}_${zoom}`;
            if (this.loadedTerrainTiles.has(rightTileKey)) {
                const rightMesh = this.loadedTerrainTiles.get(rightTileKey);
                // 共享右侧边缘数据
                this.shareRightEdge(elevationData, rightMesh.userData.elevationData);
            }
            
            // 检查下方瓦片
            const bottomTileKey = `${tileX}_${tileY + 1}_${zoom}`;
            if (this.loadedTerrainTiles.has(bottomTileKey)) {
                const bottomMesh = this.loadedTerrainTiles.get(bottomTileKey);
                // 共享下方边缘数据
                this.shareBottomEdge(elevationData, bottomMesh.userData.elevationData);
            }
            
            // 检查右下角瓦片（处理对角线缝隙）
            const bottomRightTileKey = `${tileX + 1}_${tileY + 1}_${zoom}`;
            if (this.loadedTerrainTiles.has(bottomRightTileKey)) {
                const bottomRightMesh = this.loadedTerrainTiles.get(bottomRightTileKey);
                // 共享右下角边缘数据
                this.shareBottomRightCorner(elevationData, bottomRightMesh.userData.elevationData);
            }
        }
    }

    /**
     * 根据经纬度查询高程
     * @param {number} lon - 经度
     * @param {number} lat - 纬度
     * @returns {number|null} 高程值，查询失败返回null
     */
    getElevationAtLonLat(lon, lat) {
        // 将经纬度转换为Three.js坐标
        const threePosition = this.mathProj.lonLatToThree(lon, lat);
        // 调用基础查询函数
        return this.getElevationAtThreePosition(threePosition.x, threePosition.z);
    }

    /**
     * 根据墨卡托坐标查询高程
     * @param {number} mercatorX - 墨卡托X坐标
     * @param {number} mercatorY - 墨卡托Y坐标
     * @returns {number|null} 高程值，查询失败返回null
     */
    getElevationAtMercator(mercatorX, mercatorY) {
        // 将墨卡托坐标转换为Three.js坐标
        const threePosition = this.mathProj.mercatorToThree(mercatorX, mercatorY);
        // 调用基础查询函数
        return this.getElevationAtThreePosition(threePosition.x, threePosition.z);
    }

    /**
     * 切换地形瓦片中心标记的显示/隐藏
     */
    toggleMarkers() {
        this.markerGroup.visible = !this.markerGroup.visible;
    }

    /**
     * 绘制地形瓦片边界（亮蓝色）
     * @param {THREE.Group} group - 边界容器组
     * @param {number} [offsetY=0] - Y轴偏移量，默认250米
     */
    drawTileBoundaries(group, offsetY = 250) {
        // 使用鲜艳的亮蓝色，确保可见性
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff });
        
        console.log(`开始绘制地形瓦片边界，范围：[${this.tileRange.minX},${this.tileRange.maxX}]x[${this.tileRange.minY},${this.tileRange.maxY}]`);
        
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
                
                // 测试：添加一个黄色标记点在瓦片中心，用于调试
                const centerX = (topLeft.x + bottomRight.x) / 2;
                const centerZ = (topLeft.z + bottomRight.z) / 2;
                const markerGeometry = new THREE.SphereGeometry(3, 8, 8);
                const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
                const marker = new THREE.Mesh(markerGeometry, markerMaterial);
                marker.position.set(centerX, offsetY, centerZ);
                group.add(marker);
            }
        }
        
        const totalTiles = (this.tileRange.maxX - this.tileRange.minX + 1) * (this.tileRange.maxY - this.tileRange.minY + 1);
        console.log(`已绘制地形瓦片边界：${totalTiles}个瓦片，Y轴偏移：${offsetY}米`);
    }

    /**
     * 清理资源
     */
    dispose() {
        // 清理地形瓦片
        for (const [key, mesh] of this.loadedTerrainTiles) {
            this.terrainGroup.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
        }
        // 清理标记
        for (const [key, marker] of this.loadedMarkers) {
            this.markerGroup.remove(marker);
            marker.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
        }
        this.loadedTerrainTiles.clear();
        this.loadedMarkers.clear();
        this.scene.remove(this.terrainGroup);
        this.scene.remove(this.markerGroup);
    }
}
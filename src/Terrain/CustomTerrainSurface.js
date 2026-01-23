import * as THREE from 'three';
import earcut from 'earcut';

/**
 * 自定义纹理贴地形管理器（优化性能版）
 * 适配坐标系：x = 东方向，y = 高程，-z = 北方向
 */
export class CustomTerrainSurface {
    /**
     * 构造函数
     * @param {RGBTerrain} terrain - 地形实例
     * @param {THREE.Scene} scene - 场景
     */
    constructor(terrain, scene) {
        this.terrain = terrain;
        this.scene = scene;
        this.surfacesGroup = new THREE.Group();
        this.surfacesGroup.name = 'customTerrainSurfaces';
        this.scene.add(this.surfacesGroup);
        
        // 核心优化：默认精度+性能限制
        this.samplePrecision = 20; // 默认20米采样精度
        this.maxSubdivisions = 5; // 最大细分次数（防止无限递归）
        this.maxVertices = 100000; // 最大顶点数（防止内存爆炸）

        this.surfaces = new Map(); 
        this.pendingSurfaces = new Map(); 
        this.textureLoader = new THREE.TextureLoader();
    }

    /**
     * 创建自定义贴地面
     * @param {Array<THREE.Vector3>} points - 多边形顶点（x=东，-z=北）
     * @param {Object} options - 配置选项
     * @returns {string} 贴地面ID
     */
    createSurface(points, options = {}) {
        if (points.length < 3) {
            console.error('创建面至少需要3个点');
            return null;
        }

        const defaultOptions = {
            color: 0x0000ff,
            opacity: 0.5,
            textureUrl: null,
            textureRepeat: new THREE.Vector2(1, 1),
            textureOffset: new THREE.Vector2(0, 0),
            samplePrecision: this.samplePrecision,
            ...options
        };

        const surfaceId = `surface_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const bounds = this._calculateBounds(points);
        
        // 核心修复：创建几何体时传入当前surface的options，而非从pending取值
        const geometry = this._createSurfaceGeometry(points, bounds, defaultOptions.samplePrecision);

        if (!geometry) {
            console.error('创建几何体失败');
            return null;
        }

        this.pendingSurfaces.set(surfaceId, {
            id: surfaceId,
            points: points.map(p => p.clone()),
            bounds: bounds,
            options: defaultOptions,
            geometry: geometry
        });

        this._createMaterialWithTexture(geometry, bounds, defaultOptions, (material, texture) => {
            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = `custom_terrain_surface_${surfaceId}`;
            this.surfacesGroup.add(mesh);

            const pendingSurface = this.pendingSurfaces.get(surfaceId);
            this.surfaces.set(surfaceId, {
                id: surfaceId,
                mesh: mesh,
                points: pendingSurface.points,
                bounds: pendingSurface.bounds,
                material: material,
                texture: texture,
                options: pendingSurface.options
            });

            this.pendingSurfaces.delete(surfaceId);
            console.log(`自定义贴地面创建成功: ${surfaceId}，顶点数：${geometry.attributes.position.count}`);
        });

        return surfaceId;
    }

    /**
     * 计算多边形包围盒
     */
    _calculateBounds(points) {
        let minX = Infinity, maxX = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;

        for (const point of points) {
            minX = Math.min(minX, point.x);
            maxX = Math.max(maxX, point.x);
            minZ = Math.min(minZ, point.z);
            maxZ = Math.max(maxZ, point.z);
        }

        const width = maxX - minX;
        const height = Math.abs(maxZ - minZ);

        return {
            minX, maxX, minZ, maxZ,
            width: width,
            height: height,
            centerX: (minX + maxX) / 2,
            centerZ: (minZ + maxZ) / 2
        };
    }

    /**
     * 创建贴地面几何体（优化版：迭代细分+性能限制）
     * @param {Array<THREE.Vector3>} polygonPoints - 输入的多边形顶点
     * @param {Object} bounds - 包围盒
     * @param {number} precision - 采样精度（米）
     * @returns {THREE.BufferGeometry} 精确贴合的几何体
     */
    _createSurfaceGeometry(polygonPoints, bounds, precision) {
        // 步骤1：三角化
        const flatPoints = polygonPoints.map(p => [p.x, p.z]).flat();
        const triangles = earcut(flatPoints);

        // 步骤2：初始化顶点和索引
        const vertices = [];
        for (let i = 0; i < polygonPoints.length; i++) {
            const p = polygonPoints[i];
            const elevation = this.terrain?.getElevationAtThreePosition(p.x, p.z) || 0;
            vertices.push(p.x, elevation + 0.1, p.z);
        }

        // 步骤3：迭代细分（替换递归，避免栈溢出）
        let indexBuffer = [...triangles]; // 初始索引
        let vertexBuffer = [...vertices]; // 初始顶点
        const edgeMap = new Map();
        let subdivisionCount = 0; // 记录细分次数

        // 迭代细分直到满足精度或达到最大次数
        while (subdivisionCount < this.maxSubdivisions) {
            const newIndexBuffer = [];
            let needMoreSubdivision = false;

            // 遍历当前所有三角形
            for (let i = 0; i < indexBuffer.length; i += 3) {
                const aIdx = indexBuffer[i];
                const bIdx = indexBuffer[i + 1];
                const cIdx = indexBuffer[i + 2];

                // 获取顶点坐标
                const a = [
                    vertexBuffer[aIdx * 3],
                    vertexBuffer[aIdx * 3 + 1],
                    vertexBuffer[aIdx * 3 + 2]
                ];
                const b = [
                    vertexBuffer[bIdx * 3],
                    vertexBuffer[bIdx * 3 + 1],
                    vertexBuffer[bIdx * 3 + 2]
                ];
                const c = [
                    vertexBuffer[cIdx * 3],
                    vertexBuffer[cIdx * 3 + 1],
                    vertexBuffer[cIdx * 3 + 2]
                ];

                // 计算边长
                const abLen = this._calculateDistance(a, b);
                const bcLen = this._calculateDistance(b, c);
                const caLen = this._calculateDistance(c, a);

                // 判断是否需要细分
                if (abLen > precision || bcLen > precision || caLen > precision) {
                    needMoreSubdivision = true;

                    // 计算中点
                    const abMidIdx = this._getMidpoint(aIdx, bIdx, vertexBuffer, edgeMap, vertexBuffer);
                    const bcMidIdx = this._getMidpoint(bIdx, cIdx, vertexBuffer, edgeMap, vertexBuffer);
                    const caMidIdx = this._getMidpoint(cIdx, aIdx, vertexBuffer, edgeMap, vertexBuffer);

                    // 生成4个新三角形
                    newIndexBuffer.push(aIdx, abMidIdx, caMidIdx);
                    newIndexBuffer.push(bIdx, bcMidIdx, abMidIdx);
                    newIndexBuffer.push(cIdx, caMidIdx, bcMidIdx);
                    newIndexBuffer.push(abMidIdx, bcMidIdx, caMidIdx);

                    // 检查顶点数是否超限
                    if (vertexBuffer.length / 3 > this.maxVertices) {
                        console.warn('顶点数超过阈值，停止细分');
                        needMoreSubdivision = false;
                        break;
                    }
                } else {
                    // 不需要细分，直接保留原三角形
                    newIndexBuffer.push(aIdx, bIdx, cIdx);
                }
            }

            // 更新索引和细分次数
            indexBuffer = newIndexBuffer;
            subdivisionCount++;

            // 停止条件：不需要再细分 或 顶点数超限
            if (!needMoreSubdivision || vertexBuffer.length / 3 > this.maxVertices) {
                break;
            }
        }

        // 步骤4：创建几何体
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertexBuffer, 3));
        geometry.setIndex(indexBuffer);

        // 步骤5：设置UV坐标（适配细分后的顶点）
        const uvs = [];
        // 重新计算所有顶点的UV（包括细分后的顶点）
        for (let i = 0; i < vertexBuffer.length / 3; i++) {
            const x = vertexBuffer[i * 3];
            const z = vertexBuffer[i * 3 + 2];
            const u = (x - bounds.minX) / bounds.width;
            const v = 1 - (z - bounds.minZ) / bounds.height;
            uvs.push(u, v);
        }
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

        // 优化几何体
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        return geometry;
    }

    /**
     * 计算两点之间的实际距离（米）
     */
    _calculateDistance(p1, p2) {
        const dx = p2[0] - p1[0];
        const dz = p2[2] - p1[2];
        // 增加浮点精度容错，避免无限细分
        return Math.sqrt(dx * dx + dz * dz) + 1e-6;
    }

    /**
     * 计算边的中点（优化版）
     */
    _getMidpoint(i, j, vertices, edgeMap, newVertices) {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (edgeMap.has(key)) return edgeMap.get(key);

        const x = (vertices[i * 3] + vertices[j * 3]) / 2;
        const z = (vertices[i * 3 + 2] + vertices[j * 3 + 2]) / 2;
        const elevation = this.terrain?.getElevationAtThreePosition(x, z) || 0;

        const midIndex = newVertices.length / 3;
        newVertices.push(x, elevation + 0.1, z);
        edgeMap.set(key, midIndex);
        return midIndex;
    }

    // 以下方法（_createMaterialWithTexture、_adjustUVsForTexture等）保持不变，直接复制原有代码
    /**
     * 创建带纹理的材质
     */
    _createMaterialWithTexture(geometry, bounds, options, callback) {
        const isTerrainRendered = this.terrain ? this.terrain.isRenderingTerrain() : false;

        if (options.textureUrl) {
            this.textureLoader.load(
                options.textureUrl,
                (texture) => {
                    texture.wrapS = THREE.RepeatWrapping;
                    texture.wrapT = THREE.RepeatWrapping;
                    texture.repeat.copy(options.textureRepeat);
                    texture.offset.copy(options.textureOffset);
                    texture.needsUpdate = true;

                    this._adjustUVsForTexture(geometry, bounds, options);

                    let material;
                    if (isTerrainRendered) {
                        material = new THREE.MeshStandardMaterial({
                            map: texture,
                            color: options.color,
                            transparent: options.opacity < 1.0,
                            opacity: options.opacity,
                            side: THREE.DoubleSide,
                            roughness: 0.8,
                            metalness: 0.2,
                            // 新增：减少过度绘制
                            polygonOffset: true,
                            polygonOffsetFactor: -1
                        });
                    } else {
                        material = new THREE.MeshBasicMaterial({
                            map: texture,
                            color: options.color,
                            transparent: options.opacity < 1.0,
                            opacity: options.opacity,
                            side: THREE.DoubleSide
                        });
                    }

                    callback(material, texture);
                },
                undefined,
                (error) => {
                    console.error('纹理加载失败:', error);
                    this._createSolidMaterial(isTerrainRendered, options, callback);
                }
            );
        } else {
            this._createSolidMaterial(isTerrainRendered, options, callback);
        }
    }

    /**
     * 为纹理调整UV坐标
     */
    _adjustUVsForTexture(geometry, bounds, options) {
        const uvs = geometry.attributes.uv;

        for (let i = 0; i < uvs.count; i++) {
            const u = uvs.getX(i);
            const v = uvs.getY(i);

            uvs.setX(i, u * options.textureRepeat.x + options.textureOffset.x);
            uvs.setY(i, v * options.textureRepeat.y + options.textureOffset.y);
        }

        uvs.needsUpdate = true;
    }

    /**
     * 创建纯色材质
     */
    _createSolidMaterial(isTerrainRendered, options, callback) {
        let material;

        if (isTerrainRendered) {
            material = new THREE.MeshStandardMaterial({
                color: options.color,
                transparent: options.opacity < 1.0,
                opacity: options.opacity,
                side: THREE.DoubleSide,
                roughness: 0.8,
                metalness: 0.2,
                polygonOffset: true,
                polygonOffsetFactor: -1
            });
        } else {
            material = new THREE.MeshBasicMaterial({
                color: options.color,
                transparent: options.opacity < 1.0,
                opacity: options.opacity,
                side: THREE.DoubleSide
            });
        }

        callback(material, null);
    }

    // 以下方法（updateSurfaceTexture、removeSurface、clearAll等）完全复用原有代码，此处省略（直接复制）
    /**
     * 更新贴地面纹理
     */
    updateSurfaceTexture(surfaceId, newTextureUrl, options = {}) {
        const surface = this.surfaces.get(surfaceId);
        if (!surface) return false;

        const defaultOptions = {
            textureRepeat: new THREE.Vector2(1, 1),
            textureOffset: new THREE.Vector2(0, 0),
            ...options
        };

        this.textureLoader.load(
            newTextureUrl,
            (texture) => {
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                texture.repeat.copy(defaultOptions.textureRepeat);
                texture.offset.copy(defaultOptions.textureOffset);

                if (surface.material.map) {
                    surface.material.map.dispose();
                }

                surface.material.map = texture;
                surface.material.needsUpdate = true;

                if (surface.texture) {
                    surface.texture.dispose();
                }
                surface.texture = texture;

                console.log(`更新贴地面纹理: ${surfaceId}`);
            },
            undefined,
            (error) => {
                console.error('纹理更新失败:', error);
            }
        );

        return true;
    }

    /**
     * 更新贴地面颜色和透明度
     */
    updateSurfaceColor(surfaceId, newColor, newOpacity = null) {
        const surface = this.surfaces.get(surfaceId);
        if (!surface) return false;

        if (newColor) {
            surface.material.color.set(newColor);
        }

        if (newOpacity !== null) {
            surface.material.opacity = newOpacity;
            surface.material.transparent = newOpacity < 1.0;
        }

        surface.material.needsUpdate = true;
        return true;
    }

    /**
     * 移除贴地面
     */
    removeSurface(surfaceId) {
        if (this.pendingSurfaces.has(surfaceId)) {
            const pending = this.pendingSurfaces.get(surfaceId);
            if (pending.geometry) {
                pending.geometry.dispose();
            }
            this.pendingSurfaces.delete(surfaceId);
            return true;
        }

        const surface = this.surfaces.get(surfaceId);
        if (surface) {
            this.surfacesGroup.remove(surface.mesh);

            if (surface.mesh.geometry) {
                surface.mesh.geometry.dispose();
            }
            if (surface.mesh.material) {
                surface.mesh.material.dispose();
            }
            if (surface.texture) {
                surface.texture.dispose();
            }

            this.surfaces.delete(surfaceId);
            console.log(`移除贴地面: ${surfaceId}`);
            return true;
        }
        return false;
    }

    /**
     * 清理所有贴地面
     */
    clearAll() {
        for (const [id, pending] of this.pendingSurfaces) {
            if (pending.geometry) {
                pending.geometry.dispose();
            }
        }
        this.pendingSurfaces.clear();

        for (const [id, surface] of this.surfaces) {
            this.surfacesGroup.remove(surface.mesh);

            if (surface.mesh.geometry) {
                surface.mesh.geometry.dispose();
            }
            if (surface.mesh.material) {
                surface.mesh.material.dispose();
            }
            if (surface.texture) {
                surface.texture.dispose();
            }
        }

        this.surfaces.clear();
        console.log('清理所有自定义贴地面');
    }

    /**
     * 获取贴地面信息
     */
    getSurfaceInfo(surfaceId) {
        if (this.pendingSurfaces.has(surfaceId)) {
            return { ...this.pendingSurfaces.get(surfaceId), status: 'pending' };
        }
        return this.surfaces.get(surfaceId);
    }

    /**
     * 设置贴地面可见性
     */
    setSurfaceVisible(surfaceId, visible) {
        const surface = this.surfaces.get(surfaceId);
        if (surface) {
            surface.mesh.visible = visible;
            return true;
        }
        return false;
    }

    /**
     * 设置所有贴地面可见性
     */
    setAllVisible(visible) {
        for (const [id, surface] of this.surfaces) {
            surface.mesh.visible = visible;
        }
    }

    /**
     * 获取贴地面数量
     */
    getSurfaceCount() {
        return this.surfaces.size + this.pendingSurfaces.size;
    }

    /**
     * 销毁管理器
     */
    dispose() {
        this.clearAll();

        if (this.surfacesGroup.parent) {
            this.surfacesGroup.parent.remove(this.surfacesGroup);
        }

        this.terrain = null;
        this.scene = null;
        this.textureLoader = null;
    }
}
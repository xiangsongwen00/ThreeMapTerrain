import * as THREE from 'three';

/**
 * OverlayTerrainMesh类
 * 实现基于Shader的地形覆盖功能
 * 根据多边形范围获取地形瓦片，使用Shader进行跨瓦片高度采样和抬升
 */
export class OverlayTerrainMesh {
    /**
     * 构造函数
     * @param {Object} options - 配置选项
     * @param {THREE.Scene} options.scene - Three.js场景
     * @param {Array} options.polygon - 坐标数组，可以是经纬度格式 [{lon, lat}, ...] 或 Three.js坐标格式 [{x, z}, ...]
     * @param {Object} options.rgbTerrain - RGBTerrain实例
     * @param {string} [options.coordType] - 坐标类型，可选值：'lonlat'（经纬度）或'three'（Three.js坐标），默认'lonlat'
     * @param {number} [options.offset] - 高度偏移，默认100米
     * @param {number} [options.segments] - 分段数，默认32，降低分段数提高性能
     */
    constructor(options) {
        this.options = {
            coordType: 'lonlat',
            offset: 100,
            segments: 32, // 降低分段数，提高性能
            ...options
        };

        this.scene = this.options.scene;
        this.polygon = this.options.polygon;
        this.coordType = this.options.coordType;
        this.rgbTerrain = this.options.rgbTerrain;
        this.offset = this.options.offset;
        this.segments = this.options.segments;

        this.overlayMesh = null;
        this.terrainTiles = [];
        this.mathProj = this.rgbTerrain.mathProj; // 从rgbTerrain获取坐标转换工具

        // 转换多边形坐标为Three.js坐标
        this.threePolygon = this.convertPolygonToThreeCoords();

        // 创建着色器材质
        this.material = this.createShaderMaterial();
    }

    /**
     * 将多边形坐标转换为Three.js坐标
     * @returns {Array} Three.js坐标数组 [{x, z}, ...]
     */
    convertPolygonToThreeCoords() {
        if (this.coordType === 'lonlat') {
            // 经纬度转Three.js坐标
            return this.polygon.map(point => {
                const threePos = this.mathProj.lonLatToThree(point.lon, point.lat);
                return { x: threePos.x, z: threePos.z };
            });
        } else {
            // 已经是Three.js坐标
            return this.polygon;
        }
    }

    /**
     * 获取多边形的边界框
     * @param {Array} polygon - Three.js坐标数组 [{x, z}, ...]
     * @returns {Object} 边界框 {minX, maxX, minZ, maxZ}
     */
    getPolygonBounds(polygon) {
        let minX = Infinity;
        let maxX = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;

        polygon.forEach(point => {
            minX = Math.min(minX, point.x);
            maxX = Math.max(maxX, point.x);
            minZ = Math.min(minZ, point.z);
            maxZ = Math.max(maxZ, point.z);
        });

        return { minX, maxX, minZ, maxZ };
    }

    /**
     * 创建Shader材质
     * @returns {THREE.ShaderMaterial} Shader材质
     */
    createShaderMaterial() {
        let MAX_TILES = 8;
        const vertexShader = `
        #define MAX_TILES ${MAX_TILES}

        uniform sampler2D heightTextures[MAX_TILES];
        uniform vec4 tileBounds[MAX_TILES];   // minX, minZ, maxX, maxZ
        uniform vec2 tileElevRange[MAX_TILES]; // minElevation, maxElevation
        uniform int tileCount;
        uniform float offset;

        varying float vHeight;

        float sampleHeightFromTile(int tileIndex, vec2 worldXZ) {
            vec4 b = tileBounds[tileIndex];
            
            if (
                worldXZ.x >= b.x && worldXZ.x <= b.z &&
                worldXZ.y >= b.y && worldXZ.y <= b.w
            ) {
                vec2 uv = vec2(
                    (worldXZ.x - b.x) / (b.z - b.x),
                    1.0-(worldXZ.y - b.y) / (b.w - b.y)
                );

                float gray = 0.0;
                
                // 使用宏展开避免动态索引采样器
                if (tileIndex == 0) {
                    gray = texture2D(heightTextures[0], uv).r;
                } else if (tileIndex == 1) {
                    gray = texture2D(heightTextures[1], uv).r;
                } else if (tileIndex == 2) {
                    gray = texture2D(heightTextures[2], uv).r;
                } else if (tileIndex == 3) {
                    gray = texture2D(heightTextures[3], uv).r;
                } else if (tileIndex == 4) {
                    gray = texture2D(heightTextures[4], uv).r;
                } else if (tileIndex == 5) {
                    gray = texture2D(heightTextures[5], uv).r;
                } else if (tileIndex == 6) {
                    gray = texture2D(heightTextures[6], uv).r;
                } else if (tileIndex == 7) {
                    gray = texture2D(heightTextures[7], uv).r;
                }

                vec2 elev = tileElevRange[tileIndex];
                float height = mix(elev.x, elev.y, gray);

                return height;
            }
            
            return -1.0;
        }

        float sampleHeight(vec2 worldXZ) {
            // 逐瓦片检测，使用展开的if-else
            for (int i = 0; i < MAX_TILES; i++) {
                if (i >= tileCount) break;

                float h = sampleHeightFromTile(i, worldXZ);
                if (h >= 0.0) {
                    return h;
                }
            }
            return 0.0;
        }

        void main() {
            vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;

            float h = sampleHeight(worldPos.xz);
            worldPos.y = h + offset;

            vHeight = h;

            gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
        }
        `;

        // 片段着色器
        const fragmentShader = `
        varying float vHeight;

        void main() {
            gl_FragColor = vec4(0.0, 0.8, 0.3, 1.0);
        }
        `;

        // 创建占位符纹理，防止 uniform 数组为空导致编译错误
        // 使用 DataTexture 确保有效的 WebGL 纹理并保留到实例上以便后续填充
        // 使用 Float32Array 和 RedFormat 与 heightTextures 格式一致
        const placeholderTexture = new THREE.DataTexture(
            new Float32Array([0.5]),
            1,
            1,
            THREE.RedFormat,
            THREE.FloatType
        );
        placeholderTexture.needsUpdate = true;
        placeholderTexture.magFilter = THREE.LinearFilter;
        placeholderTexture.minFilter = THREE.LinearFilter;
        placeholderTexture.minElevation = 0;
        placeholderTexture.maxElevation = 100;
        this.MAX_TILES = MAX_TILES;
        this._placeholderTexture = placeholderTexture;

        // 使用 Array.from() 为每个位置创建独立的对象，避免共享引用
        const placeholderTextures = Array.from({ length: MAX_TILES }, () => placeholderTexture);
        const placeholderBounds = Array.from({ length: MAX_TILES }, () => new THREE.Vector4(0, 0, 1, 1));
        const placeholderElevRange = Array.from({ length: MAX_TILES }, () => new THREE.Vector2(0, 100));

        return new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
                heightTextures: { value: placeholderTextures },
                tileBounds: { value: placeholderBounds },
                tileElevRange: { value: placeholderElevRange },
                tileCount: { value: 0 },
                offset: { value: this.offset }
            },
            side: THREE.DoubleSide
        });
    }

    createMesh() {
        return new Promise((resolve, reject) => {
            try {
                const bounds = this.getPolygonBounds(this.threePolygon);
                const { minX, maxX, minZ, maxZ } = bounds;

                const width = maxX - minX;
                const height = maxZ - minZ;

                const centerX = (minX + maxX) / 2;
                const centerZ = (minZ + maxZ) / 2;

                const geometry = new THREE.PlaneGeometry(
                    width,
                    height,
                    this.segments,
                    this.segments
                );

                geometry.rotateX(-Math.PI / 2);
                geometry.translate(centerX, 0, centerZ);

                // 关键：拿到相交瓦片
                const tiles = this.rgbTerrain.getTilesIntersectingPolygon(
                    this.threePolygon
                ).slice(0, 8);

                const heightTextures = [];
                const tileBounds = [];
                const tileElevRange = [];

                tiles.forEach(tile => {
                    heightTextures.push(tile.heightTexture);

                    tileBounds.push(
                        new THREE.Vector4(
                            tile.minX,
                            tile.minZ,
                            tile.maxX,
                            tile.maxZ
                        )
                    );

                    tileElevRange.push(
                        new THREE.Vector2(
                            tile.minElevation,
                            tile.maxElevation
                        )
                    );
                });

                // 填充并保证数组长度为 MAX_TILES，避免 Three.js 在上传 uniform 时出现 undefined
                const MAX_TILES = this.MAX_TILES || 8;
                const placeholderTexture = this._placeholderTexture || (() => {
                    const t = new THREE.DataTexture(
                        new Float32Array([0.5]),
                        1,
                        1,
                        THREE.RedFormat,
                        THREE.FloatType
                    );
                    t.needsUpdate = true;
                    t.magFilter = THREE.LinearFilter;
                    t.minFilter = THREE.LinearFilter;
                    return t;
                })();

                const paddedHeightTextures = Array.from({ length: MAX_TILES }, (_, i) => heightTextures[i] || placeholderTexture);
                const paddedTileBounds = Array.from({ length: MAX_TILES }, (_, i) => tileBounds[i] || new THREE.Vector4(0, 0, 1, 1));
                const paddedTileElevRange = Array.from({ length: MAX_TILES }, (_, i) => tileElevRange[i] || new THREE.Vector2(0, 100));

                this.material.uniforms.heightTextures.value = paddedHeightTextures;
                this.material.uniforms.tileBounds.value = paddedTileBounds;
                this.material.uniforms.tileElevRange.value = paddedTileElevRange;
                this.material.uniforms.tileCount.value = tiles.length;


                this.overlayMesh = new THREE.Mesh(geometry, this.material);
                this.scene.add(this.overlayMesh);

                resolve(this.overlayMesh);
            } catch (e) {
                reject(e);
            }
        });
    }


    /**
     * 更新高度偏移
     * @param {number} offset - 新的高度偏移值
     */
    updateOffset(offset) {
        this.offset = offset;

        // 仅更新材质的uniforms，由GPU实时处理高度偏移
        if (this.material) {
            this.material.uniforms.offset.value = offset;
            console.log('OverlayTerrainMesh高度偏移已更新：', offset);
        }
    }

    /**
     * 清理资源
     */
    dispose() {
        if (this.overlayMesh) {
            this.scene.remove(this.overlayMesh);
            this.overlayMesh.geometry.dispose();
            this.overlayMesh.material.dispose();
            this.overlayMesh = null;
        }
    }
}

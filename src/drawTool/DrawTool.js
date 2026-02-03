import * as THREE from 'three';
import { MarkerManager } from '../marker/marker.js';
import { CustomTerrainSurface } from '../terrain/CustomTerrainSurface.js';
/**
 * 绘制工具类
 * 提供点线面的绘制API，支持贴地和不贴地两种模式
 */
export class DrawTool {
    /**
     * 构造函数
     * @param {Object} options - 配置选项
     * @param {THREE.Scene} options.scene - Three.js场景
     * @param {Object} options.rgbTerrain - RGB地形实例
     * @param {Object} options.markerManager - 标记管理器实例
     */
    constructor(options) {
        this.options = {
            scene: null,
            rgbTerrain: null,
            markerManager: null,
            ...options
        };

        // 保存传递的依赖
        this.scene = this.options.scene;
        this.rgbTerrain = this.options.rgbTerrain;
        this.markerManager = this.options.markerManager || new MarkerManager(this.scene);
        this.CustomTerrainSurface = null;
        if (this.rgbTerrain) {
            this.CustomTerrainSurface = new CustomTerrainSurface(this.rgbTerrain, this.scene);
        }
        // 绘制对象组
        this.drawObjectsGroup = new THREE.Group();
        this.drawObjectsGroup.name = 'drawToolGroup';
        if (this.scene) {
            this.scene.add(this.drawObjectsGroup);
        }

        // 存储绘制的对象
        this.drawObjects = {
            points: [],
            lines: [],
            areas: []
        };
    }

    /**
     * 获取贴地坐标
     * @param {THREE.Vector3} point - 原始坐标点
     * @returns {THREE.Vector3} 贴地坐标点
     */
    getGroundPoint(point) {
        if (!this.rgbTerrain) return point.clone();

        const elevation = this.rgbTerrain.getElevationAtThreePosition(point.x, point.z);
        const result = point.clone();
        if (elevation !== null && typeof elevation !== 'undefined') {
            result.y = elevation;
        }

        return result;
    }

    /**
     * 绘制点（不贴地）
     * @param {THREE.Vector3} position - 点的位置
     * @param {Object} options - 点的配置选项
     * @returns {string} 点的ID
     */
    drawPoint(position, options = {}) {
        const defaultOptions = {
            radius: 1,
            color: 0xff0000,
            label: '',
            img: '',
            ...options
        };

        // 创建标记点
        const markerId = this.markerManager.createMarker({
            x: position.x,
            y: position.y,
            z: position.z,
            radius: defaultOptions.radius,
            color: defaultOptions.color,
            label: defaultOptions.label,
            img: defaultOptions.img
        });

        // 存储点信息
        const pointInfo = {
            id: markerId,
            type: 'point',
            position: position.clone(),
            isGround: false,
            options: defaultOptions
        };
        this.drawObjects.points.push(pointInfo);

        return markerId;
    }

    /**
     * 绘制贴地点
     * @param {THREE.Vector3} position - 点的位置
     * @param {Object} options - 点的配置选项
     * @returns {string} 点的ID
     */
    drawGroundPoint(position, options = {}) {
        // 获取贴地坐标
        const groundPosition = this.getGroundPoint(position);

        // 调用普通点绘制方法
        const markerId = this.drawPoint(groundPosition, options);

        // 更新点信息为贴地
        const pointInfo = this.drawObjects.points.find(p => p.id === markerId);
        if (pointInfo) {
            pointInfo.isGround = true;
            pointInfo.originalPosition = position.clone();
        }

        return markerId;
    }

    /**
     * 清除当前绘制的线
     */
    clearLines() {
        // 清除所有线
        for (const line of this.drawObjects.lines) {
            if (line.object) {
                this.drawObjectsGroup.remove(line.object);
                // 释放资源
                if (line.object.geometry) {
                    line.object.geometry.dispose();
                }
                if (line.object.material) {
                    line.object.material.dispose();
                }
            }
        }
        // 清空线数组
        this.drawObjects.lines = [];
    }

    /**
     * 绘制线（不贴地）
     * @param {Array<THREE.Vector3>} points - 线的顶点数组
     * @param {Object} options - 线的配置选项
     * @returns {string} 线的ID
     */
    drawLine(points, options = {}) {
        if (points.length < 2) {
            console.error('绘制线至少需要2个点');
            return null;
        }

        // 清除之前的线
        this.clearLines();

        const defaultOptions = {
            color: 0x00ff00,
            linewidth: 2,
            transparent: false,
            opacity: 1,
            ...options
        };

        // 创建线几何体
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
            color: defaultOptions.color,
            linewidth: defaultOptions.linewidth,
            transparent: defaultOptions.transparent,
            opacity: defaultOptions.opacity
        });
        const line = new THREE.Line(geometry, material);

        // 添加到场景
        this.drawObjectsGroup.add(line);

        // 生成唯一ID
        const lineId = `line_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // 存储线信息
        const lineInfo = {
            id: lineId,
            type: 'line',
            points: points.map(p => p.clone()),
            object: line,
            isGround: false,
            options: defaultOptions
        };
        this.drawObjects.lines.push(lineInfo);

        return lineId;
    }

    /**
     * 绘制贴地线
     * @param {Array<THREE.Vector3>} points - 线的顶点数组
     * @param {Object} options - 线的配置选项
     * @returns {string} 线的ID
     */
    drawGroundLine(points, options = {}) {
        if (points.length < 2) {
            console.error('绘制线至少需要2个点');
            return null;
        }

        // 生成贴地坐标点，参考测量工具中的路程测量折线链接逻辑
        const groundPoints = [];

        // 对每一段线段生成多个中间点，确保线贴地
        for (let i = 0; i < points.length - 1; i++) {
            const startPoint = points[i];
            const endPoint = points[i + 1];

            // 生成多个中间点，数量根据线段长度动态调整
            const segments = 20;

            for (let j = 0; j <= segments; j++) {
                const t = j / segments;
                // 线性插值获取中间点
                const x = startPoint.x + (endPoint.x - startPoint.x) * t;
                const z = startPoint.z + (endPoint.z - startPoint.z) * t;

                // 获取地形高度
                let y = startPoint.y + (endPoint.y - startPoint.y) * t;
                if (this.rgbTerrain) {
                    y = this.rgbTerrain.getElevationAtThreePosition(x, z) || y;
                }

                groundPoints.push(new THREE.Vector3(x, y, z));
            }
        }

        // 调用普通线绘制方法
        const lineId = this.drawLine(groundPoints, options);

        // 更新线信息为贴地
        const lineInfo = this.drawObjects.lines.find(l => l.id === lineId);
        if (lineInfo) {
            lineInfo.isGround = true;
            lineInfo.originalPoints = points.map(p => p.clone());
        }

        return lineId;
    }

    /**
     * 清除当前绘制的面
     */
    clearAreas() {
        // 清除所有面
        for (const area of this.drawObjects.areas) {
            if (area.type === 'terrain_area' && this.CustomTerrainSurface && area.surfaceId) {
                this.CustomTerrainSurface.removeSurface(area.surfaceId);
            } else if (area.object) {
                this.drawObjectsGroup.remove(area.object);
                // 释放资源
                if (area.object.geometry) {
                    area.object.geometry.dispose();
                }
                if (area.object.material) {
                    area.object.material.dispose();
                }
            }
        }
        // 清空面数组
        this.drawObjects.areas = [];
    }

    /**
     * 绘制面（不贴地）
     * @param {Array<THREE.Vector3>} points - 面的顶点数组
     * @param {Object} options - 面的配置选项
     * @returns {string} 面的ID
     */
    drawArea(points, options = {}) {
        if (points.length < 3) {
            console.error('绘制面至少需要3个点');
            return null;
        }

        // 清除之前的面
        this.clearAreas();

        const defaultOptions = {
            color: 0x0000ff,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
            ...options
        };

        // 创建几何体，使用原始点的坐标
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        geometry.computeVertexNormals();

        // 三角化处理
        const indices = [];
        for (let i = 1; i < points.length - 1; i++) {
            indices.push(0, i, i + 1);
        }
        geometry.setIndex(indices);

        const material = new THREE.MeshBasicMaterial({
            color: defaultOptions.color,
            transparent: defaultOptions.transparent,
            opacity: defaultOptions.opacity,
            side: defaultOptions.side
        });
        const mesh = new THREE.Mesh(geometry, material);

        // 添加到场景
        this.drawObjectsGroup.add(mesh);

        // 生成唯一ID
        const areaId = `area_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // 存储面信息
        const areaInfo = {
            id: areaId,
            type: 'area',
            points: points.map(p => p.clone()),
            object: mesh,
            isGround: false,
            options: defaultOptions
        };
        this.drawObjects.areas.push(areaInfo);

        return areaId;
    }

    /**
     * 绘制贴地面（使用Shader技术）
     * @param {Array<THREE.Vector3>} points - 面的顶点数组（x=东，-z=北）
     * @param {Object} options - 面的配置选项
     * @returns {string} 面的ID
     */
    drawGroundArea(points, options = {}) {
        if (points.length < 3) {
            console.error('绘制面至少需要3个点');
            return null;
        }

        const defaultOptions = {
            color: 0x0000ff,
            opacity: 0.5,
            transparent: true,
            side: THREE.DoubleSide,
            updateGroundGeometry: true,
            samplePrecision: 4, // 初始值建议≥10米，避免过度细分
            ...options
        };

        // 新增：提前计算多边形边长，自动调整精度（防止小面高精度卡死）
        const edgeLengths = [];
        for (let i = 0; i < points.length; i++) {
            const p1 = points[i];
            const p2 = points[(i + 1) % points.length];
            const dx = p2.x - p1.x;
            const dz = p2.z - p1.z;
            edgeLengths.push(Math.sqrt(dx * dx + dz * dz));
        }
        const avgEdgeLength = edgeLengths.reduce((a, b) => a + b, 0) / edgeLengths.length;

        // 自动限制最小精度为 平均边长/3（避免过度细分）
        if (defaultOptions.samplePrecision < avgEdgeLength / 3) {
            console.warn(`自动调整精度：平均边长${avgEdgeLength.toFixed(1)}米，精度不低于${(avgEdgeLength / 3).toFixed(1)}米`);
            defaultOptions.samplePrecision = avgEdgeLength / 3;
        }

        if (defaultOptions.updateGroundGeometry && this.CustomTerrainSurface) {
            // Shader-overlay drape: style is driven by the surface helper.
            // Keep it simple: one style for all polygons in this helper instance.
            if (typeof this.CustomTerrainSurface.setColor === 'function') {
                this.CustomTerrainSurface.setColor(defaultOptions.color, defaultOptions.opacity);
            }
            const surfaceOptions = {
                color: defaultOptions.color,
                opacity: defaultOptions.opacity,
                useSatelliteTexture: false,
                samplePrecision: defaultOptions.samplePrecision,
                transparent: defaultOptions.transparent,
                side: defaultOptions.side,
                // Follow TerrainEditor raiseLower behavior: lift by ~0.01m for visibility.
                delta: 0.01
            };

            const created = this.CustomTerrainSurface.createSurface(points, surfaceOptions);
            const surfaceId = created?.id ?? created;
            const surfaceMesh = created?.mesh ?? null;
            

            if (!surfaceId) {
                console.error('创建贴地面失败，降级为普通面');
                return this.drawArea(points, defaultOptions);
            }

            const areaId = surfaceId;
            const areaInfo = {
                id: areaId,
                type: 'terrain_area',
                points: points.map(p => p.clone()),
                object: surfaceMesh,
                isGround: true,
                isTemporary: false,
                surfaceId: surfaceId,
                options: defaultOptions
            };
            this.drawObjects.areas.push(areaInfo);

            return areaId;
        } else {
            console.log("降级使用普通面");
            return this.drawArea(points, defaultOptions); // 补全降级逻辑
        }
    }


    /**
     * 删除绘制对象
     * @param {string} id - 绘制对象的ID
     * @returns {boolean} 是否删除成功
     */
    removeObject(id) {
        // 查找对象
        let objectInfo = null;
        let objectType = null;

        for (const type of ['points', 'lines', 'areas']) {
            objectInfo = this.drawObjects[type].find(obj => obj.id === id);
            if (objectInfo) {
                objectType = type;
                break;
            }
        }

        if (!objectInfo) {
            console.error(`未找到ID为${id}的绘制对象`);
            return false;
        }

        // 删除对象
        if (objectType === 'points') {
            // 删除标记点
            this.markerManager.removeMarker(id);
        } else if (objectInfo.type === 'terrain_area' && this.CustomTerrainSurface) {
            // 如果是使用TerrainAlignedSurface创建的面，使用它的删除方法
            if (objectInfo.surfaceId) {
                this.CustomTerrainSurface.removeSurface(objectInfo.surfaceId);
            }
        } else {
            // 删除普通Three.js对象
            if (objectInfo.object) {
                this.drawObjectsGroup.remove(objectInfo.object);
                // 释放资源
                if (objectInfo.object.geometry) {
                    objectInfo.object.geometry.dispose();
                }
                if (objectInfo.object.material) {
                    if (Array.isArray(objectInfo.object.material)) {
                        objectInfo.object.material.forEach(material => material.dispose());
                    } else {
                        objectInfo.object.material.dispose();
                    }
                }
            }
        }

        // 从数组中移除
        this.drawObjects[objectType] = this.drawObjects[objectType].filter(obj => obj.id !== id);

        return true;
    }

    /**
     * 清除所有绘制对象
     */
    clearAll() {
        // 清除所有标记点
        this.markerManager.clearAllMarkers();

        // 清除所有线和面
        for (const type of ['lines', 'areas']) {
            for (const obj of this.drawObjects[type]) {
                if (obj.type === 'terrain_area' && this.CustomTerrainSurface && obj.surfaceId) {
                    // 如果是使用TerrainAlignedSurface创建的面，使用它的删除方法
                    this.CustomTerrainSurface.removeSurface(obj.surfaceId);
                } else if (obj.object) {
                    // 删除普通Three.js对象
                    this.drawObjectsGroup.remove(obj.object);
                    // 释放资源
                    if (obj.object.geometry) {
                        obj.object.geometry.dispose();
                    }
                    if (obj.object.material) {
                        if (Array.isArray(obj.object.material)) {
                            obj.object.material.forEach(material => material.dispose());
                        } else {
                            obj.object.material.dispose();
                        }
                    }
                }
            }
        }

        // 清空数组
        this.drawObjects = {
            points: [],
            lines: [],
            areas: []
        };

        // 如果有TerrainAlignedSurface，也清除它的所有表面
        if (this.CustomTerrainSurface) {
            this.CustomTerrainSurface.clearAll();
        }
    }

    /**
     * 获取绘制对象信息
     * @param {string} id - 绘制对象的ID
     * @returns {Object|null} 绘制对象信息
     */
    getObjectInfo(id) {
        for (const type of ['points', 'lines', 'areas']) {
            const objectInfo = this.drawObjects[type].find(obj => obj.id === id);
            if (objectInfo) {
                return objectInfo;
            }
        }
        return null;
    }

    /**
     * 获取所有绘制对象
     * @returns {Object} 所有绘制对象
     */
    getAllObjects() {
        return { ...this.drawObjects };
    }

    /**
     * 销毁绘制工具
     */
    dispose() {
        // 清除所有绘制对象
        this.clearAll();

        // 从场景移除绘制对象组
        if (this.scene && this.drawObjectsGroup) {
            this.scene.remove(this.drawObjectsGroup);
        }

        // 清空引用
        this.scene = null;
        this.rgbTerrain = null;
        this.markerManager = null;
    }
}

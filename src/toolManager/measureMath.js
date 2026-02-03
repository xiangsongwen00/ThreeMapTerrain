import * as THREE from 'three';

/**
 * 测量工具的核心计算函数
 */
export class MeasureMath {
    /**
     * 计算两点之间的贴地距离（考虑地形起伏）
     * @param {THREE.Vector3} startPoint - 起点
     * @param {THREE.Vector3} endPoint - 终点
     * @param {Object} rgbTerrain - RGB地形实例（可选）
     * @returns {number} 贴地距离
     */
    static calculateGroundDistance(startPoint, endPoint, rgbTerrain = null) {
        const segments = 20;
        let groundDistance = 0;
        
        // 生成中间点并计算贴地距离
        for (let i = 0; i < segments; i++) {
            const t1 = i / segments;
            const t2 = (i + 1) / segments;
            
            // 计算两个相邻中间点
            const x1 = startPoint.x + (endPoint.x - startPoint.x) * t1;
            const z1 = startPoint.z + (endPoint.z - startPoint.z) * t1;
            const x2 = startPoint.x + (endPoint.x - startPoint.x) * t2;
            const z2 = startPoint.z + (endPoint.z - startPoint.z) * t2;
            
            // 获取地形高度
            let y1 = startPoint.y + (endPoint.y - startPoint.y) * t1;
            let y2 = startPoint.y + (endPoint.y - startPoint.y) * t2;
            
            if (rgbTerrain) {
                y1 = rgbTerrain.getElevationAtThreePosition(x1, z1) || y1;
                y2 = rgbTerrain.getElevationAtThreePosition(x2, z2) || y2;
            }
            
            // 创建两个中间点的Vector3对象
            const p1 = new THREE.Vector3(x1, y1, z1);
            const p2 = new THREE.Vector3(x2, y2, z2);
            
            // 计算两个中间点之间的距离并累加到总距离
            groundDistance += p1.distanceTo(p2);
        }
        
        return groundDistance;
    }

    /**
     * 计算多边形面积（使用鞋带公式）
     * @param {Array<THREE.Vector3>} points - 多边形顶点列表
     * @returns {number} 多边形面积
     */
    static calculatePolygonArea(points) {
        if (points.length < 3) return 0;

        let area = 0;
        const n = points.length;

        // 使用鞋带公式计算多边形面积
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            area += points[i].x * points[j].z;
            area -= points[j].x * points[i].z;
        }

        return Math.abs(area) / 2;
    }

    /**
     * 计算地理面积（基于经纬度）
     * @param {Array<Object>} lonLatPoints - 经纬度点列表
     * @param {Object} mathProj - 坐标转换工具
     * @returns {number} 地理面积（平方米）
     */
    static calculateGeographicArea(lonLatPoints, mathProj) {
        if (lonLatPoints.length < 3 || !mathProj) return 0;
        
        // 使用更简单可靠的方法计算地理面积
        // 将球面多边形分解为多个三角形，计算每个三角形的面积并求和
        const R = 6371000; // 地球半径（米）
        let totalArea = 0;
        const n = lonLatPoints.length;
        
        // 以第一个点为中心，将多边形分解为三角形
        for (let i = 1; i < n - 1; i++) {
            const p1 = lonLatPoints[0];
            const p2 = lonLatPoints[i];
            const p3 = lonLatPoints[i + 1];
            
            // 计算三角形的边长
            const a = mathProj.calculateGeographicDistance(p1, p2);
            const b = mathProj.calculateGeographicDistance(p2, p3);
            const c = mathProj.calculateGeographicDistance(p3, p1);
            
            // 使用海伦公式计算三角形面积
            const s = (a + b + c) / 2;
            const triangleArea = Math.sqrt(s * (s - a) * (s - b) * (s - c));
            
            totalArea += triangleArea;
        }
        
        return totalArea;
    }

    /**
     * 计算地形面积（考虑地形起伏）
     * @param {Array<Object>} points - 点列表，每个点包含three坐标
     * @param {Object} rgbTerrain - RGB地形实例（可选）
     * @returns {number} 地形面积（平方米）
     */
    static calculateTerrainArea(points, rgbTerrain = null) {
        if (points.length < 3) return 0;
        
        // 简化实现：将多边形分割成多个三角形，计算每个三角形的面积并求和
        // 考虑地形起伏，计算每个三角形的实际表面积
        let totalArea = 0;
        
        // 生成贴地的点
        const groundPoints = points.map(p => {
            const x = p.three.x;
            const z = p.three.z;
            
            // 获取地形高度
            let y = p.three.y;
            if (rgbTerrain) {
                y = rgbTerrain.getElevationAtThreePosition(x, z) || y;
            }
            
            return new THREE.Vector3(x, y, z);
        });
        
        // 以第一个点为顶点，将多边形分割成多个三角形
        for (let i = 1; i < groundPoints.length - 1; i++) {
            const p1 = groundPoints[0];
            const p2 = groundPoints[i];
            const p3 = groundPoints[i + 1];
            
            // 计算三角形的表面积
            const area = this.calculateTriangleSurfaceArea(p1, p2, p3);
            totalArea += area;
        }
        
        return totalArea;
    }

    /**
     * 计算三角形的表面积（考虑地形起伏）
     * @param {THREE.Vector3} p1 - 第一个点
     * @param {THREE.Vector3} p2 - 第二个点
     * @param {THREE.Vector3} p3 - 第三个点
     * @returns {number} 三角形表面积（平方米）
     */
    static calculateTriangleSurfaceArea(p1, p2, p3) {
        // 计算三角形的三条边向量
        const v1 = p2.clone().sub(p1);
        const v2 = p3.clone().sub(p1);
        
        // 计算叉积的模长的一半，即为三角形的面积
        const crossProduct = v1.cross(v2);
        const area = crossProduct.length() / 2;
        
        return area;
    }

    /**
     * 生成剖面数据
     * @param {THREE.Vector3} startPoint - 起点
     * @param {THREE.Vector3} endPoint - 终点
     * @param {number} segments - 分段数量
     * @param {Object} rgbTerrain - RGB地形实例（可选）
     * @param {Object} mathProj - 坐标转换工具
     * @returns {Array} 剖面数据数组
     */
    static generateProfileData(startPoint, endPoint, segments, rgbTerrain = null, mathProj = null) {
        const profileData = [];
        
        // 计算方向向量
        const direction = endPoint.clone().sub(startPoint);
        const step = direction.divideScalar(segments);
        
        // 生成剖面点
        for (let i = 0; i <= segments; i++) {
            const point = startPoint.clone().add(step.clone().multiplyScalar(i));
            
            // 计算到起点的距离
            const distance = startPoint.distanceTo(point);
            
            // 获取海拔高度（实际应从地形数据中获取，这里简化处理）
            let elevation = point.y;
            
            // 如果有rgbTerrain，尝试获取更精确的海拔
            if (rgbTerrain) {
                elevation = rgbTerrain.getElevationAtThreePosition(point.x, point.z) || point.y;
            }
            
            // 添加经纬度信息
            let lonLat = { lon: 0, lat: 0 };
            if (mathProj) {
                lonLat = mathProj.threeToLonLat(point);
            }
            
            profileData.push({
                distance: distance,
                elevation: elevation,
                x: point.x,
                y: point.y,
                z: point.z,
                lon: lonLat.lon,
                lat: lonLat.lat
            });
        }
        
        return profileData;
    }
}

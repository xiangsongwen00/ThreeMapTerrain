import * as THREE from 'three';

/**
 * 坐标转换工具类
 * 提供完整的坐标转换功能：
 * 1. 经纬度 ↔ Web墨卡托(EPSG:3857)
 * 2. Web墨卡托 ↔ Three.js场景坐标
 * 3. 经纬度 ↔ Three.js场景坐标
 * 4. 纹理坐标 ↔ Web墨卡托
 * 5. 纹理坐标 ↔ Three.js场景坐标
 */
export class MathProj {
    /**
     * 构造函数
     * @param {Object} options - 配置选项
     * @param {number} options.centerLon - 场景中心经度
     * @param {number} options.centerLat - 场景中心纬度
     * @param {number} [options.earthRadius] - 地球半径（默认6378137米，WGS84椭球长半轴）
     * @param {number} [options.geodeticRadius] - 测地距离计算使用的地球半径（默认6371000米，地球平均半径）
     */
    constructor(options = {}) {
        this.options = {
            centerLon: 0,
            centerLat: 0,
            earthRadius: 6378137.0, // WGS84椭球长半轴，Web Mercator投影标准半径
            geodeticRadius: 6371000.0, // 地球平均半径，用于测地距离计算
            ...options
        };

        // 存储高精度地球半径参数
        this.earthRadius = this.options.earthRadius;
        this.geodeticRadius = this.options.geodeticRadius;

        // 计算场景中心的Web墨卡托坐标
        this.centerMercator = this.lonLatToMercator(this.options.centerLon, this.options.centerLat);
    }

    // ===================== 经纬度 ↔ Web墨卡托 =====================

    /**
     * 经纬度转Web墨卡托(EPSG:3857)
     * @param {number} lon - 经度
     * @param {number} lat - 纬度
     * @returns {Object} Web墨卡托坐标 {x, y}
     */
    lonLatToMercator(lon, lat) {
        // 使用高精度计算Web Mercator坐标
        const x = this.earthRadius * lon * Math.PI / 180.0;

        // 高精度计算y坐标，确保tan函数参数计算准确
        const latRad = lat * Math.PI / 180.0;
        const y = this.earthRadius * Math.log(Math.tan(Math.PI / 4.0 + latRad / 2.0));

        return { x, y };
    }

    /**
     * Web墨卡托(EPSG:3857)转经纬度
     * @param {number} x - Web墨卡托X坐标
     * @param {number} y - Web墨卡托Y坐标
     * @returns {Object} 经纬度 {lon, lat}
     */
    mercatorToLonLat(x, y) {
        // 使用高精度计算经纬度
        const lon = x * 180.0 / (this.earthRadius * Math.PI);

        // 高精度计算纬度，确保exp和atan函数计算准确
        const latRad = 2.0 * Math.atan(Math.exp(y / this.earthRadius)) - Math.PI / 2.0;
        const lat = latRad * 180.0 / Math.PI;

        return { lon, lat };
    }

    // ===================== Web墨卡托 ↔ Three.js场景坐标 =====================

    /**
     * Web墨卡托(EPSG:3857)转Three.js场景坐标
     * @param {number} mercatorX - Web墨卡托X坐标
     * @param {number} mercatorY - Web墨卡托Y坐标
     * @param {number} [mercatorZ] - Web墨卡托Z坐标（默认0）
     * @returns {THREE.Vector3} Three.js场景坐标
     */
    mercatorToThree(mercatorX, mercatorY, mercatorZ = 0) {
        // Three.js单位直接对应Web墨卡托坐标（不使用比例尺因子）
        const threeX = mercatorX - this.centerMercator.x; // 东 → X
        const threeZ = -(mercatorY - this.centerMercator.y); // 北 → -Z
        return new THREE.Vector3(threeX, mercatorZ, threeZ);
    }

    /**
     * Three.js场景坐标转Web墨卡托(EPSG:3857)
     * @param {number|THREE.Vector3} threeX - Three.js X坐标或Vector3对象
     * @param {number} [threeY] - Three.js Y坐标（当threeX为Vector3时可选）
     * @param {number} [threeZ] - Three.js Z坐标（当threeX为Vector3时可选）
     * @returns {Object} Web墨卡托坐标 {x, y, z}
     */
    threeToMercator(threeX, threeY = 0, threeZ = 0) {
        // 处理Vector3输入
        if (threeX instanceof THREE.Vector3) {
            threeZ = threeX.z;
            threeY = threeX.y;
            threeX = threeX.x;
        }

        // Three.js单位直接对应Web墨卡托坐标（不使用比例尺因子）
        const mercatorX = threeX + this.centerMercator.x; // X → 东
        const mercatorY = this.centerMercator.y - threeZ; // -Z → 北
        return { x: mercatorX, y: mercatorY, z: threeY };
    }

    // ===================== 经纬度 ↔ Three.js场景坐标 =====================

    /**
     * 经纬度转Three.js场景坐标
     * @param {number} lon - 经度
     * @param {number} lat - 纬度
     * @param {number} [elevation] - 高程（默认0）
     * @returns {THREE.Vector3} Three.js场景坐标
     */
    lonLatToThree(lon, lat, elevation = 0) {
        const mercator = this.lonLatToMercator(lon, lat);
        return this.mercatorToThree(mercator.x, mercator.y, elevation);
    }

    /**
     * Three.js场景坐标转经纬度
     * @param {number|THREE.Vector3} threeX - Three.js X坐标或Vector3对象
     * @param {number} [threeY] - Three.js Y坐标（当threeX为Vector3时可选）
     * @param {number} [threeZ] - Three.js Z坐标（当threeX为Vector3时可选）
     * @returns {Object} 经纬度及高程 {lon, lat, elevation}
     */
    threeToLonLat(threeX, threeY = 0, threeZ = 0) {
        const mercator = this.threeToMercator(threeX, threeY, threeZ);
        const lonLat = this.mercatorToLonLat(mercator.x, mercator.y);
        return {
            lon: lonLat.lon,
            lat: lonLat.lat,
            elevation: mercator.z
        };
    }

    // ===================== 瓦片相关转换 =====================

    /**
     * 经纬度转瓦片行列号
     * @param {number} lon - 经度
     * @param {number} lat - 纬度
     * @param {number} zoom - 缩放级别
     * @returns {Object} 瓦片行列号 {x, y}
     */
    lonLatToTile(lon, lat, zoom) {
        const n = Math.pow(2, zoom);
        const tileX = Math.floor((lon + 180) / 360 * n);
        const latRad = lat * Math.PI / 180;
        const tileY = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
        return { x: tileX, y: tileY };
    }

    /**
     * 瓦片行列号转经纬度（瓦片左上角坐标）
     * @param {number} tileX - 瓦片X坐标
     * @param {number} tileY - 瓦片Y坐标
     * @param {number} zoom - 缩放级别
     * @returns {Object} 经纬度 {lon, lat}
     */
    tileToLonLat(tileX, tileY, zoom) {
        const n = Math.pow(2, zoom);
        const lon = tileX / n * 360.0 - 180.0;
        const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * tileY / n)));
        const lat = latRad * 180.0 / Math.PI;
        return { lon, lat };
    }

    /**
     * 瓦片行列号转Web墨卡托范围
     * @param {number} tileX - 瓦片X坐标
     * @param {number} tileY - 瓦片Y坐标
     * @param {number} zoom - 缩放级别
     * @returns {Object} 瓦片Web墨卡托范围 {min: {x, y}, max: {x, y}}
     */
    tileToMercatorBounds(tileX, tileY, zoom) {
        const topLeftLonLat = this.tileToLonLat(tileX, tileY, zoom);
        const bottomRightLonLat = this.tileToLonLat(tileX + 1, tileY + 1, zoom);

        const topLeftMercator = this.lonLatToMercator(topLeftLonLat.lon, topLeftLonLat.lat);
        const bottomRightMercator = this.lonLatToMercator(bottomRightLonLat.lon, bottomRightLonLat.lat);

        return {
            min: topLeftMercator,
            max: bottomRightMercator
        };
    }

    // ===================== 纹理坐标相关转换 =====================

    /**
     * 纹理坐标转Web墨卡托坐标
     * @param {number} u - 纹理U坐标（0~1）
     * @param {number} v - 纹理V坐标（0~1）
     * @param {Object} bounds - Web墨卡托范围 {min: {x, y}, max: {x, y}}
     * @returns {Object} Web墨卡托坐标 {x, y}
     */
    uvToMercator(u, v, bounds) {
        const x = bounds.min.x + (bounds.max.x - bounds.min.x) * u;
        const y = bounds.max.y - (bounds.max.y - bounds.min.y) * v; // 纹理V轴与墨卡托Y轴反向
        return { x, y };
    }

    /**
     * Web墨卡托坐标转纹理坐标
     * @param {number} mercatorX - Web墨卡托X坐标
     * @param {number} mercatorY - Web墨卡托Y坐标
     * @param {Object} bounds - Web墨卡托范围 {min: {x, y}, max: {x, y}}
     * @returns {Object} 纹理坐标 {u, v}
     */
    mercatorToUv(mercatorX, mercatorY, bounds) {
        const u = (mercatorX - bounds.min.x) / (bounds.max.x - bounds.min.x);
        const v = 1 - (mercatorY - bounds.min.y) / (bounds.max.y - bounds.min.y); // 纹理V轴与墨卡托Y轴反向
        return { u, v };
    }

    /**
     * 纹理坐标转Three.js场景坐标
     * @param {number} u - 纹理U坐标（0~1）
     * @param {number} v - 纹理V坐标（0~1）
     * @param {Object} bounds - Web墨卡托范围 {min: {x, y}, max: {x, y}}
     * @param {number} [elevation] - 高程（默认0）
     * @returns {THREE.Vector3} Three.js场景坐标
     */
    uvToThree(u, v, bounds, elevation = 0) {
        const mercator = this.uvToMercator(u, v, bounds);
        return this.mercatorToThree(mercator.x, mercator.y, elevation);
    }

    /**
     * Three.js场景坐标转纹理坐标
     * @param {number|THREE.Vector3} threeX - Three.js X坐标或Vector3对象
     * @param {number} [threeY] - Three.js Y坐标（当threeX为Vector3时可选）
     * @param {number} [threeZ] - Three.js Z坐标（当threeX为Vector3时可选）
     * @param {Object} bounds - Web墨卡托范围 {min: {x, y}, max: {x, y}}
     * @returns {Object} 纹理坐标 {u, v}
     */
    threeToUv(threeX, threeY = 0, threeZ = 0, bounds) {
        const mercator = this.threeToMercator(threeX, threeY, threeZ);
        return this.mercatorToUv(mercator.x, mercator.y, bounds);
    }

    // ===================== 辅助方法 =====================

    /**
     * 更新场景中心坐标
     * @param {number} centerLon - 新的中心经度
     * @param {number} centerLat - 新的中心纬度
     */
    updateCenter(centerLon, centerLat) {
        this.options.centerLon = centerLon;
        this.options.centerLat = centerLat;
        this.centerMercator = this.lonLatToMercator(centerLon, centerLat);
    }

    /**
     * 获取当前场景中心的Web墨卡托坐标
     * @returns {Object} 中心Web墨卡托坐标 {x, y}
     */
    getCenterMercator() {
        return { ...this.centerMercator };
    }

    /**
     * 计算两点之间的Web墨卡托距离（投影距离）
     * @param {Object} mercator1 - 第一个点的Web墨卡托坐标 {x, y}
     * @param {Object} mercator2 - 第二个点的Web墨卡托坐标 {x, y}
     * @returns {number} 距离（米）
     */
    calculateMercatorDistance(mercator1, mercator2) {
        const dx = mercator2.x - mercator1.x;
        const dy = mercator2.y - mercator1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * 计算两点之间的实际地理距离（使用哈弗辛公式）
     * @param {Object} point1 - 第一个点的经纬度 {lon, lat}
     * @param {Object} point2 - 第二个点的经纬度 {lon, lat}
     * @returns {number} 实际地理距离（米）
     */
    calculateGeographicDistance(point1, point2) {
        // 使用高精度地球平均半径（WGS84椭球的平均半径）
        const R = this.geodeticRadius;

        // 将经纬度转换为弧度，使用高精度计算
        const φ1 = point1.lat * Math.PI / 180.0;
        const φ2 = point2.lat * Math.PI / 180.0;
        const Δφ = (point2.lat - point1.lat) * Math.PI / 180.0;
        const Δλ = (point2.lon - point1.lon) * Math.PI / 180.0;

        // 哈弗辛公式计算，确保所有运算使用高精度
        const sinΔφ2 = Math.sin(Δφ / 2.0);
        const sinΔλ2 = Math.sin(Δλ / 2.0);

        const a = sinΔφ2 * sinΔφ2 +
            Math.cos(φ1) * Math.cos(φ2) *
            sinΔλ2 * sinΔλ2;

        // 使用Math.atan2的高精度特性
        const c = 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(1.0 - a));

        // 返回高精度距离结果
        return R * c;
    }

    /**
     * 计算Three.js场景中两点之间的欧氏距离
     * @param {THREE.Vector3|Object} point1 - 第一个点的Three.js坐标
     * @param {THREE.Vector3|Object} point2 - 第二个点的Three.js坐标
     * @returns {number} 场景距离（单位）
     */
    calculateSceneDistance(point1, point2) {
        // 处理Vector3输入
        const p1 = point1 instanceof THREE.Vector3 ? point1 : new THREE.Vector3(point1.x, point1.y, point1.z);
        const p2 = point2 instanceof THREE.Vector3 ? point2 : new THREE.Vector3(point2.x, point2.y, point2.z);

        return p1.distanceTo(p2);
    }

    /**
     * 计算Three.js场景坐标对应的实际地理距离
     * @param {THREE.Vector3|Object} point1 - 第一个点的Three.js坐标
     * @param {THREE.Vector3|Object} point2 - 第二个点的Three.js坐标
     * @returns {number} 实际地理距离（米）
     */
    calculateThreeToGeographicDistance(point1, point2) {
        // 将Three.js坐标转换为经纬度
        const lonLat1 = this.threeToLonLat(point1);
        const lonLat2 = this.threeToLonLat(point2);

        // 计算实际地理距离
        return this.calculateGeographicDistance(lonLat1, lonLat2);
    }

    /**
     * 计算两点之间的方向角度（弧度）
     * 坐标转换关系：东 → Three X，北 → Three -Z，上 → Three Y
     * @param {THREE.Vector3|Object} point1 - 第一个点的Three.js坐标
     * @param {THREE.Vector3|Object} point2 - 第二个点的Three.js坐标
     * @returns {Object} 角度信息（弧度）
     */
    calculateDirectionAngles(point1, point2) {
        // 处理Vector3输入
        const p1 = point1 instanceof THREE.Vector3 ? point1 : new THREE.Vector3(point1.x, point1.y, point1.z);
        const p2 = point2 instanceof THREE.Vector3 ? point2 : new THREE.Vector3(point2.x, point2.y, point2.z);

        // 计算差值向量
        const dx = p2.x - p1.x;  // 东方向分量
        const dy = p2.y - p1.y;  // 垂直方向分量（高度差）
        const dz = p2.z - p1.z;  // 北方向分量（注意：Three Z轴负方向为北）

        // 水平投影方向角度（与东方向的夹角，俯视面角度）
        // 东方向向量为(1, 0, 0)，投影到水平面为(dx, 0, dz)
        // 使用atan2计算角度，范围[-π, π]
        const horizontalAngle = Math.atan2(-dz, dx); // 注意：北方向对应-Z，所以用-dz

        // 前视图投影角度（投影到X-Y平面后的角度）
        // 前视图是X-Y平面（东西和高度）
        const frontViewAngle = Math.atan2(Math.abs(dy), dx);

        // 左视图投影角度（投影到Y-Z平面后的角度）
        // 左视图是Y-Z平面（高度和南北），注意北方向对应-Z
        const leftViewAngle = Math.atan2(Math.abs(dy), -dz);

        return {
            horizontal: horizontalAngle,  // 水平投影角度（弧度）
            frontView: frontViewAngle,    // 前视图投影角度（弧度）
            leftView: leftViewAngle       // 左视图投影角度（弧度）
        };
    }

    /**
     * 计算两点在东方向和北方向的距离分量
     * 坐标转换关系：东 → Three X，北 → Three -Z
     * @param {THREE.Vector3|Object} point1 - 第一个点的Three.js坐标
     * @param {THREE.Vector3|Object} point2 - 第二个点的Three.js坐标
     * @returns {Object} 方向距离信息
     */
    calculateDirectionDistances(point1, point2) {
        // 处理Vector3输入
        const p1 = point1 instanceof THREE.Vector3 ? point1 : new THREE.Vector3(point1.x, point1.y, point1.z);
        const p2 = point2 instanceof THREE.Vector3 ? point2 : new THREE.Vector3(point2.x, point2.y, point2.z);

        // 东方向距离分量（Three X差值）
        const eastThreeDistance = p2.x - p1.x;

        // 北方向距离分量（Three -Z差值）
        const northThreeDistance = -(p2.z - p1.z);

        // 计算测地距离分量（经纬度转换后计算）
        const lonLat1 = this.threeToLonLat(p1);
        const lonLat2 = this.threeToLonLat(p2);

        // 东方向测地距离（经度差对应的距离）
        const eastGeodesicDistance = this.calculateGeographicDistance(
            { lon: lonLat1.lon, lat: lonLat1.lat },
            { lon: lonLat2.lon, lat: lonLat1.lat }
        );

        // 考虑方向（东为正，西为负）
        const eastGeodesicDistanceDirected = lonLat2.lon > lonLat1.lon ? eastGeodesicDistance : -eastGeodesicDistance;

        // 北方向测地距离（纬度差对应的距离）
        const northGeodesicDistance = this.calculateGeographicDistance(
            { lon: lonLat1.lon, lat: lonLat1.lat },
            { lon: lonLat1.lon, lat: lonLat2.lat }
        );

        // 考虑方向（北为正，南为负）
        const northGeodesicDistanceDirected = lonLat2.lat > lonLat1.lat ? northGeodesicDistance : -northGeodesicDistance;

        return {
            east: {
                three: eastThreeDistance,
                geodesicsigned: eastGeodesicDistanceDirected  // 测地距离（带方向）
            },
            north: {
                three: northThreeDistance,
                geodesicsigned: northGeodesicDistanceDirected  // 测地距离（带方向）
            }
        };
    }

    /**
     * 将角度从弧度转换为度
     * @param {number} radians - 弧度
     * @returns {number} 度数
     */
    radiansToDegrees(radians) {
        return radians * 180.0 / Math.PI;
    }
    
    /**
     * 将角度从度转换为弧度
     * @param {number} degrees - 度数
     * @returns {number} 弧度
     */
    degreesToRadians(degrees) {
        return degrees * Math.PI / 180.0;
    }
}

/**
 * 创建全局的坐标转换实例（默认配置）
 * 可以在应用启动时初始化，然后在整个应用中使用
 */
export let globalMathProj = null;

/**
 * 初始化全局坐标转换实例
 * @param {Object} options - 配置选项
 */
export function initMathProj(options) {
    globalMathProj = new MathProj(options);
    return globalMathProj;
}

/**
 * 获取全局坐标转换实例
 * @returns {MathProj} 全局坐标转换实例
 */
export function getMathProj() {
    if (!globalMathProj) {
        console.warn('全局MathProj实例尚未初始化，将使用默认配置创建');
        globalMathProj = new MathProj();
    }
    return globalMathProj;
}
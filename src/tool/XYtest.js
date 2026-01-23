import * as THREE from 'three';
import { MathProj } from '../Math/mathProj';

class XYtest {
    constructor(scene, mathProj, markerManager, testMath) {
        this.scene = scene;
        this.mathProj = mathProj;
        this.markerManager = markerManager;
        this.testMath = testMath;
        this.markerGroup = new THREE.Group();
        this.scene.add(this.markerGroup);
        this.line = null;
        
        // 创建UI
        this.createUI();
        
        // 注册拾取回调
        this.registerPickCallback();
        
        // 执行初始测试
        this.calculateDistance();
    }
    
    // 哈弗辛公式计算实际地理距离
    calculateActualDistance(lon1, lat1, lon2, lat2) {
        // 使用与MathProj相同的高精度地球平均半径
        const R = this.mathProj.geodeticRadius;
        
        // 将经纬度转换为弧度，使用高精度计算
        const φ1 = lat1 * Math.PI / 180.0;
        const φ2 = lat2 * Math.PI / 180.0;
        const Δφ = (lat2 - lat1) * Math.PI / 180.0;
        const Δλ = (lon2 - lon1) * Math.PI / 180.0;
        
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
    
    // 计算Web Mercator投影的比例尺因子
    calculateMercatorScale(lat) {
        // Web Mercator在特定纬度的比例尺因子
        const latRad = lat * Math.PI / 180;
        return 1 / Math.cos(latRad);
    }
    
    // 计算Three.js场景中的距离
    calculateSceneDistance(point1, point2) {
        const vector1 = new THREE.Vector3(point1.x, point1.y, point1.z);
        const vector2 = new THREE.Vector3(point2.x, point2.y, point2.z);
        return vector1.distanceTo(vector2);
    }
    
    // 执行距离计算
    calculateDistance() {
        // 清空之前的标记和线条
        this.clearMarkers();
        
        // 获取所有标记点
        const markers = Array.from(this.markerManager.markers.values());
        
        // 检查是否有至少两个标记点
        if (markers.length < 2) {
            console.log('标记点不足，无法计算距离');
            this.updateUIWithMessage('请先拾取至少两个点');
            return;
        }
        
        // 获取最新的两个标记点
        const lastMarker = markers[markers.length - 1];
        const secondLastMarker = markers[markers.length - 2];
        
        // 获取标记点的Three.js坐标
        const threePoint1 = secondLastMarker.children[0].position;
        const threePoint2 = lastMarker.children[0].position;
        
        // 将Three.js坐标转换为经纬度
        const lonLat1 = this.mathProj.threeToLonLat(threePoint1);
        const lonLat2 = this.mathProj.threeToLonLat(threePoint2);
        
        // 计算实际地理距离
        const actualDistance = this.calculateActualDistance(
            lonLat1.lon, lonLat1.lat,
            lonLat2.lon, lonLat2.lat
        );
        
        // 计算场景中的距离
        const sceneDistance = this.calculateSceneDistance(threePoint1, threePoint2);
        
        // 计算纬度处的比例尺因子
        const avgLat = (lonLat1.lat + lonLat2.lat) / 2;
        const mercatorScale = this.calculateMercatorScale(avgLat);
        
        // 计算预期的Web Mercator距离（考虑比例尺因子）
        const expectedMercatorDistance = actualDistance * mercatorScale;
        
        // 计算Web Mercator坐标并计算距离
        const mercator1 = this.mathProj.lonLatToMercator(lonLat1.lon, lonLat1.lat);
        const mercator2 = this.mathProj.lonLatToMercator(lonLat2.lon, lonLat2.lat);
        const actualMercatorDistance = Math.sqrt(
            Math.pow(mercator2.x - mercator1.x, 2) +
            Math.pow(mercator2.y - mercator1.y, 2)
        );
        
        // 创建连接线
        this.createLine(threePoint1, threePoint2);
        
        // 输出结果
   
        
        // 更新UI显示
        this.updateUI(actualDistance, sceneDistance, avgLat, mercatorScale, expectedMercatorDistance, actualMercatorDistance);
    }
    
    // 创建标记
    createMarker(position, color) {
        const geometry = new THREE.SphereGeometry(5, 16, 16);
        const material = new THREE.MeshBasicMaterial({ color: color });
        const sphere = new THREE.Mesh(geometry, material);
        sphere.position.copy(position);
        this.markerGroup.add(sphere);
    }
    
    // 创建连接线
    createLine(point1, point2) {
        const geometry = new THREE.BufferGeometry().setFromPoints([point1, point2]);
        const material = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
        this.line = new THREE.Line(geometry, material);
        this.scene.add(this.line);
    }
    
    // 清空标记和线条
    clearMarkers() {
        while (this.markerGroup.children.length > 0) {
            this.markerGroup.remove(this.markerGroup.children[0]);
        }
        
        if (this.line) {
            this.scene.remove(this.line);
            this.line = null;
        }
    }
    
    // 创建UI
    createUI() {
        // 创建一个简单的UI面板
        const uiPanel = document.createElement('div');
        uiPanel.style.position = 'absolute';
        uiPanel.style.bottom = '10px';
        uiPanel.style.left = '10px';
        uiPanel.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        uiPanel.style.color = 'white';
        uiPanel.style.padding = '10px';
        uiPanel.style.borderRadius = '5px';
        uiPanel.style.fontFamily = 'Arial, sans-serif';
        uiPanel.style.fontSize = '12px';
        uiPanel.innerHTML = `
            <h3>距离验证</h3>
            <div id="distanceResult"></div>
            <button id="recalculateBtn" style="margin-top: 10px;">重新计算</button>
            <button id="clearBtn" style="margin-top: 5px;">清除标记</button>
        `;
        document.body.appendChild(uiPanel);
        
        // 添加事件监听
        document.getElementById('recalculateBtn').addEventListener('click', () => {
            this.calculateDistance();
        });
        
        document.getElementById('clearBtn').addEventListener('click', () => {
            this.clearMarkers();
        });
    }
    
    // 更新UI显示
    updateUI(actualDistance, sceneDistance, avgLat, mercatorScale, expectedMercatorDistance, actualMercatorDistance) {
        const resultDiv = document.getElementById('distanceResult');
        resultDiv.innerHTML = `
            <p>实际地理距离: ${actualDistance.toFixed(2)} 米</p>
            <p>Three.js场景距离: ${sceneDistance.toFixed(2)} 单位</p>
            <p>平均纬度: ${avgLat.toFixed(4)}°</p>
            <p>Web Mercator比例尺因子: ${mercatorScale.toFixed(4)}</p>
            <p>预期Web Mercator距离: ${expectedMercatorDistance.toFixed(2)} 米</p>
            <p>实际Web Mercator距离: ${actualMercatorDistance.toFixed(2)} 米</p>
            <p>缩放比例差异: ${(actualMercatorDistance / expectedMercatorDistance).toFixed(4)}</p>
            <p>场景距离/实际距离: ${(sceneDistance / actualDistance).toFixed(4)} 单位/米</p>
        `;
    }
    
    // 更新UI显示消息
    updateUIWithMessage(message) {
        const resultDiv = document.getElementById('distanceResult');
        resultDiv.innerHTML = `<p>${message}</p>`;
    }
    
    // 注册拾取回调
    registerPickCallback() {
        if (this.testMath) {
            this.testMath.addPickCallback(() => {
                // 当用户拾取新标记点时，自动重新计算距离
                this.calculateDistance();
            });
        }
    }
}

export { XYtest };
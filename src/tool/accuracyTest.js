import { MathProj } from '../Math/mathProj.js';

/**
 * 精度测试工具
 * 用于验证坐标转换和距离计算的精度
 */
export class AccuracyTest {
    constructor() {
        // 创建MathProj实例
        this.mathProj = new MathProj({
            centerLon: 106.4506422,
            centerLat: 29.2614846
        });
        
        // 用户提供的测试坐标
        this.testPoints = {
            x1: 11848441.842368,
            y1: 3408981.494214,
            x2: 11847939.791464,
            y2: 3408986.598288
        };
        
        this.runTest();
    }
    
    /**
     * 运行精度测试
     */
    runTest() {
        console.log('=== 精度测试开始 ===');
   
        
        // 计算Web Mercator距离
        const mercatorDistance = Math.sqrt(
            Math.pow(this.testPoints.x2 - this.testPoints.x1, 2) +
            Math.pow(this.testPoints.y2 - this.testPoints.y1, 2)
        );
        
        // 将Web Mercator坐标转换为经纬度
        const lonLat1 = this.mathProj.mercatorToLonLat(this.testPoints.x1, this.testPoints.y1);
        const lonLat2 = this.mathProj.mercatorToLonLat(this.testPoints.x2, this.testPoints.y2);

        // 计算测地距离
        const geodeticDistance = this.mathProj.calculateGeographicDistance(lonLat1, lonLat2);
        
        console.log('\n=== 测地距离计算 ===');
        console.log(`测地距离：${geodeticDistance.toFixed(6)} 米`);
        
        // 将经纬度转换回Web Mercator坐标，验证转换精度
        const mercator1 = this.mathProj.lonLatToMercator(lonLat1.lon, lonLat1.lat);
        const mercator2 = this.mathProj.lonLatToMercator(lonLat2.lon, lonLat2.lat);
        
        console.log('\n=== 经纬度转Web Mercator（验证转换精度） ===');
        console.log(`点1转换后：x=${mercator1.x.toFixed(6)}, y=${mercator1.y.toFixed(6)}`);
        console.log(`点1原始值：x=${this.testPoints.x1.toFixed(6)}, y=${this.testPoints.y1.toFixed(6)}`);
        console.log(`点1误差：Δx=${(mercator1.x - this.testPoints.x1).toFixed(6)}, Δy=${(mercator1.y - this.testPoints.y1).toFixed(6)}`);
        
        console.log(`点2转换后：x=${mercator2.x.toFixed(6)}, y=${mercator2.y.toFixed(6)}`);
        console.log(`点2原始值：x=${this.testPoints.x2.toFixed(6)}, y=${this.testPoints.y2.toFixed(6)}`);
        console.log(`点2误差：Δx=${(mercator2.x - this.testPoints.x2).toFixed(6)}, Δy=${(mercator2.y - this.testPoints.y2).toFixed(6)}`);
        
        // 计算转换回的Web Mercator距离
        const convertedMercatorDistance = Math.sqrt(
            Math.pow(mercator2.x - mercator1.x, 2) +
            Math.pow(mercator2.y - mercator1.y, 2)
        );
        

        
        console.log('\n=== 精度测试结束 ===');
    }
}

// 运行精度测试
if (typeof window !== 'undefined') {
    // 浏览器环境
    window.accuracyTest = new AccuracyTest();
} else {
    // Node.js环境
    new AccuracyTest();
}
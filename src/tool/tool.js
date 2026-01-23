import * as THREE from 'three';
function addLoadingInfo(CONFIG) {
    // 加载信息面板（更新坐标系说明）
    const loadingInfo = document.createElement('div');
    loadingInfo.style.cssText = `
    position: absolute;
    top: 10px;
    left: 10px;
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 15px;
    border-radius: 5px;
    font-family: monospace;
    font-size: 14px;
    z-index: 1000;
`;
    loadingInfo.innerHTML = `
    <div><strong>最终正确坐标系对应关系：</strong></div>
    <div style="color: #f00">X轴（红色）：东方向（East）</div>
    <div style="color: #0f0">Y轴（绿色）：上方向（Up）</div>
    <div style="color: #00f">-Z轴（蓝色）：北方向（North）</div>
    <hr style="margin: 8px 0; border-color: #555">
    <div><strong>俯视图方向：</strong></div>
    <div>右：东（X+）</div>
    <div>左：西（X-）</div>
    <div>上：北（Z-）</div>
    <div>下：南（Z+）</div>
    <hr style="margin: 8px 0; border-color: #555">
    <div>场景中心：(${CONFIG.centerLon.toFixed(6)}°, ${CONFIG.centerLat.toFixed(6)}°)</div>
    <div>场景范围：${CONFIG.rangeEastWest * 2 / 1000}km（东西） × ${CONFIG.rangeNorthSouth * 2 / 1000}km（南北）</div>
    <div>瓦片缩放级别：${CONFIG.zoom}</div>
`;
    document.body.appendChild(loadingInfo);
    
    // 返回创建的加载信息元素，以便外部管理
    return loadingInfo;
}

function addXYZAxisLabel(scene) {
    // 创建一个组来管理所有标签和标记
    const labelGroup = new THREE.Group();
    scene.add(labelGroup);
    
    // 2. 坐标轴标签（匹配-Z=北）
    function createAxisLabel(text, color, position) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, 256, 128);
        ctx.font = 'bold 80px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = `rgb(${color.r * 255}, ${color.g * 255}, ${color.b * 255})`;
        ctx.fillText(text, 128, 64);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.position.set(position.x, position.y, position.z);
        sprite.scale.set(200, 100, 1);
        return sprite;
    }

    // 标签：X=东，Y=上，-Z=北（核心修正：Z轴标签改为“-Z: 北 →”）
    const axisLabels = [
        createAxisLabel('X', new THREE.Color(1, 0, 0), { x: 1200, y: 0, z: 0 }),  // 红色X轴=东
        createAxisLabel('Y: 上 ↑', new THREE.Color(0, 1, 0), { x: 0, y: 1200, z: 0 }),   // 绿色Y轴=上
        createAxisLabel('- Z', new THREE.Color(0, 0, 1), { x: 0, y: 0, z: -1200 })  // 蓝色-Z轴=北（核心修正）
    ];
    axisLabels.forEach(label => labelGroup.add(label));
    
    // 4. 方向指示（匹配-X=东/-Z=北，核心修正）
    const directions = [
        { label: '东', position: new THREE.Vector3(1000, 50, 0), color: 0xff0000 },    // 东=X+（不变）
        { label: '西', position: new THREE.Vector3(-1000, 50, 0), color: 0xff0000 },   // 西=X-（不变）
        { label: '北', position: new THREE.Vector3(0, 50, -1000), color: 0x0000ff },   // 北=-Z+（核心修正：Z=-1000）
        { label: '南', position: new THREE.Vector3(0, 50, 1000), color: 0x0000ff }     // 南=-Z-（核心修正：Z=1000）
    ];

    const directionLabels = [];
    directions.forEach(dir => {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, 256, 128);
        ctx.font = 'bold 80px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = dir.color === 0xff0000 ? '#ff0000' : '#0000ff';
        ctx.fillText(dir.label, 128, 64);

        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(material);
        sprite.position.copy(dir.position);
        sprite.scale.set(300, 150, 1);
        directionLabels.push(sprite);
        labelGroup.add(sprite);
    });

    // 移除中心点标记
    
    // 返回创建的元素，以便外部可以调整它们的位置
    return {
        labelGroup: labelGroup,
        axisLabels: axisLabels,
        directionLabels: directionLabels,
        centerMarker: null
    };
}

export { addLoadingInfo, addXYZAxisLabel };

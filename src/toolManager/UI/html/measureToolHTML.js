/**
 * 测量工具HTML模板
 * 负责导出测量工具的HTML布局
 */
export const measureToolHTML = `
    <div class="measure-tool-ui">

        <!-- 测量类型选择 -->
        <div class="control-section">
            <div class="measure-tab-container">
                <ul class="measure-tabs">
                    <li class="tab-item">
                        <a href="#" id="pointMeasureBtn" class="tab-link active">
                            <img src="./src/assest/img/measureImg/坐标点.png" alt="点测量" class="tab-icon">
                            <span class="tab-tooltip">点测量</span>
                        </a>
                    </li>
                    <li class="tab-item">
                        <a href="#" id="distanceMeasureBtn" class="tab-link">
                            <img src="./src/assest/img/measureImg/距离测量.png" alt="距离测量" class="tab-icon">
                            <span class="tab-tooltip">距离测量</span>
                        </a>
                    </li>
                    <li class="tab-item">
                        <a href="#" id="multiDistanceBtn" class="tab-link">
                            <img src="./src/assest/img/measureImg/路程.png" alt="多点路程" class="tab-icon">
                            <span class="tab-tooltip">多点路程</span>
                        </a>
                    </li>
                    <li class="tab-item">
                        <a href="#" id="areaMeasureBtn" class="tab-link">
                            <img src="./src/assest/img/measureImg/面积.png" alt="面积测量" class="tab-icon">
                            <span class="tab-tooltip">面积测量</span>
                        </a>
                    </li>
                    <li class="tab-item">
                        <a href="#" id="cutFillBtn" class="tab-link">
                            <img src="./src/assest/img/measureImg/填挖方.png" alt="填挖方测量" class="tab-icon">
                            <span class="tab-tooltip">填挖方测量</span>
                        </a>
                    </li>
                    <li class="tab-item">
                        <a href="#" id="profileAnalysisBtn" class="tab-link">
                            <img src="./src/assest/img/measureImg/剖面分析.png" alt="剖面分析" class="tab-icon">
                            <span class="tab-tooltip">剖面分析</span>
                        </a>
                    </li>
                </ul>
            </div>
        </div>
        
        <!-- 测量控制按钮 -->
        <div class="control-section measure-controls">
            <button id="startMeasureBtn">开始测量</button>
            <button id="endMeasureBtn">结束测量</button>
            <button id="undoBtn">撤销</button>
            <button id="clearBtn">清空</button>
        </div>
        
        <!-- 点测量结果 -->
        <div id="pointResultSection" class="control-section result-section point-result" style="display: block;">
            <h4>点信息</h4>
            <div class="point-info-grid">
                <div class="point-info-row">
                    <span class="point-label">Lon：</span>
                    <span id="pointLon" class="point-value">-</span>
                </div>
                <div class="point-info-row">
                    <span class="point-label">Lat：</span>
                    <span id="pointLat" class="point-value">-</span>
                </div>
                <div class="point-info-row">
                    <span class="point-label">H：</span>
                    <span id="pointAlt" class="point-value">-</span>
                </div>
                <div class="point-info-row">
                    <span class="point-label">Three X：</span>
                    <span id="pointThreeX" class="point-value">-</span>
                </div>
                <div class="point-info-row">
                    <span class="point-label">Three Y：</span>
                    <span id="pointThreeY" class="point-value">-</span>
                </div>
                <div class="point-info-row">
                    <span class="point-label">Three Z：</span>
                    <span id="pointThreeZ" class="point-value">-</span>
                </div>
                <div class="point-info-row">
                    <span class="point-label">3857 X：</span>
                    <span id="point3857X" class="point-value">-</span>
                </div>
                <div class="point-info-row">
                    <span class="point-label">3857 Y：</span>
                    <span id="point3857Y" class="point-value">-</span>
                </div>
                <div class="point-info-row">
                    <span class="point-label">3857 Z：</span>
                    <span id="point3857Z" class="point-value">-</span>
                </div>
            </div>
        </div>
        
        <!-- 距离测量结果 -->
        <div id="distanceResultSection" class="control-section result-section distance-result" style="display: none;">
            <h4>距离测量结果</h4>
            <div class="distance-section">
                <!-- 总距离 -->
                <div class="distance-row">
                    <span class="dist-label">总测地距离：</span>
                    <span id="geodesicDistance" class="dist-value">0.00 米</span>
                </div>
                <div class="distance-row">
                    <span class="dist-label">总Three距离：</span>
                    <span id="threeDistance" class="dist-value">0.00 米</span>
                </div>
                
                <!-- 方向角度 -->
                <div class="distance-divider"></div>
                <h5>投影角度</h5>
                <div class="distance-row">
                    <span class="dist-label"> 俯视角：</span>
                    <span id="horizontalAngle" class="dist-value">0.00°</span>
                </div>
                <div class="distance-row">
                    <span class="dist-label">前视角：</span>
                    <span id="frontViewAngle" class="dist-value">0.00°</span>
                </div>
                <div class="distance-row">
                    <span class="dist-label">右视角：</span>
                    <span id="leftViewAngle" class="dist-value">0.00°</span>
                </div>
                
                <!-- 东方向分量 -->
                <div class="distance-divider"></div>
                <h5>东方向分量</h5>
                <div class="distance-row">
                    <span class="dist-label">东Three差：</span>
                    <span id="eastThreeDistance" class="dist-value">0.00 米</span>
                </div>
                <div class="distance-row">
                    <span class="dist-label">东测地差：</span>
                    <span id="eastGeodesicDistance" class="dist-value">0.00 米</span>
                </div>
                
                <!-- 北方向分量 -->
                <div class="distance-divider"></div>
                <h5>北方向分量</h5>
                <div class="distance-row">
                    <span class="dist-label">北Three差：</span>
                    <span id="northThreeDistance" class="dist-value">0.00 米</span>
                </div>
                <div class="distance-row">
                    <span class="dist-label">北测地差：</span>
                    <span id="northGeodesicDistance" class="dist-value">0.00 米</span>
                </div>
                
                <!-- 垂直方向分量 -->
                <div class="distance-divider"></div>
                <h5>垂直方向分量</h5>
                <div class="distance-row">
                    <span class="dist-label">高度差：</span>
                    <span id="heightDifference" class="dist-value">0.00 米</span>
                </div>
            </div>
        </div>
        
        <!-- 多点路程测量结果 -->
        <div id="multiDistanceResultSection" class="control-section result-section multi-distance-result" style="display: none;">
            <h4>多点路程测量结果</h4>
            <div class="distance-section">
                <!-- 总距离 - 分门别类显示 -->
                <div class="distance-category">
                    <h5>总距离</h5>
                    <div class="distance-row">
                        <span class="dist-label">投影距离：</span>
                        <span id="totalProjectionDistance" class="dist-value">0.00 米</span>
                    </div>
                    <div class="distance-row">
                        <span class="dist-label">贴地Three距离：</span>
                        <span id="totalGroundThreeDistance" class="dist-value">0.00 米</span>
                    </div>
                    <div class="distance-row">
                        <span class="dist-label">贴地测地距离：</span>
                        <span id="totalGroundGeodesicDistance" class="dist-value">0.00 米</span>
                    </div>
                </div>
                
                <!-- 分段距离 - 分门别类显示 -->
                <div class="distance-divider"></div>
                <div class="distance-category">
                    <h5>分段距离</h5>
                    <div id="segmentDistances" class="segment-distance-list">
                        <!-- 动态添加的分段距离 -->
                    </div>
                </div>
            </div>
        </div>
        
        <!-- 面积测量结果 -->
        <div id="areaResultSection" class="control-section result-section area-result" style="display: none;">
            <h4>面积测量结果</h4>
            <div class="area-section">
                <!-- 投影面积 -->
                <div class="distance-category">
                    <h5>投影面积（忽略地形）</h5>
                    <div class="area-row">
                        <span class="area-label">水平3857投影面积：</span>
                        <span id="horizontal3857Area" class="area-value">0.00 平方米</span>
                    </div>
                    <div class="area-row">
                        <span class="area-label">测地投影面积：</span>
                        <span id="horizontalGeodesicArea" class="area-value">0.00 平方米</span>
                    </div>
                </div>
                
                <!-- 贴地面积 -->
                <div class="distance-category">
                    <h5>贴地面积（考虑地形）</h5>
                    <div class="area-row">
                        <span class="area-label">3857贴地面积：</span>
                        <span id="ground3857Area" class="area-value">0.00 平方米</span>
                    </div>
                    <div class="area-row">
                        <span class="area-label">Three贴地面积：</span>
                        <span id="threeTerrainArea" class="area-value">0.00 平方米</span>
                    </div>
                    <div class="area-row">
                        <span class="area-label">测地贴地面积：</span>
                        <span id="groundGeodesicArea" class="area-value">0.00 平方米</span>
                    </div>
                </div>
                
                <!-- 周长 -->
                <div class="distance-category">
                    <h5>周长</h5>
                    <div class="area-row">
                        <span class="area-label">投影周长：</span>
                        <span id="projectionPerimeter" class="area-value">0.00 米</span>
                    </div>
                    <div class="area-row">
                        <span class="area-label">Three贴地周长：</span>
                        <span id="threePerimeter" class="area-value">0.00 米</span>
                    </div>
                    <div class="area-row">
                        <span class="area-label">测地周长：</span>
                        <span id="geodesicPerimeter" class="area-value">0.00 米</span>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- 填挖方测量结果 -->
        <div id="cutFillResultSection" class="control-section result-section cut-fill-result" style="display: none;">
            <h4>填挖方测量</h4>
            <div class="cut-fill-section">
                <div class="cutfill-tip">
                    拾取：点击添加点，双击结束当前多边形；可多次“开始/结束”叠加多个多边形。支持凹多边形（三角化）。
                </div>

                <div class="cutfill-field">
                    <label for="cutfillPolygonsJson">多边形数组（JSON：[[[lon,lat],...], ...]）</label>
                    <textarea id="cutfillPolygonsJson" rows="6" spellcheck="false" placeholder="示例：&#10;[&#10;  [[105.290,28.835],[105.293,28.834],[105.294,28.835],[105.294,28.838],[105.290,28.838]],&#10;  [[105.300,28.841],[105.303,28.840],[105.304,28.841],[105.304,28.844],[105.300,28.844]]&#10;]"></textarea>
                </div>

                <div class="cutfill-row">
                    <span class="cut-fill-label">目标海拔 H（米）</span>
                    <input id="cutfillTargetElevation" class="cutfill-input" type="number" value="0" step="0.1">
                </div>

                <div class="cutfill-row">
                    <span class="cut-fill-label">采样步长（米）</span>
                    <input id="cutfillSampleStep" class="cutfill-input" type="number" value="20" step="1" min="1">
                </div>

                <div class="cutfill-actions">
                    <button id="cutfillApplyJsonBtn">应用JSON</button>
                    <button id="cutfillExportJsonBtn">导出JSON</button>
                    <button id="cutfillRecomputeBtn">重新计算</button>
                    <button id="cutfillExecuteBtn" class="primary">执行填挖（整平）</button>
                </div>

                <div class="distance-divider"></div>

                <div class="cut-fill-row">
                    <span class="cut-fill-label">多边形数量</span>
                    <span id="cutfillPolyCount" class="cut-fill-value">0</span>
                </div>
                <div class="cut-fill-row">
                    <span class="cut-fill-label">总面积（测地）</span>
                    <span id="cutfillAreaGeodesic" class="cut-fill-value">0.00 平方米</span>
                </div>
                <div class="cut-fill-row">
                    <span class="cut-fill-label">填方体积（测地）</span>
                    <span id="cutfillFillVolumeGeodesic" class="cut-fill-value">0.00 立方米</span>
                </div>
                <div class="cut-fill-row">
                    <span class="cut-fill-label">挖方体积（测地）</span>
                    <span id="cutfillCutVolumeGeodesic" class="cut-fill-value">0.00 立方米</span>
                </div>
                <div class="cut-fill-row">
                    <span class="cut-fill-label">净方（填-挖）</span>
                    <span id="cutfillNetVolumeGeodesic" class="cut-fill-value">0.00 立方米</span>
                </div>

                <div class="cutfill-tip">
                    场景显示：原始地表（贴地）、目标整平面+墙、填方面（蓝）、挖方面（红）。
                </div>

                <!-- Backward compatible fields -->
                <div class="cutfill-hidden">
                    <span id="threeCutFillVolume" class="cut-fill-value">0.00 立方米</span>
                    <span id="geodesicCutFillVolume" class="cut-fill-value">0.00 立方米</span>
                </div>
            </div>
        </div>
        
        <!-- 剖面分析结果 -->
        <div id="profileResultSection" class="control-section result-section profile-result" style="display: none;">
            <h4>剖面分析结果</h4>
            <div class="profile-section">
                <!-- 剖面基本信息 -->
                <div class="profile-info">
                    <div class="distance-row">
                        <span class="dist-label">剖面长度：</span>
                        <span id="profileLength" class="dist-value">0.00 米</span>
                    </div>
                    <div class="distance-row">
                        <span class="dist-label">最高点海拔：</span>
                        <span id="profileMaxElevation" class="dist-value">0.00 米</span>
                    </div>
                    <div class="distance-row">
                        <span class="dist-label">最低点海拔：</span>
                        <span id="profileMinElevation" class="dist-value">0.00 米</span>
                    </div>
                    <div class="distance-row">
                        <span class="dist-label">总起伏：</span>
                        <span id="profileTotalRelief" class="dist-value">0.00 米</span>
                    </div>
                </div>
                
                <!-- 剖面图区域 -->
                <div class="profile-chart-section">
                    <h5>地形剖面图</h5>
                    <canvas id="profileChart" width="300" height="150"></canvas>
                </div>
                
                <!-- 剖面数据列表 -->
                <div class="profile-data-section">
                    <h5>剖面数据</h5>
                    <div id="profileDataList" class="profile-data-list">
                        <!-- 动态添加的剖面数据 -->
                    </div>
                </div>
            </div>
        </div>
        
        <!-- 测量点列表 -->
        <div class="control-section">
            <h4>测量点</h4>
            <div class="point-section">
                <div id="pointList">
                    <p>点击地图添加测量点</p>
                </div>
            </div>
        </div>
    </div>
`;

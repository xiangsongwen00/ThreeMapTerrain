/**
 * 测量工具样式
 * 负责导出测量工具的CSS样式
 */
export const measureToolStyles = `
    .measure-tool-ui {
        font-family: Arial, sans-serif;
    }
    
    .measure-tool-ui h3 {
        margin: 0 0 15px 0;
        color: #333;
        font-size: 16px;
        font-weight: bold;
    }
    
    .measure-tool-ui h4 {
        margin: 12px 0 8px 0;
        color: #555;
        font-size: 14px;
        font-weight: bold;
    }
    
    .control-section {
        margin-bottom: 20px;
    }
    
    /* 测量类型选项卡样式 - 图片Tab风格 */
    .measure-tab-container {
        margin-bottom: 8px;
    }
    
    .measure-tabs {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-wrap: wrap;
        border-bottom: 1px solid #e0e0e0;
    }
    
    .tab-item {
        margin-bottom: -1px;
    }
    
    .tab-link {
        display: inline-block;
        padding: 6px 4px;
        text-decoration: none;
        color: #333;
        background-color: #f0f0f0;
        border: 1px solid #e0e0e0;
        border-bottom: none;
        border-radius: 4px 4px 0 0;
        cursor: pointer;
        transition: all 0.3s;
        text-align: center;
        width: 65px;
        position: relative;
    }
    
    .tab-link:hover {
        background-color: #e0e0e0;
    }
    
    .tab-link.active {
        background-color: white;
        color: #2196F3;
        border-color: #e0e0e0;
        border-bottom-color: white;
    }
    
    .tab-link.active:hover {
        background-color: white;
    }
    
    /* Tab图片样式 */
    .tab-icon {
        width: 24px;
        height: 24px;
        display: block;
        margin: 0 auto 2px;
        object-fit: contain;
    }
    
    /* Tab提示词样式 */
    .tab-tooltip {
        font-size: 10px;
        display: block;
        white-space: nowrap;
    }
    
    /* 提示词悬停效果 */
    .tab-link:hover .tab-tooltip {
        color: #2196F3;
    }
    
    .tab-link.active .tab-tooltip {
        color: #2196F3;
        font-weight: bold;
    }
    
    .result-section {
        background-color: #f9f9f9;
        padding: 8px;
        border-radius: 4px;
        margin-bottom: 8px;
    }
    
    .result-item {
        margin-bottom: 4px;
        font-size: 12px;
    }
    
    .result-item:last-child {
        margin-bottom: 0;
    }
    
    .result-item .label {
        font-weight: bold;
        color: #555;
        display: inline-block;
        width: 120px;
        font-size: 11px;
    }
    
    /* 点信息网格样式 */
    .point-info-grid {
        background-color: #f9f9f9;
        padding: 8px;
        border-radius: 4px;
        font-size: 12px;
    }
    
    .point-info-row {
        display: flex;
        margin-bottom: 4px;
        align-items: center;
    }
    
    .point-info-row:last-child {
        margin-bottom: 0;
    }
    
    .point-label {
        width: 80px;
        font-weight: bold;
        color: #555;
        text-align: right;
        padding-right: 8px;
        font-size: 11px;
    }
    
    .point-value {
        flex: 1;
        color: #2196F3;
        font-weight: bold;
        font-size: 12px;
        text-align: left;
    }
    
    /* 测量结果值样式 */
    #geodesicDistance, #threeDistance, #webMercatorDistance, #totalDistance,
    #horizontalArea, #threeTerrainArea, #geodesicArea, #threeCutFillVolume, #geodesicCutFillVolume,
    #cutfillAreaGeodesic, #cutfillFillVolumeGeodesic, #cutfillCutVolumeGeodesic, #cutfillNetVolumeGeodesic,
    #pointLon, #pointLat, #pointAlt, #pointThreeX, #pointThreeY, #pointThreeZ, #point3857X, #point3857Y, #point3857Z,
    #horizontalAngle, #frontViewAngle, #leftViewAngle, #eastThreeDistance, #eastGeodesicDistance,
    #northThreeDistance, #northGeodesicDistance, #heightDifference {
        color: #2196F3;
        font-weight: bold;
        font-size: 12px;
    }
    
    /* 距离测量样式 */
    .distance-section {
        background-color: #f9f9f9;
        padding: 8px;
        border-radius: 4px;
        font-size: 12px;
    }
    
    .distance-row {
        display: flex;
        margin-bottom: 4px;
        align-items: center;
    }
    
    .distance-row:last-child {
        margin-bottom: 0;
    }
    
    .dist-label {
        width: 100px;
        font-weight: bold;
        color: #555;
        text-align: right;
        padding-right: 8px;
        font-size: 11px;
    }
    
    .dist-value {
        flex: 1;
        color: #2196F3;
        font-weight: bold;
        font-size: 12px;
        text-align: left;
    }
    
    .distance-divider {
        height: 1px;
        background-color: #e0e0e0;
        margin: 8px 0;
    }
    
    .distance-category {
        background-color: #f5f5f5;
        padding: 8px;
        border-radius: 4px;
        margin-bottom: 8px;
    }
    
    .distance-section h5 {
        margin: 0 0 6px 0;
        color: #666;
        font-size: 12px;
        font-weight: bold;
        border-left: 3px solid #2196F3;
        padding-left: 6px;
    }
    
    .point-section {
        margin-top: 8px;
    }
    
    #pointList {
        background-color: #f9f9f9;
        padding: 6px;
        border-radius: 4px;
        margin-bottom: 8px;
        min-height: 60px;
        font-size: 12px;
        color: #666;
    }
    
    .point-item {
        margin-bottom: 3px;
        padding: 2px 0;
        border-bottom: 1px solid #e0e0e0;
        font-size: 11px;
    }
    
    .point-item:last-child {
        margin-bottom: 0;
        border-bottom: none;
    }
    
    /* 测量控制按钮样式 */
    .measure-controls {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        margin-bottom: 10px;
    }
    
    .measure-controls button {
        padding: 6px 12px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        transition: background-color 0.3s;
        min-width: 70px;
    }
    
    #startMeasureBtn {
        background-color: #4CAF50;
        color: white;
    }
    
    #startMeasureBtn:hover {
        background-color: #45a049;
    }
    
    #endMeasureBtn {
        background-color: #2196F3;
        color: white;
    }
    
    #endMeasureBtn:hover {
        background-color: #1976D2;
    }
    
    #undoBtn {
        background-color: #FFC107;
        color: #333;
    }
    
    #undoBtn:hover {
        background-color: #FFB300;
    }
    
    #clearBtn {
        background-color: #f44336;
        color: white;
    }
    
    #clearBtn:hover {
        background-color: #d32f2f;
    }
    
    /* 多点路程分段列表样式 */
    .segment-distance-list {
        margin-top: 6px;
        max-height: 120px;
        overflow-y: auto;
    }
    
    .segment-item {
        font-size: 11px;
        margin-bottom: 3px;
        padding: 2px 0;
        border-bottom: 1px solid #e0e0e0;
    }
    
    .segment-item:last-child {
        margin-bottom: 0;
        border-bottom: none;
    }
    
    /* 面积测量样式 */
    .area-section {
        background-color: #f9f9f9;
        padding: 8px;
        border-radius: 4px;
        font-size: 12px;
    }
    
    .area-row {
        display: flex;
        margin-bottom: 4px;
        align-items: center;
    }
    
    .area-row:last-child {
        margin-bottom: 0;
    }
    
    .area-label {
        width: 120px;
        font-weight: bold;
        color: #555;
        text-align: right;
        padding-right: 8px;
        font-size: 11px;
    }
    
    .area-value {
        flex: 1;
        color: #2196F3;
        font-weight: bold;
        font-size: 12px;
        text-align: left;
    }
    
    .area-divider {
        height: 1px;
        background-color: #e0e0e0;
        margin: 8px 0;
    }
    
    /* 填挖方测量样式 */
    .cut-fill-section {
        background-color: #f9f9f9;
        padding: 8px;
        border-radius: 4px;
        font-size: 12px;
    }
    
    .cut-fill-row {
        display: flex;
        margin-bottom: 4px;
        align-items: center;
    }
    
    .cut-fill-row:last-child {
        margin-bottom: 0;
    }
    
    .cut-fill-label {
        width: 120px;
        font-weight: bold;
        color: #555;
        text-align: right;
        padding-right: 8px;
        font-size: 11px;
    }
    
    .cut-fill-value {
        flex: 1;
        color: #2196F3;
        font-weight: bold;
        font-size: 12px;
        text-align: left;
    }

    .cutfill-field label {
        display: block;
        font-size: 11px;
        color: #555;
        margin: 6px 0 4px 0;
        font-weight: bold;
    }

    .cutfill-field textarea {
        width: 100%;
        box-sizing: border-box;
        padding: 8px;
        border-radius: 4px;
        border: 1px solid rgba(0, 0, 0, 0.2);
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
        font-size: 11px;
        resize: vertical;
    }

    .cutfill-row {
        display: flex;
        margin-bottom: 6px;
        align-items: center;
        gap: 8px;
    }

    .cutfill-input {
        flex: 1;
        padding: 6px 8px;
        border-radius: 4px;
        border: 1px solid rgba(0, 0, 0, 0.2);
        font-size: 12px;
    }

    .cutfill-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin: 8px 0;
    }

    .cutfill-actions button {
        padding: 6px 10px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        background: #e0e0e0;
    }

    .cutfill-actions button.primary {
        background: #2196F3;
        color: #fff;
    }

    .cutfill-actions button:hover {
        filter: brightness(0.95);
    }

    .cutfill-tip {
        font-size: 12px;
        color: rgba(0, 0, 0, 0.7);
        line-height: 1.4;
        margin: 6px 0;
    }

    .cutfill-hidden {
        display: none;
    }
`;

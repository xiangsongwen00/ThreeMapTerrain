export const terrainEditorHTML = `
<div class="terrain-editor-ui">
    <div class="terrain-editor-header">
        <h3>地形修整</h3>
    </div>

    <div class="terrain-editor-content">
        <div class="terrain-editor-section">
            <h4>修整区域（凸多边形）</h4>
            <div class="terrain-editor-field">
                <label for="terrainEditPolygon">多边形（JSON：[[lon,lat],...]）</label>
                <textarea id="terrainEditPolygon" rows="4" spellcheck="false">[[105.290,28.835],[105.293,28.834],[105.294,28.835],[105.294,28.838],[105.290,28.838]]</textarea>
            </div>
            <div class="terrain-editor-hint">
                说明：当前编辑补丁按“凸多边形”处理；凹多边形可能导致结果异常。
            </div>
        </div>

        <div class="terrain-editor-section">
            <h4>抬升/降低（Δ）</h4>
            <div class="terrain-editor-row">
                <label for="terrainRaiseDelta">增量 Δ（米）</label>
                <input type="number" id="terrainRaiseDelta" value="10" step="1">
            </div>
            <div class="terrain-editor-row terrain-editor-row-checkbox">
                <label for="terrainDeltaUseRaycastBase">高精度（边界采样×3）</label>
                <input type="checkbox" id="terrainDeltaUseRaycastBase">
            </div>
            <div class="terrain-editor-field" style="margin-top: 10px;">
                <label for="terrainDeltaMultiple">批量配置（JSON 数组）</label>
                <textarea id="terrainDeltaMultiple" rows="6" spellcheck="false">[
  {"polygon":[[105.290,28.835],[105.293,28.834],[105.294,28.835],[105.294,28.838],[105.290,28.838]],"delta":10},
  {"polygon":[[105.300,28.841],[105.303,28.840],[105.304,28.841],[105.304,28.844],[105.300,28.844]],"delta":-5}
]</textarea>
            </div>
            <div class="terrain-editor-actions">
                <button id="terrainApplyRaise" class="primary">应用 Δ</button>
                <button id="terrainApplyDeltaMultiple" class="primary">应用批量 Δ</button>
            </div>
        </div>

        <div class="terrain-editor-section">
            <h4>整平（目标高程）</h4>
            <div class="terrain-editor-row">
                <label for="terrainFlattenHeight">目标 H（米）</label>
                <input type="number" id="terrainFlattenHeight" value="0" step="1">
            </div>
            <div class="terrain-editor-field" style="margin-top: 10px;">
                <label for="terrainFlattenMultiple">批量配置（JSON 数组）</label>
                <textarea id="terrainFlattenMultiple" rows="6" spellcheck="false">[
  {"polygon":[[105.290,28.835],[105.293,28.834],[105.294,28.835],[105.294,28.838],[105.290,28.838]],"targetElevation":0},
  {"polygon":[[105.300,28.841],[105.303,28.840],[105.304,28.841],[105.304,28.844],[105.300,28.844]],"targetElevation":50}
]</textarea>
            </div>
            <div class="terrain-editor-actions">
                <button id="terrainApplyFlatten" class="primary">整平到 H</button>
                <button id="terrainApplyFlattenMultiple" class="primary">整平批量</button>
            </div>
        </div>

        <div class="terrain-editor-section">
            <h4>坡面（基于高坡边 AB）</h4>
            <div class="terrain-editor-field">
                <label>高坡边 A（经纬度）</label>
                <div class="terrain-editor-row">
                    <label for="terrainSlopeALon">经度</label>
                    <input type="number" id="terrainSlopeALon" value="105.290" step="0.00001">
                </div>
                <div class="terrain-editor-row">
                    <label for="terrainSlopeALat">纬度</label>
                    <input type="number" id="terrainSlopeALat" value="28.835" step="0.00001">
                </div>
            </div>
            <div class="terrain-editor-field" style="margin-top: 10px;">
                <label>高坡边 B（经纬度）</label>
                <div class="terrain-editor-row">
                    <label for="terrainSlopeBLon">经度</label>
                    <input type="number" id="terrainSlopeBLon" value="105.294" step="0.00001">
                </div>
                <div class="terrain-editor-row">
                    <label for="terrainSlopeBLat">纬度</label>
                    <input type="number" id="terrainSlopeBLat" value="28.835" step="0.00001">
                </div>
            </div>

            <div class="terrain-editor-row" style="margin-top: 10px;">
                <label for="terrainSlopeSide">坡向（相对 A→B）</label>
                <select id="terrainSlopeSide">
                    <option value="left" selected>左侧</option>
                    <option value="right">右侧</option>
                </select>
            </div>

            <div class="terrain-editor-row" style="margin-top: 10px;">
                <label for="terrainSlopeRatio">横截面 宽/高 比</label>
                <input type="number" id="terrainSlopeRatio" value="3" step="0.1" min="0.1">
            </div>

            <div class="terrain-editor-row" style="margin-top: 10px;">
                <label for="terrainSlopeMaxHeight">最大垂直高差 H（米）</label>
                <input type="number" id="terrainSlopeMaxHeight" value="10" step="1" min="0.1">
            </div>

            <div class="terrain-editor-field" style="margin-top: 10px;">
                <label for="terrainSlopeSamples">高坡边高程控制点（可选，JSON）</label>
                <textarea id="terrainSlopeSamples" rows="3" spellcheck="false" placeholder="留空则自动采样 AB 高程。支持：[[t,elev],...] (t=0..1) 或 [[lon,lat,elev],...]"></textarea>
            </div>

            <div class="terrain-editor-actions">
                <button id="terrainApplySlope" class="primary">生成坡面</button>
                <button id="terrainApplySlopeMultiple" class="primary">生成批量坡面</button>
            </div>
            <div class="terrain-editor-field" style="margin-top: 10px;">
                <label for="terrainSlopeMultiple">批量配置（JSON 数组）</label>
                <textarea id="terrainSlopeMultiple" rows="7" spellcheck="false">[
  {"aLonLat":[105.290,28.835],"bLonLat":[105.294,28.835],"side":"left","widthHeightRatio":3,"maxHeight":10},
  {"aLonLat":[105.300,28.841],"bLonLat":[105.304,28.841],"side":"right","widthHeightRatio":4,"maxHeight":8}
]</textarea>
            </div>
        </div>

        <div class="terrain-editor-section">
            <h4>裁剪（挖洞）</h4>
            <div class="terrain-editor-field">
                <label for="terrainClipPolygon">裁剪多边形（JSON）</label>
                <textarea id="terrainClipPolygon" rows="3" spellcheck="false">[[105.290,28.835],[105.293,28.834],[105.294,28.835],[105.294,28.838],[105.290,28.838]]</textarea>
            </div>
            <div class="terrain-editor-field" style="margin-top: 10px;">
                <label for="terrainClipMultiple">多洞配置（JSON 数组）</label>
                <textarea id="terrainClipMultiple" rows="6" spellcheck="false">[
  {"polygon":[[105.290,28.835],[105.293,28.834],[105.294,28.835],[105.294,28.838],[105.290,28.838]]},
  {"polygon":[[105.280,28.835],[105.283,28.834],[105.284,28.835],[105.284,28.838],[105.280,28.838]]}
]</textarea>
            </div>
            <div class="terrain-editor-actions">
                <button id="terrainApplyClip" class="danger">裁剪</button>
                <button id="terrainApplyClipMultiple" class="danger">设置多洞</button>
                <button id="terrainClearClip" class="ghost">清除裁剪</button>
            </div>
        </div>
    </div>
</div>
`;

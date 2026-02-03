/*
 * @Author: 2409479323@qq.com
 * @Date: 2026-01-22 09:56:57
 * @LastEditors: 2409479323@qq.com 
 * @LastEditTime: 2026-01-22 11:51:31
 * @FilePath: \RammedEarth\src\toolManager\UI\html\drawToolHTML.js
 * @Description: 
 * 
 * Copyright (c) 2026 by bimcc, All Rights Reserved. 
 */
export const drawToolHTML = `
<div class="draw-tool-ui">
    <div class="draw-tool-header">
        <h3>绘制工具</h3>
    </div>
    
    <div class="draw-tool-content">
        <!-- 绘制模式选择 -->
        <div class="draw-mode-section">
            <h4>绘制模式</h4>
            <div class="draw-mode-options">
                <label class="draw-mode-option">
                    <input type="radio" name="drawMode" value="point" checked>
                    <span>点</span>
                </label>
                <label class="draw-mode-option">
                    <input type="radio" name="drawMode" value="line">
                    <span>线</span>
                </label>
                <label class="draw-mode-option">
                    <input type="radio" name="drawMode" value="area">
                    <span>面</span>
                </label>
            </div>
        </div>
        
        <!-- 绘制选项 -->
        <div class="draw-options-section">
            <h4>绘制选项</h4>
            <div class="draw-option-item">
                <label class="draw-option-checkbox">
                    <input type="checkbox" id="isGroundDrawing">
                    <span>贴地绘制</span>
                </label>
            </div>
            <div class="draw-option-item">
                <label class="draw-option-color">
                    <span>绘制颜色：</span>
                    <input type="color" id="drawColor" value="#d59595">
                </label>
            </div>
            <div class="draw-option-item">
                <label class="draw-option-color-input">
                    <span>颜色值：</span>
                    <input type="text" id="drawColorInput" value="#d59595" placeholder="#d59595 或 rgb(213,149,149)">
                </label>
            </div>
            <div class="draw-option-item">
                <label class="draw-option-opacity">
                    <span>透明度：</span>
                    <input type="range" id="drawOpacitySlider" min="0" max="1" step="0.1" value="0.6">
                    <input type="number" id="drawOpacityInput" min="0" max="1" step="0.1" value="0.6" style="width: 60px;">
                </label>
            </div>
        </div>
        
        <!-- 绘制控制 -->
        <div class="draw-control-section">
            <h4>绘制控制</h4>
            <div class="draw-control-buttons">
                <button id="startDrawBtn" class="draw-control-btn start-btn">开始绘制</button>
                <button id="endDrawBtn" class="draw-control-btn end-btn">结束绘制</button>
                <button id="undoBtn" class="draw-control-btn undo-btn">撤销</button>
                <button id="clearDrawBtn" class="draw-control-btn clear-btn">清除</button>
            </div>
        </div>
        
        <!-- 绘制信息 -->
        <div class="draw-info-section">
            <h4>绘制信息</h4>
            <div class="draw-info-content">
                <div id="drawPointCount">点数量: 0</div>
                <div id="drawStatus">状态: 未开始</div>
            </div>
        </div>
    </div>
</div>
`;
export const drawToolStyles = `
.draw-tool-ui {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    font-family: Arial, sans-serif;
    color: #333;
}

.draw-tool-header {
    padding: 10px 15px;
    border-bottom: 1px solid #ddd;
    background-color: #f5f5f5;
}

.draw-tool-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: bold;
}

.draw-tool-content {
    flex: 1;
    padding: 15px;
    overflow-y: auto;
}

/* 绘制模式选择 */
.draw-mode-section,
.draw-options-section,
.draw-control-section,
.draw-info-section {
    margin-bottom: 20px;
    padding: 12px;
    background-color: #fff;
    border-radius: 6px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.draw-mode-section h4,
.draw-options-section h4,
.draw-control-section h4,
.draw-info-section h4 {
    margin: 0 0 10px 0;
    font-size: 14px;
    font-weight: bold;
    color: #555;
    border-bottom: 1px solid #eee;
    padding-bottom: 5px;
}

.draw-mode-options {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-start;
    align-items: center;
    width: 100%;
    box-sizing: border-box;
}

.draw-mode-option {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    padding: 6px 10px;
    border-radius: 20px;
    transition: all 0.2s ease;
    background-color: #f5f5f5;
    border: 1px solid #ddd;
    flex: 1;
    min-width: 50px;
    max-width: 100px;
    justify-content: center;
    box-sizing: border-box;
}

.draw-mode-option:hover {
    background-color: #e8f4fd;
    border-color: #2196F3;
}

.draw-mode-option input[type="radio"] {
    accent-color: #2196F3;
}

.draw-mode-option input[type="radio"]:checked + span {
    color: #2196F3;
    font-weight: bold;
}

.draw-mode-option input[type="radio"]:checked {
    background-color: #e8f4fd;
}

/* 选中状态样式 */
.draw-mode-option:has(input[type="radio"]:checked) {
    background-color: #e8f4fd;
    border-color: #2196F3;
    box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
}

.draw-mode-option span {
    font-size: 13px;
    transition: all 0.2s ease;
}

/* 绘制选项 */
.draw-option-item {
    margin-bottom: 10px;
}

.draw-option-checkbox,
.draw-option-color,
.draw-option-color-input,
.draw-option-opacity {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    padding: 8px;
    border-radius: 4px;
    transition: all 0.2s ease;
}

.draw-option-checkbox:hover,
.draw-option-color:hover,
.draw-option-color-input:hover,
.draw-option-opacity:hover {
    background-color: #f0f0f0;
}

.draw-option-checkbox input[type="checkbox"] {
    accent-color: #2196F3;
}

.draw-option-color input[type="color"] {
    width: 40px;
    height: 24px;
    padding: 2px;
    border: 1px solid #ddd;
    border-radius: 4px;
    cursor: pointer;
}

.draw-option-color-input input[type="text"] {
    flex: 1;
    padding: 6px 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 13px;
    cursor: text;
    min-width: 100px; /* 减小最小宽度 */
    max-width: 200px; /* 添加最大宽度限制 */
}

.draw-option-color-input input[type="text"]:focus {
    outline: none;
    border-color: #2196F3;
    box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
}

.draw-option-opacity {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap; /* 允许换行，防止溢出 */
}

.draw-option-opacity input[type="range"] {
    flex: 1;
    max-width: 150px; /* 添加最大宽度限制 */
    cursor: pointer;
}

.draw-option-opacity input[type="number"] {
    padding: 6px 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 13px;
    cursor: text;
    width: 60px;
    flex-shrink: 0; /* 防止输入框被压缩 */
}

.draw-option-opacity input[type="number"]:focus {
    outline: none;
    border-color: #2196F3;
    box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
}

.draw-option-checkbox span,
.draw-option-color span,
.draw-option-color-input span,
.draw-option-opacity span {
    font-size: 13px;
    min-width: 60px;
}

/* 绘制控制按钮 */
.draw-control-buttons {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
}

.draw-control-btn {
    flex: 1;
    min-width: 80px;
    padding: 10px 15px;
    border: none;
    border-radius: 4px;
    font-size: 13px;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.2s ease;
    color: white;
}

.draw-control-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.start-btn {
    background-color: #4CAF50;
}

.start-btn:hover:not(:disabled) {
    background-color: #45a049;
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.end-btn {
    background-color: #FF9800;
}

.end-btn:hover:not(:disabled) {
    background-color: #f57c00;
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.undo-btn {
    background-color: #9C27B0;
}

.undo-btn:hover:not(:disabled) {
    background-color: #7B1FA2;
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.clear-btn {
    background-color: #f44336;
}

.clear-btn:hover:not(:disabled) {
    background-color: #da190b;
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

/* 绘制信息 */
.draw-info-content {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.draw-info-content div {
    font-size: 13px;
    padding: 8px;
    background-color: #f9f9f9;
    border-radius: 4px;
    border-left: 3px solid #2196F3;
}

#drawPointCount {
    border-left-color: #4CAF50;
}

#drawStatus {
    border-left-color: #FF9800;
}

/* 响应式设计 */
@media (max-width: 400px) {
    .draw-tool-content {
        padding: 10px;
    }
    
    .draw-mode-options {
        flex-direction: column;
        gap: 8px;
    }
    
    .draw-control-buttons {
        flex-direction: column;
    }
    
    .draw-control-btn {
        width: 100%;
    }
}
`;
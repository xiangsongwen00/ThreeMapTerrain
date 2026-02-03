/*
 * @Author: 2409479323@qq.com
 * @Date: 2026-01-26 15:18:26
 * @LastEditors: 2409479323@qq.com 
 * @LastEditTime: 2026-01-26 15:23:07
 * @FilePath: \THREEMapT\src\toolManager\UI\style\auxiliaryToolsStyles.js
 * @Description: 
 * 
 * Copyright (c) 2026 by bimcc, All Rights Reserved. 
 */
/*
 * @Description: 辅助工具样式
 */
export const auxiliaryToolsStyles = `
.auxiliary-tools-ui {
    font-family: Arial, sans-serif;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
}

.auxiliary-tools-header {
    padding: 10px 15px;
    border-bottom: 1px solid #ddd;
    background-color: #f5f5f5;
}

.auxiliary-tools-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: bold;
    color: #333;
}

.auxiliary-tools-content {
    flex: 1;
    padding: 15px;
    overflow-y: auto;
}

.control-section {
    margin-bottom: 20px;
    padding: 12px;
    background-color: #fff;
    border-radius: 6px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.control-section h4 {
    margin: 0 0 10px 0;
    font-size: 14px;
    font-weight: bold;
    color: #555;
    border-bottom: 1px solid #eee;
    padding-bottom: 5px;
}

.control-item {
    margin-bottom: 10px;
}

.checkbox-item {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    padding: 8px;
    border-radius: 4px;
    transition: all 0.2s ease;
}

.checkbox-item:hover {
    background-color: #f0f0f0;
}

.checkbox-item input[type="checkbox"] {
    accent-color: #2196F3;
}

.checkbox-item span {
    font-size: 13px;
    color: #333;
}

/* 响应式设计 */
@media (max-width: 400px) {
    .auxiliary-tools-content {
        padding: 10px;
    }
    
    .control-section {
        padding: 10px;
    }
}
`;
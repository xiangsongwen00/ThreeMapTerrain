export const terrainEditorStyles = `
.terrain-editor-ui {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    font-family: Arial, sans-serif;
    color: #333;
}

.terrain-editor-header {
    padding: 10px 15px;
    border-bottom: 1px solid #ddd;
    background-color: #f5f5f5;
}

.terrain-editor-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: bold;
}

.terrain-editor-content {
    flex: 1;
    padding: 15px;
    overflow-y: auto;
}

.terrain-editor-section {
    margin-bottom: 16px;
    padding: 12px;
    background-color: #fff;
    border-radius: 6px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.terrain-editor-section h4 {
    margin: 0 0 10px 0;
    font-size: 14px;
    font-weight: bold;
    color: #555;
    border-bottom: 1px solid #eee;
    padding-bottom: 6px;
}

.terrain-editor-field label,
.terrain-editor-row label {
    display: block;
    font-size: 13px;
    font-weight: bold;
    color: #555;
    margin-bottom: 6px;
}

.terrain-editor-field textarea {
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    padding: 8px 10px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 12px;
    line-height: 1.4;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

.terrain-editor-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
}

.terrain-editor-row label {
    margin: 0;
    flex: 1;
}

.terrain-editor-row input[type="number"] {
    width: 120px;
    padding: 6px 8px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 13px;
}

.terrain-editor-row input[type="checkbox"] {
    width: auto;
    transform: scale(1.1);
}

.terrain-editor-row.terrain-editor-row-checkbox label {
    font-weight: normal;
}

.terrain-editor-row select {
    width: 120px;
    padding: 6px 8px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 13px;
    background: #fff;
}

.terrain-editor-hint {
    margin-top: 8px;
    font-size: 12px;
    color: #666;
    padding: 8px 10px;
    background: #f9f9f9;
    border-left: 3px solid #FFC107;
    border-radius: 4px;
}

.terrain-editor-actions {
    margin-top: 10px;
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
}

.terrain-editor-actions button {
    flex: 1;
    min-width: 90px;
    padding: 10px 12px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-weight: bold;
    transition: all 0.2s ease;
}

.terrain-editor-actions button.primary {
    background: #2196F3;
    color: #fff;
}

.terrain-editor-actions button.primary:hover {
    background: #1976D2;
    transform: translateY(-1px);
}

.terrain-editor-actions button.danger {
    background: #f44336;
    color: #fff;
}

.terrain-editor-actions button.danger:hover {
    background: #da190b;
    transform: translateY(-1px);
}

.terrain-editor-actions button.ghost {
    background: #f0f0f0;
    color: #333;
    border: 1px solid #ddd;
}

.terrain-editor-actions button.ghost:hover {
    background: #e6e6e6;
    transform: translateY(-1px);
}
`;

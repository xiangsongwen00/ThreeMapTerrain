import { terrainEditorHTML } from './html/terrainEditorHTML.js';
import { terrainEditorStyles } from './style/terrainEditorStyles.js';

export class TerrainEditorUI {
    constructor(options) {
        this.options = { ...options };
        this.container = null;
        this.isInitialized = false;
    }

    init(container) {
        this.container = container;
        this.render();
        this.bindEvents();
        this.isInitialized = true;
    }

    render() {
        if (!this.container) return;
        this.container.innerHTML = terrainEditorHTML;
        this.addStyles();
    }

    addStyles() {
        if (document.getElementById('terrain-editor-ui-styles')) return;

        const style = document.createElement('style');
        style.id = 'terrain-editor-ui-styles';
        style.textContent = terrainEditorStyles;
        document.head.appendChild(style);
    }

    bindEvents() {
        const qs = (sel) => this.container?.querySelector(sel);

        const parsePolygon = (value) => {
            const raw = value ?? '[]';
            const polygon = JSON.parse(raw);
            if (!Array.isArray(polygon)) throw new Error('polygon must be array');
            return polygon;
        };

        const parseJson = (value, fallback) => {
            const raw = (value ?? '').toString().trim();
            if (!raw.length) return fallback;
            return JSON.parse(raw);
        };

        qs('#terrainApplyRaise')?.addEventListener('click', () => {
            try {
                const polygon = parsePolygon(qs('#terrainEditPolygon')?.value);
                const delta = parseFloat(qs('#terrainRaiseDelta')?.value);
                const useRaycastBase = Boolean(qs('#terrainDeltaUseRaycastBase')?.checked);
                this.onDeltaUseRaycastBase?.(useRaycastBase);
                this.onRaiseLower?.(polygon, delta);
            } catch {
                alert('多边形格式错误：请填写有效的 JSON 数组，例如 [[105.29,28.83],[...]]');
            }
        });

        qs('#terrainApplyDeltaMultiple')?.addEventListener('click', () => {
            try {
                const list = parseJson(qs('#terrainDeltaMultiple')?.value, []);
                if (!Array.isArray(list)) throw new Error('not array');
                const useRaycastBase = Boolean(qs('#terrainDeltaUseRaycastBase')?.checked);
                this.onDeltaUseRaycastBase?.(useRaycastBase);
                this.onRaiseLowerMultiple?.(list);
            } catch {
                alert('批量 Δ 格式错误：请填写有效的 JSON 数组，例如 [{\"polygon\":[[lon,lat],...],\"delta\":10}]');
            }
        });

        qs('#terrainApplyFlatten')?.addEventListener('click', () => {
            try {
                const polygon = parsePolygon(qs('#terrainEditPolygon')?.value);
                const targetElevation = parseFloat(qs('#terrainFlattenHeight')?.value);
                this.onFlattenTo?.(polygon, targetElevation);
            } catch {
                alert('多边形格式错误：请填写有效的 JSON 数组，例如 [[105.29,28.83],[...]]');
            }
        });

        qs('#terrainApplyFlattenMultiple')?.addEventListener('click', () => {
            try {
                const list = parseJson(qs('#terrainFlattenMultiple')?.value, []);
                if (!Array.isArray(list)) throw new Error('not array');
                this.onFlattenMultiple?.(list);
            } catch {
                alert('批量整平格式错误：请填写有效的 JSON 数组，例如 [{\"polygon\":[[lon,lat],...],\"targetElevation\":0}]');
            }
        });

        qs('#terrainApplyClip')?.addEventListener('click', () => {
            try {
                const polygon = parsePolygon(qs('#terrainClipPolygon')?.value);
                this.onClipTerrain?.(polygon);
            } catch {
                alert('裁剪多边形格式错误：请填写有效的 JSON 数组');
            }
        });

        qs('#terrainApplyClipMultiple')?.addEventListener('click', () => {
            try {
                const list = parseJson(qs('#terrainClipMultiple')?.value, []);
                if (!Array.isArray(list)) throw new Error('not array');
                this.onSetClips?.(list);
            } catch {
                alert('多洞裁剪格式错误：请填写有效的 JSON 数组，例如 [{\"polygon\":[[lon,lat],...]}]');
            }
        });

        qs('#terrainClearClip')?.addEventListener('click', () => {
            this.onClearClip?.();
        });

        // Init & listen: boundary sampling density (scheme A)
        const deltaUseRaycastEl = qs('#terrainDeltaUseRaycastBase');
        if (deltaUseRaycastEl) {
            const tileConfig = this.options?.rgbTerrain?.terrain?.tileConfig;
            if (tileConfig) {
                const base = Number(tileConfig._boundarySamplesPerEdgeBase ?? tileConfig.boundarySamplesPerEdge ?? 0);
                if (!Number.isFinite(tileConfig._boundarySamplesPerEdgeBase) && Number.isFinite(base)) {
                    tileConfig._boundarySamplesPerEdgeBase = base;
                }
                const current = Number(tileConfig.boundarySamplesPerEdge ?? base);
                if (Number.isFinite(base) && Number.isFinite(current)) {
                    deltaUseRaycastEl.checked = current >= base * 3;
                }
            }

            deltaUseRaycastEl.addEventListener('change', () => {
                this.onDeltaUseRaycastBase?.(Boolean(deltaUseRaycastEl.checked));
            });
        }

        qs('#terrainApplySlope')?.addEventListener('click', () => {
            const num = (v) => {
                const n = Number(v);
                return Number.isFinite(n) ? n : NaN;
            };

            const aLon = num(qs('#terrainSlopeALon')?.value);
            const aLat = num(qs('#terrainSlopeALat')?.value);
            const bLon = num(qs('#terrainSlopeBLon')?.value);
            const bLat = num(qs('#terrainSlopeBLat')?.value);
            const side = (qs('#terrainSlopeSide')?.value === 'right') ? 'right' : 'left';
            const widthHeightRatio = num(qs('#terrainSlopeRatio')?.value);
            const maxHeight = num(qs('#terrainSlopeMaxHeight')?.value);

            const highSamplesRaw = (qs('#terrainSlopeSamples')?.value ?? '').toString().trim();
            let highEdgeSamples = undefined;
            if (highSamplesRaw.length) {
                try {
                    const parsed = JSON.parse(highSamplesRaw);
                    if (!Array.isArray(parsed)) throw new Error('not array');
                    highEdgeSamples = parsed;
                } catch {
                    alert('参数错误：高坡边高程控制点需要是有效 JSON 数组');
                    return;
                }
            }

            if (![aLon, aLat, bLon, bLat, widthHeightRatio, maxHeight].every(Number.isFinite)) {
                alert('参数错误：请检查 A/B 经度纬度、宽高比、最大高差是否为有效数字');
                return;
            }

            this.onSlope?.({
                aLonLat: [aLon, aLat],
                bLonLat: [bLon, bLat],
                side,
                widthHeightRatio,
                maxHeight,
                highEdgeSamples
            });
        });

        qs('#terrainApplySlopeMultiple')?.addEventListener('click', () => {
            const raw = (qs('#terrainSlopeMultiple')?.value ?? '').toString().trim();
            if (!raw.length) {
                alert('请填写坡面批量配置（JSON 数组）');
                return;
            }
            try {
                const list = JSON.parse(raw);
                if (!Array.isArray(list)) throw new Error('not array');
                this.onSlopeMultiple?.(list);
            } catch {
                alert('坡面批量格式错误：请填写有效的 JSON 数组');
            }
        });
    }

    dispose() {
        this.isInitialized = false;
    }
}

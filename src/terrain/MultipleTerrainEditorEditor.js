export class MultipleTerrainEditorEditor {
    /**
     * @param {import('./Terrain.js').Terrain} terrain
     */
    constructor(terrain) {
        this.terrain = terrain;
        this.editor = terrain?.editor;
        this._toUnits = (v) => this.terrain?.proj?.metersToUnits ? this.terrain.proj.metersToUnits(v) : Number(v);

        this._lastDelta = 0;
        this._lastFlatten = 0;
        this._lastSlope = {
            side: 'left',
            widthHeightRatio: 3,
            maxHeight: 10,
            highEdgeSamples: undefined
        };
    }

    _warn(msg, obj) {
        try {
            if (obj !== undefined) console.warn(`[MultipleTerrainEditorEditor] ${msg}`, obj);
            else console.warn(`[MultipleTerrainEditorEditor] ${msg}`);
        } catch {
            // ignore
        }
    }

    _isConvexXZ(points) {
        const pts = Array.isArray(points) ? points : [];
        if (pts.length < 3) return false;

        let sign = 0;
        const n = pts.length;
        for (let i = 0; i < n; i++) {
            const a = pts[i];
            const b = pts[(i + 1) % n];
            const c = pts[(i + 2) % n];
            const abx = b.x - a.x;
            const abz = b.y - a.y;
            const bcx = c.x - b.x;
            const bcz = c.y - b.y;
            const cross = abx * bcz - abz * bcx;
            if (Math.abs(cross) < 1e-8) continue;
            const s = cross > 0 ? 1 : -1;
            if (sign === 0) sign = s;
            else if (sign !== s) return false;
        }
        return true;
    }

    _lonLatPolygonToXZ(polygonLonLat) {
        const proj = this.terrain?.proj;
        if (!proj) return [];
        const poly = Array.isArray(polygonLonLat) ? polygonLonLat : [];
        return poly
            .filter((p) => Array.isArray(p) && p.length >= 2)
            .map(([lon, lat]) => {
                const v = proj.lonLatToThree(lon, lat);
                return { x: v.x, y: v.z };
            });
    }

    _clearGroup(prefix) {
        this.editor?._removePatchesByPrefix?.(prefix);
    }

    /**
     * Δ 批量：[{ polygon: [[lon,lat],...], delta?: number }]
     */
    applyDelta(list) {
        const items = Array.isArray(list) ? list : [];
        if (!this.editor) return;

        const prefix = 'multi:delta:';
        this._clearGroup(prefix);

        let last = Number.isFinite(this._lastDelta) ? this._lastDelta : 0;
        for (let i = 0; i < items.length; i++) {
            const it = items[i] || {};
            const polygon = it.polygon ?? it.vertices ?? it.poly;
            if (!Array.isArray(polygon) || polygon.length < 3) {
                this._warn(`delta[${i}] 缺少 polygon，已跳过`, it);
                continue;
            }

            const polyXZ = this._lonLatPolygonToXZ(polygon);
            if (!this._isConvexXZ(polyXZ)) {
                this._warn(`delta[${i}] polygon 不是凸多边形，将按凹多边形处理（自动三角化顶面/按边界建墙&裁剪）`, polygon);
            }

            const d = Number(it.delta);
            if (Number.isFinite(d)) last = d;
            else this._warn(`delta[${i}] 缺少 delta，使用最近有效值 ${last}`, it);

            const boundaryPolygonXZ = this.editor._buildBoundaryXZ(polygon);
            const polygonKey = JSON.stringify({ type: 'delta', i, polygon });
            const editState = { polygonKey, mode: 'delta', value: this._toUnits(last) };
            const patchKey = `${prefix}${i}`;
            this.editor.createOrUpdateEditPatch(boundaryPolygonXZ, editState, patchKey);
        }

        this._lastDelta = last;
    }

    /**
     * 整平批量：[{ polygon: [[lon,lat],...], targetElevation?: number }]
     */
    applyFlatten(list) {
        const items = Array.isArray(list) ? list : [];
        if (!this.editor) return;

        const prefix = 'multi:flatten:';
        this._clearGroup(prefix);

        let last = Number.isFinite(this._lastFlatten) ? this._lastFlatten : 0;
        for (let i = 0; i < items.length; i++) {
            const it = items[i] || {};
            const polygon = it.polygon ?? it.vertices ?? it.poly;
            if (!Array.isArray(polygon) || polygon.length < 3) {
                this._warn(`flatten[${i}] 缺少 polygon，已跳过`, it);
                continue;
            }

            const polyXZ = this._lonLatPolygonToXZ(polygon);
            if (!this._isConvexXZ(polyXZ)) {
                this._warn(`flatten[${i}] polygon 不是凸多边形，将按凹多边形处理（自动三角化顶面/按边界建墙&裁剪）`, polygon);
            }

            const h = Number(it.targetElevation ?? it.height ?? it.elevation);
            if (Number.isFinite(h)) last = h;
            else this._warn(`flatten[${i}] 缺少 targetElevation，使用最近有效值 ${last}`, it);

            const boundaryPolygonXZ = this.editor._buildBoundaryXZ(polygon);
            const polygonKey = JSON.stringify({ type: 'flatten', i, polygon });
            const editState = { polygonKey, mode: 'flatten', value: this._toUnits(last) };
            const patchKey = `${prefix}${i}`;
            this.editor.createOrUpdateEditPatch(boundaryPolygonXZ, editState, patchKey);
        }

        this._lastFlatten = last;
    }

    /**
     * 坡面批量：[{ aLonLat:[lon,lat], bLonLat:[lon,lat], side?, widthHeightRatio?, maxHeight?, highEdgeSamples? }]
     */
    applySlopes(list) {
        const items = Array.isArray(list) ? list : [];
        if (!this.editor) return;

        const prefix = 'multi:slope:';
        this._clearGroup(prefix);

        let last = { ...this._lastSlope };
        for (let i = 0; i < items.length; i++) {
            const it = items[i] || {};
            const aLonLat = it.aLonLat ?? it.a;
            const bLonLat = it.bLonLat ?? it.b;
            if (!Array.isArray(aLonLat) || aLonLat.length < 2 || !Array.isArray(bLonLat) || bLonLat.length < 2) {
                this._warn(`slope[${i}] 缺少 aLonLat/bLonLat，已跳过`, it);
                continue;
            }

            const side = (it.side === 'right' || it.side === 'left') ? it.side : last.side;
            const ratio = Number(it.widthHeightRatio ?? it.ratio);
            const maxHeight = Number(it.maxHeight);
            const highEdgeSamples = it.highEdgeSamples ?? last.highEdgeSamples;

            if (it.side !== undefined && it.side !== 'left' && it.side !== 'right') {
                this._warn(`slope[${i}] side 无效，使用最近有效值 ${last.side}`, it);
            }
            if (Number.isFinite(ratio)) last.widthHeightRatio = ratio;
            else if (it.widthHeightRatio !== undefined || it.ratio !== undefined) {
                this._warn(`slope[${i}] widthHeightRatio 无效，使用最近有效值 ${last.widthHeightRatio}`, it);
            }
            if (Number.isFinite(maxHeight)) last.maxHeight = maxHeight;
            else if (it.maxHeight !== undefined) {
                this._warn(`slope[${i}] maxHeight 无效，使用最近有效值 ${last.maxHeight}`, it);
            }
            last.side = side;
            last.highEdgeSamples = highEdgeSamples;

            const built = this.editor._buildSlopePatch?.(aLonLat, bLonLat, {
                side: last.side,
                widthHeightRatio: last.widthHeightRatio,
                maxHeight: last.maxHeight,
                highEdgeSamples: last.highEdgeSamples
            });
            if (!built) {
                this._warn(`slope[${i}] 坡面参数无效，已跳过`, it);
                continue;
            }

            const { boundaryPolygonXZ, editState } = built;
            const patchKey = `${prefix}${i}`;
            this.editor.createOrUpdateEditPatch(boundaryPolygonXZ, editState, patchKey);
        }

        this._lastSlope = last;
    }

    /**
     * 多洞裁剪：[{ polygon:[[lon,lat],...] }, ...]
     * 会替换当前所有洞。
     */
    setClips(list) {
        const items = Array.isArray(list) ? list : [];
        const polys = [];
        for (let i = 0; i < items.length; i++) {
            const it = items[i] || {};
            const polygon = it.polygon ?? it.vertices ?? it.poly ?? it;
            if (!Array.isArray(polygon) || polygon.length < 3) {
                this._warn(`clip[${i}] 缺少 polygon，已跳过`, it);
                continue;
            }
            const polyXZ = this._lonLatPolygonToXZ(polygon);
            if (!this._isConvexXZ(polyXZ)) {
                this._warn(`clip[${i}] polygon 不是凸多边形，将按凹多边形处理（mask 支持凹多边形）`, polygon);
            }
            polys.push(polygon);
        }
        this.editor?.setUserClipPolygons?.(polys);
    }
}

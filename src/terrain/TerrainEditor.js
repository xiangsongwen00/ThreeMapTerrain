import * as THREE from 'three';

/**
 * TerrainEditor
 * - Handles terrain editing operations: raise/lower, flatten, clipping
 * - Renders an "active edit surface" patch (top) + a connection wall to the base terrain
 *
 * Assumptions:
 * - Polygon is simple (non-self-intersecting). Concave polygons are supported.
 * - Terrain provides: proj, scene, terrainGroup, tileConfig, sampleHeightAtWorld(...)
 */
export class TerrainEditor {
    /**
     * @param {import('./Terrain.js').Terrain} terrain
     */
    constructor(terrain) {
        this.terrain = terrain;

        // Patch visualization and state
        this.editPatchMeshes = new Map(); // key -> THREE.Group
        this.editPatchPolygonsXZ = new Map(); // key -> THREE.Vector2[] (for masking/clipping)
        this.editPatchEpsilon = 0.002; // meters, avoid z-fighting while keeping patch tightly aligned
        this.activeEditState = null; // { polygonKey, mode: 'delta'|'flatten'|'slope', value }

        // Outline helper
        this.editPolygonHelper = null; // THREE.LineLoop

        // Clipping planes (visual replacement / user "dig hole")
        this._lastEditClipPlanes = [];

        // Multi-polygon masking (supports multiple edit patches + multiple user holes)
        this._userClipPolygonsXZ = []; // THREE.Vector2[][]

        // For draping helper line to the real terrain surface
        this._raycaster = new THREE.Raycaster();

        // Persist the latest base-mesh mask/clip state so newly streamed terrain tiles can inherit it.
        this._lastMaskTriangles = [];
        this._baseUserClipPlanes = [];
        this._baseEditClipPlanes = [];
    }

    _simplifyPolygonXZ(polygonXZ, sinTol = 1e-3) {
        const pts = Array.isArray(polygonXZ) ? polygonXZ : [];
        if (pts.length < 4) return pts;

        const out = [];
        const n = pts.length;
        for (let i = 0; i < n; i++) {
            const prev = pts[(i - 1 + n) % n];
            const cur = pts[i];
            const next = pts[(i + 1) % n];

            const v1x = cur.x - prev.x;
            const v1z = cur.y - prev.y;
            const v2x = next.x - cur.x;
            const v2z = next.y - cur.y;
            const l1 = Math.hypot(v1x, v1z);
            const l2 = Math.hypot(v2x, v2z);
            if (l1 < 1e-6 || l2 < 1e-6) continue;

            const cross = v1x * v2z - v1z * v2x;
            const sin = Math.abs(cross) / (l1 * l2);
            if (sin < sinTol) continue; // nearly straight, drop

            out.push(cur);
        }

        return out.length >= 3 ? out : pts;
    }

    _polygonForMask(polygonXZ, maxVerts = 64) {
        const pts = Array.isArray(polygonXZ) ? polygonXZ : [];
        if (pts.length < 3) return pts;

        // 1) Prefer keeping real corners (densified edges collapse here).
        let simplified = this._simplifyPolygonXZ(pts);

        // 2) If still too many (e.g., user provides many corners), downsample evenly (do NOT truncate prefix).
        if (simplified.length > maxVerts) {
            const step = Math.ceil(simplified.length / maxVerts);
            simplified = simplified.filter((_, i) => (i % step) === 0);
        }

        return simplified.length >= 3 ? simplified : pts.slice(0, Math.min(maxVerts, pts.length));
    }

    /**
     * Legacy-compatible delta edit: positive = raise, negative = lower.
     */
    raiseLower(polygonLonLat, delta) {
        if (!this.terrain?.terrainGroup || this.terrain.terrainGroup.children.length === 0) return;

        const polygonKey = JSON.stringify(polygonLonLat);
        // Delta is interpreted as an offset relative to the original/base surface (not cumulative stacking).
        this.activeEditState = { polygonKey, mode: 'delta', value: delta };

        const boundaryPolygonXZ = this._buildBoundaryXZ(polygonLonLat);
        this.showEditPolygon(boundaryPolygonXZ);

        // Legacy single-action behavior: replace previous single delta patch.
        const patchKey = `single:delta:${polygonKey}`;
        this._removePatchesByPrefix('single:delta:');
        this.createOrUpdateEditPatch(boundaryPolygonXZ, this.activeEditState, patchKey);
    }

    /**
     * Flatten to an absolute elevation (meters). Can be negative.
     */
    flattenTo(polygonLonLat, targetElevation) {
        if (!this.terrain?.terrainGroup || this.terrain.terrainGroup.children.length === 0) return;

        const polygonKey = JSON.stringify(polygonLonLat);
        this.activeEditState = { polygonKey, mode: 'flatten', value: targetElevation };

        const boundaryPolygonXZ = this._buildBoundaryXZ(polygonLonLat);
        this.showEditPolygon(boundaryPolygonXZ);

        // Legacy single-action behavior: replace previous single flatten patch.
        const patchKey = `single:flatten:${polygonKey}`;
        this._removePatchesByPrefix('single:flatten:');
        this.createOrUpdateEditPatch(boundaryPolygonXZ, this.activeEditState, patchKey);
    }

    /**
     * Clear all flatten edit patches (single + multi) and restore base terrain masking.
     * Intended for tools that use flatten as a reversible operation (e.g. cut/fill measurement "execute").
     */
    clearFlattenEdits() {
        this._removePatchesByPrefix('single:flatten:');
        this._removePatchesByPrefix('multi:flatten:');

        if (this.activeEditState?.mode === 'flatten') this.activeEditState = null;

        if (this.editPolygonHelper) {
            try { this.terrain.scene.remove(this.editPolygonHelper); } catch { /* ignore */ }
            try { this.editPolygonHelper.geometry?.dispose?.(); } catch { /* ignore */ }
            try { this.editPolygonHelper.material?.dispose?.(); } catch { /* ignore */ }
            this.editPolygonHelper = null;
        }
    }

    /**
     * Create a linear slope patch based on a "high edge" segment AB.
     *
     * Inputs:
     * - A/B are lon/lat, elevation is not required (treated as 0 for projection to XZ).
     * - side is defined by AB direction A->B ("left"/"right").
     * - widthHeightRatio defines slope width = ratio * maxHeight.
     * - highEdgeSamples: optional manual samples describing elevation along AB.
     *   Supported formats:
     *   - [[t, elevation], ...] where t in [0..1] is along AB (A=0, B=1)
     *   - [[lon, lat, elevation], ...] points along/near AB
     *   If omitted, auto-samples elevations along AB from base heightmap.
     *
     * The patch is a convex rectangle: A-B-(B+N*w)-(A+N*w), with elevation linearly decreasing across N.
     */
    slopeFromAB(aLonLat, bLonLat, options = {}) {
        if (!this.terrain?.terrainGroup || this.terrain.terrainGroup.children.length === 0) return;
        if (!Array.isArray(aLonLat) || !Array.isArray(bLonLat) || aLonLat.length < 2 || bLonLat.length < 2) return;

        const built = this._buildSlopePatch(aLonLat, bLonLat, options);
        if (!built) return;
        const { boundaryPolygonXZ, editState } = built;
        this.activeEditState = editState;

        this.showEditPolygon(boundaryPolygonXZ);

        // Legacy single-action behavior: replace previous single slope patch.
        const patchKey = `single:slope:${editState.polygonKey}`;
        this._removePatchesByPrefix('single:slope:');
        this.createOrUpdateEditPatch(boundaryPolygonXZ, this.activeEditState, patchKey);
    }

    /**
     * Internal slope builder for reuse by MultipleTerrainEditorEditor.
     * @returns {{boundaryPolygonXZ: THREE.Vector2[], editState: any}|null}
     */
    _buildSlopePatch(aLonLat, bLonLat, options = {}) {
        const side = options.side === 'right' ? 'right' : 'left';
        const widthHeightRatio = Number(options.widthHeightRatio ?? options.ratio ?? 3);
        const maxHeight = Number(options.maxHeight ?? 10);

        if (!Number.isFinite(widthHeightRatio) || !Number.isFinite(maxHeight)) return null;
        const H = Math.abs(maxHeight);
        const W = Math.abs(widthHeightRatio) * H;
        if (H <= 0 || W <= 0) return null;

        const proj = this.terrain.proj;
        const a = proj.lonLatToThree(aLonLat[0], aLonLat[1]);
        const b = proj.lonLatToThree(bLonLat[0], bLonLat[1]);
        const aXZ = new THREE.Vector2(a.x, a.z);
        const bXZ = new THREE.Vector2(b.x, b.z);

        const ab = bXZ.clone().sub(aXZ);
        const abLen = ab.length();
        if (!Number.isFinite(abLen) || abLen < 1e-6) return null;
        const dir = ab.clone().multiplyScalar(1 / abLen); // unit along AB

        const leftN = new THREE.Vector2(-dir.y, dir.x);
        const normal = side === 'right' ? leftN.clone().multiplyScalar(-1) : leftN;

        const highEdgeSamples = this._buildHighEdgeSamplesAlongAB(aXZ, bXZ, dir, abLen, options);

        const boundary = [
            new THREE.Vector2(aXZ.x, aXZ.y),
            new THREE.Vector2(bXZ.x, bXZ.y),
            new THREE.Vector2(bXZ.x + normal.x * W, bXZ.y + normal.y * W),
            new THREE.Vector2(aXZ.x + normal.x * W, aXZ.y + normal.y * W)
        ];

        const samplesPerEdge = this.terrain.tileConfig.boundarySamplesPerEdge ?? 4;
        const boundaryPolygonXZ = this.densifyPolygonXZ(boundary, samplesPerEdge);

        const polygonKey = JSON.stringify({
            aLonLat,
            bLonLat,
            side,
            widthHeightRatio,
            maxHeight: H,
            highEdgeSamples
        });

        const editState = {
            polygonKey,
            mode: 'slope',
            value: {
                a: { x: aXZ.x, z: aXZ.y },
                dir: { x: dir.x, z: dir.y },
                len: abLen,
                normal: { x: normal.x, z: normal.y },
                width: W,
                maxHeight: H,
                highEdgeSamples
            }
        };

        return { boundaryPolygonXZ, editState };
    }

    /**
     * Clip (dig a hole) using polygon clipping planes.
     * Note: This clips materials of base meshes; patch meshes are ignored.
     */
    clipTerrain(polygonLonLat) {
        if (!this.terrain?.terrainGroup || this.terrain.terrainGroup.children.length === 0) return;
        const proj = this.terrain.proj;

        const polygonWorld = polygonLonLat.map(([lon, lat]) => {
            const p = proj.lonLatToThree(lon, lat);
            return new THREE.Vector3(p.x, 0, p.z);
        });

        // Show outline (draped) and add a "hole" polygon mask.
        // Densify edges so the helper line better follows terrain elevation near edges (visual only).
        const polyXZ = polygonWorld.map((p) => new THREE.Vector2(p.x, p.z));
        const samplesPerEdge = this.terrain.tileConfig.boundarySamplesPerEdge ?? 4;
        const denseXZ = this.densifyPolygonXZ(polyXZ, samplesPerEdge);
        this.showEditPolygon(denseXZ);

        // For masking, use the original corner polygon (not densified) to avoid corner artifacts and reduce cost.
        this._userClipPolygonsXZ.push(polyXZ);
        this._syncBasePolygonMask();
    }

    /**
     * Draw a polygon outline, draped onto the base terrain.
     * @param {THREE.Vector2[]} polygonXZ - world XZ
     */
    showEditPolygon(polygonXZ) {
        if (!polygonXZ || polygonXZ.length < 3) return;

        const points = polygonXZ.map((p) => {
            // Drape the outline onto the actually rendered terrain surface (raycast),
            // then apply a tiny lift to avoid z-fighting.
            const y0 = this._raycastTerrainHeightAtWorld(p.x, p.y);
            const y = (Number.isFinite(y0) ? y0 : this.terrain.sampleHeightAtWorld(p.x, p.y, 'heightmap')) + Math.max(0.0005, this.editPatchEpsilon);
            return new THREE.Vector3(p.x, y, p.y);
        });

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color: 0xffd54f });

        if (this.editPolygonHelper) {
            this.terrain.scene.remove(this.editPolygonHelper);
            this.editPolygonHelper.geometry.dispose();
            this.editPolygonHelper.material.dispose();
        }

        this.editPolygonHelper = new THREE.LineLoop(geometry, material);
        this.terrain.scene.add(this.editPolygonHelper);
    }

    _raycastTerrainHeightAtWorld(worldX, worldZ) {
        const group = this.terrain?.terrainGroup;
        if (!group || !this._raycaster) return NaN;

        const originY = 10000;
        this._raycaster.set(new THREE.Vector3(worldX, originY, worldZ), new THREE.Vector3(0, -1, 0));

        const meshes = [];
        group.children.forEach((child) => {
            if (!child?.isMesh) return;
            if (child.userData && child.userData.isEditPatch) return;
            meshes.push(child);
        });
        if (!meshes.length) return NaN;

        const hits = this._raycaster.intersectObjects(meshes, false);
        if (!hits.length) return NaN;
        return hits[0].point.y;
    }

    /**
     * Create/update the edit patch:
     * - Top surface (dense triangulation) = edited surface
     * - Wall (connection layer) = base ring + top ring
     */
    createOrUpdateEditPatch(boundaryPolygonXZ, editState, patchKey = 'default') {
        if (!boundaryPolygonXZ || boundaryPolygonXZ.length < 3) return;

        this._removePatchByKey(patchKey);

        const mode = editState?.mode || 'delta';
        const value = editState?.value ?? 0;

        const subdiv = this.terrain.tileConfig.patchSubdiv ?? 20;

        // Fast base height: always sample from cached baseHeightmap (no raycast).
        const baseCache = new Map();
        const baseKeyOf = (x, z) => `${x.toFixed(3)},${z.toFixed(3)}`;
        const getBaseHeight = (x, z) => {
            const key = baseKeyOf(x, z);
            const cached = baseCache.get(key);
            if (cached !== undefined) return cached;
            let y = this.terrain.sampleHeightAtWorld(x, z, 'baseHeightmap');
            if (!Number.isFinite(y)) y = this.terrain.sampleHeightAtWorld(x, z, 'heightmap');
            baseCache.set(key, y);
            return y;
        };

        const delta = Number(value);
        const computeTopHeight = (x, z) => {
            if (mode === 'delta') {
                const base = getBaseHeight(x, z);
                return (Number.isFinite(base) ? base : 0) + (Number.isFinite(delta) ? delta : 0);
            }
            return this._computeTopHeightAt(x, z, mode, value);
        };

        const topGeom = this.buildConvexEditPatchGeometry(boundaryPolygonXZ, mode, value, subdiv, computeTopHeight);

        // Connection wall: base ring (earth) + top ring (notEarth).
        // Split into "fill" and "cut" walls so above-ground and below-ground parts can have different materials.
        const ring = boundaryPolygonXZ;
        const ringCount = ring.length;
        const wallPositions = new Float32Array(ringCount * 2 * 3);
        const wallIndicesFill = [];
        const wallIndicesCut = [];
        let avgDelta = 0;

        for (let i = 0; i < ringCount; i++) {
            const p = ring[i];
            const x = p.x;
            const z = p.y;
            const base = getBaseHeight(x, z);
            const top = computeTopHeight(x, z);
            avgDelta += (top - base);

            // base vertex (earth)
            wallPositions[(i * 2 + 0) * 3 + 0] = x;
            wallPositions[(i * 2 + 0) * 3 + 1] = base;
            wallPositions[(i * 2 + 0) * 3 + 2] = z;
            // top vertex (notEarth)
            wallPositions[(i * 2 + 1) * 3 + 0] = x;
            wallPositions[(i * 2 + 1) * 3 + 1] = top + this.editPatchEpsilon;
            wallPositions[(i * 2 + 1) * 3 + 2] = z;
        }
        avgDelta /= ringCount;

        for (let i = 0; i < ringCount; i++) {
            const j = (i + 1) % ringCount;
            const baseI = i * 2 + 0;
            const topI = i * 2 + 1;
            const baseJ = j * 2 + 0;
            const topJ = j * 2 + 1;

            const baseYi = wallPositions[baseI * 3 + 1];
            const topYi = wallPositions[topI * 3 + 1] - this.editPatchEpsilon;
            const baseYj = wallPositions[baseJ * 3 + 1];
            const topYj = wallPositions[topJ * 3 + 1] - this.editPatchEpsilon;
            const d = ((topYi - baseYi) + (topYj - baseYj)) * 0.5;
            const wallMinHeight = Number(this.terrain.tileConfig.wallMinHeight ?? 0.01);
            if (Number.isFinite(wallMinHeight) && Math.abs(d) < wallMinHeight) continue;
            const target = d >= 0 ? wallIndicesFill : wallIndicesCut;
            target.push(topI, baseI, topJ);
            target.push(topJ, baseI, baseJ);
        }

        const buildWallGeom = (indices) => {
            const geom = new THREE.BufferGeometry();
            geom.setAttribute('position', new THREE.BufferAttribute(wallPositions, 3));
            geom.setIndex(indices);
            geom.computeVertexNormals();
            geom.computeBoundingBox();
            geom.computeBoundingSphere();
            return geom;
        };

        const wallGeomFill = wallIndicesFill.length ? buildWallGeom(wallIndicesFill) : null;
        const wallGeomCut = wallIndicesCut.length ? buildWallGeom(wallIndicesCut) : null;

        const isCutDominant = avgDelta < 0;
        const topMat = new THREE.MeshPhongMaterial({
            color: isCutDominant ? 0x8d6e63 : 0x4caf50,
            transparent: false,
            opacity: 1,
            side: THREE.DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
            depthTest: true,
            depthWrite: true
        });

        const wallFillMat = new THREE.MeshPhongMaterial({
            color: 0x2e7d32,
            transparent: true,
            opacity: 0.55,
            side: THREE.DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
            depthTest: true,
            depthWrite: false
        });

        const wallCutMat = new THREE.MeshPhongMaterial({
            color: 0x4e342e,
            transparent: true,
            opacity: 0.75,
            side: THREE.DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
            depthTest: true,
            depthWrite: false
        });

        const group = new THREE.Group();
        group.renderOrder = 999999;
        group.frustumCulled = false;
        group.userData = { isEditPatch: true, patchKey };

        const topMesh = new THREE.Mesh(topGeom, topMat);
        topMesh.userData = { isEditPatch: true };

        group.add(topMesh);
        if (wallGeomFill) {
            const wallFillMesh = new THREE.Mesh(wallGeomFill, wallFillMat);
            wallFillMesh.userData = { isEditPatch: true };
            group.add(wallFillMesh);
        }
        if (wallGeomCut) {
            const wallCutMesh = new THREE.Mesh(wallGeomCut, wallCutMat);
            wallCutMesh.userData = { isEditPatch: true };
            group.add(wallCutMesh);
        }

        this.editPatchMeshes.set(patchKey, group);
        // For masking the base terrain, only keep the real polygon corners (avoid using densified/truncated rings).
        this.editPatchPolygonsXZ.set(patchKey, this._polygonForMask(boundaryPolygonXZ, 64));
        this.terrain.terrainGroup.add(group);

        // Visual replacement: mask base terrain inside all edit polygons so patches "replace" it.
        this._syncBasePolygonMask();
    }

    _removePatchByKey(patchKey) {
        const key = String(patchKey ?? '');
        const existing = this.editPatchMeshes.get(key);
        if (!existing) return;

        this.terrain.terrainGroup.remove(existing);
        existing.traverse((obj) => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
        });
        this.editPatchMeshes.delete(key);
        this.editPatchPolygonsXZ.delete(key);
        this._syncBasePolygonMask();
    }

    _removePatchesByPrefix(prefix) {
        const pre = String(prefix ?? '');
        for (const key of Array.from(this.editPatchMeshes.keys())) {
            if (key.startsWith(pre)) this._removePatchByKey(key);
        }
    }

    /**
     * Boundary densification: keep original vertices and insert samples per edge.
     * @param {THREE.Vector2[]} polygonXZ
     * @param {number} samplesPerEdge
     */
    densifyPolygonXZ(polygonXZ, samplesPerEdge = 0) {
        const pts = polygonXZ || [];
        if (pts.length < 2) return pts;

        const n = pts.length;
        const out = [];
        const kMax = Math.max(0, Math.floor(samplesPerEdge));

        for (let i = 0; i < n; i++) {
            const a = pts[i];
            const b = pts[(i + 1) % n];
            out.push(new THREE.Vector2(a.x, a.y));

            for (let k = 1; k <= kMax; k++) {
                const t = k / (kMax + 1);
                out.push(new THREE.Vector2(
                    a.x + (b.x - a.x) * t,
                    a.y + (b.y - a.y) * t
                ));
            }
        }

        return out;
    }

    /**
     * Dense triangulated patch for convex polygon, preserving boundary exactly.
     * @param {THREE.Vector2[]} ringXZ
     * @param {'delta'|'flatten'|'slope'} mode
     * @param {number|Object} value
     * @param {number} subdiv
     */
    buildConvexEditPatchGeometry(ringXZ, mode, value, subdiv = 10, computeTopHeightAt = null) {
        const ring = ringXZ || [];
        if (ring.length < 3) return new THREE.BufferGeometry();

        const N = Math.max(1, Math.floor(subdiv));

        const vertMap = new Map(); // key -> index
        const verts = [];

        const keyOf = (x, z) => `${x.toFixed(3)},${z.toFixed(3)}`;
        const computeTop = typeof computeTopHeightAt === 'function'
            ? computeTopHeightAt
            : (x, z) => this._computeTopHeightAt(x, z, mode, value);

        const addVertex = (x, z) => {
            const key = keyOf(x, z);
            const existing = vertMap.get(key);
            if (existing !== undefined) return existing;

            const top = computeTop(x, z);
            const idx = verts.length;
            verts.push({ x, y: top + this.editPatchEpsilon, z });
            vertMap.set(key, idx);
            return idx;
        };

        // Force boundary vertices
        ring.forEach((p) => addVertex(p.x, p.y));

        // Support concave polygons by triangulating the contour, then subdividing each triangle.
        const contour = ring.map((p) => new THREE.Vector2(p.x, p.y));
        let faces = [];
        try {
            faces = THREE.ShapeUtils.triangulateShape(contour, []);
        } catch {
            faces = [];
        }

        // Fallback: simple fan (works for convex)
        if (!faces.length && ring.length >= 3) {
            for (let t = 1; t < ring.length - 1; t++) faces.push([0, t, t + 1]);
        }

        const indices = [];

        for (const f of faces) {
            const v0 = ring[f[0]];
            const v1 = ring[f[1]];
            const v2 = ring[f[2]];
            if (!v0 || !v1 || !v2) continue;

            const grid = [];
            for (let i = 0; i <= N; i++) {
                const row = [];
                for (let j = 0; j <= N - i; j++) {
                    const a = i / N;
                    const b = j / N;
                    const w = 1 - a - b;
                    const x = v0.x * w + v1.x * a + v2.x * b;
                    const z = v0.y * w + v1.y * a + v2.y * b;
                    row.push(addVertex(x, z));
                }
                grid.push(row);
            }

            for (let i = 0; i < N; i++) {
                for (let j = 0; j < (N - i); j++) {
                    const a = grid[i][j];
                    const b = grid[i + 1][j];
                    const c = grid[i][j + 1];
                    indices.push(a, b, c);

                    if (j + 1 < (N - i)) {
                        const d = grid[i + 1][j + 1];
                        indices.push(b, d, c);
                    }
                }
            }
        }

        const positions = new Float32Array(verts.length * 3);
        for (let i = 0; i < verts.length; i++) {
            positions[i * 3 + 0] = verts[i].x;
            positions[i * 3 + 1] = verts[i].y;
            positions[i * 3 + 2] = verts[i].z;
        }

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geom.setIndex(indices);
        geom.computeVertexNormals();
        geom.computeBoundingBox();
        geom.computeBoundingSphere();
        return geom;
    }

    _buildBoundaryXZ(polygonLonLat) {
        const proj = this.terrain.proj;
        const polyWorld = polygonLonLat.map(([lon, lat]) => proj.lonLatToThree(lon, lat));
        const polyXZ = polyWorld.map((p) => new THREE.Vector2(p.x, p.z));
        const samplesPerEdge = this.terrain.tileConfig.boundarySamplesPerEdge ?? 4;
        return this.densifyPolygonXZ(polyXZ, samplesPerEdge);
    }

    _buildHighEdgeSamplesAlongAB(aXZ, bXZ, dir, abLen, options) {
        const parsed = this._parseHighEdgeSamples(options?.highEdgeSamples, aXZ, dir, abLen);
        if (parsed.length >= 2) return parsed;

        // Back-compat: constant high edge elevation (deprecated)
        const legacyConstant = Number(options?.highEdgeElevation);
        if (Number.isFinite(legacyConstant)) {
            return [
                { t: 0, elevation: legacyConstant },
                { t: 1, elevation: legacyConstant }
            ];
        }

        // Default: auto-sample along AB and use piecewise-linear interpolation
        const samples = Math.max(2, Math.min(256, Math.floor(options?.sampleCount ?? 32)));
        const out = [];
        for (let i = 0; i < samples; i++) {
            const t = samples === 1 ? 0 : (i / (samples - 1));
            const x = aXZ.x + (bXZ.x - aXZ.x) * t;
            const z = aXZ.y + (bXZ.y - aXZ.y) * t;
            const h = this.terrain.sampleHeightAtWorld(x, z, 'baseHeightmap');
            out.push({ t, elevation: Number.isFinite(h) ? h : 0 });
        }
        return out;
    }

    _parseHighEdgeSamples(raw, aXZ, dir, abLen) {
        const arr = Array.isArray(raw) ? raw : [];
        const samples = [];

        const toNum = (v) => {
            const n = Number(v);
            return Number.isFinite(n) ? n : NaN;
        };

        for (const item of arr) {
            if (!Array.isArray(item)) continue;
            if (item.length === 2) {
                const t = toNum(item[0]);
                const elevation = toNum(item[1]);
                if (!Number.isFinite(t) || !Number.isFinite(elevation)) continue;
                samples.push({ t: Math.min(1, Math.max(0, t)), elevation });
                continue;
            }
            if (item.length >= 3) {
                const lon = toNum(item[0]);
                const lat = toNum(item[1]);
                const elevation = toNum(item[2]);
                if (!Number.isFinite(lon) || !Number.isFinite(lat) || !Number.isFinite(elevation)) continue;

                // Convert lon/lat to world XZ, then project onto AB to get t
                const p = this.terrain.proj.lonLatToThree(lon, lat);
                const px = p.x - aXZ.x;
                const pz = p.z - aXZ.y;
                const along = px * dir.x + pz * dir.y;
                const t = abLen > 0 ? (along / abLen) : 0;
                samples.push({ t: Math.min(1, Math.max(0, t)), elevation });
            }
        }

        samples.sort((a, b) => a.t - b.t);
        if (samples.length === 0) return samples;

        // Ensure coverage at endpoints
        if (samples[0].t > 0) samples.unshift({ t: 0, elevation: samples[0].elevation });
        if (samples[samples.length - 1].t < 1) samples.push({ t: 1, elevation: samples[samples.length - 1].elevation });
        return samples;
    }

    _interpHighEdge(samples, t) {
        const list = Array.isArray(samples) ? samples : [];
        if (list.length === 0) return 0;
        if (list.length === 1) return Number(list[0].elevation) || 0;

        const tt = Math.min(1, Math.max(0, Number(t)));

        // Binary search for segment
        let lo = 0;
        let hi = list.length - 1;
        while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (tt < list[mid].t) hi = mid;
            else lo = mid;
        }

        const a = list[lo];
        const b = list[hi];
        const t0 = Number(a.t);
        const t1 = Number(b.t);
        const e0 = Number(a.elevation);
        const e1 = Number(b.elevation);
        if (!Number.isFinite(t0) || !Number.isFinite(t1) || !Number.isFinite(e0) || !Number.isFinite(e1) || t1 <= t0) {
            return Number.isFinite(e0) ? e0 : 0;
        }
        const w = (tt - t0) / (t1 - t0);
        return e0 * (1 - w) + e1 * w;
    }

    _computeTopHeightAt(x, z, mode, value) {
        if (mode === 'flatten') {
            const target = Number(value);
            return Number.isFinite(target) ? target : 0;
        }

        if (mode === 'slope') {
            const v = value || {};
            const ax = Number(v?.a?.x);
            const az = Number(v?.a?.z);
            const dx = Number(v?.dir?.x);
            const dz = Number(v?.dir?.z);
            const len = Number(v?.len);
            const nx = Number(v?.normal?.x);
            const nz = Number(v?.normal?.z);
            const width = Number(v?.width);
            const maxHeight = Number(v?.maxHeight);
            const highEdgeSamples = v?.highEdgeSamples;

            if (!Number.isFinite(ax) || !Number.isFinite(az) || !Number.isFinite(dx) || !Number.isFinite(dz) || !Number.isFinite(len)) return 0;
            if (!Number.isFinite(nx) || !Number.isFinite(nz)) return 0;
            if (!Number.isFinite(width) || width <= 0) return 0;
            if (!Number.isFinite(maxHeight)) return 0;

            const along = (x - ax) * dx + (z - az) * dz;
            const s = len > 0 ? Math.min(1, Math.max(0, along / len)) : 0;
            const high = this._interpHighEdge(highEdgeSamples, s);

            const dist = (x - ax) * nx + (z - az) * nz; // positive across slope direction
            const w = Math.min(1, Math.max(0, dist / width));
            return high - w * maxHeight;
        }

        // default: delta
        const delta = Number(value);
        const base = this.terrain.sampleHeightAtWorld(x, z, 'baseHeightmap');
        return (Number.isFinite(base) ? base : 0) + (Number.isFinite(delta) ? delta : 0);
    }

    dispose() {
        // Clear masks
        this._userClipPolygonsXZ = [];

        if (this.editPolygonHelper) {
            this.terrain.scene.remove(this.editPolygonHelper);
            this.editPolygonHelper.geometry.dispose();
            this.editPolygonHelper.material.dispose();
            this.editPolygonHelper = null;
        }

        for (const key of Array.from(this.editPatchMeshes.keys())) {
            this._removePatchByKey(key);
        }

        this.activeEditState = null;
        this._syncBasePolygonMask();
    }

    /**
     * Clear user "dig hole" clipping, keep edit replacement clipping if present.
     */
    clearUserClip() {
        this._userClipPolygonsXZ = [];
        this._syncBasePolygonMask();
    }

    /**
     * Replace the user clip polygons (multiple holes). Each polygon is in lon/lat.
     * @param {Array<Array<[number, number]>>} polygonsLonLat
     */
    setUserClipPolygons(polygonsLonLat) {
        const proj = this.terrain?.proj;
        if (!proj) return;
        const list = Array.isArray(polygonsLonLat) ? polygonsLonLat : [];
        const out = [];
        for (const poly of list) {
            if (!Array.isArray(poly) || poly.length < 3) continue;
            const pts = poly.map(([lon, lat]) => {
                const p = proj.lonLatToThree(lon, lat);
                return new THREE.Vector2(p.x, p.z);
            });
            out.push(pts);
        }
        this._userClipPolygonsXZ = out;
        this._syncBasePolygonMask();
    }

    _syncBasePolygonMask() {
        const polygons = [];
        // user holes
        for (const p of this._userClipPolygonsXZ) polygons.push(p);
        // edit replacement masks (one per patch)
        for (const p of this.editPatchPolygonsXZ.values()) polygons.push(p);

        // Convert polygons (convex/concave) into a triangle list to keep shader uniforms small.
        const tris = this._polygonsToTriangles(polygons);
        this._lastMaskTriangles = tris;
        this._applyTriangleMaskToBaseMaterials(tris);
    }

    _polygonsToTriangles(polygonsXZ) {
        const polys = Array.isArray(polygonsXZ) ? polygonsXZ : [];
        const out = [];
        for (const poly of polys) {
            const ring = this._polygonForMask(poly, 64);
            if (!Array.isArray(ring) || ring.length < 3) continue;

            const contour = ring.map((p) => new THREE.Vector2(p.x, p.y));
            // Ensure CCW for triangulation stability
            const area = (() => {
                let a = 0;
                for (let i = 0; i < contour.length; i++) {
                    const p0 = contour[i];
                    const p1 = contour[(i + 1) % contour.length];
                    a += (p0.x * p1.y - p1.x * p0.y);
                }
                return a * 0.5;
            })();
            const ccw = area < 0 ? contour.slice().reverse() : contour;

            let faces = [];
            try {
                faces = THREE.ShapeUtils.triangulateShape(ccw, []);
            } catch {
                faces = [];
            }
            if (!faces.length) {
                // Fallback: fan (works for convex)
                for (let t = 1; t < ccw.length - 1; t++) faces.push([0, t, t + 1]);
            }

            for (const f of faces) {
                const a = ccw[f[0]];
                const b = ccw[f[1]];
                const c = ccw[f[2]];
                if (!a || !b || !c) continue;
                out.push({ a, b, c });
            }
        }
        return out;
    }

    _applyTriangleMaskToBaseMaterials(trianglesXZ) {
        const group = this.terrain?.terrainGroup;
        if (!group) return;

        const tris = Array.isArray(trianglesXZ) ? trianglesXZ : [];
        group.children.forEach((child) => {
            if (!child?.isMesh) return;
            if (child.userData && child.userData.isEditPatch) return;
            const mat = child.material;
            if (!mat) return;
            this._updatePolygonMaskMaterial(mat, tris);
        });
    }

    _updatePolygonMaskMaterial(material, trianglesXZ) {
        // Keep uniforms small: represent all polygons as a union of triangles.
        // Each triangle uses 2 vec4 uniforms: (ax,ay,bx,by) and (cx,cy,0,0).
        const MAX_TRIS = 48;

        material.userData = material.userData || {};
        if (!material.userData.__polyMask) {
            const uniforms = {
                uTriCount: { value: 0.0 },
                uTriAB: { value: Array.from({ length: MAX_TRIS }, () => new THREE.Vector4(0, 0, 0, 0)) },
                uTriC: { value: Array.from({ length: MAX_TRIS }, () => new THREE.Vector4(0, 0, 0, 0)) }
            };
            material.userData.__polyMask = { uniforms };

            const prev = material.onBeforeCompile;
            material.onBeforeCompile = (shader) => {
                if (typeof prev === 'function') prev(shader);

                // Inject uniforms
                shader.uniforms.uTriCount = uniforms.uTriCount;
                shader.uniforms.uTriAB = uniforms.uTriAB;
                shader.uniforms.uTriC = uniforms.uTriC;

                // Vertex: pass world position
                if (!shader.vertexShader.includes('varying vec3 vPolyMaskWorldPos')) {
                    shader.vertexShader = shader.vertexShader.replace(
                        'void main() {',
                        'varying vec3 vPolyMaskWorldPos;\nvoid main() {'
                    );
                    // `transformed` is defined in <begin_vertex>. Using modelMatrix is enough for terrain meshes
                    // (no instancing/skinning) and avoids relying on the presence of `worldPosition`.
                    shader.vertexShader = shader.vertexShader.replace(
                        '#include <begin_vertex>',
                        '#include <begin_vertex>\n    vPolyMaskWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;'
                    );
                }

                // Fragment: discard if inside any polygon
                if (!shader.fragmentShader.includes('uniform float uTriCount')) {
                    const header = `
                    uniform float uTriCount;
                    uniform vec4 uTriAB[${MAX_TRIS}];
                    uniform vec4 uTriC[${MAX_TRIS}];
                    varying vec3 vPolyMaskWorldPos;

                    bool insideTri(vec2 p, vec2 a, vec2 b, vec2 c) {
                        vec2 ab = b - a;
                        vec2 bc = c - b;
                        vec2 ca = a - c;
                        vec2 ap = p - a;
                        vec2 bp = p - b;
                        vec2 cp = p - c;
                        float c1 = ab.x * ap.y - ab.y * ap.x;
                        float c2 = bc.x * bp.y - bc.y * bp.x;
                        float c3 = ca.x * cp.y - ca.y * cp.x;
                        bool hasNeg = (c1 < 0.0) || (c2 < 0.0) || (c3 < 0.0);
                        bool hasPos = (c1 > 0.0) || (c2 > 0.0) || (c3 > 0.0);
                        return !(hasNeg && hasPos);
                    }
                    `;
                    const inject = `
                    int triCount = int(uTriCount + 0.5);
                    if (triCount > 0) {
                        vec2 p = vPolyMaskWorldPos.xz;
                        for (int ti = 0; ti < ${MAX_TRIS}; ti++) {
                            if (ti >= triCount) break;
                            vec4 ab = uTriAB[ti];
                            vec4 cc = uTriC[ti];
                            vec2 a = ab.xy;
                            vec2 b = ab.zw;
                            vec2 c = cc.xy;
                            if (insideTri(p, a, b, c)) discard;
                        }
                    }
                `;
                    // Inject at the start of main so it works regardless of USE_CLIPPING_PLANES/localClippingEnabled.
                    shader.fragmentShader = shader.fragmentShader.replace(
                        'void main() {',
                        header + '\nvoid main() {\n' + inject
                    );
                }
            };

            // Bump cache key whenever shader injection changes.
            material.customProgramCacheKey = () => 'polyMask-v5';
            material.needsUpdate = true;
        }

        const uniforms = material.userData.__polyMask.uniforms;

        const tris = Array.isArray(trianglesXZ) ? trianglesXZ : [];
        const triCount = Math.min(MAX_TRIS, tris.length);
        uniforms.uTriCount.value = triCount;

        for (let i = 0; i < MAX_TRIS; i++) {
            if (i >= triCount) {
                uniforms.uTriAB.value[i].set(0, 0, 0, 0);
                uniforms.uTriC.value[i].set(0, 0, 0, 0);
                continue;
            }
            const t = tris[i];
            const a = t?.a;
            const b = t?.b;
            const c = t?.c;
            uniforms.uTriAB.value[i].set(
                Number(a?.x) || 0,
                Number(a?.y) || 0,
                Number(b?.x) || 0,
                Number(b?.y) || 0
            );
            uniforms.uTriC.value[i].set(Number(c?.x) || 0, Number(c?.y) || 0, 0, 0);
        }
    }

    _buildClipPlanesFromPolygonXZ(polygonXZ, maxPlanes = 64) {
        const pts2 = Array.isArray(polygonXZ) ? polygonXZ : [];
        if (pts2.length < 3) return [];

        const n = pts2.length;
        const pts = [];
        for (let i = 0; i < n; i++) {
            const p = pts2[i];
            pts.push(new THREE.Vector3(p.x, 0, p.y));
        }
        if (pts.length < 3) return [];

        // Simplify densified polygons: remove nearly-collinear points so we keep only actual corners.
        // This avoids corner artifacts when many points are used and later decimated.
        const toV2 = (v3) => new THREE.Vector2(v3.x, v3.z);
        const toV3 = (v2) => new THREE.Vector3(v2.x, 0, v2.y);
        let simplified = this._polygonForMask(pts.map(toV2), maxPlanes).map(toV3);
        if (simplified.length > maxPlanes) {
            const step = Math.ceil(simplified.length / maxPlanes);
            simplified = simplified.filter((_, i) => (i % step) === 0);
        }
        if (simplified.length < 3) return [];

        // Ensure plane normals consistently point "inward" regardless of polygon winding.
        // We build half-spaces so that the polygon interior is the intersection region.
        const signedAreaXZ = (() => {
            let a = 0;
            for (let i = 0; i < simplified.length; i++) {
                const p0 = simplified[i];
                const p1 = simplified[(i + 1) % simplified.length];
                a += (p0.x * p1.z - p1.x * p0.z);
            }
            return a * 0.5;
        })();
        const flip = signedAreaXZ < 0; // clockwise -> flip normals

        const clipPlanes = [];
        for (let i = 0; i < simplified.length; i++) {
            const current = simplified[i];
            const next = simplified[(i + 1) % simplified.length];
            const edge = new THREE.Vector3().subVectors(next, current);
            const normal = new THREE.Vector3(edge.z, 0, -edge.x).normalize(); // right normal in XZ
            if (flip) normal.multiplyScalar(-1);
            const plane = new THREE.Plane(normal, -normal.dot(current));
            clipPlanes.push(plane);
        }
        return clipPlanes;
    }

    _setBaseClipPlanes(kind, planes) {
        const k = kind === 'user' ? 'userClipPlanes' : 'editClipPlanes';
        const normalized = Array.isArray(planes) ? planes : [];
        if (kind === 'user') this._baseUserClipPlanes = normalized;
        else this._baseEditClipPlanes = normalized;

        this.terrain?.terrainGroup?.children?.forEach((child) => {
            if (!child?.isMesh) return;
            if (child.userData && child.userData.isEditPatch) return;

            const mat = child.material;
            if (!mat) return;

            mat.userData = mat.userData || {};
            mat.userData[k] = normalized;
            this._applyCombinedClipping(mat);
        });

        this._updateRendererClippingEnabled();
    }

    /**
     * Apply current polygon mask + clipping planes to a newly created base terrain material.
     * This is needed because terrain tiles can stream in/out (LOD), and materials may be per-tile clones (e.g. draped imagery).
     * @param {THREE.Material} material
     */
    applyCurrentMaskAndClippingToMaterial(material) {
        if (!material) return;

        const hasMask = Array.isArray(this._lastMaskTriangles) && this._lastMaskTriangles.length > 0;
        const hasClipping =
            (Array.isArray(this._baseUserClipPlanes) && this._baseUserClipPlanes.length > 0) ||
            (Array.isArray(this._baseEditClipPlanes) && this._baseEditClipPlanes.length > 0);
        if (!hasMask && !hasClipping) return;

        // Polygon mask (replacement/holes)
        if (hasMask) {
            this._updatePolygonMaskMaterial(material, this._lastMaskTriangles);
        }

        // Clipping planes (user holes + edit replacement planes)
        material.userData = material.userData || {};
        if (Array.isArray(this._baseUserClipPlanes) && this._baseUserClipPlanes.length) {
            material.userData.userClipPlanes = this._baseUserClipPlanes;
        }
        if (Array.isArray(this._baseEditClipPlanes) && this._baseEditClipPlanes.length) {
            material.userData.editClipPlanes = this._baseEditClipPlanes;
        }

        this._applyCombinedClipping(material);
        this._updateRendererClippingEnabled();
    }

    _applyCombinedClipping(material) {
        const user = material?.userData?.userClipPlanes || [];
        const edit = material?.userData?.editClipPlanes || [];
        const combined = [...user, ...edit];
        material.clippingPlanes = combined;
        material.clipIntersection = true;
        material.needsUpdate = true;
    }

    _updateRendererClippingEnabled() {
        const renderer = this.terrain?.renderer;
        if (!renderer) return;

        let any = false;
        this.terrain?.terrainGroup?.children?.forEach((child) => {
            if (!child?.isMesh) return;
            if (child.userData && child.userData.isEditPatch) return;
            const mat = child.material;
            const planes = mat?.clippingPlanes || [];
            if (Array.isArray(planes) && planes.length) any = true;
        });
        renderer.localClippingEnabled = any;
    }
}

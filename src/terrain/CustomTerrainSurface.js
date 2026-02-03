import * as THREE from 'three';

/**
 * CustomTerrainSurface
 * -------------------
 * Standalone "draped surface" overlay that follows the terrain perfectly by rendering
 * a polygon mask into an offscreen RenderTarget, then blending it in the terrain material
 * shader using world position (similar in spirit to TerrainMapAtlas).
 *
 * - Does NOT change TerrainMapAtlas.js logic.
 * - Does NOT modify terrain geometry or clipping.
 * - Supports multiple convex polygons (union).
 * - Concave polygons are supported via triangulation (earcut).
 * - Supports solid color + opacity, or a custom texture.
 *
 * Requirements/assumptions:
 * - Terrain meshes are MeshStandardMaterial-ish and are rendered with world positions.
 * - `terrain.tileMap` exists (Map of tiles -> { mesh }).
 * - The caller provides either a Viewer (with `.terrain` and `.renderer`) or a Terrain instance.
 */
export class CustomTerrainSurface {
    constructor(rgbTerrainOrViewer, _unusedScene = null, options = {}) {
        this.rgbTerrain = rgbTerrainOrViewer;
        this.terrain = rgbTerrainOrViewer?.terrain || rgbTerrainOrViewer || null;
        this.renderer = options.renderer || rgbTerrainOrViewer?.renderer || this.terrain?.renderer || null;

        this._surfaces = new Map(); // id -> { polygonXZ: THREE.Vector2[] }
        this._nextId = 0;

        // Style (global for this instance; create multiple instances for per-surface styles)
        this._mode = 'color'; // 'color' | 'texture'
        this._color = new THREE.Color(options.color ?? 0x00ff00);
        this._opacity = Number.isFinite(Number(options.opacity)) ? Number(options.opacity) : 0.35;
        this._texture = null;
        this._textureScale = new THREE.Vector2(1, 1);
        this._textureOffset = new THREE.Vector2(0, 0);
        this._textureRotation = 0;

        // Mask RT + scene
        this._maskRT = null;
        this._maskScene = new THREE.Scene();
        this._maskCam = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
        this._maskMeshes = [];
        this._maskMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: false,
            depthTest: false,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        this._maskMaterial.toneMapped = false;

        // Mask quality controls (affects edge jaggies).
        // - metersPerPixel: smaller = higher resolution edges
        // - maxSize: clamp for GPU/memory safety
        // - samples: MSAA samples for the mask RT (WebGL2). Falls back silently if unsupported.
        this._maskMetersPerPixel = Number.isFinite(Number(options.maskMetersPerPixel))
            ? Math.max(0.05, Number(options.maskMetersPerPixel))
            : 0.25;
        this._maskMaxSize = Number.isFinite(Number(options.maskMaxSize))
            ? Math.max(256, Number(options.maskMaxSize) | 0)
            : 4096;
        this._maskSamples = Number.isFinite(Number(options.maskSamples))
            ? Math.max(0, Number(options.maskSamples) | 0)
            : 4;

        // Edge smoothing strength in shader space. 0 disables additional smoothing.
        this._edgePx = Number.isFinite(Number(options.edgePx)) ? Math.max(0, Number(options.edgePx)) : 1.5;

        // Bounds in world XZ
        this._bounds = { minX: 0, minZ: 0, maxX: 0, maxZ: 0, invW: 0, invH: 0 };
        this._dirty = true;

        // Keep installing on newly loaded tiles without touching TerrainMapAtlas / Terrain internals.
        const scanMs = Number(options.scanIntervalMs ?? 400);
        this._scanTimer = setInterval(() => {
            try { this._syncTerrainMaterials(); } catch { /* ignore */ }
        }, Math.max(100, Number.isFinite(scanMs) ? scanMs : 400));
    }

    setColor(color, opacity = null) {
        this._mode = 'color';
        try { this._color = new THREE.Color(color); } catch { /* ignore */ }
        if (opacity !== null) this._opacity = Number.isFinite(Number(opacity)) ? Number(opacity) : this._opacity;
        this._pushUniforms();
    }

    setTexture(textureOrUrl, options = {}) {
        this._mode = 'texture';
        const setTex = (tex) => {
            this._texture = tex || null;
            if (this._texture) {
                this._texture.wrapS = THREE.RepeatWrapping;
                this._texture.wrapT = THREE.RepeatWrapping;
                this._texture.needsUpdate = true;
            }
            this._pushUniforms();
        };

        if (typeof textureOrUrl === 'string') {
            const loader = new THREE.TextureLoader();
            loader.load(textureOrUrl, (tex) => setTex(tex), undefined, () => setTex(null));
        } else {
            setTex(textureOrUrl || null);
        }

        const scale = options.scale;
        const offset = options.offset;
        const rotation = options.rotation;
        if (scale) this._textureScale.set(Number(scale.x ?? scale[0] ?? 1) || 1, Number(scale.y ?? scale[1] ?? 1) || 1);
        if (offset) this._textureOffset.set(Number(offset.x ?? offset[0] ?? 0) || 0, Number(offset.y ?? offset[1] ?? 0) || 0);
        if (rotation !== undefined) this._textureRotation = Number(rotation) || 0;
        if (options.opacity !== undefined) this._opacity = Number.isFinite(Number(options.opacity)) ? Number(options.opacity) : this._opacity;
        this._pushUniforms();
    }

    setEdgePx(edgePx) {
        this._edgePx = Number.isFinite(Number(edgePx)) ? Math.max(0, Number(edgePx)) : this._edgePx;
        this._pushUniforms();
    }

    /**
     * Replace all polygons at once.
     * @param {Array<Array<THREE.Vector3|THREE.Vector2|{x:number,z?:number,y?:number}>>} polygons
     */
    setPolygons(polygons = []) {
        this.clearAll();
        if (!Array.isArray(polygons)) return;
        for (const poly of polygons) this.createSurface(poly);
    }

    /**
     * Compatibility with DrawTool: create one polygon surface.
     * @param {Array<THREE.Vector3|THREE.Vector2|{x:number,z?:number,y?:number}>} points
     * @param {Object} _options - currently unused; kept for compatibility
     * @returns {{id:string, mesh:null}|null}
     */
    createSurface(points, _options = {}) {
        const polygonXZ = this._normalizePolygon(points);
        if (!polygonXZ || polygonXZ.length < 3) return null;
        const id = `surface_${this._nextId++}`;
        this._surfaces.set(id, { polygonXZ });
        this._dirty = true;
        this._rebuildIfNeeded();
        return { id, mesh: null };
    }

    removeSurface(id) {
        if (!this._surfaces.has(id)) return false;
        this._surfaces.delete(id);
        this._dirty = true;
        this._rebuildIfNeeded();
        return true;
    }

    clearAll() {
        this._surfaces.clear();
        this._dirty = true;
        this._rebuildIfNeeded();
    }

    dispose() {
        try { clearInterval(this._scanTimer); } catch { /* ignore */ }
        this._scanTimer = null;
        this.clearAll();
        try { this._maskRT?.dispose?.(); } catch { /* ignore */ }
        this._maskRT = null;
        this._maskMeshes = [];
        try { this._maskMaterial?.dispose?.(); } catch { /* ignore */ }
        this._maskMaterial = null;
        this._texture = null;
        this.rgbTerrain = null;
        this.terrain = null;
        this.renderer = null;
    }

    // ---------------- internal ----------------

    _normalizePolygon(points) {
        const out = [];
        if (!Array.isArray(points)) return out;
        for (const p of points) {
            if (!p) continue;
            const x = Number(p.x);
            const z = Number(p.z ?? p.y);
            if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
            out.push(new THREE.Vector2(x, z));
        }
        // Remove duplicate last point if closed.
        if (out.length >= 2) {
            const a = out[0];
            const b = out[out.length - 1];
            if (Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9) out.pop();
        }
        return out;
    }

    _rebuildIfNeeded() {
        if (!this._dirty) return;
        this._dirty = false;

        if (this._surfaces.size === 0) {
            this._ensureMaskRT(1, 1);
            this._renderMaskClear();
            this._pushUniforms();
            return;
        }

        this._computeBounds();
        this._ensureMaskRTFromBounds();
        this._rebuildMaskScene();
        this._renderMask();
        this._syncTerrainMaterials(true);
        this._pushUniforms();
    }

    _computeBounds() {
        let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
        for (const s of this._surfaces.values()) {
            for (const p of s.polygonXZ) {
                if (p.x < minX) minX = p.x;
                if (p.y < minZ) minZ = p.y;
                if (p.x > maxX) maxX = p.x;
                if (p.y > maxZ) maxZ = p.y;
            }
        }
        if (!Number.isFinite(minX) || !Number.isFinite(minZ) || !Number.isFinite(maxX) || !Number.isFinite(maxZ)) {
            minX = minZ = 0;
            maxX = maxZ = 1;
        }
        // Pad a bit so edges don’t get clipped by filtering.
        const pad = 0.5;
        minX -= pad; minZ -= pad; maxX += pad; maxZ += pad;
        const w = Math.max(1e-3, maxX - minX);
        const h = Math.max(1e-3, maxZ - minZ);
        this._bounds = {
            minX,
            minZ,
            maxX,
            maxZ,
            invW: 1 / w,
            invH: 1 / h
        };
    }

    _nextPow2(v) {
        const x = Math.max(1, v | 0);
        return 1 << (32 - Math.clz32(x - 1));
    }

    _ensureMaskRTFromBounds() {
        const w = Math.max(1e-3, this._bounds.maxX - this._bounds.minX);
        const h = Math.max(1e-3, this._bounds.maxZ - this._bounds.minZ);

        // Choose a reasonable resolution: aim metersPerPixel, clamp to [256..maskMaxSize], keep square for simplicity.
        const metersPerPixel = this._maskMetersPerPixel;
        const desired = Math.ceil(Math.max(w, h) / metersPerPixel);
        const size = Math.max(256, Math.min(this._maskMaxSize, this._nextPow2(desired)));
        this._ensureMaskRT(size, size);
    }

    _ensureMaskRT(width, height) {
        const w = Math.max(1, width | 0);
        const h = Math.max(1, height | 0);
        if (this._maskRT && this._maskRT.width === w && this._maskRT.height === h) return;

        try { this._maskRT?.dispose?.(); } catch { /* ignore */ }
        this._maskRT = new THREE.WebGLRenderTarget(w, h, {
            depthBuffer: false,
            stencilBuffer: false
        });
        // WebGL2 MSAA for the mask (if supported). If not, three will ignore or clamp.
        try { this._maskRT.samples = this._maskSamples; } catch { /* ignore */ }
        this._maskRT.texture.generateMipmaps = false;
        this._maskRT.texture.minFilter = THREE.LinearFilter;
        this._maskRT.texture.magFilter = THREE.LinearFilter;
        this._maskRT.texture.wrapS = THREE.ClampToEdgeWrapping;
        this._maskRT.texture.wrapT = THREE.ClampToEdgeWrapping;
    }

    _clearMaskScene() {
        for (const m of this._maskMeshes) {
            this._maskScene.remove(m);
            m.geometry?.dispose?.();
            // materials are shared via this._maskMaterial
        }
        this._maskMeshes = [];
    }

    _rebuildMaskScene() {
        this._clearMaskScene();
        const rt = this._maskRT;
        if (!rt) return;

        const wWorld = Math.max(1e-3, this._bounds.maxX - this._bounds.minX);
        const hWorld = Math.max(1e-3, this._bounds.maxZ - this._bounds.minZ);
        const sx = rt.width / wWorld;
        const sy = rt.height / hWorld;

        // Render in pixel space: x->X, z->Y
        this._maskCam.left = 0;
        this._maskCam.right = rt.width;
        this._maskCam.top = rt.height;
        this._maskCam.bottom = 0;
        this._maskCam.near = -1;
        this._maskCam.far = 1;
        this._maskCam.updateProjectionMatrix();

        const material = this._maskMaterial;

        for (const s of this._surfaces.values()) {
            const poly = s.polygonXZ;
            if (!poly || poly.length < 3) continue;

            const verts = [];
            for (const p of poly) {
                const xPix = (p.x - this._bounds.minX) * sx;
                const yPix = (p.y - this._bounds.minZ) * sy;
                verts.push(xPix, yPix, 0);
            }
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));

            // Triangulate concave polygons; keep fast fan for convex ones.
            const indices = [];
            const useTriangulation = this._isConcavePolygon(poly);
            if (useTriangulation && THREE.ShapeUtils?.triangulateShape) {
                try {
                    const contour = poly.map(p => p.clone());
                    const faces = THREE.ShapeUtils.triangulateShape(contour, []);
                    for (const f of faces) {
                        if (!f || f.length !== 3) continue;
                        indices.push(f[0], f[1], f[2]);
                    }
                } catch {
                    // fall back to fan
                }
            }
            if (indices.length === 0) {
                for (let i = 1; i < poly.length - 1; i++) indices.push(0, i, i + 1);
            }

            geometry.setIndex(indices);

            const mesh = new THREE.Mesh(geometry, material);
            this._maskScene.add(mesh);
            this._maskMeshes.push(mesh);
        }
    }

    _renderMaskClear() {
        const r = this.renderer;
        if (!r || !this._maskRT) return;

        const prevRT = r.getRenderTarget();
        const prevClear = new THREE.Color();
        try { r.getClearColor(prevClear); } catch { /* ignore */ }
        const prevAlpha = (() => {
            try { return r.getClearAlpha(); } catch { return 1; }
        })();

        r.setRenderTarget(this._maskRT);
        r.setClearColor(0x000000, 0);
        r.clear(true, false, false);
        r.setRenderTarget(prevRT);
        try { r.setClearColor(prevClear, prevAlpha); } catch { /* ignore */ }
    }

    _renderMask() {
        const r = this.renderer;
        if (!r || !this._maskRT) return;

        const prevRT = r.getRenderTarget();
        const prevClear = new THREE.Color();
        try { r.getClearColor(prevClear); } catch { /* ignore */ }
        const prevAlpha = (() => {
            try { return r.getClearAlpha(); } catch { return 1; }
        })();

        r.setRenderTarget(this._maskRT);
        r.setClearColor(0x000000, 0);
        r.clear(true, false, false);
        r.render(this._maskScene, this._maskCam);
        r.setRenderTarget(prevRT);
        try { r.setClearColor(prevClear, prevAlpha); } catch { /* ignore */ }
    }

    _iterTerrainMaterials() {
        const tileMap = this.terrain?.tileMap;
        if (!tileMap || typeof tileMap.values !== 'function') return [];

        const out = [];
        for (const t of tileMap.values()) {
            const mesh = t?.mesh;
            if (!mesh) continue;
            const mats = Array.isArray(mesh.material) ? mesh.material : (mesh.material ? [mesh.material] : []);
            for (const mat of mats) {
                if (mat?.isMaterial) out.push(mat);
            }
        }
        return out;
    }

    _syncTerrainMaterials(force = false) {
        for (const mat of this._iterTerrainMaterials()) {
            const ud = mat.userData || (mat.userData = {});
            const hook = ud.customTerrainSurfaceOnBeforeCompile;
            if (typeof hook !== 'function' || mat.onBeforeCompile !== hook) {
                // Another system (e.g. TerrainMapAtlas) may have overwritten onBeforeCompile after we installed.
                // Re-wrap current hook so our overlay is applied last.
                this._installOnMaterial(mat);
                mat.needsUpdate = true;
            } else if (force) {
                this._pushUniformsToMaterial(mat);
            }
        }
    }

    _installOnMaterial(material) {
        if (!material?.isMaterial) return;

        material.userData = material.userData || {};
        material.userData.customTerrainSurfaceInstalled = true;

        const self = this;
        const priorOnBeforeCompile = material.onBeforeCompile;
        const priorKey = material.customProgramCacheKey;

        const hook = (shader, renderer) => {
            if (typeof priorOnBeforeCompile === 'function') priorOnBeforeCompile.call(material, shader, renderer);

            shader.uniforms.uCTS_Enabled = { value: 0 };
            shader.uniforms.uCTS_MaskTex = { value: null };
            shader.uniforms.uCTS_MaskInvSize = { value: new THREE.Vector2(1, 1) };
            shader.uniforms.uCTS_Bounds = { value: new THREE.Vector4(0, 0, 0, 0) }; // minX,minZ,invW,invH
            shader.uniforms.uCTS_Mode = { value: 0 }; // 0=color, 1=texture
            shader.uniforms.uCTS_Color = { value: new THREE.Color(0x00ff00) };
            shader.uniforms.uCTS_Opacity = { value: 0.35 };
            shader.uniforms.uCTS_EdgePx = { value: 0 };
            shader.uniforms.uCTS_Tex = { value: null };
            shader.uniforms.uCTS_TexST = { value: new THREE.Vector4(1, 1, 0, 0) }; // scale.xy, offset.xy
            shader.uniforms.uCTS_TexRot = { value: 0 };

            material.userData.customTerrainSurfaceUniforms = shader.uniforms;

            // Push current state immediately (otherwise defaults keep overlay invisible until a later update).
            try {
                const enabled = self._surfaces.size > 0 && self._maskRT?.texture;
                if (shader.uniforms.uCTS_Enabled) shader.uniforms.uCTS_Enabled.value = enabled ? 1 : 0;
                if (shader.uniforms.uCTS_MaskTex) shader.uniforms.uCTS_MaskTex.value = enabled ? self._maskRT.texture : null;
                if (shader.uniforms.uCTS_MaskInvSize?.value?.set) {
                    const iw = self._maskRT?.width ? (1 / self._maskRT.width) : 1;
                    const ih = self._maskRT?.height ? (1 / self._maskRT.height) : 1;
                    shader.uniforms.uCTS_MaskInvSize.value.set(iw, ih);
                }
                if (shader.uniforms.uCTS_Bounds?.value?.set) shader.uniforms.uCTS_Bounds.value.set(
                    self._bounds.minX,
                    self._bounds.minZ,
                    self._bounds.invW,
                    self._bounds.invH
                );
                if (shader.uniforms.uCTS_Mode) shader.uniforms.uCTS_Mode.value = (self._mode === 'texture') ? 1 : 0;
                if (shader.uniforms.uCTS_Color?.value?.copy) shader.uniforms.uCTS_Color.value.copy(self._color);
                if (shader.uniforms.uCTS_Opacity) shader.uniforms.uCTS_Opacity.value = Number.isFinite(self._opacity) ? Math.max(0, Math.min(1, self._opacity)) : 0.35;
                if (shader.uniforms.uCTS_EdgePx) shader.uniforms.uCTS_EdgePx.value = Number.isFinite(self._edgePx) ? Math.max(0, self._edgePx) : 0;
                if (shader.uniforms.uCTS_Tex) shader.uniforms.uCTS_Tex.value = (self._mode === 'texture') ? (self._texture || null) : null;
                if (shader.uniforms.uCTS_TexST?.value?.set) shader.uniforms.uCTS_TexST.value.set(self._textureScale.x, self._textureScale.y, self._textureOffset.x, self._textureOffset.y);
                if (shader.uniforms.uCTS_TexRot) shader.uniforms.uCTS_TexRot.value = Number(self._textureRotation) || 0;
            } catch {
                // ignore
            }

            const varyName = 'vCTS_WorldPos';
            if (!shader.vertexShader.includes(`varying vec3 ${varyName};`)) {
                shader.vertexShader = shader.vertexShader
                    .replace('#include <common>', `#include <common>\nvarying vec3 ${varyName};`)
                    .replace('#include <begin_vertex>', `#include <begin_vertex>\n${varyName} = (modelMatrix * vec4(position, 1.0)).xyz;`);
            }

            // Idempotency markers: switching terrain/elevation can cause multiple onBeforeCompile wrappers to stack.
            // If we inject our GLSL blocks twice into the same shader, WebGL will fail compilation due to redefinitions.
            const CTS_HEADER_MARKER = '/* CTS_v2_header */';
            const CTS_APPLY_MARKER = '/* CTS_v2_apply */';

            const header = `
${CTS_HEADER_MARKER}
uniform float uCTS_Enabled;
uniform sampler2D uCTS_MaskTex;
uniform vec2 uCTS_MaskInvSize;
uniform vec4 uCTS_Bounds;
uniform float uCTS_Mode;
uniform vec3 uCTS_Color;
uniform float uCTS_Opacity;
uniform float uCTS_EdgePx;
uniform sampler2D uCTS_Tex;
uniform vec4 uCTS_TexST;
uniform float uCTS_TexRot;
varying vec3 ${varyName};

vec2 ctsRotate(in vec2 uv, in float a) {
    float s = sin(a);
    float c = cos(a);
    uv -= 0.5;
    uv = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y);
    uv += 0.5;
    return uv;
}
`;

            if (!shader.fragmentShader.includes(CTS_HEADER_MARKER)) {
                const beforeInject = shader.fragmentShader;
                shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${header}`);
                if (shader.fragmentShader === beforeInject) {
                    shader.fragmentShader = `${header}\n${shader.fragmentShader}`;
                }
            }

            const applyOverlay = `
${CTS_APPLY_MARKER}
if (uCTS_Enabled > 0.5) {
    vec2 uv = vec2((${varyName}.x - uCTS_Bounds.x) * uCTS_Bounds.z, (${varyName}.z - uCTS_Bounds.y) * uCTS_Bounds.w);
    if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
        float m = texture2D(uCTS_MaskTex, uv).a;
        // Edge AA: soften the binary mask a little to reduce jaggies/shimmering.
        // Prefer derivatives when available; otherwise do a tiny 5-tap box filter.
        if (uCTS_EdgePx > 0.0) {
            #if defined(GL_OES_standard_derivatives) || __VERSION__ >= 300
                float w = fwidth(m) * max(1.0, uCTS_EdgePx);
                m = smoothstep(0.5 - w, 0.5 + w, m);
            #else
                vec2 duv = uCTS_MaskInvSize * uCTS_EdgePx;
                float m1 = texture2D(uCTS_MaskTex, uv + vec2( duv.x, 0.0)).a;
                float m2 = texture2D(uCTS_MaskTex, uv + vec2(-duv.x, 0.0)).a;
                float m3 = texture2D(uCTS_MaskTex, uv + vec2(0.0,  duv.y)).a;
                float m4 = texture2D(uCTS_MaskTex, uv + vec2(0.0, -duv.y)).a;
                m = 0.2 * (m + m1 + m2 + m3 + m4);
                m = smoothstep(0.25, 0.75, m);
            #endif
        }
        if (m > 0.001) {
            float a = clamp(m * uCTS_Opacity, 0.0, 1.0);
            vec3 over = uCTS_Color;
            if (uCTS_Mode > 0.5) {
                vec2 tuv = ctsRotate(uv * uCTS_TexST.xy + uCTS_TexST.zw, uCTS_TexRot);
                vec4 tc = texture2D(uCTS_Tex, tuv);
                if (tc.a <= 0.001) a = 0.0;
                else {
                    over = tc.rgb;
                    a *= tc.a;
                }
            }
            // Apply at the very end (after tone mapping/encoding) so TerrainMapAtlas can't cover it.
            gl_FragColor.rgb = mix(gl_FragColor.rgb, over, a);
        }
    }
}
`;

            // Apply as late as possible: right before dithering (at this point gl_FragColor already exists).
            if (!shader.fragmentShader.includes(CTS_APPLY_MARKER)) {
                if (shader.fragmentShader.includes('#include <dithering_fragment>')) {
                    shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `${applyOverlay}\n#include <dithering_fragment>`);
                } else if (shader.fragmentShader.includes('#include <output_fragment>')) {
                    shader.fragmentShader = shader.fragmentShader.replace('#include <output_fragment>', `#include <output_fragment>\n${applyOverlay}`);
                } else {
                    shader.fragmentShader += `\n${applyOverlay}\n`;
                }
            }
        };

        material.onBeforeCompile = hook;
        material.userData.customTerrainSurfaceOnBeforeCompile = hook;

        material.customProgramCacheKey = function () {
            const base = typeof priorKey === 'function' ? String(priorKey.call(this)) : '';
            return base.includes('|cts_v2') ? base : `${base}|cts_v2`;
        };

        this._pushUniformsToMaterial(material);
    }

    _pushUniforms() {
        this._syncTerrainMaterials(true);
    }

    _pushUniformsToMaterial(material) {
        const u = material?.userData?.customTerrainSurfaceUniforms;
        if (!u) return;

        const enabled = this._surfaces.size > 0 && this._maskRT?.texture;
        if (u.uCTS_Enabled) u.uCTS_Enabled.value = enabled ? 1 : 0;
        if (u.uCTS_MaskTex) u.uCTS_MaskTex.value = enabled ? this._maskRT.texture : null;
        if (u.uCTS_MaskInvSize?.value?.set) {
            const iw = this._maskRT?.width ? (1 / this._maskRT.width) : 1;
            const ih = this._maskRT?.height ? (1 / this._maskRT.height) : 1;
            u.uCTS_MaskInvSize.value.set(iw, ih);
        }
        if (u.uCTS_Bounds?.value?.set) u.uCTS_Bounds.value.set(
            this._bounds.minX,
            this._bounds.minZ,
            this._bounds.invW,
            this._bounds.invH
        );
        if (u.uCTS_Mode) u.uCTS_Mode.value = (this._mode === 'texture') ? 1 : 0;
        if (u.uCTS_Color?.value?.copy) u.uCTS_Color.value.copy(this._color);
        if (u.uCTS_Opacity) u.uCTS_Opacity.value = Number.isFinite(this._opacity) ? Math.max(0, Math.min(1, this._opacity)) : 0.35;
        if (u.uCTS_EdgePx) u.uCTS_EdgePx.value = Number.isFinite(this._edgePx) ? Math.max(0, this._edgePx) : 0;
        if (u.uCTS_Tex) u.uCTS_Tex.value = (this._mode === 'texture') ? (this._texture || null) : null;
        if (u.uCTS_TexST?.value?.set) u.uCTS_TexST.value.set(this._textureScale.x, this._textureScale.y, this._textureOffset.x, this._textureOffset.y);
        if (u.uCTS_TexRot) u.uCTS_TexRot.value = Number(this._textureRotation) || 0;
    }

    _isConcavePolygon(poly) {
        if (!Array.isArray(poly) || poly.length < 4) return false;

        const eps = 1e-12;
        let sign = 0;
        const n = poly.length;

        for (let i = 0; i < n; i++) {
            const a = poly[(i + n - 1) % n];
            const b = poly[i];
            const c = poly[(i + 1) % n];

            const abx = b.x - a.x;
            const aby = b.y - a.y;
            const bcx = c.x - b.x;
            const bcy = c.y - b.y;
            const cross = abx * bcy - aby * bcx;

            if (Math.abs(cross) < eps) continue;
            const s = cross > 0 ? 1 : -1;
            if (sign === 0) sign = s;
            else if (sign !== s) return true;
        }

        return false;
    }
}

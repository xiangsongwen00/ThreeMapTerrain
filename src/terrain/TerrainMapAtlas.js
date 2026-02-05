import * as THREE from 'three';
import { distancePointToRect, nextPow2 } from '../math/math.js';

export class TerrainMapAtlas {
    constructor(terrain) {
        this.terrain = terrain;
        this._state = { byZoom: new Map(), lastUpdate: 0, pendingCellSizeByZoom: new Map() };
        this._debug = { last: 0 };
        // Internal defaults (keep external config minimal for now).
        this._opts = {
            mapDrapeAtlasFilter: 'linear',
            mapDrapeAtlasMipmaps: true,
            mapDrapeAtlasAnisotropy: 16,
            mapDrapeAtlasSmoothness: 0.7,
            mapDrapeAtlasSmoothRadiusPx: 2,
            mapDrapeAtlasMaxNewLoadsPerTick: 32,
            mapDrapeAtlasOuterRingTiles: 1
        };
    }

    _tiles() {
        return this.terrain?.imageryTilesAtlas || this.terrain?.imageryTiles || null;
    }

    _tileScheme() {
        return String(this.terrain?.tileConfig?.mapYtype ?? 'xyz').toLowerCase();
    }

    _tileKey(z, x, y) {
        const scheme = this._tileScheme();
        return `t:${scheme}:${z}-${x}-${y}`;
    }

    installOnMaterial(material) {
        if (!material?.isMaterial) return;
        if (!material.map) return;

        const enabled = this.terrain?.config?.mapDrapeShaderPatchEnabled === true;
        if (!enabled) return;

        material.userData = material.userData || {};
        if (material.userData.mapAtlasInstalled === true) return;

        const priorOnBeforeCompile = material.onBeforeCompile;
        const priorKey = material.customProgramCacheKey;
        material.userData.mapAtlasPrevOnBeforeCompile = priorOnBeforeCompile;
        material.userData.mapAtlasPrevCustomProgramCacheKey = priorKey;

        material.onBeforeCompile = (shader, renderer) => {
            if (typeof priorOnBeforeCompile === 'function') priorOnBeforeCompile.call(material, shader, renderer);

            try {
                if (this.terrain?.renderer?.debug) this.terrain.renderer.debug.checkShaderErrors = true;
            } catch {
                // ignore
            }

            shader.uniforms.uMapAtlasEnabled = { value: 0 };
            shader.uniforms.uMapAtlasCenterMercator = {
                value: new THREE.Vector2(
                    Number(this.terrain?.proj?.centerMercator?.x ?? 0),
                    Number(this.terrain?.proj?.centerMercator?.y ?? 0)
                )
            };

            shader.uniforms.uMapAtlasTex15 = { value: null };
            shader.uniforms.uMapAtlasTex16 = { value: null };
            shader.uniforms.uMapAtlasTex17 = { value: null };
            shader.uniforms.uMapAtlasTex18 = { value: null };
            shader.uniforms.uMapAtlasGrid15 = { value: new THREE.Vector4(0, 0, 0, 0) };
            shader.uniforms.uMapAtlasGrid16 = { value: new THREE.Vector4(0, 0, 0, 0) };
            shader.uniforms.uMapAtlasGrid17 = { value: new THREE.Vector4(0, 0, 0, 0) };
            shader.uniforms.uMapAtlasGrid18 = { value: new THREE.Vector4(0, 0, 0, 0) };
            shader.uniforms.uMapAtlasOriginLocal15 = { value: new THREE.Vector2(0, 0) };
            shader.uniforms.uMapAtlasOriginLocal16 = { value: new THREE.Vector2(0, 0) };
            shader.uniforms.uMapAtlasOriginLocal17 = { value: new THREE.Vector2(0, 0) };
            shader.uniforms.uMapAtlasOriginLocal18 = { value: new THREE.Vector2(0, 0) };
            shader.uniforms.uMapAtlasInvCell15 = { value: 0 };
            shader.uniforms.uMapAtlasInvCell16 = { value: 0 };
            shader.uniforms.uMapAtlasInvCell17 = { value: 0 };
            shader.uniforms.uMapAtlasInvCell18 = { value: 0 };
            shader.uniforms.uMapAtlasSmoothness = { value: 0 };
            shader.uniforms.uMapAtlasSmoothRadiusPx = { value: 1 };
            shader.uniforms.uSceneMetersPerUnit = { value: 1 };

            material.userData.mapAtlasUniforms = shader.uniforms;

            const varyName = 'vMapAtlasWorldPos';
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', `#include <common>\nvarying vec3 ${varyName};`)
                .replace('#include <begin_vertex>', `#include <begin_vertex>\n${varyName} = (modelMatrix * vec4(position, 1.0)).xyz;`);

            const header = `
uniform float uMapAtlasEnabled;
uniform vec2 uMapAtlasCenterMercator;
uniform sampler2D uMapAtlasTex15;
uniform sampler2D uMapAtlasTex16;
uniform sampler2D uMapAtlasTex17;
uniform sampler2D uMapAtlasTex18;
uniform vec4 uMapAtlasGrid15;
uniform vec4 uMapAtlasGrid16;
uniform vec4 uMapAtlasGrid17;
uniform vec4 uMapAtlasGrid18;
uniform vec2 uMapAtlasOriginLocal15;
uniform vec2 uMapAtlasOriginLocal16;
uniform vec2 uMapAtlasOriginLocal17;
uniform vec2 uMapAtlasOriginLocal18;
 uniform float uMapAtlasInvCell15;
 uniform float uMapAtlasInvCell16;
 uniform float uMapAtlasInvCell17;
 uniform float uMapAtlasInvCell18;
 uniform float uMapAtlasSmoothness;
 uniform float uMapAtlasSmoothRadiusPx;
 uniform float uSceneMetersPerUnit;
 varying vec3 ${varyName};

const float MAP_ATLAS_PI = 3.1415926535897932384626433832795;
const float MAP_ATLAS_R = 6378137.0;
const float MAP_ATLAS_WORLD = 2.0 * MAP_ATLAS_PI * MAP_ATLAS_R;

vec4 sampleMapAtlas(in sampler2D tex, in vec4 grid, in vec2 originLocal, in float invCell, in float z, in vec3 wpos) {
    // 0..1 alpha in the atlas render target is used as a "tile-present" mask.
    // Mipmapping/linear filtering can introduce fractional alpha near tile borders; treat small values as "missing"
    // to avoid discard/halo artifacts at LOD boundaries.
    const float ALPHA_CUTOFF = 0.25;

    float gridSize = grid.z;
    if (gridSize < 0.5) return vec4(0.0);
    float invGrid = grid.w;

    // NOTE: Avoid uNorm * exp2(z) at high zoom levels. It loses too much fractional precision
    // in 32-bit floats and causes blocky intra-tile UVs.
    // Instead compute in local-mercator meters relative to the atlas grid origin so the working numbers stay small.
    float tileSizeMeters = MAP_ATLAS_WORLD * exp2(-z);
    float mx = wpos.x * uSceneMetersPerUnit;
    float mz = wpos.z * uSceneMetersPerUnit;
    float tx = (mx - originLocal.x) / tileSizeMeters;
    float ty = (originLocal.y + mz) / tileSizeMeters;

    float dx = floor(tx);
    float dy = floor(ty);

    float fu = fract(tx);
    float fv = fract(ty);

    // Avoid sampling across tile borders (reduces visible grid/seams at oblique angles).
    // If smoothing is enabled we also keep an extra border so blur taps won't cross into neighbors.
    float rpx = max(0.0, uMapAtlasSmoothRadiusPx);
    float eps = (0.5 + (uMapAtlasSmoothness > 0.0 ? rpx : 0.0)) * invCell;
    fu = clamp(fu, eps, 1.0 - eps);
    fv = clamp(fv, eps, 1.0 - eps);

    if (dx < 0.0 || dy < 0.0 || dx >= gridSize || dy >= gridSize) return vec4(0.0);

    float atlasU = (dx + fu) * invGrid;
    float atlasV = 1.0 - ((dy + fv) * invGrid);
    vec2 uv = vec2(atlasU, atlasV);

    vec4 c0 = texture2D(tex, uv);
    if (c0.a <= ALPHA_CUTOFF) return vec4(0.0);

    // If the sample is affected by filtering against transparent pixels, un-premultiply (atlas is cleared to black).
    if (c0.a < 0.999) c0.rgb /= max(c0.a, 1e-6);
    c0.a = 1.0;

    if (uMapAtlasSmoothness <= 0.0) return c0;

    // Light edge-aware blur in *tile pixel* space to hide macroblock/pixelation when magnifying 256px tiles.
    // Step in atlas UV for 1 tile pixel:
    float s = invGrid * invCell * rpx;
    vec2 du = vec2(s, 0.0);
    vec2 dv = vec2(0.0, s);

    vec4 c1 = texture2D(tex, uv - du);
    vec4 c2 = texture2D(tex, uv + du);
    vec4 c3 = texture2D(tex, uv - dv);
    vec4 c4 = texture2D(tex, uv + dv);
    vec4 c5 = texture2D(tex, uv - du - dv);
    vec4 c6 = texture2D(tex, uv + du - dv);
    vec4 c7 = texture2D(tex, uv - du + dv);
    vec4 c8 = texture2D(tex, uv + du + dv);

    float k = 40.0; // higher => preserve edges more
    float w0 = 4.0;
    vec4 sum = c0 * w0;
    float wsum = w0;

    vec3 d1 = c1.rgb - c0.rgb; float w1 = 2.0 * exp(-dot(d1, d1) * k); sum += c1 * w1; wsum += w1;
    vec3 d2 = c2.rgb - c0.rgb; float w2 = 2.0 * exp(-dot(d2, d2) * k); sum += c2 * w2; wsum += w2;
    vec3 d3 = c3.rgb - c0.rgb; float w3 = 2.0 * exp(-dot(d3, d3) * k); sum += c3 * w3; wsum += w3;
    vec3 d4 = c4.rgb - c0.rgb; float w4 = 2.0 * exp(-dot(d4, d4) * k); sum += c4 * w4; wsum += w4;

    vec3 d5 = c5.rgb - c0.rgb; float w5 = 1.0 * exp(-dot(d5, d5) * k); sum += c5 * w5; wsum += w5;
    vec3 d6 = c6.rgb - c0.rgb; float w6 = 1.0 * exp(-dot(d6, d6) * k); sum += c6 * w6; wsum += w6;
    vec3 d7 = c7.rgb - c0.rgb; float w7 = 1.0 * exp(-dot(d7, d7) * k); sum += c7 * w7; wsum += w7;
    vec3 d8 = c8.rgb - c0.rgb; float w8 = 1.0 * exp(-dot(d8, d8) * k); sum += c8 * w8; wsum += w8;

    vec4 blur = sum / max(wsum, 1e-6);
    vec4 c = mix(c0, blur, clamp(uMapAtlasSmoothness, 0.0, 1.0));
    if (c.a <= ALPHA_CUTOFF) return vec4(0.0);
    if (c.a < 0.999) c.rgb /= max(c.a, 1e-6);
    c.a = 1.0;
    return c;
}
`;

            const injected = `\n${header}\n`;

            const beforeInject = shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace('#include <map_pars_fragment>', `#include <map_pars_fragment>\n${injected}`);
            if (shader.fragmentShader === beforeInject) {
                shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${injected}`);
            }

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <map_fragment>',
                `#include <map_fragment>
 #ifdef USE_MAP
     if (uMapAtlasEnabled > 0.5) {
        vec4 atlasColor = sampleMapAtlas(uMapAtlasTex18, uMapAtlasGrid18, uMapAtlasOriginLocal18, uMapAtlasInvCell18, 18.0, ${varyName});
        if (atlasColor.a <= 0.0) atlasColor = sampleMapAtlas(uMapAtlasTex17, uMapAtlasGrid17, uMapAtlasOriginLocal17, uMapAtlasInvCell17, 17.0, ${varyName});
        if (atlasColor.a <= 0.0) atlasColor = sampleMapAtlas(uMapAtlasTex16, uMapAtlasGrid16, uMapAtlasOriginLocal16, uMapAtlasInvCell16, 16.0, ${varyName});
        if (atlasColor.a <= 0.0) atlasColor = sampleMapAtlas(uMapAtlasTex15, uMapAtlasGrid15, uMapAtlasOriginLocal15, uMapAtlasInvCell15, 15.0, ${varyName});
        if (atlasColor.a > 0.0) {
            diffuseColor.rgb = atlasColor.rgb;
        }
    }
#endif`
            );
        };

        material.customProgramCacheKey = function () {
            const base = typeof priorKey === 'function' ? String(priorKey.call(this)) : '';
            return `${base}|mapAtlas-v7`;
        };

        material.userData.mapAtlasInstalled = true;
        material.needsUpdate = true;
    }

    disableOnAllMaterials() {
        const tileMap = this.terrain?.tileMap;
        if (!tileMap?.size) return;
        for (const t of tileMap.values()) {
            const mesh = t?.mesh;
            const mats = Array.isArray(mesh?.material) ? mesh.material : (mesh?.material ? [mesh.material] : []);
            for (const mat of mats) {
                if (!mat?.isMaterial) continue;
                const ud = mat.userData;
                if (!ud?.mapAtlasInstalled) continue;
                if (ud.mapAtlasPrevOnBeforeCompile !== undefined) mat.onBeforeCompile = ud.mapAtlasPrevOnBeforeCompile;
                if (ud.mapAtlasPrevCustomProgramCacheKey !== undefined) mat.customProgramCacheKey = ud.mapAtlasPrevCustomProgramCacheKey;
                delete ud.mapAtlasUniforms;
                delete ud.mapAtlasInstalled;
                delete ud.mapAtlasPrevOnBeforeCompile;
                delete ud.mapAtlasPrevCustomProgramCacheKey;
                mat.needsUpdate = true;
            }
        }
    }

    clear() {
        const atlas = this._state;
        if (atlas?.byZoom) {
            const tiles = this._tiles();
            for (const z of atlas.byZoom.keys()) {
                const st = atlas.byZoom.get(z);
                if (st?.activeKeys?.size) {
                    if (tiles) for (const key of st.activeKeys) tiles.unpin?.(key);
                }
                try { st?.rt?.dispose?.(); } catch {}
            }
        }
        this._state = { byZoom: new Map(), lastUpdate: 0, pendingCellSizeByZoom: new Map() };
        this._setUniforms(false);
    }

    update(camera) {
        const cfg = this.terrain?.config || {};
        const proj = this.terrain?.proj;
        const toUnits = (v) => (proj?.metersToUnits ? proj.metersToUnits(v) : Number(v));
        const toMeters = (v) => (proj?.unitsToMeters ? proj.unitsToMeters(v) : Number(v));
        const enabled = cfg.mapDrapeShaderPatchEnabled === true;
        if (!enabled) {
            if (this._state?.byZoom?.size) this.clear();
            this.disableOnAllMaterials();
            return;
        }

        try {
            camera?.updateMatrixWorld?.(true);
        } catch {
            // ignore
        }

        const enableBelowOrEqualHeight = Number.isFinite(cfg.mapDrapeEnableBelowOrEqualHeightMeters)
            ? cfg.mapDrapeEnableBelowOrEqualHeightMeters
            : null;
        const radiusMeters = Number.isFinite(cfg.mapDrapeNearMeters) ? cfg.mapDrapeNearMeters : 1100;
        const updateMs = Number.isFinite(cfg.mapDrapePatchUpdateMs) ? cfg.mapDrapePatchUpdateMs : 250;

        const atlas = this._state;

        const camMerc = proj?.threeToMercator?.(camera.position) ?? null;
        const groundHeightAtCam = (camMerc && Number.isFinite(camMerc.x) && Number.isFinite(camMerc.y))
            ? (this.terrain?.getElevationAtMercator?.(camMerc.x, camMerc.y) ?? null)
            : (this.terrain?.sampleHeightAtWorld?.(camera.position.x, camera.position.z, 'heightmap') ?? null);
        const cameraHeightUnits = (Number(camera.position.y) - (Number.isFinite(groundHeightAtCam) ? Number(groundHeightAtCam) : 0));
        const cameraHeight = toMeters(cameraHeightUnits);

        if (enableBelowOrEqualHeight !== null && cameraHeight > enableBelowOrEqualHeight) {
            if (atlas.byZoom.size) this.clear();
            // this._debugLog({
            //     mode: 'shader-off',
            //     cameraY: Number(camera.position.y),
            //     groundY: Number.isFinite(groundHeightAtCam) ? Number(groundHeightAtCam) : null,
            //     cameraHeight,
            //     threshold: enableBelowOrEqualHeight,
            //     nearMeters: radiusMeters,
            //     tiles: this.terrain?.tileMap?.size ?? 0
            // });
            return;
        }

        const now = this._now();
        if ((now - (atlas.lastUpdate || 0)) < updateMs) return;
        atlas.lastUpdate = now;

        if (!camMerc || !Number.isFinite(camMerc.x) || !Number.isFinite(camMerc.y)) return;

        // New default: view-trapezoid, angle-aware LOD (quadtree refine by screen-space error).
        // Old band-based radial logic is still available by setting `mapDrapeLodMode: "bands"`.
        const lodMode = String(cfg.mapDrapeLodMode ?? 'trapezoid');
        if (lodMode !== 'bands') {
            const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

            const WORLD = 2 * Math.PI * 6378137;
            const MAX_ATLAS_ZOOM = 18;
            const maxMapZoomCfg = Number.isFinite(this.terrain?.tileConfig?.maxMapZoom) ? (this.terrain.tileConfig.maxMapZoom | 0) : MAX_ATLAS_ZOOM;
            const atlasMaxZoom = Math.max(15, Math.min(MAX_ATLAS_ZOOM, maxMapZoomCfg));

            // Camera pitch (0 = horizontal, -90 = straight down).
            const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
            const fwdHoriz = Math.sqrt(fwd.x * fwd.x + fwd.z * fwd.z);
            const downTiltDeg = THREE.MathUtils.radToDeg(Math.atan2(-fwd.y, fwdHoriz));
            const pitchDeg = -downTiltDeg;
            const tiltFromVerticalDeg = clamp(90 - downTiltDeg, 0, 90);

            const bands = Array.isArray(cfg.mapDrapePatchBands) ? cfg.mapDrapePatchBands : null;
            let topZoomCfg = 15;
            if (bands) {
                for (const b of bands) {
                    const z = Number(b?.zoom);
                    if (Number.isFinite(z)) topZoomCfg = Math.max(topZoomCfg, z | 0);
                }
            } else {
                topZoomCfg = atlasMaxZoom;
            }
            topZoomCfg = clamp(topZoomCfg | 0, 15, atlasMaxZoom);

            // Viewport resolution (for screen-space LOD).
            const renderer = this.terrain?.renderer;
            const cssH = Number(renderer?.domElement?.clientHeight) || 0;
            let dpr = 1;
            try {
                dpr = Number(renderer?.getPixelRatio?.() ?? 1) || 1;
            } catch {
                // ignore
            }
            const viewportH = (cssH > 0 ? cssH * dpr : 720);

            const planeBelowGroundCfg = Number.isFinite(cfg.mapDrapeViewportPlaneBelowGroundMeters)
                ? Math.max(0, Number(cfg.mapDrapeViewportPlaneBelowGroundMeters))
                : null;
            const planeBelowGroundMeters = planeBelowGroundCfg !== null
                ? planeBelowGroundCfg
                : (Number.isFinite(cameraHeight) && cameraHeight > 0 ? Math.min(500, Math.max(0, cameraHeight * 0.25)) : 0);
            const planeBelowGround = toUnits(planeBelowGroundMeters);
            const planeY = (Number.isFinite(groundHeightAtCam) ? Number(groundHeightAtCam) : 0) - planeBelowGround;

            // Raycast to terrain if possible, fall back to a horizontal plane otherwise.
            const terrainGroup = this.terrain?.terrainGroup;
            try { terrainGroup?.updateMatrixWorld?.(true); } catch {}
            const raycaster = this._mapDrapeAtlasRaycaster || (this._mapDrapeAtlasRaycaster = new THREE.Raycaster());
            const ndcV2 = this._mapDrapeAtlasNdc || (this._mapDrapeAtlasNdc = new THREE.Vector2());

            const _groundHitAtNdc = (nx, ny) => {
                if (!camera) return null;
                ndcV2.set(nx, ny);
                raycaster.setFromCamera(ndcV2, camera);

                if (terrainGroup) {
                    const hits = raycaster.intersectObject(terrainGroup, true);
                    if (hits?.length) {
                        for (const h of hits) {
                            const obj = h?.object;
                            if (obj?.userData?.isEditPatch) continue;
                            if (h?.point?.isVector3) return h.point.clone();
                        }
                    }
                }

                const o = raycaster.ray.origin;
                const d = raycaster.ray.direction;
                const dy = d.y;
                if (!Number.isFinite(dy) || Math.abs(dy) < 1e-9) return null;
                const t = (planeY - o.y) / dy;
                if (!Number.isFinite(t) || t <= 0) return null;
                return o.clone().addScaledVector(d, t);
            };

            const centerHit = _groundHitAtNdc(0, 0);
            const centerDistUnits = (centerHit && centerHit.isVector3) ? camera.position.distanceTo(centerHit) : null;
            const centerDist = (Number.isFinite(centerDistUnits) ? toMeters(centerDistUnits) : null);

            // Auto cap on top zoom: use the camera->terrain intersection distance (not just height).
            const topZoomByView = (() => {
                if (cfg.mapDrapeAutoMaxZoomEnabled === false) return null;
                if (!Number.isFinite(viewportH) || viewportH <= 0) return null;

                let metersPerPixel = null;
                if (camera?.isOrthographicCamera === true) {
                    const frustumHUnits = Math.abs(Number(camera.top) - Number(camera.bottom));
                    const frustumH = toMeters(frustumHUnits);
                    if (Number.isFinite(frustumH) && frustumH > 0) metersPerPixel = frustumH / viewportH;
                } else {
                    const fovRad = THREE.MathUtils.degToRad(Number(camera?.fov) || 0);
                    if (!Number.isFinite(fovRad) || fovRad <= 1e-6 || fovRad >= (Math.PI - 1e-6)) return null;

                    // Prefer the real intersection distance; if not available, approximate by height/sin(tilt).
                    let depth = (Number.isFinite(centerDist) && centerDist > 0) ? centerDist : null;
                    if (depth === null && Number.isFinite(cameraHeight) && cameraHeight > 0) {
                        const rad = THREE.MathUtils.degToRad(Math.max(1, downTiltDeg));
                        const s = Math.sin(rad);
                        if (Number.isFinite(s) && s > 1e-3) depth = cameraHeight / s;
                    }
                    if (depth === null || !Number.isFinite(depth) || depth <= 0) return null;

                    metersPerPixel = (2 * depth * Math.tan(fovRad / 2)) / viewportH;
                }
                if (!Number.isFinite(metersPerPixel) || metersPerPixel <= 0) return null;

                const z = Math.ceil(Math.log2(WORLD / (256 * metersPerPixel)));
                if (!Number.isFinite(z)) return null;
                return clamp(z | 0, 15, atlasMaxZoom);
            })();

            let topZoom = topZoomCfg;
            if (topZoomByView !== null) topZoom = Math.min(topZoom, topZoomByView);

            // Use distance-based refinement across the full configured zoom span.
            // Keep the floor at `mapDrapeBaseZoom` so far tiles don't explode in count when the view is vertical.
            const baseZoomCfg = Number.isFinite(cfg.mapDrapeBaseZoom)
                ? (cfg.mapDrapeBaseZoom | 0)
                : (Number.isFinite(this.terrain?.tileConfig?.mapDrapeBaseZoom) ? (this.terrain.tileConfig.mapDrapeBaseZoom | 0) : 15);
            const minZoom = clamp(baseZoomCfg, 15, topZoom);
            const lodLevels = Math.max(1, (topZoom - minZoom + 1));

            const maxNewLoadsPerTick = Math.max(0, this._opts.mapDrapeAtlasMaxNewLoadsPerTick | 0);
            const wantsMipmaps = this._opts.mapDrapeAtlasMipmaps === true;

            const stats = { selected: 0, candidates: 0, frustumPassed: 0, nearPassed: 0, totalConsidered: 0, refined: 0 };
            const frustum = new THREE.Frustum();
            const projScreen = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
            frustum.setFromProjectionMatrix(projScreen);

            const viewportPadTiles = Number.isFinite(cfg.mapDrapeViewportPadTiles)
                ? Math.max(0, cfg.mapDrapeViewportPadTiles | 0)
                : (Number.isFinite(this.terrain?.tileConfig?.mapDrapeViewportPadTiles)
                    ? Math.max(0, this.terrain.tileConfig.mapDrapeViewportPadTiles | 0)
                    : 1);

            // Shallow views can project a *huge* ground footprint (near-horizontal rays). Cap the patch range
            // to avoid exploding tile counts / crashing. User requested: tiltFromVerticalDeg >= 60 => 5km cap.
            const shallowRangeMinTiltDeg = Number.isFinite(cfg.mapDrapeShallowMaxRangeMinTiltDeg)
                ? Number(cfg.mapDrapeShallowMaxRangeMinTiltDeg)
                : 60;
            const shallowRangeMeters = Number.isFinite(cfg.mapDrapeShallowMaxMeters)
                ? Math.max(100, Number(cfg.mapDrapeShallowMaxMeters))
                : 5000;
            const baseRangeMeters = Math.max(1, Number(radiusMeters) || 1);
            const maxRangeMeters = (tiltFromVerticalDeg >= shallowRangeMinTiltDeg) ? shallowRangeMeters : baseRangeMeters;

            const viewportMercBounds = (() => {
                if (!proj?.centerMercator) return null;

                const ndc = [
                    [-1, -1],
                    [1, -1],
                    [-1, 1],
                    [1, 1]
                ];

                const mercPts = [];
                for (const [nx, ny] of ndc) {
                    const p = _groundHitAtNdc(nx, ny);
                    if (!p) continue;
                    const mx = proj.centerMercator.x + toMeters(p.x);
                    const my = proj.centerMercator.y - toMeters(p.z);
                    if (!Number.isFinite(mx) || !Number.isFinite(my)) continue;
                    mercPts.push({ x: mx, y: my });
                }

                if (mercPts.length < 2) {
                    // Fallback: use a conservative square around the camera in mercator meters.
                    const r = maxRangeMeters;
                    return {
                        minX: camMerc.x - r,
                        minY: camMerc.y - r,
                        maxX: camMerc.x + r,
                        maxY: camMerc.y + r,
                        planeY,
                        planeBelowGround,
                        mercPts: mercPts.length,
                        maxRangeMeters: r
                    };
                }

                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                for (const p of mercPts) {
                    if (p.x < minX) minX = p.x;
                    if (p.y < minY) minY = p.y;
                    if (p.x > maxX) maxX = p.x;
                    if (p.y > maxY) maxY = p.y;
                }
                if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return null;
                // Clamp to a camera-centered max range so near-horizontal views don't create massive bounds.
                const r = maxRangeMeters;
                const minXR = camMerc.x - r;
                const maxXR = camMerc.x + r;
                const minYR = camMerc.y - r;
                const maxYR = camMerc.y + r;
                minX = Math.max(minX, minXR);
                maxX = Math.min(maxX, maxXR);
                minY = Math.max(minY, minYR);
                maxY = Math.min(maxY, maxYR);
                if (maxX < minX || maxY < minY) {
                    minX = minXR;
                    maxX = maxXR;
                    minY = minYR;
                    maxY = maxYR;
                }
                return { minX, minY, maxX, maxY, planeY, planeBelowGround, mercPts: mercPts.length, maxRangeMeters: r };
            })();

            const viewportTileBounds = (() => {
                if (!viewportMercBounds) return null;
                const z = minZoom;
                const corners = [
                    { x: viewportMercBounds.minX, y: viewportMercBounds.minY },
                    { x: viewportMercBounds.minX, y: viewportMercBounds.maxY },
                    { x: viewportMercBounds.maxX, y: viewportMercBounds.minY },
                    { x: viewportMercBounds.maxX, y: viewportMercBounds.maxY }
                ];

                let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
                for (const c of corners) {
                    const txy = this._mercatorToTileXY(c.x, c.y, z);
                    if (!txy) return null;
                    if (txy.x < xMin) xMin = txy.x;
                    if (txy.y < yMin) yMin = txy.y;
                    if (txy.x > xMax) xMax = txy.x;
                    if (txy.y > yMax) yMax = txy.y;
                }
                if (!Number.isFinite(xMin) || !Number.isFinite(yMin) || !Number.isFinite(xMax) || !Number.isFinite(yMax)) return null;

                const n = 1 << z;
                const pad = viewportPadTiles;
                const cl = (v) => Math.max(0, Math.min(n - 1, v | 0));
                xMin = cl(xMin - pad);
                yMin = cl(yMin - pad);
                xMax = cl(xMax + pad);
                yMax = cl(yMax + pad);
                if (xMax < xMin || yMax < yMin) return null;
                return { xMin, yMin, xMax, yMax };
            })();

            const zoomErrorScale = Number.isFinite(cfg.mapDrapeLodErrorScale) ? Math.max(0.25, Number(cfg.mapDrapeLodErrorScale)) : 1.0;

            const desiredZoomForDistance = (distMeters) => {
                const d = Math.max(1, Number(distMeters) || 1);
                let metersPerPixel = null;
                if (camera?.isOrthographicCamera === true) {
                    const frustumHUnits = Math.abs(Number(camera.top) - Number(camera.bottom));
                    const frustumH = toMeters(frustumHUnits);
                    if (Number.isFinite(frustumH) && frustumH > 0) metersPerPixel = frustumH / viewportH;
                } else {
                    const fovRad = THREE.MathUtils.degToRad(Number(camera?.fov) || 0);
                    if (Number.isFinite(fovRad) && fovRad > 1e-6 && fovRad < (Math.PI - 1e-6)) {
                        metersPerPixel = (2 * d * Math.tan(fovRad / 2)) / viewportH;
                    }
                }
                if (!Number.isFinite(metersPerPixel) || metersPerPixel <= 0) return minZoom;
                metersPerPixel *= zoomErrorScale;
                const z = Math.ceil(Math.log2(WORLD / (256 * metersPerPixel)));
                if (!Number.isFinite(z)) return minZoom;
                return clamp(z | 0, minZoom, topZoom);
            };

            const distanceToTile3D = (boundsMerc) => {
                if (!boundsMerc?.min || !boundsMerc?.max || !proj?.centerMercator) return Infinity;
                const west = Math.min(boundsMerc.min.x, boundsMerc.max.x);
                const east = Math.max(boundsMerc.min.x, boundsMerc.max.x);
                const south = Math.min(boundsMerc.min.y, boundsMerc.max.y);
                const north = Math.max(boundsMerc.min.y, boundsMerc.max.y);

                const mx = clamp(camMerc.x, west, east);
                const my = clamp(camMerc.y, south, north);
                const wx = toUnits(mx - proj.centerMercator.x);
                const wz = toUnits(proj.centerMercator.y - my);
                const wy0 = this.terrain?.sampleHeightAtWorld?.(wx, wz, 'heightmap');
                const wy = Number.isFinite(wy0) ? Number(wy0) : (Number.isFinite(groundHeightAtCam) ? Number(groundHeightAtCam) : 0);

                const dx = wx - camera.position.x;
                const dy = wy - camera.position.y;
                const dz = wz - camera.position.z;
                const dUnits = Math.hypot(dx, dy, dz);
                return Number.isFinite(dUnits) ? toMeters(dUnits) : Infinity;
            };

            // Build a view-trapezoid LOD set (tiles always cover the view; refinement uses true 3D distance).
            const tilesByZoom = new Map();
            const stack = [];

            if (viewportTileBounds) {
                for (let tileY = viewportTileBounds.yMin; tileY <= viewportTileBounds.yMax; tileY++) {
                    for (let tileX = viewportTileBounds.xMin; tileX <= viewportTileBounds.xMax; tileX++) {
                        stack.push({ tileX, tileY, z: minZoom });
                    }
                }
            } else {
                // Fallback: around camera at `minZoom`
                const n = 1 << minZoom;
                const center = this._mercatorToTileXY(camMerc.x, camMerc.y, minZoom);
                if (center) {
                    const tileSizeMeters = WORLD / n;
                    const span = Math.max(1, Math.ceil(radiusMeters / tileSizeMeters) + 1);
                    const xMin = Math.max(0, center.x - span);
                    const xMax = Math.min(n - 1, center.x + span);
                    const yMin = Math.max(0, center.y - span);
                    const yMax = Math.min(n - 1, center.y + span);
                    for (let tileY = yMin; tileY <= yMax; tileY++) {
                        for (let tileX = xMin; tileX <= xMax; tileX++) stack.push({ tileX, tileY, z: minZoom });
                    }
                }
            }

            const maxLeafTiles = Number.isFinite(cfg.mapDrapeLodMaxTiles) ? Math.max(16, cfg.mapDrapeLodMaxTiles | 0) : 4096;
            const maxWork = Number.isFinite(cfg.mapDrapeLodMaxWork) ? Math.max(64, cfg.mapDrapeLodMaxWork | 0) : 200000;

            let leaves = 0;
            let work = 0;
            while (stack.length && work < maxWork) {
                work++;
                stats.totalConsidered++;
                const t = stack.pop();
                const z = t.z;
                const boundsMerc = proj.tileToMercatorBounds(t.tileX, t.tileY, z);
                const visible = this._isTileVisibleInFrustum(frustum, boundsMerc, camera.position.y);
                if (!visible && z > minZoom) continue;
                if (visible) stats.frustumPassed++;

                const rectDist = distancePointToRect(camMerc.x, camMerc.y, boundsMerc);
                if (rectDist > maxRangeMeters) continue;
                stats.nearPassed++;
                const dist3D = distanceToTile3D(boundsMerc);
                const desiredZ = visible ? desiredZoomForDistance(dist3D) : z;

                const canRefine = (z < topZoom) && (desiredZ > z) && (leaves < maxLeafTiles);
                if (canRefine) {
                    const z1 = z + 1;
                    const x2 = t.tileX * 2;
                    const y2 = t.tileY * 2;
                    stack.push({ tileX: x2, tileY: y2, z: z1 });
                    stack.push({ tileX: x2 + 1, tileY: y2, z: z1 });
                    stack.push({ tileX: x2, tileY: y2 + 1, z: z1 });
                    stack.push({ tileX: x2 + 1, tileY: y2 + 1, z: z1 });
                    stats.refined++;
                    continue;
                }

                const key = this._tileKey(z, t.tileX, t.tileY);
                let arr = tilesByZoom.get(z);
                if (!arr) {
                    arr = [];
                    tilesByZoom.set(z, arr);
                }
                arr.push({ key, tileX: t.tileX, tileY: t.tileY, rectDist });
                leaves++;
            }

            if (stack.length) {
                // Safety: if work was capped, keep the remaining tiles without further refinement.
                for (const t of stack) {
                    const z = t.z;
                    const boundsMerc = proj.tileToMercatorBounds(t.tileX, t.tileY, z);
                    const rectDist = distancePointToRect(camMerc.x, camMerc.y, boundsMerc);
                    const key = this._tileKey(z, t.tileX, t.tileY);
                    let arr = tilesByZoom.get(z);
                    if (!arr) {
                        arr = [];
                        tilesByZoom.set(z, arr);
                    }
                    arr.push({ key, tileX: t.tileX, tileY: t.tileY, rectDist });
                    leaves++;
                }
            }

            // Prioritize highest zoom first so higher-zoom tiles are requested before lower ones.
            const tiles = this._tiles();
            for (const z of [18, 17, 16, 15]) {
                if (z < minZoom || z > topZoom) {
                    const stOld = atlas.byZoom.get(z);
                    if (stOld) {
                        if (tiles) for (const key of stOld.activeKeys) tiles.unpin?.(key);
                        atlas.byZoom.delete(z);
                        try { stOld.rt?.dispose?.(); } catch {}
                    }
                    continue;
                }

                const candidates = tilesByZoom.get(z) || [];
                if (candidates.length === 0) {
                    const stOld = atlas.byZoom.get(z);
                    if (stOld) {
                        if (tiles) for (const key of stOld.activeKeys) tiles.unpin?.(key);
                        atlas.byZoom.delete(z);
                        try { stOld.rt?.dispose?.(); } catch {}
                    }
                    continue;
                }

                candidates.sort((a, b) => (a.rectDist - b.rectDist));
                stats.candidates += candidates.length;
                stats.selected += candidates.length;

                const n = 1 << z;
                const center = this._mercatorToTileXY(camMerc.x, camMerc.y, z);
                if (!center) continue;

                let minTX = Infinity;
                let minTY = Infinity;
                let maxTX = -Infinity;
                let maxTY = -Infinity;
                for (const c of candidates) {
                    if (c.tileX < minTX) minTX = c.tileX;
                    if (c.tileY < minTY) minTY = c.tileY;
                    if (c.tileX > maxTX) maxTX = c.tileX;
                    if (c.tileY > maxTY) maxTY = c.tileY;
                }

                const w = (maxTX - minTX + 1);
                const h = (maxTY - minTY + 1);
                const gridSize = wantsMipmaps ? nextPow2(Math.max(w, h)) : Math.max(w, h);

                const clampOrigin = (o) => Math.max(0, Math.min(n - gridSize, o));
                let originX = clampOrigin(center.x - Math.floor(gridSize / 2));
                let originY = clampOrigin(center.y - Math.floor(gridSize / 2));
                if (originX > minTX) originX = clampOrigin(minTX);
                if ((originX + gridSize - 1) < maxTX) originX = clampOrigin(maxTX - gridSize + 1);
                if (originY > minTY) originY = clampOrigin(minTY);
                if ((originY + gridSize - 1) < maxTY) originY = clampOrigin(maxTY - gridSize + 1);

                const desiredCellSize = atlas.pendingCellSizeByZoom.get(z) || atlas.byZoom.get(z)?.cellSize || (this.terrain?.tileConfig?.tileSize ?? 256);
                const st = this._ensureZoomState(z, { originX, originY, gridSize }, desiredCellSize);
                if (atlas.pendingCellSizeByZoom.has(z) && st?.cellSize === desiredCellSize) atlas.pendingCellSizeByZoom.delete(z);

                const desiredKeys = new Set(candidates.map((c) => c.key));

                for (const key of st.activeKeys) {
                    if (tiles && !desiredKeys.has(key)) tiles.unpin?.(key);
                }
                for (const key of desiredKeys) {
                    if (tiles && !st.activeKeys.has(key)) tiles.pin?.(key);
                }
                st.activeKeys = desiredKeys;

                for (const key of st.textures.keys()) {
                    if (desiredKeys.has(key)) continue;
                    st.textures.delete(key);

                    const parts = String(key).split('-');
                    const tileX = Number(parts[1]);
                    const tileY = Number(parts[2]);
                    if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) continue;
                    const ix = tileX - st.grid.originX;
                    const iy = tileY - st.grid.originY;
                    if (ix < 0 || iy < 0 || ix >= st.grid.gridSize || iy >= st.grid.gridSize) continue;
                    const idx = iy * st.grid.gridSize + ix;
                    const mat = st.meshes[idx]?.material;
                    if (!mat) continue;
                    if (mat.map !== null || mat.opacity !== 0 || mat.transparent !== true) {
                        mat.map = null;
                        mat.opacity = 0;
                        mat.transparent = true;
                        mat.needsUpdate = true;
                        st.dirty = true;
                    }
                }

                let issued = 0;
                for (const c of candidates) {
                    if (!desiredKeys.has(c.key)) continue;
                    if (st.loads.has(c.key)) continue;

                    const ix = c.tileX - st.grid.originX;
                    const iy = c.tileY - st.grid.originY;
                    if (ix < 0 || iy < 0 || ix >= st.grid.gridSize || iy >= st.grid.gridSize) continue;
                    const idx = iy * st.grid.gridSize + ix;
                    const mesh = st.meshes[idx];
                    const mat = mesh?.material;
                    if (!mat) continue;

                    const existing = st.textures.get(c.key);
                    if (existing) {
                        if (mat.map !== existing || mat.opacity !== 1 || mat.transparent !== false) {
                            mat.map = existing;
                            mat.opacity = 1;
                            mat.transparent = false;
                            mat.needsUpdate = true;
                            st.dirty = true;
                        }
                        continue;
                    }

                    if (issued >= maxNewLoadsPerTick) continue;
                    issued++;

                    const p = tiles
                        ?.getTileTexture(c.tileX, c.tileY, z)
                        .then((tex) => {
                            const actual = this._getCellSizeFromTexture(tex);
                            if (actual && atlas.pendingCellSizeByZoom.get(z) !== actual) {
                                const currentCell = atlas.byZoom.get(z)?.cellSize || (this.terrain?.tileConfig?.tileSize ?? 256);
                                if (actual !== currentCell) atlas.pendingCellSizeByZoom.set(z, actual);
                            }

                            const stNow = atlas.byZoom.get(z);
                            if (!stNow?.activeKeys?.has?.(c.key)) return;
                            stNow.textures.set(c.key, tex);

                            const ix = c.tileX - stNow.grid.originX;
                            const iy = c.tileY - stNow.grid.originY;
                            if (ix < 0 || iy < 0 || ix >= stNow.grid.gridSize || iy >= stNow.grid.gridSize) return;
                            const idx = iy * stNow.grid.gridSize + ix;
                            const meshNow = stNow.meshes[idx];
                            const matNow = meshNow?.material;
                            if (!matNow) return;
                            matNow.map = tex;
                            matNow.opacity = 1;
                            matNow.transparent = false;
                            matNow.needsUpdate = true;
                            stNow.dirty = true;
                        })
                        .catch(() => {})
                        .finally(() => {
                            try { atlas.byZoom.get(z)?.loads?.delete?.(c.key); } catch {}
                        });
                    if (p) st.loads.set(c.key, p);
                }

                if (st.dirty) {
                    this._renderZoom(st);
                    st.dirty = false;
                }
            }

            this._setUniforms(true);

            const loadedAtCam = {};
            const active = {};
            for (let z = atlasMaxZoom; z >= 15; z--) {
                const st = atlas.byZoom.get(z);
                if (!st) {
                    loadedAtCam[z] = false;
                    continue;
                }
                active[z] = { active: st.activeKeys?.size ?? 0, loaded: st.textures?.size ?? 0, grid: st.grid?.gridSize ?? 0 };
                const center = this._mercatorToTileXY(camMerc.x, camMerc.y, z);
                if (!center) {
                    loadedAtCam[z] = false;
                    continue;
                }
                const key = this._tileKey(z, center.x, center.y);
                loadedAtCam[z] = st.textures?.has?.(key) === true;
            }

            const tilesByZoomCounts = Object.fromEntries(Array.from(tilesByZoom.entries()).map(([z, arr]) => [z, arr.length]).sort((a, b) => b[0] - a[0]));

            this._debugLog({
                mode: 'atlas-trapezoid',
                lodMode,
                pitchDeg: Number(pitchDeg.toFixed(2)),
                downTiltDeg: Number(downTiltDeg.toFixed(2)),
                tiltFromVerticalDeg: Number(tiltFromVerticalDeg.toFixed(2)),
                baseZoomCfg,
                lodLevels,
                minZoom,
                topZoom,
                topZoomCfg,
                topZoomByView,
                centerDist: Number.isFinite(centerDist) ? Number(centerDist.toFixed(2)) : null,
                viewportH: Number(viewportH.toFixed(2)),
                viewportPadTiles,
                shallowRangeMinTiltDeg: Number(shallowRangeMinTiltDeg.toFixed(2)),
                shallowRangeMeters: Number(shallowRangeMeters.toFixed(2)),
                maxRangeMeters: Number(maxRangeMeters.toFixed(2)),
                viewportMercBounds: viewportMercBounds
                    ? {
                        planeY: Number.isFinite(viewportMercBounds.planeY) ? Number(viewportMercBounds.planeY.toFixed(2)) : null,
                        planeBelowGround: Number.isFinite(viewportMercBounds.planeBelowGround) ? Number(viewportMercBounds.planeBelowGround.toFixed(2)) : null,
                        mercPts: viewportMercBounds.mercPts,
                        maxRangeMeters: Number.isFinite(viewportMercBounds.maxRangeMeters) ? Number(viewportMercBounds.maxRangeMeters.toFixed(2)) : null
                    }
                    : null,
                viewportTileBoundsAtMinZoom: viewportTileBounds,
                tilesByZoomCounts,
                stats,
                loadedAtCam,
                active,
                cameraHeight: Number(cameraHeight.toFixed(2))
            });

            return;
        }

        const bands = Array.isArray(cfg.mapDrapePatchBands) ? cfg.mapDrapePatchBands : [
            { maxDist: 80, zoom: 18 },
            { maxDist: 250, zoom: 17 },
            { maxDist: 600, zoom: 16 },
            { maxDist: radiusMeters, zoom: 15 }
        ];

        // Camera pitch (0 = horizontal, -90 = straight down).
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
        const fwdHoriz = Math.sqrt(fwd.x * fwd.x + fwd.z * fwd.z);
        const downTiltDeg = THREE.MathUtils.radToDeg(Math.atan2(-fwd.y, fwdHoriz));
        const pitchDeg = -downTiltDeg;

        // When looking down enough, prefer "viewport coverage" over radial distance coverage to avoid
        // visible cut-offs inside the frustum (e.g. clear near area + blurry far area still in view).
        const viewportFullMinDownTiltDeg = Number.isFinite(cfg.mapDrapeViewportFullUpdateMinDownTiltDeg)
            ? Number(cfg.mapDrapeViewportFullUpdateMinDownTiltDeg)
            : 40;
        const viewportFullUpdateRequested = downTiltDeg >= viewportFullMinDownTiltDeg;

        const WORLD = 2 * Math.PI * 6378137;
        const MAX_ATLAS_ZOOM = 18;
        const maxMapZoomCfg = Number.isFinite(this.terrain?.tileConfig?.maxMapZoom) ? (this.terrain.tileConfig.maxMapZoom | 0) : MAX_ATLAS_ZOOM;
        const atlasMaxZoom = Math.max(15, Math.min(MAX_ATLAS_ZOOM, maxMapZoomCfg));

        // Derive a tilt-aware zoom set:
        // - near-vertical: fewer levels (e.g. 18..17)
        // - shallow: more levels (e.g. 18..15)
        let topZoom = 15;
        for (const b of bands) {
            const z = Number(b?.zoom);
            if (Number.isFinite(z)) topZoom = Math.max(topZoom, z | 0);
        }
        topZoom = Math.max(15, Math.min(atlasMaxZoom, topZoom | 0));

        // Camera-height based cap: prevents requesting extreme zooms when the view can't resolve them anyway.
        // This is critical for near-vertical views: otherwise the pitch gate can collapse to [18,17] and
        // accidentally force huge high-zoom grids.
        const topZoomByHeight = (() => {
            if (cfg.mapDrapeAutoMaxZoomEnabled === false) return null;
            if (!Number.isFinite(cameraHeight) || cameraHeight <= 0) return null;

            const renderer = this.terrain?.renderer;
            const cssH = Number(renderer?.domElement?.clientHeight) || 0;
            let dpr = 1;
            try {
                dpr = Number(renderer?.getPixelRatio?.() ?? 1) || 1;
            } catch {
                // ignore
            }
            const viewportH = (cssH > 0 ? cssH * dpr : 720);
            if (!Number.isFinite(viewportH) || viewportH <= 0) return null;

            let metersPerPixel = null;
            if (camera?.isOrthographicCamera === true) {
                const frustumHUnits = Math.abs(Number(camera.top) - Number(camera.bottom));
                const frustumH = toMeters(frustumHUnits);
                if (Number.isFinite(frustumH) && frustumH > 0) metersPerPixel = frustumH / viewportH;
            } else {
                const fovRad = THREE.MathUtils.degToRad(Number(camera?.fov) || 0);
                if (Number.isFinite(fovRad) && fovRad > 1e-6 && fovRad < (Math.PI - 1e-6)) {
                    metersPerPixel = (2 * cameraHeight * Math.tan(fovRad / 2)) / viewportH;
                }
            }
            if (!Number.isFinite(metersPerPixel) || metersPerPixel <= 0) return null;

            // Tile m/px at zoom z is WORLD / (256 * 2^z). Choose z where tile m/px ~= view m/px.
            const z = Math.ceil(Math.log2(WORLD / (256 * metersPerPixel)));
            if (!Number.isFinite(z)) return null;
            return Math.max(15, Math.min(atlasMaxZoom, z | 0));
        })();
        if (topZoomByHeight !== null) topZoom = Math.min(topZoom, topZoomByHeight);

        const rangeByZoom = new Map([[15, 0], [16, 0], [17, 0], [18, 0]]);

        for (const b of bands) {
            const z0 = Number(b?.zoom);
            const d0 = Number(b?.maxDist);
            if (!Number.isFinite(z0) || !Number.isFinite(d0)) continue;
            const d = Math.max(0, d0);
            const z = Math.max(15, Math.min(topZoom, z0 | 0));
            rangeByZoom.set(z, Math.max(rangeByZoom.get(z) || 0, d));
        }

        const maxNewLoadsPerTick = Math.max(0, this._opts.mapDrapeAtlasMaxNewLoadsPerTick | 0);
        const wantsMipmaps = this._opts.mapDrapeAtlasMipmaps === true;
        const outerRing = Math.max(0, this._opts.mapDrapeAtlasOuterRingTiles | 0);

        const stats = { selected: 0, candidates: 0, frustumPassed: 0, nearPassed: 0, totalConsidered: 0 };
        const frustum = new THREE.Frustum();
        const projScreen = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(projScreen);

        const baseZoomCfg = Number.isFinite(cfg.mapDrapeBaseZoom) ? (cfg.mapDrapeBaseZoom | 0) : 15;
        const viewportFillZoomCfg = Number.isFinite(cfg.mapDrapeViewportFillZoom) ? (cfg.mapDrapeViewportFillZoom | 0) : topZoom;
        const viewportFillZoom = Math.max(15, Math.min(topZoom, viewportFillZoomCfg));
        const viewportFillBaseZoom = Math.max(15, Math.min(viewportFillZoom, baseZoomCfg));
        const viewportPadTiles = Number.isFinite(cfg.mapDrapeViewportPadTiles)
            ? Math.max(0, cfg.mapDrapeViewportPadTiles | 0)
            : (Number.isFinite(this.terrain?.tileConfig?.mapDrapeViewportPadTiles)
                ? Math.max(0, this.terrain.tileConfig.mapDrapeViewportPadTiles | 0)
                : 1);

        const viewportMercBounds = (() => {
            if (!viewportFullUpdateRequested) return null;
            if (!proj?.centerMercator) return null;

            const planeBelowGroundCfg = Number.isFinite(cfg.mapDrapeViewportPlaneBelowGroundMeters)
                ? Math.max(0, Number(cfg.mapDrapeViewportPlaneBelowGroundMeters))
                : null;
            const planeBelowGroundMeters = planeBelowGroundCfg !== null
                ? planeBelowGroundCfg
                : (Number.isFinite(cameraHeight) && cameraHeight > 0 ? Math.min(500, Math.max(0, cameraHeight * 0.25)) : 0);
            const planeBelowGround = toUnits(planeBelowGroundMeters);

            // Intersect screen-corner rays with a horizontal plane near (but slightly below) the camera ground height
            // to estimate the ground footprint of the view. Lowering the plane makes the bound more conservative
            // on sloped terrain (prevents frustum-edge holes).
            const planeY = (Number.isFinite(groundHeightAtCam) ? Number(groundHeightAtCam) : 0) - planeBelowGround;
            const mercPts = [];
            const ndc = [
                [-1, -1],
                [1, -1],
                [-1, 1],
                [1, 1]
            ];

            for (const [nx, ny] of ndc) {
                const pNear = new THREE.Vector3(nx, ny, -1).unproject(camera);
                const pFar = new THREE.Vector3(nx, ny, 1).unproject(camera);
                const dir = pFar.sub(pNear);
                const lenSq = dir.lengthSq();
                if (lenSq < 1e-12) continue;
                dir.multiplyScalar(1 / Math.sqrt(lenSq));
                const dy = dir.y;
                if (!Number.isFinite(dy) || Math.abs(dy) < 1e-8) continue;
                const t = (planeY - pNear.y) / dy;
                if (!Number.isFinite(t) || t <= 0) continue;
                const p = pNear.add(dir.multiplyScalar(t));
                const mx = proj.centerMercator.x + toMeters(p.x);
                const my = proj.centerMercator.y - toMeters(p.z);
                if (!Number.isFinite(mx) || !Number.isFinite(my)) continue;
                mercPts.push({ x: mx, y: my });
            }

            if (mercPts.length < 2) return null;
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const p of mercPts) {
                if (p.x < minX) minX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.x > maxX) maxX = p.x;
                if (p.y > maxY) maxY = p.y;
            }
            if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return null;
            return { minX, minY, maxX, maxY, planeY, planeBelowGround, mercPts: mercPts.length };
        })();

        const _viewportTileBoundsAtZoom = (z) => {
            if (!viewportMercBounds) return null;

            const corners = [
                { x: viewportMercBounds.minX, y: viewportMercBounds.minY },
                { x: viewportMercBounds.minX, y: viewportMercBounds.maxY },
                { x: viewportMercBounds.maxX, y: viewportMercBounds.minY },
                { x: viewportMercBounds.maxX, y: viewportMercBounds.maxY }
            ];

            let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
            for (const c of corners) {
                const txy = this._mercatorToTileXY(c.x, c.y, z);
                if (!txy) return null;
                if (txy.x < xMin) xMin = txy.x;
                if (txy.y < yMin) yMin = txy.y;
                if (txy.x > xMax) xMax = txy.x;
                if (txy.y > yMax) yMax = txy.y;
            }
            if (!Number.isFinite(xMin) || !Number.isFinite(yMin) || !Number.isFinite(xMax) || !Number.isFinite(yMax)) return null;

            const n = 1 << z;
            const pad = viewportPadTiles;
            const clamp = (v) => Math.max(0, Math.min(n - 1, v | 0));
            xMin = clamp(xMin - pad);
            yMin = clamp(yMin - pad);
            xMax = clamp(xMax + pad);
            yMax = clamp(yMax + pad);
            if (xMax < xMin || yMax < yMin) return null;
            return { xMin, yMin, xMax, yMax };
        };

        const viewportTileBoundsByZoom = new Map();
        if (viewportMercBounds) {
            const zs = new Set([viewportFillZoom, viewportFillBaseZoom]);
            for (const z of zs) {
                const b = _viewportTileBoundsAtZoom(z);
                if (b) viewportTileBoundsByZoom.set(z, b);
            }
        }
        const viewportFullUpdate = viewportFullUpdateRequested && viewportTileBoundsByZoom.size > 0;

        // Prioritize highest zoom first so higher-zoom tiles are requested before lower ones.
        const tiles = this._tiles();
        for (const z of [18, 17, 16, 15]) {
            const baseRange = rangeByZoom.get(z) || 0;
            const viewportTileBounds = viewportTileBoundsByZoom.get(z) || null;
            const useViewportBounds = viewportFullUpdate && viewportTileBounds !== null;

            // Shallow views: exaggerate the configured radial ranges a bit so the frustum doesn't visibly
            // run out of atlas coverage. Cap the scale to avoid exploding requests.
            const rangeScale = (() => {
                if (viewportFullUpdate) return 1;
                const rad = THREE.MathUtils.degToRad(Math.max(1, downTiltDeg));
                const s = Math.sin(rad);
                const inv = 1 / Math.max(0.35, s);
                const maxScale = Number.isFinite(cfg.mapDrapeShallowRangeScaleMax) ? Math.max(1, Number(cfg.mapDrapeShallowRangeScaleMax)) : 3;
                return Math.min(maxScale, inv);
            })();
            let range = baseRange * rangeScale;
            if (useViewportBounds) range = Infinity;
            else if (viewportFullUpdate) range = 0;

            if (range <= 0) {
                const stOld = atlas.byZoom.get(z);
                if (stOld) {
                    if (tiles) for (const key of stOld.activeKeys) tiles.unpin?.(key);
                    atlas.byZoom.delete(z);
                    try { stOld.rt?.dispose?.(); } catch {}
                }
                continue;
            }

            const n = 1 << z;
            const center = this._mercatorToTileXY(camMerc.x, camMerc.y, z);
            if (!center) continue;

            const tileSizeMeters = WORLD / n;
            const span = useViewportBounds ? 0 : Math.max(1, Math.ceil(range / tileSizeMeters) + 1);

            const candidates = [];
            const xMin = useViewportBounds ? viewportTileBounds.xMin : Math.max(0, center.x - span);
            const xMax = useViewportBounds ? viewportTileBounds.xMax : Math.min(n - 1, center.x + span);
            const yMin = useViewportBounds ? viewportTileBounds.yMin : Math.max(0, center.y - span);
            const yMax = useViewportBounds ? viewportTileBounds.yMax : Math.min(n - 1, center.y + span);

            const scanned = (xMax - xMin + 1) * (yMax - yMin + 1);
            stats.totalConsidered += scanned;

            for (let tileY = yMin; tileY <= yMax; tileY++) {
                for (let tileX = xMin; tileX <= xMax; tileX++) {
                    const boundsMerc = proj.tileToMercatorBounds(tileX, tileY, z);
                    const rectDist = distancePointToRect(camMerc.x, camMerc.y, boundsMerc);
                    if (rectDist > range) continue;
                    stats.nearPassed++;

                    if (!this._isTileVisibleInFrustum(frustum, boundsMerc, camera.position.y)) continue;
                    stats.frustumPassed++;

                    const key = this._tileKey(z, tileX, tileY);
                    candidates.push({ key, tileX, tileY, rectDist });
                }
            }

            if (candidates.length === 0) {
                const stOld = atlas.byZoom.get(z);
                if (stOld) {
                    if (tiles) for (const key of stOld.activeKeys) tiles.unpin?.(key);
                    atlas.byZoom.delete(z);
                    try { stOld.rt?.dispose?.(); } catch {}
                }
                continue;
            }

            if (outerRing > 0 && !useViewportBounds) {
                let mercDX = fwd.x;
                let mercDY = -fwd.z;
                const len = Math.hypot(mercDX, mercDY);
                if (len > 1e-6) {
                    mercDX /= len;
                    mercDY /= len;
                }
                const sx = Math.abs(mercDX) > 0.2 ? (mercDX > 0 ? 1 : -1) : 0;
                const sy = Math.abs(mercDY) > 0.2 ? (mercDY > 0 ? 1 : -1) : 0;
                if (sx !== 0 || sy !== 0) {
                    const keySet = new Set(candidates.map((c) => c.key));
                    const relaxedRange = range + tileSizeMeters * outerRing;
                    let minTX = Infinity, minTY = Infinity, maxTX = -Infinity, maxTY = -Infinity;
                    for (const c of candidates) {
                        if (c.tileX < minTX) minTX = c.tileX;
                        if (c.tileY < minTY) minTY = c.tileY;
                        if (c.tileX > maxTX) maxTX = c.tileX;
                        if (c.tileY > maxTY) maxTY = c.tileY;
                    }
                    const tryAdd = (tileX, tileY) => {
                        if (tileX < 0 || tileY < 0 || tileX >= n || tileY >= n) return;
                        const key = this._tileKey(z, tileX, tileY);
                        if (keySet.has(key)) return;
                        const boundsMerc = proj.tileToMercatorBounds(tileX, tileY, z);
                        const rectDist = distancePointToRect(camMerc.x, camMerc.y, boundsMerc);
                        if (rectDist > relaxedRange) return;
                        if (!this._isTileVisibleInFrustum(frustum, boundsMerc, camera.position.y)) return;
                        keySet.add(key);
                        candidates.push({ key, tileX, tileY, rectDist });
                    };

                    const lateral = 1;
                    const xA = Math.max(0, minTX - (sy !== 0 ? lateral : 0));
                    const xB = Math.min(n - 1, maxTX + (sy !== 0 ? lateral : 0));
                    const yA = Math.max(0, minTY - (sx !== 0 ? lateral : 0));
                    const yB = Math.min(n - 1, maxTY + (sx !== 0 ? lateral : 0));
                    for (let k = 1; k <= outerRing; k++) {
                        if (sy > 0) {
                            const row = maxTY + k;
                            for (let x = xA; x <= xB; x++) tryAdd(x, row);
                        } else if (sy < 0) {
                            const row = minTY - k;
                            for (let x = xA; x <= xB; x++) tryAdd(x, row);
                        }
                        if (sx > 0) {
                            const col = maxTX + k;
                            for (let y = yA; y <= yB; y++) tryAdd(col, y);
                        } else if (sx < 0) {
                            const col = minTX - k;
                            for (let y = yA; y <= yB; y++) tryAdd(col, y);
                        }
                    }
                }
            }

            candidates.sort((a, b) => (a.rectDist - b.rectDist));
            stats.candidates += candidates.length;
            stats.selected += candidates.length;

            let minTX = Infinity;
            let minTY = Infinity;
            let maxTX = -Infinity;
            let maxTY = -Infinity;
            for (const c of candidates) {
                if (c.tileX < minTX) minTX = c.tileX;
                if (c.tileY < minTY) minTY = c.tileY;
                if (c.tileX > maxTX) maxTX = c.tileX;
                if (c.tileY > maxTY) maxTY = c.tileY;
            }

            const w = (maxTX - minTX + 1);
            const h = (maxTY - minTY + 1);
            const gridSize = wantsMipmaps ? nextPow2(Math.max(w, h)) : Math.max(w, h);

            const clampOrigin = (o) => Math.max(0, Math.min(n - gridSize, o));
            let originX = clampOrigin(center.x - Math.floor(gridSize / 2));
            let originY = clampOrigin(center.y - Math.floor(gridSize / 2));
            if (originX > minTX) originX = clampOrigin(minTX);
            if ((originX + gridSize - 1) < maxTX) originX = clampOrigin(maxTX - gridSize + 1);
            if (originY > minTY) originY = clampOrigin(minTY);
            if ((originY + gridSize - 1) < maxTY) originY = clampOrigin(maxTY - gridSize + 1);

            const desiredCellSize = atlas.pendingCellSizeByZoom.get(z) || atlas.byZoom.get(z)?.cellSize || (this.terrain?.tileConfig?.tileSize ?? 256);
            const st = this._ensureZoomState(z, { originX, originY, gridSize }, desiredCellSize);
            if (atlas.pendingCellSizeByZoom.has(z) && st?.cellSize === desiredCellSize) atlas.pendingCellSizeByZoom.delete(z);

            const nextKeys = new Set();
            const cellInfos = [];
            const cellCount = gridSize * gridSize;
            stats.totalConsidered += cellCount;
            for (let idx = 0; idx < cellCount; idx++) {
                const ix = idx % gridSize;
                const iy = Math.floor(idx / gridSize);
                const tileX = originX + ix;
                const tileY = originY + iy;
                const key = this._tileKey(z, tileX, tileY);
                nextKeys.add(key);

                const boundsMerc = proj.tileToMercatorBounds(tileX, tileY, z);
                const rectDist = distancePointToRect(camMerc.x, camMerc.y, boundsMerc);
                cellInfos.push({ idx, key, tileX, tileY, rectDist, boundsMerc });
            }

            for (const key of st.activeKeys) {
                if (tiles && !nextKeys.has(key)) tiles.unpin?.(key);
            }
            for (const key of nextKeys) {
                if (tiles && !st.activeKeys.has(key)) tiles.pin?.(key);
            }
            st.activeKeys = nextKeys;

            for (const key of st.textures.keys()) {
                if (!nextKeys.has(key)) st.textures.delete(key);
            }

            cellInfos.sort((a, b) => a.rectDist - b.rectDist);
            let issued = 0;
            for (const c of cellInfos) {
                const mesh = st.meshes[c.idx];
                const mat = mesh?.material;
                if (!mat) continue;

                const existing = st.textures.get(c.key);
                    if (existing) {
                        if (mat.map !== existing || mat.opacity !== 1 || mat.transparent !== false) {
                            mat.map = existing;
                            mat.opacity = 1;
                            mat.transparent = false;
                            mat.needsUpdate = true;
                            st.dirty = true;
                        }
                        continue;
                    }

                if (st.loads.has(c.key)) continue;
                if (issued >= maxNewLoadsPerTick) continue;
                issued++;

                const p = tiles
                    ?.getTileTexture(c.tileX, c.tileY, z)
                    .then((tex) => {
                        const actual = this._getCellSizeFromTexture(tex);
                        if (actual && atlas.pendingCellSizeByZoom.get(z) !== actual) {
                            const currentCell = atlas.byZoom.get(z)?.cellSize || (this.terrain?.tileConfig?.tileSize ?? 256);
                            if (actual !== currentCell) atlas.pendingCellSizeByZoom.set(z, actual);
                        }

                        const stNow = atlas.byZoom.get(z);
                        if (!stNow?.activeKeys?.has?.(c.key)) return;
                        stNow.textures.set(c.key, tex);

                        const ix = c.tileX - stNow.grid.originX;
                        const iy = c.tileY - stNow.grid.originY;
                        if (ix < 0 || iy < 0 || ix >= stNow.grid.gridSize || iy >= stNow.grid.gridSize) return;
                        const idx = iy * stNow.grid.gridSize + ix;
                        const meshNow = stNow.meshes[idx];
                        const matNow = meshNow?.material;
                        if (!matNow) return;
                        matNow.map = tex;
                        matNow.opacity = 1;
                        matNow.transparent = false;
                        matNow.needsUpdate = true;
                        stNow.dirty = true;
                    })
                    .catch(() => {})
                    .finally(() => {
                        try { atlas.byZoom.get(z)?.loads?.delete?.(c.key); } catch {}
                    });
                if (p) st.loads.set(c.key, p);
            }

            if (st.dirty) {
                this._renderZoom(st);
                st.dirty = false;
            }
        }

        this._setUniforms(true);

        // Debug: help verify which zoom is actually available at the camera position (detect fallback chain).
        const loadedAtCam = {};
        const active = {};
        for (const z of [18, 17, 16, 15]) {
            const st = atlas.byZoom.get(z);
            if (!st) {
                loadedAtCam[z] = false;
                continue;
            }
            active[z] = { active: st.activeKeys?.size ?? 0, loaded: st.textures?.size ?? 0, grid: st.grid?.gridSize ?? 0 };
            const center = this._mercatorToTileXY(camMerc.x, camMerc.y, z);
            if (!center) {
                loadedAtCam[z] = false;
                continue;
            }
            const key = this._tileKey(z, center.x, center.y);
            loadedAtCam[z] = st.textures?.has?.(key) === true;
        }

        this._debugLog({
            mode: 'atlas',
            pitchDeg: Number(pitchDeg.toFixed(2)),
            topZoom,
            topZoomByHeight,
            atlasMaxZoom,
            viewportFullUpdateRequested,
            viewportFullUpdate,
            viewportFullMinDownTiltDeg: Number(viewportFullMinDownTiltDeg.toFixed(2)),
            viewportFillZoom,
            viewportFillBaseZoom,
            viewportPadTiles,
            viewportMercBounds: viewportMercBounds
                ? {
                    planeY: Number.isFinite(viewportMercBounds.planeY) ? Number(viewportMercBounds.planeY.toFixed(2)) : null,
                    planeBelowGround: Number.isFinite(viewportMercBounds.planeBelowGround) ? Number(viewportMercBounds.planeBelowGround.toFixed(2)) : null,
                    mercPts: viewportMercBounds.mercPts
                }
                : null,
            viewportTileBoundsByZoom: Object.fromEntries(Array.from(viewportTileBoundsByZoom.entries())),
            rangeByZoom: Object.fromEntries(Array.from(rangeByZoom.entries()).sort((a, b) => b[0] - a[0])),
            loadedAtCam,
            active,
            cameraHeight: Number(cameraHeight.toFixed(2))
        });
    }

    _setUniforms(enabled) {
        const tileMap = this.terrain?.tileMap;
        if (!tileMap?.size) return;

        const centerX = Number(this.terrain?.proj?.centerMercator?.x ?? 0);
        const centerY = Number(this.terrain?.proj?.centerMercator?.y ?? 0);
        const metersPerUnit = Number(this.terrain?.proj?.metersPerUnit ?? 1) || 1;

        const z15 = this._state?.byZoom?.get?.(15) ?? null;
        const z16 = this._state?.byZoom?.get?.(16) ?? null;
        const z17 = this._state?.byZoom?.get?.(17) ?? null;
        const z18 = this._state?.byZoom?.get?.(18) ?? null;

        const smoothness = Math.max(0, Math.min(1, Number(this._opts.mapDrapeAtlasSmoothness) || 0));
        const smoothRadiusPx = Math.max(0, Number(this._opts.mapDrapeAtlasSmoothRadiusPx) || 0);

        const gridVec = (zState) => {
            const g = zState?.grid;
            if (!g || !Number.isFinite(g.gridSize) || g.gridSize <= 0) return new THREE.Vector4(0, 0, 0, 0);
            return new THREE.Vector4(g.originX, g.originY, g.gridSize, 1 / g.gridSize);
        };

        const invCell = (zState) => {
            const cell = Number(zState?.cellSize);
            if (!Number.isFinite(cell) || cell <= 0) return 0;
            return 1 / cell;
        };

        const proj = this.terrain?.proj;
        const originLocalVec = (zState, z) => {
            const g = zState?.grid;
            if (!g || !proj?.tileToMercatorBounds) return new THREE.Vector2(0, 0);
            const b = proj.tileToMercatorBounds(g.originX, g.originY, z);
            const x = Number(b?.min?.x);
            const y = Number(b?.min?.y); // north edge
            if (!Number.isFinite(x) || !Number.isFinite(y)) return new THREE.Vector2(0, 0);
            return new THREE.Vector2(x - centerX, y - centerY);
        };

        const o15 = enabled ? originLocalVec(z15, 15) : new THREE.Vector2(0, 0);
        const o16 = enabled ? originLocalVec(z16, 16) : new THREE.Vector2(0, 0);
        const o17 = enabled ? originLocalVec(z17, 17) : new THREE.Vector2(0, 0);
        const o18 = enabled ? originLocalVec(z18, 18) : new THREE.Vector2(0, 0);

        for (const t of tileMap.values()) {
            const m = t?.mesh;
            const mats = Array.isArray(m?.material) ? m.material : (m?.material ? [m.material] : []);
            for (const mat of mats) {
                const u = mat?.userData?.mapAtlasUniforms;
                if (!u) continue;

                if (u.uMapAtlasEnabled) u.uMapAtlasEnabled.value = enabled ? 1 : 0;
                if (u.uMapAtlasCenterMercator?.value?.set) u.uMapAtlasCenterMercator.value.set(centerX, centerY);
                if (u.uSceneMetersPerUnit) u.uSceneMetersPerUnit.value = metersPerUnit;

                if (u.uMapAtlasTex15) u.uMapAtlasTex15.value = enabled ? (z15?.rt?.texture ?? null) : null;
                if (u.uMapAtlasTex16) u.uMapAtlasTex16.value = enabled ? (z16?.rt?.texture ?? null) : null;
                if (u.uMapAtlasTex17) u.uMapAtlasTex17.value = enabled ? (z17?.rt?.texture ?? null) : null;
                if (u.uMapAtlasTex18) u.uMapAtlasTex18.value = enabled ? (z18?.rt?.texture ?? null) : null;

                if (u.uMapAtlasGrid15?.value?.copy) u.uMapAtlasGrid15.value.copy(gridVec(z15));
                if (u.uMapAtlasGrid16?.value?.copy) u.uMapAtlasGrid16.value.copy(gridVec(z16));
                if (u.uMapAtlasGrid17?.value?.copy) u.uMapAtlasGrid17.value.copy(gridVec(z17));
                if (u.uMapAtlasGrid18?.value?.copy) u.uMapAtlasGrid18.value.copy(gridVec(z18));

                if (u.uMapAtlasOriginLocal15?.value?.copy) u.uMapAtlasOriginLocal15.value.copy(o15);
                if (u.uMapAtlasOriginLocal16?.value?.copy) u.uMapAtlasOriginLocal16.value.copy(o16);
                if (u.uMapAtlasOriginLocal17?.value?.copy) u.uMapAtlasOriginLocal17.value.copy(o17);
                if (u.uMapAtlasOriginLocal18?.value?.copy) u.uMapAtlasOriginLocal18.value.copy(o18);

                if (u.uMapAtlasInvCell15) u.uMapAtlasInvCell15.value = enabled ? invCell(z15) : 0;
                if (u.uMapAtlasInvCell16) u.uMapAtlasInvCell16.value = enabled ? invCell(z16) : 0;
                if (u.uMapAtlasInvCell17) u.uMapAtlasInvCell17.value = enabled ? invCell(z17) : 0;
                if (u.uMapAtlasInvCell18) u.uMapAtlasInvCell18.value = enabled ? invCell(z18) : 0;

                if (u.uMapAtlasSmoothness) u.uMapAtlasSmoothness.value = enabled ? smoothness : 0;
                if (u.uMapAtlasSmoothRadiusPx) u.uMapAtlasSmoothRadiusPx.value = enabled ? smoothRadiusPx : 0;
            }
        }
    }

    _getCellSizeFromTexture(tex) {
        const w = Number(tex?.image?.width);
        const h = Number(tex?.image?.height);
        const s = (Number.isFinite(w) && w > 0) ? w : ((Number.isFinite(h) && h > 0) ? h : null);
        if (!Number.isFinite(s)) return null;
        return Math.max(64, Math.min(2048, s | 0));
    }

    _ensureZoomState(z, grid, cellSizePx) {
        const tileSize = this.terrain?.tileConfig?.tileSize ?? 256;
        const cellSize = Number.isFinite(cellSizePx) ? Math.max(1, cellSizePx | 0) : (tileSize | 0);
        const atlas = this._state;
        let st = atlas.byZoom.get(z);

        const gridChanged =
            !st?.grid ||
            st.grid.originX !== grid.originX ||
            st.grid.originY !== grid.originY ||
            st.grid.gridSize !== grid.gridSize;
        const cellChanged = !st?.cellSize || st.cellSize !== cellSize;

        if (!st || gridChanged || cellChanged) {
            const carryTextures = st?.textures instanceof Map ? st.textures : new Map();
            const carryLoads = st?.loads instanceof Map ? st.loads : new Map();
            const carryActiveKeys = st?.activeKeys instanceof Set ? st.activeKeys : new Set();

            if (st?.activeKeys?.size) {
                const tiles = this._tiles();
                if (tiles) for (const key of st.activeKeys) tiles.unpin?.(key);
            }
            try { st?.rt?.dispose?.(); } catch {}

            const sizePx = Math.max(1, grid.gridSize) * cellSize;
            const rt = new THREE.WebGLRenderTarget(sizePx, sizePx, {
                depthBuffer: false,
                stencilBuffer: false
            });

            const atlasFilter = String(this._opts.mapDrapeAtlasFilter ?? 'linear');
            const useMipmaps = this._opts.mapDrapeAtlasMipmaps === true;
            const useNearest = atlasFilter === 'nearest';

            rt.texture.generateMipmaps = useMipmaps;
            rt.texture.minFilter = useNearest
                ? THREE.NearestFilter
                : (useMipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter);
            rt.texture.magFilter = useNearest ? THREE.NearestFilter : THREE.LinearFilter;

            if (useMipmaps) {
                try {
                    const maxA = this.terrain?.renderer?.capabilities?.getMaxAnisotropy?.() ?? 1;
                    const desired = Math.max(1, this._opts.mapDrapeAtlasAnisotropy | 0);
                    rt.texture.anisotropy = Math.min(desired, maxA);
                } catch {
                    // ignore
                }
            }

            const scene = new THREE.Scene();
            const cam = new THREE.OrthographicCamera(0, sizePx, sizePx, 0, -1, 1);
            cam.position.set(0, 0, 1);
            cam.lookAt(0, 0, 0);

            const meshes = [];
            const cell = cellSize;
            const geom = new THREE.PlaneGeometry(cell, cell);

            for (let iy = 0; iy < grid.gridSize; iy++) {
                for (let ix = 0; ix < grid.gridSize; ix++) {
                    const mat = new THREE.MeshBasicMaterial({
                        map: null,
                        transparent: true,
                        opacity: 0,
                        depthTest: false,
                        depthWrite: false
                    });
                    mat.toneMapped = false;

                    const mesh = new THREE.Mesh(geom, mat);
                    mesh.position.set((ix + 0.5) * cell, sizePx - (iy + 0.5) * cell, 0);
                    scene.add(mesh);
                    meshes.push(mesh);
                }
            }

            st = {
                z,
                grid,
                cellSize,
                rt,
                useMipmaps,
                scene,
                cam,
                meshes,
                loads: carryLoads,
                activeKeys: carryActiveKeys,
                dirty: true,
                textures: carryTextures
            };
            atlas.byZoom.set(z, st);
        }

        return st;
    }

    _renderZoom(st) {
        const renderer = this.terrain?.renderer;
        if (!renderer || !st?.rt || !st?.scene || !st?.cam) return;

        const prevRT = renderer.getRenderTarget();
        const prevClear = new THREE.Color();
        try { renderer.getClearColor(prevClear); } catch {}
        const prevAlpha = (() => {
            try { return renderer.getClearAlpha(); } catch { return 1; }
        })();

        renderer.setRenderTarget(st.rt);
        renderer.setClearColor(0x000000, 0);
        renderer.clear(true, true, true);
        renderer.render(st.scene, st.cam);
        renderer.setRenderTarget(prevRT);
        if (st.useMipmaps && typeof renderer.updateRenderTargetMipmap === 'function') {
            try {
                renderer.updateRenderTargetMipmap(st.rt);
            } catch {
                // ignore
            }
        }
        try { renderer.setClearColor(prevClear, prevAlpha); } catch {}
    }

    _mercatorToTileXY(mercX, mercY, zoom) {
        const proj = this.terrain?.proj;
        if (!proj?.mercatorToLonLat || !proj?.lonLatToTile) return null;
        const ll = proj.mercatorToLonLat(mercX, mercY);
        return proj.lonLatToTile(ll.lon, ll.lat, zoom);
    }

    _isTileVisibleInFrustum(frustum, boundsMerc, yWorld) {
        const proj = this.terrain?.proj;
        if (!frustum || !boundsMerc?.min || !boundsMerc?.max || !proj?.centerMercator) return true;

        const toUnits = (v) => (proj?.metersToUnits ? proj.metersToUnits(v) : Number(v));
        const cx = proj.centerMercator.x;
        const cy = proj.centerMercator.y;
        const west = boundsMerc.min.x;
        const east = boundsMerc.max.x;
        const north = boundsMerc.min.y;
        const south = boundsMerc.max.y;

        const xW = toUnits(west - cx);
        const xE = toUnits(east - cx);
        const zN = toUnits(cy - north);
        const zS = toUnits(cy - south);

        const yPad = toUnits(10000);
        const y0 = Number.isFinite(yWorld) ? Math.min(-yPad, yWorld - yPad) : -yPad;
        const y1 = Number.isFinite(yWorld) ? (yWorld + yPad) : yPad;

        const box = new THREE.Box3(
            new THREE.Vector3(Math.min(xW, xE), y0, Math.min(zN, zS)),
            new THREE.Vector3(Math.max(xW, xE), y1, Math.max(zN, zS))
        );
        return frustum.intersectsBox(box);
    }

    _now() {
        return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    }

    _debugLog(info) {
        const enabled = this.terrain?.config?.mapDrapeDebug === true;
        if (!enabled) return;
        const now = this._now();
        const intervalMs = Number.isFinite(this.terrain?.config?.mapDrapeDebugMs) ? this.terrain.config.mapDrapeDebugMs : 1000;
        if ((now - (this._debug.last || 0)) < intervalMs) return;
        this._debug.last = now;
        try {
            console.log('[MapDrape]', info);
        } catch {
            // ignore
        }
    }
}

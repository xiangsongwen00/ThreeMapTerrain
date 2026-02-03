import * as THREE from 'three';

class AsyncLoadQueue {
    constructor(maxConcurrent = 8) {
        this.maxConcurrent = Math.max(1, maxConcurrent | 0);
        this.inFlight = 0;
        this.queue = [];
    }

    setMaxConcurrent(n) {
        this.maxConcurrent = Math.max(1, n | 0);
        this._drain();
    }

    schedule(startFn) {
        return new Promise((resolve, reject) => {
            this.queue.push({ startFn, resolve, reject });
            this._drain();
        });
    }

    _drain() {
        while (this.inFlight < this.maxConcurrent && this.queue.length) {
            const job = this.queue.shift();
            this.inFlight++;
            Promise.resolve()
                .then(job.startFn)
                .then(job.resolve, job.reject)
                .finally(() => {
                    this.inFlight--;
                    this._drain();
                });
        }
    }
}

function disposeTexture(tex) {
    try {
        tex?.dispose?.();
    } catch {
        // ignore
    }
}

function sleep(ms) {
    const t = Math.max(0, Number(ms) || 0);
    return new Promise((resolve) => setTimeout(resolve, t));
}

/**
 * XYZ imagery tile loader with:
 * - concurrency limit
 * - LRU cache with disposal on eviction
 * - optional mosaicing when mapZoom > terrainZoom (diff 1/2 or more if you allow)
 */
export class ImageryTiles {
    constructor(options = {}) {
        this.options = {
            tileUrl: options.tileUrl ?? '',
            // Tile addressing scheme used by the URL template:
            // - 'xyz' (default): y origin at top (Web Mercator slippy map)
            // - 'tms': y origin at bottom (flip y index)
            tileScheme: options.tileScheme ?? options.mapYtype ?? 'xyz',
            // Optional subdomains for `{s}` token. Examples:
            // - 'abc' -> ['a','b','c']
            // - ['a','b','c']
            // - 'mt0,mt1,mt2,mt3'
            subdomains: options.subdomains ?? null,
            // Subdomain selection strategy:
            // - 'auto' (default): hash for first try, round-robin for retries
            // - 'hash': deterministic per tile
            // - 'roundRobin': cycles across subdomains for every request
            subdomainStrategy: options.subdomainStrategy ?? 'auto',
            // Template variables used by some providers/presets:
            // - `{token}` / `{key}` / `{apiKey}` / `{accessToken}` / `{access_token}`
            token: options.token ?? options.templateToken ?? null,
            apiKey: options.apiKey ?? null,
            accessToken: options.accessToken ?? null,
            // Simple burst throttling (helps providers like Tianditu that rate-limit aggressively):
            // If we start >rateLimitBurst requests within rateLimitWindowMs, pause rateLimitCooldownMs.
            // Defaults implement: "超过100就暂停1s".
            rateLimitBurst: options.rateLimitBurst ?? 100,
            rateLimitWindowMs: options.rateLimitWindowMs ?? 1000,
            rateLimitCooldownMs: options.rateLimitCooldownMs ?? 1000,
            // Retry on transient errors (e.g. 429/empty responses). Retries rotate subdomain if possible.
            retryCount: options.retryCount ?? 2,
            retryBaseDelayMs: options.retryBaseDelayMs ?? 250,
            retryMaxDelayMs: options.retryMaxDelayMs ?? 2000,
            maxConcurrent: options.maxConcurrent ?? 8,
            maxEntries: options.maxEntries ?? 512,
            maxAnisotropy: options.maxAnisotropy ?? 8,
            flipY: options.flipY ?? true,
            ...options
        };

        this._queue = new AsyncLoadQueue(this.options.maxConcurrent);
        this._cache = new Map(); // key -> { promise, texture?, evicted? }
        this._renderer = null;
        this._pinned = new Set(); // keys that must not be evicted
        this._lastOptionsKey = this._optionsKey();

        this._subdomainCounter = 0;
        this._throttle = { windowStartMs: 0, startedInWindow: 0, cooldownUntilMs: 0 };
        this._throttleChain = Promise.resolve();
    }

    setRenderer(renderer) {
        this._renderer = renderer || null;
    }

    setOptions(next = {}) {
        this.options = { ...this.options, ...next };
        if (next.maxConcurrent !== undefined) this._queue.setMaxConcurrent(this.options.maxConcurrent);
        const k = this._optionsKey();
        if (k !== this._lastOptionsKey) {
            this._lastOptionsKey = k;
            // URL addressing affects every request; clear cache so we don't reuse wrong tiles.
            this.reset();
        }
        this._evictIfNeeded();
    }

    clear() {
        for (const entry of this._cache.values()) {
            if (entry?.texture) disposeTexture(entry.texture);
            else if (entry?.promise) entry.promise.then(disposeTexture).catch(() => {});
        }
        this._cache.clear();
    }

    reset() {
        this.clear();
        try { this._pinned.clear(); } catch { /* ignore */ }
        this._subdomainCounter = 0;
        this._throttle = { windowStartMs: 0, startedInWindow: 0, cooldownUntilMs: 0 };
        this._throttleChain = Promise.resolve();
    }

    _touch(key) {
        const entry = this._cache.get(key);
        if (!entry) return null;
        this._cache.delete(key);
        this._cache.set(key, entry);
        return entry;
    }

    _evictIfNeeded() {
        const maxEntries = Math.max(1, this.options.maxEntries | 0);
        let guard = 0;
        while (this._cache.size > maxEntries && guard < (maxEntries + 1024)) {
            guard++;
            const oldestKey = this._cache.keys().next().value;
            if (this._pinned.has(oldestKey)) {
                // Move pinned entries to the end to give other entries a chance to be evicted.
                const pinned = this._cache.get(oldestKey);
                this._cache.delete(oldestKey);
                this._cache.set(oldestKey, pinned);
                continue;
            }
            const entry = this._cache.get(oldestKey);
            this._cache.delete(oldestKey);
            if (!entry) continue;
            if (entry.texture) {
                disposeTexture(entry.texture);
            } else if (entry.promise) {
                entry.evicted = true;
                entry.promise.then(disposeTexture).catch(() => {});
            }
        }
    }

    pin(key) {
        if (!key) return;
        this._pinned.add(String(key));
    }

    unpin(key) {
        if (!key) return;
        this._pinned.delete(String(key));
    }

    _optionsKey() {
        const template = String(this.options.tileUrl ?? '');
        const scheme = String(this.options.tileScheme ?? 'xyz').toLowerCase();
        const subs = this._normalizeSubdomains(template).join(',');
        const token = String(this.options.token ?? '');
        const apiKey = String(this.options.apiKey ?? '');
        const accessToken = String(this.options.accessToken ?? '');
        const flipY = !!this.options.flipY;
        return `${template}::${scheme}::${subs}::token=${token}::apiKey=${apiKey}::accessToken=${accessToken}::flipY=${flipY}`;
    }

    _normalizeSubdomains(template = '') {
        const t = String(template ?? '');
        const hasToken = t.includes('{s}');
        const raw = this.options.subdomains;

        let out = [];
        if (Array.isArray(raw)) {
            out = raw.map((v) => String(v)).filter((s) => s.length > 0);
        } else if (typeof raw === 'string') {
            const s = raw.trim();
            if (s.includes(',')) {
                out = s.split(',').map((v) => v.trim()).filter(Boolean);
            } else {
                // Support simple numeric/prefixed ranges:
                // - "0-6" => ["0","1",...,"6"]  (for templates like "http://t{s}.tianditu.gov.cn/...")
                // - "t0-6" => ["t0","t1",...,"t6"]
                const m = /^([a-z]*)(\d+)\s*-\s*(\d+)$/i.exec(s);
                if (m) {
                    const prefix = m[1] || '';
                    const a = Number(m[2]);
                    const b = Number(m[3]);
                    if (Number.isFinite(a) && Number.isFinite(b)) {
                        const lo = Math.min(a, b);
                        const hi = Math.max(a, b);
                        out = [];
                        for (let i = lo; i <= hi; i++) out.push(`${prefix}${i}`);
                    }
                } else if (/^[a-z0-9]+$/i.test(s) && s.length > 1 && !s.includes('.')) {
                    // "abc" -> ["a","b","c"]
                    out = s.split('');
                } else if (s) {
                    out = [s];
                }
            }
        }

        // Reasonable default for common `{s}` patterns like OpenStreetMap.
        if (out.length === 0 && hasToken) out = ['a', 'b', 'c'];
        return out;
    }

    _pickSubdomain(x, y, z, attempt = 0, prev = null) {
        const template = String(this.options.tileUrl ?? '');
        if (!template.includes('{s}')) return null;

        const subs = this._normalizeSubdomains(template);
        if (subs.length === 0) return null;

        const strat = String(this.options.subdomainStrategy ?? 'auto').toLowerCase();
        const useRoundRobin =
            strat === 'roundrobin' ||
            (strat === 'auto' && attempt > 0) ||
            (strat === 'auto' && subs.length <= 1);

        let idx = 0;
        if (useRoundRobin) {
            idx = (this._subdomainCounter++) % subs.length;
        } else {
            idx = Math.abs((x + y + z) | 0) % subs.length;
        }

        let picked = subs[idx] ?? subs[0];
        if (prev !== null && subs.length > 1 && picked === prev) {
            picked = subs[(idx + 1) % subs.length] ?? picked;
        }
        return picked;
    }

    _quadkey(x, y, z) {
        const xx = Number(x) | 0;
        const yy = Number(y) | 0;
        const zz = Math.max(0, Number(z) | 0);
        let out = '';
        for (let i = zz; i > 0; i--) {
            let digit = 0;
            const mask = 1 << (i - 1);
            if ((xx & mask) !== 0) digit += 1;
            if ((yy & mask) !== 0) digit += 2;
            out += String(digit);
        }
        return out;
    }

    _replaceAll(haystack, needle, replacement) {
        const s = String(haystack);
        const n = String(needle);
        if (!n) return s;
        return s.split(n).join(String(replacement ?? ''));
    }

    _formatUrl(x, y, z, options = {}) {
        const template = String(this.options.tileUrl ?? '');
        const scheme = String(this.options.tileScheme ?? 'xyz').toLowerCase();
        const attempt = Number(options.attempt) || 0;
        const prevSub = options.prevSub ?? null;
        const subOverride = options.subdomainOverride ?? null;

        const dim = 2 ** (Number(z) || 0);
        const yTms = dim - 1 - y;
        const yy = (scheme === 'tms') ? yTms : y;
        const qk = this._quadkey(x, y, z);

        const token = this.options.token ?? this.options.apiKey ?? this.options.accessToken ?? null;
        const apiKey = this.options.apiKey ?? token;
        const accessToken = this.options.accessToken ?? token;

        // Support common `{-y}` token (TMS) regardless of selected scheme.
        let url = template
            .replace('{-y}', yTms)
            .replace('{z}', z)
            .replace('{x}', x)
            .replace('{y}', yy)
            // WMTS-style placeholders (e.g. Tianditu)
            .replace('{TILEMATRIX}', z)
            .replace('{TILEROW}', yy)
            .replace('{TILECOL}', x);

        // Bing quadkey style placeholders (raster)
        url = url.replace('{quadkey}', qk).replace('{q}', qk);

        // Token placeholders (multiple common names)
        if (token !== null) {
            url = this._replaceAll(url, '{token}', token);
            url = this._replaceAll(url, '{key}', token);
            url = this._replaceAll(url, '{apiKey}', apiKey);
            url = this._replaceAll(url, '{apikey}', apiKey);
            url = this._replaceAll(url, '{accessToken}', accessToken);
            url = this._replaceAll(url, '{access_token}', accessToken);
        }

        const sub = subOverride !== null ? String(subOverride) : this._pickSubdomain(x, y, z, attempt, prevSub);
        if (sub !== null && url.includes('{s}')) url = url.replace('{s}', sub);
        return url;
    }

    _finalizeTexture(tex) {
        try {
            tex.colorSpace = THREE.SRGBColorSpace;
        } catch {
            // ignore
        }
        tex.flipY = !!this.options.flipY;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = true;

        const maxA = this._renderer?.capabilities?.getMaxAnisotropy?.() ?? 1;
        const desired = Math.max(1, this.options.maxAnisotropy | 0);
        tex.anisotropy = Math.min(desired, maxA);

        return tex;
    }

    async _rateLimitWait() {
        const burst = Math.max(1, Number(this.options.rateLimitBurst) || 1);
        const windowMs = Math.max(1, Number(this.options.rateLimitWindowMs) || 1);
        const cooldownMs = Math.max(0, Number(this.options.rateLimitCooldownMs) || 0);

        // Serialize wait logic so concurrent callers don't all think they're under the cap.
        this._throttleChain = this._throttleChain.then(async () => {
            const now = Date.now();
            if (this._throttle.cooldownUntilMs > now) {
                await sleep(this._throttle.cooldownUntilMs - now);
            }

            const now2 = Date.now();
            const w0 = this._throttle.windowStartMs;
            if (!w0 || (now2 - w0) >= windowMs) {
                this._throttle.windowStartMs = now2;
                this._throttle.startedInWindow = 0;
            }

            this._throttle.startedInWindow++;
            if (this._throttle.startedInWindow > burst) {
                this._throttle.cooldownUntilMs = Date.now() + cooldownMs;
                this._throttle.windowStartMs = 0;
                this._throttle.startedInWindow = 0;
                if (cooldownMs > 0) await sleep(cooldownMs);
            }
        });
        return this._throttleChain;
    }

    async _loadTextureWithRetries(x, y, z) {
        const maxRetries = Math.max(0, Number(this.options.retryCount) || 0);
        const baseDelay = Math.max(0, Number(this.options.retryBaseDelayMs) || 0);
        const maxDelay = Math.max(0, Number(this.options.retryMaxDelayMs) || 0);

        let prevSub = null;
        let lastErr = null;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            await this._rateLimitWait();

            const chosenSub = this._pickSubdomain(x, y, z, attempt, prevSub);
            if (chosenSub !== null) prevSub = chosenSub;
            const url = this._formatUrl(x, y, z, { attempt, prevSub, subdomainOverride: chosenSub });

            try {
                const tex = await new Promise((resolve, reject) => {
                    const loader = new THREE.TextureLoader();
                    loader.setCrossOrigin?.('anonymous');
                    loader.load(url, resolve, undefined, reject);
                });
                return this._finalizeTexture(tex);
            } catch (e) {
                lastErr = e;
                const s = String(e?.message ?? e ?? '');
                const looksRateLimited = s.includes('429') || s.toLowerCase().includes('too many');
                // When it *looks* like rate-limiting, apply a stronger delay.
                const extra = looksRateLimited ? 1000 : 0;
                if (attempt < maxRetries) {
                    const d0 = baseDelay * (2 ** attempt);
                    const d = Math.min(maxDelay || d0 + extra, d0 + extra);
                    if (d > 0) await sleep(d);
                    continue;
                }
                break;
            }
        }
        throw lastErr || new Error('Failed to load texture');
    }

    /**
     * Load a single XYZ tile as THREE.Texture.
     * @returns {Promise<THREE.Texture>}
     */
    getTileTexture(x, y, z) {
        const scheme = String(this.options.tileScheme ?? 'xyz').toLowerCase();
        const key = `t:${scheme}:${z}-${x}-${y}`;
        const existing = this._touch(key);
        if (existing?.promise) return existing.promise;

        const promise = this._queue.schedule(
            () => this._loadTextureWithRetries(x, y, z)
        );

        const entry = { promise, texture: null, evicted: false };
        this._cache.set(key, entry);
        this._evictIfNeeded();

        promise
            .then((tex) => {
                if (entry.evicted) {
                    disposeTexture(tex);
                    return;
                }
                entry.texture = tex;
            })
            .catch(() => {
                // On error remove cache entry so it can retry later.
                if (this._cache.get(key) === entry) this._cache.delete(key);
            });

        return promise;
    }

    /**
     * Get imagery texture corresponding to a terrain tile.
     * If mapZoom == terrainZoom -> direct tile.
     * If mapZoom > terrainZoom -> mosaic 2^diff tiles per side into one CanvasTexture.
     */
    async getTextureForTerrainTile(tileX, tileY, terrainZoom, options = {}) {
        const mapZoom = options.mapZoom ?? terrainZoom;
        const pin = !!options.pin;
        const maxZoomDiff = options.maxZoomDiff ?? 2;
        const tileSize = options.tileSize ?? 256;
        const scheme = String(this.options.tileScheme ?? 'xyz').toLowerCase();

        let z = mapZoom;
        let diff = z - terrainZoom;

        if (diff > maxZoomDiff) {
            const clamped = terrainZoom + maxZoomDiff;
            console.warn(
                `[Terrain] mapZoom(${z}) is too high for terrainZoom(${terrainZoom}); clamping to ${clamped}. ` +
                    `Set config.terrainZoom=${z} or increase mapMaxZoomDiff (may be very slow).`
            );
            z = clamped;
            diff = z - terrainZoom;
        }

        // mapZoom lower than terrainZoom: one imagery tile covers multiple terrain tiles.
        // We return a cloned texture with per-tile uv offset/repeat so it aligns perfectly.
        if (diff < 0) {
            const parentFactor = 1 << (-diff);
            const parentX = Math.floor(tileX / parentFactor);
            const parentY = Math.floor(tileY / parentFactor);
            const localX = ((tileX % parentFactor) + parentFactor) % parentFactor;
            const localY = ((tileY % parentFactor) + parentFactor) % parentFactor;

            const subKey = `s:${scheme}:${terrainZoom}-${tileX}-${tileY}@${z}`;
            if (pin) this.pin(subKey);
            const existing = this._touch(subKey);
            if (existing?.promise) return await existing.promise;

            const promise = (async () => {
                const baseKey = `t:${scheme}:${z}-${parentX}-${parentY}`;
                if (pin) this.pin(baseKey);
                const base = await this.getTileTexture(parentX, parentY, z);
                const sub = base.clone();
                const repeat = 1 / parentFactor;
                // XYZ scheme: y increases south, while PlaneGeometry v=1 at north edge.
                // So we need to invert Y when selecting the sub-rect.
                const offsetX = localX * repeat;
                const offsetY = 1 - (localY + 1) * repeat;
                sub.repeat.set(repeat, repeat);
                sub.offset.set(offsetX, offsetY);
                sub.needsUpdate = true;
                return sub;
            })();

            const entry = { promise, texture: null, evicted: false };
            this._cache.set(subKey, entry);
            this._evictIfNeeded();

            promise
                .then((tex) => {
                    if (!tex) return;
                    if (entry.evicted) {
                        disposeTexture(tex);
                        return;
                    }
                    entry.texture = tex;
                })
                .catch(() => {
                    if (this._cache.get(subKey) === entry) this._cache.delete(subKey);
                });

            return await promise;
        }

        if (diff === 0) {
            const key = `t:${scheme}:${z}-${tileX}-${tileY}`;
            if (pin) this.pin(key);
            return await this.getTileTexture(tileX, tileY, z);
        }

        const mosaicKey = `m:${scheme}:${terrainZoom}-${tileX}-${tileY}@${z}:${tileSize}`;
        if (pin) this.pin(mosaicKey);
        const existing = this._touch(mosaicKey);
        if (existing?.promise) return await existing.promise;

        const mosaicPromise = (async () => {
            const tilesPerSide = 1 << diff;
            const canvas = document.createElement('canvas');
            canvas.width = tileSize * tilesPerSide;
            canvas.height = tileSize * tilesPerSide;
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;

            const baseX = tileX * tilesPerSide;
            const baseY = tileY * tilesPerSide;

            const tasks = [];
            for (let sx = 0; sx < tilesPerSide; sx++) {
                for (let sy = 0; sy < tilesPerSide; sy++) {
                    const x = baseX + sx;
                    const y = baseY + sy;
                    tasks.push(this.getTileTexture(x, y, z).then((tex) => ({ tex, sx, sy })));
                }
            }

            const tiles = await Promise.allSettled(tasks);
            for (const it of tiles) {
                if (it.status !== 'fulfilled') continue;
                const { tex, sx, sy } = it.value;
                const img = tex?.image;
                if (!img) continue;
                ctx.drawImage(img, sx * tileSize, sy * tileSize, tileSize, tileSize);
            }

            const out = new THREE.CanvasTexture(canvas);
            this._finalizeTexture(out);
            out.needsUpdate = true;
            return out;
        })();

        const entry = { promise: mosaicPromise, texture: null, evicted: false };
        this._cache.set(mosaicKey, entry);
        this._evictIfNeeded();

        mosaicPromise
            .then((tex) => {
                if (!tex) return;
                if (entry.evicted) {
                    disposeTexture(tex);
                    return;
                }
                entry.texture = tex;
            })
            .catch(() => {
                if (this._cache.get(mosaicKey) === entry) this._cache.delete(mosaicKey);
            });

        return await mosaicPromise;
    }
}


function pickFirstNonEmpty(...vals) {
    for (const v of vals) {
        if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return null;
}

function normalizeType(t) {
    const s = String(t ?? '').trim().toLowerCase();
    if (!s) return null;
    if (s === 'osm' || s === 'openstreetmap' || s === 'open-street-map') return 'openstreetmap';
    if (s === 'google' || s === 'googlemaps' || s === 'google-map') return 'google';
    if (s === 'tianditu' || s === 'tian-di-tu' || s === 'tdt') return 'tianditu';
    if (s === 'maptiler' || s === 'map-tiler') return 'maptiler';
    if (s === 'mapbox') return 'mapbox';
    if (s === 'bing' || s === 'bingmaps' || s === 'bing-map') return 'bing';
    if (s === 'custom') return 'custom';
    return s;
}

export const BASE_MAP_TYPES = [
    'openstreetmap',
    'google',
    'tianditu',
    'maptiler',
    'mapbox',
    'bing',
    'custom'
];

/**
 * Resolve the effective raster map tile configuration.
 *
 * Precedence:
 * 1) If baseMapType is provided -> use preset (requires token for some providers)
 * 2) Else if mapTileUrl is provided -> use user URL
 * 3) Else -> default OpenStreetMap
 */
export function resolveBaseMapConfig(input = {}) {
    const cfg = input || {};
    const type = normalizeType(cfg.baseMapType);

    const token = pickFirstNonEmpty(
        cfg.mapToken,
        cfg.token,
        cfg.apiKey,
        cfg.key,
        cfg.tiandituToken,
        cfg.tdtToken,
        cfg.maptilerToken,
        cfg.mapboxToken,
        cfg.bingToken
    );

    const mapboxStyle = pickFirstNonEmpty(cfg.mapboxStyle, cfg.mapboxStyleId, cfg.style, cfg.styleId) ?? 'mapbox/satellite-v9';

    // 1) Presets by baseMapType
    if (type && type !== 'custom') {
        if (type === 'openstreetmap') {
            return {
                baseMapType: 'openstreetmap',
                mapTileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                mapYtype: 'xyz',
                mapSubdomains: 'abc',
                templateToken: null
            };
        }

        if (type === 'google') {
            return {
                baseMapType: 'google',
                mapTileUrl: 'https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
                mapYtype: 'xyz',
                mapSubdomains: '0-3',
                templateToken: null
            };
        }

        if (type === 'tianditu') {
            return {
                baseMapType: 'tianditu',
                mapTileUrl:
                    'https://t{s}.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
                    '&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk={token}',
                mapYtype: 'xyz',
                mapSubdomains: '0-6',
                // Tianditu is strict; recommend safer defaults (can be overridden by user config).
                mapMaxConcurrent: 4,
                mapRateLimitBurst: 100,
                mapRateLimitWindowMs: 1000,
                mapRateLimitCooldownMs: 1000,
                mapRetryCount: 2,
                mapRetryBaseDelayMs: 250,
                mapRetryMaxDelayMs: 2000,
                templateToken: token
            };
        }

        if (type === 'maptiler') {
            return {
                baseMapType: 'maptiler',
                mapTileUrl: 'https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key={token}',
                mapYtype: 'xyz',
                mapSubdomains: null,
                templateToken: token
            };
        }

        if (type === 'mapbox') {
            return {
                baseMapType: 'mapbox',
                mapTileUrl:
                    `https://api.mapbox.com/styles/v1/${mapboxStyle}/tiles/256/{z}/{x}/{y}@2x?access_token={token}`,
                mapYtype: 'xyz',
                mapSubdomains: null,
                templateToken: token
            };
        }

        if (type === 'bing') {
            // Note:
            // - Some Bing imagery endpoints work without a key but may be unstable / rate-limited.
            // - If you provide `mapToken`, we'll use the key-based template; otherwise use the no-key template.
            const urlNoKey = 'https://ecn.t{s}.tiles.virtualearth.net/tiles/a{q}.jpeg?g=0&dir=dir_n';
            const urlWithKey = 'https://t{s}.tiles.virtualearth.net/tiles/a{quadkey}.jpeg?g=1&key={token}';
            return {
                baseMapType: 'bing',
                mapTileUrl: token ? urlWithKey : urlNoKey,
                mapYtype: 'xyz',
                // Bing subdomains are typically 0..7 on t0..t7; can be overridden by config.
                mapSubdomains: '0-7',
                templateToken: token
            };
        }
    }

    // 2) Custom: user-supplied mapTileUrl, but still treats baseMapType as explicit selection.
    if (type === 'custom') {
        const customUrl = pickFirstNonEmpty(cfg.mapTileUrl);
        return {
            baseMapType: 'custom',
            mapTileUrl: customUrl ?? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            mapYtype: pickFirstNonEmpty(cfg.mapYtype, cfg.mapYType, cfg.mapTileScheme) ?? 'xyz',
            mapSubdomains: cfg.mapSubdomains ?? cfg.mapSubDomains ?? null,
            templateToken: token
        };
    }

    // 3) User-supplied mapTileUrl
    const userUrl = pickFirstNonEmpty(cfg.mapTileUrl);
    if (!type && userUrl) {
        return {
            baseMapType: null,
            mapTileUrl: userUrl,
            mapYtype: pickFirstNonEmpty(cfg.mapYtype, cfg.mapYType, cfg.mapTileScheme) ?? 'xyz',
            mapSubdomains: cfg.mapSubdomains ?? cfg.mapSubDomains ?? null,
            templateToken: token
        };
    }

    // 4) Default: OpenStreetMap
    return {
        baseMapType: 'openstreetmap',
        mapTileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        mapYtype: 'xyz',
        mapSubdomains: 'abc',
        templateToken: null
    };
}

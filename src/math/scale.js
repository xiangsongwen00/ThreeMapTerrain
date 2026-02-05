export const SCENE_UNITS_PER_METER = 0.01;
export const SCENE_METERS_PER_UNIT = 1 / SCENE_UNITS_PER_METER;

export function metersToUnits(value, unitsPerMeter = SCENE_UNITS_PER_METER) {
    const v = Number(value);
    const s = Number(unitsPerMeter);
    if (!Number.isFinite(v) || !Number.isFinite(s)) return 0;
    return v * s;
}

export function unitsToMeters(value, unitsPerMeter = SCENE_UNITS_PER_METER) {
    const v = Number(value);
    const s = Number(unitsPerMeter);
    if (!Number.isFinite(v) || !Number.isFinite(s) || s === 0) return 0;
    return v / s;
}

export function meters2ToUnits2(value, unitsPerMeter = SCENE_UNITS_PER_METER) {
    const v = Number(value);
    const s = Number(unitsPerMeter);
    if (!Number.isFinite(v) || !Number.isFinite(s)) return 0;
    const k = s * s;
    return v * k;
}

export function units2ToMeters2(value, unitsPerMeter = SCENE_UNITS_PER_METER) {
    const v = Number(value);
    const s = Number(unitsPerMeter);
    if (!Number.isFinite(v) || !Number.isFinite(s) || s === 0) return 0;
    const k = s * s;
    return v / k;
}

export function meters3ToUnits3(value, unitsPerMeter = SCENE_UNITS_PER_METER) {
    const v = Number(value);
    const s = Number(unitsPerMeter);
    if (!Number.isFinite(v) || !Number.isFinite(s)) return 0;
    const k = s * s * s;
    return v * k;
}

export function units3ToMeters3(value, unitsPerMeter = SCENE_UNITS_PER_METER) {
    const v = Number(value);
    const s = Number(unitsPerMeter);
    if (!Number.isFinite(v) || !Number.isFinite(s) || s === 0) return 0;
    const k = s * s * s;
    return v / k;
}

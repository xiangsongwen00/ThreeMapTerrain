export function clampNumber(value, min, max) {
    const v = Number(value);
    const lo = Number.isFinite(min) ? min : -Infinity;
    const hi = Number.isFinite(max) ? max : Infinity;
    if (!Number.isFinite(v)) return Math.max(lo, Math.min(hi, 0));
    return Math.max(lo, Math.min(hi, v));
}

export function nextPow2(value) {
    const v = Math.max(1, value | 0);
    return 1 << (32 - Math.clz32(v - 1));
}

export function distancePointToRect(px, py, rect) {
    if (!rect?.min || !rect?.max) return Infinity;
    const minX = Math.min(rect.min.x, rect.max.x);
    const maxX = Math.max(rect.min.x, rect.max.x);
    const minY = Math.min(rect.min.y, rect.max.y);
    const maxY = Math.max(rect.min.y, rect.max.y);
    const dx = (px < minX) ? (minX - px) : (px > maxX ? (px - maxX) : 0);
    const dy = (py < minY) ? (minY - py) : (py > maxY ? (py - maxY) : 0);
    return Math.hypot(dx, dy);
}

export class MathUtils {
    /**
     * 将角度从弧度转换为度
     * @param {number} radians - 弧度
     * @returns {number} 度数
     */
    radiansToDegrees(radians) {
        return radians * 180.0 / Math.PI;
    }

    /**
     * 将角度从度转换为弧度
     * @param {number} degrees - 度数
     * @returns {number} 弧度
     */
    degreesToRadians(degrees) {
        return degrees * Math.PI / 180.0;
    }
}
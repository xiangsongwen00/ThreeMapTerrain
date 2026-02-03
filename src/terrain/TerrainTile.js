export class TerrainTile {
    constructor(options) {
        this.tileX = options.tileX;
        this.tileY = options.tileY;
        this.tileZ = options.tileZ;
        this.bounds = options.bounds;
        this.segments = options.segments;
        this.mesh = options.mesh;
        this.geometry = options.geometry;
        this.heightmap = options.heightmap;
        // Snapshot of the original terrain surface (used for strict-boundary patch + connection layer)
        this.baseHeightmap = options.baseHeightmap || (options.heightmap ? new Float32Array(options.heightmap) : null);
        this.tileWidth = options.tileWidth;
        this.tileHeight = options.tileHeight;
        // Edge stitching status
        this.edgesStitched = options.edgesStitched || false;
        // Individual edge statuses
        this.edgeStatus = {
            north: false,
            south: false,
            east: false,
            west: false
        };
    }

    getKey() {
        return `${this.tileZ}-${this.tileX}-${this.tileY}`;
    }

    getIndex(row, col) {
        return row * (this.segments + 1) + col;
    }

    applyHeightmapToGeometry() {
        const positions = this.geometry.attributes.position.array;
        for (let i = 0; i < this.heightmap.length; i++) {
            positions[i * 3 + 2] = this.heightmap[i];
        }
        this.geometry.attributes.position.needsUpdate = true;
    }

    // Mark all edges as stitched
    markAllEdgesStitched() {
        this.edgeStatus.north = true;
        this.edgeStatus.south = true;
        this.edgeStatus.east = true;
        this.edgeStatus.west = true;
        this.edgesStitched = true;
    }

    // Mark a specific edge as stitched
    markEdgeStitched(edge) {
        if (this.edgeStatus.hasOwnProperty(edge)) {
            this.edgeStatus[edge] = true;
            // Check if all edges are stitched
            this.edgesStitched = Object.values(this.edgeStatus).every(status => status);
        }
    }

    // Check if all edges are stitched
    areAllEdgesStitched() {
        return this.edgesStitched;
    }

    // Check if a specific edge is stitched
    isEdgeStitched(edge) {
        return this.edgeStatus[edge] || false;
    }

    // Reset edge stitching status
    resetEdgeStatus() {
        this.edgeStatus = {
            north: false,
            south: false,
            east: false,
            west: false
        };
        this.edgesStitched = false;
    }
}

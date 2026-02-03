
export class Tracker {
    constructor() {
        this.resources = new Set();
    }
    
    track(resource) {
        if (!resource) return resource;

        // 处理数组
        if (Array.isArray(resource)) {
            resource.forEach(res => this.track(res));
            return resource;
        }

        // 注册具有 dispose 方法或是 Three.js 资源的资源
        // 优先使用 isX 属性，它比 instanceof 更可靠
        if (resource.dispose || resource.isObject3D || resource.isMaterial || 
            resource.isTexture || resource.isBufferGeometry || 
            resource.isBufferAttribute || resource.isRenderTarget) {
            this.resources.add(resource);
        }

        // 递归追踪 Object3D
        if (resource.isObject3D) {
            this.track(resource.geometry);
            this.track(resource.material);
            this.track(resource.children);
            
            // 特别处理 BufferGeometry
            if (resource.geometry && resource.geometry.isBufferGeometry) {
                this.trackBufferGeometry(resource.geometry);
            }
        } 
        // 递归追踪 Material
        else if (resource.isMaterial) {
            this.trackMaterial(resource);
        }
        // 递归追踪 BufferGeometry
        else if (resource.isBufferGeometry) {
            this.trackBufferGeometry(resource);
        }

        return resource;
    }

    /**
     * 追踪 BufferGeometry 的所有相关资源
     */
    trackBufferGeometry(geometry) {
        if (!geometry || !geometry.attributes) return;

        // 追踪所有 BufferAttributes
        for (const attribute of Object.values(geometry.attributes)) {
            if (attribute && attribute.isBufferAttribute) {
                this.resources.add(attribute);
            }
        }

        // 追踪索引 BufferAttribute
        if (geometry.index && geometry.index.isBufferAttribute) {
            this.resources.add(geometry.index);
        }
    }

    /**
     * 追踪 Material 的所有相关资源
     */
    trackMaterial(material) {
        if (!material) return;

        // 检查所有可能的纹理属性
        const textureProperties = [
            'map', 'alphaMap', 'aoMap', 'lightMap', 'emissiveMap', 
            'bumpMap', 'normalMap', 'displacementMap', 'roughnessMap', 
            'metalnessMap', 'envMap', 'clearcoatMap', 'clearcoatNormalMap', 
            'clearcoatRoughnessMap', 'sheenColorMap', 'sheenRoughnessMap',
            'specularMap', 'specularColorMap', 'specularIntensityMap',
            'transmissionMap', 'thicknessMap', 'iorMap', 'iridescenceMap', 
            'iridescenceThicknessMap'
        ];

        for (const prop of textureProperties) {
            if (material[prop] && material[prop].isTexture) {
                this.track(material[prop]);
            }
        }

        // 检查 uniforms 中的纹理
        if (material.uniforms) {
            for (const uniform of Object.values(material.uniforms)) {
                if (uniform && uniform.value) {
                    if (uniform.value.isTexture) {
                        this.track(uniform.value);
                    } else if (Array.isArray(uniform.value)) {
                        uniform.value.forEach(val => {
                            if (val && val.isTexture) this.track(val);
                        });
                    }
                }
            }
        }
    }

    untrack(resource) {
        this.resources?.delete(resource);
    }

    dispose() {
        if (!this.resources) return;

        // 先移除所有 Object3D
        for (const resource of this.resources) {
            if (resource.isObject3D && resource.parent) {
                resource.parent.remove(resource);
            }
        }

        // 然后释放其他资源
        for (const resource of this.resources) {
            try {
                if (resource.dispose) {
                    resource.dispose();
                }
                
                // 特别处理 BufferGeometry 和 BufferAttribute
                if (resource.isBufferGeometry) {
                    this.disposeBufferGeometry(resource);
                }
            } catch (error) {
                console.warn('ResourceTracker dispose error:', error, resource);
            }
        }

        this.resources.clear();
    }

    /**
     * 安全释放 BufferGeometry
     */
    disposeBufferGeometry(geometry) {
        if (!geometry || !geometry.attributes) return;

        // 释放所有 BufferAttributes
        for (const attribute of Object.values(geometry.attributes)) {
            if (attribute && attribute.isBufferAttribute) {
                // 清除数组引用以帮助垃圾回收
                attribute.array = null;
            }
        }

        // 释放索引 BufferAttribute
        if (geometry.index && geometry.index.isBufferAttribute) {
            geometry.index.array = null;
        }

        // 清理 geometry 引用
        geometry.attributes = {};
        geometry.index = null;
    }

    /**
     * 获取资源统计信息（调试用）
     */
    getStats() {
        const stats = {
            total: this.resources.size,
            object3Ds: 0,
            geometries: 0,
            materials: 0,
            textures: 0
        };

        for (const resource of this.resources) {
            if (resource.isObject3D) stats.object3Ds++;
            if (resource.isBufferGeometry) stats.geometries++;
            if (resource.isMaterial) stats.materials++;
            if (resource.isTexture) stats.textures++;
        }

        return stats;
    }
}
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Tracker } from './tracker.js';

/**
 * 模型管理器，用于管理模型的加载、位置、姿态、动画等
 */
export class ModelManager {
    /**
     * 构造函数
     * @param {Object} options - 配置选项
     * @param {THREE.Scene} options.scene - Three.js场景
     * @param {Object} options.rgbTerrain - 地形实例，用于查询地形高度
     * @param {Object} options.mathProj - 坐标转换工具
     */
    constructor(options) {
        this.options = {
            scene: null,
            rgbTerrain: null,
            mathProj: null,
            ...options
        };

        this.scene = this.options.scene;
        this.rgbTerrain = this.options.rgbTerrain;
        this.mathProj = this.options.mathProj;

        // 模型资源跟踪器
        this.tracker = new Tracker();

        // 已加载的模型映射
        this.loadedModels = new Map();

        // GLTF加载器
        this.loader = new GLTFLoader();

        // 模型默认配置
        this.defaultConfig = {
            position: new THREE.Vector3(0, 0, 0),
            rotation: new THREE.Euler(0, 0, 0),
            scale: new THREE.Vector3(1, 1, 1),
            animation: {
                enabled: false,
                clipIndex: 0,
                speed: 1.0,
                loop: true
            }
        };
        
        // 动画帧率
        this.frameRate = 60;
    }

    /**
     * 加载模型
     * @param {string} modelId - 模型唯一标识
     * @param {string} modelPath - 模型文件路径
     * @param {Object} config - 模型配置
     * @returns {Promise<Object>} 加载的模型对象
     */
    loadModel(modelId, modelPath, config = {}) {
        return new Promise((resolve, reject) => {
            // 检查模型是否已加载
            if (this.loadedModels.has(modelId)) {
                resolve(this.loadedModels.get(modelId));
                return;
            }

            // 合并默认配置
            const modelConfig = { ...this.defaultConfig, ...config };

            // 加载GLTF模型
            this.loader.load(
                modelPath,
                (gltf) => {
                    try {
                        // 获取模型的根对象
                        const model = gltf.scene;

                        // 跟踪模型资源
                        this.tracker.track(model);

                        // 设置模型配置
                        model.userData.config = modelConfig;

                        // 初始化动画
                        model.userData.animations = gltf.animations;
                        model.userData.animationMixer = null;
                        model.userData.animationActions = [];
                        model.userData.currentAction = null;

                        // 初始化模型独立的动画控制状态
                        model.userData.animationControl = {
                            enabled: modelConfig.animation.enabled || true,
                            paused: false,
                            frameRate: 60,
                            deltaTime: 1 / 60
                        };

                        // 如果有动画，初始化动画混合器和动作，但不自动播放
            if (model.userData.animations.length > 0) {
                model.userData.animationMixer = new THREE.AnimationMixer(model);

                // 创建所有动画动作
                model.userData.animations.forEach((clip) => {
                    const action = model.userData.animationMixer.clipAction(clip);
                    model.userData.animationActions.push(action);
                });

                // 初始化模型独立的动画控制状态
                model.userData.animationControl = {
                    enabled: modelConfig.animation.enabled || false,
                    paused: true,
                    frameRate: this.frameRate,
                    deltaTime: 1 / this.frameRate
                };
            }

                        // 保存模型基本信息
                        model.userData.modelId = modelId;
                        model.userData.modelPath = modelPath;
                        model.userData.name = config.name || modelId;
                        model.userData.info = config.info || {};

                        // 保存模型
                        this.loadedModels.set(modelId, model);

                        // 添加到场景
                        this.scene.add(model);

                        console.log(`模型加载成功: ${modelId}`);
                        resolve(model);
                    } catch (error) {
                        console.error(`模型初始化失败: ${modelId}`, error);
                        reject(error);
                    }
                },
                undefined,
                (error) => {
                    console.error(`模型加载失败: ${modelId}`, error);
                    reject(error);
                }
            );
        });
    }

    /**
     * 根据经纬度放置模型
     * @param {string} modelId - 模型唯一标识
     * @param {number} lon - 经度
     * @param {number} lat - 纬度
     * @param {number} heightOffset - 高度偏移量
     * @returns {Promise<Object>} 更新后的模型对象
     */
    placeModelAtLonLat(modelId, lon, lat, heightOffset = 0) {
        return new Promise((resolve, reject) => {
            try {
                // 获取模型
                const model = this.loadedModels.get(modelId);
                if (!model) {
                    reject(new Error(`模型不存在: ${modelId}`));
                    return;
                }

                // 将经纬度转换为Three.js坐标
                const mercatorCoord = this.mathProj.lonLatToMercator(lon, lat);
                const threeCoord = this.mathProj.mercatorToThree(mercatorCoord.x, mercatorCoord.y);

                // 查询地形高度
                const terrainHeight = this.rgbTerrain.getTerrainHeight(threeCoord.x, threeCoord.z);

                // 设置模型位置
                const position = new THREE.Vector3(
                    threeCoord.x,
                    terrainHeight + heightOffset,
                    threeCoord.z
                );

                model.position.copy(position);
                model.userData.config.position.copy(position);

                console.log(`模型已放置在经纬度 (${lon}, ${lat})，地形高度: ${terrainHeight.toFixed(2)}米`);
                resolve(model);
            } catch (error) {
                console.error(`模型放置失败: ${modelId}`, error);
                reject(error);
            }
        });
    }

    /**
     * 设置模型位置
     * @param {string} modelId - 模型唯一标识
     * @param {THREE.Vector3|Array<number>} position - 模型位置
     */
    setModelPosition(modelId, position) {
        const model = this.loadedModels.get(modelId);
        if (!model) return;

        if (Array.isArray(position)) {
            model.position.set(...position);
            model.userData.config.position.set(...position);
        } else {
            model.position.copy(position);
            model.userData.config.position.copy(position);
        }
    }

    /**
     * 设置模型类型
     * @param {string} modelId - 模型唯一标识
     * @param {string} type - 模型类型
     */
    setModelType(modelId, type) {
        const model = this.loadedModels.get(modelId);
        if (!model) return;

        model.userData.type = type;
    }

    /**
     * 获取模型类型
     * @param {string} modelId - 模型唯一标识
     * @returns {string} 模型类型
     */
    getModelType(modelId) {
        const model = this.loadedModels.get(modelId);
        if (!model) return null;

        return model.userData.type || 'Others';
    }

    /**
     * 获取所有模型列表
     * @returns {Array} 模型列表，包含id、name、type、info等信息
     */
    getModels() {
        const models = [];

        for (const [modelId, model] of this.loadedModels) {
            models.push({
                id: modelId,
                name: model.userData.name || modelId,
                type: model.userData.type || 'Others',
                info: model.userData.info || {},
                position: model.position.clone(),
                rotation: model.rotation.clone(),
                scale: model.scale.clone()
            });
        }

        return models;
    }

    /**
     * 设置模型旋转
     * @param {string} modelId - 模型唯一标识
     * @param {THREE.Euler|Array<number>} rotation - 模型旋转角
     */
    setModelRotation(modelId, rotation) {
        const model = this.loadedModels.get(modelId);
        if (!model) return;

        if (Array.isArray(rotation)) {
            model.rotation.set(...rotation);
            model.userData.config.rotation.set(...rotation);
        } else {
            model.rotation.copy(rotation);
            model.userData.config.rotation.copy(rotation);
        }
    }

    /**
     * 设置模型缩放
     * @param {string} modelId - 模型唯一标识
     * @param {THREE.Vector3|Array<number>} scale - 模型缩放
     */
    setModelScale(modelId, scale) {
        const model = this.loadedModels.get(modelId);
        if (!model) return;

        if (Array.isArray(scale)) {
            model.scale.set(...scale);
            model.userData.config.scale.set(...scale);
        } else {
            model.scale.copy(scale);
            model.userData.config.scale.copy(scale);
        }
    }

    /**
     * 播放模型动画
     * @param {string} modelId - 模型唯一标识
     * @param {number} clipIndex - 动画剪辑索引
     * @param {Object} options - 动画选项
     */
    playAnimation(modelId, clipIndex = 0, options = {}) {
        const model = this.loadedModels.get(modelId);
        if (!model || !model.userData.animationMixer) return;

        // 停止当前动画
        if (model.userData.currentAction) {
            model.userData.currentAction.stop();
        }

        // 获取指定的动画动作
        const action = model.userData.animationActions[clipIndex];
        if (!action) return;

        // 计算动画的起始时间（基于起始帧）
        const startFrame = options.startFrame || 0;
        const endFrame = options.endFrame;
        const frameRate = this.frameRate;
        const clipDuration = action.getClip().duration;
        
        // 计算总帧数
        const totalClipFrames = Math.floor(clipDuration * frameRate);
        
        // 计算起始时间和结束时间（秒）
        const startTime = (startFrame / frameRate);
        const endTime = endFrame ? (endFrame / frameRate) : clipDuration;

        // 设置动画选项
        const animationConfig = model.userData.config.animation;
        animationConfig.enabled = true;
        animationConfig.clipIndex = clipIndex;
        animationConfig.speed = options.speed || animationConfig.speed;
        animationConfig.loop = options.loop !== undefined ? options.loop : animationConfig.loop;
        animationConfig.startFrame = startFrame;
        animationConfig.endFrame = endFrame || totalClipFrames;
        animationConfig.startTime = startTime;
        animationConfig.endTime = endTime;
        animationConfig.frameRate = frameRate;

        // 设置动画速度和循环模式
        if (action.setEffectiveTimeScale) {
            action.setEffectiveTimeScale(animationConfig.speed);
        } else if (action.setSpeed) {
            action.setSpeed(animationConfig.speed);
        }

        if (action.setLoop) {
            action.setLoop(animationConfig.loop ? THREE.LoopRepeat : THREE.LoopOnce);
        } else if (action.loop) {
            action.loop = animationConfig.loop ? THREE.LoopRepeat : THREE.LoopOnce;
        }

        // 关键：直接设置动作的时间，而不是通过mixer.setTime
        action.time = startTime;
        
        // 播放动画
        action.play();
        action.paused = false;
        
        // 更新混合器时间
        model.userData.animationMixer.update(0);
        
        model.userData.currentAction = action;
        
        // 保存开始时间，用于updateAnimations中计算
        model.userData.animationStartTime = Date.now();
        
        console.log(`播放动画: 剪辑索引 ${clipIndex}, 起始帧 ${startFrame}, 结束帧 ${animationConfig.endFrame}, 起始时间 ${startTime}s`);
    }




    /**
     * 执行模型动作
     * @param {string} modelId - 模型唯一标识
     * @param {string} actionType - 动作类型
     */
    async executeModelAction(modelId, actionType) {
        const model = this.loadedModels.get(modelId);
        if (!model || !model.userData.animationMixer) return;
        
        // 加载动画配置
        let animationConfig;
        try {
            // 使用动态导入加载JSON配置
            const response = await fetch('./src/model/animationConfig.json');
            animationConfig = await response.json();
        } catch (error) {
            console.error('加载动画配置失败:', error);
            return;
        }
        
        // 获取模型类型
        const modelType = model.userData.type || 'Others';
        
        // 获取该类型模型的动作配置
        const modelConfig = animationConfig[modelType] || animationConfig['Others'];
        const actionConfig = modelConfig.actions[actionType];
        
        if (!actionConfig) {
            console.error(`模型类型 ${modelType} 没有动作 ${actionType}`);
            return;
        }
        
        // 获取起始帧和结束帧
        const { startFrame, endFrame, loop } = actionConfig;
        
        // 使用playAnimationFrameRange函数创建动画控制器
        const clipIndex = model.userData.config.animation.clipIndex || 0;
        
        // 定义动画完成回调函数，如果需要循环执行，则重新播放
        const onComplete = loop ? () => {
            // 循环执行，重新创建动画控制器并播放
            this.executeModelAction(modelId, actionType);
        } : undefined;
        
        // 创建动画控制器
        const animationController = this.playAnimationFrameRange(modelId, clipIndex, startFrame, endFrame, {
            fps: this.frameRate,
            onComplete
        });
        
        // 播放动画
        if (animationController) {
            animationController.play();
            console.log(`执行动作 ${actionType}，起始帧：${startFrame}，结束帧：${endFrame}，循环：${loop}`);
        }
    }



    /**
     * 执行指定模型的动画帧范围
     * @param {string} modelId - 模型唯一标识
     * @param {number} animationIndex - 动画索引
     * @param {number} startFrame - 起始帧
     * @param {number} endFrame - 结束帧
     * @param {Object} options - 可选配置
     * @param {number} options.fps - 帧率，默认为60
     * @param {Function} options.onFrameUpdate - 每一帧更新时的回调函数
     * @param {Function} options.onComplete - 动画完成时的回调函数
     * @returns {Object} - 包含控制方法的对象
     */
    playAnimationFrameRange(modelId, animationIndex = 0, startFrame, endFrame, options = {}) {
        // 获取模型
        const model = this.loadedModels.get(modelId);
        if (!model || !model.userData.animationMixer) return null;

        // 默认配置
        const config = {
            fps: options.fps || this.frameRate,
            onFrameUpdate: options.onFrameUpdate || (() => {}),
            onComplete: options.onComplete || (() => {})
        };
        
        // 检查参数
        const animations = model.userData.animations;
        if (!animations || animations.length === 0) {
            console.error('Animations array is empty');
            return null;
        }
        
        if (animationIndex < 0 || animationIndex >= animations.length) {
            console.error('Invalid animation index');
            return null;
        }
        
        if (startFrame < 0 || endFrame <= startFrame) {
            console.error('Invalid frame range');
            return null;
        }
        
        // 获取动画片段
        const clip = animations[animationIndex];
        const totalFrames = Math.floor(clip.duration * config.fps);
        
        if (endFrame > totalFrames) {
            console.warn(`End frame ${endFrame} exceeds total frames ${totalFrames}, adjusting to ${totalFrames}`);
            endFrame = totalFrames;
        }
        
        // 停止当前动画
        if (model.userData.currentAction) {
            model.userData.currentAction.stop();
        }
        
        // 使用现有的混合器
        const mixer = model.userData.animationMixer;
        
        // 获取或创建动作
        let action = model.userData.animationActions[animationIndex];
        if (!action) {
            action = mixer.clipAction(clip);
            model.userData.animationActions[animationIndex] = action;
        }
        
        // 转换帧为时间
        const startSeconds = startFrame / config.fps;
        const endSeconds = endFrame / config.fps;
        
        // 状态变量
        let isPlaying = false;
        let startTime = 0;
        let animationId = null;
        
        // 保存动作配置到模型
        model.userData.currentActionConfig = {
            animationIndex,
            startFrame,
            endFrame,
            fps: config.fps
        };
        
        // 动画循环
        function animate(timestamp) {
            if (!isPlaying) return;
            
            if (startTime === 0) {
                startTime = timestamp;
            }
            
            // 计算经过的时间
            const elapsedSeconds = (timestamp - startTime) / 1000;
            
            // 计算当前时间
            const currentSeconds = startSeconds + elapsedSeconds;
            
            // 检查是否结束
            if (currentSeconds >= endSeconds) {
                isPlaying = false;
                action.paused = true;
                config.onComplete();
                return;
            }
            
            // 设置动作时间
            action.time = currentSeconds;
            mixer.update(0);
            
            // 计算当前帧
            const currentFrame = Math.floor(currentSeconds * config.fps);
            
            // 调用回调
            config.onFrameUpdate(currentFrame, currentSeconds);
            
            // 继续动画循环
            animationId = requestAnimationFrame(animate);
        }
        
        // 保存动画控制器到模型
        const animationController = {
            // 播放动画
            play: function() {
                if (isPlaying) return;
                
                // 设置起始时间
                action.time = startSeconds;
                mixer.update(0);
                
                // 播放动作
                action.play();
                action.paused = false;
                
                // 开始播放循环
                isPlaying = true;
                startTime = 0;
                
                // 启动动画循环
                animationId = requestAnimationFrame(animate);
                
                console.log(`Playing animation from frame ${startFrame} to ${endFrame}`);
            },
            
            // 暂停动画
            pause: function() {
                isPlaying = false;
                action.paused = true;
                if (animationId) {
                    cancelAnimationFrame(animationId);
                    animationId = null;
                }
            },
            
            // 停止动画
            stop: function() {
                isPlaying = false;
                action.stop();
                if (animationId) {
                    cancelAnimationFrame(animationId);
                    animationId = null;
                }
            },
            
            // 获取当前状态
            getState: function() {
                return {
                    isPlaying,
                    currentFrame: Math.floor(action.time * config.fps),
                    currentSeconds: action.time,
                    startFrame,
                    endFrame
                };
            }
        };
        
        // 保存当前动画控制器
        model.userData.currentAnimationController = animationController;
        model.userData.currentAction = action;
        
        return animationController;
    }
    
    /**
     * 更新模型动画
     * @param {number} deltaTime - 可选，自定义时间增量
     */
    updateAnimations(deltaTime = null) {
        // 遍历所有模型，更新动画
        for (const model of this.loadedModels.values()) {
            // 检查模型是否有动画混合器和当前动作
            if (!model.userData.animationMixer || !model.userData.currentAction) {
                continue;
            }
            
            // 获取模型的动画控制状态和配置
            const modelAnimControl = model.userData.animationControl || {};
            
            // 更新该模型的动画
            const actualDeltaTime = deltaTime || (modelAnimControl.deltaTime || 1 / this.frameRate);
            model.userData.animationMixer.update(actualDeltaTime);
        }
    }



    /**
     * 移除模型
     * @param {string} modelId - 模型唯一标识
     */
    removeModel(modelId) {
        const model = this.loadedModels.get(modelId);
        if (!model) return;

        // 从场景中移除
        if (model.parent) {
            model.parent.remove(model);
        }

        // 停止动画
        this.stopAnimation(modelId);

        // 从跟踪器中移除
        this.tracker.untrack(model);

        // 从映射中移除
        this.loadedModels.delete(modelId);

        console.log(`模型已移除: ${modelId}`);
    }

    /**
     * 获取模型
     * @param {string} modelId - 模型唯一标识
     * @returns {THREE.Object3D|null} 模型对象
     */
    getModel(modelId) {
        return this.loadedModels.get(modelId) || null;
    }

    /**
     * 清理所有资源
     */
    dispose() {
        // 停止所有动画
        for (const modelId of this.loadedModels.keys()) {
            this.stopAnimation(modelId);
        }

        // 释放所有资源
        this.tracker.dispose();

        // 清空模型映射
        this.loadedModels.clear();

        console.log('模型管理器已清理');
    }
}
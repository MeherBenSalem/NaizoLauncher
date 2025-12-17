const path = require('path');
const os = require('os');
const { getFullVersionMetadata } = require('../file-manager/version-manifest');

/**
 * Build classpath string from libraries
 */
function buildClasspath(gameDir, version, libraries) {
    const paths = [];

    // Add all libraries
    for (const lib of libraries) {
        if (!lib.isNative) {
            const libPath = path.join(gameDir, 'libraries', lib.path);
            paths.push(libPath);
        }
    }

    // Add client JAR
    const clientPath = path.join(gameDir, 'versions', version, `${version}.jar`);
    paths.push(clientPath);

    // Join with platform-specific separator
    const separator = process.platform === 'win32' ? ';' : ':';
    return paths.join(separator);
}

/**
 * Build JVM arguments
 */
async function buildJVMArguments(config, gameDir, version, libraries) {
    const args = [];

    // Memory arguments
    args.push(`-Xms${config.jvm_args.min_ram}`);
    args.push(`-Xmx${config.jvm_args.max_ram}`);

    // Add custom JVM arguments
    if (config.jvm_args.custom_args && config.jvm_args.custom_args.length > 0) {
        args.push(...config.jvm_args.custom_args);
    }

    // Natives directory
    const nativesDir = path.join(gameDir, 'natives', version);
    args.push(`-Djava.library.path=${nativesDir}`);

    // Classpath
    const classpath = buildClasspath(gameDir, version, libraries);
    args.push('-cp');
    args.push(classpath);

    // Get version metadata for additional JVM arguments
    try {
        const metadata = await getFullVersionMetadata(version);

        if (metadata.arguments && metadata.arguments.jvm) {
            for (const arg of metadata.arguments.jvm) {
                if (typeof arg === 'string') {
                    // Replace variables
                    const processedArg = replaceVariables(arg, {
                        natives_directory: nativesDir,
                        launcher_name: 'naizo-launcher',
                        launcher_version: '1.0.0',
                        classpath: classpath
                    });
                    args.push(processedArg);
                } else if (arg.rules) {
                    // Check if rule applies
                    if (checkRules(arg.rules)) {
                        if (typeof arg.value === 'string') {
                            args.push(replaceVariables(arg.value, {
                                natives_directory: nativesDir,
                                launcher_name: 'naizo-launcher',
                                launcher_version: '1.0.0',
                                classpath: classpath
                            }));
                        } else if (Array.isArray(arg.value)) {
                            args.push(...arg.value.map(v => replaceVariables(v, {
                                natives_directory: nativesDir,
                                launcher_name: 'naizo-launcher',
                                launcher_version: '1.0.0',
                                classpath: classpath
                            })));
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.warn('Could not fetch version metadata for JVM args:', error.message);
    }

    return args;
}

/**
 * Build game arguments
 */
async function buildGameArguments(config, gameDir, version, playerProfile) {
    const args = [];

    try {
        const metadata = await getFullVersionMetadata(version);

        if (metadata.arguments && metadata.arguments.game) {
            for (const arg of metadata.arguments.game) {
                if (typeof arg === 'string') {
                    const processedArg = replaceVariables(arg, {
                        auth_player_name: playerProfile.username,
                        version_name: version,
                        game_directory: gameDir,
                        assets_root: path.join(gameDir, 'assets'),
                        assets_index_name: metadata.assetIndex.id,
                        auth_uuid: playerProfile.uuid,
                        auth_access_token: playerProfile.accessToken,
                        auth_xuid: playerProfile.xuid || '',
                        clientid: playerProfile.clientToken || playerProfile.accessToken,
                        user_type: playerProfile.userType,
                        version_type: metadata.type || 'release',
                        resolution_width: config.window.width.toString(),
                        resolution_height: config.window.height.toString(),
                        quickPlayPath: '',
                        quickPlaySingleplayer: '',
                        quickPlayMultiplayer: '',
                        quickPlayRealms: ''
                    });
                    args.push(processedArg);
                } else if (arg.rules) {
                    if (checkRules(arg.rules)) {
                        if (typeof arg.value === 'string') {
                            args.push(replaceVariables(arg.value, {
                                auth_player_name: playerProfile.username,
                                version_name: version,
                                game_directory: gameDir,
                                assets_root: path.join(gameDir, 'assets'),
                                assets_index_name: metadata.assetIndex.id,
                                auth_uuid: playerProfile.uuid,
                                auth_access_token: playerProfile.accessToken,
                                auth_xuid: playerProfile.xuid || '',
                                clientid: playerProfile.clientToken || playerProfile.accessToken,
                                user_type: playerProfile.userType,
                                version_type: metadata.type || 'release',
                                resolution_width: config.window.width.toString(),
                                resolution_height: config.window.height.toString(),
                                quickPlayPath: '',
                                quickPlaySingleplayer: '',
                                quickPlayMultiplayer: '',
                                quickPlayRealms: ''
                            }));
                        } else if (Array.isArray(arg.value)) {
                            args.push(...arg.value);
                        }
                    }
                }
            }
        } else {
            // Fallback to legacy minecraftArguments
            if (metadata.minecraftArguments) {
                const legacyArgs = metadata.minecraftArguments.split(' ');
                args.push(...legacyArgs.map(arg => replaceVariables(arg, {
                    auth_player_name: playerProfile.username,
                    version_name: version,
                    game_directory: gameDir,
                    assets_root: path.join(gameDir, 'assets'),
                    assets_index_name: metadata.assetIndex.id,
                    auth_uuid: playerProfile.uuid,
                    auth_access_token: playerProfile.accessToken,
                    auth_xuid: playerProfile.xuid || '',
                    clientid: playerProfile.clientToken || playerProfile.accessToken,
                    user_type: playerProfile.userType,
                    version_type: metadata.type || 'release',
                    resolution_width: config.window.width.toString(),
                    resolution_height: config.window.height.toString(),
                    quickPlayPath: '',
                    quickPlaySingleplayer: '',
                    quickPlayMultiplayer: '',
                    quickPlayRealms: ''
                })));
            }
        }

        // Add fullscreen if configured
        if (config.window.fullscreen) {
            args.push('--fullscreen');
        }

        // Add server auto-connect if configured
        if (config.server_ip) {
            const [ip, port] = config.server_ip.split(':');
            args.push('--server', ip);
            if (port) {
                args.push('--port', port);
            }
        }

    } catch (error) {
        console.error('Error building game arguments:', error);
        throw error;
    }

    // CRITICAL: Remove --demo flag if it exists (prevents demo mode)
    const demoIndex = args.indexOf('--demo');
    if (demoIndex !== -1) {
        args.splice(demoIndex, 1);
    }

    return args;
}

/**
 * Replace variables in argument string
 */
function replaceVariables(str, variables) {
    let result = str;

    for (const [key, value] of Object.entries(variables)) {
        // Use a more robust regex pattern
        const pattern = `\\$\\{${key}\\}`;
        result = result.replace(new RegExp(pattern, 'g'), value);
    }

    return result;
}

/**
 * Check if rules apply to current system
 */
function checkRules(rules) {
    for (const rule of rules) {
        // Skip demo-related rules to prevent demo mode
        if (rule.features && rule.features.is_demo_user === true) {
            return false;
        }
        if (rule.features && rule.features.has_custom_resolution === true) {
            return false;
        }

        if (rule.action === 'allow') {
            if (rule.os) {
                if (!matchesOS(rule.os)) {
                    return false;
                }
            }
            if (rule.features) {
                // Skip feature checks for now
                continue;
            }
            return true;
        } else if (rule.action === 'disallow') {
            if (rule.os && matchesOS(rule.os)) {
                return false;
            }
        }
    }

    return true;
}

/**
 * Check if current OS matches rule
 */
function matchesOS(osRule) {
    const platform = process.platform;

    if (osRule.name) {
        if (platform === 'win32' && osRule.name !== 'windows') return false;
        if (platform === 'darwin' && osRule.name !== 'osx') return false;
        if (platform === 'linux' && osRule.name !== 'linux') return false;
    }

    if (osRule.version) {
        const osVersion = os.release();
        const versionRegex = new RegExp(osRule.version);
        if (!versionRegex.test(osVersion)) return false;
    }

    return true;
}

module.exports = {
    buildJVMArguments,
    buildGameArguments,
    buildClasspath
};

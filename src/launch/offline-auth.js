const crypto = require('crypto');

/**
 * Generate offline UUID from username
 * Uses MD5 hashing to create a UUID compatible with Minecraft's offline mode
 */
function generateOfflineUUID(username) {
    // Create MD5 hash of "OfflinePlayer:username"
    const hash = crypto.createHash('md5').update(`OfflinePlayer:${username}`).digest();

    // Set version to 3 (name-based MD5 UUID)
    hash[6] = (hash[6] & 0x0f) | 0x30;
    // Set variant to RFC4122
    hash[8] = (hash[8] & 0x3f) | 0x80;

    // Format as UUID string
    const uuid = [
        hash.slice(0, 4).toString('hex'),
        hash.slice(4, 6).toString('hex'),
        hash.slice(6, 8).toString('hex'),
        hash.slice(8, 10).toString('hex'),
        hash.slice(10, 16).toString('hex')
    ].join('-');

    return uuid;
}

/**
 * Create offline player profile
 */
function createOfflineProfile(username) {
    const uuid = generateOfflineUUID(username);
    const accessToken = uuid.replace(/-/g, '');
    return {
        username: username,
        uuid: uuid,
        // Use a valid-looking token (reuse UUID) instead of '0' for better compatibility
        accessToken: accessToken,
        // Modern Minecraft expects additional auth properties
        clientToken: accessToken, // Client token for session validation
        xuid: null, // Xbox User ID (null for offline)
        user_type: 'mojang', // Changed from userType to user_type to match Minecraft arguments
        // userType is the property name in our code, user_type is what Minecraft expects in arguments
        userType: 'mojang'
    };
}

module.exports = {
    generateOfflineUUID,
    createOfflineProfile
};

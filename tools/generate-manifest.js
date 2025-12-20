const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configuration
const SOURCE_DIR = './modpack-source'; // Put your mods/config folders here
const OUTPUT_FILE = './modpack.json';
// CHANGE THIS to your actual raw file host URL (e.g. GitHub raw link)
const BASE_URL = 'https://raw.githubusercontent.com/MeherBenSalem/NaizoLauncher/main/modpack-source';

/**
 * Files that regenerate on each Minecraft launch with unique data.
 * Exclude these from the manifest to prevent false "update required" detection.
 */
const EXCLUDE_PATTERNS = [
    'sodium-fingerprint.json',
    'username-cache.json',
    'usernamecache.json',
    'yosbr/options.txt'
];

/**
 * Calculate SHA1 hash of a file
 */
function getFileSha1(filePath) {
    const fileBuffer = fs.readFileSync(filePath);
    return crypto.createHash('sha1').update(fileBuffer).digest('hex');
}

/**
 * Scan directory recursively
 */
function scanDirectory(dir, fileList = []) {
    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            scanDirectory(filePath, fileList);
        } else {
            // Get path relative to SOURCE_DIR
            const relativePath = path.relative(SOURCE_DIR, filePath).replace(/\\/g, '/');

            // Skip hidden files, the generator script, and volatile files
            const isExcluded = EXCLUDE_PATTERNS.some(pattern => relativePath.includes(pattern));
            if (!file.startsWith('.') && file !== 'generate-manifest.js' && !isExcluded) {
                console.log(`Processing: ${relativePath}`);

                fileList.push({
                    path: relativePath, // e.g., "mods/fabric-api.jar"
                    sha1: getFileSha1(filePath),
                    size: stat.size,
                    url: `${BASE_URL}/${relativePath}` // Construct predictable URL
                });
            }
        }
    });

    return fileList;
}

// Main execution
try {
    if (!fs.existsSync(SOURCE_DIR)) {
        console.error(`Error: Source directory '${SOURCE_DIR}' not found!`);
        console.log('Please create a "modpack-source" folder and put your "mods" and "config" folders inside it.');
        process.exit(1);
    }

    console.log('Scanning files...');
    const files = scanDirectory(SOURCE_DIR);

    const manifest = {
        version: "1.0.0", // You can increment this manually or automatically
        files: files
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2));
    console.log(`\nSuccess! Generated ${OUTPUT_FILE} with ${files.length} files.`);
    console.log(`\nIMPORTANT:`);
    console.log(`1. Upload the contents of "${SOURCE_DIR}" to your host.`);
    console.log(`2. Update the "BASE_URL" in this script if needed.`);
    console.log(`3. Upload "modpack.json" to a location where the launcher can reach it.`);

} catch (error) {
    console.error('Failed to generate manifest:', error);
}

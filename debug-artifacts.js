const fs = require('fs');
const path = require('path');

const DEFAULT_DEBUG_SCREENSHOT_DIR = path.join('product_files', 'debug_screenshots');

function getDebugArtifactsRoot() {
    const configuredDir = String(process.env.DEBUG_SCREENSHOT_DIR || '').trim();
    const targetDir = configuredDir || DEFAULT_DEBUG_SCREENSHOT_DIR;
    return path.isAbsolute(targetDir)
        ? targetDir
        : path.join(__dirname, targetDir);
}

function ensureDebugArtifactDir(scope = '') {
    const dirPath = scope
        ? path.join(getDebugArtifactsRoot(), scope)
        : getDebugArtifactsRoot();
    fs.mkdirSync(dirPath, { recursive: true });
    return dirPath;
}

function buildDebugArtifactPath(scope, prefix, extension = '.png', timestamp = Date.now()) {
    const normalizedExtension = String(extension || '.png').startsWith('.')
        ? String(extension || '.png')
        : `.${String(extension || 'png')}`;
    return path.join(
        ensureDebugArtifactDir(scope),
        `${prefix}_${timestamp}${normalizedExtension}`
    );
}

function buildDebugScreenshotPath(scope, prefix, timestamp = Date.now()) {
    return buildDebugArtifactPath(scope, prefix, '.png', timestamp);
}

module.exports = {
    DEFAULT_DEBUG_SCREENSHOT_DIR,
    getDebugArtifactsRoot,
    ensureDebugArtifactDir,
    buildDebugArtifactPath,
    buildDebugScreenshotPath
};

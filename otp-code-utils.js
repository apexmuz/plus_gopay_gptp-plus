function normalizeExcludedCodes(excludedCodes) {
    if (!excludedCodes) {
        return new Set();
    }

    if (excludedCodes instanceof Set) {
        return new Set(
            [...excludedCodes]
                .map((code) => String(code || '').trim())
                .filter(Boolean)
        );
    }

    if (Array.isArray(excludedCodes)) {
        return new Set(
            excludedCodes
                .map((code) => String(code || '').trim())
                .filter(Boolean)
        );
    }

    const single = String(excludedCodes || '').trim();
    return single ? new Set([single]) : new Set();
}

function isCodeExcluded(code, excludedCodes) {
    const normalized = String(code || '').trim();
    if (!normalized) {
        return false;
    }
    return normalizeExcludedCodes(excludedCodes).has(normalized);
}

function pickFirstAllowedCode(codes, excludedCodes) {
    const excluded = normalizeExcludedCodes(excludedCodes);
    for (const code of Array.isArray(codes) ? codes : []) {
        const normalized = String(code || '').trim();
        if (!normalized) {
            continue;
        }
        if (!excluded.has(normalized)) {
            return normalized;
        }
    }
    return '';
}

module.exports = {
    normalizeExcludedCodes,
    isCodeExcluded,
    pickFirstAllowedCode
};

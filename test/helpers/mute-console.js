async function withMutedConsole(methods, fn) {
    const targetMethods = Array.isArray(methods) ? methods : ['log'];
    const originals = new Map();
    for (const method of targetMethods) {
        originals.set(method, console[method]);
        console[method] = () => { };
    }
    try {
        return await fn();
    } finally {
        for (const [method, original] of originals.entries()) {
            console[method] = original;
        }
    }
}

module.exports = {
    withMutedConsole
};

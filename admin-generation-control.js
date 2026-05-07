function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function createStopController() {
    let stopped = false;
    let reason = '';
    let listeners = new Set();

    const flushListeners = () => {
        const pending = listeners;
        listeners = new Set();
        for (const listener of pending) {
            try {
                listener();
            } catch (_) {
                /* ignore */
            }
        }
    };

    return {
        stop(nextReason = '管理员请求停止任务') {
            if (stopped) {
                return false;
            }
            stopped = true;
            reason = String(nextReason || '管理员请求停止任务');
            flushListeners();
            return true;
        },
        get stopped() {
            return stopped;
        },
        get reason() {
            return reason;
        },
        throwIfStopped(fallbackReason = '管理员请求停止任务') {
            if (stopped) {
                throw new Error(reason || fallbackReason);
            }
        },
        subscribe(listener) {
            if (typeof listener !== 'function') {
                return () => { };
            }
            if (stopped) {
                listener();
                return () => { };
            }
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        waitForStop() {
            if (stopped) {
                return Promise.resolve();
            }
            return new Promise((resolve) => {
                const unsubscribe = this.subscribe(() => {
                    unsubscribe();
                    resolve();
                });
            });
        }
    };
}

async function sleepWithStop(ms, { shouldStop, stopController } = {}) {
    const duration = Math.max(0, Number(ms) || 0);
    if (!duration) {
        return !Boolean(shouldStop && shouldStop());
    }

    if (shouldStop && shouldStop()) {
        return false;
    }

    if (stopController && stopController.stopped) {
        return false;
    }

    if (!stopController) {
        await sleep(duration);
        return !(shouldStop && shouldStop());
    }

    return new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            unsubscribe();
            resolve(value);
        };
        const unsubscribe = stopController.subscribe(() => finish(false));
        const timer = setTimeout(() => finish(!(shouldStop && shouldStop())), duration);
        if (shouldStop && shouldStop()) {
            finish(false);
        }
    });
}

async function waitForAvailableActivationSlot(jobSet, maxConcurrentActivations, options = {}) {
    const excluded = new Set((options.excludedSlotKeys || []).map((item) => String(item)));
    const pollMs = Math.max(1, Number(options.pollMs) || 1000);
    const shouldStop = typeof options.shouldStop === 'function' ? options.shouldStop : null;
    const stopController = options.stopController || null;

    while (true) {
        if (shouldStop && shouldStop()) {
            return false;
        }
        if (stopController?.stopped) {
            return false;
        }

        let occupied = 0;
        for (const slot of jobSet) {
            if (!excluded.has(String(slot))) {
                occupied += 1;
            }
        }
        if (occupied < Math.max(1, Number(maxConcurrentActivations) || 1)) {
            return true;
        }

        const keepWaiting = await sleepWithStop(pollMs, { shouldStop, stopController });
        if (!keepWaiting) {
            return false;
        }
    }
}

module.exports = {
    createStopController,
    sleep,
    sleepWithStop,
    waitForAvailableActivationSlot
};

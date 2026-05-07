const assert = require('assert');
const test = require('node:test');

const {
    createStopController,
    sleepWithStop,
    waitForAvailableActivationSlot
} = require('../admin-generation-control');

test('waitForAvailableActivationSlot returns false when stop is requested while slots stay occupied', async () => {
    const occupied = new Set(['slot-1']);
    let stopped = false;

    setTimeout(() => {
        stopped = true;
    }, 30);

    const startedAt = Date.now();
    const acquired = await waitForAvailableActivationSlot(occupied, 1, {
        pollMs: 10,
        shouldStop: () => stopped
    });

    assert.strictEqual(acquired, false);
    assert.ok(Date.now() - startedAt < 250);
});

test('waitForAvailableActivationSlot returns true when a slot becomes available first', async () => {
    const occupied = new Set(['slot-1']);

    setTimeout(() => {
        occupied.clear();
    }, 30);

    const acquired = await waitForAvailableActivationSlot(occupied, 1, {
        pollMs: 10,
        shouldStop: () => false
    });

    assert.strictEqual(acquired, true);
});

test('sleepWithStop exits early when stop is requested', async () => {
    const stopController = createStopController();

    setTimeout(() => {
        stopController.stop('manual stop');
    }, 30);

    const startedAt = Date.now();
    const completed = await sleepWithStop(5_000, { stopController });

    assert.strictEqual(completed, false);
    assert.ok(Date.now() - startedAt < 250);
});

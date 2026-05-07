const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

function loadNamedFunction(source, functionName) {
    const pattern = new RegExp(`function ${functionName}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`, 'm');
    const match = source.match(pattern);
    assert.ok(match, `expected to find function ${functionName}`);
    return match[0];
}

test('manually stopped admin product generation remains resumable when work is left', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'mysql-store.js'), 'utf8');
    const parseFnSource = loadNamedFunction(source, 'parseAdminProductGenerationTask');
    const resumableFnSource = loadNamedFunction(source, 'isResumableProductGenerationTask');

    const parseAdminProductGenerationTask = new Function(`${parseFnSource}; return parseAdminProductGenerationTask;`)();
    const isResumableProductGenerationTask = new Function(`${resumableFnSource}; return isResumableProductGenerationTask;`)();

    const task = parseAdminProductGenerationTask({
        job_key: 'job-stop-1',
        cdk_code: 'ADMIN_PRODUCT_GEN:5',
        status: 'failed',
        raw_output: JSON.stringify({
            kind: 'admin_product_generation',
            targetCount: 5,
            completedCount: 2,
            successCount: 2,
            failedCount: 0,
            workerCount: 2,
            aborted: true,
            lastError: '管理员请求停止：本批次不再排队新的成品生产（当前正在执行的条次会尽快停止并退出）'
        })
    });

    assert.strictEqual(task.remainingCount, 3);
    assert.strictEqual(isResumableProductGenerationTask(task), true);
});

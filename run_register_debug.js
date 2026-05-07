const fs = require('fs');
const { runRegistrationFlow } = require('./register_openai');
const { ensureDebugArtifactDir, buildDebugArtifactPath } = require('./debug-artifacts');

async function main() {
    const startedAt = new Date();
    console.log(`[RegisterDebug] 开始调试注册，时间: ${startedAt.toISOString()}`);

    const result = await runRegistrationFlow();

    ensureDebugArtifactDir('注册');

    const resultPath = buildDebugArtifactPath('注册', 'register_debug_result', '.json');

    fs.writeFileSync(resultPath, JSON.stringify({
        exported_at: new Date().toISOString(),
        result
    }, null, 2), 'utf8');

    console.log('[RegisterDebug] 注册成功');
    console.log(JSON.stringify(result, null, 2));
    console.log(`[RegisterDebug] 结果已保存: ${resultPath}`);
}

main().catch((error) => {
    console.error('[RegisterDebug] 注册失败:', error && error.stack ? error.stack : error);
    process.exit(1);
});

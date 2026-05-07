function detectRegistrationAdvance(beforeState = {}, afterState = {}, startUrl = '') {
    const before = beforeState || {};
    const after = afterState || {};
    const initialUrl = String(startUrl || before.url || '');
    const nextUrl = String(after.url || '');

    if (after.chatVisible) {
        return 'chatLoaded';
    }

    // 关键：页面落到 OpenAI 错误页（Operation timed out / Try again / 糟糕，出错了）时
    // OTP 输入框/原表单也会消失，但这绝不是成功推进 —— 必须返回 null，让上层走错误恢复流程
    if (after.errorPageVisible) {
        return null;
    }

    if (initialUrl && nextUrl && nextUrl !== initialUrl) {
        return 'urlChanged';
    }

    if (before.otpVisible && after.profileVisible && !before.profileVisible) {
        return 'profileShown';
    }

    if (before.otpVisible && !after.otpVisible) {
        return 'otpGone';
    }

    if (before.profileVisible && !after.profileVisible) {
        return 'profileGone';
    }

    return null;
}

module.exports = {
    detectRegistrationAdvance
};

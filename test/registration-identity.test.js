const assert = require('assert');
const test = require('node:test');

const {
    createRegistrationProfile,
    buildHumanEmailLocalPart
} = require('../registration-identity');

test('createRegistrationProfile 生成可信英文姓名，并派生对应的人名风格邮箱 local-part', () => {
    const profile = createRegistrationProfile(() => 0);

    assert.strictEqual(profile.firstName, 'Aiden');
    assert.strictEqual(profile.lastName, 'Bennett');
    assert.strictEqual(profile.name, 'Aiden Bennett');
    assert.strictEqual(profile.year, '1980');
    assert.match(
        profile.emailLocalPart,
        /^[a-z]+[a-z]+[0-9]{2,4}$/,
        '邮箱 local-part 应看起来像英文人名，而不是无意义随机串'
    );
    assert.ok(!profile.emailLocalPart.includes('.'), '邮箱 local-part 不应包含点号');
    assert.match(profile.emailLocalPart, /aiden|bennett/, 'local-part 应包含姓名语义');
});

test('buildHumanEmailLocalPart 使用姓名信息生成稳定且可信的邮箱名', () => {
    const localPart = buildHumanEmailLocalPart({
        firstName: 'Anna',
        lastName: 'Wilson',
        year: '1994',
        month: '08',
        day: '17'
    }, () => 0.2);

    assert.match(localPart, /^annawilson\d{2,4}$/);
    assert.ok(!localPart.includes('.'), '邮箱名不应使用点号');
    assert.ok(!/^u[a-z0-9]{6,}/.test(localPart), '不能再退回 uxxxx 这类随机串');
});

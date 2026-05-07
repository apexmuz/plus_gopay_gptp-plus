function pick(list, random = Math.random) {
    const items = Array.isArray(list) ? list.filter(Boolean) : [];
    if (!items.length) {
        return '';
    }
    const value = Number(random());
    const normalized = Number.isFinite(value) ? value : 0;
    const index = Math.min(items.length - 1, Math.max(0, Math.floor(normalized * items.length)));
    return items[index];
}

function sanitizeNamePart(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z]/g, '');
}

function buildHumanEmailLocalPart(profile = {}, random = Math.random) {
    const firstName = sanitizeNamePart(profile.firstName);
    const lastName = sanitizeNamePart(profile.lastName);
    const year = String(profile.year || '').replace(/\D/g, '');
    const month = String(profile.month || '').replace(/\D/g, '').padStart(2, '0').slice(-2);
    const day = String(profile.day || '').replace(/\D/g, '').padStart(2, '0').slice(-2);

    const baseFirst = firstName || 'alex';
    const baseLast = lastName || 'carter';
    const year2 = year.slice(-2) || '88';
    const year4 = year || `19${year2}`;
    const monthDay = `${month || '08'}${day || '17'}`;

    const variants = [
        `${baseFirst}${baseLast}${year2}`,
        `${baseFirst}${baseLast}${monthDay}`,
        `${baseFirst}${baseLast}${year4}`
    ];

    return pick(variants, random);
}

function createRegistrationProfile(random = Math.random) {
    const firstNames = [
        'Aiden', 'Ethan', 'Mason', 'Logan', 'Lucas', 'Noah', 'Liam', 'Elijah', 'Owen', 'Wyatt',
        'Avery', 'Chloe', 'Ella', 'Grace', 'Hannah', 'Layla', 'Lillian', 'Nora', 'Scarlett', 'Zoe',
        'James', 'Mary', 'John', 'Lisa', 'Tom', 'Anna', 'Mike', 'Eva', 'Will', 'Kate',
        'David', 'Sarah', 'Daniel', 'Emma', 'Brian', 'Olivia', 'Ryan', 'Audrey', 'Leah', 'Claire'
    ];
    const lastNames = [
        'Bennett', 'Carter', 'Collins', 'Cooper', 'Foster', 'Gray', 'Hayes', 'Murphy', 'Parker', 'Reed',
        'Smith', 'Brown', 'Jones', 'Davis', 'Miller', 'Lee', 'Wilson', 'Walker', 'Hall', 'King',
        'Taylor', 'Anderson', 'Clark', 'Moore', 'Young', 'Allen', 'Scott', 'Green', 'Baker', 'Adams'
    ];

    const firstName = pick(firstNames, random);
    const lastName = pick(lastNames, random);
    const age = (Math.floor((Number(random()) || 0) * 25) + 20).toString();
    const year = (Math.floor((Number(random()) || 0) * 25) + 1980).toString();
    const month = (Math.floor((Number(random()) || 0) * 12) + 1).toString().padStart(2, '0');
    const day = (Math.floor((Number(random()) || 0) * 28) + 1).toString().padStart(2, '0');

    const profile = {
        firstName,
        lastName,
        name: `${firstName} ${lastName}`,
        age,
        year,
        month,
        day
    };

    return {
        ...profile,
        emailLocalPart: buildHumanEmailLocalPart(profile, random)
    };
}

module.exports = {
    buildHumanEmailLocalPart,
    createRegistrationProfile
};

module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/__tests__/**/*.test.js'],
    coverageDirectory: 'coverage',
    collectCoverageFrom: ['controllers/**/*.js', 'services/**/*.js', 'util/**/*.js'], // Ajusta esto para reflejar la estructura de tu proyecto
    setupFilesAfterEnv: ['./__tests__/setupTests.js'],
};
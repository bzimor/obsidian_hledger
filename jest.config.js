module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    moduleFileExtensions: ['ts', 'js'],
    testMatch: ['<rootDir>/tests/**/*.test.ts'], // Look specifically in the tests directory
    transform: {
        '^.+\\.ts$': 'ts-jest',
    },
}; 
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    moduleFileExtensions: ['ts', 'js'],
    testMatch: ['<rootDir>/tests/**/*.test.ts'], // Look specifically in the tests directory
    moduleNameMapper: {
        // The obsidian package ships types only, so it cannot be resolved at runtime
        '^obsidian$': '<rootDir>/tests/__mocks__/obsidian.ts',
    },
    transform: {
        '^.+\\.ts$': 'ts-jest',
    },
}; 
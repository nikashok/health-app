// Jest config. The unit tests cover the pure calc modules (src/calc/*), which have no
// React Native imports, so a plain node environment + babel-jest (babel-preset-expo
// transforms TS) is lighter and more robust than the multi-project jest-expo preset.
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/src/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.[jt]sx?$': 'babel-jest',
  },
};

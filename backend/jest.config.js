module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/test"],
  testMatch: ["**/*.jest.test.js"],
  setupFiles: ["<rootDir>/test/jest.setup.js"],
  clearMocks: true,
  restoreMocks: true,
};

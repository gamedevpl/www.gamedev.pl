module.exports = {
  rootDir: "./src",
  testEnvironment: "jsdom",
  transform: {
    "^.+\\.tsx?$": "ts-jest",
  },
  moduleNameMapper: {
    "\\.(css|less|sass|scss|png)$": "identity-obj-proxy",
  },
  setupFilesAfterEnv: ["<rootDir>/setupTests.ts"],
};

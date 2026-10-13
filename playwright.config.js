const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: process.env.TEST_URL || "https://rumshevich.github.io/toy-factory-conveyor-logic/",
    headless: false,
    launchOptions: {
      executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    },
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  reporter: "list"
});

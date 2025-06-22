import * as path from "path";
import { runTests } from "@vscode/test-electron";

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, "../../");

    // The path to test runner
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(
      __dirname,
      "./suite/main-window-test-runner",
    );

    console.log("Running Main Window Load Test...");
    console.log("Extension Development Path:", extensionDevelopmentPath);
    console.log("Extension Tests Path:", extensionTestsPath);

    // Download VS Code, unzip it and run the integration test
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: ["--disable-extensions"], // Disable other extensions for cleaner test
    });
  } catch (err) {
    console.error("Failed to run main window test", err);
    process.exit(1);
  }
}

main();

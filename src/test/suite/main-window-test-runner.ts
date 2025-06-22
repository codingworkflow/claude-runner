import * as path from "path";
import Mocha from "mocha";

export function run(): Promise<void> {
  // Create the mocha test specifically for main window test
  const mocha = new Mocha({
    ui: "tdd",
    color: true,
    timeout: 20000, // Increase timeout for extension loading
  });

  const testFile = path.resolve(__dirname, "main-window-load.test.js");

  console.log("Adding test file:", testFile);
  mocha.addFile(testFile);

  return new Promise((resolve, reject) => {
    try {
      // Run the mocha test
      mocha.run((failures: number) => {
        if (failures > 0) {
          reject(new Error(`${failures} tests failed.`));
        } else {
          resolve();
        }
      });
    } catch (err) {
      console.error("Error running tests:", err);
      reject(err);
    }
  });
}

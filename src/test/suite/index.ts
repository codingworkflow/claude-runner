import * as path from "path";
import Mocha from "mocha";
import * as glob from "glob";

export function run(): Promise<void> {
  // Check for grep filter from command line args
  const grepPattern = process.argv.find((arg) =>
    arg.includes("Main Window Load Test"),
  );

  // Create the mocha test
  const mocha = new Mocha({
    ui: "tdd",
    color: true,
    grep: grepPattern ? "Main Window Load Test" : undefined,
  });

  const testsRoot = path.resolve(__dirname, "..");

  return new Promise((resolve, reject) => {
    const testFiles = new glob.Glob("suite/**/*.test.js", { cwd: testsRoot });
    const testFileStream = testFiles.stream();

    testFileStream.on("data", (file) => {
      mocha.addFile(path.resolve(testsRoot, file));
    });
    testFileStream.on("error", (err) => {
      reject(err);
    });
    testFileStream.on("end", () => {
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
        console.error(err);
        reject(err);
      }
    });
  });
}

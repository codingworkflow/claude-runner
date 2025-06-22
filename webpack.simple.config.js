const path = require("path");

console.log("🔧 Simple webpack config - checking dependencies...");

// Check dependencies
try {
  const tsLoader = require("ts-loader");
  console.log("✅ ts-loader module loaded successfully");
} catch (e) {
  console.log("❌ Failed to load ts-loader:", e.message);
}

try {
  const typescript = require("typescript");
  console.log("✅ typescript module loaded successfully");
} catch (e) {
  console.log("❌ Failed to load typescript:", e.message);
}

const config = {
  target: "node",
  mode: "none",
  entry: "./src/extension.ts",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "extension.js",
    libraryTarget: "commonjs2",
  },
  externals: {
    vscode: "commonjs vscode",
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js"],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        loader: "ts-loader",
        options: {
          transpileOnly: true,
        },
      },
    ],
  },
};

console.log(
  "🔧 Webpack config created, rules:",
  JSON.stringify(config.module.rules, null, 2),
);

module.exports = config;

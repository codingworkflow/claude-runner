// Minimal webpack config for debugging
const path = require("path");

console.log("🔧 Debug webpack config loading...");

// Check if ts-loader is available
try {
  require.resolve("ts-loader");
  console.log("✅ ts-loader found");
} catch (e) {
  console.log("❌ ts-loader NOT found:", e.message);
}

// Check if typescript is available
try {
  require.resolve("typescript");
  console.log("✅ typescript found");
} catch (e) {
  console.log("❌ typescript NOT found:", e.message);
}

module.exports = {
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
    extensions: [".ts", ".tsx", ".js", ".jsx"],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: "ts-loader",
      },
    ],
  },
  devtool: "nosources-source-map",
};

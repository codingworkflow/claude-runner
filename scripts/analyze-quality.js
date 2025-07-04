#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

/**
 * Analyze ESLint quality report and provide insights
 */
async function analyzeQuality() {
  const reportPath = path.join(__dirname, "..", "eslint-report.json");

  if (!fs.existsSync(reportPath)) {
    console.error(
      "❌ ESLint report not found. Run npm run quality:report first.",
    );
    return;
  }

  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));

  // Aggregate statistics
  const stats = {
    totalFiles: report.length,
    filesWithIssues: report.filter(
      (file) => file.errorCount > 0 || file.warningCount > 0,
    ).length,
    totalErrors: report.reduce((sum, file) => sum + file.errorCount, 0),
    totalWarnings: report.reduce((sum, file) => sum + file.warningCount, 0),
    ruleViolations: {},
    complexityIssues: {},
    securityIssues: {},
    qualityIssues: {},
  };

  // Categorize issues
  report.forEach((file) => {
    file.messages.forEach((message) => {
      const ruleId = message.ruleId;
      if (!ruleId) return;

      if (!stats.ruleViolations[ruleId]) {
        stats.ruleViolations[ruleId] = { count: 0, files: new Set() };
      }
      stats.ruleViolations[ruleId].count++;
      stats.ruleViolations[ruleId].files.add(file.filePath);

      // Categorize by type
      if (
        ruleId.includes("complexity") ||
        ruleId.includes("max-") ||
        ruleId.includes("cognitive")
      ) {
        stats.complexityIssues[ruleId] =
          (stats.complexityIssues[ruleId] || 0) + 1;
      } else if (ruleId.includes("security") || ruleId.includes("sonarjs")) {
        stats.securityIssues[ruleId] = (stats.securityIssues[ruleId] || 0) + 1;
      } else if (
        ruleId.includes("unicorn") ||
        ruleId.includes("import") ||
        ruleId.includes("jsdoc")
      ) {
        stats.qualityIssues[ruleId] = (stats.qualityIssues[ruleId] || 0) + 1;
      }
    });
  });

  // Generate report
  console.log("📊 QUALITY ANALYSIS REPORT");
  console.log("=".repeat(50));
  console.log(`📁 Total Files Analyzed: ${stats.totalFiles}`);
  console.log(`⚠️  Files with Issues: ${stats.filesWithIssues}`);
  console.log(`🔴 Total Errors: ${stats.totalErrors}`);
  console.log(`🟡 Total Warnings: ${stats.totalWarnings}`);
  console.log(
    `📈 Quality Score: ${(((stats.totalFiles - stats.filesWithIssues) / stats.totalFiles) * 100).toFixed(1)}%`,
  );
  console.log("");

  // Top violating rules
  console.log("🔥 TOP 10 RULE VIOLATIONS");
  console.log("-".repeat(50));
  const sortedRules = Object.entries(stats.ruleViolations)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 10);

  sortedRules.forEach(([rule, data], index) => {
    console.log(
      `${index + 1}. ${rule}: ${data.count} violations (${data.files.size} files)`,
    );
  });
  console.log("");

  // Complexity issues
  if (Object.keys(stats.complexityIssues).length > 0) {
    console.log("🧮 COMPLEXITY ISSUES");
    console.log("-".repeat(50));
    Object.entries(stats.complexityIssues)
      .sort(([, a], [, b]) => b - a)
      .forEach(([rule, count]) => {
        console.log(`• ${rule}: ${count} violations`);
      });
    console.log("");
  }

  // Security issues
  if (Object.keys(stats.securityIssues).length > 0) {
    console.log("🔒 SECURITY/SONAR ISSUES");
    console.log("-".repeat(50));
    Object.entries(stats.securityIssues)
      .sort(([, a], [, b]) => b - a)
      .forEach(([rule, count]) => {
        console.log(`• ${rule}: ${count} violations`);
      });
    console.log("");
  }

  // Quality issues
  if (Object.keys(stats.qualityIssues).length > 0) {
    console.log("✨ CODE QUALITY ISSUES");
    console.log("-".repeat(50));
    Object.entries(stats.qualityIssues)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 15)
      .forEach(([rule, count]) => {
        console.log(`• ${rule}: ${count} violations`);
      });
    console.log("");
  }

  // Worst files
  console.log("📄 FILES WITH MOST ISSUES");
  console.log("-".repeat(50));
  const worstFiles = report
    .filter((file) => file.errorCount > 0 || file.warningCount > 0)
    .sort(
      (a, b) => b.errorCount + b.warningCount - (a.errorCount + a.warningCount),
    )
    .slice(0, 10);

  worstFiles.forEach((file, index) => {
    const relativePath = path.relative(process.cwd(), file.filePath);
    console.log(
      `${index + 1}. ${relativePath}: ${file.errorCount} errors, ${file.warningCount} warnings`,
    );
  });
  console.log("");

  // Recommendations
  console.log("💡 RECOMMENDATIONS");
  console.log("-".repeat(50));

  const recommendations = [];

  if (stats.complexityIssues["max-lines"] > 20) {
    recommendations.push(
      "📏 Consider breaking down large files (max-lines violations)",
    );
  }

  if (stats.complexityIssues["complexity"] > 10) {
    recommendations.push("🧩 Reduce cyclomatic complexity in functions");
  }

  if (stats.ruleViolations["unicorn/no-array-for-each"]?.count > 20) {
    recommendations.push(
      "🔄 Replace .forEach() with for...of loops for better performance",
    );
  }

  if (stats.ruleViolations["import/order"]?.count > 50) {
    recommendations.push("📦 Organize imports consistently across files");
  }

  if (stats.ruleViolations["unicorn/prefer-ternary"]?.count > 10) {
    recommendations.push(
      "🔀 Use ternary operators for simple if-else statements",
    );
  }

  if (recommendations.length === 0) {
    console.log(
      "🎉 No specific recommendations - consider fixing top violations first!",
    );
  } else {
    recommendations.forEach((rec) => console.log(rec));
  }

  console.log("");
  console.log("🛠️  Run `npm run quality:fix` to automatically fix many issues");
  console.log(
    "📖 Check ESLint docs for rule explanations: https://eslint.org/docs/rules/",
  );
}

// Execute if run directly
if (require.main === module) {
  analyzeQuality().catch(console.error);
}

module.exports = { analyzeQuality };

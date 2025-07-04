#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

/**
 * Sonar-style quality gate analysis
 */
async function checkQualityGate() {
  const reportPath = path.join(__dirname, "..", "eslint-report.json");

  if (!fs.existsSync(reportPath)) {
    console.error(
      "❌ ESLint report not found. Run npm run quality:report first.",
    );
    process.exit(1);
  }

  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));

  // Quality Gate thresholds (configurable)
  const qualityGate = {
    maxErrors: 100, // Max errors allowed
    maxWarnings: 200, // Max warnings allowed
    maxComplexityViolations: 20, // Max complexity violations
    maxSecurityViolations: 5, // Max security violations
    maxDuplicateStrings: 10, // Max duplicate string violations
    minQualityScore: 80, // Min quality score (%)
  };

  // Analyze violations
  const violations = {
    totalErrors: 0,
    totalWarnings: 0,
    complexityViolations: 0,
    securityViolations: 0,
    duplicateStrings: 0,
    filesWithIssues: 0,
    totalFiles: report.length,
  };

  const criticalRules = {
    complexity: [
      "complexity",
      "max-lines",
      "max-lines-per-function",
      "max-statements",
      "sonarjs/cognitive-complexity",
    ],
    security: [
      "sonarjs/no-hardcoded-secrets",
      "sonarjs/no-weak-cipher",
      "sonarjs/no-hardcoded-passwords",
    ],
    duplicates: [
      "sonarjs/no-duplicate-string",
      "sonarjs/no-identical-functions",
    ],
  };

  report.forEach((file) => {
    if (file.errorCount > 0 || file.warningCount > 0) {
      violations.filesWithIssues++;
    }

    violations.totalErrors += file.errorCount;
    violations.totalWarnings += file.warningCount;

    file.messages.forEach((message) => {
      const ruleId = message.ruleId;
      if (!ruleId) return;

      if (criticalRules.complexity.includes(ruleId)) {
        violations.complexityViolations++;
      } else if (criticalRules.security.includes(ruleId)) {
        violations.securityViolations++;
      } else if (criticalRules.duplicates.includes(ruleId)) {
        violations.duplicateStrings++;
      }
    });
  });

  // Calculate quality score
  const qualityScore =
    ((violations.totalFiles - violations.filesWithIssues) /
      violations.totalFiles) *
    100;

  // Check quality gate
  const gateResults = {
    errorGate: violations.totalErrors <= qualityGate.maxErrors,
    warningGate: violations.totalWarnings <= qualityGate.maxWarnings,
    complexityGate:
      violations.complexityViolations <= qualityGate.maxComplexityViolations,
    securityGate:
      violations.securityViolations <= qualityGate.maxSecurityViolations,
    duplicateGate:
      violations.duplicateStrings <= qualityGate.maxDuplicateStrings,
    qualityScoreGate: qualityScore >= qualityGate.minQualityScore,
  };

  const gatesPassed = Object.values(gateResults).filter(Boolean).length;
  const totalGates = Object.keys(gateResults).length;
  const overallPass = gatesPassed === totalGates;

  // Generate report
  console.log("🚪 SONAR-STYLE QUALITY GATE REPORT");
  console.log("=".repeat(60));
  console.log(
    `📊 Overall Status: ${overallPass ? "✅ PASSED" : "❌ FAILED"} (${gatesPassed}/${totalGates})`,
  );
  console.log(`📈 Quality Score: ${qualityScore.toFixed(1)}%`);
  console.log("");

  console.log("🎯 QUALITY GATE RESULTS");
  console.log("-".repeat(60));

  const gateChecks = [
    {
      name: "Errors",
      status: gateResults.errorGate,
      current: violations.totalErrors,
      threshold: qualityGate.maxErrors,
    },
    {
      name: "Warnings",
      status: gateResults.warningGate,
      current: violations.totalWarnings,
      threshold: qualityGate.maxWarnings,
    },
    {
      name: "Complexity",
      status: gateResults.complexityGate,
      current: violations.complexityViolations,
      threshold: qualityGate.maxComplexityViolations,
    },
    {
      name: "Security",
      status: gateResults.securityGate,
      current: violations.securityViolations,
      threshold: qualityGate.maxSecurityViolations,
    },
    {
      name: "Duplicates",
      status: gateResults.duplicateGate,
      current: violations.duplicateStrings,
      threshold: qualityGate.maxDuplicateStrings,
    },
    {
      name: "Quality Score",
      status: gateResults.qualityScoreGate,
      current: `${qualityScore.toFixed(1)}%`,
      threshold: `${qualityGate.minQualityScore}%`,
    },
  ];

  gateChecks.forEach((check) => {
    const status = check.status ? "✅ PASS" : "❌ FAIL";
    console.log(
      `${status} ${check.name}: ${check.current} (threshold: ${check.threshold})`,
    );
  });

  console.log("");

  if (!overallPass) {
    console.log("❌ QUALITY GATE FAILED");
    console.log("🔧 Actions needed:");

    if (!gateResults.errorGate) {
      console.log(
        `  • Reduce errors from ${violations.totalErrors} to ${qualityGate.maxErrors} or below`,
      );
    }
    if (!gateResults.warningGate) {
      console.log(
        `  • Reduce warnings from ${violations.totalWarnings} to ${qualityGate.maxWarnings} or below`,
      );
    }
    if (!gateResults.complexityGate) {
      console.log(
        `  • Reduce complexity violations from ${violations.complexityViolations} to ${qualityGate.maxComplexityViolations} or below`,
      );
    }
    if (!gateResults.securityGate) {
      console.log(
        `  • Fix security issues: ${violations.securityViolations} violations found`,
      );
    }
    if (!gateResults.duplicateGate) {
      console.log(
        `  • Reduce code duplication: ${violations.duplicateStrings} violations found`,
      );
    }
    if (!gateResults.qualityScoreGate) {
      console.log(
        `  • Improve quality score to ${qualityGate.minQualityScore}% or above`,
      );
    }

    console.log("");
    console.log(
      "🛠️  Run `npm run quality:fix` to automatically fix many issues",
    );
    process.exit(1);
  } else {
    console.log("✅ QUALITY GATE PASSED");
    console.log("🎉 All quality thresholds met!");
  }
}

// Execute if run directly
if (require.main === module) {
  checkQualityGate().catch(console.error);
}

module.exports = { checkQualityGate };

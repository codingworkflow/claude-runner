#!/usr/bin/env node

console.log("📊 CLAUDE RUNNER QUALITY TOOLS");
console.log("=".repeat(50));
console.log("");

console.log("🔧 AVAILABLE COMMANDS:");
console.log("");

console.log(
  "npm run quality              - Full quality check (lint + typecheck + format)",
);
console.log(
  "npm run quality:fix          - Auto-fix linting and formatting issues",
);
console.log(
  "npm run quality:report       - Generate comprehensive quality analysis",
);
console.log(
  "npm run quality:analyze      - Analyze quality report with insights",
);
console.log("npm run quality:gate         - Sonar-style quality gate check");
console.log("");

console.log("📈 QUALITY FEATURES:");
console.log("");
console.log(
  "✅ Complexity Analysis       - Function complexity, cyclomatic complexity",
);
console.log(
  "✅ SonarJS Rules             - Security, maintainability, reliability",
);
console.log(
  "✅ Import Organization       - Import order and dependency analysis",
);
console.log("✅ Modern JavaScript         - Unicorn rules for best practices");
console.log("✅ Documentation Quality     - JSDoc validation");
console.log(
  "✅ Quality Gate              - Pass/fail thresholds like SonarQube",
);
console.log("");

console.log("📊 QUALITY METRICS:");
console.log("");
console.log("• Total violations by rule type");
console.log("• Complexity violations (functions, files, statements)");
console.log("• Security and maintainability issues");
console.log("• Files with most issues");
console.log("• Quality score percentage");
console.log("• Improvement recommendations");
console.log("");

console.log("🎯 QUALITY GATE THRESHOLDS:");
console.log("");
console.log("• Max Errors: 100");
console.log("• Max Warnings: 200");
console.log("• Max Complexity Violations: 20");
console.log("• Max Security Violations: 5");
console.log("• Max Duplicate Code: 10");
console.log("• Min Quality Score: 80%");
console.log("");

console.log("💡 EXAMPLES:");
console.log("");
console.log("# Quick fix common issues");
console.log("npm run quality:fix");
console.log("");
console.log("# Full quality analysis with detailed breakdown");
console.log("npm run quality:report");
console.log("");
console.log("# Check if code passes quality gate");
console.log("npm run quality:gate");
console.log("");

console.log("📖 For more info: https://eslint.org/docs/rules/");

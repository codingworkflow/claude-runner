#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const reportPath = path.join(projectRoot, "css-analysis-report.json");

function removeUnusedRules(cssFile, unusedRules) {
  let content = fs.readFileSync(cssFile, "utf8");
  let removedCount = 0;
  let modifiedContent = content;

  console.log(`\n🔧 Processing ${path.relative(projectRoot, cssFile)}...`);

  for (const rule of unusedRules) {
    const className = rule.name;

    const patterns = [
      new RegExp(`\\.${className}\\s*\\{[^}]*\\}\\s*`, "g"),
      new RegExp(`\\.${className}\\.[^{]*\\{[^}]*\\}\\s*`, "g"),
      new RegExp(`\\.${className}:[^{]*\\{[^}]*\\}\\s*`, "g"),
      new RegExp(`\\.${className}\\s+[^{]*\\{[^}]*\\}\\s*`, "g"),
    ];

    let ruleRemoved = false;
    for (const pattern of patterns) {
      const matches = modifiedContent.match(pattern);
      if (matches && matches.length > 0) {
        console.log(`   ❌ Removing: .${className}`);
        modifiedContent = modifiedContent.replace(pattern, "");
        removedCount++;
        ruleRemoved = true;
        break;
      }
    }

    if (!ruleRemoved) {
      console.log(`   ⚠️  Could not locate rule for removal: .${className}`);
    }
  }

  if (removedCount > 0) {
    modifiedContent = modifiedContent.replace(/\\n\\s*\\n\\s*\\n/g, "\\n\\n");
    fs.writeFileSync(cssFile, modifiedContent);
    console.log(`   ✅ Removed ${removedCount} unused rules`);
  } else {
    console.log(`   ℹ️  No rules were removed (manual review required)`);
  }

  return removedCount;
}

function showSafeRemovalSuggestions(unusedByFile) {
  console.log("\\n📋 Safe Removal Suggestions:");
  console.log("=".repeat(40));

  const safeToRemove = [];
  const needsReview = [];

  Object.entries(unusedByFile).forEach(([fileName, rules]) => {
    rules.forEach((rule) => {
      if (isSafeToRemove(rule.name)) {
        safeToRemove.push({ fileName, rule });
      } else {
        needsReview.push({ fileName, rule });
      }
    });
  });

  if (safeToRemove.length > 0) {
    console.log("\\n✅ Safe to Remove (utility classes):");
    safeToRemove.forEach(({ fileName, rule }) => {
      console.log(`   • ${rule.selector} in ${fileName}`);
    });
  }

  if (needsReview.length > 0) {
    console.log("\\n⚠️  Needs Manual Review (component/feature specific):");
    needsReview.forEach(({ fileName, rule }) => {
      console.log(`   • ${rule.selector} in ${fileName}`);
    });
  }

  return { safeToRemove, needsReview };
}

function isSafeToRemove(className) {
  const utilityClasses = [
    "flex-col",
    "justify-between",
    "gap-3",
    "mt-3",
    "mb-3",
    "mb-2",
    "mt-4",
    "space-y-4",
    "space-y-3",
    "space-y-2",
  ];

  return utilityClasses.includes(className);
}

function generateCleanupPlan(unusedByFile) {
  console.log("\\n📝 Cleanup Plan:");
  console.log("=".repeat(20));

  const { safeToRemove, needsReview } =
    showSafeRemovalSuggestions(unusedByFile);

  console.log("\\n📋 Next Steps:");
  console.log("1. Run automated removal for safe utility classes");
  console.log("2. Manually review component-specific rules");
  console.log("3. Verify no dynamic usage in JavaScript/TypeScript");
  console.log("4. Re-run analysis to confirm cleanup");

  if (safeToRemove.length > 0) {
    console.log(
      `\\n💡 You can auto-remove ${safeToRemove.length} safe utility classes with:`,
    );
    console.log("   npm run analyze-css:auto-clean");
  }

  return { safeToRemove, needsReview };
}

function autoCleanSafeRules(unusedByFile) {
  console.log("\\n🧹 Auto-cleaning safe unused CSS rules...");

  let totalRemoved = 0;
  const processedFiles = new Set();

  Object.entries(unusedByFile).forEach(([fileName, rules]) => {
    const safeRules = rules.filter((rule) => isSafeToRemove(rule.name));

    if (safeRules.length > 0) {
      const fullPath = path.join(projectRoot, fileName);
      const removed = removeUnusedRules(fullPath, safeRules);
      totalRemoved += removed;
      processedFiles.add(fileName);
    }
  });

  console.log(`\\n📊 Auto-cleanup Summary:`);
  console.log(`   Files processed: ${processedFiles.size}`);
  console.log(`   Rules removed: ${totalRemoved}`);

  if (totalRemoved > 0) {
    console.log(
      "\\n✅ Auto-cleanup completed! Run analysis again to see updated results:",
    );
    console.log("   npm run analyze-css");
  } else {
    console.log("\\n ℹ️ No safe rules found for automatic removal.");
  }

  return totalRemoved;
}

async function main() {
  const command = process.argv[2] || "plan";

  try {
    if (!fs.existsSync(reportPath)) {
      console.error("❌ CSS analysis report not found. Run analysis first:");
      console.error("   npm run analyze-css");
      process.exit(1);
    }

    const reportData = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    const { unusedByFile, summary } = reportData;

    console.log("🧹 CSS Cleanup Tool");
    console.log("=".repeat(25));
    console.log(
      `📊 Analysis from: ${new Date(reportData.timestamp).toLocaleString()}`,
    );
    console.log(
      `📈 Total unused rules: ${summary.unusedCount}/${summary.totalRules} (${summary.unusedPercentage}%)`,
    );

    if (summary.unusedCount === 0) {
      console.log(
        "\\n🎉 No unused CSS rules found. Your styles are already optimized!",
      );
      return;
    }

    switch (command) {
      case "plan":
        generateCleanupPlan(unusedByFile);
        break;

      case "auto-clean":
        autoCleanSafeRules(unusedByFile);
        break;

      case "list":
        console.log("\\n📋 All Unused CSS Rules:");
        Object.entries(unusedByFile).forEach(([fileName, rules]) => {
          console.log(`\\n📄 ${fileName}:`);
          rules.forEach((rule) => {
            console.log(`   • ${rule.selector}`);
          });
        });
        break;

      default:
        console.log("\\n❓ Unknown command. Available commands:");
        console.log("   npm run cleanup-css plan      - Show cleanup plan");
        console.log(
          "   npm run cleanup-css auto-clean - Auto-remove safe rules",
        );
        console.log("   npm run cleanup-css list      - List all unused rules");
        break;
    }
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main, autoCleanSafeRules, generateCleanupPlan };

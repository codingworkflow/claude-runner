#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { PurgeCSS } = require("@fullhuman/postcss-purgecss");

const projectRoot = path.resolve(__dirname, "..");
const stylesDir = path.join(projectRoot, "src", "styles");
const srcDir = path.join(projectRoot, "src");

function getAllFiles(dir, extensions = [".ts", ".tsx", ".js", ".jsx"]) {
  const files = [];

  function scanDirectory(currentDir) {
    const items = fs.readdirSync(currentDir);

    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        scanDirectory(fullPath);
      } else if (extensions.some((ext) => item.endsWith(ext))) {
        files.push(fullPath);
      }
    }
  }

  scanDirectory(dir);
  return files;
}

function getAllCSSFiles(dir) {
  const files = [];

  function scanDirectory(currentDir) {
    const items = fs.readdirSync(currentDir);

    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        scanDirectory(fullPath);
      } else if (item.endsWith(".css")) {
        files.push(fullPath);
      }
    }
  }

  scanDirectory(dir);
  return files;
}

function extractCSSRules(cssContent, filename) {
  const rules = [];
  const classRegex = /\.([a-zA-Z][\w-]*)/g;
  const idRegex = /#([a-zA-Z][\w-]*)/g;

  let match;

  while ((match = classRegex.exec(cssContent)) !== null) {
    rules.push({
      type: "class",
      name: match[1],
      selector: `.${match[1]}`,
      file: filename,
    });
  }

  while ((match = idRegex.exec(cssContent)) !== null) {
    rules.push({
      type: "id",
      name: match[1],
      selector: `#${match[1]}`,
      file: filename,
    });
  }

  return rules;
}

function findUsagesInContent(content, selector) {
  const usages = [];

  if (selector.startsWith(".")) {
    const className = selector.slice(1);
    const patterns = [
      new RegExp(`className=["']([^"']*\\s)?${className}(\\s[^"']*)?["']`, "g"),
      new RegExp(`class=["']([^"']*\\s)?${className}(\\s[^"']*)?["']`, "g"),
      new RegExp(`\\b${className}\\b`, "g"),
    ];

    patterns.forEach((pattern) => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        usages.push({
          match: match[0],
          index: match.index,
        });
      }
    });
  } else if (selector.startsWith("#")) {
    const idName = selector.slice(1);
    const pattern = new RegExp(`\\b${idName}\\b`, "g");
    let match;
    while ((match = pattern.exec(content)) !== null) {
      usages.push({
        match: match[0],
        index: match.index,
      });
    }
  }

  return usages;
}

function analyzeUsage(cssRules, sourceFiles) {
  const usageReport = {
    used: [],
    unused: [],
    totalRules: cssRules.length,
    usedCount: 0,
    unusedCount: 0,
  };

  console.log(
    `\n📊 Analyzing ${cssRules.length} CSS rules against ${sourceFiles.length} source files...\n`,
  );

  for (const rule of cssRules) {
    let isUsed = false;
    const usageDetails = {
      rule,
      usedIn: [],
    };

    for (const sourceFile of sourceFiles) {
      try {
        const content = fs.readFileSync(sourceFile, "utf8");
        const usages = findUsagesInContent(content, rule.selector);

        if (usages.length > 0) {
          isUsed = true;
          usageDetails.usedIn.push({
            file: path.relative(projectRoot, sourceFile),
            usages: usages.length,
          });
        }
      } catch (error) {
        console.warn(`Warning: Could not read ${sourceFile}: ${error.message}`);
      }
    }

    if (isUsed) {
      usageReport.used.push(usageDetails);
      usageReport.usedCount++;
    } else {
      usageReport.unused.push(usageDetails);
      usageReport.unusedCount++;
    }
  }

  return usageReport;
}

function generateReport(usageReport, cssFiles) {
  console.log("🎨 CSS Usage Analysis Report");
  console.log("=".repeat(50));
  console.log(`📁 CSS Files Analyzed: ${cssFiles.length}`);
  cssFiles.forEach((file) => {
    console.log(`   • ${path.relative(projectRoot, file)}`);
  });

  console.log(`\n📈 Summary:`);
  console.log(`   Total CSS Rules: ${usageReport.totalRules}`);
  console.log(
    `   ✅ Used Rules: ${usageReport.usedCount} (${Math.round((usageReport.usedCount / usageReport.totalRules) * 100)}%)`,
  );
  console.log(
    `   ❌ Unused Rules: ${usageReport.unusedCount} (${Math.round((usageReport.unusedCount / usageReport.totalRules) * 100)}%)`,
  );

  let unusedByFile = {};

  if (usageReport.unusedCount > 0) {
    console.log("\n🚨 Unused CSS Rules:");
    console.log("-".repeat(30));

    usageReport.unused.forEach(({ rule }) => {
      const fileName = path.relative(projectRoot, rule.file);
      if (!unusedByFile[fileName]) {
        unusedByFile[fileName] = [];
      }
      unusedByFile[fileName].push(rule);
    });

    Object.entries(unusedByFile).forEach(([fileName, rules]) => {
      console.log(`\n📄 ${fileName} (${rules.length} unused rules):`);
      rules.forEach((rule) => {
        console.log(`   • ${rule.selector} (${rule.type})`);
      });
    });

    console.log("\n💡 Cleanup Suggestions:");
    console.log("-".repeat(25));

    Object.entries(unusedByFile).forEach(([fileName, rules]) => {
      if (rules.length > 0) {
        console.log(`\n🔧 ${fileName}:`);
        console.log(`   Remove ${rules.length} unused rule(s):`);
        rules.slice(0, 5).forEach((rule) => {
          console.log(`   - ${rule.selector}`);
        });
        if (rules.length > 5) {
          console.log(`   - ... and ${rules.length - 5} more`);
        }
      }
    });

    const potentialSavings = Math.round(
      (usageReport.unusedCount / usageReport.totalRules) * 100,
    );
    console.log(`\n💾 Potential CSS size reduction: ~${potentialSavings}%`);
  } else {
    console.log("\n🎉 Great! No unused CSS rules found.");
  }

  if (usageReport.usedCount > 0) {
    console.log("\n✅ Most Used CSS Rules:");
    console.log("-".repeat(25));

    const sortedUsed = usageReport.used
      .sort((a, b) => {
        const aUsages = a.usedIn.reduce((sum, file) => sum + file.usages, 0);
        const bUsages = b.usedIn.reduce((sum, file) => sum + file.usages, 0);
        return bUsages - aUsages;
      })
      .slice(0, 10);

    sortedUsed.forEach(({ rule, usedIn }) => {
      const totalUsages = usedIn.reduce((sum, file) => sum + file.usages, 0);
      console.log(
        `   • ${rule.selector}: ${totalUsages} usage(s) in ${usedIn.length} file(s)`,
      );
    });
  }

  console.log("\n📋 Next Steps:");
  console.log("-".repeat(15));
  if (usageReport.unusedCount > 0) {
    console.log("1. Review the unused CSS rules listed above");
    console.log(
      "2. Verify they are truly unused (some might be used dynamically)",
    );
    console.log("3. Remove confirmed unused rules to reduce bundle size");
    console.log("4. Run this analysis again after cleanup");
  } else {
    console.log("1. Your CSS is well-optimized!");
    console.log("2. Consider running this analysis periodically");
    console.log("3. Use it when adding new CSS to prevent unused rules");
  }

  return {
    unusedByFile,
    summary: {
      totalRules: usageReport.totalRules,
      usedCount: usageReport.usedCount,
      unusedCount: usageReport.unusedCount,
      usedPercentage: Math.round(
        (usageReport.usedCount / usageReport.totalRules) * 100,
      ),
      unusedPercentage: Math.round(
        (usageReport.unusedCount / usageReport.totalRules) * 100,
      ),
    },
  };
}

async function main() {
  try {
    console.log("🔍 Starting CSS Usage Analysis...\n");

    if (!fs.existsSync(stylesDir)) {
      console.error(`❌ Error: Styles directory not found: ${stylesDir}`);
      process.exit(1);
    }

    const cssFiles = getAllCSSFiles(stylesDir);
    if (cssFiles.length === 0) {
      console.error(`❌ Error: No CSS files found in ${stylesDir}`);
      process.exit(1);
    }

    console.log(`📁 Found ${cssFiles.length} CSS file(s):`);
    cssFiles.forEach((file) => {
      console.log(`   • ${path.relative(projectRoot, file)}`);
    });

    const sourceFiles = getAllFiles(srcDir);
    console.log(`\n📄 Found ${sourceFiles.length} source file(s) to analyze`);

    const allCSSRules = [];
    for (const cssFile of cssFiles) {
      const cssContent = fs.readFileSync(cssFile, "utf8");
      const rules = extractCSSRules(cssContent, cssFile);
      allCSSRules.push(...rules);
    }

    console.log(
      `\n🎯 Extracted ${allCSSRules.length} CSS rules (classes and IDs)`,
    );

    const usageReport = analyzeUsage(allCSSRules, sourceFiles);
    const report = generateReport(usageReport, cssFiles);

    const reportPath = path.join(projectRoot, "css-analysis-report.json");
    const reportData = {
      timestamp: new Date().toISOString(),
      cssFiles: cssFiles.map((f) => path.relative(projectRoot, f)),
      sourceFiles: sourceFiles.map((f) => path.relative(projectRoot, f)),
      ...report,
    };

    fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));

    console.log(
      `\n📄 Detailed report saved to: ${path.relative(projectRoot, reportPath)}`,
    );
  } catch (error) {
    console.error(`❌ Error during analysis: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };

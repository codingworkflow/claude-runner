# Common Linting Issues and Solutions

This document outlines repetitive linting issues encountered in the Claude Runner VSCode extension codebase and their standardized solutions.

## TypeScript Configuration Issues

### TSConfig File Inclusion Errors

**Issue:** ESLint parsing errors when files are not included in TypeScript configuration files.

```
error: ESLint was configured to run on `<file>` using `parserOptions.project` but none of those TSConfigs include this file
```

**Solution:**

1. Add missing TSConfig files to ESLint parser options in `.eslintrc.json`:
   ```json
   "parserOptions": {
     "project": ["./tsconfig.json", "./tsconfig.test.json", "./tsconfig.cli.json"]
   }
   ```
2. Ensure files are included in the appropriate TSConfig:
   ```json
   "include": [
     "src/core/**/*",
     "cli/src/**/*",
     "cli/tests/**/*"
   ]
   ```

## Type Safety Issues

### Explicit `any` Types

**Issue:** Use of `any` type defeats TypeScript's type checking benefits.

```typescript
// ❌ Problematic
const mockFunction = jest.fn() as any;
const result = (executor as any).privateMethod();
```

**Solutions:**

1. **For Jest mocks:**

   ```typescript
   // ✅ Proper typing
   const mockFunction = jest.fn() as jest.MockedFunction<
     typeof originalFunction
   >;
   ```

2. **For accessing private methods in tests:**

   ```typescript
   // ✅ Proper type assertion
   const privateMethod = (
     executor as unknown as {
       privateMethod: (param: string) => Promise<void>;
     }
   ).privateMethod;
   ```

3. **For mock implementations:**

   ```typescript
   // ❌ Problematic
   return ({ prop1, prop2 }: any) => <div>...</div>;

   // ✅ Proper interface
   return ({ prop1, prop2 }: {
     prop1?: string;
     prop2?: (value: string) => void
   }) => <div>...</div>;
   ```

4. **For error objects:**

   ```typescript
   // ❌ Problematic
   (error as any).code = "ENOENT";

   // ✅ Proper typing
   (error as NodeJS.ErrnoException).code = "ENOENT";
   ```

### Unused Variables and Imports

**Issue:** Variables declared but never used, or imports that are not referenced.

**Solutions:**

1. **Remove truly unused variables:**

   ```typescript
   // ❌ Remove unused
   const unusedVar = getValue();
   ```

2. **Prefix with underscore for intentionally unused parameters:**

   ```typescript
   // ✅ Indicate intentional non-use
   array.forEach((_item, index) => {
     console.log(index);
   });
   ```

3. **Remove unused imports:**

   ```typescript
   // ❌ Remove if not used
   import { UnusedFunction } from "./module";

   // ✅ Keep only what's needed
   import { UsedFunction } from "./module";
   ```

## Code Quality Issues

### Nullish Coalescing Preference

**Issue:** Using logical OR (`||`) instead of nullish coalescing (`??`) can cause unexpected behavior with falsy values.

```typescript
// ❌ Problematic - treats 0, false, "" as undefined
const value = input || "default";

// ✅ Safer - only treats null/undefined as missing
const value = input ?? "default";
```

**When to use each:**

- Use `??` when you want to provide defaults only for `null` or `undefined`
- Use `||` when you want to provide defaults for any falsy value (rare cases)

### Non-null Assertions

**Issue:** Using `!` operator without proper null checks is unsafe.

```typescript
// ❌ Unsafe
fireEvent.click(element!);

// ✅ Safe null check
if (element) {
  fireEvent.click(element);
}
```

### Empty Block Statements

**Issue:** Empty `{}` blocks without comments suggest incomplete code.

```typescript
// ❌ Unclear intent
try {
  riskyOperation();
} catch (error) {}

// ✅ Clear intent
try {
  riskyOperation();
} catch (error) {
  // Intentionally ignore errors for this operation
}
```

### Console Statements in Tests

**Issue:** Console statements left in test files create noise and violate logging guidelines.

**Solution:** Remove all `console.log`, `console.warn`, `console.error` statements from test files:

```typescript
// ❌ Remove these
console.log("Debug info:", data);
console.warn("This might be an issue");

// ✅ Use proper test assertions instead
expect(data).toBeDefined();
expect(result).toContain("expected value");
```

### Require Statements in TypeScript

**Issue:** Using `require()` instead of ES6 imports in TypeScript files.

```typescript
// ❌ Avoid in TypeScript
const { useExtension } = require("./context");

// ✅ Use ES6 imports or add ESLint disable comment if necessary
import { useExtension } from "./context";

// ✅ Or if require is necessary (rare cases)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { useExtension } = require("./context");
```

## Prevention Strategies

### 1. Pre-commit Hooks

Set up pre-commit hooks to catch linting issues before they reach the repository:

```json
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged"
    }
  },
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "git add"]
  }
}
```

## Best Practices

1. **Fix linting issues immediately** - Don't let them accumulate
2. **Understand the rules** - Don't just disable rules without understanding why they exist
3. **Use proper types** - Avoid `any` at all costs, invest time in proper typing
4. **Test your fixes** - Ensure linting fixes don't break functionality
5. **Document exceptions** - If you must disable a rule, explain why with comments

Remember: Linting rules exist to improve code quality, maintainability, and prevent bugs. Following these patterns consistently will lead to a more robust and maintainable codebase.

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["src/**/*.test.ts", "src/test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // Block direct prisma.auditLog.create calls outside audit.service.ts.
    // Use audited() for mutations or auditEvent() for mutationless events.
    files: ["src/**/*.ts"],
    ignores: ["src/services/audit.service.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name='create'][callee.object.type='MemberExpression'][callee.object.property.name='auditLog'][callee.object.object.name='prisma']",
          message:
            "Do not call prisma.auditLog.create directly. Use audited() for mutations or auditEvent() for mutationless events.",
        },
      ],
    },
  },
  {
    // Tests mock prismaMock.auditLog.create — allow it.
    files: ["src/**/*.test.ts", "src/test/**/*.ts"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
  {
    ignores: ["dist/", "node_modules/", "prisma/"],
  }
);

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    rules: {
      // Source must stay `any`-free (SCALE-4). Test files relax this below
      // because they legitimately stub Fastify/Prisma internals with `any`.
      "@typescript-eslint/no-explicit-any": "error",
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
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // Block direct auditLog.create calls outside audit.service.ts, on any
    // client (prisma, tx, or a cast thereof). Use audited() for mutations,
    // auditEvent() for mutationless events, or auditEventTx() inside an
    // existing transaction.
    files: ["src/**/*.ts"],
    ignores: ["src/services/audit.service.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name='create'][callee.object.type='MemberExpression'][callee.object.property.name='auditLog']",
          message:
            "Do not call auditLog.create directly (on prisma or a transaction client). Use audited() for mutations, auditEvent() for mutationless events, or auditEventTx() inside an existing transaction.",
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

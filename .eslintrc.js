module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js', 'web/**', 'dist/**'],
  rules: {
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
  },
  overrides: [
    {
      files: ['src/circulation/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['**/books/*', '!**/books', '!**/books/index'],
                message:
                  'Circulation must not import Catalog (books) internals. Use public interface or plain IDs.',
              },
              {
                group: ['**/users/*', '!**/users', '!**/users/index'],
                message:
                  'Circulation must not import Identity (users) internals. Use public interface or plain IDs.',
              },
              {
                group: ['**/auth/*', '!**/auth', '!**/auth/index'],
                message:
                  'Circulation must not import Auth internals. Use public interface or plain IDs.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['src/books/**/*.ts', 'src/users/**/*.ts', 'src/auth/**/*.ts', 'src/circulation/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['**/notifications', '**/notifications/*'],
                message: 'Other areas must not import Notifications. Reach it only through domain events.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['src/notifications/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['**/circulation', '**/circulation/*'],
                message:
                  'Notifications must not import Circulation internals. Use plain IDs and domain events.',
              },
              {
                group: ['**/books/*', '!**/books', '!**/books/index'],
                message:
                  'Notifications must not import Catalog internals. Use the public interface.',
              },
              {
                group: ['**/users/*', '!**/users', '!**/users/index'],
                message:
                  'Notifications must not import Identity internals. Use the public interface (IdentityPublicApi).',
              },
              {
                group: ['**/auth/*', '!**/auth', '!**/auth/index'],
                message:
                  'Notifications must not import Auth internals. Use the public auth interface.',
              },
            ],
          },
        ],
      },
    },
  ],
};

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
  ignorePatterns: ['.eslintrc.js'],
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
                group: ['*books*'],
                message:
                  'Circulation must not import Catalog (books) internals. Use public interface or plain IDs.',
              },
              {
                group: ['*users*'],
                message:
                  'Circulation must not import Identity (users) internals. Use public interface or plain IDs.',
              },
              {
                group: ['*auth*'],
                message:
                  'Circulation must not import Auth internals. Use public interface or plain IDs.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['src/books/**/*.ts', 'src/users/**/*.ts', 'src/auth/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['*circulation*'],
                message: 'Must not import Circulation internals.',
              },
            ],
          },
        ],
      },
    },
  ],
};

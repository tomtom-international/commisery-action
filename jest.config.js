module.exports = {
  transform: {
    '^.+\\.ts$': ['ts-jest', {tsconfig: 'tsconfig.test.json', diagnostics: {ignoreCodes: [151002]}}],
    '^.+\\.js$': ['ts-jest', {tsconfig: {allowJs: true}, diagnostics: false}],
  },
  testEnvironment: 'node',
  testRegex: '/test/.*\\.(test|spec)\\.(ts|tsx)$',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  transformIgnorePatterns: [
    '/node_modules/(?!(@octokit|universal-user-agent|before-after-hook)/)',
  ],
};
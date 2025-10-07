const createSharedConfig = require('@marinade.finance/eslint-config')

const sharedConfig = createSharedConfig({})

module.exports = [
  ...sharedConfig,
  {
    rules: {
      'sonarjs/cognitive-complexity': 'off',
      complexity: 'off',
      'no-await-in-loop': 'off',
      // using relative imports is just easier in a small project like this
      'no-relative-import-paths/no-relative-import-paths': 'off',
      'import/no-relative-parent-imports': 'off',
    },
  },
  {
    settings: {
      jest: {
        version: 'false',
      },
    },
  },
]

module.exports = {
  preset: 'react-native',
  // backend/ uses node:test, web/ and recording/ are build and harness folders: none of them are jest suites
  testPathIgnorePatterns: ['/node_modules/', '/backend/', '/web/', '/recording/'],
};

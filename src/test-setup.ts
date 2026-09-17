import process from 'node:process'

// GitHub Actions esporta queste tre nel job, e il codice sotto test le legge dall'ambiente vero:
// chi vuole quel ramo lo stubba (scripts/lib/git.test.ts § changedFiles sulle pull request).
delete process.env.GITHUB_ACTIONS
delete process.env.GITHUB_EVENT_NAME
delete process.env.GITHUB_EVENT_PATH

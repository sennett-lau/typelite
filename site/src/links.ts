/** Every outbound link on the site, in one place. */
export const REPO = 'sennett-lau/typelite'
export const REPO_URL = `https://github.com/${REPO}`
const BLOB = `${REPO_URL}/blob/main`
const TREE = `${REPO_URL}/tree/main`

export const links = {
  repo: REPO_URL,
  releases: `${REPO_URL}/releases`,
  latestRelease: `${REPO_URL}/releases/latest`,
  stargazers: `${REPO_URL}/stargazers`,
  forks: `${REPO_URL}/forks`,
  issues: `${REPO_URL}/issues`,
  license: `${BLOB}/LICENSE`,
  notices: `${BLOB}/THIRD_PARTY_NOTICES.md`,
  readme: `${REPO_URL}#readme`,
  docs: `${BLOB}/docs/guides/README.md`,
  speechDocs: `${BLOB}/docs/guides/speech/README.md`,
  aiDocs: `${BLOB}/docs/guides/ai-polish/README.md`,
  models: `${BLOB}/docs/guides/models.md`,
  languages: `${BLOB}/docs/guides/languages.md`,
  benchmarks: `${BLOB}/docs/guides/benchmarks.md`,
  presets: `${TREE}/presets/languages`,
  presetCatalogue: `${BLOB}/presets/languages/README.md`,
  contributing: `${BLOB}/CONTRIBUTING.md`,
  contributeCode: `${BLOB}/CONTRIBUTING.md#code`,
  contributeCards: `${BLOB}/CONTRIBUTING.md#service-cards`,
  contributePresets: `${BLOB}/CONTRIBUTING.md#language-presets`,
  contributeDocs: `${TREE}/docs/guides`,
  setup: `${BLOB}/CONTRIBUTING.md#setup`,
  plans: `${BLOB}/docs/plans/README.md`,
  typeless: 'https://www.typeless.com/',
  whisper: 'https://github.com/ggml-org/whisper.cpp',
  llama: 'https://github.com/ggml-org/llama.cpp',
}

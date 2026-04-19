const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { loadFresh, makeTempDataDir, readJson } = require('./helpers');

test('app settings persist entirely in JSON', async () => {
  const dataDir = makeTempDataDir('settings');
  const outputDir = path.join(dataDir, 'generated-output');
  process.env.TAILOR_DATA_DIR = dataDir;
  process.env.OPENAI_API_KEY = '';
  process.env.ANTHROPIC_API_KEY = '';
  process.env.OPENROUTER_API_KEY = '';
  const config = loadFresh('../dist/config/aiModelConfig');

  const defaults = await config.getAdminAppSettings();
  assert.equal(defaults.openaiEnabled, true);
  assert.equal(defaults.defaultMode, 'preview');
  assert.equal(fs.existsSync(path.join(dataDir, 'config', 'ai-models.json')), true);

  const updated = await config.updateAppSettings({
    openaiEnabled: false,
    claudeEnabled: true,
    openrouterEnabled: false,
    defaultMode: 'generate',
    defaultTheme: 'dark',
    defaultResumeSelection: 'group',
    defaultGroupId: 'group-1',
    defaultProfileId: 'profile-1',
    defaultResumeDocxEnabled: false,
    defaultCoverLetterDocxEnabled: false,
    outputBaseDir: outputDir,
    outputPathTemplate: '/{{date}}/{{profile name}}/{{company name}}',
    googleSheetsSources: [{
      id: 'sheet-1',
      name: 'Applications',
      sheetId: 'abc123',
      createdAt: '2026-04-18T00:00:00.000Z',
      updatedAt: '2026-04-18T00:00:00.000Z',
    }],
    apiKeys: {
      claude: {
        add: [{ clientId: 'new-claude', name: 'Claude Test', value: 'claude-secret' }],
        activeKeyId: 'new-claude',
      },
    },
  });

  assert.equal(updated.openaiEnabled, false);
  assert.equal(updated.claudeEnabled, true);
  assert.equal(updated.defaultMode, 'generate');
  assert.equal(updated.defaultTheme, 'dark');
  assert.equal(updated.outputBaseDir, outputDir);
  assert.equal(updated.googleSheetsSources.length, 1);
  assert.equal(updated.apiKeys.claude.entries.length, 1);
  assert.equal(updated.apiKeys.claude.activeSource, 'stored');
  assert.equal(updated.apiKeys.claude.activePreview, 'clau...cret');
  assert.equal(await config.getProviderApiKey('claude'), 'claude-secret');

  const stored = readJson(path.join(dataDir, 'config', 'ai-models.json'));
  assert.equal(stored.apiKeys.claude.entries[0].value, 'claude-secret');
  assert.equal(stored.googleSheetsSources[0].sheetId, 'abc123');
  assert.equal(fs.existsSync(path.join(dataDir, 'config', 'settings.sqlite')), false);
});

test('app settings preserve at least one enabled provider and can fall back to environment keys', async () => {
  const dataDir = makeTempDataDir('settings-env');
  process.env.TAILOR_DATA_DIR = dataDir;
  process.env.OPENAI_API_KEY = 'openai-env-secret';
  process.env.ANTHROPIC_API_KEY = '';
  process.env.OPENROUTER_API_KEY = '';
  const config = loadFresh('../dist/config/aiModelConfig');

  await assert.rejects(
    () => config.updateAppSettings({
      openaiEnabled: false,
      claudeEnabled: false,
      openrouterEnabled: false,
    }),
    /At least one AI model must remain enabled/
  );

  assert.equal(await config.getProviderApiKey('openai'), 'openai-env-secret');
  const admin = await config.getAdminAppSettings();
  assert.equal(admin.apiKeys.openai.activeSource, 'environment');
});

test('generated path helpers read output settings from the JSON config', async () => {
  const dataDir = makeTempDataDir('generated-path');
  const outputDir = path.join(dataDir, 'output');
  process.env.TAILOR_DATA_DIR = dataDir;
  const config = loadFresh('../dist/config/aiModelConfig');
  const generatedPath = loadFresh('../dist/utils/generatedPath');

  await config.updateAppSettings({
    outputBaseDir: outputDir,
    outputPathTemplate: '/{{profile name}}/{{company name}}/{{job title}}',
  });

  const result = await generatedPath.getGeneratedOutputPath(
    { name: 'Jane Doe' },
    'Acme Inc',
    'Senior Engineer'
  );

  assert.equal(result.relativeBase, 'jane_doe/acme_inc/senior_engineer');
  assert.equal(result.absoluteDir, path.join(outputDir, 'jane_doe', 'acme_inc', 'senior_engineer'));
  assert.equal(result.profileSlug, 'jane_doe');
  assert.equal(result.companyFolderName, 'acme_inc');
  assert.equal(result.roleSlug, 'senior_engineer');
});

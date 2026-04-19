const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { loadFresh, makeTempDataDir, readJson } = require('./helpers');

function writePrompt(dataDir, id, content) {
  const promptsDir = path.join(dataDir, 'prompts');
  fs.mkdirSync(promptsDir, { recursive: true });
  fs.writeFileSync(
    path.join(promptsDir, `${id}.json`),
    `${JSON.stringify({
      id,
      content,
      createdAt: '2026-04-18T00:00:00.000Z',
      updatedAt: '2026-04-18T00:00:00.000Z',
    }, null, 2)}\n`
  );
}

test('prompt service lists and renders built-in JSON prompts', async () => {
  const dataDir = makeTempDataDir('prompts-built-in');
  process.env.TAILOR_DATA_DIR = dataDir;
  writePrompt(dataDir, 'analyze-job-description', 'Analyze [[jobDescription]]');

  const promptService = loadFresh('../dist/services/promptService');
  const prompts = await promptService.listPrompts();

  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].id, 'analyze-job-description');
  assert.equal(prompts[0].isBuiltIn, true);
  assert.deepEqual(prompts[0].validation, {
    usedVariables: ['jobDescription'],
    unknownVariables: [],
  });

  assert.equal(
    await promptService.renderPrompt('analyze-job-description', { jobDescription: 'Backend role' }),
    'Analyze Backend role'
  );
});

test('prompt service creates, previews, updates, and deletes custom JSON prompts', async () => {
  const dataDir = makeTempDataDir('prompts-custom');
  process.env.TAILOR_DATA_DIR = dataDir;
  const promptService = loadFresh('../dist/services/promptService');

  const created = await promptService.createPrompt({
    name: 'Greeting Prompt',
    description: 'Simple greeting',
    content: 'Hello [[name]]',
    responseFormat: 'text',
    allowedVariables: [{ name: 'name', description: 'Recipient name', sampleValue: 'Jane' }],
  });

  assert.equal(created.id, 'custom-greeting-prompt');
  assert.equal(created.isBuiltIn, false);
  assert.equal(created.content, 'Hello [[name]]');
  assert.deepEqual(created.validation, { usedVariables: ['name'], unknownVariables: [] });

  const promptPath = path.join(dataDir, 'prompts', `${created.id}.json`);
  assert.equal(readJson(promptPath).content, 'Hello [[name]]');

  const preview = await promptService.previewPrompt({
    id: created.id,
    sampleValues: { name: 'Ada' },
  });
  assert.equal(preview.renderedContent, 'Hello Ada');

  assert.equal(await promptService.renderPrompt(created.id, { name: 'Grace' }), 'Hello Grace');

  const updated = await promptService.updatePrompt(created.id, {
    name: 'Greeting Prompt Updated',
    content: 'Hi [[name]]',
    responseFormat: 'text',
    allowedVariables: [{ name: 'name' }],
  });

  assert.equal(updated.name, 'Greeting Prompt Updated');
  assert.equal(updated.content, 'Hi [[name]]');

  assert.equal(await promptService.deletePrompt(created.id), true);
  assert.equal(await promptService.getPromptById(created.id), null);
  assert.equal(fs.existsSync(promptPath), false);
});

test('prompt validation rejects unknown variables', async () => {
  const dataDir = makeTempDataDir('prompts-validation');
  process.env.TAILOR_DATA_DIR = dataDir;
  const promptService = loadFresh('../dist/services/promptService');

  assert.deepEqual(promptService.extractPromptVariables('[[one]] and [[ two ]] and [[one]]'), ['one', 'two']);
  const validation = promptService.validatePromptContent('Hello [[missing]]', [{ name: 'name' }]);
  assert.deepEqual(validation, {
    usedVariables: ['missing'],
    unknownVariables: ['missing'],
  });

  await assert.rejects(
    () => promptService.createPrompt({
      name: 'Invalid Prompt',
      content: 'Hello [[missing]]',
      allowedVariables: [{ name: 'name' }],
    }),
    /Unknown prompt variables/
  );
});

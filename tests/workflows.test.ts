import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');

describe('GitHub Actions workflows', () => {
  it('verifies lint, tests, and build for pull requests and main pushes', async () => {
    const workflow = await readFile(resolve(root, '.github/workflows/ci.yml'), 'utf8');

    expect(workflow).toContain('pull_request:');
    expect(workflow).toContain('push:');
    expect(workflow).toContain('npm run lint');
    expect(workflow).toContain('npm test');
    expect(workflow).toContain('npm run build');
  });

  it('deploys only after a successful CI run for main', async () => {
    const workflow = await readFile(resolve(root, '.github/workflows/deploy.yml'), 'utf8');

    expect(workflow).toContain('workflow_run:');
    expect(workflow).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(workflow).toContain("github.event.workflow_run.event == 'push'");
    expect(workflow).toContain('secrets.DEPLOY_HOST');
    expect(workflow).toContain('secrets.DEPLOY_SSH_FINGERPRINT');
    expect(workflow).toContain('secrets.DEPLOY_REPO_SSH_KEY');
    expect(workflow).toContain('git@github.com:BlackFxTalon/meeplio.git');
    expect(workflow).toContain('github.event.workflow_run.head_sha');
    expect(workflow).toContain('git checkout --detach "$DEPLOY_SHA"');
    expect(workflow).toContain('pm2 reload meeplio');
  });
});

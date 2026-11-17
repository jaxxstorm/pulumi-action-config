const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const distributions = ['.', '@jaxxstorm/pulumi-action-config'];
const minimums = {
  lodash: '4.17.21',
  'hosted-git-info': '2.8.9',
  browserslist: '4.16.6',
  'path-parse': '1.0.7',
  tmpl: '1.0.5',
  ajv: '6.12.6',
  minimist: '1.2.8',
  'decode-uri-component': '0.2.2',
};

function atLeast(actual, minimum) {
  const a = actual.split('.').map(Number);
  const b = minimum.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return true;
}

for (const directory of distributions) {
  test(`${directory}: locked and installed dependencies cover security updates`, () => {
    const base = path.join(root, directory);
    const lock = JSON.parse(fs.readFileSync(path.join(base, 'package-lock.json')));
    // Accept the original v1 locks so the same regression catches their
    // vulnerable versions, rather than merely rejecting their format.
    function legacyPackages(dependencies, prefix = '') {
      const entries = [];
      for (const [name, pkg] of Object.entries(dependencies || {})) {
        const location = `${prefix}node_modules/${name}`;
        entries.push([location, pkg], ...legacyPackages(pkg.dependencies, `${location}/`));
      }
      return entries;
    }
    const packages = lock.packages ? Object.entries(lock.packages) : legacyPackages(lock.dependencies);
    const seen = new Set();
    for (const [location, pkg] of packages) {
      if (!location) continue;
      const name = location.split('node_modules/').pop();
      const minimum = name === 'json5'
        ? (pkg.version.startsWith('1.') ? '1.0.2' : '2.2.3')
        : minimums[name];
      if (!minimum) continue;
      seen.add(name);
      assert.match(pkg.version, /^\d+\.\d+\.\d+$/, `${location}: expected a stable version`);
      assert.ok(atLeast(pkg.version, minimum), `${location}@${pkg.version} < ${minimum}`);
      const installed = JSON.parse(fs.readFileSync(path.join(base, location, 'package.json')));
      assert.equal(installed.version, pkg.version, `${directory}/${location} differs from lockfile`);
    }
    // Updated transitive parents no longer need source-map-resolve or
    // decode-uri-component. If it returns, the version check above applies.
    const required = [...Object.keys(minimums), 'json5'].filter(name => name !== 'decode-uri-component');
    assert.deepEqual([...seen].filter(name => name !== 'decode-uri-component').sort(), required.sort());
  });
}

test('compiled workflow classes preserve configuration without running services', async () => {
  const source = fs.readFileSync(path.join(root, '@jaxxstorm/pulumi-action-config/workflow.js'), 'utf8');
  const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const workflow = new module.GithubWorkflow('example', { PROVIDER: 'example' }, {});
  assert.equal(workflow.name, 'example');
  assert.deepEqual(workflow.env, { PROVIDER: 'example' });
  assert.deepEqual(Object.keys(workflow.jobs), ['lint', 'prerequisites', 'build_sdk', 'test']);
  assert.equal(workflow.jobs.build_sdk.needs, 'prerequisites');
  assert.equal(workflow.jobs.test.needs, 'build_sdk');
  assert.deepEqual(workflow.jobs.build_sdk.strategy.matrix.language, ['nodejs', 'python', 'dotnet']);
  const release = new module.GithubReleaseWorkFlow('release', {}, {});
  const prerelease = new module.GithubPrereleaseWorkflow('prerelease', {}, {});
  assert.equal(release.jobs.publish.needs, 'test');
  assert.equal(prerelease.jobs.publish.needs, 'test');
  assert.ok(release.jobs.publish.steps.some(step => step.name === 'Run GoReleaser'));
  assert.ok(prerelease.jobs.publish.steps.some(step => step.name === 'Run GoReleaser'));
});

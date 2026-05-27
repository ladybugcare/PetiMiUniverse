const path = require('path');
const ModuleScopePlugin = require('react-dev-utils/ModuleScopePlugin');

/**
 * Monorepo workspaces can install a second copy of react under frontend/node_modules
 * while react-router-dom resolves react from the repo root. That yields two Reacts and
 * runtime errors like "Cannot read properties of null (reading 'useRef')" in BrowserRouter.
 *
 * CRA's automatic JSX transform imports `react/jsx-runtime`, which does NOT always
 * follow the same `resolve.alias.react` entry as bare `react` — so we also pin the
 * jsx runtimes (and prefer the repo root in resolve.modules).
 */
module.exports = function override(config) {
  const repoRoot = path.resolve(__dirname, '..');
  const rootNodeModules = path.join(repoRoot, 'node_modules');
  const reactRoot = path.join(rootNodeModules, 'react');
  const reactDomRoot = path.join(rootNodeModules, 'react-dom');

  let jsxRuntime;
  let jsxDevRuntime;
  let reactDomClient;
  try {
    jsxRuntime = require.resolve('react/jsx-runtime', { paths: [rootNodeModules] });
    jsxDevRuntime = require.resolve('react/jsx-dev-runtime', {
      paths: [rootNodeModules],
    });
    reactDomClient = require.resolve('react-dom/client', {
      paths: [rootNodeModules],
    });
  } catch {
    jsxRuntime = path.join(reactRoot, 'jsx-runtime.js');
    jsxDevRuntime = path.join(reactRoot, 'jsx-dev-runtime.js');
    reactDomClient = path.join(reactDomRoot, 'client.js');
  }

  config.resolve.alias = {
    ...(config.resolve.alias || {}),
    react: reactRoot,
    'react-dom': reactDomRoot,
    'react/jsx-runtime': jsxRuntime,
    'react/jsx-dev-runtime': jsxDevRuntime,
    'react-dom/client': reactDomClient,
  };

  const modules = config.resolve.modules || [];
  if (!modules.some((m) => path.resolve(String(m)) === rootNodeModules)) {
    config.resolve.modules = [rootNodeModules, ...modules];
  }

  config.resolve.plugins = (config.resolve.plugins || []).filter(
    (plugin) => !(plugin instanceof ModuleScopePlugin)
  );
  return config;
};

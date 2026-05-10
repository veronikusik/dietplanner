const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// Force Metro to only resolve from this project's node_modules.
config.projectRoot = projectRoot;
config.watchFolders = [projectRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

// Block Metro from walking up to ancestor node_modules.
config.resolver.blockList = [
  new RegExp(path.resolve(projectRoot, '..', 'node_modules').replace(/[/\\]/g, '[/\\\\]')),
];

module.exports = config;

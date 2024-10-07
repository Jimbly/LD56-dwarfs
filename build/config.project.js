module.exports = function (config) {
  config.extra_index.push({
    // example .zip for itch.io publishing
    name: 'itch',
    defines: {
      ...config.default_defines,
      PLATFORM: 'web',
    },
    zip: true,
  });
};

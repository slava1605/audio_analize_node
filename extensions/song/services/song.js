'use strict';

/**
 * Read the documentation (https://strapi.io/documentation/developer-docs/latest/development/backend-customization.html#core-services)
 * to customize this service
 */
const _ = require('lodash');

module.exports = {
	async find(params, populate) {
    const results = await strapi.query('song').find({ ...params, _limit: 1 }, populate);
    return _.first(results) || null;
  },

	async createOrUpdate(data, { files } = {}) {
    const results = await strapi.query('song').find({ _limit: 1 });
    const entity = _.first(results) || null;

    let entry;
    if (!entity) {
      entry = await strapi.query('song').create(data);
    } else {
      entry = await strapi.query('song').update({ id: entity.id }, data);
    }

    if (files) {
      // automatically uploads the files based on the entry and the model
      await strapi.entityService.uploadFiles(entry, files, {
        model: 'song',
        // if you are using a plugin's model you will have to add the `plugin` key (plugin: 'users-permissions')
      });
      return this.findOne({ id: entry.id });
    }

    return entry;
  },

	async delete() {
    const results = await strapi.query('song').find({ _limit: 1 });
    const entity = _.first(results) || null;

    if (!entity) return;

    return strapi.query('song').delete({id: entity.id});
  },
};

'use strict';

/**
 * Read the documentation (https://strapi.io/documentation/developer-docs/latest/development/backend-customization.html#lifecycle-hooks)
 * to customize this model
 */
const request = require('request');
const axios = require("axios");

module.exports = {
	afterCreate: async (entry) => {
		axios.post(strapi.config.currentEnvironment.staticWebsiteBuildURL, entry)
			.catch(() => {
					// Ignore
				}
			);
	},

	afterUpdate: async (entry) => {
		axios.post(strapi.config.currentEnvironment.staticWebsiteBuildURL, entry)
			.catch(() => {
					// Ignore
				}
			);
	},

	afterDestroy: async (entry) => {
		axios.post(strapi.config.currentEnvironment.staticWebsiteBuildURL, entry)
			.catch(() => {
					// Ignore
				}
			);
	}
};

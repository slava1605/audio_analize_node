'use strict';

/**
 * Read the documentation (https://strapi.io/documentation/developer-docs/latest/development/backend-customization.html#core-controllers)
 * to customize this controller
 */

const { sanitizeEntity } = require('strapi-utils');
const { create } = require('../../../extensions/users-permissions/controllers/user/api');

const sanitizeSong = song =>
	sanitizeEntity(song, {
		model: strapi.query('song', 'users-permissions').model,
	});

module.exports = {
	async songCyanite(ctx) {
		const { id } = ctx.params;
		console.log(ctx.params, ctx.request.body);

		// const data = await strapi.plugins['users-permissions'].services.user.edit({ id }, { subscriptionStatus: 'deleted' });

		// ctx.send(sanitizeUser(data));
		return "hello Anton, what are you doing?";
	},

	async cyaniteSong(ctx) {
		const { id } = ctx.params;
		console.log(ctx.params, ctx.request.body);

		// const data = await strapi.plugins['users-permissions'].services.user.edit({ id }, { subscriptionStatus: 'deleted' });

		// ctx.send(sanitizeUser(data));
		return "hello Anton, what are you doing?";
	},

	async find(ctx) {
		const { id } = ctx.params;
		console.log(ctx.params, ctx.request.body);

		// const data = await strapi.plugins['users-permissions'].services.user.edit({ id }, { subscriptionStatus: 'deleted' });

		// ctx.send(sanitizeUser(data));
		return "hello world!";
	},

	async create(ctx) {
		ctx.send('hey');
		return "hello world!";
	}
};

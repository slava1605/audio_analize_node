'use strict';

/**
 * Auth.js controller
 *
 * @description: A set of functions called "actions" for managing `Auth`.
 */

/* eslint-disable no-useless-escape */
const crypto = require('crypto');
const _ = require('lodash');
const grant = require('grant-koa');
const { sanitizeEntity } = require('strapi-utils');
const axios = require("axios");

const emailRegExp = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
const formatError = error => [
  { messages: [{ id: error.id, message: error.message, field: error.field }] },
];

module.exports = {
  async callback(ctx) {
    const provider = ctx.params.provider || 'local';
    const params = ctx.request.body;

    const store = await strapi.store({
      environment: '',
      type: 'plugin',
      name: 'users-permissions',
    });

    if (provider === 'local') {
      if (!_.get(await store.get({ key: 'grant' }), 'email.enabled')) {
        return ctx.badRequest(null, 'This provider is disabled.');
      }

      // The identifier is required.
      if (!params.identifier) {
        return ctx.badRequest(
          null,
          formatError({
            id: 'Auth.form.error.email.provide',
            message: 'Please provide your username or your e-mail.',
          })
        );
      }

      // The password is required.
      if (!params.password) {
        return ctx.badRequest(
          null,
          formatError({
            id: 'Auth.form.error.password.provide',
            message: 'Please provide your password.',
          })
        );
      }

      const query = { provider };

      // Check if the provided identifier is an email or not.
      const isEmail = emailRegExp.test(params.identifier);

      // Set the identifier to the appropriate query field.
      if (isEmail) {
        query.email = params.identifier.toLowerCase();
      } else {
        query.username = params.identifier;
      }

      // Check if the user exists.
      const user = await strapi.query('user', 'users-permissions').findOne(query);

      if (!user) {
        return ctx.badRequest(
          null,
          formatError({
            id: 'Auth.form.error.invalid',
            message: 'Identifier or password invalid.',
          })
        );
      }

      if (
        _.get(await store.get({ key: 'advanced' }), 'email_confirmation') &&
        user.confirmed !== true
      ) {
        return ctx.badRequest(
          null,
          formatError({
            id: 'Auth.form.error.confirmed',
            message: 'Your account email is not confirmed',
          })
        );
      }

      if (user.blocked === true) {
        return ctx.badRequest(
          null,
          formatError({
            id: 'Auth.form.error.blocked',
            message: 'Your account has been blocked by an administrator',
          })
        );
      }

      // The user never authenticated with the `local` provider.
      if (!user.password) {
        return ctx.badRequest(
          null,
          formatError({
            id: 'Auth.form.error.password.local',
            message:
              'This user never set a local password, please login with the provider used during account creation.',
          })
        );
      }

      const validPassword = await strapi.plugins[
        'users-permissions'
      ].services.user.validatePassword(params.password, user.password);

      if (!validPassword) {
        return ctx.badRequest(
          null,
          formatError({
            id: 'Auth.form.error.invalid',
            message: 'Identifier or password invalid.',
          })
        );
      } else {

        if (user.subscriptionStatus === 'deleted') {
          return ctx.badRequest(
            null,
            formatError({
              id: 'provider.disabled',
              message: 'This user is deleted by yourself.',
            })
          );
        }

        ctx.send({
          jwt: strapi.plugins['users-permissions'].services.jwt.issue({
            id: user.id,
          }),
          user: sanitizeEntity(user.toJSON ? user.toJSON() : user, {
            model: strapi.query('user', 'users-permissions').model,
          }),
        });
      }
    } else {
      if (!_.get(await store.get({ key: 'grant' }), [provider, 'enabled'])) {
        return ctx.badRequest(
          null,
          formatError({
            id: 'provider.disabled',
            message: 'This provider is disabled.',
          })
        );
      }

      // Connect the user with the third-party provider.
      let user;
      let error;
      try {
        [user, error] = await strapi.plugins['users-permissions'].services.providers.connect(
          provider,
          ctx.query
        );
      } catch ([user, error]) {
        return ctx.badRequest(null, error === 'array' ? error[0] : error);
      }

      if (!user) {
        return ctx.badRequest(null, error === 'array' ? error[0] : error);
      }

      if (user.subscriptionStatus === 'deleted') {
        return ctx.badRequest(
          null,
          formatError({
            id: 'provider.disabled',
            message: 'This user is deleted by yourself.',
          })
        );
      }

      ctx.send({
        jwt: strapi.plugins['users-permissions'].services.jwt.issue({
          id: user.id,
        }),
        user: sanitizeEntity(user.toJSON ? user.toJSON() : user, {
          model: strapi.query('user', 'users-permissions').model,
        }),
      });
    }
  },

  async resetPassword(ctx) {
    const params = _.assign({}, ctx.request.body, ctx.params);

    if (
      params.password &&
      params.passwordConfirmation &&
      params.password === params.passwordConfirmation &&
      params.code
    ) {
      const user = await strapi
        .query('user', 'users-permissions')
        .findOne({ resetPasswordToken: `${params.code}` });

      if (!user) {
        return ctx.badRequest(
          null,
          formatError({
            id: 'Auth.form.error.code.provide',
            message: 'Incorrect code provided.',
          })
        );
      }

      const password = await strapi.plugins['users-permissions'].services.user.hashPassword({
        password: params.password,
      });

      // Update the user.
      await strapi
        .query('user', 'users-permissions')
        .update({ id: user.id }, { resetPasswordToken: null, password });

      ctx.send({
        jwt: strapi.plugins['users-permissions'].services.jwt.issue({
          id: user.id,
        }),
        user: sanitizeEntity(user.toJSON ? user.toJSON() : user, {
          model: strapi.query('user', 'users-permissions').model,
        }),
      });
    } else if (
      params.password &&
      params.passwordConfirmation &&
      params.password !== params.passwordConfirmation
    ) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.password.matching',
          message: 'Passwords do not match.',
        })
      );
    } else {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.params.provide',
          message: 'Incorrect params provided.',
        })
      );
    }
  },

  async connect(ctx, next) {
    const grantConfig = await strapi
      .store({
        environment: '',
        type: 'plugin',
        name: 'users-permissions',
        key: 'grant',
      })
      .get();

    const [requestPath] = ctx.request.url.split('?');
    const provider = requestPath.split('/')[2];

    if (!_.get(grantConfig[provider], 'enabled')) {
      return ctx.badRequest(null, 'This provider is disabled.');
    }

    if (!strapi.config.server.url.startsWith('http')) {
      strapi.log.warn(
        'You are using a third party provider for login. Make sure to set an absolute url in config/server.js. More info here: https://strapi.io/documentation/developer-docs/latest/development/plugins/users-permissions.html#setting-up-the-server-url'
      );
    }

    // Ability to pass OAuth callback dynamically
    grantConfig[provider].callback = _.get(ctx, 'query.callback') || grantConfig[provider].callback;
    grantConfig[provider].redirect_uri = strapi.plugins[
      'users-permissions'
    ].services.providers.buildRedirectUri(provider);

    return grant(grantConfig)(ctx, next);
  },

  async forgotPassword(ctx) {
    let { email } = ctx.request.body;

    // Check if the provided email is valid or not.
    const isEmail = emailRegExp.test(email);

    if (isEmail) {
      email = email.toLowerCase();
    } else {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.email.format',
          message: 'Please provide valid email address.',
        })
      );
    }

    const pluginStore = await strapi.store({
      environment: '',
      type: 'plugin',
      name: 'users-permissions',
    });

    // Find the user by email.
    const user = await strapi
      .query('user', 'users-permissions')
      .findOne({ email: email.toLowerCase() });

    // User not found.
    if (!user) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.user.not-exist',
          message: 'This email does not exist.',
        })
      );
    }

    console.log(user);

    // Generate random token.
    const resetPasswordToken = crypto.randomBytes(64).toString('hex');

    // const settings = await pluginStore.get({ key: 'email' }).then(storeEmail => {
    //   try {
    //     return storeEmail['reset_password'].options;
    //   } catch (error) {
    //     return {};
    //   }
    // });

    // const advanced = await pluginStore.get({
    //   key: 'advanced',
    // });

    // const userInfo = sanitizeEntity(user, {
    //   model: strapi.query('user', 'users-permissions').model,
    // });

    // settings.message = await strapi.plugins['users-permissions'].services.userspermissions.template(
    //   settings.message,
    //   {
    //     URL: advanced.email_reset_password,
    //     USER: userInfo,
    //     TOKEN: resetPasswordToken,
    //   }
    // );

    // settings.object = await strapi.plugins['users-permissions'].services.userspermissions.template(
    //   settings.object,
    //   {
    //     USER: userInfo,
    //   }
    // );

    try {
      // Send an email to the user.
      await strapi.plugins['email-designer'].services.email.sendTemplatedEmail(
        {
          to: user.email, // required
          from: 'hello@songanizer.com', // optional if /config/plugins.js -> email.settings.defaultFrom is set
          replyTo: 'hello@songanizer.com', // optional if /config/plugins.js -> email.settings.defaultReplyTo is set
          attachments: [], // optional array of files
        },
        {
          templateId: '611add0e0973db8e4fb29479', // required - you can get the template id from the admin panel
          subject: `Reset your password`, // If provided here will override the template's subject. Can include variables like `Thank you for your order {{= user.firstName }}!`  
        },
        {
          // this object must include all variables you're using in your email template
          url: "https://songanizer.com/reset-password/",
          // url: "http://localhost:3000/reset-password/",
          token: resetPasswordToken
        }
      );
      // await strapi.plugins['email'].services.email.send({
      //   to: user.email,
      //   from:
      //     settings.from.email || settings.from.name
      //       ? `${settings.from.name} <${settings.from.email}>`
      //       : undefined,
      //   replyTo: settings.response_email,
      //   subject: settings.object,
      //   text: settings.message,
      //   html: settings.message,
      // });
    } catch (err) {
      return ctx.badRequest(null, err);
    }

    // Update the user.
    await strapi.query('user', 'users-permissions').update({ id: user.id }, { resetPasswordToken });

    ctx.send({ ok: true });
  },

  async register(ctx) {
    const pluginStore = await strapi.store({
      environment: '',
      type: 'plugin',
      name: 'users-permissions',
    });

    const settings = await pluginStore.get({
      key: 'advanced',
    });

    if (!settings.allow_register) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.advanced.allow_register',
          message: 'Register action is currently disabled.',
        })
      );
    }

    const params = {
      ..._.omit(ctx.request.body, ['confirmed', 'confirmationToken', 'resetPasswordToken']),
      provider: 'local',
    };

    // Password is required.
    if (!params.password) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.password.provide',
          message: 'Please provide your password.',
        })
      );
    }

    // Email is required.
    if (!params.email) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.email.provide',
          message: 'Please provide your email.',
        })
      );
    }

    // Throw an error if the password selected by the user
    // contains more than three times the symbol '$'.
    if (strapi.plugins['users-permissions'].services.user.isHashed(params.password)) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.password.format',
          message: 'Your password cannot contain more than three times the symbol `$`.',
        })
      );
    }

    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ type: settings.default_role }, []);

    if (!role) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.role.notFound',
          message: 'Impossible to find the default role.',
        })
      );
    }

    // Check if the provided email is valid or not.
    const isEmail = emailRegExp.test(params.email);

    if (isEmail) {
      params.email = params.email.toLowerCase();
    } else {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.email.format',
          message: 'Please provide valid email address.',
        })
      );
    }

    params.role = role.id;
    params.password = await strapi.plugins['users-permissions'].services.user.hashPassword(params);

    const user = await strapi.query('user', 'users-permissions').findOne({
      email: params.email,
    });

    if (user && user.provider === params.provider) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.email.taken',
          message: 'Email is already taken.',
        })
      );
    }

    if (user && user.provider !== params.provider && settings.unique_email) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.email.taken',
          message: 'Email is already taken.',
        })
      );
    }

    try {
      if (!settings.email_confirmation) {
        params.confirmed = true;
      }

      const user = await strapi.query('user', 'users-permissions').create(params);

      if (user.isContact) {
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
        }
        axios.put('https://api.sendgrid.com/v3/marketing/contacts', {
          "contacts": [
            {
              "email": user.email,
              "first_name": user.firstName,
              "last_name": user.lastName
            }
          ]
        }, { headers: headers }).then((data) => {
          console.log('contact success', data);
        }).catch(err => console.log('contact failed', err));
      }
      
      const sanitizedUser = sanitizeEntity(user, {
        model: strapi.query('user', 'users-permissions').model,
      });

      if (settings.email_confirmation) {
        try {
          // strapi.plugins.email.services.email.send(email)
          // await strapi.plugins['users-permissions'].services.user.sendConfirmationEmail(user);
          console.log('user', user);
          await strapi.plugins['email-designer'].services.email.sendTemplatedEmail(
            {
              to: user.email, // required
              from: 'hello@songanizer.com', // optional if /config/plugins.js -> email.settings.defaultFrom is set
              replyTo: 'hello@songanizer.com', // optional if /config/plugins.js -> email.settings.defaultReplyTo is set
              attachments: [], // optional array of files
            },
            {
              templateId: '611ac2c058b9162af485dd7a', // required - you can get the template id from the admin panel
              subject: `Welcome to Songanizer!`, // If provided here will override the template's subject. Can include variables like `Thank you for your order {{= user.firstName }}!`  
            },
            {
              // this object must include all variables you're using in your email template
              url: "https://songanizer.com/emailconfirmed/",
              user: user,
              // url: "http://localhost:3000/emailconfirmed/",
              code: strapi.plugins['users-permissions'].services.jwt.issue(_.pick(user, ['id']))
            }
          );
        } catch (err) {
          console.log(err);
          return ctx.badRequest(null, err);
        }

        return ctx.send({ user: sanitizedUser });
      }

      const jwt = strapi.plugins['users-permissions'].services.jwt.issue(_.pick(user, ['id']));

      return ctx.send({
        jwt,
        user: sanitizedUser,
      });
    } catch (err) {
      const adminError = _.includes(err.message, 'username')
        ? {
            id: 'Auth.form.error.username.taken',
            message: 'Username already taken',
          }
        : { id: 'Auth.form.error.email.taken', message: 'Email already taken' };

      ctx.badRequest(null, formatError(adminError));
    }
  },

  async emailConfirmation(ctx, next, returnUser) {
    const { confirmation: confirmationToken } = ctx.query;

    const { user: userService, jwt: jwtService } = strapi.plugins['users-permissions'].services;

    if (_.isEmpty(confirmationToken)) {
      return ctx.badRequest('token.invalid');
    }

    let c = {
      request: {
        header: {
          authorization: `Bearer ${confirmationToken}`
        }
      }
    }

    const { id } = await strapi.plugins[
      'users-permissions'
    ].services.jwt.getToken(c);

    const user = await strapi.query('user', 'users-permissions').findOne({
      _id: id,
    });

    // const user = await userService.fetch({ confirmationToken }, []);

    if (!user) {
      return ctx.badRequest('token.invalid');
    }

    await userService.edit({ id: user.id }, { confirmed: true, confirmationToken: null });
    
    ctx.send({
      jwt: jwtService.issue({ id: user.id }),
      user: sanitizeEntity(user, {
        model: strapi.query('user', 'users-permissions').model,
      }),
    });

    // if (returnUser) {
    //   ctx.send({
    //     jwt: jwtService.issue({ id: user.id }),
    //     user: sanitizeEntity(user, {
    //       model: strapi.query('user', 'users-permissions').model,
    //     }),
    //   });
    // } else {
    //   const settings = await strapi
    //     .store({
    //       environment: '',
    //       type: 'plugin',
    //       name: 'users-permissions',
    //       key: 'advanced',
    //     })
    //     .get();

    //   ctx.redirect(settings.email_confirmation_redirection || '/');
    // }
  },

  async sendEmailConfirmation(ctx) {
    const params = _.assign(ctx.request.body);

    if (!params.email) {
      return ctx.badRequest('missing.email');
    }

    const isEmail = emailRegExp.test(params.email);

    if (isEmail) {
      params.email = params.email.toLowerCase();
    } else {
      return ctx.badRequest('wrong.email');
    }

    const user = await strapi.query('user', 'users-permissions').findOne({
      email: params.email,
    });

    if (user.confirmed) {
      return ctx.badRequest('already.confirmed');
    }

    if (user.blocked) {
      return ctx.badRequest('blocked.user');
    }

    try {
      await strapi.plugins['users-permissions'].services.user.sendConfirmationEmail(user);
      ctx.send({
        email: user.email,
        sent: true,
      });
    } catch (err) {
      return ctx.badRequest(null, err);
    }
  },
};

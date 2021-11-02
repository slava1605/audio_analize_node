'use strict';

const _ = require('lodash');
const { uuid } = require('uuidv4');
const AWS = require('aws-sdk');
const fs = require('fs');
const axios = require("axios");

const s3 = new AWS.S3({
	accessKeyId: process.env.AWS_ACCESS_KEY_ID,
	secretAccessKey: process.env.AWS_ACCESS_SECRET
});

const { sanitizeEntity } = require('strapi-utils');

const sanitizeUser = user =>
  sanitizeEntity(user, {
    model: strapi.query('user', 'users-permissions').model,
  });

const formatError = error => [
  { messages: [{ id: error.id, message: error.message, field: error.field }] },
];

const addPhoto = async (username, file) => {
	let photoLink = "";
	if (!file) return "";
  console.log(file);
  const myFile = file.name.split('.');
  const fileType = myFile[myFile.length - 1];
  const key = `${uuid()}.${fileType}`;

  // const buffer = fs.readFileSync(file.path,
  //           {encoding:'utf8', flag:'r'});

  const buffer = fs.readFileSync(file.path);

  console.log (buffer);

  const params = {
    Bucket: `${process.env.AWS_BUCKET_NAME}`,
    Key: `users/${username}/images/${key}`,
    Body: buffer,
    ACL: 'public-read'
  }
  
  const uploadPromise = new Promise((resolve, reject) => {
    s3.upload(params, (err, data) => {
      if (err) {
        reject(err);
      }
      resolve(data);
    });
  });

  await uploadPromise.then(async data => {
    photoLink = `https://songanizer.s3.us-west-2.amazonaws.com/users/${username}/images/${key}`;
  }).catch(err => {
    console.log(err);
    return "";
  });

  return photoLink;
};

const deletePhoto = async ( username, photo ) => {
	// console.log(photos);
  let key = photo.split('/')[6];
  const deleteFromS3 = new Promise((resolve, reject) => {
    try {
        s3.deleteObject({
            Bucket: `${process.env.AWS_BUCKET_NAME}`,
            Key: `users/${username}/images/${key}`,
        }, (err, data) => resolve());
    } catch (err) {
        reject(err);
    }
  });
  deleteFromS3.then(async () => {
  }).catch((err) => {
      return false;
  });
	
	return true;
};

module.exports = {
  /**
   * Create a/an user record.
   * @return {Object}
   */
  async create(ctx) {
    const advanced = await strapi
      .store({
        environment: '',
        type: 'plugin',
        name: 'users-permissions',
        key: 'advanced',
      })
      .get();

    const { email, username, password, role } = ctx.request.body;

    if (!email) return ctx.badRequest('missing.email');
    if (!username) return ctx.badRequest('missing.username');
    if (!password) return ctx.badRequest('missing.password');

    const userWithSameUsername = await strapi
      .query('user', 'users-permissions')
      .findOne({ username });

    if (userWithSameUsername) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.username.taken',
          message: 'Username already taken.',
          field: ['username'],
        })
      );
    }

    if (advanced.unique_email) {
      const userWithSameEmail = await strapi
        .query('user', 'users-permissions')
        .findOne({ email: email.toLowerCase() });

      if (userWithSameEmail) {
        return ctx.badRequest(
          null,

          formatError({
            id: 'Auth.form.error.email.taken',
            message: 'Email already taken.',
            field: ['email'],
          })
        );
      }
    }

    const user = {
      ...ctx.request.body,
      provider: 'local',
    };

    user.email = user.email.toLowerCase();

    if (!role) {
      const defaultRole = await strapi
        .query('role', 'users-permissions')
        .findOne({ type: advanced.default_role }, []);

      user.role = defaultRole.id;
    }

    try {
      const data = await strapi.plugins['users-permissions'].services.user.add(user);

      ctx.created(sanitizeUser(data));
    } catch (error) {
      ctx.badRequest(null, formatError(error));
    }
  },
  /**
   * Update a/an user record.
   * @return {Object}
   */

  async update(ctx) {
    console.log('hello', ctx.request.files, process.env.AWS_ACCESS_KEY_ID);
    const advancedConfigs = await strapi
      .store({
        environment: '',
        type: 'plugin',
        name: 'users-permissions',
        key: 'advanced',
      })
      .get();

    const { id } = ctx.params;
    const { email, username, password } = ctx.request.body;

    const user = await strapi.plugins['users-permissions'].services.user.fetch({
      id,
    });
    
    let photoUrl = user.photo ? user.photo : '';
    let playlistPhotoUrl = user.playlistPhoto ? user.playlistPhoto : '';

    if (ctx.request.files['photo']) {
      try {
        await deletePhoto(user.username, photoUrl);
      } catch (err) {
        console.log(err);
      }
      
      try {
        photoUrl = await addPhoto(user.username, ctx.request.files['photo']);
      } catch (err) {
        console.log(err);
      }
    }

    if (ctx.request.files['playlistPhoto']) {
      try {
        await deletePhoto(user.username, playlistPhotoUrl);
      } catch (err) {
        console.log(err);
      }
      
      try {
        playlistPhotoUrl = await addPhoto(user.username, ctx.request.files['playlistPhoto']);
      } catch (err) {
        console.log(err);
      }
    }

    if (_.has(ctx.request.body, 'email') && !email) {
      return ctx.badRequest('email.notNull');
    }

    if (_.has(ctx.request.body, 'username') && !username) {
      return ctx.badRequest('username.notNull');
    }

    if (_.has(ctx.request.body, 'password') && !password && user.provider === 'local') {
      return ctx.badRequest('password.notNull');
    }

    if (_.has(ctx.request.body, 'username')) {
      const userWithSameUsername = await strapi
        .query('user', 'users-permissions')
        .findOne({ username });

      if (userWithSameUsername && userWithSameUsername.id != id) {
        return ctx.badRequest(
          null,
          formatError({
            id: 'Auth.form.error.username.taken',
            message: 'username.alreadyTaken.',
            field: ['username'],
          })
        );
      }
    }

    if (_.has(ctx.request.body, 'email') && advancedConfigs.unique_email) {
      const userWithSameEmail = await strapi
        .query('user', 'users-permissions')
        .findOne({ email: email.toLowerCase() });

      if (userWithSameEmail && userWithSameEmail.id != id) {
        return ctx.badRequest(
          null,
          formatError({
            id: 'Auth.form.error.email.taken',
            message: 'Email already taken',
            field: ['email'],
          })
        );
      }
      ctx.request.body.email = ctx.request.body.email.toLowerCase();
      try {
        // strapi.plugins.email.services.email.send(email)
        // await strapi.plugins['users-permissions'].services.user.sendConfirmationEmail(user);
        console.log('user', user);
        const newToken = strapi.plugins['users-permissions'].services.jwt.issue(_.pick(user, ['id']));
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
        }
        
        axios.post('https://api.sendgrid.com/v3/marketing/contacts/search', {
          "query": `email LIKE '${user.email}'`
        }, { headers: headers }).then((data) => {
          console.log('contact success', data);
          axios.delete('https://api.sendgrid.com/v3/marketing/contacts/', {
            "ids": data.data.result.id
          }, { headers: headers }).then((_data) => {
            console.log('deleted');
          }).catch(err => console.log('delete failed', err));
        }).catch(err => console.log('contact failed', err));

        axios.put('https://api.sendgrid.com/v3/marketing/contacts', {
          "contacts": [
            {
              "email": ctx.request.body.email,
              "first_name": user.firstName,
              "last_name": user.lastName
            }
          ]
        }, { headers: headers }).then((data) => {
          console.log('contact success', data);
        }).catch(err => console.log('contact failed', err));

        await strapi.plugins['email-designer'].services.email.sendTemplatedEmail(
          {
            to: ctx.request.body.email, // required
            from: 'hello@songanizer.com', // optional if /config/plugins.js -> email.settings.defaultFrom is set
            replyTo: 'hello@songanizer.com', // optional if /config/plugins.js -> email.settings.defaultReplyTo is set
            attachments: [], // optional array of files
          },
          {
            templateId: '612270cfa0481e68eb7c70ff', // required - you can get the template id from the admin panel
            subject: `Your Email Changed`, // If provided here will override the template's subject. Can include variables like `Thank you for your order {{= user.firstName }}!`  
          },
          {
            // this object must include all variables you're using in your email template
            url: "https://songanizer.com/emailconfirmed/",
            user: user,
            // url: "http://localhost:3000/emailconfirmed/",
            code: newToken
          }
        );
        // await strapi.plugins['users-permissions'].services.user.edit({ id: user.id }, { confirmed: false, confirmationToken: newToken });
      } catch (err) {
        console.log(err);
        return ctx.badRequest(null, err);
      }
    }

    let updateData = {};
    let requestBody = JSON.parse(JSON.stringify(ctx.request.body));
    if (requestBody.socialNetwork) {
      requestBody.socialNetwork = JSON.parse(requestBody.socialNetwork);
    }
    if (photoUrl !== "") {
      updateData  = {
        ...requestBody,
        photo: photoUrl,
      };
    } else {
      updateData  = {
        ...requestBody
      };
    }
    if (playlistPhotoUrl !== '') {
      updateData.playlistPhoto = playlistPhotoUrl;
    }

    console.log(updateData, photoUrl, playlistPhotoUrl);

    if (_.has(ctx.request.body, 'password') && password === user.password) {
      delete updateData.password;
    }

    const data = await strapi.plugins['users-permissions'].services.user.edit({ id }, { ...updateData } );

    ctx.send(sanitizeUser(data));
  },

  async destroy(ctx) {
    const { id } = ctx.params;

    const data = await strapi.plugins['users-permissions'].services.user.edit({ id }, { subscriptionStatus: 'deleted' });

    ctx.send(sanitizeUser(data));
  },
};

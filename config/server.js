module.exports = ({ env }) => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  // url: 'https://api.songanizer.com',
  url: 'http://localhost:1337',
  admin: {
    auth: {
      secret: env('ADMIN_JWT_SECRET', '6e9dac582c8bddc541ad1f60de2ed8b9'),
    },
  },
});

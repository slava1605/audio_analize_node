module.exports =({ env }) => ({
	upload: {
		provider: 'aws-s3',
		providerOptions: {
			accessKeyId: env('AWS_ACCESS_KEY_ID'),
                   	secretAccessKey: env('AWS_ACCESS_SECRET'),
			region: 'us-west-2',
			params: {
				Bucket: 'songanizer',
			},
		},
	},
	'email-designer': {
		editor: {
		  tools: {
			heading: {
			  properties: {
				text: {
				  value: 'This is the new default text!'
				}
			  }
			}
		  },
		  options: {
			features: {
			  colorPicker: {
				presets: ['#D9E3F0', '#F47373', '#697689', '#37D67A']
			  }
			},
			fonts: {
			  showDefaultFonts: false,
			  customFonts: [
				{
				  label: "Anton",
				  value: "'Anton', sans-serif",
				  url: "https://fonts.googleapis.com/css?family=Anton",
				},
				{
				  label: "Lato",
				  value: "'Lato', Tahoma, Verdana, sans-serif",
				  url: "https://fonts.googleapis.com/css?family=Lato",
				},
				// ...
			  ],
			},
			mergeTags: [
			  {
				name: 'Email',
				value: '{{= USER.username }}',
				sample: 'john@doe.com',
			  },
			  // ...
			]
		  },
		  appearance: {
			theme: "dark",
			panels: {
			  tools: {
				dock: 'left'
			  }
			}
		  }
		}
	},
	email: {
    provider: 'sendgrid',
    providerOptions: {
      apiKey: env('SENDGRID_API_KEY'),
    },
    settings: {
      defaultFrom: 'hello@songanizer.com',
			defaultReplyTo: 'hello@songanizer.com',
			testAddress: 'mati@matigavriel.com',
    },
  },
});

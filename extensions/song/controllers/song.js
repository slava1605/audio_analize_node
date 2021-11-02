'use strict';

/**
 * Read the documentation (https://strapi.io/documentation/developer-docs/latest/development/backend-customization.html#core-controllers)
 * to customize this controller
 */

const _ = require('lodash');
const { uuid } = require('uuidv4');
const { sanitizeEntity } = require('strapi-utils');
const { create } = require('../../../extensions/users-permissions/controllers/user/api');
const FormData = require('form-data');
const axios = require("axios");
const AWS = require('aws-sdk');
const fs = require('fs');
const fetch = require("node-fetch");
const spawn = require('child_process').spawn;
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path
const ffmpeg = require('fluent-ffmpeg')
ffmpeg.setFfmpegPath(ffmpegPath)

const cyaniteAppUrl = process.env.CYANITE_APP_URL;
const cyaniteSecretKey = process.env.CYANITE_SECRET_KEY;
const cyaniteAccessToken = process.env.CYANITE_ACCESS_TOKEN;

const fileUploadRequestMutation = /* GraphQL */ `
	mutation fileUploadRequest {
		fileUploadRequest {
			id
			uploadUrl
		}
	}
`;

const inDepthAnalysisCreateMutation = /* GraphQL */ `
  mutation inDepthAnalysisCreate($data: InDepthAnalysisCreateInput!) {
    inDepthAnalysisCreate(data: $data) {
      __typename
      ... on InDepthAnalysisCreateResultSuccess {
        inDepthAnalysis {
          id
          status
        }
      }
      ... on Error {
        message
      }
    }
  }
`;

const inDepthAnalysisMutation = `query inDepthAnalysis($inDepthAnalysisId: ID!) {
  inDepthAnalysis(recordId: $inDepthAnalysisId) {
    __typename
    ... on Error {
      message
    }
    ... on InDepthAnalysis {
      id
      title
      result {
        genres {
          title
          confidence
        }
        segmentData {
          timestamps
          genreScores {
            type
            name
            values
          }
          moodScores {
            type
            name
            values
          }
        }
        moodMeanScores {
          type
          name
          value
        }
        energyLevel
        energyDynamics
        emotionalProfile
        emotionalDynamics
        voiceMean {
          female
          instrumental
          male
        }
        voicePresenceProfile
        predominantVoiceGender
      }
      fastMusicalAnalysis {
        __typename
        ... on FastMusicalAnalysisFailed {
          error {
            __typename
            ... on Error {
              message
            }
          }
        }
        ... on FastMusicalAnalysisFinished {
          result {
            bpm
            key {
              values
              confidences
            }
          }
        }
      }
      fullScaleMusicalAnalysis {
        __typename
        ... on FullScaleMusicalAnalysisFailed {
          error {
            __typename
            ... on Error {
              message
            }
          }
        }
        ... on FullScaleMusicalAnalysisFinished {
          result {
            bpm
            key {
              values
              confidences
            }
          }
        }
      }
    }
  }
}`;

const getGeneralInfoQuery = `query LibraryTrackInstrumentClassifier($libraryTrackId: ID!) {
  libraryTrack(id: $libraryTrackId) {
    __typename
    ... on LibraryTrack {
      id
      audioAnalysisV6 {
        __typename
        ... on AudioAnalysisV6Finished {
          result {
						bpm,
						key,
						segments {
							representativeSegmentIndex,
							timestamps,
							mood {
								aggressive,
								calm,
								chilled,
								dark,
								energetic,
								epic,
								happy,
								romantic,
								sad,
								scary,
								sexy,
								ethereal,
								uplifting,
							},
							voice {
								female,
								instrumental,
								male,
							},
							instruments {
								percussion,
								synth,
								piano,
								acousticGuitar,
								electricGuitar,
								strings,
								bass,
								bassGuitar,
								brassWoodwinds,
							},
							genre {
								ambient,
								blues,
								classical,
								country,
								electronicDance,
								folk,
								indieAlternative,
								jazz,
								latin,
								metal,
								pop,
								punk,
								rapHipHop,
								reggae,
								rnb,
								rock,
								singerSongwriter,
							},
							subgenreEdm {
								breakbeatDrumAndBass,
								deepHouse,
								electro,
								house,
								minimal,
								techHouse,
								techno,
								trance,
							},
							valence,
							arousal,
						},
						genre {
							ambient,
							blues,
							classical,
							country,
							electronicDance,
							folk,
							indieAlternative,
							jazz,
							latin,
							metal,
							pop,
							punk,
							rapHipHop,
							reggae,
							rnb,
							rock,
							singerSongwriter,
						},
						subgenreEdm {
							breakbeatDrumAndBass,
							deepHouse,
							electro,
							house,
							minimal,
							techHouse,
							techno,
							trance,
						},
						mood {
							aggressive,
							calm,
							chilled,
							dark,
							energetic,
							epic,
							happy,
							romantic,
							sad,
							scary,
							sexy,
							ethereal,
							uplifting,
						},
						moodMaxTimes {
							mood,
							start,
							end,
						},
						voice {
							female,
							instrumental,
							male,
						},
						instruments {
							percussion,
						},
						instrumentPresence {
							percussion,
							synth,
							piano,
							acousticGuitar,
							electricGuitar,
							strings,
							bass,
							bassGuitar,
							brassWoodwinds,
						},
						experimental_keywords {
							weight,
							keyword,
						},
						subgenreEdmTags,
						genreTags,
						moodTags,
						instrumentTags,
						timeSignature,
						valence,
						arousal,
						energyLevel,
						energyDynamics,
						emotionalProfile,
						voicePresenceProfile,
						emotionalDynamics,
						predominantVoiceGender,
						musicalEraTag,
          }
        }
      }
    }
  }
}`;

const requestFileUpload = async () => {
	const result = await fetch(cyaniteAppUrl, {
		method: "POST",
		body: JSON.stringify({
			query: fileUploadRequestMutation,
		}),
		headers: {
			Authorization: "Bearer " + cyaniteAccessToken,
			"Content-Type": "application/json",
		},
	}).then((res) => res.json());

	return result.data.fileUploadRequest;
};

const uploadFile = async (filePath, uploadUrl) => {

  const result = await fetch(uploadUrl, {
    method: "PUT",
    body: fs.createReadStream(filePath),
    headers: {
			"Content-Type": 'text/markdown',
      "Content-Length": fs.statSync(filePath).size,
    },
  }).then((res) => {
    if (res.status !== 200) {
      throw Error("Failed to upload file.");
    }

    return res.text();
  });
};

const createInDepthAnalysis = async (fileUploadRequestId, fileName) => {
  const result = await fetch(cyaniteAppUrl, {
    method: "POST",
    body: JSON.stringify({
      query: inDepthAnalysisCreateMutation,
      variables: {
        data: {
          fileName: fileName,
          uploadId: fileUploadRequestId,
        },
      },
    }),
    headers: {
      Authorization: "Bearer " + cyaniteAccessToken,
      "Content-Type": "application/json",
    },
  }).then((res) => res.json());

	console.log("hello", result);

  return result.data.inDepthAnalysisCreate;
};

const inDepthAnalysisEnqueueAnalysis = async (inDepthAnalysisId) => {
  const mutationDocument = /* GraphQL */ `
    mutation inDepthAnalysisEnqueueAnalysis(
      $input: InDepthAnalysisEnqueueAnalysisInput!
    ) {
      inDepthAnalysisEnqueueAnalysis(data: $input) {
        __typename
        ... on InDepthAnalysisEnqueueAnalysisResultSuccess {
          success
          inDepthAnalysis {
            id
            status
          }
        }
        ... on Error {
          message
        }
      }
    }
  `;
  const result = await fetch(cyaniteAppUrl, {
    method: "POST",
    body: JSON.stringify({
      query: mutationDocument,
      variables: { input: { inDepthAnalysisId } },
    }),
    headers: {
      Authorization: "Bearer " + cyaniteAccessToken,
      "Content-Type": "application/json",
    },
  }).then((res) => res.json())
	.catch(err => console.log(err));
  console.log("[info] inDepthAnalysisEnqueueAnalysis response: ");
  console.log(JSON.stringify(result, undefined, 2));
  if (result.data.inDepthAnalysisEnqueueAnalysis.__typename.endsWith("Error")) {
    throw new Error(result.data.inDepthAnalysisCreate.message);
  }

  return result.data;
};

const getInDepthAnalysis = async (inDepthAnalysisId) => {
	const result = await fetch(cyaniteAppUrl, {
    method: "POST",
    body: JSON.stringify({
      query: inDepthAnalysisMutation,
      variables: {
        inDepthAnalysisId: inDepthAnalysisId,
      },
    }),
    headers: {
      Authorization: "Bearer " + cyaniteAccessToken,
      "Content-Type": "application/json",
    },
  }).then((res) => res.json());

  return result.data;
};

const getGeneralAnalysis = async (libraryTrackId) => {
	
	const result = await fetch(cyaniteAppUrl, {
    method: "POST",
    body: JSON.stringify({
      query: getGeneralInfoQuery,
      variables: {
        libraryTrackId: libraryTrackId,
      },
    }),
    headers: {
      Authorization: "Bearer " + cyaniteAccessToken,
      "Content-Type": "application/json",
    },
  }).then((res) => res.json())
	.catch(err => console.log(err));
	console.log("heoo", result.data.libraryTrack.audioAnalysisV6.result);
  return {data: result.data, error: result.errors};
};


const s3 = new AWS.S3({
	accessKeyId: process.env.AWS_ACCESS_KEY_ID,
	secretAccessKey: process.env.AWS_ACCESS_SECRET
});

const sanitizeSong = song =>
	sanitizeEntity(song, {
		model: strapi.query('song', 'users-permissions').model,
	});


const addAudio = async (username, file) => {
	let photoLink = "";
	if (!file) return "";
	const myFile = file.name.split('.');
	const fileType = myFile[myFile.length - 1];
	
	const convertProcess = new Promise((resolve, reject) => {
		const ops = [
			'-i', file.path, '-vn', '-ar', '44100', '-ac', '2', '-b:a', '192k', file.path + '.mp3'
		]; 

		console.log(file.path, file.path + '.mp3');
		const ffmpeg_process = spawn('ffmpeg', ops);

		ffmpeg_process.on('exit', (e) => {
			resolve();
		});

		ffmpeg_process.on('error', (e) => {
			reject(e);
		});

		// ffmpeg(file.path)
    // .toFormat('mp3')
    // .on('error', (err) => {
    //     console.log('An error occurred: ' + err.message);
		// 		reject();
    // })
    // .on('progress', (progress) => {
    //     console.log('Processing: ' + progress.targetSize + ' KB converted');
    // })
    // .on('end', () => {
    //     console.log('Processing finished !');
		// 		resolve(file.path + '.mp3');
    // })
    // .save(file.path + '.mp3');//path where you want to save your file
	});

	let isMp3 = true;
	if (fileType != 'mp3' && fileType != 'Mp3' && fileType != 'MP3') {
		await convertProcess.then(() => console.log('convert succeed!')).catch(err => console.log('convert failed'));
		isMp3 = false;
	}
	let temp =`${file.name.replace(`.${fileType}`, '')}${new Date().getTime()}.${fileType}`;
	console.log(temp);
	const originalKey = temp.replace(/[+]/g, '_').replace(/-/g, '_').replace(/~/g, '_');
	temp = `${file.name.replace(`.${fileType}`, '')}${new Date().getTime()}.mp3`;
	const convertedKey = temp.replace(/[+]/g, '_').replace(/-/g, '_').replace(/~/g, '_');

	let songFolder = `songfile_${new Date().getTime()}`;
	const paramsOriginalFile = {
		Bucket: `${process.env.AWS_BUCKET_NAME}`,
		Key: `users/${username}/songs/${songFolder}/${originalKey}`,
		Body: fs.createReadStream(file.path),
		ACL: 'public-read'
	}

	const paramsConvertedFile = {
		Bucket: `${process.env.AWS_BUCKET_NAME}`,
		Key: `users/${username}/songs/${songFolder}/${convertedKey}`,
		Body: isMp3 ? null : fs.createReadStream(file.path + '.mp3'),
		ACL: 'public-read'
	}
	
	const uploadPromise = new Promise((resolve, reject) => {
		s3.upload(paramsOriginalFile, (err, data) => {
			if (err) {
				reject(err);
			}
			if (isMp3) {
				resolve(data);
			} else {
				s3.upload(paramsConvertedFile, (_err, _data) => {
					if (_err) reject(_err);
					resolve(_data);
				});
			}
		});
	});

	await uploadPromise.then(async data => {
		photoLink = `https://songanizer.s3.us-west-2.amazonaws.com/users/${username}/songs/${songFolder}/${convertedKey}`;
	}).catch(err => {
		console.log(err);
		return "";
	});

	return photoLink;
};

const deleteAudio = async ( username, photo ) => {
	let key = photo.split('/')[6];
	const deleteFromS3 = new Promise((resolve, reject) => {
		try {
				s3.deleteObject({
						Bucket: `${process.env.AWS_BUCKET_NAME}`,
						Key: `users/${username}/songs/${key}`,
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

const addPhoto = async (username, foldername, file) => {
	let photoLink = "";
	if (!file) return "";
  console.log(file);
  const myFile = file.name.split('.');
  const fileType = myFile[myFile.length - 1];
  const key = `${uuid()}.${fileType}`;

  const buffer = fs.readFileSync(file.path);

  console.log (buffer);

  const params = {
    Bucket: `${process.env.AWS_BUCKET_NAME}`,
    Key: `users/${username}/songs/${foldername}/playlist_photo/${key}`,
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
    photoLink = `https://songanizer.s3.us-west-2.amazonaws.com/users/${username}/songs/${foldername}/playlist_photo/${key}`;
  }).catch(err => {
    console.log(err);
    return "";
  });

  return photoLink;
};

const deletePhoto = async ( username, photo ) => {
	// console.log(photos);
  let foldername = photo.split('/')[6];
	let key = photo.split('/')[8];
  const deleteFromS3 = new Promise((resolve, reject) => {
    try {
        s3.deleteObject({
            Bucket: `${process.env.AWS_BUCKET_NAME}`,
            Key: `users/${username}/songs/${foldername}/playlist_photo/${key}`,
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
	async songCyanite(ctx) {
		const { id } = ctx.params;

		// const data = await strapi.plugins['users-permissions'].services.user.edit({ id }, { subscriptionStatus: 'deleted' });

		// ctx.send(sanitizeUser(data));
		return "Anton, what are you doing?";
	},

	async cyaniteSong(ctx) {
		let song = {};
		// if (ctx.request.body.type === 'IN_DEPTH_ANALYSIS_FINISHED') {
		// 	setTimeout(async () => {
		// 		const generalResult = await getGeneralAnalysis(ctx.request.body.data.inDepthAnalysisId);
		// 		console.log(generalResult);
		// 		song = await strapi.query('song').update({ analysis_id: ctx.request.body.data.inDepthAnalysisId }, { ...generalResult.data.libraryTrack.audioAnalysisV6.result, analysisStatus: 'finished' });
		// 		console.log(song);
		// 		ctx.send(song);
		// 	}, 100);	
		// }
		if (ctx.request.body.event.status === 'finished') {
			setTimeout(async () => {
				const generalResult = await getGeneralAnalysis(ctx.request.body.resource.id);
				console.log(generalResult);
				song = await strapi.query('song').update({ analysis_id: ctx.request.body.resource.id }, { ...generalResult.data.libraryTrack.audioAnalysisV6.result, analysisStatus: 'finished' });
				console.log(song);
				ctx.send(song);
			}, 100);	
		}
		return "Anton, what are you doing?";
	},

	async find(ctx) {
		let params = {};
		
		if (ctx.request.headers.authorization) {
			const confirmationToken = ctx.request.headers.authorization.split(' ')[1];
			const { user: userService, jwt: jwtService } = strapi.plugins['users-permissions'].services;
			const verified = await jwtService.verify(confirmationToken);
			params = {
				master: verified.id
			};
		}
		
		const songs = await strapi.query('song').find(params, [{
			path: 'master',
			populate: {
				path: 'users-permissions'
			}}]);
		ctx.send(songs);
		return "...";
	},

	async create(ctx) {
		const confirmationToken = ctx.request.headers.authorization.split(' ')[1];
		const { user: userService, jwt: jwtService } = strapi.plugins['users-permissions'].services;
		const verified = await jwtService.verify(confirmationToken);
		const user = await strapi.query('user', 'users-permissions').findOne({
			_id: verified.id,
		});

		let audioUrl = "";
		if (ctx.request.files['audio']) {
			let files;
			if (Array.isArray(ctx.request.files['audio'])) {
				files = ctx.request.files['audio'];
			} else {
				files = [ctx.request.files['audio']];
			}
			for (let file of files) {
				console.log("______**********________********", file.name, file.path);
				try {
					audioUrl = await addAudio(user.username, file);
				} catch (err) {
					console.log(err);
					ctx.badRequest('audio.invalid');
				}
				// cyanite upload request

				const { id: cyanite_id, uploadUrl } = await requestFileUpload(file);
				await uploadFile(file.path + '.mp3', uploadUrl);
				
				const myFile = file.name.split('.');
				const fileType = myFile[myFile.length - 1];

				const result = await createInDepthAnalysis(cyanite_id, file.name.replace('.' + fileType, '') + '.mp3');
				await inDepthAnalysisEnqueueAnalysis(result.inDepthAnalysis.id);

				const params = {
					title: file.name.replace('.' + fileType, '') + '.mp3',
					visible: true,
					downloadable: true,
					master: verified.id,
					track_title: file.name.replace('.' + fileType, '') + '.mp3',
					track_url: audioUrl,
					analysis_id: result.inDepthAnalysis.id,
					analysisStatus: 'requested'
				};

				const song = await strapi.query('song').create(params);
			}
			
			ctx.send(true);
    } else {
			ctx.badRequest('audio.invalid');
		}
		return "...";
	},

	async count(ctx) {
		const { id } = ctx.params;
		console.log(ctx.request.body);

		// ctx.send(sanitizeUser(data));
		return "...";
	},

	async findOne(ctx) {
		const { id } = ctx.params;

		// const data = await strapi.plugins['users-permissions'].services.user.edit({ id }, { subscriptionStatus: 'deleted' });

		// ctx.send(sanitizeUser(data));
		return "...";
	},

	async update(ctx) {
		const confirmationToken = ctx.request.headers.authorization.split(' ')[1];
		const { user: userService, jwt: jwtService } = strapi.plugins['users-permissions'].services;
		const verified = await jwtService.verify(confirmationToken);
		const user = await strapi.query('user', 'users-permissions').findOne({
			_id: verified.id,
		});

		const { id } = ctx.params;
		
		let params = JSON.parse(JSON.stringify(ctx.request.body));
		params = params.requestData;
		console.log(ctx.request.body, params);
		params = JSON.parse(params);
		console.log(params);

		const folderName = params['track_url'].split('/')[6];
		if (params['playlistPhoto'])
			await deletePhoto(user.username, params['playlistPhoto']);
		let playlistPhotoUrl = '';
		if (ctx.request.files && ctx.request.files['playlistphoto'])
			playlistPhotoUrl = await addPhoto(user.username, folderName, ctx.request.files['playlistphoto']);
		
		params.playlistPhoto = playlistPhotoUrl;
		await strapi.query('song').update({_id: id}, params);
		// ctx.send(sanitizeUser(data));
		ctx.send('OK');
		return "...";
	},

	async delete(ctx) {
		const { id } = ctx.params;

		// const data = await strapi.plugins['users-permissions'].services.user.edit({ id }, { subscriptionStatus: 'deleted' });

		// ctx.send(sanitizeUser(data));
		return "...";
	}
};

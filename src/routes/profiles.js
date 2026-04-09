const profileService = require('../services/profileService');

module.exports = async function profileRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  // GET /api/v1/profiles/me
  fastify.get('/me', auth, async (request) => {
    return profileService.getProfile(request.user.sub);
  });

  // GET /api/v1/profiles/:userId
  fastify.get('/:userId', auth, async (request) => {
    return profileService.getProfile(request.params.userId);
  });

  // POST /api/v1/profiles/onboard/individual
  fastify.post('/onboard/individual', {
    ...auth,
    schema: {
      body: {
        type: 'object',
        required: ['name', 'date_of_birth', 'gender', 'fitness_goals', 'fitness_level'],
        properties: {
          name:                    { type: 'string' },
          date_of_birth:           { type: 'string' },
          gender:                  { type: 'string', enum: ['male', 'female', 'non_binary', 'prefer_not_to_say'] },
          fitness_goals:           { type: 'array', items: { type: 'string' } },
          fitness_level:           { type: 'string', enum: ['beginner', 'intermediate', 'advanced'] },
          workout_types:           { type: 'array', items: { type: 'string' } },
          height_cm:               { type: 'number' },
          weight_kg:               { type: 'number' },
          preferred_gender_filter: { type: 'string', enum: ['everyone', 'men', 'women', 'women_only'] },
          bio:                     { type: 'string', maxLength: 500 },
          latitude:                { type: 'number' },
          longitude:               { type: 'number' },
        },
      },
    },
  }, async (request, reply) => {
    const profile = await profileService.onboardIndividual(request.user.sub, request.body);
    return reply.code(201).send(profile);
  });

  // POST /api/v1/profiles/onboard/professional
  fastify.post('/onboard/professional', {
    ...auth,
    schema: {
      body: {
        type: 'object',
        required: ['name', 'specialty', 'bio', 'credentials'],
        properties: {
          name:        { type: 'string' },
          specialty:   { type: 'string' },
          bio:         { type: 'string', maxLength: 1000 },
          credentials: { type: 'array', items: { type: 'string' } },
          latitude:    { type: 'number' },
          longitude:   { type: 'number' },
        },
      },
    },
  }, async (request, reply) => {
    const profile = await profileService.onboardProfessional(request.user.sub, request.body);
    return reply.code(201).send(profile);
  });

  // PATCH /api/v1/profiles/me
  fastify.patch('/me', auth, async (request) => {
    return profileService.updateProfile(request.user.sub, request.body);
  });

  // GET /api/v1/profiles/me/photos — list all photos (ordered by position)
  fastify.get('/me/photos', auth, async (request) => {
    return profileService.getPhotos(request.user.sub);
  });

  // POST /api/v1/profiles/me/photos — upload a new photo (max 6, position 1 = profile picture)
  fastify.post('/me/photos', auth, async (request, reply) => {
    const data = await request.file();
    if (!data) return reply.code(400).send({ error: 'No file uploaded' });

    const chunks = [];
    for await (const chunk of data.file) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    const photo = await profileService.uploadPhoto(request.user.sub, {
      buffer,
      mimetype: data.mimetype,
      originalname: data.filename,
    });
    return reply.code(201).send(photo);
  });

  // DELETE /api/v1/profiles/me/photos/:photoId — delete a specific photo
  fastify.delete('/me/photos/:photoId', auth, async (request, reply) => {
    const result = await profileService.deletePhoto(request.user.sub, request.params.photoId);
    return reply.send(result);
  });

  // PATCH /api/v1/profiles/me/photos/reorder — change photo positions
  fastify.patch('/me/photos/reorder', {
    ...auth,
    schema: {
      body: {
        type: 'object',
        required: ['order'],
        properties: {
          order: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['id', 'position'],
              properties: {
                id:       { type: 'string' },
                position: { type: 'integer', minimum: 1, maximum: 6 },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const result = await profileService.reorderPhotos(request.user.sub, request.body.order);
    return reply.send(result);
  });

  // POST /api/v1/profiles/me/device-token
  fastify.post('/me/device-token', {
    ...auth,
    schema: {
      body: {
        type: 'object',
        required: ['token', 'platform'],
        properties: {
          token:    { type: 'string' },
          platform: { type: 'string', enum: ['android', 'ios'] },
        },
      },
    },
  }, async (request) => {
    return profileService.updateDeviceToken(request.user.sub, request.body);
  });
};

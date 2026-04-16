const enquiriesService = require('../services/enquiriesService');
const notificationService = require('../services/notificationService');

module.exports = async function enquiriesRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  /**
   * POST /api/v1/enquiries
   * Individual user sends an enquiry to a trainer.
   * Body: { trainer_id, message }
   */
  fastify.post('/', {
    ...auth,
    schema: {
      body: {
        type: 'object',
        required: ['trainer_id', 'message'],
        properties: {
          trainer_id: { type: 'string' },
          message:    { type: 'string', minLength: 10 },
        },
      },
    },
  }, async (request, reply) => {
    const data = await enquiriesService.sendEnquiry(
      request.user.sub,
      request.body.trainer_id,
      request.body.message,
    );
    // Notify trainer
    notificationService.sendPushToUser?.(request.body.trainer_id, {
      title: 'New Enquiry!',
      body:  `Someone is interested in training with you.`,
    }).catch(() => {});
    return reply.code(201).send(data);
  });

  /**
   * GET /api/v1/enquiries
   * Trainer gets their enquiry list.
   * Query: status (new|pending|accepted|declined|all), page, limit
   */
  fastify.get('/', auth, async (request) => {
    const { status, page = 1, limit = 20 } = request.query;
    return enquiriesService.getEnquiries(request.user.sub, {
      status,
      page:  parseInt(page),
      limit: Math.min(parseInt(limit), 50),
    });
  });

  /**
   * GET /api/v1/enquiries/stats
   * Trainer stats: new count, this week, total
   */
  fastify.get('/stats', auth, async (request) => {
    return enquiriesService.getEnquiryStats(request.user.sub);
  });

  /**
   * GET /api/v1/enquiries/:enquiryId
   * Full enquiry detail with client fitness profile
   */
  fastify.get('/:enquiryId', auth, async (request) => {
    return enquiriesService.getEnquiryDetail(request.user.sub, request.params.enquiryId);
  });

  /**
   * PATCH /api/v1/enquiries/:enquiryId/accept
   * Trainer accepts — creates match + opens chat channel
   */
  fastify.patch('/:enquiryId/accept', auth, async (request, reply) => {
    const result = await enquiriesService.acceptEnquiry(request.user.sub, request.params.enquiryId);
    return reply.send(result);
  });

  /**
   * PATCH /api/v1/enquiries/:enquiryId/decline
   * Trainer declines the enquiry
   */
  fastify.patch('/:enquiryId/decline', auth, async (request, reply) => {
    const result = await enquiriesService.declineEnquiry(request.user.sub, request.params.enquiryId);
    return reply.send(result);
  });
};

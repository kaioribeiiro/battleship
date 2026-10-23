const auditLogRepository = require('../repositories/auditLogRepository');

async function record(eventType, description, { userId = null, gameId = null, metadata = null } = {}) {
  try {
    return await auditLogRepository.create({
      eventType,
      description,
      userId,
      gameId,
      metadata,
    });
  } catch (err) {
    // Auditoria nunca deve interromper o fluxo principal.
    console.error('[audit] failed to persist event', eventType, err.message);
    return null;
  }
}

module.exports = { record };

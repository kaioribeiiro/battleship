class AppError extends Error {
  constructor(status, name, message, code) {
    super(message);
    this.status = status;
    this.name = name;
    this.code = code || name;
    Error.captureStackTrace(this, this.constructor);
  }
}

const badRequest = (message, code) => new AppError(400, 'BadRequestError', message, code);
const unauthorized = (message, code) => new AppError(401, 'UnauthorizedError', message, code);
const forbidden = (message, code) => new AppError(403, 'ForbiddenError', message, code);
const notFound = (message, code) => new AppError(404, 'NotFoundError', message, code);
const conflict = (message, code) => new AppError(409, 'ConflictError', message, code);
const gone = (message, code) => new AppError(410, 'GoneError', message, code);

module.exports = {
  AppError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  gone,
};

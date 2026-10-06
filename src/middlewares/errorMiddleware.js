export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`
  });
}

export function errorHandler(error, req, res, next) {
  console.error(error);

  const statusCode =
    error.statusCode ??
    (error.name === 'CastError' || error.name === 'ValidationError' ? 400 : error.code === 11000 ? 409 : 500);
  const message =
    error.code === 11000
      ? 'A resource with the same unique value already exists'
      : error.name === 'ValidationError'
        ? 'Request contains invalid values'
        : error.name === 'CastError'
          ? 'Request contains an invalid identifier'
          : error.message;

  res.status(statusCode).json({
    success: false,
    message: statusCode === 500 ? 'Internal server error' : message
  });
}

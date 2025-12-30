const path = require('path');

const uploadsBaseUrl = `qistmarket-software-backend.vercel.app/uploads`;

module.exports = (req, res, next) => {
  if (!req.file && !req.files) return next();

  if (req.file) {
    const filename = req.file.filename || path.basename(req.file.path);
    req.file.url = `${uploadsBaseUrl}/${filename}`;
  }

  if (req.files) {
    Object.keys(req.files).forEach(fieldName => {
      req.files[fieldName].forEach(file => {
        const filename = file.filename || path.basename(file.path);
        file.url = `${uploadsBaseUrl}/${filename}`;
      });
    });
  }

  next();
};
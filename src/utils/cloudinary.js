const cloudinary = require('cloudinary').v2;

// Configure Cloudinary with environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Uploads an image to Cloudinary
 * @param {string} filePath - The local path of the image to upload
 * @param {string} folder - The folder in Cloudinary to upload the image to
 * @returns {Promise<string>} - The secure URL of the uploaded image
 */
const uploadImage = async (filePath, folder = 'wiftil_profiles') => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: folder,
      resource_type: 'image',
    });
    return result.secure_url;
  } catch (error) {
    throw new Error('Error uploading to Cloudinary: ' + error.message);
  }
};

module.exports = {
  cloudinary,
  uploadImage,
};

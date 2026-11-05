import multer from "multer";

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 5 },
});

export const parseSingleImage = upload.single("image");

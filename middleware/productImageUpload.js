import fs from "fs";
import path from "path";
import multer from "multer";

const uploadDirectory = path.join(process.cwd(), "public", "uploads", "products");
fs.mkdirSync(uploadDirectory, { recursive: true });

const signatures = [
  { extension: ".jpg", mime: "image/jpeg", matches: buffer => buffer.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex")) },
  { extension: ".png", mime: "image/png", matches: buffer => buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) },
  {
    extension: ".webp",
    mime: "image/webp",
    matches: buffer => buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP"
  }
];

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadDirectory),
  filename: (_req, _file, callback) => {
    callback(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}.tmp`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      return callback(null, true);
    }
    callback(new multer.MulterError("LIMIT_UNEXPECTED_FILE", "image_file"));
  }
});

const removeFile = filePath => {
  if (filePath) fs.rm(filePath, { force: true }, () => {});
};

export const uploadProductImage = (req, res, next) => {
  upload.single("image_file")(req, res, error => {
    if (error) {
      removeFile(req.file?.path);
      req.uploadError = error.code === "LIMIT_FILE_SIZE"
        ? "Image is too large. Maximum size is 3 MB."
        : "Upload a JPEG, PNG, or WebP image only.";
      return next();
    }

    if (!req.file) return next();

    try {
      const descriptor = fs.openSync(req.file.path, "r");
      const buffer = Buffer.alloc(12);
      fs.readSync(descriptor, buffer, 0, 12, 0);
      fs.closeSync(descriptor);

      const signature = signatures.find(item => item.matches(buffer));
      if (!signature) {
        removeFile(req.file.path);
        req.file = undefined;
        req.uploadError = "The uploaded file is not a valid JPEG, PNG, or WebP image.";
        return next();
      }

      const safeFilename = `${path.parse(req.file.filename).name}${signature.extension}`;
      const safePath = path.join(uploadDirectory, safeFilename);
      fs.renameSync(req.file.path, safePath);
      req.file.path = safePath;
      req.file.filename = safeFilename;
      req.file.mimetype = signature.mime;
      req.file.publicUrl = `/uploads/products/${safeFilename}`;
      next();
    } catch (uploadError) {
      removeFile(req.file?.path);
      next(uploadError);
    }
  });
};

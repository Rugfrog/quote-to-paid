import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { UPLOADS_DIR } from './db/db';
import { HttpError } from './http';

const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

/**
 * Photo uploads saved to data/uploads with random names. SVG is not accepted
 * (it can contain scripts). 10 MB per file, up to 10 files at once.
 */
export function imageUpload(uploadsDir: string = UPLOADS_DIR) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  return multer({
    storage: multer.diskStorage({
      destination: uploadsDir,
      filename: (_req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + IMAGE_TYPES[file.mimetype]),
    }),
    limits: { fileSize: 10 * 1024 * 1024, files: 10 },
    fileFilter: (_req, file, cb) => {
      if (IMAGE_TYPES[file.mimetype]) cb(null, true);
      else cb(new HttpError(400, 'Please choose a photo (JPEG, PNG, WebP or GIF).'));
    },
  });
}

/** Public URL for a stored file name. */
export function uploadUrl(filePath: string | null | undefined): string | null {
  return filePath ? `/uploads/${path.basename(filePath)}` : null;
}

export function deleteUpload(filePath: string | null | undefined, uploadsDir: string = UPLOADS_DIR): void {
  if (!filePath) return;
  fs.rmSync(path.join(uploadsDir, path.basename(filePath)), { force: true });
}

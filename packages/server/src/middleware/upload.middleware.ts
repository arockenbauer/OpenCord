import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';

const uploadDir = process.env.UPLOAD_DIR || './uploads';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const tempDir = path.join(uploadDir, 'temp');
    fs.mkdirSync(tempDir, { recursive: true });
    cb(null, tempDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const ALLOWED_ATTACHMENT_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  'video/mp4', 'video/webm',
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/flac',
  'application/pdf', 'text/plain',
  'application/zip', 'application/x-zip-compressed',
  'application/json', 'text/csv', 'application/xml',
];

const FORBIDDEN_EXTENSIONS = ['.exe', '.bat', '.sh', '.ps1', '.cmd', '.scr', '.vbs', '.msi', '.dmg', '.app'];

export const uploadAvatar = multer({
  storage,
  limits: { fileSize: 10485760 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      cb(new Error('INVALID_FILE_TYPE'));
      return;
    }
    cb(null, true);
  },
}).single('avatar');

export const uploadBanner = multer({
  storage,
  limits: { fileSize: 10485760 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      cb(new Error('INVALID_FILE_TYPE'));
      return;
    }
    cb(null, true);
  },
}).single('banner');

export const uploadIcon = multer({
  storage,
  limits: { fileSize: 8388608 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      cb(new Error('INVALID_FILE_TYPE'));
      return;
    }
    cb(null, true);
  },
}).single('icon');

export const uploadEmoji = multer({
  storage,
  limits: { fileSize: 262144 },
  fileFilter: (_req, file, cb) => {
    if (!['image/png', 'image/gif'].includes(file.mimetype)) {
      cb(new Error('INVALID_FILE_TYPE'));
      return;
    }
    cb(null, true);
  },
}).single('image');

export const uploadSticker = multer({
  storage,
  limits: { fileSize: 524288 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      cb(new Error('INVALID_FILE_TYPE'));
      return;
    }
    cb(null, true);
  },
}).single('file');

export const uploadRoleIcon = multer({
  storage,
  limits: { fileSize: 262144 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      cb(new Error('INVALID_FILE_TYPE'));
      return;
    }
    cb(null, true);
  },
}).single('icon');

export const uploadAttachments = multer({
  storage,
  limits: { fileSize: 26214400 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (FORBIDDEN_EXTENSIONS.includes(ext)) {
      cb(new Error('INVALID_FILE_TYPE'));
      return;
    }
    if (!ALLOWED_ATTACHMENT_TYPES.includes(file.mimetype) && !file.mimetype.startsWith('text/')) {
      cb(new Error('INVALID_FILE_TYPE'));
      return;
    }
    cb(null, true);
  },
}).array('files', 10);

export function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/\.\./g, '')
    .slice(0, 255);
}

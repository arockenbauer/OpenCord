import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import { fileTypeFromFile } from 'file-type';

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

export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
export const ALLOWED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
export const ALLOWED_ATTACHMENT_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  'video/mp4', 'video/webm',
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/flac',
  'application/pdf', 'text/plain',
  'application/zip', 'application/x-zip-compressed',
  'application/json', 'text/csv', 'application/xml',
];
export const ALLOWED_SOUNDBOARD_TYPES = ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/flac'];
export const ALLOWED_SOUNDBOARD_EXTENSIONS = ['.mp3', '.ogg', '.wav', '.webm', '.flac'];

export const FORBIDDEN_EXTENSIONS = ['.exe', '.bat', '.sh', '.ps1', '.cmd', '.scr', '.vbs', '.msi', '.dmg', '.app'];

export const uploadAvatar = (req: any, res: any, next: any) => {
  const upload = multer({
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
  
  upload(req, res, (err: any) => {
    if (err) return next(err);
    validateUploadedFile(ALLOWED_IMAGE_TYPES, ALLOWED_IMAGE_EXTENSIONS)(req, res, next);
  });
};

export const uploadBanner = (req: any, res: any, next: any) => {
  const upload = multer({
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
  
  upload(req, res, (err: any) => {
    if (err) return next(err);
    validateUploadedFile(ALLOWED_IMAGE_TYPES, ALLOWED_IMAGE_EXTENSIONS)(req, res, next);
  });
};

export const uploadIcon = (req: any, res: any, next: any) => {
  const upload = multer({
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
  
  upload(req, res, (err: any) => {
    if (err) return next(err);
    validateUploadedFile(ALLOWED_IMAGE_TYPES, ALLOWED_IMAGE_EXTENSIONS)(req, res, next);
  });
};

export const uploadEmoji = (req: any, res: any, next: any) => {
  const upload = multer({
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
  
  upload(req, res, (err: any) => {
    if (err) return next(err);
    validateUploadedFile(['image/png', 'image/gif'], ['.png', '.gif'])(req, res, next);
  });
};

export const uploadEventImage = (req: any, res: any, next: any) => {
  const upload = multer({
    storage,
    limits: { fileSize: 524288 }, // 512KB for event images
    fileFilter: (_req, file, cb) => {
      if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
        cb(new Error('INVALID_FILE_TYPE'));
        return;
      }
      cb(null, true);
    },
  }).single('file');

  upload(req, res, (err: any) => {
    if (err) return next(err);
    validateUploadedFile(ALLOWED_IMAGE_TYPES, ALLOWED_IMAGE_EXTENSIONS)(req, res, next);
  });
};

export const uploadSticker = (req: any, res: any, next: any) => {
  const upload = multer({
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
  
  upload(req, res, (err: any) => {
    if (err) return next(err);
    validateUploadedFile(ALLOWED_IMAGE_TYPES, ALLOWED_IMAGE_EXTENSIONS)(req, res, next);
  });
};

export const uploadSoundboardSound = (req: any, res: any, next: any) => {
  const upload = multer({
    storage,
    limits: { fileSize: 1048576 },
    fileFilter: (_req, file, cb) => {
      if (!ALLOWED_SOUNDBOARD_TYPES.includes(file.mimetype)) {
        cb(new Error('INVALID_FILE_TYPE'));
        return;
      }
      cb(null, true);
    },
  }).single('sound');

  upload(req, res, (err: any) => {
    if (err) return next(err);
    validateUploadedFile(ALLOWED_SOUNDBOARD_TYPES, ALLOWED_SOUNDBOARD_EXTENSIONS)(req, res, next);
  });
};

export const uploadRoleIcon = (req: any, res: any, next: any) => {
  const upload = multer({
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
  
  upload(req, res, (err: any) => {
    if (err) return next(err);
    validateUploadedFile(ALLOWED_IMAGE_TYPES, ALLOWED_IMAGE_EXTENSIONS)(req, res, next);
  });
};

export const uploadAttachments = (req: any, res: any, next: any) => {
  const upload = multer({
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
  
  upload(req, res, (err: any) => {
    if (err) return next(err);
    validateUploadedFile(ALLOWED_ATTACHMENT_TYPES, [])(req, res, next);
  });
};

export function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\:*?"<>|&=]/g, '_')
    .replace(/\.\./g, '')
    .slice(0, 255);
}

function removeUploadedFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // Best-effort cleanup: validation should still fail even if temp cleanup fails.
  }
}

// Validation magic bytes après upload
export async function validateMagicBytes(filePath: string, allowedTypes: string[]): Promise<boolean> {
  try {
    const fileType = await fileTypeFromFile(filePath);
    if (!fileType) return false;
    return allowedTypes.includes(fileType.mime);
  } catch {
    return false;
  }
}

// Middleware de validation après upload
export const upload = multer({ storage });

export function validateUploadedFile(allowedTypes: string[], allowedExtensions: string[] = []) {
  return async (req: any, _res: any, next: any) => {
    const files = req.files || (req.file ? [req.file] : []);
    for (const file of files) {
      const ext = path.extname(file.originalname).toLowerCase();
      if (allowedExtensions.length > 0 && !allowedExtensions.includes(ext)) {
        removeUploadedFile(file.path);
        return next(new Error('INVALID_FILE_TYPE'));
      }
      const valid = await validateMagicBytes(file.path, allowedTypes);
      if (!valid) {
        removeUploadedFile(file.path);
        return next(new Error('INVALID_FILE_TYPE'));
      }
    }
    next();
  };
}

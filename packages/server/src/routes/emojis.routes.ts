import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { uploadEmoji, uploadSticker } from '../middleware/upload.middleware.js';
import * as emoji from '../controllers/emoji.controller.js';

const router = Router({ mergeParams: true });

router.get('/emojis', authenticate, emoji.getEmojis);
router.get('/emojis/:emojiId', authenticate, emoji.getEmoji);
router.post('/emojis', authenticate, uploadEmoji, emoji.createEmoji);
router.patch('/emojis/:emojiId', authenticate, emoji.updateEmoji);
router.delete('/emojis/:emojiId', authenticate, emoji.deleteEmoji);

router.get('/stickers', authenticate, emoji.getStickers);
router.get('/stickers/:stickerId', authenticate, emoji.getSticker);
router.post('/stickers', authenticate, uploadSticker, emoji.createSticker);
router.patch('/stickers/:stickerId', authenticate, emoji.updateSticker);
router.delete('/stickers/:stickerId', authenticate, emoji.deleteSticker);
router.get('/sticker-packs', authenticate, emoji.getStickerPacks);

export default router;

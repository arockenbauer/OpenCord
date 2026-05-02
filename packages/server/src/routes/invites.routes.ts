import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as invites from '../controllers/invite.controller.js';
import * as friends from '../controllers/friend.controller.js';
import * as dms from '../controllers/dm.controller.js';

const router = Router();

router.get('/invites/:code', invites.getInvite);
router.post('/invites/:code', authenticate, invites.useInvite);
router.delete('/invites/:code', authenticate, invites.deleteInvite);

router.get('/users/@me/relationships', authenticate, friends.getRelationships);
router.post('/users/@me/relationships', authenticate, friends.sendFriendRequest);
router.post('/users/@me/relationships/:userId', authenticate, friends.acceptFriendRequest);
router.delete('/users/@me/relationships/:userId', authenticate, friends.removeFriend);
router.post('/users/@me/relationships/:userId/decline', authenticate, friends.declineFriendRequest);
router.put('/users/@me/relationships/:userId/block', authenticate, friends.blockUser);

router.get('/users/@me/channels', authenticate, dms.getDMChannels);
router.post('/users/@me/channels', authenticate, dms.createDM);
router.post('/users/@me/channels/group', authenticate, dms.createGroupDM);
router.patch('/users/@me/channels/:channelId', authenticate, dms.updateDMChannel);
router.delete('/users/@me/channels/:channelId', authenticate, dms.deleteDMChannel);
router.post('/users/@me/channels/:channelId/recipients/:userId', authenticate, dms.addDMRecipient);
router.delete('/users/@me/channels/:channelId/recipients/:userId', authenticate, dms.removeDMRecipient);

export const guildInvitesRouter = Router({ mergeParams: true });
guildInvitesRouter.post('/', authenticate, invites.createInvite);
guildInvitesRouter.get('/', authenticate, invites.getGuildInvites);

export default router;

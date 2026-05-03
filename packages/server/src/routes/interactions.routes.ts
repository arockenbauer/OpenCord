import { Router } from 'express';
import {
  createApplicationCommand,
  listApplicationCommands,
  getApplicationCommand,
  updateApplicationCommand,
  deleteApplicationCommand,
  bulkOverwriteCommands,
  createInteraction,
  respondToInteraction,
} from '../controllers/interaction.controller.js';
import { authenticateBot } from '../middleware/auth.middleware.js';

const router = Router();

// Application commands (global)
router.get('/applications/:appId/commands', authenticateBot, listApplicationCommands);
router.post('/applications/:appId/commands', authenticateBot, createApplicationCommand);
router.get('/applications/:appId/commands/:commandId', authenticateBot, getApplicationCommand);
router.patch('/applications/:appId/commands/:commandId', authenticateBot, updateApplicationCommand);
router.delete('/applications/:appId/commands/:commandId', authenticateBot, deleteApplicationCommand);
router.put('/applications/:appId/commands', authenticateBot, bulkOverwriteCommands);

// Application commands (guild-specific)
router.get('/applications/:appId/guilds/:guildId/commands', authenticateBot, listApplicationCommands);
router.post('/applications/:appId/guilds/:guildId/commands', authenticateBot, createApplicationCommand);
router.get('/applications/:appId/guilds/:guildId/commands/:commandId', authenticateBot, getApplicationCommand);
router.patch('/applications/:appId/guilds/:guildId/commands/:commandId', authenticateBot, updateApplicationCommand);
router.delete('/applications/:appId/guilds/:guildId/commands/:commandId', authenticateBot, deleteApplicationCommand);
router.put('/applications/:appId/guilds/:guildId/commands', authenticateBot, bulkOverwriteCommands);

// Interactions
router.post('/interactions/:interactionId/:interactionToken/callback', authenticateBot, respondToInteraction);

// Application command permissions (guild-specific)
router.get('/applications/:appId/guilds/:guildId/commands/permissions', authenticateBot, listCommandPermissions);
router.put('/applications/:appId/guilds/:guildId/commands/:cmdId/permissions', authenticateBot, updateCommandPermissions);

// Interaction webhooks (follow-up)
router.get('/webhooks/:appId/:interactionToken/messages/@original', authenticateBot, getOriginalResponse);
router.patch('/webhooks/:appId/:interactionToken/messages/@original', authenticateBot, editOriginalResponse);
router.delete('/webhooks/:appId/:interactionToken/messages/@original', authenticateBot, deleteOriginalResponse);
router.post('/webhooks/:appId/:interactionToken', authenticateBot, sendFollowUpMessage);
router.patch('/webhooks/:appId/:interactionToken/messages/:messageId', authenticateBot, editFollowUpMessage);

// Internal interaction creation (from gateway)
router.post('/interactions', createInteraction);

export default router;

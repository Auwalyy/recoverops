import { Router } from 'express';
import { z } from 'zod';
import {
  acceptInvitationSchema,
  changePasswordSchema,
  confirmVerificationSchema,
  forgotPasswordSchema,
  language,
  loginSchema,
  objectId,
  refreshSchema,
  requestVerificationSchema,
  resetPasswordSchema,
} from '@recoveros/shared';
import { authenticate } from '../../middleware/auth';
import { idParams, validate } from '../../middleware/validate';
import { authRateLimit } from '../../middleware/rate-limit';
import { authController as c } from './auth.controller';

export const authRouter = Router();

authRouter.post('/login', authRateLimit, validate({ body: loginSchema }), c.login);
authRouter.post('/refresh', authRateLimit, validate({ body: refreshSchema }), c.refresh);
authRouter.post('/logout', authenticate({ allowNoContext: true }), c.logout);
authRouter.post('/forgot-password', authRateLimit, validate({ body: forgotPasswordSchema }), c.forgotPassword);
authRouter.post('/reset-password', authRateLimit, validate({ body: resetPasswordSchema }), c.resetPassword);
authRouter.post('/invitations/lookup', authRateLimit, validate({ body: z.object({ token: z.string().min(20).max(256) }) }), c.describeInvitation);
authRouter.post('/invitations/accept', authRateLimit, validate({ body: acceptInvitationSchema }), c.acceptInvitation);

const authed = authenticate({ allowNoContext: true });
authRouter.get('/me', authed, c.me);
authRouter.patch('/me', authed, validate({ body: z.object({ preferredLanguage: language.optional() }) }), c.updateProfile);
authRouter.post('/change-password', authed, validate({ body: changePasswordSchema }), c.changePassword);
authRouter.post('/verification/request', authed, authRateLimit, validate({ body: requestVerificationSchema }), c.requestVerification);
authRouter.post('/verification/confirm', authed, authRateLimit, validate({ body: confirmVerificationSchema }), c.confirmVerification);
authRouter.get('/sessions', authed, c.sessions);
authRouter.delete('/sessions/:id', authed, validate({ params: idParams }), c.revokeSession);
authRouter.post('/switch-hospital', authed, validate({ body: z.object({ hospitalId: objectId }) }), c.switchHospital);
authRouter.post('/push-token', authed, validate({ body: z.object({ pushToken: z.string().max(400).nullable() }) }), c.pushToken);

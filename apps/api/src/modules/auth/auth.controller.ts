import type { Request, Response } from 'express';
import type {
  AcceptInvitationInput,
  LoginInput,
} from '@recoveros/shared';
import { ok, validated } from '../../utils/http';
import { errors } from '../../utils/errors';
import { UserModel } from '../users/user.model';
import * as auth from './auth.service';
import { acceptInvitation, describeInvitation } from './invitation.service';
import { signAccessToken } from './token.service';

const client = (req: Request) => ({ ip: req.ip, userAgent: req.header('user-agent')?.slice(0, 200) });

export const authController = {
  async login(req: Request, res: Response) {
    const result = await auth.login(validated<LoginInput>(req, 'body'), client(req));
    ok(res, result);
  },

  async refresh(req: Request, res: Response) {
    const { refreshToken } = validated<{ refreshToken: string }>(req, 'body');
    ok(res, { tokens: await auth.refresh(refreshToken) });
  },

  async logout(req: Request, res: Response) {
    await auth.logout(req.auth!.sessionId, req.auth!.userId);
    ok(res, { loggedOut: true });
  },

  async me(req: Request, res: Response) {
    const user = await UserModel.findById(req.auth!.userId);
    if (!user) throw errors.notFound('User');
    ok(res, { user: await auth.buildAuthUser(user, req.principal) });
  },

  async forgotPassword(req: Request, res: Response) {
    const { identifier } = validated<{ identifier: string }>(req, 'body');
    const dev = await auth.forgotPassword(identifier);
    ok(res, { message: 'If an account exists for these details, reset instructions have been sent.', ...dev });
  },

  async resetPassword(req: Request, res: Response) {
    const { token, password } = validated<{ token: string; password: string }>(req, 'body');
    await auth.resetPassword(token, password);
    ok(res, { message: 'Password updated. Please sign in.' });
  },

  async changePassword(req: Request, res: Response) {
    const { currentPassword, newPassword } = validated<{ currentPassword: string; newPassword: string }>(req, 'body');
    await auth.changePassword(req.auth!.userId, req.auth!.sessionId, currentPassword, newPassword);
    ok(res, { message: 'Password changed. Other sessions have been signed out.' });
  },

  async requestVerification(req: Request, res: Response) {
    const { channel } = validated<{ channel: 'EMAIL' | 'SMS' }>(req, 'body');
    ok(res, { sent: true, ...(await auth.requestVerification(req.auth!.userId, channel)) });
  },

  async confirmVerification(req: Request, res: Response) {
    const { channel, code } = validated<{ channel: 'EMAIL' | 'SMS'; code: string }>(req, 'body');
    await auth.confirmVerification(req.auth!.userId, channel, code);
    ok(res, { verified: true });
  },

  async describeInvitation(req: Request, res: Response) {
    const { token } = validated<{ token: string }>(req, 'body');
    ok(res, { invitation: await describeInvitation(token) });
  },

  async acceptInvitation(req: Request, res: Response) {
    const input = validated<AcceptInvitationInput>(req, 'body');
    const user = await acceptInvitation(input);
    // Sign the user straight in after activation.
    const result = await auth.login({ identifier: user.email ?? user.phone!, password: input.password }, client(req));
    ok(res, result, 201);
  },

  async sessions(req: Request, res: Response) {
    ok(res, { sessions: await auth.listSessions(req.auth!.userId, req.auth!.sessionId) });
  },

  async revokeSession(req: Request, res: Response) {
    const { id } = validated<{ id: string }>(req, 'params');
    await auth.revokeSession(req.auth!.userId, id);
    ok(res, { revoked: true });
  },

  async switchHospital(req: Request, res: Response) {
    const { hospitalId } = validated<{ hospitalId: string }>(req, 'body');
    await auth.switchHospital(req.auth!.sessionId, req.auth!.userId, hospitalId);
    const access = signAccessToken(req.auth!.userId, req.auth!.sessionId);
    ok(res, { accessToken: access.token, accessTokenExpiresAt: access.expiresAt.toISOString() });
  },

  async pushToken(req: Request, res: Response) {
    const { pushToken } = validated<{ pushToken: string | null }>(req, 'body');
    await auth.updatePushToken(req.auth!.sessionId, req.auth!.userId, pushToken);
    ok(res, { updated: true });
  },

  async updateProfile(req: Request, res: Response) {
    const body = validated<{ preferredLanguage?: 'en' | 'ha' | 'pcm' }>(req, 'body');
    await UserModel.updateOne({ _id: req.auth!.userId }, { $set: body });
    const user = await UserModel.findById(req.auth!.userId);
    ok(res, { user: await auth.buildAuthUser(user!, req.principal) });
  },
};

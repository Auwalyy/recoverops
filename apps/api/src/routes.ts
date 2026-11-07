import { Router } from 'express';
import { authRouter } from './modules/auth/auth.routes';
import { hospitalRouter, platformRouter } from './modules/hospitals/hospital.routes';
import { patientRouter } from './modules/patients/patient.routes';
import { episodeRouter } from './modules/recovery-episodes/episode.routes';
import { dischargeRouter } from './modules/discharge/discharge.routes';
import { recoveryPlanRouter, taskRouter } from './modules/recovery-plans/recovery-plan.routes';
import { alertRouter, checkInRouter, checkInTemplateRouter, medicationRouter, symptomRouter } from './modules/monitoring.routes';
import { extendedRouters } from './modules/extended.routes';

/** /api/v1 resource routers. */
export const apiRouter = Router();
apiRouter.use('/auth', authRouter);
apiRouter.use('/hospitals', hospitalRouter);
apiRouter.use('/platform', platformRouter);
apiRouter.use('/patients', patientRouter);
apiRouter.use('/recovery-episodes', episodeRouter);
apiRouter.use('/discharge-plans', dischargeRouter);
apiRouter.use('/recovery-plans', recoveryPlanRouter);
apiRouter.use('/recovery-tasks', taskRouter);
apiRouter.use('/check-ins', checkInRouter);
apiRouter.use('/check-in-templates', checkInTemplateRouter);
apiRouter.use('/symptoms', symptomRouter);
apiRouter.use('/alerts', alertRouter);
apiRouter.use('/', medicationRouter);
for (const [path, router] of extendedRouters) apiRouter.use(path, router);

import { Router } from 'express';
import { getUserSubscription, getUserData, getUserInformation } from '../controllers/user';
import { generateImage, generateImageStream, getQueueStatus, suggestTags } from '../controllers/image';
import { getAuthStatus, verifyAccessKey } from '../controllers/auth';
import { siteAuthMiddleware } from '../middlewares/auth';

const router = Router();

// 公开接口：用于前端探测是否需要站点访问密钥验证及验证操作
router.get('/auth/status', getAuthStatus);
router.post('/auth/verify-access', verifyAccessKey);

// 受保护的代理与生成接口（若开启了 ENABLE_SITE_AUTH，需携带 x-access-key）
router.use(siteAuthMiddleware);

router.get('/user/subscription', getUserSubscription);
router.get('/user/data', getUserData);
router.get('/user/information', getUserInformation);
router.get('/queue-status', getQueueStatus);

import { webdavAction } from '../controllers/webdav';

router.post('/generate-image', generateImage);
router.post('/ai/generate-image', generateImage);
router.post('/generate-image-stream', generateImageStream);
router.post('/ai/generate-image-stream', generateImageStream);
router.get('/ai/generate-image/suggest-tags', suggestTags);
router.get('/generate-image/suggest-tags', suggestTags);

router.post('/webdav/action', webdavAction);

export default router;

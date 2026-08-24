import { Router } from 'express';
import { getUserSubscription, getUserData, getUserInformation } from '../controllers/user';
import { generateImage, generateImageStream, suggestTags } from '../controllers/image';

const router = Router();

router.get('/user/subscription', getUserSubscription);
router.get('/user/data', getUserData);
router.get('/user/information', getUserInformation);

router.post('/generate-image', generateImage);
router.post('/ai/generate-image', generateImage);
router.post('/generate-image-stream', generateImageStream);
router.post('/ai/generate-image-stream', generateImageStream);
router.get('/ai/generate-image/suggest-tags', suggestTags);

export default router;

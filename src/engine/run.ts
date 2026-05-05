import { runPipeline } from './pipeline.ts';

const shopId = process.argv[2] ?? 'shop_demo_beauty';
const result = runPipeline(shopId);
console.log(JSON.stringify(result, null, 2));

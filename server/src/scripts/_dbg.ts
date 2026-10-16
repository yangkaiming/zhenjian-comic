import path from 'node:path';
import '../env';

console.log('cwd =', process.cwd());
console.log('root =', path.resolve(__dirname, '../..'));
console.log('COMIC_DATA_ENV =', JSON.stringify(process.env.COMIC_DATA_ENV));
console.log('MONGODB_URI =', JSON.stringify(process.env.MONGODB_URI));
console.log('MONGODB_URI_PROD =', JSON.stringify(process.env.MONGODB_URI_PROD));